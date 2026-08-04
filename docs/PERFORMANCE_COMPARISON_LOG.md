# Blockwild performance comparison log

This is the tracked, append-only measurement ledger for Blockwild performance work. It complements [`PERFORMANCE_OVERHAUL_MASTER_PLAN.md`](PERFORMANCE_OVERHAUL_MASTER_PLAN.md): the plan records architecture and gates, while this file records what was actually measured, on which build, and what remains uncertain.

## Measurement rules

- Compare browser captures only when hardware, browser, route, settings, duration, and warm/cold state are comparable.
- Report readiness, queue debt, geometry churn, and visual completeness beside FPS. A fast frame that omitted the current chunk is a failed frame.
- Node benchmarks are deterministic engineering probes, not substitutes for hardware-GPU playtests.
- Keep regressions and ambiguous outcomes in the log. Do not discard a result because it weakens the narrative.
- For player actions, measure input to mutation, mutation to stale-geometry removal, mutation to local presentation, proxy ordering, and eventual consolidation separately.

## Historical browser captures

These captures were supplied during the July optimization sequence. Earlier logs used evolving telemetry and routes, so the table establishes direction rather than an apples-to-apples leaderboard.

| Capture | Weighted frame | Simulation | Chunk work | Final draws | Final geometries | Interpretation |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `2026-07-20T02-51-54-008Z` | 33.11 ms | 3.46 ms | 17.41 ms | 1,120 | 4,193 | Original high-cost streaming baseline. |
| `2026-07-20T05-14-07-674Z` | 15.69 ms | 3.23 ms | 5.30 ms | 1,258 | Large CPU/streaming improvement, but submission count remained high. |
| `2026-07-21T07-34-55-181Z` | 26.69 ms | 4.24 ms | 5.25 ms | 156 | 1,287 | Incomplete-scene capture; low draws are not a valid win by themselves. |
| `2026-07-21T17-37-01-753Z` | 10.80 ms | 2.18 ms | 2.05 ms | 313 | 1,306 | Player chunk stayed ready; this became the baseline for the player-feedback pass below. |

### July 21 browser baseline detail

The schema-v2 analyzer reports 123.873 seconds, 124 non-overlapping windows, and 479.44 blocks of travel. Weighted p95/p99 frame times were 16.52/33.43 ms, long frames were 0.737%, active CPU was 8.76 ms, render submission was 4.53 ms, and sampled GPU time was 3.23 ms.

The remaining structural cost was clearer than the average frame time: 10,935 terrain-merge submissions, 1.109 GB of transferred terrain buffers, 1,022 stale merges, 12,000 created geometries, and 14,275 disposed geometries during the capture. The final occupied 3 x 3 ring was 9/9 ready, but the oldest reported near job was 52.26 seconds. Those figures motivated stable-source consolidation, stale-debt reconciliation, and explicit interaction telemetry.

## 2026-07-21 player-first terrain pass

Comparison commits: exact pre-change detached worktree at `096914c`; after-change working tree based on the same commit. Both Node runs used v24.11.1, render distance 2, 720 frames per pass, and the same process invocation.

| Deterministic streaming metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Cold average update | 5.5944 ms | 5.5945 ms | effectively flat |
| Cold installation stage | 0.0825 ms | 0.0434 ms | -47.4% |
| Warm average update | 5.0750 ms | 5.0230 ms | -1.0% |
| Warm installation stage | 0.0595 ms | 0.0178 ms | -70.1% |
| Terrain merge submissions | 962 | 147 | -84.7% |
| Stale terrain merges | 39 | 2 | -94.9% |
| Live terrain geometry bytes | 27,883,180 | 23,461,256 | -15.9% |
| Weighted final queue debt | 63.98 | 13.60 | -78.7% |
| Final mid-ring readiness | 20/25 (80%) | 24/25 (96%) | +16 percentage points |
| Final submitted terrain meshes | 109 | 191 | +75.2% transient |

The last row is intentionally retained. The new system keeps section sources visible while a chunk still has dirty mesh or lighting work, then installs one current consolidated layer. This avoids intermediate worker merges and stale edited geometry, but a capture that ends mid-stream can temporarily submit more source meshes. The result is acceptable for this pass because readiness and debt improved sharply and merge churn collapsed; the next hardware-browser capture must verify that sustained draw submission settles rather than merely shifting cost.

Cold transition delay moved from 14.6 to 15.3 frames and the maximum from 27 to 29 frames; warm maximum moved from 2 to 3. These small regressions are also retained and should be rechecked in repeated runs before attribution.

### Direct player-action probe

`npm run benchmark:player-edits` performs 32 alternating break/place operations and one six-block tree removal through the production `ChunkWorld` edit path, beginning each action from current consolidated terrain and settling it afterward.

| Metric | Result |
| --- | ---: |
| Input to mutation p95 | 0.032 ms |
| Mutation to stale-geometry removal/local mesh p95 | 3.10 ms |
| Local mesh to final consolidated layer p95 | 0.216 ms |
| Tree proxy after stale standing geometry | 0.052 ms |
| Pending interaction consolidations at end | 0 |
| Stale merge results | 0 |

These Node timings establish ordering and a low-cost local path; they are not claims about end-user display latency. Schema-v2 browser telemetry now exports the same action phases for real play sessions.

## Changes represented by this entry

- Immediate break/place/tree edits detach stale combined layers inside the edit transaction and reveal the rebuilt source section before deferred seams and lighting complete.
- Consolidation is layer-specific, coalesces revisions, waits for stable source meshes and lighting, and refuses to install stale worker output.
- Queue-age telemetry removes canceled generation, mesh, and lighting timestamps instead of reporting ghost debt.
- Chunk, section, and combined-terrain transforms are frozen after placement.
- Mob spatial records update in place inside unchanged hash cells; scale-dependent attachment lookup is cached; expensive habitat work is rotated through a bounded sub-millisecond slice.
- Performance-log analysis now includes p95, p99, long-frame ratio, merge/transfer/geometry deltas, coalescing, invalidation, and player-action phases.

## 2026-07-21 sustained-rendering follow-up and v1.8.9

The supplied `2026-07-21T18-51-21-933Z` capture covered 808.51 blocks over 220.70 seconds on the player's browser. It confirms that the player-feedback pass removed most wasteful merge churn while also exposing a sustained submission problem.

| Metric | Earlier browser baseline | Supplied follow-up | Interpretation |
| --- | ---: | ---: | --- |
| Weighted frame interval | 10.80 ms | 13.68 ms | Not directly comparable: the follow-up route was 69% longer. |
| p95 / p99 frame interval | 16.52 / 33.43 ms | 18.86 / 26.68 ms | Better tail maximum, slightly worse p95. |
| Terrain merges per second | 89.0 | 11.45 | 87.1% less merge traffic. |
| Terrain transfer per second | 9.03 MB | 1.91 MB | 78.8% less transferred geometry. |
| Stale merge fraction | 9.27% | 0.12% | 98.7% lower. |
| Geometry creations per second | 97.9 | 51.8 | 47.1% lower. |
| Final terrain submissions | 313 | 687 | Too many independent section sources remained visible. |
| Immediate ring | 9/9 | 9/9 | Occupied and adjacent chunks stayed present at export. |

The capture's eight player edits all hid stale geometry within 9.7 ms, and five falling-tree proxies followed within 0.7 ms. However, local-to-consolidated p95 reached 9.11 seconds, 185 visible section meshes remained beside 502 combined meshes, and the oldest valid nearby job reached 73.97 seconds. These measurements motivated the narrower v1.8.9 pass rather than another broad architecture change.

v1.8.9 makes edit invalidation material-layer specific, allows a stable render layer to consolidate while an unrelated layer is still dirty, prioritizes immediate-ring and high-source-pressure consolidation, and gives old valid mid-ring work bounded promotion without allowing it to pass the immediate ring. The deterministic player-action probe now records a 5.31 ms stale-hide/local-presentation p95, 0.327 ms local-to-consolidated p95, zero pending transactions, and zero stale results across 32 edits and one tree fall.

The falling-tree dark-front defect was reproduced as an invalid intermediate lighting state: a resumable full relight zeroed its private light buffer, then marked sections dirty while breadth-first propagation was only partly complete. v1.8.9 no longer exposes partial full-relight writes; the finished light field is published in one mesh refresh. Incremental boundary reconciliation still publishes normally. Falling foliage now uses the same alpha-tested, depth-writing cutout contract as standing leaves, eliminating a second directional blended-depth footprint.

An automated 431.11-block Chromium route followed by a 20-second stop exercised production streaming without page or console errors and kept the immediate ring 9/9 ready. During the stop, combined layers rose from 47 to 75, visible section sources fell from 300 to 292 despite additional terrain finishing, consolidation debt fell from 182 to 159 queued layers, and mesh debt fell from 201 to 131 sections. Absolute FPS from this run is deliberately excluded because the audit browser uses SwiftShader rather than the player's hardware GPU. A manually reviewed deterministic tree-fall sequence showed uniformly lit ground before and after the proxy, with no moving directional dark region.

## Next comparable capture

Use the same hardware and settings as `2026-07-21T18-51-21-933Z`, traverse a similar route, break grass and ordinary blocks, fell several trees, and include a settled 20-second stop. The acceptance readout is: no directional tree-fall darkness; current chunk never missing; p95/p99 and long-frame ratio no worse; visible action response within one presented frame; materially fewer visible section sources and final terrain submissions; old valid nearby work no longer accumulating without bound; and no regression in merge submissions, transfer bytes, stale merges, or geometry churn per minute.

## 2026-08-03 render-object, worker, and ice-media pass

The supplied `2026-08-03T18-44-34-637Z` schema-v2 capture covered 452.79 blocks over 145.26 seconds. It averaged 43.52 ms/frame (about 23 FPS), with 97.84% long frames, 18.11 ms measured active CPU, 8.75 ms chunk work, 4.35 ms render submission, and 3.56 ms mob simulation. Its generation worker submitted two jobs, failed both, and disabled itself. Final scene pressure reached 1,277 draws, 2,007 geometries, and 439,182 triangles; the run created 1,705 and disposed 841 terrain geometries while the oldest nearby job reached 149.1 seconds.

This pass makes CPU reserve an upper allowance instead of a hard streaming floor; restores a versioned, bounded 2-4-worker graph with structured failures and fallback; shares immutable creature geometry; adds one instanced distant-wildlife batch per species; moves water animation from whole-atlas CPU uploads to a shader phase; separates water from depth-writing translucent ice; and captures true session histograms plus complete post-render/HUD timing. Autosave runs through bounded idle work and the visual HUD/catalog paths are rate-limited independently.

The exact production browser completed 29-31 generation jobs and seven terrain-buffer jobs in each frozen-lake viewpoint with two ready generation workers, zero failures, and zero restarts. Its manually reviewed above-water and underwater scenes have no doubled water/ice interface, striped overlap, air seam, or page/console error artifact. SwiftShader renderer counts (roughly 100 peak draws and 60 geometries in the isolated scene) are useful structural evidence but are not a replacement for the player's hardware route.

The new deterministic scenario suite reports:

| Scenario | Average | p95 | Maximum |
| --- | ---: | ---: | ---: |
| Stationary settled | 6.70 ms | 9.71 ms | 51.41 ms |
| Continuous walk | 6.55 ms | 9.08 ms | 15.52 ms |
| Continuous sprint | 6.11 ms | 7.73 ms | 31.53 ms |
| Dense 360-degree traversal | 6.66 ms | 9.87 ms | 19.05 ms |
| Frozen boundary edits | 12.54 ms | 22.25 ms | 22.55 ms |
| Settlement traversal | 6.98 ms | 11.30 ms | 95.72 ms |
| Large-cavern traversal | 7.05 ms | 10.65 ms | 33.09 ms |
| Player-edit burst | 6.12 ms | 9.78 ms | 11.95 ms |
| 100-creature LOD/broadphase | 0.067 ms | 0.125 ms | 4.30 ms |

The 100-creature case ends as one active batch with 128 allocated instance slots. These Node results establish deterministic CPU and queue behavior; a comparable schema-v3 player capture remains required before claiming the 1080p FPS, true session p95/p99, GPU heap, or ten-minute hardware acceptance targets.

## 2026-08-04 deployment-parity diagnosis

The supplied `2026-08-04T01-23-57-982Z` capture is a schema-v2 run from the pre-overhaul runtime, not a result from the schema-v3 build above. It averaged 43.76 ms/frame (about 22.9 FPS), with a 62.82 ms weighted p95, 105.78 ms weighted p99, and 95.98% long-frame ratio. Measured active CPU was 20.24 ms: 8.09 ms chunk work, 5.70 ms render submission, and 4.96 ms mob simulation. Frame time correlates most strongly with render submission (0.880), draw calls (0.784), geometry count (0.709), loaded chunks (0.669), creature count (0.664), and mob simulation (0.590). The generation worker again submitted two jobs, failed both, and disabled itself; the run ended at 803 draws, 2,544 geometries, 141 creatures, and a 99.5-second oldest-near-job age.

Exact-runtime probes established why. `blockwild.app` still exposed the legacy worker diagnostics and reproduced the two-failure disable path, while the same scene on the current Sites deployment started two ready generation workers, completed 31 jobs, and recorded zero failures or restarts. Vercel had received GitHub commit `53c2756`, but its production build failed inside Webpack `RealContentHashPlugin` after restoring a stale compiler cache that referenced a removed asset. The domain therefore remained on the last successful pre-overhaul deployment.

The release fix clears only `.next/cache` through a canonicalized, workspace-bounded script before Vercel compilation. Performance exports now include commit SHA, runtime origin, deployment channel, telemetry schema, and worker protocol revisions; the analyzer reports those fields and explicitly warns on legacy captures. This prevents a stale endpoint from being mistaken for a failed optimization pass. Further engine retuning is intentionally deferred until a schema-v3 hardware capture from the synchronized endpoint: changing budgets against this old run would confound release failure with runtime behavior.

## Commands

```text
npm run analyze:performance -- <blockwild-performance.json>
npm run benchmark:player-edits
npm run benchmark:streaming
npm run benchmark:simulation
npm run benchmark:spatial
npm run benchmark:performance-scenarios
```
