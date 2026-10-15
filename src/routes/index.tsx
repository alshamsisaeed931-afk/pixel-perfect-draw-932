import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Gauge, Warehouse, Wrench, Activity, Flag, GitCompare, Settings, Maximize } from "lucide-react";
import { GameProvider } from "@/lib/store";
import { CompareScreen, DragScreen, DriveScreen, DynoScreen, GarageScreen, SettingsScreen, TuneScreen } from "@/components/game/screens";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ENGINE SIM ULTRA — Realistic Engine Sound Simulator" },
      { name: "description", content: "Rev 23 engines with live procedural sound, manual gearbox, turbo tuning, dyno and drag racing." },
      { property: "og:title", content: "ENGINE SIM ULTRA" },
      { property: "og:description", content: "Realistic engine sound simulator with gearbox, turbo tuning, dyno and drag racing." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const TABS = [
  { id: "drive", l: "Rev", I: Gauge }, { id: "garage", l: "Garage", I: Warehouse }, { id: "tune", l: "Tune", I: Wrench },
  { id: "dyno", l: "Dyno", I: Activity }, { id: "drag", l: "Drag", I: Flag }, { id: "compare", l: "Compare", I: GitCompare },
  { id: "settings", l: "Setup", I: Settings },
] as const;
type Tab = (typeof TABS)[number]["id"];

function Index() {
  const [tab, setTab] = useState<Tab>("drive");
  return (
    <GameProvider>
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
          {tab === "drag" && <DragScreen />}
          {tab === "compare" && <CompareScreen />}
          {tab === "settings" && <SettingsScreen />}
        </main>
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <div className="mx-auto grid max-w-5xl grid-cols-7">
            {TABS.map(({ id, l, I }) => (
              <button key={id} onClick={() => setTab(id)} className={cn("flex flex-col items-center gap-0.5 py-2.5 text-[10px] uppercase tracking-wider", tab === id ? "text-primary" : "text-muted-foreground")}>
                <I className="h-5 w-5" />{l}
              </button>
            ))}
          </div>
        </nav>
      </div>
    </GameProvider>
  );
}
