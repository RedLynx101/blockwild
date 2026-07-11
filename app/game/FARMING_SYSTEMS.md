# Farming, orchard, fence, and ambient-world integration

The production contracts live in `farming.ts`, `caves.ts`, and
`world-effects.ts`. They are deterministic and deliberately independent of
Three.js or the engine loop.

## Engine interaction order

Handle these before generic food consumption or ordinary `placeBlock()`:

1. A ripe target uses `harvestPlant(target.type, held.useKind === "scythe", roll)`.
   Apply its replacement, spawn every returned drop, damage the scythe once,
   publish the edit, and schedule the replacement's next stage.
2. A hoe targeting a tillable ground block calls `canTill(type, above)` and
   replaces it with `farmlandState(world.getBlock, position)`.
3. A plant item targeting the top of a block calls
   `plantingResult(item, soil, above)`. Place the returned initial block and
   consume one item. Apples become `AppleSapling`; they are not eaten when the
   player is deliberately targeting valid soil.
4. A bucket calls `resolveBucketAction`. Filling removes a source block and
   swaps one empty bucket for the filled item. Pouring places the returned
   liquid source, returns an empty bucket, and notifies the liquid simulator.
5. Gate targets call `toggleFenceGate`; gate placement calls
   `fenceGateForYaw(yaw)`.

`harvestPlant` supports right-click hand harvest for berries/apples and
right-click scythe harvest/replant for mature wheat. Breaking immature plants
should return seeds/cuttings only; breaking a ripe bush is intentionally not
the normal harvest path.

## Bounded growth tick

Persist a `Map<blockKey, dueTime>` alongside saplings. Process at most 6 plants
per one-second check. Validate with `canGrowPlant`, obtain the next stage with
`nextPlantStage`, and calculate each new due time with `growthDelaySeconds`.
Update farmland under the same bounded pass with `farmlandState`; hydrated and
dry farmland are separate blocks, so the atlas communicates state without an
extra mesh.

When an `AppleSapling` expires, verify a 5×8×5 clear volume and apply
`planAppleTree` as one batch. Track the root and periodically call
`planAppleFruitRegrowth` (one or two fruit every few minutes, maximum four).
Fruit is a separate hanging block under `AppleLeaves`, so breaking or
right-clicking it never damages the tree.

## Fences and leads

The chunk renderer already connects `WildwoodFence` to fences, gates, and full
solid cubes. Closed fences/gates declare a 1.25-block `collisionHeight`; the
engine collision sampler must use that top instead of assuming `y + 0.5`.
Open gates are non-solid and `ChunkWorld.isWalkThrough` accepts them.

Leads should persist `{ mobId, fence?, maximumLength }`. While held, the player
is the anchor; crouch-use on a fence stores its block position. Apply the small
velocity correction returned by `constrainLead` and drop the lead if `breaks`
is true, the anchor block disappears, or the mob is removed.

## Ambient render hooks

- Every 500 ms, collect only visible leaf-block positions within 32 blocks and
  call `planLeafParticles`; the helper caps output at six. Render each as one
  pooled crossed quad. `stepLeafParticle` returns `null` on ground contact, so
  no resting particles accumulate.
- `torchAnimationSample` drives both held and placed flame scale/offset. Apply
  its intensity/radius to existing pooled/local torch lights rather than
  creating per-torch lights.
- Flora items expose `worldTextureBlock`, and crafting tables/buckets/gates/
  leads expose `iconKind` for UI artwork. Filled bucket `color` and
  `bucketLiquid` are the canonical handheld/icon tint.

## World/save compatibility

Terrain generation is version 4. Generator-3 saves keep their edit indices and
only update the version; generator-2 saves still need the existing vertical
index migration. Cave openings, rooms/chimneys, climate-weighted relief,
limestone/moon-slate/sunbaked-clay strata, and reduced wild-wheat density are
already integrated in `ChunkWorld`.
