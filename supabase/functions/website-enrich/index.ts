const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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

    const supabaseUrl = Deno.env.get('EXT_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('EXT_SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('EXT_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await supabaseAuth.auth.getUser();
    console.log(`[website-enrich] auth: user=${userData?.user?.id ?? 'null'}, error=${userError?.message ?? 'none'}`);
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
    const limit = body.limit ?? 200;

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

    // ── Fetch leads without website_url but with website ──
    const { data: leads, error: leadsErr } = await supabase
      .from('leads')
      .select('id, name, address, website')
      .eq('job_id', jobId)
      .is('website_url', null)
      .not('website', 'is', null)
      .not('website', 'eq', '')
      .limit(limit);

    if (leadsErr) {
      throw new Error(`Failed to fetch leads: ${leadsErr.message}`);
    }

    console.log(`[website-enrich] jobId=${jobId} leadsToEnrich=${leads?.length ?? 0} elapsed=${Date.now() - start}ms`);

    await supabase.from('jobs').update({
      status: 'running',
      progress_step: 2,
      progress_message: `Etapa 2: Enriquecendo websites de ${leads?.length ?? 0} leads...`,
    }).eq('id', jobId);

    let updatedCount = 0;

    let cacheHits = 0;

    if (leads && leads.length > 0) {
      for (const lead of leads) {
        const rawUrl = (lead.website || '').trim();
        if (!rawUrl) continue;

        // ── CHECK business_cache FIRST ──
        // Normalize business name for lookup
        const normalizedName = lead.name.toLowerCase().trim();
        const { data: cached } = await supabase
          .from('business_cache')
          .select('*')
          .eq('business_name_normalized', normalizedName)
          .maybeSingle();

        if (cached && cached.website_url) {
          console.log(`[website-enrich] CACHE HIT for "${lead.name}": ${cached.website_url} (confidence=${cached.website_confidence})`);
          const { error: updateErr } = await supabase
            .from('leads')
            .update({
              website_url: cached.website_url,
              website_source: cached.website_source || 'CACHE',
              website_confidence: cached.website_confidence || 80,
            })
            .eq('id', lead.id);

          if (!updateErr) {
            updatedCount++;
            cacheHits++;
          }
          continue;
        }

        // ── ORIGINAL ENRICHMENT LOGIC ──
        // Clean and validate URL
        let cleanUrl = rawUrl
          .replace(/^https?:\/\//i, '')
          .replace(/\/+$/, '')
          .toLowerCase();

        // Skip directory/listing sites
        const directories = [
          'facebook.com', 'instagram.com', 'twitter.com', 'x.com',
          'linkedin.com', 'youtube.com', 'yelp.com', 'tripadvisor.com',
          'google.com', 'maps.google', 'foursquare.com', 'yellowpages',
          'paginasamarelas', 'telelistas', 'guiamais', 'apontador',
        ];

        const isDirectory = directories.some(d => cleanUrl.includes(d));

        // Calculate confidence
        let confidence = 50;
        let source = 'APIFY';

        if (!isDirectory) {
          confidence = 90;
          const nameParts = lead.name.toLowerCase().split(/\s+/).filter((p: string) => p.length > 3);
          const domainMatchesName = nameParts.some((part: string) => cleanUrl.includes(part));
          if (domainMatchesName) confidence = 95;
        } else {
          confidence = 30;
          source = 'APIFY_SOCIAL';
        }

        const { error: updateErr } = await supabase
          .from('leads')
          .update({
            website_url: rawUrl,
            website_source: source,
            website_confidence: confidence,
          })
          .eq('id', lead.id);

        if (updateErr) {
          console.error(`[website-enrich] failed to update lead ${lead.id}: ${updateErr.message}`);
          continue;
        }

        updatedCount++;

        // ── SAVE TO business_cache ──
        if (!isDirectory && confidence >= 80) {
          const { error: cacheErr } = await supabase
            .from('business_cache')
            .upsert({
              business_name_normalized: normalizedName,
              business_name: lead.name,
              address: lead.address || null,
              website_url: rawUrl,
              website_source: source,
              website_confidence: confidence,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'business_name_normalized' });

          if (cacheErr) {
            console.warn(`[website-enrich] cache save failed for "${lead.name}": ${cacheErr.message}`);
          }
        }

        // Update progress every 10 leads
        if (updatedCount % 10 === 0) {
          const elapsed = Math.round((Date.now() - start) / 1000);
          await supabase.from('jobs').update({
            progress_message: `Etapa 2: ${updatedCount}/${leads.length} sites processados (${elapsed}s)`,
          }).eq('id', jobId);
        }
      }
    }

    // ── Final update ──
    const elapsed = Math.round((Date.now() - start) / 1000);
    await supabase.from('jobs').update({
      progress_step: 2,
      progress_message: `Etapa 2 concluída — ${updatedCount} sites encontrados em ${elapsed}s`,
    }).eq('id', jobId);

    console.log(`[website-enrich] done updated=${updatedCount} elapsed=${Date.now() - start}ms`);

    return new Response(
      JSON.stringify({ status: 'done', updatedCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    console.error(`[website-enrich][error] ${err.message}`);

    // Try to update job
    try {
      const body = await req.clone().json().catch(() => ({}));
      const jobId = (body as any)?.jobId;
      if (jobId) {
        const supabaseUrl = Deno.env.get('EXT_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('EXT_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const sb = createClient(supabaseUrl, supabaseServiceKey);
        await sb.from('jobs').update({
          progress_message: `Erro (Etapa 2): ${err.message}`,
        }).eq('id', jobId);
      }
    } catch (_) { /* best effort */ }

    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
