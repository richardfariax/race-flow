import { useEffect, useRef, type RefObject } from 'react';
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
import { KeyboardInput, type InputSource } from '../input/input';
import { useHudStore } from '../state/hudStore';
import { toonMaterial, PALETTE } from './toon';

/**
 * Carro = chassis dinâmico + DynamicRayCastVehicleController do Rapier
 * (raycast vehicle: rodas são raios com suspensão, caminho testado p/ física crível no browser).
 * Convenção: frente do carro = +Z local.
 */

// Tuning central — cada número afeta a física de verdade.
const CAR = {
  chassisHalf: { x: 0.9, y: 0.35, z: 1.9 },
  mass: 320,
  wheelRadius: 0.42,
  wheelHalfWidth: 0.17,
  suspensionRest: 0.55,
  suspensionStiffness: 32,
  suspensionCompression: 2.4,
  suspensionRelaxation: 3.2,
  maxSuspensionTravel: 0.45,
  frictionSlip: 2.4, // grip longitudinal/lateral base
  sideFrictionStiffness: 1.0,
  engineForce: 5200, // tração traseira
  reverseForce: 3000,
  brakeForce: 45,
  handbrakeForce: 32, // só traseira; derruba grip lateral p/ drift
  handbrakeSideFriction: 0.35,
  maxSteerRad: 0.62,
  steerSpeed: 5.5, // rad/s de resposta do volante
  flipResetSeconds: 2,
};

const SPAWN = {
  position: new THREE.Vector3(50, 1.2, 0),
  // na pista circular (r≈50), tangente em (50,0,0) é +Z; frente do carro = +Z
  rotation: new THREE.Quaternion(),
};

// índices das rodas: 0 FL, 1 FR, 2 RL, 3 RR
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

export function Vehicle({ chassisMeshRef }: { chassisMeshRef: RefObject<THREE.Group | null> }) {
  const chassisRef = useRef<RapierRigidBody>(null);
  const wheelRefs = useRef<(THREE.Group | null)[]>([null, null, null, null]);
  const controllerRef = useRef<DynamicRayCastVehicleController | null>(null);
  const inputRef = useRef<InputSource | null>(null);
  const steerRef = useRef(0);
  const flipTimerRef = useRef(0);
  const { world } = useRapier();
  const setSpeedKmh = useHudStore((s) => s.setSpeedKmh);

  useEffect(() => {
    const chassis = chassisRef.current;
    if (!chassis) return;

    const controller = world.createVehicleController(chassis);
    controller.indexUpAxis = 1; // Y
    controller.setIndexForwardAxis = 2; // Z

    WHEEL_POS.forEach((pos, i) => {
      controller.addWheel(
        pos,
        new THREE.Vector3(0, -1, 0), // direção da suspensão
        new THREE.Vector3(-1, 0, 0), // eixo da roda
        CAR.suspensionRest,
        CAR.wheelRadius,
      );
      controller.setWheelSuspensionStiffness(i, CAR.suspensionStiffness);
      controller.setWheelSuspensionCompression(i, CAR.suspensionCompression);
      controller.setWheelSuspensionRelaxation(i, CAR.suspensionRelaxation);
      controller.setWheelMaxSuspensionTravel(i, CAR.maxSuspensionTravel);
      controller.setWheelFrictionSlip(i, CAR.frictionSlip);
      controller.setWheelSideFrictionStiffness(i, CAR.sideFrictionStiffness);
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
  }, [world]);

  const respawn = () => {
    const chassis = chassisRef.current;
    if (!chassis) return;
    chassis.setTranslation(SPAWN.position, true);
    chassis.setRotation(SPAWN.rotation, true);
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

    const state = input.read();
    const dt = world.timestep;

    // volante com resposta suave + sensibilidade reduzida em alta velocidade
    const speed = controller.currentVehicleSpeed();
    const speedFactor = 1 / (1 + Math.abs(speed) * 0.035);
    const targetSteer = state.steer * CAR.maxSteerRad * speedFactor;
    const maxDelta = CAR.steerSpeed * dt;
    steerRef.current += THREE.MathUtils.clamp(targetSteer - steerRef.current, -maxDelta, maxDelta);
    FRONT.forEach((i) => controller.setWheelSteering(i, steerRef.current));

    // aceleração/ré na traseira; freio quando inverte o sentido
    const movingForward = speed > 0.5;
    const movingBack = speed < -0.5;
    let engine = 0;
    let brake = 0;
    if (state.throttle > 0) {
      if (movingBack) brake = CAR.brakeForce;
      else engine = CAR.engineForce * state.throttle;
    } else if (state.throttle < 0) {
      if (movingForward) brake = CAR.brakeForce;
      else engine = CAR.reverseForce * state.throttle;
    }
    REAR.forEach((i) => {
      controller.setWheelEngineForce(i, engine);
      controller.setWheelBrake(i, brake + (state.handbrake ? CAR.handbrakeForce : 0));
      controller.setWheelSideFrictionStiffness(
        i,
        state.handbrake ? CAR.handbrakeSideFriction : CAR.sideFrictionStiffness,
      );
    });
    FRONT.forEach((i) => controller.setWheelBrake(i, brake));

    controller.updateVehicle(dt);

    // reset manual (R), capotado por N segundos, ou caiu do mundo
    const rot = chassis.rotation();
    tmpQuat.set(rot.x, rot.y, rot.z, rot.w);
    tmpVec.copy(UP).applyQuaternion(tmpQuat);
    const upsideDown = tmpVec.y < 0.15 && Math.abs(speed) < 2;
    flipTimerRef.current = upsideDown ? flipTimerRef.current + dt : 0;
    if (state.reset || flipTimerRef.current > CAR.flipResetSeconds || chassis.translation().y < -10) {
      respawn();
    }
  });

  useFrame(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    setSpeedKmh(Math.abs(controller.currentVehicleSpeed()) * 3.6);

    // rodas: posição pela suspensão, giro e esterço
    for (let i = 0; i < 4; i++) {
      const g = wheelRefs.current[i];
      if (!g) continue;
      const suspension = controller.wheelSuspensionLength(i) ?? CAR.suspensionRest;
      g.position.set(WHEEL_POS[i].x, WHEEL_POS[i].y - suspension, WHEEL_POS[i].z);
      g.rotation.set(0, controller.wheelSteering(i) ?? 0, 0);
      const spin = controller.wheelRotation(i) ?? 0;
      g.children[0]?.rotation.set(-spin, 0, Math.PI / 2);
    }
  });

  return (
    <RigidBody
      ref={chassisRef}
      position={SPAWN.position.toArray()}
      colliders={false}
      canSleep={false}
      type="dynamic"
    >
      <CuboidCollider
        args={[CAR.chassisHalf.x, CAR.chassisHalf.y, CAR.chassisHalf.z]}
        mass={CAR.mass}
      />
      <group ref={chassisMeshRef}>
        {/* corpo */}
        <mesh castShadow material={toonMaterial(PALETTE.carBody)}>
          <boxGeometry args={[CAR.chassisHalf.x * 2, 0.55, CAR.chassisHalf.z * 2]} />
        </mesh>
        {/* cabine */}
        <mesh castShadow position={[0, 0.42, -0.25]} material={toonMaterial(PALETTE.carAccent)}>
          <boxGeometry args={[1.35, 0.5, 1.7]} />
        </mesh>
        {/* capô/nariz (marca a frente +Z) */}
        <mesh castShadow position={[0, 0.05, 1.55]} material={toonMaterial(PALETTE.carDark)}>
          <boxGeometry args={[1.2, 0.28, 0.7]} />
        </mesh>
        {/* aerofólio traseiro */}
        <mesh castShadow position={[0, 0.55, -1.75]} material={toonMaterial(PALETTE.carDark)}>
          <boxGeometry args={[1.6, 0.08, 0.45]} />
        </mesh>
        {/* outline cartoon barato (casco invertido) */}
        <mesh scale={[1.06, 1.12, 1.03]}>
          <boxGeometry args={[CAR.chassisHalf.x * 2, 0.55, CAR.chassisHalf.z * 2]} />
          <meshBasicMaterial color="#1a1a2e" side={THREE.BackSide} />
        </mesh>
        {/* rodas (visuais; a física é raycast) */}
        {WHEEL_POS.map((_, i) => (
          <group key={i} ref={(el) => (wheelRefs.current[i] = el)}>
            <mesh castShadow material={toonMaterial(PALETTE.wheel)} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry
                args={[CAR.wheelRadius, CAR.wheelRadius, CAR.wheelHalfWidth * 2, 18]}
              />
            </mesh>
          </group>
        ))}
      </group>
    </RigidBody>
  );
}
