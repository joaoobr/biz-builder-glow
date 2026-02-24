const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const APIFY_BASE = 'https://api.apify.com/v2';
const ACTOR_ID = 'compass/crawler-google-places';
const FETCH_TIMEOUT_MS = 25_000; // <30s to stay within edge function limits

// Rate limiter per isolate
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(userId) || []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  );
  if (timestamps.length >= RATE_LIMIT_MAX) {
    rateLimitMap.set(userId, timestamps);
    return false;
  }
  timestamps.push(now);
  rateLimitMap.set(userId, timestamps);
  return true;
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const start = Date.now();

  try {
    console.log(`[apify-start] begin`);

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
    console.log(`[apify-start] authenticated user=${userId} elapsed=${Date.now() - start}ms`);

    // ── Rate limit ──
    if (!checkRateLimit(userId)) {
      console.log(`[rate-limit] user=${userId}`);
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded (30 req/min)' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

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
    console.log(`[apify-start] raw-body keys=${Object.keys(body).join(',')} query="${body.query}" location="${body.location}" limit=${body.limit}`);

    const query = (body.query || '').trim();
    let location = (body.location || '').replaceAll('/', ', ').trim();

    // Normalize: append ", Brasil" if no country detected
    if (location && !/,\s*(brazil|brasil|br)\s*$/i.test(location)) {
      location = `${location}, Brasil`;
    }

    const maxResults = Math.min(body.limit ?? 20, 100);

    console.log(`[apify-start] after-normalize query="${query}" location="${location}" max=${maxResults} elapsed=${Date.now() - start}ms`);

    if (!query) {
      return new Response(
        JSON.stringify({ error: 'query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!location) {
      return new Response(
        JSON.stringify({ error: 'location is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Start Actor Run (async — waitForFinish=0) ──
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const searchString = `${query} ${location}`.trim();
    const actorInput = {
      searchStringsArray: [searchString],
      locationQuery: location,
      maxCrawledPlacesPerSearch: maxResults,
      language: 'pt',
    };

    console.log(`[apify-start] actorInput=${JSON.stringify(actorInput)}`);

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
    const datasetId = runData?.data?.defaultDatasetId;

    if (!runId) {
      throw new Error(`Apify run missing id: ${JSON.stringify(runData?.data?.status || runData)}`);
    }

    const duration = Date.now() - start;
    console.log(`[apify-start] apify-run-started runId=${runId} datasetId=${datasetId} elapsed=${duration}ms`);

    return new Response(
      JSON.stringify({ runId, datasetId, status: 'processing' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    const msg = err.name === 'AbortError' ? `Timeout (${FETCH_TIMEOUT_MS / 1000}s) starting Apify run` : err.message;
    console.error(`[apify-start][error] ${msg}`);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
