import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const positions = [
  { gear: 1, x: 20, y: 22 }, { gear: 2, x: 20, y: 78 },
  { gear: 3, x: 40, y: 22 }, { gear: 4, x: 40, y: 78 },
  { gear: 5, x: 60, y: 22 }, { gear: 6, x: 60, y: 78 },
  { gear: -1, x: 80, y: 78 }, { gear: 0, x: 40, y: 50 },
];
const label = (gear: number) => gear === -1 ? "R" : gear === 0 ? "N" : String(gear);

export function Shifter({ gear, onShift }: { gear: number; onShift: (gear: number) => void }) {
  const plate = useRef<HTMLDivElement>(null);
  const drag = useRef<{ lane: number; neutral: boolean } | null>(null);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const selected = positions.find((p) => p.gear === gear) ?? positions[7];
  if (!selected) return null;
  const displayed = point ?? selected;
  const move = (ev: PointerEvent<HTMLButtonElement>) => {
    const rect = plate.current?.getBoundingClientRect();
    const state = drag.current;
    if (!rect || !state) return;
    const x = Math.max(20, Math.min(80, (ev.clientX - rect.left) / rect.width * 100));
    const y = Math.max(22, Math.min(78, (ev.clientY - rect.top) / rect.height * 100));
    if (Math.abs(y - 50) < 12) {
      if (!state.neutral) onShift(0);
      state.neutral = true;
      state.lane = Math.round((x - 20) / 20) * 20 + 20;
      setPoint({ x, y: 50 });
    } else {
      const gate = positions.find((p) => p.x === state.lane && p.y === (y < 50 ? 22 : 78));
      if (state.neutral && gate && Math.abs(y - 50) > 20) {
        onShift(gate.gear);
        state.neutral = false;
      }
      setPoint({ x: state.lane, y: state.lane === 80 && y < 50 ? 50 : y });
    }
  };
  const release = () => { drag.current = null; setPoint(null); };
  return (
    <div className="shifter-console">
      <div className="flex items-center justify-between px-4 pt-3">
        <span className="font-display text-xs text-muted-foreground uppercase">6-speed manual</span>
        <span aria-live="polite" className="font-mono text-sm text-primary">{label(gear)}</span>
      </div>
      <div ref={plate} className="shifter-plate" role="group" aria-label="Manual gear selector">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full">
          <path d="M20 22V78 M40 22V78 M60 22V78 M20 50H80V78" className="stroke-background" fill="none" strokeWidth="5" strokeLinecap="round" />
          <path d="M20 22V78 M40 22V78 M60 22V78 M20 50H80V78" className="stroke-metal" fill="none" strokeWidth="0.5" strokeLinecap="round" />
        </svg>
        {positions.map((p) => (
          <Button key={p.gear} variant="ghost" aria-label={`Select ${p.gear === 0 ? "neutral" : p.gear === -1 ? "reverse" : `gear ${p.gear}`}`} aria-pressed={gear === p.gear}
            onClick={() => onShift(p.gear)}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            className={cn("shifter-gate absolute h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full p-0 font-mono text-lg", gear === p.gear ? "text-primary" : "text-foreground")}>
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
          className={cn("shifter-knob no-select absolute z-10 h-14 w-14 rounded-full p-0", point && "shifter-dragging")}>
          <svg viewBox="0 0 40 40" aria-hidden="true" className="!h-8 !w-8">
            <path d="M10 9V31 M20 9V31 M30 9V31 M10 20H30" fill="none" className="stroke-foreground" strokeWidth="1.4" />
          </svg>
        </Button>
      </div>
    </div>
  );
}