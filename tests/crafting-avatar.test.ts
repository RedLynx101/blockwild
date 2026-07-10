import assert from "node:assert/strict";
import test from "node:test";
import { BlockId, Item, RECIPES, mirrorRecipePattern } from "../app/game/data.ts";
import { VoxelEngine, type InventorySlot } from "../app/game/engine.ts";
import { BlockPlayerModel } from "../app/game/player-model.ts";
import { GAME_RELEASE_NAME, GAME_VERSION, normalizeGameVersion } from "../app/game/version.ts";
import { recipeMatchesQuery, recipePreviewGrid } from "../app/game/VoxelGame.tsx";

function craftingHarness(inventory: Array<InventorySlot | null>, size: 2 | 3 = 3) {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  engine.inventory = Array.from({ length: 36 }, (_, index) => inventory[index] ? { ...inventory[index]! } : null);
  engine.craftGrid = Array.from({ length: 9 }, () => null);
  engine.craftingSize = size;
  engine.cursor = null;
  engine.activeRecipe = null;
  engine.events = {
    onHud: () => undefined,
    onToast: () => undefined,
    onLockChange: () => undefined,
    onOverlayRequest: () => undefined,
    onDeath: () => undefined,
    onSave: () => undefined,
  };
  engine.audio = { play: () => undefined } as unknown as VoxelEngine["audio"];
  engine.saveSoon = () => undefined;
  engine.emitHud = () => undefined;
  return engine;
}

test("recipe plans stage ingredients without producing the output", () => {
  const engine = craftingHarness([
    { item: BlockId.Cobblestone, count: 3 },
    { item: Item.Stick, count: 2 },
  ]);
  const result = engine.planRecipe("stone_axe");
  assert.equal(result.ok, true);
  assert.equal(engine.inventory.some((slot) => slot?.item === Item.StoneAxe), false);
  assert.equal(engine.findRecipe()?.recipe.id, "stone_axe");
  assert.equal(engine.craftGrid.filter(Boolean).length, 5);
});

test("recipe plans report exact missing materials without mutating the pack", () => {
  const engine = craftingHarness([{ item: BlockId.Cobblestone, count: 2 }]);
  const before = structuredClone(engine.inventory);
  const result = engine.planRecipe("stone_axe");
  assert.equal(result.ok, false);
  assert.equal(result.ok ? "" : result.reason, "missing");
  assert.match(result.message, /Cobblestone|Stick/u);
  assert.deepEqual(engine.inventory, before);
  assert.equal(engine.craftGrid.every((slot) => slot === null), true);
});

test("axe recipes accept the horizontally mirrored blade", () => {
  const engine = craftingHarness([]);
  engine.craftGrid[0] = { item: BlockId.Cobblestone, count: 1 };
  engine.craftGrid[1] = { item: BlockId.Cobblestone, count: 1 };
  engine.craftGrid[3] = { item: Item.Stick, count: 1 };
  engine.craftGrid[4] = { item: BlockId.Cobblestone, count: 1 };
  engine.craftGrid[6] = { item: Item.Stick, count: 1 };
  assert.equal(engine.findRecipe()?.recipe.id, "stone_axe");
  const recipe = RECIPES.find((candidate) => candidate.id === "stone_axe")!;
  assert.notDeepEqual(mirrorRecipePattern(recipe), recipe.pattern);
});

test("player variants and equipment alter the production rig", () => {
  const player = new BlockPlayerModel({ variant: "female" });
  assert.equal(player.variant, "female");
  assert.equal(player.group.userData.playerVariant, "female");
  assert.equal(player.group.getObjectByName("female-hair")?.visible, true);
  assert.equal(player.group.getObjectByName("male-hair")?.visible, false);
  player.setEquipmentAppearance({ head: "#d4b9a7", chest: "#8a6548" });
  assert.equal(player.group.getObjectByName("armor-head-cap")?.visible, true);
  assert.equal(player.group.getObjectByName("armor-chest")?.visible, true);
  player.setVariant("male");
  assert.equal(player.group.getObjectByName("male-hair")?.visible, true);
  player.dispose();
});

test("human release identity stays separate from save schemas", () => {
  assert.equal(GAME_VERSION, "0.2.0");
  assert.equal(GAME_RELEASE_NAME, "Menagerie");
  assert.equal(normalizeGameVersion("garbage"), "0.1.0");
});

test("recipe search includes output and ingredient names while previews stay 3×3", () => {
  const torch = RECIPES.find((recipe) => recipe.id === "torch")!;
  assert.equal(recipeMatchesQuery(torch, "coal"), true);
  assert.equal(recipeMatchesQuery(torch, "torches"), true);
  assert.equal(recipeMatchesQuery(torch, "banana"), false);
  const cells = recipePreviewGrid(torch);
  assert.equal(cells.length, 9);
  assert.equal(cells[0], Item.Coal);
  assert.equal(cells[3], Item.Stick);
});
