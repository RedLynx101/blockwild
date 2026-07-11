import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { BlockId, Item, RECIPES, mirrorRecipePattern } from "../app/game/data.ts";
import { VoxelEngine, isEditableKeyboardTarget, type InventorySlot } from "../app/game/engine.ts";
import { MOB_DEFS } from "../app/game/mobs.ts";
import { BlockPlayerModel } from "../app/game/player-model.ts";
import { GAME_RELEASE_NAME, GAME_VERSION, normalizeGameVersion } from "../app/game/version.ts";
import {
  bestiaryEntryCompletion,
  bestiaryKindsForFilter,
  itemHoverText,
  itemIconKind,
  normalizeMultiplayerRoomCode,
  recipeMatchesQuery,
  recipePreviewGrid,
} from "../app/game/VoxelGame.tsx";

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
  assert.equal(GAME_VERSION, "0.4.0");
  assert.equal(GAME_RELEASE_NAME, "Wayfinder");
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

test("hotbar selection sends its lightweight UI signal before the full HUD refresh", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  const calls: string[] = [];
  engine.selected = 0;
  engine.events = {
    onHud: () => undefined,
    onSelectedSlot: (slot) => calls.push(`selected:${slot}`),
    onToast: () => undefined,
    onLockChange: () => undefined,
    onOverlayRequest: () => undefined,
    onDeath: () => undefined,
    onSave: () => undefined,
  };
  engine.audio = { play: () => calls.push("audio") } as unknown as VoxelEngine["audio"];
  engine.emitHud = () => { calls.push("hud"); };
  engine.selectSlot(3);
  assert.equal(engine.selected, 3);
  assert.deepEqual(calls, ["selected:3", "audio", "hud"]);
});

test("text fields suppress gameplay shortcuts", () => {
  assert.equal(isEditableKeyboardTarget({ tagName: "INPUT" } as unknown as EventTarget), true);
  assert.equal(isEditableKeyboardTarget({ tagName: "TEXTAREA" } as unknown as EventTarget), true);
  assert.equal(isEditableKeyboardTarget({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget), true);
  assert.equal(isEditableKeyboardTarget({ tagName: "CANVAS" } as unknown as EventTarget), false);
});

test("inventory artwork stays semantic at real slot sizes and food hover copy is explicit", () => {
  assert.equal(itemIconKind(Item.Stick), "stick");
  assert.equal(itemIconKind(Item.RottenFlesh), "rotten-flesh");
  assert.equal(itemIconKind(Item.Wheat), "wheat");
  assert.equal(itemIconKind(BlockId.CraftingTable), "crafting-table");
  assert.equal(itemIconKind(BlockId.RedFlower), "world-flora-red");
  assert.match(itemHoverText({ item: Item.Apple, count: 1 }), /Food \+4/u);
});

test("bestiary filters and completion respond to care progress", () => {
  assert.equal(bestiaryKindsForFilter("birds").includes("emberjay"), true);
  assert.equal(bestiaryKindsForFilter("butterflies").includes("meadowwing"), true);
  assert.equal(bestiaryKindsForFilter("monsters").includes("zombie"), true);
  assert.equal(bestiaryKindsForFilter("companions").includes("peelop"), true);
  assert.equal(bestiaryEntryCompletion(MOB_DEFS.peelop, { seen: false, kills: 0, captures: 0 }), 0);
  assert.equal(bestiaryEntryCompletion(MOB_DEFS.peelop, { seen: true, kills: 0, captures: 0, tames: 1, breeds: 1, secretUnlocked: true }), 100);
});

test("bestiary portraits stay contained above their navigation chrome", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const viewportRule = css.split(".bestiary-portrait > .creature-render {")
    .slice(1)
    .map((rule) => rule.split("}")[0])
    .find((rule) => /inset:\s*0\s+0\s+38px/u.test(rule)) ?? "";
  const portraitRule = css.split(".bestiary-portrait .creature-render-hero img {").at(-1)?.split("}")[0] ?? "";
  assert.match(viewportRule, /position:\s*absolute/u);
  assert.match(viewportRule, /inset:\s*0\s+0\s+38px/u);
  assert.match(viewportRule, /overflow:\s*hidden/u);
  assert.match(portraitRule, /height:\s*100%/u);
  assert.match(portraitRule, /max-height:\s*100%/u);
  assert.match(portraitRule, /object-fit:\s*contain/u);
  assert.match(portraitRule, /transform:\s*none/u);
});

test("multiplayer room codes remain short and shareable", () => {
  assert.equal(normalizeMultiplayerRoomCode(" wild  trail!! 42 "), "WILDTRAIL42");
  assert.equal(normalizeMultiplayerRoomCode("A".repeat(40)).length, 24);
});
