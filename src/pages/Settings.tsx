import { useAuth } from '@/contexts/AuthContext';
import { Navigate, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Zap, Key } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const SettingsPage = () => {
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const [integrations, setIntegrations] = useState(false);
  const [googleKey, setGoogleKey] = useState('');
  const [hunterKey, setHunterKey] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle().then(({ data }) => {
      if (data) {
        setGoogleKey(data.google_places_key || '');
        setHunterKey(data.hunter_key || '');
        setIntegrations(!!(data.google_places_key || data.hunter_key));
      }
    });
  }, [user]);

  if (loading) return <div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  if (!user) return <Navigate to="/login" replace />;

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from('user_settings').upsert({
        user_id: user.id,
        google_places_key: googleKey || null,
        hunter_key: hunterKey || null,
      }, { onConflict: 'user_id' });
      if (error) throw error;
      toast({ title: 'Configurações salvas!' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-4 px-4 sm:px-6">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/app"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <span className="font-bold font-heading">Configurações</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              Integrações Opcionais
            </CardTitle>
            <CardDescription>
              Chaves são opcionais e serão usadas nas próximas etapas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <Label>Permitir integrações opcionais</Label>
              <Switch checked={integrations} onCheckedChange={setIntegrations} />
            </div>

            {integrations && (
              <div className="space-y-4 pt-4 border-t border-border">
                <div className="space-y-2">
                  <Label>Google Places API Key</Label>
                  <Input
                    type="password"
                    placeholder="AIza..."
                    value={googleKey}
                    onChange={e => setGoogleKey(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Hunter API Key</Label>
                  <Input
                    type="password"
                    placeholder="Sua chave Hunter..."
                    value={hunterKey}
                    onChange={e => setHunterKey(e.target.value)}
                  />
                </div>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default SettingsPage;
