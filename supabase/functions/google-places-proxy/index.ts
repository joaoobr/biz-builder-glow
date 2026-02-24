const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_TEXT_SEARCH =
  'https://maps.googleapis.com/maps/api/place/textsearch/json';
const GOOGLE_DETAILS =
  'https://maps.googleapis.com/maps/api/place/details/json';

const TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;
const BACKOFF = [1000, 3000];

// Simple in-memory rate limiter (per isolate lifetime)
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;

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

async function fetchWithRetry(url: string): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok)
        throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err: any) {
      clearTimeout(timer);
      if (attempt === MAX_RETRIES)
        throw new Error(
          `Failed after ${MAX_RETRIES + 1} attempts: ${err.name === 'AbortError' ? 'timeout 15s' : err.message}`,
        );
      await new Promise((r) => setTimeout(r, BACKOFF[attempt]));
    }
  }
  throw new Error('Unreachable');
}

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
        JSON.stringify({ error: 'Rate limit exceeded (60 req/min)' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── API Key ──
    const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Google Places API key not configured on server' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Parse body ──
    const body = await req.json();
    const { action, query, place_id, pagetoken } = body;

    let result: any;

    if (action === 'textsearch') {
      if (!query) {
        return new Response(
          JSON.stringify({ error: 'Missing "query" for textsearch' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      const params = new URLSearchParams({ query, key: apiKey });
      if (pagetoken) params.set('pagetoken', pagetoken);

      const res = await fetchWithRetry(`${GOOGLE_TEXT_SEARCH}?${params}`);
      result = await res.json();

      console.log(
        `[textsearch] user=${userId} query="${query}" results=${result.results?.length ?? 0} duration=${Date.now() - start}ms`,
      );
    } else if (action === 'details') {
      if (!place_id) {
        return new Response(
          JSON.stringify({ error: 'Missing "place_id" for details' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      const params = new URLSearchParams({
        place_id,
        fields:
          'name,formatted_address,international_phone_number,website,rating,user_ratings_total',
        key: apiKey,
      });

      const res = await fetchWithRetry(`${GOOGLE_DETAILS}?${params}`);
      result = await res.json();

      console.log(
        `[details] user=${userId} place_id=${place_id} status=${result.status} duration=${Date.now() - start}ms`,
      );
    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid action. Use "textsearch" or "details"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(JSON.stringify(result), {
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
