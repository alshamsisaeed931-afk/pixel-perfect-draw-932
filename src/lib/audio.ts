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

export class EngineAudio {
  ctx: AudioContext | null = null;
  private noise!: AudioBuffer;
  private osc!: OscillatorNode; private osc2!: OscillatorNode; private pre!: GainNode; private shaper!: WaveShaperNode;
  private lp!: BiquadFilterNode; private engGain!: GainNode;
  private exNoise!: AudioBufferSourceNode; private exBp!: BiquadFilterNode; private exAm!: GainNode; private pulse!: OscillatorNode; private exGain!: GainNode;
  private clat!: BiquadFilterNode; private clatGain!: GainNode;
  private whistle!: OscillatorNode; private whistleGain!: GainNode; private whoosh!: BiquadFilterNode; private whooshGain!: GainNode;
  private sc!: OscillatorNode; private scBp!: BiquadFilterNode; private scGain!: GainNode;
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

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.15;
    this.master = ctx.createGain(); this.master.connect(comp); comp.connect(ctx.destination);
    const bus = () => { const g = ctx.createGain(); g.connect(this.master); return g; };
    this.buses = { engine: bus(), turbo: bus(), exhaust: bus(), ambient: bus() };

    // Engine core: harmonic periodic wave -> drive -> lowpass
    this.osc = ctx.createOscillator(); this.osc2 = ctx.createOscillator();
    this.pre = ctx.createGain(); this.shaper = ctx.createWaveShaper(); this.shaper.curve = shaperCurve(2.2); this.shaper.oversample = "2x";
    this.lp = ctx.createBiquadFilter(); this.lp.type = "lowpass"; this.lp.Q.value = 2.5;
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    const o2g = ctx.createGain(); o2g.gain.value = 0.35;
    this.osc.connect(this.pre); this.osc2.connect(o2g); o2g.connect(this.pre);
    this.pre.connect(this.shaper); this.shaper.connect(this.lp); this.lp.connect(this.engGain); this.engGain.connect(this.buses.engine);

    // Exhaust pulses: noise amplitude-modulated at firing frequency
    this.exNoise = this.loopNoise();
    this.exBp = ctx.createBiquadFilter(); this.exBp.type = "bandpass"; this.exBp.Q.value = 0.9;
    this.exAm = ctx.createGain(); this.exAm.gain.value = 0.5;
    this.pulse = ctx.createOscillator(); this.pulse.type = "square";
    const pg = ctx.createGain(); pg.gain.value = 0.5; this.pulse.connect(pg); pg.connect(this.exAm.gain);
    this.exGain = ctx.createGain(); this.exGain.gain.value = 0;
    this.exNoise.connect(this.exBp); this.exBp.connect(this.exAm); this.exAm.connect(this.exGain); this.exGain.connect(this.buses.exhaust);

    // Diesel clatter
    const cn = this.loopNoise();
    this.clat = ctx.createBiquadFilter(); this.clat.type = "bandpass"; this.clat.frequency.value = 3200; this.clat.Q.value = 3;
    const clatAm = ctx.createGain(); clatAm.gain.value = 0.3; pg.connect(clatAm.gain);
    this.clatGain = ctx.createGain(); this.clatGain.gain.value = 0;
    cn.connect(this.clat); this.clat.connect(clatAm); clatAm.connect(this.clatGain); this.clatGain.connect(this.buses.engine);

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

    // Ambient garage
    const an = this.loopNoise();
    const alp = ctx.createBiquadFilter(); alp.type = "lowpass"; alp.frequency.value = 180;
    const ag = ctx.createGain(); ag.gain.value = 0.25;
    an.connect(alp); alp.connect(ag); ag.connect(this.buses.ambient);

    [this.osc, this.osc2, this.pulse, this.whistle, this.sc].forEach((o) => o.start());
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

  private buildWave() {
    const e = this.engine!, ctx = this.ctx!;
    const N = this.quality === "high" ? 128 : 56;
    const real = new Float32Array(N + 1), imag = new Float32Array(N + 1);
    const c = e.cyl;
    for (let n = 1; n <= N; n++) {
      let a = 0;
      if (n % c === 0) { const k = n / c; a += 1 / Math.pow(k, 1.25 - e.rasp * 0.75); }
      const half = c / 2;
      if (half >= 1 && Number.isInteger(half) && n % half === 0 && n % c !== 0) a += e.uneven * 0.55 / Math.sqrt(n / half);
      if (n < c * 3) a += e.uneven * 0.35 * rand(n + c * 7) / Math.sqrt(n);
      if (n < c) a += e.bass * 0.25 / n;
      a += e.rasp * 0.06 * rand(n * 3.1 + c) * (n > c * 2 ? 1 : 0);
      const ph = rand(n * 1.7 + c) * Math.PI * 2;
      real[n] = a * Math.cos(ph); imag[n] = a * Math.sin(ph);
    }
    this.osc.setPeriodicWave(ctx.createPeriodicWave(real, imag));
    // osc2: half-order sub rumble
    const r2 = new Float32Array(9), i2 = new Float32Array(9);
    for (let n = 1; n <= 8; n++) i2[n] = (n % 2 ? 1 : 0.4) / n;
    this.osc2.setPeriodicWave(ctx.createPeriodicWave(r2, i2));
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

  update(p: { rpm: number; throttle: number; load: number; boost: number; on: boolean; cut: boolean }) {
    if (!this.ctx || !this.engine || !this.tuning) return;
    const e = this.engine, tu = this.tuning, ex = EXHAUST[tu.exhaust];
    const t = this.ctx.currentTime, k = 0.012;
    const rpm = Math.max(p.rpm, 1), r = Math.min(1.2, rpm / e.redline);
    const f0 = rpm / 120, firing = f0 * e.cyl;
    const alive = p.rpm > 60 ? 1 : p.rpm / 60;
    const th = p.cut ? 0 : p.throttle;
    const loadTh = Math.min(1, th * (0.6 + 0.4 * p.load));
    this.osc.frequency.setTargetAtTime(f0, t, k);
    this.osc2.frequency.setTargetAtTime(f0 * (e.cyl >= 2 ? e.cyl / 2 : 1), t, k);
    this.pulse.frequency.setTargetAtTime(firing, t, k);
    const cutoff = (250 + rpm * (0.35 + 0.55 * loadTh) * (1 + e.rasp * 0.6)) * ex.tone * (1 - tu.muffler * 0.45);
    this.lp.frequency.setTargetAtTime(Math.min(16000, cutoff), t, k);
    this.pre.gain.setTargetAtTime((0.7 + loadTh * 2.2 * ex.drive) * (p.cut ? 0.4 : 1), t, k);
    const eg = (0.16 + 0.32 * loadTh + 0.22 * r) * alive * (p.cut ? 0.35 : 1) * (1 - tu.muffler * 0.35);
    this.engGain.gain.setTargetAtTime(eg, t, k);
    this.exBp.frequency.setTargetAtTime(Math.min(9000, (180 + firing * 1.4) * ex.tone), t, k);
    const xg = (0.05 + 0.4 * loadTh * (0.3 + r)) * ex.loud * alive * (1 - tu.muffler * 0.6);
    this.exGain.gain.setTargetAtTime(xg, t, k);
    this.clatGain.gain.setTargetAtTime(e.clatter * 0.12 * alive * (0.6 + 0.4 * (1 - r)), t, 0.05);
    const br = tu.induction === "na" || tu.induction === "super" ? 0 : Math.min(1.3, p.boost / 18);
    this.whistle.frequency.setTargetAtTime(1600 + br * 5200 + r * 800, t, 0.05);
    this.whistleGain.gain.setTargetAtTime(br * br * 0.07, t, 0.05);
    this.whoosh.frequency.setTargetAtTime(1800 + br * 3000, t, 0.05);
    this.whooshGain.gain.setTargetAtTime(br * 0.12, t, 0.05);
    const sc = tu.induction === "super" ? 1 : 0;
    this.sc.frequency.setTargetAtTime(rpm * 0.45, t, k);
    this.scBp.frequency.setTargetAtTime(rpm * 0.9, t, k);
    this.scGain.gain.setTargetAtTime(sc * alive * (0.04 + 0.1 * r) * (0.4 + 0.6 * th) * (0.5 + tu.boost / 20), t, k);
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
    const ex = this.tuning ? EXHAUST[this.tuning.exhaust].loud : 1;
    this.burst(0.15, (src, g, t) => {
      const f = this.ctx!.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 600 + Math.random() * 1500; f.Q.value = 1;
      src.connect(f);
      g.gain.setValueAtTime(0.9 * intensity * ex, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04 + Math.random() * 0.08);
      return f;
    }, this.buses.exhaust);
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
