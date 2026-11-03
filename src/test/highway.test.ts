import { describe, expect, it } from "vitest";
import { brakeForce } from "@/lib/dashboard";
import { collides, isOffRoad, lateralStep, offRoadDrag, ROAD_HALF, updateTraffic } from "@/lib/highway";

describe("highway test drive", () => {
  it("steering right moves the car right on a straight bit", () => {
    // find a near-straight distance so curve drift is tiny
    const x = lateralStep(0, 1, 20, 0, 1);
    expect(x).toBeGreaterThan(3);
  });

  it("a stopped car does not move sideways when steering", () => {
    expect(lateralStep(0, 1, 0, 500, 1)).toBe(0);
  });

  it("leaving the road slows you down, staying on it does not", () => {
    expect(isOffRoad(0)).toBe(false);
    expect(isOffRoad(ROAD_HALF)).toBe(true);
    expect(offRoadDrag(0, 30)).toBe(0);
    expect(offRoadDrag(ROAD_HALF + 1, 30)).toBeGreaterThan(0);
  });

  it("hits a car in the same lane but not one in the next lane", () => {
    expect(collides(0, 100, { id: 1, z: 102, lane: 0, v: 20, paint: 0, kind: "car" })).toBe(true);
    expect(collides(0, 100, { id: 1, z: 102, lane: 1, v: 20, paint: 0, kind: "car" })).toBe(false);
  });

  it("full brake stops the car at about 0.9 g", () => {
    expect(brakeForce(1, 1000)).toBeCloseTo(8829, 0);
    expect(brakeForce(0, 1000)).toBe(0);
  });

  it("always keeps traffic on the road ahead", () => {
    const cars = updateTraffic([], 0, 0.016, () => 0.5);
    expect(cars.length).toBe(7);
    expect(cars.every((c) => c.z > 0)).toBe(true);
  });
});
