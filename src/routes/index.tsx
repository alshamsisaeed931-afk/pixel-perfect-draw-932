import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Gauge, Warehouse, Wrench, Activity, Flag, GitCompare, Settings, Maximize, Users, Car } from "lucide-react";
import { GameProvider } from "@/lib/store";
import { ENGINES } from "@/lib/engines";
import { CompareScreen, DragScreen, DriveScreen, DynoScreen, GarageScreen, SettingsScreen, TuneScreen } from "@/components/game/screens";
import { HighwayScreen } from "@/components/game/highway";
import { OnlineScreen, type OnlineRace } from "@/components/game/online";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ENGINE SIM ULTRA — Free Realistic Engine Sound Simulator" },
      { name: "description", content: `Rev ${ENGINES.length} real engines — V8, V12, Nissan TB48, 2JZ, RB26 — with deep procedural sound, 6–10 speed manual, turbo & nitrous tuning, dyno, highway test drive and online drag racing.` },
      { name: "keywords", content: "engine sound simulator, car engine sounds, rev engine online, drag racing game, V8 sound, TB48, 2JZ, nitrous, dyno" },
      { property: "og:title", content: "ENGINE SIM ULTRA — Rev, tune and drag race real engines" },
      { property: "og:description", content: `${ENGINES.length} engines with rumbling realistic sound, nitrous, turbo tuning and online drag races with friends.` },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const TABS = [
  { id: "drive", l: "Rev", I: Gauge }, { id: "garage", l: "Garage", I: Warehouse }, { id: "tune", l: "Tune", I: Wrench },
  { id: "dyno", l: "Dyno", I: Activity }, { id: "highway", l: "Road", I: Car }, { id: "drag", l: "Drag", I: Flag }, { id: "online", l: "Online", I: Users },
  { id: "compare", l: "Compare", I: GitCompare }, { id: "settings", l: "Setup", I: Settings },
] as const;
type Tab = (typeof TABS)[number]["id"];

function LoadingScreen() {
  const [gone, setGone] = useState(false);
  const [hide, setHide] = useState(false);
  useEffect(() => {
    const a = setTimeout(() => setHide(true), 1500);
    const b = setTimeout(() => setGone(true), 1900);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);
  if (gone) return null;
  return (
    <div role="status" aria-label="Loading" className={cn("carbon fixed inset-0 z-50 flex flex-col items-center justify-center bg-background transition-opacity duration-300", hide && "pointer-events-none opacity-0")}>
      <Gauge className="h-14 w-14 animate-pulse text-primary" />
      <h1 className="font-display mt-4 text-3xl font-bold tracking-[0.15em]">ENGINE SIM <span className="text-primary text-glow">ULTRA</span></h1>
      <div className="mt-6 h-1.5 w-56 overflow-hidden rounded-full bg-muted"><div className="loader-bar h-full bg-primary glow" /></div>
      <p className="mt-3 font-mono text-xs tracking-widest text-muted-foreground uppercase">Warming up {ENGINES.length} engines…</p>
      <p className="mt-8 text-[10px] tracking-[0.3em] text-muted-foreground uppercase">By Saeed Khalfan Salem Alshamsi</p>
    </div>
  );
}

function Index() {
  const [tab, setTab] = useState<Tab>("drive");
  const [online, setOnline] = useState<OnlineRace | null>(null);
  return (
    <GameProvider>
      <LoadingScreen />
      <div className="carbon min-h-screen pb-24">
        <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-2">
            <h1 className="font-display text-lg font-bold tracking-[0.15em]">ENGINE SIM <span className="text-primary text-glow">ULTRA</span></h1>
            <button aria-label="Fullscreen" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())} className="rounded-md border p-2"><Maximize className="h-4 w-4" /></button>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-4">
          {tab === "drive" && <DriveScreen />}
          {tab === "garage" && <GarageScreen onDrive={() => setTab("drive")} />}
          {tab === "tune" && <TuneScreen />}
          {tab === "dyno" && <DynoScreen />}
          {tab === "highway" && <HighwayScreen />}
          {tab === "drag" && <DragScreen key={online?.id ?? "npc"} online={online} />}
          {tab === "online" && <OnlineScreen onRace={(r) => { setOnline(r); setTab("drag"); }} />}
          {tab === "compare" && <CompareScreen />}
          {tab === "settings" && <SettingsScreen />}
        </main>
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <div className="mx-auto grid max-w-5xl grid-cols-9">
            {TABS.map(({ id, l, I }) => (
              <button key={id} onClick={() => { if (id !== "drag") setOnline(null); setTab(id); }} className={cn("flex min-w-0 flex-col items-center gap-0.5 py-2.5 text-[9px] uppercase tracking-wider sm:text-[10px]", tab === id ? "text-primary" : "text-muted-foreground")}>
                <I className="h-5 w-5" />{l}
              </button>
            ))}
          </div>
        </nav>
      </div>
    </GameProvider>
  );
}
