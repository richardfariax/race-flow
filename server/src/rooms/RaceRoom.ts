import { Room, type Client } from 'colyseus';
import { Schema, MapSchema, type } from '@colyseus/schema';
import { carOrStarter } from '../../../shared/cars';
import { effectiveSpec, matchClass, type Tuning } from '../../../shared/tuning';
import { TRACK, spawnSlot, checkpointAt } from '../../../shared/track';
import {
  NET,
  type ClientStateMsg,
  type GameMode,
  type JoinOptions,
  type ResultEntry,
} from '../../../shared/protocol';
import { verifyToken, applyRaceResult, fetchTuning } from '../supabaseAdmin';

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
  @type('string') carId = 'golf_gti';
  @type('string') bodyColor = '';
  @type('string') accentColor = '';
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
  @type('boolean') isPrivate = false;
  /** anfitrião (sala privada): quem pode dar a largada */
  @type('string') hostId = '';
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}

interface PlayerRuntime {
  profileId: string | null;
  /** vel. máx efetiva (carro + tuning REAL do banco) p/ validação */
  maxSpeedKmh: number;
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
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
/** encurtável em teste/dev via env (não é segredo) */
const LOBBY_WAIT_MS = Number(process.env.RF_LOBBY_WAIT_MS ?? NET.lobbyWaitMs);

export class RaceRoom extends Room<{ state: RaceState }> {
  maxClients: number = NET.maxPlayers;

  private runtime = new Map<string, PlayerRuntime>();
  private nextSlot = 0;
  /** classe da sala (matchmaking); null até o 1º jogador definir */
  private expectedClass: string | null = null;
  private lobbyStartedAt = 0;
  private raceStartedAt = 0;
  private firstFinishAt = 0;
  private finishCount = 0;
  private resultsSent = false;

  onCreate(options: Partial<JoinOptions>) {
    const state = new RaceState();
    state.mode =
      options.mode === 'drift' ? 'drift' : options.mode === 'timetrial' ? 'timetrial' : 'circuit';
    state.isPrivate = options.private === true;
    this.setState(state);
    this.patchRate = NET.patchIntervalMs;
    // time trial é sessão solo (ghost é local do cliente)
    if (state.mode === 'timetrial') this.maxClients = 1;
    this.expectedClass = typeof options.carClass === 'string' ? options.carClass : null;
    if (state.isPrivate) this.setPrivate(true).catch(() => {});

    this.onMessage('state', (client, msg: ClientStateMsg) => this.handleState(client, msg));
    this.onMessage('start', (client) => {
      if (this.state.isPrivate && this.state.phase === 'lobby' && client.sessionId === this.state.hostId) {
        this.beginCountdown();
      }
    });
    this.onMessage('finishTT', () => {
      if (this.state.mode === 'timetrial' && this.state.phase === 'racing') this.finishRace();
    });
    this.setSimulationInterval((dt) => this.tick(dt), NET.patchIntervalMs);
    this.lobbyStartedAt = now();
  }

  async onJoin(client: Client, options: Partial<JoinOptions>) {
    const car = carOrStarter(options.carId);

    // tuning REAL vem do banco (nunca do cliente); convidado não tem tuning
    let tuning: Tuning | null = null;
    let profileId: string | null = null;
    if (options.token) {
      profileId = await verifyToken(options.token);
      if (profileId) tuning = (await fetchTuning(profileId, car.id)) as Tuning | null;
    }

    // matchmaking justo: classe declarada precisa bater com a recalculada
    const realClass = matchClass(car, tuning ?? undefined);
    if (this.expectedClass === null) this.expectedClass = realClass;
    if (realClass !== this.expectedClass) {
      throw new Error(`classe inválida: sala ${this.expectedClass}, seu carro é ${realClass}`);
    }

    const slotIndex = this.nextSlot++;
    const slot = spawnSlot(slotIndex);

    const p = new PlayerState();
    p.nick = sanitizeNick(options.nick);
    p.carId = car.id;
    // cosmético não afeta física — só valida o formato
    if (typeof options.bodyColor === 'string' && HEX_COLOR.test(options.bodyColor))
      p.bodyColor = options.bodyColor;
    if (typeof options.accentColor === 'string' && HEX_COLOR.test(options.accentColor))
      p.accentColor = options.accentColor;
    p.x = slot.x;
    p.y = slot.y; // altura do asfalto + folga da suspensão (relevo)
    p.z = slot.z;
    p.qy = Math.sin(slot.yaw / 2);
    p.qw = Math.cos(slot.yaw / 2);
    this.state.players.set(client.sessionId, p);
    if (!this.state.hostId) this.state.hostId = client.sessionId;

    this.runtime.set(client.sessionId, {
      profileId,
      maxSpeedKmh: effectiveSpec(car, tuning ?? undefined).maxSpeedKmh,
      lastMsgAt: 0,
      lastValid: { x: p.x, y: p.y, z: p.z, qx: 0, qy: p.qy, qz: 0, qw: p.qw },
      violations: 0,
      lapStartMs: 0,
      totalTimeMs: 0,
      slot: slotIndex,
      driftComboTime: 0,
    });
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.runtime.delete(client.sessionId);
    // anfitrião saiu no lobby: passa o bastão
    if (this.state.hostId === client.sessionId) {
      this.state.hostId = this.clients[0]?.sessionId ?? '';
    }
  }

  private beginCountdown() {
    this.state.phase = 'countdown';
    this.state.countdownMs = NET.countdownMs;
    this.lock().catch(() => {});
  }

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

    // anti-teleporte: deslocamento máximo plausível p/ carro+tuning no intervalo
    const maxKmh = rt.maxSpeedKmh;
    const maxDist = (maxKmh / 3.6) * NET.speedValidationMargin * dt + 0.5;
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
    p.speed = Math.min(Math.abs(msg.speed), (maxKmh / 3.6) * NET.speedValidationMargin);

    if (this.state.mode === 'drift') this.updateDrift(p, rt, dx, dz, dist, dt);
    else this.updateCheckpoints(p, rt);
  }

  /** Checkpoints/voltas decididos NO SERVIDOR a partir de posições validadas. */
  private updateCheckpoints(p: PlayerState, rt: PlayerRuntime) {
    const cp = checkpointAt(p.x, p.z); // -1 = longe da pista (gramado não conta)
    const next = (p.checkpoint + 1) % TRACK.checkpoints;
    if (cp !== next) return; // fora de ordem (ré, atalho) não conta

    p.checkpoint = cp;
    if (cp === 0) {
      const t = now();
      const lapMs = t - rt.lapStartMs;
      rt.lapStartMs = t;
      p.lastLapMs = lapMs;
      if (!p.bestLapMs || lapMs < p.bestLapMs) p.bestLapMs = lapMs;

      if (this.state.mode === 'timetrial') {
        p.lap = Math.min(p.lap + 1, 250); // voltas livres até o tempo acabar
      } else if (p.lap >= this.state.totalLaps) {
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

  private tick(_dt: number) {
    const t = now();
    switch (this.state.phase) {
      case 'lobby': {
        // sala privada só larga quando o anfitrião mandar 'start'
        const wait = this.state.mode === 'timetrial' ? 1500 : LOBBY_WAIT_MS;
        if (
          !this.state.isPrivate &&
          this.clients.length >= NET.minPlayers &&
          t - this.lobbyStartedAt >= wait
        ) {
          this.beginCountdown();
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
            : this.state.mode === 'timetrial'
              ? this.state.raceTimeMs >= NET.timetrialDurationMs
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
          : this.state.mode === 'timetrial'
            ? p.bestLapMs || 999_999_999 // sem volta completa = sem tempo
            : rt?.totalTimeMs || this.state.raceTimeMs + 60_000; // DNF: tempo punitivo
      const coins =
        this.state.mode === 'drift'
          ? Math.floor(p.driftScore / 50)
          : this.state.mode === 'timetrial'
            ? p.bestLapMs
              ? 60 + Math.max(0, p.lap - 1) * 10
              : 5
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
