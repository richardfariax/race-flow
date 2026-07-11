/**
 * Catálogo de carros — compartilhado entre cliente (física/visual/loja) e
 * servidor (validação de velocidade, preço autoritativo).
 * Preço REAL é o do banco (cars_catalog); este arquivo espelha p/ UI e física.
 */

export type CarClass = 'C' | 'B' | 'A';

export interface CarPhysics {
  mass: number;
  engineForce: number;
  reverseForce: number;
  brakeForce: number;
  handbrakeForce: number;
  /** grip lateral traseiro com freio de mão (menor = mais drift) */
  handbrakeSideFriction: number;
  frictionSlip: number;
  maxSteerRad: number;
  steerSpeed: number;
  suspensionStiffness: number;
}

export interface CarSpec {
  id: string;
  name: string;
  cls: CarClass;
  priceCoins: number;
  /** teto plausível p/ validação anti-cheat no servidor (margem inclusa lá) */
  maxSpeedKmh: number;
  colors: { body: string; accent: string };
  physics: CarPhysics;
}

export const CARS: Record<string, CarSpec> = {
  vega: {
    id: 'vega',
    name: 'Vega',
    cls: 'C',
    priceCoins: 0,
    maxSpeedKmh: 138,
    colors: { body: '#ff6b35', accent: '#2ec4b6' },
    physics: {
      mass: 320,
      engineForce: 5200,
      reverseForce: 3000,
      brakeForce: 45,
      handbrakeForce: 32,
      handbrakeSideFriction: 0.35,
      // ~default do raycast vehicle (10.5): abaixo disso o carro ara reto
      frictionSlip: 10.5,
      maxSteerRad: 0.62,
      steerSpeed: 5.5,
      suspensionStiffness: 32,
    },
  },
  falcao: {
    id: 'falcao',
    name: 'Falcão',
    cls: 'B',
    priceCoins: 1500,
    maxSpeedKmh: 168,
    colors: { body: '#118ab2', accent: '#ffd166' },
    physics: {
      mass: 300,
      engineForce: 6800,
      reverseForce: 3400,
      brakeForce: 52,
      handbrakeForce: 34,
      handbrakeSideFriction: 0.4,
      frictionSlip: 11.5,
      maxSteerRad: 0.58,
      steerSpeed: 6,
      suspensionStiffness: 36,
    },
  },
  tempesta: {
    id: 'tempesta',
    name: 'Tempesta',
    cls: 'A',
    priceCoins: 4000,
    maxSpeedKmh: 198,
    colors: { body: '#9b5de5', accent: '#f15bb5' },
    physics: {
      mass: 290,
      engineForce: 8600,
      reverseForce: 3800,
      brakeForce: 60,
      handbrakeForce: 38,
      handbrakeSideFriction: 0.28, // rainha do drift
      frictionSlip: 10.0, // traseira mais viva que o Falcão
      maxSteerRad: 0.55,
      steerSpeed: 6.5,
      suspensionStiffness: 40,
    },
  },
};

export const STARTER_CAR_ID = 'vega';

export function carOrStarter(id: string | undefined | null): CarSpec {
  return (id && CARS[id]) || CARS[STARTER_CAR_ID];
}
