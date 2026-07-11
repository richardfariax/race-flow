import { Room, type Client } from 'colyseus';
import { Schema, MapSchema, type } from '@colyseus/schema';
import { carOrStarter } from '../../../shared/cars';
import { TRACK, spawnSlot, checkpointAt } from '../../../shared/track';
import {
  NET,
  type ClientStateMsg,
  type GameMode,
  type JoinOptions,
  type ResultEntry,
} from '../../../shared/protocol';
import { verifyToken, applyRaceResult } from '../supabaseAdmin';

/**
 * Sala autoritativa de corrida (circuit) e drift.
 *
 * Modelo (MVP, declarado): o cliente simula o próprio carro (predição);
 * o servidor valida sanidade (sem teleporte, velocidade plausível do carro),
 * decide checkpoints, voltas, drift score, resultado e recompensas.
 * Estado rejeitado gera 'correction'. Upgrade futuro: re-simulação server-side.
 */

export class PlayerState extends Schema {
  @type('string') nick = '';
  @type('string') carId = 'vega';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') z = 0;
  @type('number') qx = 0;
  @type('number') qy = 0;
  @type('number') qz = 0;
  @type('number') qw = 1;
  @type('number') speed = 0;
  @type('uint8') lap = 1;
  @type('uint8') checkpoint = 0;
  @type('uint32') driftScore = 0;
  @type('number') driftCombo = 0;
  @type('number') bestLapMs = 0;
  @type('number') lastLapMs = 0;
  @type('boolean') finished = false;
  @type('uint8') finishPos = 0;
}

export class RaceState extends Schema {
  @type('string') mode: GameMode = 'circuit';
  @type('string') phase = 'lobby';
  @type('number') countdownMs = 0;
  @type('number') raceTimeMs = 0;
  @type('uint8') totalLaps = TRACK.totalLaps;
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}

interface PlayerRuntime {
  profileId: string | null;
  lastMsgAt: number;
  lastValid: { x: number; y: number; z: number; qx: number; qy: number; qz: number; qw: number };
  violations: number;
  lapStartMs: number;
  totalTimeMs: number;
  slot: number;
  driftComboTime: number;
}

const now = () => Date.now();

function sanitizeNick(raw: unknown): string {
  const s = String(raw ?? '')
    .replace(/[^\p{L}\p{N} _\-.]/gu, '')
    .trim()
    .slice(0, 16);
  return s || `Piloto${Math.floor(Math.random() * 900 + 100)}`;
}

const CIRCUIT_REWARDS = [200, 120, 80, 50, 40, 30, 20, 10];

export class RaceRoom extends Room<{ state: RaceState }> {
  maxClients = NET.maxPlayers;

  private runtime = new Map<string, PlayerRuntime>();
  private nextSlot = 0;
  private lobbyStartedAt = 0;
  private raceStartedAt = 0;
  private firstFinishAt = 0;
  private finishCount = 0;
  private resultsSent = false;

  onCreate(options: Partial<JoinOptions>) {
    const state = new RaceState();
    state.mode = options.mode === 'drift' ? 'drift' : 'circuit';
    this.setState(state);
    this.patchRate = NET.patchIntervalMs;

    this.onMessage('state', (client, msg: ClientStateMsg) => this.handleState(client, msg));
    this.setSimulationInterval((dt) => this.tick(dt), NET.patchIntervalMs);
    this.lobbyStartedAt = now();
  }

  async onJoin(client: Client, options: Partial<JoinOptions>) {
    const car = carOrStarter(options.carId);
    const slotIndex = this.nextSlot++;
    const slot = spawnSlot(slotIndex);

    const p = new PlayerState();
    p.nick = sanitizeNick(options.nick);
    p.carId = car.id;
    p.x = slot.x;
    p.y = 1.2;
    p.z = slot.z;
    p.qy = Math.sin(slot.yaw / 2);
    p.qw = Math.cos(slot.yaw / 2);
    this.state.players.set(client.sessionId, p);

    this.runtime.set(client.sessionId, {
      profileId: null,
      lastMsgAt: 0,
      lastValid: { x: p.x, y: p.y, z: p.z, qx: 0, qy: p.qy, qz: 0, qw: p.qw },
      violations: 0,
      lapStartMs: 0,
      totalTimeMs: 0,
      slot: slotIndex,
      driftComboTime: 0,
    });

    // autenticação opcional (convidado joga sem token; economia exige token válido)
    if (options.token) {
      const profileId = await verifyToken(options.token);
      const rt = this.runtime.get(client.sessionId);
      if (rt) rt.profileId = profileId;
    }
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.runtime.delete(client.sessionId);
  }

  // ---------- estado do cliente + validação de sanidade ----------

  private handleState(client: Client, msg: ClientStateMsg) {
    const p = this.state.players.get(client.sessionId);
    const rt = this.runtime.get(client.sessionId);
    if (!p || !rt || p.finished) return;
    if (this.state.phase !== 'racing') return; // antes da largada ninguém se move

    const vals = [msg.x, msg.y, msg.z, msg.qx, msg.qy, msg.qz, msg.qw, msg.speed];
    if (vals.some((v) => typeof v !== 'number' || !Number.isFinite(v))) return;

    const t = now();
    const dt = rt.lastMsgAt ? Math.min((t - rt.lastMsgAt) / 1000, 0.5) : 1 / NET.stateSendHz;
    rt.lastMsgAt = t;

    // anti-teleporte: deslocamento máximo plausível p/ o carro no intervalo
    const car = carOrStarter(p.carId);
    const maxDist = (car.maxSpeedKmh / 3.6) * NET.speedValidationMargin * dt + 0.5;
    const dx = msg.x - rt.lastValid.x;
    const dy = msg.y - rt.lastValid.y;
    const dz = msg.z - rt.lastValid.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist > maxDist) {
      rt.violations++;
      client.send('correction', rt.lastValid);
      return;
    }

    rt.lastValid = { x: msg.x, y: msg.y, z: msg.z, qx: msg.qx, qy: msg.qy, qz: msg.qz, qw: msg.qw };
    p.x = msg.x;
    p.y = msg.y;
    p.z = msg.z;
    p.qx = msg.qx;
    p.qy = msg.qy;
    p.qz = msg.qz;
    p.qw = msg.qw;
    p.speed = Math.min(Math.abs(msg.speed), (car.maxSpeedKmh / 3.6) * NET.speedValidationMargin);

    if (this.state.mode === 'circuit') this.updateCheckpoints(p, rt);
    else this.updateDrift(p, rt, dx, dz, dist, dt);
  }

  /** Checkpoints/voltas decididos NO SERVIDOR a partir de posições validadas. */
  private updateCheckpoints(p: PlayerState, rt: PlayerRuntime) {
    const cp = checkpointAt(p.x, p.z);
    const next = (p.checkpoint + 1) % TRACK.checkpoints;
    if (cp !== next) return; // fora de ordem (ré, atalho pelo infield) não conta

    p.checkpoint = cp;
    if (cp === 0) {
      // cruzou a linha completando a volta
      const t = now();
      const lapMs = t - rt.lapStartMs;
      rt.lapStartMs = t;
      p.lastLapMs = lapMs;
      if (!p.bestLapMs || lapMs < p.bestLapMs) p.bestLapMs = lapMs;

      if (p.lap >= this.state.totalLaps) {
        p.finished = true;
        p.finishPos = ++this.finishCount;
        rt.totalTimeMs = t - this.raceStartedAt;
        if (!this.firstFinishAt) this.firstFinishAt = t;
      } else {
        p.lap++;
      }
    }
  }

  /** Drift score server-side: ângulo de derrapagem × velocidade × tempo, com combo. */
  private updateDrift(
    p: PlayerState,
    rt: PlayerRuntime,
    dx: number,
    dz: number,
    dist: number,
    dt: number,
  ) {
    const speed = dist / Math.max(dt, 1e-3);
    if (speed < 6) {
      rt.driftComboTime = 0;
      p.driftCombo = 0;
      return;
    }
    // frente do carro (+Z local) no plano XZ, a partir do quaternion
    const fx = 2 * (p.qx * p.qz + p.qw * p.qy);
    const fz = 1 - 2 * (p.qx * p.qx + p.qy * p.qy);
    const flen = Math.hypot(fx, fz) || 1;
    const vx = dx / dist;
    const vz = dz / dist;
    const cos = Math.max(-1, Math.min(1, (fx * vx + fz * vz) / flen));
    const slip = Math.acos(cos);

    if (slip > 0.26 && slip < 2.8) {
      rt.driftComboTime += dt;
      const combo = 1 + Math.min(rt.driftComboTime, 5) * 0.6; // até ~4x
      p.driftCombo = Math.round(combo * 10) / 10;
      p.driftScore += Math.round(slip * speed * dt * 12 * combo);
    } else {
      rt.driftComboTime = 0;
      p.driftCombo = 0;
    }
  }

  // ---------- máquina de fases ----------

  private tick(_dt: number) {
    const t = now();
    switch (this.state.phase) {
      case 'lobby': {
        if (this.clients.length >= NET.minPlayers && t - this.lobbyStartedAt >= NET.lobbyWaitMs) {
          this.state.phase = 'countdown';
          this.state.countdownMs = NET.countdownMs;
          this.lock().catch(() => {});
        }
        break;
      }
      case 'countdown': {
        this.state.countdownMs -= NET.patchIntervalMs;
        if (this.state.countdownMs <= 0) {
          this.state.phase = 'racing';
          this.raceStartedAt = t;
          this.runtime.forEach((rt) => (rt.lapStartMs = t));
        }
        break;
      }
      case 'racing': {
        this.state.raceTimeMs = t - this.raceStartedAt;
        const timeUp =
          this.state.mode === 'drift'
            ? this.state.raceTimeMs >= NET.driftDurationMs
            : this.state.raceTimeMs >= NET.maxRaceMs ||
              (this.firstFinishAt > 0 && t - this.firstFinishAt >= NET.finishTimeoutMs);
        const allDone =
          this.state.mode === 'circuit' &&
          this.state.players.size > 0 &&
          [...this.state.players.values()].every((p) => p.finished);
        if (timeUp || allDone) this.finishRace();
        break;
      }
      case 'finished':
        break;
    }
  }

  /** Resultado calculado e creditado NO SERVIDOR. */
  private finishRace() {
    if (this.resultsSent) return;
    this.resultsSent = true;
    this.state.phase = 'finished';

    const players = [...this.state.players.entries()];
    const ordered =
      this.state.mode === 'drift'
        ? players.sort(([, a], [, b]) => b.driftScore - a.driftScore)
        : players.sort(([, a], [, b]) => {
            if (a.finished !== b.finished) return a.finished ? -1 : 1;
            if (a.finished && b.finished) return a.finishPos - b.finishPos;
            if (a.lap !== b.lap) return b.lap - a.lap;
            return b.checkpoint - a.checkpoint;
          });

    const entries: ResultEntry[] = ordered.map(([sessionId, p], i) => {
      const rt = this.runtime.get(sessionId);
      const metric =
        this.state.mode === 'drift'
          ? p.driftScore
          : rt?.totalTimeMs || this.state.raceTimeMs + 60_000; // DNF: tempo punitivo
      const coins =
        this.state.mode === 'drift'
          ? Math.floor(p.driftScore / 50)
          : (p.finished ? CIRCUIT_REWARDS[i] ?? 10 : 5) + TRACK.totalLaps * 10;
      return {
        sessionId,
        nick: p.nick,
        carId: p.carId,
        position: i + 1,
        metric,
        bestLapMs: p.bestLapMs,
        coins,
      };
    });

    this.broadcast('results', { mode: this.state.mode, track: TRACK.id, entries });

    // persistência (só jogadores autenticados; validação já aconteceu acima)
    for (const e of entries) {
      const rt = this.runtime.get(e.sessionId);
      if (rt?.profileId) {
        void applyRaceResult({
          profileId: rt.profileId,
          mode: this.state.mode,
          track: TRACK.id,
          metric: e.metric,
          position: e.position,
          coins: e.coins,
        });
      }
    }

    this.clock.setTimeout(() => this.disconnect(), 20_000);
  }
}
