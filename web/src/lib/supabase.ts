import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Cliente Supabase (anon key) — null quando não configurado (modo convidado). */
export const supabase: SupabaseClient | null = (() => {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return url && key ? createClient(url, key) : null;
})();
