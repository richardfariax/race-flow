import { Client, type Room } from '@colyseus/sdk';
import { NET, type GameMode, type ResultsMsg, type CorrectionMsg } from '@shared/protocol';
import { useGameStore, type StandingEntry } from '../state/gameStore';
import { localCar } from './localCar';
import { pushSnap, pruneBuffers, remoteBuffers } from './remoteBuffer';

/**
 * Sessão multiplayer: entra na sala, envia estado local a 20Hz,
 * alimenta o store (HUD) e os buffers de interpolação dos remotos.
 * O carro local é predição; o servidor valida e pode mandar 'correction'.
 */

const SERVER_URL = (import.meta.env.VITE_GAME_SERVER_URL as string | undefined) ?? 'ws://localhost:2567';

export interface JoinRequest {
  nick: string;
  carId: string;
  token?: string;
  /** classe declarada (o servidor recalcula do banco e expulsa se divergir) */
  carClass: string;
  /** modo (ignorado ao entrar por código — a sala já tem modo) */
  mode?: GameMode;
  /** cria sala privada (fora do matchmaking) */
  createPrivate?: boolean;
  /** entra numa sala existente pelo código (roomId) */
  roomCode?: string;
  /** cosméticos (hex #rrggbb; o servidor revalida) */
  bodyColor?: string;
  accentColor?: string;
}

export class NetSession {
  private room: Room | null = null;
  private sendTimer: number | null = null;
  private disposed = false;

  send(type: string, msg?: unknown): void {
    this.room?.send(type, msg);
  }

  async join(req: JoinRequest): Promise<void> {
    const store = useGameStore.getState();
    store.resetGame();
    if (req.mode) store.setMode(req.mode);
    store.setConnection('connecting');
    remoteBuffers.clear();

    try {
      const client = new Client(SERVER_URL);
      const opts = {
        nick: req.nick,
        carId: req.carId,
        token: req.token,
        carClass: req.carClass,
        bodyColor: req.bodyColor,
        accentColor: req.accentColor,
      };
      const room = req.roomCode
        ? await client.joinById(req.roomCode, opts)
        : req.createPrivate
          ? await client.create('race', { ...opts, mode: req.mode, private: true })
          : await client.joinOrCreate('race', { ...opts, mode: req.mode });
      if (this.disposed) {
        room.leave();
        return;
      }
      this.room = room;
      useGameStore.getState().setRoomId(room.roomId);

      useGameStore.getState().setMySessionId(room.sessionId);
      useGameStore.getState().setConnection('connected');

      room.onStateChange((state) => this.readState(state));
      room.onMessage<CorrectionMsg>('correction', (msg) => {
        localCar.correction = msg;
      });
      room.onMessage<ResultsMsg>('results', (msg) => {
        useGameStore.getState().setResults(msg);
      });
      room.onLeave(() => {
        if (!this.disposed) useGameStore.getState().setConnection('error', 'Conexão perdida.');
      });

      this.sendTimer = window.setInterval(() => this.sendState(), 1000 / NET.stateSendHz);
    } catch (e) {
      useGameStore
        .getState()
        .setConnection('error', e instanceof Error ? e.message : 'Falha ao conectar.');
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readState(state: any): void {
    const store = useGameStore.getState();
    if (store.mode !== state.mode) store.setMode(state.mode); // joinById não sabe o modo
    store.setRace({
      phase: state.phase,
      countdownMs: state.countdownMs,
      raceTimeMs: state.raceTimeMs,
      totalLaps: state.totalLaps,
    });
    if (store.hostId !== state.hostId || store.isPrivate !== state.isPrivate) {
      store.setRoomMeta(state.hostId, state.isPrivate);
    }

    const standings: StandingEntry[] = [];
    const alive = new Set<string>();
    const t = performance.now();
    const myId = this.room?.sessionId;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    state.players.forEach((p: any, sessionId: string) => {
      alive.add(sessionId);
      standings.push({
        sessionId,
        nick: p.nick,
        carId: p.carId,
        bodyColor: p.bodyColor,
        accentColor: p.accentColor,
        lap: p.lap,
        checkpoint: p.checkpoint,
        driftScore: p.driftScore,
        driftCombo: p.driftCombo,
        bestLapMs: p.bestLapMs,
        lastLapMs: p.lastLapMs,
        finished: p.finished,
        finishPos: p.finishPos,
      });
      if (sessionId === myId) {
        if (!store.spawn) {
          const yaw = 2 * Math.atan2(p.qy, p.qw);
          store.setSpawn({ x: p.x, y: p.y, z: p.z, yaw });
        }
      } else {
        pushSnap(sessionId, { t, x: p.x, y: p.y, z: p.z, qx: p.qx, qy: p.qy, qz: p.qz, qw: p.qw });
      }
    });

    pruneBuffers(alive);
    store.setStandings(standings);
  }

  private sendState(): void {
    if (!this.room || !localCar.hasData) return;
    const { position: pos, quaternion: q, speed } = localCar;
    this.room.send('state', {
      x: pos.x,
      y: pos.y,
      z: pos.z,
      qx: q.x,
      qy: q.y,
      qz: q.z,
      qw: q.w,
      speed,
    });
  }

  leave(): void {
    this.disposed = true;
    if (this.sendTimer !== null) window.clearInterval(this.sendTimer);
    this.room?.leave();
    this.room = null;
    remoteBuffers.clear();
  }
}
