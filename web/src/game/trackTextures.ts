import * as THREE from 'three';

/**
 * Texturas procedurais da pista e da floresta (canvas → CanvasTexture).
 * Inclui mapas de cor + normal derivados de altura para relevo PBR.
 */

function canvas(size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

function noise(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function fbm(x: number, y: number): number {
  return (
    noise(x, y) * 0.5 +
    noise(x * 2.1, y * 2.1) * 0.25 +
    noise(x * 4.3, y * 4.2) * 0.15 +
    noise(x * 8.1, y * 7.9) * 0.1
  );
}

function finishTex(c: HTMLCanvasElement, aniso = 8): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = aniso;
  tex.needsUpdate = true;
  return tex;
}

function finishLinearTex(c: HTMLCanvasElement, aniso = 4): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = aniso;
  tex.needsUpdate = true;
  return tex;
}

/** Normal map a partir de um heightmap 0..1 (mesmo tamanho). */
function heightToNormal(heights: Float32Array, size: number, strength = 2.5): THREE.CanvasTexture {
  const c = canvas(size);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = heights[y * size + ((x - 1 + size) % size)];
      const r = heights[y * size + ((x + 1) % size)];
      const d = heights[((y - 1 + size) % size) * size + x];
      const u = heights[((y + 1) % size) * size + x];
      const nx = (l - r) * strength;
      const ny = (d - u) * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      const i = (y * size + x) * 4;
      img.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finishLinearTex(c, 8);
}

function makeAsphalt(): { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } {
  const size = 512;
  const c = canvas(size);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm(x * 0.04, y * 0.04);
      const grit = noise(x * 0.55, y * 0.52);
      const base = 48 + n * 42;
      const stone = grit > 0.88 ? 22 : grit < 0.12 ? -14 : 0;
      const groove =
        Math.sin(x * 0.11) * 3.5 +
        Math.sin(x * 0.37 + y * 0.015) * 2.5 +
        Math.sin(y * 0.02) * 1.5;
      const wear = noise(x * 0.02, y * 0.08) * 8;
      const v = Math.max(30, Math.min(110, base + stone + groove + wear));
      heights[y * size + x] = v / 255;
      const i = (y * size + x) * 4;
      img.data[i] = v;
      img.data[i + 1] = v + 1;
      img.data[i + 2] = v + 3;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = 'rgba(18,20,26,0.4)';
  ctx.lineWidth = 2;
  for (let k = 1; k < 5; k++) {
    const p = (k / 5) * size + Math.sin(k * 2) * 3;
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }
  return { map: finishTex(c, 8), normal: heightToNormal(heights, size, 3.2) };
}

function makeGrass(): { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } {
  const size = 512;
  const c = canvas(size);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm(x * 0.035, y * 0.035);
      const n2 = fbm(x * 0.12 + 40, y * 0.11 + 20);
      const blade = noise(x * 1.4, y * 0.28);
      const blade2 = noise(x * 0.7 + 3, y * 1.1);
      const patch = fbm(x * 0.012, y * 0.012);
      const moss = fbm(x * 0.08 + 100, y * 0.08);

      let r = 38 + n * 35 + n2 * 18;
      let g = 95 + n * 85 + n2 * 40 + (blade > 0.55 ? 28 : 0) + (blade2 > 0.7 ? 14 : 0);
      let b = 28 + n * 25;

      if (patch > 0.62) {
        r += 45;
        g += 22;
        b -= 8;
      } else if (patch < 0.28) {
        r *= 0.55;
        g *= 0.72;
        b *= 0.55;
      }

      if (moss > 0.7) {
        r *= 0.85;
        g = Math.min(255, g * 1.05);
        b *= 0.8;
      }

      const stripe = Math.sin(x * 2.8 + noise(y * 0.15, x * 0.1) * 4) * 0.5 + 0.5;
      if (stripe > 0.82) g = Math.min(255, g + 22);

      heights[y * size + x] = (n * 0.45 + blade * 0.25 + patch * 0.3) * (0.7 + stripe * 0.3);
      const i = (y * size + x) * 4;
      img.data[i] = Math.min(255, r);
      img.data[i + 1] = Math.min(255, g);
      img.data[i + 2] = Math.min(255, b);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { map: finishTex(c, 8), normal: heightToNormal(heights, size, 4.5) };
}

function makeGravel(): { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } {
  const size = 512;
  const c = canvas(size);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm(x * 0.08, y * 0.08);
      const pebble = noise(x * 0.4, y * 0.38);
      const pebble2 = noise(x * 0.9 + 7, y * 0.85);
      const base = 125 + n * 55;
      const speck = pebble > 0.78 ? 45 : pebble < 0.18 ? -35 : 0;
      const stone = pebble2 > 0.92 ? 30 : pebble2 < 0.08 ? -20 : 0;
      const v = Math.max(70, Math.min(220, base + speck + stone));
      heights[y * size + x] = (v / 255) * (0.6 + pebble * 0.4);
      const i = (y * size + x) * 4;
      img.data[i] = v;
      img.data[i + 1] = v * 0.82;
      img.data[i + 2] = v * 0.55;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { map: finishTex(c, 6), normal: heightToNormal(heights, size, 5.5) };
}

function makeConcrete(): { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } {
  const size = 512;
  const c = canvas(size);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm(x * 0.05, y * 0.05);
      const grit = noise(x * 0.35, y * 0.33);
      const panelY = ((y % 64) / 64);
      const panelX = ((x % 128) / 128);
      const jointH = panelY < 0.04 || panelY > 0.96 ? -38 : 0;
      const jointV = panelX < 0.02 || panelX > 0.98 ? -28 : 0;
      const damp = panelY < 0.25 ? -12 * (1 - panelY / 0.25) : 0;
      const crack = noise(x * 0.15, y * 0.15) > 0.94 ? -40 : 0;
      const pore = grit > 0.9 ? 18 : grit < 0.1 ? -10 : 0;
      const v = Math.max(90, Math.min(200, 148 + n * 38 + jointH + jointV + damp + crack + pore));
      heights[y * size + x] =
        (v / 255) * 0.7 + (jointH !== 0 || jointV !== 0 ? 0 : 0.15) + grit * 0.1;
      const i = (y * size + x) * 4;
      img.data[i] = v;
      img.data[i + 1] = v - 2;
      img.data[i + 2] = v - 8;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.fillStyle = 'rgba(60,62,68,0.55)';
  for (let py = 0; py < size; py += 64) {
    for (let px = 16; px < size; px += 128) {
      ctx.beginPath();
      ctx.arc(px, py + 8, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px + 96, py + 8, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return { map: finishTex(c, 6), normal: heightToNormal(heights, size, 4.8) };
}

function makeBark(): { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } {
  const size = 256;
  const c = canvas(size);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const ridge = Math.sin(x * 0.4 + noise(y * 0.06, x * 0.02) * 3) * 22;
      const ridge2 = Math.sin(x * 0.9 + y * 0.02) * 8;
      const n = fbm(x * 0.14, y * 0.05);
      const knot = noise(x * 0.08, y * 0.08);
      const v = 68 + n * 50 + ridge + ridge2 + (knot > 0.85 ? -20 : 0);
      heights[y * size + x] = Math.max(0, Math.min(1, (v + 20) / 180));
      const i = (y * size + x) * 4;
      img.data[i] = Math.max(40, Math.min(160, v + 12));
      img.data[i + 1] = Math.max(30, Math.min(120, v * 0.7));
      img.data[i + 2] = Math.max(20, Math.min(90, v * 0.4));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { map: finishTex(c, 4), normal: heightToNormal(heights, size, 6) };
}

/**
 * Folhagem em card com alpha: manchas de folhas + borda irregular
 * (para planes cruzados — silhueta de árvore de verdade, não cone sólido).
 */
function makeLeafCard(
  baseR: number,
  baseG: number,
  baseB: number,
  style: 'pine' | 'oak',
): { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } {
  const size = 256;
  const c = canvas(size);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const heights = new Float32Array(size * size);
  const cx = size * 0.5;
  const cy = size * 0.52;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x - cx) / (size * 0.48);
      const ny = (y - cy) / (size * 0.48);
      const ang = Math.atan2(ny, nx);
      const rad = Math.hypot(nx, ny);
      // silhueta: pinheiro mais triangular; folhosa mais redonda/lobada
      const edge =
        style === 'pine'
          ? 0.55 + 0.35 * (1 - (ny + 1) * 0.5) + Math.sin(ang * 5) * 0.06
          : 0.72 + Math.sin(ang * 3.2) * 0.12 + Math.sin(ang * 7) * 0.05;
      const n = fbm(x * 0.08, y * 0.08);
      const speck = noise(x * 0.55, y * 0.5);
      const cluster = fbm(x * 0.035 + 9, y * 0.03);
      const hole = style === 'oak' && cluster > 0.78 && speck > 0.55;
      const inside = rad < edge * (0.88 + n * 0.18) && !hole;
      const i = (y * size + x) * 4;
      if (!inside) {
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 0;
        img.data[i + 3] = 0;
        heights[y * size + x] = 0;
        continue;
      }
      const shade =
        0.55 + n * 0.5 + (speck > 0.7 ? 0.18 : 0) + (cluster > 0.55 ? 0.1 : -0.06);
      heights[y * size + x] = 0.35 + n * 0.45 + speck * 0.2;
      img.data[i] = Math.min(255, baseR * shade);
      img.data[i + 1] = Math.min(255, baseG * shade);
      img.data[i + 2] = Math.min(255, baseB * shade);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const map = finishTex(c, 4);
  map.premultiplyAlpha = false;
  return { map, normal: heightToNormal(heights, size, 3.2) };
}

let asphalt: { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } | null = null;
let grass: { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } | null = null;
let gravel: { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } | null = null;
let concrete: { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } | null = null;
let bark: { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } | null = null;
let pineLeaf: { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } | null = null;
let oakLeaf: { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } | null = null;

function asphaltPair() {
  return (asphalt ??= makeAsphalt());
}
function grassPair() {
  return (grass ??= makeGrass());
}
function gravelPair() {
  return (gravel ??= makeGravel());
}
function concretePair() {
  return (concrete ??= makeConcrete());
}
function barkPair() {
  return (bark ??= makeBark());
}
function pineLeafPair() {
  return (pineLeaf ??= makeLeafCard(48, 110, 42, 'pine'));
}
function oakLeafPair() {
  return (oakLeaf ??= makeLeafCard(62, 128, 40, 'oak'));
}

export function asphaltMap(): THREE.CanvasTexture {
  return asphaltPair().map;
}
export function grassMap(): THREE.CanvasTexture {
  return grassPair().map;
}
export function gravelMap(): THREE.CanvasTexture {
  return gravelPair().map;
}
export function concreteMap(): THREE.CanvasTexture {
  return concretePair().map;
}
export function barkMap(): THREE.CanvasTexture {
  return barkPair().map;
}
export function pineLeafMap(): THREE.CanvasTexture {
  return pineLeafPair().map;
}
export function oakLeafMap(): THREE.CanvasTexture {
  return oakLeafPair().map;
}

function clonePair(pair: { map: THREE.CanvasTexture; normal: THREE.CanvasTexture }) {
  const map = pair.map.clone();
  const normalMap = pair.normal.clone();
  map.needsUpdate = true;
  normalMap.needsUpdate = true;
  return { map, normalMap };
}

export function asphaltMaterial(): THREE.MeshStandardMaterial {
  const { map, normalMap } = clonePair(asphaltPair());
  map.repeat.set(1, 1);
  normalMap.repeat.set(1, 1);
  return new THREE.MeshStandardMaterial({
    map,
    normalMap,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.9,
    metalness: 0.02,
    color: '#6a6d74',
    envMapIntensity: 0.42,
  });
}

export function grassMaterial(): THREE.MeshStandardMaterial {
  const { map, normalMap } = clonePair(grassPair());
  // tile ~12 m — manchas de grama legíveis de longe
  map.repeat.set(48, 48);
  normalMap.repeat.set(48, 48);
  return new THREE.MeshStandardMaterial({
    map,
    normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: 0.95,
    metalness: 0,
    color: '#6e9a48',
    envMapIntensity: 0.2,
  });
}

export function gravelMaterial(): THREE.MeshStandardMaterial {
  const { map, normalMap } = clonePair(gravelPair());
  map.repeat.set(1, 1);
  normalMap.repeat.set(1, 1);
  return new THREE.MeshStandardMaterial({
    map,
    normalMap,
    normalScale: new THREE.Vector2(1.1, 1.1),
    roughness: 0.97,
    metalness: 0,
    color: '#c4a06a',
    envMapIntensity: 0.18,
  });
}

export function concreteMaterial(): THREE.MeshStandardMaterial {
  const { map, normalMap } = clonePair(concretePair());
  // U ao longo da espessura, V ao longo da pista — painéis visíveis
  map.repeat.set(1, 6);
  normalMap.repeat.set(1, 6);
  return new THREE.MeshStandardMaterial({
    map,
    normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 0.78,
    metalness: 0.08,
    color: '#b0b5bc',
    envMapIntensity: 0.45,
  });
}

export function barkMaterial(): THREE.MeshStandardMaterial {
  const { map, normalMap } = clonePair(barkPair());
  map.repeat.set(1, 2);
  normalMap.repeat.set(1, 2);
  return new THREE.MeshStandardMaterial({
    map,
    normalMap,
    normalScale: new THREE.Vector2(1.2, 1.2),
    roughness: 0.95,
    metalness: 0,
    color: '#9a7a55',
    envMapIntensity: 0.08,
  });
}

/** alphaTest — evita sorting pesado de transparent */
function foliageCardMaterial(
  pair: { map: THREE.CanvasTexture; normal: THREE.CanvasTexture },
  color: string,
): THREE.MeshStandardMaterial {
  const { map, normalMap } = clonePair(pair);
  map.repeat.set(1, 1);
  normalMap.repeat.set(1, 1);
  return new THREE.MeshStandardMaterial({
    map,
    normalMap,
    normalScale: new THREE.Vector2(0.55, 0.55),
    color,
    roughness: 0.9,
    metalness: 0,
    envMapIntensity: 0.2,
    alphaTest: 0.35,
    transparent: false,
    side: THREE.DoubleSide,
    depthWrite: true,
  });
}

export function pineFoliageMaterial(): THREE.MeshStandardMaterial {
  return foliageCardMaterial(pineLeafPair(), '#4a7a38');
}

export function oakFoliageMaterial(): THREE.MeshStandardMaterial {
  return foliageCardMaterial(oakLeafPair(), '#558540');
}

export function pineFoliageSolidMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: '#4a7a38',
    roughness: 0.88,
    metalness: 0,
    flatShading: true,
    envMapIntensity: 0.22,
  });
}

export function oakFoliageSolidMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: '#558540',
    roughness: 0.9,
    metalness: 0,
    flatShading: true,
    envMapIntensity: 0.2,
  });
}

export function bushSolidMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: '#4a7532',
    roughness: 0.92,
    metalness: 0,
    flatShading: true,
    envMapIntensity: 0.15,
  });
}

/** vertex colors + luz real (não toon) */
export function vertexColorStandard(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.72,
    metalness: 0.05,
    envMapIntensity: 0.3,
  });
}
