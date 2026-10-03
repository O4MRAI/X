export type Point = { x: number; z: number };
export type Obstacle = {
  type: "wall" | "barrier" | "laser" | "ramp";
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  angle?: number;
  period?: number;
  travel?: number;
};
export type Level = {
  id: number;
  name: string;
  subtitle: string;
  seed: number;
  length: number;
  speed: number;
  truckCount: number;
  roadWidth: number;
  routes: Point[][];
  obstacles: Obstacle[];
  gaps: [number, number][];
  color: number;
  finishX: number;
  finishY: number;
  startX: number;
  spread: number;
  rowSpacing: number;
  speedVariation: number;
  crossConvoy?: boolean;
  crossDirection?: "left" | "right";
};
const straight = (length: number): Point[] => [
  { x: 0, z: 30 },
  { x: 0, z: -length - 50 },
];
const base = (
  id: number,
  name: string,
  subtitle: string,
  overrides: Partial<Level> = {},
): Level => ({
  id,
  name,
  subtitle,
  seed: 107 + id * 991,
  length: 440,
  speed: 20,
  truckCount: 25,
  roadWidth: 32,
  routes: [straight(overrides.length ?? 440)],
  obstacles: [],
  gaps: [],
  color: 0xffca22,
  finishX: 0,
  finishY: 4,
  startX: 2,
  spread: 7,
  rowSpacing: 22,
  speedVariation: 0.5,
  ...overrides,
});
export const LEVELS: Level[] = [
  base(1, "The first leap", "Find your feet. Leave your first truck behind.", {
    speed: 18,
    speedVariation: 0.2,
  }),
  base(2, "Open water", "Wider spacing. Commit to the jump.", {
    spread: 9,
    rowSpacing: 24,
    length: 470,
    speed: 19,
  }),
  base(3, "Passing lane", "Read their speed before you leap.", {
    speedVariation: 3.2,
    speed: 21,
    length: 500,
  }),
  base(4, "The long bend", "Keep your horizon steady as the convoy turns.", {
    routes: [
      [
        { x: 0, z: 30 },
        { x: 0, z: -100 },
        { x: 45, z: -210 },
        { x: 45, z: -510 },
      ],
    ],
    finishX: 45,
    speed: 19,
  }),
  base(5, "Bottle neck", "Pick a roof before the trucks crowd together.", {
    roadWidth: 22,
    obstacles: [
      { type: "wall", x: -11, y: 4, z: -180, width: 12, height: 8, depth: 26 },
      { type: "wall", x: 11, y: 4, z: -180, width: 12, height: 8, depth: 26 },
    ],
    speed: 20,
  }),
  base(6, "Cross traffic", "Two convoys. One right moment.", {
    crossConvoy: true,
    truckCount: 29,
    speed: 21,
    length: 480,
  }),
  base(7, "Air freight", "Ride the ramp. Jump before the drop.", {
    speed: 24,
    length: 480,
    obstacles: [
      {
        type: "ramp",
        x: 0,
        y: 2,
        z: -142,
        width: 28,
        height: 0.5,
        depth: 22,
        angle: Math.atan(4 / 22),
      },
    ],
    gaps: [[-165, -153]],
  }),
  base(8, "Red light", "Green is safe. Red is not.", {
    length: 480,
    obstacles: [
      {
        type: "laser",
        x: 0,
        y: 5,
        z: -155,
        width: 26,
        height: 8,
        depth: 0.6,
        period: 4.5,
      },
      {
        type: "barrier",
        x: 0,
        y: 6.2,
        z: -260,
        width: 5,
        height: 4,
        depth: 2,
        period: 5,
        travel: 13,
      },
    ],
    speed: 19,
  }),
  base(9, "Split decision", "A tight shortcut or a wide detour. Your call.", {
    length: 500,
    routes: [
      [
        { x: 0, z: 30 },
        { x: 0, z: -100 },
        { x: -14, z: -190 },
        { x: 0, z: -330 },
        { x: 0, z: -550 },
      ],
      [
        { x: 0, z: 30 },
        { x: 0, z: -100 },
        { x: 33, z: -180 },
        { x: 33, z: -290 },
        { x: 0, z: -390 },
        { x: 0, z: -550 },
      ],
    ],
    obstacles: [
      { type: "wall", x: -6, y: 3, z: -240, width: 4, height: 6, depth: 40 },
    ],
    speed: 22,
  }),
  base(10, "Convoy leap", "Turns, cross traffic and one final flight.", {
    length: 580,
    speed: 23,
    crossConvoy: true,
    truckCount: 33,
    crossDirection: "right",
    routes: [
      [
        { x: 0, z: 30 },
        { x: 0, z: -160 },
        { x: 35, z: -270 },
        { x: 35, z: -430 },
        { x: 0, z: -580 },
        { x: 0, z: -650 },
      ],
    ],
    obstacles: [
      {
        type: "ramp",
        x: 35,
        y: 2,
        z: -360,
        width: 88,
        height: 0.5,
        depth: 22,
        angle: Math.atan(4 / 22),
      },
      {
        type: "barrier",
        x: 35,
        y: 6.2,
        z: -460,
        width: 5,
        height: 4,
        depth: 2,
        travel: 10,
        period: 5,
      },
    ],
    gaps: [[-383, -371]],
    color: 0xf4ce59,
  }),
];
export function floorSegments(level: Level) {
  const boundaries: [number, number][] = [];
  let back = 100;
  for (const [front, end] of [...level.gaps].sort((a, b) => b[1] - a[1])) {
    boundaries.push([end, back]);
    back = front;
  }
  boundaries.push([-level.length - 140, back]);
  return boundaries;
}
