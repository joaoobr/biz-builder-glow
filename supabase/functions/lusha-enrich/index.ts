const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LUSHA_API_URL = 'https://api.lusha.com/v2/person';

/**
 * Build a normalized cache key from domain + person name.
 * This ensures we don't call Lusha twice for the same person/domain combo.
 */
function buildCacheKey(domain: string, personName?: string): string {
  const normalizedDomain = domain.toLowerCase().replace(/^www\./, '').replace(/\/+$/, '');
  const normalizedName = (personName || '').toLowerCase().trim().replace(/\s+/g, ' ');
  return `${normalizedDomain}::${normalizedName}`;
}

/**
 * Extract domain from a URL string.
 */
function extractDomain(url: string): string | null {
  try {
    const cleaned = url.startsWith('http') ? url : `https://${url}`;
    const hostname = new URL(cleaned).hostname.replace(/^www\./, '');
    return hostname || null;
  } catch {
    return null;
  }
}

/**
 * Query Lusha API for a person by company domain + name.
 */
async function queryLusha(
  apiKey: string,
  domain: string,
  firstName?: string,
  lastName?: string,
): Promise<any | null> {
  // If we have a person name, use person endpoint
  // If not, try company endpoint for general contacts
  const params = new URLSearchParams({ company: domain });
  if (firstName) params.set('firstName', firstName);
  if (lastName) params.set('lastName', lastName);

  // Try person endpoint first
  const endpoints = [
    `${LUSHA_API_URL}?${params.toString()}`,
  ];

  // If no name provided, also try the company prospecting endpoint
  if (!firstName && !lastName) {
    const companyParams = new URLSearchParams({ company: domain, limit: '1' });
    endpoints.push(`https://api.lusha.com/v2/prospecting/contact?${companyParams.toString()}`);
  }

  for (const url of endpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      console.log(`[lusha-enrich] Trying: ${url}`);

      const res = await fetch(url, {
        method: 'GET',
        headers: { api_key: apiKey },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.status === 429) {
        console.warn('[lusha-enrich] Rate limited by Lusha API');
        return { _rateLimited: true };
      }

      if (!res.ok) {
        console.error(`[lusha-enrich] Lusha API error: ${res.status} ${await res.text().catch(() => '')}`);
        continue; // try next endpoint
      }

      const data = await res.json();
      console.log(`[lusha-enrich] Response from ${url}: ${JSON.stringify(data).slice(0, 500)}`);
      
      // For prospecting endpoint, extract first contact
      if (url.includes('prospecting') && data?.data?.length > 0) {
        return data.data[0];
      }
      
      if (data && (data.emailAddresses?.length || data.phoneNumbers?.length)) {
        return data;
      }
    } catch (err) {
      console.error(`[lusha-enrich] Lusha fetch error: ${err}`);
    }
  }
  
  return null;
}

/**
 * Split a full name into first + last.
 */
function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return { firstName: parts[0] || '', lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
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
    const lushaApiKey = Deno.env.get('LUSHA_API_KEY');

    if (!lushaApiKey) {
      return new Response(
        JSON.stringify({ error: 'LUSHA_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

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

    // ── Fetch leads with website but not yet enriched by Lusha ──
    const { data: leads, error: leadsErr } = await supabase
      .from('leads')
      .select('id, name, website_url, website, decision_maker_name')
      .eq('job_id', jobId)
      .or('lusha_source.is.null,lusha_source.eq.none')
      .limit(limit);

    if (leadsErr) throw new Error(`Failed to fetch leads: ${leadsErr.message}`);

    console.log(`[lusha-enrich] jobId=${jobId} leadsToEnrich=${leads?.length ?? 0}`);

    await supabase.from('jobs').update({
      status: 'running',
      progress_step: 4,
      progress_message: `Etapa 4: Enriquecendo ${leads?.length ?? 0} leads via Lusha...`,
    }).eq('id', jobId);

    let updatedCount = 0;
    let cacheHits = 0;
    let apiCalls = 0;
    let rateLimited = false;

    if (leads && leads.length > 0) {
      for (let i = 0; i < leads.length; i++) {
        if (rateLimited) break;

        const lead = leads[i];
        const rawUrl = (lead.website_url || lead.website || '').trim();
        if (!rawUrl) {
          // Mark as skipped so we don't retry
          await supabase.from('leads').update({ lusha_source: 'skipped' }).eq('id', lead.id);
          continue;
        }

        const domain = extractDomain(rawUrl);
        if (!domain) {
          await supabase.from('leads').update({ lusha_source: 'skipped' }).eq('id', lead.id);
          continue;
        }

        // Use decision_maker_name if available, otherwise search by domain only
        const personName = lead.decision_maker_name || '';
        const cacheKey = buildCacheKey(domain, personName);

        // ── Step 1: Check cache ──
        const { data: cached } = await supabase
          .from('lusha_cache')
          .select('*')
          .eq('query_key', cacheKey)
          .maybeSingle();

        if (cached) {
          // Cache HIT — use stored data
          cacheHits++;
          await supabase.from('leads').update({
            lusha_email: cached.email,
            lusha_phone: cached.phone,
            lusha_linkedin: cached.linkedin_url,
            lusha_title: cached.title,
            lusha_source: 'cache',
            // Also update decision maker fields if empty
            ...((!lead.decision_maker_name && cached.person_name) ? {
              decision_maker_name: cached.person_name,
              decision_maker_role: cached.title,
            } : {}),
          }).eq('id', lead.id);
          updatedCount++;
        } else {
          // ── Step 2: Call Lusha API ──
          const { firstName, lastName } = splitName(personName);
          const result = await queryLusha(lushaApiKey, domain, firstName || undefined, lastName || undefined);

          if (result?._rateLimited) {
            rateLimited = true;
            break;
          }

          apiCalls++;

          if (result && (result.emailAddresses?.length || result.phoneNumbers?.length)) {
            const email = result.emailAddresses?.[0]?.email || null;
            const phone = result.phoneNumbers?.[0]?.internationalNumber || result.phoneNumbers?.[0]?.localNumber || null;
            const linkedin = result.socialNetworks?.find((s: any) => s.type === 'linkedin')?.url || null;
            const title = result.currentJobTitle || result.jobTitle || null;
            const fullName = [result.firstName, result.lastName].filter(Boolean).join(' ') || personName || null;

            // Save to cache
            await supabase.from('lusha_cache').upsert({
              query_key: cacheKey,
              domain,
              person_name: fullName,
              email,
              phone,
              linkedin_url: linkedin,
              title,
              company_name: result.company?.name || null,
              raw_response: result,
            }, { onConflict: 'query_key' });

            // Update lead
            await supabase.from('leads').update({
              lusha_email: email,
              lusha_phone: phone,
              lusha_linkedin: linkedin,
              lusha_title: title,
              lusha_source: 'lusha',
              ...((!lead.decision_maker_name && fullName) ? {
                decision_maker_name: fullName,
                decision_maker_role: title,
              } : {}),
              ...((linkedin && !lead.decision_maker_name) ? { linkedin_url: linkedin } : {}),
            }).eq('id', lead.id);

            updatedCount++;
          } else {
            // No results from Lusha — mark as searched to avoid retrying
            await supabase.from('leads').update({ lusha_source: 'not_found' }).eq('id', lead.id);
          }

          // Small delay to respect rate limits
          if (i < leads.length - 1) {
            await new Promise(r => setTimeout(r, 500));
          }
        }

        // Update progress
        const elapsed = Math.round((Date.now() - start) / 1000);
        await supabase.from('jobs').update({
          progress_message: `Etapa 4: ${i + 1}/${leads.length} — ${updatedCount} enriquecidos (${cacheHits} cache, ${apiCalls} API) ${elapsed}s`,
        }).eq('id', jobId);
      }
    }

    // ── Final update ──
    const elapsed = Math.round((Date.now() - start) / 1000);
    const rateLimitMsg = rateLimited ? ' (pausado por rate limit)' : '';
    await supabase.from('jobs').update({
      progress_step: 4,
      progress_message: `Etapa 4 concluída — ${updatedCount} enriquecidos via Lusha (${cacheHits} cache, ${apiCalls} API) em ${elapsed}s${rateLimitMsg}`,
    }).eq('id', jobId);

    console.log(`[lusha-enrich] done updated=${updatedCount} cache=${cacheHits} api=${apiCalls} elapsed=${Date.now() - start}ms`);

    return new Response(
      JSON.stringify({ status: 'done', updatedCount, cacheHits, apiCalls, rateLimited }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    console.error(`[lusha-enrich][error] ${err.message}`);

    try {
      const body = await req.clone().json().catch(() => ({}));
      const jobId = (body as any)?.jobId;
      if (jobId) {
        const supabaseUrl = Deno.env.get('EXT_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('EXT_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const sb = createClient(supabaseUrl, supabaseServiceKey);
        await sb.from('jobs').update({
          progress_message: `Erro (Etapa 4 Lusha): ${err.message}`,
        }).eq('id', jobId);
      }
    } catch (_) { /* best effort */ }

    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
