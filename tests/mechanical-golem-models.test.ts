import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { applyWildlifePose, createMobVisual } from "../app/game/mob-models.ts";
import { MOB_DEFS, type CoreMobKind } from "../app/game/mobs.ts";

const GOLEMS = ["clockwork-hound-golem", "webspinner-golem"] as const satisfies readonly CoreMobKind[];

function named(root: THREE.Object3D, name: string) {
  const object = root.getObjectByName(name);
  assert.ok(object, `${name} must exist in the production rig`);
  return object;
}

function meshCount(root: THREE.Object3D) {
  let count = 0;
  root.traverse((object) => { if (object instanceof THREE.Mesh) count += 1; });
  return count;
}

test("new dwarven companion golems use complete, distinct production rigs", () => {
  const hound = createMobVisual("clockwork-hound-golem", -23_101);
  assert.equal(hound.visual.userData.wildlifeRig, "clockwork-hound-golem");
  assert.equal(hound.visual.userData.hurtResponse, "forged-shell-pulse");
  assert.equal(hound.parts.legs.length, 4);
  assert.equal(hound.parts.arms.length, 1);
  assert.ok(meshCount(hound.group) >= 90, "Clockwork Hound should retain its layered locomotive detail budget");
  named(hound.group, "clockwork-hound-golem-head-pivot");
  named(hound.group, "clockwork-hound-golem-jaw-attack-pivot");
  named(hound.group, "clockwork-hound-golem-chest-aether-core");
  for (const rail of ["top", "bottom", "left", "right"]) named(hound.group, `clockwork-hound-golem-core-guard-${rail}`);
  assert.equal(hound.group.getObjectByName("clockwork-hound-golem-core-guard"), undefined, "Core guard must remain an open frame, not an occluding plate");
  for (const position of ["front-left", "front-right", "rear-left", "rear-right"] as const) {
    named(hound.group, `clockwork-hound-golem-${position}-upper-leg-pivot`);
    named(hound.group, `clockwork-hound-golem-${position}-knee-pivot`);
    named(hound.group, `clockwork-hound-golem-${position}-paw-pivot`);
  }

  const spider = createMobVisual("webspinner-golem", -23_102);
  assert.equal(spider.visual.userData.wildlifeRig, "webspinner-golem");
  assert.equal(spider.visual.userData.hurtResponse, "forged-shell-pulse");
  assert.equal(spider.parts.legs.length, 8);
  assert.equal(spider.parts.arms.length, 2);
  assert.ok(meshCount(spider.group) >= 96, "Webspinner should retain eight complete articulated legs and its pressure loom");
  named(spider.group, "webspinner-golem-head-pivot");
  named(spider.group, "webspinner-golem-drive-ring-pivot");
  named(spider.group, "webspinner-golem-spinneret-pivot");
  for (const side of ["left", "right"] as const) {
    named(spider.group, `webspinner-golem-${side}-fang-attack-pivot`);
    for (let leg = 1; leg <= 4; leg += 1) {
      named(spider.group, `webspinner-golem-${side}-leg-${leg}-pivot`);
      named(spider.group, `webspinner-golem-${side}-leg-${leg}-knee-pivot`);
      named(spider.group, `webspinner-golem-${side}-leg-${leg}-foot-pivot`);
    }
  }
});

test("mechanical golem feet stay on the runtime ground plane after authored scaling", () => {
  for (const kind of GOLEMS) {
    const model = createMobVisual(kind, -23_110);
    model.group.updateMatrixWorld(true);
    const unscaled = new THREE.Box3().setFromObject(model.visual);
    assert.ok(Math.abs(unscaled.min.y - (0.5 - MOB_DEFS[kind].footOffset)) < 0.0001, `${kind} raw rig must match its foot offset`);

    const authoredScale = Number(model.visual.userData.authoredScale) || 1;
    const baseY = model.visual.position.y;
    const footPlane = unscaled.min.y;
    model.visual.scale.setScalar(authoredScale);
    model.visual.position.y = baseY + (1 - authoredScale) * (footPlane - baseY);
    model.group.position.y = MOB_DEFS[kind].footOffset - 0.5;
    model.group.updateMatrixWorld(true);
    const runtime = new THREE.Box3().setFromObject(model.visual);
    assert.ok(Math.abs(runtime.min.y) < 0.0001, `${kind} must neither float nor penetrate after the runtime scale transform (${runtime.min.y})`);
  }
});

test("clockwork hound authored pose animates locomotion, awareness and bite attack", () => {
  const model = createMobVisual("clockwork-hound-golem", -23_121);
  const head = named(model.visual, "clockwork-hound-golem-head-pivot");
  const jaw = named(model.visual, "clockwork-hound-golem-jaw-attack-pivot");
  const knee = named(model.visual, "clockwork-hound-golem-front-left-knee-pivot");
  const gear = named(model.visual, "clockwork-hound-golem-left-shoulder-gear-pivot");
  const baseHeadZ = head.position.z;
  applyWildlifePose(model.visual, "clockwork-hound-golem", 0.35, 0, 0);
  const idleJaw = jaw.rotation.x;
  const idleKnee = knee.rotation.x;
  const idleGear = gear.rotation.x;
  applyWildlifePose(model.visual, "clockwork-hound-golem", 1.1, 1, 1);
  assert.ok(head.position.z < baseHeadZ - 0.05, "alert pose must lunge the actual head pivot toward its target");
  assert.ok(jaw.rotation.x < idleJaw - 0.2, "attack pose must visibly open the articulated jaw");
  assert.notEqual(knee.rotation.x, idleKnee, "walk pose must articulate distal leg joints");
  assert.notEqual(gear.rotation.x, idleGear, "walk pose must turn the shoulder drive gear");
});

test("webspinner authored pose coordinates all eight legs, pressure loom and fangs", () => {
  const model = createMobVisual("webspinner-golem", -23_122);
  const head = named(model.visual, "webspinner-golem-head-pivot");
  const fang = named(model.visual, "webspinner-golem-left-fang-attack-pivot");
  const ring = named(model.visual, "webspinner-golem-drive-ring-pivot");
  const knees = ["left", "right"].flatMap((side) => [1, 2, 3, 4].map((leg) => named(model.visual, `webspinner-golem-${side}-leg-${leg}-knee-pivot`)));
  const baseHeadZ = head.position.z;
  applyWildlifePose(model.visual, "webspinner-golem", 0.2, 0, 0);
  const idleFang = fang.rotation.x;
  const idleRing = ring.rotation.y;
  const idleKnees = knees.map((knee) => knee.rotation.x);
  applyWildlifePose(model.visual, "webspinner-golem", 1.35, 1, 1);
  assert.ok(head.position.z < baseHeadZ - 0.1, "attack pose must advance the face housing");
  assert.ok(fang.rotation.x < idleFang - 0.25, "attack pose must snap the articulated fangs open");
  assert.notEqual(ring.rotation.y, idleRing, "locomotion must turn the visible pressure loom");
  assert.ok(knees.every((knee, index) => knee.rotation.x !== idleKnees[index]), "all eight distal leg joints must participate in the gait");
});
