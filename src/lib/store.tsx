import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { defaultTuning, engineById, type Tuning } from "./engines";
import { sim } from "./sim";

export type Settings = {
  master: number; engine: number; turbo: number; exhaust: number; ambient: number;
  quality: "high" | "low"; graphics: "high" | "low"; vibration: boolean; units: "metric" | "imperial";
  revMatch: boolean; autoClutch: boolean;
};
export type SavedConfig = { id: string; name: string; engineId: string; tuning: Tuning };
type State = {
  engineId: string; tuning: Tuning; settings: Settings; favorites: string[]; configs: SavedConfig[];
  best: Record<string, number>;
};

export const DEFAULT_SETTINGS: Settings = {
  master: 0.8, engine: 1, turbo: 0.8, exhaust: 0.9, ambient: 0.25, quality: "high", graphics: "high",
  vibration: true, units: "metric", revMatch: true, autoClutch: false,
};
const initial = (): State => ({ engineId: "v8", tuning: defaultTuning(engineById("v8")), settings: DEFAULT_SETTINGS, favorites: [], configs: [], best: {} });
const KEY = "engine-sim-ultra-v1";

type Ctx = State & {
  selectEngine: (id: string) => void; setTuning: (t: Partial<Tuning>) => void; setSettings: (s: Partial<Settings>) => void;
  toggleFav: (id: string) => void; saveConfig: (name: string) => void; loadConfig: (c: SavedConfig) => void; deleteConfig: (id: string) => void;
  setBest: (id: string, t: number) => void; resetAll: () => void;
};
const C = createContext<Ctx | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [st, setSt] = useState<State>(initial);
  const loaded = useRef(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw);
        setSt((s) => ({
          ...s, ...p,
          settings: { ...DEFAULT_SETTINGS, ...p.settings },
          tuning: { ...defaultTuning(engineById(p.engineId ?? "v8")), ...p.tuning },
        }));
      }
    } catch { /* ignore */ }
    loaded.current = true;
  }, []);
  useEffect(() => { if (loaded.current) localStorage.setItem(KEY, JSON.stringify(st)); }, [st]);
  useEffect(() => { sim.setEngine(engineById(st.engineId), st.tuning); }, [st.engineId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { sim.setTuning(st.tuning); }, [st.tuning]);
  useEffect(() => {
    const s = st.settings;
    sim.setVolumes({ master: s.master, engine: s.engine, turbo: s.turbo, exhaust: s.exhaust, ambient: s.ambient });
    sim.audio.setQuality(s.quality);
    sim.opts = { revMatch: s.revMatch, autoClutch: s.autoClutch, vibration: s.vibration };
  }, [st.settings]);

  const ctx: Ctx = {
    ...st,
    selectEngine: (id) => setSt((s) => ({ ...s, engineId: id, tuning: defaultTuning(engineById(id)) })),
    setTuning: (t) => setSt((s) => ({ ...s, tuning: { ...s.tuning, ...t } })),
    setSettings: (x) => setSt((s) => ({ ...s, settings: { ...s.settings, ...x } })),
    toggleFav: (id) => setSt((s) => ({ ...s, favorites: s.favorites.includes(id) ? s.favorites.filter((f) => f !== id) : [...s.favorites, id] })),
    saveConfig: (name) => setSt((s) => ({ ...s, configs: [...s.configs, { id: crypto.randomUUID(), name, engineId: s.engineId, tuning: s.tuning }] })),
    loadConfig: (c) => { const tuning = { ...defaultTuning(engineById(c.engineId)), ...c.tuning }; sim.setEngine(engineById(c.engineId), tuning); setSt((s) => ({ ...s, engineId: c.engineId, tuning })); },
    deleteConfig: (id) => setSt((s) => ({ ...s, configs: s.configs.filter((c) => c.id !== id) })),
    setBest: (id, t) => setSt((s) => ({ ...s, best: { ...s.best, [id]: s.best[id] ? Math.min(s.best[id], t) : t } })),
    resetAll: () => { localStorage.removeItem(KEY); setSt(initial()); },
  };
  return <C.Provider value={ctx}>{children}</C.Provider>;
}

export const useGame = () => { const c = useContext(C); if (!c) throw new Error("no provider"); return c; };
export const useSim = () => useSyncExternalStore(sim.subscribe, sim.get, sim.get);
