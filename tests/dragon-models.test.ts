import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import * as THREE from "three";
import { applyDragonLifeStage, applyDragonPose, createMobVisual, DRAGON_MODEL_CONTRACT } from "../app/game/mob-models.ts";
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
    assert.equal(model.group.userData.animatedRig, "dragon-v2");
    assert.equal(model.visual.userData.authoredDragonLifeStages, 3);
    assert.equal(named(model.group, `${kind}-adult-form`).visible, true);
    assert.equal(named(model.group, `${kind}-stage-1-form`).visible, false);
    assert.equal(named(model.group, `${kind}-stage-2-form`).visible, false);
    assert.equal(named(model.group, `${kind}-stage-1-form`).userData.shoulderCarryCompatible, true);
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

test("all six dragons use authored hatchling and fledgling silhouettes before their mature form", () => {
  for (const [index, kind] of DRAGON_ORDER.entries()) {
    const model = createMobVisual(kind, 840 + index);
    const adult = named(model.group, `${kind}-adult-form`);
    const stageOne = named(model.group, `${kind}-stage-1-form`);
    const stageTwo = named(model.group, `${kind}-stage-2-form`);
    assert.equal(applyDragonLifeStage(model.visual, 1), true);
    assert.equal(adult.visible, false);
    assert.equal(stageOne.visible, true);
    assert.equal(stageTwo.visible, false);
    let stageOneMeshes = 0;
    stageOne.traverse((object) => { if (object instanceof THREE.Mesh) stageOneMeshes += 1; });
    assert.ok(stageOneMeshes >= 45, `${kind} hatchling should be an authored model, not a scale-only adult (${stageOneMeshes})`);
    assert.ok(named(stageOne, `${kind}-hatchling-oversize-head`));
    assert.ok(named(stageOne, `${kind}-hatchling-left-wide-eye`));

    assert.equal(applyDragonLifeStage(model.visual, 2), true);
    assert.equal(adult.visible, false);
    assert.equal(stageOne.visible, false);
    assert.equal(stageTwo.visible, true);
    let stageTwoMeshes = 0;
    stageTwo.traverse((object) => { if (object instanceof THREE.Mesh) stageTwoMeshes += 1; });
    assert.ok(stageTwoMeshes >= 45, `${kind} fledgling should retain a complete authored model (${stageTwoMeshes})`);
    assert.notEqual(stageOne.scale, stageTwo.scale, "life-stage forms are independent objects");
    named(stageTwo, `${kind}-fledgling-adolescent-back-crest-1`);
    const hatchlingWing = named(stageOne, `${kind}-hatchling-left-wing-arm`) as THREE.Mesh;
    const fledglingWing = named(stageTwo, `${kind}-fledgling-left-wing-arm`) as THREE.Mesh;
    hatchlingWing.geometry.computeBoundingBox();
    fledglingWing.geometry.computeBoundingBox();
    assert.ok((fledglingWing.geometry.boundingBox?.max.x ?? 0) > (hatchlingWing.geometry.boundingBox?.max.x ?? 0), `${kind} Stage 2 wings must be structurally longer`);

    assert.equal(applyDragonLifeStage(model.visual, 3), true);
    assert.equal(adult.visible, true);
    assert.equal(stageOne.visible, false);
    assert.equal(stageTwo.visible, false);
  }
});

test("young forms inherit a distinct elemental motif from every mature species", () => {
  const signatures = {
    "fire-dragon": ["hatchling-ember-tuft-2", "hatchling-ember-tail-lantern"],
    "ice-dragon": ["hatchling-rime-crown-2", "hatchling-snowcap-brow"],
    "steel-dragon": ["hatchling-rounded-visor", "hatchling-little-hammer-tail"],
    "sea-dragon": ["hatchling-left-cheek-frill-1", "hatchling-left-tide-tail-fin"],
    "gold-dragon": ["hatchling-sun-petal-3", "hatchling-sun-button-tail"],
    "silver-dragon": ["hatchling-left-moon-ear", "hatchling-left-crescent-tail-tip"],
  } as const;
  for (const [kind, parts] of Object.entries(signatures)) {
    const model = createMobVisual(kind as (typeof DRAGON_ORDER)[number], 921);
    for (const suffix of parts) named(model.group, `${kind}-${suffix}`);
  }
});

test("each species has bespoke riding tack, panniers, and armor silhouettes", () => {
  const tack = {
    "fire-dragon": ["obsidian-pommel", "ember-ward"],
    "ice-dragon": ["crystal-saddle-pommel", "rime-saddle-blanket"],
    "steel-dragon": ["command-pommel", "left-control-lever"],
    "sea-dragon": ["tideglass-pommel", "left-kelp-rein"],
    "gold-dragon": ["sun-throne-pommel", "left-sun-wing-rest"],
    "silver-dragon": ["crescent-pommel", "left-moon-hook"],
  } as const;
  for (const [kind, pieces] of Object.entries(tack)) {
    const model = createMobVisual(kind as (typeof DRAGON_ORDER)[number], 950);
    applyDragonPose(model.visual, { timeSeconds: 0.7, stage: 5, equipment: { saddle: true, leftChest: true, rightChest: true, armor: { head: true, neck: true, body: true, tail: true } } });
    for (const piece of pieces) named(model.group, `${kind}-${piece}`);
    for (const attachment of ["left-cargo", "right-cargo", "head-armor", "neck-armor", "body-armor", "tail-armor"]) {
      assert.equal(named(model.group, `${kind}-${attachment}`).visible, true);
    }
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
    stage: 5,
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

test("dragon pose transforms are stable across repeated calls and animate both young stages", () => {
  const model = createMobVisual("sea-dragon", 944);
  const root = model.visual;
  const pose = { timeSeconds: 3.75, stage: 1 as const, mode: "fly" as const, movement: 0.72, attackProgress: 0.38, bank: 0.2, pitch: -0.1 };
  applyDragonPose(root, pose);
  const hatchlingWing = named(root, "sea-dragon-hatchling-left-wing-pivot");
  const hatchlingTail = named(root, "sea-dragon-hatchling-tail-3-pivot");
  const first = [hatchlingWing.rotation.z, hatchlingTail.rotation.y, hatchlingTail.position.x, hatchlingTail.scale.x];
  applyDragonPose(root, pose);
  assert.deepEqual([hatchlingWing.rotation.z, hatchlingTail.rotation.y, hatchlingTail.position.x, hatchlingTail.scale.x], first);
  assert.equal(named(root, "sea-dragon-stage-1-form").visible, true);

  applyDragonPose(root, { ...pose, stage: 2, timeSeconds: 4.2 });
  const fledglingWing = named(root, "sea-dragon-fledgling-left-wing-pivot");
  assert.equal(named(root, "sea-dragon-stage-1-form").visible, false);
  assert.equal(named(root, "sea-dragon-stage-2-form").visible, true);
  assert.notEqual(fledglingWing.rotation.z, 0);

  applyDragonPose(root, { ...pose, stage: 5, mode: "melee", timeSeconds: 4.8 });
  assert.equal(named(root, "sea-dragon-adult-form").visible, true);
  assert.equal(named(root, "sea-dragon-stage-2-form").visible, false);
});

test("Stage II and mature dragons trail articulated limbs backward in flight", () => {
  for (const [index, kind] of DRAGON_ORDER.entries()) {
    const model = createMobVisual(kind, 1_240 + index);
    const root = model.group;
    const flight = { timeSeconds: 1.37, mode: "fly" as const, movement: 0.82 };

    applyDragonPose(root, { ...flight, stage: 2 });
    const fledglingFrontLeft = named(root, `${kind}-fledgling-front-left-leg-pivot`);
    const fledglingFrontRight = named(root, `${kind}-fledgling-front-right-leg-pivot`);
    const fledglingRear = named(root, `${kind}-fledgling-rear-left-leg-pivot`);
    const fledglingKnee = named(root, `${kind}-fledgling-front-left-knee-pivot`);
    const fledglingClaw = named(root, `${kind}-fledgling-front-left-claw-pivot`);
    assert.ok(fledglingFrontLeft.rotation.x < -1, `${kind} Stage II forelegs trail decisively behind its chest`);
    assert.ok(fledglingRear.rotation.x < fledglingFrontLeft.rotation.x - 0.08, `${kind} Stage II rear legs make the longer sweep`);
    assert.ok(fledglingKnee.rotation.x > 0.15, `${kind} Stage II knees visibly flex`);
    assert.ok(fledglingClaw.rotation.x < -0.28, `${kind} Stage II claws curl into the slipstream`);
    assert.notEqual(fledglingFrontLeft.rotation.x, fledglingFrontRight.rotation.x, `${kind} Stage II legs avoid a stiff parallel pose`);
    root.updateMatrixWorld(true);
    for (const position of ["front-left", "front-right", "rear-left", "rear-right"] as const) {
      const hip = named(root, `${kind}-fledgling-${position}-leg-pivot`);
      const paw = named(root, `${kind}-fledgling-${position}-claw-pivot`);
      const hipWorld = new THREE.Vector3();
      hip.getWorldPosition(hipWorld);
      const pawBounds = new THREE.Box3().setFromObject(paw);
      assert.ok(pawBounds.max.z > hipWorld.z + 0.65, `${kind} Stage II ${position} paw ends materially tailward of its hip`);
    }

    applyDragonPose(root, { ...flight, stage: 5 });
    const adultFrontLeft = named(root, `${kind}-front-left-hip-pivot`);
    const adultFrontRight = named(root, `${kind}-front-right-hip-pivot`);
    const adultRear = named(root, `${kind}-rear-left-hip-pivot`);
    const adultKnee = named(root, `${kind}-front-left-knee-pivot`);
    const adultClaw = named(root, `${kind}-front-left-claw-pivot`);
    assert.ok(adultFrontLeft.rotation.x < -0.9, `${kind} mature forelegs trail decisively behind its chest`);
    assert.ok(adultRear.rotation.x < adultFrontLeft.rotation.x - 0.08, `${kind} mature rear legs make the longer sweep`);
    assert.ok(adultKnee.rotation.x > 0.14, `${kind} mature knees remain bent`);
    assert.ok(adultClaw.rotation.x < -0.24, `${kind} mature claws remain tucked`);
    assert.notEqual(adultFrontLeft.rotation.x, adultFrontRight.rotation.x, `${kind} mature legs avoid a stiff parallel pose`);
    root.updateMatrixWorld(true);
    for (const position of ["front-left", "front-right", "rear-left", "rear-right"] as const) {
      const hip = named(root, `${kind}-${position}-hip-pivot`);
      const paw = named(root, `${kind}-${position}-claw-pivot`);
      const hipWorld = new THREE.Vector3();
      hip.getWorldPosition(hipWorld);
      const pawBounds = new THREE.Box3().setFromObject(paw);
      assert.ok(pawBounds.max.z > hipWorld.z + 1.1, `${kind} mature ${position} paw ends materially tailward of its hip`);
    }

    const stable = [adultFrontLeft.rotation.x, adultKnee.rotation.x, adultClaw.rotation.x];
    applyDragonPose(root, { ...flight, stage: 5 });
    assert.deepEqual([adultFrontLeft.rotation.x, adultKnee.rotation.x, adultClaw.rotation.x], stable, `${kind} flight articulation cannot accumulate drift`);
  }
});

test("the new flight silhouette does not alter Stage I shoulder posture or grounded gaits", () => {
  const model = createMobVisual("fire-dragon", 1_301);
  const root = model.group;

  applyDragonPose(root, { timeSeconds: 1.37, stage: 1, mode: "fly", movement: 0.82 });
  assert.equal(named(root, "fire-dragon-hatchling-front-left-leg-pivot").rotation.x, 0.7, "Stage I keeps its established compact flight/shoulder articulation");
  assert.equal(named(root, "fire-dragon-hatchling-rear-left-leg-pivot").rotation.x, -0.42);

  applyDragonPose(root, { timeSeconds: 1.37, stage: 2, mode: "idle", movement: 0 });
  assert.ok(Math.abs(named(root, "fire-dragon-fledgling-front-left-leg-pivot").rotation.x) < 1e-9);
  assert.ok(Math.abs(named(root, "fire-dragon-fledgling-front-left-knee-pivot").rotation.x) < 1e-9);
  assert.ok(Math.abs(named(root, "fire-dragon-fledgling-front-left-claw-pivot").rotation.x) < 1e-9);

  applyDragonPose(root, { timeSeconds: 1.37, stage: 5, mode: "idle", movement: 0 });
  assert.ok(Math.abs(named(root, "fire-dragon-front-left-hip-pivot").rotation.x) < 1e-9);
  assert.ok(Math.abs(named(root, "fire-dragon-front-left-knee-pivot").rotation.x) < 1e-9);
  assert.ok(Math.abs(named(root, "fire-dragon-front-left-claw-pivot").rotation.x) < 1e-9);
});

test("airborne melee and hurt overlays retain the trailing flight silhouette", () => {
  const model = createMobVisual("fire-dragon", 1_302);
  const root = model.group;

  for (const mode of ["melee", "hurt"] as const) {
    applyDragonPose(root, {
      timeSeconds: 2.1,
      stage: 5,
      mode,
      airborne: true,
      movement: 0.8,
      attackProgress: mode === "melee" ? 0.52 : 0,
    });
    assert.ok(named(root, "fire-dragon-front-left-hip-pivot").rotation.x < -0.9,
      `${mode} must not drop an airborne dragon back into its grounded foreleg pose`);
    assert.ok(named(root, "fire-dragon-rear-left-hip-pivot").rotation.x < -1.08,
      `${mode} must keep the rear legs swept into the slipstream`);
  }

  applyDragonPose(root, { timeSeconds: 2.1, stage: 5, mode: "melee", airborne: false, movement: 0.8, attackProgress: 0.52 });
  assert.ok(named(root, "fire-dragon-front-left-hip-pivot").rotation.x > -0.5,
    "the explicit airborne channel must not turn a grounded claw attack into a flight pose");
});

test("all six silhouettes carry distinct elemental anatomy in production portraits", () => {
  const specs = createMobInspectionSpecs().filter((spec) => DRAGON_ORDER.includes(spec.id as (typeof DRAGON_ORDER)[number]));
  assert.deepEqual(specs.map((spec) => spec.id), DRAGON_ORDER);
  const fire = specs[0];
  const ice = specs[1];
  const steel = specs[2];
  const sea = specs[3];
  const gold = specs[4];
  const silver = specs[5];
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
  assert.ok(gold.boxes.some((box) => box.id.includes("solar-heart-core")));
  assert.ok(gold.boxes.filter((box) => box.id.includes("gilded-flight-feather")).length >= 8);
  assert.ok(gold.boxes.some((box) => box.id.includes("solar-tail-disc")));
  assert.ok(gold.boxes.some((box) => box.id.includes("sun-crown-ray")));
  assert.ok(silver.boxes.some((box) => box.id.includes("lunar-heart-core")));
  assert.ok(silver.boxes.filter((box) => box.id.includes("mirror-wing-blade")).length >= 8);
  assert.ok(silver.boxes.some((box) => box.id.includes("lunar-tail-blade")));
  assert.ok(silver.boxes.some((box) => box.id.includes("crescent-cheek")));
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
    assert.equal(
      deployed.replace(/\r\n?/gu, "\n"),
      renderModelPortrait(spec).replace(/\r\n?/gu, "\n"),
      `${spec.id}.svg is stale; regenerate the creature portrait catalog`,
    );
  }
});
