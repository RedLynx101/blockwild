# Blockwild changelog

Named releases summarize player-visible changes and the compatibility work that keeps browser-local worlds loadable. Dates use the repository release date.

## 0.8.0 — Sugarcourt — 2026-07-11

### Sugarplum Vale and food liquids

- Added Sugarplum Vale as the twenty-second deterministic biome, with rolling Sugarplum terrain, connected Candywood trees, Gumdrop Bushes, Wild Peppermint, Lollipop Orchids, Marshmallow Shrubs, and sparse syrup ponds that remain coherent across chunk seams.
- Added Peppermint and Cocoa Puff as three-stage farmland crops with normal hydration, growth, harvesting, and scythe-replant behavior. Sugarplum forage and Candywood expand the plant journal from 32 to 39 entries.
- Added honey and syrup as placeable, bucketable liquids with their own saved liquid identities. Both use the bounded liquid work queue, spread more slowly than water, impede movement, and never create renewable source blocks.
- Advanced deterministic generation to version 9. Supported worlds from generator versions 2 through 8 continue to normalize into the current representation without discarding their edited blocks.

### Sugarcourt Concord

- Added the Sugarcourt Concord as the fourth NPC faction, with independent standing, diplomacy, quests, finite merchant inventories, role-aware demand, and seven rendered Confectkin professions: Crown Confectioner, Gumdrop Gardener, Sugarboiler, Candysmith, Sweetbroker, Kennelkeeper, and Brittle Guard.
- Added Bonbon Borough settlements with hard Boiled Sugarbrick walls, Candywood buildings, gates, lights, gardens, markets, kennels, smithies, Sugarworks rooms, furniture, schedules, guards, and population rules.
- Added village-only aligned Taffy Hounds and Praline Cats. Capture Orbs now preserve their faction provenance, so a borough animal cannot be laundered into a tameable neutral creature. Kennelkeepers instead sell explicitly unaligned hounds and cats in filled Capture Orbs.
- Added profession-specific stock for Peppermint and Cocoa planting material, Sugarplum forage, candy materials, honey and syrup buckets, finished arms and armor, four physical blueprints, two potions, and neutral companion orbs.

### Sugarworks, blueprints, and equipment

- Added the placeable Sugarworks and eight timed recipes. Open recipes produce Boiled Sugarbricks and Tempered Candy Alloy; learned blueprints unlock the Rockcandy Saber, Peppermint Pike, Sugarplate Crown, Cuirass, Greaves, and Boots.
- Sugarworks batches validate blueprints, ingredients, station state, and output capacity before consuming anything. Their selected recipe, active timer, and output stack use a bounded save-normalization contract.
- Added blueprint-gated Peppermint Rush and Marshmallow Ward formulas to the Alchemy Stand. Peppermint Rush grants a 24% movement increase for three minutes; Marshmallow Ward reduces incoming damage by 28% for three and a half minutes.

### Sugarplum wildlife and field guides

- Added herd-forming, tameable Taffalo as an adult saddle mount; harmless Sprinklebugs as small candy-pollen carriers; and syrup-only Syrupfins that cannot survive in water or honey.
- Added the Bonbonwing, a four-winged Sugarplum butterfly that releases with normal use and can be eaten with crouch-use. It remains compatible with the shared butterfly portrait, held-creature, and habitat systems.
- Expanded the generated bestiary from 77 to 90 entries: 83 core creatures and seven butterflies. The seven Sugarcourt professions bring the sentient roster from 18 to 25 entries.

### World options, compatibility, and coverage

- Added an advanced world-creation selector for Hobbits, Goblins, Atlantians, and Sugarcourt, with All and None shortcuts. The option controls deterministic settlement and aligned-resident generation; home biomes and ordinary wild ecology still generate when a culture is disabled.
- Saved and multiplayer world options use the same canonical faction order. Missing legacy data enables every faction, an explicit empty list creates a valid wilderness-only world, and network snapshots reject duplicate or unknown faction IDs.
- Newly written worlds record `0.8.0` as their last-saved game version while human release identity, generator version, and save-schema compatibility remain separate concerns.
- Added focused suites for Sugarplum generation and crops, Candywood topology, syrup ponds, honey/syrup flow and buckets, Sugarcourt creatures and production models, settlement/economy/quest rules, Sugarworks batches, blueprint wiring, world-option migration, multiplayer validation, UI rendering, and portrait assets.

## 0.7.0 — Tidelight — 2026-07-11

### Ocean and world generation

- Deepened and diversified ocean shelves, basins, and trenches, with the new bioluminescent Lumen Trench biome and sparse underwater Atlantian settlement generation.
- Added Rainveil Jungle and Sakurabloom Grove, bringing the deterministic biome roster to 21.
- Enriched Sunwash Coast with sparse Saltbrush, Coast Aster, Sunwash Crabs, and Tidewing Gulls.
- Made all seven aquatic flora types targetable and breakable while preserving the water in their cell. Harvested propagules can be replanted on valid submerged beds, and column-forming species grow to bounded heights.
- Added Lumen Kelp, Star Coral, Abyss Bloom, and Tidevine to deep-water ecology and the plant journal, with usable ingredient drops.
- Reworked authored tree forms so log layers are face-connected and rooted felling includes upper crowns and historical diagonal branches without claiming a neighboring tree.

### Sea life, companions, and leviathans

- Added Glassfins, Lanternjaws, benthic Abyss Skaters, rare hostile Dreadcoils, and tameable Tidepups to habitat-weighted ocean populations.
- Added the weak, tameable Sakurakit to Sakurabloom Grove and retained rarity-weighted group sizes so leviathans do not displace ordinary schools.
- Added physical Worldshell and Aetherbell eggs. Eggs incubate only while intact underwater, preserve exact metadata when collected, and hatch into persistent babies that grow through juvenile and adult stages.
- Adult bonded Worldshell Leviathans and Aetherbell Leviathans can be saddled and controlled. Worldshells accept six visible chest modules and move extremely slowly on land; Aetherbells accept one chest module and animate between sea and airborne forms.
- Unified the tame-owner-saddle checks used by Wildwood Coursers, Wargs, Reedstriders, Worldshells, and Aetherbells.
- Reattached shared fish fins to their bodies, increased Wildwood Courser eye contrast, and increased daytime butterfly flight relative to perching.

### Atlantians

- Added Atlantians as a water-breathing, aquatic-only sentient culture with independent alignment and diplomacy records.
- Added open, vertical Lumen Tidemoot layouts with reef homes, current lanes, luminous markers, nests, rest alcoves, safe approaches, and aquatic population capacity instead of surface walls and beds.
- Added six rendered professions: Tidewarden, Kelpkeeper, Coralwright, Pearlbroker, Glowmender, and Trident Guard.
- Added deterministic Atlantian names, profession equipment, aquatic schedules, succession, hiring and claim constraints, role-aware dialogue, finite merchant inventories, aquatic demand, a discovery questline, and repeatable settlement side-quest offers.

### Farming, building, and atmosphere

- Added renewable three-stage Moonrice and Sunroot crops.
- Let ordinary flowers planted on farmland mature into tall, pollinator-compatible forms that yield several flowers and return to their base planted stage after harvest.
- Added the five-minute Tidebreath Philter to the Alchemy Stand using a Water Bottle, Lumen Kelp Fronds, and Abyss Bloom Nectar.
- Added shared POI amenity planning for supported doors, directional torches, tables, stools, shelves, and barrels.
- Replaced discrete storm-cloud objects with a continuous dark overcast that hides the sun, moon, and stars. Fair weather retains layered puffy white clouds.

### Field guide, audio, and release assets

- Expanded the generated creature field guide from 60 to 77 production-model portraits and the plant journal from 18 to 32 entries.
- Added two Suno-generated **Tidelight Shelf** variants for coast/open-sea travel and two Suno-generated **Lantern Sea** variants for deep water and Atlantian settlements. All four ship as local MP3 assets and require no runtime Suno connection.
- Added focused asset checks for all ten declared Suno release tracks and all 77 browser-facing creature portraits.

### Compatibility and verification

- Advanced deterministic generation to version 8. Save normalization continues to accept supported generator versions 2 through 7 and migrates them to the current representation.
- Kept human-facing game version metadata separate from generator and save-schema versions; newly written worlds record `0.7.0` as their last-saved game version.
- Added focused suites for ocean generation, aquatic flora, crops, tree topology, weather, POI amenities, ocean creature lifecycles and models, Atlantian simulation/UI, portrait assets, and routed music assets.

## 0.6.0 — Hearthroads — 2026-07-11

- Added explored-world maps, Cartography Tables, wayshrines, charged fast travel, branching quests, plant discovery, alchemy, distilling, blueprints, gold, trade, banking, local ventures, and the first Hobbit and Goblin settlements.
- Added named residents, professions, schedules, faction alignment, merchant stock, crossbows, spears, Wargs, new wildlife, and the host-authoritative rules that Tidelight extends underwater.

See [ROADMAP.md](ROADMAP.md) for deliberately deferred systems rather than speculative release dates.
