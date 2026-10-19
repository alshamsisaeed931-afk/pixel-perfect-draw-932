import { describe, expect, it } from "vitest";
import { shiftLightState, intakeMultiplier, effectiveInertia, finalDriveRatio, throttleStep } from "@/lib/dashboard";
import { defaultTuning, engineById, torqueAt } from "@/lib/engines";

describe("Dashboard and tuning effects", () => {
  it("activates at the selected RPM, not below", () => {
    expect(shiftLightState(3999, 4000, true, true).lit).toBe(false);
    expect(shiftLightState(4000, 4000, true, true).lit).toBe(true);
    expect(shiftLightState(5000, 4000, false, true).lit).toBe(false);
    expect(shiftLightState(5000, 4000, true, false).segments).toBe(0);
  });
  it("race intake raises calculated engine torque by six percent", () => {
    const e = engineById("v8"), t = defaultTuning(e);
    expect(intakeMultiplier("stock")).toBe(1);
    expect(torqueAt(e, { ...t, intake: "race" }, 4400, 0) / torqueAt(e, t, 4400, 0)).toBeCloseTo(1.06);
  });
  it("light flywheel reduces rotational inertia", () => {
    expect(effectiveInertia(0.28, 0.5)).toBe(0.14);
  });
  it("uses the selected final drive instead of the old fixed ratio", () => {
    expect(finalDriveRatio(4.5)).toBe(4.5);
    expect(finalDriveRatio(defaultTuning(engineById("v8")).finalDrive)).toBe(3.7);
  });
  it("higher throttle response reaches the input faster", () => {
    expect(throttleStep(0, 1, 2, 0.1)).toBeGreaterThan(throttleStep(0, 1, 0.5, 0.1));
    expect(throttleStep(0, 1, 2, 0.1)).toBeLessThan(1);
  });
  it("old setups can acquire new tuning defaults", () => {
    const restored = { ...defaultTuning(engineById("v8")), ...{ boost: 18 } };
    expect(restored.boost).toBe(18);
    expect(restored.shiftLight).toBe(true);
    expect(restored.flywheel).toBe(1);
    expect(restored.throttleResponse).toBe(1);
  });
});