import { describe, expect, it } from 'vitest';
import { containsRoof, createRun, distanceToEdge, JUMP_VELOCITY, ROOF_HEIGHT, updateRun } from './core';
const step = 1 / 120;
describe('truck runner physics', () => {
  it('starts safely on the center truck and generates a reproducible route', () => {
    const run = createRun(42);
    expect(run.player.grounded).toBe(true);
    expect(containsRoof(run.trucks.find(t => t.id === run.player.truckId)!, run.player.x, run.player.z)).toBe(true);
    expect(run.trucks).toEqual(createRun(42).trucks);
  });
  it('ends an unattended run when the player falls off a roof', () => {
    const run = createRun(42);
    for (let i = 0; i < 500 && !run.over; i++) updateRun(run, { direction: 0, jump: false }, step);
    expect(run.over).toBe(true);
    expect(['road', 'truck']).toContain(run.reason);
  });
  it('supports repeated timed jumps across real gaps between moving trucks', () => {
    const run = createRun(42);
    for (let i = 0; i < 960; i++) {
      updateRun(run, { direction: 0, jump: run.player.grounded && distanceToEdge(run) < 2.4 }, step);
      if (run.over) break;
    }
    expect(run.over).toBe(false);
    expect(run.landings).toBeGreaterThanOrEqual(4);
    expect(run.distance).toBeGreaterThan(80);
  });
  it('allows steering in midair and keeps the player inside the play area', () => {
    const run = createRun(42);
    updateRun(run, { direction: 0, jump: true }, step);
    for (let i = 0; i < 25; i++) updateRun(run, { direction: 1, jump: false }, step);
    expect(run.player.grounded).toBe(false); expect(run.player.x).toBeGreaterThan(1);
    expect(run.player.x).toBeLessThanOrEqual(6.2);
    const x = run.player.x;
    updateRun(run, { direction: -1, jump: false }, step);
    expect(run.player.x).toBeLessThan(x);
    run.player.x = 6.19;
    updateRun(run, { direction: 1, jump: false }, step);
    expect(run.player.x).toBe(6.2);
  });
  it('does not allow another jump while airborne', () => {
    const run = createRun(42);
    updateRun(run, { direction: 0, jump: true }, step);
    expect(run.player.grounded).toBe(false);
    expect(run.player.vy).toBeLessThan(JUMP_VELOCITY);
    updateRun(run, { direction: 0, jump: true }, step);
    expect(run.jumps).toBe(1);
  });
  it('ends a run on side impact, rather than treating the side as a safe roof', () => {
    const run = createRun(42);
    run.player.y = 1.2; run.player.grounded = false;
    updateRun(run, { direction: 0, jump: false }, step);
    expect(run.over).toBe(true); expect(run.reason).toBe('truck');
  });
  it('collects each gem once and includes its bonus in the score', () => {
    const run = createRun(42); const truck = run.trucks.find(t => t.gem)!;
    run.player.x = truck.x; run.player.z = truck.z; run.player.y = ROOF_HEIGHT; run.player.truckId = truck.id;
    updateRun(run, { direction: 0, jump: false }, step);
    updateRun(run, { direction: 0, jump: false }, step);
    expect(run.gems).toBe(1); expect(truck.collected).toBe(true); expect(run.score).toBe(Math.floor(run.distance) + 25);
  });
  it('recycles trucks and retains an accessible route for long runs', () => {
    const run = createRun(23);
    let targetX = 0;
    for (let i = 0; i < 120 * 60 && !run.over; i++) {
      const p = run.player;
      const jump = p.grounded && distanceToEdge(run) < 2.4;
      if (jump) {
        const ahead = run.trucks.filter(t => t.z < p.z - 5).sort((a, b) => b.z - a.z);
        const firstRow = ahead.filter(t => Math.abs(t.z - ahead[0].z) < .01);
        targetX = firstRow.sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0].x;
      }
      const direction = !p.grounded && Math.abs(p.x - targetX) > .08 ? Math.sign(targetX - p.x) : 0;
      updateRun(run, { direction, jump }, step);
    }
    expect(run.over).toBe(false); expect(run.nextRow).toBeGreaterThan(25); expect(run.trucks.length).toBeLessThan(40);
  });
  it('freezes the final score and positions after game over', () => {
    const run = createRun(42); run.over = true;
    const before = JSON.stringify(run);
    updateRun(run, { direction: 1, jump: true }, step);
    expect(JSON.stringify(run)).toBe(before);
  });
});
