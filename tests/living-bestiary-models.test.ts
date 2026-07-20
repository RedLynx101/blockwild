import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { applyWildlifePose, createMobVisual } from "../app/game/mob-models";
import { CUBIC_STORYBOOK_VISUAL_KINDS, FACETED_STORYBOOK_EXCEPTION_KINDS } from "../app/game/living-bestiary-models";
import { LEGENDARY_CREATURE_ORDER, LIVING_ROSTER_ORDER, MOB_DEFS, SUMMONED_CREATURE_ORDER } from "../app/game/mobs";
import { creatureHasCustomSound } from "../app/game/creature-sounds";

const expansionKinds = [...LIVING_ROSTER_ORDER, ...LEGENDARY_CREATURE_ORDER, ...SUMMONED_CREATURE_ORDER] as const;
const cubicStorybookKinds = new Set<string>(CUBIC_STORYBOOK_VISUAL_KINDS);

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
    if (cubicStorybookKinds.has(kind)) {
      assert.equal(organicCount, 0, `${kind} must use its approved high-detail cubic runtime language throughout`);
      assert.equal(model.visual.userData.modelStyle, "high-detail-cubic");
    } else {
      assert.ok(organicCount >= 8, `${kind} needs rounded, tapered, or faceted anatomy beyond cuboid blockout geometry`);
      assert.equal(model.visual.userData.modelStyle, "faceted-storybook");
    }
    const primaryBody = model.visual.getObjectByName(`${kind}-body`) as THREE.Mesh | undefined;
    if (primaryBody) assert.equal(primaryBody.userData.livingShape, cubicStorybookKinds.has(kind) ? "hard" : "organic");
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

test("Living Bestiary birds and winged mythics keep left and right strokes synchronized", () => {
  const wingedKinds = [
    "orchard-glider",
    "ironbeak-magpie",
    "stormglass-roclet",
    "mirecrown-crane",
    "varkesh-stormmane",
    "cinderwing-pyrausta",
    "anemoi-gryphon",
  ] as const;
  for (const kind of wingedKinds) {
    const model = createMobVisual(kind, 91_000);
    applyWildlifePose(model.visual, kind, 1.37, .82, .25);
    const wingPairs = new Map<string, { left?: THREE.Object3D; right?: THREE.Object3D }>();
    for (const wing of model.parts.wings.filter((candidate) => /-(?:left|right)-wing-pivot$/u.test(candidate.name))) {
      const pairName = wing.name.replace(/(^|-)(?:left|right)(?=-|$)/u, "$1paired");
      const pair = wingPairs.get(pairName) ?? {};
      if (wing.name.includes("-left-")) pair.left = wing;
      else pair.right = wing;
      wingPairs.set(pairName, pair);
    }
    assert.ok(wingPairs.size >= 1, `${kind} needs at least one authored wing pair`);
    for (const pair of wingPairs.values()) {
      assert.ok(pair.left && pair.right, `${kind} needs both sides of every wing pair`);
      assert.ok(Math.abs(pair.left.rotation.z + pair.right.rotation.z) < 1e-10, `${kind} wing mates must share one stroke clock`);
    }
  }
});

test("the unified expansion roster uses true cuboid runtime geometry with four deliberate exceptions", () => {
  assert.deepEqual([...FACETED_STORYBOOK_EXCEPTION_KINDS], ["thalassene", "orichalc", "vellum-warden", "choir-of-one"]);
  assert.equal(CUBIC_STORYBOOK_VISUAL_KINDS.length, expansionKinds.length - FACETED_STORYBOOK_EXCEPTION_KINDS.length);
  assert.deepEqual(new Set([...CUBIC_STORYBOOK_VISUAL_KINDS, ...FACETED_STORYBOOK_EXCEPTION_KINDS]), new Set(expansionKinds));
  for (const [index, kind] of CUBIC_STORYBOOK_VISUAL_KINDS.entries()) {
    const visual = createMobVisual(kind, 89_000 + index).visual;
    let meshes = 0;
    visual.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || !object.visible) return;
      meshes += 1;
      assert.equal(object.geometry.type, "BoxGeometry", `${object.name} must be cuboid production geometry`);
      assert.equal(object.userData.livingShape, "hard", `${object.name} must identify its resolved cubic shape`);
      assert.equal(typeof object.userData.authoredShape, "string", `${object.name} must retain its semantic source shape`);
    });
    assert.ok(meshes >= 12, `${kind} must remain a detailed model rather than a low-detail blockout`);
  }
  for (const [index, kind] of FACETED_STORYBOOK_EXCEPTION_KINDS.entries()) {
    const visual = createMobVisual(kind, 89_500 + index).visual;
    assert.equal(visual.userData.modelStyle, "faceted-storybook");
    assert.ok(visual.getObjectByName(`${kind}-body`)?.userData.livingShape !== "hard" || kind === "orichalc");
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
  let basiliskMeshes = 0;
  basilisk.traverse((object) => { if (object instanceof THREE.Mesh) basiliskMeshes += 1; });
  assert.ok(basiliskMeshes >= 120, "the signature Basilisk should retain its layered production-detail budget");
  const basiliskHead = basilisk.getObjectByName("cragglass-basilisk-head-pivot")!;
  const basiliskJaw = basilisk.getObjectByName("cragglass-basilisk-lower-jaw-attack-pivot")!;
  const basiliskCrown = basilisk.getObjectByName("cragglass-basilisk-gaze-crown-pivot")!;
  const basiliskTailTip = basilisk.getObjectByName("cragglass-basilisk-tail-tip-pivot")!;
  assert.equal(basiliskJaw.parent, basiliskHead, "the opening jaw must follow the Basilisk's head");
  assert.equal(basiliskCrown.parent, basiliskHead, "the gaze crown must be rooted in the skull instead of floating above it");
  assert.equal(basilisk.getObjectByName("cragglass-basilisk-tail-breaker-cragglass")?.parent, basiliskTailTip, "the breaker belongs to the articulated tail tip");
  for (const side of ["left", "right"] as const) {
    const middle = basilisk.getObjectByName(`cragglass-basilisk-middle-${side}-leg-pivot`)!;
    const knee = basilisk.getObjectByName(`cragglass-basilisk-middle-${side}-knee-pivot`)!;
    const ankle = basilisk.getObjectByName(`cragglass-basilisk-middle-${side}-ankle-pivot`)!;
    const foot = basilisk.getObjectByName(`cragglass-basilisk-middle-${side}-foot-pivot`)!;
    assert.equal(knee.parent, middle);
    assert.equal(ankle.parent, knee);
    assert.equal(foot.parent, ankle);
    assert.equal(foot.children.filter((child) => /middle-(?:left|right)-claw/u.test(child.name)).length, 3);
  }
  applyWildlifePose(basilisk, "cragglass-basilisk", .8, 0, 0);
  const restingJaw = basiliskJaw.rotation.x;
  const restingCrown = basiliskCrown.rotation.x;
  const restingMiddleLeg = basilisk.getObjectByName("cragglass-basilisk-middle-left-leg-pivot")!.rotation.x;
  applyWildlifePose(basilisk, "cragglass-basilisk", 1.35, 1, 1);
  assert.ok(basiliskJaw.rotation.x < restingJaw - .1, "an alerted Basilisk should visibly open its jaw");
  assert.notEqual(basiliskCrown.rotation.x, restingCrown, "the focusing crown should tense with the gaze");
  assert.notEqual(basilisk.getObjectByName("cragglass-basilisk-middle-left-leg-pivot")!.rotation.x, restingMiddleLeg, "all six legs should join the crawl cycle");

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

test("the anatomy pass connects load-bearing limbs, feet, claws, and faces to their rigs", () => {
  for (const [index, kind] of expansionKinds.entries()) {
    const model = createMobVisual(kind, 96_000 + index);
    const visual = model.visual;
    if (visual.userData.bodyPlan === "quadruped") {
      const visibleLegs = visual.children.filter((child) => /-(?:front|rear)-(?:left|right)-leg-pivot$/u.test(child.name) && child.visible);
      assert.ok(visibleLegs.length >= 2, `${kind} needs visible load-bearing legs`);
      for (const leg of visibleLegs) {
        const knee = leg.children.find((child) => /-knee-pivot$/u.test(child.name));
        assert.ok(knee, `${leg.name} needs an attached knee`);
        const ankle = knee.children.find((child) => /-ankle-pivot$/u.test(child.name));
        assert.ok(ankle, `${leg.name} needs an attached ankle`);
        assert.ok(ankle.children.some((child) => /-foot-pivot$/u.test(child.name)), `${leg.name} needs an attached planted foot`);
      }
    } else if (visual.userData.bodyPlan === "bird") {
      for (const side of ["left", "right"] as const) {
        const leg = visual.getObjectByName(`${kind}-${side}-leg-pivot`)!;
        const hock = visual.getObjectByName(`${kind}-${side}-hock-pivot`)!;
        const foot = visual.getObjectByName(`${kind}-${side}-foot-pivot`)!;
        assert.equal(hock.parent, leg, `${kind} ${side} hock must be parented to its thigh`);
        assert.equal(foot.parent, hock, `${kind} ${side} foot must be parented to its shank`);
        assert.ok(foot.children.filter((child) => /talon/u.test(child.name)).length >= 3, `${kind} ${side} toes must originate in the foot`);
      }
    } else if (visual.userData.bodyPlan === "arthropod") {
      const legs = visual.children.filter((child) => /-leg-\d+-pivot$/u.test(child.name));
      assert.ok(legs.length >= 6, `${kind} needs its complete arthropod gait`);
      for (const leg of legs) {
        const knee = leg.children.find((child) => /-knee-pivot$/u.test(child.name));
        const foot = knee?.children.find((child) => /-foot-pivot$/u.test(child.name));
        assert.ok(foot, `${leg.name} needs a chained tibia and foot`);
        visual.updateMatrixWorld(true);
        const hipY = leg.getWorldPosition(new THREE.Vector3()).y;
        const kneeY = knee!.getWorldPosition(new THREE.Vector3()).y;
        const footY = foot!.getWorldPosition(new THREE.Vector3()).y;
        assert.ok(kneeY < hipY, `${leg.name} knee must descend below its hip; ${kneeY} !< ${hipY}`);
        assert.ok(footY < kneeY, `${leg.name} foot must descend below its knee; ${footY} !< ${kneeY}`);
      }
    }
    if (!MOB_DEFS[kind].flying && !MOB_DEFS[kind].aquatic) {
      model.group.position.y = MOB_DEFS[kind].footOffset - .5;
      model.group.updateMatrixWorld(true);
      const terrainDelta = new THREE.Box3().setFromObject(visual).min.y;
      assert.ok(Math.abs(terrainDelta) < 1e-6, `${kind} articulated feet must preserve its exact terrain contact; delta ${terrainDelta}`);
    }
  }

  const badger = createMobVisual("hearthback-badger", 97_001).visual;
  for (const side of ["left", "right"] as const) for (let claw = 0; claw < 3; claw += 1) {
    const object = badger.getObjectByName(`hearthback-badger-${side}-dig-claw-${claw}`)!;
    assert.match(object.parent?.name ?? "", new RegExp(`front-${side}-foot-pivot$`, "u"), "badger digging claws belong to the front paw");
  }

  const porpoise = createMobVisual("wreckwhistle-porpoise", 97_002).visual;
  const face = porpoise.getObjectByName("wreckwhistle-porpoise-face-pivot")!;
  assert.ok(face.getObjectByName("wreckwhistle-porpoise-left-eye"));
  assert.ok(face.getObjectByName("wreckwhistle-porpoise-right-eye"));
  assert.ok(face.getObjectByName("wreckwhistle-porpoise-lower-jaw"));
  assert.ok(face.getObjectByName("wreckwhistle-porpoise-smile-line"));
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
