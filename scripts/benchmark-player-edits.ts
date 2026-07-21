import { BlockId } from "../app/game/data.ts";
import { ChunkWorld, MIN_Y, SECTION_HEIGHT } from "../app/game/world.ts";

function settleTerrain(world: ChunkWorld, maximumSteps = 256) {
  world.flushLightSections(maximumSteps);
  let steps = 0;
  while (steps < maximumSteps && world.processConsolidation()) steps += 1;
  if (steps >= maximumSteps) throw new Error("Terrain consolidation did not settle within the benchmark guard.");
  return steps;
}

const world = new ChunkWorld();
world.reset("PLAYER-EDIT-PERFORMANCE", undefined, { structures: false });
const chunk = world.generateChunk(0, 0);
chunk.blocks.fill(BlockId.Air);
chunk.sectionBlockCounts.fill(0);
world.lightEngine.initializeChunk(chunk);

const x = 4;
const y = 0;
const z = 4;
const section = Math.floor((y - MIN_Y) / SECTION_HEIGHT);
world.setBlock(x, y, z, BlockId.Stone, false, true);
settleTerrain(world);
world.resetPlayerEditFeedbackDiagnostics();

const operationCount = 32;
let consolidationSteps = 0;
for (let index = 0; index < operationCount; index += 1) {
  const next = index % 2 === 0 ? BlockId.Air : BlockId.Stone;
  const token = world.beginPlayerEditFeedback(next === BlockId.Air ? "break" : "place");
  world.setBlock(x, y, z, next, true, true);
  world.completePlayerEditFeedback(token);
  consolidationSteps += settleTerrain(world);
}

const treeBlocks = Array.from({ length: 6 }, (_, index) => ({ x: x + 2, y: y + index, z, type: BlockId.WildwoodLog }));
world.setBlocksBatch(treeBlocks, false, true);
consolidationSteps += settleTerrain(world);
const treeFeedback = world.beginPlayerEditFeedback("tree-fell");
world.setBlocksBatch(treeBlocks.map((block) => ({ ...block, type: BlockId.Air })), true, true, true);
world.markPlayerEditProxyStarted(treeFeedback);
world.completePlayerEditFeedback(treeFeedback);
consolidationSteps += settleTerrain(world);

const streaming = world.streamingDiagnostics();
const output = {
  benchmark: "blockwild-player-edits-v1",
  environment: { node: process.version, blockOperations: operationCount, treeOperations: 1 },
  localFeedback: streaming.playerEdits,
  terrain: {
    invalidatedCombinedMeshes: streaming.terrainSubmission.invalidatedCombinedMeshes,
    mergeSubmissions: streaming.terrainWorker.submitted,
    staleMerges: streaming.terrainWorker.staleResults,
    coalescedRequests: streaming.terrainWorker.coalescedRequests,
    consolidationSteps,
    finalCombinedOpaque: Boolean(chunk.combinedMeshes.opaque),
    finalSectionVisible: Boolean(chunk.sections.get(section)?.opaque?.visible),
  },
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
world.dispose();
