import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  BLOCKS,
  BLOCK_ITEM_ALIASES,
  DEEPGEAR_BRICK_TILE,
  ITEMS,
  Item,
  RIVETED_BRASS_TILE,
  ROOTWEAVE_SOIL_SIDE_TILE,
  BlockId,
} from "../app/game/data";
import { CUBIC_STORYBOOK_VISUAL_KINDS, FACETED_STORYBOOK_EXCEPTION_KINDS } from "../app/game/living-bestiary-models";
import { auditCreatureVisual, auditVisualTheme } from "../app/game/visual-theme-audit";
import {
  BLOCKWILD_VISUAL_THEME,
  BLOCK_VISUAL_FAMILIES,
  CREATURE_REFERENCE_MODELS,
  CREATURE_VISUAL_EXCEPTIONS,
  blockVisualFamily,
} from "../app/game/visual-theme";
import { PixelCanvas } from "../scripts/lib/pixel-canvas";

test("the unified visual theme is executable and stable", () => {
  assert.equal(BLOCKWILD_VISUAL_THEME.thesis, "handcrafted voxel naturalism");
  assert.equal(BLOCKWILD_VISUAL_THEME.textureTileSize, 16);
  assert.equal(BLOCKWILD_VISUAL_THEME.ordinaryEmissionCoverageMaximum, .25);
  assert.equal(BLOCK_VISUAL_FAMILIES.length, 17);
  assert.equal(new Set(BLOCK_VISUAL_FAMILIES.map((family) => family.id)).size, BLOCK_VISUAL_FAMILIES.length);
});

test("every approved faceted creature records a silhouette reason", () => {
  assert.equal(CUBIC_STORYBOOK_VISUAL_KINDS.length, 33);
  assert.equal(FACETED_STORYBOOK_EXCEPTION_KINDS.length, 4);
  const cubicKinds = new Set(CUBIC_STORYBOOK_VISUAL_KINDS);
  assert.ok(FACETED_STORYBOOK_EXCEPTION_KINDS.every((kind) => !cubicKinds.has(kind)));
  for (const kind of FACETED_STORYBOOK_EXCEPTION_KINDS) {
    const reason = CREATURE_VISUAL_EXCEPTIONS[kind];
    assert.ok(reason && reason.length >= 40, `${kind} needs a specific exception reason`);
  }
});

test("reference models link to canonical portraits", () => {
  assert.equal(CREATURE_REFERENCE_MODELS.length, 7);
  for (const reference of CREATURE_REFERENCE_MODELS) {
    assert.ok(reference.role.length >= 20);
    assert.ok(existsSync(path.join(process.cwd(), "public", reference.portrait.slice(1))), `missing ${reference.portrait}`);
  }
});

test("all production creatures and blocks pass the release contract", () => {
  const audit = auditVisualTheme({ generatedAt: "2026-07-18T00:00:00.000Z" });
  assert.equal(audit.totals.creatures, 215);
  assert.equal(audit.totals.blocks, 294);
  assert.equal(audit.totals.blockFamilies, 17);
  assert.equal(audit.totals.creatureViolations, 0);
  assert.equal(audit.totals.blockViolations, 0);
});

test("grounded golems and Glowmoth satisfy anatomy and movement checks", () => {
  for (const kind of ["copper-scout-golem", "stone-bulwark-golem", "aetherforged-sentinel"] as const) {
    const row = auditCreatureVisual(kind);
    assert.ok(row.meshes >= 30, `${kind} should retain layered authored detail`);
    assert.ok(row.faceParts >= 4, `${kind} should retain a readable constructed face`);
    assert.ok(row.terrainDelta !== null && Math.abs(row.terrainDelta) <= 1e-7);
  }
  const glowmoth = auditCreatureVisual("glowmoth");
  assert.equal(glowmoth.bodyPlan, "flying");
  assert.equal(glowmoth.terrainDelta, null);
});

test("new directional and Deepgear materials use dedicated atlas cells", () => {
  assert.equal(BLOCKS[BlockId.DeepgearBrick].side, DEEPGEAR_BRICK_TILE);
  assert.equal(BLOCKS[BlockId.RivetedBrass].side, RIVETED_BRASS_TILE);
  assert.equal(BLOCKS[BlockId.RootweaveSoil].side, ROOTWEAVE_SOIL_SIDE_TILE);
  assert.notEqual(BLOCKS[BlockId.SugarSoil].top, BLOCKS[BlockId.SugarSoil].side);
  assert.equal(BLOCK_ITEM_ALIASES[BlockId.DwarfStool], Item.DeepgearStoolItem);
  assert.equal(ITEMS[Item.DeepgearStoolItem].placeBlock, BlockId.DwarfStool);
  for (const [id, definition] of Object.entries(BLOCKS)) {
    const family = blockVisualFamily(Number(id) as BlockId, definition);
    assert.ok(family.id);
    for (const tile of [definition.top, definition.side, definition.bottom]) assert.ok(Number.isInteger(tile) && tile >= 0 && tile < 256);
  }
});

test("pixel canvas preserves opaque, alpha, clear, and stroke operations", () => {
  const canvas = new PixelCanvas();
  canvas.width = 4;
  canvas.height = 4;
  canvas.context.fillStyle = "#204060";
  canvas.context.fillRect(0, 0, 4, 4);
  canvas.context.fillStyle = "rgba(255, 255, 255, 0.5)";
  canvas.context.fillRect(1, 1, 1, 1);
  assert.deepEqual(Array.from(canvas.pixels.slice(20, 24)), [144, 160, 176, 255]);
  canvas.context.strokeStyle = "#ff0000";
  canvas.context.strokeRect(.5, .5, 2, 2);
  assert.deepEqual(Array.from(canvas.pixels.slice(0, 4)), [255, 0, 0, 255]);
  canvas.context.clearRect(3, 3, 1, 1);
  assert.deepEqual(Array.from(canvas.pixels.slice(60, 64)), [0, 0, 0, 0]);
});
