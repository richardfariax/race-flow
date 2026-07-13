/**
 * Catálogo de carros — compartilhado entre cliente (física/visual/loja) e
 * servidor (validação de velocidade). Specs baseadas em dados reais
 * (potência, torque, 0–100, vmax, marchas), com leve arcade nos tempos.
 */

import type { DrivetrainSpec } from './drivetrain';

export type CarClass = 'C' | 'B' | 'A';

export interface CarPhysics {
  mass: number;
  /** marcha à ré curta */
  reverseForce: number;
  /**
   * Impulso máx de freio por roda no Rapier (pedal cheio).
   * Escala ~massa×0.05 — NÃO é Newton; calibrado na simulação.
   */
  brakeForce: number;
  handbrakeForce: number;
  /** grip lateral traseiro com freio de mão (menor = solta mais a traseira) */
  handbrakeSideFriction: number;
  frictionSlip: number;
  maxSteerRad: number;
  steerSpeed: number;
  suspensionStiffness: number;
  /**
   * Distribuição de tração: 0 = 100% traseira (RWD), 1 = 100% dianteira (FWD).
   * AWD típico ~0.35–0.5.
   */
  driveBias: number;
  /**
   * Deslocamento do centro de massa no eixo Z local (+frente / −traseira).
   * Espelha motor dianteiro vs traseiro.
   */
  comBiasZ: number;
  /** Coeficiente de arrasto aero (N·s²/m²) — calibra vmax */
  dragCoeff: number;
  drivetrain: DrivetrainSpec;
}

export interface CarGeometry {
  chassisHalf: { x: number; y: number; z: number };
  wheelRadius: number;
  /** XZ dos hubs: 0 FL, 1 FR, 2 RL, 3 RR (frente = +Z, esquerda do piloto = +X) */
  wheelHubs: ReadonlyArray<readonly [number, number]>;
}

export interface CarSpec {
  id: string;
  name: string;
  year: number;
  cls: CarClass;
  priceCoins: number;
  powerCv: number;
  zeroToHundredSec: number;
  /** teto plausível p/ validação anti-cheat no servidor */
  maxSpeedKmh: number;
  colors: { body: string; accent: string };
  physics: CarPhysics;
  geometry: CarGeometry;
}

/** Forças saem do torque × marcha × diferencial / raio (shared/drivetrain). */
export const CARS: Record<string, CarSpec> = {
  beetle: {
    id: 'beetle',
    name: 'VW Fusca',
    year: 1968,
    cls: 'C',
    priceCoins: 0,
    powerCv: 50,
    zeroToHundredSec: 28,
    maxSpeedKmh: 118,
    colors: { body: '#c45c26', accent: '#1a1a1a' },
    physics: {
      mass: 840,
      reverseForce: 2800,
      brakeForce: 42,
      handbrakeForce: 18,
      handbrakeSideFriction: 0.62,
      frictionSlip: 8.2,
      maxSteerRad: 0.52,
      steerSpeed: 2.35,
      suspensionStiffness: 58,
      driveBias: 0,
      comBiasZ: -0.18,
      dragCoeff: 0.52,
      drivetrain: {
        peakTorqueNm: 102,
        peakTorqueRpm: 2600,
        redlineRpm: 4600,
        idleRpm: 800,
        gearRatios: [3.8, 2.06, 1.26, 0.89],
        finalDrive: 4.375,
        efficiency: 0.88,
      },
    },
    geometry: {
      chassisHalf: { x: 0.72, y: 0.36, z: 1.78 },
      wheelRadius: 0.29,
      wheelHubs: [
        [0.673, 1.336],
        [-0.673, 1.336],
        [0.683, -1.085],
        [-0.683, -1.085],
      ],
    },
  },
  golf_gti: {
    id: 'golf_gti',
    name: 'VW Golf GTI Mk1',
    year: 1976,
    cls: 'C',
    priceCoins: 0,
    powerCv: 110,
    zeroToHundredSec: 9.2,
    maxSpeedKmh: 182,
    colors: { body: '#c4122f', accent: '#111111' },
    physics: {
      mass: 910,
      reverseForce: 3600,
      brakeForce: 48,
      handbrakeForce: 19,
      handbrakeSideFriction: 0.64,
      frictionSlip: 9.6,
      maxSteerRad: 0.48,
      steerSpeed: 2.55,
      suspensionStiffness: 68,
      driveBias: 1,
      comBiasZ: 0.14,
      dragCoeff: 0.42,
      drivetrain: {
        peakTorqueNm: 148,
        peakTorqueRpm: 4000,
        redlineRpm: 6500,
        idleRpm: 900,
        gearRatios: [3.45, 2.12, 1.44, 1.13, 0.91],
        finalDrive: 3.89,
        efficiency: 0.9,
      },
    },
    geometry: {
      chassisHalf: { x: 0.76, y: 0.34, z: 1.72 },
      wheelRadius: 0.3,
      wheelHubs: [
        [0.65, 1.227],
        [-0.65, 1.227],
        [0.619, -1.217],
        [-0.619, -1.217],
      ],
    },
  },
  jetta: {
    id: 'jetta',
    name: 'VW Jetta',
    year: 2019,
    cls: 'B',
    priceCoins: 0,
    powerCv: 150,
    zeroToHundredSec: 8.0,
    maxSpeedKmh: 210,
    colors: { body: '#2a5cff', accent: '#e8e8e8' },
    physics: {
      mass: 1380,
      reverseForce: 4200,
      brakeForce: 58,
      handbrakeForce: 20,
      handbrakeSideFriction: 0.66,
      frictionSlip: 10.2,
      maxSteerRad: 0.44,
      steerSpeed: 2.65,
      suspensionStiffness: 78,
      driveBias: 1,
      comBiasZ: 0.16,
      dragCoeff: 0.38,
      drivetrain: {
        peakTorqueNm: 250,
        peakTorqueRpm: 1500,
        redlineRpm: 6200,
        idleRpm: 750,
        gearRatios: [3.77, 2.09, 1.32, 0.98, 0.81, 0.68],
        finalDrive: 3.23,
        efficiency: 0.91,
      },
    },
    geometry: {
      chassisHalf: { x: 0.9, y: 0.35, z: 2.05 },
      wheelRadius: 0.317,
      wheelHubs: [
        [0.789, 1.461],
        [-0.789, 1.461],
        [0.789, -1.226],
        [-0.789, -1.226],
      ],
    },
  },
  m3_e46: {
    id: 'm3_e46',
    name: 'BMW M3 E46 GTR',
    year: 2005,
    cls: 'A',
    priceCoins: 0,
    powerCv: 343,
    zeroToHundredSec: 5.1,
    maxSpeedKmh: 250,
    colors: { body: '#1e4db7', accent: '#ffffff' },
    physics: {
      mass: 1490,
      reverseForce: 4800,
      brakeForce: 68,
      handbrakeForce: 22,
      handbrakeSideFriction: 0.58,
      frictionSlip: 11.0,
      maxSteerRad: 0.42,
      steerSpeed: 2.85,
      suspensionStiffness: 92,
      driveBias: 0,
      comBiasZ: 0.1,
      dragCoeff: 0.36,
      drivetrain: {
        peakTorqueNm: 365,
        peakTorqueRpm: 4900,
        redlineRpm: 8000,
        idleRpm: 850,
        gearRatios: [4.23, 2.53, 1.67, 1.23, 1.0, 0.83],
        finalDrive: 3.62,
        efficiency: 0.9,
      },
    },
    geometry: {
      chassisHalf: { x: 0.86, y: 0.32, z: 2.02 },
      wheelRadius: 0.33,
      wheelHubs: [
        [0.799, 1.559],
        [-0.799, 1.559],
        [0.799, -1.164],
        [-0.799, -1.164],
      ],
    },
  },
  skyline_r34: {
    id: 'skyline_r34',
    name: 'Nissan Skyline GT-R R34',
    year: 1999,
    cls: 'A',
    priceCoins: 0,
    powerCv: 280,
    zeroToHundredSec: 4.9,
    maxSpeedKmh: 250,
    colors: { body: '#b8bcc4', accent: '#c4122f' },
    physics: {
      mass: 1540,
      reverseForce: 4600,
      brakeForce: 66,
      handbrakeForce: 22,
      handbrakeSideFriction: 0.6,
      frictionSlip: 11.6,
      maxSteerRad: 0.42,
      steerSpeed: 2.75,
      suspensionStiffness: 90,
      driveBias: 0.4,
      comBiasZ: 0.08,
      dragCoeff: 0.37,
      drivetrain: {
        peakTorqueNm: 392,
        peakTorqueRpm: 4400,
        redlineRpm: 7600,
        idleRpm: 850,
        gearRatios: [3.83, 2.28, 1.52, 1.15, 0.89, 0.74],
        finalDrive: 3.55,
        efficiency: 0.89,
      },
    },
    geometry: {
      chassisHalf: { x: 0.85, y: 0.32, z: 2.02 },
      wheelRadius: 0.325,
      wheelHubs: [
        [0.731, 1.374],
        [-0.731, 1.374],
        [0.731, -1.255],
        [-0.731, -1.255],
      ],
    },
  },
  supra_a90: {
    id: 'supra_a90',
    name: 'Toyota Supra A90 LB',
    year: 2020,
    cls: 'A',
    priceCoins: 0,
    powerCv: 400,
    zeroToHundredSec: 4.0,
    maxSpeedKmh: 270,
    colors: { body: '#e8e6e1', accent: '#111111' },
    physics: {
      mass: 1550,
      reverseForce: 5000,
      brakeForce: 70,
      handbrakeForce: 24,
      handbrakeSideFriction: 0.56,
      frictionSlip: 10.8,
      maxSteerRad: 0.42,
      steerSpeed: 2.8,
      suspensionStiffness: 94,
      driveBias: 0,
      comBiasZ: 0.11,
      dragCoeff: 0.34,
      drivetrain: {
        peakTorqueNm: 520,
        peakTorqueRpm: 2800,
        redlineRpm: 7000,
        idleRpm: 800,
        gearRatios: [3.63, 2.19, 1.52, 1.15, 0.95, 0.8],
        finalDrive: 3.15,
        efficiency: 0.91,
      },
    },
    geometry: {
      chassisHalf: { x: 0.92, y: 0.3, z: 1.95 },
      wheelRadius: 0.335,
      wheelHubs: [
        [0.846, 1.205],
        [-0.846, 1.205],
        [0.885, -1.193],
        [-0.885, -1.193],
      ],
    },
  },
  m4_g82: {
    id: 'm4_g82',
    name: 'BMW M4 G82 ADRO',
    year: 2022,
    cls: 'A',
    priceCoins: 0,
    powerCv: 510,
    zeroToHundredSec: 3.7,
    maxSpeedKmh: 290,
    colors: { body: '#111111', accent: '#c4122f' },
    physics: {
      mass: 1725,
      reverseForce: 5500,
      brakeForce: 74,
      handbrakeForce: 24,
      handbrakeSideFriction: 0.58,
      frictionSlip: 11.4,
      maxSteerRad: 0.4,
      steerSpeed: 2.95,
      suspensionStiffness: 100,
      driveBias: 0,
      comBiasZ: 0.12,
      dragCoeff: 0.33,
      drivetrain: {
        peakTorqueNm: 650,
        peakTorqueRpm: 2750,
        redlineRpm: 7500,
        idleRpm: 800,
        gearRatios: [4.71, 2.99, 2.08, 1.65, 1.3, 1.0, 0.84, 0.67],
        finalDrive: 3.46,
        efficiency: 0.92,
      },
    },
    geometry: {
      chassisHalf: { x: 0.95, y: 0.32, z: 2.12 },
      wheelRadius: 0.34,
      wheelHubs: [
        [0.887, 1.509],
        [-0.887, 1.509],
        [0.877, -1.299],
        [-0.877, -1.299],
      ],
    },
  },
};

export const STARTER_CAR_ID = 'golf_gti';

export const ALL_CAR_IDS = Object.keys(CARS);

export function carOrStarter(id: string | undefined | null): CarSpec {
  return (id && CARS[id]) || CARS[STARTER_CAR_ID];
}
