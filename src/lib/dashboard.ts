export type ShiftColor = "red" | "amber" | "green" | "purple" | "blue";

export function shiftLightState(rpm: number, target: number, enabled: boolean, running: boolean) {
  const active = enabled && running;
  return {
    lit: active && rpm >= target,
    segments: active ? Math.min(8, Math.max(0, Math.floor((rpm / Math.max(1, target) - 0.5) * 16))) : 0,
  };
}

export const intakeMultiplier = (intake: "stock" | "sport" | "race") => ({ stock: 1, sport: 1.03, race: 1.06 })[intake];
export const effectiveInertia = (inertia: number, flywheel: number) => inertia * flywheel;
export const finalDriveRatio = (finalDrive: number) => finalDrive;
export const throttleStep = (current: number, input: number, response: number, dt: number) => current + (input - current) * (1 - Math.exp(-dt * 12 * response));

export type FuelType = "91" | "95" | "98" | "e85" | "race";
export const fuelMultiplier = (f: FuelType) => ({ "91": 0.96, "95": 1, "98": 1.02, e85: 1.06, race: 1.08 })[f];

export type Intercooler = "none" | "street" | "race";
/** Intercooler only matters with boost: cooler charge air = more torque under boost. */
export const intercoolerMultiplier = (ic: Intercooler, boostPsi: number) =>
  1 + ({ none: -0.06, street: 0, race: 0.05 })[ic] * Math.min(1, Math.max(0, boostPsi) / 20);

export type EcuMap = "eco" | "stock" | "sport" | "track";
export const ecuTorque = (m: EcuMap) => ({ eco: 0.9, stock: 1, sport: 1.03, track: 1.06 })[m];
export const ecuThrottle = (m: EcuMap) => ({ eco: 0.7, stock: 1, sport: 1.25, track: 1.5 })[m];

/** Extra torque (Nm) from a nitrous shot rated in hp, flat below peak-torque rpm so launches don't explode. */
export const nitrousTorque = (shotHp: number, rpm: number, peakTRpm: number) => (shotHp * 7121) / Math.max(rpm, peakTRpm, 1500);

/** Forward ratios for an n-speed box (6–10), geometric spacing; more gears = shorter first, taller top. */
export function gearRatios(n: number): Record<number, number> {
  const g = Math.max(6, Math.min(10, Math.round(n)));
  const first = 3.6 * (1 + (g - 6) * 0.08), top = 0.83 - (g - 6) * 0.04;
  const out: Record<number, number> = { [-1]: -3.3, 0: 0 };
  for (let i = 1; i <= g; i++) out[i] = +(first * Math.pow(top / first, (i - 1) / (g - 1))).toFixed(3);
  return out;
}

export const QUARTER_MILE = 402.3;
/** Quarter-mile ET estimate (Huntington formula) from peak hp and kg mass, incl. a 180 lb driver. */
export const estimateET = (hp: number, massKg: number) => 5.825 * Math.cbrt((massKg * 2.2046 + 180) / Math.max(1, hp));
/** Distance covered at time t by a rival that finishes the quarter in et seconds (constant accel). */
export const rivalDistance = (et: number, t: number) => Math.min(QUARTER_MILE, (QUARTER_MILE / (et * et)) * t * t);

export const NPC_NAMES = ["Blaze", "Viper", "Ghost", "Nitro Nasser", "Desert Hawk", "Turbo Tariq", "Falcon", "Drift King", "Saluki", "Shadow"];
/** Rival ETs: each NPC gets a skill spread around your car's estimate; harder difficulty = faster rivals. */
export function npcField(baseET: number, count: number, difficulty: "easy" | "normal" | "hard", rnd: () => number = Math.random) {
  const bias = { easy: 1.08, normal: 1.0, hard: 0.94 }[difficulty];
  const n = Math.max(1, Math.min(5, Math.round(count)));
  const offset = Math.floor(rnd() * NPC_NAMES.length);
  return Array.from({ length: n }, (_, i) => ({ name: NPC_NAMES[(offset + i) % NPC_NAMES.length]!, et: +(baseET * bias * (0.95 + rnd() * 0.1)).toFixed(3) }));
}
/** Finishing position (1 = winner) of an ET among rival ETs. */
export const finishPosition = (et: number, rivals: number[]) => 1 + rivals.filter((r) => r < et).length;

/** Brake force (N) for a pedal position 0–1; full pedal decelerates at about 0.9 g. */
export const brakeForce = (pedal: number, mass: number) => Math.max(0, Math.min(1, pedal)) * mass * 9.81 * 0.9;
