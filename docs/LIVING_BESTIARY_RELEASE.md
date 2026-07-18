# Wild Bonds & Hearthroads release guide

This document is the maintained implementation and verification index for v1.7.0. The original design contract remains ignored under `output/plans/`; this file records the shipped surfaces without turning the proposal into runtime data.

## Player-facing scope

- 215 creatures total: 178 retained entries plus 27 regular additions, six legendaries, and four summons.
- 21 universal creature types, fixed visible species stats, level-and-bond move unlocks, and no IV-style hidden rolls.
- One real-time host-authoritative combat resolver for player, creature, summon, construct, resident, boss, projectile, spell, mounted, and PvP actors.
- Append-only Bestiary research, individual specimen/capture history, forms, Prime routes, care clues, mounts, rarity, and Summoned Origins.
- Seven faction-linked guilds, 21 principal characters, seven recruits, 56 authored chapters, six ranks, halls/lodges, invitations, doctrines, and exact semantic objective proof.
- Twenty reusable spells, including four stable-contract summons and Worldpin grounding.
- Contextual versioned container loot, ownership consequences, unique issuance ledger, saved road graph, ferry landings, and persistent bounded road events.

## Runtime ownership

| System | Canonical modules |
| --- | --- |
| Types, stats, moves, combat | `creature-types.ts`, `creature-stats.ts`, `creature-moves.ts`, `creature-combat.ts`, `engine.ts` |
| Capture, specimens, research | `creature-capture.ts`, `living-bestiary.ts`, `creature-profiles.ts`, `VoxelGame.tsx` |
| Rarity and ecology | `creature-rarity.ts`, `creature-ecology.ts`, `ecology.ts` |
| Mounts | `creature-mounts.ts`, `engine.ts` |
| Magic and summons | `magic.ts`, `summon-contracts.ts`, `DragonMagicPanels.tsx`, `engine.ts` |
| Guilds | `guilds.ts`, `GuildPanel.tsx`, `engine.ts`, `world.ts` |
| Roads and loot | `surface-roads.ts`, `contextual-loot.ts`, `world.ts`, `engine.ts` |
| Production art | `living-bestiary-models.ts`, `mob-models.ts`, `creature-appearance.ts` |

The host alone mutates combat, capture, level, loot, quest, rare encounter, summon-grounding, road-event, and persistent guild state. Clients send bounded intents and reconstruct authored creature state from snapshots.

## Compatibility guarantees

- Existing v1/v2 Bestiary records normalize deterministically; research and specimen history append instead of rewriting old discoveries.
- Existing generated container inventories remain frozen. New contextual containers record their generator version and unique issuance state.
- Stable summon contracts prevent appearance, shiny, personality, and reward rerolls. Grounded individuals and temporary echoes cannot duplicate custody.
- Generator-v15 terrain and old worlds retain their existing profile. Road graphs and event ledgers normalize defensively when absent.
- Dwarven mountain holds retain paired lifts, clear shafts, gatehouses, mine roads, guild/golem spaces, and discovery markers.

## Release verification

Run from the repository root:

```bash
npm run test:living-bestiary
npm run audit:living-bestiary
npm run audit:ecology
npm run audit:world-overhaul
npm run benchmark:simulation
npm run benchmark:spatial
npm run soak:living-world
npm test
```

The living release audit must report:

- zero critical misses and zero deterministic mismatches across 10,000 contextual containers;
- seven guilds, 56 chapters, 21 principals, seven recruits, deterministic non-overlapping hall placement, and complete campaign metadata;
- no failures across 50 regional road seeds and 50 Dwarven infrastructure seeds;
- six valid legendary encounters and four valid summon contracts.

The ecology audit must report all 215 discovery hints, all 46 flora assignments, 24 surface biomes, and seven underground habitats. `npm test` is the final build, rendered HTML/audio, migration, multiplayer, world, UI, and gameplay regression gate.

`npm run soak:living-world` fast-forwards two representative in-game hours across 320 actors and eight player-interest points. It is a deterministic collection-growth gate for spatial queries, threat ledgers, contextual loot, road anchors, and append-only Bestiary research. It complements rather than replaces an actual long browser playtest.

## Visual artifacts

Run:

```bash
npm run showcase:living-bestiary
npm run showcase:living-bestiary:compare
```

The renderer extracts the same Three.js rigs used by gameplay. Review both generated comparison sheets manually for clipped anatomy, flat silhouettes, opaque parts that should transmit light, unsupported floating anatomy, unreadable dark materials, tack drift, and unintended transform accumulation before publishing.
