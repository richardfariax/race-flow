import { useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

/**
 * Sistema de partículas único para a cena (fumaça de pneu, poeira, escape).
 * Pool fixo + ShaderMaterial com alpha por partícula e sprite circular macio —
 * sem alocação por frame, sem assets. Vehicle/RemoteCars chamam `emitSmoke`.
 */

const MAX = 500;

interface Pool {
  pos: Float32Array; // xyz
  vel: Float32Array; // xyz
  col: Float32Array; // rgb
  alpha: Float32Array;
  size: Float32Array;
  life: Float32Array;
  maxLife: Float32Array;
  head: number;
  geom: THREE.BufferGeometry;
}

let pool: Pool | null = null;

function ensurePool(): Pool {
  if (pool) return pool;
  const pos = new Float32Array(MAX * 3);
  const col = new Float32Array(MAX * 3);
  const alpha = new Float32Array(MAX);
  const size = new Float32Array(MAX);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geom.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geom.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  geom.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geom.setDrawRange(0, MAX);
  pool = {
    pos,
    vel: new Float32Array(MAX * 3),
    col,
    alpha,
    size,
    life: new Float32Array(MAX),
    maxLife: new Float32Array(MAX),
    head: 0,
    geom,
  };
  return pool;
}

interface EmitOpts {
  color?: [number, number, number];
  size?: number;
  life?: number;
  spread?: number;
  rise?: number;
  count?: number;
}

/** Emite `count` partículas ao redor de (x,y,z). Chamável de qualquer lugar. */
export function emitSmoke(x: number, y: number, z: number, opts: EmitOpts = {}): void {
  const p = ensurePool();
  const color = opts.color ?? [0.85, 0.85, 0.88];
  const size = opts.size ?? 1.2;
  const life = opts.life ?? 0.7;
  const spread = opts.spread ?? 0.35;
  const rise = opts.rise ?? 1.2;
  const count = opts.count ?? 1;
  for (let k = 0; k < count; k++) {
    const i = p.head;
    p.head = (p.head + 1) % MAX;
    const i3 = i * 3;
    p.pos[i3] = x + (Math.random() - 0.5) * spread;
    p.pos[i3 + 1] = y + Math.random() * 0.1;
    p.pos[i3 + 2] = z + (Math.random() - 0.5) * spread;
    p.vel[i3] = (Math.random() - 0.5) * 0.8;
    p.vel[i3 + 1] = rise + Math.random() * rise * 0.5;
    p.vel[i3 + 2] = (Math.random() - 0.5) * 0.8;
    const jitter = 0.9 + Math.random() * 0.2;
    p.col[i3] = color[0] * jitter;
    p.col[i3 + 1] = color[1] * jitter;
    p.col[i3 + 2] = color[2] * jitter;
    p.size[i] = size * (0.7 + Math.random() * 0.6);
    p.alpha[i] = 0.55;
    p.maxLife[i] = life;
    p.life[i] = life;
  }
}

const vertexShader = `
attribute vec3 aColor;
attribute float aAlpha;
attribute float aSize;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * 300.0 / max(-mv.z, 1.0);
  gl_Position = projectionMatrix * mv;
}`;

const fragmentShader = `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = length(d);
  if (r > 0.5) discard;
  float a = smoothstep(0.5, 0.15, r) * vAlpha;
  gl_FragColor = vec4(vColor, a);
}`;

export function Particles() {
  const p = useMemo(() => ensurePool(), []);

  useFrame((_s, dt) => {
    const d = Math.min(dt, 0.05);
    for (let i = 0; i < MAX; i++) {
      if (p.life[i] <= 0) {
        if (p.alpha[i] !== 0) {
          p.alpha[i] = 0;
          p.size[i] = 0;
        }
        continue;
      }
      p.life[i] -= d;
      const i3 = i * 3;
      p.pos[i3] += p.vel[i3] * d;
      p.pos[i3 + 1] += p.vel[i3 + 1] * d;
      p.pos[i3 + 2] += p.vel[i3 + 2] * d;
      p.vel[i3] *= 0.94;
      p.vel[i3 + 2] *= 0.94;
      p.vel[i3 + 1] *= 0.96;
      const f = Math.max(0, p.life[i] / p.maxLife[i]);
      p.alpha[i] = 0.55 * f;
      p.size[i] += d * 1.4; // expande ao dissipar
    }
    p.geom.attributes.position.needsUpdate = true;
    p.geom.attributes.aColor.needsUpdate = true;
    p.geom.attributes.aAlpha.needsUpdate = true;
    p.geom.attributes.aSize.needsUpdate = true;
  });

  // material de shader (memo para não recriar)
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.NormalBlending,
      }),
    [],
  );

  return <points geometry={p.geom} material={material} frustumCulled={false} />;
}
