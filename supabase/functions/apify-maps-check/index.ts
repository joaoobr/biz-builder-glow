const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const APIFY_BASE = 'https://api.apify.com/v2';
const FETCH_TIMEOUT_MS = 25_000;

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface ApifyItem {
  placeId?: string;
  googleId?: string;
  title?: string;
  address?: string;
  phone?: string;
  website?: string;
  totalScore?: number;
  reviewsCount?: number;
  city?: string;
  state?: string;
  countryCode?: string;
  categoryName?: string;
  url?: string;
  location?: { lat?: number; lng?: number };
  [key: string]: unknown;
}

interface NormalizedLead {
  name: string;
  address: string;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviews_count: number | null;
  city: string | null;
  state: string | null;
  country_code: string | null;
  category_name: string | null;
  google_maps_url: string | null;
  place_id: string | null;
  latitude: number | null;
  longitude: number | null;
  source: string;
  raw: Record<string, unknown>;
}

function normalizeItems(items: ApifyItem[], maxResults: number): NormalizedLead[] {
  const seen = new Set<string>();
  const results: NormalizedLead[] = [];

  for (const item of items) {
    const name = (item.title || '').trim();
    const address = (item.address || '').trim();
    if (!name) continue;

    const key = item.placeId
      ? `pid:${item.placeId}`
      : item.googleId
        ? `gid:${item.googleId}`
        : `na:${name.toLowerCase()}|${address.toLowerCase()}`;

    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      name,
      address,
      phone: item.phone || null,
      website: item.website || null,
      rating: item.totalScore ?? null,
      reviews_count: item.reviewsCount ?? null,
      city: item.city || null,
      state: item.state || null,
      country_code: item.countryCode || null,
      category_name: item.categoryName || null,
      google_maps_url: item.url || null,
      place_id: item.placeId || null,
      latitude: item.location?.lat ?? null,
      longitude: item.location?.lng ?? null,
      source: 'APIFY',
      raw: item as Record<string, unknown>,
    });

    if (results.length >= maxResults) break;
  }

  return results;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const start = Date.now();

  try {
    // ── Auth ──
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('EXT_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('EXT_SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('EXT_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const userId = userData.user.id;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ── Apify Token ──
    const apifyToken = Deno.env.get('APIFY_TOKEN');
    if (!apifyToken) {
      return new Response(
        JSON.stringify({ error: 'APIFY_TOKEN not configured on server' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Parse body ──
    const body = await req.json();
    const runId = (body.runId || '').trim();
    const jobId = (body.jobId || '').trim();
    const maxResults = body.limit ?? 20;

    if (!runId) {
      return new Response(
        JSON.stringify({ error: 'runId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!jobId) {
      return new Response(
        JSON.stringify({ error: 'jobId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[apify-check] user=${userId} runId=${runId} jobId=${jobId}`);

    // ── Check run status ──
    const controller1 = new AbortController();
    const timer1 = setTimeout(() => controller1.abort(), FETCH_TIMEOUT_MS);

    const statusRes = await fetch(`${APIFY_BASE}/actor-runs/${runId}`, {
      headers: { Authorization: `Bearer ${apifyToken}` },
      signal: controller1.signal,
    });
    clearTimeout(timer1);

    if (!statusRes.ok) {
      throw new Error(`Failed to check run status: HTTP ${statusRes.status}`);
    }

    const statusData = await statusRes.json();
    const runStatus = statusData?.data?.status;

    console.log(`[apify-check] runStatus=${runStatus} elapsed=${Date.now() - start}ms`);

    if (runStatus === 'RUNNING' || runStatus === 'READY') {
      return new Response(
        JSON.stringify({ status: 'processing', runStatus }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (runStatus !== 'SUCCEEDED') {
      await supabase.from('jobs').update({
        status: 'failed',
        progress_message: `Apify run ${runStatus}: ${statusData?.data?.statusMessage || 'Unknown error'}`,
      }).eq('id', jobId).eq('user_id', userId);

      return new Response(
        JSON.stringify({ status: 'failed', runStatus, error: statusData?.data?.statusMessage || runStatus }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── SUCCEEDED — fetch dataset ──
    const datasetId = statusData?.data?.defaultDatasetId;
    if (!datasetId) {
      throw new Error('Run succeeded but no datasetId found');
    }

    console.log(`[apify-check] fetching dataset=${datasetId}`);

    const controller2 = new AbortController();
    const timer2 = setTimeout(() => controller2.abort(), FETCH_TIMEOUT_MS);

    const dsRes = await fetch(
      `${APIFY_BASE}/datasets/${datasetId}/items?format=json`,
      {
        headers: { Authorization: `Bearer ${apifyToken}` },
        signal: controller2.signal,
      },
    );
    clearTimeout(timer2);

    if (!dsRes.ok) {
      throw new Error(`Failed to fetch dataset: HTTP ${dsRes.status}`);
    }

    const items: ApifyItem[] = await dsRes.json();
    const leads = normalizeItems(items, maxResults);

    console.log(`[apify-check] raw=${items.length} deduped=${leads.length} elapsed=${Date.now() - start}ms`);

    // ── Insert leads (upsert to avoid duplicates) ──
    if (leads.length > 0) {
      const rows = leads.map(l => ({
        job_id: jobId,
        name: l.name,
        address: l.address,
        phone: l.phone,
        website: l.website,
        rating: l.rating,
        reviews_count: l.reviews_count,
        source: 'APIFY',
      }));

      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100);
        const { error: insertErr } = await supabase.from('leads').insert(batch);
        if (insertErr) throw new Error(`Insert failed: ${insertErr.message}`);
      }
    }

    // ── Update job ──
    const now = new Date().toISOString();
    await supabase.from('jobs').update({
      status: 'done',
      progress_step: 5,
      progress_message: leads.length > 0
        ? `Concluído — ${leads.length} leads via Apify (dedup de ${items.length} resultados)`
        : 'Concluído. 0 leads encontrados para os critérios.',
      finished_at: now,
    }).eq('id', jobId).eq('user_id', userId);

    console.log(`[apify-check] done leads=${leads.length} elapsed=${Date.now() - start}ms`);

    return new Response(
      JSON.stringify({ status: 'done', count: leads.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    const msg = err.name === 'AbortError' ? 'Timeout checking Apify run' : err.message;
    console.error(`[apify-check][error] ${msg}`);

    try {
      const body = await req.clone().json().catch(() => ({}));
      const jobId = (body as any)?.jobId;
      if (jobId) {
        const supabaseUrl = Deno.env.get('EXT_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('EXT_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const sb = createClient(supabaseUrl, supabaseServiceKey);
        await sb.from('jobs').update({
          status: 'failed',
          progress_message: `Erro (Apify check): ${msg}`,
        }).eq('id', jobId);
      }
    } catch (_) { /* best effort */ }

    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
