import { supabase } from '@/integrations/supabase/client';

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rZ3p3dXZkeHhmcHlhb3RkbHNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODczNTgsImV4cCI6MjA4NzQ2MzM1OH0.v7ioBYk7qKqP-fmWF_YogzBdZyfD5JJCTp3mZkJ6jFQ';
const USER_AGENT = 'GeoLeadsAI/1.0 (contact: joao@email.com)';
const PAGE_SIZE = 50;
const RATE_LIMIT_MS = 1100;
const FETCH_TIMEOUT_MS = 15000;
const MAX_RETRIES = 3;
const BACKOFF_MS = [1000, 3000, 7000];

const APIFY_POLL_INTERVAL_MS = 5000;
const APIFY_MAX_POLL_TIME_MS = 300_000; // 5 minutes max

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  headers: Record<string, string> = {},
  body?: string,
): Promise<Response> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: body ? 'POST' : 'GET',
        headers,
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err: any) {
      clearTimeout(timer);
      const isLast = attempt === MAX_RETRIES - 1;
      if (isLast) throw new Error(`Falha após ${MAX_RETRIES} tentativas (${err.name === 'AbortError' ? 'timeout 15s' : err.message}) — URL: ${url.split('?')[0]}`);
      await delay(BACKOFF_MS[attempt]);
    }
  }
  throw new Error('Unreachable');
}

async function updateJob(jobId: string, fields: Record<string, unknown>) {
  const { error } = await supabase.from('jobs').update(fields).eq('id', jobId);
  if (error) console.error('Failed to update job:', error.message);
}

// ─── OSM / Nominatim ────────────────────────────────────────────────

interface NominatimResult {
  display_name: string;
  address?: Record<string, string>;
}

export async function processJob(
  jobId: string,
  businessType: string,
  locationText: string,
  quantity: number,
) {
  try {
    await updateJob(jobId, {
      status: 'running',
      progress_step: 1,
      progress_message: 'Buscando empresas no OSM...',
    });

    const allResults: NominatimResult[] = [];
    let offset = 0;

    while (allResults.length < quantity) {
      const params = new URLSearchParams({
        q: `${businessType} ${locationText}`,
        format: 'json',
        addressdetails: '1',
        limit: String(PAGE_SIZE),
      });

      if (offset > 0) break;

      const response = await fetchWithRetry(`${NOMINATIM_BASE}?${params.toString()}`, {
        'User-Agent': USER_AGENT,
      });

      const data: NominatimResult[] = await response.json();
      if (data.length === 0) break;

      allResults.push(...data);
      offset += PAGE_SIZE;

      if (data.length < PAGE_SIZE) break;
      if (allResults.length < quantity) {
        await delay(RATE_LIMIT_MS);
      }
    }

    const leads = allResults.slice(0, quantity);

    await updateJob(jobId, {
      progress_step: 2,
      progress_message: `Inserindo ${leads.length} leads...`,
    });

    if (leads.length > 0) {
      const rows = leads.map(r => ({
        job_id: jobId,
        name: r.display_name?.split(',')[0] || 'Sem nome',
        address: r.display_name || '',
        source: 'OSM',
      }));

      const { error } = await supabase.from('leads').insert(rows);
      if (error) throw error;
    }

    if (leads.length === 0) {
      await updateJob(jobId, {
        status: 'failed',
        progress_message: 'Nenhum lead encontrado para os critérios informados.',
      });
      return { success: false, error: 'Nenhum lead encontrado' };
    }

    await updateJob(jobId, {
      status: 'done',
      progress_step: 5,
      progress_message: `Concluído — ${leads.length} leads inseridos`,
    });

    return { success: true, count: leads.length };
  } catch (err: any) {
    await updateJob(jobId, {
      status: 'failed',
      progress_message: `Erro (OSM etapa busca): ${err.message}`,
    });
    return { success: false, error: err.message };
  }
}

// ─── Apify (Google Maps) — Async flow ────────────────────────────────

function getAuthHeaders(accessToken: string | undefined) {
  return {
    Authorization: accessToken
      ? `Bearer ${accessToken}`
      : `Bearer ${SUPABASE_ANON_KEY}`,
  };
}

export async function processJobApifyMaps(
  jobId: string,
  businessType: string,
  locationText: string,
  quantity: number,
  userId: string,
) {
  try {
    await updateJob(jobId, {
      status: 'running',
      progress_step: 1,
      progress_message: 'Iniciando busca via Apify (Google Maps)...',
    });

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    const headers = getAuthHeaders(accessToken);

    // Step 1: Start the Apify run (returns immediately)
    const { data: startData, error: startError } = await supabase.functions.invoke('apify-maps-proxy', {
      body: { query: businessType, location: locationText, limit: quantity },
      headers,
    });

    if (startError) throw new Error(startError.message || 'Erro ao iniciar Apify');
    if (startData?.error) throw new Error(startData.error);

    const runId = startData?.runId;
    if (!runId) throw new Error('Apify não retornou runId');

    await updateJob(jobId, {
      apify_run_id: runId,
      progress_message: `Apify run iniciado (${runId.slice(0, 8)}...). Aguardando resultados...`,
    });

    // Step 2: Poll for results
    const pollStart = Date.now();

    while (Date.now() - pollStart < APIFY_MAX_POLL_TIME_MS) {
      await delay(APIFY_POLL_INTERVAL_MS);

      const { data: checkData, error: checkError } = await supabase.functions.invoke('apify-maps-check', {
        body: { runId, jobId, limit: quantity },
        headers,
      });

      if (checkError) throw new Error(checkError.message || 'Erro ao verificar Apify');
      if (checkData?.error) throw new Error(checkData.error);

      const status = checkData?.status;

      if (status === 'processing') {
        const elapsed = Math.round((Date.now() - pollStart) / 1000);
        await updateJob(jobId, {
          progress_message: `Apify processando... (${elapsed}s)`,
        });
        continue;
      }

      if (status === 'done') {
        return { success: true, count: checkData.count || 0 };
      }

      if (status === 'failed') {
        return { success: false, error: checkData.error || 'Apify run falhou' };
      }

      // Unknown status
      throw new Error(`Status inesperado: ${status}`);
    }

    // Timeout
    await updateJob(jobId, {
      status: 'failed',
      progress_message: `Timeout: Apify não completou em ${APIFY_MAX_POLL_TIME_MS / 1000}s`,
    });
    return { success: false, error: 'Timeout aguardando Apify' };
  } catch (err: any) {
    await updateJob(jobId, {
      status: 'failed',
      progress_message: `Erro (Apify): ${err.message}`,
    });
    return { success: false, error: err.message };
  }
}
