import { useEffect, useRef, useState } from "react";
import { Power, RotateCcw, Zap } from "lucide-react";
import { engineById } from "@/lib/engines";
import { CAR_W, LANE_W, PAINTS, ROAD_HALF, collides, curveAt, isOffRoad, lateralStep, offRoadDrag, roadOffset, updateTraffic, type TrafficCar } from "@/lib/highway";
import { MS_TO, sim } from "@/lib/sim";
import { useGame, useSim } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Pedal } from "./ui";
import { Shifter } from "./shifter";
import { Msg, useKeys } from "./screens";

const TOKENS = ["sky", "horizon", "grass", "grass-alt", "asphalt", "asphalt-alt", "line", "sun", "hill-far", "hill-near", "rail", "pole", "tree", "tree-dark", "trunk", "tail", "tail-on", "glass", "tire", "shadow"] as const;
type Palette = Record<(typeof TOKENS)[number], string> & { primary: string; paints: string[] };
function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim() || "gray";
  const p = Object.fromEntries(TOKENS.map((t) => [t, v(`--road-${t}`)])) as Palette;
  p.primary = v("--primary");
  p.paints = Array.from({ length: PAINTS }, (_, i) => v(`--car-${i}`));
  return p;
}

/** Deterministic 0–1 noise for roadside scenery anchored to the road. */
const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2)); ctx.fill();
}

/** Rear view of a vehicle, base centre at (x, y), s = pixels per metre. */
function drawVehicle(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, s: number, paint: string, kind: TrafficCar["kind"], braking: boolean) {
  const w = (kind === "truck" ? 2.5 : kind === "suv" ? 1.95 : 1.8) * s;
  const h = (kind === "truck" ? 3.4 : kind === "suv" ? 1.7 : 1.4) * s;
  ctx.fillStyle = pal.shadow; ctx.globalAlpha = 0.45;
  ctx.beginPath(); ctx.ellipse(x, y, w * 0.62, s * 0.22, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  ctx.fillStyle = pal.tire;
  rr(ctx, x - w * 0.47, y - s * 0.55, w * 0.2, s * 0.55, s * 0.08); rr(ctx, x + w * 0.27, y - s * 0.55, w * 0.2, s * 0.55, s * 0.08);
  if (kind === "truck") {
    ctx.fillStyle = pal.rail; rr(ctx, x - w / 2, y - h, w, h * 0.86, s * 0.08);
    ctx.fillStyle = pal.pole; for (let i = 1; i < 4; i++) ctx.fillRect(x - w / 2 + (w * i) / 4, y - h, Math.max(1, s * 0.04), h * 0.86);
    ctx.fillStyle = pal.tire; ctx.fillRect(x - w / 2, y - h * 0.16, w, h * 0.05);
    ctx.fillStyle = braking ? pal["tail-on"] : pal.tail;
    ctx.fillRect(x - w / 2, y - h * 0.22, w * 0.1, h * 0.05); ctx.fillRect(x + w * 0.4, y - h * 0.22, w * 0.1, h * 0.05);
    return;
  }
  const bodyH = h * 0.55, cabinW = w * (kind === "suv" ? 0.86 : 0.74);
  ctx.fillStyle = paint;
  ctx.beginPath(); ctx.moveTo(x - cabinW / 2, y - bodyH); ctx.lineTo(x - cabinW * 0.42, y - h); ctx.lineTo(x + cabinW * 0.42, y - h); ctx.lineTo(x + cabinW / 2, y - bodyH); ctx.fill();
  rr(ctx, x - w / 2, y - bodyH - s * 0.05, w, bodyH - s * 0.12, s * 0.18);
  ctx.fillStyle = pal.glass;
  ctx.beginPath(); ctx.moveTo(x - cabinW * 0.44, y - bodyH - s * 0.04); ctx.lineTo(x - cabinW * 0.36, y - h + s * 0.08); ctx.lineTo(x + cabinW * 0.36, y - h + s * 0.08); ctx.lineTo(x + cabinW * 0.44, y - bodyH - s * 0.04); ctx.fill();
  ctx.fillStyle = pal.shadow; ctx.globalAlpha = 0.35; ctx.fillRect(x - w / 2, y - s * 0.32, w, s * 0.16); ctx.globalAlpha = 1;
  ctx.fillStyle = braking ? pal["tail-on"] : pal.tail;
  rr(ctx, x - w * 0.48, y - bodyH + s * 0.06, w * 0.24, s * 0.14, s * 0.04); rr(ctx, x + w * 0.24, y - bodyH + s * 0.06, w * 0.24, s * 0.14, s * 0.04);
  if (braking) { ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(x - w * 0.36, y - bodyH + s * 0.13, s * 0.4, 0, Math.PI * 2); ctx.arc(x + w * 0.36, y - bodyH + s * 0.13, s * 0.4, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
  ctx.fillStyle = pal.line; ctx.fillRect(x - s * 0.26, y - bodyH * 0.62, s * 0.52, s * 0.12);
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
        steer.current += (target - steer.current) * (target ? 0.1 : 0.15);
      }
      if (wheel.current) wheel.current.style.transform = `rotate(${steer.current * 180}deg)`;
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
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); start.current = e.clientX - steer.current * e.currentTarget.getBoundingClientRect().width * 0.6; }}
      onPointerMove={(e) => { if (start.current === null) return; const w = e.currentTarget.getBoundingClientRect().width; steer.current = Math.max(-1, Math.min(1, (e.clientX - start.current) / (w * 0.6))); }}
      onPointerUp={() => (start.current = null)} onPointerCancel={() => (start.current = null)}>
      <svg ref={wheel} viewBox="0 0 100 100" className="aspect-square w-full max-w-[120px] drop-shadow-lg sm:max-w-[150px]">
        <circle cx="50" cy="50" r="44" fill="none" className="stroke-muted" strokeWidth="10" />
        <circle cx="50" cy="50" r="44" fill="none" className="stroke-metal" strokeWidth="2" strokeDasharray="2 4" />
        <path d="M44 6 h12" className="stroke-primary" strokeWidth="9" />
        <path d="M8 54 Q30 44 38 52 M92 54 Q70 44 62 52 M44 64 L46 92 M56 64 L54 92" fill="none" className="stroke-metal" strokeWidth="7" strokeLinecap="round" />
        <rect x="34" y="42" width="32" height="24" rx="9" className="fill-muted stroke-metal" strokeWidth="2" />
        <circle cx="50" cy="54" r="4" className="fill-primary" />
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
    let x = 0, heading = 0, traffic: TrafficCar[] = [], hits = 0, cool = 0, raf = 0, last = performance.now(), shake = 0;
    const ids = { n: 1 };
    const startDist = sim.getDist();
    const resize = () => { const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); cv.width = r.width * d; cv.height = r.height * d; };
    resize(); const ro = new ResizeObserver(resize); ro.observe(cv);

    const hills = (W: number, base: number, amp: number, freq: number, off: number, color: string) => {
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, base);
      for (let px = 0; px <= W; px += W / 60) {
        const u = (px / W + off) * freq;
        ctx.lineTo(px, base - amp * (0.55 + 0.3 * Math.sin(u * 6.1) + 0.15 * Math.sin(u * 17.3 + 2)));
      }
      ctx.lineTo(W, base); ctx.fill();
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const s = sim.get();
      const pz = s.dist - startDist, v = Math.abs(s.speed);
      x = lateralStep(x, steer.current, s.speed, pz, dt);
      heading += curveAt(pz) * v * dt * 0.0012;
      sim.extraDrag = offRoadDrag(x, s.speed);
      traffic = updateTraffic(traffic, pz, dt, Math.random, ids);
      if (cool > 0) cool -= dt;
      for (const c of traffic) if (cool <= 0 && collides(x, pz, c)) { sim.crash(); hits++; crashes(hits); cool = 1.2; shake = 1; c.z += 14; }
      shake = Math.max(0, shake - dt * 2);

      const W = cv.width, H = cv.height, f = W * 0.85, camH = 1.25;
      const off = isOffRoad(x);
      const vib = (s.on ? 0.3 + s.rpm / 9000 : 0) + (off ? 2.5 * Math.min(1, v / 10) : 0) + shake * 8;
      const jy = (Math.random() - 0.5) * vib * (H / 300), jx = (Math.random() - 0.5) * shake * 6;
      const hor = H * 0.44 + jy;
      ctx.save(); ctx.translate(jx, 0);
      // sky, sun, hills (parallax with heading)
      const sky = ctx.createLinearGradient(0, 0, 0, hor); sky.addColorStop(0, pal.sky); sky.addColorStop(1, pal.horizon);
      ctx.fillStyle = sky; ctx.fillRect(-10, 0, W + 20, hor + 1);
      const sunX = ((0.72 - heading * 0.6) % 1.4 + 1.4) % 1.4 * W - W * 0.2, sunY = hor * 0.72;
      const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, W * 0.35); glow.addColorStop(0, pal.sun); glow.addColorStop(1, "transparent");
      ctx.globalAlpha = 0.55; ctx.fillStyle = glow; ctx.fillRect(0, 0, W, hor); ctx.globalAlpha = 1;
      ctx.fillStyle = pal.sun; ctx.beginPath(); ctx.arc(sunX, sunY, W * 0.022, 0, Math.PI * 2); ctx.fill();
      hills(W, hor + 1, H * 0.14, 1.3, heading * 0.4, pal["hill-far"]);
      hills(W, hor + 1, H * 0.07, 2.4, heading * 0.9 + 0.3, pal["hill-near"]);
      ctx.fillStyle = pal.grass; ctx.fillRect(-10, hor, W + 20, H - hor);

      const proj = (wx: number, z: number) => ({ x: W / 2 + (wx - x) * f / z, y: hor + camH * f / z, s: f / z });
      const seg = 3, far = 300, near = 1.6;
      // road far → near
      for (let z = far; z > near; z -= seg) {
        const z2 = Math.max(near, z - seg);
        const o1 = roadOffset(pz, z), o2 = roadOffset(pz, z2);
        const a = proj(o1, z), b = proj(o2, z2);
        const band = Math.floor((pz + z) / 9) % 2 === 0;
        ctx.fillStyle = band ? pal["grass-alt"] : pal.grass; ctx.fillRect(-10, a.y, W + 20, b.y - a.y + 1);
        const quad = (hw: number, c: string, o = 0) => {
          ctx.fillStyle = c; ctx.beginPath();
          ctx.moveTo(a.x + (o - hw) * a.s, a.y); ctx.lineTo(a.x + (o + hw) * a.s, a.y);
          ctx.lineTo(b.x + (o + hw) * b.s, b.y + 1); ctx.lineTo(b.x + (o - hw) * b.s, b.y + 1); ctx.fill();
        };
        quad(ROAD_HALF + 1.2, pal.asphalt);
        const rumble = Math.floor((pz + z) / 3) % 2 === 0;
        for (const side of [-1, 1]) quad(0.35, rumble ? pal.primary : pal.line, side * (ROAD_HALF + 0.4));
        quad(ROAD_HALF, band ? pal.asphalt : pal["asphalt-alt"]);
        for (const side of [-1, 1]) quad(0.08, pal.line, side * (ROAD_HALF - 0.2));
        const dash = (pz + z) % 12 < 4.5;
        if (dash) for (const l of [-LANE_W / 2, LANE_W / 2]) quad(0.07, pal.line, l);
        // guardrails
        for (const side of [-1, 1]) {
          const ex = side * (ROAD_HALF + 1.6);
          ctx.fillStyle = pal.rail; ctx.beginPath();
          ctx.moveTo(a.x + ex * a.s, a.y - 0.75 * a.s); ctx.lineTo(b.x + ex * b.s, b.y - 0.75 * b.s);
          ctx.lineTo(b.x + ex * b.s, b.y - 0.45 * b.s); ctx.lineTo(a.x + ex * a.s, a.y - 0.45 * a.s); ctx.fill();
        }
      }
      // fog near the horizon
      const fog = ctx.createLinearGradient(0, hor, 0, hor + H * 0.12); fog.addColorStop(0, pal.horizon); fog.addColorStop(1, "transparent");
      ctx.globalAlpha = 0.6; ctx.fillStyle = fog; ctx.fillRect(-10, hor, W + 20, H * 0.12); ctx.globalAlpha = 1;

      // sprites: posts, lamps, trees, traffic — far → near
      type Sprite = { dz: number; draw: () => void };
      const sprites: Sprite[] = [];
      const firstPost = Math.ceil((pz + near) / 4) * 4;
      for (let zz = firstPost; zz < pz + far * 0.6; zz += 4) {
        const dz = zz - pz;
        for (const side of [-1, 1]) sprites.push({ dz, draw: () => { const p = proj(side * (ROAD_HALF + 1.6) + roadOffset(pz, dz), dz); ctx.fillStyle = pal.pole; ctx.fillRect(p.x - p.s * 0.06, p.y - p.s * 0.75, p.s * 0.12, p.s * 0.75); } });
      }
      const firstLamp = Math.ceil((pz + near) / 40) * 40;
      for (let zz = firstLamp; zz < pz + far; zz += 40) {
        const dz = zz - pz, side = (zz / 40) % 2 === 0 ? -1 : 1;
        sprites.push({ dz, draw: () => {
          const p = proj(side * (ROAD_HALF + 2.4) + roadOffset(pz, dz), dz);
          ctx.fillStyle = pal.pole; ctx.fillRect(p.x - p.s * 0.1, p.y - p.s * 9, p.s * 0.2, p.s * 9);
          ctx.fillRect(Math.min(p.x, p.x - side * p.s * 2.2), p.y - p.s * 9, p.s * 2.2, p.s * 0.18);
          ctx.fillStyle = pal.sun; ctx.fillRect(p.x - side * p.s * 2.2 - p.s * 0.4, p.y - p.s * 8.9, p.s * 0.8, p.s * 0.18);
        } });
      }
      const firstTree = Math.ceil((pz + near) / 14) * 14;
      for (let zz = firstTree; zz < pz + far; zz += 14) {
        for (const side of [-1, 1]) {
          const r = hash(zz * side); if (r < 0.35) continue;
          const dz = zz - pz + r * 6, dist = ROAD_HALF + 6 + r * 14, size = 3 + r * 4;
          sprites.push({ dz, draw: () => {
            const p = proj(side * dist + roadOffset(pz, dz), dz);
            ctx.fillStyle = pal.trunk; ctx.fillRect(p.x - p.s * 0.2, p.y - p.s * size * 0.45, p.s * 0.4, p.s * size * 0.45);
            ctx.fillStyle = pal["tree-dark"]; ctx.beginPath(); ctx.arc(p.x, p.y - p.s * size * 0.75, p.s * size * 0.42, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = pal.tree; ctx.beginPath(); ctx.arc(p.x - p.s * size * 0.1, p.y - p.s * size * 0.85, p.s * size * 0.3, 0, Math.PI * 2); ctx.fill();
          } });
        }
      }
      for (const c of traffic) {
        const dz = c.z - pz; if (dz < 2 || dz > far) continue;
        const ahead = traffic.some((o) => o !== c && o.lane === c.lane && o.z > c.z && o.z - c.z < 25);
        sprites.push({ dz, draw: () => { const p = proj(c.lane * LANE_W + roadOffset(pz, dz), dz); drawVehicle(ctx, pal, p.x, p.y, p.s, pal.paints[c.paint]!, c.kind, ahead); } });
      }
      sprites.sort((p, q) => q.dz - p.dz).forEach((sp) => sp.draw());
      ctx.restore();

      // player car (rear view, chase camera), leans with steering
      const ps = W * 0.105, cx = W / 2, cy = H * 0.985;
      ctx.save(); ctx.translate(cx + jx, cy + jy * 0.5); ctx.rotate(steer.current * 0.035 * Math.min(1, v / 15));
      drawVehicle(ctx, pal, 0, 0, ps, pal.primary, "car", sim.brakeIn > 0.05);
      if (s.nosOn || s.cut) { ctx.fillStyle = s.nosOn ? pal.sun : pal["tail-on"]; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.ellipse(-ps * 0.55, -ps * 0.22, ps * 0.22, ps * 0.09, 0, 0, Math.PI * 2); ctx.ellipse(ps * 0.55, -ps * 0.22, ps * 0.22, ps * 0.09, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
      ctx.restore();
      // speed vignette
      if (v > 25) { const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, W * 0.75); vg.addColorStop(0, "transparent"); vg.addColorStop(1, pal.shadow); ctx.globalAlpha = Math.min(0.5, (v - 25) / 60); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }

      // HUD
      const spd = v * MS_TO[units];
      ctx.fillStyle = pal.shadow; ctx.globalAlpha = 0.55; rr(ctx, 8, 8, W * 0.3, H * 0.22, 8); ctx.globalAlpha = 1;
      ctx.fillStyle = pal.line; ctx.font = `bold ${Math.round(Math.max(18, H * 0.11))}px "Share Tech Mono", monospace`;
      ctx.fillText(`${spd.toFixed(0)}`, 16, 8 + H * 0.11);
      ctx.font = `${Math.round(Math.max(11, H * 0.05))}px "Share Tech Mono", monospace`;
      ctx.fillText(`${units === "metric" ? "KM/H" : "MPH"} · G ${s.gear === -1 ? "R" : s.gear === 0 ? "N" : s.gear} · ${(s.rpm / 1000).toFixed(1)}k`, 16, 8 + H * 0.18);
      if (shiftRpm > 0 && s.on && s.rpm >= shiftRpm) { ctx.fillStyle = pal.primary; ctx.fillText("● SHIFT", 16, 8 + H * 0.26); }
      ctx.textAlign = "center";
      if (off) { ctx.fillStyle = pal.primary; ctx.fillText("OFF ROAD", W / 2, H * 0.08); }
      ctx.textAlign = "right"; ctx.fillStyle = pal.line;
      const km = pz / 1000 * (units === "metric" ? 1 : 0.621);
      ctx.fillText(`TRIP ${km.toFixed(2)} ${units === "metric" ? "km" : "mi"}`, W - 12, 8 + H * 0.06); ctx.textAlign = "left";
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); sim.extraDrag = 0; sim.brakeIn = 0; };
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
        <div className="h-[28vh] min-h-36 w-full landscape:h-[55vh]"><Road key={run} steer={steer} crashes={setHits} shiftRpm={tuning.shiftLight ? tuning.shiftRpm : 0} /></div>
      </div>
      <div className="space-y-2">
        <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] items-center gap-2">
          <div className="flex flex-col items-center gap-1.5">
            <SteeringWheel steer={steer} />
            <button onClick={() => sim.startStop()}
              className={cn("font-display flex items-center gap-1 rounded-full border-2 px-3 py-1 text-[10px] font-bold tracking-widest uppercase",
                s.on || s.starting ? "border-primary bg-primary/20 text-primary glow" : "border-metal metal text-foreground")}>
              <Power className="h-3.5 w-3.5" />{s.starting ? "..." : s.on ? "Stop" : "Start"}
            </button>
          </div>
          <Shifter gear={s.gear} gears={settings.gears} onShift={(g) => sim.shift(g)} />
        </div>
        <div className="grid grid-cols-[1fr_1fr_1.3fr] items-stretch gap-2">
          <Pedal label="Clutch" variant="clutch" className="h-20 sm:h-28" onChange={(v) => { sim.ensureAudio(); sim.clutchIn = v; }} />
          <Pedal label="Brake" variant="brake" className="h-20 sm:h-28" onChange={(v) => { sim.ensureAudio(); sim.brakeIn = v; }} />
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
        <p className="hidden text-center text-xs text-muted-foreground md:block">Keys: S start · Space gas · ↓/B brake · C clutch · ←/→ or A/D steer · 1-9 / N / R gears</p>
      </div>
    </div>
  );
}

export { CAR_W };
