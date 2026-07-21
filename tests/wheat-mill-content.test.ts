import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  BLOCK_ITEM_ALIASES,
  BLOCKS,
  BlockId,
  CREATIVE_BLOCKS,
  ITEMS,
  Item,
  RECIPES,
  assertUniqueItemIds,
  itemForBlock,
} from "../app/game/data.ts";
import { playerCommerceItem } from "../app/game/hearthroads-adapter.ts";
import { createAvatarHeldItemModel } from "../app/game/held-items.ts";
import { PLANTS } from "../app/game/plants.ts";
import {
  WHEAT_MILL_CYCLE_SECONDS,
  WHEAT_MILL_PROCESS,
  WHEAT_MILL_STACK_CAP,
  breakWheatMill,
  collectWheatMillOutput,
  createWheatMill,
  insertWheatMillInput,
  normalizeWheatMill,
  stepWheatMill,
} from "../app/game/wheat-mill.ts";

test("Hearthcraft ids are append-only, non-overlapping, and aliases remain explicit", () => {
  assert.deepEqual(
    [BlockId.WheatMill, BlockId.FlourCrate, BlockId.BreadCrate, Item.Flour, Item.WheatMillItem],
    [598, 599, 600, 601, 602],
  );
  assert.equal(assertUniqueItemIds(), true);
  assert.throws(
    () => assertUniqueItemIds({ ...Item, AccidentalFlourAlias: Item.Flour }),
    /Duplicate item id 601: AccidentalFlourAlias, Flour/u,
  );
  assert.equal(BLOCK_ITEM_ALIASES[BlockId.WheatMill], Item.WheatMillItem);
  assert.equal(itemForBlock(BlockId.WheatMill), Item.WheatMillItem);
  assert.equal(new Set([BlockId.WheatMill, BlockId.FlourCrate, BlockId.BreadCrate, Item.Flour, Item.WheatMillItem]).size, 5);
  assert.ok(CREATIVE_BLOCKS.includes(Item.WheatMillItem));
  assert.ok(CREATIVE_BLOCKS.includes(Item.Flour));
});

test("bread, Flour, mill, meat, and reversible pantry crates expose complete definitions", () => {
  assert.equal(ITEMS[Item.Bread].name, "Bread");
  assert.equal(ITEMS[Item.Flour].name, "Flour");
  assert.equal(ITEMS[Item.Flour].iconKind, "flour");
  assert.equal(ITEMS[Item.RawMeat].name, "Raw Meat");
  assert.equal(ITEMS[Item.CookedMeat].name, "Cooked Meat");
  assert.equal(BLOCKS[BlockId.WheatMill].name, "Wheat Mill");
  assert.equal(ITEMS[Item.WheatMillItem].placeBlock, BlockId.WheatMill);
  assert.equal(ITEMS[Item.WheatMillItem].heldModel, "wheat-mill");

  for (const [id, ingredient, crate] of [
    ["flour-crate", Item.Flour, BlockId.FlourCrate],
    ["bread-crate", Item.Bread, BlockId.BreadCrate],
  ] as const) {
    const pack = RECIPES.find((recipe) => recipe.id === id)!;
    const unpack = RECIPES.find((recipe) => recipe.id === `${id}-open`)!;
    assert.deepEqual(pack.pattern, Array(9).fill(ingredient));
    assert.deepEqual(pack.output, { item: crate, count: 1 });
    assert.deepEqual(unpack.pattern, [crate]);
    assert.deepEqual(unpack.output, { item: ingredient, count: 9 });
    assert.equal(ITEMS[crate].iconKind, "produce-crate");
    assert.equal(playerCommerceItem(crate)?.baseValue, (playerCommerceItem(ingredient)?.baseValue ?? 0) * 10);
  }
});

test("only baking migrates from Wheat to Flour", () => {
  assert.deepEqual(RECIPES.find((recipe) => recipe.id === "bread")?.pattern, [Item.Flour, Item.Flour, Item.Flour]);
  assert.deepEqual(
    RECIPES.find((recipe) => recipe.id === "hearthberry-apple-pie")?.pattern,
    [Item.Flour, Item.Flour, Item.Flour, Item.Apple, Item.Berry, Item.HoneyJar],
  );
  assert.deepEqual(RECIPES.find((recipe) => recipe.id === "moonberry-cookies")?.pattern, [Item.Flour, Item.Berry, Item.Flour]);
  assert.deepEqual(RECIPES.find((recipe) => recipe.id === "hearthkin_thatch")?.pattern, [Item.Wheat, Item.Wheat, Item.Fiber, Item.Fiber]);
  assert.match(PLANTS.find((plant) => plant.id === "wild-wheat")?.utility ?? "", /Mill grain into flour/u);
});

test("the passive mill converts Wheat to Flour one-for-one without fuel or loss", () => {
  assert.deepEqual(WHEAT_MILL_PROCESS.input, { item: Item.Wheat, count: 1 });
  assert.deepEqual(WHEAT_MILL_PROCESS.output, { item: Item.Flour, count: 1 });
  const inserted = insertWheatMillInput(createWheatMill(), { item: Item.Wheat, count: 3 });
  assert.equal(inserted.accepted, 3);
  assert.equal(inserted.remainder, null);

  let state = stepWheatMill(inserted.state, WHEAT_MILL_CYCLE_SECONDS - 0.25);
  assert.equal(state.output, null);
  assert.equal(state.input?.count, 3);
  state = stepWheatMill(state, 0.25);
  assert.deepEqual(state.output, { item: Item.Flour, count: 1 });
  assert.equal(state.input?.count, 2);
  state = stepWheatMill(state, WHEAT_MILL_CYCLE_SECONDS * 2);
  assert.equal(state.input, null);
  assert.deepEqual(state.output, { item: Item.Flour, count: 3 });
  assert.equal(state.progressSeconds, 0);

  const partial = collectWheatMillOutput(state, 2);
  assert.deepEqual(partial.collected, { item: Item.Flour, count: 2 });
  assert.deepEqual(partial.state.output, { item: Item.Flour, count: 1 });
  assert.deepEqual(breakWheatMill(partial.state).drops, [{ item: Item.Flour, count: 1 }]);
});

test("the mill caps stacks, sanitizes saves, and pauses against full output", () => {
  const inserted = insertWheatMillInput(createWheatMill(), { item: Item.Wheat, count: WHEAT_MILL_STACK_CAP + 7 });
  assert.equal(inserted.accepted, WHEAT_MILL_STACK_CAP);
  assert.deepEqual(inserted.remainder, { item: Item.Wheat, count: 7 });
  const blocked = normalizeWheatMill({
    schema: 999,
    input: { item: Item.Wheat, count: 2 },
    output: { item: Item.Flour, count: WHEAT_MILL_STACK_CAP },
    progressSeconds: 4,
  });
  assert.equal(blocked.progressSeconds, 0);
  assert.deepEqual(stepWheatMill(blocked, 60), blocked);
  assert.deepEqual(normalizeWheatMill({ input: { item: Item.Apple, count: 4 }, output: { item: Item.Bread, count: 2 } }), createWheatMill());
});

test("mill, stool, fence, and gate share recognizable held and drop model contracts", () => {
  const mill = createAvatarHeldItemModel(Item.WheatMillItem)!;
  assert.ok(mill.getObjectByName("wheat-mill-stone-wheel"));
  assert.ok(mill.getObjectByName("wheat-mill-grain-hopper"));
  assert.ok(mill.getObjectByName("wheat-mill-flour-chute"));

  for (const item of [Item.WildwoodStoolItem, Item.DeepgearStoolItem] as const) {
    const definition = ITEMS[item];
    assert.equal(definition.iconKind, "stool");
    assert.equal(definition.heldModel, "stool");
    assert.equal(definition.dropModel, "stool");
    const model = createAvatarHeldItemModel(item)!;
    assert.ok(model.getObjectByName(`${item === Item.DeepgearStoolItem ? "deepgear" : "wildwood"}-stool-seat`));
    assert.equal(model.getObjectByName("avatar-held-hearth-chair"), undefined);
  }

  assert.equal(ITEMS[BlockId.WildwoodFence].iconKind, "fence");
  assert.ok(createAvatarHeldItemModel(BlockId.WildwoodFence)?.getObjectByName("wildwood-fence-rail"));
  assert.equal(ITEMS[Item.WildwoodFenceGate].heldModel, "fence-gate");
  assert.ok(createAvatarHeldItemModel(Item.WildwoodFenceGate)?.getObjectByName("wildwood-gate-diagonal-brace"));
});

test("capture orb rack artwork centers the rack and its specimen rows", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.item-icon-kind-orb-rack::before\s*\{[^}]*left:\s*50%;[^}]*transform:\s*translateX\(-50%\);/su);
  assert.match(css, /\.item-icon-kind-orb-rack::after\s*\{[^}]*left:\s*3px;[^}]*width:\s*6px;[^}]*box-shadow:[^}]*18px 9px/su);
});
