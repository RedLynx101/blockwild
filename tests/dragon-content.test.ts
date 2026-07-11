import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { BLOCKS, BLOCK_ITEM_ALIASES, ITEMS, RECIPES, SMELTING, BlockId, Item, archiveShelfBlockForBookCount, archiveShelfBookCount } from "../app/game/data";
import { BLUEPRINTS, blueprintForRecipe } from "../app/game/blueprints";
import { COMMERCE_CATALOG, merchantOffersFor } from "../app/game/economy";
import { COMMERCE_ITEM_CODES, HEARTHROADS_RESOURCE_ITEMS } from "../app/game/hearthroads-adapter";
import { createAvatarHeldItemModel } from "../app/game/held-items";
import { DEFAULT_QUEST_DEFINITIONS } from "../app/game/quests";

test("Dragonwake registers three eggs, hoard blocks, stations, and exact block aliases", () => {
  for (const [block, item] of [
    [BlockId.FireDragonEggBlock, Item.FireDragonEgg],
    [BlockId.IceDragonEggBlock, Item.IceDragonEgg],
    [BlockId.SteelDragonEggBlock, Item.SteelDragonEgg],
    [BlockId.DraconicIncubator, Item.DraconicIncubatorItem],
    [BlockId.ArchiveShelf, Item.ArchiveShelfItem],
    [BlockId.TomeDisplay, Item.TomeDisplayItem],
    [BlockId.GoldBlock, Item.GoldBlockItem],
    [BlockId.GoldPile, Item.GoldPileItem],
  ] as const) {
    assert.ok(BLOCKS[block]);
    assert.ok(ITEMS[item]);
    assert.equal(BLOCK_ITEM_ALIASES[block], item);
  }
  assert.equal(BLOCKS[BlockId.DraconicIncubator].shape, "incubator");
  assert.equal(BLOCKS[BlockId.ArchiveShelf].shape, "archive-shelf");
  assert.equal(BLOCKS[BlockId.TomeDisplay].shape, "tome-display");
  assert.equal(archiveShelfBookCount(BlockId.ArchiveShelf), 0);
  assert.equal(archiveShelfBookCount(BlockId.ArchiveShelfSix), 6);
  assert.equal(archiveShelfBlockForBookCount(4), BlockId.ArchiveShelfFour);
  assert.equal(archiveShelfBlockForBookCount(99), BlockId.ArchiveShelfSix);
  assert.equal(BLOCK_ITEM_ALIASES[BlockId.ArchiveShelfThree], Item.ArchiveShelfItem);
});

test("dragon drops, growth food, modules, tools, armor and tomes have gameplay semantics", () => {
  assert.equal(ITEMS[Item.DragonMeal].maxStack, 64);
  assert.equal(SMELTING[Item.RawDragonMeat].item, Item.CookedDragonMeat);
  assert.equal(ITEMS[Item.DragonboneGreatsword].damage, 15);
  assert.equal(ITEMS[Item.DragonbonePickaxe].tier, 5);
  assert.equal(ITEMS[Item.DragonSaddle].dragonModule, "saddle");
  assert.equal(ITEMS[Item.DragonChestModule].dragonModule, "chest");
  assert.equal(ITEMS[Item.SteelDragonArmorModule].dragonModule, "armor");
  assert.equal(ITEMS[Item.SteelDragonArmorModule].dragonType, "steel");
  assert.equal(ITEMS[Item.TomeFlameJet].spellId, "flame-jet");
  assert.equal(ITEMS[Item.TomeArcaneWard].spellId, "arcane-ward");
  assert.equal(ITEMS[Item.ManaheartDraught].manaIncrease, 5);
  assert.deepEqual(ITEMS[Item.FireLairSurvey].lairSurvey, { dragonType: "fire", minimumStage: 4 });
  assert.deepEqual(ITEMS[Item.FireElderLairSurvey].lairSurvey, { dragonType: "fire", minimumStage: 5 });
  const armor = [
    Item.FireScaleHelm, Item.FireScalePlate, Item.FireScaleGreaves, Item.FireScaleBoots,
    Item.IceScaleHelm, Item.IceScalePlate, Item.IceScaleGreaves, Item.IceScaleBoots,
    Item.SteelScaleHelm, Item.SteelScalePlate, Item.SteelScaleGreaves, Item.SteelScaleBoots,
  ];
  assert.equal(new Set(armor.map((item) => ITEMS[item].equipmentSlot)).size, 4);
  assert.ok(armor.every((item) => (ITEMS[item].maxDurability ?? 0) >= 1_400));
});

test("dragon eggs and trophy materials have readable semantic inventory and world silhouettes", () => {
  const semanticKinds = new Map([
    [Item.FireDragonEgg, "dragon-egg"],
    [Item.IceDragonEgg, "dragon-egg"],
    [Item.SteelDragonEgg, "dragon-egg"],
    [Item.FireDragonScale, "dragon-scale"],
    [Item.IceDragonScale, "dragon-scale"],
    [Item.SteelDragonScale, "dragon-scale"],
    [Item.DragonBone, "dragon-bone"],
    [Item.FireDragonHeart, "dragon-heart"],
    [Item.IceDragonHeart, "dragon-heart"],
    [Item.SteelDragonHeart, "dragon-heart"],
    [Item.FireDragonSkull, "dragon-skull"],
    [Item.IceDragonSkull, "dragon-skull"],
    [Item.SteelDragonSkull, "dragon-skull"],
  ] as const);
  for (const [item, iconKind] of semanticKinds) assert.equal(ITEMS[item].iconKind, iconKind);

  const shellColors = new Set<string>();
  for (const [item, type] of [[Item.FireDragonEgg, "fire"], [Item.IceDragonEgg, "ice"], [Item.SteelDragonEgg, "steel"]] as const) {
    assert.equal(ITEMS[item].heldModel, "dragon-egg");
    assert.equal(ITEMS[item].dropModel, "dragon-egg");
    const model = createAvatarHeldItemModel(item);
    assert.ok(model, `${type} egg needs a shared production model`);
    assert.equal(model.userData.dragonEggType, type);
    assert.equal(model.children.filter((child) => child.name.startsWith("dragon-egg-shell-")).length, 5);
    assert.ok(model.getObjectByName("dragon-egg-rune-stem"));
    assert.ok(model.scale.x <= 0.8, "held egg stays compact instead of filling the first-person view");
    const shell = model.getObjectByName("dragon-egg-shell-3");
    assert.ok(shell instanceof THREE.Mesh);
    assert.ok(shell.material instanceof THREE.MeshLambertMaterial);
    shellColors.add(shell.material.color.getHexString());
  }
  assert.equal(shellColors.size, 3, "each elemental shell keeps its own color");

  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  for (const iconKind of new Set(semanticKinds.values())) {
    const rule = css.split(`.item-icon-kind-${iconKind}::before {`).at(-1)?.split("}")[0] ?? "";
    assert.match(rule, /var\(--item-color\)/u, `${iconKind} artwork must inherit the item color`);
  }
});

test("dragon crafting is blueprint-gated and gold blocks break down losslessly", () => {
  const ids = new Set(RECIPES.map((recipe) => recipe.id));
  for (const id of [
    "gold-block", "gold-block-breakdown", "bound-book", "draconic-incubator", "dragon-meal",
    "dragonflight-saddle", "dragon-pannier", "dragonbone-greatsword", "dragonbone-pickaxe",
    "dragonbone-axe", "fire-scale-plate", "ice-scale-plate", "steel-scale-plate",
  ]) assert.ok(ids.has(id), id);
  assert.equal(RECIPES.find((recipe) => recipe.id === "gold-block")?.pattern.length, 9);
  assert.deepEqual(RECIPES.find((recipe) => recipe.id === "gold-block-breakdown")?.output, { item: Item.GoldIngot, count: 9 });
  assert.equal(blueprintForRecipe("dragonbone-greatsword"), "dragonbone-arms");
  assert.equal(blueprintForRecipe("steel-scale-plate"), "dragon-scale-armor");
  assert.equal(blueprintForRecipe("dragon-meal"), "dragon-husbandry");
  assert.equal(blueprintForRecipe("draconic-incubator"), "draconic-incubator");
  assert.ok(BLUEPRINTS.find((blueprint) => blueprint.id === "dragon-scale-armor")?.recipeIds.length === 12);
});

test("rare merchant stock and adapter keys cover surveys, tomes and treatises", () => {
  for (const key of [
    "fire-lair-survey", "ice-lair-survey", "steel-lair-survey",
    "elder-fire-lair-survey", "elder-ice-lair-survey", "elder-steel-lair-survey",
    "tome-flame-jet", "tome-frost-lance", "tome-steel-spear",
    "tome-healing-light", "tome-blinkstep", "tome-arcane-ward",
    "blueprint-dragonbone-arms", "blueprint-dragon-scale-armor",
    "blueprint-draconic-incubator", "blueprint-dragon-husbandry", "manaheart-draught",
  ]) {
    assert.ok(COMMERCE_CATALOG[key], key);
    assert.ok(COMMERCE_ITEM_CODES[key], key);
  }
  assert.equal(HEARTHROADS_RESOURCE_ITEMS["manaheart-draught"], Item.ManaheartDraught);
  assert.ok(merchantOffersFor("hobbits", "alchemist").some((offer) => offer.itemKey === "tome-healing-light"));
  assert.ok(merchantOffersFor("goblins", "blacksmith").some((offer) => offer.itemKey === "blueprint-dragonbone-arms"));
  assert.ok(merchantOffersFor("atlantians", "atlantian-pearlbroker").some((offer) => offer.itemKey === "ice-lair-survey"));
  assert.ok(merchantOffersFor("sugarcourt", "sugarcourt-sweetbroker").some((offer) => offer.itemKey === "steel-lair-survey"));
  // Availability seeds apply the rare roll; no seed remains a catalog-preview API.
  assert.ok(merchantOffersFor("hobbits", "alchemist", "deterministic-stock").length <= merchantOffersFor("hobbits", "alchemist").length);
});

test("main dragon branch unlocks mana only after lair, elder kill, and crafted gear", () => {
  const byId = new Map(DEFAULT_QUEST_DEFINITIONS.map((quest) => [quest.id, quest]));
  const lair = byId.get("main-rumor-under-stone");
  const kill = byId.get("main-teeth-of-the-deep");
  const attune = byId.get("main-dragonwake-attunement");
  assert.equal(lair?.objectives[0].kind, "custom");
  assert.deepEqual(kill?.prerequisites?.allOf, ["main-rumor-under-stone"]);
  assert.deepEqual(attune?.prerequisites?.allOf, ["main-teeth-of-the-deep"]);
  assert.ok(attune?.rewards.items.some((reward) => reward.itemId === "manaheart-draught"));
  assert.deepEqual(byId.get("main-the-fifth-shadow")?.prerequisites?.allOf, ["main-dragonwake-attunement"]);
  assert.equal(byId.get("main-the-fifth-shadow")?.objectives[0].kind, "custom");
  assert.ok(byId.get("dragonwake-living-archive")?.rewards.items.some((reward) => reward.itemId === "tome-blinkstep"));
  assert.equal(byId.get("dragonwake-three-temperatures")?.objectives.length, 3);
});
