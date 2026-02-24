const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const APIFY_BASE = 'https://api.apify.com/v2';
const ACTOR_ID = 'compass/crawler-google-places';
const FETCH_TIMEOUT_MS = 8_000; // 8s hard limit

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

    const supabase = createClient(
      Deno.env.get('EXT_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('EXT_SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const userId = claimsData.claims.sub as string;

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
    const jobId = (body.jobId || '').trim();
    const businessType = (body.businessType || body.query || '').trim();
    let location = (body.location || '').replaceAll('/', ', ').trim();
    const maxResults = Math.min(body.maxResults ?? body.limit ?? 20, 100);

    if (!businessType) {
      return new Response(
        JSON.stringify({ error: 'businessType é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!location) {
      return new Response(
        JSON.stringify({ error: 'location é obrigatória' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Guard: location must not equal businessType
    if (location.toLowerCase() === businessType.toLowerCase()) {
      return new Response(
        JSON.stringify({ error: `Localidade inválida: "${location}" é igual ao tipo de negócio. Informe cidade/estado.` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Normalize: append ", Brasil" if no country detected
    if (!/,\s*(brazil|brasil|br)\s*$/i.test(location)) {
      location = `${location}, Brasil`;
    }

    // ── Build actor input ──
    // searchStringsArray = [businessType] (what to search)
    // locationQuery = location (where to search) — NEVER businessType
    const actorInput = {
      searchStringsArray: [businessType],
      locationQuery: location,
      maxCrawledPlacesPerSearch: maxResults,
      language: 'pt',
    };

    console.log(`[apify-proxy] user=${userId} jobId=${jobId} input=${JSON.stringify(actorInput)} elapsed=${Date.now() - start}ms`);

    // ── Start Actor Run (waitForFinish=0) ──
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const runRes = await fetch(
      `${APIFY_BASE}/acts/${encodeURIComponent(ACTOR_ID)}/runs?waitForFinish=0`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apifyToken}`,
        },
        body: JSON.stringify(actorInput),
        signal: controller.signal,
      },
    );

    clearTimeout(timer);

    if (!runRes.ok) {
      const text = await runRes.text();
      throw new Error(`Apify start failed: HTTP ${runRes.status} — ${text.slice(0, 200)}`);
    }

    const runData = await runRes.json();
    const runId = runData?.data?.id;

    if (!runId) {
      throw new Error(`Apify run missing id: ${JSON.stringify(runData?.data?.status || runData)}`);
    }

    console.log(`[apify-proxy] run started runId=${runId} elapsed=${Date.now() - start}ms`);

    return new Response(
      JSON.stringify({ runId, status: 'processing' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    const msg = err.name === 'AbortError' ? 'Timeout (8s) ao iniciar run no Apify' : err.message;
    console.error(`[apify-proxy][error] ${msg}`);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
