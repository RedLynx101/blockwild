import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { applyWildlifePose, createMobVisual } from "../app/game/mob-models";
import { LEGENDARY_CREATURE_ORDER, LIVING_ROSTER_ORDER, SUMMONED_CREATURE_ORDER } from "../app/game/mobs";
import { creatureHasCustomSound } from "../app/game/creature-sounds";

const expansionKinds = [...LIVING_ROSTER_ORDER, ...LEGENDARY_CREATURE_ORDER, ...SUMMONED_CREATURE_ORDER] as const;

function poseVector(root: THREE.Object3D) {
  const output: number[] = [];
  root.traverse((object) => {
    output.push(
      object.position.x, object.position.y, object.position.z,
      object.rotation.x, object.rotation.y, object.rotation.z,
      object.scale.x, object.scale.y, object.scale.z,
    );
  });
  return output;
}

test("every expansion creature uses a detailed canonical production model with drift-free living motion", () => {
  for (const [index, kind] of expansionKinds.entries()) {
    const model = createMobVisual(kind, 80_000 + index);
    let meshCount = 0;
    model.visual.traverse((object) => { if (object instanceof THREE.Mesh) meshCount += 1; });
    assert.ok(meshCount >= 12, `${kind} needs a production-detail silhouette`);
    const rootY = model.visual.position.y;
    applyWildlifePose(model.visual, kind, .2, .7, .4);
    const first = poseVector(model.visual);
    applyWildlifePose(model.visual, kind, 1.1, .7, .4);
    const second = poseVector(model.visual);
    assert.equal(model.visual.position.y, rootY, `${kind} secondary motion must not drift its contact plane`);
    assert.ok(second.every(Number.isFinite), `${kind} pose must remain finite`);
    assert.ok(second.some((value, component) => Math.abs(value - first[component]) > 1e-5), `${kind} needs readable living motion`);

    const head = model.visual.getObjectByName(`${kind}-head-pivot`);
    if (head) {
      const eyes: THREE.Object3D[] = [];
      head.traverse((object) => { if (/-eye$/u.test(object.name)) eyes.push(object); });
      assert.ok(eyes.length >= 2, `${kind} articulated eyes must follow its head`);
    }
  }
});

test("rideable expansion creatures carry hidden tailored tack with correct seat counts", () => {
  const expectedSeats = new Map<string, number>([["stormcrest-ibex", 1], ["stormglass-roclet", 1], ["wreckwhistle-porpoise", 1], ["voidmantle-ray", 1], ["ilyr-virebloom", 2], ["thalassene", 2], ["varkesh-stormmane", 2], ["kharza", 1]]);
  for (const [kind, seats] of expectedSeats) {
    const model = createMobVisual(kind as typeof expansionKinds[number], 93_000 + seats);
    const tack = model.visual.getObjectByName(`${kind}-travel-harness`);
    assert.ok(tack, `${kind} needs fitted travel tack`);
    assert.equal(tack.visible, false, "tack stays hidden until a saddle is fitted");
    assert.equal(tack.userData.creatureSaddle, true);
    assert.equal(tack.children.filter((child) => /harness-seat-/u.test(child.name)).length, seats);
  }
});

test("every expansion creature has an intentional recorded sound palette", () => {
  for (const kind of expansionKinds) assert.equal(creatureHasCustomSound(kind), true, `${kind} needs an approved shared or bespoke recorded call`);
});
