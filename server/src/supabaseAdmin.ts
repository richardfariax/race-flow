import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente admin (service role) — ÚNICO caminho de escrita da economia.
 * Opcional: sem env vars, o servidor roda em modo volátil (convidados).
 * A chave vem só de variável de ambiente e nunca é logada.
 */

let admin: SupabaseClient | null = null;

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (url && key) {
  admin = createClient(url, key, { auth: { persistSession: false } });
  console.log('[supabase] persistência de economia ativada');
} else {
  console.log('[supabase] sem credenciais — rodando sem persistência (modo convidado)');
}

export function economyEnabled(): boolean {
  return admin !== null;
}

/** Valida o access token do jogador e retorna o id do perfil (ou null). */
export async function verifyToken(token: string): Promise<string | null> {
  if (!admin) return null;
  try {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

/** Grava resultado + credita moedas atomicamente (RPC SECURITY DEFINER). */
export async function applyRaceResult(params: {
  profileId: string;
  mode: string;
  track: string;
  metric: number;
  position: number;
  coins: number;
}): Promise<void> {
  if (!admin) return;
  const { error } = await admin.rpc('apply_race_result', {
    p_profile_id: params.profileId,
    p_mode: params.mode,
    p_track: params.track,
    p_metric: Math.round(params.metric),
    p_position: params.position,
    p_coins: params.coins,
  });
  if (error) {
    // não derruba a sala por falha de persistência; loga sem dados sensíveis
    console.error('[supabase] falha ao aplicar resultado:', error.message);
  }
}
