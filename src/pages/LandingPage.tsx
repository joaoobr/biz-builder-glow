import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Zap, ArrowRight, MapPin, Target, TrendingUp, CheckCircle2, Star, Users, Mail, Globe, Shield, CreditCard } from 'lucide-react';
import heroBg from '@/assets/hero-bg-v2.jpg';
import logoIcon from '@/assets/logo-icon.png';

import type { Easing } from 'framer-motion';

const easeOut: Easing = [0, 0, 0.2, 1];

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.15, ease: easeOut },
  }),
};

const features = [
  { icon: MapPin, title: 'Busca Geolocalizada', desc: 'Encontre empresas em qualquer cidade do Brasil via Google Maps — filtradas por tipo de negócio e raio.' },
  { icon: Target, title: 'Decisor Identificado', desc: 'IA localiza o nome, cargo e LinkedIn do tomador de decisão de cada empresa encontrada.' },
  { icon: Mail, title: 'E-mail Validado', desc: 'Descubra o e-mail corporativo do decisor com verificação automática de entregabilidade.' },
  { icon: TrendingUp, title: 'Enriquecimento Total', desc: 'Site, telefone, avaliações, reviews — tudo consolidado em uma planilha pronta para prospecção.' },
  { icon: Globe, title: 'Múltiplas Fontes', desc: 'Google Maps, OSM e Google Places combinados para máxima cobertura de dados.' },
  { icon: Shield, title: 'Dados Seguros', desc: 'Seus leads são privados e protegidos. Ninguém além de você tem acesso aos seus dados.' },
];

const plans = [
  {
    name: 'Free',
    price: 'R$ 0',
    period: '',
    credits: '5 leads',
    highlight: false,
    features: ['5 leads grátis', 'Busca OSM', 'Exportação CSV', 'Dados básicos'],
  },
  {
    name: 'Starter',
    price: 'R$ 49',
    period: '/mês',
    credits: '50 leads',
    highlight: false,
    features: ['50 leads/mês', 'Google Maps (Apify)', 'Decisor + E-mail', 'Exportação CSV', 'Suporte por e-mail'],
  },
  {
    name: 'Pro',
    price: 'R$ 97',
    period: '/mês',
    credits: '100 leads',
    highlight: true,
    features: ['100 leads/mês', 'Google Maps (Apify)', 'Decisor + E-mail + LinkedIn', 'Exportação CSV', 'Suporte prioritário', 'Acesso antecipado a novos recursos'],
  },
];

const stats = [
  { number: '50K+', label: 'Leads gerados' },
  { number: '85%', label: 'E-mails encontrados' },
  { number: '3x', label: 'Mais rápido' },
  { number: '500+', label: 'Empresas usam' },
];

const LandingPage = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <img src={logoIcon} alt="GeoLeads AI" className="h-9 w-9" />
            <span className="text-lg font-bold font-heading">GeoLeads AI</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <a href="#pricing">Planos</a>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <a href="#features">Recursos</a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/login">Entrar</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/login">Começar Grátis</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden min-h-[600px] flex items-center">
        <div
          className="absolute inset-0 bg-cover bg-center scale-105"
          style={{ backgroundImage: `url(${heroBg})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/70 to-background" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/50 to-transparent" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 py-20 sm:py-32 w-full">
          <motion.div
            initial="hidden"
            animate="visible"
            className="max-w-2xl"
          >
            <motion.div variants={fadeUp} custom={0} className="flex items-center gap-3 mb-6">
              <motion.img
                src={logoIcon}
                alt=""
                className="h-16 w-16 drop-shadow-[0_0_25px_hsl(217,91%,60%,0.5)]"
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 150, delay: 0.2 }}
              />
              <Badge variant="outline" className="border-[hsl(38,92%,50%)]/40 text-[hsl(38,92%,50%)] bg-[hsl(38,92%,50%)]/5 px-3 py-1.5 text-sm">
                <Star className="h-3 w-3 mr-1.5 fill-current" />
                5 buscas grátis — sem cartão
              </Badge>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              custom={1}
              className="text-4xl sm:text-5xl lg:text-[3.5rem] font-bold font-heading leading-[1.1] tracking-tight"
            >
              Cada pin no mapa é{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[hsl(38,92%,50%)] via-[hsl(45,93%,60%)] to-[hsl(38,92%,50%)]">
                dinheiro
              </span>{' '}
              esperando por você
            </motion.h1>

            <motion.p
              variants={fadeUp}
              custom={2}
              className="mt-5 text-lg sm:text-xl text-muted-foreground max-w-lg leading-relaxed"
            >
              Descubra empresas, identifique o decisor e conquiste o contato direto —{' '}
              <strong className="text-foreground">tudo em minutos com IA</strong>.
            </motion.p>

            <motion.div variants={fadeUp} custom={3} className="mt-8 flex flex-wrap gap-4">
              <Button
                size="lg"
                className="h-14 px-10 text-base font-bold gap-2 bg-gradient-to-r from-[hsl(38,92%,50%)] to-[hsl(30,90%,45%)] text-background hover:from-[hsl(38,92%,55%)] hover:to-[hsl(30,90%,50%)] shadow-[0_0_40px_hsl(38,92%,50%,0.3)] transition-shadow hover:shadow-[0_0_60px_hsl(38,92%,50%,0.4)]"
                asChild
              >
                <Link to="/login">
                  <Zap className="h-5 w-5" />
                  Começar Agora — É Grátis
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" className="h-14 px-8 text-base border-border/50" asChild>
                <a href="#pricing">Ver Planos</a>
              </Button>
            </motion.div>

            {/* Trust stats inline */}
            <motion.div variants={fadeUp} custom={4} className="mt-10 flex flex-wrap gap-6">
              {stats.map(({ number, label }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="text-lg font-heading font-bold text-primary">{number}</span>
                  <span className="text-sm text-muted-foreground">{label}</span>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Pipeline visual */}
      <section className="py-16 border-b border-border/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            className="text-center mb-10"
          >
            <motion.h2 variants={fadeUp} custom={0} className="text-3xl font-heading font-bold">
              Do mapa ao contato em <span className="text-primary">5 etapas</span>
            </motion.h2>
            <motion.p variants={fadeUp} custom={1} className="mt-2 text-muted-foreground max-w-lg mx-auto">
              Nossa IA automatiza todo o processo de prospecção B2B
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="flex flex-wrap justify-center gap-3"
          >
            {['Buscar empresas', 'Encontrar site', 'Pesquisar decisor', 'Encontrar e-mail', 'Exportar'].map((step, i) => (
              <motion.div key={step} variants={fadeUp} custom={i} className="flex items-center gap-2">
                <div className="flex items-center gap-2 rounded-xl bg-secondary/80 border border-border/50 px-4 py-3">
                  <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">
                    {i + 1}
                  </div>
                  <span className="text-sm font-medium">{step}</span>
                </div>
                {i < 4 && <span className="text-muted-foreground hidden sm:inline text-lg">→</span>}
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            className="text-center mb-12"
          >
            <motion.h2 variants={fadeUp} custom={0} className="text-3xl font-heading font-bold">
              Tudo que você precisa para prospectar
            </motion.h2>
            <motion.p variants={fadeUp} custom={1} className="mt-2 text-muted-foreground max-w-lg mx-auto">
              Ferramentas poderosas para encontrar e conectar com seus clientes ideais
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {features.map(({ icon: Icon, title, desc }, i) => (
              <motion.div key={title} variants={fadeUp} custom={i}>
                <Card className="bg-card/60 border-border/50 hover:border-primary/30 transition-all hover:-translate-y-1 duration-300 h-full">
                  <CardContent className="p-6">
                    <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-heading font-semibold">{title}</h3>
                    <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 bg-secondary/20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            className="text-center mb-12"
          >
            <motion.h2 variants={fadeUp} custom={0} className="text-3xl font-heading font-bold">
              Planos que cabem no seu bolso
            </motion.h2>
            <motion.p variants={fadeUp} custom={1} className="mt-2 text-muted-foreground max-w-lg mx-auto">
              Comece grátis. Escale quando estiver pronto.
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl mx-auto"
          >
            {plans.map((plan, i) => (
              <motion.div key={plan.name} variants={fadeUp} custom={i}>
                <Card className={`relative h-full ${plan.highlight ? 'border-primary shadow-[0_0_30px_hsl(217,91%,60%,0.15)]' : 'border-border/50'}`}>
                  {plan.highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-primary text-primary-foreground px-3">Mais Popular</Badge>
                    </div>
                  )}
                  <CardContent className="p-6 flex flex-col h-full">
                    <h3 className="font-heading font-bold text-lg">{plan.name}</h3>
                    <div className="mt-3 flex items-baseline gap-1">
                      <span className="text-4xl font-heading font-bold">{plan.price}</span>
                      {plan.period && <span className="text-muted-foreground text-sm">{plan.period}</span>}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{plan.credits}/mês</p>

                    <ul className="mt-6 space-y-3 flex-1">
                      {plan.features.map(f => (
                        <li key={f} className="flex items-center gap-2 text-sm">
                          <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))] shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>

                    <Button
                      className={`mt-6 w-full ${plan.highlight ? 'bg-gradient-to-r from-primary to-[hsl(217,91%,70%)]' : ''}`}
                      variant={plan.highlight ? 'default' : 'outline'}
                      size="lg"
                      asChild
                    >
                      <Link to="/login">
                        {plan.name === 'Free' ? 'Começar Grátis' : 'Assinar Agora'}
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="relative rounded-2xl overflow-hidden"
          >
            <div
              className="absolute inset-0 bg-cover bg-center opacity-40"
              style={{ backgroundImage: `url(${heroBg})` }}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-background via-background/90 to-background/70" />

            <motion.div variants={fadeUp} custom={0} className="relative p-10 sm:p-16 max-w-xl">
              <h2 className="text-3xl sm:text-4xl font-heading font-bold leading-tight">
                Pare de perder tempo.{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[hsl(38,92%,50%)] to-[hsl(45,93%,60%)]">
                  Comece a faturar.
                </span>
              </h2>
              <p className="mt-4 text-muted-foreground text-lg">
                5 buscas grátis, sem cartão de crédito. Veja resultados reais em menos de 2 minutos.
              </p>
              <Button
                size="lg"
                className="mt-6 h-14 px-10 text-base font-bold gap-2 bg-gradient-to-r from-[hsl(38,92%,50%)] to-[hsl(30,90%,45%)] text-background hover:from-[hsl(38,92%,55%)] hover:to-[hsl(30,90%,50%)] shadow-[0_0_40px_hsl(38,92%,50%,0.3)]"
                asChild
              >
                <Link to="/login">
                  <Zap className="h-5 w-5" />
                  Criar Conta Grátis
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src={logoIcon} alt="" className="h-6 w-6" />
            <span className="text-sm text-muted-foreground">© 2026 GeoLeads AI. Todos os direitos reservados.</span>
          </div>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <a href="#" className="hover:text-foreground transition-colors">Termos</a>
            <a href="#" className="hover:text-foreground transition-colors">Privacidade</a>
            <a href="#" className="hover:text-foreground transition-colors">Contato</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
