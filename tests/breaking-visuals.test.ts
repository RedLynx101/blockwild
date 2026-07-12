import assert from "node:assert/strict";
import test from "node:test";
import { BlockId, Item } from "../app/game/data.ts";
import { BREAK_CRACK_STAGES, breakCrackStage, toolEffectivenessForIds } from "../app/game/breaking-visuals.ts";

test("break crack stages advance monotonically and replace the default progress meter", () => {
  assert.equal(breakCrackStage(0), -1);
  assert.equal(breakCrackStage(0.01), 0);
  assert.equal(breakCrackStage(1), BREAK_CRACK_STAGES - 1);
  assert.ok(breakCrackStage(0.75) > breakCrackStage(0.25));
});

test("subtle outline hints distinguish good, poor, and under-tier tools", () => {
  assert.equal(toolEffectivenessForIds(BlockId.WildwoodLog, Item.WoodAxe), "preferred");
  assert.equal(toolEffectivenessForIds(BlockId.Stone, Item.WoodAxe), "poor");
  assert.equal(toolEffectivenessForIds(BlockId.Obsidian, Item.WoodPickaxe), "blocked");
});
