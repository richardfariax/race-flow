import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { localCar } from '../net/localCar';

const OFFSET_BACK = 8.5;
const OFFSET_UP = 3.4;
const LOOK_AHEAD = 3;
const FOLLOW_DAMPING = 11;
const BASE_FOV = 52;

const SPEED_DIST_MAX = 1.1;
const SPEED_FOV_MAX = 2.5;
const SPEED_REF_MS = 42;
const SPEED_ZOOM_DAMPING = 2.2;

const LOOK_SENS = 0.0038;
const LOOK_YAW_MAX = Math.PI * 0.9;
const LOOK_PITCH_MIN = -0.35;
const LOOK_PITCH_MAX = 0.55;
const LOOK_IDLE_RETURN = 0.32;
const LOOK_RETURN_DAMPING = 5.5;
const LOOK_DEADZONE = 0.35;

const carPos = new THREE.Vector3();
const carQuat = new THREE.Quaternion();
const forward = new THREE.Vector3();
const desired = new THREE.Vector3();
const lookTarget = new THREE.Vector3();

export function FollowCamera({ targetRef }: { targetRef: RefObject<THREE.Group | null> }) {
  const gl = useThree((s) => s.gl);
  const initialized = useRef(false);
  const lookYaw = useRef(0);
  const lookPitch = useRef(0);
  const idleTimer = useRef(LOOK_IDLE_RETURN);
  const speedBack = useRef(0);
  const speedFov = useRef(0);
  const pointerOver = useRef(false);

  useEffect(() => {
    const el = gl.domElement;

    const onContextMenu = (e: Event) => e.preventDefault();

    const onPointerEnter = () => {
      pointerOver.current = true;
    };

    const onPointerLeave = () => {
      pointerOver.current = false;
      idleTimer.current = LOOK_IDLE_RETURN;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!pointerOver.current) return;
      if (Math.abs(e.movementX) < LOOK_DEADZONE && Math.abs(e.movementY) < LOOK_DEADZONE) return;

      lookYaw.current = THREE.MathUtils.clamp(
        lookYaw.current - e.movementX * LOOK_SENS,
        -LOOK_YAW_MAX,
        LOOK_YAW_MAX,
      );
      lookPitch.current = THREE.MathUtils.clamp(
        lookPitch.current + e.movementY * LOOK_SENS,
        LOOK_PITCH_MIN,
        LOOK_PITCH_MAX,
      );
      idleTimer.current = 0;
    };

    const onBlur = () => {
      idleTimer.current = LOOK_IDLE_RETURN;
    };

    el.addEventListener('contextmenu', onContextMenu);
    el.addEventListener('pointerenter', onPointerEnter);
    el.addEventListener('pointerleave', onPointerLeave);
    el.addEventListener('pointermove', onPointerMove);
    window.addEventListener('blur', onBlur);

    return () => {
      el.removeEventListener('contextmenu', onContextMenu);
      el.removeEventListener('pointerenter', onPointerEnter);
      el.removeEventListener('pointerleave', onPointerLeave);
      el.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('blur', onBlur);
    };
  }, [gl]);

  useFrame(({ camera }, dt) => {
    const target = targetRef.current;
    if (!target) return;

    const dtClamped = Math.min(dt, 0.05);

    if (idleTimer.current >= LOOK_IDLE_RETURN) {
      const rt = 1 - Math.exp(-LOOK_RETURN_DAMPING * dtClamped);
      lookYaw.current = THREE.MathUtils.lerp(lookYaw.current, 0, rt);
      lookPitch.current = THREE.MathUtils.lerp(lookPitch.current, 0, rt);
    } else {
      idleTimer.current += dtClamped;
    }

    target.getWorldPosition(carPos);
    target.getWorldQuaternion(carQuat);

    forward.set(0, 0, 1).applyQuaternion(carQuat);
    forward.y = 0;
    if (forward.lengthSq() < 1e-4) forward.set(0, 0, 1);
    forward.normalize();

    const carYaw = Math.atan2(forward.x, forward.z);
    const camYaw = carYaw + lookYaw.current;

    const speedT = THREE.MathUtils.clamp(Math.abs(localCar.speed) / SPEED_REF_MS, 0, 1);
    const zoomT = 1 - Math.exp(-SPEED_ZOOM_DAMPING * dtClamped);
    speedBack.current = THREE.MathUtils.lerp(speedBack.current, speedT * SPEED_DIST_MAX, zoomT);
    speedFov.current = THREE.MathUtils.lerp(speedFov.current, speedT * SPEED_FOV_MAX, zoomT);

    const back = OFFSET_BACK + speedBack.current;
    const up = OFFSET_UP + lookPitch.current * 2.8;

    desired.set(
      carPos.x - Math.sin(camYaw) * back,
      carPos.y + up,
      carPos.z - Math.cos(camYaw) * back,
    );

    if (!initialized.current) {
      camera.position.copy(desired);
      initialized.current = true;
    } else {
      const t = 1 - Math.exp(-FOLLOW_DAMPING * dtClamped);
      camera.position.lerp(desired, t);
    }

    const lookYawBlend = lookYaw.current * 0.65;
    const lookDirYaw = carYaw + lookYawBlend;
    lookTarget.set(
      carPos.x + Math.sin(lookDirYaw) * LOOK_AHEAD,
      carPos.y + 1 + lookPitch.current * 1.4,
      carPos.z + Math.cos(lookDirYaw) * LOOK_AHEAD,
    );
    camera.lookAt(lookTarget);

    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = BASE_FOV + speedFov.current;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}
