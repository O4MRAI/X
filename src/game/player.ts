import RAPIER, {
  type Collider,
  type RigidBody,
  type KinematicCharacterController,
} from "@dimforge/rapier3d-compat";
import { Vector3 } from "three";
import { MOVEMENT } from "./config";
import { type Simulation, type Truck } from "./physics";
import { type Controls } from "./input";
import { v, toLocal, toWorld, surfaceVelocity, moveToward } from "./math";
export class PlayerController {
  readonly body: RigidBody;
  readonly collider: Collider;
  readonly controller: KinematicCharacterController;
  position = v();
  previous = v();
  worldVelocity = v();
  relativeVelocity = v();
  inheritedVelocity = v();
  support: Truck | null = null;
  contactLocal = v();
  contactWorld = v();
  supportNormal = v(0, 1, 0);
  grounded = false;
  coyote = 0;
  jumpBuffer = 0;
  airJumpUsed = false;
  jumps = 0;
  jumping = false;
  landings = 0;
  visited = new Set<number>();
  lastLandSpeed = 0;
  grapple: { truck: Truck; local: Vector3; remaining: number } | null = null;
  private lastSupport: Truck | null = null;
  constructor(
    private sim: Simulation,
    starter: Truck,
  ) {
    this.position.copy(toWorld(v(0, 4.045, 3), starter.body));
    this.position.y += MOVEMENT.height / 2;
    this.previous.copy(this.position);
    this.body = sim.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(this.position.x, this.position.y, this.position.z)
        .setCcdEnabled(true),
    );
    this.collider = sim.world.createCollider(
      RAPIER.ColliderDesc.capsule(
        (MOVEMENT.height - 2 * MOVEMENT.radius) / 2,
        MOVEMENT.radius,
      )
        .setFriction(0)
        .setSolverGroups(0),
      this.body,
    );
    this.controller = sim.world.createCharacterController(0.015);
    this.controller.setApplyImpulsesToDynamicBodies(false);
    this.controller.setMaxSlopeClimbAngle(Math.acos(MOVEMENT.supportNormal));
    this.controller.setMinSlopeSlideAngle(Math.acos(MOVEMENT.supportNormal));
    this.controller.enableSnapToGround(0.16);
  }
  get feet() {
    return this.position.clone().add(v(0, -MOVEMENT.height / 2, 0));
  }
  initializeSupport(truck: Truck) {
    this.support = truck;
    this.grounded = true;
    this.coyote = MOVEMENT.coyote;
    this.visited.add(truck.body.handle);
    this.storeContact();
  }
  private storeContact() {
    if (!this.support) return;
    this.contactWorld.copy(this.feet);
    toLocal(this.contactWorld, this.support.body, this.contactLocal);
  }
  private probe() {
    const foot = this.feet;
    let best: { truck: Truck; normal: Vector3; point: Vector3 } | null = null;
    for (const [x, z] of [
      [0, 0],
      [0.21, 0],
      [-0.21, 0],
      [0, 0.21],
      [0, -0.21],
    ]) {
      const ray = new RAPIER.Ray(
        { x: foot.x + x, y: foot.y + 0.18, z: foot.z + z },
        { x: 0, y: -1, z: 0 },
      );
      const hit = this.sim.world.castRayAndGetNormal(
        ray,
        0.43,
        true,
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        this.collider,
        this.body,
      );
      if (!hit) continue;
      const role = this.sim.roles.get(hit.collider.handle);
      if (role?.kind === "ground" && hit.timeOfImpact < 0.36) {
        this.sim.fail("The ground is off limits. Aim for another truck roof.");
        return null;
      }
      if (
        role?.kind === "truck" &&
        role.truck &&
        hit.normal.y >= MOVEMENT.supportNormal &&
        Math.abs(hit.timeOfImpact - 0.18) < 0.24
      ) {
        best = {
          truck: role.truck,
          normal: v(hit.normal.x, hit.normal.y, hit.normal.z),
          point: v(ray.origin.x, ray.origin.y - hit.timeOfImpact, ray.origin.z),
        };
        break;
      }
    }
    return best;
  }
  updateAbilityClock(dt: number) {
    if (this.grapple) {
      this.grapple.remaining -= dt;
      if (this.grapple.remaining <= 0) this.grapple = null;
    }
  }
  private activateAbility(input: Controls) {
    if (!input.movementAbility || this.sim.abilityCooldown > 0) return;
    if (this.sim.settings.movement === "dash") {
      if (this.grounded) this.detach();
      const direction = v(-Math.sin(input.yaw), 0, -Math.cos(input.yaw));
      this.worldVelocity.addScaledVector(direction, 18);
      this.sim.abilityCooldown = 2.5;
    } else if (this.sim.settings.movement === "grapple") {
      const direction = v(
        -Math.sin(input.yaw) * Math.cos(input.pitch),
        Math.sin(input.pitch),
        -Math.cos(input.yaw) * Math.cos(input.pitch),
      );
      const eye = this.feet.add(v(0, MOVEMENT.eyeHeight, 0));
      const hit = this.sim.world.castRay(
        new RAPIER.Ray(eye, direction),
        36,
        true,
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        this.collider,
        this.body,
      );
      const role = hit && this.sim.roles.get(hit.collider.handle);
      if (hit && role?.kind === "truck" && role.truck) {
        const point = eye.addScaledVector(direction, hit.timeOfImpact);
        this.grapple = {
          truck: role.truck,
          local: toLocal(point, role.truck.body),
          remaining: 0.95,
        };
        if (this.grounded) this.detach();
        this.sim.abilityCooldown = 4;
      }
    }
  }
  private detach() {
    this.jumping = false;
    if (this.support) {
      surfaceVelocity(
        this.support.body,
        toWorld(this.contactLocal, this.support.body),
        this.inheritedVelocity,
      );
      this.worldVelocity
        .copy(this.relativeVelocity)
        .add(this.inheritedVelocity);
      this.lastSupport = this.support;
    }
    this.support = null;
    this.grounded = false;
    this.coyote = MOVEMENT.coyote;
  }
  private launch(double = false) {
    if (this.support) {
      surfaceVelocity(
        this.support.body,
        toWorld(this.contactLocal, this.support.body),
        this.inheritedVelocity,
      );
      this.worldVelocity
        .copy(this.relativeVelocity)
        .add(this.inheritedVelocity);
      this.lastSupport = this.support;
    }
    this.worldVelocity.y =
      MOVEMENT.jump + (double ? 0 : this.inheritedVelocity.y);
    this.support = null;
    this.grounded = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.jumps++;
    this.jumping = true;
    if (double) this.airJumpUsed = true;
  }
  step(input: Controls, dt: number) {
    this.previous.copy(this.position);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    if (input.jump) this.jumpBuffer = MOVEMENT.jumpBuffer;
    const supportNow = this.probe();
    if (this.sim.outcome) return;
    if (this.grounded && (!supportNow || supportNow.truck !== this.support))
      this.detach();
    if (!this.grounded) this.coyote = Math.max(0, this.coyote - dt);
    const movement = v(input.x, 0, input.z);
    if (movement.lengthSq() > 1) movement.normalize();
    movement
      .applyAxisAngle(v(0, 1, 0), input.yaw)
      .multiplyScalar(input.sprint ? MOVEMENT.sprint : MOVEMENT.walk);
    if (this.grounded)
      moveToward(
        this.relativeVelocity,
        movement,
        dt * (movement.lengthSq() ? MOVEMENT.acceleration : MOVEMENT.braking),
      );
    this.activateAbility(input);
    if (this.jumpBuffer > 0 && (this.grounded || this.coyote > 0))
      this.launch();
    else if (
      input.jump &&
      !this.grounded &&
      this.sim.settings.movement === "double" &&
      !this.airJumpUsed
    )
      this.launch(true);
    let displacement = v();
    if (this.grounded && this.support) {
      displacement
        .copy(toWorld(this.contactLocal, this.support.body))
        .sub(this.contactWorld)
        .addScaledVector(this.relativeVelocity, dt);
      displacement.y -= 0.02;
      this.worldVelocity
        .copy(this.relativeVelocity)
        .add(
          surfaceVelocity(
            this.support.body,
            toWorld(this.contactLocal, this.support.body),
          ),
        );
    } else {
      if (movement.lengthSq() > 0) {
        const target = movement.add(
          v(this.inheritedVelocity.x, 0, this.inheritedVelocity.z),
        );
        const horizontal = v(this.worldVelocity.x, 0, this.worldVelocity.z);
        moveToward(horizontal, target, MOVEMENT.airAcceleration * dt);
        this.worldVelocity.x = horizontal.x;
        this.worldVelocity.z = horizontal.z;
      }
      if (this.grapple) {
        const target = toWorld(this.grapple.local, this.grapple.truck.body);
        const d = target.sub(this.position);
        if (d.length() < 1.6) this.grapple = null;
        else this.worldVelocity.addScaledVector(d.normalize(), 48 * dt);
      }
      this.worldVelocity.y = Math.max(
        -MOVEMENT.terminalFall,
        this.worldVelocity.y - MOVEMENT.gravity * dt,
      );
      displacement.copy(this.worldVelocity).multiplyScalar(dt);
    }
    this.controller.computeColliderMovement(
      this.collider,
      displacement,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
    );
    const corrected = this.controller.computedMovement();
    this.position.add(v(corrected.x, corrected.y, corrected.z));
    this.body.setTranslation(this.position, true);
    this.sim.world.propagateModifiedBodyPositionsToColliders();
    for (let i = 0; i < this.controller.numComputedCollisions(); i++) {
      const collision = this.controller.computedCollision(i);
      const role =
        collision && this.sim.roles.get(collision.collider?.handle ?? -1);
      if (role?.kind === "ground") {
        this.sim.fail("The ground is off limits. Jump to a truck roof.");
        return;
      }
      if (role?.kind === "lethal") {
        this.sim.fail(
          "A barrier caught you. Read its timing and change roofs.",
        );
        return;
      }
      if (
        collision &&
        role?.truck &&
        role.truck !== this.support &&
        collision.normal1.y < 0.5
      ) {
        const closing = this.worldVelocity
          .clone()
          .sub(
            surfaceVelocity(
              role.truck.body,
              v(
                collision.witness1.x,
                collision.witness1.y,
                collision.witness1.z,
              ),
            ),
          )
          .dot(
            v(collision.normal1.x, collision.normal1.y, collision.normal1.z),
          );
        if (closing < -10) {
          this.sim.fail("A truck struck you. Stay above the convoy.");
          return;
        }
      }
    }
    const landing = this.probe();
    if (
      landing &&
      this.worldVelocity.y <=
        surfaceVelocity(landing.truck.body, landing.point).y + 0.7
    ) {
      if (!this.grounded) {
        this.lastLandSpeed = -this.worldVelocity.y;
        if (this.lastSupport !== landing.truck) {
          this.landings++;
          this.visited.add(landing.truck.body.handle);
        }
        this.airJumpUsed = false;
        this.grapple = null;
        const carried = surfaceVelocity(landing.truck.body, landing.point);
        this.relativeVelocity
          .set(
            this.worldVelocity.x - carried.x,
            0,
            this.worldVelocity.z - carried.z,
          )
          .clampLength(0, MOVEMENT.sprint);
      }
      this.grounded = true;
      this.jumping = false;
      this.support = landing.truck;
      this.supportNormal.copy(landing.normal);
      this.worldVelocity.y = 0;
      this.coyote = MOVEMENT.coyote;
      this.storeContact();
    } else if (this.grounded) {
      this.detach();
    }
    if (this.position.y < -8)
      this.sim.fail("You missed the convoy. Take the leap a little later.");
  }
}
