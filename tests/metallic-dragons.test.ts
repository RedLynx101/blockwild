import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { BLUEPRINTS } from "../app/game/blueprints.ts";
import { BLOCKS, BLOCK_ITEM_ALIASES, ITEMS, RECIPES, BlockId, Item } from "../app/game/data.ts";
import { DRAGON_EGG_HATCH_RULES, dragonLairCandidateForRegion } from "../app/game/dragon-world.ts";
import { dragonAttackPlan, dragonEggCondition } from "../app/game/dragons.ts";
import { COMMERCE_CATALOG, merchantOffersFor } from "../app/game/economy.ts";
import { createAvatarHeldItemModel } from "../app/game/held-items.ts";
import { COMMERCE_ITEM_CODES, HEARTHROADS_RESOURCE_ITEMS } from "../app/game/hearthroads-adapter.ts";
import { applyDragonPose, createMobVisual } from "../app/game/mob-models.ts";
import { MOB_DEFS } from "../app/game/mobs.ts";

const meshCount = (root: THREE.Object3D, fragment: string) => {
  let count = 0;
  root.traverse((object) => { if (object instanceof THREE.Mesh && object.name.includes(fragment)) count += 1; });
  return count;
};

test("Gold and Silver Dragons have complete mythic lifecycle, loot, crafting, and commerce contracts", () => {
  for (const type of ["gold", "silver"] as const) {
    const title = type === "gold" ? "Gold" : "Silver";
    const kind = `${type}-dragon` as const;
    const egg = type === "gold" ? Item.GoldDragonEgg : Item.SilverDragonEgg;
    const eggBlock = type === "gold" ? BlockId.GoldDragonEggBlock : BlockId.SilverDragonEggBlock;
    const stone = type === "gold" ? BlockId.GildedDragonstone : BlockId.ArgentDragonstone;
    const stoneItem = type === "gold" ? Item.GildedDragonstoneItem : Item.ArgentDragonstoneItem;
    const armor = type === "gold" ? Item.GoldDragonArmorModule : Item.SilverDragonArmorModule;
    const survey = type === "gold" ? Item.GoldLairSurvey : Item.SilverLairSurvey;
    const elderSurvey = type === "gold" ? Item.GoldElderLairSurvey : Item.SilverElderLairSurvey;
    assert.equal(MOB_DEFS[kind].dragonType, type);
    assert.ok(MOB_DEFS[kind].xp >= 320);
    assert.ok(MOB_DEFS[kind].drops.some((drop) => drop.item === (type === "gold" ? Item.GoldDragonScale : Item.SilverDragonScale)));
    assert.equal(ITEMS[egg].placeBlock, eggBlock);
    assert.equal(BLOCKS[eggBlock].layer, "emissive");
    assert.equal(BLOCKS[stone].layer, "emissive");
    assert.equal(BLOCK_ITEM_ALIASES[eggBlock], egg);
    assert.equal(BLOCK_ITEM_ALIASES[stone], stoneItem);
    assert.equal(ITEMS[armor].dragonType, type);
    assert.deepEqual(ITEMS[survey].lairSurvey, { dragonType: type, minimumStage: 4 });
    assert.deepEqual(ITEMS[elderSurvey].lairSurvey, { dragonType: type, minimumStage: 5 });
    assert.ok(HEARTHROADS_RESOURCE_ITEMS[`${type}-dragon-heart`]);
    assert.equal(COMMERCE_ITEM_CODES[`${type}-lair-survey`], survey);
    assert.ok(COMMERCE_CATALOG[`${type}-lair-survey`].baseValue >= 3_800);
    assert.match(DRAGON_EGG_HATCH_RULES[type].description, /ten uninterrupted/u);
    assert.match(ITEMS[egg].name, new RegExp(title, "u"));
  }
  const husbandry = BLUEPRINTS.find((blueprint) => blueprint.id === "dragon-husbandry");
  for (const recipe of ["solar-regalia-dragon-armor", "moonmirror-dragon-armor", "sunlily-catalyst", "moonlily-catalyst"]) {
    assert.ok(RECIPES.some((entry) => entry.id === recipe));
    assert.ok(husbandry?.recipeIds.includes(recipe));
  }
  assert.ok(merchantOffersFor("hobbits", "mayor").some((offer) => offer.itemKey === "gold-lair-survey"));
  assert.ok(merchantOffersFor("wood-elves", "wood-elf-moonbroker").some((offer) => offer.itemKey === "silver-lair-survey"));
});

test("mythic metallic lairs are deterministic and much rarer than common dragon lairs", () => {
  const counts = new Map<string, number>();
  let present = 0;
  for (let regionX = 0; regionX < 6_000; regionX += 1) {
    const candidate = dragonLairCandidateForRegion({ seed: "METALLIC-RARITY-AUDIT", regionX, regionZ: 17 });
    if (!candidate) continue;
    present += 1;
    counts.set(candidate.type, (counts.get(candidate.type) ?? 0) + 1);
    assert.deepEqual(candidate, dragonLairCandidateForRegion({ seed: "METALLIC-RARITY-AUDIT", regionX, regionZ: 17 }));
  }
  const mythic = (counts.get("gold") ?? 0) + (counts.get("silver") ?? 0);
  const mythicShare = mythic / present;
  assert.ok(present > 1_500);
  assert.ok(mythicShare > 0.045 && mythicShare < 0.095, `expected about 7% mythic lairs, got ${mythicShare}`);
  assert.ok((counts.get("gold") ?? 0) < (counts.get("fire") ?? 0) / 5);
  assert.ok((counts.get("silver") ?? 0) < (counts.get("ice") ?? 0) / 5);
});

test("metallic eggs use distinct animated 3D crowns and exact celestial hatch rituals", () => {
  const gold = createAvatarHeldItemModel(Item.GoldDragonEgg)!;
  const silver = createAvatarHeldItemModel(Item.SilverDragonEgg)!;
  assert.ok(meshCount(gold, "gold-dragon-egg-corona") >= 12);
  assert.ok(meshCount(gold, "gold-dragon-egg-raised-plate") >= 4);
  assert.ok(meshCount(silver, "silver-dragon-egg-crescent") >= 10);
  assert.ok(meshCount(silver, "silver-dragon-egg-constellation") >= 8);
  for (const model of [gold, silver]) {
    let shimmerNodes = 0;
    model.traverse((object) => { if (object.userData.eggShimmer) shimmerNodes += 1; });
    assert.ok(shimmerNodes >= 9);
  }
  assert.equal(dragonEggCondition("gold", { directSunlight: true, preciousMetal: true }).met, true);
  assert.equal(dragonEggCondition("gold", { directSunlight: true }).met, false);
  assert.equal(dragonEggCondition("silver", { moonlight: true, preciousMetal: true }).met, true);
  assert.equal(dragonEggCondition("silver", { moonlight: true }).met, false);
});

test("Gold and Silver production rigs have dense unique anatomy, shimmer, equipment hooks, and attacks", () => {
  const gold = createMobVisual("gold-dragon", 502).group;
  const silver = createMobVisual("silver-dragon", 503).group;
  assert.ok(meshCount(gold, "sunscale") >= 24);
  assert.ok(meshCount(gold, "gilded-flight-feather") >= 8);
  assert.ok(meshCount(gold, "sun-crown-ray") >= 7);
  assert.ok(gold.getObjectByName("gold-dragon-solar-tail-disc"));
  assert.ok(meshCount(silver, "mirrorscale") >= 32);
  assert.ok(meshCount(silver, "mirror-wing-blade") >= 8);
  assert.ok(meshCount(silver, "constellation-node") >= 5);
  assert.ok(meshCount(silver, "lunar-tail-blade") >= 2);
  for (const [type, root] of [["gold", gold], ["silver", silver]] as const) {
    let total = 0;
    let shimmer = 0;
    root.traverse((object) => {
      if (object instanceof THREE.Mesh) total += 1;
      if (object.userData.dragonShimmer) shimmer += 1;
    });
    assert.ok(total >= 180, `${type} dragon should keep a mythic detail budget`);
    assert.ok(shimmer >= 12, `${type} dragon should expose animated shimmer nodes`);
    assert.equal(applyDragonPose(root, { timeSeconds: 2.7, mode: "fly", movement: 1, sex: "female", equipment: { saddle: true, leftChest: true, armor: { body: true } } }), true);
    assert.equal(root.getObjectByName(`${type}-dragon-saddle`)?.visible, true);
    assert.equal(root.getObjectByName(`${type}-dragon-body-armor`)?.visible, true);
  }
  assert.equal(dragonAttackPlan("gold", 5, "projectile").shape, "solar-disc");
  assert.equal(dragonAttackPlan("gold", 5, "projectile").status, "burning");
  assert.equal(dragonAttackPlan("silver", 5, "projectile").shape, "moon-crescent");
  assert.equal(dragonAttackPlan("silver", 5, "projectile").status, "slowed");
});
