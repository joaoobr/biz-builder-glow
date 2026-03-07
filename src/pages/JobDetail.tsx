import { useAuth } from '@/contexts/AuthContext';
import { Navigate, Link, useParams } from 'react-router-dom';
import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Download, Users, Globe, Mail, UserCheck, BarChart3, Search, Sparkles } from 'lucide-react';
import { Lead, exportLeadsToCSV } from '@/lib/csv';
import { useToast } from '@/hooks/use-toast';
import { resumeJobApifyMaps } from '@/lib/process-job';

const steps = ['Buscar empresas', 'Encontrar site', 'Pesquisar decisor', 'Encontrar e-mail', 'Exportar'];

const JobDetail = () => {
  const { user, loading } = useAuth();
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [job, setJob] = useState<any>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [search, setSearch] = useState('');
  const [loadingData, setLoadingData] = useState(true);
  const [enrichingWebsite, setEnrichingWebsite] = useState(false);
  const [enrichingDecisionMaker, setEnrichingDecisionMaker] = useState(false);
  const [enrichingLusha, setEnrichingLusha] = useState(false);

  const fetchData = async () => {
    if (!id || !user) return;
    const [jobRes, leadsRes] = await Promise.all([
      supabase.from('jobs').select('*').eq('id', id).eq('user_id', user.id).single(),
      supabase.from('leads').select('*').eq('job_id', id).order('created_at'),
    ]);
    setJob(jobRes.data);
    setLeads((leadsRes.data as Lead[]) || []);
    setLoadingData(false);
  };

  // Auto-poll when job is running/processing
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const prevStatusRef = useRef<string | null>(null);
  const isJobActive = job?.status === 'running' || job?.status === 'processing' || job?.status === 'queued';

  useEffect(() => {
    fetchData();
  }, [user, id]);

  // Track status changes — when job transitions to done/failed, force a final refetch
  useEffect(() => {
    if (job?.status && prevStatusRef.current && prevStatusRef.current !== job.status) {
      if (job.status === 'done' || job.status === 'failed') {
        fetchData(); // ensure leads + job are fully synced
      }
    }
    prevStatusRef.current = job?.status || null;
  }, [job?.status]);

  useEffect(() => {
    if (!isJobActive || !id || !user) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    pollRef.current = setInterval(async () => {
      const [jobRes, leadsRes] = await Promise.all([
        supabase.from('jobs').select('*').eq('id', id).eq('user_id', user.id).single(),
        supabase.from('leads').select('*').eq('job_id', id).order('created_at'),
      ]);
      if (jobRes.data) setJob(jobRes.data);
      if (leadsRes.data) setLeads(leadsRes.data as Lead[]);

      // Stop polling when done
      if (jobRes.data?.status === 'done' || jobRes.data?.status === 'failed') {
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 2000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isJobActive, id, user]);

  // Safety net: if leads exist but job still shows running for >10s, force a status check
  useEffect(() => {
    if (!isJobActive || leads.length === 0 || !id || !user) return;
    
    const safetyTimer = setTimeout(async () => {
      const { data: freshJob } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();
      if (freshJob && (freshJob.status === 'done' || freshJob.status === 'failed')) {
        setJob(freshJob);
      }
    }, 5000);

    return () => clearTimeout(safetyTimer);
  }, [leads.length, isJobActive, id, user]);

  if (loading) return <div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  if (!user) return <Navigate to="/login" replace />;


  const handleExport = () => {
    if (leads.length === 0) {
      toast({ title: 'Sem leads para exportar', variant: 'destructive' });
      return;
    }
    exportLeadsToCSV(leads, `leads-${job?.business_type || 'export'}-${new Date().toISOString().slice(0, 10)}.csv`);
    toast({ title: 'CSV exportado!' });
  };


  const handleEnrichWebsite = async () => {
    if (!id) return;
    setEnrichingWebsite(true);
    toast({ title: 'Iniciando busca de websites...' });

    const pollInterval = setInterval(async () => {
      const { data: updatedJob } = await supabase
        .from('jobs')
        .select('progress_message, progress_step, status')
        .eq('id', id)
        .single();
      if (updatedJob) setJob((prev: any) => ({ ...prev, ...updatedJob }));
    }, 2000);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const { data, error } = await supabase.functions.invoke('website-enrich', {
        body: { jobId: id },
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });

      clearInterval(pollInterval);

      if (error) {
        // Try to extract friendly error
        let msg = 'Erro ao enriquecer websites';
        try {
          if (error.context && typeof error.context.json === 'function') {
            const body = await error.context.json();
            if (body?.error) msg = body.error;
          }
        } catch {}
        toast({ title: 'Erro', description: msg, variant: 'destructive' });
      } else if (data?.error) {
        toast({ title: 'Erro', description: data.error, variant: 'destructive' });
      } else {
        toast({ title: `Concluído! ${data?.updatedCount ?? 0} sites encontrados.` });
      }

      await fetchData();
    } catch (e: any) {
      clearInterval(pollInterval);
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setEnrichingWebsite(false);
    }
  };

  const handleEnrichDecisionMaker = async () => {
    if (!id) return;
    setEnrichingDecisionMaker(true);
    toast({ title: 'Iniciando pesquisa de decisores...' });

    const pollInterval = setInterval(async () => {
      const { data: updatedJob } = await supabase
        .from('jobs')
        .select('progress_message, progress_step, status')
        .eq('id', id)
        .single();
      if (updatedJob) setJob((prev: any) => ({ ...prev, ...updatedJob }));
    }, 2000);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const { data, error } = await supabase.functions.invoke('decision-maker-enrich', {
        body: { jobId: id },
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });

      clearInterval(pollInterval);

      if (error) {
        let msg = 'Erro ao pesquisar decisores';
        try {
          if (error.context && typeof error.context.json === 'function') {
            const body = await error.context.json();
            if (body?.error) msg = body.error;
          }
        } catch {}
        toast({ title: 'Erro', description: msg, variant: 'destructive' });
      } else if (data?.error) {
        toast({ title: 'Erro', description: data.error, variant: 'destructive' });
      } else {
        toast({ title: `Concluído! ${data?.updatedCount ?? 0} decisores encontrados.` });
      }

      await fetchData();
    } catch (e: any) {
      clearInterval(pollInterval);
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setEnrichingDecisionMaker(false);
    }
  };

  const handleEnrichLusha = async () => {
    if (!id) return;
    setEnrichingLusha(true);
    toast({ title: 'Iniciando enriquecimento via Lusha...' });

    const pollInterval = setInterval(async () => {
      const { data: updatedJob } = await supabase
        .from('jobs')
        .select('progress_message, progress_step, status')
        .eq('id', id)
        .single();
      if (updatedJob) setJob((prev: any) => ({ ...prev, ...updatedJob }));
    }, 2000);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const { data, error } = await supabase.functions.invoke('lusha-enrich', {
        body: { jobId: id },
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });

      clearInterval(pollInterval);

      if (error) {
        let msg = 'Erro ao enriquecer via Lusha';
        try {
          if (error.context && typeof error.context.json === 'function') {
            const body = await error.context.json();
            if (body?.error) msg = body.error;
          }
        } catch {}
        toast({ title: 'Erro', description: msg, variant: 'destructive' });
      } else if (data?.error) {
        toast({ title: 'Erro', description: data.error, variant: 'destructive' });
      } else {
        toast({ title: `Concluído! ${data?.updatedCount ?? 0} enriquecidos (${data?.cacheHits ?? 0} do cache).` });
      }

      await fetchData();
    } catch (e: any) {
      clearInterval(pollInterval);
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setEnrichingLusha(false);
    }
  };

  const filtered = leads.filter(l =>
    !search || Object.values(l).some(v => String(v ?? '').toLowerCase().includes(search.toLowerCase()))
  );

  const withSite = leads.filter(l => l.website_url || l.website).length;
  const withEmail = leads.filter(l => l.corporate_email || (l as any).lusha_email).length;
  const withDecisionMaker = leads.filter(l => l.decision_maker_name).length;
  const withLusha = leads.filter(l => (l as any).lusha_source === 'lusha' || (l as any).lusha_source === 'cache').length;
  const fillRate = leads.length ? Math.round(((withSite + withEmail + withDecisionMaker) / (leads.length * 3)) * 100) : 0;
  const progressStep = job?.progress_step || 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/jobs"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div className="flex-1">
            <span className="font-bold font-heading">{job?.business_type || 'Job'}</span>
            <span className="text-sm text-muted-foreground ml-2">{job?.location_text}</span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleExport} disabled={leads.length === 0}>
              <Download className="h-4 w-4 mr-1.5" />
              Exportar CSV
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-6">
        {loadingData ? (
          <p className="text-center text-muted-foreground py-12">Carregando...</p>
        ) : !job ? (
          <p className="text-center text-muted-foreground py-12">Job não encontrado.</p>
        ) : (
          <>
            {/* Stepper */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-wrap gap-2">
                  {steps.map((step, i) => {
                    const stepNum = i + 1;
                    const isDone = progressStep >= stepNum;
                    const isCurrent = progressStep === stepNum - 1 && isJobActive;
                    return (
                      <div key={step} className="flex items-center gap-2">
                        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 ${isDone ? 'bg-green-500/10' : isCurrent ? 'bg-primary/10' : 'bg-secondary'}`}>
                          <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${isDone ? 'bg-green-500/20 text-green-400' : isCurrent ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                            {isDone ? '✓' : stepNum}
                          </div>
                          <span className={`text-sm ${isDone ? 'text-green-400' : isCurrent ? 'text-primary' : 'text-muted-foreground'}`}>{step}</span>
                        </div>
                        {i < 4 && <span className="text-muted-foreground hidden sm:inline">→</span>}
                      </div>
                    );
                  })}
                </div>

                {/* Status message - hide when leads already loaded */}
                {job.progress_message && leads.length === 0 && isJobActive && (
                  <p className="text-sm text-muted-foreground mt-3">{job.progress_message}</p>
                )}

                <div className="mt-3 flex items-center gap-2">
                  <Badge className={job.status === 'done' ? 'bg-green-500/20 text-green-400' : job.status === 'failed' ? 'bg-destructive/20 text-destructive' : job.status === 'processing' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-primary/20 text-primary'}>
                    {job.status === 'done' ? '✓ Concluído' : job.status === 'failed' ? '✗ Falhou' : (job.status === 'running' || job.status === 'processing') && leads.length > 0 ? '✓ Concluído' : job.status === 'running' ? '⟳ Buscando...' : job.status}
                  </Badge>
                  {leads.length > 0 && progressStep >= 1 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleEnrichWebsite}
                      disabled={enrichingWebsite || isJobActive}
                    >
                      <Search className={`h-4 w-4 mr-1.5 ${enrichingWebsite ? 'animate-pulse' : ''}`} />
                      {enrichingWebsite ? 'Buscando sites...' : '2. Encontrar Site'}
                    </Button>
                  )}
                  {leads.length > 0 && progressStep >= 2 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleEnrichDecisionMaker}
                      disabled={enrichingDecisionMaker || isJobActive}
                    >
                      <UserCheck className={`h-4 w-4 mr-1.5 ${enrichingDecisionMaker ? 'animate-pulse' : ''}`} />
                      {enrichingDecisionMaker ? 'Pesquisando decisores...' : '3. Pesquisar Decisor'}
                    </Button>
                  )}
                  {leads.length > 0 && progressStep >= 3 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleEnrichLusha}
                      disabled={enrichingLusha || isJobActive}
                    >
                      <Sparkles className={`h-4 w-4 mr-1.5 ${enrichingLusha ? 'animate-pulse' : ''}`} />
                      {enrichingLusha ? 'Enriquecendo via Lusha...' : '4. Enriquecer (Lusha)'}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Metrics */}
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-7">
              {[
                { label: 'Total Leads', value: leads.length, icon: Users },
                { label: 'Com Site', value: withSite, icon: Globe },
                { label: 'Com Email', value: withEmail, icon: Mail },
                { label: 'Com Decisor', value: withDecisionMaker, icon: UserCheck },
                { label: 'Lusha', value: withLusha, icon: Sparkles },
                { label: 'Taxa Preench.', value: `${fillRate}%`, icon: BarChart3 },
              ].map(({ label, value, icon: Icon }) => (
                <Card key={label}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold font-heading">{value}</p>
                      <p className="text-xs text-muted-foreground">{label}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Table */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Leads ({filtered.length})</CardTitle>
                <Input placeholder="Buscar..." className="max-w-xs h-9" value={search} onChange={e => setSearch(e.target.value)} />
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-secondary/50">
                        {['Nome', 'Endereço', 'Telefone', 'Website', 'Rating', 'Reviews', 'Decisor', 'Cargo', 'LinkedIn', 'E-mail', 'Lusha Email', 'Lusha Fone', 'Status', 'Fonte'].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={14} className="px-3 py-12 text-center text-muted-foreground">
                            {leads.length === 0 ? 'Aguardando leads...' : 'Nenhum resultado para a busca.'}
                          </td>
                        </tr>
                      ) : filtered.map(l => (
                        <tr key={l.id} className="border-b border-border hover:bg-secondary/30 transition-colors">
                          <td className="px-3 py-2 whitespace-nowrap font-medium">{l.name}</td>
                          <td className="px-3 py-2 max-w-[200px] truncate">{l.address}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{l.phone}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{(() => {
                            const url = l.website_url || l.website;
                            if (!url) return '—';
                            const href = url.startsWith('http') ? url : `https://${url}`;
                            return (
                              <span className="flex items-center gap-1">
                                <a href={href} target="_blank" rel="noreferrer" className="text-primary hover:underline">{url.replace(/^https?:\/\//, '').slice(0, 30)}</a>
                                {l.website_confidence != null && (
                                  <span className={`text-[10px] ${l.website_confidence >= 80 ? 'text-green-400' : l.website_confidence >= 50 ? 'text-yellow-400' : 'text-muted-foreground'}`}>
                                    {l.website_confidence}%
                                  </span>
                                )}
                              </span>
                            );
                          })()}</td>
                          <td className="px-3 py-2">{l.rating ?? '—'}</td>
                          <td className="px-3 py-2">{l.reviews_count ?? '—'}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{l.decision_maker_name ?? '—'}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{l.decision_maker_role ?? '—'}</td>
                          <td className="px-3 py-2">{l.linkedin_url ? <a href={l.linkedin_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">Ver</a> : '—'}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{l.corporate_email ?? '—'}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{(l as any).lusha_email ?? '—'}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{(l as any).lusha_phone ?? '—'}</td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className={l.email_status === 'verified' ? 'text-green-400 border-green-400/30' : l.email_status === 'catch-all' ? 'text-yellow-400 border-yellow-400/30' : 'text-muted-foreground'}>
                              {l.email_status}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">{l.source}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
};

export default JobDetail;
