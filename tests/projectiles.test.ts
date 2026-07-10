import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  createArrowProjectile,
  disposeArrowVisual,
  stepArrowProjectile,
} from "../app/game/projectiles.ts";

test("visible arrows arc forward and use swept block collision", () => {
  const arrow = createArrowProjectile(1, { kind: "mob", id: 4 }, new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, 2, -8));
  const names = new Set<string>();
  arrow.visual.traverse((object) => names.add(object.name));
  assert.equal(names.has("visible-arrow-projectile"), true);
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
