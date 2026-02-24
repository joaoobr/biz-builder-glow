import { supabase } from '@/integrations/supabase/client';

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const SUPABASE_URL = 'https://nkgzwuvdxxfpyaotdlsf.supabase.co';
const USER_AGENT = 'LeadBuilderLocal/1.0 (contact: joao@email.com)';
const PAGE_SIZE = 50;
const RATE_LIMIT_MS = 1100;
const GOOGLE_RATE_LIMIT_MS = 200; // Google allows higher rate
const FETCH_TIMEOUT_MS = 15000;
const MAX_RETRIES = 3;
const BACKOFF_MS = [1000, 3000, 7000];

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

// ─── Apify (Google Maps) ─────────────────────────────────────────────

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
      progress_message: 'Buscando empresas via Apify (Google Maps)...',
    });

    const query = `${businessType} ${locationText}`;

    const { data, error } = await supabase.functions.invoke('apify-maps-proxy', {
      body: { query, locationText, maxResults: quantity },
    });

    if (error) throw new Error(error.message || 'Erro ao chamar proxy Apify');
    if (data?.error) throw new Error(data.error);

    const items: any[] = data?.leads || [];

    await updateJob(jobId, {
      progress_step: 2,
      progress_message: `Inserindo ${items.length} leads...`,
    });

    if (items.length === 0) {
      await updateJob(jobId, {
        status: 'failed',
        progress_message: 'Apify: nenhum resultado encontrado.',
      });
      return { success: false, error: 'Nenhum resultado encontrado' };
    }

    const rows = items.map(l => ({
      job_id: jobId,
      user_id: userId,
      name: l.name || l.title || 'Sem nome',
      address: l.address || '',
      city: l.city || null,
      state: l.state || null,
      country_code: l.countryCode || null,
      phone: l.phone || null,
      website: l.website || null,
      rating: l.rating || null,
      reviews_count: l.reviews_count || l.reviewsCount || null,
      category_name: l.categoryName || null,
      source: 'APIFY',
      status: 'found',
    }));

    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      const { error: insertErr } = await supabase.from('leads').insert(batch);
      if (insertErr) throw insertErr;
    }

    await updateJob(jobId, {
      status: 'done',
      progress_step: 5,
      progress_message: `Concluído — ${rows.length} leads via Apify`,
    });

    return { success: true, count: rows.length };
  } catch (err: any) {
    await updateJob(jobId, {
      status: 'failed',
      progress_message: `Erro (Apify): ${err.message}`,
    });
    return { success: false, error: err.message };
  }
}
