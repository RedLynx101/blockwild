# Blockwild performance autoresearch protocol

Status: proposed invocation contract, not an active autonomous run.  
Prepared: 2026-08-04 after the frame-admission and streaming overhaul.

## Decision

Blockwild should use the **method** of Karpathy's autoresearch, not copy its ML-specific runner. The useful pattern is a fresh experiment branch, a fixed evaluator the researcher cannot edit, one coherent hypothesis per commit, a bounded run, a durable keep/discard/crash ledger, and continuous iteration. The original system optimizes one training file against one fixed validation metric in roughly five-minute trials. Blockwild is a persistent multi-objective game, so a direct port would be easy to game: an agent could improve frame time by reducing render distance, wildlife, visual completeness, or streaming correctness.

The Blockwild adaptation therefore has two layers:

1. **Hard acceptance gates** protect behavior, world determinism, visual completeness, persistence, multiplayer authority, and player-visible readiness.
2. **A normalized scalar score** ranks only candidates that pass every gate, while a Pareto ledger retains tradeoffs in frame tails, readiness, draw count, memory, and interaction latency.

No experiment may deploy, push `main`, alter the evaluator, reduce configured fidelity, or rewrite production saves. A human promotes a champion after reviewing its evidence.

## The fixed research world

The future harness should live under `scripts/autoresearch/` and be owned by the human/release branch. Experiment agents may run it but may not modify it.

| Fixed asset | Responsibility |
| --- | --- |
| `contract.json` | Run tag, exact base commit, machine/browser identity, allowed files, time limit, seeds, routes, settings, and score weights |
| `evaluate.ts` | Orchestrates cold/warm Node scenarios and production-browser routes and rejects provenance drift |
| `correctness.ts` | Runs TypeScript, scoped tests, determinism hashes, save round trips, and protected visual contracts |
| `score.ts` | Normalizes valid measurements against the frozen baseline and emits one lower-is-better score plus the full vector |
| `program.md` | The agent's operating instructions, scope, invariants, experiment loop, and stop conditions |
| `results.tsv` | Append-only local experiment ledger; ignored during the run, summarized into tracked Markdown at review time |

The evaluator should refuse a run when the base commit, browser version, hardware identity, viewport, quality settings, seed, route script, warmup, sample duration, or telemetry schema differs from the contract.

## Measurement suite

Every candidate receives the same sequence:

1. **Static gate** — `git diff --check`, native TypeScript, ESLint on changed files, and an allowlist check.
2. **Focused correctness** — tests chosen from the touched subsystem plus world determinism, player-chunk readiness, liquid seams, persistence, and multiplayer authority.
3. **CPU micro-suite** — benchmark v2 scenarios for stationary, walking, sprinting, dense turning, frozen-water edits, settlement, cavern, player edits, 100-creature LOD, and 100-creature admission/articulation.
4. **Browser route A: traversal** — fixed seed, 1080p, fixed quality, cold start, walk/sprint/turn, then a settled stop.
5. **Browser route B: fauna** — fixed high-population scene with camera sweeps, combat relevance changes, and a stationary comparison.
6. **Browser route C: edits** — grass/block breaks and a tree fall, measuring input-to-visible mutation and consolidation.
7. **Browser route D: underground** — cavern traversal with lighting, water, and direction changes.
8. **Warm repeat** — repeat the browser routes against populated caches. Use the median of three short runs for promotion; single-run wins are provisional.

The player-hardware browser is the authority for frame/GPU claims. SwiftShader remains a structural and correctness runner, not an FPS comparator.

## Hard rejection gates

A candidate is `discard` even if its score improves when any of these are true:

- a required test, deterministic hash, save migration, or multiplayer-authority check fails;
- the player chunk is not ready or the immediate ring is below 9/9 at a route checkpoint;
- a player edit is not visually acknowledged in the next presented frame;
- configured render, basic-render, simulation, creature, structure, flora, lighting, or particle fidelity is reduced;
- a hero/critical creature is demoted from its authored model;
- a visual reference exposes a seam, missing terrain, incorrect liquid boundary, lighting leak, or obvious LOD pop;
- generation/terrain workers fail, restart repeatedly, or silently fall back;
- memory has an unbounded positive slope after warmup;
- the candidate adds a dependency, changes telemetry/evaluation code, or writes outside the allowlist;
- the run lacks exact commit and deployment provenance.

## Ranking valid candidates

For each valid run, normalize every lower-is-better metric against the frozen baseline (`candidate / baseline`). The first implementation should use:

```text
score =
  0.28 * browser_frame_p95
+ 0.16 * browser_frame_p99
+ 0.10 * active_cpu_average
+ 0.10 * render_submission_average
+ 0.08 * creature_presentation_average
+ 0.08 * readiness_p95
+ 0.07 * oldest_valid_near_job
+ 0.05 * terrain_submissions
+ 0.04 * live_geometry_bytes
+ 0.04 * player_edit_visible_p95
```

Lower is better. A keep requires at least a 1.5% median score improvement, no hard rejection, and no individual primary metric worsening by more than 5% unless the Pareto tradeoff is explicitly approved. These thresholds should be calibrated during the first baseline campaign, then frozen for that run.

The ledger must also retain the raw vector. The scalar selects a likely champion; it does not erase a candidate that materially improves p99 or memory at a small average-time cost.

## Editable surface

Begin narrowly. The first campaign may edit only:

- `app/game/creature-render-admission.ts`
- `app/game/creature-articulated-batcher.ts`
- `app/game/creature-lod-batcher.ts`
- bounded scheduling/admission portions of `app/game/engine.ts`
- bounded streaming/consolidation portions of `app/game/world.ts`

It may add focused tests for a new invariant, but cannot weaken or delete an existing assertion. It may not change benchmark scripts, telemetry, defaults, content registries, spawn rates, model definitions, textures, world seeds, or route actions during a run.

Later campaigns should have separate allowlists—terrain meshing, simulation scheduling, lighting, or WebGPU research—rather than letting one agent modify the entire engine.

## Git and artifact model

Use an isolated ignored worktree such as `work/autoresearch/2026-08-04-a/checkout` on branch `autoresearch/2026-08-04-a`. Never run experiments in the user's active `main` checkout.

Each trial starts from the current champion commit:

1. record one hypothesis and predicted metric in the ledger;
2. make one coherent change and commit it;
3. run the fixed evaluator with a 12-minute timeout;
4. append commit, score, raw metrics, status, changed files, and description to `results.tsv`;
5. advance the champion only for a valid improvement;
6. return to the champion for a discard or crash while retaining the candidate hash and compressed evidence;
7. after every ten trials, produce a short strategy checkpoint and switch hypothesis families if the keep rate is zero.

Run logs, performance JSON, screenshots, and rejected patches stay under the ignored run directory. A final tracked report records the baseline, every kept commit, representative rejected hypotheses, the Pareto frontier, total compute time, and the exact promotion candidate.

## How Noah should invoke it

After the harness exists and a baseline campaign has been manually verified, use a persistent Codex goal rather than an unsafe shell loop:

> Set a persistent goal to run the Blockwild performance autoresearch protocol in an isolated worktree until I pause or stop the goal. Read `docs/PERFORMANCE_AUTORESEARCH_PROTOCOL.md` and the frozen run's `program.md` first. Establish the baseline before changing code. Run one hypothesis per commit, use only the allowlisted files, never modify the evaluator, never push or deploy, reject any correctness or fidelity regression, retain the complete results ledger, and continue from the current champion after every failed experiment. Report only genuine keeps, important crashes, strategy checkpoints, or a request that requires new authority.

This preserves interactivity and the product's approval gates. Karpathy's repository currently notes that an unbounded Codex CLI session may stop instead of honoring “never stop”; a user-visible persistent goal is the cleaner Blockwild control plane. If a process watchdog is later needed, it should resume the same run ledger and champion commit after a clean agent exit—never use a broad `--dangerously-bypass-approvals-and-sandbox` loop.

## Rollout

1. Build and review the frozen evaluator without autonomous mutation.
2. Run five no-change baselines to measure noise and freeze thresholds.
3. Conduct a supervised five-experiment pilot on creature admission only.
4. Review rejected diffs, visual artifacts, score stability, and recovery behavior.
5. Start the persistent goal for a bounded overnight campaign (for example 50 trials or eight hours), with Noah able to pause it.
6. Re-run the champion on the player's hardware and manually inspect representative scenes.
7. Cherry-pick or reimplement the approved champion on `main`, run the full release gate, then deploy normally.

The first campaign should target presentation admission and consolidation because the August 4 production capture tied frame time strongly to render submission and draw calls. A WebGPU campaign should remain separate until WebGL provides a stable comparison backend and material parity.

## Source note

This protocol adapts the research pattern described by Karpathy's public [`autoresearch`](https://github.com/karpathy/autoresearch) repository and [`program.md`](https://github.com/karpathy/autoresearch/blob/master/program.md): fresh run branches, an immutable evaluator, fixed-time experiments, a TSV ledger, keep/discard/crash outcomes, simplicity preference, and continuous iteration. The Codex persistence limitation is documented in the repository's [issue #57](https://github.com/karpathy/autoresearch/issues/57). This proposal does not incorporate or redistribute repository code.
