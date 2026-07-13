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
import { ALL_CAR_IDS, STARTER_CAR_ID } from '@shared/cars';
import type { Tuning } from '@shared/tuning';
import { TUNE_CATEGORIES, TUNE_MAX_LEVEL, tuneLevel, upgradeCost } from '@shared/tuning';

/**
 * Conta (Supabase) + modo local/convidado.
 * Local: todos os carros liberados; seleção e tuning em localStorage.
 * Com Supabase: sync de perfil; carros seguem free (price 0) e posse local
 * garante escolha mesmo sem RPC.
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
  tunings: Record<string, Tuning>;
  nick: string;
  selectedCarId: string;
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

const LS_CAR = 'rf_selected_car';
const LS_TUNING = 'rf_tunings';

function makeGuestNick(): string {
  const saved = sessionStorage.getItem('rf_guest_nick');
  if (saved) return saved;
  const nick = `Convidado${Math.floor(Math.random() * 9000 + 1000)}`;
  sessionStorage.setItem('rf_guest_nick', nick);
  return nick;
}

function readLocalCar(): string {
  try {
    const id = localStorage.getItem(LS_CAR);
    if (id && ALL_CAR_IDS.includes(id)) return id;
  } catch {
    /* ignore */
  }
  return STARTER_CAR_ID;
}

function writeLocalCar(id: string): void {
  try {
    localStorage.setItem(LS_CAR, id);
  } catch {
    /* ignore */
  }
}

function readLocalTunings(): Record<string, Tuning> {
  try {
    const raw = localStorage.getItem(LS_TUNING);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, Tuning>;
  } catch {
    return {};
  }
}

function writeLocalTunings(t: Record<string, Tuning>): void {
  try {
    localStorage.setItem(LS_TUNING, JSON.stringify(t));
  } catch {
    /* ignore */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ownedCarIds, setOwnedCarIds] = useState<string[]>(ALL_CAR_IDS);
  const [tunings, setTunings] = useState<Record<string, Tuning>>(() => readLocalTunings());
  const [guestCarId, setGuestCarId] = useState(readLocalCar);
  const guestNick = useMemo(makeGuestNick, []);

  const refreshProfile = useCallback(async () => {
    if (!supabase) {
      setProfile(null);
      setOwnedCarIds(ALL_CAR_IDS);
      setTunings(readLocalTunings());
      return;
    }
    const { data: auth } = await supabase.auth.getSession();
    const uid = auth.session?.user.id;
    if (!uid) {
      setProfile(null);
      setOwnedCarIds(ALL_CAR_IDS);
      setTunings(readLocalTunings());
      return;
    }
    // migra posse dos carros free (ignorado se RPC não existir ainda)
    try {
      await supabase.rpc('ensure_owned_free_cars');
    } catch {
      /* ok em modo local / schema antigo */
    }
    const [{ data: prof }, { data: owned }] = await Promise.all([
      supabase.from('profiles').select('id, nick, coins, level, xp, selected_car').eq('id', uid).single(),
      supabase.from('owned_cars').select('car_id, tuning').eq('profile_id', uid),
    ]);
    if (prof) setProfile(prof as Profile);
    const fromDb = owned?.map((o) => o.car_id as string) ?? [];
    setOwnedCarIds([...new Set([...ALL_CAR_IDS, ...fromDb])]);
    const local = readLocalTunings();
    const remote: Record<string, Tuning> = {};
    if (owned) {
      for (const o of owned) {
        remote[o.car_id as string] = (o.tuning ?? {}) as Tuning;
      }
    }
    setTunings({ ...local, ...remote });
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
    setOwnedCarIds(ALL_CAR_IDS);
    setTunings(readLocalTunings());
  }, []);

  const buyCar = useCallback(async (_carId: string) => {
    return null;
  }, []);

  const upgradeCar = useCallback(
    async (carId: string, category: string) => {
      if (!TUNE_CATEGORIES.includes(category as (typeof TUNE_CATEGORIES)[number])) {
        return 'Categoria inválida.';
      }
      const cat = category as (typeof TUNE_CATEGORIES)[number];

      if (supabase && session) {
        const { error } = await supabase.rpc('upgrade_car', {
          p_car_id: carId,
          p_category: category,
        });
        if (!error) {
          await refreshProfile();
          return null;
        }
        // Sem moedas / carro no banco: cai no tuning local
      }

      const current = tunings[carId] ?? {};
      const lv = tuneLevel(current, cat);
      if (lv >= TUNE_MAX_LEVEL) return 'Já está no nível máximo.';
      // Local: sem custo de moedas (economia online fica no RPC)
      void upgradeCost(cat, lv);
      const next: Record<string, Tuning> = {
        ...tunings,
        [carId]: { ...current, [cat]: lv + 1 },
      };
      setTunings(next);
      writeLocalTunings(next);
      return null;
    },
    [session, tunings, refreshProfile],
  );

  const selectCar = useCallback(
    async (carId: string) => {
      if (!ALL_CAR_IDS.includes(carId)) return;
      writeLocalCar(carId);
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
    selectedCarId: (() => {
      const id = profile?.selected_car ?? guestCarId;
      return ALL_CAR_IDS.includes(id) ? id : STARTER_CAR_ID;
    })(),
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
