import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  createArrowProjectile,
  createVerdantVolleyProjectile,
  disposeArrowVisual,
  stepArrowProjectile,
} from "../app/game/projectiles.ts";

test("visible arrows arc forward and use swept block collision", () => {
  const arrow = createArrowProjectile(1, { kind: "mob", id: 4 }, new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, 2, -8));
  const names = new Set<string>();
  arrow.visual.traverse((object) => names.add(object.name));
  assert.equal(names.has("visible-arrow-projectile"), true);
  const visualNose = new THREE.Vector3(0, 0, -1).applyQuaternion(arrow.visual.quaternion);
  assert.ok(visualNose.dot(arrow.velocity.clone().normalize()) > 0.999, "the modeled arrowhead must lead the velocity");
  const result = stepArrowProjectile(arrow, 0.1, (position) => position.z < -0.7, () => null);
  assert.equal(result.kind, "block");
  assert.ok(arrow.position.z < 0);
  disposeArrowVisual(arrow.visual);
});

test("arrows report entity hits before blocks and expire deterministically", () => {
  const arrow = createArrowProjectile(2, { kind: "mob", id: 9 }, new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, -4));
  const hit = stepArrowProjectile(arrow, 0.1, () => false, (position) => position.z < -0.4 ? "local-player" : null);
  assert.deepEqual(hit.kind, "target");
  arrow.age = arrow.maxAge - 0.01;
  assert.equal(stepArrowProjectile(arrow, 0.02, () => false, () => null).kind, "expired");
  disposeArrowVisual(arrow.visual);
});

test("Leafwarden volleys visibly carry three leaves, a trail, and a rooting payload", () => {
  const volley = createVerdantVolleyProjectile(
    3,
    { kind: "mob", id: 12 },
    new THREE.Vector3(0, 1.4, 0),
    new THREE.Vector3(0, 1.4, -12),
  );
  const names = new Set<string>();
  volley.visual.traverse((object) => names.add(object.name));
  assert.equal(volley.visual.name, "visible-verdant-volley-projectile");
  assert.deepEqual([...names].filter((name) => /^verdant-volley-leaf-\d$/u.test(name)).sort(), [
    "verdant-volley-leaf-1",
    "verdant-volley-leaf-2",
    "verdant-volley-leaf-3",
  ]);
  assert.equal([...names].filter((name) => name.startsWith("verdant-volley-trail-")).length, 4);
  assert.deepEqual(volley.effect, { kind: "verdant-root", seconds: 0.8 });
  const beforeSpin = volley.visual.getObjectByName("verdant-volley-spiral")?.rotation.z ?? 0;
  assert.equal(stepArrowProjectile(volley, 0.05, () => false, () => null).kind, "flying");
  assert.notEqual(volley.visual.getObjectByName("verdant-volley-spiral")?.rotation.z, beforeSpin);
  disposeArrowVisual(volley.visual);
});
