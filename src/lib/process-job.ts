import { supabase } from '@/integrations/supabase/client';

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const GOOGLE_PLACES_TEXT_SEARCH = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const GOOGLE_PLACES_DETAILS = 'https://maps.googleapis.com/maps/api/place/details/json';
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

async function fetchWithRetry(url: string, headers: Record<string, string> = {}): Promise<Response> {
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

// ─── Google Places ──────────────────────────────────────────────────

interface GoogleTextSearchResult {
  place_id: string;
  name: string;
  formatted_address: string;
}

interface GoogleTextSearchResponse {
  results: GoogleTextSearchResult[];
  next_page_token?: string;
  status: string;
  error_message?: string;
}

interface GooglePlaceDetailsResponse {
  result: {
    name?: string;
    formatted_address?: string;
    international_phone_number?: string;
    website?: string;
    rating?: number;
    user_ratings_total?: number;
  };
  status: string;
  error_message?: string;
}

export async function processJobGooglePlaces(
  jobId: string,
  businessType: string,
  locationText: string,
  quantity: number,
  apiKey: string,
) {
  try {
    // Step 1 – Text Search
    await updateJob(jobId, {
      status: 'running',
      progress_step: 1,
      progress_message: 'Buscando empresas no Google Places...',
    });

    const allPlaces: GoogleTextSearchResult[] = [];
    let nextPageToken: string | undefined;

    while (allPlaces.length < quantity) {
      const params = new URLSearchParams({
        query: `${businessType} in ${locationText}`,
        key: apiKey,
      });
      if (nextPageToken) {
        params.set('pagetoken', nextPageToken);
      }

      const url = `${GOOGLE_PLACES_TEXT_SEARCH}?${params.toString()}`;
      const res = await fetchWithRetry(url);
      const data: GoogleTextSearchResponse = await res.json();

      if (data.status === 'REQUEST_DENIED' || data.status === 'INVALID_REQUEST') {
        throw new Error(`Google API: ${data.status} — ${data.error_message || 'Verifique sua API Key'}`);
      }

      if (data.status === 'ZERO_RESULTS' || !data.results?.length) break;

      allPlaces.push(...data.results);
      nextPageToken = data.next_page_token;

      if (!nextPageToken) break;

      // Google requires ~2s delay before using next_page_token
      await delay(2000);
    }

    const places = allPlaces.slice(0, quantity);

    if (places.length === 0) {
      await updateJob(jobId, {
        status: 'failed',
        progress_message: 'Google Places: nenhum resultado encontrado.',
      });
      return { success: false, error: 'Nenhum resultado encontrado' };
    }

    // Step 2 – Place Details for each result
    await updateJob(jobId, {
      progress_step: 2,
      progress_message: `Enriquecendo ${places.length} lugares via Place Details...`,
    });

    const leadRows: Record<string, unknown>[] = [];

    for (let i = 0; i < places.length; i++) {
      const place = places[i];

      if (i > 0) await delay(GOOGLE_RATE_LIMIT_MS);

      // Update progress every 10 items
      if (i % 10 === 0 && i > 0) {
        await updateJob(jobId, {
          progress_message: `Detalhes: ${i}/${places.length} processados...`,
        });
      }

      try {
        const detailParams = new URLSearchParams({
          place_id: place.place_id,
          fields: 'name,formatted_address,international_phone_number,website,rating,user_ratings_total',
          key: apiKey,
        });

        const detailRes = await fetchWithRetry(`${GOOGLE_PLACES_DETAILS}?${detailParams.toString()}`);
        const detail: GooglePlaceDetailsResponse = await detailRes.json();

        if (detail.status === 'OK' && detail.result) {
          const r = detail.result;
          leadRows.push({
            job_id: jobId,
            name: r.name || place.name,
            address: r.formatted_address || place.formatted_address || '',
            phone: r.international_phone_number || null,
            website: r.website || null,
            rating: r.rating || null,
            reviews_count: r.user_ratings_total || null,
            source: 'GOOGLE',
          });
        } else {
          // Fallback: insert basic info from text search
          leadRows.push({
            job_id: jobId,
            name: place.name,
            address: place.formatted_address || '',
            source: 'GOOGLE',
          });
        }
      } catch {
        // If details fail, still insert basic info
        leadRows.push({
          job_id: jobId,
          name: place.name,
          address: place.formatted_address || '',
          source: 'GOOGLE',
        });
      }
    }

    // Step 3 – Insert leads
    await updateJob(jobId, {
      progress_step: 3,
      progress_message: `Inserindo ${leadRows.length} leads...`,
    });

    if (leadRows.length > 0) {
      // Insert in batches of 100
      for (let i = 0; i < leadRows.length; i += 100) {
        const batch = leadRows.slice(i, i + 100);
        const { error } = await supabase.from('leads').insert(batch);
        if (error) throw error;
      }
    }

    if (leadRows.length === 0) {
      await updateJob(jobId, {
        status: 'failed',
        progress_message: 'Nenhum lead inserido após processamento Google Places.',
      });
      return { success: false, error: 'Nenhum lead inserido' };
    }

    await updateJob(jobId, {
      status: 'done',
      progress_step: 5,
      progress_message: `Concluído — ${leadRows.length} leads do Google Places`,
    });

    return { success: true, count: leadRows.length };
  } catch (err: any) {
    await updateJob(jobId, {
      status: 'failed',
      progress_message: `Erro (Google Places): ${err.message}`,
    });
    return { success: false, error: err.message };
  }
}
