/**
 * Pipeline offline: fonte Sketchfab (nurburgring_gp_2016_layout_4k.glb) -> asset
 * de jogo web/public/models/nurburgring_gp.glb.
 *
 * Resolve os problemas reportados:
 *  1. Superfícies transparentes/invisíveis: o export do Sketchfab marca 22
 *     materiais como alphaMode=BLEND por engano. BLEND causa depth-sort e o
 *     sumiço de objetos por ângulo. Reclassificamos por análise do canal alpha:
 *        - sem alpha real            -> OPAQUE (asfalto, muros, terreno, arquib.)
 *        - cutout (folha/cerca)      -> MASK  (alphaCutoff, doubleSided, sem sort)
 *        - translúcido de verdade    -> BLEND (só vidro / rede de proteção)
 *     baseColorFactor.a é resetado p/ 1 onde era 0 espúrio (deixava a malha
 *     invisível mesmo com textura opaca).
 *  2. Baixa qualidade: usa a fonte 4k. Superfícies "herói" que o carro pisa
 *     (asfalto/concreto: OPAQUE, muitos triângulos, cinza dessaturado) ficam em
 *     2048; o resto (cenário, folhagem, vidro) em 1024. WebP q90 e Draco
 *     pos16/uv16/normal12 (menos degrau de geometria que o padrão 14/12).
 *     Isso mantém o GPU de textura moderado (~200 MB) sem exagerar.
 *
 * NÃO editar o .glb à mão — reexecutar este script.
 *   node scripts/build-track-glb.mjs <fonte_4k.glb> <destino.glb>
 * Defaults apontam para web/public/models/nurburgring_gp.glb.
 * Deps offline (não são deps do app): npm i @gltf-transform/core
 *   @gltf-transform/extensions @gltf-transform/functions sharp draco3dgltf
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import {
  KHRTextureTransform,
  KHRMaterialsSpecular,
  KHRDracoMeshCompression,
  EXTTextureWebP,
} from '@gltf-transform/extensions';
import { dedup, prune, weld } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';

/**
 * Grama procedural seamless. A grama do modelo (Object6921) repete ~46x139 na
 * malha, então a foto original mostrava uma grade óbvia de tiles ("bugada").
 * Esta é uniforme em baixa freq. (não vira grade ao repetir) e detalhada em
 * alta freq. (lâminas de perto). 1024 basta pois cada tile é minúsculo na tela.
 */
async function makeGrassWebp(N = 1024) {
  const mkNoise = (P, seed) => {
    const g = new Float32Array(P * P);
    let s = seed >>> 0;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < P * P; i++) g[i] = rnd();
    const lerp = (a, b, t) => a + (b - a) * t, sm = (t) => t * t * (3 - 2 * t);
    return (x, y) => {
      x *= P; y *= P;
      const x0 = ((Math.floor(x) % P) + P) % P, y0 = ((Math.floor(y) % P) + P) % P;
      const x1 = (x0 + 1) % P, y1 = (y0 + 1) % P;
      const fx = sm(x - Math.floor(x)), fy = sm(y - Math.floor(y));
      const a = g[y0*P+x0], b = g[y0*P+x1], c = g[y1*P+x0], d = g[y1*P+x1];
      return lerp(lerp(a,b,fx), lerp(c,d,fx), fy);
    };
  };
  const blade1 = mkNoise(128, 11), blade2 = mkNoise(256, 29), speck = mkNoise(512, 53);
  const tuftV = mkNoise(64, 71), tuftH = mkNoise(96, 91);
  const dark = [40,58,26], base = [66,92,40], light = [104,134,62], pale = [124,150,84];
  const mix = (a, b, t) => [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t];
  const buf = Buffer.alloc(N * N * 3);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N;
    const bl = blade1(u*1, v*7)*0.5 + blade2(u*7, v*1)*0.5;
    const tuft = (tuftV(u*2, v*2) + tuftH(u*2, v*2)) * 0.5;
    let c = mix(dark, base, 0.55 + (tuft - 0.5) * 0.5);
    c = mix(c, light, Math.max(0, bl - 0.5) * 1.6);
    c = mix(c, pale, Math.max(0, speck(u*8, v*8) - 0.72) * 1.2);
    c = mix(c, dark, Math.max(0, 0.42 - bl) * 0.7);
    const grain = (speck(u*4, v*4) - 0.5) * 14;
    const o = (y*N + x) * 3;
    buf[o]   = Math.max(0, Math.min(255, c[0] + grain));
    buf[o+1] = Math.max(0, Math.min(255, c[1] + grain));
    buf[o+2] = Math.max(0, Math.min(255, c[2] + grain*0.5));
  }
  return new Uint8Array(await sharp(buf, { raw: { width: N, height: N, channels: 3 } }).webp({ quality: 90 }).toBuffer());
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2] ?? path.join(HERE, '..', 'nurburgring_gp_2016_layout_4k.glb');
const DST = process.argv[3] ?? path.join(HERE, '..', 'web', 'public', 'models', 'nurburgring_gp.glb');
const HERO_TEX = 2048; // asfalto/concreto que o carro pisa
const SCENERY_TEX = 1024; // cenário, folhagem, vidro
const QUALITY = 90;

const io = new NodeIO()
  .registerExtensions([
    KHRTextureTransform,
    KHRMaterialsSpecular,
    KHRDracoMeshCompression,
    EXTTextureWebP,
  ])
  .registerDependencies({
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'draco3d.decoder': await draco3d.createDecoderModule(),
  });

/** Histograma do canal alpha da baseColorTexture (frações 0..1). */
async function alphaStats(tex) {
  const meta = await sharp(Buffer.from(tex.getImage())).metadata();
  if (!meta.hasAlpha) return { hasAlpha: false };
  const { data, info } = await sharp(Buffer.from(tex.getImage()))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  let opaque = 0, n = 0, maxA = 0;
  for (let i = ch - 1; i < data.length; i += ch) {
    const a = data[i];
    if (a >= 250) opaque++;
    if (a > maxA) maxA = a;
    n++;
  }
  return { hasAlpha: true, opaqueFrac: opaque / n, maxA: maxA / 255 };
}

const doc = await io.read(SRC);
const root = doc.getRoot();

let toOpaque = 0, toMask = 0, keptBlend = 0;
for (const mat of root.listMaterials()) {
  const mode = mat.getAlphaMode();
  if (mode === 'OPAQUE') continue;

  const tex = mat.getBaseColorTexture();
  const bcf = mat.getBaseColorFactor();

  // Sem textura: alpha vem só de baseColorFactor.a. >=0.99 -> sólido opaco;
  // caso contrário é um helper invisível intencional (deixar como está).
  if (!tex) {
    if (bcf[3] >= 0.99) { mat.setAlphaMode('OPAQUE'); toOpaque++; }
    continue;
  }

  const st = await alphaStats(tex);

  // Textura sem canal alpha -> BLEND foi espúrio. Vira OPAQUE.
  if (!st.hasAlpha) {
    mat.setAlphaMode('OPAQUE');
    mat.setBaseColorFactor([bcf[0], bcf[1], bcf[2], 1]);
    toOpaque++;
    continue;
  }

  if (st.opaqueFrac >= 0.995) {
    // Alpha existe mas é todo opaco -> OPAQUE.
    mat.setAlphaMode('OPAQUE');
    mat.setBaseColorFactor([bcf[0], bcf[1], bcf[2], 1]);
    toOpaque++;
  } else if (st.maxA >= 0.9) {
    // Cutout real (folhagem, cerca): regiões 100% opacas + 100% vazias.
    // MASK escreve profundidade e não tem sorting -> não some por ângulo.
    mat.setAlphaMode('MASK');
    mat.setAlphaCutoff(0.5);
    mat.setDoubleSided(true);
    mat.setBaseColorFactor([bcf[0], bcf[1], bcf[2], 1]);
    toMask++;
  } else {
    // Nunca fica 100% opaco -> translúcido de verdade (vidro / rede fina).
    mat.setBaseColorFactor([bcf[0], bcf[1], bcf[2], 1]);
    keptBlend++;
  }
}
console.log(`materiais: ${toOpaque} -> OPAQUE, ${toMask} -> MASK, ${keptBlend} BLEND real`);

await doc.transform(
  dedup(),
  prune({ keepAttributes: false, keepLeaves: false }),
  weld({ tolerance: 0 }),
);

// --- grama realista: substitui a textura de Object6921 (repetição óbvia) ---
const grassMat = root.listMaterials().find((m) => m.getName().startsWith('Object6921'));
if (grassMat) {
  const gtex = grassMat.getBaseColorTexture();
  if (gtex) gtex.setImage(await makeGrassWebp()).setMimeType('image/webp');
  grassMat.setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0).setRoughnessFactor(1);
  const spec = grassMat.getExtension('KHR_materials_specular');
  if (spec) spec.setSpecularFactor(0); // grama não é brilhante
  console.log('grama: textura de', grassMat.getName(), 'substituída');
}

/** Triângulos de materiais OPACOS que usam esta textura (área dirigível). */
function opaqueTrisUsing(tex) {
  const prims = root.listMeshes().flatMap((m) => m.listPrimitives());
  let tris = 0;
  for (const mat of root.listMaterials()) {
    if (mat.getAlphaMode() !== 'OPAQUE' || mat.getBaseColorTexture() !== tex) continue;
    for (const p of prims) {
      if (p.getMaterial() !== mat) continue;
      const idx = p.getIndices();
      tris += idx ? idx.getCount() / 3 : p.getAttribute('POSITION').getCount() / 3;
    }
  }
  return tris;
}

/** Saturação média (16x16) — asfalto/concreto são cinza (sat baixa). */
async function meanSaturation(buf) {
  const { data } = await sharp(buf).removeAlpha().resize(16, 16, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  let r = 0, g = 0, b = 0;
  const n = data.length / 3;
  for (let i = 0; i < data.length; i += 3) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
  r /= n; g /= n; b /= n;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx ? (mx - mn) / mx : 0;
}

let hero = 0;
for (const tex of root.listTextures()) {
  const buf = Buffer.from(tex.getImage());
  const meta = await sharp(buf).metadata();
  const long = Math.max(meta.width, meta.height);
  const isHero = long >= 2048 && opaqueTrisUsing(tex) > 10000 && (await meanSaturation(buf)) < 0.18;
  if (isHero) hero++;
  const cap = isHero ? HERO_TEX : SCENERY_TEX;
  const scale = Math.min(1, cap / long); // nunca faz upscale
  let img = sharp(buf);
  if (scale < 1) img = img.resize(Math.round(meta.width * scale), Math.round(meta.height * scale));
  tex.setImage(new Uint8Array(await img.webp({ quality: QUALITY }).toBuffer())).setMimeType('image/webp');
}
doc.createExtension(EXTTextureWebP);
console.log(`texturas: ${hero} herói @${HERO_TEX}, resto @${SCENERY_TEX}`);

doc
  .createExtension(KHRDracoMeshCompression)
  .setRequired(true)
  .setEncoderOptions({
    method: KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER,
    quantizationBits: { POSITION: 16, NORMAL: 12, TEXCOORD_0: 16, TEXCOORD_1: 16, GENERIC: 12 },
  });

await io.write(DST, doc);
console.log('escrito:', DST);
