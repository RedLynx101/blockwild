import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  BLOCKS,
  BLOCK_ITEM_ALIASES,
  BRINEGRASS_TILE,
  CACTUS_TOP_TILE,
  DEEPGEAR_BRICK_TILE,
  DREAMCAP_TILE,
  FEATHERWRACK_TILE,
  ITEMS,
  Item,
  MOONBERRY_COOKIE_CRATE_SIDE_TILE,
  MOONBERRY_COOKIE_CRATE_TOP_TILE,
  MOONBOUGH_LEAVES_TILE,
  MOONFELT_MYCELIUM_TILE,
  PEARLFAN_TILE,
  REED_BLOOM_CROWN_TILE,
  REED_BLOOM_STEM_TILE,
  RIVER_RIBBON_TILE,
  RIVETED_BRASS_TILE,
  ROOTWEAVE_SOIL_SIDE_TILE,
  SAILKELP_TILE,
  STARFERN_TILE,
  STAR_CRYSTAL_BLOCK_BOTTOM_TILE,
  STAR_CRYSTAL_BLOCK_SIDE_TILE,
  STAR_CRYSTAL_BLOCK_TOP_TILE,
  BlockId,
  itemForBlock,
} from "../app/game/data";
import { CUBIC_STORYBOOK_VISUAL_KINDS, FACETED_STORYBOOK_EXCEPTION_KINDS } from "../app/game/living-bestiary-models";
import { auditCreatureVisual, auditVisualTheme } from "../app/three-compat/visual-theme-audit";
import {
  BLOCKWILD_VISUAL_THEME,
  BLOCK_VISUAL_FAMILIES,
  CREATURE_REFERENCE_MODELS,
  CREATURE_VISUAL_EXCEPTIONS,
  blockVisualFamily,
} from "../app/game/visual-theme";
import { PixelCanvas, installPixelCanvasDocument } from "../scripts/lib/pixel-canvas";

test("the unified visual theme is executable and stable", () => {
  assert.equal(BLOCKWILD_VISUAL_THEME.thesis, "handcrafted voxel naturalism");
  assert.equal(BLOCKWILD_VISUAL_THEME.textureTileSize, 16);
  assert.equal(BLOCKWILD_VISUAL_THEME.ordinaryEmissionCoverageMaximum, .25);
  assert.equal(BLOCK_VISUAL_FAMILIES.length, 17);
  assert.equal(new Set(BLOCK_VISUAL_FAMILIES.map((family) => family.id)).size, BLOCK_VISUAL_FAMILIES.length);
});

test("every approved faceted creature records a silhouette reason", () => {
  assert.equal(CUBIC_STORYBOOK_VISUAL_KINDS.length, 48);
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
  assert.equal(audit.totals.creatures, 232);
  assert.equal(audit.totals.blocks, 313);
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

test("Glimmerwood flora and cactus faces no longer borrow generic atlas art", () => {
  assert.equal(BLOCKS[BlockId.Cactus].top, CACTUS_TOP_TILE);
  assert.notEqual(BLOCKS[BlockId.Cactus].top, BLOCKS[BlockId.Cactus].side);
  assert.deepEqual(
    [BLOCKS[BlockId.MoonboughLeaves].top, BLOCKS[BlockId.MoonboughLeaves].side, BLOCKS[BlockId.MoonboughLeaves].bottom],
    [MOONBOUGH_LEAVES_TILE, MOONBOUGH_LEAVES_TILE, MOONBOUGH_LEAVES_TILE],
  );
  assert.equal(BLOCKS[BlockId.Starfern].side, STARFERN_TILE);
  assert.equal(BLOCKS[BlockId.Dreamcap].side, DREAMCAP_TILE);
  assert.equal(new Set([MOONBOUGH_LEAVES_TILE, STARFERN_TILE, DREAMCAP_TILE, CACTUS_TOP_TILE]).size, 4);
  assert.equal(ITEMS[Item.StarfernFrond].heldModel, "world-texture");
  assert.equal(ITEMS[Item.Dreamcap].dropModel, "world-texture");
});

test("Moonbough leaves preserve neighboring faces and chairs keep their own item identity", () => {
  const leaves = BLOCKS[BlockId.MoonboughLeaves];
  assert.equal(leaves.layer, "cutout", "transparent foliage must not occlude an adjacent full cube");
  assert.ok((leaves.emissiveStrength ?? 0) > 0, "Moonbough foliage keeps its moonlit accent");
  assert.equal(BLOCKS[BlockId.Moonwell].layer, "cutout", "transparent Moonwells must preserve their neighboring faces");
  assert.ok((BLOCKS[BlockId.Moonwell].emissiveStrength ?? 0) > 0, "Moonwells keep their authored glow");
  assert.equal(itemForBlock(BlockId.MoonboughChair), Item.MoonboughChairItem);
  assert.notEqual(itemForBlock(BlockId.MoonboughChair), Item.LavaBucket);
  assert.equal(ITEMS[Item.MoonboughChairItem].placeBlock, BlockId.MoonboughChair);
});

test("Moonfelt Mycelium is an opaque seamless building texture, not grass", async () => {
  const definition = BLOCKS[BlockId.MoonfeltMycelium];
  assert.deepEqual(
    [definition.top, definition.side, definition.bottom],
    [MOONFELT_MYCELIUM_TILE, MOONFELT_MYCELIUM_TILE, MOONFELT_MYCELIUM_TILE],
  );
  assert.notEqual(MOONFELT_MYCELIUM_TILE, BLOCKS[BlockId.GlowmossCarpet].side);
  assert.equal(definition.layer, "opaque");
  assert.equal(definition.solid, true);

  const shim = installPixelCanvasDocument();
  try {
    const { createBlockAtlas } = await import("../app/game/world");
    const texture = createBlockAtlas();
    const canvas = texture.image as unknown as PixelCanvas;
    const originX = (MOONFELT_MYCELIUM_TILE % 16) * 16;
    const originY = Math.floor(MOONFELT_MYCELIUM_TILE / 16) * 16;
    const colors = new Set<string>();
    let red = 0;
    let green = 0;
    let blue = 0;
    for (let y = 0; y < 16; y += 1) for (let x = 0; x < 16; x += 1) {
      const offset = ((originY + y) * canvas.width + originX + x) * 4;
      const [r, g, b, alpha] = canvas.pixels.slice(offset, offset + 4);
      assert.equal(alpha, 255, `Moonfelt pixel ${x},${y} must remain opaque`);
      colors.add(`${r},${g},${b}`);
      red += r; green += g; blue += b;
    }
    assert.ok(colors.size >= 7, "Moonfelt should retain readable fungal grain");
    assert.ok(blue > green && red > green, "Moonfelt should read as muted fungal violet rather than green grass");
    texture.dispose();
  } finally {
    shim.restore();
  }
});

test("Moonberry Cookie storage has dedicated readable Moonbough crate faces", async () => {
  const definition = BLOCKS[BlockId.MoonberryCookieCrate];
  assert.deepEqual([definition.top, definition.side], [MOONBERRY_COOKIE_CRATE_TOP_TILE, MOONBERRY_COOKIE_CRATE_SIDE_TILE]);
  assert.equal(ITEMS[BlockId.MoonberryCookieCrate].iconKind, "produce-crate");

  const shim = installPixelCanvasDocument();
  try {
    const { createBlockAtlas } = await import("../app/game/world");
    const texture = createBlockAtlas();
    const canvas = texture.image as unknown as PixelCanvas;
    const tileColors = (tile: number) => {
      const left = (tile % 16) * 16;
      const top = Math.floor(tile / 16) * 16;
      const colors = new Set<string>();
      for (let y = 0; y < 16; y += 1) for (let x = 0; x < 16; x += 1) {
        const offset = ((top + y) * canvas.width + left + x) * 4;
        colors.add(Array.from(canvas.pixels.slice(offset, offset + 4)).join(","));
      }
      return colors;
    };
    const topColors = tileColors(MOONBERRY_COOKIE_CRATE_TOP_TILE);
    const sideColors = tileColors(MOONBERRY_COOKIE_CRATE_SIDE_TILE);
    assert.ok(topColors.size >= 7, "top face should show timber, bakes, berry pockets, and moon presses");
    assert.ok(sideColors.size >= 9, "side face should carry a legible cookie crate mark");
    assert.notDeepEqual(topColors, sideColors);
    texture.dispose();
  } finally {
    shim.restore();
  }
});

test("ordinary ocean flora uses dedicated connected matte art", async () => {
  const species = [
    [BlockId.Brinegrass, BRINEGRASS_TILE, "brinegrass", "grass"],
    [BlockId.Sailkelp, SAILKELP_TILE, "sailkelp", "sail"],
    [BlockId.Featherwrack, FEATHERWRACK_TILE, "featherwrack", "wrack"],
    [BlockId.Pearlfan, PEARLFAN_TILE, "pearlfan", "fan"],
  ] as const;
  assert.equal(new Set(species.map((entry) => entry[1])).size, species.length);
  for (const [block, tile, connection, profile] of species) {
    const definition = BLOCKS[block];
    assert.deepEqual([definition.top, definition.side, definition.bottom], [tile, tile, tile]);
    assert.equal(definition.layer, "cutout");
    assert.equal(definition.waterlogged, true);
    assert.equal(definition.verticalConnectGroup, connection);
    assert.equal(definition.aquaticProfile, profile);
    assert.equal(blockVisualFamily(block, definition).id, "flora-and-farming");
  }

  const shim = installPixelCanvasDocument();
  try {
    const { createBlockAtlas } = await import("../app/game/world");
    const texture = createBlockAtlas();
    const canvas = texture.image as unknown as PixelCanvas;
    const edgeAlpha = (tile: number, row: 0 | 15) => {
      const left = (tile % 16) * 16;
      const top = Math.floor(tile / 16) * 16 + row;
      let occupied = 0;
      for (let x = 0; x < 16; x += 1) if (canvas.pixels[(top * canvas.width + left + x) * 4 + 3] > 0) occupied += 1;
      return occupied;
    };
    for (const [, tile] of species) {
      assert.ok(edgeAlpha(tile, 0) > 0, `tile ${tile} must reach the next segment above`);
      assert.ok(edgeAlpha(tile, 15) > 0, `tile ${tile} must remain rooted into the segment below`);
    }
    texture.dispose();
  } finally {
    shim.restore();
  }
});

test("Star Crystal tiles mirror cleanly and stacked river flora shares exact texture edges", async () => {
  assert.equal(BLOCKS[BlockId.RiverRibbon].side, RIVER_RIBBON_TILE);
  assert.deepEqual(
    [BLOCKS[BlockId.ReedBloom].top, BLOCKS[BlockId.ReedBloom].side, BLOCKS[BlockId.ReedBloom].bottom],
    [REED_BLOOM_CROWN_TILE, REED_BLOOM_STEM_TILE, REED_BLOOM_STEM_TILE],
  );
  assert.equal(BLOCKS[BlockId.ReedBloom].aquaticProfile, "reed-bloom");
  const shim = installPixelCanvasDocument();
  try {
    const { createBlockAtlas } = await import("../app/game/world");
    const texture = createBlockAtlas();
    const canvas = texture.image as unknown as PixelCanvas;
    const rgba = (atlasTile: number, x: number, y: number) => {
      const left = (atlasTile % 16) * 16;
      const top = Math.floor(atlasTile / 16) * 16;
      const offset = ((top + y) * canvas.width + left + x) * 4;
      return Array.from(canvas.pixels.slice(offset, offset + 4));
    };
    for (const atlasTile of [STAR_CRYSTAL_BLOCK_TOP_TILE, STAR_CRYSTAL_BLOCK_SIDE_TILE, STAR_CRYSTAL_BLOCK_BOTTOM_TILE]) {
      const colors = new Set<string>();
      for (let y = 0; y < 16; y += 1) for (let x = 0; x < 16; x += 1) {
        const sample = rgba(atlasTile, x, y);
        colors.add(sample.join(","));
        assert.deepEqual(sample, rgba(atlasTile, 15 - x, y), `tile ${atlasTile} must mirror horizontally`);
        assert.deepEqual(sample, rgba(atlasTile, x, 15 - y), `tile ${atlasTile} must mirror vertically`);
      }
      assert.ok(colors.size >= 5, `tile ${atlasTile} needs a readable crystalline value range`);
    }
    for (const atlasTile of [RIVER_RIBBON_TILE, REED_BLOOM_STEM_TILE]) {
      for (let x = 0; x < 16; x += 1) assert.deepEqual(rgba(atlasTile, x, 0), rgba(atlasTile, x, 15), `tile ${atlasTile} must join vertically`);
      assert.ok(Array.from({ length: 16 }, (_, x) => rgba(atlasTile, x, 0)[3]).some((alpha) => alpha > 0));
    }
    texture.dispose();
  } finally {
    shim.restore();
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
