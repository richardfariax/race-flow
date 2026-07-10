import { useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

/**
 * Câmera de perseguição: fica atrás do carro considerando só o yaw
 * (ignora pitch/roll pra não enjoar), com amortecimento independente de framerate.
 */

const OFFSET_BACK = 8.5;
const OFFSET_UP = 3.4;
const LOOK_AHEAD = 3;
const DAMPING = 5;

const carPos = new THREE.Vector3();
const carQuat = new THREE.Quaternion();
const forward = new THREE.Vector3();
const desired = new THREE.Vector3();
const lookTarget = new THREE.Vector3();

export function FollowCamera({ targetRef }: { targetRef: RefObject<THREE.Group | null> }) {
  const initialized = useRef(false);

  useFrame(({ camera }, dt) => {
    const target = targetRef.current;
    if (!target) return;

    target.getWorldPosition(carPos);
    target.getWorldQuaternion(carQuat);

    // frente do carro (+Z local) projetada no plano XZ
    forward.set(0, 0, 1).applyQuaternion(carQuat);
    forward.y = 0;
    if (forward.lengthSq() < 1e-4) forward.set(0, 0, 1);
    forward.normalize();

    desired.copy(carPos).addScaledVector(forward, -OFFSET_BACK);
    desired.y = carPos.y + OFFSET_UP;

    if (!initialized.current) {
      camera.position.copy(desired);
      initialized.current = true;
    } else {
      const t = 1 - Math.exp(-DAMPING * dt);
      camera.position.lerp(desired, t);
    }

    lookTarget.copy(carPos).addScaledVector(forward, LOOK_AHEAD);
    lookTarget.y += 1;
    camera.lookAt(lookTarget);
  });

  return null;
}
