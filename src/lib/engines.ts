export type Induction = "na" | "turbo" | "twin" | "super";
export type Engine = {
  id: string; name: string; layout: string; cat: string; cyl: number;
  idle: number; redline: number; peakT: number; peakTRpm: number;
  induction: Induction; boost: number; spool: number;
  inertia: number; mass: number; uneven: number; rasp: number; bass: number; clatter: number;
  desc: string;
};

const E = (o: Engine) => o;
export const ENGINES: Engine[] = [
  E({ id: "v8", name: "Crossplane V8 5.0", layout: "V8", cat: "Muscle", cyl: 8, idle: 750, redline: 7000, peakT: 530, peakTRpm: 4400, induction: "na", boost: 0, spool: 2500, inertia: 0.28, mass: 1650, uneven: 0.75, rasp: 0.2, bass: 0.7, clatter: 0, desc: "Classic lumpy burble, thick torque." }),
  E({ id: "v10", name: "NA V10 5.2", layout: "V10", cat: "Supercar", cyl: 10, idle: 900, redline: 8700, peakT: 560, peakTRpm: 6500, induction: "na", boost: 0, spool: 3000, inertia: 0.22, mass: 1550, uneven: 0.25, rasp: 0.6, bass: 0.3, clatter: 0, desc: "High-pitched shriek, razor response." }),
  E({ id: "v12", name: "V12 6.5", layout: "V12", cat: "GT", cyl: 12, idle: 850, redline: 8500, peakT: 720, peakTRpm: 5500, induction: "na", boost: 0, spool: 3000, inertia: 0.3, mass: 1750, uneven: 0.1, rasp: 0.45, bass: 0.35, clatter: 0, desc: "Silky, symphonic, endless pull." }),
  E({ id: "i4", name: "Inline-4 2.0 VTEC", layout: "I4", cat: "Tuner", cyl: 4, idle: 850, redline: 8600, peakT: 220, peakTRpm: 6500, induction: "na", boost: 0, spool: 3000, inertia: 0.12, mass: 1250, uneven: 0.1, rasp: 0.55, bass: 0.15, clatter: 0, desc: "Buzzy, revvy four-banger." }),
  E({ id: "i6", name: "Inline-6 3.0", layout: "I6", cat: "Tuner", cyl: 6, idle: 750, redline: 7200, peakT: 400, peakTRpm: 4500, induction: "twin", boost: 14, spool: 2800, inertia: 0.2, mass: 1500, uneven: 0.05, rasp: 0.4, bass: 0.35, clatter: 0, desc: "Turbine-smooth straight six." }),
  E({ id: "flat6", name: "Flat-6 4.0 GT", layout: "F6", cat: "Racing", cyl: 6, idle: 900, redline: 9000, peakT: 470, peakTRpm: 6300, induction: "na", boost: 0, spool: 3000, inertia: 0.18, mass: 1420, uneven: 0.45, rasp: 0.5, bass: 0.3, clatter: 0, desc: "Boxer howl with a metallic edge." }),
  E({ id: "diesel", name: "Turbo Diesel I6 3.0", layout: "I6D", cat: "Diesel", cyl: 6, idle: 700, redline: 4800, peakT: 650, peakTRpm: 2000, induction: "turbo", boost: 22, spool: 1500, inertia: 0.4, mass: 2100, uneven: 0.15, rasp: 0.2, bass: 0.6, clatter: 0.8, desc: "Clattering diesel, mountain of torque." }),
  E({ id: "scv8", name: "Supercharged V8 6.2", layout: "V8S", cat: "Muscle", cyl: 8, idle: 800, redline: 6600, peakT: 880, peakTRpm: 4000, induction: "super", boost: 12, spool: 0, inertia: 0.3, mass: 1900, uneven: 0.7, rasp: 0.25, bass: 0.75, clatter: 0, desc: "Blower whine over V8 thunder." }),
  E({ id: "ttv6", name: "Twin-Turbo V6 3.5", layout: "V6T", cat: "Supercar", cyl: 6, idle: 800, redline: 7100, peakT: 600, peakTRpm: 3500, induction: "twin", boost: 18, spool: 2400, inertia: 0.2, mass: 1600, uneven: 0.35, rasp: 0.35, bass: 0.4, clatter: 0, desc: "Modern boosted bruiser." }),
  E({ id: "rotary", name: "13B Rotary", layout: "2R", cat: "Tuner", cyl: 4, idle: 950, redline: 9000, peakT: 290, peakTRpm: 6000, induction: "turbo", boost: 12, spool: 3200, inertia: 0.1, mass: 1280, uneven: 0.05, rasp: 0.9, bass: 0.2, clatter: 0, desc: "BRAAAP. Buzzsaw rotary." }),
  E({ id: "muscle", name: "427 Big Block", layout: "V8", cat: "Muscle", cyl: 8, idle: 650, redline: 6200, peakT: 650, peakTRpm: 3800, induction: "na", boost: 0, spool: 2500, inertia: 0.38, mass: 1700, uneven: 0.95, rasp: 0.15, bass: 0.9, clatter: 0, desc: "Choppy cam, earth-shaking rumble." }),
  E({ id: "w16", name: "Quad-Turbo W16 8.0", layout: "W16", cat: "Hypercar", cyl: 16, idle: 850, redline: 6800, peakT: 1600, peakTRpm: 3500, induction: "twin", boost: 22, spool: 2600, inertia: 0.45, mass: 1990, uneven: 0.2, rasp: 0.3, bass: 0.5, clatter: 0, desc: "1500 hp of deep turbo roar." }),
  E({ id: "race", name: "Flat-Plane Race V8", layout: "V8FP", cat: "Racing", cyl: 8, idle: 1100, redline: 9500, peakT: 540, peakTRpm: 7000, induction: "na", boost: 0, spool: 3000, inertia: 0.14, mass: 1200, uneven: 0.05, rasp: 0.75, bass: 0.25, clatter: 0, desc: "Screaming endurance racer." }),
  E({ id: "f1", name: "F1 V10 3.0", layout: "V10", cat: "Racing", cyl: 10, idle: 4000, redline: 18500, peakT: 360, peakTRpm: 15500, induction: "na", boost: 0, spool: 3000, inertia: 0.05, mass: 650, uneven: 0.05, rasp: 0.8, bass: 0.1, clatter: 0, desc: "18,000 rpm wail of the golden era." }),
  E({ id: "lambo", name: "Raging Bull V12 6.5", layout: "V12", cat: "Supercar", cyl: 12, idle: 950, redline: 8800, peakT: 720, peakTRpm: 6750, induction: "na", boost: 0, spool: 3000, inertia: 0.25, mass: 1550, uneven: 0.15, rasp: 0.65, bass: 0.35, clatter: 0, desc: "Italian thunder, angry bark." }),
  E({ id: "ferrari", name: "Prancing Flat-Plane V8", layout: "V8FP", cat: "Supercar", cyl: 8, idle: 1000, redline: 9000, peakT: 540, peakTRpm: 6000, induction: "na", boost: 0, spool: 3000, inertia: 0.16, mass: 1450, uneven: 0.05, rasp: 0.7, bass: 0.25, clatter: 0, desc: "Operatic flat-plane scream." }),
  E({ id: "moto", name: "Superbike I4 1000", layout: "I4M", cat: "Moto", cyl: 4, idle: 1300, redline: 14500, peakT: 115, peakTRpm: 11000, induction: "na", boost: 0, spool: 3000, inertia: 0.03, mass: 280, uneven: 0.05, rasp: 0.7, bass: 0.1, clatter: 0, desc: "High-rev crotch-rocket scream." }),
  E({ id: "vtwin", name: "V-Twin Cruiser 1.9", layout: "V2", cat: "Moto", cyl: 2, idle: 900, redline: 5800, peakT: 160, peakTRpm: 3200, induction: "na", boost: 0, spool: 3000, inertia: 0.06, mass: 390, uneven: 1, rasp: 0.2, bass: 0.8, clatter: 0.1, desc: "Potato-potato loping twin." }),
  E({ id: "truck", name: "Diesel V8 6.7 Truck", layout: "V8D", cat: "Diesel", cyl: 8, idle: 650, redline: 3800, peakT: 1400, peakTRpm: 1800, induction: "turbo", boost: 30, spool: 1300, inertia: 0.6, mass: 3400, uneven: 0.5, rasp: 0.2, bass: 0.85, clatter: 0.9, desc: "Rolling coal heavy hauler." }),
  E({ id: "i3", name: "Turbo I3 1.6", layout: "I3", cat: "Hot Hatch", cyl: 3, idle: 850, redline: 7000, peakT: 370, peakTRpm: 3500, induction: "turbo", boost: 20, spool: 2500, inertia: 0.1, mass: 1280, uneven: 0.2, rasp: 0.45, bass: 0.3, clatter: 0, desc: "Thrummy rally triple." }),
  E({ id: "i5", name: "Turbo I5 2.5", layout: "I5", cat: "Hot Hatch", cyl: 5, idle: 800, redline: 7000, peakT: 480, peakTRpm: 3000, induction: "turbo", boost: 20, spool: 2400, inertia: 0.15, mass: 1500, uneven: 0.35, rasp: 0.4, bass: 0.4, clatter: 0, desc: "Legendary warbling five." }),
  E({ id: "boxer4", name: "Turbo Boxer-4 2.5", layout: "F4", cat: "Tuner", cyl: 4, idle: 800, redline: 7000, peakT: 410, peakTRpm: 4000, induction: "turbo", boost: 16, spool: 2800, inertia: 0.14, mass: 1450, uneven: 0.8, rasp: 0.3, bass: 0.5, clatter: 0, desc: "Unequal-length boxer rumble." }),
  E({ id: "single", name: "Dirt Bike Single 450", layout: "1", cat: "Moto", cyl: 1, idle: 1600, redline: 11500, peakT: 50, peakTRpm: 8500, induction: "na", boost: 0, spool: 3000, inertia: 0.015, mass: 210, uneven: 0.2, rasp: 0.6, bass: 0.3, clatter: 0.2, desc: "Thumping, snappy single." }),
];

export const engineById = (id: string): Engine => ENGINES.find((e) => e.id === id) ?? ENGINES[0]!;

export type Tuning = {
  induction: Induction; boost: number; wastegate: "bov" | "flutter" | "off";
  exhaust: "stock" | "sport" | "straight" | "race"; muffler: number; pops: boolean;
  idleOffset: number; limiter: number; limiterType: "hard" | "soft";
  cam: "stock" | "street" | "race"; timing: number; fuel: number;
  spoolRate: number; popsLevel: number; launchRpm: number; antiLag: boolean;
};

export const defaultTuning = (e: Engine): Tuning => ({
  induction: e.induction, boost: e.boost || 12, wastegate: "bov", exhaust: "sport", muffler: 0.4,
  pops: e.cat !== "Diesel", idleOffset: 0, limiter: e.redline, limiterType: "hard",
  cam: "stock", timing: 0.5, fuel: 0.5, spoolRate: 1, popsLevel: 0.5,
  launchRpm: Math.round(e.redline * 0.45 / 100) * 100, antiLag: false,
});

export const EXHAUST = {
  stock: { tone: 0.7, loud: 0.6, drive: 0.6, mult: 1 },
  sport: { tone: 1, loud: 0.9, drive: 1, mult: 1.03 },
  straight: { tone: 1.35, loud: 1.25, drive: 1.5, mult: 1.06 },
  race: { tone: 1.6, loud: 1.45, drive: 1.9, mult: 1.09 },
};

export function steadyBoost(e: Engine, t: Tuning, rpm: number, th = 1) {
  if (t.induction === "na") return 0;
  if (t.induction === "super") return t.boost * (0.35 + 0.65 * rpm / e.redline) * (0.3 + 0.7 * th);
  const spoolStart = (t.induction === "twin" ? e.spool * 0.8 : e.spool) / t.spoolRate;
  const s = Math.min(1, Math.max(0, (rpm - spoolStart) / (e.redline * 0.3)));
  return t.boost * s * th;
}

export const CAM = {
  stock: { low: 1, high: 1, lope: 0 },
  street: { low: 0.96, high: 1.04, lope: 0.35 },
  race: { low: 0.88, high: 1.1, lope: 0.8 },
};

export function torqueAt(e: Engine, t: Tuning, rpm: number, boost: number) {
  const x = (rpm - e.peakTRpm) / e.redline;
  let base = e.peakT * Math.max(0.2, 1 - 2 * x * x);
  if (rpm > e.redline) base *= Math.max(0, 1 - (rpm - e.redline) / (e.redline * 0.15));
  const cam = CAM[t.cam];
  const camMult = rpm < e.peakTRpm
    ? 1 - (1 - cam.low) * (1 - rpm / e.peakTRpm)
    : 1 + (cam.high - 1) * Math.min(1, (rpm - e.peakTRpm) / (e.redline - e.peakTRpm));
  base *= camMult;
  const naBoosted = e.induction === "na" ? 0.8 : 0.85;
  const boostMult = 1 + (boost / 14.7) * naBoosted - (e.induction !== "na" ? (e.boost / 14.7) * 0.85 : 0);
  const timingMult = 0.92 + t.timing * 0.16; // 0.92x retarded … 1.08x advanced
  const fuelMult = 1.02 - Math.abs(t.fuel - 0.55) * 0.18; // richest/leanest lose power
  return base * Math.max(0.4, boostMult) * EXHAUST[t.exhaust].mult * (1 - t.muffler * 0.04) * timingMult * fuelMult;
}

export const hpFrom = (tq: number, rpm: number) => (tq * rpm) / 7121;
