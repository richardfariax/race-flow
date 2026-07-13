import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { NET } from '@shared/protocol';
import { carOrStarter } from '@shared/cars';
import { useGameStore } from '../state/gameStore';
import { remoteBuffers } from '../net/remoteBuffer';
import { useCarParts } from './GlbCar';

/**
 * Carros remotos: interpolação com atraso fixo (~120ms) sobre snapshots do
 * servidor. Sem física/colisão carro-a-carro no MVP.
 */

const posA = new THREE.Vector3();
const posB = new THREE.Vector3();
const quatA = new THREE.Quaternion();
const quatB = new THREE.Quaternion();

function RemoteCar({
  sessionId,
  carId,
  bodyColor,
}: {
  sessionId: string;
  carId: string;
  bodyColor?: string;
  accentColor?: string;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const car = carOrStarter(carId);
  const parts = useCarParts(car.id, bodyColor || car.colors.body);
  const hubs = car.geometry.wheelHubs;

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
      <primitive object={parts.body} />
      {hubs.map(([x, z], i) => (
        <group key={i} position={[x, -0.65, z]}>
          <primitive object={parts.wheels[i]} />
        </group>
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
          <RemoteCar
            key={p.sessionId}
            sessionId={p.sessionId}
            carId={p.carId}
            bodyColor={p.bodyColor}
            accentColor={p.accentColor}
          />
        ))}
    </>
  );
}
