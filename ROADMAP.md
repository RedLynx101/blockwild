# Blockwild roadmap

This is a direction document, not a schedule. A feature should not be advertised as playable until its complete loop, persistence, multiplayer authority, UI feedback, performance budget, and migration behavior are implemented and tested.

## Near-term quality priorities

### Playability and performance

- Continue the measured optimization loop using browser performance captures, deterministic benchmarks, and the tracked comparison ledger.
- Virtualize very large collection and archive lists when their DOM/layout cost becomes visible; keep images lazy and local.
- Expand low-spec and touch validation without weakening host authority or simulation correctness.
- Keep player-caused feedback immediate while mesh consolidation, lighting, ecology, and distant world work remain budgeted.

### Public usability

- Grow the living wiki from the shared registries instead of adding isolated hand-written lists.
- Add a small number of curated biome and system diagrams where they explain relationships better than prose.
- Improve controller, keyboard-only, reduced-motion, contrast, and screen-reader coverage across the densest interfaces.
- Add an explicit save-health and backup reminder for large or long-lived browser worlds.

### Creature and Cardforge quality

- Keep canonical production models as the source of truth for gameplay, Bestiary portraits, wiki art, and creature cards.
- Reserve premium Full Art for a curated roster; favor strong scene direction over many weak alternate assets.
- Add Binder windowing when collection scale proves it necessary rather than paying the complexity cost preemptively.
- Continue capture, care, combat, riding, swimming, flight, and work-role polish without creating hidden species-specific rule checklists.

## Larger systems under consideration

### Optional portable accounts and cloud saves

Browser-local ownership is simple and private, but it does not follow a player across devices. Any account or cloud-save system needs explicit authentication, conflict resolution, encryption, quotas, export guarantees, deletion, offline behavior, and a migration path that never makes current local worlds inaccessible.

### Deeper settlements and player towns

- Culture-specific districts, authored civic landmarks, and save-safe settlement growth.
- Player-founded towns with beds, jobs, storage, workshops, farms, defenses, and a legible management surface.
- Mixed-culture habitat rules rather than treating underwater, subterranean, Confectkin, Atlantian, Wood Elf, and Dwarven needs as interchangeable.
- Recoverable behavior when players alter doors, beds, roads, workstations, or boundaries.

### Parties, diplomacy, and war

- Named parties of guards, workers, mounts, and ranged units with bounded off-screen state.
- Reputation, declarations, truces, patrols, sieges, surrender, ownership changes, resident movement, and rebuilding.
- Map, music, trade, quests, guards, and population behavior that update coherently after political changes.

These systems should extend the existing faction and follower foundations rather than create a second simulation.

### More worlds and dimensions

Additional dimensions remain a future expansion. Each needs a complete travel contract, ecology, resources, hazards, visual identity, return path, save ownership, and multiplayer loading model. Summoned creatures can imply particular other realms now without making those realms playable prematurely.

### Advanced production and automation

Broader factories, drills, logistics, powered systems, and chunk-scale automation require energy, throughput, loading, ownership, griefing, save, and simulation-budget rules first. Automation should create new planning decisions rather than erase exploration, creature work, settlements, and fieldcraft.

### Creature inheritance and evolution

Cross-type dragons, creature evolutions, and hybrids are deferred until inheritance can preserve type, anatomy, attacks, sex, genetics, equipment, eggs, variants, save normalization, and multiplayer determinism without a combinatorial pile of exceptions.

### Deeper magic and skills

- More noncombat magic for building, farming, creatures, mapping, weather, travel, and settlements.
- Enchantment, ritual, environmental interaction, counters, and cooperative casting with explicit authority.
- More meaningful intermediate skill branches, respec rules, and independently toggleable Ascendant preferences.

Unrestricted teleportation and silent god-mode upgrades are not assumed. Wayshrines, safe Blinkstep collision, and explicit player choices remain the current bounded model.

## Release gates for every major addition

- The player-facing purpose and failure states are understandable without an external checklist.
- Persistent fields normalize from old saves and survive export/import.
- Multiplayer mutations are host-authoritative and retry-safe.
- Runtime work is bounded and appears in relevant telemetry or benchmarks.
- Art follows the block, creature, and interface theme contracts and is manually reviewed.
- Keyboard, touch, narrow-screen, and core accessibility paths remain usable.
- Tests cover the actual system boundary rather than only helper functions.
- README, wiki, changelog, and relevant design contracts agree with the shipped behavior.
