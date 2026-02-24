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
import { Plus, LogOut, History, Settings, Zap, Shield, CreditCard, ArrowRight, MapPin, Target, TrendingUp, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { processJob, processJobApifyMaps } from '@/lib/process-job';
import { motion } from 'framer-motion';
import MetricsBar from '@/components/MetricsBar';
import LeadsTable from '@/components/LeadsTable';
import heroBg from '@/assets/hero-bg.jpg';

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
  const [showNewJob, setShowNewJob] = useState(false);
  const [form, setForm] = useState({
    business_type: '',
    location: '',
    quantity: 100,
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
    setCreating(true);
    try {
      const { data, error } = await supabase.from('jobs').insert({
        user_id: user.id,
        business_type: form.business_type,
        location_text: form.location,
        quantity: form.quantity,
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
        result = await processJobApifyMaps(data.id, form.business_type, form.location, form.quantity, user.id);
      } else {
        result = await processJob(data.id, form.business_type, form.location, form.quantity);
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

  const features = [
    { icon: MapPin, title: 'Busca Geolocalizada', desc: 'Encontre empresas em qualquer região do Brasil com dados do Google Maps' },
    { icon: Target, title: 'Decisor Identificado', desc: 'IA encontra nome, cargo e LinkedIn do tomador de decisão' },
    { icon: TrendingUp, title: 'Enriquecimento Total', desc: 'Site, e-mail, telefone e avaliações — tudo em uma planilha pronta' },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold font-heading hidden sm:inline">GeoLeads AI</span>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button variant="ghost" size="sm" asChild>
                <Link to="/admin"><Shield className="h-4 w-4 mr-1.5" />Admin</Link>
              </Button>
            )}
            <Button variant="ghost" size="sm" asChild>
              <Link to="/jobs"><History className="h-4 w-4 mr-1.5" />Jobs</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/settings"><Settings className="h-4 w-4 mr-1.5" />Config</Link>
            </Button>
            <div className="flex items-center gap-2 ml-2 pl-2 border-l border-border">
              {avatarUrl && (
                <img src={avatarUrl} alt="" className="h-7 w-7 rounded-full" />
              )}
              <span className="text-sm text-muted-foreground hidden md:inline max-w-[120px] truncate">{displayName}</span>
              <Button variant="ghost" size="icon" onClick={signOut} className="h-8 w-8">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${heroBg})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 py-16 sm:py-24">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className="max-w-2xl"
          >
            <div className="flex items-center gap-2 mb-4">
              {credits && (
                <Badge variant="outline" className="border-primary/40 text-primary bg-primary/5 px-3 py-1">
                  <CreditCard className="h-3 w-3 mr-1.5" />
                  {remaining} créditos restantes • {credits.plan_name}
                </Badge>
              )}
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold font-heading leading-tight tracking-tight">
              Transforme o mapa em{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-[hsl(var(--success))]">
                clientes reais
              </span>
            </h1>

            <p className="mt-4 text-lg sm:text-xl text-muted-foreground max-w-lg leading-relaxed">
              Encontre empresas, identifique decisores e obtenha e-mails validados — 
              tudo automatizado com IA em minutos.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                size="lg"
                className="h-12 px-8 text-base font-semibold gap-2"
                onClick={() => setShowNewJob(true)}
              >
                <Plus className="h-5 w-5" />
                Novo Job
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="lg" className="h-12 px-8 text-base" asChild>
                <Link to="/jobs">
                  <History className="h-4 w-4 mr-2" />
                  Ver Meus Jobs
                </Link>
              </Button>
            </div>
          </motion.div>

          {/* Feature cards */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3, ease: 'easeOut' }}
            className="mt-12 grid gap-4 sm:grid-cols-3"
          >
            {features.map(({ icon: Icon, title, desc }, i) => (
              <Card key={title} className="bg-card/60 backdrop-blur-md border-border/50 hover:border-primary/30 transition-colors">
                <CardContent className="p-5">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-heading font-semibold text-sm">{title}</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{desc}</p>
                </CardContent>
              </Card>
            ))}
          </motion.div>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-8">
        {/* New Job Form — expandable */}
        {showNewJob && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ duration: 0.3 }}
          >
            <Card className="border-primary/20 bg-gradient-to-br from-card to-secondary/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Plus className="h-5 w-5 text-primary" />
                  Novo Job
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Tipo de Negócio *</Label>
                    <Input
                      placeholder="ex: Restaurantes, Dentistas..."
                      value={form.business_type}
                      onChange={e => setForm(f => ({ ...f, business_type: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Localidade *</Label>
                    <Input
                      placeholder="ex: São Paulo - SP"
                      value={form.location}
                      onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Quantidade</Label>
                    <Input
                      type="number"
                      min={10}
                      max={5000}
                      value={form.quantity}
                      onChange={e => setForm(f => ({ ...f, quantity: parseInt(e.target.value) || 100 }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Raio (km)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={form.radius_km}
                      onChange={e => setForm(f => ({ ...f, radius_km: parseInt(e.target.value) || 10 }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Fonte</Label>
                    <Select value={form.source} onValueChange={v => setForm(f => ({ ...f, source: v }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="OSM">OSM (grátis)</SelectItem>
                        <SelectItem value="Apify">Apify (Google Maps)</SelectItem>
                        <SelectItem value="Google Places" disabled>Google Places (em breve) 🔒</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button onClick={handleCreate} disabled={creating || processing} size="lg" className="w-full h-10">
                      {creating ? 'Criando...' : processing ? 'Processando...' : 'Criar Job'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Progress indicator */}
        {processing && progressMsg && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-sm font-medium">{progressMsg}</span>
            </CardContent>
          </Card>
        )}

        {/* Pipeline Steps */}
        <Card className="bg-card/60">
          <CardHeader>
            <CardTitle className="text-lg">Pipeline de Enriquecimento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {['Buscar empresas', 'Encontrar site', 'Pesquisar decisor', 'Encontrar e-mail', 'Exportar'].map((step, i) => (
                <div key={step} className="flex items-center gap-2">
                  <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2">
                    <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                      {i + 1}
                    </div>
                    <span className="text-sm text-muted-foreground">{step}</span>
                  </div>
                  {i < 4 && <span className="text-muted-foreground hidden sm:inline">→</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <MetricsBar leads={leads} />
        <LeadsTable leads={leads} />

        {/* Social proof / CTA section */}
        <section className="rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 p-8 sm:p-10">
          <div className="max-w-xl">
            <h2 className="text-2xl font-heading font-bold">
              Pronto para escalar sua prospecção?
            </h2>
            <p className="mt-2 text-muted-foreground">
              Empresas que usam GeoLeads AI encontram <strong className="text-foreground">3x mais decisores</strong> qualificados 
              em metade do tempo. Faça upgrade e desbloqueie buscas ilimitadas.
            </p>
            <div className="mt-5 flex flex-wrap gap-4 items-center">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
                5 buscas grátis
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
                Decisor + E-mail
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
                Exportação CSV
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default AppHome;
