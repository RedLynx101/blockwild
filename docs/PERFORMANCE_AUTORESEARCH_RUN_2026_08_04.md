# Blockwild performance autoresearch — 10-pass run

Run tag: `2026-08-04-frame-streaming-10`  
Base commit: `3b15bd9aa7f0ea69b3fac1c8c861e84e3d778db6`  
Branch: `codex/autoresearch-2026-08-04`  
Status: complete; ten of ten passes measured and committed

## Frozen contract

- **Objective:** improve player-visible Blockwild performance without reducing simulation, render distance, ecology, model fidelity, lighting, world correctness, persistence, or multiplayer authority.
- **Primary metric:** minimize the geometric mean of median p95 time across all ten deterministic `blockwild-performance-scenarios-v2` scenarios.
- **Repetitions:** five unchanged runs for the initial baseline; median of three runs for every pass; retained champion is rerun at midpoint and final validation.
- **Practical threshold:** retain at `normalizedScore <= 0.9925` against the current champion, with all hard gates passing. A smaller result is inconclusive unless it simplifies code at equal performance.
- **Per-scenario floor:** no primary scenario may regress beyond `1.05x` its current champion median p95.
- **Hard gates:** evaluator completeness, player chunk ready, generation queue at most 120 in the fixed route, false memory-cache misses at most five, critical hero coverage, both creature batch paths present, scoped correctness tests, TypeScript, and changed-file lint.
- **Immutable:** evaluator, benchmark scenarios, tests, telemetry, content/spawn settings, render/simulation/basic-render defaults, visual theme, world seeds, and deployment behavior.
- **Mutable:** creature admission/batching implementations and bounded engine/world scheduling or consolidation implementations. One causal hypothesis per pass.
- **Budget:** exactly ten passes. Cheap validation before three-run measurement; browser visual checkpoints before, around pass five, and after pass ten; full suite only for the final champion.
- **Rollback:** experiment branch; non-retained source changes are reversed with an explicit patch before the pass-result commit. No destructive reset. Every pass has one durable commit and one evidence row.
- **Deployment:** forbidden during the loop. Only the revalidated final champion may fast-forward `main` and deploy after pass ten.

## Ledger

| Pass | Hypothesis | Score vs champion | Worst scenario | Decision | Commit |
| ---: | --- | ---: | ---: | --- | --- |
| 1 | Replace the articulated batcher's sizing allocation with fixed movement-tier part counts. | 1.1003x | 1.3816x | Discarded; paired measurement regressed the targeted admission/articulation p95 from 0.2087 to 0.2705 ms. | `e3b1201` |
| 2 | Fuse admission candidate collection, visibility/critical counts, and live-id collection into one scan. | 0.9453x | 1.1286x | Discarded; admission p95 improved, but unrelated stationary/cavern tails breached the frozen 5% floor. | `a4eaf7d` |
| 3 | Select immediate-ring work in one pass instead of allocating and sorting nine candidates each frame. | 1.0303x | 1.3577x | Discarded; overall score regressed and the 100-creature LOD tail exceeded the floor. | `d4b61e6` |
| 4 | Configure instanced creature color buffers once per allocation instead of once per presentation update. | 1.0115x | 1.1314x | Discarded; both aggregate and admission/articulation p95 regressed. | `8e834e2` |
| 5 | Reuse the exact nine immediate-ring priority records rather than rebuilding them each frame. | 1.0116x | 1.2054x | Discarded; steady traversal did not improve and cavern p95 breached the floor. | `f67ffef` |
| 6 | Track remaining streaming work with a scalar instead of rescanning its four quotas in the hot loop. | 1.0008x | 1.5074x | Discarded; aggregate change was inconclusive and player-edit p95 breached the floor. | `61895bb` |
| 7 | Reuse edit-layer scratch storage and face-neighbor offsets during block-batch invalidation. | 1.1260x | 1.5668x | Discarded; edit and traversal tails regressed materially despite passing correctness tests. | `de6c10e` |
| 8 | Emit articulated instances directly rather than allocating temporary per-part objects and arrays. | 0.9507x | 1.2679x | Discarded; targeted p95 improved 45.7%, but two confirmations reproduced unrelated scenario-floor breaches, so the strict contract vetoed retention. | `9673f5e` |
| 9 | Set distant-instance yaw directly around the vertical axis instead of converting an Euler per creature. | 1.0150x | 1.3469x | Discarded; LOD p95 improved, but aggregate and player-edit tails regressed. | `9fba5fa` |
| 10 | Reuse admission ranking and ID scratch collections while fusing its candidate diagnostics scan. | 1.1186x | 2.0165x | Discarded; admission and unrelated LOD tails both regressed, despite correctness passing. | `e46f6f7` |

## Frozen baseline

Five repetitions produced a `4.6812 ms` geometric mean of scenario median p95 values. All six evaluator guardrails passed. The per-scenario median p95 baseline is:

| Scenario | Median p95 (ms) |
| --- | ---: |
| Stationary settled | 8.7849 |
| Continuous walk | 10.4863 |
| Continuous sprint | 10.3667 |
| Dense 360 turn | 11.2710 |
| Frozen boundary edit | 20.6579 |
| 100-creature LOD/broadphase | 0.0823 |
| 100-creature admission/articulation | 0.3199 |
| Settlement traversal | 11.7322 |
| Large cavern traversal | 9.6399 |
| Player edit burst | 7.6322 |

## Visual checkpoints

The before, midpoint, final gameplay frames and the generated metric timeline are stored under [`docs/artifacts/performance-autoresearch-2026-08-04/`](artifacts/performance-autoresearch-2026-08-04/).

At midpoint, the exact production runtime reached live Frostpine Taiga gameplay with a complete immediate ring, two ready generation workers, zero worker failures, six nearby mobs, and no browser error artifact. The frame was manually reviewed before retention.

The final exact-runtime frame reached live Flower Meadow gameplay with the player chunk ready, a complete immediate ring, two ready generation workers, zero worker failures, nine nearby mobs, and no browser error artifact. The before, midpoint, final, and timeline images were all manually reviewed.

## Final outcome

- **Passes:** 10/10 completed, measured, and individually committed.
- **Retention:** 0 promoted, 10 discarded. Every rejected source mutation was reversed before its evidence commit; the production gameplay source remains byte-identical to the starting champion.
- **Final revalidation:** five unchanged-source repetitions produced a `4.7004 ms` geometric mean of scenario median p95 values, or `1.0041x` the initial baseline. All six fidelity and correctness guardrails passed. The 0.41% difference is within ordinary host noise and is not claimed as a regression or improvement.
- **Most useful lead:** pass 8 reduced the targeted admission/articulation p95 by 45.7% and the aggregate score by 4.9%, but two confirmations reproduced unrelated scenario regressions beyond the fixed 1.05x floor. It remains a promising hypothesis, not safe production code.
- **Protocol lesson:** sequential scenario timing is sensitive to unrelated host-tail noise. A future run should use randomized or interleaved A/B/A samples and scenario-attributed confirmation while preserving the same correctness and fidelity vetoes. This run's evaluator was not changed retroactively.

## Release validation

- The frozen evaluator and benchmark checksums match the setup commit after pass ten.
- The evaluator unit test, native TypeScript check, scoped ESLint, and whitespace validation pass.
- The complete deterministic gameplay/content suite passes 833/833; rendered-page and audio checks pass 10/10.
- The native Next/Webpack production build compiles, type-checks, prerenders, and traces `/`, `/agent`, and `/wiki`. Its two circular-chunk warnings are pre-existing and non-fatal.
- The umbrella `npm test` reaches its legacy WSL Sites wrapper only after the pretest matrix passes; that wrapper cannot create an Ubuntu instance from this Windows-owned checkout (`E_ACCESSDENIED`). Native production validation and the source-backed Sites release path are used without mutating shared dependencies.

## Claim boundary

The primary metric is a deterministic Node CPU/world proxy on this machine. Browser checkpoints verify integration and visual fidelity, but SwiftShader FPS is not used to claim hardware-GPU improvement. The final deployed build still requires Noah's comparable player-hardware capture for a production p95/p99 claim.
