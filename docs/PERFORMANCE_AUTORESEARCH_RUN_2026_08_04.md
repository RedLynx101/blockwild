# Blockwild performance autoresearch — 10-pass run

Run tag: `2026-08-04-frame-streaming-10`  
Base commit: `3b15bd9aa7f0ea69b3fac1c8c861e84e3d778db6`  
Branch: `codex/autoresearch-2026-08-04`  
Status: contract frozen; ten-pass loop active

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

## Claim boundary

The primary metric is a deterministic Node CPU/world proxy on this machine. Browser checkpoints verify integration and visual fidelity, but SwiftShader FPS is not used to claim hardware-GPU improvement. The final deployed build still requires Noah's comparable player-hardware capture for a production p95/p99 claim.
