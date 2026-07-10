import { LiquidSimulator, type LiquidCell, type LiquidPosition, type LiquidWorldAdapter } from "../app/game/liquids.ts";
import { benchmarkTask, chunkOffsetsByDistance } from "../app/game/performance.ts";
import { planStructure, type StructureKind } from "../app/game/structures.ts";
import { createWeatherState, planCloudField, stepWeather } from "../app/game/weather.ts";

const positionKey = ({ x, y, z }: LiquidPosition) => `${x},${y},${z}`;

class BenchmarkLiquidWorld implements LiquidWorldAdapter {
  readonly liquids = new Map<string, LiquidCell>();
  readonly solids = new Set<string>();
  minY = 0;
  maxY = 12;

  getLiquid(position: LiquidPosition) {
    return this.liquids.get(positionKey(position));
  }

  setLiquid(position: LiquidPosition, liquid: LiquidCell | undefined) {
    if (liquid) this.liquids.set(positionKey(position), liquid);
    else this.liquids.delete(positionKey(position));
  }

  isSolid(position: LiquidPosition) {
    return this.solids.has(positionKey(position));
  }
}

const liquid = benchmarkTask("four-water-source-settle", () => {
  const world = new BenchmarkLiquidWorld();
  for (let z = -24; z <= 24; z += 1) for (let x = -24; x <= 24; x += 1) world.solids.add(`${x},0,${z}`);
  const simulator = new LiquidSimulator(world);
  for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6]] as const) simulator.addSource({ x, y: 5, z });
  let processedTicks = 0;
  let changes = 0;
  while (simulator.pendingCount > 0 && processedTicks < 2_000) {
    changes += simulator.process(192).length;
    processedTicks += 1;
  }
  return { processedTicks, changes, liquidCells: world.liquids.size, remainingQueue: simulator.pendingCount };
});

const kinds: StructureKind[] = ["desert-temple", "forest-temple", "sunbun-grove", "meadow-butterfly-sanctuary"];
const structures = benchmarkTask("one-thousand-structure-plans", () => {
  let placements = 0;
  let markers = 0;
  for (let index = 0; index < 1_000; index += 1) {
    const plan = planStructure(kinds[index % kinds.length], { x: index * 17, y: 40, z: -index * 13 }, `bench:${index}`);
    placements += plan.placements.length;
    markers += plan.markers.length;
  }
  return { placements, markers };
});

const weather = benchmarkTask("weather-and-cloud-plans", () => {
  const context = { seed: "benchmark", biome: "meadow" as const };
  let state = createWeatherState(context);
  let clusters = 0;
  let lobes = 0;
  for (let index = 0; index < 250; index += 1) {
    state = stepWeather(state, context, 20);
    const field = planCloudField(context.seed, index % 10, Math.floor(index / 10), 4, state);
    clusters += field.length;
    lobes += field.reduce((sum, cluster) => sum + cluster.lobes.length, 0);
  }
  return { clusters, lobes, finalCycle: state.cycle };
});

const chunkOrdering = benchmarkTask("radius-sixteen-chunk-order", () => chunkOffsetsByDistance(16).length);

process.stdout.write(`${JSON.stringify({
  generatedAt: new Date().toISOString(),
  note: "Wall-clock values are machine-specific; compare runs from the same browser/hardware.",
  benchmarks: [liquid, structures, weather, chunkOrdering],
}, null, 2)}\n`);
