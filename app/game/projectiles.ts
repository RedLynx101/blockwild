import * as THREE from "three";

export type ArrowOwner = { kind: "mob" | "player"; id: number | string };

export type ArrowProjectile = {
  id: number;
  owner: ArrowOwner;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  damage: number;
  age: number;
  maxAge: number;
  visual: THREE.Group;
};

export type ArrowStepResult =
  | { kind: "flying" }
  | { kind: "block"; position: THREE.Vector3 }
  | { kind: "target"; targetId: string | number; position: THREE.Vector3 }
  | { kind: "expired" };

const GRAVITY = 8.2;

export function aimArrowVelocity(origin: THREE.Vector3, target: THREE.Vector3, speed = 11.5) {
  const delta = target.clone().sub(origin);
  const horizontal = Math.hypot(delta.x, delta.z);
  const travelTime = Math.max(0.12, horizontal / Math.max(0.1, speed));
  // A light ballistic compensation keeps the visible arrow close to the
  // crosshair while still producing an obvious arc over longer distances.
  delta.y += GRAVITY * travelTime * travelTime * 0.5;
  return delta.normalize().multiplyScalar(speed);
}

export function createArrowVisual() {
  const group = new THREE.Group();
  group.name = "visible-arrow-projectile";
  const wood = new THREE.MeshLambertMaterial({ color: 0x744929 });
  const metal = new THREE.MeshLambertMaterial({ color: 0xc7d0cc });
  const feather = new THREE.MeshLambertMaterial({ color: 0xd25b4c, side: THREE.DoubleSide });
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 0.9), wood);
  shaft.position.z = 0.05;
  const point = new THREE.Mesh(new THREE.ConeGeometry(0.105, 0.27, 4), metal);
  point.rotation.x = -Math.PI / 2;
  point.position.z = -0.53;
  const leftFletching = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.025, 0.26), feather);
  const uprightFletching = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.24, 0.26), feather);
  leftFletching.position.z = 0.48;
  uprightFletching.position.z = 0.48;
  group.add(shaft, point, leftFletching, uprightFletching);
  return group;
}

export function orientArrowVisual(projectile: Pick<ArrowProjectile, "visual" | "velocity">) {
  if (projectile.velocity.lengthSq() < 1e-8) return;
  const target = projectile.visual.position.clone().add(projectile.velocity);
  projectile.visual.lookAt(target);
}

export function createArrowProjectile(
  id: number,
  owner: ArrowOwner,
  origin: THREE.Vector3,
  target: THREE.Vector3,
  damage = 2,
  speed = 11.5,
): ArrowProjectile {
  const visual = createArrowVisual();
  visual.position.copy(origin);
  const projectile: ArrowProjectile = {
    id,
    owner,
    position: origin.clone(),
    velocity: aimArrowVelocity(origin, target, speed),
    damage,
    age: 0,
    maxAge: 8,
    visual,
  };
  orientArrowVisual(projectile);
  return projectile;
}

/** Swept stepping prevents fast arrows passing through one-block walls. */
export function stepArrowProjectile(
  projectile: ArrowProjectile,
  deltaSeconds: number,
  blockAt: (position: THREE.Vector3) => boolean,
  targetAt: (position: THREE.Vector3, radius: number) => string | number | null,
): ArrowStepResult {
  const dt = Math.max(0, Math.min(0.1, deltaSeconds));
  projectile.age += dt;
  if (projectile.age >= projectile.maxAge) return { kind: "expired" };
  projectile.velocity.y -= GRAVITY * dt;
  const travel = projectile.velocity.clone().multiplyScalar(dt);
  const distance = travel.length();
  const steps = Math.max(1, Math.ceil(distance / 0.16));
  const delta = travel.multiplyScalar(1 / steps);
  for (let index = 0; index < steps; index += 1) {
    projectile.position.add(delta);
    const targetId = targetAt(projectile.position, 0.22);
    if (targetId !== null) {
      projectile.visual.position.copy(projectile.position);
      return { kind: "target", targetId, position: projectile.position.clone() };
    }
    if (blockAt(projectile.position)) {
      projectile.visual.position.copy(projectile.position);
      return { kind: "block", position: projectile.position.clone() };
    }
  }
  projectile.visual.position.copy(projectile.position);
  orientArrowVisual(projectile);
  return { kind: "flying" };
}

export function disposeArrowVisual(visual: THREE.Object3D) {
  visual.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material.dispose();
  });
}
