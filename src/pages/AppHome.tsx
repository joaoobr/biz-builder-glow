import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Plus, LogOut, History, Settings, Zap, Users, Globe, Mail, UserCheck, BarChart3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { processJob, processJobApifyMaps } from '@/lib/process-job';


const AppHome = () => {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [leads, setLeads] = useState<any[]>([]);
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
      <div className="flex min-h-screen items-center justify-center">
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

      // Process job client-side
      setProcessing(true);
      setProgressMsg('Iniciando processamento...');

      // Poll job status for progress updates
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

      // Navigate to job detail immediately so user can see progress
      navigate(`/jobs/${data.id}`);

      let result: { success: boolean; count?: number; error?: string };
      if (form.source === 'Apify') {
        result = await processJobApifyMaps(data.id, form.business_type, form.location, form.quantity, user.id);
      } else {
        result = await processJob(data.id, form.business_type, form.location, form.quantity);
      }
      clearInterval(pollInterval);

      if (result.success) {
        toast({ title: `Concluído! ${result.count} leads encontrados.` });
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
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold font-heading hidden sm:inline">GeoLeads AI</span>
          </div>

          <div className="flex items-center gap-2">
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

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-8">
        {/* New Job Card */}
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

        {/* Progress indicator */}
        {processing && progressMsg && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-sm font-medium">{progressMsg}</span>
            </CardContent>
          </Card>
        )}

        {/* Metrics */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
          {[
            { label: 'Total Leads', value: leads.length > 0 ? String(leads.length) : '—', icon: Users },
            { label: 'Com Site', value: leads.filter(l => l.website).length > 0 ? String(leads.filter(l => l.website).length) : '—', icon: Globe },
            { label: 'Com Email', value: leads.filter(l => l.email).length > 0 ? String(leads.filter(l => l.email).length) : '—', icon: Mail },
            { label: 'Com Decisor', value: leads.filter(l => l.decision_maker_name).length > 0 ? String(leads.filter(l => l.decision_maker_name).length) : '—', icon: UserCheck },
            { label: 'Taxa Preench.', value: leads.length > 0 ? `${Math.round((leads.filter(l => l.website || l.email).length / leads.length) * 100)}%` : '—', icon: BarChart3 },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label} className="bg-card">
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

        {/* Stepper */}
        <Card>
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

        {/* Empty results table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Resultados</CardTitle>
            <Input placeholder="Buscar leads..." className="max-w-xs h-9" />
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-secondary/50">
                    {['Nome', 'Endereço', 'Telefone', 'Website', 'Rating', 'Reviews', 'Decisor', 'Cargo', 'LinkedIn', 'E-mail', 'Status', 'Fonte'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leads.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-3 py-12 text-center text-muted-foreground">
                        Crie um job para ver resultados aqui.
                      </td>
                    </tr>
                  ) : (
                    leads.map((lead, i) => (
                      <tr key={lead.id || i} className="border-b border-border hover:bg-secondary/30">
                        <td className="px-3 py-2 whitespace-nowrap">{lead.name || '—'}</td>
                        <td className="px-3 py-2 max-w-[200px] truncate">{lead.address || '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{lead.phone || '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{lead.website || '—'}</td>
                        <td className="px-3 py-2">{lead.rating || '—'}</td>
                        <td className="px-3 py-2">{lead.reviews_count || '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{lead.decision_maker_name || '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{lead.decision_maker_title || '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{lead.linkedin_url || '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{lead.email || '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{lead.email_status || '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{lead.source || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default AppHome;
