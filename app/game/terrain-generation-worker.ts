import { ChunkWorld, type WorldGenerationOptions } from "./world";
import type { TerrainGenerationRequest } from "./terrain-generation-pipeline";

type Request = Readonly<{ id: number; request: TerrainGenerationRequest }>;

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, request } = event.data;
  const world = new ChunkWorld();
  const savedEdits = request.edits.length
    ? { [request.key]: request.edits.map(([index, type]) => [index, type] as [number, number]) }
    : undefined;
  world.reset(request.seedText, savedEdits, request.generationOptions as Partial<WorldGenerationOptions>);
  const chunk = world.generateChunk(request.cx, request.cz);
  const result = {
    namespace: request.namespace,
    key: chunk.key,
    cx: chunk.cx,
    cz: chunk.cz,
    blocks: chunk.blocks,
    heightmap: chunk.heightmap,
    biomes: chunk.biomes,
    sectionBlockCounts: chunk.sectionBlockCounts,
    skyTops: chunk.skyTops,
    light: chunk.light,
    lightIndices: [...chunk.lightIndices],
    leafIndices: [...chunk.leafIndices],
  };
  world.chunks.delete(chunk.key);
  world.group.remove(chunk.group);
  world.dispose();
  const transfer = [result.blocks.buffer, result.heightmap.buffer, result.biomes.buffer, result.sectionBlockCounts.buffer, result.skyTops.buffer, result.light.buffer];
  self.postMessage({ id, result }, { transfer });
};
