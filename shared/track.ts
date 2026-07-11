/**
 * Definição da pista (anel) — compartilhada.
 * Servidor usa p/ spawn grid e checkpoints; cliente p/ render e spawn.
 * Sentido da corrida: ângulo crescente (anti-horário visto de cima; tangente +Z em x=+raio).
 */

export const TRACK = {
  id: 'ring',
  name: 'Anel Solar',
  roadInner: 42,
  roadOuter: 58,
  wallInner: 40,
  wallOuter: 60,
  checkpoints: 8,
  totalLaps: 3,
} as const;

export interface SpawnSlot {
  x: number;
  z: number;
  /** yaw em rad — frente do carro (+Z local) alinhada à tangente */
  yaw: number;
}

const MID_R = (TRACK.roadInner + TRACK.roadOuter) / 2;

/** Grid de largada: pares alternados em duas colunas, atrás da linha (ângulo negativo). */
export function spawnSlot(index: number): SpawnSlot {
  const row = Math.floor(index / 2);
  const col = index % 2;
  const a = -0.09 - row * 0.075;
  const r = MID_R + (col === 0 ? -4 : 4);
  return { x: Math.cos(a) * r, z: Math.sin(a) * r, yaw: -a };
}

/** Setor angular (0..checkpoints-1) em que o ponto está. Cresce no sentido da corrida. */
export function checkpointAt(x: number, z: number): number {
  const a = (Math.atan2(z, x) + Math.PI * 2) % (Math.PI * 2);
  return Math.min(TRACK.checkpoints - 1, Math.floor(a / ((Math.PI * 2) / TRACK.checkpoints)));
}
