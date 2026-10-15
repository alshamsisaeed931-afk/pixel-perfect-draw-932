import { useEffect, useMemo, useRef, useState } from "react";
import { Star, Volume2, Power, Trash2, Play, Flag, Gauge, Check } from "lucide-react";
import { ENGINES, defaultTuning, engineById, hpFrom, steadyBoost, torqueAt, type Engine, type Tuning } from "@/lib/engines";
import { GEAR_RATIOS, MS_TO, sim } from "@/lib/sim";
import { useGame, useSim } from "@/lib/store";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { LineChart, Panel, Pedal, Seg, Stat, Tach } from "./ui";

export const tachMax = (e: Engine) => (e.redline > 10000 ? 20000 : 10000);
export function curve(e: Engine, t: Tuning) {
  const pts: { rpm: number; hp: number; tq: number }[] = [];
  for (let r = e.idle; r <= t.limiter; r += e.redline / 50) { const tq = torqueAt(e, t, r, steadyBoost(e, t, r)); pts.push({ rpm: r, tq, hp: hpFrom(tq, r) }); }
  return pts;
}
export const peak = (e: Engine, t: Tuning) => { const c = curve(e, t); return { hp: Math.max(...c.map((p) => p.hp)), tq: Math.max(...c.map((p) => p.tq)) }; };

function useKeys() {
  useEffect(() => {
    const down = (ev: KeyboardEvent) => {
      if ((ev.target as HTMLElement)?.tagName === "INPUT") return;
      if (ev.code === "Space" || ev.code === "ArrowUp" || ev.code === "KeyW") { sim.ensureAudio(); sim.throttleIn = 1; ev.preventDefault(); }
      if (ev.code === "ShiftLeft" || ev.code === "KeyC") sim.clutchIn = 1;
      if (ev.code === "KeyS" && !ev.repeat) sim.startStop();
      const map: Record<string, number> = { Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4, Digit5: 5, Digit6: 6, KeyN: 0, KeyR: -1, Digit0: 0 };
      if (ev.code in map && !ev.repeat) sim.shift(map[ev.code]!);
    };
    const up = (ev: KeyboardEvent) => {
      if (ev.code === "Space" || ev.code === "ArrowUp" || ev.code === "KeyW") sim.throttleIn = 0;
      if (ev.code === "ShiftLeft" || ev.code === "KeyC") sim.clutchIn = 0;
    };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); sim.throttleIn = 0; sim.clutchIn = 0; };
  }, []);
}

function Cockpit({ children }: { children?: React.ReactNode }) {
  useKeys();
  const s = useSim();
  const { engineId, tuning, settings } = useGame();
  const e = engineById(engineId);
  const spd = Math.abs(s.speed) * MS_TO[settings.units];
  const temp = settings.units === "metric" ? s.temp : s.temp * 1.8 + 32;
  const gears: (number)[] = [1, 3, 5, -1, 2, 4, 6, 0];
  return (
    <div className="grid gap-3 landscape:grid-cols-2">
      <div className="space-y-3">
        {children}
        <div className="metal relative mx-auto aspect-square w-full max-w-[340px] rounded-full p-1">
          <Tach rpm={s.rpm} max={tachMax(e)} redline={tuning.limiter} gear={s.gear} cut={s.cut} glow={settings.graphics === "high"} sub={e.layout} />
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          <Stat label="Speed" value={spd.toFixed(0)} unit={settings.units === "metric" ? "km/h" : "mph"} />
          <Stat label="Temp" value={temp.toFixed(0)} unit={settings.units === "metric" ? "°C" : "°F"} alert={s.temp > 105} />
          <Stat label="Boost" value={s.boost.toFixed(1)} unit="psi" />
          <Stat label="Power" value={s.hp.toFixed(0)} unit="hp" />
        </div>
      </div>
      <div className="space-y-3">
        <div className="grid grid-cols-4 gap-1.5">
          {gears.map((g) => (
            <button key={g} onClick={() => sim.shift(g)}
              className={cn("font-display h-12 rounded-lg border text-lg font-bold transition-all",
                s.gear === g ? "bg-primary text-primary-foreground glow border-primary" : "metal text-foreground active:scale-95")}>
              {g === -1 ? "R" : g === 0 ? "N" : g}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-[1fr_auto_1.4fr] items-stretch gap-3">
          <Pedal label="Clutch" variant="clutch" className="h-44" onChange={(v) => { sim.ensureAudio(); sim.clutchIn = v; }} />
          <button onClick={() => sim.startStop()}
            className={cn("font-display flex h-20 w-20 flex-col items-center justify-center self-center rounded-full border-4 text-[10px] font-bold tracking-widest uppercase",
              s.on || s.starting ? "border-primary bg-primary/20 text-primary glow" : "border-metal metal text-foreground")}>
            <Power className="mb-0.5 h-6 w-6" />{s.starting ? "..." : s.on ? "Stop" : "Start"}
          </button>
          <Pedal label="Gas" className="h-44" onChange={(v) => { sim.ensureAudio(); sim.throttleIn = v; }} />
        </div>
        <Msg />
        <p className="hidden text-center text-xs text-muted-foreground md:block">Keys: S start · Space gas · C clutch · 1-6 / N / R gears</p>
      </div>
    </div>
  );
}

function Msg() {
  const s = useSim();
  const [show, setShow] = useState("");
  useEffect(() => { if (!s.msgId) return; setShow(s.message); const t = setTimeout(() => setShow(""), 1800); return () => clearTimeout(t); }, [s.msgId]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="font-display h-6 text-center text-sm tracking-widest text-primary text-glow">{show}</div>;
}

export function DriveScreen() {
  const { engineId } = useGame();
  return <Cockpit><Header e={engineById(engineId)} mode="Free Rev" /></Cockpit>;
}

function Header({ e, mode }: { e: Engine; mode: string }) {
  return (
    <div className="flex min-w-0 items-end justify-between gap-2">
      <div className="min-w-0">
        <div className="text-[10px] tracking-[0.3em] text-primary uppercase">{mode}</div>
        <h2 className="font-display truncate text-xl font-bold">{e.name}</h2>
      </div>
      <span className="shrink-0 rounded border border-primary/50 px-2 py-0.5 font-mono text-xs text-primary">{e.layout}</span>
    </div>
  );
}

export function GarageScreen({ onDrive }: { onDrive: () => void }) {
  const g = useGame();
  const [cat, setCat] = useState("All");
  const [name, setName] = useState("");
  const cats = ["All", "★", ...Array.from(new Set(ENGINES.map((e) => e.cat)))];
  const list = ENGINES.filter((e) => cat === "All" || (cat === "★" ? g.favorites.includes(e.id) : e.cat === cat));
  return (
    <div className="space-y-4">
      <div><div className="text-[10px] tracking-[0.3em] text-primary uppercase">Garage</div><h2 className="font-display text-2xl font-bold">{ENGINES.length} Engines</h2></div>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
        {cats.map((c) => (
          <button key={c} onClick={() => setCat(c)} className={cn("font-display shrink-0 rounded-full border px-3 py-1.5 text-xs uppercase", cat === c ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground")}>{c}</button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((e) => {
          const p = peak(e, defaultTuning(e)); const sel = g.engineId === e.id; const fav = g.favorites.includes(e.id);
          return (
            <div key={e.id} className={cn("metal relative overflow-hidden rounded-xl p-3", sel && "border-primary glow")}>
              <div className="carbon absolute inset-y-0 right-0 w-20 opacity-60" />
              <div className="relative flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[10px] tracking-widest text-muted-foreground uppercase">{e.cat} · {e.induction === "na" ? "NA" : e.induction === "super" ? "Supercharged" : e.induction === "twin" ? "Twin Turbo" : "Turbo"}</span>
                  <h3 className="font-display truncate text-base font-bold">{e.name}</h3>
                  <p className="text-sm text-muted-foreground">{e.desc}</p>
                </div>
                <button aria-label="Favorite" onClick={() => g.toggleFav(e.id)} className="shrink-0 p-1"><Star className={cn("h-5 w-5", fav ? "fill-warn text-warn" : "text-muted-foreground")} /></button>
              </div>
              <div className="relative mt-2 flex gap-3 font-mono text-xs">
                <span>{p.hp.toFixed(0)} HP</span><span>{p.tq.toFixed(0)} NM</span><span>{e.redline} RPM</span>
              </div>
              <div className="relative mt-3 grid grid-cols-2 gap-2">
                <button onClick={() => sim.preview(e, sel ? g.tuning : defaultTuning(e))} className="flex items-center justify-center gap-1 rounded-lg border py-2 text-sm"><Volume2 className="h-4 w-4" />Preview</button>
                <button onClick={() => { g.selectEngine(e.id); onDrive(); }} className={cn("font-display rounded-lg py-2 text-sm font-bold uppercase", sel ? "bg-primary/20 text-primary" : "bg-primary text-primary-foreground")}>
                  {sel ? "Selected" : "Select"}
                </button>
              </div>
            </div>
          );
        })}
        {list.length === 0 && <p className="text-muted-foreground">No favorites yet — tap the star on an engine.</p>}
      </div>
      <Panel title="Saved configurations">
        <form className="flex gap-2" onSubmit={(ev) => { ev.preventDefault(); if (name.trim()) { g.saveConfig(name.trim()); setName(""); } }}>
          <input value={name} onChange={(ev) => setName(ev.target.value)} placeholder={`Name this ${engineById(g.engineId).layout} setup`}
            className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm" />
          <button className="font-display rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground uppercase">Save</button>
        </form>
        <ul className="mt-3 space-y-2">
          {g.configs.map((c) => (
            <li key={c.id} className="flex items-center gap-2 rounded-lg border bg-background/40 p-2">
              <div className="min-w-0 flex-1"><div className="truncate font-bold">{c.name}</div><div className="truncate text-xs text-muted-foreground">{engineById(c.engineId).name} · {c.tuning.exhaust} · {c.tuning.induction === "na" ? "NA" : c.tuning.boost + " psi"}</div></div>
              <button onClick={() => g.loadConfig(c)} className="rounded-md border px-3 py-1.5 text-xs uppercase">Load</button>
              <button aria-label="Delete" onClick={() => g.deleteConfig(c.id)} className="p-1.5 text-muted-foreground"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
          {g.configs.length === 0 && <li className="text-sm text-muted-foreground">No saved setups yet.</li>}
        </ul>
      </Panel>
    </div>
  );
}

function Row({ label, value, children }: { label: string; value?: string; children: React.ReactNode }) {
  return <div className="space-y-2"><div className="flex justify-between text-sm"><span className="text-muted-foreground">{label}</span><span className="font-mono">{value}</span></div>{children}</div>;
}

export function TuneScreen() {
  const { tuning: t, setTuning, engineId } = useGame();
  const e = engineById(engineId);
  const s = useSim();
  const p = useMemo(() => peak(e, t), [e, t]);
  const forced = t.induction !== "na";
  return (
    <div className="space-y-3">
      <Header e={e} mode="Tuning" />
      <div className="grid grid-cols-4 gap-1.5">
        <Stat label="Peak" value={p.hp.toFixed(0)} unit="hp" /><Stat label="Torque" value={p.tq.toFixed(0)} unit="nm" />
        <Stat label="RPM" value={s.rpm.toFixed(0)} alert={s.cut} /><Stat label="Boost" value={s.boost.toFixed(1)} unit="psi" />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Panel title="Induction">
          <div className="space-y-4">
            <Seg value={t.induction} onChange={(v) => setTuning({ induction: v })} options={[{ v: "na", l: "NA" }, { v: "turbo", l: "Turbo" }, { v: "twin", l: "Twin" }, { v: "super", l: "S/C" }]} />
            <Row label="Boost pressure" value={forced ? `${t.boost} psi` : "—"}>
              <Slider disabled={!forced} min={2} max={40} step={1} value={[t.boost]} onValueChange={([v]) => setTuning({ boost: v ?? 0 })} />
            </Row>
            <Row label="Wastegate / blow-off sound"><Seg value={t.wastegate} onChange={(v) => setTuning({ wastegate: v })} options={[{ v: "bov", l: "BOV" }, { v: "flutter", l: "Flutter" }, { v: "off", l: "Off" }]} /></Row>
          </div>
        </Panel>
        <Panel title="Exhaust">
          <div className="space-y-4">
            <Seg value={t.exhaust} onChange={(v) => setTuning({ exhaust: v })} options={[{ v: "stock", l: "Stock" }, { v: "sport", l: "Sport" }, { v: "straight", l: "Straight" }, { v: "race", l: "Race" }]} />
            <Row label="Muffler" value={`${Math.round(t.muffler * 100)}%`}><Slider min={0} max={1} step={0.05} value={[t.muffler]} onValueChange={([v]) => setTuning({ muffler: v ?? 0 })} /></Row>
            <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Pops & bangs</span><Switch checked={t.pops} onCheckedChange={(v) => setTuning({ pops: v })} /></div>
          </div>
        </Panel>
        <Panel title="Engine management">
          <div className="space-y-4">
            <Row label="Idle speed" value={`${e.idle + t.idleOffset} rpm`}><Slider min={-300} max={600} step={25} value={[t.idleOffset]} onValueChange={([v]) => setTuning({ idleOffset: v ?? 0 })} /></Row>
            <Row label="Rev limiter" value={`${t.limiter} rpm`}><Slider min={Math.round(e.redline * 0.6)} max={Math.min(tachMax(e), Math.round(e.redline * 1.1))} step={100} value={[t.limiter]} onValueChange={([v]) => setTuning({ limiter: v ?? 0 })} /></Row>
            <Seg value={t.limiterType} onChange={(v) => setTuning({ limiterType: v })} options={[{ v: "hard", l: "Hard cut" }, { v: "soft", l: "Soft cut" }]} />
          </div>
        </Panel>
        <Panel title="Test it">
          <div className="grid grid-cols-[auto_1fr] gap-3">
            <button onClick={() => sim.startStop()} className={cn("font-display h-24 w-20 rounded-xl border-2 text-xs font-bold uppercase", s.on ? "border-primary text-primary" : "border-metal")}>
              <Power className="mx-auto mb-1 h-5 w-5" />{s.on ? "Stop" : "Start"}
            </button>
            <Pedal label="Hold to rev" className="h-24" onChange={(v) => { sim.ensureAudio(); sim.throttleIn = v; }} />
          </div>
          <button onClick={() => setTuning(defaultTuning(e))} className="mt-3 w-full rounded-lg border py-2 text-sm text-muted-foreground">Reset to factory</button>
        </Panel>
      </div>
    </div>
  );
}

export function DynoScreen() {
  const s = useSim();
  const { engineId, tuning } = useGame();
  const e = engineById(engineId);
  const [run, setRun] = useState<typeof sim.dynoResult>([]);
  useEffect(() => { if (s.dynoId) setRun([...sim.dynoResult]); }, [s.dynoId]);
  const live = s.dyno ? sim.dynoResult : run;
  const hist = sim.history;
  const t0 = hist[0]?.t ?? 0;
  const pk = live.length ? { hp: Math.max(...live.map((p) => p.hp)), tq: Math.max(...live.map((p) => p.tq)), b: Math.max(...live.map((p) => p.boost)) } : null;
  const pa = peak(e, tuning);
  const yMax = Math.max(pa.hp, pa.tq) * 1.25;
  return (
    <div className="space-y-3">
      <Header e={e} mode="Dyno Test" />
      <div className="grid grid-cols-4 gap-1.5">
        <Stat label="RPM" value={s.rpm.toFixed(0)} alert={s.cut} /><Stat label="HP" value={s.hp.toFixed(0)} />
        <Stat label="Torque" value={s.torque.toFixed(0)} unit="nm" /><Stat label="Boost" value={s.boost.toFixed(1)} unit="psi" />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Panel title="Power run">
          <LineChart xMax={tachMax(e) > 10000 ? 20000 : Math.max(e.redline * 1.1, 7000)} yMax={yMax} xLabel="RPM →"
            series={[
              { pts: live.map((p) => [p.rpm, p.hp]), cls: "stroke-primary", label: `HP ${pk ? pk.hp.toFixed(0) : ""}` },
              { pts: live.map((p) => [p.rpm, p.tq]), cls: "stroke-warn", label: `NM ${pk ? pk.tq.toFixed(0) : ""}` },
              { pts: live.map((p) => [p.rpm, p.boost]), cls: "stroke-ok", label: `PSI ${pk ? pk.b.toFixed(1) : ""}`, yMax: 45 },
            ]} />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={() => sim.startStop()} className="font-display rounded-lg border py-3 text-sm font-bold uppercase">{s.on ? "Engine off" : "Start engine"}</button>
            <button disabled={s.dyno} onClick={() => sim.startDyno()} className="font-display flex items-center justify-center gap-1 rounded-lg bg-primary py-3 text-sm font-bold text-primary-foreground uppercase disabled:opacity-50">
              <Gauge className="h-4 w-4" />{s.dyno ? "Running…" : "Run dyno"}
            </button>
          </div>
        </Panel>
        <Panel title="Live RPM / boost">
          <LineChart xMax={6} yMax={tachMax(e)} xLabel="last 6s"
            series={[
              { pts: hist.map((h) => [h.t - t0, h.rpm]), cls: "stroke-primary", label: "RPM" },
              { pts: hist.map((h) => [h.t - t0, h.boost]), cls: "stroke-ok", label: "Boost", yMax: 45 },
            ]} />
          <div className="mt-3"><Pedal label="Free rev" className="h-20" onChange={(v) => { sim.ensureAudio(); sim.throttleIn = v; }} /></div>
        </Panel>
      </div>
      <Msg />
    </div>
  );
}

type Phase = "idle" | "stage" | "race" | "done" | "foul";
export function DragScreen() {
  const s = useSim();
  const g = useGame();
  const e = engineById(g.engineId);
  const [phase, setPhase] = useState<Phase>("idle");
  const [lights, setLights] = useState(0);
  const t0 = useRef(0); const res = useRef({ et: 0, trap: 0, opp: 0 });
  const oppET = useMemo(() => {
    const p = peak(e, g.tuning); return 5.825 * Math.cbrt((e.mass * 2.2046 + 180) / p.hp) * (0.97 + Math.random() * 0.08);
  }, [e, g.tuning, phase === "stage"]); // eslint-disable-line react-hooks/exhaustive-deps

  const stage = () => {
    if (!s.on) { sim.startStop(); }
    sim.resetRun(); setPhase("stage"); setLights(0);
    [1, 2, 3].forEach((n) => setTimeout(() => setLights(n), 900 * n + 400));
    setTimeout(() => { setLights(4); t0.current = sim.get().time; setPhase((p) => (p === "stage" ? "race" : p)); }, 900 * 4 + 400);
  };
  useEffect(() => {
    if (phase === "stage" && s.dist > 0.6) setPhase("foul");
    if (phase === "race" && s.dist >= 402.3) {
      const et = s.time - t0.current; res.current = { et, trap: Math.abs(s.speed), opp: oppET };
      g.setBest(e.id, et); setPhase("done");
    }
  }, [s.dist, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const el = phase === "race" ? s.time - t0.current : phase === "done" ? res.current.et : 0;
  const oppD = phase === "race" ? Math.min(402.3, 0.5 * (2 * 402.3 / (oppET * oppET)) * el * el) : phase === "done" ? 402.3 : 0;
  const me = phase === "race" || phase === "done" ? Math.min(402.3, s.dist) : 0;
  const u = MS_TO[g.settings.units];
  return (
    <Cockpit>
      <Header e={e} mode="Drag Race · 1/4 mile" />
      <Panel>
        <div className="flex items-center justify-center gap-2">
          {[1, 2, 3].map((n) => <div key={n} className={cn("h-6 w-6 rounded-full border", lights >= n && lights < 4 ? "bg-warn" : "bg-muted")} />)}
          <div className={cn("h-6 w-6 rounded-full border", lights === 4 ? "bg-ok" : "bg-muted", phase === "foul" && "bg-primary")} />
          <span className="ml-3 font-mono text-xl">{el.toFixed(3)}s</span>
        </div>
        {[{ l: "YOU", d: me, c: "bg-primary" }, { l: "RIVAL", d: oppD, c: "bg-metal" }].map((r) => (
          <div key={r.l} className="mt-2 flex items-center gap-2 text-xs">
            <span className="w-10 font-display">{r.l}</span>
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-background"><div className={cn("h-full", r.c)} style={{ width: `${(r.d / 402.3) * 100}%` }} /></div>
            <Flag className="h-3 w-3 text-muted-foreground" />
          </div>
        ))}
        <div className="mt-3">
          {phase === "done" && (
            <p className="mb-2 text-center text-sm">
              <b className={res.current.et < res.current.opp ? "text-ok" : "text-primary"}>{res.current.et < res.current.opp ? "YOU WIN" : "YOU LOSE"}</b>{" "}
              · ET {res.current.et.toFixed(2)}s · Trap {(res.current.trap * u).toFixed(0)} {g.settings.units === "metric" ? "km/h" : "mph"} · Rival {res.current.opp.toFixed(2)}s
            </p>
          )}
          {phase === "foul" && <p className="mb-2 text-center text-sm font-bold text-primary">JUMP START — RED LIGHT!</p>}
          <button disabled={phase === "stage" || phase === "race"} onClick={stage}
            className="font-display flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 font-bold text-primary-foreground uppercase disabled:opacity-50">
            <Play className="h-4 w-4" />{phase === "idle" ? "Stage" : phase === "stage" ? "Wait for green…" : phase === "race" ? "Go go go!" : "Race again"}
          </button>
          <p className="mt-2 text-center text-xs text-muted-foreground">Hold clutch, select 1st, build revs, release on green. Best: {g.best[e.id] ? g.best[e.id].toFixed(2) + "s" : "—"}</p>
        </div>
      </Panel>
    </Cockpit>
  );
}

export function CompareScreen() {
  const g = useGame();
  const [a, setA] = useState(g.engineId);
  const [b, setB] = useState(g.engineId === "v12" ? "v8" : "v12");
  const ea = engineById(a), eb = engineById(b);
  const ta = defaultTuning(ea), tb = defaultTuning(eb);
  const ca = curve(ea, ta), cb = curve(eb, tb), pa = peak(ea, ta), pb = peak(eb, tb);
  const rows: [string, number, number, string, boolean?][] = [
    ["Peak power", pa.hp, pb.hp, "hp"], ["Peak torque", pa.tq, pb.tq, "nm"], ["Redline", ea.redline, eb.redline, "rpm"],
    ["Weight", ea.mass, eb.mass, "kg", true], ["Power / ton", pa.hp / ea.mass * 1000, pb.hp / eb.mass * 1000, "hp/t"], ["Cylinders", ea.cyl, eb.cyl, ""],
  ];
  const sel = (v: string, set: (s: string) => void) => (
    <select value={v} onChange={(ev) => set(ev.target.value)} className="w-full min-w-0 rounded-lg border bg-background px-2 py-2 text-sm">
      {ENGINES.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
    </select>
  );
  const ymax = Math.max(pa.hp, pb.hp) * 1.15, xmax = Math.max(ea.redline, eb.redline) * 1.1;
  return (
    <div className="space-y-3">
      <div><div className="text-[10px] tracking-[0.3em] text-primary uppercase">Engine Comparison</div><h2 className="font-display text-2xl font-bold">Head to head</h2></div>
      <div className="grid grid-cols-2 gap-2">
        {[{ v: a, set: setA, e: ea, cls: "border-primary" }, { v: b, set: setB, e: eb, cls: "border-warn" }].map((x, i) => (
          <div key={i} className={cn("metal space-y-2 rounded-xl border-t-4 p-2", x.cls)}>
            {sel(x.v, x.set)}
            <button onClick={() => sim.preview(x.e, defaultTuning(x.e))} className="flex w-full items-center justify-center gap-1 rounded-lg border py-2 text-sm"><Volume2 className="h-4 w-4" />Listen</button>
            <button onClick={() => g.selectEngine(x.e.id)} className="flex w-full items-center justify-center gap-1 rounded-lg bg-primary/15 py-2 text-sm text-primary">
              {g.engineId === x.e.id ? <><Check className="h-4 w-4" />Selected</> : "Use this"}
            </button>
          </div>
        ))}
      </div>
      <Panel title="Power curves">
        <LineChart xMax={xmax} yMax={ymax} xLabel="RPM →" series={[
          { pts: ca.map((p) => [p.rpm, p.hp]), cls: "stroke-primary", label: ea.layout },
          { pts: cb.map((p) => [p.rpm, p.hp]), cls: "stroke-warn", label: eb.layout },
        ]} />
      </Panel>
      <Panel title="Specs">
        <div className="space-y-3">
          {rows.map(([l, va, vb, unit, lowWins]) => {
            const m = Math.max(va, vb) || 1; const aw = lowWins ? va < vb : va > vb; const bw = lowWins ? vb < va : vb > va;
            return (
              <div key={l}>
                <div className="mb-1 flex justify-between text-xs"><span className={cn("font-mono", aw && "text-primary")}>{va.toFixed(0)}</span><span className="text-muted-foreground">{l} {unit && `(${unit})`}</span><span className={cn("font-mono", bw && "text-warn")}>{vb.toFixed(0)}</span></div>
                <div className="flex gap-1">
                  <div className="flex h-2 flex-1 justify-end rounded bg-background"><div className="rounded bg-primary" style={{ width: `${(va / m) * 100}%` }} /></div>
                  <div className="h-2 flex-1 rounded bg-background"><div className="h-full rounded bg-warn" style={{ width: `${(vb / m) * 100}%` }} /></div>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

export function SettingsScreen() {
  const { settings: st, setSettings, resetAll } = useGame();
  const [confirm, setConfirm] = useState(false);
  const vol = (k: "master" | "engine" | "turbo" | "exhaust" | "ambient", l: string) => (
    <Row key={k} label={l} value={`${Math.round(st[k] * 100)}%`}><Slider min={0} max={1} step={0.05} value={[st[k]]} onValueChange={([v]) => setSettings({ [k]: v ?? 0 })} /></Row>
  );
  const sw = (k: "vibration" | "revMatch" | "autoClutch", l: string, d: string) => (
    <div key={k} className="flex items-center justify-between gap-3"><div><div className="text-sm">{l}</div><div className="text-xs text-muted-foreground">{d}</div></div><Switch checked={st[k]} onCheckedChange={(v) => setSettings({ [k]: v })} /></div>
  );
  return (
    <div className="space-y-3">
      <div><div className="text-[10px] tracking-[0.3em] text-primary uppercase">Settings</div><h2 className="font-display text-2xl font-bold">Setup</h2></div>
      <div className="grid gap-3 md:grid-cols-2">
        <Panel title="Volume"><div className="space-y-4">{vol("master", "Master")}{vol("engine", "Engine")}{vol("turbo", "Turbo & supercharger")}{vol("exhaust", "Exhaust & pops")}{vol("ambient", "Background garage")}</div></Panel>
        <div className="space-y-3">
          <Panel title="Quality">
            <div className="space-y-3">
              <Row label="Sound quality"><Seg value={st.quality} onChange={(v) => setSettings({ quality: v })} options={[{ v: "high", l: "High" }, { v: "low", l: "Battery saver" }]} /></Row>
              <Row label="Graphics"><Seg value={st.graphics} onChange={(v) => setSettings({ graphics: v })} options={[{ v: "high", l: "Glow on" }, { v: "low", l: "Performance" }]} /></Row>
              <Row label="Units"><Seg value={st.units} onChange={(v) => setSettings({ units: v })} options={[{ v: "metric", l: "km/h · °C" }, { v: "imperial", l: "mph · °F" }]} /></Row>
            </div>
          </Panel>
          <Panel title="Driving">
            <div className="space-y-4">
              {sw("revMatch", "Rev matching", "Auto blip on shifts")}
              {sw("autoClutch", "Auto clutch", "Shift without pressing clutch")}
              {sw("vibration", "Vibration", "Haptics on limiter & shifts")}
            </div>
          </Panel>
          <Panel title="Reset">
            <button onClick={() => { if (confirm) { resetAll(); setConfirm(false); } else setConfirm(true); }}
              className={cn("w-full rounded-lg border py-2.5 text-sm font-bold uppercase", confirm ? "border-primary bg-primary text-primary-foreground" : "text-primary")}>
              {confirm ? "Tap again to erase everything" : "Reset all data"}
            </button>
          </Panel>
        </div>
      </div>
    </div>
  );
}

export const GEARS = GEAR_RATIOS;
