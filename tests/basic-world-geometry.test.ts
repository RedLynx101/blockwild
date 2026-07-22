import assert from "node:assert/strict";
import test from "node:test";
import { buildBasicWorldGeometry } from "../app/game/basic-world-geometry.ts";
import { BiomeId, CHUNK_SIZE, type ColumnSample } from "../app/game/world.ts";

const flatColumn = (biome: BiomeId, height: number, waterline = 32): ColumnSample => ({
  height,
  waterline,
  biome,
  temperature: 0.5,
  moisture: 0.5,
  continental: 0.5,
  river: 0,
  mountain: 0,
});

test("basic world geometry is empty when the outer tier equals full detail", () => {
  const geometry = buildBasicWorldGeometry({ seed: 3, centerChunkX: 0, centerChunkZ: 0, fullDistance: 10, basicDistance: 10, cameraY: 48 }, () => flatColumn(BiomeId.Meadow, 44));
  assert.equal(geometry.surfaceIndices.length, 0);
  assert.equal(geometry.caveIndices.length, 0);
});

test("basic surface proxy stays coarse, bounded, and renders water at its surface", () => {
  const fullDistance = 8;
  const geometry = buildBasicWorldGeometry({ seed: 7, centerChunkX: 0, centerChunkZ: 0, fullDistance, basicDistance: 20, cameraY: 48 }, () => flatColumn(BiomeId.Ocean, 18, 32));
  assert.ok(geometry.surfaceIndices.length > 0);
  assert.ok((geometry.surfaceIndices.length + geometry.caveIndices.length) / 3 < 180_000);
  assert.ok(geometry.surfacePositions.byteLength + geometry.surfaceColors.byteLength + geometry.surfaceIndices.byteLength < 8 * 1024 * 1024);
  for (let index = 1; index < geometry.surfacePositions.length; index += 3) assert.ok(geometry.surfacePositions[index] <= 32.34 + 0.001 && geometry.surfacePositions[index] >= 26.34 - 0.001);
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < geometry.surfacePositions.length; index += 3) {
    nearest = Math.min(nearest, Math.max(Math.abs(geometry.surfacePositions[index] - CHUNK_SIZE * 0.5), Math.abs(geometry.surfacePositions[index + 2] - CHUNK_SIZE * 0.5)));
  }
  assert.ok(nearest >= fullDistance * CHUNK_SIZE - 16, `nearest proxy vertex ${nearest} entered the detailed ring`);
});
