import { useAuth } from '@/contexts/AuthContext';
import { Navigate, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Zap } from 'lucide-react';

interface Job {
  id: string;
  business_type: string;
  location_text: string;
  quantity: number;
  status: string;
  source: string;
  created_at: string;
}

const statusColor: Record<string, string> = {
  queued: 'bg-muted text-muted-foreground',
  running: 'bg-primary/20 text-primary',
  processing: 'bg-yellow-500/20 text-yellow-400',
  done: 'bg-green-500/20 text-green-400',
  failed: 'bg-destructive/20 text-destructive',
};

const Jobs = () => {
  const { user, loading } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [fetching, setFetching] = useState(true);

  const fetchJobs = () => {
    if (!user) return;
    supabase
      .from('jobs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setJobs((data as Job[]) || []);
        setFetching(false);
      });
  };

  useEffect(() => {
    fetchJobs();
    // Poll every 3s if any job is active
    const interval = setInterval(() => {
      if (jobs.some(j => j.status === 'running' || j.status === 'processing' || j.status === 'queued')) {
        fetchJobs();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [user, jobs.length]);

  if (loading) return <div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-4 sm:px-6">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/app"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <span className="font-bold font-heading">Histórico de Jobs</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8">
        {fetching ? (
          <p className="text-muted-foreground text-center py-12">Carregando...</p>
        ) : jobs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Nenhum job criado ainda. <Link to="/app" className="text-primary underline">Criar primeiro job</Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {jobs.map(job => (
              <Link key={job.id} to={`/jobs/${job.id}`}>
                <Card className="hover:border-primary/40 transition-colors cursor-pointer">
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-semibold">{job.business_type}</p>
                      <p className="text-sm text-muted-foreground">{job.location_text} · {job.quantity} leads · {job.source}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className={statusColor[job.status] || 'bg-muted'}>{job.status}</Badge>
                      <span className="text-xs text-muted-foreground">{new Date(job.created_at).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Jobs;
