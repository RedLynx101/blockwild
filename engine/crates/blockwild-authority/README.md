# blockwild-authority

Deterministic, platform-neutral R4 world authority for Blockwild.

The crate owns location-sharded block state, section residency, atomic edits,
dirty propagation, immutable near-field read pages, cache validation, and
save/network export records. It deliberately contains no browser, worker,
IndexedDB, WebRTC, Three.js, or Wasm glue.

## Invariants

- Missing resident data is `Unloaded`, never air.
- Cells outside the vertical world bounds are explicit synthetic air/bedrock.
- Mutation batches preflight completely and commit once or not at all.
- Every job, cache install, and read page is revision/epoch bound.
- Section work is ordered by a stable priority key and cancellable by epoch.
- Edits survive section eviction in the location journal.
- Runtime consumers receive immutable coarse pages, not per-voxel callbacks.
- All public collections have bounded inputs and deterministic ordering.
- The crate forbids unsafe Rust through workspace lints.

## Integration boundary

The browser bridge should install generated sections in coarse batches, submit
atomic edit batches, and retain returned read-page buffers until their revision
changes. Immediate edit events are returned in the same call as a successful
mutation so presentation can hide stale geometry before asynchronous meshing.

The checked-in R4 browser boundary is split deliberately:

- `app/game/rust-world-authority-bridge-r4.ts` is the bounded Structured Clone
  protocol and transferable-buffer contract.
- `app/game/rust-world-authority-worker-r4.ts` is the serial Worker transport
  and handler. The handler never overlaps authority operations.
- `app/game/rust-world-authority-service-r4.ts` owns browser lifecycle,
  revision checks, current-save import, immediate events, and immutable page
  caching.

The Wasm facade must implement `RustWorldAuthorityKernelPortR4V1` with coarse
exports for initialize, current-save import, section installs, residency
intents, atomic mutation, read-page extraction, eviction, location switch,
save export, and disposal. The runtime cutover must then make this service the
only block authority; `ChunkWorld` may remain a rendering/cache adapter but
must not independently accept edits. Physics consumes one immutable read page
per revision, never synchronous per-cell Wasm calls.

World/load integration must obey this order:

1. initialize the address and import the validated current compatibility save;
2. install regenerated or cache-validated sections in bounded batches;
3. route every edit through `mutate` and immediately hide changed presentation
   cells using its returned event;
4. refresh read pages only when their identity changes;
5. cancel/evict section work before unloading, and dispose the worker on world
   switch or session shutdown.

Run the native fixture/benchmark hook after workspace integration:

```text
cargo run -p blockwild-authority --example r4_benchmark --release
```
