const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Models to try in order — if one is quota-exhausted, fall back to next
const GEMINI_MODELS = [
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
];

function geminiUrl(model: string) {
  const ver = model.startsWith('gemini-1.5') ? 'v1' : 'v1beta';
  return `https://generativelanguage.googleapis.com/${ver}/models/${model}:generateContent`;
}

const PAGES_TO_TRY = [
  '/sobre', '/equipe', '/quem-somos', '/contato', '/about', '/team', '/about-us',
  '/nossa-equipe', '/empresa', '/institucional', '/a-empresa', '/quem-somos',
  '/diretoria', '/governanca', '/leadership', '/management', '/nosso-time',
  '/historia', '/about/team', '/about/leadership',
];

async function fetchPageText(baseUrl: string, path: string): Promise<{ text: string; url: string } | null> {
  const fullUrl = baseUrl.replace(/\/+$/, '') + path;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(fullUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return null;
    const html = await res.text();
    // Strip tags, keep text
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 6000); // limit tokens
    if (text.length < 50) return null;
    return { text, url: fullUrl };
  } catch {
    return null;
  }
}

async function extractDecisionMaker(
  pageText: string,
  businessName: string,
  businessType: string,
  apiKey: string,
): Promise<{ name: string; role: string; confidence: number } | null> {
  const prompt = `Analise o texto abaixo de uma página do site da empresa \"${businessName}\" (segmento: ${businessType}).

Extraia o nome e cargo do principal decisor da empresa (dono, CEO, diretor, sócio-fundador, gerente geral, etc).

Responda SOMENTE em JSON válido:
{\"name\": \"Nome Completo\", \"role\": \"Cargo\", \"confidence\": 85}

Se não encontrar nenhum decisor claro, responda:
{\"name\": null, \"role\": null, \"confidence\": 0}

Regras de confidence:
- 90-100: Nome e cargo explicitamente mencionados como dono/CEO/diretor
- 70-89: Nome mencionado com cargo de liderança
- 50-69: Nome encontrado mas cargo inferido
- 0-49: Informação vaga ou ausente

Texto da página:
${pageText}`;

  // Try each model, with retry on 429
  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const url = `${geminiUrl(model)}?key=${apiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 200 },
          }),
        });

        if (res.status === 429) {
          const errBody = await res.text();
          console.warn(`[decision-maker] 429 on ${model} attempt ${attempt + 1}: ${errBody.slice(0, 200)}`);
          // Check if quota is permanently 0 (limit: 0) → skip to next model
          if (errBody.includes('limit: 0')) {
            console.warn(`[decision-maker] ${model} quota is 0, trying next model`);
            break; // break retry loop, try next model
          }
          // Temporary rate limit — wait and retry
          const wait = Math.pow(2, attempt + 1) * 1000;
          console.log(`[decision-maker] waiting ${wait}ms before retry`);
          await new Promise(r => setTimeout(r, wait));
          continue;
        }

        if (res.status === 404) {
          console.warn(`[decision-maker] ${model} not found (404), trying next model`);
          break;
        }

        if (!res.ok) {
          const errBody = await res.text();
          console.error(`[decision-maker] Gemini API error (${model}): ${res.status} ${errBody.slice(0, 300)}`);
          return null;
        }

        const data = await res.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        console.log(`[decision-maker] ${model} response: ${content}`);

        const jsonMatch = content.match(/\{[\s\S]*?\}/);
        if (!jsonMatch) return null;

        const parsed = JSON.parse(jsonMatch[0]);
        if (!parsed.name) return null;

        return {
          name: parsed.name,
          role: parsed.role || 'Decisor',
          confidence: Math.min(100, Math.max(0, parsed.confidence ?? 50)),
        };
      } catch (err) {
        console.error(`[decision-maker] AI error (${model}, attempt ${attempt + 1}): ${err}`);
        if (attempt === 2) break;
      }
    }
  }

  console.error(`[decision-maker] All models exhausted for "${businessName}"`);
  return null;
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
    const googleApiKey = Deno.env.get('GOOGLE_API_KEY') || '';

    if (!googleApiKey) {
      console.error('[decision-maker] GOOGLE_API_KEY is not set!');
      return new Response(
        JSON.stringify({ error: 'GOOGLE_API_KEY not configured. Set it in Supabase secrets.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    console.log(`[decision-maker] GOOGLE_API_KEY present, length=${googleApiKey.length}`);

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await supabaseAuth.auth.getUser();
    console.log(`[decision-maker] auth: user=${userData?.user?.id ?? 'null'}, error=${userError?.message ?? 'none'}`);
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', detail: userError?.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const userId = userData.user.id;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ── Parse body ──
    const body = await req.json();
    const jobId = (body.jobId || '').trim();
    const limit = body.limit ?? 50;

    if (!jobId) {
      return new Response(
        JSON.stringify({ error: 'jobId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Verify job belongs to user
    const { data: job, error: jobErr } = await supabase
      .from('jobs')
      .select('id, user_id, business_type')
      .eq('id', jobId)
      .eq('user_id', userId)
      .single();

    if (jobErr || !job) {
      return new Response(
        JSON.stringify({ error: 'Job not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Fetch leads with website_url but no decision_maker ──
    const { data: leads, error: leadsErr } = await supabase
      .from('leads')
      .select('id, name, website_url')
      .eq('job_id', jobId)
      .not('website_url', 'is', null)
      .is('decision_maker_name', null)
      .limit(limit);

    if (leadsErr) throw new Error(`Failed to fetch leads: ${leadsErr.message}`);

    console.log(`[decision-maker] jobId=${jobId} leadsToEnrich=${leads?.length ?? 0}`);
    console.log(`[decision-maker] GOOGLE_API_KEY present: ${!!googleApiKey}, length: ${googleApiKey?.length ?? 0}`);

    await supabase.from('jobs').update({
      status: 'running',
      progress_step: 3,
      progress_message: `Etapa 3: Pesquisando decisores de ${leads?.length ?? 0} empresas...`,
    }).eq('id', jobId);

    let updatedCount = 0;
    let pagesFound = 0;
    let pagesTriedTotal = 0;

    if (leads && leads.length > 0) {
      for (let i = 0; i < leads.length; i++) {
        const lead = leads[i];
        const rawUrl = (lead.website_url || '').trim();
        if (!rawUrl) {
          console.log(`[decision-maker] lead ${lead.id} (${lead.name}): no website_url, skipping`);
          continue;
        }

        const baseUrl = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;

        // Skip social media URLs — can't extract decision makers from them
        const SOCIAL_DOMAINS = ['instagram.com', 'facebook.com', 'twitter.com', 'x.com', 'linkedin.com', 'tiktok.com', 'youtube.com'];
        try {
          const hostname = new URL(baseUrl).hostname.replace(/^www\./, '');
          if (SOCIAL_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d))) {
            console.log(`[decision-maker] lead ${lead.id} (${lead.name}): social media URL (${hostname}), skipping`);
            continue;
          }
        } catch { /* continue with URL as-is */ }

        console.log(`[decision-maker] lead ${lead.id} (${lead.name}): trying baseUrl=${baseUrl}`);

        // Try multiple pages
        let bestResult: { name: string; role: string; confidence: number; sourceUrl: string } | null = null;
        let pagesTriedForLead = 0;

        for (const path of ['', ...PAGES_TO_TRY]) {
          pagesTriedTotal++;
          pagesTriedForLead++;
          const page = await fetchPageText(baseUrl, path);
          if (!page) {
            if (path === '') console.log(`[decision-maker]   homepage fetch failed for ${baseUrl}`);
            continue;
          }

          pagesFound++;
          console.log(`[decision-maker]   page found: ${page.url} (${page.text.length} chars)`);

          const result = await extractDecisionMaker(page.text, lead.name, job.business_type || '', googleApiKey);
          console.log(`[decision-maker]   AI result for ${page.url}: ${JSON.stringify(result)}`);
          
          if (result && result.confidence > (bestResult?.confidence ?? 0)) {
            bestResult = { ...result, sourceUrl: page.url };
          }
          // Stop if we found a high-confidence match
          if (bestResult && bestResult.confidence >= 80) break;
        }

        console.log(`[decision-maker] lead ${lead.id}: tried ${pagesTriedForLead} paths, bestResult=${JSON.stringify(bestResult)}`);

        if (bestResult && bestResult.confidence > 0) {
          const { error: updateErr } = await supabase
            .from('leads')
            .update({
              decision_maker_name: bestResult.name,
              decision_maker_role: bestResult.role,
              decision_maker_source_url: bestResult.sourceUrl,
              decision_maker_confidence: bestResult.confidence,
            })
            .eq('id', lead.id);

          if (updateErr) {
            console.error(`[decision-maker] update failed for ${lead.id}: ${updateErr.message}`);
            continue;
          }
          updatedCount++;
        }

        // Update progress
        const elapsed = Math.round((Date.now() - start) / 1000);
        await supabase.from('jobs').update({
          progress_message: `Etapa 3: ${i + 1}/${leads.length} analisados, ${updatedCount} decisores encontrados (${elapsed}s)`,
        }).eq('id', jobId);
      }
    }

    // ── Final update ──
    const elapsed = Math.round((Date.now() - start) / 1000);
    await supabase.from('jobs').update({
      progress_step: 3,
      progress_message: `Etapa 3 concluída — ${updatedCount} decisores encontrados em ${elapsed}s (${pagesFound} páginas lidas, ${pagesTriedTotal} tentativas)`,
    }).eq('id', jobId);

    console.log(`[decision-maker] DONE updated=${updatedCount} pagesFound=${pagesFound} pagesTried=${pagesTriedTotal} elapsed=${Date.now() - start}ms`);

    return new Response(
      JSON.stringify({ status: 'done', updatedCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    console.error(`[decision-maker][error] ${err.message}`);

    try {
      const body = await req.clone().json().catch(() => ({}));
      const jobId = (body as any)?.jobId;
      if (jobId) {
        const supabaseUrl = Deno.env.get('EXT_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('EXT_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const sb = createClient(supabaseUrl, supabaseServiceKey);
        await sb.from('jobs').update({
          progress_message: `Erro (Etapa 3): ${err.message}`,
        }).eq('id', jobId);
      }
    } catch (_) { /* best effort */ }

    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
