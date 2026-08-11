# Blockwild entity authority

`blockwild-entity` is the renderer-neutral R6 authority for active creatures,
dormant ecology, stable identities, and creature render extraction. It contains
no Three.js, browser, WebGPU, audio, or persistence handles and builds for both
native Rust and `wasm32-unknown-unknown`.

## Owned contracts

- Generational `EntityId` allocation with stale-handle rejection and explicit
  import of existing identities.
- Atomic, revisioned entity command batches and ordered events. There is no
  public mutable entity escape hatch: spawn, removal, residency, motion,
  component, ownership, care, equipment, and dormant-summary changes all pass
  through `EntityAuthority::apply_batch`.
- Typed, bounded hot and cold components cover vitals/environment, locomotion,
  actions/cooldowns, AI intent/blackboard/routes/threats, social/follower/herd
  state, mount seats, protection provenance, network leases, care, husbandry,
  work, equipment, dragons, legendary encounters, summons, and sentient people.
  Unknown authored components remain byte-exact in a bounded extension map.
- Hot simulation records and lossless cold records. Compatibility data retains
  specimen and external IDs, variants, names, ownership, bond progress,
  equipment, research, faction/settlement links, and extensible authored data.
- Deterministic XZ and 3D broadphases, bounded sensing, mass-aware separation,
  follower formations, and herd/shoal steering.
- Staggered hero/nearby/coarse/dormant scheduling. Entity, ecology, and path
  work use immutable generation/revision/epoch/deadline tokens; stale worker
  results cannot update recycled slots or superseded routes.
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

## Persistence and hydration ABI

The crate exposes two canonical little-endian binary contracts:

- `encode_compatibility_record` / `decode_compatibility_record` use the `BWEC`
  magic and preserve the complete legacy schema-1 record, including UTF-8 map
  keys and values. `Spawn`/`SpawnAt` import those records without rerolling a
  specimen or remapping an explicitly supplied generational ID;
  `compatibility_record` exports the exact compatibility shell.
- `encode_entity_authority_snapshot` / `decode_entity_authority_snapshot` use
  `BWEA` schema 2. The snapshot owns the authority revision and last sequence,
  complete slot/generation table, exact free set, hot/cold residency, component
  state, per-entity revisions, typed dormant deadlines, and compatibility
  records. Decoding is bounded and all-or-nothing. It rejects truncation,
  trailing bytes, invalid UTF-8/tags/floats, duplicate IDs or keys, zero/live
  generations, mismatched free sets, stale tombstones, divergent protection
  mirrors, and over-limit collections. A successful decode re-encodes to the
  exact same bytes.

The R8 browser hydration adapter should read and verify a complete `BWEA`
payload before replacing its current authority. `BWEC` is the legacy import and
compatibility-export surface, not a second live authority. Wiring those calls
through the Wasm/runtime envelope remains a separate integration step.

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
