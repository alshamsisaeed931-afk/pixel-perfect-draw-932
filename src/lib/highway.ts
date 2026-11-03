// Pure, browser-safe helpers for the highway test drive (no canvas, no audio).

export const LANE_W = 3.5;
export const ROAD_HALF = LANE_W * 1.5; // 3 lanes
export const CAR_W = 1.8;
export const CAR_L = 4.4;

export type TrafficCar = { id: number; z: number; lane: -1 | 0 | 1; v: number; paint: number; kind: "car" | "suv" | "truck" };
export const PAINTS = 6;

/** Length (m) of each traffic vehicle type, used for collisions. */
export const carLength = (c: Pick<TrafficCar, "kind">) => (c.kind === "truck" ? 10 : CAR_L);

/** Road curvature at a distance along the highway (gentle, repeating bends, |c| ≤ 0.7). */
export function curveAt(dist: number) {
  const c = Math.sin(dist / 420) * 0.5 + Math.sin(dist / 160 + 1.3) * 0.2;
  return Math.max(-0.7, Math.min(0.7, c));
}

/** Visual lateral offset of the road centre `ahead` metres in front of the car. */
export function roadOffset(dist: number, ahead: number) {
  return 0.5 * curveAt(dist) * 0.004 * ahead * ahead;
}

/**
 * Moves the car sideways. Steering (-1 left … 1 right) pushes the car across lanes,
 * scaled by speed; bends push it towards the outside so the driver must steer through them.
 */
export function lateralStep(x: number, steer: number, speed: number, dist: number, dt: number) {
  const v = Math.abs(speed);
  const steerRate = steer * Math.min(v, 40) * 0.25;
  const drift = curveAt(dist) * v * v * 0.004;
  return Math.max(-ROAD_HALF - 3, Math.min(ROAD_HALF + 3, x + (steerRate - drift) * dt));
}

const kindFor = (r: number): TrafficCar["kind"] => (r < 0.15 ? "truck" : r < 0.4 ? "suv" : "car");

export const isOffRoad = (x: number) => Math.abs(x) > ROAD_HALF - CAR_W / 2;

/** Extra drag force (N) from driving on the grass. */
export const offRoadDrag = (x: number, speed: number) => (isOffRoad(x) ? 900 + Math.abs(speed) * 60 : 0);

/** True when the player's car (at road x `px`, distance `pz`) overlaps a traffic car. */
export function collides(px: number, pz: number, car: TrafficCar) {
  return car.z - pz < CAR_L && pz - car.z < carLength(car) && Math.abs(car.lane * LANE_W - px) < CAR_W;
}

/** Keeps a few traffic cars ahead of the player, dropping ones far behind. */
export function updateTraffic(cars: TrafficCar[], pz: number, dt: number, rand = Math.random, nextId = { n: 1 }) {
  const moved = cars.map((c) => ({ ...c, z: c.z + c.v * dt })).filter((c) => c.z > pz - 60 && c.z < pz + 900);
  while (moved.length < 7) {
    const far = moved.reduce((m, c) => Math.max(m, c.z), pz + 60);
    moved.push({ id: nextId.n++, z: far + 40 + rand() * 90, lane: (Math.floor(rand() * 3) - 1) as -1 | 0 | 1, v: 16 + rand() * 14, paint: Math.floor(rand() * PAINTS), kind: kindFor(rand()) });
  }
  return moved;
}
