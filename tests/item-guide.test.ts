import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { ITEMS, Item, RECIPES, SMELTING } from "../app/game/data.ts";
import { ITEM_GUIDE_ENTRIES, ITEM_GUIDE_PROCESSES, buildItemGuideEntries, itemGuideMatches } from "../app/game/item-guide.ts";

test("the item guide covers every registered item with deterministic prose and origins", () => {
  assert.equal(ITEM_GUIDE_ENTRIES.length, Object.keys(ITEMS).length);
  assert.deepEqual(buildItemGuideEntries(), ITEM_GUIDE_ENTRIES);
  for (const entry of ITEM_GUIDE_ENTRIES) {
    assert.ok(entry.name.length > 0, String(entry.item));
    assert.ok(entry.description.length > 20, entry.name);
    assert.ok(entry.origins.length > 0, `${entry.name} needs at least one deterministic origin`);
  }
});

test("crafting, milling, furnace, alchemy, distillery, and Sugarworks processes share one index", () => {
  for (const recipe of RECIPES) assert.ok(ITEM_GUIDE_PROCESSES.some((process) => process.craftingRecipeId === recipe.id));
  for (const input of Object.keys(SMELTING)) assert.ok(ITEM_GUIDE_PROCESSES.some((process) => process.id === `smelt:${input}`));
  for (const station of ["Hand crafting", "Crafting table", "Furnace", "Wheat Mill", "Alchemy Stand", "Distillery", "Sugarworks"] as const) {
    assert.ok(ITEM_GUIDE_PROCESSES.some((process) => process.station === station), station);
  }
  const stick = ITEM_GUIDE_ENTRIES.find((entry) => entry.item === Item.Stick)!;
  assert.ok(stick.usedIn.length > 4);
  assert.equal(itemGuideMatches(stick, "crafting"), true);
  const flour = ITEM_GUIDE_ENTRIES.find((entry) => entry.item === Item.Flour)!;
  assert.ok(flour.madeBy.some((process) => process.station === "Wheat Mill" && process.inputs.some((input) => input.items.includes(Item.Wheat))));
  const wheat = ITEM_GUIDE_ENTRIES.find((entry) => entry.item === Item.Wheat)!;
  assert.ok(wheat.usedIn.some((process) => process.station === "Wheat Mill" && process.outputItem === Item.Flour));
});

test("the searchable guide is available beside recipes and every crafting station", () => {
  const ui = readFileSync(new URL("../app/game/VoxelGame.tsx", import.meta.url), "utf8");
  assert.match(ui, /Blockwild Wiki/u);
  assert.match(ui, /WIKI_CATEGORY_ORDER/u);
  assert.match(ui, /Open web wiki/u);
  assert.match(ui, /Deterministic origins/u);
  assert.match(ui, /What it makes/u);
  assert.match(ui, /Open pattern board/u);
  assert.match(ui, /inventory.*crafting.*furnace.*alchemy.*distillery.*sugarworks/u);
});
