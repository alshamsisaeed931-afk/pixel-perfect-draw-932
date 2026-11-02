import { describe, expect, it } from "vitest";
import { estimateET, finishPosition, gearRatios, nitrousTorque, npcField, rivalDistance, QUARTER_MILE } from "@/lib/dashboard";
import { ENGINES, engineById } from "@/lib/engines";

describe("Gearbox, nitrous and drag racing rules", () => {
  it("offers 6 to 10 forward gears", () => {
    expect(Object.keys(gearRatios(6)).filter((k) => +k > 0)).toHaveLength(6);
    expect(Object.keys(gearRatios(10)).filter((k) => +k > 0)).toHaveLength(10);
    expect(Object.keys(gearRatios(14)).filter((k) => +k > 0)).toHaveLength(10);
  });
  it("nitrous adds torque", () => {
    expect(nitrousTorque(100, 5000, 4000)).toBeGreaterThan(0);
  });
  it("drag race has between 1 and 5 computer rivals", () => {
    expect(npcField(12, 3, "normal")).toHaveLength(3);
    expect(npcField(12, 9, "normal")).toHaveLength(5);
    expect(npcField(12, 0, "normal")).toHaveLength(1);
  });
  it("hard rivals are faster than easy rivals", () => {
    const fixed = () => 0.5;
    expect(npcField(12, 1, "hard", fixed)[0]!.et).toBeLessThan(npcField(12, 1, "easy", fixed)[0]!.et);
  });
  it("ranks finishing position by lowest time", () => {
    expect(finishPosition(11, [12, 13])).toBe(1);
    expect(finishPosition(12.5, [12, 13])).toBe(2);
  });
  it("rival reaches the finish line exactly at its ET", () => {
    expect(rivalDistance(12, 12)).toBeCloseTo(QUARTER_MILE);
    expect(estimateET(400, 1500)).toBeGreaterThan(estimateET(800, 1500));
  });
  it("includes the requested Nissan TB48, Toyota V8 and Mitsubishi GDI engines", () => {
    expect(engineById("tb48").name).toMatch(/TB48/);
    expect(engineById("toyv8").name).toMatch(/Toyota/);
    expect(engineById("gdi").name).toMatch(/GDI/);
    expect(ENGINES.length).toBeGreaterThanOrEqual(33);
  });
});
