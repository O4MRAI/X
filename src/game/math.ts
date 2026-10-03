import { Quaternion, Vector3 } from "three";
import type { RigidBody } from "@dimforge/rapier3d-compat";
export const v = (x = 0, y = 0, z = 0) => new Vector3(x, y, z);
export function toWorld(local: Vector3, body: RigidBody, out = v()) {
  const p = body.translation();
  return out
    .copy(local)
    .applyQuaternion(new Quaternion().copy(body.rotation()))
    .add(v(p.x, p.y, p.z));
}
export function toLocal(world: Vector3, body: RigidBody, out = v()) {
  const p = body.translation();
  return out
    .copy(world)
    .sub(v(p.x, p.y, p.z))
    .applyQuaternion(new Quaternion().copy(body.rotation()).invert());
}
export function surfaceVelocity(body: RigidBody, point: Vector3, out = v()) {
  const linear = body.linvel(),
    angular = body.angvel(),
    com = body.worldCom();
  return out
    .copy(point)
    .sub(v(com.x, com.y, com.z))
    .cross(v(angular.x, angular.y, angular.z))
    .negate()
    .add(v(linear.x, linear.y, linear.z));
}
export function moveToward(
  current: Vector3,
  target: Vector3,
  maxDelta: number,
) {
  const delta = target.clone().sub(current);
  const n = delta.length();
  return n <= maxDelta
    ? current.copy(target)
    : current.addScaledVector(delta, maxDelta / n);
}
