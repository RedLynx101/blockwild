# Embercarapace Beetle source reference

This folder preserves the authored source used for Blockwild's Embercarapace Beetle. The production game model is a lightweight cuboid reconstruction in `app/game/tripo-creature-models.ts`; it does not stream or parse this GLB during play.

## Provenance

- Provider: Tripo Studio
- Workspace: `https://studio.tripo3d.ai/workspace/segmentation/voxel-beetle-with-dark-exoskeleton-orange-glowing-abdomen-blocky-leg-529001f4-1a78-4589-b02a-c2a5f9a815d7`
- Export: segmented GLB, 11 mesh parts, 4,901 faces, 6,943 vertices
- Source file: `blockwild-embercarapace-beetle-segmented.glb`
- SHA-256: `23B518DE618822DD443F50DAE9149976BB45F0FA6C19C3898D67458A2EC9526F`
- Ownership note: generated and exported from Noah's Tripo Studio workspace. Confirm Tripo's current export terms before redistributing the raw source outside the project.

## Semantic part map

| GLB node | Production role |
| --- | --- |
| `tripo_part_0` | Thorax and forward shell mass |
| `tripo_part_2` | Wing cases and rear body |
| `tripo_part_3` | Head |
| `tripo_part_1`, `tripo_part_4` | Right and left antennae |
| `tripo_part_7`, `tripo_part_5`, `tripo_part_6` | Left front, middle, and rear legs |
| `tripo_part_13`, `tripo_part_9`, `tripo_part_14` | Right front, middle, and rear legs |

## Blockwild translation

The source establishes the silhouette, palette, stepped antennae, red warning marks, black plated shell, and orange furnace abdomen. The runtime reconstruction adds connected hip-knee-tarsus chains, paired mandibles, split wing-case pivots, controlled heat pulses, and an alternating-tripod gait. It stays deterministic and uses only the existing Three.js cuboid pipeline, so world mobs, the Bestiary, model inspections, and generated portraits all share the same production geometry.

The review render `source-three-quarter.png` records the untouched segmented source under neutral Emberdeep lighting. Editable animation experiments and rendered motion reviews live under the ignored `work/tripo-embercarapace-beetle/` workspace rather than the shipped runtime.
