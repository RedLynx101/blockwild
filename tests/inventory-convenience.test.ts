import assert from "node:assert/strict";
import test from "node:test";
import { Item, type InventorySlot } from "../app/game/data.ts";
import { GOLD_PER_INGOT, goldForIngots, ingotsAvailableFromWallet, inventoryStackSignature, sortInventoryRegion, transferInventoryStacks } from "../app/game/inventory-convenience.ts";

test("sorting compacts stackable items without disturbing the hotbar or merging exact-metadata orbs", () => {
  const filledA: InventorySlot = { item: Item.CaptureOrb, count: 1, metadata: { creature: "A" } };
  const filledB: InventorySlot = { item: Item.CaptureOrb, count: 1, metadata: { creature: "B" } };
  assert.notEqual(inventoryStackSignature(filledA), inventoryStackSignature(filledB));
  const slots = [
    { item: Item.WoodSword, count: 1 }, null, null, null, null, null, null, null, null,
    { item: Item.Stick, count: 40 }, filledB, { item: Item.Stick, count: 30 }, filledA,
  ];
  const sorted = sortInventoryRegion(slots, 9);
  assert.deepEqual(sorted[0], slots[0]);
  assert.equal(sorted.filter((slot) => slot?.item === Item.Stick).reduce((sum, slot) => sum + (slot?.count ?? 0), 0), 70);
  assert.equal(sorted.filter((slot) => slot?.item === Item.CaptureOrb).length, 2);
});

test("stack-to-container moves only matching items while push-all respects source ranges", () => {
  const source = [{ item: Item.Stick, count: 20 }, { item: Item.Apple, count: 5 }, { item: Item.Coal, count: 8 }];
  const chest = [{ item: Item.Stick, count: 60 }, null, null];
  const stacked = transferInventoryStacks(source, chest, { onlyAlreadyPresent: true });
  assert.equal(stacked.moved, 20);
  assert.equal(stacked.source[1]?.count, 5);
  assert.equal(stacked.target.filter((slot) => slot?.item === Item.Stick).reduce((sum, slot) => sum + (slot?.count ?? 0), 0), 80);

  const inventory = [{ item: Item.WoodSword, count: 1 }, { item: Item.Apple, count: 5 }, { item: Item.Coal, count: 8 }];
  const pushed = transferInventoryStacks(inventory, [null, null], { sourceStart: 1 });
  assert.deepEqual(pushed.source[0], inventory[0]);
  assert.equal(pushed.moved, 13);
});

test("stack-to-container never sweeps a different metadata specimen into an empty slot", () => {
  const source = [{ item: Item.CaptureOrb, count: 1, metadata: { creature: "B" } }];
  const target = [{ item: Item.CaptureOrb, count: 1, metadata: { creature: "A" } }, null];
  const stacked = transferInventoryStacks(source, target, { onlyAlreadyPresent: true });
  assert.equal(stacked.moved, 0);
  assert.deepEqual(stacked.source, source);
});

test("wallet and gold-ingot conversion is exact at ten gold per ingot", () => {
  assert.equal(GOLD_PER_INGOT, 10);
  assert.equal(goldForIngots(7), 70);
  assert.equal(ingotsAvailableFromWallet("79"), 7);
  assert.equal(ingotsAvailableFromWallet("100000000000000000000", 3), 3);
  assert.equal(ingotsAvailableFromWallet("not-gold"), 0);
});
