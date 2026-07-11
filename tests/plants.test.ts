import assert from "node:assert/strict";
import test from "node:test";
import { BlockId } from "../app/game/data";
import { PLANTS, createPlantBestiaryState, discoverPlantBlock, normalizePlantBestiaryState, plantForBlock } from "../app/game/plants";

test("plant field guide is separate, categorized, and block-addressable", () => {
  assert.ok(PLANTS.length >= 15);
  assert.equal(plantForBlock(BlockId.AppleFruit)?.id, "wild-apple");
  assert.equal(plantForBlock(BlockId.GlowKelp)?.category, "aquatic");
});

test("plant discoveries normalize and deduplicate safely", () => {
  const first = discoverPlantBlock(createPlantBestiaryState(), BlockId.MoonberryBushRipe);
  assert.deepEqual(first.discovered, ["moonberry"]);
  assert.equal(discoverPlantBlock(first, BlockId.MoonberryShoot), first);
  assert.deepEqual(normalizePlantBestiaryState({ discovered: ["moonberry", "bogus", "moonberry"] }).discovered, ["moonberry"]);
});
