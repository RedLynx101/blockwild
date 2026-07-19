import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { BlockId, BLOCKS, BLOCK_ITEM_ALIASES, Item, ITEMS, RECIPES } from "../app/game/data.ts";
import { creatureSoundCue } from "../app/game/creature-sounds.ts";
import { offhandItemKind } from "../app/game/engine.ts";
import { naturalGroupSizeForMob, passiveMobSpawnTableForBiome } from "../app/game/fauna.ts";
import { createAvatarHeldItemModel } from "../app/game/held-items.ts";
import { applyOceanCreaturePose, applyWildlifePose, createMobVisual } from "../app/game/mob-models.ts";
import { MOB_DEFS, POLLINATOR_ORDER } from "../app/game/mobs.ts";
import { BiomeId } from "../app/game/world.ts";

test("requested wildlife redesigns expose their authored details and articulated poses", () => {
  const frog = createMobVisual("puddlehopper", -801).visual;
  const rearLeg = frog.getObjectByName("puddlehopper-left-rear-leg-pivot")!;
  applyWildlifePose(frog, "puddlehopper", 0, 1, 0);
  const restRotation = rearLeg.rotation.x;
  applyWildlifePose(frog, "puddlehopper", Math.PI / 7.6, 1, 0);
  assert.notEqual(rearLeg.rotation.x, restRotation, "Puddlehopper rear legs must extend through its hop cycle");
  assert.ok(frog.getObjectByName("puddlehopper-throat-pouch"));

  const reedstrider = createMobVisual("reedstrider", -802).visual;
  assert.equal(reedstrider.userData.wildlifeRig, "reedstrider");
  assert.ok(reedstrider.getObjectByName("reedstrider-left-wing-flash"));
  assert.ok(reedstrider.getObjectByName("reedstrider-right-wing-eye"));

  for (const kind of ["meadow-cottontail", "russet-rabbit", "frost-hare", "chocolate-bunny"] as const) {
    const rabbit = createMobVisual(kind, -803).visual;
    assert.equal(rabbit.userData.authoredScale, 0.82);
    for (const side of ["left", "right"] as const) for (let whisker = 1; whisker <= 3; whisker += 1) {
      assert.ok(rabbit.getObjectByName(`${kind}-${side}-whisker-${whisker}`), `${kind} is missing whisker ${side}/${whisker}`);
    }
    const rear = rabbit.getObjectByName(`${kind}-left-rear-leg-pivot`)!;
    applyOceanCreaturePose(rabbit, kind, 0.2, 1);
    assert.notEqual(rear.rotation.x, 0);
  }

  const glowmoth = createMobVisual("glowmoth", -804).visual;
  glowmoth.updateMatrixWorld(true);
  for (const side of ["left", "right"] as const) {
    const root = glowmoth.getObjectByName(`glowmoth-${side}-antenna-pivot`)!;
    const tip = glowmoth.getObjectByName(`glowmoth-${side}-antenna-tip`)!;
    assert.ok(tip.getWorldPosition(new THREE.Vector3()).y > root.getWorldPosition(new THREE.Vector3()).y, `${side} antenna must rise away from its connector`);
  }

  const woolhorn = createMobVisual("woolhorn", -805).visual;
  assert.equal(woolhorn.getObjectByName("woolhorn-wool-coat")?.userData.woolhornCoat, true);
  assert.equal(woolhorn.getObjectByName("woolhorn-beard")?.userData.woolhornCoat, true);

  for (const [kind, detail] of [
    ["brambleboar", "brambleboar-side-bramble-1"],
    ["glimmerhart", "glimmerhart-left-antler-pivot"],
    ["copper-mole", "copper-mole-back-plate-1"],
    ["rattlekin", "rattlekin-skull-crack-a"],
    ["skeleton", "skeleton-quiver"],
  ] as const) assert.ok(createMobVisual(kind, -806).visual.getObjectByName(detail), `${kind} is missing ${detail}`);
});

test("Puddlehopper settles between hops while Trufflehog and Clockwork Marmot use readable travel rigs", () => {
  const frog = createMobVisual("puddlehopper", -820).visual;
  const frogLeg = frog.getObjectByName("puddlehopper-left-rear-leg-pivot")!;
  applyWildlifePose(frog, "puddlehopper", 0.1, 1, 0);
  const early = frogLeg.rotation.x;
  applyWildlifePose(frog, "puddlehopper", 0.2, 1, 0);
  const settledDelta = Math.abs(frogLeg.rotation.x - early);
  assert.ok(settledDelta < 0.35, `resting Puddlehopper legs should not vibrate between frames (${settledDelta})`);

  const trufflehogModel = createMobVisual("thornhide-trufflehog", -821);
  const trufflehog = trufflehogModel.visual;
  const truffleLeg = trufflehogModel.parts.legs[0];
  assert.ok(truffleLeg, "Thornhide Trufflehog needs an articulated leg rig");
  applyWildlifePose(trufflehog, "thornhide-trufflehog", 0.15, 0.85, 0);
  const before = truffleLeg.rotation.x;
  applyWildlifePose(trufflehog, "thornhide-trufflehog", 0.85, 0.85, 0);
  assert.notEqual(truffleLeg.rotation.x, before, "Living Bestiary quadrupeds must receive their authored walking pose");

  const marmot = createMobVisual("clockwork-marmot", -822).visual;
  for (const part of ["boiler-body", "pressure-gauge", "winding-key-pivot", "left-gear-pivot", "right-gear-pivot", "tail-tip-pivot"]) {
    assert.ok(marmot.getObjectByName(`clockwork-marmot-${part}`), `Clockwork Marmot is missing ${part}`);
  }
  const gear = marmot.getObjectByName("clockwork-marmot-left-gear-pivot")!;
  applyWildlifePose(marmot, "clockwork-marmot", 0.1, 0.8, 0);
  const gearBefore = gear.rotation.x;
  applyWildlifePose(marmot, "clockwork-marmot", 0.9, 0.8, 0);
  assert.notEqual(gear.rotation.x, gearBefore, "Clockwork Marmot gears should turn during travel");
});

test("Lightning Bugs spawn, bottle into a placeable light, and use animated jar models", () => {
  assert.ok(POLLINATOR_ORDER.includes("lightning-bug"));
  assert.ok(passiveMobSpawnTableForBiome(BiomeId.Siltfen).some(([kind]) => kind === "lightning-bug"));
  assert.ok(passiveMobSpawnTableForBiome(BiomeId.Glimmerwood).some(([kind]) => kind === "lightning-bug"));
  assert.deepEqual(naturalGroupSizeForMob("lightning-bug", 0), 3);
  assert.deepEqual(naturalGroupSizeForMob("lightning-bug", 0.999), 8);
  assert.equal(MOB_DEFS["lightning-bug"].flying, true);
  assert.equal(ITEMS[Item.LightningBugJar].placeBlock, BlockId.LightningBugJar);
  assert.equal(BLOCK_ITEM_ALIASES[BlockId.LightningBugJar], Item.LightningBugJar);
  assert.equal(BLOCKS[BlockId.LightningBugJar].shape, "lightning-bug-jar");
  assert.equal(offhandItemKind(Item.LightningBugJar), "light");
  const jar = createAvatarHeldItemModel(Item.LightningBugJar)!;
  assert.equal(jar.getObjectByName("lightning-bug-jar-bug")?.userData.jarBug, true);
  assert.equal(jar.children.filter((child) => child.name.startsWith("lightning-bug-jar-glass-")).length, 4);
  const bug = createMobVisual("lightning-bug", -807).visual;
  assert.ok(bug.getObjectByName("lightning-bug-lantern"));
  assert.ok(bug.getObjectByName("lightning-bug-left-wing-pivot"));
});

test("Iron Shears and supplied species calls are registered", () => {
  assert.equal(ITEMS[Item.Shears].useKind, "shears");
  assert.ok(RECIPES.some((recipe) => recipe.id === "iron-shears" && recipe.output.item === Item.Shears));
  assert.ok(createAvatarHeldItemModel(Item.Shears)?.getObjectByName("shears-left-blade"));
  assert.equal(creatureSoundCue("puddlehopper", "ambient").asset, "puddlehopper-croak");
  assert.equal(creatureSoundCue("reedstrider", "ambient").asset, "reedstrider-call");
  assert.equal(creatureSoundCue("copper-mole", "ambient").asset, "copper-mole-sniff");
  assert.equal(creatureSoundCue("warg", "ambient").asset, "warg-deep-growl");
});
