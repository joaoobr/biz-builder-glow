import { Card, CardContent } from '@/components/ui/card';
import { Users, Globe, Mail, UserCheck, BarChart3 } from 'lucide-react';

interface MetricsBarProps {
  leads: any[];
}

const MetricsBar = ({ leads }: MetricsBarProps) => {
  const metrics = [
    { label: 'Total Leads', value: leads.length > 0 ? String(leads.length) : '—', icon: Users },
    { label: 'Com Site', value: leads.filter(l => l.website).length > 0 ? String(leads.filter(l => l.website).length) : '—', icon: Globe },
    { label: 'Com Email', value: leads.filter(l => l.email).length > 0 ? String(leads.filter(l => l.email).length) : '—', icon: Mail },
    { label: 'Com Decisor', value: leads.filter(l => l.decision_maker_name).length > 0 ? String(leads.filter(l => l.decision_maker_name).length) : '—', icon: UserCheck },
    { label: 'Taxa Preench.', value: leads.length > 0 ? `${Math.round((leads.filter(l => l.website || l.email).length / leads.length) * 100)}%` : '—', icon: BarChart3 },
  ];

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
      {metrics.map(({ label, value, icon: Icon }) => (
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
  );
};

export default MetricsBar;
