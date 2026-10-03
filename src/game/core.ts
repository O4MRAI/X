export type CharacterId = 'nova' | 'dash' | 'pixel';
export type Phase = 'menu' | 'playing' | 'paused' | 'over';
export type Quality = 'auto' | 'high' | 'low';
export type Truck = { id: number; x: number; z: number; width: number; length: number; height: number; color: number; gem: boolean; collected: boolean };
export type Player = { x: number; y: number; z: number; vy: number; grounded: boolean; truckId: number | null };
export type Run = { player: Player; trucks: Truck[]; distance: number; score: number; gems: number; jumps: number; landings: number; time: number; over: boolean; reason: 'road' | 'truck' | null; nextRow: number; nextId: number; seed: number; routeLane: number; jumpBuffer: number; coyote: number; lastLanded: number; chill: boolean };
export type Input = { direction: number; jump: boolean };
export const ROOF_HEIGHT = 2.5;
export const GRAVITY = 23;
export const JUMP_VELOCITY = 9.4;
export const LANES = [-3.65, 0, 3.65];
const random = (run: Run) => { run.seed = (run.seed * 1664525 + 1013904223) >>> 0; return run.seed / 4294967296; };
function addRow(run: Run, row: number) {
  const drift = random(run) < .4 ? 0 : random(run) < .5 ? -1 : 1;
  run.routeLane = Math.max(0, Math.min(2, run.routeLane + drift));
  for (let lane = 0; lane < 3; lane++) {
    if (row > 5 && lane !== run.routeLane && lane !== 1 && random(run) > .63) continue;
    run.trucks.push({ id: run.nextId++, x: LANES[lane], z: -row * 14.1 - 1.8 * run.time, width: 3.05, length: 10, height: ROOF_HEIGHT,
      color: Math.floor(random(run) * 4), gem: row > 0 && lane === run.routeLane, collected: false });
  }
}
export function createRun(seed = Date.now(), chill = false): Run {
  const run: Run = { player: { x: 0, y: ROOF_HEIGHT, z: 3, vy: 0, grounded: true, truckId: 1 }, trucks: [],
    distance: 0, score: 0, gems: 0, jumps: 0, landings: 0, time: 0, over: false, reason: null,
    nextRow: 11, nextId: 0, seed: seed >>> 0, routeLane: 1, jumpBuffer: 0, coyote: 0, lastLanded: 1, chill };
  for (let i = 0; i < 11; i++) addRow(run, i);
  return run;
}
export function containsRoof(truck: Truck, x: number, z: number, margin = .14) {
  return Math.abs(truck.x - x) <= truck.width / 2 + margin && Math.abs(truck.z - z) <= truck.length / 2 + margin;
}
export function updateRun(run: Run, input: Input, dt: number) {
  if (run.over) return;
  dt = Math.min(dt, 1 / 30);
  const p = run.player;
  run.time += dt;
  const speed = (run.chill ? 9.2 : 10.8) + Math.min(4, run.time * .023);
  const truckSpeed = 1.8;
  const previousY = p.y;
  p.z -= speed * dt;
  p.x = Math.max(-6.2, Math.min(6.2, p.x + Math.max(-1, Math.min(1, input.direction)) * (run.chill ? 5.4 : 6.4) * dt));
  run.distance += speed * dt;
  for (const truck of run.trucks) truck.z -= truckSpeed * dt;
  if (input.jump) run.jumpBuffer = .14;
  else run.jumpBuffer = Math.max(0, run.jumpBuffer - dt);
  const support = run.trucks.find(t => containsRoof(t, p.x, p.z) && Math.abs(p.y - t.height) < .15);
  if (p.grounded && !support) { p.grounded = false; p.truckId = null; run.coyote = .085; }
  if (p.grounded) run.coyote = .085;
  else run.coyote = Math.max(0, run.coyote - dt);
  if (run.jumpBuffer > 0 && (p.grounded || run.coyote > 0)) {
    p.vy = JUMP_VELOCITY; p.grounded = false; p.truckId = null; run.jumpBuffer = 0; run.coyote = 0; run.jumps++;
  }
  if (!p.grounded) {
    p.vy -= GRAVITY * dt; p.y += p.vy * dt;
    for (const truck of run.trucks) {
      if (!containsRoof(truck, p.x, p.z)) continue;
      if (p.vy <= 0 && previousY >= truck.height - .025 && p.y <= truck.height) {
        p.y = truck.height; p.vy = 0; p.grounded = true; p.truckId = truck.id;
        if (truck.id !== run.lastLanded) { run.landings++; run.lastLanded = truck.id; }
        break;
      }
      if (p.y < truck.height - .3 && p.y + 1.35 > .8 && Math.abs(p.z - truck.z) < truck.length / 2 && Math.abs(p.x - truck.x) < truck.width / 2 + .22) {
        run.over = true; run.reason = 'truck'; break;
      }
    }
  } else if (support) { p.y = support.height; p.truckId = support.id; }
  for (const t of run.trucks) {
    if (t.gem && !t.collected && Math.abs(t.x - p.x) < .85 && Math.abs(t.z - p.z) < 1 && p.y > t.height - .1 && p.y < t.height + 2.1) {
      t.collected = true; run.gems++;
    }
  }
  if (p.y <= .04) { p.y = 0; run.over = true; run.reason = 'road'; }
  run.score = Math.floor(run.distance) + run.gems * 25;
  run.trucks = run.trucks.filter(t => t.z < p.z + 22);
  while (-run.nextRow * 14.1 - truckSpeed * run.time > p.z - 140) {
    addRow(run, run.nextRow++);
  }
}
export function distanceToEdge(run: Run) {
  const truck = run.trucks.find(t => t.id === run.player.truckId);
  return truck ? run.player.z - (truck.z - truck.length / 2) : Infinity;
}
