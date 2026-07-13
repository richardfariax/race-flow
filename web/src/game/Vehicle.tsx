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
import { carBoostBarMax } from '@shared/cars';
import { effectiveSpec, type Tuning } from '@shared/tuning';
import {
  createDriveState,
  stepDrivetrain,
  speedDragForce,
  reverseRpmFromSpeed,
  nextIdleTarget,
  type DriveSimState,
} from '@shared/drivetrain';
import { rapierServiceBrakes, rapierHandbrakeRear } from '@shared/braking';
import { resolveVehicleDrive, type VehicleDriveMode } from '@shared/vehicleDrive';
import { heightAt, isOnDriveable, isOnRoad, surfaceAt } from '@shared/track';
import { KeyboardInput, type InputSource } from '../input/input';
import { useHudStore } from '../state/hudStore';
import { useGameStore, type SpawnPose } from '../state/gameStore';
import { localCar } from '../net/localCar';
import { useCarParts } from './GlbCar';
import { WHEEL_REST_Y } from './carVisuals';
import { carAudio } from './audio';
import { emitSmoke } from './Particles';
import { ghostRecorder } from './ghost';

/**
 * Carro local = chassis dinâmico + DynamicRayCastVehicleController do Rapier.
 * Tração via drivetrain; freio com transferência de peso + teto μ·N.
 * Dive de freada respeita o curso máx. da suspensão (batente).
 */

const BASE = {
  wheelHalfWidth: 0.1,
  /** comprimento em repouso — attachment fica em WHEEL_REST_Y + isto */
  suspensionRest: 0.52,
  suspensionCompression: 5.4,
  suspensionRelaxation: 5.8,
  /** curso útil (~16 cm) — dive de freada até o batente, sem atravessar */
  maxSuspensionTravel: 0.16,
  frontSuspensionMul: 1.05,
  rearSuspensionMul: 1.0,
  sideFrictionStiffness: 1.15,
  flipResetSeconds: 2,
  launchGripBase: 7.2,
  launchSlipMaxSpeed: 11,
  /** frictionSlip traseiro com roda travada (quase zero = lock) */
  handbrakeSlipFactor: 0.12,
  /** bias frente/traseira */
  frontBrakeBias: 0.58,
  yawDampGain: 0.004,
  /** ângulo de derrapagem sem freio de mão (~27°) */
  slipAngleSoftCap: 0.48,
  /** ângulo máx. de drift com freio de mão (~32° em alta) */
  handbrakeDriftCap: 0.56,
  pitchDampGain: 0.035,
  antiWheeliePitch: 0.045,
  antiWheelieForceCut: 0.35,
  /** rampa do pedal de freio (1/s) — leve atraso hidráulico */
  brakePedalRate: 14,
  /** engate do freio de mão (1/s) — ~0,1 s até travar */
  handbrakePedalRate: 10,
  handbrakeReleaseRate: 12,
  /**
   * Após soltar o freio de mão: hold 0..1 mantém traseira leve (powerslide).
   * Gás sustenta; endireitar / frear recupera grip.
   */
  driftHoldCharge: 2.8,
  driftHoldDecay: 0.72,
  driftHoldThrottleSustain: 0.38,
  driftHoldSideBlend: 0.68,
  /** ângulo lateral memorizado no hold (~30°) */
  driftHoldSlipCap: 0.5,
  /** yaw PD durante drift — volante pede rotação, não ângulo absoluto */
  driftYawKp: 0.018,
  driftYawKd: 0.016,
  /** contra-esterço + gás: segura o deslize lateral */
  driftCounterKp: 0.032,
  driftCounterKd: 0.022,
  /** sustenta velocidade lateral com acelerador (ir de lado) */
  driftLatSustain: 0.011,
  /** impulso na direção do movimento (momentum do deslize) */
  driftVelCarry: 0.0016,
  /** entrada com freio de mão: abre drift na direção do volante (fraco) */
  driftEntryGain: 0.22,
  /** autoridade máx. do volante no drift (evita lock = spin) */
  driftSteerAuthority: 0.4,
  /** grip dianteiro extra no drift — volante responde, traseira escorrega */
  driftFrontGripMul: 1.14,
  engineBrakeFactor: 0.1,
  /** PD anti-dive na freada — suave para não brigar com a suspensão */
  brakePitchKp: 2.2,
  brakePitchKd: 1.1,
  offRoadEngineFactor: 0.45,
  offRoadBrakeFactor: 0.65,
  /**
   * Reduz ângulo máx. com a velocidade (1/(1+v·k)).
   * Em ~100 km/h (~28 m/s) fica ~40% do lock; em 200 km/h ~25%.
   */
  steerSpeedFalloff: 0.078,
  /** Rampa do input A/D (1/s) — tempo de virar o volante ~0,35 s */
  steerInputRate: 2.85,
  /** Retorno ao centro mais rápido (self-aligning) */
  steerReturnRate: 4.4,
  /** Fração da taxa de esterçamento que sobra em alta velocidade */
  steerRespMin: 0.26,
  /** reduz lock quando já está derrapando (evita oversteer em curva normal) */
  steerSlipCutAngle: 0.38,
  /** acima de ~80 km/h: corte extra de direção e yaw */
  highSpeedSteerStart: 22,
  highSpeedSteerGain: 0.048,
  stabP: 11,
  stabD: 4.5,
  /** impulso extra ao encostar — elimina “creep” nos últimos cm/s */
  creepBrakeGain: 4.2,
  creepBrakeMaxSpeed: 3.5,
  /** teto de velocidade em ré (~30% da vmax) */
  reverseSpeedFrac: 0.32,
};

const FRONT = [0, 1];
const REAR = [2, 3];

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** 0 parado → 1 em ~72 km/h */
function driftSpeedBlend(absSpeedMs: number): number {
  return clamp((absSpeedMs - 5) / 15, 0, 1);
}

/** 1 em baixa → ~0,25 em 250 km/h — controle em alta */
function highSpeedDamp(absSpeedMs: number): number {
  const over = Math.max(0, absSpeedMs - BASE.highSpeedSteerStart);
  return 1 / (1 + over * BASE.highSpeedSteerGain);
}

/** Volante no drift: curva suave — lock cheio ≠ autoridade cheia */
function driftSteerAuthority(steerNorm: number, maxAuth: number): number {
  const s = clamp(steerNorm, -1, 1);
  const curved = Math.sign(s) * (1 - Math.exp(-Math.abs(s) * 2.6));
  return curved * maxAuth;
}

/** Teto de yaw (rad/s) — bem menor em alta velocidade */
function maxYawAtSpeed(absSpeedMs: number, intensity: number): number {
  const damp = highSpeedDamp(absSpeedMs);
  const base = 0.78 / (1 + absSpeedMs * 0.062);
  return base * (0.38 + 0.62 * intensity) * damp;
}

/**
 * Ângulo lateral máximo: pico em ~65 km/h, cai em alta (drift controlável).
 * Em 200+ km/h o carro ainda desliza, mas com ângulo menor.
 */
function maxDriftSlipAtSpeed(
  absSpeedMs: number,
  intensity: number,
  entry: boolean,
): number {
  const cap = entry ? BASE.handbrakeDriftCap : BASE.driftHoldSlipCap;
  const peakMs = 18;
  const bell = Math.exp(-((absSpeedMs - peakMs) ** 2) / 180);
  const floor = entry ? 0.14 : 0.12;
  const ceiling = cap * (0.68 + 0.32 * intensity);
  const speedSlip = THREE.MathUtils.lerp(floor, ceiling, bell * 0.85 + driftSpeedBlend(absSpeedMs) * 0.35);
  return speedSlip * highSpeedDamp(absSpeedMs);
}

function smoothDriftAngle(
  current: number,
  slipAngle: number,
  slipSign: number,
  maxSlip: number,
  dt: number,
): number {
  if (slipAngle < 0.08) return current * Math.max(0, 1 - 4 * dt);
  const target = clamp(slipAngle, 0.1, maxSlip) * slipSign;
  const blend = clamp(dt * 4.5, 0, 1);
  return current + (target - current) * blend;
}

function applySlideMomentum(
  chassis: RapierRigidBody,
  mass: number,
  dt: number,
  right: THREE.Vector3,
  velVec: THREE.Vector3,
  lateralSpeed: number,
  wantLatMag: number,
  slideSign: number,
  driftHold: number,
  throttle: number,
  highDamp: number,
): void {
  const wantLat = wantLatMag * slideSign;
  const latErr = wantLat - lateralSpeed;
  const latImp = latErr * mass * BASE.driftLatSustain * driftHold * throttle * dt;
  if (Math.abs(latImp) > 1e-5) {
    chassis.applyImpulse({ x: right.x * latImp, y: 0, z: right.z * latImp }, true);
  }

  const velLen = velVec.length();
  if (velLen > 2 && throttle > 0.2) {
    const carry = throttle * driftHold * mass * BASE.driftVelCarry * highDamp;
    chassis.applyImpulse(
      { x: (velVec.x / velLen) * carry, y: 0, z: (velVec.z / velLen) * carry },
      true,
    );
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const tmpVec = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const carUp = new THREE.Vector3();
const trackUp = new THREE.Vector3();
const stabAxis = new THREE.Vector3();
const fwd = new THREE.Vector3();
const right = new THREE.Vector3();
const velVec = new THREE.Vector3();
const wheelWorld = new THREE.Vector3();

interface VehicleProps {
  chassisMeshRef: RefObject<THREE.Group | null>;
  car: CarSpec;
  tuning?: Tuning;
  spawn: SpawnPose;
  online: boolean;
  bodyColor?: string;
  accentColor?: string;
  recordGhost?: boolean;
}

export function Vehicle({
  chassisMeshRef,
  car,
  tuning,
  spawn,
  online,
  bodyColor,
  accentColor: _accentColor,
  recordGhost = false,
}: VehicleProps) {
  const chassisRef = useRef<RapierRigidBody>(null);
  const wheelRefs = useRef<(THREE.Group | null)[]>([null, null, null, null]);
  const controllerRef = useRef<DynamicRayCastVehicleController | null>(null);
  const inputRef = useRef<InputSource | null>(null);
  const steerRef = useRef(0);
  /** teclado binário → rampa contínua */
  const steerInputRef = useRef(0);
  const flipTimerRef = useRef(0);
  const slipRef = useRef(0);
  const lateralSlipRef = useRef(0);
  const slipSpinRef = useRef(0);
  const brakeActiveRef = useRef(false);
  const throttleMagRef = useRef(0);
  const prevSpeedRef = useRef(0);
  const driveStateRef = useRef<DriveSimState>(createDriveState());
  const rpmRef = useRef(800);
  const gearRef = useRef(1);
  const shiftingRef = useRef(false);
  const brakePedalRef = useRef(0);
  const handbrakePedalRef = useRef(0);
  const handbrakeLockRef = useRef(0);
  /** drift residual após soltar o freio de mão */
  const driftHoldRef = useRef(0);
  /** ângulo lateral memorizado (com sinal) — alvo do powerslide */
  const driftAngleRef = useRef(0);
  const slideMomentumRef = useRef(0);
  const rearLockSpinRef = useRef<[number, number]>([0, 0]);
  const driveModeRef = useRef<VehicleDriveMode>('coast');
  const boostRef = useRef(0);
  const boostMaxRef = useRef(0);
  const { world } = useRapier();
  const setCluster = useHudStore((s) => s.setCluster);
  const setRedlineRpm = useHudStore((s) => s.setRedlineRpm);
  const setBoostMax = useHudStore((s) => s.setBoostMax);
  const parts = useCarParts(car.id, bodyColor ?? car.colors.body);

  useEffect(() => {
    carAudio.setCar(car.id);
  }, [car.id]);

  const geo = car.geometry;
  const attachY = WHEEL_REST_Y + BASE.suspensionRest;
  const wheelPos = useMemo(
    () =>
      geo.wheelHubs.map(([x, z]) => new THREE.Vector3(x, attachY, z)) as [
        THREE.Vector3,
        THREE.Vector3,
        THREE.Vector3,
        THREE.Vector3,
      ],
    [geo, attachY],
  );

  const tuningKey = JSON.stringify(tuning ?? {});
  const { phys, maxSpeedMs, torqueMult } = useMemo(() => {
    const spec = effectiveSpec(car, tuning);
    return {
      phys: spec.physics,
      maxSpeedMs: spec.maxSpeedKmh / 3.6,
      torqueMult: spec.torqueMult,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [car.id, tuningKey]);

  useEffect(() => {
    setRedlineRpm(phys.drivetrain.redlineRpm);
    const boostMax = carBoostBarMax(car.id);
    boostMaxRef.current = boostMax;
    boostRef.current = 0;
    setBoostMax(boostMax);
    driveStateRef.current = createDriveState(phys.drivetrain.idleRpm);
  }, [
    phys.drivetrain.redlineRpm,
    phys.drivetrain.idleRpm,
    car.id,
    setRedlineRpm,
    setBoostMax,
  ]);

  const spawnQuat = new THREE.Quaternion().setFromAxisAngle(UP, spawn.yaw);

  useEffect(() => {
    const chassis = chassisRef.current;
    if (!chassis) return;

    const controller = world.createVehicleController(chassis);
    controller.indexUpAxis = 1;
    controller.setIndexForwardAxis = 2;

    wheelPos.forEach((pos, i) => {
      const isFront = FRONT.includes(i);
      const stiffMul = isFront ? BASE.frontSuspensionMul : BASE.rearSuspensionMul;
      controller.addWheel(
        pos,
        new THREE.Vector3(0, -1, 0),
        new THREE.Vector3(-1, 0, 0),
        BASE.suspensionRest,
        geo.wheelRadius,
      );
      controller.setWheelSuspensionStiffness(i, phys.suspensionStiffness * stiffMul);
      controller.setWheelSuspensionCompression(i, BASE.suspensionCompression);
      controller.setWheelSuspensionRelaxation(i, BASE.suspensionRelaxation);
      controller.setWheelMaxSuspensionTravel(i, BASE.maxSuspensionTravel);
      controller.setWheelFrictionSlip(i, phys.frictionSlip);
      controller.setWheelSideFrictionStiffness(i, BASE.sideFrictionStiffness);
      // Batente: força máx. da mola ~ 4–5× peso por canto
      controller.setWheelMaxSuspensionForce(i, phys.mass * 12);
    });

    controllerRef.current = controller;
    driveStateRef.current = createDriveState(phys.drivetrain.idleRpm);
    const input = new KeyboardInput();
    inputRef.current = input;

    return () => {
      controllerRef.current = null;
      world.removeVehicleController(controller);
      input.dispose();
      inputRef.current = null;
      carAudio.quiet();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, phys, car.id, wheelPos, geo.wheelRadius]);

  useEffect(() => {
    if (!recordGhost) return;
    ghostRecorder.begin();
    return () => ghostRecorder.end();
  }, [recordGhost]);

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
    steerInputRef.current = 0;
    flipTimerRef.current = 0;
    brakePedalRef.current = 0;
    handbrakePedalRef.current = 0;
    handbrakeLockRef.current = 0;
    driftHoldRef.current = 0;
    driftAngleRef.current = 0;
    slideMomentumRef.current = 0;
    driveModeRef.current = 'coast';
    driveStateRef.current = createDriveState(phys.drivetrain.idleRpm);
  };

  useBeforePhysicsStep(() => {
    const controller = controllerRef.current;
    const chassis = chassisRef.current;
    const input = inputRef.current;
    if (!controller || !chassis || !input) return;

    if (localCar.correction) {
      const c = localCar.correction;
      localCar.correction = null;
      chassis.setTranslation({ x: c.x, y: c.y, z: c.z }, true);
      chassis.setRotation({ x: c.qx, y: c.qy, z: c.qz, w: c.qw }, true);
      chassis.setLinvel({ x: 0, y: 0, z: 0 }, true);
      chassis.setAngvel({ x: 0, y: 0, z: 0 }, true);
      // resync de rede, não colisão real — sem isso o próximo cálculo de dv
      // (mais abaixo, no mesmo frame) vê a velocidade cair a zero de repente
      // e dispara o som/heurística de colisão por engano.
      prevSpeedRef.current = 0;
    }

    const state = input.read();
    const dt = world.timestep;

    const phase = useGameStore.getState().phase;
    const driveAllowed = !online || phase === 'racing' || phase === 'finished';
    const throttle = driveAllowed ? state.throttle : 0;
    const steerInput = driveAllowed ? state.steer : 0;
    const handbrake = driveAllowed ? state.handbrake : true;

    const speed = controller.currentVehicleSpeed();
    const absSpeed = Math.abs(speed);

    // Slip atual (antes do passo) — reduz lock quando já está de lado
    const rotEarly = chassis.rotation();
    tmpQuat.set(rotEarly.x, rotEarly.y, rotEarly.z, rotEarly.w);
    fwd.set(0, 0, 1).applyQuaternion(tmpQuat);
    right.set(1, 0, 0).applyQuaternion(tmpQuat);
    const lvEarly = chassis.linvel();
    velVec.set(lvEarly.x, 0, lvEarly.z);
    const earlyFwd = velVec.dot(fwd);
    const earlyLat = velVec.dot(right);
    const earlySlip =
      absSpeed > 2 ? Math.atan2(Math.abs(earlyLat), Math.abs(earlyFwd) + 0.5) : 0;
    const driftSteering = handbrakePedalRef.current > 0.12 || driftHoldRef.current > 0.15;
    const highDamp = highSpeedDamp(absSpeed);
    const slipSteerCut = driftSteering
      ? clamp(1 - earlySlip / (BASE.steerSlipCutAngle * 1.1), 0.42, 1) * highDamp
      : clamp(1 - earlySlip / BASE.steerSlipCutAngle, 0.55, 1) * highDamp;

    // Teclado é on/off: rampa o pedido de direção como um volante real
    const steerReturning = Math.abs(steerInput) < Math.abs(steerInputRef.current) - 1e-4;
    const inputRate = (steerReturning ? BASE.steerReturnRate : BASE.steerInputRate) * dt;
    steerInputRef.current += THREE.MathUtils.clamp(
      steerInput - steerInputRef.current,
      -inputRate,
      inputRate,
    );

    // Menos lock em alta; menos lock quando já está de lado (curva normal)
    const speedFactor = (1 / (1 + absSpeed * BASE.steerSpeedFalloff)) * highDamp;
    const steerResp = (BASE.steerRespMin + (1 - BASE.steerRespMin) * speedFactor) * highDamp;
    const targetSteer =
      steerInputRef.current * phys.maxSteerRad * speedFactor * slipSteerCut;
    const maxDelta = phys.steerSpeed * steerResp * dt;
    steerRef.current += THREE.MathUtils.clamp(targetSteer - steerRef.current, -maxDelta, maxDelta);
    FRONT.forEach((i) => controller.setWheelSteering(i, steerRef.current));

    const intent = resolveVehicleDrive({
      throttle,
      speedMs: speed,
      reverseForce: phys.reverseForce,
    });

    if (intent.mode === 'accel' && driveModeRef.current === 'reverse') {
      driveStateRef.current = createDriveState(phys.drivetrain.idleRpm);
    }
    driveModeRef.current = intent.mode;

    const pedalRate = BASE.brakePedalRate * dt;
    if (intent.brakePedal > brakePedalRef.current) {
      brakePedalRef.current = Math.min(intent.brakePedal, brakePedalRef.current + pedalRate);
    } else {
      brakePedalRef.current = Math.max(intent.brakePedal, brakePedalRef.current - pedalRate * 2.5);
    }
    const brakePedal = brakePedalRef.current;
    const braking = brakePedal > 0.04;

    let engine = intent.wheelForce;

    if (intent.mode === 'accel') {
      const driven = stepDrivetrain({
        dt: phys.drivetrain,
        wheelRadius: geo.wheelRadius,
        speedMs: speed,
        throttle: intent.forwardThrottle,
        state: driveStateRef.current,
        dtSec: dt,
        torqueMult,
      });
      driveStateRef.current = driven.state;
      engine = driven.output.wheelForce;
      rpmRef.current = driven.output.rpm;
      gearRef.current = driven.output.gear;
      shiftingRef.current = driven.output.shifting;
    } else if (intent.mode === 'reverse') {
      const idle = nextIdleTarget(driveStateRef.current, phys.drivetrain.idleRpm, dt);
      driveStateRef.current = idle.state;
      rpmRef.current = Math.max(
        idle.rpm,
        reverseRpmFromSpeed(speed, geo.wheelRadius, phys.drivetrain.finalDrive),
      );
      gearRef.current = -1;
      shiftingRef.current = false;
    } else if (intent.mode === 'brake') {
      const idle = nextIdleTarget(driveStateRef.current, phys.drivetrain.idleRpm, dt);
      driveStateRef.current = idle.state;
      rpmRef.current = Math.max(
        idle.rpm,
        rpmRef.current - phys.drivetrain.redlineRpm * 0.35 * dt,
      );
      shiftingRef.current = false;
    } else {
      const coast = stepDrivetrain({
        dt: phys.drivetrain,
        wheelRadius: geo.wheelRadius,
        speedMs: speed,
        throttle: 0,
        state: driveStateRef.current,
        dtSec: dt,
        torqueMult,
      });
      driveStateRef.current = coast.state;
      rpmRef.current = coast.output.rpm;
      gearRef.current = coast.output.gear;
      shiftingRef.current = coast.output.shifting;
    }

    let engineBrakePedal = 0;
    if (!braking && throttle === 0 && absSpeed > 4 && gearRef.current > 0) {
      engineBrakePedal = BASE.engineBrakeFactor * Math.min(1, absSpeed / 25);
    }

    if (engine > 0 && maxSpeedMs > 1) {
      const ratio = THREE.MathUtils.clamp(speed / maxSpeedMs, 0, 1.15);
      if (ratio > 0.92) {
        engine *= Math.max(0.08, 1 - ((ratio - 0.92) / 0.23) ** 1.4);
      }
    } else if (engine < 0) {
      const revCap = maxSpeedMs * BASE.reverseSpeedFrac;
      const ratio = THREE.MathUtils.clamp(-speed / revCap, 0, 1);
      engine *= Math.max(0.3, 1 - ratio * ratio);
    }

    const t = chassis.translation();
    const onRoad = isOnRoad(t.x, t.z);
    if (!onRoad) {
      engine *= BASE.offRoadEngineFactor;
    }

    const rotPre = chassis.rotation();
    tmpQuat.set(rotPre.x, rotPre.y, rotPre.z, rotPre.w);
    fwd.set(0, 0, 1).applyQuaternion(tmpQuat);
    right.set(1, 0, 0).applyQuaternion(tmpQuat);

    const drag = speedDragForce(speed, phys.mass, phys.dragCoeff);
    if (absSpeed > 0.12) {
      const dragImpulse = drag * dt;
      const dir = speed >= 0 ? 1 : -1;
      chassis.applyImpulse(
        {
          x: -fwd.x * dragImpulse * dir,
          y: 0,
          z: -fwd.z * dragImpulse * dir,
        },
        true,
      );
    }

    // Freio de mão NÃO entra aqui em velocidade: mataria o fluxo e forçava 180°.
    if (braking && absSpeed > 0.04 && absSpeed < BASE.creepBrakeMaxSpeed) {
      const assist = phys.mass * absSpeed * BASE.creepBrakeGain * dt * brakePedal;
      const dir = speed >= 0 ? 1 : -1;
      chassis.applyImpulse(
        { x: -fwd.x * assist * dir, y: 0, z: -fwd.z * assist * dir },
        true,
      );
    }

    const noseUp = Math.max(0, -fwd.y);

    if (engine > 0 && noseUp > BASE.antiWheeliePitch) {
      const cut = THREE.MathUtils.clamp(
        1 - (noseUp - BASE.antiWheeliePitch) * 8,
        BASE.antiWheelieForceCut,
        1,
      );
      engine *= cut;
    }

    const driveBias = THREE.MathUtils.clamp(phys.driveBias, 0, 1);
    let applied = engine;
    slipRef.current = 0;

    if (engine !== 0 && absSpeed < BASE.launchSlipMaxSpeed && Math.abs(throttle) > 0.35) {
      const launchFactor = 1 - absSpeed / BASE.launchSlipMaxSpeed;
      const layoutGrip = driveBias <= 0.01 ? 0.78 : driveBias >= 0.99 ? 1.12 : 1.28;
      const gripCap =
        phys.mass * BASE.launchGripBase * layoutGrip * (0.4 + 0.6 * (1 - launchFactor));
      const wanted = Math.abs(engine);
      if (wanted > gripCap) {
        applied = Math.sign(engine) * gripCap;
        const rawSlip = (wanted - gripCap) / wanted;
        const layoutSmoke = driveBias <= 0.01 ? 1.15 : driveBias >= 0.99 ? 0.4 : 0.28;
        slipRef.current = THREE.MathUtils.clamp(rawSlip * launchFactor * layoutSmoke * 1.3, 0, 1);
      }
    }

    const brakeInput = Math.min(1, brakePedal + engineBrakePedal);
    const roadPedal = onRoad ? brakeInput : brakeInput * BASE.offRoadBrakeFactor;
    let { front: frontBrake, rear: rearBrake } = rapierServiceBrakes({
      pedal: roadPedal,
      maxPerWheel: phys.brakeForce,
      massKg: phys.mass,
      frontBias: BASE.frontBrakeBias,
      absSpeedMs: absSpeed,
    });

    // Compressão dianteira — só alivia perto do batente
    let frontCompression = 0;
    FRONT.forEach((i) => {
      const len = controller.wheelSuspensionLength(i) ?? BASE.suspensionRest;
      frontCompression += THREE.MathUtils.clamp(
        (BASE.suspensionRest - len) / BASE.maxSuspensionTravel,
        0,
        1.2,
      );
    });
    frontCompression /= FRONT.length;

    if (braking && frontCompression > 0.92) {
      const cut = THREE.MathUtils.clamp(1 - (frontCompression - 0.92) * 4, 0.55, 1);
      frontBrake *= cut;
    }

    const hbTarget = handbrake && driveAllowed ? 1 : 0;
    const hbRate =
      (hbTarget > handbrakePedalRef.current ? BASE.handbrakePedalRate : BASE.handbrakeReleaseRate) *
      dt;
    handbrakePedalRef.current += THREE.MathUtils.clamp(
      hbTarget - handbrakePedalRef.current,
      -hbRate,
      hbRate,
    );
    const hbPedal = handbrakePedalRef.current;
    const hbActive = hbPedal > 0.04;
    const prevHb = handbrakeLockRef.current;
    handbrakeLockRef.current = hbPedal;

    // Com freio de mão engatado: carrega o “hold” para sustentar o drift depois
    if (hbPedal > 0.25 && absSpeed > 6) {
      driftHoldRef.current = Math.min(
        1,
        driftHoldRef.current + BASE.driftHoldCharge * hbPedal * dt,
      );
    }
    const driftHold = driftHoldRef.current;
    const powerDrift = driftHold > 0.15 && throttle > 0.28 && hbPedal < 0.12;
    const gripBlend = Math.max(hbPedal, driftHold * BASE.driftHoldSideBlend);
    const inDriftGrip = gripBlend > 0.08;

    const rearBrakePerWheel = rapierHandbrakeRear(
      hbPedal,
      phys.handbrakeForce,
      rearBrake,
      phys.brakeForce,
      phys.mass,
    );
    const frontBrakePerWheel = frontBrake;

    // Lock só com freio de mão; no hold o pneu gira de novo mas com menos grip lateral
    const rearFrictionSlip = hbActive
      ? Math.max(0.8, phys.frictionSlip * BASE.handbrakeSlipFactor)
      : driftHold > 0.08
        ? phys.frictionSlip * (1 - (0.28 + (powerDrift ? 0.14 : 0)) * driftHold)
        : phys.frictionSlip;
    const rearSideFriction =
      gripBlend > 0.04
        ? THREE.MathUtils.lerp(BASE.sideFrictionStiffness, phys.handbrakeSideFriction, gripBlend)
        : BASE.sideFrictionStiffness;

    const serviceBraking = braking;
    const frontDrive = serviceBraking ? 0 : applied * driveBias;
    // Traseira travada = sem tração; ao soltar, gás volta e sustenta o powerslide
    const rearDrive = serviceBraking || hbActive ? 0 : applied * (1 - driveBias);

    REAR.forEach((i) => {
      controller.setWheelEngineForce(i, rearDrive / 2);
      controller.setWheelBrake(i, rearBrakePerWheel);
      controller.setWheelFrictionSlip(i, rearFrictionSlip);
      controller.setWheelSideFrictionStiffness(i, rearSideFriction);
    });
    FRONT.forEach((i) => {
      controller.setWheelEngineForce(i, frontDrive / 2);
      controller.setWheelBrake(i, frontBrakePerWheel);
      controller.setWheelFrictionSlip(i, phys.frictionSlip);
      controller.setWheelSideFrictionStiffness(
        i,
        inDriftGrip ? BASE.sideFrictionStiffness * BASE.driftFrontGripMul : BASE.sideFrictionStiffness,
      );
    });

    controller.updateVehicle(dt);

    // Ao soltar freio de mão em deslize: memoriza momentum lateral
    if (prevHb > 0.35 && hbPedal < 0.15 && absSpeed > 7) {
      const rotSnap = chassis.rotation();
      tmpQuat.set(rotSnap.x, rotSnap.y, rotSnap.z, rotSnap.w);
      right.set(1, 0, 0).applyQuaternion(tmpQuat);
      const lvSnap = chassis.linvel();
      velVec.set(lvSnap.x, 0, lvSnap.z);
      slideMomentumRef.current = Math.max(slideMomentumRef.current, Math.abs(velVec.dot(right)));
    }

    const rot = chassis.rotation();
    tmpQuat.set(rot.x, rot.y, rot.z, rot.w);
    fwd.set(0, 0, 1).applyQuaternion(tmpQuat);
    right.set(1, 0, 0).applyQuaternion(tmpQuat);
    const lv = chassis.linvel();
    velVec.set(lv.x, 0, lv.z);
    const forwardSpeed = velVec.dot(fwd);
    const lateralSpeed = velVec.dot(right);
    const slipAngle =
      absSpeed > 2 ? Math.atan2(Math.abs(lateralSpeed), Math.abs(forwardSpeed) + 0.5) : 0;
    const signedSlip = absSpeed > 2 ? Math.atan2(lateralSpeed, forwardSpeed) : 0;

    const av = chassis.angvel();
    const pitchRate = right.dot(tmpVec.set(av.x, av.y, av.z));

    if (driveAllowed && serviceBraking && brakePedal > 0.05) {
      const noseDown = THREE.MathUtils.clamp(fwd.y, 0, 0.08);
      const pitchImp =
        phys.mass *
        dt *
        (-BASE.brakePitchKd * Math.max(0, pitchRate) - BASE.brakePitchKp * noseDown);
      if (Math.abs(pitchImp) > 1e-5) {
        chassis.applyTorqueImpulse(
          { x: right.x * pitchImp, y: right.y * pitchImp, z: right.z * pitchImp },
          true,
        );
      }
    }

    if (driveAllowed && !serviceBraking && throttle > 0.15 && pitchRate < -0.05) {
      const pitchCorrect = -pitchRate * phys.mass * BASE.pitchDampGain;
      chassis.applyTorqueImpulse(
        { x: right.x * pitchCorrect, y: right.y * pitchCorrect, z: right.z * pitchCorrect },
        true,
      );
    }
    const pitchNose = Math.max(0, -fwd.y);
    if (driveAllowed && !serviceBraking && pitchNose > 0.035) {
      const push = phys.mass * pitchNose * 0.85 * dt;
      chassis.applyTorqueImpulse(
        { x: right.x * push, y: right.y * push, z: right.z * push },
        true,
      );
    }

    // Amortece overshoot de pitch após freada forte
    if (driveAllowed && serviceBraking && pitchRate > 0.06) {
      const damp = -pitchRate * phys.mass * 0.03 * dt;
      chassis.applyTorqueImpulse(
        { x: right.x * damp, y: right.y * damp, z: right.z * damp },
        true,
      );
    }

    if (driveAllowed && absSpeed > 4) {
      const steerNorm = clamp(steerRef.current / Math.max(0.08, phys.maxSteerRad), -1, 1);
      const steerAuth = driftSteerAuthority(steerNorm, BASE.driftSteerAuthority);
      const driftIntensity = Math.max(hbPedal, driftHold * 0.9);
      const inDrift = driftIntensity > 0.1 && (slipAngle > 0.07 || hbPedal > 0.18);
      const speedBlend = driftSpeedBlend(absSpeed);
      const hiDamp = highSpeedDamp(absSpeed);
      const slipSign = Math.sign(signedSlip) || Math.sign(steerAuth) || 1;
      const steerSign = Math.sign(steerAuth);
      const countering =
        steerSign !== 0 && Math.abs(signedSlip) > 0.08 && steerSign !== slipSign;
      const aligning = steerSign !== 0 && steerSign === slipSign;
      const entry = hbPedal > 0.15;
      const powerSlide =
        !entry && driftHold > 0.12 && throttle > 0.25 && slipAngle > 0.1;
      const maxSlip = maxDriftSlipAtSpeed(absSpeed, driftIntensity, entry);
      const maxYaw = maxYawAtSpeed(absSpeed, driftIntensity);
      const mass = phys.mass;
      const yawRate = av.y;

      driftAngleRef.current = smoothDriftAngle(
        driftAngleRef.current,
        slipAngle,
        slipSign,
        maxSlip,
        dt,
      );
      if (driftIntensity < 0.06) {
        driftAngleRef.current *= Math.max(0, 1 - 5 * dt);
        slideMomentumRef.current *= Math.max(0, 1 - 3 * dt);
      } else if (powerSlide) {
        slideMomentumRef.current = THREE.MathUtils.lerp(
          slideMomentumRef.current,
          Math.max(Math.abs(lateralSpeed), absSpeed * Math.sin(Math.abs(driftAngleRef.current))),
          dt * 2.5,
        );
      }

      if (inDrift) {
        if (powerSlide) {
          const heldMag = clamp(
            Math.max(Math.abs(driftAngleRef.current), 0.15),
            0.14,
            maxSlip,
          );
          if (throttle > 0.35) {
            driftAngleRef.current =
              clamp(heldMag + throttle * driftHold * 0.12 * dt, 0.14, maxSlip) * slipSign;
          }
          const held = driftAngleRef.current;
          const angleErr = held - signedSlip;
          const angleHold =
            angleErr * mass * BASE.driftCounterKp * driftHold * (0.45 + 0.55 * throttle);
          const yawDamp =
            -yawRate * mass * BASE.driftCounterKd * (0.65 + 0.35 * hiDamp);
          const trimYaw = (steerAuth * maxYaw * 0.08 * driftHold - yawRate) * mass * 0.012;
          const torque = angleHold + yawDamp + trimYaw;
          if (Math.abs(torque) > 1e-5) {
            chassis.applyTorqueImpulse({ x: 0, y: torque, z: 0 }, true);
          }

          const wantLat = Math.max(
            slideMomentumRef.current * 0.75,
            Math.sin(Math.abs(held)) * absSpeed * 0.55,
          );
          applySlideMomentum(
            chassis,
            mass,
            dt,
            right,
            velVec,
            lateralSpeed,
            wantLat,
            Math.sign(lateralSpeed) || slipSign,
            driftHold,
            throttle,
            hiDamp,
          );
        } else if (entry && aligning) {
          const openYaw = steerAuth * maxYaw * BASE.driftEntryGain * hbPedal * speedBlend;
          const yawAssist = (openYaw - yawRate) * mass * BASE.driftYawKp * hbPedal;
          if (Math.abs(yawAssist) > 1e-5) {
            chassis.applyTorqueImpulse({ x: 0, y: yawAssist, z: 0 }, true);
          }
        } else if (countering && driftHold > 0.1) {
          const held = clamp(Math.abs(driftAngleRef.current), 0.12, maxSlip) * slipSign;
          const angleErr = held - signedSlip;
          const stabilize =
            angleErr * mass * BASE.driftCounterKp * driftIntensity * 0.7 -
            yawRate * mass * BASE.driftCounterKd;
          if (Math.abs(stabilize) > 1e-5) {
            chassis.applyTorqueImpulse({ x: 0, y: stabilize, z: 0 }, true);
          }
        } else if (driftHold > 0.1 && Math.abs(signedSlip) > 0.1) {
          const held = clamp(Math.abs(driftAngleRef.current), 0.12, maxSlip) * slipSign;
          const angleErr = held - signedSlip;
          const coastHold = angleErr * mass * 0.004 * driftHold;
          if (Math.abs(coastHold) > 1e-5) {
            chassis.applyTorqueImpulse({ x: 0, y: coastHold, z: 0 }, true);
          }
        }

        const slipOver = Math.max(0, Math.abs(signedSlip) - maxSlip);
        if (slipOver > 0.03) {
          chassis.applyTorqueImpulse(
            {
              x: 0,
              y: -slipSign * mass * slipOver * absSpeed * 0.0045 * dt,
              z: 0,
            },
            true,
          );
        }
        const yawExcess = Math.abs(yawRate) - maxYaw;
        if (yawExcess > 0) {
          chassis.applyTorqueImpulse(
            {
              x: 0,
              y: -Math.sign(yawRate) * mass * yawExcess * (0.16 + 0.05 * hiDamp),
              z: 0,
            },
            true,
          );
        }
      } else {
        const over = Math.max(0, slipAngle - BASE.slipAngleSoftCap);
        const yawDamp =
          -av.y * phys.mass * BASE.yawDampGain * (1 + over * 2.2) * 0.95 * hiDamp;
        if (Math.abs(yawDamp) > 1e-5) {
          chassis.applyTorqueImpulse({ x: 0, y: yawDamp, z: 0 }, true);
        }
        if (over > 0.12) {
          const straighten =
            -Math.sign(lateralSpeed) * phys.mass * over * absSpeed * 0.0025 * dt;
          chassis.applyTorqueImpulse({ x: 0, y: straighten, z: 0 }, true);
        }
      }
    }

    // Atualiza hold: gás prolonga o cantar; endireitar / frear recupera aderência
    if (hbPedal < 0.15) {
      const sliding = slipAngle > 0.14 && absSpeed > 6;
      const throttleOn = throttle > 0.35 && !serviceBraking;
      const highSlide = absSpeed > BASE.highSpeedSteerStart;
      if (sliding && throttleOn) {
        const charge = highSlide ? 0.35 : 0.55;
        driftHoldRef.current = Math.min(1, driftHoldRef.current + charge * throttle * dt);
      } else {
        let decay = BASE.driftHoldDecay;
        if (sliding && throttle > 0.15) decay *= BASE.driftHoldThrottleSustain;
        if (highSlide && sliding && throttle > 0.2) decay *= 0.55;
        if (slipAngle < 0.1) decay *= 2.8;
        if (serviceBraking) decay *= 3.2;
        if (absSpeed < 5) decay *= 2.2;
        driftHoldRef.current = Math.max(0, driftHoldRef.current - decay * dt);
      }
    }

    carUp.copy(UP).applyQuaternion(tmpQuat);
    const surf = surfaceAt(t.x, t.z);
    trackUp.set(surf.nx, surf.ny, surf.nz);
    stabAxis.crossVectors(carUp, trackUp);
    const sinTilt = stabAxis.length();
    if (sinTilt > 1e-3) {
      stabAxis.normalize();
      tmpVec.set(av.x, av.y, av.z);
      const rollRate = stabAxis.dot(tmpVec);
      const tilt = Math.asin(Math.min(1, sinTilt));
      // Em freada: NÃO solta o pitch — evita empino pra frente
      const mag = phys.mass * (BASE.stabP * tilt - BASE.stabD * rollRate) * dt;
      chassis.applyTorqueImpulse(
        { x: stabAxis.x * mag, y: stabAxis.y * mag, z: stabAxis.z * mag },
        true,
      );
    }

    brakeActiveRef.current = (braking || hbActive) && absSpeed > 2;
    throttleMagRef.current = Math.abs(throttle);

    const boostMax = boostMaxRef.current;
    if (boostMax > 0) {
      const idle = phys.drivetrain.idleRpm;
      const redline = phys.drivetrain.redlineRpm;
      const rpmNorm = THREE.MathUtils.clamp(
        (rpmRef.current - idle) / Math.max(1, redline - idle),
        0,
        1,
      );
      const thr = Math.max(0, throttle);
      const spool = THREE.MathUtils.clamp((rpmNorm - 0.1) / 0.5, 0, 1);
      let target = thr * spool * boostMax;
      if (shiftingRef.current) target *= 0.55;
      if (brakePedalRef.current > 0.2) target *= 0.35;
      // lag de turbina: sobe mais rápido que desce
      const rate = thr > 0.08 && spool > 0.05 ? 3.8 : 1.6;
      boostRef.current += (target - boostRef.current) * Math.min(1, rate * dt);
      // flutter leve perto do wastegate
      if (boostRef.current > boostMax * 0.92 && thr > 0.7) {
        boostRef.current += (Math.random() * 2 - 1) * 0.015;
      }
      boostRef.current = THREE.MathUtils.clamp(boostRef.current, 0, boostMax * 1.02);
    } else {
      boostRef.current = 0;
    }

    tmpVec.copy(UP).applyQuaternion(tmpQuat);
    const upsideDown = tmpVec.y < 0.15 && Math.abs(speed) < 2;
    flipTimerRef.current = upsideDown ? flipTimerRef.current + dt : 0;
    if (state.reset || flipTimerRef.current > BASE.flipResetSeconds || chassis.translation().y < -10) {
      reset();
    }
  });

  useFrame((_state, frameDt) => {
    const controller = controllerRef.current;
    const chassis = chassisRef.current;
    if (!controller || !chassis) return;
    const speed = controller.currentVehicleSpeed();
    const absSpeed = Math.abs(speed);
    setCluster({
      speedKmh: absSpeed * 3.6,
      rpm: rpmRef.current,
      gear: gearRef.current,
      shifting: shiftingRef.current,
      boostBar: boostRef.current,
    });

    const rot = chassis.rotation();
    tmpQuat.set(rot.x, rot.y, rot.z, rot.w);
    fwd.set(0, 0, 1).applyQuaternion(tmpQuat);
    right.set(1, 0, 0).applyQuaternion(tmpQuat);
    const lv = chassis.linvel();
    velVec.set(lv.x, 0, lv.z);
    const lateral = Math.abs(velVec.dot(right));
    lateralSlipRef.current = THREE.MathUtils.clamp(lateral / (absSpeed + 4), 0, 1);
    const launchSmoke = slipRef.current > 0.18 && absSpeed < BASE.launchSlipMaxSpeed;
    const hbLock = handbrakeLockRef.current;
    const driftHold = driftHoldRef.current;
    const lockSmoke = hbLock > 0.25 && absSpeed > 3;
    const holdSmoke = driftHold > 0.18 && absSpeed > 5 && lateralSlipRef.current > 0.12;
    const driftSmoke = lateralSlipRef.current > 0.28 && absSpeed > 6;
    const slip = launchSmoke
      ? slipRef.current
      : lockSmoke
        ? Math.max(0.55, hbLock * 0.85, lateralSlipRef.current)
        : holdSmoke
          ? Math.max(0.32, driftHold * 0.55, lateralSlipRef.current * 0.85)
          : driftSmoke
            ? lateralSlipRef.current
            : 0;

    const thr = throttleMagRef.current;
    const brakeAmt =
      brakeActiveRef.current && absSpeed > 2
        ? Math.min(
            1,
            Math.max(brakePedalRef.current, hbLock * 0.7) *
              (0.25 + 0.75 * Math.min(1, absSpeed / 28)),
          )
        : 0;
    carAudio.update(rpmRef.current, thr, slip, shiftingRef.current, brakeAmt);

    const dv = absSpeed - prevSpeedRef.current;
    if (dv < -6 && !brakeActiveRef.current) {
      carAudio.crash(Math.min(1, -dv / 20));
    }
    prevSpeedRef.current = absSpeed;

    if (launchSmoke) slipSpinRef.current += slipRef.current * 52 * frameDt;
    else slipSpinRef.current *= Math.max(0, 1 - 5 * frameDt);

    const mesh = chassisMeshRef.current;
    if (mesh) {
      mesh.getWorldPosition(localCar.position);
      mesh.getWorldQuaternion(localCar.quaternion);
      localCar.speed = speed;
      localCar.hasData = true;
    }

    if (recordGhost) {
      const tr = chassis.translation();
      ghostRecorder.update(tr.x, tr.z, rot.y, rot.w, performance.now());
    }

    for (let i = 0; i < 4; i++) {
      const g = wheelRefs.current[i];
      if (!g) continue;
      const suspension = controller.wheelSuspensionLength(i) ?? BASE.suspensionRest;
      g.position.set(wheelPos[i].x, wheelPos[i].y - suspension, wheelPos[i].z);
      g.rotation.set(0, controller.wheelSteering(i) ?? 0, 0);
      const isRear = i === 2 || i === 3;
      const rearSlot = i === 2 ? 0 : 1;
      const lockedRear = isRear && handbrakeLockRef.current > 0.35;
      let spin: number;
      if (lockedRear) {
        spin = rearLockSpinRef.current[rearSlot];
      } else {
        spin = (controller.wheelRotation(i) ?? 0) + (isRear ? slipSpinRef.current : 0);
        if (isRear) rearLockSpinRef.current[rearSlot] = spin;
      }
      const spinner = g.children[0];
      if (spinner) spinner.rotation.x = spin;
    }

    const tr = chassis.translation();
    const onRoad = isOnRoad(tr.x, tr.z);
    const smoking = slip > 0.18;
    if (smoking || (!onRoad && absSpeed > 6)) {
      const color: [number, number, number] = onRoad ? [0.9, 0.9, 0.92] : [0.72, 0.6, 0.42];
      const count = Math.min(3, 1 + Math.floor(slip * 3));
      REAR.forEach((i) => {
        const g = wheelRefs.current[i];
        if (!g) return;
        g.getWorldPosition(wheelWorld);
        const groundY = isOnDriveable(wheelWorld.x, wheelWorld.z)
          ? heightAt(wheelWorld.x, wheelWorld.z)
          : 0;
        const contactY = Math.max(groundY + 0.06, wheelWorld.y - geo.wheelRadius);
        emitSmoke(wheelWorld.x, contactY, wheelWorld.z, {
          color,
          count,
          size: onRoad ? (launchSmoke || lockSmoke ? 1.35 : holdSmoke ? 1.15 : 1.0) : 1.0,
          life: onRoad ? (launchSmoke || lockSmoke ? 0.65 : holdSmoke ? 0.55 : 0.7) : 0.5,
          rise: onRoad ? 0.9 : 1.2,
          spread: 0.4,
        });
      });
    }
  });

  // Lastro bem baixo: COM baixo = menos empino / capotamento
  const ballastY = -(geo.chassisHalf.y + 0.28);
  const comZ = phys.comBiasZ * 0.7;

  return (
    <RigidBody
      key={car.id}
      ref={chassisRef}
      position={[spawn.x, spawn.y, spawn.z]}
      quaternion={[spawnQuat.x, spawnQuat.y, spawnQuat.z, spawnQuat.w]}
      colliders={false}
      canSleep={false}
      type="dynamic"
      ccd
      linearDamping={0.04}
      angularDamping={0.85}
    >
      <CuboidCollider
        args={[geo.chassisHalf.x, geo.chassisHalf.y * 0.75, geo.chassisHalf.z]}
        position={[0, 0.02, comZ * 0.25]}
        mass={phys.mass * 0.18}
      />
      <CuboidCollider
        args={[geo.chassisHalf.x * 0.85, 0.07, geo.chassisHalf.z * 0.75]}
        position={[0, ballastY, comZ]}
        mass={phys.mass * 0.82}
      />
      <group ref={chassisMeshRef}>
        <primitive object={parts.body} />
        {wheelPos.map((_, i) => (
          <group key={i} ref={(el) => (wheelRefs.current[i] = el)}>
            <group>
              <primitive object={parts.wheels[i]} />
            </group>
          </group>
        ))}
      </group>
    </RigidBody>
  );
}
