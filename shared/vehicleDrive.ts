/**
 * Intenção de condução — modelo de carro automático real:
 *
 * - W (throttle > 0): acelera para frente; se já em ré, freia até parar.
 * - S (throttle < 0): freia se indo para frente; se parado ou em ré, acelera para trás.
 * - Sem pedal (0): desliza (coast) com freio-motor leve nas marchas à frente.
 *
 * Mesma regra do protótipo Fase 0, com saída tipada para o Rapier vehicle.
 */

export type VehicleDriveMode = 'accel' | 'brake' | 'reverse' | 'coast';

/** Praticamente parado — só então S engata ré (~0,5 km/h) */
export const BRAKE_STOP_SPEED_MS = 0.14;

export interface VehicleDriveInput {
  throttle: number;
  /** velocidade longitudinal Rapier (+ frente, − ré) */
  speedMs: number;
  reverseForce: number;
}

export interface VehicleDriveIntent {
  brakePedal: number;
  /** Positivo = avança, negativo = ré. Zero quando freando ou em coast. */
  wheelForce: number;
  /** 0..1 — entrada do simulador de câmbio */
  forwardThrottle: number;
  /** -1 = ré, 0 = indefinido (coast/freio), 1..N preenchido pelo drivetrain */
  gear: number;
  mode: VehicleDriveMode;
}

export function resolveVehicleDrive(input: VehicleDriveInput): VehicleDriveIntent {
  const throttle = clamp(input.throttle, -1, 1);
  const speedMs = input.speedMs;
  const movingForward = speedMs > BRAKE_STOP_SPEED_MS;
  const movingBack = speedMs < -BRAKE_STOP_SPEED_MS;

  if (throttle > 0) {
    if (movingBack) {
      return {
        brakePedal: throttle,
        wheelForce: 0,
        forwardThrottle: 0,
        gear: -1,
        mode: 'brake',
      };
    }
    return {
      brakePedal: 0,
      wheelForce: 0,
      forwardThrottle: throttle,
      gear: 0,
      mode: 'accel',
    };
  }

  if (throttle < 0) {
    if (movingForward) {
      return {
        brakePedal: -throttle,
        wheelForce: 0,
        forwardThrottle: 0,
        gear: 0,
        mode: 'brake',
      };
    }
    return {
      brakePedal: 0,
      wheelForce: input.reverseForce * throttle,
      forwardThrottle: 0,
      gear: -1,
      mode: 'reverse',
    };
  }

  return {
    brakePedal: 0,
    wheelForce: 0,
    forwardThrottle: 0,
    gear: 0,
    mode: 'coast',
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
