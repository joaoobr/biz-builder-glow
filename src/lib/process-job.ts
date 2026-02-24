import { supabase } from '@/integrations/supabase/client';

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'LeadBuilderLocal/1.0 (contact: joao@email.com)';
const PAGE_SIZE = 50;
const RATE_LIMIT_MS = 1100;
const FETCH_TIMEOUT_MS = 15000;
const MAX_RETRIES = 3;
const BACKOFF_MS = [1000, 3000, 7000];

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, headers: Record<string, string>): Promise<Response> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err: any) {
      clearTimeout(timer);
      const isLast = attempt === MAX_RETRIES - 1;
      if (isLast) throw new Error(`Falha após ${MAX_RETRIES} tentativas (${err.name === 'AbortError' ? 'timeout 15s' : err.message}) — URL: ${url}`);
      await delay(BACKOFF_MS[attempt]);
    }
  }
  throw new Error('Unreachable');
}

async function updateJob(jobId: string, fields: Record<string, unknown>) {
  const { error } = await supabase.from('jobs').update(fields).eq('id', jobId);
  if (error) console.error('Failed to update job:', error.message);
}

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
    // Step 1 – mark running
    await updateJob(jobId, {
      status: 'running',
      progress_step: 1,
      progress_message: 'Buscando empresas no OSM...',
    });

    const allResults: NominatimResult[] = [];
    let offset = 0;

    // Paginate until we have enough results or Nominatim returns nothing
    while (allResults.length < quantity) {
      const params = new URLSearchParams({
        q: `${businessType} ${locationText}`,
        format: 'json',
        addressdetails: '1',
        limit: String(PAGE_SIZE),
      });

      // Nominatim doesn't officially support offset, but we can use 'exclude_place_ids'
      // to avoid duplicates. A simpler approach: use the 'bounded' + 'viewbox' or just
      // stop if we get fewer results than PAGE_SIZE.
      // For now, we stop if a page returns < PAGE_SIZE results.
      if (offset > 0) {
        // Nominatim doesn't have a real offset param, so if first page < PAGE_SIZE we stop
        break;
      }

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

    // Trim to requested quantity
    const leads = allResults.slice(0, quantity);

    // Step 2 – insert leads
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

    // Step 5 – done (only if we actually have leads)
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
      progress_message: `Erro: ${err.message}`,
    });
    return { success: false, error: err.message };
  }
}
