import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface UserCredits {
  credits_total: number;
  credits_used: number;
  plan_name: string;
}

export function useCredits() {
  const { user } = useAuth();
  const [credits, setCredits] = useState<UserCredits | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('user_credits')
      .select('credits_total, credits_used, plan_name')
      .eq('user_id', user.id)
      .maybeSingle();
    setCredits(data);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetch(); }, [fetch]);

  const remaining = credits ? credits.credits_total - credits.credits_used : 0;

  return { credits, remaining, loading, refetch: fetch };
}
