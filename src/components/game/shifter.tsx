import { useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Pos = { gear: number; x: number; y: number };
const label = (gear: number) => gear === -1 ? "R" : gear === 0 ? "N" : String(gear);

/** H-pattern layout for 6–10 forward gears: odd gears top, even bottom, reverse in its own lane. */
function layout(gears: number) {
  const cols = Math.ceil(gears / 2), lanes = cols + 1;
  const xs = Array.from({ length: lanes }, (_, i) => 12 + (i * 76) / (lanes - 1));
  const pos: Pos[] = [];
  for (let g = 1; g <= gears; g++) pos.push({ gear: g, x: xs[Math.floor((g - 1) / 2)]!, y: g % 2 ? 22 : 78 });
  pos.push({ gear: -1, x: xs[lanes - 1]!, y: 78 });
  const nx = xs[Math.floor((lanes - 1) / 2)]!;
  pos.push({ gear: 0, x: nx, y: 50 });
  const path = xs.slice(0, cols).map((x) => `M${x} 22V78`).join(" ") + ` M${xs[0]} 50H${xs[lanes - 1]}V78`;
  return { pos, xs, path };
}

export function Shifter({ gear, gears = 6, onShift }: { gear: number; gears?: number; onShift: (gear: number) => void }) {
  const plate = useRef<HTMLDivElement>(null);
  const drag = useRef<{ lane: number; neutral: boolean } | null>(null);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const { pos, xs, path } = useMemo(() => layout(gears), [gears]);
  const neutral = pos[pos.length - 1]!;
  const selected = pos.find((p) => p.gear === gear) ?? neutral;
  const displayed = point ?? selected;
  const lastLane = xs[xs.length - 1]!;
  const small = gears > 6;
  const move = (ev: PointerEvent<HTMLButtonElement>) => {
    const rect = plate.current?.getBoundingClientRect();
    const state = drag.current;
    if (!rect || !state) return;
    const x = Math.max(xs[0]!, Math.min(lastLane, (ev.clientX - rect.left) / rect.width * 100));
    const y = Math.max(22, Math.min(78, (ev.clientY - rect.top) / rect.height * 100));
    if (Math.abs(y - 50) < 12) {
      if (!state.neutral) onShift(0);
      state.neutral = true;
      state.lane = xs.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a), xs[0]!);
      setPoint({ x, y: 50 });
    } else {
      const gate = pos.find((p) => p.gear !== 0 && p.x === state.lane && p.y === (y < 50 ? 22 : 78));
      if (state.neutral && gate && Math.abs(y - 50) > 20) {
        onShift(gate.gear);
        state.neutral = false;
      }
      const blocked = !pos.some((p) => p.gear !== 0 && p.x === state.lane && p.y === (y < 50 ? 22 : 78));
      setPoint({ x: state.lane, y: blocked ? 50 : y });
    }
  };
  const release = () => { drag.current = null; setPoint(null); };
  return (
    <div className="shifter-console">
      <div className="flex items-center justify-between px-4 pt-3">
        <span className="font-display text-xs text-muted-foreground uppercase">{gears}-speed manual</span>
        <span aria-live="polite" className="font-mono text-sm text-primary">{label(gear)}</span>
      </div>
      <div ref={plate} className="shifter-plate" role="group" aria-label="Manual gear selector">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full">
          <path d={path} className="stroke-background" fill="none" strokeWidth="5" strokeLinecap="round" />
          <path d={path} className="stroke-metal" fill="none" strokeWidth="0.5" strokeLinecap="round" />
        </svg>
        {pos.map((p) => (
          <Button key={p.gear} variant="ghost" aria-label={`Select ${p.gear === 0 ? "neutral" : p.gear === -1 ? "reverse" : `gear ${p.gear}`}`} aria-pressed={gear === p.gear}
            onClick={() => onShift(p.gear)}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            className={cn("shifter-gate absolute -translate-x-1/2 -translate-y-1/2 rounded-full p-0 font-mono", small ? "h-7 w-7 text-xs sm:h-9 sm:w-9 sm:text-base" : "h-8 w-8 text-sm sm:h-11 sm:w-11 sm:text-lg", gear === p.gear ? "text-primary" : "text-foreground")}>
            <span className={p.y < 50 ? "shifter-label-top" : p.y > 50 ? "shifter-label-bottom" : ""}>{label(p.gear)}</span>
          </Button>
        ))}
        <Button variant="ghost" aria-label={`Gear lever, ${label(gear)}`} title="Gear lever" onPointerDown={(ev) => {
          ev.preventDefault(); ev.currentTarget.setPointerCapture(ev.pointerId);
          drag.current = { lane: selected.x, neutral: gear === 0 };
          setPoint({ x: selected.x, y: selected.y });
        }} onPointerMove={move} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
          onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onShift(0); } }}
          style={{ "--lever-x": `${displayed.x}%`, "--lever-y": `${displayed.y}%` } as CSSProperties}
          className={cn("shifter-knob no-select absolute z-10 rounded-full p-0", small ? "h-10 w-10 sm:h-12 sm:w-12" : "h-11 w-11 sm:h-14 sm:w-14", point && "shifter-dragging")}>
          <svg viewBox="0 0 40 40" aria-hidden="true" className="!h-6 !w-6 sm:!h-8 sm:!w-8">
            <path d="M10 9V31 M20 9V31 M30 9V31 M10 20H30" fill="none" className="stroke-foreground" strokeWidth="1.4" />
          </svg>
        </Button>
      </div>
    </div>
  );
}
