/**
 * Áudio do carro via WebAudio.
 *
 * Motor: síntese procedural guiada pelo RPM real (pulsos de combustão +
 * harmônicos + escape). Sem loop de sample — o pitch acompanha o giro
 * continuamente, como um motor de verdade.
 *
 * Freio: chiado contínuo de pastilha (ruído filtrado). Skid/batida: /sounds.
 * Autoplay: chame `unlock()` num gesto.
 */

export type EngineCarId =
  | 'beetle'
  | 'golf_gti'
  | 'jetta'
  | 'm3_e46'
  | 'skyline_r34'
  | 'supra_a90'
  | 'm4_g82';

interface EngineVoice {
  /** cilindros (define frequência de ignição: rpm * cyl / 120) */
  cylinders: number;
  /** volume geral do motor */
  gain: number;
  /** gravidade do timbre (0 = agudo esportivo, 1 = grave/ronco) */
  darkness: number;
  /** aspereza / rasp do escape (0..1) */
  rasp: number;
  /** assobio de turbo (0 = aspirado) */
  turbo: number;
  /** ênfase no “putt” irregular (flat-4 / idle choppy) */
  chop: number;
}

const ENGINE_VOICES: Record<EngineCarId, EngineVoice> = {
  beetle: { cylinders: 4, gain: 0.55, darkness: 0.72, rasp: 0.35, turbo: 0, chop: 0.55 },
  golf_gti: { cylinders: 4, gain: 0.5, darkness: 0.35, rasp: 0.45, turbo: 0.55, chop: 0.12 },
  jetta: { cylinders: 4, gain: 0.45, darkness: 0.4, rasp: 0.28, turbo: 0.35, chop: 0.08 },
  m3_e46: { cylinders: 6, gain: 0.52, darkness: 0.22, rasp: 0.4, turbo: 0, chop: 0.05 },
  skyline_r34: { cylinders: 6, gain: 0.58, darkness: 0.55, rasp: 0.55, turbo: 0.7, chop: 0.1 },
  supra_a90: { cylinders: 6, gain: 0.54, darkness: 0.38, rasp: 0.5, turbo: 0.75, chop: 0.06 },
  m4_g82: { cylinders: 6, gain: 0.6, darkness: 0.3, rasp: 0.58, turbo: 0.85, chop: 0.04 },
};

const SHARED_FILES = {
  skid: '/sounds/skid.wav',
  crash: '/sounds/crash.wav',
} as const;

type SharedName = keyof typeof SHARED_FILES;

function isEngineCarId(id: string): id is EngineCarId {
  return id in ENGINE_VOICES;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Buffer de ruído branco loopável (escape / combustão). */
function makeNoiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

class CarAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sharedBuffers = new Map<SharedName, AudioBuffer>();
  private noiseBuf: AudioBuffer | null = null;
  private loadingShared = false;

  private engineOut: GainNode | null = null;
  private rumbleOsc: OscillatorNode | null = null;
  private fireOsc: OscillatorNode | null = null;
  private harmOsc: OscillatorNode | null = null;
  private chopOsc: OscillatorNode | null = null;
  private rumbleGain: GainNode | null = null;
  private fireGain: GainNode | null = null;
  private harmGain: GainNode | null = null;
  private chopGain: GainNode | null = null;
  private exhaustSrc: AudioBufferSourceNode | null = null;
  private exhaustFilter: BiquadFilterNode | null = null;
  private exhaustGain: GainNode | null = null;
  private bodyFilter: BiquadFilterNode | null = null;
  private turboOsc: OscillatorNode | null = null;
  private turboFilter: BiquadFilterNode | null = null;
  private turboGain: GainNode | null = null;

  private skidSrc: AudioBufferSourceNode | null = null;
  private skidGain: GainNode | null = null;

  private brakeSrc: AudioBufferSourceNode | null = null;
  private brakeFilter: BiquadFilterNode | null = null;
  private brakeGain: GainNode | null = null;
  private brakeStarted = false;

  private lastCrashAt = 0;
  private muted = false;
  private engineStarted = false;
  private skidStarted = false;
  private carId: EngineCarId = 'golf_gti';
  private smoothRpm = 900;

  unlock(): void {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.85;
      this.master.connect(this.ctx.destination);
      this.noiseBuf = makeNoiseBuffer(this.ctx);
      void this.loadShared();
      this.startEngineGraph();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setCar(carId: string): void {
    this.carId = isEngineCarId(carId) ? carId : 'golf_gti';
  }

  private voice(): EngineVoice {
    return ENGINE_VOICES[this.carId];
  }

  private async loadShared(): Promise<void> {
    if (this.loadingShared || !this.ctx) return;
    this.loadingShared = true;
    await Promise.all(
      (Object.keys(SHARED_FILES) as SharedName[]).map(async (name) => {
        try {
          const res = await fetch(SHARED_FILES[name]);
          const buf = await this.ctx!.decodeAudioData(await res.arrayBuffer());
          this.sharedBuffers.set(name, buf);
        } catch {
          /* ausente → mudo */
        }
      }),
    );
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.05);
    }
  }
  isMuted(): boolean {
    return this.muted;
  }

  private startEngineGraph(): void {
    if (this.engineStarted || !this.ctx || !this.master || !this.noiseBuf) return;
    this.engineStarted = true;
    const ctx = this.ctx;

    this.engineOut = ctx.createGain();
    this.engineOut.gain.value = 0.0001;

    this.bodyFilter = ctx.createBiquadFilter();
    this.bodyFilter.type = 'lowpass';
    this.bodyFilter.frequency.value = 1200;
    this.bodyFilter.Q.value = 0.7;
    this.engineOut.connect(this.bodyFilter).connect(this.master);

    // Ronco grave (ciclo do virabrequim)
    this.rumbleOsc = ctx.createOscillator();
    this.rumbleOsc.type = 'sawtooth';
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0.0001;
    const rumbleLp = ctx.createBiquadFilter();
    rumbleLp.type = 'lowpass';
    rumbleLp.frequency.value = 280;
    this.rumbleOsc.connect(rumbleLp).connect(this.rumbleGain).connect(this.engineOut);
    this.rumbleOsc.start();

    // Pulso de ignição (freq = rpm * cyl / 120)
    this.fireOsc = ctx.createOscillator();
    this.fireOsc.type = 'square';
    this.fireGain = ctx.createGain();
    this.fireGain.gain.value = 0.0001;
    const fireBp = ctx.createBiquadFilter();
    fireBp.type = 'bandpass';
    fireBp.frequency.value = 400;
    fireBp.Q.value = 0.9;
    this.fireOsc.connect(fireBp).connect(this.fireGain).connect(this.engineOut);
    this.fireOsc.start();

    // Harmônico 2× (clareza / “cantar” em alta)
    this.harmOsc = ctx.createOscillator();
    this.harmOsc.type = 'triangle';
    this.harmGain = ctx.createGain();
    this.harmGain.gain.value = 0.0001;
    this.harmOsc.connect(this.harmGain).connect(this.engineOut);
    this.harmOsc.start();

    // Meia ordem / chop (flat-4, idle irregular)
    this.chopOsc = ctx.createOscillator();
    this.chopOsc.type = 'sawtooth';
    this.chopGain = ctx.createGain();
    this.chopGain.gain.value = 0.0001;
    const chopLp = ctx.createBiquadFilter();
    chopLp.type = 'lowpass';
    chopLp.frequency.value = 180;
    this.chopOsc.connect(chopLp).connect(this.chopGain).connect(this.engineOut);
    this.chopOsc.start();

    // Escape: ruído filtrado (acompanha RPM no centro da banda)
    this.exhaustSrc = ctx.createBufferSource();
    this.exhaustSrc.buffer = this.noiseBuf;
    this.exhaustSrc.loop = true;
    this.exhaustFilter = ctx.createBiquadFilter();
    this.exhaustFilter.type = 'bandpass';
    this.exhaustFilter.frequency.value = 500;
    this.exhaustFilter.Q.value = 1.2;
    this.exhaustGain = ctx.createGain();
    this.exhaustGain.gain.value = 0.0001;
    this.exhaustSrc.connect(this.exhaustFilter).connect(this.exhaustGain).connect(this.engineOut);
    this.exhaustSrc.start();

    // Turbo (assobio)
    this.turboOsc = ctx.createOscillator();
    this.turboOsc.type = 'sine';
    this.turboFilter = ctx.createBiquadFilter();
    this.turboFilter.type = 'bandpass';
    this.turboFilter.frequency.value = 2800;
    this.turboFilter.Q.value = 8;
    this.turboGain = ctx.createGain();
    this.turboGain.gain.value = 0.0001;
    this.turboOsc.connect(this.turboFilter).connect(this.turboGain).connect(this.engineOut);
    this.turboOsc.start();
  }

  private startSkid(): void {
    if (this.skidStarted || !this.ctx || !this.master) return;
    const skid = this.sharedBuffers.get('skid');
    if (!skid) return;
    this.skidStarted = true;
    this.skidGain = this.ctx.createGain();
    this.skidGain.gain.value = 0.0001;
    this.skidSrc = this.ctx.createBufferSource();
    this.skidSrc.buffer = skid;
    this.skidSrc.loop = true;
    this.skidSrc.connect(this.skidGain).connect(this.master);
    this.skidSrc.start();
  }

  /** Chiado contínuo de pastilha/disco (ruído filtrado — sem bip de sample). */
  private startBrake(): void {
    if (this.brakeStarted || !this.ctx || !this.master || !this.noiseBuf) return;
    this.brakeStarted = true;
    this.brakeSrc = this.ctx.createBufferSource();
    this.brakeSrc.buffer = this.noiseBuf;
    this.brakeSrc.loop = true;
    this.brakeFilter = this.ctx.createBiquadFilter();
    this.brakeFilter.type = 'bandpass';
    this.brakeFilter.frequency.value = 900;
    this.brakeFilter.Q.value = 0.55;
    const brakeLp = this.ctx.createBiquadFilter();
    brakeLp.type = 'lowpass';
    brakeLp.frequency.value = 2400;
    this.brakeGain = this.ctx.createGain();
    this.brakeGain.gain.value = 0.0001;
    this.brakeSrc.connect(this.brakeFilter).connect(brakeLp).connect(this.brakeGain).connect(this.master);
    this.brakeSrc.start();
  }

  /**
   * Atualiza o motor a cada frame com RPM absoluto.
   * @param rpm      rotação atual (ex.: 800..8000)
   * @param throttle 0..1
   * @param slip     0..1
   * @param shifting true durante troca de marcha (afunda o motor um instante)
   * @param brake    0..1 intensidade de freio × velocidade (pastilha)
   */
  update(rpm: number, throttle: number, slip: number, shifting = false, brake = 0): void {
    if (!this.ctx) return;
    if (!this.engineStarted) this.startEngineGraph();
    if (!this.skidStarted) this.startSkid();
    if (!this.brakeStarted) this.startBrake();

    const now = this.ctx.currentTime;
    const v = this.voice();
    const thr = clamp(throttle, 0, 1);
    const rpmClamped = clamp(rpm, 400, 12000);

    // Suaviza só o suficiente para não “zipar”; ainda acompanha o giro.
    this.smoothRpm += (rpmClamped - this.smoothRpm) * 0.35;
    const r = this.smoothRpm;

    const crankHz = r / 60; // Hz do virabrequim
    const fireHz = (r * v.cylinders) / 120; // ignições/s (4 tempos)

    this.rumbleOsc?.frequency.setTargetAtTime(crankHz, now, 0.03);
    this.fireOsc?.frequency.setTargetAtTime(fireHz, now, 0.025);
    this.harmOsc?.frequency.setTargetAtTime(fireHz * 2, now, 0.025);
    this.chopOsc?.frequency.setTargetAtTime(fireHz * 0.5, now, 0.04);

    const rpmNorm = clamp((r - 800) / 7000, 0, 1);
    const load = thr * 0.75 + rpmNorm * 0.25;
    const shiftDuck = shifting ? 0.45 : 1;
    // 1 = parado na lenta (sem gás, giro baixo); 0 = fora da lenta
    const idle = clamp(1 - thr * 3.2, 0, 1) * clamp(1 - (r - 900) / 1100, 0, 1);

    // Volumes por camada (na lenta: menos square/chop, mais ronco macio)
    const dark = v.darkness;
    this.rumbleGain?.gain.setTargetAtTime(
      (0.12 + 0.22 * load + idle * 0.1) * (0.45 + dark) * shiftDuck,
      now,
      0.05,
    );
    this.fireGain?.gain.setTargetAtTime(
      (0.06 + 0.2 * thr + 0.08 * rpmNorm) * (1.1 - dark * 0.4) * (1 - idle * 0.78) * shiftDuck,
      now,
      0.05,
    );
    this.harmGain?.gain.setTargetAtTime(
      (0.02 + 0.14 * rpmNorm * thr) * (1 - dark * 0.5) * (1 - idle * 0.9) * shiftDuck,
      now,
      0.05,
    );
    this.chopGain?.gain.setTargetAtTime(
      v.chop * (0.08 + 0.12 * (1 - thr) + 0.06 * thr) * (0.25 + idle * 0.35) * (1 - idle * 0.15) * shiftDuck,
      now,
      0.06,
    );

    // Escape: na lenta fica baixo e fechado (ronronar, sem “sss”)
    if (this.exhaustFilter && this.exhaustGain) {
      const center = 280 + rpmNorm * 900 + thr * 400 + (1 - dark) * 200 - idle * 120;
      this.exhaustFilter.frequency.setTargetAtTime(center, now, 0.05);
      this.exhaustFilter.Q.setTargetAtTime(0.8 + v.rasp * 0.8 * (1 - idle * 0.6), now, 0.05);
      this.exhaustGain.gain.setTargetAtTime(
        (0.1 + 0.35 * thr + 0.12 * rpmNorm) * (0.5 + v.rasp) * (1 - idle * 0.72) * shiftDuck,
        now,
        0.05,
      );
    }

    // Corpo: na lenta mais fechado (grave quente)
    if (this.bodyFilter) {
      const cutoff = 600 + rpmNorm * 2800 + thr * 1200 - dark * 400 - idle * 280;
      this.bodyFilter.frequency.setTargetAtTime(clamp(cutoff, 320, 5500), now, 0.06);
    }

    // Turbo: sobe com carga, some em idle
    if (this.turboOsc && this.turboGain && this.turboFilter) {
      const boost = v.turbo * thr * clamp((rpmNorm - 0.15) / 0.5, 0, 1);
      const whistle = 1800 + rpmNorm * 2200 + thr * 800;
      this.turboOsc.frequency.setTargetAtTime(whistle, now, 0.06);
      this.turboFilter.frequency.setTargetAtTime(whistle, now, 0.06);
      this.turboGain.gain.setTargetAtTime(boost * 0.045 * shiftDuck, now, 0.08);
    }

    if (this.engineOut) {
      const masterEng =
        v.gain * (0.35 + 0.45 * thr + 0.25 * rpmNorm - idle * 0.12) * shiftDuck;
      this.engineOut.gain.setTargetAtTime(masterEng, now, 0.05);
    }

    if (this.skidGain) {
      this.skidGain.gain.setTargetAtTime(slip > 0.15 ? Math.min(0.85, slip) : 0.0001, now, 0.04);
    }

    // Freio: chiado contínuo de pastilha (sobe com pedal×velocidade; some no skid forte)
    if (this.brakeGain && this.brakeFilter) {
      const b = clamp(brake, 0, 1);
      const pad = b * (1 - clamp(slip * 1.4, 0, 0.85));
      this.brakeFilter.frequency.setTargetAtTime(700 + pad * 500, now, 0.06);
      this.brakeGain.gain.setTargetAtTime(pad > 0.04 ? pad * 0.14 : 0.0001, now, 0.05);
    }
  }

  private oneShot(name: SharedName, volume: number): void {
    if (!this.ctx || !this.master) return;
    const buf = this.sharedBuffers.get(name);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = volume;
    src.connect(g).connect(this.master);
    src.start();
  }

  crash(intensity: number): void {
    const now = this.ctx?.currentTime ?? 0;
    if (now - this.lastCrashAt < 0.2) return;
    this.lastCrashAt = now;
    this.oneShot('crash', Math.min(0.9, 0.3 + intensity));
  }

  quiet(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.engineOut?.gain.setTargetAtTime(0.0001, now, 0.08);
    this.skidGain?.gain.setTargetAtTime(0.0001, now, 0.05);
    this.brakeGain?.gain.setTargetAtTime(0.0001, now, 0.05);
  }
}

export const carAudio = new CarAudio();

if (typeof window !== 'undefined') {
  const unlock = () => carAudio.unlock();
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
}
