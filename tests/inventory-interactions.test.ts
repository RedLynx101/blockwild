import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Item, type InventorySlot } from "../app/game/data.ts";
import { VoxelEngine } from "../app/game/engine.ts";
import { distributeInventoryCursor } from "../app/game/inventory-convenience.ts";
import { formatHudHealth } from "../app/game/VoxelGame.tsx";

function inventoryHarness() {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  engine.inventory = Array.from({ length: 36 }, () => null);
  engine.craftGrid = Array.from({ length: 9 }, () => null);
  engine.craftingSize = 2;
  engine.cursor = null;
  engine.trash = null;
  engine.audio = { play: () => undefined } as unknown as VoxelEngine["audio"];
  engine.saveSoon = () => undefined;
  engine.emitHud = () => undefined;
  (engine as unknown as { syncInventoryMutationNow: () => void }).syncInventoryMutationNow = () => undefined;
  engine.updateCraftResult = () => undefined;
  return engine;
}

test("combat health readouts stop at two useful decimal places", () => {
  assert.equal(formatHudHealth(7), "7");
  assert.equal(formatHudHealth(7.5), "7.5");
  assert.equal(formatHudHealth(7.234999999999), "7.23");
  assert.equal(formatHudHealth(-0.001), "0");
});

test("left and right drag painting preserve exact stack identity", () => {
  const metadata = { provenance: { maker: "Trailkeeper", batch: 4 } };
  const cursor: InventorySlot = { item: Item.Berry, count: 8, durability: 17, metadata };
  const left = distributeInventoryCursor(cursor, [null, null, null], "left");
  assert.equal(left.cursor?.count, 2);
  assert.deepEqual(left.slots.map((slot) => slot?.count), [2, 2, 2]);
  assert.deepEqual(left.slots[0]?.metadata, metadata);
  assert.notEqual(left.slots[0]?.metadata, metadata, "metadata is cloned rather than aliased");

  const right = distributeInventoryCursor({ item: Item.Berry, count: 5, metadata }, [null, null, null], "right");
  assert.equal(right.cursor?.count, 2);
  assert.deepEqual(right.slots.map((slot) => slot?.count), [1, 1, 1]);
});

test("drag painting skips incompatible and full slots then updates pack and crafting", () => {
  const pure = distributeInventoryCursor(
    { item: Item.Berry, count: 4 },
    [{ item: Item.Apple, count: 1 }, { item: Item.Berry, count: 64 }, null],
    "left",
  );
  assert.equal(pure.slots[0]?.item, Item.Apple);
  assert.equal(pure.slots[1]?.count, 64);
  assert.equal(pure.slots[2]?.count, 4);
  assert.equal(pure.cursor, null);

  const constrained = distributeInventoryCursor(
    { item: Item.Berry, count: 8 },
    [{ item: Item.Berry, count: 63 }, null, null],
    "left",
  );
  assert.deepEqual(constrained.slots.map((slot) => slot?.count), [64, 2, 2]);
  assert.equal(constrained.cursor?.count, 3, "the floor remainder and blocked quota remain carried");

  const engine = inventoryHarness();
  engine.cursor = { item: Item.Berry, count: 5 };
  assert.equal(engine.distributeCursorAcrossSlots([
    { area: "inventory", index: 0 },
    { area: "craft", index: 0 },
  ], "left"), true);
  assert.equal(engine.inventory[0]?.count, 2);
  assert.equal(engine.craftGrid[0]?.count, 2);
  assert.equal(engine.cursor?.count, 1);
});

test("trash keeps one fully recoverable stack until an intentional replacement", () => {
  const engine = inventoryHarness();
  const firstMetadata = { captureOrb: "exact-creature-record", nested: { baby: true } };
  engine.cursor = { item: Item.CaptureOrb, count: 1, durability: 31, metadata: firstMetadata };
  engine.trashClick("left");
  assert.equal(engine.cursor, null);
  assert.deepEqual(engine.trash, { item: Item.CaptureOrb, count: 1, durability: 31, metadata: firstMetadata });

  engine.trashClick("left");
  assert.deepEqual(engine.cursor, { item: Item.CaptureOrb, count: 1, durability: 31, metadata: firstMetadata });
  assert.equal(engine.trash, null);

  engine.cursor = { item: Item.Berry, count: 6, metadata: { harvest: "moonrise" } };
  engine.trashClick("right");
  assert.deepEqual(engine.trash, { item: Item.Berry, count: 1, metadata: { harvest: "moonrise" } });
  assert.equal(engine.cursor?.count, 5);
  engine.cursor = { item: Item.Apple, count: 2, metadata: { orchard: 9 } };
  engine.trashClick("left");
  assert.deepEqual(engine.trash, { item: Item.Apple, count: 2, metadata: { orchard: 9 } });
  assert.equal(engine.cursor, null, "the former Berry discard is destroyed only on replacement");
});

test("inventory markup exposes drag targets, trash guidance, and a bounded Bone Shard icon", () => {
  const ui = readFileSync(new URL("../app/game/VoxelGame.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(ui, /data-inventory-drag-target/u);
  assert.match(ui, /Recover until replaced/u);
  assert.match(ui, /Hold and drag to share a stack/u);
  assert.match(ui, /inventoryDragPreview/u);
  assert.match(css, /inventory-drag-preview-mark/u);
  assert.match(ui, /formatHudHealth\(specimen\.health\)/u);
  assert.match(ui, /formatHudHealth\(hud\.activePet\.health\)/u);
  assert.match(ui, /formatHudHealth\(creature\.health\)/u);
  assert.match(css, /\.mc-slot \.item-icon-kind-bone::before\s*\{[^}]*scale\(\.76\)/u);
});
