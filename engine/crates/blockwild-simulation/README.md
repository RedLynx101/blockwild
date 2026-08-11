# blockwild-simulation

Deterministic, renderer-free R5 simulation kernels for Blockwild. The crate
consumes coarse immutable windows and returns whole revision-bound results; it
never calls JavaScript once per voxel.

The first authority surface contains:

- swept-axis player collision with unloaded cells treated as solid;
- the exact pure swimming, surface-bob, oxygen, and drowning state machine;
- bounded FIFO liquid propagation;
- bounded deterministic voxel A* with stable insertion ordinals;
- safety-biased air-zone topology for vents and airlocks;
- projectile/AABB continuous sweeps; and
- gravity and mount movement profiles.

All kernels use caller-provided budgets, canonical traversal order, and stable
output order. `fixture::canonical_fixture()` and `fixture::run_native_benchmark`
are native parity/performance hooks; neither changes authority state.

## Workspace integration

Add `crates/blockwild-simulation` to `engine/Cargo.toml` workspace members and
add `blockwild-simulation = { path = "crates/blockwild-simulation" }` to the
workspace dependencies. The Wasm facade may then depend on it through
`blockwild-simulation.workspace = true`.
