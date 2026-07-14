/**
 * Pista "Nürburgring GP" — centerline real extraída do modelo GLB do circuito
 * (ver nurburgringData.ts). Compartilhada: o cliente usa para assistências de
 * física (normal do asfalto, grip on/off-road, fumaça) e minimapa; o servidor
 * usa a MESMA amostragem para progresso/checkpoints/spawn.
 *
 * Largura é variável ao longo da volta (halfWidth por sample, medida no
 * asfalto do modelo). A colisão física real vem do trimesh do GLB no cliente;
 * aqui é só a referência analítica.
 *
 * Sentido da corrida: ordem dos samples (sample 0 = linha de largada, reta
 * principal no sentido da Castrol-S/arena). Observação: em dois pontos a via
 * de retorno cruza/passa perto de outro trecho; o mapeamento por ponto mais
 * próximo pode dar um blip momentâneo de progresso ali — checkpoints são
 * sequenciais no servidor, então blips fora de ordem são ignorados.
 */

import { RAW_SAMPLES } from './nurburgringData';

export { MODEL_SCALE } from './nurburgringData';

export interface TrackSample {
  x: number;
  z: number;
  /** altura do asfalto (relevo) */
  y: number;
  /** direção horizontal da pista (unitária no plano XZ) */
  dirX: number;
  dirZ: number;
  /** distância 3D acumulada desde a largada */
  s: number;
  /** meia-largura do asfalto neste ponto (m) */
  halfWidth: number;
}

/** altura de nascimento acima do asfalto (folga da suspensão) */
const RIDE_HEIGHT = 1.2;

function buildSamples(): TrackSample[] {
  const m = RAW_SAMPLES.length;
  const pts: TrackSample[] = new Array(m);
  for (let i = 0; i < m; i++) {
    const [x, y, z, hw] = RAW_SAMPLES[i];
    pts[i] = { x, y, z, halfWidth: hw, dirX: 0, dirZ: 0, s: 0 };
  }
  let s = 0;
  for (let i = 1; i < m; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    s += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    b.s = s;
  }
  for (let i = 0; i < m; i++) {
    const a = pts[(i - 1 + m) % m];
    const b = pts[(i + 1) % m];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    pts[i].dirX = dx / len;
    pts[i].dirZ = dz / len;
  }
  return pts;
}

export const SAMPLES: TrackSample[] = buildSamples();
const LAST = SAMPLES[SAMPLES.length - 1];
const TOTAL_LENGTH =
  LAST.s +
  Math.hypot(SAMPLES[0].x - LAST.x, SAMPLES[0].y - LAST.y, SAMPLES[0].z - LAST.z);

export const TRACK = {
  id: 'nurburgring-gp',
  name: 'Nürburgring GP',
  /** largura nominal (referência p/ UI; a real varia por sample) */
  width: 13,
  checkpoints: 20,
  /** volta ~5,1 km — 2 voltas cabem no teto de tempo de corrida (NET.maxRaceMs) */
  totalLaps: 2,
  length: TOTAL_LENGTH,
} as const;

export interface TrackProgress {
  s: number;
  lateral: number;
}

export function nearestSampleIndex(x: number, z: number): number {
  let best = 0;
  let bestD2 = Infinity;
  for (let i = 0; i < SAMPLES.length; i++) {
    const dx = x - SAMPLES[i].x;
    const dz = z - SAMPLES[i].z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  return best;
}

export function progressAt(x: number, z: number): TrackProgress {
  const best = nearestSampleIndex(x, z);
  const p = SAMPLES[best];
  const dx = x - p.x;
  const dz = z - p.z;
  return { s: p.s, lateral: Math.hypot(dx, dz) };
}

export function heightAt(x: number, z: number): number {
  return SAMPLES[nearestSampleIndex(x, z)].y;
}

export interface TrackSurface {
  y: number;
  nx: number;
  ny: number;
  nz: number;
}

/**
 * Altura + normal do asfalto — assistência de estabilidade alinhada ao relevo
 * (não ao eixo Y do mundo).
 */
export function surfaceAt(x: number, z: number): TrackSurface {
  const i = nearestSampleIndex(x, z);
  const n = SAMPLES.length;
  const p = SAMPLES[i];
  const a = SAMPLES[(i - 1 + n) % n];
  const b = SAMPLES[(i + 1) % n];
  let tx = b.x - a.x;
  let ty = b.y - a.y;
  let tz = b.z - a.z;
  const tLen = Math.hypot(tx, ty, tz) || 1;
  tx /= tLen;
  ty /= tLen;
  tz /= tLen;
  // lateral horizontal (esquerda da direção); N = L × T aponta pra cima
  const lx = -p.dirZ;
  const lz = p.dirX;
  let nx = -lz * ty;
  let ny = lz * tx - lx * tz;
  let nz = lx * ty;
  const nLen = Math.hypot(nx, ny, nz) || 1;
  // garante componente Y positiva (piso, não teto)
  if (ny < 0) {
    nx = -nx;
    ny = -ny;
    nz = -nz;
  }
  return {
    y: p.y,
    nx: nx / nLen,
    ny: ny / nLen,
    nz: nz / nLen,
  };
}

/**
 * Setor de checkpoint (0..N-1) pelo progresso na pista, ou -1 se longe demais
 * da pista (não dá pra marcar checkpoint cortando por fora).
 */
export function checkpointAt(x: number, z: number): number {
  const i = nearestSampleIndex(x, z);
  const p = SAMPLES[i];
  const lateral = Math.hypot(x - p.x, z - p.z);
  if (lateral > p.halfWidth + 6) return -1;
  return Math.min(TRACK.checkpoints - 1, Math.floor((p.s / TRACK.length) * TRACK.checkpoints));
}

export function isOnRoad(x: number, z: number): boolean {
  // asfalto + zebras (escape conta como off-road p/ grip)
  const i = nearestSampleIndex(x, z);
  const p = SAMPLES[i];
  return Math.hypot(x - p.x, z - p.z) <= p.halfWidth + 0.7;
}

/** Dentro da faixa dirigível (asfalto + zebra + escape imediato). */
export function isOnDriveable(x: number, z: number): boolean {
  const i = nearestSampleIndex(x, z);
  const p = SAMPLES[i];
  return Math.hypot(x - p.x, z - p.z) <= p.halfWidth + 3.5;
}

export interface SpawnSlot {
  x: number;
  y: number;
  z: number;
  /** yaw em rad — frente do carro (+Z local) alinhada à pista */
  yaw: number;
}

function sampleAtS(target: number): TrackSample {
  const t = ((target % TRACK.length) + TRACK.length) % TRACK.length;
  // busca linear (chamada raramente — spawn)
  let best = SAMPLES[0];
  let bestDiff = Infinity;
  for (const p of SAMPLES) {
    const diff = Math.abs(p.s - t);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = p;
    }
  }
  return best;
}

/** Grid de largada: pares alternados, atrás da linha (s decrescente). */
export function spawnSlot(index: number): SpawnSlot {
  const row = Math.floor(index / 2);
  const col = index % 2;
  const p = sampleAtS(TRACK.length - 10 - row * 7.5);
  // normal à esquerda da direção (plano XZ)
  const nx = -p.dirZ;
  const nz = p.dirX;
  const off = col === 0 ? -2.8 : 2.8;
  return {
    x: p.x + nx * off,
    y: p.y + RIDE_HEIGHT,
    z: p.z + nz * off,
    yaw: Math.atan2(p.dirX, p.dirZ),
  };
}
