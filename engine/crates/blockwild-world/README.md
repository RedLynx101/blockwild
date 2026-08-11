# blockwild-world

`blockwild-world` is Blockwild's platform-neutral R2 shadow accelerator. It
implements the exact `SectionSnapshotV1` and `MeshPacketV1` identity and packed
stream rules used by `app/game/terrain-mesh-contract.ts`, plus deterministic,
resumable four-channel voxel-light propagation.

The initial mesher accepts only sections composed entirely of explicit air and
supported opaque full cubes, including their complete one-cell halo. Any
specialty geometry, non-opaque layer, fluid metadata, hidden geometry, unknown
halo, missing biome tint, unrecognized block, or content-hash mismatch makes
the whole section ineligible. The caller must then use the TypeScript oracle;
Rust never publishes a partial section.

The light task takes 256 direct-sky levels above the section because a one-cell
block halo cannot distinguish direct sky from propagated side light. Its halo
light is immutable input. Publication carries the source snapshot hash,
address, and all three revision lanes, and returns a sorted core-cell delta for
reconciliation. Clone a task to checkpoint resumable frontier state.

All iteration orders are fixed arrays or linear indexes. The crate uses no
unsafe code and no hash-map iteration for canonical output.

## V1 binary boundary

The binary codecs are deliberately simple little-endian transfer formats for
the Wasm worker boundary. Snapshot, registry, mesh, and light payloads begin
with `BWS1`, `BWR1`, `BWM1`, and `BWL1`. Whole-section refusal and malformed
input begin with `BWI1` and `BWE1`. Decoders reject trailing bytes and payloads
larger than 64 MiB.

Mesh positions preserve the current Three.js convention: x/z are chunk-local
voxel-center coordinates while y is the world coordinate derived from
`sectionY * 16`. All other streams use the typed-array normalization described
by `MeshPacketV1`; layer spans are contiguous in the wire-stable order.
