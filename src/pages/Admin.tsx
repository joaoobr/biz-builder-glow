import { useAuth } from '@/contexts/AuthContext';
import { useAdmin } from '@/hooks/useAdmin';
import { Navigate, Link } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Zap, ArrowLeft, Users, CreditCard, Search, Shield } from 'lucide-react';

interface UserRow {
  id: string;
  email: string;
  created_at: string;
  credits_total: number;
  credits_used: number;
  plan_name: string;
  role: string;
  jobs_count: number;
  leads_count: number;
}

const PLANS = [
  { value: 'free', label: 'Free (5)', credits: 5 },
  { value: 'starter', label: 'Starter (50)', credits: 50 },
  { value: 'pro', label: 'Pro (100)', credits: 100 },
  { value: 'unlimited', label: 'Unlimited (999999)', credits: 999999 },
];

const Admin = () => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(true);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);

    // Fetch credits for all users (admin has RLS access)
    const { data: creditsData, error: creditsError } = await supabase
      .from('user_credits')
      .select('*');

    if (creditsError) {
      toast({ title: 'Erro ao carregar créditos', description: creditsError.message, variant: 'destructive' });
      setLoadingUsers(false);
      return;
    }

    // Fetch roles
    const { data: rolesData } = await supabase
      .from('user_roles')
      .select('user_id, role');

    // Fetch job counts per user
    const { data: jobsData } = await supabase
      .from('jobs')
      .select('user_id');

    // Fetch lead counts per job
    const { data: leadsData } = await supabase
      .from('leads')
      .select('job_id');

    const { data: allJobs } = await supabase
      .from('jobs')
      .select('id, user_id');

    const jobsByUser: Record<string, number> = {};
    const leadsByUser: Record<string, number> = {};

    if (jobsData) {
      for (const j of jobsData) {
        jobsByUser[j.user_id] = (jobsByUser[j.user_id] || 0) + 1;
      }
    }

    // Map leads to users through jobs
    if (leadsData && allJobs) {
      const jobUserMap: Record<string, string> = {};
      for (const j of allJobs) {
        jobUserMap[j.id] = j.user_id;
      }
      for (const l of leadsData) {
        const uid = jobUserMap[l.job_id];
        if (uid) leadsByUser[uid] = (leadsByUser[uid] || 0) + 1;
      }
    }

    const rolesMap: Record<string, string> = {};
    if (rolesData) {
      for (const r of rolesData) {
        rolesMap[r.user_id] = r.role;
      }
    }

    const rows: UserRow[] = (creditsData || []).map(c => ({
      id: c.user_id,
      email: c.user_id, // We'll show the user_id; email comes from auth which we can't query client-side
      created_at: c.created_at,
      credits_total: c.credits_total,
      credits_used: c.credits_used,
      plan_name: c.plan_name,
      role: rolesMap[c.user_id] || 'user',
      jobs_count: jobsByUser[c.user_id] || 0,
      leads_count: leadsByUser[c.user_id] || 0,
    }));

    setUsers(rows);
    setLoadingUsers(false);
  }, [toast]);

  useEffect(() => {
    if (isAdmin) fetchUsers();
  }, [isAdmin, fetchUsers]);

  if (authLoading || adminLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/app" replace />;

  const handlePlanChange = async (userId: string, planValue: string) => {
    const plan = PLANS.find(p => p.value === planValue);
    if (!plan) return;

    const { error } = await supabase
      .from('user_credits')
      .update({
        plan_name: plan.value,
        credits_total: plan.credits,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (error) {
      toast({ title: 'Erro ao atualizar plano', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `Plano atualizado para ${plan.label}` });
      fetchUsers();
    }
  };

  const handleResetCredits = async (userId: string) => {
    const { error } = await supabase
      .from('user_credits')
      .update({ credits_used: 0, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    if (error) {
      toast({ title: 'Erro ao resetar créditos', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Créditos resetados' });
      fetchUsers();
    }
  };

  const handleSetCustomCredits = async (userId: string, total: number) => {
    const { error } = await supabase
      .from('user_credits')
      .update({ credits_total: total, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `Créditos atualizados para ${total}` });
      fetchUsers();
    }
  };

  const filteredUsers = users.filter(u =>
    u.id.toLowerCase().includes(search.toLowerCase()) ||
    u.plan_name.toLowerCase().includes(search.toLowerCase())
  );

  const totalUsers = users.length;
  const totalLeads = users.reduce((s, u) => s + u.leads_count, 0);
  const totalJobs = users.reduce((s, u) => s + u.jobs_count, 0);
  const paidUsers = users.filter(u => u.plan_name !== 'free').length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-destructive flex items-center justify-center">
              <Shield className="h-4 w-4 text-destructive-foreground" />
            </div>
            <span className="text-lg font-bold font-heading hidden sm:inline">Admin Panel</span>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/app"><ArrowLeft className="h-4 w-4 mr-1.5" />Voltar ao App</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-6">
        {/* Metrics */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Usuários', value: totalUsers, icon: Users },
            { label: 'Pagantes', value: paidUsers, icon: CreditCard },
            { label: 'Jobs Totais', value: totalJobs, icon: Zap },
            { label: 'Leads Totais', value: totalLeads, icon: Users },
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

        {/* Users Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Gerenciar Usuários</CardTitle>
            <div className="relative max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
          </CardHeader>
          <CardContent>
            {loadingUsers ? (
              <div className="flex justify-center py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : (
              <div className="rounded-lg border border-border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-secondary/50">
                      {['User ID', 'Plano', 'Créditos', 'Usados', 'Restantes', 'Jobs', 'Leads', 'Role', 'Ações'].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-3 py-12 text-center text-muted-foreground">
                          Nenhum usuário encontrado.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map(u => (
                        <tr key={u.id} className="border-b border-border hover:bg-secondary/30">
                          <td className="px-3 py-2 font-mono text-xs max-w-[120px] truncate" title={u.id}>
                            {u.id.slice(0, 8)}...
                            {u.id === user.id && <Badge variant="outline" className="ml-1 text-[10px]">Você</Badge>}
                          </td>
                          <td className="px-3 py-2">
                            <Select value={u.plan_name} onValueChange={v => handlePlanChange(u.id, v)}>
                              <SelectTrigger className="h-8 w-[140px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {PLANS.map(p => (
                                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-3 py-2 font-medium">{u.credits_total}</td>
                          <td className="px-3 py-2">{u.credits_used}</td>
                          <td className="px-3 py-2">
                            <Badge variant={u.credits_total - u.credits_used <= 0 ? 'destructive' : 'default'}>
                              {u.credits_total - u.credits_used}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">{u.jobs_count}</td>
                          <td className="px-3 py-2">{u.leads_count}</td>
                          <td className="px-3 py-2">
                            <Badge variant={u.role === 'admin' ? 'destructive' : 'secondary'}>
                              {u.role}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">
                            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleResetCredits(u.id)}>
                              Resetar
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Admin;
