import assert from "node:assert/strict";
import test from "node:test";
import { Item } from "../app/game/data";
import { consumedResourceDelta, inventoryResourceCounts, resourceIdForItem, resourceItemCode } from "../app/game/hearthroads-adapter";

test("Hearthroads resource ids round-trip stable item codes", () => {
  assert.equal(resourceItemCode("apple"), Item.Apple);
  assert.equal(resourceIdForItem(Item.HealthPotion), "appleheart-potion");
  assert.equal(resourceItemCode("lumen-kelp-frond"), Item.LumenKelpFrond);
  assert.equal(resourceIdForItem(Item.WaterBreathingPotion), "tidebreath-philter");
  assert.equal(resourceItemCode("unknown"), null);
});

test("station resource adapter counts inventory and isolates consumption", () => {
  const before = inventoryResourceCounts([{ item: Item.Apple, count: 3 }, { item: Item.Berry, count: 2 }], { "water-source": 1 });
  const consumed = consumedResourceDelta(before, { apple: 1, moonberry: 1, "water-source": 1 });
  assert.deepEqual(consumed, { apple: 2, moonberry: 1 });
});
