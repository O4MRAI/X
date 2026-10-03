import RAPIER, {
  type Collider,
  type RigidBody,
} from "@dimforge/rapier3d-compat";
import { Quaternion, Vector3 } from "three";
import { MOVEMENT, type Settings } from "./config";
import { floorSegments, type Level, type Point, type Obstacle } from "./levels";
import { PlayerController } from "./player";
import { type Controls } from "./input";
import { v } from "./math";
let initialization: Promise<void> | null = null;
export async function initPhysics() {
  initialization ??= RAPIER.init();
  await initialization;
}
export type Role = {
  kind: "truck" | "wheel" | "ground" | "ramp" | "lethal" | "finish";
  truck?: Truck;
};
export type Truck = {
  body: RigidBody;
  roof: Collider;
  route: Point[];
  waypoint: number;
  speed: number;
  offset: number;
  previous: Vector3;
  previousRotation: Quaternion;
  drive: boolean;
};
export type PhysicalObstacle = {
  definition: Obstacle;
  body: RigidBody;
  collider: Collider;
  active: boolean;
};
export class Simulation {
  readonly world = new RAPIER.World({ x: 0, y: -MOVEMENT.gravity, z: 0 });
  private events = new RAPIER.EventQueue(true);
  crashes = 0;
  private lastCrash = -10;
  readonly roles = new Map<number, Role>();
  readonly trucks: Truck[] = [];
  readonly obstacles: PhysicalObstacle[] = [];
  readonly player: PlayerController;
  readonly finish: Collider;
  time = 0;
  activeTime = 0;
  slowCharge = 1;
  slowRemaining = 0;
  timeScale = 1;
  abilityCooldown = 0;
  outcome: "failed" | "completed" | null = null;
  reason = "";
  private randomState: number;
  constructor(
    readonly level: Level,
    public settings: Settings,
  ) {
    this.world.timestep = MOVEMENT.step;
    this.world.integrationParameters.numSolverIterations = 6;
    this.randomState = level.seed;
    for (const [front, back] of floorSegments(level)) {
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(
          0,
          -0.25,
          (front + back) / 2,
        ),
      );
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(160, 0.25, (back - front) / 2).setFriction(
          0.15,
        ),
        body,
      );
      this.roles.set(collider.handle, { kind: "ground" });
    }
    for (const def of level.obstacles) {
      const moving = def.type === "barrier";
      const desc = moving
        ? RAPIER.RigidBodyDesc.kinematicPositionBased()
        : RAPIER.RigidBodyDesc.fixed();
      desc.setTranslation(def.x, def.y, def.z);
      if (def.angle)
        desc.setRotation(
          new Quaternion().setFromAxisAngle(v(1, 0, 0), def.angle),
        );
      const body = this.world.createRigidBody(desc);
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(
          def.width / 2,
          def.height / 2,
          def.depth / 2,
        ).setFriction(0.2),
        body,
      );
      if (def.type === "laser") collider.setSensor(true);
      this.roles.set(collider.handle, {
        kind: def.type === "ramp" ? "ramp" : "lethal",
      });
      this.obstacles.push({ definition: def, body, collider, active: true });
    }
    const starterRoute = [
      { x: 0, z: 40 },
      { x: 0, z: -150 },
      { x: 32, z: -235 },
    ];
    this.addTruck(level.startX, 8, level.speed, starterRoute, level.startX);
    for (let i = 1; i < level.truckCount; i++) {
      if (level.crossConvoy && i > level.truckCount - 7) {
        const row = i - (level.truckCount - 6),
          direction = level.crossDirection === "right" ? -1 : 1;
        this.addTruck(
          direction * (80 + row * level.rowSpacing),
          -165,
          level.speed + 1,
          [
            { x: direction * 100, z: -165 },
            { x: -direction * 120, z: -165 },
          ],
          0,
          (direction * Math.PI) / 2,
        );
        continue;
      }
      const column = (i - 1) % 4;
      const row = Math.floor((i - 1) / 4);
      // Stagger the tutorial's outside trucks while keeping its central jump route.
      const outside = level.id === 1 && (column === 0 || column === 3);
      const x = level.startX + (column - 2) * level.spread;
      const stagger = outside ? (column === 0 ? 5 : -4) : 0;
      const speed =
        level.speed + (this.random() - 0.5) * 2 * level.speedVariation;
      this.addTruck(
        x,
        8 - (row + 1) * level.rowSpacing + stagger,
        speed,
        level.routes[column % level.routes.length],
        x,
        outside ? (column === 0 ? 0.09 : -0.09) : 0,
      );
    }
    this.world.step();
    this.player = new PlayerController(this, this.trucks[0]);
    const finishBody = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(
        level.finishX,
        level.finishY + 1,
        -level.length,
      ),
    );
    this.finish = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(11, 4, 1.5).setSensor(true),
      finishBody,
    );
    this.roles.set(this.finish.handle, { kind: "finish" });
    this.world.step();
    this.player.initializeSupport(this.trucks[0]);
  }
  private random() {
    this.randomState = (this.randomState * 1664525 + 1013904223) >>> 0;
    return this.randomState / 4294967296;
  }
  private addTruck(
    x: number,
    z: number,
    speed: number,
    route: Point[],
    offset: number,
    yaw = 0,
  ) {
    const rotation = new Quaternion().setFromAxisAngle(v(0, 1, 0), yaw);
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, 0.055, z)
        .setRotation(rotation)
        .setCcdEnabled(true)
        .setLinearDamping(0.08)
        .setAngularDamping(0.65)
        .setCanSleep(false),
    );
    const roof = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(1.5, 1.55, 5.5)
        .setTranslation(0, 2.45, 2)
        .setDensity(25)
        .setFriction(0.25)
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(50000),
      body,
    );
    const cab = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(1.45, 1.12, 2)
        .setTranslation(0, 1.85, -5.5)
        .setDensity(40)
        .setFriction(0.25),
      body,
    );
    const truck: Truck = {
      body,
      roof,
      route: route.map((p) => ({ x: p.x, z: p.z })),
      waypoint: 1,
      speed,
      offset,
      previous: v(x, 0.055, z),
      previousRotation: rotation.clone(),
      drive: true,
    };
    this.roles.set(roof.handle, { kind: "truck", truck });
    this.roles.set(cab.handle, { kind: "truck", truck });
    for (const wx of [-1.35, 1.35])
      for (const wz of [-5.5, 0.2, 5.8]) {
        const c = this.world.createCollider(
          RAPIER.ColliderDesc.ball(0.65)
            .setTranslation(wx, 0.67, wz)
            .setDensity(8)
            .setFriction(0.12),
          body,
        );
        this.roles.set(c.handle, { kind: "wheel", truck });
      }
    const f = v(0, 0, -1).applyQuaternion(rotation);
    body.setLinvel(f.multiplyScalar(speed), true);
    this.trucks.push(truck);
  }
  private driveTruck(truck: Truck) {
    const body = truck.body;
    const pos = body.translation();
    truck.previous.copy(pos);
    truck.previousRotation.copy(body.rotation());
    const q = new Quaternion().copy(body.rotation()),
      up = v(0, 1, 0).applyQuaternion(q),
      forward = v(0, 0, -1).applyQuaternion(q);
    const ground = this.world.castRay(
      new RAPIER.Ray(
        { x: pos.x, y: pos.y + 0.9, z: pos.z },
        { x: 0, y: -1, z: 0 },
      ),
      1.5,
      true,
      undefined,
      undefined,
      undefined,
      body,
      (c) => ["ground", "ramp"].includes(this.roles.get(c.handle)?.kind || ""),
    );
    truck.drive = !!ground && up.y > 0.55;
    if (!truck.drive) return;
    const passed = () => {
      const a = truck.route[truck.waypoint - 1],
        b = truck.route[truck.waypoint],
        dx = b.x - a.x,
        dz = b.z - a.z;
      return (
        ((pos.x - a.x - truck.offset) * dx + (pos.z - a.z) * dz) /
          Math.max(0.001, dx * dx + dz * dz) >=
        1
      );
    };
    let target = truck.route[truck.waypoint];
    let tx = target.x + truck.offset,
      tz = target.z;
    if (
      (Math.hypot(tx - pos.x, tz - pos.z) < 20 || passed()) &&
      truck.waypoint < truck.route.length - 1
    ) {
      target = truck.route[++truck.waypoint];
      tx = target.x + truck.offset;
      tz = target.z;
    }
    const atEnd =
      truck.waypoint === truck.route.length - 1 &&
      (Math.hypot(tx - pos.x, tz - pos.z) < 14 || passed());
    const yaw = Math.atan2(-forward.x, -forward.z);
    const desiredYaw = atEnd ? yaw : Math.atan2(-(tx - pos.x), -(tz - pos.z));
    let error = desiredYaw - yaw;
    error = Math.atan2(Math.sin(error), Math.cos(error));
    const vel = body.linvel(),
      ang = body.angvel(),
      mass = body.mass();
    const currentSpeed = vel.x * forward.x + vel.z * forward.z;
    const force =
      Math.max(
        -18,
        Math.min(
          18,
          ((atEnd ? 0 : truck.speed) - currentSpeed) * 4 + (atEnd ? 0 : 5),
        ),
      ) * mass;
    const right = v(1, 0, 0).applyQuaternion(q),
      side = vel.x * right.x + vel.z * right.z;
    body.addForce(
      {
        x: forward.x * force - right.x * side * mass * 3.5,
        y: 0,
        z: forward.z * force - right.z * side * mass * 3.5,
      },
      true,
    );
    body.addTorque(
      {
        x: (up.z * 4 - ang.x * 1.4) * mass * 7,
        y: (Math.max(-0.45, Math.min(0.45, error)) * 4 - ang.y * 3) * mass * 13,
        z: (-up.x * 4 - ang.z * 1.4) * mass * 7,
      },
      true,
    );
  }
  updateActive(dt: number, input: Controls) {
    if (this.outcome) return;
    this.activeTime += dt;
    this.abilityCooldown = Math.max(0, this.abilityCooldown - dt);
    if (
      input.utility &&
      this.settings.utility === "slow" &&
      this.slowCharge > 0.98 &&
      this.slowRemaining <= 0
    ) {
      this.slowRemaining = MOVEMENT.slowDuration;
      this.slowCharge = 0;
    }
    if (this.slowRemaining > 0)
      this.slowRemaining = Math.max(0, this.slowRemaining - dt);
    else
      this.slowCharge = Math.min(
        1,
        this.slowCharge + dt / MOVEMENT.slowRecharge,
      );
    const target = this.slowRemaining > 0 ? MOVEMENT.slowScale : 1;
    this.timeScale += (target - this.timeScale) * (1 - Math.exp(-dt * 12));
    this.player.updateAbilityClock(dt);
  }
  step(input: Controls, dt = MOVEMENT.step) {
    if (this.outcome) return;
    this.time += dt;
    for (const truck of this.trucks) {
      truck.body.resetForces(true);
      truck.body.resetTorques(true);
      this.driveTruck(truck);
    }
    for (const obstacle of this.obstacles) {
      const def = obstacle.definition;
      if (def.type === "barrier")
        obstacle.body.setNextKinematicTranslation({
          x:
            def.x +
            Math.sin((this.time * 2 * Math.PI) / (def.period || 5)) *
              (def.travel || 10),
          y: def.y,
          z: def.z,
        });
      if (def.type === "laser") {
        obstacle.active =
          this.time % (def.period || 4) < (def.period || 4) * 0.55;
        obstacle.collider.setEnabled(obstacle.active);
      }
    }
    this.world.timestep = dt;
    this.world.step(this.events);
    this.events.drainContactForceEvents((event) => {
      const a = this.roles.get(event.collider1())?.truck,
        b = this.roles.get(event.collider2())?.truck;
      if (
        a &&
        b &&
        a !== b &&
        this.time - this.lastCrash > 0.25 &&
        v(
          a.body.translation().x,
          a.body.translation().y,
          a.body.translation().z,
        ).distanceTo(this.player.position) < 45
      ) {
        this.crashes++;
        this.lastCrash = this.time;
      }
    });
    this.player.step(input, dt);
    if (this.outcome) return;
    this.world.intersectionsWithShape(
      this.player.position,
      { x: 0, y: 0, z: 0, w: 1 },
      this.player.collider.shape,
      (c) => {
        const role = this.roles.get(c.handle);
        if (role?.kind === "lethal") {
          this.fail("A barrier caught you. Read its timing and change roofs.");
          return false;
        }
        if (role?.kind === "finish") {
          this.outcome = "completed";
          return false;
        }
        return true;
      },
      undefined,
      undefined,
      this.player.collider,
      this.player.body,
      (c) => {
        const kind = this.roles.get(c.handle)?.kind;
        return kind === "finish" || kind === "lethal";
      },
    );
  }
  fail(reason: string) {
    if (!this.outcome) {
      this.reason = reason;
      this.outcome = "failed";
    }
  }
  dispose() {
    this.world.removeCharacterController(this.player.controller);
    this.world.free();
    this.events.free();
    this.roles.clear();
    this.trucks.length = 0;
  }
}
