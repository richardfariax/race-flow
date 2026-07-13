/**
 * Drivetrain com estado: torque, marchas, embreagem na largada e trocas automáticas.
 * O cliente chama stepDrivetrain a cada passo de física; o servidor só valida vmax.
 */

export interface DrivetrainSpec {
  peakTorqueNm: number;
  peakTorqueRpm: number;
  redlineRpm: number;
  idleRpm: number;
  gearRatios: readonly number[];
  finalDrive: number;
  efficiency: number;
}

export interface DriveSimState {
  gearIndex: number;
  engineRpm: number;
  shiftCooldown: number;
  shiftTimer: number;
  shifting: boolean;
}

export function createDriveState(idleRpm = 800): DriveSimState {
  return { gearIndex: 0, engineRpm: idleRpm, shiftCooldown: 0, shiftTimer: 0, shifting: false };
}

export interface DriveOutput {
  wheelForce: number;
  rpm: number;
  /** -1 = ré, 0 = neutro, 1..N = marchas */
  gear: number;
  rpmNorm: number;
  shifting: boolean;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

/** Curva de torque: sobe até o pico e cai suave até o corte. */
export function torqueAtRpm(dt: DrivetrainSpec, rpm: number): number {
  const { peakTorqueNm: tp, peakTorqueRpm: rp, redlineRpm: rr, idleRpm: ri } = dt;
  const r = clamp(rpm, ri * 0.35, rr * 1.03);
  if (r <= rp) {
    const t = (r - ri) / Math.max(1, rp - ri);
    return tp * (0.62 + 0.38 * clamp(t, 0, 1));
  }
  const t = (r - rp) / Math.max(1, rr - rp);
  return tp * (1 - 0.32 * clamp(t, 0, 1));
}

export function engineRpmFromSpeed(
  speedMs: number,
  wheelRadius: number,
  gearRatio: number,
  finalDrive: number,
): number {
  if (wheelRadius < 1e-4 || gearRatio < 1e-4) return 0;
  const wheelRadPerSec = Math.abs(speedMs) / wheelRadius;
  return (wheelRadPerSec * gearRatio * finalDrive * 60) / (2 * Math.PI);
}

export function speedAtRpm(
  rpm: number,
  wheelRadius: number,
  gearRatio: number,
  finalDrive: number,
): number {
  if (wheelRadius < 1e-4 || gearRatio < 1e-4) return 0;
  const wheelRpm = rpm / (gearRatio * finalDrive);
  return (wheelRpm / 60) * 2 * Math.PI * wheelRadius;
}

export function wheelForceFromEngine(
  torqueNm: number,
  gearRatio: number,
  finalDrive: number,
  efficiency: number,
  wheelRadius: number,
): number {
  if (wheelRadius < 1e-4) return 0;
  return (torqueNm * gearRatio * finalDrive * efficiency) / wheelRadius;
}

const UPSHIFT_RPM_FRAC = 0.87;
const DOWNSHIFT_RPM_FRAC = 0.38;
const SHIFT_COOLDOWN_SEC = 0.32;
const SHIFT_DURATION_SEC = 0.14;
const LAUNCH_COUPLING_SPEED = 8.5;
const REV_RATE = 6800;

function upshiftSpeedMs(
  dt: DrivetrainSpec,
  gearIndex: number,
  wheelRadius: number,
): number {
  const ratio = dt.gearRatios[gearIndex] ?? 1;
  return speedAtRpm(
    dt.redlineRpm * UPSHIFT_RPM_FRAC,
    wheelRadius,
    ratio,
    dt.finalDrive,
  );
}

function downshiftSpeedMs(
  dt: DrivetrainSpec,
  gearIndex: number,
  wheelRadius: number,
): number {
  if (gearIndex <= 0) return 0;
  const ratio = dt.gearRatios[gearIndex - 1] ?? 1;
  return speedAtRpm(
    dt.redlineRpm * DOWNSHIFT_RPM_FRAC,
    wheelRadius,
    ratio,
    dt.finalDrive,
  );
}

/**
 * Simula um passo do motor + câmbio automático.
 * Arrancada: embreagem patina — o motor sobe de giro antes das rodas acompanharem.
 */
export function stepDrivetrain(opts: {
  dt: DrivetrainSpec;
  wheelRadius: number;
  speedMs: number;
  throttle: number;
  state: DriveSimState;
  dtSec: number;
  torqueMult?: number;
}): { output: DriveOutput; state: DriveSimState } {
  const { dt, wheelRadius, speedMs, throttle, dtSec, torqueMult = 1 } = opts;
  const st = { ...opts.state };
  const absSpeed = Math.abs(speedMs);
  const nGears = dt.gearRatios.length;

  st.shiftCooldown = Math.max(0, st.shiftCooldown - dtSec);

  if (st.shifting) {
    st.shiftTimer -= dtSec;
    if (st.shiftTimer <= 0) st.shifting = false;
  }

  if (absSpeed < 0.25 && throttle < 0.04) {
    st.gearIndex = 0;
    st.engineRpm = lerp(st.engineRpm, dt.idleRpm, dtSec * 8);
    return {
      state: st,
      output: {
        wheelForce: 0,
        rpm: st.engineRpm,
        gear: 1,
        rpmNorm: clamp((st.engineRpm - dt.idleRpm) / (dt.redlineRpm - dt.idleRpm), 0, 1),
        shifting: false,
      },
    };
  }

  const ratio = dt.gearRatios[st.gearIndex] ?? dt.gearRatios[0];

  if (!st.shifting && st.shiftCooldown <= 0 && throttle > 0.12 && absSpeed >= 4) {
    const upSpd = upshiftSpeedMs(dt, st.gearIndex, wheelRadius);
    const coupledForShift = engineRpmFromSpeed(speedMs, wheelRadius, ratio, dt.finalDrive);
    if (
      st.gearIndex < nGears - 1 &&
      absSpeed >= upSpd * 0.96 &&
      coupledForShift >= dt.redlineRpm * 0.8
    ) {
      st.gearIndex += 1;
      st.shifting = true;
      st.shiftTimer = SHIFT_DURATION_SEC;
      st.shiftCooldown = SHIFT_COOLDOWN_SEC;
      st.engineRpm = engineRpmFromSpeed(
        speedMs,
        wheelRadius,
        dt.gearRatios[st.gearIndex] ?? ratio,
        dt.finalDrive,
      );
    } else if (st.gearIndex > 0) {
      const downSpd = downshiftSpeedMs(dt, st.gearIndex, wheelRadius);
      if (absSpeed < downSpd * 1.05) {
        st.gearIndex -= 1;
        st.shifting = true;
        st.shiftTimer = SHIFT_DURATION_SEC;
        st.shiftCooldown = SHIFT_COOLDOWN_SEC;
        st.engineRpm = engineRpmFromSpeed(
          speedMs,
          wheelRadius,
          dt.gearRatios[st.gearIndex] ?? ratio,
          dt.finalDrive,
        );
      }
    }
  }

  const activeRatio = dt.gearRatios[st.gearIndex] ?? ratio;
  const coupledNow = engineRpmFromSpeed(speedMs, wheelRadius, activeRatio, dt.finalDrive);

  // Embreagem: em baixa velocidade o motor pode subir de giro independente das rodas
  const coupling = clamp(absSpeed / LAUNCH_COUPLING_SPEED, 0, 1);
  const launchTarget = dt.idleRpm + throttle * (dt.redlineRpm - dt.idleRpm) * 0.92;

  if (throttle > 0.04 && coupling < 0.98) {
    const revTarget = Math.max(launchTarget, coupledNow);
    st.engineRpm += (revTarget - st.engineRpm) * clamp(REV_RATE * dtSec / Math.max(400, revTarget), 0, 1);
    st.engineRpm = lerp(st.engineRpm, coupledNow, coupling * 0.85);
  } else if (throttle > 0.04) {
    st.engineRpm = lerp(st.engineRpm, coupledNow, dtSec * 14);
  } else {
    const coastTarget = Math.max(dt.idleRpm, coupledNow * 0.92);
    st.engineRpm = lerp(st.engineRpm, coastTarget, dtSec * 6);
  }

  st.engineRpm = clamp(st.engineRpm, dt.idleRpm * 0.7, dt.redlineRpm * 1.02);

  let wheelForce = 0;
  if (throttle > 0.01) {
    if (!st.shifting) {
      const torque = torqueAtRpm(dt, st.engineRpm) * torqueMult;
      wheelForce =
        wheelForceFromEngine(torque, activeRatio, dt.finalDrive, dt.efficiency, wheelRadius) *
        throttle;

      if (coupling < 0.92) {
        const slipDrive = 0.58 + 0.42 * coupling;
        wheelForce *= slipDrive;
      }

      if (st.engineRpm > dt.redlineRpm * 0.97) {
        wheelForce *= clamp(1 - (st.engineRpm - dt.redlineRpm * 0.97) / (dt.redlineRpm * 0.05), 0.12, 1);
      }
    } else {
      wheelForce =
        wheelForceFromEngine(
          torqueAtRpm(dt, st.engineRpm) * torqueMult * 0.15,
          activeRatio,
          dt.finalDrive,
          dt.efficiency,
          wheelRadius,
        ) * throttle;
    }
  }

  const rpmNorm = clamp((st.engineRpm - dt.idleRpm) / Math.max(1, dt.redlineRpm - dt.idleRpm), 0, 1);

  return {
    state: st,
    output: {
      wheelForce,
      rpm: st.engineRpm,
      gear: st.gearIndex + 1,
      rpmNorm,
      shifting: st.shifting,
    },
  };
}

export function reverseRpmFromSpeed(
  speedMs: number,
  wheelRadius: number,
  finalDrive: number,
): number {
  return engineRpmFromSpeed(speedMs, wheelRadius, 3.2, finalDrive);
}

export function speedDragForce(speedMs: number, mass: number, dragCoeff: number): number {
  const v = Math.abs(speedMs);
  const rolling = mass * 0.015 * 9.81;
  const aero = dragCoeff * v * v;
  return rolling + aero;
}
