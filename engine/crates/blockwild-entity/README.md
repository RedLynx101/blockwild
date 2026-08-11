# Blockwild entity authority

`blockwild-entity` is the renderer-neutral R6 authority for active creatures,
dormant ecology, stable identities, and creature render extraction. It contains
no Three.js, browser, WebGPU, audio, or persistence handles and builds for both
native Rust and `wasm32-unknown-unknown`.

## Owned contracts

- Generational `EntityId` allocation with stale-handle rejection and explicit
  import of existing identities.
- Atomic, revisioned entity command batches and ordered events.
- Hot simulation records and lossless cold records. Compatibility data retains
  specimen and external IDs, variants, names, ownership, bond progress,
  equipment, research, faction/settlement links, and extensible authored data.
- Deterministic XZ and 3D broadphases, bounded sensing, mass-aware separation,
  follower formations, and herd/shoal steering.
- Staggered hero/nearby/coarse/dormant scheduling.
- Current natural-population pools and cost budgets, ecology pressure recovery,
  deterministic spawn admission, range despawn/sleep decisions, crafted-fence
  enclosure scans, breeding pairs, and bounded dormant-time advancement.
- Declarative articulated model graphs with validated parentage, materials,
  animation channels, authored LOD membership, and renderer-neutral hero,
  articulated-batch, and silhouette extraction DTOs.

Protection is explicit and composable. Tamed, owned, ever-led, crafted-fence
enclosed, named, POI-resident, legendary, grounded-summon, faction-resident, and
actively following creatures can all be protected without species-specific
despawn checks. Closed fence gates are barriers supplied to the bounded
enclosure scan; open gates are passable cells.

## Determinism and validation

The checked 100-creature fixture is stored in
`fixtures/entity-100-v1.txt`. The native runner also exposes an elapsed-time
sample without mixing timing into the deterministic checksum:

```powershell
cargo fmt -p blockwild-entity -- --check
cargo clippy -p blockwild-entity --all-targets -- -D warnings
cargo test -p blockwild-entity --all-targets
cargo check -p blockwild-entity --all-targets --target wasm32-unknown-unknown
cargo run -p blockwild-entity --release --bin entity_fixture
```

Runtime adapters should pass coarse command and extraction batches. They should
not call the crate once per model part or block, and should never let a renderer
or UI mutate authoritative records directly.
