# blockwild-simulation

Renderer-free deterministic kernels for migration phase R5. The crate accepts
complete immutable pages and coarse job batches; it never calls JavaScript once
per block, voxel, body, ray step, path node, or atmosphere cell.

## Authority status

This is an **integration-ready pure-kernel surface**, not a runtime promotion.
The shipping TypeScript engine remains authoritative. No Wasm facade, Worker
route, save schema, multiplayer rule, renderer, or production selector is
changed by this crate. R5 cannot be called promoted until the shared wire layer
packs these DTOs, differential browser replays pass, end-to-end latency is
measured, and Noah manually approves control feel.

## Implemented stages

1. **R5-A: contracts and safety.** Revision-bound world identities, snapshot
   hashes, tamper validation, exact mutation/residency/load-boundary staleness,
   bounded inputs, canonical result hashes, and unloaded-as-solid physics.
2. **R5-B: player and vehicle kinematics.** Swept player collision, legacy
   swimming/oxygen/shore exit, external impulses, exact hit-hop knockback,
   creative flight, gravity profiles, mounts, and the legacy two-seat sailboat
   controller.
3. **R5-C: shapes and contacts.** Packed collision overrides for partial-height
   treads, exact door/gate slabs, deterministic stair stepping, voxel DDA,
   ray/AABB sweeps, continuous projectile world/entity contacts, and stable tie
   rules.
4. **R5-D: bounded world jobs.** FIFO liquid frontiers, packed deterministic A*,
   and a stable layered 3D broadphase. Caller insertion order cannot change
   authoritative result order.
5. **R5-E: atmosphere.** Safety-biased AirZone topology for vents and airlocks,
   mandatory unknown-boundary leaks, and integer-only gas composition,
   pressure, vent/airlock transfer, pump direction, and vacuum loss.
6. **R5-F: evidence.** Native/Wasm-compatible unit coverage, checked
   30/60/120-Hz cross-language replays, negative/chunk-edge cases, native
   allocation-inclusive microbenchmarks, and a deterministic fixture verifier.

## Public batch surface

- `step_physics_batch`
- `step_creative_flight_batch`
- `apply_knockback_batch`
- `sweep_horizontal_step_batch`
- `step_mount_velocity_batch`
- `step_sailboat_batch`
- `step_liquid_frontier_batch`
- `find_path_batch`
- `solve_air_zones_batch`
- `equalize_gas_fixed_batch`
- `raycast_voxel_batch`
- `sweep_projectile_contacts_batch`
- `run_broadphase_batch`

The lower-level single-job functions remain available for native tests and the
future integrated authority thread. Boundary adapters should use the batch
surface.

## Exact ABI checklist for integration

The R5 wire implementation must satisfy all of the following before it can call
these kernels authoritative:

- Carry `SIMULATION_PROTOCOL_V1` and `SIMULATION_SCHEMA_V1` in every envelope.
- Carry job ID, sequence, universe/location, epoch, mutation, residency, world
  hash, and source snapshot hash. Reject a result unless
  `classify_simulation_freshness` returns `Current`.
- Encode fixed-width little-endian fields. Floats remain IEEE-754 binary64 for
  initial legacy movement parity; gas quantities, pressure, topology revisions,
  tick/delta values, flags, IDs, and budgets are integers.
- Pack world streams in x-fastest, then z, then y order: loaded mask, boundary,
  block ID, facing, liquid kind, liquid level, and flags. Validate the complete
  snapshot hash before work begins.
- Pack collision overrides once per window in strict `CellPos` order. Each cell
  carries zero to eight local AABBs; zero explicitly means non-colliding. Do not
  make a JS callback for doors, stairs, furniture, or collision heights.
- Pack path occupancy, atmosphere cells, broadphase entities, projectile targets,
  and liquid frontier positions as whole typed pages. Enforce the public maximum
  constants before allocating.
- Preserve canonical ordering: liquid `+X,-X,+Z,-Z,+Y,-Y`; path
  `+X,-X,+Z,-Z` then elevation `0,+1,-1`; AirZone
  `-X,+X,-Y,+Y,-Z,+Z`; DDA ties `X,Y,Z`; stable entity/job IDs break remaining
  ties.
- Treat missing/unloaded physics cells as solid and missing/unloaded atmosphere
  boundaries as unsafe leaks. A residency revision change invalidates every
  result derived from the old loaded halo.
- Return one owned result batch with an explicit byte length and release rule.
  JavaScript must not retain Wasm pointers across memory growth.
- Keep TypeScript authority and Rust shadow hashes until exact replay, Worker
  restart, stale-result, browser Wasm, save, multiplayer, and input-latency gates
  pass. Runtime promotion is a separate change and authority-ledger update.

## Reproducible evidence

From the repository root:

```powershell
node scripts/verify-rust-simulation-r5.mjs
node scripts/verify-rust-simulation-r5.mjs --benchmark
cd engine
cargo test -p blockwild-simulation
cargo clippy -p blockwild-simulation --all-targets -- -D warnings
cargo check -p blockwild-simulation --target wasm32-unknown-unknown
```

The checked golden is
`tests/fixtures/rust-engine/r5/simulation-golden-v2.jsonl`. The TypeScript
oracle is `tests/rust-simulation-golden-r5.test.ts`.

Benchmark timings are deliberately reported as allocation-inclusive native
microbenchmarks. They prove deterministic work and guard gross regressions; they
do **not** prove browser speed, Worker round-trip cost, input latency, end-to-end
frame improvement, or production-promotion readiness.

## Remaining integration gates

- Shared runtime/Wasm codecs do not yet expose these new R5 DTO streams.
- The normal browser game still executes TypeScript physics/liquids/navigation.
- Collision override packing must be derived from the canonical content registry
  and differentially checked against every exceptional legacy block shape.
- Projectile target pages and gas network links need authoritative runtime
  extraction and revision ownership.
- 30/60/120 native/TypeScript goldens pass locally, but actual browser Worker
  replay, crash/restart, multiplayer, control-latency, and manual feel approval
  remain required.
- R5 renderer companion work (water/ice/lava/fog/pressure cues, transparent
  ordering, and mount/vehicle interpolation) belongs to the renderer workstream
  and is not claimed complete here.
