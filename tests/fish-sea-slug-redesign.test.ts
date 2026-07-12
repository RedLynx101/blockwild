import assert from "node:assert/strict";
import test from "node:test";
import { fishKindsForHabitat, type FishHabitat } from "../app/game/fauna.ts";
import { applyOceanCreaturePose, createMobVisual } from "../app/game/mob-models.ts";
import { AQUARIUM_MOB_ORDER, MOB_DEFS, type CoreMobKind, type SeaSlugKind } from "../app/game/mobs.ts";

const GENERIC_FISH = [
  "shoalfin", "coralback", "brookdart", "gloomfin", "silverthread", "reedneedle", "emberribbon", "cavefilament",
  "redfin-salmon", "blue-mackerel", "glassfin", "lanternjaw", "syrupfin", "glowfin", "pocket-goldfish",
  "sunwheel-angelfish", "stonewhisker-loach",
] as const satisfies readonly CoreMobKind[];

const SEA_SLUGS = AQUARIUM_MOB_ORDER.filter((kind): kind is SeaSlugKind => MOB_DEFS[kind].family === "sea-slug");
const HABITATS: readonly FishHabitat[] = ["ocean", "deep-ocean", "lumen-trench", "river", "underground", "syrup-pond", "glimmer-pond"];

test("every generic fish keeps a complete articulated swim rig", () => {
  assert.equal(GENERIC_FISH.length, 17);
  for (const kind of GENERIC_FISH) {
    const visual = createMobVisual(kind, 701).visual;
    assert.ok(visual.getObjectByName(`${kind}-body`), `${kind} needs a body`);
    assert.ok(visual.getObjectByName(`${kind}-head`), `${kind} needs a head`);
    assert.ok(visual.getObjectByName(`${kind}-left-fin`), `${kind} needs a left pectoral fin`);
    assert.ok(visual.getObjectByName(`${kind}-right-fin`), `${kind} needs a right pectoral fin`);
    const tail = visual.getObjectByName(`${kind}-tail-left-pivot`);
    const dorsal = visual.getObjectByName(`${kind}-dorsal-fin-pivot`);
    assert.ok(tail, `${kind} needs an articulated tail root`);
    assert.ok(dorsal, `${kind} needs an articulated dorsal root`);
    const tailBefore = tail.rotation.y;
    const dorsalBefore = dorsal.rotation.z;
    applyOceanCreaturePose(visual, kind, 1.37, 0.82);
    assert.notEqual(tail.rotation.y, tailBefore, `${kind} tail should swim`);
    assert.notEqual(dorsal.rotation.z, dorsalBefore, `${kind} dorsal should breathe with the stroke`);
  }
});

test("the sea-slug collection has fourteen distinct animated aquarium species", () => {
  assert.equal(SEA_SLUGS.length, 14);
  assert.equal(new Set(SEA_SLUGS.map((kind) => MOB_DEFS[kind].name)).size, SEA_SLUGS.length);
  for (const kind of SEA_SLUGS) {
    const visual = createMobVisual(kind, 702).visual;
    assert.ok(visual.getObjectByName(`${kind}-foot`), `${kind} needs a locomotor foot`);
    assert.ok(visual.getObjectByName(`${kind}-mantle`), `${kind} needs a mantle`);
    assert.ok(visual.getObjectByName(`${kind}-left-feeler-pivot`), `${kind} needs articulated rhinophores`);
    const appendages: Array<{ rotation: { x: number; z: number } }> = [];
    visual.traverse((part) => { if (part.userData.slugAppendage) appendages.push(part); });
    assert.ok(appendages.length >= 2, `${kind} needs animated external anatomy`);
    const before = appendages.map((part) => [part.rotation.x, part.rotation.z]);
    applyOceanCreaturePose(visual, kind, 2.16, 0.65);
    assert.notDeepEqual(appendages.map((part) => [part.rotation.x, part.rotation.z]), before, `${kind} appendages should move`);
    assert.ok(HABITATS.some((habitat) => fishKindsForHabitat(habitat).includes(kind)), `${kind} needs a natural habitat`);
  }
});

test("new fish occupy complementary reef and bottom-dwelling niches", () => {
  assert.ok(fishKindsForHabitat("ocean").includes("sunwheel-angelfish"));
  assert.ok(fishKindsForHabitat("river").includes("stonewhisker-loach"));
  assert.ok(fishKindsForHabitat("underground").includes("stonewhisker-loach"));
  assert.equal(MOB_DEFS["stonewhisker-loach"].bottomDweller, true);
  assert.equal(MOB_DEFS["blue-dragon-sea-slug"].bottomDweller, false);
  assert.equal(MOB_DEFS["sea-angel-slug"].bottomDweller, false);
});
