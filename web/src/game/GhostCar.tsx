import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { loadGhost, ghostRecorder, type GhostData } from './ghost';

/**
 * Ghost do Time Trial: reproduz a SUA melhor volta (localStorage) sincronizada
 * com o cronômetro da volta atual (ghostRecorder.lapStartAt). Some enquanto a
 * volta não começa. Puramente visual — o tempo oficial é o do servidor.
 */

const GHOST_Y = 0.55;

export function GhostCar() {
  const groupRef = useRef<THREE.Group>(null);
  const [ghost, setGhost] = useState<GhostData | null>(() => loadGhost());
  const versionRef = useRef(ghostRecorder.version);

  // recarrega quando uma volta melhor é salva
  useEffect(() => {
    const id = window.setInterval(() => {
      if (ghostRecorder.version !== versionRef.current) {
        versionRef.current = ghostRecorder.version;
        setGhost(loadGhost());
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    if (!ghost || ghost.samples.length < 2 || ghostRecorder.lapStartAt === 0) {
      g.visible = false;
      return;
    }
    const elapsed = performance.now() - ghostRecorder.lapStartAt;
    if (elapsed < 0 || elapsed > ghost.lapMs + 500) {
      g.visible = false;
      return;
    }
    g.visible = true;

    const s = ghost.samples;
    // busca linear leve (samples ~ a cada 80ms)
    let i = 1;
    while (i < s.length && s[i].t < elapsed) i++;
    const b = s[Math.min(i, s.length - 1)];
    const a = s[Math.min(i, s.length - 1) - 1] ?? b;
    const span = b.t - a.t;
    const alpha = span > 0 ? THREE.MathUtils.clamp((elapsed - a.t) / span, 0, 1) : 1;
    g.position.set(
      a.x + (b.x - a.x) * alpha,
      GHOST_Y,
      a.z + (b.z - a.z) * alpha,
    );
    // interpola só yaw (qy,qw)
    const qy = a.qy + (b.qy - a.qy) * alpha;
    const qw = a.qw + (b.qw - a.qw) * alpha;
    const len = Math.hypot(qy, qw) || 1;
    g.quaternion.set(0, qy / len, 0, qw / len);
  });

  return (
    <group ref={groupRef} visible={false}>
      <mesh material={ghostMat}>
        <boxGeometry args={[1.8, 0.7, 3.8]} />
      </mesh>
      <mesh position={[0, 0.5, -0.15]} material={ghostMat}>
        <boxGeometry args={[1.4, 0.5, 1.9]} />
      </mesh>
    </group>
  );
}

const ghostMat = new THREE.MeshBasicMaterial({
  color: '#63e6ff',
  transparent: true,
  opacity: 0.35,
  depthWrite: false,
});
