import { create } from 'zustand';
import type { GameMode, RacePhase, ResultsMsg } from '@shared/protocol';
import { TRACK } from '@shared/track';

export type Connection = 'idle' | 'connecting' | 'connected' | 'error';

export interface StandingEntry {
  sessionId: string;
  nick: string;
  carId: string;
  bodyColor: string;
  accentColor: string;
  lap: number;
  checkpoint: number;
  driftScore: number;
  driftCombo: number;
  bestLapMs: number;
  lastLapMs: number;
  finished: boolean;
  finishPos: number;
}

export interface SpawnPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

interface GameState {
  connection: Connection;
  connectionError: string;
  mode: GameMode | 'practice';
  phase: RacePhase;
  countdownMs: number;
  raceTimeMs: number;
  totalLaps: number;
  mySessionId: string;
  roomId: string;
  hostId: string;
  isPrivate: boolean;
  spawn: SpawnPose | null;
  standings: StandingEntry[];
  results: ResultsMsg | null;

  setConnection: (c: Connection, error?: string) => void;
  setMode: (m: GameMode | 'practice') => void;
  setMySessionId: (id: string) => void;
  setRoomId: (id: string) => void;
  setRoomMeta: (hostId: string, isPrivate: boolean) => void;
  setSpawn: (s: SpawnPose) => void;
  setRace: (r: { phase: RacePhase; countdownMs: number; raceTimeMs: number; totalLaps: number }) => void;
  setStandings: (s: StandingEntry[]) => void;
  setResults: (r: ResultsMsg) => void;
  resetGame: () => void;
}

const initial = {
  connection: 'idle' as Connection,
  connectionError: '',
  mode: 'practice' as GameMode | 'practice',
  phase: 'lobby' as RacePhase,
  countdownMs: 0,
  raceTimeMs: 0,
  totalLaps: TRACK.totalLaps,
  mySessionId: '',
  roomId: '',
  hostId: '',
  isPrivate: false,
  spawn: null,
  standings: [],
  results: null,
};

export const useGameStore = create<GameState>((set) => ({
  ...initial,
  setConnection: (connection, connectionError = '') => set({ connection, connectionError }),
  setMode: (mode) => set({ mode }),
  setMySessionId: (mySessionId) => set({ mySessionId }),
  setRoomId: (roomId) => set({ roomId }),
  setRoomMeta: (hostId, isPrivate) => set({ hostId, isPrivate }),
  setSpawn: (spawn) => set({ spawn }),
  setRace: (r) => set(r),
  setStandings: (standings) => set({ standings }),
  setResults: (results) => set({ results }),
  resetGame: () => set(initial),
}));
