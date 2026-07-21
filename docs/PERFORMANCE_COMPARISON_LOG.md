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

## Next comparable capture

Use the same hardware and settings as `2026-07-21T17-37-01-753Z`, traverse a similar 450-500-block route for roughly two minutes, break grass and ordinary blocks, fell several trees, and include a settled 20-second stop. The acceptance readout is: current chunk never missing; p95/p99 and long-frame ratio no worse; visible action response within one presented frame; materially fewer merge submissions, transfer bytes, stale merges, and geometry creations per minute; and settled terrain submissions at or below the prior browser baseline.

## Commands

```text
npm run analyze:performance -- <blockwild-performance.json>
npm run benchmark:player-edits
npm run benchmark:streaming
npm run benchmark:simulation
npm run benchmark:spatial
```
