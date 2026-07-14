import { create } from 'zustand';

/**
 * Estado do painel de telemetria da física (DebugOverlay). Off por padrão e só
 * alternável em dev (via ⌘K) — em produção nada monta nem coleta.
 */
interface DebugState {
  enabled: boolean;
  toggle: () => void;
}

export const useDebugStore = create<DebugState>((set) => ({
  enabled: false,
  toggle: () => set((s) => ({ enabled: !s.enabled })),
}));
