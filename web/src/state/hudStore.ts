import { create } from 'zustand';

interface HudState {
  /** km/h inteiro — arredondado na escrita para evitar re-render a cada frame */
  speedKmh: number;
  setSpeedKmh: (v: number) => void;
}

export const useHudStore = create<HudState>((set) => ({
  speedKmh: 0,
  setSpeedKmh: (v) =>
    set((s) => {
      const rounded = Math.round(v);
      return s.speedKmh === rounded ? s : { speedKmh: rounded };
    }),
}));
