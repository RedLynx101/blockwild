import assert from "node:assert/strict";
import test from "node:test";
import {
  BlockId,
  CREATIVE_BLOCKS,
  CREATIVE_FLORA,
  Item,
  ORDINARY_FLOWERS,
  RECIPES,
  itemForBlock,
  recipePatterns,
} from "../app/game/data.ts";
import { MOB_DEFS } from "../app/game/mobs.ts";
import { canBreedPeelops, createPeelopState, feedPeelop, tryTamePeelop } from "../app/game/peelop.ts";

test("birds and fish use their own useful drop families", () => {
  for (const kind of ["emberjay", "canopy-lark", "tidewing-gull", "frostquill"] as const) {
    assert.ok(MOB_DEFS[kind].drops.some((drop) => drop.item === Item.Feather && drop.chance === 1));
    assert.equal(MOB_DEFS[kind].drops.some((drop) => drop.item === Item.Fiber), false);
  }
  for (const kind of ["shoalfin", "coralback", "brookdart", "gloomfin"] as const) {
    assert.ok(MOB_DEFS[kind].drops.some((drop) => drop.item === Item.RawFish));
    assert.equal(MOB_DEFS[kind].drops.some((drop) => drop.item === Item.RawMeat), false);
  }
  assert.ok(MOB_DEFS.gloomfin.drops.some((drop) => drop.item === Item.GlowScale && drop.chance === 1));
});

test("Golden Bananas are the strongest Peelop care food", () => {
  const hungry = { ...createPeelopState(41), health: 1, hunger: 3 };
  const bananaFed = feedPeelop(hungry, "banana");
  const appleFed = feedPeelop(hungry, "apple");
  assert.ok(bananaFed.health > appleFed.health);
  assert.ok(bananaFed.hunger > appleFed.hunger);
  assert.equal(tryTamePeelop(hungry, "keeper", "banana", 0.8).tamed, true);
  assert.equal(tryTamePeelop(hungry, "keeper", "apple", 0.8).tamed, false);
  const adult = { ...createPeelopState(99), tamed: true, ownerId: "keeper", health: 5, hunger: 8 };
  assert.equal(canBreedPeelops(adult, adult), false);
  assert.equal(canBreedPeelops(feedPeelop(adult, "banana"), feedPeelop({ ...adult, geneticSeed: 100 }, "banana")), true);
});

test("new flora is selectable and Goldenleaf plants provide survival bananas", () => {
  assert.deepEqual(CREATIVE_FLORA, [
    BlockId.TallGrass,
    BlockId.RedFlower,
    BlockId.BlueFlower,
    BlockId.WildwoodSapling,
    BlockId.Sunpetal,
    BlockId.MoonOrchid,
    BlockId.DesertShrub,
    BlockId.BananaPlant,
    BlockId.RiverRibbon,
    BlockId.GlowKelp,
    BlockId.ReedBloom,
    BlockId.Cloudbell,
    Item.Gumdrop,
    Item.PeppermintCane,
    Item.LollipopPetal,
    Item.MarshmallowTuft,
    Item.CandywoodSaplingItem,
    Item.Frostpear,
  ]);
  for (const flora of CREATIVE_FLORA) assert.ok(CREATIVE_BLOCKS.includes(flora));
  const harvest = RECIPES.find((recipe) => recipe.id === "banana_harvest");
  assert.deepEqual(harvest?.pattern, [BlockId.BananaPlant]);
  assert.deepEqual(harvest?.output, { item: Item.Banana, count: 2 });
});

test("recipe refresh preserves mirrored axes and gives fauna materials a purpose", () => {
  const axes = RECIPES.filter((recipe) => recipe.id.endsWith("_axe"));
  assert.equal(axes.length, 4);
  for (const axe of axes) {
    assert.equal(axe.mirrored, true);
    assert.equal(recipePatterns(axe).length, 2);
  }
  const tideglass = RECIPES.find((recipe) => recipe.id === "tideglass_charm")!;
  assert.ok(tideglass.pattern.filter((ingredient) => ingredient === Item.GlowScale).length >= 2);
  const net = RECIPES.find((recipe) => recipe.id === "butterfly_net")!;
  const softSlot = net.pattern[0];
  assert.ok(Array.isArray(softSlot));
  assert.ok(softSlot.includes(Item.Feather));
  const exhibit = RECIPES.find((recipe) => recipe.id === "butterfly_exhibit")!;
  assert.deepEqual(exhibit.pattern[4], ORDINARY_FLOWERS.map(itemForBlock));
});
