import { useEffect, useRef, useState } from "react";
import { Power, RotateCcw, Zap } from "lucide-react";
import { engineById } from "@/lib/engines";
import { CAR_W, LANE_W, ROAD_HALF, collides, isOffRoad, lateralStep, offRoadDrag, roadOffset, updateTraffic, type TrafficCar } from "@/lib/highway";
import { MS_TO, sim } from "@/lib/sim";
import { useGame, useSim } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Pedal } from "./ui";
import { Shifter } from "./shifter";
import { Msg, useKeys } from "./screens";

type Palette = Record<"sky" | "horizon" | "grass" | "grassAlt" | "asphalt" | "asphaltAlt" | "line" | "primary" | "metal" | "bg", string>;
function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim() || "gray";
  return {
    sky: v("--road-sky"), horizon: v("--road-horizon"), grass: v("--road-grass"), grassAlt: v("--road-grass-alt"),
    asphalt: v("--road-asphalt"), asphaltAlt: v("--road-asphalt-alt"), line: v("--road-line"), primary: v("--primary"), metal: v("--metal"), bg: v("--background"),
  };
}

/** Steering wheel: drag sideways (or use ←/→ / A/D) to turn; springs back to centre on release. */
function SteeringWheel({ steer }: { steer: React.MutableRefObject<number> }) {
  const wheel = useRef<SVGSVGElement>(null);
  const start = useRef<number | null>(null);
  const keys = useRef({ l: false, r: false });
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (start.current === null) {
        const k = keys.current, target = (k.r ? 1 : 0) - (k.l ? 1 : 0);
        steer.current += (target - steer.current) * (target ? 0.12 : 0.18);
      }
      if (wheel.current) wheel.current.style.transform = `rotate(${steer.current * 140}deg)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const set = (ev: KeyboardEvent, on: boolean) => {
      if (ev.code === "ArrowLeft" || ev.code === "KeyA") { keys.current.l = on; ev.preventDefault(); }
      if (ev.code === "ArrowRight" || ev.code === "KeyD") { keys.current.r = on; ev.preventDefault(); }
    };
    const d = (e: KeyboardEvent) => set(e, true), u = (e: KeyboardEvent) => set(e, false);
    window.addEventListener("keydown", d); window.addEventListener("keyup", u);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("keydown", d); window.removeEventListener("keyup", u); steer.current = 0; };
  }, [steer]);
  return (
    <div role="slider" aria-label="Steering wheel" aria-valuemin={-100} aria-valuemax={100} aria-valuenow={0} tabIndex={0}
      className="no-select flex touch-none items-center justify-center"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); start.current = e.clientX; }}
      onPointerMove={(e) => { if (start.current === null) return; const w = e.currentTarget.getBoundingClientRect().width; steer.current = Math.max(-1, Math.min(1, (e.clientX - start.current) / (w * 0.6))); }}
      onPointerUp={() => (start.current = null)} onPointerCancel={() => (start.current = null)}>
      <svg ref={wheel} viewBox="0 0 100 100" className="aspect-square w-full max-w-[120px] drop-shadow-lg sm:max-w-[150px]">
        <circle cx="50" cy="50" r="44" fill="none" className="stroke-metal" strokeWidth="9" />
        <circle cx="50" cy="50" r="44" fill="none" className="stroke-background" strokeWidth="2" strokeDasharray="3 5" />
        <path d="M50 6 v10" className="stroke-primary" strokeWidth="6" />
        <path d="M8 52 Q50 40 92 52 M50 56 V92" fill="none" className="stroke-metal" strokeWidth="8" strokeLinecap="round" />
        <circle cx="50" cy="52" r="13" className="fill-muted stroke-metal" strokeWidth="2" />
        <circle cx="50" cy="52" r="4" className="fill-primary" />
      </svg>
    </div>
  );
}

function Road({ steer, crashes, shiftRpm }: { steer: React.MutableRefObject<number>; crashes: (n: number) => void; shiftRpm: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { settings } = useGame();
  const units = settings.units;
  useEffect(() => {
    const cv = canvas.current!; const ctx = cv.getContext("2d")!;
    const pal = readPalette();
    let x = 0, traffic: TrafficCar[] = [], hits = 0, cool = 0, raf = 0, last = performance.now();
    const ids = { n: 1 };
    const startDist = sim.getDist();
    const resize = () => { const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); cv.width = r.width * d; cv.height = r.height * d; };
    resize(); const ro = new ResizeObserver(resize); ro.observe(cv);

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const s = sim.get();
      const pz = s.dist - startDist;
      x = lateralStep(x, steer.current, s.speed, pz, dt);
      sim.extraDrag = offRoadDrag(x, s.speed);
      traffic = updateTraffic(traffic, pz, dt, Math.random, ids);
      if (cool > 0) cool -= dt;
      for (const c of traffic) if (cool <= 0 && collides(x, pz, c)) { sim.crash(); hits++; crashes(hits); cool = 1.2; c.z += 12; }

      const W = cv.width, H = cv.height, hor = H * 0.42, f = W * 0.9, camH = 1.6;
      const sky = ctx.createLinearGradient(0, 0, 0, hor); sky.addColorStop(0, pal.sky); sky.addColorStop(1, pal.horizon);
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, hor);
      ctx.fillStyle = pal.grass; ctx.fillRect(0, hor, W, H - hor);
      const proj = (wx: number, z: number) => ({ x: W / 2 + (wx - x) * f / z, y: hor + camH * f / z, s: f / z });
      // road segments far → near
      const seg = 4, far = 260;
      for (let z = far; z > 2; z -= seg) {
        const z2 = z - seg; if (z2 < 2) break;
        const o1 = roadOffset(pz, z), o2 = roadOffset(pz, z2);
        const a = proj(o1, z), b = proj(o2, z2);
        const band = Math.floor((pz + z) / 8) % 2 === 0;
        ctx.fillStyle = band ? pal.grassAlt : pal.grass; ctx.fillRect(0, a.y, W, b.y - a.y + 1);
        const quad = (hw1: number, hw2: number, c: string, off = 0) => {
          ctx.fillStyle = c; ctx.beginPath();
          ctx.moveTo(a.x + (off - hw1) * a.s, a.y); ctx.lineTo(a.x + (off + hw1) * a.s, a.y);
          ctx.lineTo(b.x + (off + hw2) * b.s, b.y + 1); ctx.lineTo(b.x + (off - hw2) * b.s, b.y + 1); ctx.fill();
        };
        quad(ROAD_HALF + 0.6, ROAD_HALF + 0.6, band ? pal.primary : pal.line);
        quad(ROAD_HALF, ROAD_HALF, band ? pal.asphalt : pal.asphaltAlt);
        if (band) for (const l of [-LANE_W / 2, LANE_W / 2]) quad(0.08, 0.08, pal.line, l);
      }
      // traffic far → near
      for (const c of [...traffic].sort((p, q) => q.z - p.z)) {
        const dz = c.z - pz; if (dz < 2.5 || dz > far) continue;
        const p = proj(c.lane * LANE_W + roadOffset(pz, dz), dz);
        const w = CAR_W * p.s, h = 1.3 * p.s;
        ctx.fillStyle = `hsl(${c.hue} 55% 42%)`; ctx.fillRect(p.x - w / 2, p.y - h, w, h);
        ctx.fillStyle = pal.bg; ctx.fillRect(p.x - w * 0.38, p.y - h * 0.95, w * 0.76, h * 0.35);
        ctx.fillStyle = pal.primary; ctx.fillRect(p.x - w / 2, p.y - h * 0.45, w * 0.2, h * 0.12); ctx.fillRect(p.x + w * 0.3, p.y - h * 0.45, w * 0.2, h * 0.12);
      }
      // player car (rear view), leans with steering
      const cw = W * 0.22, ch = cw * 0.42, cx = W / 2, cy = H - ch * 0.25;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(steer.current * 0.04);
      ctx.fillStyle = pal.bg; ctx.fillRect(-cw / 2, -ch * 0.15, cw * 0.18, ch * 0.3); ctx.fillRect(cw / 2 - cw * 0.18, -ch * 0.15, cw * 0.18, ch * 0.3);
      ctx.fillStyle = pal.primary; ctx.beginPath(); ctx.moveTo(-cw / 2, 0); ctx.lineTo(-cw * 0.42, -ch); ctx.lineTo(cw * 0.42, -ch); ctx.lineTo(cw / 2, 0); ctx.fill();
      ctx.fillStyle = pal.bg; ctx.fillRect(-cw * 0.32, -ch * 0.95, cw * 0.64, ch * 0.32);
      ctx.fillStyle = s.throttle < 0.05 && s.on ? pal.line : pal.metal; ctx.fillRect(-cw * 0.45, -ch * 0.5, cw * 0.18, ch * 0.13); ctx.fillRect(cw * 0.27, -ch * 0.5, cw * 0.18, ch * 0.13);
      if (s.nosOn) { ctx.fillStyle = pal.line; ctx.globalAlpha = 0.7; ctx.fillRect(-cw * 0.3, -ch * 0.08, cw * 0.1, ch * 0.2); ctx.globalAlpha = 1; }
      ctx.restore();
      // HUD
      const spd = Math.abs(s.speed) * MS_TO[units];
      ctx.fillStyle = pal.bg; ctx.globalAlpha = 0.6; ctx.fillRect(8, 8, W * 0.32, H * 0.2); ctx.globalAlpha = 1;
      ctx.fillStyle = pal.line; ctx.font = `bold ${Math.round(H * 0.09)}px "Share Tech Mono", monospace`;
      ctx.fillText(`${spd.toFixed(0)}`, 16, 8 + H * 0.1);
      ctx.font = `${Math.round(H * 0.045)}px "Share Tech Mono", monospace`;
      ctx.fillText(`${units === "metric" ? "KM/H" : "MPH"} · G ${s.gear === -1 ? "R" : s.gear === 0 ? "N" : s.gear} · ${(s.rpm / 1000).toFixed(1)}k`, 16, 8 + H * 0.17);
      if (shiftRpm > 0 && s.on && s.rpm >= shiftRpm) { ctx.fillStyle = pal.primary; ctx.fillRect(8, 8 + H * 0.2, W * 0.32, H * 0.035); ctx.fillText("SHIFT", 16, 8 + H * 0.27); ctx.fillStyle = pal.line; }
      if (isOffRoad(x)) { ctx.fillStyle = pal.primary; ctx.textAlign = "center"; ctx.fillText("OFF ROAD", W / 2, H * 0.1); ctx.textAlign = "left"; }
      const km = pz / 1000 * (units === "metric" ? 1 : 0.621);
      ctx.textAlign = "right"; ctx.fillStyle = pal.line; ctx.fillText(`TRIP ${km.toFixed(2)} ${units === "metric" ? "km" : "mi"}`, W - 12, 8 + H * 0.06); ctx.textAlign = "left";
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); sim.extraDrag = 0; };
  }, [steer, crashes, units, shiftRpm]);
  return <canvas ref={canvas} aria-label="Highway view" className="block h-full w-full rounded-xl border-2 border-metal" />;
}

export function HighwayScreen() {
  useKeys();
  const s = useSim();
  const { engineId, tuning, settings } = useGame();
  const steer = useRef(0);
  const [hits, setHits] = useState(0);
  const [run, setRun] = useState(0);
  const e = engineById(engineId);
  return (
    <div className="grid gap-2 landscape:grid-cols-[1.4fr_1fr]">
      <div className="space-y-2">
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] tracking-[0.3em] text-primary uppercase">Highway test</div>
            <h2 className="font-display truncate text-lg font-bold">{e.name}</h2>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">Crashes {hits}</span>
            <button onClick={() => { sim.resetRun(); setHits(0); setRun((r) => r + 1); }} className="flex items-center gap-1 rounded border px-2 py-1 uppercase"><RotateCcw className="h-3 w-3" />Reset</button>
          </div>
        </div>
        <div className="h-[26vh] min-h-32 w-full landscape:h-[55vh]"><Road key={run} steer={steer} crashes={setHits} shiftRpm={tuning.shiftLight ? tuning.shiftRpm : 0} /></div>
      </div>
      <div className="space-y-2">
        <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] items-center gap-2">
          <SteeringWheel steer={steer} />
          <Shifter gear={s.gear} gears={settings.gears} onShift={(g) => sim.shift(g)} />
        </div>
        <div className="grid grid-cols-[1fr_auto_1.4fr] items-stretch gap-2">
          <Pedal label="Clutch" variant="clutch" className="h-20 sm:h-28" onChange={(v) => { sim.ensureAudio(); sim.clutchIn = v; }} />
          <button onClick={() => sim.startStop()}
            className={cn("font-display flex h-14 w-14 flex-col items-center justify-center self-center rounded-full border-4 text-[9px] font-bold tracking-widest uppercase",
              s.on || s.starting ? "border-primary bg-primary/20 text-primary glow" : "border-metal metal text-foreground")}>
            <Power className="mb-0.5 h-4 w-4" />{s.starting ? "..." : s.on ? "Stop" : "Start"}
          </button>
          <Pedal label="Gas" className="h-20 sm:h-28" onChange={(v) => { sim.ensureAudio(); sim.throttleIn = v; }} />
        </div>
        {tuning.nitrous && (
          <button aria-label="Nitrous" onPointerDown={(ev) => { ev.currentTarget.setPointerCapture(ev.pointerId); sim.ensureAudio(); sim.nitrousIn = true; }}
            onPointerUp={() => (sim.nitrousIn = false)} onPointerCancel={() => (sim.nitrousIn = false)} onContextMenu={(ev) => ev.preventDefault()}
            className={cn("font-display flex w-full touch-none select-none items-center justify-center gap-1 rounded-lg border-2 py-2 text-sm font-bold uppercase",
              s.nosOn ? "border-nos bg-nos/25 text-foreground glow" : "border-nos/60 text-foreground")}>
            <Zap className="h-4 w-4" />{s.nos <= 0 ? "Bottle empty" : s.nosOn ? "NOS!" : "Hold for nitrous"}
          </button>
        )}
        <Msg />
        <p className="hidden text-center text-xs text-muted-foreground md:block">Keys: S start · Space gas · C clutch · ←/→ or A/D steer · 1-9 / N / R gears</p>
      </div>
    </div>
  );
}
