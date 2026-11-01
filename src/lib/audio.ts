import { EXHAUST, type Engine, type Tuning } from "./engines";

export type Volumes = { master: number; engine: number; turbo: number; exhaust: number; ambient: number };

function rand(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function shaperCurve(k: number) {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * k) / Math.tanh(k); }
  return c;
}

/**
 * Sound model: a real engine is a train of combustion pressure pulses (one per
 * cylinder firing) ringing through fixed-size pipes. We synthesise one full
 * engine cycle (two crank turns) of pulses as a periodic wave so the per-cylinder
 * irregularity produces the lumpy "blub-blub", then shape it with fixed body
 * resonances, a deep sub layer and slow random jitter for rumble.
 */
export class EngineAudio {
  ctx: AudioContext | null = null;
  private noise!: AudioBuffer;
  private osc!: OscillatorNode; private pre!: GainNode; private shaper!: WaveShaperNode;
  private lp!: BiquadFilterNode; private body!: BiquadFilterNode; private engGain!: GainNode;
  private sub!: OscillatorNode; private subLp!: BiquadFilterNode; private subGain!: GainNode;
  private jitter!: GainNode;
  private exBp!: BiquadFilterNode; private exGain!: GainNode;
  private clatGain!: GainNode;
  private whistle!: OscillatorNode; private whistleGain!: GainNode; private whoosh!: BiquadFilterNode; private whooshGain!: GainNode;
  private sc!: OscillatorNode; private scBp!: BiquadFilterNode; private scGain!: GainNode;
  private nosGain!: GainNode;
  private pulse!: OscillatorNode;
  private buses!: Record<"engine" | "turbo" | "exhaust" | "ambient", GainNode>;
  private master!: GainNode;
  private engine: Engine | null = null; private tuning: Tuning | null = null;
  quality: "high" | "low" = "high";
  private vols: Volumes = { master: 0.8, engine: 1, turbo: 0.8, exhaust: 0.9, ambient: 0.3 };

  init() {
    if (this.ctx) { void this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC({ latencyHint: "interactive" });
    this.ctx = ctx;
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // Master: warm low shelf, tame the thin "mosquito" top end, then glue compressor.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.18;
    const warm = ctx.createBiquadFilter(); warm.type = "lowshelf"; warm.frequency.value = 160; warm.gain.value = 7;
    const tame = ctx.createBiquadFilter(); tame.type = "highshelf"; tame.frequency.value = 2600; tame.gain.value = -9;
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 22; // remove DC/inaudible
    this.master = ctx.createGain();
    this.master.connect(hp); hp.connect(warm); warm.connect(tame); tame.connect(comp); comp.connect(ctx.destination);
    const bus = () => { const g = ctx.createGain(); g.connect(this.master); return g; };
    this.buses = { engine: bus(), turbo: bus(), exhaust: bus(), ambient: bus() };

    // Slow random jitter — cycle-to-cycle combustion variation = rumble
    const jn = this.loopNoise();
    const jlp = ctx.createBiquadFilter(); jlp.type = "lowpass"; jlp.frequency.value = 9;
    this.jitter = ctx.createGain(); this.jitter.gain.value = 0;
    jn.connect(jlp); jlp.connect(this.jitter);

    // Core: combustion pulse train -> drive -> lowpass -> body resonance
    this.osc = ctx.createOscillator();
    this.pre = ctx.createGain(); this.shaper = ctx.createWaveShaper(); this.shaper.curve = shaperCurve(2.6); this.shaper.oversample = "2x";
    this.lp = ctx.createBiquadFilter(); this.lp.type = "lowpass"; this.lp.Q.value = 0.9;
    this.body = ctx.createBiquadFilter(); this.body.type = "peaking"; this.body.frequency.value = 110; this.body.Q.value = 0.8; this.body.gain.value = 8;
    const pipe = ctx.createBiquadFilter(); pipe.type = "peaking"; pipe.frequency.value = 320; pipe.Q.value = 1.2; pipe.gain.value = 4;
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    this.osc.connect(this.pre); this.pre.connect(this.shaper); this.shaper.connect(this.lp); this.lp.connect(this.body); this.body.connect(pipe);
    pipe.connect(this.engGain); this.engGain.connect(this.buses.engine);
    this.jitter.connect(this.engGain.gain);

    // Sub rumble: half-firing-order + firing fundamental, saturated so phone speakers still hear its harmonics
    this.sub = ctx.createOscillator();
    const subDrive = ctx.createGain(); subDrive.gain.value = 2.2;
    const subSh = ctx.createWaveShaper(); subSh.curve = shaperCurve(1.8);
    this.subLp = ctx.createBiquadFilter(); this.subLp.type = "lowpass"; this.subLp.Q.value = 0.7;
    this.subGain = ctx.createGain(); this.subGain.gain.value = 0;
    this.sub.connect(subDrive); subDrive.connect(subSh); subSh.connect(this.subLp); this.subLp.connect(this.subGain); this.subGain.connect(this.buses.engine);
    this.jitter.connect(this.subGain.gain);

    // Exhaust roar: noise gated by the firing pulse
    const exNoise = this.loopNoise();
    this.exBp = ctx.createBiquadFilter(); this.exBp.type = "bandpass"; this.exBp.Q.value = 0.7;
    const exAm = ctx.createGain(); exAm.gain.value = 0.45;
    this.pulse = ctx.createOscillator(); this.pulse.type = "sawtooth";
    const pg = ctx.createGain(); pg.gain.value = 0.5; this.pulse.connect(pg); pg.connect(exAm.gain);
    this.exGain = ctx.createGain(); this.exGain.gain.value = 0;
    exNoise.connect(this.exBp); this.exBp.connect(exAm); exAm.connect(this.exGain); this.exGain.connect(this.buses.exhaust);

    // Diesel clatter / injector tick
    const cn = this.loopNoise();
    const clat = ctx.createBiquadFilter(); clat.type = "bandpass"; clat.frequency.value = 2600; clat.Q.value = 3;
    const clatAm = ctx.createGain(); clatAm.gain.value = 0.3; pg.connect(clatAm.gain);
    this.clatGain = ctx.createGain(); this.clatGain.gain.value = 0;
    cn.connect(clat); clat.connect(clatAm); clatAm.connect(this.clatGain); this.clatGain.connect(this.buses.engine);

    // Turbo
    this.whistle = ctx.createOscillator(); this.whistle.type = "sine";
    this.whistleGain = ctx.createGain(); this.whistleGain.gain.value = 0;
    this.whistle.connect(this.whistleGain); this.whistleGain.connect(this.buses.turbo);
    const wn = this.loopNoise();
    this.whoosh = ctx.createBiquadFilter(); this.whoosh.type = "bandpass"; this.whoosh.Q.value = 2;
    this.whooshGain = ctx.createGain(); this.whooshGain.gain.value = 0;
    wn.connect(this.whoosh); this.whoosh.connect(this.whooshGain); this.whooshGain.connect(this.buses.turbo);

    // Supercharger whine
    this.sc = ctx.createOscillator(); this.sc.type = "sawtooth";
    this.scBp = ctx.createBiquadFilter(); this.scBp.type = "bandpass"; this.scBp.Q.value = 6;
    this.scGain = ctx.createGain(); this.scGain.gain.value = 0;
    this.sc.connect(this.scBp); this.scBp.connect(this.scGain); this.scGain.connect(this.buses.turbo);

    // Nitrous hiss
    const nn = this.loopNoise();
    const nhp = ctx.createBiquadFilter(); nhp.type = "highpass"; nhp.frequency.value = 3500;
    this.nosGain = ctx.createGain(); this.nosGain.gain.value = 0;
    nn.connect(nhp); nhp.connect(this.nosGain); this.nosGain.connect(this.buses.turbo);

    // Ambient garage
    const an = this.loopNoise();
    const alp = ctx.createBiquadFilter(); alp.type = "lowpass"; alp.frequency.value = 180;
    const ag = ctx.createGain(); ag.gain.value = 0.25;
    an.connect(alp); alp.connect(ag); ag.connect(this.buses.ambient);

    [this.osc, this.sub, this.pulse, this.whistle, this.sc].forEach((o) => o.start());
    if (this.engine) this.buildWave();
    this.applyVolumes();
  }

  private loopNoise() {
    const s = this.ctx!.createBufferSource(); s.buffer = this.noise; s.loop = true;
    s.loopStart = Math.random(); s.start(0, Math.random() * 1.5); return s;
  }

  setEngine(e: Engine, t: Tuning) { this.engine = e; this.tuning = t; if (this.ctx) this.buildWave(); }
  setTuning(t: Tuning) { this.tuning = t; }
  setQuality(q: "high" | "low") { this.quality = q; if (this.ctx && this.engine) this.buildWave(); }

  /** One engine cycle (720° crank) of combustion pulses -> Fourier series -> PeriodicWave. */
  private buildWave() {
    const e = this.engine!, ctx = this.ctx!;
    const N = this.quality === "high" ? 96 : 48, M = 2048;
    const c = Math.max(1, e.cyl), x = new Float32Array(M);
    const width = (0.16 + e.bass * 0.12 - e.rasp * 0.06) / c; // fatter pulses = deeper
    for (let i = 0; i < c; i++) {
      const pos = i / c + e.uneven * 0.07 * (rand(i * 3.3 + c) - 0.5) + (e.uneven > 0.6 && i % 2 ? e.uneven * 0.03 : 0);
      const amp = 1 - e.uneven * 0.45 * rand(i + c * 5);
      for (let m = 0; m < M; m++) {
        let t = m / M - pos; t -= Math.round(t);
        const g = Math.exp(-((t / width) ** 2));
        const reb = Math.exp(-(((t - width * 1.6) / (width * 1.3)) ** 2)); // pipe rebound
        x[m]! += amp * (g - 0.55 * reb);
        if (e.rasp > 0.3) x[m]! += amp * e.rasp * 0.25 * Math.exp(-((t / (width * 0.25)) ** 2));
      }
    }
    const real = new Float32Array(N + 1), imag = new Float32Array(N + 1);
    for (let n = 1; n <= N; n++) {
      let re = 0, im = 0; const w = (2 * Math.PI * n) / M;
      for (let m = 0; m < M; m++) { re += x[m]! * Math.cos(w * m); im += x[m]! * Math.sin(w * m); }
      const roll = 1 / (1 + Math.pow(n / (c * (3 + e.rasp * 4)), 2)); // soften high harmonics
      real[n] = (re / M) * roll; imag[n] = (im / M) * roll;
    }
    this.osc.setPeriodicWave(ctx.createPeriodicWave(real, imag));
    // Sub: firing fundamental + half-order lope
    const r2 = new Float32Array(5), i2 = new Float32Array(5);
    i2[1] = 0.5 + e.uneven * 0.6; i2[2] = 1; i2[3] = 0.15; i2[4] = 0.25;
    this.sub.setPeriodicWave(ctx.createPeriodicWave(r2, i2));
  }

  setVolumes(v: Volumes) { this.vols = v; this.applyVolumes(); }
  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, v = this.vols;
    this.master.gain.setTargetAtTime(v.master, t, 0.05);
    this.buses.engine.gain.setTargetAtTime(v.engine, t, 0.05);
    this.buses.turbo.gain.setTargetAtTime(v.turbo, t, 0.05);
    this.buses.exhaust.gain.setTargetAtTime(v.exhaust, t, 0.05);
    this.buses.ambient.gain.setTargetAtTime(v.ambient, t, 0.05);
  }

  update(p: { rpm: number; throttle: number; load: number; boost: number; on: boolean; cut: boolean; nos?: boolean }) {
    if (!this.ctx || !this.engine || !this.tuning) return;
    const e = this.engine, tu = this.tuning, ex = EXHAUST[tu.exhaust] ?? EXHAUST.sport;
    const t = this.ctx.currentTime, k = 0.012;
    const rpm = Math.max(p.rpm, 1), r = Math.min(1.2, rpm / e.redline);
    const f0 = rpm / 120, firing = f0 * e.cyl;
    const alive = p.rpm > 60 ? 1 : p.rpm / 60;
    const th = p.cut ? 0 : p.throttle;
    const loadTh = Math.min(1, th * (0.6 + 0.4 * p.load));
    const muff = tu.muffler;
    this.osc.frequency.setTargetAtTime(f0, t, k);
    this.sub.frequency.setTargetAtTime(firing / 2, t, k);
    this.pulse.frequency.setTargetAtTime(firing, t, k);
    const cutoff = (180 + rpm * (0.16 + 0.34 * loadTh) * (1 + e.rasp * 0.5)) * ex.tone * (1 - muff * 0.45);
    this.lp.frequency.setTargetAtTime(Math.min(6500, cutoff), t, k);
    this.body.gain.setTargetAtTime(6 + e.bass * 6 * ex.rumble, t, 0.05);
    this.pre.gain.setTargetAtTime((1 + loadTh * 2.4 * ex.drive) * (p.cut ? 0.4 : 1), t, k);
    const eg = (0.2 + 0.34 * loadTh + 0.18 * r) * alive * (p.cut ? 0.35 : 1) * (1 - muff * 0.35);
    this.engGain.gain.setTargetAtTime(eg, t, k);
    // deep rumble strongest at idle / low rpm and on load
    const sg = (0.22 + 0.3 * e.bass + 0.25 * loadTh) * (1.15 - 0.6 * Math.min(1, r)) * alive * ex.rumble * (1 - muff * 0.25);
    this.subGain.gain.setTargetAtTime(sg * (p.cut ? 0.5 : 1), t, k);
    this.subLp.frequency.setTargetAtTime(Math.min(900, 120 + firing * 1.2), t, k);
    this.jitter.gain.setTargetAtTime(alive * (0.06 + e.uneven * 0.22) * (1.1 - Math.min(1, r)) * ex.rumble, t, 0.1);
    this.exBp.frequency.setTargetAtTime(Math.min(5000, (110 + firing * 1.1) * ex.tone), t, k);
    const xg = (0.05 + 0.38 * loadTh * (0.3 + r)) * ex.loud * alive * (1 - muff * 0.6);
    this.exGain.gain.setTargetAtTime(xg, t, k);
    this.clatGain.gain.setTargetAtTime(e.clatter * 0.12 * alive * (0.6 + 0.4 * (1 - r)), t, 0.05);
    const br = tu.induction === "na" || tu.induction === "super" ? 0 : Math.min(1.3, p.boost / 18);
    this.whistle.frequency.setTargetAtTime(1600 + br * 5200 + r * 800, t, 0.05);
    this.whistleGain.gain.setTargetAtTime(br * br * 0.06, t, 0.05);
    this.whoosh.frequency.setTargetAtTime(1800 + br * 3000, t, 0.05);
    this.whooshGain.gain.setTargetAtTime(br * 0.12, t, 0.05);
    const sc = tu.induction === "super" ? 1 : 0;
    this.sc.frequency.setTargetAtTime(rpm * 0.45, t, k);
    this.scBp.frequency.setTargetAtTime(rpm * 0.9, t, k);
    this.scGain.gain.setTargetAtTime(sc * alive * (0.04 + 0.1 * r) * (0.4 + 0.6 * th) * (0.5 + tu.boost / 20), t, k);
    this.nosGain.gain.setTargetAtTime(p.nos ? 0.08 : 0, t, 0.04);
  }

  private burst(dur: number, setup: (src: AudioBufferSourceNode, g: GainNode, t: number) => AudioNode, dest: AudioNode) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const g = ctx.createGain(); g.gain.value = 0;
    const out = setup(src, g, t); out.connect(g); g.connect(dest);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }

  pop(intensity = 1) {
    if (!this.ctx) return;
    const ex = this.tuning ? (EXHAUST[this.tuning.exhaust] ?? EXHAUST.sport).loud : 1;
    this.burst(0.15, (src, g, t) => {
      const f = this.ctx!.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 450 + Math.random() * 1100; f.Q.value = 1;
      src.connect(f);
      g.gain.setValueAtTime(0.9 * intensity * ex, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04 + Math.random() * 0.08);
      return f;
    }, this.buses.exhaust);
    // low "boom" body of the backfire
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(90 + Math.random() * 40, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.5 * intensity * ex, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(g); g.connect(this.buses.exhaust); o.start(t); o.stop(t + 0.16);
  }

  blowoff(intensity: number) {
    if (!this.ctx || !this.tuning || this.tuning.wastegate === "off") return;
    const flutter = this.tuning.wastegate === "flutter";
    this.burst(0.8, (src, g, t) => {
      const f = this.ctx!.createBiquadFilter(); f.type = "bandpass"; f.Q.value = flutter ? 4 : 1.2;
      f.frequency.setValueAtTime(flutter ? 1400 : 3800, t); f.frequency.exponentialRampToValueAtTime(flutter ? 700 : 1400, t + 0.6);
      src.connect(f);
      const peak = Math.min(0.6, 0.15 + intensity * 0.4);
      if (flutter) {
        for (let i = 0; i < 12; i++) { const tt = t + i * 0.045; g.gain.setValueAtTime(peak * (1 - i / 12), tt); g.gain.setValueAtTime(0.0001, tt + 0.022); }
      } else { g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.55); }
      return f;
    }, this.buses.turbo);
  }

  starter(dur: number) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = 110;
    const am = ctx.createOscillator(); am.type = "square"; am.frequency.value = 9;
    const amg = ctx.createGain(); amg.gain.value = 0.08; am.connect(amg);
    const g = ctx.createGain(); g.gain.value = 0.1; amg.connect(g.gain);
    const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 1400;
    o.connect(f); f.connect(g); g.connect(this.buses.engine);
    g.gain.setValueAtTime(0.1, t + dur - 0.05); g.gain.linearRampToValueAtTime(0, t + dur);
    o.start(t); am.start(t); o.stop(t + dur); am.stop(t + dur);
  }

  click() {
    this.burst(0.06, (src, g, t) => {
      const f = this.ctx!.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 1800; src.connect(f);
      g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05); return f;
    }, this.master);
  }

  grind() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.setValueAtTime(700, t); o.frequency.linearRampToValueAtTime(400, t + 0.35);
    const am = ctx.createOscillator(); am.frequency.value = 55; const amg = ctx.createGain(); amg.gain.value = 0.12; am.connect(amg);
    const g = ctx.createGain(); g.gain.value = 0.12; amg.connect(g.gain);
    o.connect(g); g.connect(this.master);
    g.gain.setValueAtTime(0.12, t + 0.3); g.gain.linearRampToValueAtTime(0, t + 0.38);
    o.start(t); am.start(t); o.stop(t + 0.4); am.stop(t + 0.4);
  }
}
