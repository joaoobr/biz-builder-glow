const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const AI_GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

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
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadEnricher/1.0)' },
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

  try {
    const res = await fetch(AI_GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 200,
      }),
    });

    if (!res.ok) {
      console.error(`[decision-maker] AI error: ${res.status} ${await res.text()}`);
      return null;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    // Extract JSON from response
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
    console.error(`[decision-maker] AI parse error: ${err}`);
    return null;
  }
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
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const userId = claimsData.claims.sub as string;
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

    await supabase.from('jobs').update({
      status: 'running',
      progress_step: 3,
      progress_message: `Etapa 3: Pesquisando decisores de ${leads?.length ?? 0} empresas...`,
    }).eq('id', jobId);

    let updatedCount = 0;

    if (leads && leads.length > 0) {
      for (let i = 0; i < leads.length; i++) {
        const lead = leads[i];
        const rawUrl = (lead.website_url || '').trim();
        if (!rawUrl) continue;

        const baseUrl = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;

        // Try multiple pages
        let bestResult: { name: string; role: string; confidence: number; sourceUrl: string } | null = null;

        for (const path of ['', ...PAGES_TO_TRY]) {
          const page = await fetchPageText(baseUrl, path);
          if (!page) continue;

          const result = await extractDecisionMaker(page.text, lead.name, job.business_type || '', lovableApiKey);
          if (result && result.confidence > (bestResult?.confidence ?? 0)) {
            bestResult = { ...result, sourceUrl: page.url };
          }
          // Stop if we found a high-confidence match
          if (bestResult && bestResult.confidence >= 80) break;
        }

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
      progress_message: `Etapa 3 concluída — ${updatedCount} decisores encontrados em ${elapsed}s`,
    }).eq('id', jobId);

    console.log(`[decision-maker] done updated=${updatedCount} elapsed=${Date.now() - start}ms`);

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
