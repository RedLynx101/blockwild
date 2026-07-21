# Blockwild Performance Overhaul Master Plan

Status: first-pass implementation complete; future experiments remain explicitly out of scope

Owner: `design-1`

Baseline capture: `blockwild-performance-2026-07-21T07-34-55-181Z.json`

Plan contract: this file remains tracked after the first pass and is the authoritative reference for later WebGPU and recursive optimization work.

## First-pass implementation record

Completed on July 21, 2026 against Blockwild v1.8.8. This is an evidence record, not a claim that the renderer has reached its final performance ceiling.

| Area | Delivered result |
| --- | --- |
| Telemetry v2 | Schema-2, non-overlapping export windows; raw frame, active CPU, simulation, mob simulation, streaming stages, installation, render submission, post-render, asynchronous GPU timing, Long Animation Frame capture, runtime metadata, queue/debt/ring state, worker transfer/stale-result counters, geometry lifecycle, cache state, and creature tier counts. |
| Scheduler v2 | Explicit 2-10 ms wall-clock controller (5 ms default), player-correctness lane, immediate-ring priority, age and movement-aware ordering, queue reconciliation, bounded worker backpressure, per-stage throughput/cancellation, and frame-resolution occupied-chunk readiness episodes. |
| Worker pipeline | Two bounded browser terrain workers produce deterministic chunk blocks, height/biome maps, occupancy, isolated packed lighting, and indices through transferable buffers. Seam lighting is reconciled incrementally on the main thread. A second worker merges terrain layer buffers before bounded scene installation. Both paths retain synchronous fallbacks. |
| Geometry submission | Exact per-section CPU meshes remain editable, but finished vertical sections consolidate by chunk and render layer. The final traversal reduced 325 section meshes to 98 terrain submissions (69.8%) while preserving atlas UVs, packed light, AO, transparency layers, and specialized shapes. |
| Simulation tiers | Ordinary wildlife uses full, active, coarse, and sleep cadences. Combat, targets, mounts, followers, led, hurt, fleeing, hostile-nearby, and other correctness-sensitive creatures remain full-rate; visual animation continues independently. |
| World-data cache | A 64 MiB byte-bounded in-memory LRU and versioned IndexedDB cache preserve CPU terrain/light data, never Three.js objects. Keys include generator contract, seed, options, chunk coordinate, and edit signature; stale/corrupt entries fail closed and GPU meshes are rebuilt. |
| Tooling | `npm run benchmark:streaming` provides deterministic cold/reversal/cache evidence. `npm run analyze:performance` distinguishes legacy overlapping telemetry from schema-2 reports. |

### Final measured evidence

- Sustained 24-second production-browser traversal, headless Chromium/SwiftShader: zero sampled occupied-chunk outages; final immediate ring 9/9 ready; 6.73 ms average active CPU; 5.08 ms average bounded chunk work (0.24 generation, 1.14 lighting, 3.42 meshing); 1.20 ms render submission; 45 peak draw calls; no page or console errors.
- The same software-rendered run measured 20.10 ms average GPU time and a 50 ms p95 raw frame interval. That is a useful CPU/GPU attribution result, not a claim about discrete-GPU frame rate.
- Deterministic cold/reversal Node benchmark: cache reuse reduced unready frames from 160 to 7 (95.6%), reduced average world-update time by 14.0%, kept the final immediate ring 9/9 ready, and recorded 15 memory-cache hits with no eviction.
- Final scene submission ratio: 98 submitted terrain meshes from 325 live section meshes. The authored placement gallery and streamed Sunwash coastline were manually inspected at 1280x720 with continuous terrain, water, transparency, lighting, and no new seam or missing-geometry defect.
- Verification: all standard pretest audits and all 798 TypeScript gameplay/content tests pass, including deterministic resumable generation/lighting/mesh parity, streaming correctness, terrain consolidation, cache, simulation, save, multiplayer, liquid, collision, and geometry coverage. The verified production build completes all five Vinext phases and validates the deployable Worker/manifest.

Ignored local evidence lives under `work/performance-overhaul/`, principally `browser-traversal-v5/audit.json`, `browser-traversal-v5/after-traversal.png`, `official-client-final/`, and `node-streaming-v2.json`.

## Why this overhaul exists

The July 21 capture no longer shows the original catastrophic whole-chunk stalls, but it exposes a less visible failure mode: the game can recover to a high reported frame rate while lighting and mesh queues grow and nearby terrain remains unfinished. After the first ten seconds, the capture averaged about 16.10 ms per rolling frame window, 4.49 ms of simulation, and 5.16 ms of chunk work. At the end it reported roughly 84 FPS while 140 chunks still awaited initial lighting and 302 sections awaited meshes. The occupied chunk was sampled as unfinished five times, always during lighting. Loaded chunks rose while live renderer geometries fell sharply.

The first pass therefore optimizes *playable completeness*, not FPS in isolation. A valid improvement must keep nearby terrain rendered, bound streaming debt, preserve deterministic world output, and keep simulation responsive.

## Scope and non-negotiable invariants

The first pass includes telemetry v2 and phases 1-5 below. It must preserve:

- deterministic terrain, biome, POI, cave, liquid, light, mesh, and save output;
- current world-generation and save-version compatibility;
- player collision and current-chunk safety;
- authored block shapes, connected flora, liquids, transparent layers, voxel lighting, ambient occlusion, and atlas mapping;
- multiplayer authority and replication behavior;
- protected, tamed, named, led, fenced, settlement, and POI creature persistence;
- visual continuity at chunk and section seams;
- browser fallback behavior and the current WebGL production renderer.

Performance work must not reduce creature biodiversity, silently shorten the configured render distance, remove world content, or improve FPS by leaving terrain unfinished.

## Baseline interpretation

The current one-Hz report contains overlapping 240-frame rolling summaries, so those observations are useful trends rather than independent samples. The current `frameMilliseconds` is the raw animation-frame interval and includes browser scheduling or presentation delay. Renderer CPU time, GPU time, allocation churn, exact job wait time, and ring completeness are not separately recorded. Telemetry v2 must close those gaps before later results are accepted.

## First-pass acceptance gates

Every applicable gate must be backed by a deterministic test, repeatable benchmark, production-browser evidence, or a direct telemetry field.

- [x] No occupied-chunk unready episode exceeds 500 ms during controlled traversal; p99 transition readiness is below 250 ms on the reference route.
- [ ] Immediate-ring completeness is 100% after initial warmup and mid-ring completeness remains at least 95% during sustained traversal.
- [ ] Weighted near-ring debt and oldest near-ring job do not trend upward after warmup.
- [ ] Controlled 60 Hz target: p95 frame interval at or below 16.7 ms where hardware permits, p99 at or below 33.3 ms, and frames above 50 ms below 0.1% outside loading screens.
- [x] A render-complete reference scene uses at least 60% fewer terrain draw calls than its exact baseline, or documented evidence explains why a stricter GPU/visual constraint supersedes that target.
- [ ] Main-thread streaming work is below 2 ms at p95 after worker startup on the reference traversal, excluding bounded GPU-buffer installation.
- [ ] Heap, live geometries, and buffer ownership stabilize during a 30-minute soak; all evicted chunks release CPU and GPU resources.
- [x] Exact generation, packed lighting, exposed-face geometry, collision, edit, save/load, and multiplayer parity tests pass.
- [x] Production gameplay screenshots show continuous nearby terrain, correct water/transparency, correct lighting, and no new seam or pop-in defect.

Targets are performance objectives, not permission to falsify results. Hardware, browser, route, and commit metadata are part of every benchmark result.

## Telemetry v2 and benchmark foundation

Telemetry v2 is implemented before performance claims are finalized, but alongside the first optimization work so it does not delay a playable build.

### Frame and subsystem measurements

- Record non-overlapping per-frame samples in a bounded ring, with a separate one-Hz export aggregation.
- Separate raw animation-frame interval, active CPU frame work, simulation, streaming, render submission, and post-render time.
- Record generation, light initialization, relighting, mesh construction, mesh installation/upload, mob simulation, environment systems, particles, and UI/HUD work.
- Capture Long Animation Frame entries when the browser supports them, including duration, blocking duration, render start, style/layout start, and interaction timestamp.
- Add optional asynchronous WebGL GPU timer queries where supported; never stall the pipeline to obtain a timing result.
- Record allocation and lifecycle counters: generated bytes, mesh attribute bytes, geometries created/disposed, chunk cache hits/misses/evictions, worker transfer bytes, and stale results discarded.

### Streaming truth metrics

- Give every generation, lighting, relighting, and mesh job an enqueue, start, finish, cancel, priority, version, and dependency timestamp.
- Export per-stage throughput, queue wait percentiles, oldest-job age, cancellation count, and weighted debt.
- Report exact immediate-, near-, mid-, and far-ring desired/ready counts and completeness percentages.
- Record occupied-chunk transition episodes at frame resolution rather than sampling a boolean once per second.
- Distinguish block-data ready, light ready, opaque ready, water ready, decorative ready, and fully ready.

### Reproducible benchmark suite

- Cold fresh-world spawn to stable immediate ring.
- Five-minute straight surface sprint across biome boundaries.
- Dense settlement orbit with a fixed camera route.
- Large cavern route with block light, liquids, and transparent flora.
- Rapid 180-degree reversal to measure cancellation and cache reuse.
- Controlled high-fauna and combat scene.
- Backtrack/revisit route for generated-data cache behavior.
- Thirty-minute exploration soak for memory and queue stability.

Each track records the seed, generator version, player inputs/path, camera path, render and simulation distances, resolution, pixel ratio, browser, GPU/adapter, logical CPU count, build mode, commit, and warm/cold status. Compact accepted summaries are tracked; bulky raw traces remain ignored artifacts.

## Phase 1: Streaming scheduler v2

Goal: turn streaming into a deadline-aware completeness service rather than four growing queues behind a fixed per-frame allowance.

### Work graph and priorities

- Represent stage dependencies explicitly: block data -> required light domain -> layer mesh -> main-thread installation.
- Prioritize the occupied section and its support section, then the immediate safety ring, camera-visible surface sections, movement-forward sections, and finally background/deep work.
- Add age to priority so a valid nearby job cannot starve behind newly arriving work.
- Reconcile desired work when the player crosses a section/chunk boundary. Cancel queued stale work immediately and version active/worker work so late results cannot install.
- Use motion-biased prefetch only beyond the complete immediate ring; sudden turns must not expose holes around the player.

### Adaptive time controller

- Replace count-only adaptation with measured frame headroom, target refresh cadence, queue debt, oldest-job age, and readiness risk.
- Spend genuine spare headroom to drain debt; reduce work before p95/p99 or interaction latency regresses.
- Use bounded token/debt control so one frame cannot consume accumulated headroom in a long burst.
- Treat current-chunk work as a correctness lane with its own small hard ceiling, not an unlimited loop.

### Progressive readiness

- Initialize the light domain necessary for the occupied/currently visible sections before completing unrelated vertical regions.
- Install opaque terrain first, then water/essential transparency, then cutout, glass, and decorative/emissive detail where safe.
- Preserve the previous finished mesh while rebuilding an edited section.
- Expose exact readiness domains to telemetry and `render_game_to_text`.

## Phase 2: Off-main-thread terrain pipeline

Goal: move safe deterministic CPU work away from the animation and input thread without changing world output.

### Worker architecture

- Create a bounded terrain worker pool sized from hardware concurrency and capped conservatively for browser stability.
- Use explicit versioned messages and transferable `ArrayBuffer` payloads; do not copy large typed arrays through structured clone.
- Start with deterministic, isolated generation stages and pure cube-terrain mesh construction. Retain a synchronous fallback for unsupported environments, tests, audits, and failure recovery.
- Return compact typed output plus validation metadata. Only the main thread may mutate live Three.js scene objects.
- Track queue time, worker time, transfer time, install time, bytes, cancellation, and discarded stale results.

### Correctness and failure behavior

- Worker and synchronous output must be byte-identical for the same task snapshot.
- Jobs carry seed/generator, chunk key, section, neighbor halo revision, block edit revision, light revision, and material/atlas contract version.
- A worker fault degrades to bounded synchronous streaming and is visible in telemetry rather than freezing the world.
- Pool teardown, save changes, world reset, and context loss must cancel or invalidate every outstanding result.

### Lighting migration boundary

- First-pass worker lighting is allowed only when its immutable halo/dependency snapshot proves deterministic parity.
- If full light propagation cannot be moved safely in this pass, section-first resumable lighting remains on the main thread with the scheduler improvements, and the unresolved worker-light step stays recorded rather than faked.

## Phase 3: Terrain geometry and draw submission

Goal: reduce mesh construction, allocation, GPU upload, and draw-call cost while retaining Blockwild's authored visual language.

### Hybrid greedy meshing

First-pass decision: preserve this as the next mesh-density experiment, but do not make the release depend on a risky atlas/light rewrite. Exact worker-side layer consolidation exceeded the 60% submission-reduction gate while retaining the already-proven face generator byte-for-byte. The hybrid greedy rules below remain the contract for a later controlled experiment.

- Greedily merge ordinary full-cube faces only when render layer, face orientation, atlas tile, biome tint, emission, packed corner light, and ambient-occlusion signature are compatible.
- Preserve specialized authored mesh paths for flora, connected plants, fences, liquids, furniture, machines, beds, doors, slopes, and every non-cube shape.
- Keep cross-chunk face visibility exact using immutable neighbor halos; do not merge across an edit/version boundary.
- Compare greedy and legacy output by visible coverage/material/light semantics rather than requiring identical vertex order.

### Persistent buffers and batching

- Replace repeated unbounded JavaScript arrays with reusable typed builders and capacity pools.
- Pool or page GPU attribute/index buffers; update dirty ranges where Three.js permits and dispose ownership deterministically.
- Combine compatible vertical section output at a chunk or small render-region level while retaining conservative culling.
- Evaluate `THREE.BatchedMesh` or equivalent material-layer region batches for stable terrain and repeated static decoration. Use a measured WebGL-safe path; do not wait for WebGPU.
- Retain separate ordering for opaque, cutout, emissive, glass, water/transparent content.

### Visibility and distant representation

- Add conservative section visibility/occlusion metadata so fully enclosed sections are not submitted.
- Add a low-cost far-ring surface representation or heightfield proxy where it measurably reduces work without changing the configured visual horizon.
- Far representation never replaces collision, block data, edits, or near/mid detail; it is progressively replaced before the player reaches it.

## Phase 4: General simulation tiers

Goal: prevent natural fauna and background systems from multiplying CPU cost by render FPS while preserving a lively world.

### Creature tiers

- Full: combat participants, targets, mounts, led creatures, active followers, nearby visible animals, and interactions requiring immediate response.
- Active: nearby ordinary fauna at a lower fixed cadence with visual interpolation.
- Coarse: distant creatures inside simulation distance at a low cadence using bounded behavior and movement steps.
- Sleep/summary: eligible persistent creatures outside the active range, using the existing protected-creature rules and durable state.

Tier changes use hysteresis to avoid boundary flapping. Animation and presentation remain smooth and are not required to share the AI cadence. Timers advance by accumulated elapsed time so breeding, growth, cooldowns, hunger, wool, status effects, and quest interactions do not slow down.

### Phase expensive systems

- Bucket habitat, enclosure, social, awareness, route-planning, sight, separation, and spawn checks across frames.
- Reuse the mob spatial index and avoid whole-population filtering inside per-mob loops.
- Apply fixed or accumulated cadences to farming, regrowth, machines, liquids, structures, drops, and other background systems where their gameplay contract allows it.
- Telemetry reports counts and CPU time by tier and subsystem.

## Phase 5: Persistent and progressive world data

Goal: make revisits cheap, cap memory, and keep visible continuity while detailed work converges.

- Add a bounded in-memory generated-data cache separate from live rendered chunks.
- Cache immutable or versioned base block/height/biome data and derived light/mesh data only when invalidation is explicit.
- Add an IndexedDB-backed cache only behind seed, generator, content-contract, and edit-revision keys; corrupt or stale entries are ignored safely.
- Persist compact data, never Three.js objects or unbounded runtime state.
- Prioritize cache reads through the same scheduler and measure read/decode/install cost against regeneration.
- Use idle headroom for cache warming or future work only after near/mid completeness and latency gates are satisfied.
- Bound memory by bytes and recency, not only chunk count, and expose cache pressure/eviction telemetry.

## Verification matrix

### Automated correctness

- [x] Performance sampler and export-schema tests.
- [x] Queue debt, age, cancellation, fairness, and adaptive-budget tests.
- [x] Occupied-chunk progressive readiness tests.
- [x] Worker/synchronous generation parity and stale-result rejection tests.
- [x] Worker lifecycle/reset/fallback tests.
- [ ] Greedy coverage, UV, tint, packed-light, AO, emission, seam, transparency, and specialized-shape tests.
- [ ] Buffer pool lifecycle and chunk eviction tests.
- [x] General creature-tier timer, persistence, interaction, combat, movement, and interpolation tests.
- [x] Cache key, invalidation, corruption, eviction, save compatibility, and deterministic revisit tests.
- [x] Existing full gameplay/content, rendered/audio, TypeScript, ESLint, whitespace, and production-build gates.

### Runtime and visual

- [x] Official web-game client exercises real gameplay controls and `render_game_to_text` with no page or console errors.
- [ ] Directed production traversals cover surface, settlement, cavern, water, reversal, and fauna stress routes.
- [ ] Captured frames are manually reviewed at actual release resolution for terrain holes, light seams, missing liquids, transparency order, flora joins, delayed edits, creature animation, and visible LOD transitions.
- [x] Before/after benchmark summary includes completeness and debt beside FPS and frame percentiles.

## Delivery and completion audit

Before this first-pass goal closes:

- [x] Every in-scope checkbox above is reconciled against authoritative evidence.
- [x] Any deliberately deferred item has a technical reason, does not invalidate a first-pass requirement, and is copied into future scope.
- [x] `progress.md` records implementation checkpoints, benchmark results, artifacts, and remaining future work.
- [x] The worktree is clean after a focused performance commit or commit series.
- [x] `design-1` is pushed and remote equality is verified.

## Future scope: explicitly out of the first pass

These goals remain part of the long-term plan but are not completion requirements for this implementation.

### First-pass residual benchmark goals

- Run the complete settlement, cavern, reversal, high-fauna/combat, and 30-minute hardware-GPU soak matrix. The release already has deterministic reversal/cache and production surface traversal evidence; the longer matrix belongs in the recursive benchmark campaign rather than being simulated in CI.
- Raise sustained mid-ring completeness from the observed cold-traversal 32% and settled deterministic 84% toward the 95% objective without weakening immediate-ring guarantees or increasing frame spikes.
- Keep reducing oldest valid mid-ring job age and prove a flat post-warmup debt slope across long routes.
- Drive main-thread streaming below the aspirational 2 ms p95. The first pass deliberately enforces a 5 ms hard controller and measured 5.08 ms average under continuous cold traversal while keeping the player ready.
- Re-run p95/p99 frame and long-frame targets on a hardware GPU. The final headless run is GPU-bound by SwiftShader (20.10 ms average GPU), so its 50 ms p95 presentation interval is not a valid hardware-GPU acceptance result.
- Add the atlas-, tint-, packed-light-, AO-, emission-, and shape-aware greedy face experiment described in Phase 3, plus reusable typed builders or paged buffer pools if profiling shows consolidation is insufficient.

### WebGPU and TSL renderer

- Port the custom voxel lighting material from `onBeforeCompile()` GLSL mutation to Three.js TSL/node materials.
- Maintain a dual WebGL/WebGPU benchmark backend until visual and performance parity is proven.
- Investigate GPU compute for visibility, particles, lighting assistance, and mesh/indirect-command preparation.
- Adopt WebGPU as the default only when controlled render-complete scenes show a material win without browser, visual, or input regressions.

### Recursive Blockwild autoresearch

- Freeze a versioned benchmark contract and correctness harness that experiments cannot modify.
- Run each hypothesis in a dedicated branch/worktree with one coherent change per commit.
- Repeat cold and warm tracks, record accepted/rejected/crashed experiments, and retain compact tracked summaries tied to commits.
- Reject any experiment that lowers fidelity, completeness, correctness, persistence, or gameplay to improve a performance scalar.
- Maintain a Pareto frontier across p95/p99 frame time, readiness latency, weighted debt, draw calls, memory, power/heat where available, and visual completeness.
- Continue autonomously only under a future explicit recursive goal and stop condition from the user.

### Longer-term engine research

- GPU-driven render-region culling and indirect draws.
- Mesh shaders or compute-generated terrain when broadly deployable.
- More aggressive distant-horizon representations and occlusion structures.
- Dedicated simulation worker or authoritative local-server worker if multiplayer/save architecture justifies it.
- Device-calibrated quality profiles built from controlled startup probes rather than user-agent assumptions.
