/**
 * Pista "Eifelblick" — traçado inspirado no Nürburgring, com relevo.
 * Centerline = Catmull-Rom fechada por waypoints explícitos (reta de largada,
 * sweepers rápidos à direita, esse no alto e hairpin/curvão à esquerda).
 * Relevo procedural: y(u) periódico ao longo da volta (subidas/descidas suaves,
 * baseline 0 → nunca abaixo do gramado). Compartilhada: cliente gera a geometria,
 * servidor calcula progresso/checkpoints pela mesma amostragem.
 *
 * O traçado é validado offline (sem auto-interseção; separação mínima entre
 * trechos não-adjacentes ~26 m > confinamento pelos muros ±8.4 m → o mapeamento
 * de progresso pelo ponto mais próximo é não-ambíguo). Raio mínimo ~16.7 m.
 * Sentido da corrida: ordem dos waypoints.
 */

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
}

// Waypoints (x,z) na ORDEM da corrida. Loop simples (star-shaped desnecessário):
// a validação garante ausência de auto-interseção e separação suficiente.
const WAYPOINTS: [number, number][] = [
  [-150, -95], // largada (reta de baixo)
  [-70, -102],
  [20, -104],
  [110, -95],
  [165, -55], // entrada do sweeper direito
  [178, 0],
  [165, 55],
  [110, 95], // alto: esse
  [40, 88],
  [-30, 100],
  [-100, 92],
  [-165, 55], // curvão/hairpin esquerdo
  [-182, 0],
  [-165, -55],
];

const SAMPLES_PER_SEG = 44;
/** altura máxima do relevo (m) acima da baseline 0 */
const ELEV_HEIGHT = 15;
/** altura de nascimento acima do asfalto (folga da suspensão) */
const RIDE_HEIGHT = 1.2;

function cp(i: number): [number, number] {
  const n = WAYPOINTS.length;
  return WAYPOINTS[((i % n) + n) % n];
}

/** Catmull-Rom uniforme fechada. */
function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (p2 - p0) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (3 * p1 - p0 - 3 * p2 + p3) * t3)
  );
}

/**
 * Relevo bruto em função da fração da volta u∈[0,1). Somatório de harmônicas
 * inteiras → exatamente periódico (y contínuo no fechamento do loop).
 */
function elevRaw(u: number): number {
  const a = u * Math.PI * 2;
  return (
    1.0 * Math.sin(a + 0.4) + // colina principal
    0.55 * Math.sin(2 * a + 1.1) + // ondulação média
    0.35 * Math.sin(3 * a + 2.3) // detalhe curto
  );
}

function buildSamples(): TrackSample[] {
  const n = WAYPOINTS.length;
  const xs: number[] = [];
  const zs: number[] = [];
  for (let seg = 0; seg < n; seg++) {
    const [x0, z0] = cp(seg - 1);
    const [x1, z1] = cp(seg);
    const [x2, z2] = cp(seg + 1);
    const [x3, z3] = cp(seg + 2);
    for (let k = 0; k < SAMPLES_PER_SEG; k++) {
      const t = k / SAMPLES_PER_SEG;
      xs.push(catmull(x0, x1, x2, x3, t));
      zs.push(catmull(z0, z1, z2, z3, t));
    }
  }
  const m = xs.length;

  const hcum = new Array<number>(m);
  hcum[0] = 0;
  for (let i = 1; i < m; i++) {
    hcum[i] = hcum[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
  }
  const hTotal =
    hcum[m - 1] + Math.hypot(xs[0] - xs[m - 1], zs[0] - zs[m - 1]);

  let rawMin = Infinity;
  let rawMax = -Infinity;
  const raw = new Array<number>(m);
  for (let i = 0; i < m; i++) {
    const r = elevRaw(hcum[i] / hTotal);
    raw[i] = r;
    if (r < rawMin) rawMin = r;
    if (r > rawMax) rawMax = r;
  }
  const span = rawMax - rawMin || 1;

  const pts: TrackSample[] = new Array(m);
  for (let i = 0; i < m; i++) {
    pts[i] = {
      x: xs[i],
      z: zs[i],
      y: ((raw[i] - rawMin) / span) * ELEV_HEIGHT,
      dirX: 0,
      dirZ: 0,
      s: 0,
    };
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
  id: 'eifelblick',
  name: 'Eifelblick',
  width: 15,
  checkpoints: 20,
  totalLaps: 3,
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
 * da pista (não dá pra marcar checkpoint cortando pelo gramado).
 */
export function checkpointAt(x: number, z: number): number {
  const { s, lateral } = progressAt(x, z);
  if (lateral > TRACK.width / 2 + 6) return -1;
  return Math.min(TRACK.checkpoints - 1, Math.floor((s / TRACK.length) * TRACK.checkpoints));
}

export function isOnRoad(x: number, z: number): boolean {
  // asfalto + zebras (escape de cascalho conta como off-road p/ grip)
  return progressAt(x, z).lateral <= TRACK.width / 2 + 0.7;
}

/** Dentro da faixa dirigível (asfalto + zebra + escape), onde há colisão de relevo. */
export function isOnDriveable(x: number, z: number): boolean {
  return progressAt(x, z).lateral <= TRACK.width / 2 + 3.5;
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
  const off = col === 0 ? -3.2 : 3.2;
  return {
    x: p.x + nx * off,
    y: p.y + RIDE_HEIGHT,
    z: p.z + nz * off,
    yaw: Math.atan2(p.dirX, p.dirZ),
  };
}
