/** Constantes e mensagens de rede — compartilhadas cliente/servidor. */

export type GameMode = 'circuit' | 'drift' | 'timetrial';
export type RacePhase = 'lobby' | 'countdown' | 'racing' | 'finished';

export const NET = {
  stateSendHz: 20,
  patchIntervalMs: 50,
  /** atraso de interpolação dos carros remotos */
  interpDelayMs: 120,
  maxPlayers: 8,
  /** MVP: 1 permite testar sozinho; suba p/ 2 em produção */
  minPlayers: 1,
  lobbyWaitMs: 5000,
  countdownMs: 3000,
  driftDurationMs: 120_000,
  timetrialDurationMs: 300_000,
  /** tempo extra após o 1º terminar (circuit) */
  finishTimeoutMs: 30_000,
  maxRaceMs: 360_000,
  /** margem sobre a vel. máxima do carro na validação anti-teleporte */
  speedValidationMargin: 1.6,
} as const;

/** cliente → servidor: 'state' */
export interface ClientStateMsg {
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  /** m/s (informativo; o servidor valida por deslocamento) */
  speed: number;
}

/** servidor → cliente: 'correction' (estado rejeitado — voltar p/ última posição válida) */
export interface CorrectionMsg {
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
}

export interface ResultEntry {
  sessionId: string;
  nick: string;
  carId: string;
  position: number;
  /** circuit: tempo total ms · drift: pontos */
  metric: number;
  bestLapMs: number;
  coins: number;
}

/** servidor → cliente: 'results' */
export interface ResultsMsg {
  mode: GameMode;
  track: string;
  entries: ResultEntry[];
}

export interface JoinOptions {
  mode: GameMode;
  nick: string;
  carId: string;
  /** access token do Supabase (opcional — convidado não tem) */
  token?: string;
  /**
   * classe de matchmaking DECLARADA (C/B/A/S, calculada de carro+tuning).
   * Usada no filterBy; o servidor recalcula do banco e expulsa se mentir.
   */
  carClass?: string;
  /** sala privada (não entra no matchmaking; amigos entram por código) */
  private?: boolean;
  /** cosméticos (hex #rrggbb; validados no servidor; não afetam performance) */
  bodyColor?: string;
  accentColor?: string;
}

// cliente → servidor: 'start' (só o anfitrião de sala privada, na fase lobby)
// cliente → servidor: 'finishTT' (time trial: encerrar cedo e salvar melhor volta)
