import { create } from 'zustand';

interface HudState {
  speedKmh: number;
  rpm: number;
  redlineRpm: number;
  /** -1 = ré, 0 = neutro, 1..N = marcha */
  gear: number;
  shifting: boolean;
  /** pressão atual do turbo (bar); 0 se aspirado */
  boostBar: number;
  /** teto do manômetro; 0 = sem turbo */
  boostBarMax: number;
  setRedlineRpm: (v: number) => void;
  setBoostMax: (v: number) => void;
  setCluster: (data: {
    speedKmh: number;
    rpm: number;
    gear: number;
    shifting: boolean;
    boostBar?: number;
  }) => void;
}

export const useHudStore = create<HudState>((set) => ({
  speedKmh: 0,
  rpm: 0,
  redlineRpm: 7000,
  gear: 1,
  shifting: false,
  boostBar: 0,
  boostBarMax: 0,
  setRedlineRpm: (v) => set({ redlineRpm: v }),
  setBoostMax: (v) => set(v <= 0 ? { boostBarMax: 0, boostBar: 0 } : { boostBarMax: v }),
  setCluster: ({ speedKmh, rpm, gear, shifting, boostBar }) =>
    set((s) => {
      const spd = Math.round(speedKmh);
      const g = Math.round(gear);
      const r = Math.round(rpm);
      const boost =
        boostBar === undefined ? s.boostBar : Math.round(boostBar * 100) / 100;
      if (
        s.speedKmh === spd &&
        s.rpm === r &&
        s.gear === g &&
        s.shifting === shifting &&
        s.boostBar === boost
      ) {
        return s;
      }
      return {
        speedKmh: spd,
        rpm: r,
        gear: g,
        shifting,
        boostBar: boost,
      };
    }),
}));
