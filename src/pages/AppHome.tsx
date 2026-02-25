import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { useCredits } from '@/hooks/useCredits';
import { useAdmin } from '@/hooks/useAdmin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, LogOut, History, Settings, Zap, Shield, CreditCard } from 'lucide-react';
import { Link } from 'react-router-dom';
import { processJob, processJobApifyMaps } from '@/lib/process-job';
import MetricsBar from '@/components/MetricsBar';
import LeadsTable from '@/components/LeadsTable';
import logoIcon from '@/assets/logo-icon.png';

const AppHome = () => {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { credits, remaining, refetch: refetchCredits } = useCredits();
  const { isAdmin } = useAdmin();
  const [creating, setCreating] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [leads, setLeads] = useState<any[]>([]);
  const maxLeads = remaining > 0 ? remaining : 0;
  const [form, setForm] = useState({
    business_type: '',
    location: '',
    quantity: maxLeads,
    radius_km: 10,
    source: 'OSM',
  });

  const fetchLeads = useCallback(async (jobId: string) => {
    const { data } = await supabase
      .from('leads')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true });
    setLeads(data || []);
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  const handleCreate = async () => {
    if (!form.business_type || !form.location) {
      toast({ title: 'Preencha os campos obrigatórios', variant: 'destructive' });
      return;
    }
    if (remaining <= 0) {
      toast({ title: 'Créditos esgotados', description: 'Você não tem créditos suficientes. Entre em contato para upgrade.', variant: 'destructive' });
      return;
    }
    const cappedQuantity = Math.min(form.quantity, remaining);
    if (cappedQuantity <= 0) {
      toast({ title: 'Sem créditos disponíveis', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.from('jobs').insert({
        user_id: user.id,
        business_type: form.business_type,
        location_text: form.location,
        quantity: cappedQuantity,
        radius_km: form.radius_km,
        source: form.source,
        status: 'queued',
        progress_step: 0,
      }).select().single();

      if (error) throw error;
      toast({ title: 'Job criado! Processando...' });
      setCreating(false);

      setProcessing(true);
      setProgressMsg('Iniciando processamento...');

      const pollInterval = setInterval(async () => {
        const { data: job } = await supabase
          .from('jobs')
          .select('progress_message, status')
          .eq('id', data.id)
          .single();
        if (job?.progress_message) setProgressMsg(job.progress_message);
        if (job?.status === 'done' || job?.status === 'failed') {
          clearInterval(pollInterval);
        }
      }, 1500);

      navigate(`/jobs/${data.id}`);

      let result: { success: boolean; count?: number; error?: string };
      if (form.source === 'Apify') {
        result = await processJobApifyMaps(data.id, form.business_type, form.location, cappedQuantity, user.id);
      } else {
        result = await processJob(data.id, form.business_type, form.location, cappedQuantity);
      }
      clearInterval(pollInterval);

      if (result.success && result.count) {
        await supabase
          .from('user_credits')
          .update({
            credits_used: (credits?.credits_used || 0) + result.count,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id);
        refetchCredits();
        toast({ title: `Concluído! ${result.count} leads encontrados. (${result.count} créditos consumidos)` });
      } else if (result.success) {
        toast({ title: 'Concluído!' });
      } else {
        toast({ title: 'Erro no processamento', description: result.error, variant: 'destructive' });
      }
      setProcessing(false);
      setProgressMsg('');
    } catch (e: any) {
      toast({ title: 'Erro ao criar job', description: e.message, variant: 'destructive' });
      setCreating(false);
      setProcessing(false);
    }
  };

  const avatarUrl = user.user_metadata?.avatar_url;
  const displayName = user.user_metadata?.full_name || user.email;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <img src={logoIcon} alt="GeoLeads AI" className="h-8 w-8" />
            <span className="text-base font-bold font-heading hidden sm:inline">GeoLeads AI</span>
          </div>

          <div className="flex items-center gap-1">
            {isAdmin && (
              <Button variant="ghost" size="sm" asChild className="text-xs">
                <Link to="/admin"><Shield className="h-3.5 w-3.5 mr-1" />Admin</Link>
              </Button>
            )}
            <Button variant="ghost" size="sm" asChild className="text-xs">
              <Link to="/jobs"><History className="h-3.5 w-3.5 mr-1" />Jobs</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild className="text-xs">
              <Link to="/settings"><Settings className="h-3.5 w-3.5 mr-1" />Config</Link>
            </Button>
            <div className="flex items-center gap-2 ml-2 pl-2 border-l border-border">
              {avatarUrl && <img src={avatarUrl} alt="" className="h-7 w-7 rounded-full" />}
              <span className="text-xs text-muted-foreground hidden md:inline max-w-[100px] truncate">{displayName}</span>
              <Button variant="ghost" size="icon" onClick={signOut} className="h-7 w-7">
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-6 space-y-6">
        {/* Top bar: welcome + credits */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-heading font-bold">
              Olá, {user.user_metadata?.full_name?.split(' ')[0] || 'usuário'} 👋
            </h1>
            <p className="text-sm text-muted-foreground">Gerencie suas buscas de leads e acompanhe resultados.</p>
          </div>
          {credits && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  <strong className="text-foreground">{remaining}</strong>
                  <span className="text-muted-foreground"> / {credits.credits_total} créditos</span>
                </span>
                <Badge variant={credits.plan_name === 'free' ? 'secondary' : 'default'} className="text-[10px] ml-1">
                  {credits.plan_name}
                </Badge>
              </div>
            </div>
          )}
        </div>

        {/* New Job Form */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="h-4 w-4 text-primary" />
              Nova Busca de Leads
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
              <div className="space-y-1.5 lg:col-span-2">
                <Label className="text-xs">Tipo de Negócio *</Label>
                <Input
                  placeholder="ex: Restaurantes, Dentistas..."
                  value={form.business_type}
                  onChange={e => setForm(f => ({ ...f, business_type: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5 lg:col-span-2">
                <Label className="text-xs">Localidade *</Label>
                <Input
                  placeholder="ex: Recife, Fortaleza, Curitiba..."
                  value={form.location}
                  onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Quantidade (máx: {remaining})</Label>
                <Input
                  type="number"
                  min={1}
                  max={remaining}
                  value={form.quantity}
                  onChange={e => setForm(f => ({ ...f, quantity: Math.min(parseInt(e.target.value) || 0, remaining) }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Raio (km)</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={form.radius_km}
                  onChange={e => setForm(f => ({ ...f, radius_km: parseInt(e.target.value) || 10 }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5 lg:col-span-2">
                <Label className="text-xs">Fonte</Label>
                <Select value={form.source} onValueChange={v => setForm(f => ({ ...f, source: v }))}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OSM">OSM (grátis)</SelectItem>
                    <SelectItem value="Apify">Apify (Google Maps)</SelectItem>
                    <SelectItem value="Google Places" disabled>Google Places (em breve) 🔒</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end lg:col-span-4">
                <Button onClick={handleCreate} disabled={creating || processing} className="h-9 px-6">
                  <Zap className="h-4 w-4 mr-1.5" />
                  {creating ? 'Criando...' : processing ? 'Processando...' : 'Iniciar Busca'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Progress indicator */}
        {processing && progressMsg && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-sm">{progressMsg}</span>
            </CardContent>
          </Card>
        )}

        {/* Pipeline Steps */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pipeline de Enriquecimento</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="flex flex-wrap gap-2">
              {['Buscar empresas', 'Encontrar site', 'Pesquisar decisor', 'Encontrar e-mail', 'Exportar'].map((step, i) => (
                <div key={step} className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1.5">
                    <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                      {i + 1}
                    </div>
                    <span className="text-xs text-muted-foreground">{step}</span>
                  </div>
                  {i < 4 && <span className="text-muted-foreground/50 hidden sm:inline text-xs">→</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <MetricsBar leads={leads} />
        <LeadsTable leads={leads} />
      </main>
    </div>
  );
};

export default AppHome;
