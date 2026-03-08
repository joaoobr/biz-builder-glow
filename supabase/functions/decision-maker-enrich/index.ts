const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';

async function searchDecisionMaker(
  businessName: string,
  businessType: string,
  websiteUrl: string,
  apiKey: string,
): Promise<{ name: string; role: string; confidence: number; linkedin_url?: string } | null> {
  const query = `Quem é o principal decisor (dono, CEO, diretor, sócio-fundador, presidente) da empresa "${businessName}"? O site da empresa é ${websiteUrl}. Segmento: ${businessType}. Busque também no LinkedIn se possível.`;

  try {
    const res = await fetch(PERPLEXITY_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: `Você é um assistente que encontra decisores de empresas brasileiras. Responda SOMENTE com JSON válido no formato:
{"name": "Nome Completo", "role": "Cargo", "confidence": 85, "linkedin_url": "https://linkedin.com/in/..."}

Se não encontrar, responda: {"name": null, "role": null, "confidence": 0}

Regras de confidence:
- 90-100: Nome e cargo confirmados em múltiplas fontes (site + LinkedIn)
- 70-89: Nome encontrado com cargo de liderança em uma fonte
- 50-69: Nome encontrado mas cargo inferido
- 0-49: Informação vaga ou ausente

linkedin_url é opcional - inclua somente se encontrar o perfil real.`,
          },
          { role: 'user', content: query },
        ],
        max_tokens: 300,
        temperature: 0.1,
      }),
    });

    if (res.status === 429) {
      console.warn(`[decision-maker] Perplexity rate limited, waiting 5s...`);
      await new Promise(r => setTimeout(r, 5000));
      // One retry
      const retry = await fetch(PERPLEXITY_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'sonar',
          messages: [
            {
              role: 'system',
              content: `Responda SOMENTE com JSON: {"name": "Nome", "role": "Cargo", "confidence": 85, "linkedin_url": "url_ou_null"}. Se não encontrar: {"name": null, "role": null, "confidence": 0}`,
            },
            { role: 'user', content: query },
          ],
          max_tokens: 300,
          temperature: 0.1,
        }),
      });
      if (!retry.ok) {
        console.error(`[decision-maker] Perplexity retry failed: ${retry.status}`);
        return null;
      }
      const retryData = await retry.json();
      const retryContent = retryData.choices?.[0]?.message?.content || '';
      return parseAIResponse(retryContent, businessName);
    }

    if (!res.ok) {
      const errBody = await res.text();
      console.error(`[decision-maker] Perplexity API error: ${res.status} ${errBody.slice(0, 300)}`);
      return null;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    const citations = data.citations || [];
    console.log(`[decision-maker] Perplexity response for "${businessName}": ${content.slice(0, 500)}`);
    if (citations.length > 0) {
      console.log(`[decision-maker] Citations: ${citations.slice(0, 5).join(', ')}`);
    }

    return parseAIResponse(content, businessName);
  } catch (err) {
    console.error(`[decision-maker] Perplexity error for "${businessName}": ${err}`);
    return null;
  }
}

function parseAIResponse(
  content: string,
  businessName: string,
): { name: string; role: string; confidence: number; linkedin_url?: string } | null {
  try {
    // Extract JSON from response (may have surrounding text)
    const jsonMatch = content.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      console.warn(`[decision-maker] No JSON found in response for "${businessName}"`);
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.name) return null;

    return {
      name: parsed.name,
      role: parsed.role || 'Decisor',
      confidence: Math.min(100, Math.max(0, parsed.confidence ?? 50)),
      linkedin_url: parsed.linkedin_url || undefined,
    };
  } catch (err) {
    console.error(`[decision-maker] JSON parse error for "${businessName}": ${err}`);
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
    const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY') || '';

    if (!perplexityApiKey) {
      console.error('[decision-maker] PERPLEXITY_API_KEY is not set!');
      return new Response(
        JSON.stringify({ error: 'PERPLEXITY_API_KEY not configured. Set it in Supabase secrets.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    console.log(`[decision-maker] PERPLEXITY_API_KEY present, length=${perplexityApiKey.length}`);

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

    await supabase.from('jobs').update({
      status: 'running',
      progress_step: 3,
      progress_message: `Etapa 3: Pesquisando decisores de ${leads?.length ?? 0} empresas via Perplexity AI...`,
    }).eq('id', jobId);

    let updatedCount = 0;

    if (leads && leads.length > 0) {
      for (let i = 0; i < leads.length; i++) {
        const lead = leads[i];
        const rawUrl = (lead.website_url || '').trim();
        if (!rawUrl) {
          console.log(`[decision-maker] lead ${lead.id} (${lead.name}): no website_url, skipping`);
          continue;
        }

        const baseUrl = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;

        // Skip social media URLs
        const SOCIAL_DOMAINS = ['instagram.com', 'facebook.com', 'twitter.com', 'x.com', 'linkedin.com', 'tiktok.com', 'youtube.com'];
        try {
          const hostname = new URL(baseUrl).hostname.replace(/^www\./, '');
          if (SOCIAL_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d))) {
            console.log(`[decision-maker] lead ${lead.id} (${lead.name}): social media URL (${hostname}), skipping`);
            continue;
          }
        } catch { /* continue with URL as-is */ }

        console.log(`[decision-maker] lead ${lead.id} (${lead.name}): searching via Perplexity, website=${baseUrl}`);

        // Use Perplexity to search for decision maker (no scraping needed!)
        const result = await searchDecisionMaker(
          lead.name,
          job.business_type || '',
          baseUrl,
          perplexityApiKey,
        );

        console.log(`[decision-maker] lead ${lead.id}: result=${JSON.stringify(result)}`);

        if (result && result.confidence > 0) {
          const updateData: Record<string, any> = {
            decision_maker_name: result.name,
            decision_maker_role: result.role,
            decision_maker_confidence: result.confidence,
            decision_maker_source_url: result.linkedin_url || baseUrl,
          };

          // If Perplexity found a LinkedIn URL, also save it to linkedin_url field
          if (result.linkedin_url) {
            updateData.linkedin_url = result.linkedin_url;
          }

          const { error: updateErr } = await supabase
            .from('leads')
            .update(updateData)
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
          progress_message: `Etapa 3: ${i + 1}/${leads.length} pesquisados, ${updatedCount} decisores encontrados (${elapsed}s)`,
        }).eq('id', jobId);

        // Small delay between Perplexity calls to avoid rate limiting
        if (i < leads.length - 1) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }

    // ── Final update ──
    const elapsed = Math.round((Date.now() - start) / 1000);
    await supabase.from('jobs').update({
      progress_step: 3,
      progress_message: `Etapa 3 concluída — ${updatedCount} decisores encontrados em ${elapsed}s (via Perplexity AI)`,
    }).eq('id', jobId);

    console.log(`[decision-maker] DONE updated=${updatedCount} elapsed=${Date.now() - start}ms`);

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
