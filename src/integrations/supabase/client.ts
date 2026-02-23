import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_EXT_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_EXT_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Check EXT_SUPABASE_URL and EXT_SUPABASE_ANON_KEY secrets.');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');
