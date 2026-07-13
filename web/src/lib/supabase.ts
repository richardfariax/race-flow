import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Cliente Supabase (anon key) — null quando não configurado (modo convidado). */
export const supabase: SupabaseClient | null = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? createClient(url, key) : null;
})();
