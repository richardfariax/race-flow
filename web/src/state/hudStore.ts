import { create } from 'zustand';

interface HudState {
  speedKmh: number;
  rpm: number;
  redlineRpm: number;
  /** -1 = ré, 0 = neutro, 1..N = marcha */
  gear: number;
  shifting: boolean;
  setRedlineRpm: (v: number) => void;
  setCluster: (data: {
    speedKmh: number;
    rpm: number;
    gear: number;
    shifting: boolean;
  }) => void;
}

export const useHudStore = create<HudState>((set) => ({
  speedKmh: 0,
  rpm: 0,
  redlineRpm: 7000,
  gear: 1,
  shifting: false,
  setRedlineRpm: (v) => set({ redlineRpm: v }),
  setCluster: ({ speedKmh, rpm, gear, shifting }) =>
    set((s) => {
      const spd = Math.round(speedKmh);
      const g = Math.round(gear);
      const r = Math.round(rpm);
      if (
        s.speedKmh === spd &&
        s.rpm === r &&
        s.gear === g &&
        s.shifting === shifting
      ) {
        return s;
      }
      return { speedKmh: spd, rpm: r, gear: g, shifting };
    }),
}));
