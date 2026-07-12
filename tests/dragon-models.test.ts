import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import * as THREE from "three";
import { applyDragonPose, createMobVisual, DRAGON_MODEL_CONTRACT } from "../app/game/mob-models.ts";
import { DRAGON_ORDER } from "../app/game/mobs.ts";
import { createMobInspectionSpecs, renderModelPortrait } from "../scripts/render-models.ts";

function named(root: THREE.Object3D, name: string) {
  const object = root.getObjectByName(name);
  assert.ok(object, `${name} must exist in the production rig`);
  return object;
}

test("every dragon shares a complete named animation and equipment rig", () => {
  for (const [index, kind] of DRAGON_ORDER.entries()) {
    const type = kind.replace("-dragon", "");
    const model = createMobVisual(kind, 300 + index);
    assert.equal(model.group.userData.dragonType, type);
    assert.equal(model.group.userData.animatedRig, "dragon-v1");
    assert.equal(model.parts.wings.length, 2);
    assert.equal(model.parts.legs.length, 4);
    assert.equal(model.parts.head.length, 1);
    assert.equal(model.parts.body.length, 1);
    named(model.group, `${kind}-breathing-chest-pivot`);
    named(model.group, `${kind}-head-pivot`);
    named(model.group, `${kind}-jaw-pivot`);
    named(model.group, `${kind}-left-eye-pivot`);
    named(model.group, `${kind}-right-eye-pivot`);
    named(model.group, `${kind}-breath-emitter`);
    named(model.group, `${kind}-projectile-origin`);
    for (let segment = 1; segment <= DRAGON_MODEL_CONTRACT.neckSegments; segment += 1) named(model.group, `${kind}-neck-${segment}-pivot`);
    for (let segment = 1; segment <= DRAGON_MODEL_CONTRACT.tailSegments; segment += 1) named(model.group, `${kind}-tail-${segment}-pivot`);
    for (const side of ["left", "right"]) {
      named(model.group, `${kind}-${side}-wing-root-pivot`);
      named(model.group, `${kind}-${side}-wing-forearm-pivot`);
    }
    for (const position of ["front-left", "front-right", "rear-left", "rear-right"]) {
      named(model.group, `${kind}-${position}-hip-pivot`);
      named(model.group, `${kind}-${position}-knee-pivot`);
      named(model.group, `${kind}-${position}-claw-pivot`);
    }
    for (const attachment of ["saddle", "left-cargo", "right-cargo", "head-armor", "neck-armor", "body-armor", "tail-armor"]) {
      assert.equal(named(model.group, `${kind}-${attachment}`).visible, false, `${attachment} should be progression-gated`);
    }
    let meshCount = 0;
    model.group.traverse((object) => { if (object instanceof THREE.Mesh) meshCount += 1; });
    assert.ok(meshCount >= 100, `${kind} should retain its major-project detail budget (${meshCount})`);
  }
});

test("pose hooks articulate jaws, wings, tails, legs, breathing, attacks, sex, and equipment", () => {
  const model = createMobVisual("steel-dragon", 9);
  const root = model.group;
  const jaw = named(root, "steel-dragon-jaw-pivot");
  const wing = named(root, "steel-dragon-left-wing-root-pivot");
  const tail = named(root, "steel-dragon-tail-7-pivot");
  const hip = named(root, "steel-dragon-front-left-hip-pivot");
  const chest = named(root, "steel-dragon-breathing-chest-pivot");
  const idle = { jaw: jaw.rotation.x, wing: wing.rotation.z, tail: tail.rotation.y, hip: hip.rotation.x, chest: chest.scale.y };

  assert.equal(applyDragonPose(root, {
    timeSeconds: 1.25,
    mode: "breath",
    movement: 1,
    attackProgress: 0.55,
    bank: 0.25,
    pitch: -0.2,
    sex: "female",
    equipment: { saddle: true, leftChest: true, rightChest: true, armor: { head: true, neck: true, body: true, tail: true } },
  }), true);
  assert.notEqual(jaw.rotation.x, idle.jaw);
  assert.notEqual(wing.rotation.z, idle.wing);
  assert.notEqual(tail.rotation.y, idle.tail);
  assert.notEqual(hip.rotation.x, idle.hip);
  assert.notEqual(chest.scale.y, idle.chest);
  assert.equal(named(root, "steel-dragon-breath-emitter").visible, true);
  assert.equal(named(root, "steel-dragon-projectile-origin").visible, false);
  assert.equal(named(root, "steel-dragon-female-horn-rack").visible, true);
  assert.equal(named(root, "steel-dragon-male-horn-rack").visible, false);
  for (const attachment of ["saddle", "left-cargo", "right-cargo", "head-armor", "neck-armor", "body-armor", "tail-armor"]) {
    assert.equal(named(root, `steel-dragon-${attachment}`).visible, true);
  }

  applyDragonPose(root, { timeSeconds: 2, mode: "projectile", attackProgress: 0.6, sex: "male" });
  assert.equal(named(root, "steel-dragon-projectile-origin").visible, true);
  assert.equal(named(root, "steel-dragon-loaded-metal-spear-shaft").visible, true);
  assert.equal(named(root, "steel-dragon-loaded-metal-spear-head").visible, true);
  assert.equal(named(root, "steel-dragon-male-horn-rack").visible, true);
  assert.equal(named(root, "steel-dragon-saddle").visible, true, "pose-only updates preserve equipped visuals");
});

test("the four silhouettes carry distinct elemental anatomy in production portraits", () => {
  const specs = createMobInspectionSpecs().filter((spec) => DRAGON_ORDER.includes(spec.id as (typeof DRAGON_ORDER)[number]));
  assert.deepEqual(specs.map((spec) => spec.id), DRAGON_ORDER);
  const fire = specs[0];
  const ice = specs[1];
  const steel = specs[2];
  const sea = specs[3];
  assert.ok(fire.boxes.some((box) => box.id.includes("tail-flame")));
  assert.ok(ice.boxes.some((box) => box.id.includes("ice-tail-fin")));
  assert.ok(steel.boxes.filter((box) => box.id.includes("riveted-plate")).length >= 10);
  assert.ok(steel.boxes.some((box) => box.id === "steel-dragon-steel-tail-hammer"));
  assert.ok(steel.boxes.some((box) => box.id === "steel-dragon-pressure-core"));
  assert.ok(steel.boxes.some((box) => box.id.includes("wing-gear-hub")));
  assert.ok(steel.boxes.some((box) => box.id.includes("jaw-piston")));
  assert.ok(sea.boxes.some((box) => box.id.includes("sea-tail-fin")));
  assert.ok(sea.boxes.filter((box) => box.id.includes("sea-dorsal-fin")).length >= 4);
  assert.ok(sea.boxes.some((box) => box.id === "sea-dragon-tideglass-sternum"));
  assert.ok(sea.boxes.some((box) => box.id.includes("current-whisker")));
  assert.ok(sea.boxes.some((box) => box.id.includes("ray-sail-rib")));
  for (const spec of specs) {
    const portrait = renderModelPortrait(spec);
    assert.match(portrait, /front three-quarter model portrait/u);
    assert.ok(spec.boxes.length >= 90, `${spec.id} keeps a dense visible portrait rig`);
  }
});

test("deployed dragon portraits are exact exports of the production rigs", async () => {
  const specs = createMobInspectionSpecs().filter((spec) => DRAGON_ORDER.includes(spec.id as (typeof DRAGON_ORDER)[number]));
  for (const spec of specs) {
    const deployed = await readFile(path.resolve("public", "creatures", `${spec.id}.svg`), "utf8");
    assert.equal(deployed, renderModelPortrait(spec), `${spec.id}.svg is stale; regenerate the creature portrait catalog`);
  }
});
