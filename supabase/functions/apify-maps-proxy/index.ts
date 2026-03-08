const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const APIFY_BASE = 'https://api.apify.com/v2';
const ACTOR_ID = 'compass/crawler-google-places';
const FETCH_TIMEOUT_MS = 8_000;

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

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const userId = userData.user.id;

    // ── Credit check (server-side, service role) ──
    const supabaseServiceKey = Deno.env.get('EXT_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseUrl = Deno.env.get('EXT_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')!;
    const sbAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: creditData } = await sbAdmin
      .from('user_credits')
      .select('credits_total, credits_used, blocked')
      .eq('user_id', userId)
      .maybeSingle();

    if (!creditData) {
      return new Response(
        JSON.stringify({ error: 'Registro de créditos não encontrado.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const creditsRemaining = creditData.credits_total - creditData.credits_used;
    if (creditData.blocked || creditsRemaining <= 0) {
      return new Response(
        JSON.stringify({ error: 'Créditos esgotados. Faça upgrade do seu plano para continuar.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
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

    // ── Parse body & validate ──
    const body = await req.json();
    const jobId = (body.jobId || '').trim();
    const query = (body.query || body.businessType || '').trim();
    let location = (body.location || '').replaceAll('/', ', ').trim();
    const limit = Math.min(Math.max(body.limit ?? body.maxResults ?? 20, 1), 100);
    const radiusKm = body.radiusKm ?? body.radius_km ?? 0;

    // Validation
    const missing: string[] = [];
    if (!query) missing.push('query');
    if (!location) missing.push('location');
    if (missing.length > 0) {
      return new Response(
        JSON.stringify({ error: 'validation_error', missing, message: `Campos obrigatórios faltando: ${missing.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Guard: location must not equal query
    if (location.toLowerCase() === query.toLowerCase()) {
      return new Response(
        JSON.stringify({ error: 'validation_error', message: `Localidade inválida: "${location}" é igual ao tipo de negócio. Informe cidade/estado.` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Normalize: append ", Brasil" if no country detected
    if (!/,\s*(brazil|brasil|br)\s*$/i.test(location)) {
      location = `${location}, Brasil`;
    }

    // ── Build actor input ──
    const actorInput: Record<string, unknown> = {
      searchStringsArray: [query],
      locationQuery: location,
      maxCrawledPlacesPerSearch: limit,
      language: 'pt-BR',
    };

    console.log(`[apify-proxy] user=${userId} jobId=${jobId} query="${query}" location="${location}" limit=${limit} radiusKm=${radiusKm} elapsed=${Date.now() - start}ms`);

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
      { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
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
