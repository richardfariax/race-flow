/**
 * Camada de input abstraída: a lógica do jogo lê InputState, nunca teclas.
 * Fase 0: teclado. Touch e gamepad entram como novas implementações de InputSource.
 */

export interface InputState {
  throttle: number;
  /** -1 (direita) .. 1 (esquerda) — convenção de yaw positivo */
  steer: number;
  handbrake: boolean;
  /** edge-triggered: true uma única leitura por acionamento */
  reset: boolean;
}

export interface InputSource {
  read(): InputState;
  dispose(): void;
}

type Bindings = {
  forward: string[];
  back: string[];
  left: string[];
  right: string[];
  handbrake: string[];
  reset: string[];
};

const DEFAULT_BINDINGS: Bindings = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'],
  reset: ['KeyR'],
};

/** Teclas cujo default do navegador (scroll) deve ser suprimido durante o jogo. */
const PREVENT_DEFAULT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

export class KeyboardInput implements InputSource {
  private pressed = new Set<string>();
  private resetQueued = false;

  constructor(private bindings: Bindings = DEFAULT_BINDINGS) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
    if (!e.repeat && this.bindings.reset.includes(e.code)) this.resetQueued = true;
    this.pressed.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.pressed.delete(e.code);
  };

  private onBlur = () => {
    this.pressed.clear();
  };

  private isDown(codes: string[]): boolean {
    return codes.some((c) => this.pressed.has(c));
  }

  read(): InputState {
    const reset = this.resetQueued;
    this.resetQueued = false;
    return {
      throttle:
        (this.isDown(this.bindings.forward) ? 1 : 0) - (this.isDown(this.bindings.back) ? 1 : 0),
      steer: (this.isDown(this.bindings.left) ? 1 : 0) - (this.isDown(this.bindings.right) ? 1 : 0),
      handbrake: this.isDown(this.bindings.handbrake),
      reset,
    };
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }
}
