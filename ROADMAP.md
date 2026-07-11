# Blockwild roadmap

Blockwild v0.6 Hearthroads establishes persistent maps, quests, settlements, faction standing, resident roles, trade, gold, banking, local ventures, alchemy, and blueprint knowledge. The systems below are intentionally outside the v0.6 release boundary. This is a direction document, not a schedule.

## Full settlement management and player towns

The player faction can already be represented in faction and settlement ownership records. A later settlement release should turn that groundwork into a complete management loop:

- Found a new player town or formally claim an existing site.
- Name the town and manage beds, doors, population capacity, resident roles, equipment, work priorities, and defensive posts from one interface.
- Let buildings, paths, storage, workshops, farms, walls, and gates contribute to town function without making ordinary player building invalid.
- Recover gracefully when a player removes a door, bed, workstation, wall, or role-preferred building.

Hearthroads does not include a city-builder overlay, construction queue, town budget, or complete player-governance UI.

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

## Magic expansion

Alchemy, potions, blueprint knowledge, wayshrines, and charged fast travel are the non-spell foundation. A later magic system can add spellcasting, magical resources, equipment effects, creatures, quests, and more flexible travel. Hearthroads does not add mana, spell schools, combat casting, enchantment, or unrestricted teleportation.

## Fishing and deeper water activity

Fish in v0.6 are physical creatures: they swim, school, can be attacked, and belong to river, ocean, underground, or deep-ocean habitats. Rods, lines, bait, hooked-fish behavior, fishing loot, and fishing professions remain deferred.

## Release guardrails

These additions should preserve deterministic generation, migrate existing saves, keep the host authoritative in multiplayer, stay within the simulation-distance budget, and expose focused tests before entering the production engine. A feature is not complete because its data type exists; it is complete when the player-facing loop, persistence, multiplayer boundary, visuals, and failure behavior agree.
