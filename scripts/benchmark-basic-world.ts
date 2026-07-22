import { performance } from "node:perf_hooks";
import { buildBasicWorldGeometry } from "../app/game/basic-world-geometry.ts";
import { ChunkWorld } from "../app/game/world.ts";

const world = new ChunkWorld();
world.reset("BASIC-WORLD-BENCHMARK", undefined, { structures: false });
const scenarios = [
  { name: "desktop-on-foot", fullDistance: 10, basicDistance: 20, cameraY: 48 },
  { name: "dragon-flight-maximum", fullDistance: 10, basicDistance: 32, cameraY: 78 },
  { name: "deep-cavern", fullDistance: 10, basicDistance: 20, cameraY: -18 },
  { name: "touch-disabled", fullDistance: 6, basicDistance: 6, cameraY: 48 },
] as const;

const results = scenarios.map((scenario) => {
  const startedAt = performance.now();
  const geometry = buildBasicWorldGeometry({ seed: world.seed, centerChunkX: 0, centerChunkZ: 0, ...scenario }, (x, z) => world.sampleColumn(x, z));
  const wallMilliseconds = performance.now() - startedAt;
  const triangles = (geometry.surfaceIndices.length + geometry.caveIndices.length) / 3;
  const vertices = (geometry.surfacePositions.length + geometry.cavePositions.length) / 3;
  const bytes = geometry.surfacePositions.byteLength + geometry.surfaceColors.byteLength + geometry.surfaceIndices.byteLength
    + geometry.cavePositions.byteLength + geometry.caveColors.byteLength + geometry.caveIndices.byteLength;
  return { ...scenario, wallMilliseconds, generationMilliseconds: geometry.generationMilliseconds, triangles, vertices, bytes, drawCalls: triangles > 0 ? 2 : 0 };
});
world.dispose();
process.stdout.write(`${JSON.stringify({ benchmark: "basic-world", results }, null, 2)}\n`);

