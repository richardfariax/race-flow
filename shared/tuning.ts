import type { CarSpec, CarPhysics } from './cars';

/**
 * Tuning de performance — cada nível muda a física DE VERDADE, com trade-offs.
 * Compartilhado: cliente aplica na simulação; servidor usa p/ validar
 * velocidade máxima e classe de matchmaking. Custos reais estão no SQL
 * (upgrade_car) — este arquivo espelha p/ UI.
 */

export type TuneCategory = 'motor' | 'turbo' | 'pneus' | 'suspensao' | 'peso' | 'cambio';

/** níveis 0..3 por categoria (jsonb owned_cars.tuning) */
export type Tuning = Partial<Record<TuneCategory, number>>;

export const TUNE_MAX_LEVEL = 3;

export const TUNE_INFO: Record<TuneCategory, { name: string; desc: string; baseCost: number }> = {
  motor: { name: 'Motor', desc: '+força e +vel. máxima', baseCost: 400 },
  turbo: { name: 'Turbo', desc: '+força e +vel. máxima (mais que o motor)', baseCost: 500 },
  pneus: { name: 'Pneus', desc: '+grip, porém drifta menos (trade-off)', baseCost: 300 },
  suspensao: { name: 'Suspensão', desc: 'mais firme nas curvas', baseCost: 250 },
  peso: { name: 'Peso', desc: '-massa: acelera e freia melhor', baseCost: 350 },
  cambio: { name: 'Câmbio curto', desc: '+aceleração, -vel. máxima (trade-off)', baseCost: 300 },
};

export const TUNE_CATEGORIES = Object.keys(TUNE_INFO) as TuneCategory[];

export function tuneLevel(tuning: Tuning | undefined, cat: TuneCategory): number {
  const v = tuning?.[cat] ?? 0;
  return Math.max(0, Math.min(TUNE_MAX_LEVEL, Math.floor(v)));
}

/** custo do PRÓXIMO nível (espelha o SQL — o preço autoritativo é o do banco) */
export function upgradeCost(cat: TuneCategory, currentLevel: number): number {
  return TUNE_INFO[cat].baseCost * (currentLevel + 1);
}

export interface EffectiveSpec {
  physics: CarPhysics;
  maxSpeedKmh: number;
}

/** Física efetiva = base do carro + tuning. Usada no cliente E no servidor. */
export function effectiveSpec(car: CarSpec, tuning: Tuning | undefined): EffectiveSpec {
  const lv = (c: TuneCategory) => tuneLevel(tuning, c);
  const p = car.physics;

  const forceMult =
    (1 + 0.1 * lv('motor')) * (1 + 0.06 * lv('turbo')) * (1 + 0.06 * lv('cambio'));
  const speedMult =
    (1 + 0.03 * lv('motor')) * (1 + 0.05 * lv('turbo')) * (1 - 0.02 * lv('cambio'));

  return {
    physics: {
      ...p,
      engineForce: p.engineForce * forceMult,
      reverseForce: p.reverseForce * (1 + 0.05 * lv('motor')),
      brakeForce: p.brakeForce * (1 + 0.04 * lv('pneus')),
      frictionSlip: p.frictionSlip + 0.8 * lv('pneus'),
      // pneus mais grudados drifta menos — decisão de design
      handbrakeSideFriction: Math.min(0.9, p.handbrakeSideFriction + 0.05 * lv('pneus')),
      suspensionStiffness: p.suspensionStiffness + 3 * lv('suspensao'),
      mass: p.mass * (1 - 0.05 * lv('peso')),
    },
    maxSpeedKmh: car.maxSpeedKmh * speedMult,
  };
}

// ---------- Performance Rating e classe (matchmaking) ----------

const BASE_PR: Record<CarSpec['cls'], number> = { C: 6, B: 12, A: 18 };

export function performanceRating(car: CarSpec, tuning: Tuning | undefined): number {
  return BASE_PR[car.cls] + TUNE_CATEGORIES.reduce((s, c) => s + tuneLevel(tuning, c), 0);
}

export type MatchClass = 'C' | 'B' | 'A' | 'S';

/** Um C todo tunado vira B/A; um A tunado vira S. Você compete na sua classe. */
export function matchClass(car: CarSpec, tuning: Tuning | undefined): MatchClass {
  const pr = performanceRating(car, tuning);
  if (pr < 12) return 'C';
  if (pr < 18) return 'B';
  if (pr < 24) return 'A';
  return 'S';
}
