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

## The World Below generator

New worlds use the `world-below-v15` profile while existing saves retain the generator profile written into their metadata. The profile keeps the established Y -64 through 127 bounds, sea level 32, chunk dimensions, and linear block indexing. Block fields are unsigned 16-bit arrays, so each 16 x 16 x 192 chunk owns a fixed 98,304-byte voxel slab and can address the expanded material catalogue without remapping old numeric IDs.

Surface terrain is selected in two stages. A coarse deterministic region allocator establishes biome cores, transition belts, and rare-biome reserves; biome-specific height functions then supply local relief. Biome scale changes core size without quietly changing rarity, transition width, or local feature frequency. This is why surface generation should always be audited as both total area and land-only area rather than judged from a single spawn.

Caves are graph-first. Each coarse underground region creates upper, middle, and deep nodes, then connects them with a spanning backbone, loops, vertical routes, rooms, and explicit surface-mouth edges. Carvers consume that graph before ecological decoration. Underground-biome decorators may replace only already-carved air or supported cave surfaces; they must never create a second disconnected cave system. Ordinary Stone Roads remain dark, while bounded ecological centers own most glow sources. Regional aquifers, streams, waterfalls, great caverns, cathedral caverns, and landmark nodes are features of the same graph.

Generation stays bounded by coarse-cell lookups and local placement budgets. Lighting pools are capped, decoration does not scan arbitrary neighboring chunks, and settlement site search stops after a fixed candidate set. Deepgear mine roads use a deterministic one-block-grade switchback plan and a fixed 144-block settlement reach. Dwarven generation must retain a mountain-valid gatehouse, an unobstructed paired lift, cave-graph anchoring, civic and forge layers, a discovery marker, and a walkable lit road.

Use these release gates after changing terrain, caves, underground ecology, settlement placement, block IDs, or serialization:

- `npm run test:world-overhaul` checks deterministic profiles, all 24 surface biomes, graph and voxel flood-fill connectivity, glow contrast, nine signature creatures, material chains, traversal, map depth bands, old-save migration, real Dwarven infrastructure, and a 3 x 3 chunk budget.
- `node --import tsx scripts/audit-world-overhaul.ts` prints three-seed surface, topology, ecology, settlement, Dwarven, memory, and generation-time evidence. Add `--json` for machine-readable release artifacts.
- `npm run audit:ecology` reports flora, fauna, custom-sound, and possible-POI counts for every surface and underground habitat.

The exact nature of Veinmetal is intentionally not an engine invariant. Its observable behavior—rare pulsing Living Veins, careful extraction, inert flakes, bounded regrowth, and Veinling defense—is stable; later lore may describe it as biological, magical, mechanical, or some combination without requiring a migration.

## Weather and clouds

Save one `WeatherState` in world metadata. Initialize with `createWeatherState({ seed, biome })`, advance it through `stepWeather`, and switch the biome context when the player spends several seconds in a new biome. The hold time avoids weather changing on every biome boundary. All cycle choices, durations, intensity, and wind are seed deterministic.

`weatherBiomeFromId` maps the existing numeric biome IDs. Profiles include clear, overcast, drizzle, rain, thunder, snow, sandstorm, mist, and ashfall. `weatherVisuals` supplies blend-safe precipitation, sky, fog, lightning, and cloud values.

`planCloudField` is capped at an eight-cell radius. Each cluster contains 9–15 large overlapping lobes for a rounder silhouette. Render the lobes as instanced low-poly meshes in one or a few draw calls. Field planning is `O(radius² × lobes)` with a hard maximum of 289 clusters and 15 lobes each; normal gameplay should use radius 3–5 and reuse plans while the player stays in the same cloud cell.

## POIs, loot, and vegetation

`structures.ts` emits explicit world-coordinate `BlockId` placements. Every placement uses an existing block definition. `variant` is semantic metadata for later custom atlas art and is safe to ignore initially.

`structureCandidateForChunk` chooses one candidate in each 16×16-chunk region (average density 1/256 chunks) and selects the biome-appropriate plan:

- Sunglass Desert / Badlands: desert temple and its Dune Warden.
- Forest families: forest temple and its Rootbound Sentinel.
- Meadow: Sunbun Grove or the large butterfly sanctuary.

After choosing a candidate, call `planStructure` at the terrain surface. A plan can cross chunk edges. Use `chunksTouchedByStructure`, `structurePlacementsForChunk`, and `structureMarkersForChunk` to dispatch edits into a per-target-chunk pending map. Apply pending edits when each chunk generates, or immediately if it is already loaded. Register marker IDs in world metadata so chests and persistent residents are not spawned twice.

Chest markers contain deterministic, pre-rolled semantic loot. The inventory layer maps `itemKey` values to item codes. Add a real item definition for `SUNWARD_COMPASS.itemKey`; its contract is 4,096 durability, one durability per pulse, and a 36-block pulse toward unopened containers/recorded landmarks. Both temples give it an independent 3.5% bonus roll. The common loot keys correspond directly to existing items/blocks (`gold-ingot`, `iron-ingot`, `crystal-shard`, `bone-shard`, `glow-dust`, `bread`, `apple`, `fiber`, `wildwood-planks`, `wheat`, flowers, and `butterfly-net`).

`planBiomeVegetation` scans exactly 256 columns and emits at most 64 features. Its explicit placements use existing cactus, grass, flower, log, and stone blocks. Semantic variants cover saguaros, barrel cacti, dry shrubs, sunspike rocks, meadow grass, buttercups, violet-stars, ember blooms, and butterfly host flowers. If dedicated tiles are added later, map variants to those IDs at application time without changing generation seeds.

## Integration checklist

1. Add chunk-local liquid metadata and a `LiquidWorldAdapter`; enqueue block edits and process the adaptive liquid budget.
2. Use `stepSwimming` in the fixed player update and show oxygen only while depleted or submerged.
3. Replace the current render-distance clamp with `normalizeViewDistances`; keep mob, weather, crop, and liquid ticks inside simulation distance.
4. Record rolling frame/chunk/simulation metrics and surface a small debug benchmark panel or text-state payload.
5. Persist `WeatherState`, instance planned cloud lobes, and use `weatherVisuals` for sky/fog/particles.
6. Dispatch cross-chunk structure placements, consume each marker ID once, and map semantic loot keys to inventory codes.
7. Apply desert/meadow vegetation only when the planned cell is air and the sampled surface is still appropriate.
