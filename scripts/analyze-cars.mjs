/**
 * Analisa GLBs sem Three.js (parse binário glTF 2.0).
 * node scripts/analyze-cars.mjs
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const modelsDir = join(__dirname, '../web/public/models');

const TARGET = {
  beetle: 4.07,
  golf_gti: 3.82,
  jetta: 4.7,
  skyline_r34: 4.6,
  m3_e46: 4.61,
  supra_a90: 4.38,
  m4_g82: 4.8,
};

const WHEEL_RE = /wheel|tire|tyre|disk|hub|pokr|bolt|rim|roda|llanta/i;
const NOT_WHEEL_RE = /steering|volante|caliper|calliper|brake(?!.*disk)/i;

function parseGlb(path) {
  const buf = readFileSync(path);
  const magic = buf.toString('utf8', 0, 4);
  if (magic !== 'glTF') throw new Error('not glb');
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
  let binOffset = 20 + jsonLen;
  // align / next chunk
  const binChunkLen = buf.readUInt32LE(binOffset);
  const binStart = binOffset + 8;
  const bin = buf.subarray(binStart, binStart + binChunkLen);
  return { json, bin };
}

function readAccessorPositions(json, bin, accessorIndex) {
  const acc = json.accessors[accessorIndex];
  if (!acc || acc.type !== 'VEC3') return null;
  if (acc.componentType !== 5126) return null; // FLOAT
  const bv = json.bufferViews[acc.bufferView];
  const start = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const stride = bv.byteStride || 12;
  const count = acc.count;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let sx = 0,
    sy = 0,
    sz = 0;
  for (let i = 0; i < count; i++) {
    const o = start + i * stride;
    const x = bin.readFloatLE(o);
    const y = bin.readFloatLE(o + 4);
    const z = bin.readFloatLE(o + 8);
    if (x < min[0]) min[0] = x;
    if (y < min[1]) min[1] = y;
    if (z < min[2]) min[2] = z;
    if (x > max[0]) max[0] = x;
    if (y > max[1]) max[1] = y;
    if (z > max[2]) max[2] = z;
    sx += x;
    sy += y;
    sz += z;
  }
  return {
    min,
    max,
    center: [sx / count, sy / count, sz / count],
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    count,
  };
}

function nodeWorldMatrix(json, nodeIndex, cache) {
  if (cache[nodeIndex]) return cache[nodeIndex];
  const n = json.nodes[nodeIndex];
  // local matrix
  let m;
  if (n.matrix) {
    m = [...n.matrix];
  } else {
    const t = n.translation || [0, 0, 0];
    const r = n.rotation || [0, 0, 0, 1];
    const s = n.scale || [1, 1, 1];
    m = matFromTRS(t, r, s);
  }
  // find parent
  let parent = -1;
  for (let i = 0; i < json.nodes.length; i++) {
    const ch = json.nodes[i].children;
    if (ch && ch.includes(nodeIndex)) {
      parent = i;
      break;
    }
  }
  if (parent >= 0) {
    const pm = nodeWorldMatrix(json, parent, cache);
    m = mul(pm, m);
  }
  cache[nodeIndex] = m;
  return m;
}

function matFromTRS(t, q, s) {
  const [x, y, z, w] = q;
  const x2 = x + x,
    y2 = y + y,
    z2 = z + z;
  const xx = x * x2,
    xy = x * y2,
    xz = x * z2;
  const yy = y * y2,
    yz = y * z2,
    zz = z * z2;
  const wx = w * x2,
    wy = w * y2,
    wz = w * z2;
  const sx = s[0],
    sy = s[1],
    sz = s[2];
  return [
    (1 - (yy + zz)) * sx,
    (xy + wz) * sx,
    (xz - wy) * sx,
    0,
    (xy - wz) * sy,
    (1 - (xx + zz)) * sy,
    (yz + wx) * sy,
    0,
    (xz + wy) * sz,
    (yz - wx) * sz,
    (1 - (xx + yy)) * sz,
    0,
    t[0],
    t[1],
    t[2],
    1,
  ];
}

function mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

function transformPoint(m, p) {
  const x = p[0],
    y = p[1],
    z = p[2];
  const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
  return [
    (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
    (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
    (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
  ];
}

function analyze(path) {
  const { json, bin } = parseGlb(path);
  const cache = {};
  let gmin = [Infinity, Infinity, Infinity];
  let gmax = [-Infinity, -Infinity, -Infinity];
  const wheelCenters = [];

  const mats = (json.materials || []).map((m) => m.name || '');

  for (let ni = 0; ni < json.nodes.length; ni++) {
    const node = json.nodes[ni];
    if (node.mesh == null) continue;
    const mesh = json.meshes[node.mesh];
    const world = nodeWorldMatrix(json, ni, cache);
    const nodeName = node.name || '';
    for (const prim of mesh.primitives) {
      const posAcc = prim.attributes.POSITION;
      if (posAcc == null) continue;
      // skip draco compressed — no raw buffer
      if (prim.extensions?.KHR_draco_mesh_compression) {
        const acc = json.accessors[posAcc];
        if (acc.min && acc.max) {
          const corners = [
            [acc.min[0], acc.min[1], acc.min[2]],
            [acc.max[0], acc.max[1], acc.max[2]],
            [acc.min[0], acc.min[1], acc.max[2]],
            [acc.max[0], acc.max[1], acc.min[2]],
            [acc.min[0], acc.max[1], acc.min[2]],
            [acc.max[0], acc.min[1], acc.max[2]],
            [acc.min[0], acc.max[1], acc.max[2]],
            [acc.max[0], acc.min[1], acc.min[2]],
          ];
          for (const c of corners) {
            const w = transformPoint(world, c);
            for (let i = 0; i < 3; i++) {
              if (w[i] < gmin[i]) gmin[i] = w[i];
              if (w[i] > gmax[i]) gmax[i] = w[i];
            }
          }
          const matName = prim.material != null ? mats[prim.material] : '';
          const hit =
            (WHEEL_RE.test(nodeName) || WHEEL_RE.test(matName) || WHEEL_RE.test(mesh.name || '')) &&
            !NOT_WHEEL_RE.test(nodeName) &&
            !NOT_WHEEL_RE.test(matName);
          if (hit) {
            const c = transformPoint(world, [
              (acc.min[0] + acc.max[0]) / 2,
              (acc.min[1] + acc.max[1]) / 2,
              (acc.min[2] + acc.max[2]) / 2,
            ]);
            const size = [acc.max[0] - acc.min[0], acc.max[1] - acc.min[1], acc.max[2] - acc.min[2]];
            wheelCenters.push({ c, size, name: nodeName });
          }
        }
        continue;
      }
      const local = readAccessorPositions(json, bin, posAcc);
      if (!local) continue;
      const corners = [
        [local.min[0], local.min[1], local.min[2]],
        [local.max[0], local.max[1], local.max[2]],
        [local.min[0], local.min[1], local.max[2]],
        [local.max[0], local.max[1], local.min[2]],
        [local.min[0], local.max[1], local.min[2]],
        [local.max[0], local.min[1], local.max[2]],
        [local.min[0], local.max[1], local.max[2]],
        [local.max[0], local.min[1], local.min[2]],
      ];
      for (const c of corners) {
        const w = transformPoint(world, c);
        for (let i = 0; i < 3; i++) {
          if (w[i] < gmin[i]) gmin[i] = w[i];
          if (w[i] > gmax[i]) gmax[i] = w[i];
        }
      }
      const matName = prim.material != null ? mats[prim.material] : '';
      const hit =
        (WHEEL_RE.test(nodeName) || WHEEL_RE.test(matName) || WHEEL_RE.test(mesh.name || '')) &&
        !NOT_WHEEL_RE.test(nodeName) &&
        !NOT_WHEEL_RE.test(matName);
      if (hit) {
        const c = transformPoint(world, local.center);
        const s0 = transformPoint(world, local.min);
        const s1 = transformPoint(world, local.max);
        const size = [Math.abs(s1[0] - s0[0]), Math.abs(s1[1] - s0[1]), Math.abs(s1[2] - s0[2])];
        wheelCenters.push({ c, size, name: nodeName });
      }
    }
  }

  const size = [gmax[0] - gmin[0], gmax[1] - gmin[1], gmax[2] - gmin[2]];
  const center = [(gmin[0] + gmax[0]) / 2, (gmin[1] + gmax[1]) / 2, (gmin[2] + gmax[2]) / 2];
  return { size, center, gmin, gmax, wheelCenters };
}

function hubsFromWheels(wheelCenters, center, sizeY) {
  const big = wheelCenters
    .filter((w) => Math.max(...w.size) > sizeY * 0.06)
    .sort((a, b) => Math.max(...b.size) - Math.max(...a.size));
  const pool = big.length >= 4 ? big.slice(0, Math.min(40, big.length)) : wheelCenters;
  const quads = [[], [], [], []];
  for (const p of pool) {
    const right = p.c[0] >= center[0];
    const front = p.c[2] >= center[2];
    const idx = front ? (right ? 0 : 1) : right ? 2 : 3;
    quads[idx].push(p);
  }
  return quads.map((q) => {
    if (!q.length) return null;
    const avg = [0, 0, 0];
    for (const p of q) {
      avg[0] += p.c[0];
      avg[1] += p.c[1];
      avg[2] += p.c[2];
    }
    return [avg[0] / q.length, avg[1] / q.length, avg[2] / q.length, q.length];
  });
}

for (const [id, targetLen] of Object.entries(TARGET)) {
  const file = `${id}.glb`;
  const path = join(modelsDir, file);
  try {
    const a = analyze(path);
    const lengthAxis = a.size[2] >= a.size[0] ? 2 : 0;
    const scale = targetLen / a.size[lengthAxis];
    const hubs = hubsFromWheels(a.wheelCenters, a.center, a.size[1]);
    console.log(`\n=== ${id} ===`);
    console.log(
      `raw: ${a.size.map((v) => v.toFixed(3)).join(' x ')} center ${a.center.map((v) => v.toFixed(3)).join(', ')}`,
    );
    console.log(`wheels detected: ${a.wheelCenters.length}  scale: ${scale.toFixed(5)}`);
    console.log(
      `scaled size: ${a.size.map((v) => (v * scale).toFixed(3)).join(' x ')}`,
    );
    const labels = ['FL', 'FR', 'RL', 'RR'];
    hubs.forEach((h, i) => {
      if (!h) console.log(`  ${labels[i]}: MISSING`);
      else
        console.log(
          `  ${labels[i]}: (${(h[0] * scale).toFixed(3)}, ${(h[1] * scale).toFixed(3)}, ${(h[2] * scale).toFixed(3)}) n=${h[3]}`,
        );
    });
  } catch (e) {
    console.error(`FAIL ${id}`, e.message || e);
  }
}
