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
  /**
   * margem sobre a vel. máxima do carro na validação anti-teleporte. Folgada
   * de propósito: o cálculo só considera a vel. máx horizontal do carro, mas
   * o deslocamento real inclui relevo/rampas da pista (queda em salto soma
   * distância vertical que a fórmula não prevê).
   */
  speedValidationMargin: 2.2,
  /**
   * teto de dt (s) usado no cálculo de distância máxima plausível entre dois
   * 'state' consecutivos. Precisa ser folgado: hiccups de rede e throttling
   * de timer em aba em segundo plano (comuns em navegador) geram gaps reais
   * de até ~1s sem o jogador ter feito nada de errado. Um teto baixo aqui
   * subestima a distância permitida para o gap real e gera falso positivo
   * (o servidor teleporta o carro de volta — sensação de "bater em algo").
   */
  maxStateDeltaS: 2,
  /**
   * nº de violações CONSECUTIVAS do anti-teleporte antes de corrigir de fato
   * (teleportar o carro de volta no cliente). Uma violação isolada é ignorada
   * silenciosamente — sem isso, um único sample ruidoso (jitter de rede,
   * hiccup de física) já disparava a correção, travando o carro e soando
   * como se tivesse batido em algo. Cheat sustentado ainda é pego: 3 samples
   * a 20Hz é ~150ms.
   */
  teleportStrikeLimit: 3,
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
