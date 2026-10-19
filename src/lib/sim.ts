import { EngineAudio, type Volumes } from "./audio";
import { effectiveInertia, finalDriveRatio, throttleStep } from "./dashboard";
import { CAM, ENGINES, defaultTuning, hpFrom, steadyBoost, torqueAt, type Engine, type Tuning } from "./engines";

export const GEAR_RATIOS: Record<number, number> = { [-1]: -3.3, 0: 0, 1: 3.6, 2: 2.2, 3: 1.55, 4: 1.2, 5: 1.0, 6: 0.83 };
const WHEEL_R = 0.33;

export type Snapshot = {
  on: boolean; starting: boolean; rpm: number; throttle: number; gear: number; clutch: number;
  speed: number; dist: number; temp: number; boost: number; hp: number; torque: number; cut: boolean; spdCut: boolean;
  message: string; msgId: number; dyno: boolean; dynoId: number; time: number;
};
export type DynoPoint = { rpm: number; hp: number; tq: number; boost: number };

type Opts = { revMatch: boolean; autoClutch: boolean; vibration: boolean };

class Sim {
  audio = new EngineAudio();
  engine: Engine = ENGINES[0]!;
  tuning: Tuning = defaultTuning(ENGINES[0]!);
  opts: Opts = { revMatch: true, autoClutch: false, vibration: true };
  throttleIn = 0; clutchIn = 0;
  history: { t: number; rpm: number; boost: number }[] = [];
  dynoResult: DynoPoint[] = [];
  private s: Snapshot = { on: false, starting: false, rpm: 0, throttle: 0, gear: 0, clutch: 1, speed: 0, dist: 0, temp: 45, boost: 0, hp: 0, torque: 0, cut: false, spdCut: false, message: "", msgId: 0, dyno: false, dynoId: 0, time: 0 };
  private snap: Snapshot = { ...this.s };
  private listeners = new Set<() => void>();
  private raf = 0; private last = 0;
  private cutT = 0; private popT = 0; private blipT = 0; private blipTarget = 0; private dipT = 0; private startT = 0;
  private prevTh = 0; private script: { start: number; steps: [number, number][] } | null = null;
  private histT = 0; private lastDynoRpm = 0;
  private pedalThrottle = 0;

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  get = () => this.snap;

  ensureAudio() {
    this.audio.init();
    if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this.loop); }
  }

  setEngine(e: Engine, t: Tuning) {
    const wasOn = this.s.on;
    this.engine = e; this.tuning = t; this.audio.setEngine(e, t);
    this.s.rpm = wasOn ? e.idle : 0; this.s.boost = 0; this.s.speed = 0; this.s.gear = 0; this.s.dyno = false;
  }
  setTuning(t: Tuning) { this.tuning = t; this.audio.setTuning(t); }
  setVolumes(v: Volumes) { this.audio.setVolumes(v); }

  private msg(m: string) { this.s.message = m; this.s.msgId++; }
  private buzz(ms: number) { if (this.opts.vibration && typeof navigator !== "undefined") navigator.vibrate?.(ms); }

  startStop() {
    this.ensureAudio();
    const s = this.s;
    if (s.on || s.starting) { s.on = false; s.starting = false; s.dyno = false; this.msg("ENGINE OFF"); return; }
    if (s.gear !== 0 && this.clutchIn < 0.5) { this.msg("PRESS CLUTCH OR SELECT N"); return; }
    s.starting = true; this.startT = 0.9 + Math.random() * 0.4;
    this.audio.starter(this.startT);
  }

  shift(g: number) {
    this.ensureAudio();
    const s = this.s;
    if (g === s.gear || s.dyno) return;
    if (g === -1 && s.speed > 1.5) { this.audio.grind(); this.msg("STOP TO ENGAGE REVERSE"); this.buzz(80); return; }
    if (!this.opts.autoClutch && s.on && g !== 0 && s.clutch > 0.4) {
      this.audio.grind(); this.msg("GRIND! USE THE CLUTCH"); this.buzz(80); return;
    }
    if (this.opts.autoClutch) { this.dipT = 0.28; s.clutch = 0; }
    s.gear = g; this.audio.click(); this.buzz(10);
    if (this.opts.revMatch && g > 0 && s.on) {
      this.blipTarget = Math.abs(s.speed) / WHEEL_R * (GEAR_RATIOS[g] ?? 0) * finalDriveRatio(this.tuning.finalDrive) * 9.549; this.blipT = 0.35;
    }
  }

  preview(e: Engine, t: Tuning) {
    this.ensureAudio();
    this.setEngine(e, t);
    if (!this.s.on) { this.s.gear = 0; this.startStop(); }
    this.script = { start: this.s.time + 1.3, steps: [[0, 0], [0.3, 1], [0.9, 0], [1.6, 1], [1.9, 0.6], [2.4, 0]] };
  }

  startDyno() {
    this.ensureAudio();
    const s = this.s, e = this.engine;
    if (!s.on) { this.msg("START THE ENGINE FIRST"); return; }
    s.dyno = true; s.gear = 4; s.clutch = 1; this.dipT = 0;
    const startRpm = Math.max(e.idle * 1.5, e.redline * 0.25);
    s.speed = startRpm / ((GEAR_RATIOS[4] ?? 1.2) * finalDriveRatio(this.tuning.finalDrive) * 9.549) * WHEEL_R; s.rpm = startRpm;
    this.dynoResult = []; this.lastDynoRpm = 0;
  }

  resetRun() { const s = this.s; s.speed = 0; s.dist = 0; s.gear = 0; s.dyno = false; }
  getDist() { return this.s.dist; }

  private loop = (now: number) => {
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    this.step(dt);
    this.snap = { ...this.s };
    this.listeners.forEach((l) => l());
    this.raf = requestAnimationFrame(this.loop);
  };

  private step(dt: number) {
    const s = this.s, e = this.engine, tu = this.tuning;
    s.time += dt;
    if (s.starting) {
      this.startT -= dt; s.rpm = 180 + Math.sin(s.time * 50) * 60;
      if (this.startT <= 0) { s.starting = false; s.on = true; s.rpm = (e.idle + tu.idleOffset) * 1.5; this.msg("ENGINE RUNNING"); }
    }
    // clutch
    if (this.dipT > 0) this.dipT -= dt;
    const cT = this.dipT > 0 ? 0 : 1 - this.clutchIn;
    s.clutch += (cT - s.clutch) * Math.min(1, dt * (cT > s.clutch ? 6 : 25));

    this.pedalThrottle = throttleStep(this.pedalThrottle, this.throttleIn, tu.throttleResponse, dt);
    let th = this.pedalThrottle;
    if (this.script) {
      const rel = s.time - this.script.start;
      if (rel >= 0) {
        const st = this.script.steps; let v = 0;
        for (const [tt, val] of st as [number, number][]) if (rel >= tt) v = val;
        th = v; if (rel > st[st.length - 1]![0] + 0.2) this.script = null;
      } else th = 0;
    }
    if (s.dyno) th = 1;
    if (this.blipT > 0) { this.blipT -= dt; if (s.rpm < this.blipTarget) th = Math.max(th, 1); }
    if (!s.on) th = 0;
    const idle = e.idle + tu.idleOffset;
    if (s.on) th = Math.max(th, Math.min(0.3, Math.max(0, (idle - s.rpm) / 600)) + 0.012);

    // limiter (launch control holds a lower two-step limit while stationary with clutch in)
    s.cut = false;
    const launching = s.on && this.clutchIn > 0.5 && Math.abs(s.speed) < 1 && this.throttleIn > 0.7;
    const effLimit = launching ? Math.min(tu.launchRpm, tu.limiter) : tu.limiter;
    if (s.on && s.rpm >= effLimit) {
      if (tu.limiterType === "hard" || launching) { if (this.cutT <= 0) { this.cutT = 0.07; this.buzz(12); if (tu.pops && Math.random() < 0.3 + tu.popsLevel * 0.6) this.audio.pop((0.3 + tu.popsLevel * 0.7) * (launching ? 1 : 0.8)); } }
      else th = Math.min(th, Math.max(0, 1 - (s.rpm - effLimit) / 150));
    }
    if (this.cutT > 0) { this.cutT -= dt; th = 0; s.cut = true; }

    // speed limiter: cut throttle at the set top speed
    s.spdCut = false;
    if (s.on && tu.speedLimit > 0 && Math.abs(s.speed) * 3.6 >= tu.speedLimit) { th = 0; s.spdCut = true; }

    // pops on lift-off
    if (this.prevTh > 0.45 && this.throttleIn < 0.1 && s.rpm > e.redline * 0.45 && !s.dyno) {
      if (tu.pops) this.popT = (0.5 + Math.random() * 0.6) * (0.3 + tu.popsLevel * 1.4);
      if (s.boost > tu.boost * 0.35 && (tu.induction === "turbo" || tu.induction === "twin") && !tu.antiLag) { this.audio.blowoff(s.boost / Math.max(8, tu.boost)); s.boost *= 0.3; }
    }
    if (this.popT > 0) { this.popT -= dt; if (Math.random() < dt * (6 + tu.popsLevel * 16)) this.audio.pop((0.4 + Math.random() * 0.6) * (0.4 + tu.popsLevel * 0.8)); }
    this.prevTh = s.dyno ? 1 : this.throttleIn;

    // anti-lag: keep boost alive off-throttle, with bangs
    if (tu.antiLag && s.on && th < 0.15 && s.boost > 2 && (tu.induction === "turbo" || tu.induction === "twin")) {
      s.boost = Math.max(s.boost * (1 - dt * 0.6), tu.boost * 0.4);
      if (Math.random() < dt * 8 * (0.3 + tu.popsLevel)) this.audio.pop(0.5 + Math.random() * 0.5);
    }

    // boost
    const target = steadyBoost(e, tu, s.rpm, th);
    if (tu.induction === "super" || tu.induction === "na") s.boost = target;
    else s.boost += (target - s.boost) * Math.min(1, dt / ((tu.induction === "twin" ? 0.3 : 0.55) / tu.spoolRate) * (target < s.boost ? 2.5 : 1));

    const I = effectiveInertia(e.inertia, tu.flywheel), G = (GEAR_RATIOS[s.gear] ?? 0) * finalDriveRatio(tu.finalDrive);
    const mass = s.dyno ? e.mass * 0.45 : e.mass;
    const cap = e.peakT * 2.2 * (1 + s.boost / 14.7);
    const N = 8, h = dt / N;
    let Te = 0, Tc = 0;
    for (let i = 0; i < N; i++) {
      const full = torqueAt(e, tu, s.rpm, s.boost);
      const fric = s.rpm < 5 ? 0 : e.peakT * (0.04 + 0.22 * s.rpm / e.redline);
      Te = (s.on ? full * th : 0) - fric;
      const rpmV = G ? (s.speed / WHEEL_R) * G * 9.549 : 0;
      Tc = G ? s.clutch * Math.max(-cap, Math.min(cap, (s.rpm - rpmV) * (e.peakT / 160))) : 0;
      if (!s.on && s.rpm < 5 && G && s.clutch > 0.5) Tc = 0;
      s.rpm += ((Te - Tc) / I) * 9.549 * h * 0.5;
      if (s.rpm < 0) s.rpm = 0;
      const F = (Tc * G / WHEEL_R) * 0.92;
      const sign = Math.sign(s.speed);
      const drag = s.dyno ? 0 : sign * (150 + 0.4 * s.speed * s.speed);
      let v = s.speed + ((F - drag) / mass) * h;
      if (sign !== 0 && Math.sign(v) !== sign && Math.abs(F) < 160) v = 0;
      if (s.speed === 0 && Math.abs(F) < 160) v = 0;
      s.speed = v;
    }
    // cam lope: aggressive cams make the idle hunt and shake
    const lope = CAM[tu.cam].lope;
    if (s.on && !s.starting && lope > 0 && th < 0.15 && s.rpm < idle * 1.6) {
      s.rpm += Math.sin(s.time * (6 + lope * 5)) * lope * idle * 0.05 + Math.sin(s.time * 23.7) * lope * idle * 0.02;
    }
    if (s.starting) s.rpm = 180 + Math.sin(s.time * 50) * 60;
    if (s.on && s.rpm < idle * 0.35) { s.on = false; s.dyno = false; this.msg("STALLED!"); this.buzz(150); }
    s.dist += Math.abs(s.speed) * dt;
    s.throttle = th;
    s.torque = Math.max(0, torqueAt(e, tu, s.rpm, s.boost) * th);
    s.hp = hpFrom(s.torque, s.rpm);
    const tt = 82 + 22 * (s.rpm / e.redline) * (0.5 + th * 0.5) + (s.on ? 0 : -40);
    s.temp += (tt - s.temp) * dt * (s.on ? 0.05 : 0.01);

    if (s.dyno) {
      if (s.rpm - this.lastDynoRpm >= e.redline / 60) {
        this.lastDynoRpm = s.rpm;
        this.dynoResult.push({ rpm: s.rpm, hp: s.hp, tq: s.torque, boost: s.boost });
      }
      if (s.rpm >= tu.limiter - 80 || !s.on) {
        s.dyno = false; s.gear = 0; s.speed = 0; s.dynoId++; this.msg("DYNO RUN COMPLETE");
        this.popT = tu.pops ? 0.8 : 0;
        if (tu.induction === "turbo" || tu.induction === "twin") this.audio.blowoff(1);
      }
    }
    this.histT += dt;
    if (this.histT > 1 / 30) { this.histT = 0; this.history.push({ t: s.time, rpm: s.rpm, boost: s.boost }); if (this.history.length > 180) this.history.shift(); }

    const load = G && s.clutch > 0.5 ? 1 : 0.3;
    this.audio.update({ rpm: s.rpm, throttle: th, load, boost: s.boost, on: s.on || s.starting, cut: s.cut });
  }
}

export const sim = new Sim();
export const MS_TO = { metric: 3.6, imperial: 2.23694 };
