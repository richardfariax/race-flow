import { useMemo } from 'react';
import * as THREE from 'three';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { SAMPLES, TRACK } from '@shared/track';
import {
  asphaltMaterial,
  grassMaterial,
  gravelMaterial,
  concreteMaterial,
  vertexColorStandard,
} from './trackTextures';

/**
 * Eifelblick — pista com relevo, texturas procedurais e colisão contínua.
 * Superfície dirigível = asfalto + zebras + escape (sem furos laterais).
 * Muros de concreto baixos e contínuos (sem gaps entre segmentos).
 */

const HALF_W = TRACK.width / 2;
/**
 * Seção transversal (offsets laterais, metros). Faixas SE SOBREPÕEM ~15 cm
 * para não abrir furo em curva (poligonal). Cascalho entra por baixo do muro.
 */
const KERB_IN = HALF_W - 0.35;
const KERB_OUT = HALF_W + 0.7;
const RUNOFF_IN = HALF_W - 0.1; // sob a zebra
const WALL_IN = HALF_W + 2.55;
const WALL_THICK = 0.42;
const WALL_H = 1.15;
const RUNOFF_OUT = WALL_IN + WALL_THICK + 0.2; // passa sob/além do muro
const SKIRT = 55;
const UV_ALONG = 10;
/** overlap mínimo entre faixas adjacentes */
const OLAP = 0.12;

/** Empurra triângulos com normal pra cima (evita mesh invisível por culling). */
function pushRibbonQuad(indices: number[], a: number, flip: boolean) {
  if (flip) indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  else indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
}

/**
 * Ribbon horizontal com UVs. `inner`/`outer` = offset lateral assinado
 * (positivo = esquerda da direção). Winding corrige quando outer < inner.
 */
function ribbonGeometry(
  inner: number,
  outer: number,
  yOff: number,
  opts?: { uvAlong?: number },
): THREE.BufferGeometry {
  const n = SAMPLES.length;
  const uvAlong = opts?.uvAlong ?? UV_ALONG;
  const positions = new Float32Array((n + 1) * 2 * 3);
  const uvs = new Float32Array((n + 1) * 2 * 2);
  const indices: number[] = [];
  const width = Math.abs(outer - inner) || 1;
  const flip = outer < inner;

  for (let i = 0; i <= n; i++) {
    const p = SAMPLES[i % n];
    const nx = -p.dirZ;
    const nz = p.dirX;
    const y = p.y + yOff;
    positions.set([p.x + nx * inner, y, p.z + nz * inner], i * 6);
    positions.set([p.x + nx * outer, y, p.z + nz * outer], i * 6 + 3);
    const v = p.s / uvAlong;
    uvs.set([0, v], i * 4);
    uvs.set([width / uvAlong, v], i * 4 + 2);
    if (i < n) pushRibbonQuad(indices, i * 2, flip);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function skirtGeometry(side: 1 | -1): THREE.BufferGeometry {
  const n = SAMPLES.length;
  const inner = side * (RUNOFF_OUT - OLAP);
  const outer = side * (RUNOFF_OUT + SKIRT);
  const positions = new Float32Array((n + 1) * 2 * 3);
  const uvs = new Float32Array((n + 1) * 2 * 2);
  const indices: number[] = [];
  for (let i = 0; i <= n; i++) {
    const p = SAMPLES[i % n];
    const nx = -p.dirZ;
    const nz = p.dirX;
    positions.set([p.x + nx * inner, p.y + 0.02, p.z + nz * inner], i * 6);
    positions.set([p.x + nx * outer, 0, p.z + nz * outer], i * 6 + 3);
    const v = p.s / 18;
    uvs.set([0, v], i * 4);
    uvs.set([SKIRT / 18, v], i * 4 + 2);
    if (i < n) {
      const a = i * 2;
      if (side === 1) indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      else indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Zebra vermelho/branco — winding corrigido por lado (senão some por culling). */
function kerbGeometry(side: 1 | -1): THREE.BufferGeometry {
  const n = SAMPLES.length;
  const inner = side * KERB_IN;
  const outer = side * (KERB_OUT + OLAP);
  const positions = new Float32Array((n + 1) * 2 * 3);
  const colors = new Float32Array((n + 1) * 2 * 3);
  const indices: number[] = [];
  const red = new THREE.Color('#e63946');
  const white = new THREE.Color('#f8f9fa');
  const block = 2;
  const flip = outer < inner;
  for (let i = 0; i <= n; i++) {
    const p = SAMPLES[i % n];
    const nx = -p.dirZ;
    const nz = p.dirX;
    positions.set([p.x + nx * inner, p.y + 0.04, p.z + nz * inner], i * 6);
    positions.set([p.x + nx * outer, p.y + 0.04, p.z + nz * outer], i * 6 + 3);
    const c = Math.floor(i / block) % 2 === 0 ? red : white;
    colors.set([c.r, c.g, c.b], i * 6);
    colors.set([c.r, c.g, c.b], i * 6 + 3);
    if (i < n) pushRibbonQuad(indices, i * 2, flip);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Muro contínuo com chanfro no topo — base enterrada no cascalho para não
 * abrir furo entre o piso e a barreira nas curvas.
 */
function wallRibbonGeometry(side: 1 | -1): THREE.BufferGeometry {
  const n = SAMPLES.length;
  const inner = side * (WALL_IN - OLAP);
  const outer = side * (WALL_IN + WALL_THICK);
  const mid = side * (WALL_IN + WALL_THICK * 0.5);
  const vertsPer = 6;
  const positions = new Float32Array((n + 1) * vertsPer * 3);
  const uvs = new Float32Array((n + 1) * vertsPer * 2);
  const indices: number[] = [];
  const bevel = 0.08;

  for (let i = 0; i <= n; i++) {
    const p = SAMPLES[i % n];
    const nx = -p.dirZ;
    const nz = p.dirX;
    const ix = p.x + nx * inner;
    const iz = p.z + nz * inner;
    const ox = p.x + nx * outer;
    const oz = p.z + nz * outer;
    const mx = p.x + nx * mid;
    const mz = p.z + nz * mid;
    const y0 = p.y - 0.1;
    const y1 = p.y + WALL_H;
    const yTop = y1 + bevel;
    const base = i * vertsPer * 3;
    // 0 base inner, 1 base outer, 2 face outer, 3 bevel outer, 4 bevel inner, 5 face inner
    positions.set([ix, y0, iz], base);
    positions.set([ox, y0, oz], base + 3);
    positions.set([ox, y1, oz], base + 6);
    positions.set(
      [mx + nx * side * (WALL_THICK * 0.15), yTop, mz + nz * side * (WALL_THICK * 0.15)],
      base + 9,
    );
    positions.set(
      [mx - nx * side * (WALL_THICK * 0.15), yTop, mz - nz * side * (WALL_THICK * 0.15)],
      base + 12,
    );
    positions.set([ix, y1, iz], base + 15);

    const v = p.s / 3.5;
    const uvBase = i * vertsPer * 2;
    uvs.set([0, v], uvBase);
    uvs.set([1, v], uvBase + 2);
    uvs.set([1, v + WALL_H / 3.5], uvBase + 4);
    uvs.set([0.55, v + (WALL_H + bevel) / 3.5], uvBase + 6);
    uvs.set([0.45, v + (WALL_H + bevel) / 3.5], uvBase + 8);
    uvs.set([0, v + WALL_H / 3.5], uvBase + 10);

    if (i < n) {
      const a = i * vertsPer;
      const b = a + vertsPer;
      const quad = (i0: number, i1: number, flip: boolean) => {
        if (flip) indices.push(a + i0, b + i0, a + i1, a + i1, b + i0, b + i1);
        else indices.push(a + i0, a + i1, b + i0, a + i1, b + i1, b + i0);
      };
      const flip = side === -1;
      quad(5, 4, flip); // inner upper
      quad(0, 5, flip); // inner lower
      quad(1, 2, !flip); // outer lower
      quad(2, 3, !flip); // outer upper
      quad(4, 3, flip); // top
      quad(0, 1, !flip); // bottom
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function wallCapGeometry(side: 1 | -1): THREE.BufferGeometry {
  const n = SAMPLES.length;
  const inner = side * (WALL_IN + 0.04);
  const outer = side * (WALL_IN + WALL_THICK - 0.04);
  const positions = new Float32Array((n + 1) * 2 * 3);
  const colors = new Float32Array((n + 1) * 2 * 3);
  const indices: number[] = [];
  const red = new THREE.Color('#c1121f');
  const white = new THREE.Color('#f8f9fa');
  const block = 2;
  const flip = outer < inner;
  for (let i = 0; i <= n; i++) {
    const p = SAMPLES[i % n];
    const nx = -p.dirZ;
    const nz = p.dirX;
    const y = p.y + WALL_H + 0.1;
    positions.set([p.x + nx * inner, y, p.z + nz * inner], i * 6);
    positions.set([p.x + nx * outer, y, p.z + nz * outer], i * 6 + 3);
    const c = Math.floor(i / block) % 2 === 0 ? red : white;
    colors.set([c.r, c.g, c.b], i * 6);
    colors.set([c.r, c.g, c.b], i * 6 + 3);
    if (i < n) pushRibbonQuad(indices, i * 2, flip);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

interface WallSeg {
  x: number;
  y: number;
  z: number;
  yaw: number;
  halfLength: number;
}

/** Colisores densos e sobrepostos (trimesh fino é instável no Rapier). */
function useWallColliders(): WallSeg[] {
  return useMemo(() => {
    const segs: WallSeg[] = [];
    const step = 2;
    const n = SAMPLES.length;
    const mid = WALL_IN + WALL_THICK / 2;
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < n; i += step) {
        const a = SAMPLES[i];
        const b = SAMPLES[(i + step) % n];
        const offA = { x: a.x - a.dirZ * side * mid, z: a.z + a.dirX * side * mid };
        const offB = { x: b.x - b.dirZ * side * mid, z: b.z + b.dirX * side * mid };
        const dx = offB.x - offA.x;
        const dz = offB.z - offA.z;
        const len = Math.hypot(dx, dz);
        segs.push({
          x: (offA.x + offB.x) / 2,
          y: (a.y + b.y) / 2,
          z: (offA.z + offB.z) / 2,
          yaw: Math.atan2(dx, dz),
          halfLength: len / 2 + 0.35,
        });
      }
    }
    return segs;
  }, []);
}

interface Prop {
  x: number;
  z: number;
  rot: number;
}

function useGrandstands(): Prop[] {
  return useMemo(() => {
    const props: Prop[] = [];
    let maxR = 0;
    for (const p of SAMPLES) maxR = Math.max(maxR, Math.hypot(p.x, p.z));
    const ring = maxR + 22;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.4;
      props.push({
        x: Math.cos(a) * ring,
        z: Math.sin(a) * ring,
        rot: a + Math.PI,
      });
    }
    return props;
  }, []);
}

function Grandstand({ x, z, rot }: { x: number; z: number; rot: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      <mesh castShadow receiveShadow position={[0, 1.5, 0]}>
        <boxGeometry args={[14, 3, 5]} />
        <meshStandardMaterial color="#8d99ae" roughness={0.85} metalness={0.05} envMapIntensity={0.35} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 3.4, -0.6]}>
        <boxGeometry args={[14, 0.6, 4]} />
        <meshStandardMaterial color="#c23b5a" roughness={0.7} metalness={0.08} envMapIntensity={0.4} />
      </mesh>
    </group>
  );
}

function StartGantry() {
  const p = SAMPLES[0];
  return (
    <group position={[p.x, p.y, p.z]} rotation={[0, Math.atan2(p.dirX, p.dirZ), 0]}>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
        <planeGeometry args={[TRACK.width - 0.8, 2.4]} />
        <meshStandardMaterial color="#f8f9fa" roughness={0.65} metalness={0.05} envMapIntensity={0.4} />
      </mesh>
      {Array.from({ length: 8 }, (_, i) =>
        Array.from({ length: 2 }, (_, j) => {
          if ((i + j) % 2 !== 0) return null;
          const cellW = (TRACK.width - 0.8) / 8;
          return (
            <mesh
              key={`${i}-${j}`}
              receiveShadow
              rotation={[-Math.PI / 2, 0, 0]}
              position={[-TRACK.width / 2 + 0.4 + cellW * (i + 0.5), 0.065, (j - 0.5) * 1.2]}
            >
              <planeGeometry args={[cellW * 0.98, 1.15]} />
              <meshStandardMaterial color="#1a1a1a" roughness={0.75} envMapIntensity={0.25} />
            </mesh>
          );
        }),
      )}
      {[-1, 1].map((s) => (
        <mesh key={s} castShadow receiveShadow position={[s * (HALF_W + 1.2), 2.8, 0]}>
          <boxGeometry args={[0.35, 5.6, 0.35]} />
          <meshStandardMaterial color="#2a2a32" roughness={0.55} metalness={0.35} envMapIntensity={0.6} />
        </mesh>
      ))}
      <mesh castShadow receiveShadow position={[0, 5.5, 0]}>
        <boxGeometry args={[TRACK.width + 2.8, 0.45, 0.45]} />
        <meshStandardMaterial color="#2a2a32" roughness={0.55} metalness={0.35} envMapIntensity={0.6} />
      </mesh>
      <mesh castShadow position={[0, 5.5, 0.28]}>
        <boxGeometry args={[TRACK.width * 0.7, 0.7, 0.06]} />
        <meshStandardMaterial color="#ffd166" roughness={0.4} metalness={0.2} envMapIntensity={0.7} />
      </mesh>
    </group>
  );
}

export function Track() {
  // superfície de colisão: asfalto + zebras + escape (sem furo lateral)
  const driveable = useMemo(() => ribbonGeometry(-RUNOFF_OUT, RUNOFF_OUT, 0.02), []);
  // asfalto se estende sob a zebra (overlap) — sem fresta verde
  const road = useMemo(
    () => ribbonGeometry(-(KERB_OUT + OLAP), KERB_OUT + OLAP, 0.022),
    [],
  );
  const lineL = useMemo(() => ribbonGeometry(HALF_W - 0.5, HALF_W - 0.28, 0.035), []);
  const lineR = useMemo(() => ribbonGeometry(-(HALF_W - 0.28), -(HALF_W - 0.5), 0.035), []);
  const kerbL = useMemo(() => kerbGeometry(1), []);
  const kerbR = useMemo(() => kerbGeometry(-1), []);
  // cascalho começa sob a zebra e termina sob/além do muro
  const runoffL = useMemo(
    () => ribbonGeometry(RUNOFF_IN, RUNOFF_OUT, 0.026, { uvAlong: 6 }),
    [],
  );
  const runoffR = useMemo(
    () => ribbonGeometry(-RUNOFF_OUT, -RUNOFF_IN, 0.026, { uvAlong: 6 }),
    [],
  );
  const wallL = useMemo(() => wallRibbonGeometry(1), []);
  const wallR = useMemo(() => wallRibbonGeometry(-1), []);
  const capL = useMemo(() => wallCapGeometry(1), []);
  const capR = useMemo(() => wallCapGeometry(-1), []);
  const skirtL = useMemo(() => skirtGeometry(1), []);
  const skirtR = useMemo(() => skirtGeometry(-1), []);
  const wallColliders = useWallColliders();
  const stands = useGrandstands();

  const asphaltMat = useMemo(() => asphaltMaterial(), []);
  const gravelMat = useMemo(() => gravelMaterial(), []);
  const concreteMat = useMemo(() => concreteMaterial(), []);
  const kerbMat = useMemo(() => vertexColorStandard(), []);
  const skirtMat = useMemo(() => {
    const m = grassMaterial();
    m.map!.repeat.set(6, 28);
    if (m.normalMap) m.normalMap.repeat.set(6, 28);
    return m;
  }, []);

  const grassPlane = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1040, 1040, 64, 64);
    const colors = new Float32Array(geo.attributes.position.count * 3);
    const pos = geo.attributes.position;
    const c = new THREE.Color();
    const dark = new THREE.Color('#4a6e32');
    const mid = new THREE.Color('#6a8f42');
    const light = new THREE.Color('#8aab55');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const n =
        Math.sin(x * 0.018) * Math.cos(y * 0.015) * 0.5 +
        Math.sin(x * 0.007 + 2) * Math.sin(y * 0.009) * 0.35;
      const grit = Math.sin(x * 1.7 + y * 2.1) * 43758.5453;
      const fract = grit - Math.floor(grit);
      const t = Math.max(0, Math.min(1, (n + 1) * 0.45 + fract * 0.15));
      if (t < 0.4) c.copy(dark).lerp(mid, t / 0.4);
      else c.copy(mid).lerp(light, (t - 0.4) / 0.6);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  }, []);

  const grassPlaneMat = useMemo(() => {
    const m = grassMaterial();
    m.vertexColors = true;
    m.map!.repeat.set(52, 52);
    if (m.normalMap) m.normalMap.repeat.set(52, 52);
    return m;
  }, []);

  return (
    <>
      {/* gramado: colisor BEM espesso (topo em y=0) — evita tunneling ao cair da pista */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[520, 12, 520]} position={[0, -12, 0]} friction={0.9} />
        <mesh
          receiveShadow
          position={[0, 0, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          geometry={grassPlane}
          material={grassPlaneMat}
        />
      </RigidBody>

      {/* saias com colisão — sem isso o carro atravessa a rampa visual e afunda */}
      <RigidBody type="fixed" colliders="trimesh" includeInvisible>
        <mesh receiveShadow geometry={skirtL} material={skirtMat} />
        <mesh receiveShadow geometry={skirtR} material={skirtMat} />
      </RigidBody>
      {/* colisão: includeInvisible obrigatório com mesh invisible */}
      <RigidBody type="fixed" colliders="trimesh" includeInvisible>
        <mesh visible={false} geometry={driveable} />
      </RigidBody>

      {/* ordem de desenho: cascalho → asfalto → linhas → zebras (camadas sem furo) */}
      <mesh receiveShadow geometry={runoffL} material={gravelMat} />
      <mesh receiveShadow geometry={runoffR} material={gravelMat} />
      <mesh receiveShadow geometry={road} material={asphaltMat} />

      <mesh receiveShadow geometry={lineL}>
        <meshStandardMaterial
          color="#f1faee"
          roughness={0.65}
          metalness={0.05}
          envMapIntensity={0.35}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>
      <mesh receiveShadow geometry={lineR}>
        <meshStandardMaterial
          color="#f1faee"
          roughness={0.65}
          metalness={0.05}
          envMapIntensity={0.35}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>

      <mesh receiveShadow castShadow geometry={kerbL} material={kerbMat} />
      <mesh receiveShadow castShadow geometry={kerbR} material={kerbMat} />

      <StartGantry />

      <mesh castShadow receiveShadow geometry={wallL} material={concreteMat} />
      <mesh castShadow receiveShadow geometry={wallR} material={concreteMat} />
      <mesh receiveShadow castShadow geometry={capL} material={kerbMat} />
      <mesh receiveShadow castShadow geometry={capR} material={kerbMat} />

      <RigidBody type="fixed" colliders={false}>
        {wallColliders.map((w, i) => (
          <group key={i} position={[w.x, w.y + WALL_H / 2, w.z]} rotation={[0, w.yaw, 0]}>
            <CuboidCollider args={[WALL_THICK / 2 + 0.05, WALL_H / 2 + 0.05, w.halfLength]} />
          </group>
        ))}
      </RigidBody>

      {stands.map((p, i) => (
        <Grandstand key={i} x={p.x} z={p.z} rot={p.rot} />
      ))}
    </>
  );
}
