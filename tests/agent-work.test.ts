import assert from "node:assert/strict";
import { test } from "node:test";
import { BlockId, Item } from "../app/game/data";
import { buildMaterialRequirements, reserveBuildMaterials, transferAgentStacksExact } from "../app/game/agent-work";

test("build material accounting reports exact shortages before mutation", () => {
  const placements = [
    { x: 0, y: 1, z: 0, block: BlockId.Planks },
    { x: 1, y: 1, z: 0, block: BlockId.Planks },
    { x: 2, y: 1, z: 0, block: BlockId.Stone },
  ];
  const requirements = buildMaterialRequirements(placements, [{ item: BlockId.Planks, count: 1 }, null]);
  const planks = requirements.find((entry) => entry.block === BlockId.Planks);
  assert.deepEqual(planks, { block: BlockId.Planks, name: "Wildwood Planks", have: 1, need: 2, missing: 1 });
  const before = [{ item: BlockId.Planks, count: 1 }, null] as const;
  const reservation = reserveBuildMaterials(before, requirements);
  assert.equal(reservation.ok, false);
  assert.deepEqual(reservation.inventory, before, "failed reservation is fully atomic");
});

test("successful material reservation conserves exact stacks across split slots", () => {
  const requirements = buildMaterialRequirements([
    { x: 0, y: 1, z: 0, block: BlockId.Planks },
    { x: 1, y: 1, z: 0, block: BlockId.Planks },
  ], [{ item: BlockId.Planks, count: 1 }, { item: BlockId.Planks, count: 3 }, { item: Item.Berry, count: 2 }]);
  const reservation = reserveBuildMaterials([{ item: BlockId.Planks, count: 1 }, { item: BlockId.Planks, count: 3 }, { item: Item.Berry, count: 2 }], requirements);
  assert.equal(reservation.ok, true);
  assert.equal(reservation.inventory.reduce((sum, slot) => sum + (slot?.item === BlockId.Planks ? slot.count : 0), 0), 2);
  assert.equal(reservation.inventory[2]?.item, Item.Berry);
});

test("exact agent transfers honor source, count, destination compatibility, and atomic failure", () => {
  const source = [{ item: Item.Berry, count: 7 }, { item: Item.Stick, count: 2 }, null];
  const destination = [{ item: Item.Berry, count: 62 }, null, { item: Item.Apple, count: 3 }];
  const moved = transferAgentStacksExact(source, destination, { sourceSlot: 0, count: 5 });
  assert.equal(moved.ok, true);
  assert.equal(moved.moved, 5);
  assert.equal(moved.source[0]?.count, 2);
  assert.equal(moved.destination[0]?.count, 64);
  assert.equal(moved.destination[1]?.count, 3);
  assert.deepEqual(source, [{ item: Item.Berry, count: 7 }, { item: Item.Stick, count: 2 }, null], "inputs remain immutable");

  const blocked = transferAgentStacksExact(source, destination, { sourceSlot: 1, destinationSlot: 2, count: 1 });
  assert.deepEqual({ ok: blocked.ok, reason: blocked.reason, moved: blocked.moved }, { ok: false, reason: "destination_full", moved: 0 });
  assert.deepEqual(blocked.source, source);
  assert.deepEqual(blocked.destination, destination);
});
