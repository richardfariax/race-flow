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
  /** -1 (S) .. 1 (W) */
  throttle: number;
  /** Velocidade longitudinal do Rapier (+ frente, − ré) */
  speedMs: number;
  /** Força máxima de ré (escala Rapier, negativa quando aplicada) */
  reverseForce: number;
}

export interface VehicleDriveIntent {
  /** Pedal de serviço 0..1 (hidráulico, mesma intensidade em ambos os sentidos) */
  brakePedal: number;
  /**
   * Força nas rodas via motor/câmbio (escala Rapier).
   * Positivo = avança, negativo = ré. Zero quando freando ou em coast.
   */
  wheelForce: number;
  /** Aceleração à frente para o simulador de câmbio (0..1) */
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
