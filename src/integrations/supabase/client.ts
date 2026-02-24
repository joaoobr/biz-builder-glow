import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nkgzwuvdxxfpyaotdlsf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rZ3p3dXZkeHhmcHlhb3RkbHNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODczNTgsImV4cCI6MjA4NzQ2MzM1OH0.v7ioBYk7qKqP-fmWF_YogzBdZyfD5JJCTp3mZkJ6jFQ';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
