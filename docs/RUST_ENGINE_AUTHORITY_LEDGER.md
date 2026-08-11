# Rust Engine Authority Ledger

Status: Phase R0 contract  
Protocol: BWEP 1  
Schema: 1  
Public engine default: TypeScript  
Public renderer default: Three.js

This ledger is the migration's source of truth for runtime ownership. It prevents a TypeScript system and a Rust system from both accepting authoritative mutations for the same domain. The implementation plan is [HYBRID_RUST_ENGINE_MIGRATION_MASTER_PLAN.md](./HYBRID_RUST_ENGINE_MIGRATION_MASTER_PLAN.md).

## Rules

Valid authority modes are:

- `typescript-authoritative`: TypeScript alone owns outcomes. Rust may not mutate durable state.
- `rust-shadow`: TypeScript owns outcomes; Rust receives the same canonical inputs for differential checking.
- `rust-authoritative-typescript-shadow`: Rust owns outcomes; TypeScript runs only as a bounded comparison oracle.
- `rust-authoritative`: Rust alone owns outcomes. The old TypeScript authority may remain available only through an explicit rollback build.
- `retired-typescript`: the TypeScript authority has been deleted. TypeScript presentation and browser adapters may remain.

A domain changes mode only in a reviewed commit that updates this table, names its parity evidence, confirms its save/version boundary, and identifies its rollback switch. Renderer selection is independent from engine selection: enabling `wgpu-shadow` does not grant Rust simulation authority, and enabling `rust-shadow` does not replace Three.js.

## Phase R0 selectors

| Selector | Allowed in R0 | Meaning |
| --- | --- | --- |
| Engine `typescript` | yes; default | current TypeScript runtime is authoritative; Rust artifact is not requested |
| Engine `rust-shadow` | development/test opt-in | TypeScript is authoritative; Rust receives coarse mirrored batches; failures fall back cleanly |
| Engine `rust-authoritative-typescript-shadow` | no | reserved until a domain passes its promotion gates |
| Engine `rust` | no | reserved until a domain passes its promotion gates |
| Renderer `three` | yes; default | current renderer and visual oracle |
| Renderer `wgpu-shadow` | capability- and test-gated | comparison output only; has no simulation authority |
| Renderer `wgpu` | no | reserved until R11 promotion gates |

## Domain ownership

Every row is intentionally TypeScript-authoritative at R0. “None” in the Rust owner column means no production Rust authority exists yet; the target names the planned crate/module rather than claiming completed code.

| Domain | Current TypeScript owner | Rust target | Mode | Required parity evidence before next mode | Save/schema boundary | Rollback flag |
| --- | --- | --- | --- | --- | --- | --- |
| Runtime clock and scheduler | `app/game/VoxelGame.tsx`, world update loop | `engine/core` | `typescript-authoritative` | fixed-step replay, catch-up and pause/resume fixtures | runtime only | `engine=typescript` |
| Coordinate and block indexing | `app/game/world.ts`, geometry helpers | `engine/types`, `engine/world` | `typescript-authoritative` | negative-coordinate and boundary golden vectors | generator version | `domain.coordinates=typescript` |
| Seed derivation and RNG | world/content helpers | `engine/types` | `typescript-authoritative` | named-stream golden vectors in native and Wasm | generator/content hashes | `domain.rng=typescript` |
| Spatial index and broadphase | `app/game/spatial-index.ts` | `engine/simulation` | `typescript-authoritative` | query-set and ordering equivalence | runtime only | `domain.spatial=typescript` |
| Raycast and collision queries | world/player helpers | `engine/simulation` | `typescript-authoritative` | ray/AABB edge corpus and gameplay reach fixtures | runtime only | `domain.collision-query=typescript` |
| Terrain, biome, cave and structure generation | `app/game/world.ts`, `caves.ts`, `underground.ts`, structure modules | `engine/world` | `typescript-authoritative` | generator-version byte parity and POI metadata parity | generator version per world | `domain.worldgen=typescript` |
| Section lighting | world lighting modules | `engine/world` | `typescript-authoritative` | propagation, seam and emissive galleries | chunk light revision | `domain.lighting=typescript` |
| Section meshing and packed buffers | world mesh code, `terrain-buffer-pipeline.ts` | `engine/world`, `engine/render` | `typescript-authoritative` | face/UV/light/AO byte fixtures plus visual gallery | derived data; not saved | `domain.meshing=typescript` |
| Chunk residency and streaming priority | `app/game/VoxelGame.tsx`, chunk pipelines/cache | `engine/core`, `engine/world` | `typescript-authoritative` | immediate-ring readiness and long-travel benchmark | residency is transient | `domain.streaming=typescript` |
| Player block edits and dirty propagation | world/runtime interaction code | `engine/world` | `typescript-authoritative` | immediate visual removal, revision and conservation tests | world edit journal | `domain.block-edits=typescript` |
| Liquids and aquifers | `app/game/liquids.ts`, world generation | `engine/world`, `engine/simulation` | `typescript-authoritative` | level/topology/seam and swimming fixtures | fluid schema version | `domain.liquids=typescript` |
| Atmosphere and pressurization | future celestial runtime plus current environment rules | `engine/simulation` | `typescript-authoritative` | zone topology, leak and life-support fixtures | location/environment schema | `domain.atmosphere=typescript` |
| Navigation and pathfinding | `app/game/creature-pathing.ts`, `agent-navigation.ts` | `engine/simulation` | `typescript-authoritative` | reachability, bounded work and semantic path parity | runtime/path cache only | `domain.navigation=typescript` |
| Entity identity and hot transforms | world/entity state in runtime modules | `engine/simulation` | `typescript-authoritative` | spawn/despawn, stable-ID and interpolation fixtures | entity schema | `domain.entities=typescript` |
| Creature movement, AI and combat intent | creature AI/pathing/ecology modules | `engine/simulation`, `engine/gameplay` | `typescript-authoritative` | behavior traces, attack reach, cadence and population invariants | creature schema | `domain.creature-ai=typescript` |
| Ecology and spawning | `app/game/creature-ecology.ts` and population systems | `engine/simulation`, `engine/gameplay` | `typescript-authoritative` | habitat caps, refill, persistence and deterministic soak | ecology/location summaries | `domain.ecology=typescript` |
| Player physics, swimming, mounts and damage | runtime/player/mount modules | `engine/simulation` | `typescript-authoritative` | input replays and control-feel acceptance | player state schema | `domain.player-physics=typescript` |
| Items, inventories and equipment | inventory/item/runtime modules | `engine/gameplay` | `typescript-authoritative` | metadata and quantity conservation, migration corpus | inventory schema | `domain.inventory=typescript` |
| Crafting, farming and processing | crafting/farming/machine modules | `engine/gameplay` | `typescript-authoritative` | recipe, timing, fuel and transaction fixtures | machine/crop schemas | `domain.crafting=typescript` |
| Power, pipes and Waygrid networks | machine/Waygrid modules | `engine/simulation`, `engine/gameplay` | `typescript-authoritative` | topology, conservation and bounded rebuild tests | network schema | `domain.networks=typescript` |
| Combat, projectiles, magic and status | combat/projectile/magic/status modules | `engine/gameplay` | `typescript-authoritative` | authoritative timing, damage and effect replays | gameplay schema | `domain.combat=typescript` |
| Capture, care, ownership and progression | capture/care/progression modules | `engine/gameplay` | `typescript-authoritative` | custody, bond, transfer, migration and multiplayer suites | creature custody schema | `domain.creature-care=typescript` |
| Quests, factions, settlements and economy | quest/faction/settlement modules | `engine/gameplay` | `typescript-authoritative` | quest transitions, stock/currency conservation and headless soak | progression/world schemas | `domain.progression=typescript` |
| Cardforge custody, packs and match rules | `app/game/tcg/*` | `engine/gameplay` | `typescript-authoritative` | deterministic packs, legal actions, custody and replay suites | Cardforge schema | `domain.cardforge=typescript` |
| Map discovery and celestial addresses | map/navigation/world records | `engine/gameplay`, `engine/world` | `typescript-authoritative` | discovery, travel and multi-location address fixtures | map/location schema | `domain.map=typescript` |
| Persistence encoding and journal decisions | `app/game/world-storage.ts` and persistence helpers | `engine/persistence` | `typescript-authoritative` | migration corpus, canonical hashes, crash/readback tests | explicit save version | `domain.persistence=typescript` |
| IndexedDB transactions and quota prompts | browser storage adapters | browser TypeScript adapter | `typescript-authoritative` | transaction/result and failure-injection tests | browser-owned API | not migrated |
| Multiplayer validation and authoritative deltas | `app/game/multiplayer*.ts` and host runtime | `engine/network`, `engine/gameplay` | `typescript-authoritative` | host/guest, interest, reconnect and desync replay suites | network protocol version | `domain.multiplayer=typescript` |
| WebRTC objects and signaling | browser multiplayer adapters | browser TypeScript adapter | `typescript-authoritative` | connection lifecycle and backpressure tests | browser-owned API | not migrated |
| Agent command validation and leases | `app/game/agent-*.ts`, host runtime | `engine/gameplay`, `engine/network` | `typescript-authoritative` | authority, lease, permissions and soak suites | agent protocol version | `domain.agents=typescript` |
| Render extraction records | current scene/runtime state | `engine/render` | `typescript-authoritative` | renderer-independent fixture envelopes and bandwidth budgets | render schema; not saved | `domain.render-extract=typescript` |
| Terrain rendering | Three.js world renderer | `engine/render-wgpu` | `typescript-authoritative` | dual-render terrain gallery, seams, device-loss and frame metrics | presentation only | `renderer=three` |
| Creature, item, prop and machine rendering | Three.js procedural model modules | `engine/render-wgpu` | `typescript-authoritative` | canonical model/animation galleries and instance budgets | presentation only | `renderer=three` |
| Particles, weather, sky and celestial rendering | Three.js effects/environment modules | `engine/render-wgpu` | `typescript-authoritative` | transparent-order, atmosphere and temporal galleries | presentation only | `renderer=three` |
| HUD, panels and accessibility | React/CSS/browser DOM | none; remains TypeScript | `typescript-authoritative` | browser interaction and accessibility checks | UI preferences | not migrated |
| Input event sampling | browser runtime | none; remains TypeScript adapter | `typescript-authoritative` | input-frame sequencing and focus/pointer-lock tests | runtime only | not migrated |
| Audio and TTS playback graph | `app/game/audio.ts`, `agent-voice.ts` | none; remains TypeScript adapter | `typescript-authoritative` | cue sequencing, spatial audio and permissions | browser-owned API | not migrated |

## Transfer and failure authority

BWEP uses transferable buffers, but transfer does not transfer gameplay authority. Each transferred response carries an epoch and optional 64-bit ownership token. The receiving side must explicitly return tokened buffers through `BufferRelease`; diagnostics retain outstanding buffer count/bytes. A worker panic invalidates only that worker generation. TypeScript remains authoritative in R0, so an absent artifact, schema mismatch, timeout, or crash disables the shadow path without altering a save.

No fallback may synthesize Rust state. When Rust eventually becomes authoritative, fallback requires a synchronized checkpoint or explicit world reload; simply switching a selector after a panic is not sufficient.

## Promotion record template

Add one record when changing a row:

```text
date / commit:
domain:
old mode -> new mode:
protocol / schema / content hash:
parity suites and replay artifacts:
performance and browser evidence:
save migration and readback evidence:
multiplayer evidence:
rollback flag and expiry:
known accepted semantic differences:
reviewer:
```

R0 adds contracts only. It does not promote a gameplay domain, change a public selector, download Rust on `/wiki`, or make an unavailable Wasm artifact a startup dependency.
