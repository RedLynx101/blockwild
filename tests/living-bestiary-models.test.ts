import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { applyWildlifePose, createMobVisual } from "../app/game/mob-models";
import { LEGENDARY_CREATURE_ORDER, LIVING_ROSTER_ORDER, MOB_DEFS, SUMMONED_CREATURE_ORDER } from "../app/game/mobs";
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
    let organicCount = 0;
    model.visual.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      meshCount += 1;
      if (object.userData.livingShape && object.userData.livingShape !== "hard") organicCount += 1;
    });
    assert.ok(meshCount >= 12, `${kind} needs a production-detail silhouette`);
    assert.ok(organicCount >= 8, `${kind} needs rounded, tapered, or faceted anatomy beyond cuboid blockout geometry`);
    const primaryBody = model.visual.getObjectByName(`${kind}-body`) as THREE.Mesh | undefined;
    if (primaryBody) assert.equal(primaryBody.userData.livingShape, "organic", `${kind} primary body cannot remain a box`);
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

test("critical silhouettes have authored anatomy and true supernatural negative space", () => {
  const jerboa = createMobVisual("glassstep-jerboa", 94_001).visual;
  assert.equal(jerboa.getObjectByName("glassstep-jerboa-front-left-leg-pivot")?.visible, false);
  assert.ok(jerboa.getObjectByName("glassstep-jerboa-left-forepaw-pivot"));
  assert.ok(jerboa.getObjectByName("glassstep-jerboa-tail-brush"));

  const basilisk = createMobVisual("cragglass-basilisk", 94_002).visual;
  const basiliskLegs = basilisk.children.filter((child) => /(?:front|rear|middle)-(?:left|right)-leg-pivot|(?:left|right)-middle-leg-pivot/u.test(child.name));
  assert.equal(basiliskLegs.length, 6, "the six-legged basilisk keeps its lore silhouette");

  const cuttle = createMobVisual("inkveil-cuttle", 94_003).visual;
  assert.equal(cuttle.getObjectByName("inkveil-cuttle-tail-root-pivot")?.visible, false, "cuttlefish do not retain the generic fish tail");
  assert.ok(cuttle.getObjectByName("inkveil-cuttle-left-fin-skirt-pivot"));

  const eel = createMobVisual("currentweaver-eel", 94_004).visual;
  assert.equal(eel.getObjectByName("currentweaver-eel-tail-root-pivot"), undefined, "eel uses a continuous body wave instead of fish tail lobes");
  assert.ok(eel.getObjectByName("currentweaver-eel-continuous-dorsal-ribbon"));

  const orichalc = createMobVisual("orichalc", 94_005).visual;
  assert.equal(orichalc.getObjectByName("orichalc-empty-center-frame"), undefined, "Orichalc's unresolved center must be real negative space");
  assert.ok(orichalc.getObjectByName("orichalc-empty-center-orbit"));
  assert.ok(orichalc.getObjectByName("orichalc-oath-meridian-ring"));

  for (const kind of ["orichalc", "vellum-warden"] as const) {
    const model = createMobVisual(kind, 94_100);
    model.group.position.y = MOB_DEFS[kind].footOffset - .5;
    model.group.updateMatrixWorld(true);
    assert.ok(Math.abs(new THREE.Box3().setFromObject(model.visual).min.y) < 1e-6, `${kind} curved contact geometry must meet the terrain plane exactly`);
  }
});

test("floating, spinning, transparent and shimmering concepts retain nonuniform authored scale", () => {
  for (const kind of ["orichalc", "asterjaw", "vellum-warden", "choir-of-one", "glasswake-stag"] as const) {
    const visual = createMobVisual(kind, 95_000).visual;
    const tagged: THREE.Object3D[] = [];
    const transparent: THREE.Mesh[] = [];
    visual.traverse((object) => {
      if (object.userData.livingFloatAmplitude || object.userData.livingSpinRate || object.userData.livingShimmerAmplitude) tagged.push(object);
      if (object instanceof THREE.Mesh && (Array.isArray(object.material) ? object.material : [object.material]).some((material) => material.transparent && material.opacity < 1)) transparent.push(object);
    });
    assert.ok(tagged.length >= 2, `${kind} needs authored supernatural secondary motion`);
    assert.ok(transparent.length >= 1, `${kind} needs intentional transmissive or translucent material`);
  }

  const visual = createMobVisual("orichalc", 95_100).visual;
  const heart = visual.getObjectByName("orichalc-unresolved-heart-0")!;
  const initial = heart.scale.clone();
  applyWildlifePose(visual, "orichalc", 2.6, .7, .5);
  assert.ok(Math.abs(heart.scale.x / heart.scale.y - initial.x / initial.y) < 1e-6);
  assert.ok(Math.abs(heart.scale.z / heart.scale.y - initial.z / initial.y) < 1e-6);
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
