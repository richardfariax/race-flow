/**
 * Telemetria da física do carro local — singleton mutável, no mesmo padrão do
 * `localCar`. O Vehicle escreve aqui a cada frame; o DebugOverlay lê via rAF.
 * NÃO é estado React (nada de re-render por frame): é um objeto global lido sob
 * demanda, sem alocação no hot path.
 *
 * Unidades: velocidades em m/s, ângulos em rad, yaw em rad/s. `load`,
 * `longImpulse`, `latImpulse` e `assistYaw` estão em unidades internas do
 * raycast vehicle do Rapier (impulso/força por passo) — servem para leitura
 * relativa (comparar rodas, ver o pico do slip), não como Newtons absolutos.
 */

/** Estados de dirigibilidade (leitura/telemetria; não dirigem a física). */
export type HandlingState =
  | 'GRIP'
  | 'DRIFT_ENTRY'
  | 'DRIFT'
  | 'DRIFT_RECOVERY'
  | 'AIRBORNE'
  | 'RESETTING';

export interface WheelTelemetry {
  /** raio da roda tocou o solo neste passo */
  contact: boolean;
  /** o ponto de contato está no asfalto (vs. grama/escape) */
  onRoad: boolean;
  /** carga vertical (wheelSuspensionForce) — unidade Rapier */
  load: number;
  /** compressão da suspensão 0..1+ ((rest - len)/curso) */
  compression: number;
  /** esterçamento aplicado à roda (rad) */
  steer: number;
  /** impulso longitudinal do pneu no passo (tração/freio) */
  longImpulse: number;
  /** impulso lateral do pneu no passo (força de curva) */
  latImpulse: number;
}

export interface Telemetry {
  /** true quando o Vehicle está ativo e escrevendo dados */
  live: boolean;
  speedMs: number;
  gear: number;
  rpm: number;
  /** entrada de acelerador com sinal (-1 ré/freio .. 1) */
  throttle: number;
  /** pedal de freio de serviço 0..1 (após rampa) */
  brakePedal: number;
  /** freio de mão 0..1 (após engate) */
  handbrakePedal: number;
  /** ângulo real das rodas dianteiras (rad) */
  steerAngle: number;
  /** pedido de direção rampado -1..1 */
  steerInput: number;
  /** ângulo de deriva instantâneo, com sinal (rad) */
  slipAngle: number;
  /** ângulo lateral memorizado/alvo do powerslide, com sinal (rad) */
  driftAngle: number;
  /** taxa de guinada (rad/s) */
  yawRate: number;
  /** carga de drift residual 0..1 */
  driftHold: number;
  /** torque de correção de yaw aplicado pelas assistências neste passo */
  assistYaw: number;
  state: HandlingState;
  /** nº de rodas em contato (0..4) */
  wheelsOnGround: number;
  /** chassi sobre o asfalto */
  onRoad: boolean;
  wheels: WheelTelemetry[];
}

function emptyWheel(): WheelTelemetry {
  return {
    contact: false,
    onRoad: false,
    load: 0,
    compression: 0,
    steer: 0,
    longImpulse: 0,
    latImpulse: 0,
  };
}

/** Singleton compartilhado. Reutiliza os mesmos objetos de roda (sem GC). */
export const telemetry: Telemetry = {
  live: false,
  speedMs: 0,
  gear: 1,
  rpm: 0,
  throttle: 0,
  brakePedal: 0,
  handbrakePedal: 0,
  steerAngle: 0,
  steerInput: 0,
  slipAngle: 0,
  driftAngle: 0,
  yawRate: 0,
  driftHold: 0,
  assistYaw: 0,
  state: 'GRIP',
  wheelsOnGround: 0,
  onRoad: true,
  wheels: [emptyWheel(), emptyWheel(), emptyWheel(), emptyWheel()],
};
