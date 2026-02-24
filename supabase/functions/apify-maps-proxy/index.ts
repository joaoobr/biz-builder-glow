const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const APIFY_BASE = 'https://api.apify.com/v2';
const ACTOR_ID = 'compass/crawler-google-places';
const TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const BACKOFF = [2000, 5000];

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

async function fetchWithRetry(url: string, options: RequestInit = {}): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err: any) {
      clearTimeout(timer);
      if (attempt === MAX_RETRIES)
        throw new Error(
          `Failed after ${MAX_RETRIES + 1} attempts: ${err.name === 'AbortError' ? 'timeout 30s' : err.message}`,
        );
      await new Promise((r) => setTimeout(r, BACKOFF[attempt]));
    }
  }
  throw new Error('Unreachable');
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface ApifyItem {
  title?: string;
  address?: string;
  phone?: string;
  website?: string;
  totalScore?: number;
  reviewsCount?: number;
  [key: string]: unknown;
}

interface NormalizedLead {
  name: string;
  address: string;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviews_count: number | null;
  source: string;
}

function normalizeItems(items: ApifyItem[], maxResults: number): NormalizedLead[] {
  const seen = new Set<string>();
  const results: NormalizedLead[] = [];

  for (const item of items) {
    const name = (item.title || '').trim();
    const address = (item.address || '').trim();
    if (!name) continue;

    const key = `${name.toLowerCase()}|${address.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      name,
      address,
      phone: item.phone || null,
      website: item.website || null,
      rating: item.totalScore ?? null,
      reviews_count: item.reviewsCount ?? null,
      source: 'APIFY',
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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
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
    const { query, locationText, maxResults = 20 } = body;

    if (!query || !locationText) {
      return new Response(
        JSON.stringify({ error: 'Missing "query" and "locationText"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Run Actor ──
    console.log(`[apify-start] user=${userId} query="${query}" location="${locationText}" max=${maxResults}`);

    const runRes = await fetchWithRetry(
      `${APIFY_BASE}/acts/${encodeURIComponent(ACTOR_ID)}/runs?waitForFinish=300`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apifyToken}`,
        },
        body: JSON.stringify({
          searchStringsArray: [query],
          locationQuery: locationText,
          maxCrawledPlacesPerSearch: Math.min(maxResults, 100),
          language: 'pt',
        }),
      },
    );

    const runData = await runRes.json();
    const datasetId = runData?.data?.defaultDatasetId;

    if (!datasetId) {
      throw new Error(`Apify run failed: ${JSON.stringify(runData?.data?.status || runData)}`);
    }

    // ── Fetch Dataset ──
    const dsRes = await fetchWithRetry(
      `${APIFY_BASE}/datasets/${datasetId}/items?format=json`,
      {
        headers: { Authorization: `Bearer ${apifyToken}` },
      },
    );

    const items: ApifyItem[] = await dsRes.json();
    const leads = normalizeItems(items, maxResults);

    const duration = Date.now() - start;
    console.log(
      `[apify-done] user=${userId} query="${query}" items=${items.length} leads=${leads.length} duration=${duration}ms`,
    );

    return new Response(JSON.stringify({ leads }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error(`[error] ${err.message}`);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
