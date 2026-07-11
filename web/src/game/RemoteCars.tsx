import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { NET } from '@shared/protocol';
import { carOrStarter } from '@shared/cars';
import { useGameStore } from '../state/gameStore';
import { remoteBuffers } from '../net/remoteBuffer';
import { toonMaterial, PALETTE } from './toon';

/**
 * Carros remotos: interpolação com atraso fixo (~120ms) sobre snapshots do
 * servidor. Sem física/colisão carro-a-carro no MVP (decisão declarada:
 * colisão com autoridade dividida geraria disputas injustas).
 */

const posA = new THREE.Vector3();
const posB = new THREE.Vector3();
const quatA = new THREE.Quaternion();
const quatB = new THREE.Quaternion();

function RemoteCar({ sessionId, carId }: { sessionId: string; carId: string }) {
  const groupRef = useRef<THREE.Group>(null);
  const car = carOrStarter(carId);

  useFrame(() => {
    const g = groupRef.current;
    const buf = remoteBuffers.get(sessionId);
    if (!g || !buf || buf.length === 0) return;

    const renderT = performance.now() - NET.interpDelayMs;
    let i = buf.length - 1;
    while (i > 0 && buf[i - 1].t > renderT) i--;
    const b = buf[i];
    const a = i > 0 ? buf[i - 1] : b;
    const span = b.t - a.t;
    const alpha = span > 0 ? THREE.MathUtils.clamp((renderT - a.t) / span, 0, 1) : 1;

    posA.set(a.x, a.y, a.z);
    posB.set(b.x, b.y, b.z);
    g.position.copy(posA.lerp(posB, alpha));
    quatA.set(a.qx, a.qy, a.qz, a.qw);
    quatB.set(b.qx, b.qy, b.qz, b.qw);
    g.quaternion.copy(quatA.slerp(quatB, alpha));
  });

  return (
    <group ref={groupRef}>
      <mesh castShadow material={toonMaterial(car.colors.body)}>
        <boxGeometry args={[1.8, 0.55, 3.8]} />
      </mesh>
      <mesh castShadow position={[0, 0.42, -0.25]} material={toonMaterial(car.colors.accent)}>
        <boxGeometry args={[1.35, 0.5, 1.7]} />
      </mesh>
      <mesh castShadow position={[0, 0.05, 1.55]} material={toonMaterial(PALETTE.carDark)}>
        <boxGeometry args={[1.2, 0.28, 0.7]} />
      </mesh>
      {[
        [0.82, 1.25],
        [-0.82, 1.25],
        [0.82, -1.25],
        [-0.82, -1.25],
      ].map(([x, z], i) => (
        <mesh
          key={i}
          castShadow
          position={[x, -0.35, z]}
          rotation={[0, 0, Math.PI / 2]}
          material={toonMaterial(PALETTE.wheel)}
        >
          <cylinderGeometry args={[0.42, 0.42, 0.34, 14]} />
        </mesh>
      ))}
    </group>
  );
}

export function RemoteCars() {
  const standings = useGameStore((s) => s.standings);
  const myId = useGameStore((s) => s.mySessionId);
  return (
    <>
      {standings
        .filter((p) => p.sessionId !== myId)
        .map((p) => (
          <RemoteCar key={p.sessionId} sessionId={p.sessionId} carId={p.carId} />
        ))}
    </>
  );
}
