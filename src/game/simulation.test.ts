import RAPIER from "@dimforge/rapier3d-compat";
import { beforeAll, describe, it, expect } from "vitest";
import { Simulation, initPhysics } from "./physics";
import { LEVELS } from "./levels";
import { DEFAULT_SETTINGS, MOVEMENT } from "./config";
import { idleInput } from "./input";
import { FixedClock } from "./clock";
import { toLocal, toWorld, surfaceVelocity, v } from "./math";
beforeAll(initPhysics);
function fixture() {
  const s = new Simulation(
    { ...LEVELS[0], truckCount: 1 },
    { ...DEFAULT_SETTINGS },
  );
  s.trucks[0].route = [
    { x: 2, z: 40 },
    { x: 2, z: -1500 },
  ];
  s.trucks[0].offset = 0;
  return s;
}
function placePlayer(s: Simulation, position: ReturnType<typeof v>) {
  s.player.position.copy(position);
  s.player.previous.copy(position);
  s.player.body.setTranslation(position, true);
  s.world.propagateModifiedBodyPositionsToColliders();
}
function tick(s: Simulation, n: number, input = idleInput()) {
  for (let i = 0; i < n; i++) {
    s.updateActive(MOVEMENT.step, input);
    s.step(input);
    input = { ...input, jump: false, utility: false, movementAbility: false };
  }
}
describe("first-person moving platform foundation", () => {
  it("spawns on the trailer and carries a stationary player for ten seconds", () => {
    const s = fixture();
    const start = toLocal(s.player.feet, s.trucks[0].body);
    tick(s, 600);
    const end = toLocal(s.player.feet, s.trucks[0].body);
    expect(s.outcome).toBeNull();
    expect(s.player.grounded).toBe(true);
    expect(end.distanceTo(start)).toBeLessThan(0.15);
    expect(s.player.position.z).toBeLessThan(-140);
    s.dispose();
  });
  it("inherits the platform velocity exactly once on a jump", () => {
    const s = fixture();
    tick(s, 60);
    const speed = surfaceVelocity(s.trucks[0].body, s.player.feet);
    tick(s, 1, { ...idleInput(), jump: true });
    expect(s.player.worldVelocity.z).toBeCloseTo(speed.z, 0);
    const z = s.player.worldVelocity.z;
    tick(s, 10);
    expect(s.player.worldVelocity.z).toBeCloseTo(z, 4);
    expect(s.player.jumps).toBe(1);
    expect(s.player.grounded).toBe(false);
    s.dispose();
  });
  it("carries a player through a steering turn in local roof coordinates", () => {
    const s = fixture();
    s.trucks[0].route = [
      { x: 2, z: 40 },
      { x: 2, z: -65 },
      { x: 45, z: -200 },
      { x: 45, z: -500 },
    ];
    const local = toLocal(s.player.feet, s.trucks[0].body);
    tick(s, 550);
    expect(s.outcome).toBeNull();
    expect(s.player.grounded).toBe(true);
    expect(
      toLocal(s.player.feet, s.trucks[0].body).distanceTo(local),
    ).toBeLessThan(0.2);
    expect(s.trucks[0].body.translation().x).toBeGreaterThan(15);
    s.dispose();
  });
  it("normalizes diagonal walking and preserves airborne momentum without input", () => {
    const s = fixture();
    tick(s, 8, { ...idleInput(), x: 1, z: -1 });
    expect(s.player.relativeVelocity.length()).toBeCloseTo(9, 3);
    tick(s, 1, { ...idleInput(), jump: true });
    const before = s.player.worldVelocity.clone();
    tick(s, 8);
    expect(s.player.worldVelocity.x).toBeCloseTo(before.x, 4);
    expect(s.player.worldVelocity.z).toBeCloseTo(before.z, 4);
    s.dispose();
  });
  it("cannot create endless jumps and allows just one equipped air jump", () => {
    const s = fixture();
    tick(s, 1, { ...idleInput(), jump: true });
    tick(s, 1, { ...idleInput(), jump: true });
    expect(s.player.jumps).toBe(1);
    s.settings.movement = "double";
    tick(s, 1, { ...idleInput(), jump: true });
    tick(s, 1, { ...idleInput(), jump: true });
    expect(s.player.jumps).toBe(2);
    s.dispose();
  });
  it("requires actual finish overlap, and kills contact with the road", () => {
    const s = fixture();
    tick(s, 1);
    expect(s.outcome).toBeNull();
    placePlayer(s, v(0, 1, -100));
    tick(s, 1);
    expect(s.outcome).toBe("failed");
    s.dispose();
    const f = fixture();
    placePlayer(f, v(0, 5, -f.level.length));
    tick(f, 1);
    expect(f.outcome).toBe("completed");
    f.dispose();
  });
  it("keeps simulation time separate from active time during slow motion", () => {
    const s = fixture();
    s.settings.utility = "slow";
    s.updateActive(0.1, { ...idleInput(), utility: true });
    expect(s.timeScale).toBeLessThan(1);
    const active = s.activeTime;
    const time = s.time;
    expect(active).toBe(0.1);
    expect(time).toBe(0);
    s.dispose();
  });
  it("retries allocate a fresh finite world without stale bodies", () => {
    for (let i = 0; i < 20; i++) {
      const s = fixture();
      expect(s.world.bodies.len()).toBe(4);
      expect(s.roles.size).toBe(10);
      tick(s, 2);
      s.dispose();
      expect(s.roles.size).toBe(0);
    }
  });
});
describe("tutorial playability", () => {
  it("can finish level one through an actual truck transfer in basic mode", () => {
    const s = new Simulation(LEVELS[0], { ...DEFAULT_SETTINGS });
    tick(s, 26, { ...idleInput(), z: -1, sprint: true });
    tick(s, 1, { ...idleInput(), z: -1, sprint: true, jump: true });
    tick(s, 65, { ...idleInput(), z: -1, sprint: true });
    tick(s, 2400);
    expect(s.player.visited.size).toBeGreaterThan(1);
    expect(s.outcome).toBe("completed");
    expect(s.activeTime).toBeGreaterThan(20);
    expect(s.activeTime).toBeLessThan(60);
    s.dispose();
  });
  it("cannot walk across the open gap to the next truck", () => {
    const s = new Simulation(LEVELS[0], { ...DEFAULT_SETTINGS });
    tick(s, 180, { ...idleInput(), z: -1, sprint: true });
    expect(s.outcome).toBe("failed");
    expect(s.player.visited.size).toBe(1);
    expect(s.player.jumps).toBe(0);
    s.dispose();
  });
  it("the starter diverts away from the finish instead of granting an idle win", () => {
    const s = new Simulation(LEVELS[0], { ...DEFAULT_SETTINGS });
    tick(s, 3600);
    expect(s.outcome).not.toBe("completed");
    s.dispose();
  });
});

describe("movement edge cases and frame rates", () => {
  it("allows coyote jump after stepping off, but not long after falling", () => {
    const s = fixture();
    while (s.player.grounded && !s.outcome)
      tick(s, 1, { ...idleInput(), x: 1 });
    expect(s.player.coyote).toBeGreaterThan(0);
    tick(s, 1, { ...idleInput(), jump: true });
    expect(s.player.jumps).toBe(1);
    s.dispose();
  });
  it("buffers a jump just before landing", () => {
    const s = fixture();
    tick(s, 1, { ...idleInput(), jump: true });
    tick(s, 51);
    tick(s, 1, { ...idleInput(), jump: true });
    tick(s, 12);
    expect(s.player.jumps).toBe(2);
    s.dispose();
  });
  it("a trailer side never becomes a landing surface or grants an air jump", () => {
    const s = fixture();
    s.player.grounded = false;
    s.player.support = null;
    s.player.coyote = 0;
    const p = s.trucks[0].body.translation();
    placePlayer(s, v(p.x + 1.8, 2.5, p.z + 2));
    tick(s, 1, { ...idleInput(), x: -1, jump: true });
    expect(s.player.grounded).toBe(false);
    expect(s.player.jumps).toBe(0);
    s.dispose();
  });
  it("switches support on a faster/slower truck without multiplying momentum", () => {
    const s = new Simulation(LEVELS[2], { ...DEFAULT_SETTINGS });
    tick(s, 32, { ...idleInput(), z: -1, sprint: true });
    tick(s, 1, { ...idleInput(), z: -1, sprint: true, jump: true });
    tick(s, 65, { ...idleInput(), z: -1, sprint: true });
    tick(s, 10);
    expect(s.outcome).toBeNull();
    expect(s.player.landings).toBe(1);
    expect(s.player.support).not.toBe(s.trucks[0]);
    expect(s.player.worldVelocity.length()).toBeLessThan(35);
    s.dispose();
  });
  it("fixed simulation agrees at 30, 60, and 144 rendering frames per second", () => {
    const results = [30, 60, 144].map((fps) => {
      const s = fixture(),
        c = new FixedClock();
      for (let i = 0; i < fps * 2; i++)
        c.advance(1 / fps, 1, () => s.step(idleInput()));
      const z = s.player.position.z;
      s.dispose();
      return z;
    });
    expect(results[0]).toBeCloseTo(results[1], 5);
    expect(results[2]).toBeCloseTo(results[1], 5);
  });
  it("slow motion scales the whole world, and a long stall has bounded catch-up", () => {
    const s = fixture(),
      c = new FixedClock();
    for (let i = 0; i < 60; i++)
      c.advance(1 / 60, 0.28, () => s.step(idleInput()));
    expect(s.time).toBeCloseTo(0.2666667, 4);
    expect(c.advance(10, 1, () => s.step(idleInput()))).toBe(6);
    s.dispose();
  });
});
describe("authored campaign routes", () => {
  it.each(LEVELS)(
    "level $id has a reachable finish using basic movement",
    (level) => {
      const s = new Simulation(level, { ...DEFAULT_SETTINGS });
      tick(s, 32, { ...idleInput(), z: -1, sprint: true });
      tick(s, 1, {
        ...idleInput(),
        z: -1,
        sprint: true,
        x: level.id === 9 ? 0.65 : 0,
        jump: true,
      });
      tick(s, 65, {
        ...idleInput(),
        z: -1,
        sprint: true,
        x: level.id === 9 ? 0.65 : 0,
      });
      if (level.id === 6 || level.id === 10) {
        tick(s, level.id === 6 ? 100 : 150);
        tick(s, level.id === 6 ? 30 : 26, {
          ...idleInput(),
          z: -1,
          sprint: true,
        });
        tick(s, 1, {
          ...idleInput(),
          z: -1,
          sprint: true,
          x: -0.65,
          jump: true,
        });
        tick(s, 65, { ...idleInput(), z: -1, sprint: true, x: -0.65 });
      }
      for (let i = 0; i < 3000 && !s.outcome; i++) {
        const near =
          s.player.position.z < -level.length + 30 &&
          Math.abs(s.player.position.x - level.finishX) > 9;
        tick(
          s,
          1,
          near
            ? {
                ...idleInput(),
                x: Math.sign(level.finishX - s.player.position.x),
                z: -1,
                sprint: true,
                jump: s.player.grounded,
              }
            : idleInput(),
        );
      }

      expect(s.outcome).toBe("completed");
      expect(s.player.visited.size).toBeGreaterThan(1);
      expect(s.time).toBeLessThan(60);
      s.dispose();
    },
  );
});
describe("implemented abilities and physical vehicles", () => {
  it("dash adds one bounded impulse and does not create upward flight", () => {
    const s = fixture();
    s.settings.movement = "dash";
    tick(s, 1, { ...idleInput(), jump: true });
    const vertical = s.player.worldVelocity.y;
    tick(s, 1, { ...idleInput(), movementAbility: true });
    const speed = s.player.worldVelocity.z;
    expect(speed).toBeLessThan(-30);
    expect(s.player.worldVelocity.y).toBeLessThan(vertical);
    expect(s.abilityCooldown).toBeGreaterThan(2);
    tick(s, 1, { ...idleInput(), movementAbility: true });
    expect(s.player.worldVelocity.z).toBeCloseTo(speed, 3);
    s.dispose();
  });
  it("grapple attaches to an actual truck, pulls through forces, and expires in active time", () => {
    const s = new Simulation(LEVELS[0], {
      ...DEFAULT_SETTINGS,
      movement: "grapple",
    });
    tick(s, 1, { ...idleInput(), movementAbility: true, jump: true });
    expect(s.player.grapple).not.toBeNull();
    const start = s.player.worldVelocity.z;
    tick(s, 4);
    expect(s.player.worldVelocity.z).toBeLessThan(start);
    s.updateActive(1, idleInput());
    expect(s.player.grapple).toBeNull();
    expect(s.abilityCooldown).toBeGreaterThan(2);
    s.dispose();
  });
  it("an obstacle blocks the grappling ray instead of hooking through it", () => {
    const s = new Simulation(LEVELS[0], {
      ...DEFAULT_SETTINGS,
      movement: "grapple",
    });
    const b = s.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(2, 5, -2),
    );
    const c = s.world.createCollider(RAPIER.ColliderDesc.cuboid(4, 4, 0.5), b);
    s.roles.set(c.handle, { kind: "lethal" });
    tick(s, 1, { ...idleInput(), movementAbility: true });
    expect(s.player.grapple).toBeNull();
    expect(s.abilityCooldown).toBe(0);
    s.dispose();
  });
  it("propulsion stops while a truck is airborne or overturned", () => {
    const s = fixture();
    s.trucks[0].body.setTranslation({ x: 2, y: 40, z: 0 }, true);
    tick(s, 1);
    expect(s.trucks[0].drive).toBe(false);
    expect(s.trucks[0].body.linvel().y).toBeLessThan(0);
    s.trucks[0].body.setTranslation({ x: 2, y: 5, z: 0 }, true);
    s.trucks[0].body.setRotation({ x: 1, y: 0, z: 0, w: 0 }, true);
    tick(s, 1);
    expect(s.trucks[0].drive).toBe(false);
    s.dispose();
  });
  it("dynamic trucks react to an impulse rather than following teleported paths", () => {
    const s = fixture(),
      truck = s.trucks[0];
    truck.body.applyImpulse({ x: truck.body.mass() * 8, y: 0, z: 0 }, true);
    tick(s, 15);
    expect(truck.body.translation().x).toBeGreaterThan(3);
    expect(truck.body.linvel().x).toBeGreaterThan(0);
    s.dispose();
  });
});

it("takeoff samples angular velocity at the carried contact point", () => {
  const s = fixture();
  s.trucks[0].body.setAngvel({ x: 0, y: 0.4, z: 0 }, true);
  tick(s, 1, { ...idleInput(), jump: true });
  const expected = surfaceVelocity(
    s.trucks[0].body,
    toWorld(s.player.contactLocal, s.trucks[0].body),
  );
  expect(s.player.worldVelocity.x).toBeCloseTo(expected.x, 5);
  expect(s.player.worldVelocity.z).toBeCloseTo(expected.z, 5);
  s.dispose();
});
