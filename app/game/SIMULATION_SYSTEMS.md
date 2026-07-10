# Simulation systems integration

The modules in this folder are deliberately independent of Three.js and React. They expose deterministic plans or bounded state steps; `engine.ts` and `world.ts` remain responsible for persistence, rendering, collision, and chunk invalidation.

## Water, swimming, and oxygen

`liquids.ts` provides `LiquidSimulator`. Give it an adapter over the world and call `process(frameBudget.liquidOperations)` during the fixed simulation step.

The current block array stores only `BlockId.Water`, so flow metadata must live beside the block array (for example, a chunk-local `Map<blockIndex, LiquidCell>`). Generated ocean/river water should be registered as sources when its chunk activates. `setLiquid` should update both that metadata and the visible `BlockId.Water`/`BlockId.Air`, then dirty only the affected mesh sections. Call `notifyBlockChanged` after placing or breaking a neighbouring block. Persist edited liquid cells with chunk edits; do not save untouched generated ocean sources individually.

The queue is deduplicated. Each processed cell does constant neighbour work and can write its own state plus at most five destinations, so a tick is `O(liquidOperations)` and the queue is `O(active flow frontier)`. Water spreads seven cells sideways; lava spreads three. Vertical waterfalls are bounded by the world's minimum Y. Falling streams spread when they meet support instead of forming wide mid-air curtains. Equal-strength proposals are stable, preventing falling/sideways state oscillation.

Use `waterSurfaceSample` once per water material or chunk—not once per face—to drive a subtle UV/height shader phase. `stepSwimming` returns vertical velocity, horizontal drag, oxygen, drowning damage, and a shore boost. Feed it the player's head-submersion test and the forward collision probe. The shore probe accepts ledges up to 1.15 blocks so a jumping swimmer can exit onto a block at water level.

## View distance and benchmarks

`performance.ts` makes 10 chunks the render default, caps it at 16, and makes 8 the simulation default while always clamping simulation distance to render distance.

- Radius 10: 441 potentially visible chunks.
- Radius 16: 1,089 potentially visible chunks.
- Simulation radius 8: 289 ticking chunks.

Those counts require lazy generation, section-level mesh queues, instancing, and eviction; they must not all be generated synchronously. Use `chunkOffsetsByDistance` for near-first streaming and `DEFAULT_FRAME_WORK_BUDGET` for initial limits. `PerformanceSampler.record` is `O(1)` with a fixed ring. Calling `summary` is `O(n log n)` and should happen every 1–2 seconds, not every frame. `AdaptiveBudgetController` requires repeated pressure before changing work limits, which avoids visible pulsing after one garbage-collection pause.

Suggested browser acceptance gate at 10/8 after a 30-second traversal:

- p95 frame time at or below 22 ms;
- fewer than 5% of frames above 25 ms;
- average chunk work below 4 ms;
- average entity/liquid simulation below 3.5 ms;
- no monotonic growth in loaded chunks after walking away and returning.

Use `benchmarkTask` around chunk generation, section meshing, mob simulation, and liquid processing. Include the resulting values in `PerformanceSample` rather than logging every frame.

For a repeatable CPU-side baseline, run `node --import tsx scripts/benchmark-simulation.ts`. It measures a bounded four-source water settle, 1,000 structure plans, 250 weather/cloud field plans, and radius-16 chunk ordering. Wall-clock values are machine-specific; compare commits on the same browser and hardware.

## Weather and clouds

Save one `WeatherState` in world metadata. Initialize with `createWeatherState({ seed, biome })`, advance it through `stepWeather`, and switch the biome context when the player spends several seconds in a new biome. The hold time avoids weather changing on every biome boundary. All cycle choices, durations, intensity, and wind are seed deterministic.

`weatherBiomeFromId` maps the existing numeric biome IDs. Profiles include clear, overcast, drizzle, rain, thunder, snow, sandstorm, mist, and ashfall. `weatherVisuals` supplies blend-safe precipitation, sky, fog, lightning, and cloud values.

`planCloudField` is capped at an eight-cell radius. Each cluster contains 9–15 large overlapping lobes for a rounder silhouette. Render the lobes as instanced low-poly meshes in one or a few draw calls. Field planning is `O(radius² × lobes)` with a hard maximum of 289 clusters and 15 lobes each; normal gameplay should use radius 3–5 and reuse plans while the player stays in the same cloud cell.

## POIs, loot, and vegetation

`structures.ts` emits explicit world-coordinate `BlockId` placements. Every placement uses an existing block definition. `variant` is semantic metadata for later custom atlas art and is safe to ignore initially.

`structureCandidateForChunk` chooses one candidate in each 12×12-chunk region (average density 1/144 chunks) and selects the biome-appropriate plan:

- Sunglass Desert / Badlands: desert temple and its Dune Warden.
- Forest families: forest temple and its Rootbound Sentinel.
- Meadow: Sunbun Grove or the large butterfly sanctuary.

After choosing a candidate, call `planStructure` at the terrain surface. A plan can cross chunk edges. Use `chunksTouchedByStructure`, `structurePlacementsForChunk`, and `structureMarkersForChunk` to dispatch edits into a per-target-chunk pending map. Apply pending edits when each chunk generates, or immediately if it is already loaded. Register marker IDs in world metadata so chests and persistent residents are not spawned twice.

Chest markers contain deterministic, pre-rolled semantic loot. The inventory layer maps `itemKey` values to item codes. Add a real item definition for `SUNWARD_COMPASS.itemKey`; its contract is 4,096 durability, one durability per pulse, and a 36-block pulse toward unopened containers/recorded landmarks. Both temples give it an independent 3.5% bonus roll. The common loot keys correspond directly to existing items/blocks (`gold-ingot`, `sunmetal-ingot`, `crystal-shard`, `bone-shard`, `glow-dust`, `bread`, `apple`, `fiber`, `wildwood-planks`, `wheat`, flowers, and `butterfly-net`).

`planBiomeVegetation` scans exactly 256 columns and emits at most 64 features. Its explicit placements use existing cactus, grass, flower, log, and stone blocks. Semantic variants cover saguaros, barrel cacti, dry shrubs, sunspike rocks, meadow grass, buttercups, violet-stars, ember blooms, and butterfly host flowers. If dedicated tiles are added later, map variants to those IDs at application time without changing generation seeds.

## Integration checklist

1. Add chunk-local liquid metadata and a `LiquidWorldAdapter`; enqueue block edits and process the adaptive liquid budget.
2. Use `stepSwimming` in the fixed player update and show oxygen only while depleted or submerged.
3. Replace the current render-distance clamp with `normalizeViewDistances`; keep mob, weather, crop, and liquid ticks inside simulation distance.
4. Record rolling frame/chunk/simulation metrics and surface a small debug benchmark panel or text-state payload.
5. Persist `WeatherState`, instance planned cloud lobes, and use `weatherVisuals` for sky/fog/particles.
6. Dispatch cross-chunk structure placements, consume each marker ID once, and map semantic loot keys to inventory codes.
7. Apply desert/meadow vegetation only when the planned cell is air and the sampled surface is still appropriate.
