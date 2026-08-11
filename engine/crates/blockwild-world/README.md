# blockwild-world

`blockwild-world` is Blockwild's platform-neutral R2 shadow accelerator. It
implements the exact `SectionSnapshotV1` and `MeshPacketV1` identity and packed
stream rules used by `app/game/terrain-mesh-contract.ts`, plus deterministic,
resumable four-channel voxel-light propagation.

The V1 mesher owns complete sections containing any current block family. Its
production BWR2 registry is fully self-describing: layer, shape, atlas tiles,
occlusion/connection flags, liquid behavior, light behavior, authored variant,
geometry revision, and tint policy cross the worker boundary for every block.
Unknown IDs, missing biome tints, malformed material/fluid combinations, or
content-hash mismatches make the whole section ineligible. Geometry-hidden cells
are omitted and unknown halo cells retain their encoded air/block value,
matching the TypeScript oracle. Rust never publishes a partial section or
combines its output with TypeScript geometry. BWR1 and its frozen catalog remain
decode-only compatibility for rollback; production BWR2 meshing does not infer
geometry or material behavior from a numeric block ID.

The light task takes 256 direct-sky levels above the section because a one-cell
block halo cannot distinguish direct sky from propagated side light. Its halo
light is immutable input. Publication carries the source snapshot hash,
address, and all three revision lanes, and returns a sorted core-cell delta for
reconciliation. Clone a task to checkpoint resumable frontier state.

All iteration orders are fixed arrays or linear indexes. The crate uses no
unsafe code and no hash-map iteration for canonical output.

## V1 binary boundary

The binary codecs are deliberately simple little-endian transfer formats for
the Wasm worker boundary. Snapshot, production registry, mesh, and light
payloads begin with `BWS1`, `BWR2`, `BWM1`, and `BWL1`. BWR1 registry payloads
remain readable for rollback. Whole-section refusal and malformed input begin
with `BWI1` and `BWE1`. Decoders reject trailing bytes and payloads larger than
64 MiB.

Mesh positions preserve the current Three.js convention: x/z are chunk-local
voxel-center coordinates while y is the world coordinate derived from
`sectionY * 16`. All other streams use the typed-array normalization described
by `MeshPacketV1`; layer spans are contiguous in the wire-stable order.

## BWR2 registry contract

BWR1 tag `3` contains no material payload, so its frozen catalog is deliberately
rollback compatibility rather than a future-proof authority. BWR2 replaces both
opaque and specialty tags with one generated material record. The exact
little-endian entry encoding is:

1. `tag:u8`: `0` missing, `1` air, `2` material.
2. For tag `2`, `layer:u8` using MeshPacket layer codes `0..6`.
3. `shape:u8` using the catalog's stable `CanonicalShapeV1` codes `0..36`.
4. `sideTile:u16`, `topTile:u16`, `bottomTile:u16`.
5. `flags:u16`: bit 0 solid, bit 1 waterlogged, bit 2 connects-fence, bit 3
   ambient-occlusion, bit 4 selective-same-block interior faces (leaves), bit 5
   directionally placed, bit 6 joins identical block/facing horizontally, bit 7
   joins identical block/facing vertically; bits 8..15 must be zero.
6. `liquidKind:u8`: 0 none, 1 water, 2 lava, 3 honey, 4 syrup.
7. `lightDampening:u8`, `emittedLight:u16`, `emissiveStrength:f64`.
8. `verticalConnectGroup:u16`: 0 none, otherwise a generated stable group code.
9. `aquaticProfile:u8`: 0 none, otherwise the stable profile codes `1..12`.
10. `shapeVariant:u16`: 0 is the canonical shape. Nonzero values use the shared
    generated enum and carry authored state such as torch mount, gate axis/open
    state, door axis/open/style, bed half/direction, furnace facade, archive tome
    count, and authored active/material/fitting variants.
11. `geometryRevision:u16`: a generated revision for the shape emitter and its
    baked constants. Changing cuboid bounds, plane count, authored auxiliary
    tiles/tints, connection rules, UV layout, face shades, deterministic seed
    salts, or emission placement must increment it.
12. `tintPolicy:u8`: 0 neutral, 1 biome-linear-RGB. Other values are rejected
    until both runtimes define them.

The existing biome-tint suffix remains unchanged. `contentHash` must hash every
field above, including reserved-zero bytes, in this wire order. Decoders must
reject unknown codes, nonzero reserved bits, inconsistent liquid/waterlogged
flags, illegal shape/variant pairs, zero geometry revisions, out-of-atlas tiles,
invalid light values, and trailing bytes. This makes future material and
authored-geometry changes fail closed without rebuilding a Rust hardcoded
table. Facing, hidden-geometry, fluid-level/source/falling, and biome IDs remain
per-cell `SectionSnapshot` streams rather than registry fields.
