import { useAuth } from '@/contexts/AuthContext';
import { Navigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Check, Crown, Rocket, Building2, Zap } from 'lucide-react';
import { useCredits } from '@/hooks/useCredits';
import { useToast } from '@/hooks/use-toast';

const plans = [
  {
    id: 'free',
    name: 'Free',
    price: 'R$ 0',
    period: '/mês',
    description: 'Para experimentar a plataforma',
    icon: Zap,
    color: 'text-muted-foreground',
    borderColor: 'border-border',
    features: [
      '5 leads por mês',
      'Busca por tipo de negócio',
      'Dados básicos (nome, endereço, telefone)',
      'Exportação CSV',
    ],
    limits: [
      'Sem enriquecimento de decisores',
      'Sem dados Lusha',
    ],
    credits: 5,
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 'R$ 97',
    period: '/mês',
    description: 'Para freelancers e pequenos negócios',
    icon: Rocket,
    color: 'text-primary',
    borderColor: 'border-primary/50',
    popular: true,
    features: [
      '100 leads por mês',
      'Busca por tipo de negócio + localização',
      'Dados completos com website',
      'Enriquecimento de decisores (IA)',
      'Exportação CSV',
    ],
    limits: [
      'Sem dados Lusha',
    ],
    credits: 100,
  },
  {
    id: 'professional',
    name: 'Professional',
    price: 'R$ 297',
    period: '/mês',
    description: 'Para equipes de vendas',
    icon: Crown,
    color: 'text-warning',
    borderColor: 'border-warning/50',
    features: [
      '500 leads por mês',
      'Todos os recursos do Starter',
      'Enriquecimento Lusha (email + telefone)',
      'LinkedIn do decisor',
      'Suporte prioritário',
    ],
    limits: [],
    credits: 500,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Sob consulta',
    period: '',
    description: 'Para grandes operações',
    icon: Building2,
    color: 'text-success',
    borderColor: 'border-success/50',
    features: [
      'Leads ilimitados',
      'Todos os recursos do Professional',
      'API dedicada',
      'Gerente de conta',
      'SLA garantido',
      'Integrações customizadas',
    ],
    limits: [],
    credits: 99999,
  },
];

const PlansPage = () => {
  const { user, loading } = useAuth();
  const { credits } = useCredits();
  const { toast } = useToast();

  if (loading) return <div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  if (!user) return <Navigate to="/login" replace />;

  const currentPlan = credits?.plan_name?.toLowerCase() || 'free';

  const handleUpgrade = (planId: string) => {
    if (planId === 'enterprise') {
      window.open('mailto:contato@bizbuilderglow.com?subject=Enterprise Plan', '_blank');
      return;
    }
    toast({
      title: '🚀 Upgrade solicitado!',
      description: `Entraremos em contato para ativar o plano ${plans.find(p => p.id === planId)?.name}. Envie um email para contato@bizbuilderglow.com`,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-4 sm:px-6">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/app"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div className="flex items-center gap-2">
            <Crown className="h-4 w-4 text-warning" />
            <span className="font-bold font-heading">Planos & Upgrade</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-10">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold font-heading mb-3">
            Escolha o plano ideal para você
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Escale sua prospecção com leads qualificados, enriquecidos com dados de decisores e contatos diretos.
          </p>
          {credits && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm">
              <span className="text-muted-foreground">Plano atual:</span>
              <Badge variant="outline" className="border-primary text-primary font-semibold">
                {credits.plan_name || 'Free'}
              </Badge>
              <span className="text-muted-foreground">•</span>
              <span className="text-foreground font-medium">
                {credits.credits_total - credits.credits_used} créditos restantes
              </span>
            </div>
          )}
        </div>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {plans.map((plan) => {
            const isCurrent = currentPlan === plan.id;
            const Icon = plan.icon;

            return (
              <Card
                key={plan.id}
                className={`relative flex flex-col transition-all duration-200 hover:scale-[1.02] ${plan.borderColor} ${
                  plan.popular ? 'ring-2 ring-primary shadow-lg shadow-primary/10' : ''
                } ${isCurrent ? 'bg-secondary/50' : ''}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground font-semibold px-3">
                      Mais Popular
                    </Badge>
                  </div>
                )}

                <CardHeader className="pb-4">
                  <div className={`w-10 h-10 rounded-lg bg-secondary flex items-center justify-center mb-2`}>
                    <Icon className={`h-5 w-5 ${plan.color}`} />
                  </div>
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  <CardDescription className="text-xs">{plan.description}</CardDescription>
                  <div className="pt-2">
                    <span className="text-3xl font-bold font-heading">{plan.price}</span>
                    <span className="text-muted-foreground text-sm">{plan.period}</span>
                  </div>
                </CardHeader>

                <CardContent className="flex-1 flex flex-col">
                  <ul className="space-y-2.5 flex-1 mb-6">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-success shrink-0 mt-0.5" />
                        <span className="text-foreground">{feature}</span>
                      </li>
                    ))}
                    {plan.limits.map((limit, i) => (
                      <li key={`l-${i}`} className="flex items-start gap-2 text-sm">
                        <span className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5 text-center">✕</span>
                        <span className="text-muted-foreground">{limit}</span>
                      </li>
                    ))}
                  </ul>

                  {isCurrent ? (
                    <Button variant="outline" disabled className="w-full">
                      Plano Atual
                    </Button>
                  ) : (
                    <Button
                      className={`w-full ${plan.popular ? '' : ''}`}
                      variant={plan.popular ? 'default' : 'outline'}
                      onClick={() => handleUpgrade(plan.id)}
                    >
                      {plan.id === 'enterprise' ? 'Falar com Vendas' : 'Fazer Upgrade'}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* FAQ */}
        <div className="mt-14 max-w-2xl mx-auto">
          <h2 className="text-xl font-bold font-heading text-center mb-6">Perguntas Frequentes</h2>
          <div className="space-y-4">
            {[
              { q: 'Os créditos acumulam?', a: 'Não. Os créditos são mensais e não acumulam para o próximo período.' },
              { q: 'Posso cancelar a qualquer momento?', a: 'Sim, sem multa. Você mantém o acesso até o fim do período pago.' },
              { q: 'O que acontece se meus créditos acabarem?', a: 'A busca por novos leads fica bloqueada até a renovação mensal ou upgrade de plano.' },
              { q: 'Posso fazer downgrade?', a: 'Sim, o downgrade é aplicado no próximo ciclo de cobrança.' },
            ].map((faq, i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-4">
                <p className="font-semibold text-sm mb-1">{faq.q}</p>
                <p className="text-sm text-muted-foreground">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default PlansPage;
