import { progressAt, TRACK } from '@shared/track';

/**
 * Ghost do Time Trial: grava a SUA melhor volta localmente (localStorage) e
 * o GhostCar a reproduz na volta seguinte. O tempo oficial continua sendo o
 * do servidor — o ghost é só visual. (Ghost do #1 global: fase futura.)
 */

export interface GhostSample {
  t: number; // ms desde o início da volta
  x: number;
  z: number;
  qy: number;
  qw: number;
}

export interface GhostData {
  lapMs: number;
  samples: GhostSample[];
}

const storageKey = () => `rf_ghost_${TRACK.id}`;

export function loadGhost(): GhostData | null {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return null;
    const data = JSON.parse(raw) as GhostData;
    return Array.isArray(data.samples) && data.samples.length > 2 ? data : null;
  } catch {
    return null;
  }
}

const SAMPLE_INTERVAL_MS = 80;
const MIN_LAP_MS = 8000; // volta mais curta que isso é glitch, não recorde

class GhostRecorder {
  /** perf.now() do início da volta atual (0 = ainda não cruzou a linha) */
  lapStartAt = 0;
  /** muda a cada ghost salvo — GhostCar recarrega */
  version = 0;

  private lastS: number | null = null;
  private samples: GhostSample[] = [];
  private recording = false;
  private enabled = false;

  begin(): void {
    this.enabled = true;
    this.lapStartAt = 0;
    this.lastS = null;
    this.samples = [];
    this.recording = false;
  }

  end(): void {
    this.enabled = false;
  }

  update(x: number, z: number, qy: number, qw: number, nowMs: number): void {
    if (!this.enabled) return;
    const { s } = progressAt(x, z);

    // cruzou a linha (progresso deu a volta: fim → começo)
    if (this.lastS !== null && this.lastS > TRACK.length * 0.85 && s < TRACK.length * 0.15) {
      const lapMs = nowMs - this.lapStartAt;
      if (this.recording && lapMs > MIN_LAP_MS) {
        const best = loadGhost();
        if (!best || lapMs < best.lapMs) {
          try {
            localStorage.setItem(
              storageKey(),
              JSON.stringify({ lapMs, samples: this.samples } satisfies GhostData),
            );
            this.version++;
          } catch {
            /* storage cheio — ghost é opcional */
          }
        }
      }
      this.lapStartAt = nowMs;
      this.samples = [];
      this.recording = true;
    }
    this.lastS = s;

    if (this.recording) {
      const last = this.samples[this.samples.length - 1];
      if (!last || nowMs - this.lapStartAt - last.t >= SAMPLE_INTERVAL_MS) {
        this.samples.push({ t: nowMs - this.lapStartAt, x, z, qy, qw });
      }
    }
  }
}

export const ghostRecorder = new GhostRecorder();
