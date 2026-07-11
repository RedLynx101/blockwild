import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  createDragonAttackEffect,
  disposeDragonAttackEffect,
  dragonEffectHits,
  stepDragonAttackEffect,
} from "../app/game/dragon-effects.ts";

test("dragon attacks produce distinct visible breath and steel spear geometry", () => {
  const breath = createDragonAttackEffect({
    id: 1,
    element: "fire",
    attack: "breath",
    stage: 4,
    origin: new THREE.Vector3(2, 3, 4),
    direction: new THREE.Vector3(0, 0, -1),
    damage: 12,
  });
  const spear = createDragonAttackEffect({
    id: 2,
    element: "steel",
    attack: "projectile",
    stage: 5,
    origin: new THREE.Vector3(),
    direction: new THREE.Vector3(1, 0, 0),
    damage: 18,
  });
  assert.match(breath.visual.name, /fire-dragon-breath/u);
  assert.ok(breath.visual.children.length >= 10);
  assert.equal(breath.status, "burning");
  assert.match(spear.visual.name, /steel-dragon-projectile/u);
  assert.equal(spear.visual.children.length, 3);
  assert.ok(spear.velocity.x > 20);
  assert.equal(spear.status, "knockback");
  disposeDragonAttackEffect(breath);
  disposeDragonAttackEffect(spear);
});

test("dragon attack effects advance, collide, and expire deterministically", () => {
  const effect = createDragonAttackEffect({
    id: 3,
    element: "ice",
    attack: "projectile",
    stage: 2,
    origin: new THREE.Vector3(),
    direction: new THREE.Vector3(1, 0, 0),
    damage: 7,
    status: "slowed",
    statusSeconds: 4.25,
  });
  assert.deepEqual([effect.status, effect.statusSeconds], ["slowed", 4.25]);
  assert.equal(dragonEffectHits(effect, new THREE.Vector3(0.2, 0, 0)), true);
  assert.equal(stepDragonAttackEffect(effect, 0.1), false);
  assert.ok(effect.visual.position.x > 1);
  let expired = false;
  for (let index = 0; index < 40; index += 1) expired = stepDragonAttackEffect(effect, 0.1) || expired;
  assert.equal(expired, true);
  disposeDragonAttackEffect(effect);
});
