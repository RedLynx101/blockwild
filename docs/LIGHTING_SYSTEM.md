# Blockwild lighting system

Blockwild uses one authoritative, Minecraft-like voxel light field for world
rendering and light-sensitive simulation. The implementation deliberately keeps
lighting derived from seed terrain and block edits: it is rebuilt at runtime and
is never serialized or sent as multiplayer state.

## Goals and invariants

- Covered spaces darken because solid voxels interrupt light propagation, not
  because the camera crossed an underground height or biome threshold.
- Torches and other luminous blocks illuminate the terrain mesh even when the
  dynamic point-light accent budget is exhausted.
- Sky and colored block light remain independent so weather and time of day can
  recolor daylight without destroying locally authored light.
- Identical blocks, edits, and loaded chunk neighborhoods produce identical
  fields regardless of chunk load order, including at negative coordinates.
- Missing chunks are hard propagation boundaries. Loading a neighbor rebuilds
  the bounded seam; unloaded data is never guessed.
- Simulation systems query the same field the player sees.

## Packed field

Each loaded voxel owns one `Uint16` value in its chunk:

| Bits | Channel | Range |
| --- | --- | --- |
| 0-3 | skylight | 0-15 |
| 4-7 | red block light | 0-15 |
| 8-11 | green block light | 0-15 |
| 12-15 | blue block light | 0-15 |

At the current 16 x 16 x 192 chunk dimensions this costs 96 KiB per loaded
chunk. The array is chunk-owned for spatial locality. Queue entries are packed
world positions and channel identifiers rather than heap-allocated node objects.

`app/game/lighting.ts` owns packing, channel access, perceived-light helpers,
propagation, removal, dirty-section reporting, and the deterministic rebuild
path. `ChunkWorld` supplies block and chunk access without making the light
engine depend on rendering.

## Block contract

Every block definition may declare:

- `lightEmission`: source level from 0 through 15;
- `lightColor`: normalized RGB hue for emitted light;
- `lightDampening`: extra attenuation caused by the material; and
- `emissiveStrength`: visible self-glow, independent from cast light.

Opaque full cubes default to complete dampening. Air, shaped blocks, water,
foliage, cutouts, and transparent materials receive conservative defaults, but
important materials should declare their behavior explicitly. Self-emission is
not a substitute for `lightEmission`: an emissive texture can look bright without
lighting a room, while a hidden gameplay source can cast light without blooming.

## Propagation and edits

Direct skylight is seeded from open chunk columns. Sky and each RGB channel then
propagate through the six axis neighbors with material-aware attenuation. Solid
walls stop the field, water and leaves soften it, and air consumes the normal
one-level distance step.

Edits use paired increase and decrease queues. Removing or occluding a source
first invalidates values that depended on it, then re-propagates surviving light
from unaffected neighbors. This avoids permanent ghost light while keeping small
edits local.

Large batches, such as roofs, doors, generated rooms, or structure replacement,
take a bounded rebuild path. The engine deduplicates affected chunks, adds one
chunk of halo, derives the complete field for that neighborhood once, and marks
only affected section light buffers dirty. It does not run one global flood fill
per changed block.

## Rendering

Terrain uses a shared shader-backed material. Geometry carries three lighting
attributes in addition to position, normal, UV, and albedo tint:

- `voxelLight`: normalized sky and RGB values sampled at each vertex;
- `voxelEmission`: block self-emission strength; and
- `voxelOcclusion`: bounded local corner occlusion.

Per-corner samples blend neighboring voxels so light crosses block faces without
the old column-sized steps. Ambient occlusion is calculated from a section-local
occluder cache and remains separate from albedo; it never darkens a texture
permanently. A light-only change replaces these buffer attributes without
rebuilding vertex positions, UVs, normals, or indices.

Daylight color and strength, minimum ambient response, and cave presentation are
shared uniforms. Three.js point lights are restrained accents for nearby flames
and magical sources; voxel light remains correct when every accent slot is busy.

## Caves, weather, and celestial presentation

There is no binary `underground` lighting switch. `ChunkWorld` derives a
continuous subterranean blend from propagated sky exposure and actual depth.
The engine smooths the value over time and uses separate response curves for:

- fog color and density;
- sky contribution;
- sun, moon, and star visibility;
- weather ambience and cave audio; and
- cave-state labels, which use hysteresis to prevent boundary flicker.

Ordinary tunnels can therefore remain dark while cave mouths retain indirect
daylight. Bioluminescent ecology is still authored by local block sources rather
than a global cave tint.

## Gameplay authority

`gameplayLightAt` is the simulation-facing query. Hostile natural spawning uses
it for darkness eligibility, and crop growth uses it for local illumination.
Callers must not reintroduce radius scans for torches or use a camera-only cave
flag as a substitute. The F3 probe reports the authoritative sky/RGB channels,
subterranean blend, dirty light-section count, and derived field memory.

## Performance contract

- Light arrays and section buffers are derived and pooled with their chunks.
- The corner sampler is allocation-free in the mesh hot path.
- Occluder lookup is cached per section build.
- Small edits use local increase/decrease propagation.
- Large batches rebuild only a deduplicated one-chunk halo.
- Light dirtiness is tracked independently from geometry dirtiness.
- Dynamic accent lights use a small nearest-source pool and a bounded query.
- Propagation never crosses an unloaded chunk boundary.

Before changing these boundaries, benchmark the initial 3 x 3 area, the dense
source fixture, a 256-block roof edit, and a light-only section update. A visual
improvement that restores radius-wide mesh rebuilds or frame-loop allocations is
not acceptable.

## Required verification

The release lighting suite must cover:

- a vertical shaft, an added roof, a roof opening, and a side cave;
- illumination stopping at opaque walls and blending at exposed corners;
- source removal without ghost values;
- water and foliage dampening;
- colored, data-driven placed sources;
- chunk seams, negative coordinates, reloads, and reversed load order;
- deterministic dense-source propagation and bounded runtime;
- packed light attributes and a light-only buffer update;
- separate, bounded vertex occlusion;
- authoritative weather, crop, and hostile-spawn queries; and
- a newly generated world in a real browser with no shader, console, or page
  errors.

## Adding a luminous or filtering block

1. Choose emission, hue, dampening, and self-emission independently.
2. Add the fields to the block definition rather than a renderer-side ID list.
3. Check the block in open air, against an opaque wall, under a roof, and across a
   chunk seam.
4. Remove it again and confirm dependent light disappears.
5. Inspect both the terrain result and the F3 channel values.
6. Run the lighting, world, weather, TypeScript, production-build, and browser
   gates before release.
