import assert from "node:assert/strict";
import test from "node:test";
import { BlockId } from "../app/game/data.ts";
import {
  DEFAULT_WORLD_GENERATION_OPTIONS,
  MIN_Y,
  ChunkWorld,
  blockIndex,
  normalizeWorldGenerationOptions,
} from "../app/game/world.ts";

test("generation options clamp safely and an omitted options object restores exact defaults", () => {
  assert.deepEqual(normalizeWorldGenerationOptions(), DEFAULT_WORLD_GENERATION_OPTIONS);
  assert.deepEqual(normalizeWorldGenerationOptions({
    caveFrequency: -4,
    biomeScale: 99,
    resourceAbundance: Number.NaN,
    structures: false,
  }), {
    caveFrequency: 0,
    biomeScale: 4,
    resourceAbundance: 1,
    structures: false,
  });

  const implicit = new ChunkWorld();
  const explicit = new ChunkWorld();
  implicit.reset("DEFAULT-GENERATION");
  explicit.reset("DEFAULT-GENERATION", undefined, { ...DEFAULT_WORLD_GENERATION_OPTIONS });
  assert.deepEqual(implicit.generateChunk(-2, 3).blocks, explicit.generateChunk(-2, 3).blocks);

  implicit.reset("CUSTOM", undefined, { caveFrequency: 0, structures: false });
  implicit.reset("DEFAULT-AGAIN");
  assert.deepEqual(implicit.generationOptions, DEFAULT_WORLD_GENERATION_OPTIONS, "custom settings must not leak into the next local world");
  implicit.dispose();
  explicit.dispose();
});

test("cave frequency changes underground carving while zero produces solid underground terrain", () => {
  const caveAir = (frequency: number) => {
    const world = new ChunkWorld();
    world.reset("CAVE-OPTIONS", undefined, { caveFrequency: frequency });
    const chunk = world.generateChunk(0, 0);
    let air = 0;
    for (let x = 0; x < 16; x += 1) for (let z = 0; z < 16; z += 1) {
      for (let y = MIN_Y + 5; y < chunk.heightmap[x + z * 16] - 4; y += 1) {
        if (chunk.blocks[blockIndex(x, y, z)] === BlockId.Air) air += 1;
      }
    }
    world.dispose();
    return air;
  };

  assert.equal(caveAir(0), 0);
  assert.ok(caveAir(3) > caveAir(1));
});

test("biome scale, resource abundance, and structure generation affect only their intended deterministic inputs", () => {
  const compactBiomes = new ChunkWorld();
  const broadBiomes = new ChunkWorld();
  compactBiomes.reset("BIOME-OPTIONS", undefined, { biomeScale: 0.5 });
  broadBiomes.reset("BIOME-OPTIONS", undefined, { biomeScale: 3 });
  assert.notDeepEqual(compactBiomes.generateChunk(7, -9).biomes, broadBiomes.generateChunk(7, -9).biomes);
  compactBiomes.dispose();
  broadBiomes.dispose();

  const oreCount = (abundance: number) => {
    const world = new ChunkWorld();
    world.reset("RESOURCE-OPTIONS", undefined, { resourceAbundance: abundance });
    const ores = new Set<BlockId>([BlockId.CoalOre, BlockId.IronOre, BlockId.CopperOre, BlockId.GoldOre, BlockId.CrystalOre]);
    let count = 0;
    for (let cx = -1; cx <= 1; cx += 1) for (let cz = -1; cz <= 1; cz += 1) {
      for (const block of world.generateChunk(cx, cz).blocks) if (ores.has(block as BlockId)) count += 1;
    }
    world.dispose();
    return count;
  };
  assert.ok(oreCount(4) > oreCount(0.25));

  const structures = new ChunkWorld();
  const untouched = new ChunkWorld();
  structures.reset("WILDERNESS", undefined, { structures: true });
  untouched.reset("WILDERNESS", undefined, { structures: false });
  assert.notDeepEqual(structures.generateChunk(-2, -3).blocks, untouched.generateChunk(-2, -3).blocks, "disabling structures should omit the deterministic ruin in this fixture chunk");
  structures.dispose();
  untouched.dispose();
});
