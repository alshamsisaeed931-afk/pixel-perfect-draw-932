export type ShiftColor = "red" | "amber" | "green";

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