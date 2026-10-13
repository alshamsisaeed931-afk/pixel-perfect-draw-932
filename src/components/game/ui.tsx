import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Panel({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <section className={cn("metal rounded-xl p-3", className)}>
      {title && <h3 className="font-display mb-2 text-xs tracking-[0.2em] text-muted-foreground uppercase">{title}</h3>}
      {children}
    </section>
  );
}

export function Stat({ label, value, unit, alert }: { label: string; value: string; unit?: string; alert?: boolean }) {
  return (
    <div className="carbon min-w-0 rounded-lg border px-2 py-1.5 text-center">
      <div className="truncate text-[10px] tracking-widest text-muted-foreground uppercase">{label}</div>
      <div className={cn("font-mono text-lg leading-tight", alert ? "text-primary text-glow" : "text-foreground")}>
        {value}<span className="ml-0.5 text-[10px] text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}

export function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-1 rounded-lg bg-background/60 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}>
      {options.map((o) => (
        <button key={String(o.v)} onClick={() => onChange(o.v)}
          className={cn("font-display rounded-md px-1 py-2 text-xs uppercase transition-colors",
            value === o.v ? "bg-primary text-primary-foreground glow" : "text-muted-foreground hover:bg-accent")}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

const ang = (v: number) => (135 + 270 * v) * (Math.PI / 180);
const pt = (r: number, v: number) => [100 + r * Math.cos(ang(v)), 100 + r * Math.sin(ang(v))] as const;
function arc(r: number, a: number, b: number) {
  const [x1, y1] = pt(r, a), [x2, y2] = pt(r, b);
  return `M ${x1} ${y1} A ${r} ${r} 0 ${(b - a) * 270 > 180 ? 1 : 0} 1 ${x2} ${y2}`;
}

export function Tach({ rpm, max, redline, gear, cut, glow = true, sub }: { rpm: number; max: number; redline: number; gear: number; cut: boolean; glow?: boolean; sub?: string }) {
  const v = Math.min(1.02, rpm / max);
  const step = max > 10000 ? 2000 : 1000;
  const ticks = [];
  for (let r = 0; r <= max; r += step / 2) {
    const major = r % step === 0, [x1, y1] = pt(major ? 70 : 76, r / max), [x2, y2] = pt(84, r / max);
    ticks.push(<line key={r} x1={x1} y1={y1} x2={x2} y2={y2} className={r >= redline ? "stroke-primary" : "stroke-foreground"} strokeWidth={major ? 2.4 : 1} />);
    if (major) { const [tx, ty] = pt(58, r / max); ticks.push(<text key={"t" + r} x={tx} y={ty + 4} textAnchor="middle" className="fill-muted-foreground font-display" fontSize="10">{r / 1000}</text>); }
  }
  const [nx, ny] = pt(80, v);
  const inRed = rpm >= redline * 0.97;
  const g = gear === -1 ? "R" : gear === 0 ? "N" : String(gear);
  return (
    <svg viewBox="0 0 200 200" className="h-full w-full">
      <defs>
        <radialGradient id="face"><stop offset="0%" stopColor="var(--color-card)" /><stop offset="100%" stopColor="var(--color-background)" /></radialGradient>
        <filter id="gl"><feGaussianBlur stdDeviation="2.5" /><feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <circle cx="100" cy="100" r="97" fill="url(#face)" className="stroke-metal" strokeWidth="3" />
      <path d={arc(86, 0, 1)} fill="none" className="stroke-border" strokeWidth="5" />
      <path d={arc(86, redline / max, 1)} fill="none" className="stroke-primary" strokeWidth="5" />
      <path d={arc(91, 0, Math.max(0.001, v))} fill="none" className={inRed ? "stroke-primary" : "stroke-warn"} strokeWidth="3" filter={glow ? "url(#gl)" : undefined} />
      {ticks}
      <text x="100" y="72" textAnchor="middle" className="fill-muted-foreground font-display" fontSize="7" letterSpacing="2">RPM x1000</text>
      <text x="100" y="128" textAnchor="middle" className={cut || inRed ? "fill-primary font-mono" : "fill-foreground font-mono"} fontSize="22">{Math.round(rpm)}</text>
      <text x="100" y="108" textAnchor="middle" className="fill-foreground font-display" fontSize="26" fontWeight="700">{g}</text>
      {sub && <text x="100" y="146" textAnchor="middle" className="fill-muted-foreground font-display" fontSize="9">{sub}</text>}
      <line x1="100" y1="100" x2={nx} y2={ny} className="stroke-primary" strokeWidth="3" strokeLinecap="round" filter={glow ? "url(#gl)" : undefined} />
      <circle cx="100" cy="100" r="7" className="fill-metal stroke-background" strokeWidth="2" />
      <circle cx="100" cy="176" r="4" className={cut ? "fill-primary" : "fill-muted"} filter={glow && cut ? "url(#gl)" : undefined} />
    </svg>
  );
}

export function Pedal({ label, onChange, variant = "gas", className }: { label: string; onChange: (v: number) => void; variant?: "gas" | "clutch"; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const val = (y: number) => { const r = ref.current!.getBoundingClientRect(); return Math.min(1, Math.max(0.3, 1 - (y - r.top) / r.height + 0.15)); };
  const fill = useRef<HTMLDivElement>(null);
  const set = (v: number) => { onChange(v); if (fill.current) fill.current.style.height = `${v * 100}%`; };
  return (
    <div ref={ref}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); set(variant === "clutch" ? 1 : val(e.clientY)); }}
      onPointerMove={(e) => { if (e.buttons && variant === "gas") set(val(e.clientY)); }}
      onPointerUp={() => set(0)} onPointerCancel={() => set(0)} onContextMenu={(e) => e.preventDefault()}
      className={cn("no-select carbon relative flex cursor-pointer items-end justify-center overflow-hidden rounded-2xl border-2 active:scale-[0.98]",
        variant === "gas" ? "border-primary/70" : "border-metal", className)}>
      <div ref={fill} className={cn("absolute inset-x-0 bottom-0 transition-[height] duration-75", variant === "gas" ? "bg-primary/40" : "bg-metal/40")} style={{ height: 0 }} />
      <div className="absolute inset-2 rounded-xl border border-dashed border-border/60" />
      <span className="font-display relative mb-3 text-sm font-bold tracking-[0.25em] uppercase">{label}</span>
    </div>
  );
}

export function LineChart({ series, xMax, yMax, xLabel, height = 160 }: { series: { pts: [number, number][]; cls: string; label: string; yMax?: number }[]; xMax: number; yMax: number; xLabel?: string; height?: number }) {
  const W = 300, H = 150;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ height }} className="w-full" preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} className="stroke-border" strokeWidth="0.5" />)}
        {[0.25, 0.5, 0.75].map((f) => <line key={"v" + f} y1="0" y2={H} x1={W * f} x2={W * f} className="stroke-border" strokeWidth="0.5" />)}
        {series.map((s, i) => s.pts.length > 1 && (
          <polyline key={i} fill="none" className={s.cls} strokeWidth="2" vectorEffect="non-scaling-stroke"
            points={s.pts.map(([x, y]) => `${(x / xMax) * W},${H - (y / (s.yMax ?? yMax)) * H}`).join(" ")} />
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        {series.map((s, i) => <span key={i} className="flex items-center gap-1"><svg width="14" height="4"><line x1="0" x2="14" y1="2" y2="2" className={s.cls} strokeWidth="3" /></svg>{s.label}</span>)}
        {xLabel && <span className="ml-auto">{xLabel}</span>}
      </div>
    </div>
  );
}
