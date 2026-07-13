import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import {
  BLOCKS,
  DRAGON_HOARD_COIN_TILE,
  DRAGON_HOARD_GOLD_TILE,
  DRAGON_HOARD_JEWEL_TILE,
  BlockId,
  Item,
  ITEMS,
} from "../app/game/data";
import { DRAGON_EQUIPMENT_PALETTES, createAvatarHeldItemModel } from "../app/game/held-items";
import { itemIconKind } from "../app/game/VoxelGame";
import { createV145DragonAssetAuditSpecs } from "../scripts/render-v145-dragon-assets";

const BARDING = [
  [Item.FireDragonArmorModule, "fire", "fire-barding-living-flame-crest"],
  [Item.IceDragonArmorModule, "ice", "ice-barding-faceted-breastplate"],
  [Item.SteelDragonArmorModule, "steel", "steel-barding-pressure-dial"],
  [Item.TideglassDragonArmorModule, "sea", "sea-barding-lumen-pearl"],
  [Item.GoldDragonArmorModule, "gold", "gold-barding-sun-disc"],
  [Item.SilverDragonArmorModule, "silver", "silver-barding-crescent-1"],
] as const;

test("dragon tack and hoard wealth use semantic inventory and shared held/drop models", () => {
  assert.equal(ITEMS[Item.DragonSaddle].iconKind, "dragon-saddle");
  assert.equal(ITEMS[Item.DragonSaddle].heldModel, "dragon-saddle");
  assert.equal(ITEMS[Item.DragonSaddle].dropModel, "dragon-saddle");
  assert.equal(ITEMS[Item.DragonChestModule].iconKind, "dragon-pannier");
  assert.equal(ITEMS[Item.DragonChestModule].heldModel, "dragon-pannier");
  assert.equal(ITEMS[Item.GoldBlockItem].iconKind, "gold-hoard-block");
  assert.equal(ITEMS[Item.GoldPileItem].iconKind, "gold-pile");
  assert.equal(ITEMS[Item.GoldPileItem].dropModel, "gold-pile");
  for (const [item, type] of BARDING) {
    assert.equal(ITEMS[item].iconKind, `dragon-barding-${type}`);
    assert.equal(ITEMS[item].heldModel, "dragon-barding");
    assert.equal(ITEMS[item].dropModel, "dragon-barding");
  }
});

test("six dragon barding bundles have genuinely distinct production silhouettes", () => {
  const palettes = new Set<number>();
  const boxCounts = new Set<number>();
  for (const [item, type, signature] of BARDING) {
    const model = createAvatarHeldItemModel(item)!;
    assert.equal(model.userData.dragonEquipmentType, type);
    assert.ok(model.getObjectByName(signature), `${type} barding keeps its signature part`);
    assert.ok(model.getObjectByName(`${type}-barding-girth`));
    const meshes = model.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh);
    assert.ok(meshes.length >= 8, `${type} barding remains layered at hand scale`);
    boxCounts.add(meshes.length);
    const harness = model.getObjectByName(`${type}-barding-harness`);
    assert.ok(harness instanceof THREE.Mesh);
    assert.ok(harness.material instanceof THREE.MeshLambertMaterial);
    palettes.add(DRAGON_EQUIPMENT_PALETTES[type].primary);
  }
  assert.equal(palettes.size, 6);
  assert.ok(boxCounts.size >= 4, "barding families vary structurally rather than only recoloring one mesh");
});

test("Dragonflight Saddle and Pannier are detailed, compact, readable modules", () => {
  const saddle = createAvatarHeldItemModel(Item.DragonSaddle)!;
  assert.ok(saddle.getObjectByName("dragonflight-saddle-seat"));
  assert.ok(saddle.getObjectByName("dragonflight-saddle-waystar"));
  assert.ok(saddle.getObjectByName("dragonflight-saddle-left-wing"));
  assert.ok(saddle.children.length >= 16);
  const pannier = createAvatarHeldItemModel(Item.DragonChestModule)!;
  assert.ok(pannier.getObjectByName("dragon-pannier-weather-flap"));
  assert.ok(pannier.getObjectByName("dragon-pannier-rolled-bedroll"));
  assert.ok(pannier.getObjectByName("dragon-pannier-harness-clasp"));
  for (const model of [saddle, pannier]) {
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    assert.ok(Math.max(size.x, size.y, size.z) < 0.9, "module remains comfortable in first and third person");
  }
});

test("Dragon Gold Piles model loose coins, ingots, and gems instead of a block", () => {
  const pile = createAvatarHeldItemModel(Item.GoldPileItem)!;
  const names = pile.children.map((child) => child.name);
  assert.ok(names.filter((name) => name.startsWith("gold-pile-coin-")).length >= 15);
  assert.equal(names.filter((name) => name.startsWith("gold-pile-ingot-")).length, 3);
  assert.equal(names.filter((name) => name.startsWith("gold-pile-gem-")).length, 3);
  assert.equal(pile.children.some((child) => child.name.includes("brick")), false);
  const block = createAvatarHeldItemModel(Item.GoldBlockItem)!;
  assert.ok(block.getObjectByName("gold-hoard-block-dragon-seal"));
  assert.equal(block.children.filter((child) => child.name.startsWith("gold-hoard-block-gem-")).length, 2);
});

test("hoard blocks reserve authored atlas cells rather than borrowing Gold Ore", () => {
  assert.deepEqual([DRAGON_HOARD_GOLD_TILE, DRAGON_HOARD_COIN_TILE, DRAGON_HOARD_JEWEL_TILE], [163, 164, 165]);
  assert.equal(BLOCKS[BlockId.GoldBlock].top, DRAGON_HOARD_GOLD_TILE);
  assert.equal(BLOCKS[BlockId.GoldPile].side, DRAGON_HOARD_COIN_TILE);
  assert.notEqual(BLOCKS[BlockId.GoldBlock].top, BLOCKS[BlockId.GoldOre].top);
  const worldSource = readFileSync(new URL("../app/game/world.ts", import.meta.url), "utf8");
  assert.match(worldSource, /shape === "gold-pile"[\s\S]*DRAGON_HOARD_GOLD_TILE[\s\S]*DRAGON_HOARD_COIN_TILE[\s\S]*DRAGON_HOARD_JEWEL_TILE/u);
});

test("wearable dragon scale armor declares its element and gets slot-specific semantic icons", () => {
  const families = [
    ["fire", [Item.FireScaleHelm, Item.FireScalePlate, Item.FireScaleGreaves, Item.FireScaleBoots]],
    ["ice", [Item.IceScaleHelm, Item.IceScalePlate, Item.IceScaleGreaves, Item.IceScaleBoots]],
    ["steel", [Item.SteelScaleHelm, Item.SteelScalePlate, Item.SteelScaleGreaves, Item.SteelScaleBoots]],
  ] as const;
  for (const [type, items] of families) for (const item of items) {
    assert.equal(ITEMS[item].dragonType, type);
    assert.equal(itemIconKind(item), `dragon-player-${type}-${ITEMS[item].equipmentSlot}`);
    const held = createAvatarHeldItemModel(item)!;
    const elementParts = held.children.filter((child) => child.name.startsWith(`held-${type}-armor-`));
    assert.ok(elementParts.length >= (type === "steel" ? 5 : 3));
  }
});

test("real-size CSS and deterministic audit sheet cover the redesigned families", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  for (const kind of [
    "gold-hoard-block", "gold-pile", "dragon-saddle", "dragon-pannier",
    ...BARDING.map(([, type]) => `dragon-barding-${type}`),
  ]) {
    assert.match(css, new RegExp(`\\.item-icon-kind-${kind}::before`, "u"), `${kind} has authored 28px art`);
  }
  assert.match(css, /item-icon-kind-dragon-player-fire-/u);
  assert.match(css, /item-icon-kind-dragon-player-ice-/u);
  assert.match(css, /item-icon-kind-dragon-player-steel-/u);

  const specs = createV145DragonAssetAuditSpecs();
  assert.ok(specs.some((spec) => spec.id === "v145-before-gold-pile"));
  assert.ok(specs.some((spec) => spec.id === "v145-after-gold-pile"));
  assert.ok(specs.some((spec) => spec.id === "v145-before-barding"));
  for (const [, type] of BARDING) assert.ok(specs.some((spec) => spec.id === `v145-after-${type}-barding`));
});
