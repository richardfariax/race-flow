import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import {
  RigidBody,
  CuboidCollider,
  useRapier,
  useBeforePhysicsStep,
  type RapierRigidBody,
} from '@react-three/rapier';
import type { DynamicRayCastVehicleController } from '@dimforge/rapier3d-compat';
import type { CarSpec } from '@shared/cars';
import { effectiveSpec, type Tuning } from '@shared/tuning';
import { KeyboardInput, type InputSource } from '../input/input';
import { useHudStore } from '../state/hudStore';
import { useGameStore, type SpawnPose } from '../state/gameStore';
import { localCar } from '../net/localCar';
import { toonMaterial, PALETTE } from './toon';

/**
 * Carro local = chassis dinâmico + DynamicRayCastVehicleController do Rapier.
 * Online: este carro é a predição; o servidor valida e pode mandar correção.
 * Convenção: frente do carro = +Z local.
 */

// geometria/suspensão comuns; forças e grip vêm do CarSpec
const BASE = {
  chassisHalf: { x: 0.9, y: 0.35, z: 1.9 },
  wheelRadius: 0.42,
  wheelHalfWidth: 0.17,
  suspensionRest: 0.55,
  suspensionCompression: 2.4,
  suspensionRelaxation: 3.2,
  maxSuspensionTravel: 0.45,
  sideFrictionStiffness: 1.0,
  flipResetSeconds: 2,
  /** μ da tração: força de motor acima de μ×carga no eixo vira patinação */
  tractionMu: 1.15,
};

// índices: 0 FL, 1 FR, 2 RL, 3 RR
const WHEEL_POS = [
  new THREE.Vector3(0.82, -0.1, 1.25),
  new THREE.Vector3(-0.82, -0.1, 1.25),
  new THREE.Vector3(0.82, -0.1, -1.25),
  new THREE.Vector3(-0.82, -0.1, -1.25),
];
const FRONT = [0, 1];
const REAR = [2, 3];

const UP = new THREE.Vector3(0, 1, 0);
const tmpVec = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();

interface VehicleProps {
  chassisMeshRef: RefObject<THREE.Group | null>;
  car: CarSpec;
  tuning?: Tuning;
  spawn: SpawnPose;
  online: boolean;
}

export function Vehicle({ chassisMeshRef, car, tuning, spawn, online }: VehicleProps) {
  const chassisRef = useRef<RapierRigidBody>(null);
  const wheelRefs = useRef<(THREE.Group | null)[]>([null, null, null, null]);
  const controllerRef = useRef<DynamicRayCastVehicleController | null>(null);
  const inputRef = useRef<InputSource | null>(null);
  const steerRef = useRef(0);
  const flipTimerRef = useRef(0);
  const slipRef = useRef(0); // 0..1: quanto da força pedida está patinando
  const slipSpinRef = useRef(0); // giro visual extra das rodas traseiras
  const { world } = useRapier();
  const setSpeedKmh = useHudStore((s) => s.setSpeedKmh);

  const tuningKey = JSON.stringify(tuning ?? {});
  const phys = useMemo(
    () => effectiveSpec(car, tuning).physics,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [car.id, tuningKey],
  );
  const spawnQuat = new THREE.Quaternion().setFromAxisAngle(UP, spawn.yaw);

  useEffect(() => {
    const chassis = chassisRef.current;
    if (!chassis) return;

    const controller = world.createVehicleController(chassis);
    controller.indexUpAxis = 1; // Y
    controller.setIndexForwardAxis = 2; // Z

    WHEEL_POS.forEach((pos, i) => {
      controller.addWheel(
        pos,
        new THREE.Vector3(0, -1, 0),
        new THREE.Vector3(-1, 0, 0),
        BASE.suspensionRest,
        BASE.wheelRadius,
      );
      controller.setWheelSuspensionStiffness(i, phys.suspensionStiffness);
      controller.setWheelSuspensionCompression(i, BASE.suspensionCompression);
      controller.setWheelSuspensionRelaxation(i, BASE.suspensionRelaxation);
      controller.setWheelMaxSuspensionTravel(i, BASE.maxSuspensionTravel);
      controller.setWheelFrictionSlip(i, phys.frictionSlip);
      controller.setWheelSideFrictionStiffness(i, BASE.sideFrictionStiffness);
    });

    controllerRef.current = controller;
    const input = new KeyboardInput();
    inputRef.current = input;

    return () => {
      controllerRef.current = null;
      world.removeVehicleController(controller);
      input.dispose();
      inputRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, phys]);

  /**
   * Reset: online endireita NO LUGAR (teleporte p/ longe seria rejeitado pelo
   * servidor — anti-cheat); no treino volta ao spawn.
   */
  const reset = () => {
    const chassis = chassisRef.current;
    if (!chassis) return;
    if (online) {
      const t = chassis.translation();
      chassis.setTranslation({ x: t.x, y: t.y + 1.2, z: t.z }, true);
      const rot = chassis.rotation();
      tmpQuat.set(rot.x, rot.y, rot.z, rot.w);
      const yaw = 2 * Math.atan2(tmpQuat.y, tmpQuat.w);
      chassis.setRotation(new THREE.Quaternion().setFromAxisAngle(UP, yaw), true);
    } else {
      chassis.setTranslation({ x: spawn.x, y: spawn.y, z: spawn.z }, true);
      chassis.setRotation(new THREE.Quaternion().setFromAxisAngle(UP, spawn.yaw), true);
    }
    chassis.setLinvel({ x: 0, y: 0, z: 0 }, true);
    chassis.setAngvel({ x: 0, y: 0, z: 0 }, true);
    steerRef.current = 0;
    flipTimerRef.current = 0;
  };

  useBeforePhysicsStep(() => {
    const controller = controllerRef.current;
    const chassis = chassisRef.current;
    const input = inputRef.current;
    if (!controller || !chassis || !input) return;

    // correção do servidor (estado rejeitado): acata e zera velocidades
    if (localCar.correction) {
      const c = localCar.correction;
      localCar.correction = null;
      chassis.setTranslation({ x: c.x, y: c.y, z: c.z }, true);
      chassis.setRotation({ x: c.qx, y: c.qy, z: c.qz, w: c.qw }, true);
      chassis.setLinvel({ x: 0, y: 0, z: 0 }, true);
      chassis.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }

    const state = input.read();
    const dt = world.timestep;

    // online: só dirige durante a corrida (largada presa no grid)
    const phase = useGameStore.getState().phase;
    const driveAllowed = !online || phase === 'racing' || phase === 'finished';
    const throttle = driveAllowed ? state.throttle : 0;
    const steerInput = driveAllowed ? state.steer : 0;
    const handbrake = driveAllowed ? state.handbrake : true;

    const speed = controller.currentVehicleSpeed();
    const speedFactor = 1 / (1 + Math.abs(speed) * 0.035);
    const targetSteer = steerInput * phys.maxSteerRad * speedFactor;
    const maxDelta = phys.steerSpeed * dt;
    steerRef.current += THREE.MathUtils.clamp(targetSteer - steerRef.current, -maxDelta, maxDelta);
    FRONT.forEach((i) => controller.setWheelSteering(i, steerRef.current));

    const movingForward = speed > 0.5;
    const movingBack = speed < -0.5;
    let engine = 0; // força TOTAL no eixo traseiro
    let brake = 0;
    if (throttle > 0) {
      if (movingBack) brake = phys.brakeForce;
      else engine = phys.engineForce * throttle;
    } else if (throttle < 0) {
      if (movingForward) brake = phys.brakeForce;
      else engine = phys.reverseForce * throttle;
    }

    // Tração limitada pelo peso sobre o eixo traseiro: pedir mais força do que
    // μ×carga não empina o carro — PATINA (arrancada vira burnout, e sem
    // contato no chão não há empuxo nenhum).
    let applied = engine;
    slipRef.current = 0;
    if (engine !== 0) {
      const rearLoad = REAR.reduce(
        (sum, i) =>
          sum + (controller.wheelIsInContact(i) ? controller.wheelSuspensionForce(i) ?? 0 : 0),
        0,
      );
      const maxTraction = BASE.tractionMu * rearLoad;
      const wanted = Math.abs(engine);
      if (wanted > maxTraction) {
        applied = Math.sign(engine) * maxTraction;
        slipRef.current = 1 - maxTraction / wanted;
      }
    }

    // patinando o carro fica levemente solto de traseira (powerslide)
    const rearSideFriction = handbrake
      ? phys.handbrakeSideFriction
      : BASE.sideFrictionStiffness * (1 - 0.4 * slipRef.current);

    REAR.forEach((i) => {
      controller.setWheelEngineForce(i, applied / 2);
      controller.setWheelBrake(i, brake + (handbrake ? phys.handbrakeForce : 0));
      controller.setWheelSideFrictionStiffness(i, rearSideFriction);
    });
    FRONT.forEach((i) => controller.setWheelBrake(i, brake));

    controller.updateVehicle(dt);

    // reset manual (R), capotado, ou caiu do mundo
    const rot = chassis.rotation();
    tmpQuat.set(rot.x, rot.y, rot.z, rot.w);
    tmpVec.copy(UP).applyQuaternion(tmpQuat);
    const upsideDown = tmpVec.y < 0.15 && Math.abs(speed) < 2;
    flipTimerRef.current = upsideDown ? flipTimerRef.current + dt : 0;
    if (state.reset || flipTimerRef.current > BASE.flipResetSeconds || chassis.translation().y < -10) {
      reset();
    }
  });

  useFrame((_state, frameDt) => {
    const controller = controllerRef.current;
    if (!controller) return;
    setSpeedKmh(Math.abs(controller.currentVehicleSpeed()) * 3.6);

    // giro visual extra das rodas traseiras enquanto patinam
    slipSpinRef.current += slipRef.current * 45 * frameDt;

    // publica transform interpolado p/ a rede
    const mesh = chassisMeshRef.current;
    if (mesh) {
      mesh.getWorldPosition(localCar.position);
      mesh.getWorldQuaternion(localCar.quaternion);
      localCar.speed = controller.currentVehicleSpeed();
      localCar.hasData = true;
    }

    for (let i = 0; i < 4; i++) {
      const g = wheelRefs.current[i];
      if (!g) continue;
      const suspension = controller.wheelSuspensionLength(i) ?? BASE.suspensionRest;
      g.position.set(WHEEL_POS[i].x, WHEEL_POS[i].y - suspension, WHEEL_POS[i].z);
      g.rotation.set(0, controller.wheelSteering(i) ?? 0, 0);
      const spin = (controller.wheelRotation(i) ?? 0) + (REAR.includes(i) ? slipSpinRef.current : 0);
      g.children[0]?.rotation.set(-spin, 0, Math.PI / 2);
    }
  });

  return (
    <RigidBody
      ref={chassisRef}
      position={[spawn.x, spawn.y, spawn.z]}
      quaternion={[spawnQuat.x, spawnQuat.y, spawnQuat.z, spawnQuat.w]}
      colliders={false}
      canSleep={false}
      type="dynamic"
    >
      {/* massa dividida: casco leve + lastro embaixo → centro de massa baixo
          (carro não empina nem tomba fácil; física de kart arcade crível) */}
      <CuboidCollider
        args={[BASE.chassisHalf.x, BASE.chassisHalf.y, BASE.chassisHalf.z]}
        mass={phys.mass * 0.35}
      />
      <CuboidCollider
        args={[BASE.chassisHalf.x * 0.85, 0.1, BASE.chassisHalf.z * 0.8]}
        position={[0, -0.3, 0]}
        mass={phys.mass * 0.65}
      />
      <group ref={chassisMeshRef}>
        <mesh castShadow material={toonMaterial(car.colors.body)}>
          <boxGeometry args={[BASE.chassisHalf.x * 2, 0.55, BASE.chassisHalf.z * 2]} />
        </mesh>
        <mesh castShadow position={[0, 0.42, -0.25]} material={toonMaterial(car.colors.accent)}>
          <boxGeometry args={[1.35, 0.5, 1.7]} />
        </mesh>
        <mesh castShadow position={[0, 0.05, 1.55]} material={toonMaterial(PALETTE.carDark)}>
          <boxGeometry args={[1.2, 0.28, 0.7]} />
        </mesh>
        <mesh castShadow position={[0, 0.55, -1.75]} material={toonMaterial(PALETTE.carDark)}>
          <boxGeometry args={[1.6, 0.08, 0.45]} />
        </mesh>
        <mesh scale={[1.06, 1.12, 1.03]}>
          <boxGeometry args={[BASE.chassisHalf.x * 2, 0.55, BASE.chassisHalf.z * 2]} />
          <meshBasicMaterial color="#1a1a2e" side={THREE.BackSide} />
        </mesh>
        {WHEEL_POS.map((_, i) => (
          <group key={i} ref={(el) => (wheelRefs.current[i] = el)}>
            <mesh castShadow material={toonMaterial(PALETTE.wheel)} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry
                args={[BASE.wheelRadius, BASE.wheelRadius, BASE.wheelHalfWidth * 2, 18]}
              />
            </mesh>
          </group>
        ))}
      </group>
    </RigidBody>
  );
}
