import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { STARTER_CAR_ID } from '@shared/cars';
import type { Tuning } from '@shared/tuning';

/**
 * Conta (Supabase) + convidado.
 * Convidado joga tudo, mas progresso NÃO persiste (banner avisa).
 * Saldo/posse vêm do banco; compra passa por RPC validada no servidor.
 */

export interface Profile {
  id: string;
  nick: string;
  coins: number;
  level: number;
  xp: number;
  selected_car: string;
}

interface AuthCtx {
  supabaseEnabled: boolean;
  session: Session | null;
  profile: Profile | null;
  ownedCarIds: string[];
  /** tuning por carId (só carros possuídos; convidado = vazio) */
  tunings: Record<string, Tuning>;
  /** nick efetivo (perfil ou convidado) */
  nick: string;
  selectedCarId: string;
  /** access token p/ o servidor de jogo creditar recompensas */
  token: string | undefined;
  isGuest: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string, nick: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  buyCar: (carId: string) => Promise<string | null>;
  upgradeCar: (carId: string, category: string) => Promise<string | null>;
  selectCar: (carId: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

function makeGuestNick(): string {
  const saved = sessionStorage.getItem('rf_guest_nick');
  if (saved) return saved;
  const nick = `Convidado${Math.floor(Math.random() * 9000 + 1000)}`;
  sessionStorage.setItem('rf_guest_nick', nick);
  return nick;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ownedCarIds, setOwnedCarIds] = useState<string[]>([STARTER_CAR_ID]);
  const [tunings, setTunings] = useState<Record<string, Tuning>>({});
  const [guestCarId, setGuestCarId] = useState(STARTER_CAR_ID);
  const guestNick = useMemo(makeGuestNick, []);

  const refreshProfile = useCallback(async () => {
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getSession();
    const uid = auth.session?.user.id;
    if (!uid) {
      setProfile(null);
      setOwnedCarIds([STARTER_CAR_ID]);
      setTunings({});
      return;
    }
    const [{ data: prof }, { data: owned }] = await Promise.all([
      supabase.from('profiles').select('id, nick, coins, level, xp, selected_car').eq('id', uid).single(),
      supabase.from('owned_cars').select('car_id, tuning').eq('profile_id', uid),
    ]);
    if (prof) setProfile(prof as Profile);
    if (owned) {
      setOwnedCarIds(owned.map((o) => o.car_id as string));
      setTunings(
        Object.fromEntries(owned.map((o) => [o.car_id as string, (o.tuning ?? {}) as Tuning])),
      );
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    void refreshProfile();
  }, [session, refreshProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return 'Supabase não configurado — jogue como convidado.';
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  }, []);

  const signUp = useCallback(async (email: string, password: string, nick: string) => {
    if (!supabase) return 'Supabase não configurado — jogue como convidado.';
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nick: nick.slice(0, 16) } },
    });
    return error ? error.message : null;
  }, []);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
    setProfile(null);
    setOwnedCarIds([STARTER_CAR_ID]);
  }, []);

  const buyCar = useCallback(
    async (carId: string) => {
      if (!supabase || !session) return 'Crie uma conta para comprar carros.';
      const { error } = await supabase.rpc('buy_car', { p_car_id: carId });
      if (error) return error.message;
      await refreshProfile();
      return null;
    },
    [session, refreshProfile],
  );

  const upgradeCar = useCallback(
    async (carId: string, category: string) => {
      if (!supabase || !session) return 'Crie uma conta para tunar carros.';
      const { error } = await supabase.rpc('upgrade_car', {
        p_car_id: carId,
        p_category: category,
      });
      if (error) return error.message;
      await refreshProfile();
      return null;
    },
    [session, refreshProfile],
  );

  const selectCar = useCallback(
    async (carId: string) => {
      if (supabase && session) {
        await supabase.from('profiles').update({ selected_car: carId }).eq('id', session.user.id);
        await refreshProfile();
      } else {
        setGuestCarId(carId);
      }
    },
    [session, refreshProfile],
  );

  const value: AuthCtx = {
    supabaseEnabled: supabase !== null,
    session,
    profile,
    ownedCarIds,
    tunings,
    nick: profile?.nick ?? guestNick,
    selectedCarId: profile?.selected_car ?? guestCarId,
    token: session?.access_token,
    isGuest: !session,
    signIn,
    signUp,
    signOut,
    buyCar,
    upgradeCar,
    selectCar,
    refreshProfile,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth fora do AuthProvider');
  return ctx;
}
