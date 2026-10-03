import { WORLD } from "./config";
import { type Level, type Point } from "./levels";

export type TruckSpawn = {
  x: number;
  z: number;
  yaw: number;
  offset: number;
  route: Point[];
};

function randomSequence(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// Expanded oriented footprints leave real air around each semi at the start.
// The cab/trailer span 15m; the roof is 11m. Later collisions remain physical.
function separated(a: TruckSpawn, b: TruckSpawn) {
  const ax = [Math.cos(a.yaw), -Math.sin(a.yaw)],
    az = [Math.sin(a.yaw), Math.cos(a.yaw)],
    bx = [Math.cos(b.yaw), -Math.sin(b.yaw)],
    bz = [Math.sin(b.yaw), Math.cos(b.yaw)];
  const dot = (u: number[], w: number[]) => u[0] * w[0] + u[1] * w[1];
  for (const axis of [ax, az, bx, bz]) {
    const distance = Math.abs((b.x - a.x) * axis[0] + (b.z - a.z) * axis[1]);
    const radiusA =
      3.1 * Math.abs(dot(ax, axis)) + 9.6 * Math.abs(dot(az, axis));
    const radiusB =
      3.1 * Math.abs(dot(bx, axis)) + 9.6 * Math.abs(dot(bz, axis));
    if (distance >= radiusA + radiusB) return true;
  }
  return false;
}

function flowingRoute(route: Point[], phase: number, amplitude: number) {
  const result: Point[] = [{ ...route[0] }];
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1],
      b = route[i];
    const dx = b.x - a.x,
      dz = b.z - a.z,
      length = Math.hypot(dx, dz);
    const segments = Math.max(1, Math.ceil(length / 90));
    for (let k = 1; k < segments; k++) {
      const t = k / segments;
      const drift =
        amplitude * Math.sin(Math.PI * t) * Math.sin(phase + t * Math.PI * 2);
      result.push({
        x: a.x + dx * t - (dz / length) * drift,
        z: a.z + dz * t + (dx / length) * drift,
      });
    }
    result.push({ ...b });
  }
  return result;
}

function routePose(route: Point[], z: number) {
  let a = route[0],
    b = route[1];
  for (let i = 1; i < route.length; i++) {
    a = route[i - 1];
    b = route[i];
    if (z >= b.z) break;
  }
  const t =
    Math.abs(b.z - a.z) < 0.001
      ? 0
      : Math.max(0, Math.min(1, (z - a.z) / (b.z - a.z)));
  return {
    x: a.x + (b.x - a.x) * t,
    yaw: Math.atan2(-(b.x - a.x), -(b.z - a.z)),
  };
}

function clearOfCourse(spawn: TruckSpawn, level: Level) {
  const width =
    1.6 * Math.abs(Math.cos(spawn.yaw)) + 7.8 * Math.abs(Math.sin(spawn.yaw));
  const length =
    7.8 * Math.abs(Math.cos(spawn.yaw)) + 1.6 * Math.abs(Math.sin(spawn.yaw));
  if (
    Math.abs(spawn.x) + width > WORLD.halfWidth ||
    spawn.z + length > 100 ||
    spawn.z - length < -level.length + 20
  )
    return false;
  if (
    level.gaps.some(
      ([front, back]) => spawn.z + length > front && spawn.z - length < back,
    )
  )
    return false;
  return !level.obstacles.some((o) => {
    if (o.type === "laser" || o.y - o.height / 2 > 4.2) return false;
    const depth =
      (Math.abs(Math.cos(o.angle || 0)) * o.depth) / 2 +
      (Math.abs(Math.sin(o.angle || 0)) * o.height) / 2;
    return (
      Math.abs(spawn.x - o.x) < width + o.width / 2 + 0.5 &&
      Math.abs(spawn.z - o.z) < length + depth + 0.5
    );
  });
}

/** Seeded, staggered groups rather than four uniform columns of trucks. */
export function createConvoy(level: Level): TruckSpawn[] {
  const count = level.truckCount - (level.crossConvoy ? 6 : 0);
  const rng = randomSequence(level.seed ^ 0x79a45f1b);
  const routeFor = (index: number) =>
    level.routes[((index - 1) % 4) % level.routes.length];
  const starter: TruckSpawn = {
    x: level.startX,
    z: 8,
    yaw: 0,
    offset: level.startX,
    route: [],
  };
  const occupied = [starter];
  const result: TruckSpawn[] = new Array(Math.max(0, count - 1));
  // A legible first transfer, plus an escape roof at the authored intersection.
  // The rest of the convoy has independent offsets, headings and steering lines.
  const anchors = [
    { index: 3, x: level.startX, z: 8 - level.rowSpacing },
    ...(level.crossConvoy
      ? [
          {
            index: 6,
            x: level.startX - level.spread,
            z: 8 - 2 * level.rowSpacing,
          },
        ]
      : []),
    ...(level.id === 9
      ? [{ index: 4, x: level.startX + level.spread, z: 8 - level.rowSpacing }]
      : []),
  ];
  const introOffsets = anchors.filter((a) => a.index < count).map((a) => a.x);
  const clearIntroLane = (offset: number) =>
    introOffsets.every((x) => Math.abs(offset - x) >= 6.8);
  for (const anchor of anchors) {
    if (anchor.index >= count) continue;
    const spawn = {
      x: anchor.x,
      z: anchor.z,
      yaw: 0,
      offset: anchor.x,
      route: routeFor(anchor.index),
    };
    result[anchor.index - 1] = spawn;
    occupied.push(spawn);
  }
  let group = 0,
    groupSize = 2 + Math.floor(rng() * 3),
    inGroup = 0;
  for (let index = 1; index < count; index++) {
    if (result[index - 1]) continue;
    const route = routeFor(index);
    let spawn: TruckSpawn | undefined;
    // Vary both axes within each group; rejection checks actual rotated spacing.
    for (let attempt = 0; attempt < 80; attempt++) {
      const width = level.spread * 2.35;
      const offset = level.startX - level.spread / 2 + (rng() * 2 - 1) * width;
      const z =
        8 -
        (group + 1) * level.rowSpacing +
        (rng() - 0.5) * level.rowSpacing * 1.2;
      if (!clearIntroLane(offset)) continue;
      const pose = routePose(route, z);
      const candidate: TruckSpawn = {
        x: pose.x + offset,
        z,
        offset,
        yaw: pose.yaw + (rng() * 2 - 1) * 0.16,
        route,
      };
      if (
        clearOfCourse(candidate, level) &&
        occupied.every((other) => separated(candidate, other))
      ) {
        spawn = candidate;
        break;
      }
    }
    if (!spawn) {
      // Finite fallback widens this group forward, never into another truck.
      let offset = level.startX + (rng() * 2 - 1) * level.spread * 2;
      while (!clearIntroLane(offset))
        offset += offset < level.startX ? -level.spread : level.spread;
      let z = Math.min(...occupied.map((t) => t.z)) - level.rowSpacing - 6;
      for (let attempt = 0; attempt < 100; attempt++, z -= level.rowSpacing) {
        const pose = routePose(route, z);
        const candidate = {
          x: pose.x + offset,
          z,
          offset,
          yaw: pose.yaw,
          route,
        };
        if (
          clearOfCourse(candidate, level) &&
          occupied.every((other) => separated(candidate, other))
        ) {
          spawn = candidate;
          break;
        }
      }
      if (!spawn)
        throw new Error(`No clear convoy placement in level ${level.id}`);
    }
    spawn.route = flowingRoute(route, rng() * Math.PI * 2, 0.8 + rng() * 1.2);
    occupied.push(spawn);
    result[index - 1] = spawn;
    if (++inGroup >= groupSize) {
      group++;
      inGroup = 0;
      groupSize = 2 + Math.floor(rng() * 3);
    }
  }
  return result;
}
