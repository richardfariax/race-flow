import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { SAMPLES, progressAt, TRACK } from '@shared/track';
import {
  barkMaterial,
  pineFoliageSolidMaterial,
  oakFoliageSolidMaterial,
  bushSolidMaterial,
} from './trackTextures';

/**
 * Ambiente Eifel/Nürburgring: céu atmosférico, floresta low-poly 3D (pinheiro +
 * folhosa), arbustos e silhueta de horizonte.
 */

const SKY_RADIUS = 950;

function SkyDome() {
  const mat = useMemo(() => {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color('#4280c8') },
        midColor: { value: new THREE.Color('#78b0e0') },
        bottomColor: { value: new THREE.Color('#dce8f0') },
        sunColor: { value: new THREE.Color('#fff8e8') },
        sunDirection: { value: new THREE.Vector3(0.45, 0.68, 0.32).normalize() },
        cloudSeed: { value: 1.7 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 bottomColor;
        uniform vec3 sunColor;
        uniform vec3 sunDirection;
        uniform float cloudSeed;
        varying vec3 vWorldPos;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
        }
        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 5; i++) {
            v += a * noise(p);
            p *= 2.05;
            a *= 0.5;
          }
          return v;
        }

        void main() {
          vec3 dir = normalize(vWorldPos);
          float h = dir.y * 0.5 + 0.5;
          vec3 col = mix(bottomColor, midColor, smoothstep(0.0, 0.42, h));
          col = mix(col, topColor, smoothstep(0.38, 1.0, h));

          float sun = pow(max(dot(dir, sunDirection), 0.0), 68.0);
          float glow = pow(max(dot(dir, sunDirection), 0.0), 7.5) * 0.48;
          col += sunColor * (sun * 1.65 + glow);

          if (dir.y > 0.05) {
            vec2 uv = dir.xz / (dir.y + 0.15) * 0.55 + cloudSeed;
            float clouds = smoothstep(0.46, 0.7, fbm(uv));
            clouds *= smoothstep(0.05, 0.35, dir.y) * (1.0 - smoothstep(0.72, 1.0, dir.y));
            col = mix(col, vec3(0.97, 0.98, 1.0), clouds * 0.62);
          }

          float horizon = exp(-abs(dir.y) * 6.5);
          col = mix(col, vec3(0.52, 0.62, 0.48), horizon * 0.32);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
  }, []);

  return (
    <mesh frustumCulled={false}>
      <sphereGeometry args={[SKY_RADIUS, 48, 24]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}

interface TreeSpot {
  x: number;
  z: number;
  scale: number;
  rot: number;
  /** variação de tom 0..1 */
  tint: number;
}

function buildSpots(kind: 'pine' | 'oak'): TreeSpot[] {
  const spots: TreeSpot[] = [];
  let maxR = 0;
  for (const p of SAMPLES) maxR = Math.max(maxR, Math.hypot(p.x, p.z));
  const minR = maxR + 14;
  const maxForestR = maxR + 230;
  const roadClear = TRACK.width / 2 + 6.5;
  const pineBias = kind === 'pine';

  for (let ring = 0; ring < 18; ring++) {
    const r = minR + (ring / 17) * (maxForestR - minR);
    const count = Math.floor(26 + ring * 4.2);
    for (let i = 0; i < count; i++) {
      const seed = i * 97 + ring * 131 + (pineBias ? 0 : 503);
      const isPine = seed % 100 < 65;
      if (isPine !== pineBias) continue;
      const a = (i / count) * Math.PI * 2 + ring * 0.19 + (pineBias ? 0 : 0.4);
      const jitter = (seed % 100) / 100;
      const rr = r + (jitter - 0.5) * 16;
      const x = Math.cos(a) * rr;
      const z = Math.sin(a) * rr;
      if (progressAt(x, z).lateral < roadClear) continue;
      spots.push({
        x,
        z,
        scale: pineBias ? 0.9 + (seed % 50) / 50 : 0.75 + (seed % 55) / 55,
        rot: a + jitter * 3,
        tint: (seed % 100) / 100,
      });
    }
  }

  for (let k = 0; k < 220; k++) {
    const seed = k * 17 + (pineBias ? 11 : 91);
    const isPine = seed % 100 < 65;
    if (isPine !== pineBias) continue;
    const a = ((k * 137.5) % 360) * (Math.PI / 180);
    const rr = minR + (((k * 53) % 1000) / 1000) * (maxForestR - minR);
    const x = Math.cos(a) * rr + (((k * 19) % 18) - 9);
    const z = Math.sin(a) * rr + (((k * 31) % 18) - 9);
    if (progressAt(x, z).lateral < roadClear) continue;
    spots.push({
      x,
      z,
      scale: 0.8 + (k % 42) / 45,
      rot: a,
      tint: (k % 100) / 100,
    });
  }
  return spots;
}

function setColoredMatrix(
  mesh: THREE.InstancedMesh,
  i: number,
  x: number,
  y: number,
  z: number,
  rot: number,
  sx: number,
  sy: number,
  sz: number,
  color: THREE.Color,
  tmp: {
    m: THREE.Matrix4;
    p: THREE.Vector3;
    q: THREE.Quaternion;
    s: THREE.Vector3;
    e: THREE.Euler;
  },
) {
  tmp.e.set(0, rot, 0);
  tmp.q.setFromEuler(tmp.e);
  tmp.s.set(sx, sy, sz);
  tmp.p.set(x, y, z);
  tmp.m.compose(tmp.p, tmp.q, tmp.s);
  mesh.setMatrixAt(i, tmp.m);
  mesh.setColorAt(i, color);
}

/** Pinheiro low-poly: tronco + 4 cones empilhados. */
function PineForest({ spots }: { spots: TreeSpot[] }) {
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const layer0 = useRef<THREE.InstancedMesh>(null);
  const layer1 = useRef<THREE.InstancedMesh>(null);
  const layer2 = useRef<THREE.InstancedMesh>(null);
  const layer3 = useRef<THREE.InstancedMesh>(null);
  const layerRefs = [layer0, layer1, layer2, layer3];

  const trunkGeo = useMemo(() => new THREE.CylinderGeometry(0.18, 0.38, 4.6, 7), []);
  const coneGeos = useMemo(
    () => [
      new THREE.ConeGeometry(2.5, 2.9, 8),
      new THREE.ConeGeometry(1.95, 2.5, 8),
      new THREE.ConeGeometry(1.4, 2.1, 8),
      new THREE.ConeGeometry(0.95, 1.7, 8),
    ],
    [],
  );
  const layers = useMemo(
    () => [
      { y: 4.0, scale: 1.08 },
      { y: 6.0, scale: 0.9 },
      { y: 7.7, scale: 0.74 },
      { y: 9.1, scale: 0.58 },
    ],
    [],
  );

  const trunkMat = useMemo(() => barkMaterial(), []);
  const leafMat = useMemo(() => pineFoliageSolidMaterial(), []);

  useLayoutEffect(() => {
    const trunk = trunkRef.current;
    const cones = layerRefs.map((r) => r.current);
    if (!trunk || cones.some((c) => !c)) return;
    const tmp = {
      m: new THREE.Matrix4(),
      p: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      s: new THREE.Vector3(),
      e: new THREE.Euler(),
    };
    const barkTint = new THREE.Color();
    const leafTint = new THREE.Color();
    const leafBase = new THREE.Color('#3d6e30');
    const leafHi = new THREE.Color('#6a9a42');

    for (let i = 0; i < spots.length; i++) {
      const t = spots[i];
      const sc = t.scale;
      barkTint.set('#6b4a32').lerp(new THREE.Color('#4a3220'), t.tint);
      setColoredMatrix(trunk, i, t.x, 2.3 * sc, t.z, t.rot, sc, sc, sc, barkTint, tmp);

      leafTint.copy(leafBase).lerp(leafHi, t.tint);
      leafTint.offsetHSL((t.tint - 0.5) * 0.06, 0.06, (t.tint - 0.5) * 0.1);
      for (let L = 0; L < 4; L++) {
        const layer = layers[L];
        const sMul = layer.scale * sc;
        setColoredMatrix(
          cones[L]!,
          i,
          t.x,
          layer.y * sc,
          t.z,
          t.rot + L * 0.12,
          sMul,
          sMul,
          sMul,
          leafTint,
          tmp,
        );
      }
    }
    trunk.instanceMatrix.needsUpdate = true;
    if (trunk.instanceColor) trunk.instanceColor.needsUpdate = true;
    trunk.computeBoundingSphere();
    for (const mesh of cones) {
      mesh!.instanceMatrix.needsUpdate = true;
      if (mesh!.instanceColor) mesh!.instanceColor.needsUpdate = true;
      mesh!.computeBoundingSphere();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spots]);

  const n = spots.length;
  if (n === 0) return null;
  return (
    <>
      <instancedMesh ref={trunkRef} args={[trunkGeo, trunkMat, n]} castShadow receiveShadow />
      {layerRefs.map((ref, i) => (
        <instancedMesh
          key={i}
          ref={ref}
          args={[coneGeos[i], leafMat, n]}
          castShadow
          receiveShadow
        />
      ))}
    </>
  );
}

/** Folhosa low-poly: tronco + 3 esferas sobrepostas (copa orgânica). */
function OakForest({ spots }: { spots: TreeSpot[] }) {
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const blob0 = useRef<THREE.InstancedMesh>(null);
  const blob1 = useRef<THREE.InstancedMesh>(null);
  const blob2 = useRef<THREE.InstancedMesh>(null);
  const blobRefs = [blob0, blob1, blob2];

  const trunkGeo = useMemo(() => new THREE.CylinderGeometry(0.22, 0.45, 4.0, 7), []);
  const blobGeo = useMemo(() => new THREE.SphereGeometry(1.75, 8, 6), []);
  const trunkMat = useMemo(() => barkMaterial(), []);
  const leafMat = useMemo(() => oakFoliageSolidMaterial(), []);

  useLayoutEffect(() => {
    const trunk = trunkRef.current;
    const blobs = blobRefs.map((r) => r.current);
    if (!trunk || blobs.some((c) => !c)) return;
    const tmp = {
      m: new THREE.Matrix4(),
      p: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      s: new THREE.Vector3(),
      e: new THREE.Euler(),
    };
    const barkTint = new THREE.Color();
    const leafTint = new THREE.Color();
    const leafBase = new THREE.Color('#4a7a35');
    const leafHi = new THREE.Color('#6fa845');
    const volumes: [number, number, number, number][] = [
      [0, 5.0, 0, 1.15],
      [0.6, 5.55, 0.38, 0.92],
      [-0.52, 5.45, -0.42, 0.88],
    ];

    for (let i = 0; i < spots.length; i++) {
      const t = spots[i];
      const sc = t.scale;
      barkTint.set('#7a5738').lerp(new THREE.Color('#5a3e28'), t.tint);
      setColoredMatrix(trunk, i, t.x, 2.0 * sc, t.z, t.rot, sc * 0.95, sc, sc * 0.95, barkTint, tmp);

      leafTint.copy(leafBase).lerp(leafHi, t.tint);
      leafTint.offsetHSL((t.tint - 0.5) * 0.08, 0.06, (t.tint - 0.5) * 0.12);
      for (let v = 0; v < 3; v++) {
        const [ox, oy, oz, sMul] = volumes[v];
        setColoredMatrix(
          blobs[v]!,
          i,
          t.x + ox * sc,
          oy * sc,
          t.z + oz * sc,
          t.rot + v * 0.4,
          sc * sMul * 1.05,
          sc * sMul * 0.88,
          sc * sMul * 1.02,
          leafTint,
          tmp,
        );
      }
    }
    trunk.instanceMatrix.needsUpdate = true;
    if (trunk.instanceColor) trunk.instanceColor.needsUpdate = true;
    trunk.computeBoundingSphere();
    for (const mesh of blobs) {
      mesh!.instanceMatrix.needsUpdate = true;
      if (mesh!.instanceColor) mesh!.instanceColor.needsUpdate = true;
      mesh!.computeBoundingSphere();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spots]);

  const n = spots.length;
  if (n === 0) return null;
  return (
    <>
      <instancedMesh ref={trunkRef} args={[trunkGeo, trunkMat, n]} castShadow receiveShadow />
      {blobRefs.map((ref, i) => (
        <instancedMesh key={i} ref={ref} args={[blobGeo, leafMat, n]} castShadow receiveShadow />
      ))}
    </>
  );
}

function Forest() {
  const pines = useMemo(() => buildSpots('pine'), []);
  const oaks = useMemo(() => buildSpots('oak'), []);
  return (
    <>
      <PineForest spots={pines} />
      <OakForest spots={oaks} />
    </>
  );
}

interface BushSpot {
  x: number;
  z: number;
  scale: number;
  rot: number;
  tint: number;
}

/** Arbustos baixos junto à pista — esferas low-poly. */
function buildBushes(): BushSpot[] {
  const spots: BushSpot[] = [];
  const roadClear = TRACK.width / 2 + 4.2;
  const roadMax = TRACK.width / 2 + 14;
  const step = 3;
  for (let i = 0; i < SAMPLES.length; i += step) {
    const p = SAMPLES[i];
    for (const side of [-1, 1] as const) {
      for (let k = 0; k < 2; k++) {
        const seed = i * 31 + side * 17 + k * 91;
        const lat = roadClear + 1.2 + ((seed % 80) / 80) * (roadMax - roadClear - 1.2);
        const along = ((seed % 50) / 50 - 0.5) * 4;
        const nx = -p.dirZ;
        const nz = p.dirX;
        const x = p.x + nx * side * lat + p.dirX * along;
        const z = p.z + nz * side * lat + p.dirZ * along;
        if (progressAt(x, z).lateral < roadClear) continue;
        spots.push({
          x,
          z,
          scale: 0.55 + (seed % 40) / 55,
          rot: (seed % 360) * (Math.PI / 180),
          tint: (seed % 100) / 100,
        });
      }
    }
  }
  return spots;
}

function RoadsideBushes() {
  const spots = useMemo(() => buildBushes(), []);
  const ref0 = useRef<THREE.InstancedMesh>(null);
  const ref1 = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => new THREE.SphereGeometry(0.95, 7, 5), []);
  const mat = useMemo(() => bushSolidMaterial(), []);

  useLayoutEffect(() => {
    const meshes = [ref0.current, ref1.current];
    if (meshes.some((m) => !m)) return;
    const tmp = {
      m: new THREE.Matrix4(),
      p: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      s: new THREE.Vector3(),
      e: new THREE.Euler(),
    };
    const tint = new THREE.Color();
    const base = new THREE.Color('#4a7532');
    const hi = new THREE.Color('#6a9440');
    for (let i = 0; i < spots.length; i++) {
      const b = spots[i];
      tint.copy(base).lerp(hi, b.tint);
      setColoredMatrix(
        meshes[0]!,
        i,
        b.x,
        0.5 * b.scale,
        b.z,
        b.rot,
        b.scale * 1.15,
        b.scale * 0.85,
        b.scale * 1.05,
        tint,
        tmp,
      );
      setColoredMatrix(
        meshes[1]!,
        i,
        b.x + Math.cos(b.rot) * 0.35 * b.scale,
        0.42 * b.scale,
        b.z + Math.sin(b.rot) * 0.35 * b.scale,
        b.rot + 0.6,
        b.scale * 0.85,
        b.scale * 0.72,
        b.scale * 0.9,
        tint,
        tmp,
      );
    }
    for (const mesh of meshes) {
      mesh!.instanceMatrix.needsUpdate = true;
      if (mesh!.instanceColor) mesh!.instanceColor.needsUpdate = true;
      mesh!.computeBoundingSphere();
    }
  }, [spots]);

  const n = spots.length;
  if (n === 0) return null;
  return (
    <>
      <instancedMesh ref={ref0} args={[geo, mat, n]} castShadow receiveShadow />
      <instancedMesh ref={ref1} args={[geo, mat, n]} castShadow receiveShadow />
    </>
  );
}

/** Silhueta irregular de floresta no horizonte com gradiente atmosférico. */
function HorizonTreeline() {
  const geo = useMemo(() => {
    let maxR = 0;
    for (const p of SAMPLES) maxR = Math.max(maxR, Math.hypot(p.x, p.z));
    const r = maxR + 250;
    const segs = 96;
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const low = new THREE.Color('#1a3a28');
    const mid = new THREE.Color('#2d5238');
    const hi = new THREE.Color('#4a7050');
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const h =
        32 +
        Math.sin(a * 4.2) * 10 +
        Math.sin(a * 9.5) * 6 +
        Math.sin(a * 17) * 3 +
        ((i * 13) % 7);
      positions.push(Math.cos(a) * r, 0, Math.sin(a) * r);
      positions.push(Math.cos(a) * r, h, Math.sin(a) * r);
      const t = h / 52;
      const c = low.clone().lerp(mid, Math.min(1, t * 1.4)).lerp(hi, Math.max(0, t - 0.5) * 2);
      colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
      if (i < segs) {
        const b = i * 2;
        indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }, []);

  return (
    <mesh geometry={geo} frustumCulled={false}>
      <meshStandardMaterial
        vertexColors
        roughness={1}
        metalness={0}
        envMapIntensity={0.08}
        flatShading
      />
    </mesh>
  );
}

export function Environment() {
  return (
    <>
      <SkyDome />
      <HorizonTreeline />
      <Forest />
      <RoadsideBushes />
    </>
  );
}
