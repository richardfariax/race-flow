import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { SAMPLES } from '@shared/track';

/**
 * Ambiente da Nürburgring GP: céu procedural + linha de árvores no horizonte.
 * Vegetação/terreno próximos vêm do próprio GLB do circuito (Track.tsx).
 */

/**
 * A cúpula segue a câmera, então o raio só precisa envolver o alcance visível
 * (fog termina em 3200) e ficar dentro do far-plane (3600). Fixa na origem, a
 * pista de ~1,7 km deixava o carro fora da cúpula nos extremos.
 */
const SKY_RADIUS = 3300;

function SkyDome() {
  const ref = useRef<THREE.Mesh>(null);
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
        varying vec3 vDir;
        void main() {
          // direção local da esfera — independe da translação (segue a câmera)
          vDir = normalize(position);
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
        varying vec3 vDir;

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
          vec3 dir = normalize(vDir);
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

          // horizonte na cor da névoa (#a8c4b4) p/ emendar sem costura no fog
          float horizon = exp(-abs(dir.y) * 6.5);
          col = mix(col, vec3(0.66, 0.77, 0.71), horizon * 0.5);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
  }, []);

  // a cúpula acompanha a câmera para envolvê-la em qualquer ponto da pista
  useFrame((state) => {
    if (ref.current) ref.current.position.copy(state.camera.position);
  });

  return (
    <mesh ref={ref} frustumCulled={false} renderOrder={-1000}>
      <sphereGeometry args={[SKY_RADIUS, 48, 24]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}

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
        56 +
        Math.sin(a * 4.2) * 14 +
        Math.sin(a * 9.5) * 8 +
        Math.sin(a * 17) * 4 +
        ((i * 13) % 9);
      positions.push(Math.cos(a) * r, 0, Math.sin(a) * r);
      positions.push(Math.cos(a) * r, h, Math.sin(a) * r);
      const t = h / 90;
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
    </>
  );
}
