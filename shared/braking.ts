/**
 * Freio calibrado para o Rapier raycast vehicle.
 *
 * - **S (serviço):** 4 rodas, força plena em qualquer velocidade (hidráulico real).
 * - **Espaço (mão):** só traseira, força alta o bastante para **travar** as rodas;
 *   o drift controlado (ângulo × direção) é feito no Vehicle.
 *
 * brakeForce = impulso MÁX por roda (escala Rapier ~35–95).
 * Desaceleração alvo ~0,85–0,95 g em todos os veículos via escala por massa.
 */

export interface ServiceBrakeInput {
  pedal: number;
  maxPerWheel: number;
  massKg: number;
  frontBias: number;
  /** usado no reforço de freio em baixa velocidade */
  absSpeedMs?: number;
}

export interface BrakeWheels {
  front: number;
  rear: number;
}

/** Ganho global de serviço (+50% em todos os veículos — freada mais curta) */
const SERVICE_BRAKE_GAIN = 1.5;

/** Impulso mínimo por roda para ~0,9 g de desaceleração no Rapier */
const BRAKE_PER_KG = 0.0505 * SERVICE_BRAKE_GAIN;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Reforço em baixa velocidade — Rapier perde aderência de freio perto de 0 m/s.
 * +22% parado → 0% extra acima de ~8 m/s (~29 km/h).
 */
function lowSpeedBrakeBoost(absSpeedMs: number): number {
  const t = clamp(absSpeedMs / 8, 0, 1);
  return 1 + 0.8 * (1 - t);
}

export function rapierServiceBrakes(input: ServiceBrakeInput): BrakeWheels {
  const pedal = clamp(input.pedal, 0, 1);
  if (pedal < 0.02) return { front: 0, rear: 0 };

  const massFloor = input.massKg * BRAKE_PER_KG;
  const speedMul = lowSpeedBrakeBoost(input.absSpeedMs ?? 0);
  const perWheel =
    Math.max(input.maxPerWheel * SERVICE_BRAKE_GAIN, massFloor) *
    pedal *
    speedMul;
  const bias = clamp(input.frontBias, 0.52, 0.68);

  return {
    front: perWheel * bias,
    rear: perWheel * (1 - bias),
  };
}

/**
 * Freio de mão (Espaço): só eixo traseiro.
 * ~75% da força de serviço — trava as rodas de verdade (lock + fumaça).
 * `pedal` 0..1 = engate progressivo do cabo.
 */
export function rapierHandbrakeRear(
  pedal: number,
  handbrakePerWheel: number,
  serviceRearPerWheel: number,
  serviceMaxPerWheel: number,
  massKg: number,
): number {
  const amount = clamp(pedal, 0, 1);
  if (amount < 0.02) return serviceRearPerWheel;

  const massFloor = massKg * BRAKE_PER_KG * 0.55;
  const hb =
    Math.max(
      handbrakePerWheel * SERVICE_BRAKE_GAIN,
      serviceMaxPerWheel * 0.75 * SERVICE_BRAKE_GAIN,
      massFloor,
    ) * amount;
  return Math.max(serviceRearPerWheel, hb);
}

/** @deprecated use rapierServiceBrakes */
export interface BrakePedalInput {
  pedal: number;
  maxPerWheel: number;
  frontBias: number;
  absSpeedMs: number;
}

/** @deprecated use rapierServiceBrakes */
export function rapierWheelBrakes(input: BrakePedalInput): BrakeWheels {
  return rapierServiceBrakes({
    pedal: input.pedal,
    maxPerWheel: input.maxPerWheel,
    massKg: 1200,
    frontBias: input.frontBias,
  });
}
