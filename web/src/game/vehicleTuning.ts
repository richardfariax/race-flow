/**
 * Configuração central de dirigibilidade do carro local (raycast vehicle Rapier).
 *
 * Aqui vivem TODOS os parâmetros ajustáveis "globais" da física — antes espalhados
 * como `const BASE` dentro de Vehicle.tsx. Os parâmetros POR CARRO (massa, torque,
 * grip, marchas, geometria) ficam em `shared/cars.ts`; o tuning de peça em
 * `shared/tuning.ts`. Nenhum número mágico de física deve ficar escondido no meio
 * da lógica: se precisar calibrar o comportamento, mude aqui.
 *
 * IMPORTANTE sobre unidades: massas e dimensões são ~SI (1 unidade ≈ 1 m). Mas
 * `brakeForce`, `suspensionStiffness` e os ganhos de drift NÃO são SI — são
 * unidades internas do `DynamicRayCastVehicleController` do Rapier, calibradas na
 * simulação. Não aplique valores reais (N/m, N·s/m) diretamente aqui.
 *
 * Ver docs/vehicle-physics.md para o mapa completo de calibração.
 */

/**
 * Passo fixo da simulação (Hz⁻¹). O `<Physics>` do Rapier já faz acumulador,
 * clamp de dt (máx. 0,5 s contra troca de aba) e interpola o visual — então a
 * dirigibilidade independe do FPS. Os ganhos de drift abaixo estão calibrados
 * neste passo; trocar para 1/120 melhora a estabilidade em alta, mas dobra o
 * custo e pede recalibração — só faça com telemetria/drive-test.
 */
export const PHYSICS_TIMESTEP = 1 / 60;

export const BASE = {
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
  launchGripBase: 9.0,
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
  driftHoldDecay: 0.62,
  driftHoldThrottleSustain: 0.38,
  driftHoldSideBlend: 0.68,
  /** ângulo lateral memorizado no hold (~30°) */
  driftHoldSlipCap: 0.5,
  /** yaw PD durante drift — volante pede rotação, não ângulo absoluto */
  driftYawKp: 0.018,
  /** amortecimento de yaw maior = menos snap/rodada ao iniciar o drift */
  driftYawKd: 0.024,
  /** contra-esterço + gás: segura o deslize lateral (Kp maior = sustenta melhor) */
  driftCounterKp: 0.04,
  driftCounterKd: 0.032,
  /** sustenta velocidade lateral com acelerador (ir de lado) */
  driftLatSustain: 0.011,
  /** impulso na direção do movimento (momentum do deslize) */
  driftVelCarry: 0.0016,
  /** entrada com freio de mão: abre drift na direção do volante (um pouco mais fácil) */
  driftEntryGain: 0.28,
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
   * Em ~100 km/h (~28 m/s) fica ~36% do lock; em 200 km/h ~22%.
   * (Menos falloff que antes p/ reduzir subesterço em média/alta.)
   */
  steerSpeedFalloff: 0.064,
  /** Rampa do input A/D (1/s) — tempo de virar o volante ~0,28 s (mais responsivo) */
  steerInputRate: 3.5,
  /** Retorno ao centro mais rápido (self-aligning) */
  steerReturnRate: 5.0,
  /** Fração da taxa de esterçamento que sobra em alta velocidade (mais autoridade) */
  steerRespMin: 0.34,
  /** reduz lock ao derrapar; maior = a frente crava mais (menos subesterço) */
  steerSlipCutAngle: 0.44,
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
} as const;

export type VehicleTuning = typeof BASE;
