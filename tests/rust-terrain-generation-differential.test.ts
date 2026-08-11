import assert from "node:assert/strict";
import test from "node:test";
import {
  LEGACY_TERRAIN_CONTENT_HASH_V2,
  createGenerateChunkRequestV2,
  createGeneratedChunkV2,
  decodeTerrainGenerationMarkerTableV2,
  legacyTerrainGeneratorHashV2,
} from "../app/game/terrain-generation-contract.ts";
import { generateChunkWithLegacyOracleV2 } from "../app/game/rust-terrain-generation-legacy-oracle.ts";
import { ChunkWorld, GENERATOR_VERSION } from "../app/game/world.ts";

test("the isolated compatibility oracle is byte-exact for a negative POI chunk and marker table", () => {
  const cx = -8;
  const cz = -1;
  const namespace = `terrain-v5|g${GENERATOR_VERSION}|WILDERNESS|structures|${cx},${cz}|0`;
  const request = createGenerateChunkRequestV2({
    epoch: 1,
    taskId: 1,
    revision: 1,
    namespace,
    contentHash: LEGACY_TERRAIN_CONTENT_HASH_V2,
    generatorHash: legacyTerrainGeneratorHashV2(namespace),
    seedText: "WILDERNESS",
    generationOptions: { structures: true },
    key: `${cx},${cz}`,
    cx,
    cz,
    edits: [[0, 7], [49151, 3]],
  });
  const payload = generateChunkWithLegacyOracleV2(request);
  const actual = createGeneratedChunkV2(request, payload);

  const reference = new ChunkWorld();
  reference.reset("WILDERNESS", { [request.key]: [[0, 7], [49151, 3]] }, { structures: true });
  const expected = reference.generateChunk(cx, cz);
  const expectedMarkers = [...reference.structureMarkers.entries()]
    .filter(([, marker]) => Math.floor(marker.position.x / 16) === cx && Math.floor(marker.position.z / 16) === cz)
    .sort(([left], [right]) => left.localeCompare(right));

  assert.deepEqual(actual.blocks, expected.blocks);
  assert.deepEqual(actual.heightmap, expected.heightmap);
  assert.deepEqual(actual.biomes, expected.biomes);
  assert.deepEqual(actual.sectionBlockCounts, expected.sectionBlockCounts);
  assert.deepEqual(actual.skyTops, expected.skyTops);
  assert.deepEqual(actual.light, expected.light);
  assert.deepEqual([...actual.lightIndices], [...expected.lightIndices].sort((left, right) => left - right));
  assert.deepEqual([...actual.leafIndices], [...expected.leafIndices].sort((left, right) => left - right));
  assert.deepEqual(decodeTerrainGenerationMarkerTableV2(actual.markerTable), expectedMarkers);
  assert.ok(expectedMarkers.length > 0, "the fixture must continue exercising POI metadata parity");
  reference.dispose();
});
