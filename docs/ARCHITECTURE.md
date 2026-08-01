# Blockwild architecture

This document is the short public map of the runtime. Domain-specific contracts under `docs/` remain authoritative for their systems.

## Runtime ownership

```text
React interface
  -> validated player intent
VoxelEngine
  -> simulation, authority, interaction, compact HUD snapshots
ChunkWorld and domain modules
  -> deterministic terrain, persistent records, bounded derived work
Three.js presentation
  -> shared canonical models, meshes, effects, and interpolation
```

React does not own frame-by-frame physics or entity transforms. The engine advances mutable state and emits compact snapshots when the interface needs them. This keeps the simulation independent of component renders and makes host authority testable.

## World and persistence

`world.ts` and its collaborators generate terrain from seed, generator version, world options, and neighboring context. Saves keep player-authored edits and durable records rather than duplicating untouched generated terrain. Persistent structures are normalized at load boundaries so new optional fields do not invalidate older worlds.

Lighting packs independent sky, red, green, and blue channels. Chunk sections reconcile boundary light before presentation, and player-visible edits detach stale geometry immediately while derived seam and light work remains budgeted.

## Creatures and content

`mobs.ts` defines creature semantics. `mob-models.ts` and the specialist model modules define canonical geometry. Ecology, care, capture, combat, pathing, mounts, dragons, summons, and persistence remain separate rule layers. Runtime models, Bestiary portraits, Cardforge scenes, and review sheets all begin from the canonical model path.

`data.ts`, `mobs.ts`, `plants.ts`, and `world.ts` also feed `wiki-content.ts`. The in-game and public wiki therefore project live registries instead of maintaining a second manually synchronized database.

## Multiplayer and agents

The host validates shared mutations. Reliable actions, inventories, containers, combat, creatures, and edits do not trust guest presentation state. High-frequency movement uses a separate disposable path.

AI companions join as capability-scoped multiplayer drones. The game exposes typed commands and bounded observations; it does not expose arbitrary engine mutation. In-world chat is eventually observed dialogue, not an instruction channel with automatic authority.

## Delivery targets

The Next.js application is built directly for Vercel and through Vinext/Vite for the Cloudflare Worker artifact used by Sites. Both public targets must be traced to the same Git commit during release verification.
