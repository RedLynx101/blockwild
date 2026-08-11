# Hybrid Rust Migration Implementation Log

This is the execution companion to [HYBRID_RUST_ENGINE_MIGRATION_MASTER_PLAN.md](./HYBRID_RUST_ENGINE_MIGRATION_MASTER_PLAN.md). It records evidence, authority state, and design changes discovered during implementation. A native crate or passing fixture is not called production authority until its browser worker, persistence, rollback, and visual gates pass.

## Evidence baseline

- Baseline source: `work/hybrid-rust-migration/performance/before-summary.json`
- Five-run, ten-scenario p95 geometric mean: **5.0025106503 ms**
- Required final comparison: same evaluator, hardware, settings, randomized/interleaved repetitions, all correctness guardrails, normalized aggregate no worse than `0.9925`, and no scenario above `1.05x` without an explicit reviewed architectural tradeoff.
- Visual oracle: Three.js canonical fixtures and manually reviewed R0/R2 captures. SwiftShader timing is capability/visual evidence only, never hardware-performance evidence.
- Completion auditor: `node scripts/audit-rust-migration.mjs` produces the machine-readable R12 blocker inventory. Its first run intentionally reports 32 unchecked definition-of-done items, 32 unpromoted authority rows, 21 normal-path Three.js imports, six missing integrated-runtime Wasm exports, and nine open implementation gates. `--strict` becomes a release gate only after those counts reach zero; changing the auditor to hide a blocker is not a valid implementation.

## Validated checkpoints

| Phase | Implemented evidence | Production authority at this checkpoint |
| --- | --- | --- |
| R0 | pinned Rust/Wasm workspace, BWEP v1 worker lifecycle, content-addressed artifacts, browser/native `wgpu` smoke, engine lab, CI | TypeScript/Three.js remain default |
| R1 | native/Wasm/TypeScript coordinate, UTF-16 seed, `Math.imul`, spatial, replay, and hash fixtures | Rust shadow laboratory only |
| R2 | BWR2 registry, whole-section Rust meshing/lighting, exact Three installer, WebGPU audit path, 325-sample differential, edit/stale/crash recovery | promoted only for exact known-content sections; unknown revisions fail whole-section to the oracle |
| R3 | V2 generation contract and renderer-free worker boundary | TypeScript generator oracle until complete byte-parity service promotion |
| R4 | revisioned world DTO, atomic edit contract, immutable near-field page; native store in progress | TypeScript `ChunkWorld` remains authoritative |
| R5 | native collision/swimming/liquid/projectile/mount/path/AirZone kernels; 17 tests | not promoted until Wasm/runtime input replays pass |
| R6 | native entity IDs, residency, broadphase, ecology, spawning/protection, model graphs; 28 tests | not promoted until save import and live entity adapter pass |
| R7 | native inventory/machines/combat/capture/progression/Cardforge authority; 20 tests | not promoted until live commands share the Rust path |
| R8 | native journal/checkpoint/migration/repair crate and inspector; browser IndexedDB transaction adapter; stable world sharding | browser journal is primary for menu loads, but Rust validation must still enter the Wasm commit path |
| R9 | native multiplayer/agent authority, codecs, leases, interest, reconnect, fuzz/replay; 18 tests | not promoted until host WebRTC commands traverse the Rust validator |
| R10 | renderer-neutral resource deltas and frame records cover terrain, articulated instances, props, machines, projectiles, vehicles, particles, camera, fog, underwater and cave state | extraction contract validated; integrated `wgpu` scene and live producer still in progress |
| Integration | `IntegratedRuntimeV2` composes generation, complete world/chunk metadata, entities, gameplay, persistence, simulation jobs, and network validation behind one deterministic handle; cross-domain batches are clone-and-commit atomic | native authority proven; browser/Wasm command codecs and live cutover remain required |

## Non-reducing design changes

### Content-addressed Wasm publication

The plan allowed either deploy-time Rust builds or committed deterministic artifacts. Vercel and Sites did not have a verified pinned Rust toolchain, so production uses immutable `public/engine/<sha256>/` packages selected by a small manifest. CI rebuilds and rejects drift. This adds a reproducible supply-chain gate; it does not reduce engine scope.

### Separate authority crates before aggregation

World generation, world storage, simulation, entities, gameplay, persistence, and network authority are separate crates with narrow deterministic contracts. A final runtime crate will compose them behind one worker handle. This makes differential testing and native tools possible without coupling browser APIs into the engine.

### Near-field read pages at the R4/R5 boundary

Moving blocks to a worker while retaining synchronous TypeScript collision would otherwise create per-voxel messaging. R4 therefore publishes immutable revisioned near-field pages, and R5 consumes coarse pages/jobs. The mirror is read-only and expires when Rust physics becomes authoritative; it is not a second writable world.

### BWR2 generated material registry

The initial R2 material wire encoded specialty blocks as a bare tag without layer, tile, shape, solidity, dampening, or emission data. R2 now ships a generated BWR2 material/shape registry covering all 312 current visible definitions, with content and geometry revisions at the worker boundary. Unknown IDs or registry revisions reject the whole section to the exact TypeScript oracle; broad tolerances and partial double emission remain forbidden. The final differential covered 312/312 definitions plus 13 seam, fluid, and generated scenarios (325 samples, zero mismatches, 5.88 ms p95), and browser validation covered shadow, promotion, immediate revisioned edits, deliberate crash fallback, restart, and exact recovery.

### Browser journal compatibility window

IndexedDB journal records and the head checkpoint commit atomically. The existing localStorage document remains a readable, full emergency source during migration and is never deleted before semantic readback. Journal-backed menu loads are primary; synchronous legacy engine call sites remain a bounded compatibility path until R12 converts them or removes them. This is the plan's protected migration sequence, not indefinite dual authority.

### Resource-delta render extraction

The final renderer protocol separates durable GPU resources from lightweight frame presentation. Geometry and materials are uploaded or removed by stable ID and revision; frames carry camera/environment state, hierarchical instance transforms, particles, and the exact resource revision they require. The renderer may discard an obsolete presentation epoch, but it cannot skip reliable resource changes or infer gameplay state. This avoids resending terrain and authored geometry every frame and gives Three.js and `wgpu` one comparison boundary.

### One generated browser/native command schema

The early R5-R9 TypeScript DTOs and native Rust crates were deliberately built as independent safety contracts. That exposed naming and hash-domain drift before authority promotion: a pair of locally valid command models is not a production protocol. Live cutover therefore requires one generated or byte-tested wire schema per domain, with TypeScript fixture bytes decoded by native and Wasm code and native receipts decoded by TypeScript. The integrated worker will not translate between two hand-maintained semantic models, and an injected fake-kernel test cannot satisfy this gate. This adds convergence work but removes a permanent source of multiplayer, save, and replay divergence.

### Full generated-chunk authority

The first R4 store contract held resident cells and authored edits but omitted height maps, biome columns, light streams, leaf/emissive indices, and structure markers. That would have made Rust unable to own maps, POIs, lighting publication, or exact cache/save regeneration. The store now retains a validated, renderer-independent auxiliary record per resident chunk and includes it in its canonical state hash. It remains disposable generated state—authored edits stay in the durable journal—but it is no longer silently dropped at the R3/R4 boundary.

### Cached authority digests and section-spanning read pages

The first integrated runtime recomputed every resident cell and every generated chunk stream whenever a command requested the canonical root, and its immutable simulation-page capture performed a tree lookup plus string-key allocation per cell. Both were correct but would have moved avoidable work into the fixed-step path. Resident sections and chunk auxiliary records now cache canonical content digests that are refreshed only on installation or mutation. Page capture walks contiguous section-row spans, resolves each resident section once per span, records each revision once, and validates its structure before hashing once. On the same release benchmark with 300 resident sections, 500 captures of 49,152 cells fell from **24,775 ms** to **1,700 ms** (**14.57× faster**), while 10,000 authoritative edits remained **505 ms** total and all page, save, delta, and replay oracle hashes stayed unchanged. This is an internal representation optimization; it does not relax validation or create a writable mirror.

The combined-runtime benchmark then exposed three additional linear costs: cloning the complete runtime for a one-domain command, rebuilding the entire authored-edit digest, and replaying up to 8,192 history entries into every fixed-step hash. Single-domain commands now use each domain's already-atomic transaction directly; multi-domain batches clone only the domains they touch and publish them only after every stage accepts. Authored edits and replay entries use incrementally maintained canonical digests, repeated root reads use an invalidation-safe cache, and a prevalidated generated chunk installs without cloning all resident chunks. On the same 108-section fixture, nine generation/install operations improved from **135.113 ms** to **118.330 ms**, 500 near-field pages from **1,433.110 ms** to **1,129.178 ms**, 10,000 integrated edits from **4,316.104 ms** to **1,766.615 ms** (**2.44× faster**), and 20,000 fixed steps from **19,110.151 ms** to **2,262.171 ms** (**8.45× faster**). Both runs ended at canonical hash `49ddb341b8fa86f0e069665df1fb01c4`.

## Open completion gates

- Promote the complete v18 generator with seed/chunk/POI byte parity and no `ChunkWorld` construction in its worker.
- Promote Rust world authority, then physics, entities, gameplay, persistence validation, and host/agent networking through coarse Wasm paths.
- Converge the independently authored R5-R9 TypeScript/Rust DTOs on one byte-tested generated schema before any domain becomes production authority.
- Complete renderer-independent extraction for every visible domain.
- Render the integrated game through `wgpu`, promote it on the supported WebGPU profile, and isolate Three.js into an explicit compatibility bundle.
- Remove authoritative state/rules from `engine.ts` and `world.ts`; keep only browser/UI/platform adapters.
- Pass full repository, replay, save corruption, multiplayer fuzz, browser interaction, visual matrix, device-loss, and performance gates.
- Record final before/after evidence and verify no owned test/server/browser process remains.
- Push one verified head to GitHub, Vercel, and Sites; verify exact commit and live aliases before completing the goal.
