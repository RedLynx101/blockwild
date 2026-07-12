import assert from "node:assert/strict";
import test from "node:test";
import {
  BIOME_SURFACE_TEXTURES,
  biomeSurfaceRecipeForTile,
  biomeSurfaceTexel,
  paintBiomeSurfaceAtlasTile,
} from "../app/game/biome-atmosphere.ts";
import { BLOCKS, BlockId } from "../app/game/data.ts";

test("v1.3 main-biome surface recipes own unique top and side atlas tiles", () => {
  assert.equal(BIOME_SURFACE_TEXTURES.length, 9);
  const tiles = BIOME_SURFACE_TEXTURES.flatMap((recipe) => [recipe.topTile, recipe.sideTile]);
  assert.equal(new Set(tiles).size, 18);
  for (const recipe of BIOME_SURFACE_TEXTURES) {
    assert.equal(biomeSurfaceRecipeForTile(recipe.topTile)?.recipe.id, recipe.id);
    assert.equal(biomeSurfaceRecipeForTile(recipe.topTile)?.side, false);
    assert.equal(biomeSurfaceRecipeForTile(recipe.sideTile)?.side, true);
  }
  const glimmer = BIOME_SURFACE_TEXTURES.find((recipe) => recipe.id === "glimmerwood");
  assert.ok(glimmer);
  assert.equal(BLOCKS[BlockId.GlimmerGrass].top, glimmer.topTile);
  assert.equal(BLOCKS[BlockId.GlimmerGrass].side, glimmer.sideTile);
  assert.notEqual(glimmer.topTile, 107, "Sakurabloom must not repaint Glimmerwood's top tile");
  assert.notEqual(glimmer.sideTile, 103, "Rainveil must not repaint Glimmerwood's side tile");
  const glimmerTileOwners = Object.values(BLOCKS)
    .filter((block) => [block.top, block.side, block.bottom].some((tile) => tile === glimmer.topTile || tile === glimmer.sideTile))
    .map((block) => block.id);
  assert.deepEqual([...new Set(glimmerTileOwners)], [BlockId.GlimmerGrass], "Glimmerwood's new atlas tiles must stay exclusive");
});

test("production surfaces are richer and visibly different from their legacy tiles", () => {
  for (const recipe of BIOME_SURFACE_TEXTURES) {
    const current = new Set<string>();
    const legacy = new Set<string>();
    let changed = 0;
    for (const tile of [recipe.topTile, recipe.sideTile]) for (let y = 0; y < 16; y += 1) for (let x = 0; x < 16; x += 1) {
      const next = biomeSurfaceTexel(tile, x, y);
      const before = biomeSurfaceTexel(tile, x, y, true);
      assert.ok(next);
      assert.ok(before);
      current.add(next!);
      legacy.add(before!);
      if (next !== before) changed += 1;
    }
    assert.ok(current.size >= 7, `${recipe.label} should use at least seven authored colors`);
    assert.ok(changed >= 320, `${recipe.label} should materially change most displayed texels`);
  }
});

test("atlas painter is bounded to registered surface tiles", () => {
  const pixels = new Map<string, string>();
  const context = {
    fillStyle: "#000000",
    fillRect(x: number, y: number, width: number, height: number) {
      assert.equal(width, 1);
      assert.equal(height, 1);
      pixels.set(`${x},${y}`, this.fillStyle);
    },
  };
  assert.equal(paintBiomeSurfaceAtlasTile(context, 0, 32, 48), true);
  assert.equal(pixels.size, 256);
  assert.ok(pixels.has("32,48"));
  assert.ok(pixels.has("47,63"));
  pixels.clear();
  assert.equal(paintBiomeSurfaceAtlasTile(context, 200, 0, 0), false);
  assert.equal(pixels.size, 0);
});
