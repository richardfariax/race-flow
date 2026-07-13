import { carOrStarter } from '@shared/cars';

/**
 * Livery (cosmético): cores de pintura por carro, salvas localmente. Não afeta
 * performance e o servidor revalida o hex — aqui é só preferência do jogador.
 * (Persistência local evita mudança de schema; migrar p/ o perfil é trivial
 * depois, se quiser sincronizar entre dispositivos.)
 */

export interface Livery {
  body: string;
  accent: string;
}

const KEY = 'rf_livery_v1';
const HEX = /^#[0-9a-fA-F]{6}$/;

function readAll(): Record<string, Livery> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, Livery>) : {};
  } catch {
    return {};
  }
}

/** Livery do carro, com fallback nas cores de fábrica. */
export function getLivery(carId: string): Livery {
  const car = carOrStarter(carId);
  const saved = readAll()[carId];
  const body = saved && HEX.test(saved.body) ? saved.body : car.colors.body;
  const accent = saved && HEX.test(saved.accent) ? saved.accent : car.colors.accent;
  return { body, accent };
}

export function setLivery(carId: string, livery: Livery): void {
  if (!HEX.test(livery.body) || !HEX.test(livery.accent)) return;
  try {
    const all = readAll();
    all[carId] = livery;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage cheio — cosmético é opcional */
  }
}
