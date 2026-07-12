# Blockwild roadmap

Blockwild v1.0 Realms and Recall adds Wood Elves, Dwarves, Glimmerwood, Snowcap Range, connected culture settlements, golem forging, Sea Dragons, attuned creature recall, searchable expandable item and creature Waygrids, three quest pins, biome-aware maps, and host-authoritative reconnect state. Wyrmweave, Sugarcourt, Tidelight, and Hearthroads remain part of the same deterministic world and progression layer. The systems below are intentionally outside the v1.0 release boundary. This is a direction document, not a schedule.

## Explicit post-1.0 backlog

Realms and Recall adds Wood Elves, Dwarves, Sea Dragons, attuned creature recall, and expandable digital storage. The following ideas from the 1.0 design brief are deliberately recorded rather than partially shipped:

- Human settlements and human firearms beyond the Dwarven flintlock line.
- Mekanism-style factories, powered drills, broad automation chains, and chunk-loading machines.
- Creature evolutions, cross-species monster hybrids, and cross-type dragon hybrids. These require explicit inheritance, model, balance, save, and multiplayer rules first.
- Retrofitting every legacy settlement culture onto the larger connected-tile town planner; new Wood Elf enclaves establish the pattern, while older settlements should migrate only when their authored layouts can remain save-safe.
- Deeper player-town management, hired parties, faction war, autonomous sieges, and post-capture cultural rebuilding.

These are not hidden 1.0 features and should not be advertised as playable until their complete loops exist.

## More dragons and cross-type hybrids

Realms and Recall carries one durable lifecycle across Fire, Ice, Steel, and Sea Dragons and stages one through five. Later dragon releases can extend that model without turning each creature into an unrelated boss script:

- Add new dragon families with distinct silhouettes, habitats, lairs, breath rules, husbandry, equipment, and ecological pressure.
- Add cross-type hybrids only after inheritance rules can preserve type, sex, genetics, attack identity, scale color, egg conditions, and save compatibility without combinatorial one-off code.
- Consider stage-six elder variants, migration between lairs, richer territorial disputes, and wild breeding under bounded off-screen simulation.
- Expand rider tactics, aerial enemies, dragon-vs-dragon behavior, and counterplay without making a bonded elder solve every other progression route.

Hybrids are deliberately absent from v1.0. Same-type opposite-sex breeding and elemental catalysts are the shipped boundary.

## Magic after Realms and Recall

The first release includes attunement, mana, reusable tomes, a journal, favorites, five schools, six spells, cast effects, and Magic-1000 mastery. Later work can add:

- More faction, quest, lair, exploration, and rare-loot tomes without collapsing every school into direct damage.
- Enchantment, charged equipment, ritual or environmental magic, spell interactions, summons, and counterspells.
- More noncombat utility for building, farming, creatures, weather, mapping, travel, and settlements.
- Explicit multiplayer authority for collaborative or hostile spell effects before adding broad area magic.

Unrestricted teleportation is still out of scope. Wayshrines, banked map travel, and safe Blinkstep collision remain the bounded travel rules.

## Deeper skills and Ascendant modes

The rank curve, perk graph, one-percent-per-rank multipliers, uncapped character level, mastery detection, and opt-in ten-percent health floor are foundations rather than a finished god-mode suite. Later progression should add:

- More meaningful branching perks and active abilities at intermediate and high ranks.
- Clear respec, loadout, and multiplayer presentation rules before trees become difficult to reverse.
- Additional Ascendant switches such as resource immunity, altered hunger, flight, damage constraints, or creative-scale world interaction, each independently toggleable.
- Balance rules that keep ordinary survival readable when only some players in a session are Ascendant.

Realms and Recall does not ship invulnerability, arbitrary world editing, or the full set of godlike toggles.

## Full settlement management and player towns

The player faction can already be represented in faction and settlement ownership records. A later settlement release should turn that groundwork into a complete management loop:

- Found a new player town or formally claim an existing site.
- Name the town and manage beds, doors, population capacity, resident roles, equipment, work priorities, and defensive posts from one interface.
- Let buildings, paths, storage, workshops, farms, walls, and gates contribute to town function without making ordinary player building invalid.
- Recover gracefully when a player removes a door, bed, workstation, wall, or role-preferred building.

Realms and Recall still does not include a city-builder overlay, construction queue, town budget, or complete player-governance UI. Future mixed-race player settlements will also need explicit surface, underwater, subterranean, and culture-specific habitat rules rather than treating Atlantians, Confectkin, Wood Elves, or Dwarves as generic residents.

## Raiding parties and hired forces

Individual followers and hireling orders are the base layer. Formation-level play comes later:

- Assemble guards, workers, mounts, and ranged units into named parties.
- Hire a party through a mayor or the player's own settlement authority.
- Give a party a destination, escort target, patrol route, defensive post, or raid target.
- Persist casualties, equipment, commands, ownership, and return behavior without turning every distant unit into a full-cost simulation object.

## Broader diplomacy, war, and conquest

Faction relations already distinguish allied, neutral, and war states, and settlement records can change owner. The full world behavior is deferred:

- Diplomatic decisions, reputation gates, declarations, truces, and faction-wide consequences.
- Autonomous attacks between factions that are at war.
- Town sieges, surrender, capture, resident flight, and repopulation under the new owner.
- Player intervention on either side, including the long-term cost of coercing a mayor or killing defenders.
- Map, music, trade, quests, guards, and resident populations updating coherently after ownership changes.

This needs bounded off-screen simulation and host-authoritative multiplayer messages before it is safe to ship.

## Fishing and mature aquatic professions

Fish and larger sea creatures in v1.0 are physical entities: they swim, school or patrol a habitat, can be attacked or tamed where appropriate, and belong to river, coast, ocean, underground, deep-ocean, Lumen Trench, glimmer-pond, or syrup-pond populations. Water plants can be harvested and replanted, Atlantians trade aquatic goods and Sea Dragon charts, Syrupfins live only in syrup, and leviathans provide long-range sea and air travel. Rods, lines, bait, hooked-fish behavior, fishing loot tables, boats specialized for fishing, and fishing professions remain deferred.

## Release guardrails

These additions should preserve deterministic generation, migrate existing saves, keep the host authoritative in multiplayer, stay within the simulation-distance budget, and expose focused tests before entering the production engine. A feature is not complete because its data type exists; it is complete when the player-facing loop, persistence, multiplayer boundary, visuals, audio, and failure behavior agree. Dragon and spell work must also keep its production model or effect renderer, generated catalog assets, and visual-audit sheets aligned.
