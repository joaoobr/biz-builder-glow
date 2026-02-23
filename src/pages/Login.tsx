import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Zap, BarChart3, Download, Users } from 'lucide-react';

const Login = () => {
  const { user, loading, signInWithGoogle } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (user) return <Navigate to="/app" replace />;

  return (
    <div className="flex min-h-screen">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-background" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
              <Zap className="h-5 w-5 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold font-heading">Lead Builder Local</h1>
          </div>
        </div>
        <div className="relative z-10 space-y-8">
          <h2 className="text-4xl font-bold leading-tight font-heading">
            Gere listas de leads locais<br />
            <span className="text-primary">de forma inteligente.</span>
          </h2>
          <div className="grid grid-cols-1 gap-4">
            {[
              { icon: Users, text: 'Encontre decisores e contatos' },
              { icon: BarChart3, text: 'Acompanhe progresso em tempo real' },
              { icon: Download, text: 'Exporte para CSV com um clique' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3 rounded-xl bg-secondary/50 p-4 backdrop-blur">
                <Icon className="h-5 w-5 text-primary" />
                <span className="text-sm text-foreground">{text}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-10 text-xs text-muted-foreground">
          © 2026 Lead Builder Local
        </div>
      </div>

      {/* Right side - Login */}
      <div className="flex w-full lg:w-1/2 flex-col items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-8">
          <div className="lg:hidden flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
              <Zap className="h-5 w-5 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold font-heading">Lead Builder Local</h1>
          </div>

          <div className="space-y-2">
            <h2 className="text-3xl font-bold font-heading">Bem-vindo</h2>
            <p className="text-muted-foreground">
              Gere listas de leads locais e exporte para CSV.
            </p>
          </div>

          <Button
            onClick={signInWithGoogle}
            size="lg"
            className="w-full h-12 text-base gap-3 bg-foreground text-background hover:bg-foreground/90"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Entrar com Google
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Ao continuar, você concorda com nossos termos de uso.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
