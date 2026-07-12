# Blockwild changelog

Named releases summarize player-visible changes and the compatibility work that keeps browser-local worlds loadable. Dates use the repository release date.

## Unreleased - Courser Ecotypes

- Rebuilt the Wildwood Courser with tapered anatomy, jointed legs, readable side-set eyes, a layered mane and a production-grounded saddle rig.
- Added four biome-specific tameable mounts: shaggy Rimehoofs in Frostpine, Snowfield and Snowcap; lean Sunscars in Desert and Badlands; broad-hoofed Mirestrides in Siltfen; and branch-antlered Starboughs in Glimmerwood.
- Added the Deepgear Courser, a brass-and-steel piston mount sold unaligned by Dwarven Golemsmiths or assembled from its own blueprint in a mana-fed Golem Forge.
- Expanded biome spawn, herd, care, Capture Orb, saddle, mount-speed, Dwarf commerce, blueprint, forge, persistence, field-guide portrait and regression-test contracts for the new Coursers.
- Added two shared natural horse calls across the Wild Horse, all living Courser ecotypes and the Mistmane, with a separate metallic steam-whinny used only by the Deepgear Courser.
- Brought Steel and Sea Dragons up to the newer Fire and Ice art standard with pressure-engine armor, rivets and wing gears for Steel, plus tideglass scales, gills, whiskers, finlets and ray-sail ribs for Sea.
- Rebuilt Emberjays, Canopy Larks and Tidewing Gulls as distinct layered bird rigs, added snow-dwelling Frostquill coveys, and routed five lossless species and shared bird calls through ambient, hurt, feeding and breeding events.

## 1.1.0 - Shared Wilds - 2026-07-11

- Fixed guest tree felling and large connected-tree edit replication.
- Fixed host-authoritative ground-drop pickup for guests.
- Made shared chest transfers atomic with player inventory state and canonicalized adjacent chests into one 54-slot superchest.
- Added host-authoritative hostile-mob damage and full-health guest respawning.

## 1.0.0 - Realms and Recall - 2026-07-11

### Glimmerwood and the Wood Elves

- Added the cool, bioluminescent Glimmerwood biome with Moonbough trees, Moonpetals, Starferns, Dreamcaps, Lumenreeds, Glowfin ponds, Moonveil butterflies, Glimmerharts, and Runeowls.
- Added the Lethari Moonboughs as a selectable sentient faction with seven named professions, connected tiled surface enclaves, living walls, gates, luminous paths, role-aware schedules, aligned settlement creatures, neutral companion-orb stock, finite merchant inventories, faction quests, side jobs, reusable spell tomes, two formulas, and Glimmerbow progression.
- Added Verdant Volley and Starlight Snare with explicit mana, targeting, projectile, animation, effect, sound, tome, merchant, loot, and quest provenance. Leafwardens use the same three-leaf attack contract as the learnable spell.

### Snowcap Range and the Dwarves

- Added the snowcapped mountain biome and Deepgear Holds: connected subterranean settlement tiles with a guarded surface ramp, civic and industrial depth layers, carved galleries, high-brightness lanterns, brass-and-stone buildings, beds, furniture, shops, a powderworks, and a mana-fed Golem Forge.
- Added seven rendered Dwarven professions with deterministic names, entrance patrols, held tools and flintlocks, profession stock, quests, side jobs, neutral Copper Mole orbs, and aligned Copper Scout Golems.
- Added blueprint-gated Copper Scout, Stone Bulwark, and Aetherforged Sentinel construction. A forge validates the learned plan, complete resource bundle, output capacity, and committed mana before beginning a timed job. The three golems have distinct utility, defender, and guardian statistics and their own bestiary group.
- Added Deepgear Flintlock pistols, lead ammunition, blueprints, lanterns, alloys, gear clusters, furniture, and station blocks. Human settlements, human muskets, drills, broader factory machinery, and chunk loaders remain deferred.

### Sea Dragon and field-guide integration

- Added Sea Dragons to the persistent five-stage dragon lifecycle with sex, genetics, growth, eggs, breeding, husbandry, saddles, armor, two cargo modules, renewable scales, permanent world records, articulated production rigs, brine breath, ranged pressure attacks, and type-aware meat, scales, bones, hearts, skulls, and egg drops.
- Sea Dragon attributes favor fast swimming, useful shore movement, and slower flight. Rare open-water nests generate on a separate abyssal region grid with moon-slate ridges, luminous reef growth, eggs, a persistent guardian, a map landmark, and elder hoards.
- Atlantian Pearlbrokers can stock Sea Dragon Nest Charts. Charts scan the same deterministic nest planner as world generation, skip known nests and continental cells, and mark the nearest matching stage without loading the destination chunks.
- Added two Atlantian-assisted Sea Dragon quests for finding a nest and raising a tidebound hatchling. The production portrait catalog now exports Sea Dragons, both new sentient cultures, their creatures, and all three golems from the exact gameplay rigs.

### Journal, flora, and compatibility

- Quest books now support as many as three simultaneous HUD pins while preserving the legacy single-pin save alias. Static discovery quest **The Light Below** no longer binds acceptance or pinning to a transient Atlantian resident.
- Added a separate Lumenreed Frond planting item and a four-block aquatic growth cap, so the new waterlogged plant can be harvested, carried, replanted, and grown without displacing water. Moonpetals now cultivate into a distinct tall pollinator-compatible stage on hydrated farmland.
- Added deterministic tests for connected culture tiles, underground settlement depth, golem forge gates, full merchant/item/spell/quest/model rosters, three-pin migration, Sea Dragon travel attributes, chart scans, and real generated nest markers. Every new ground model passes the production inspector with exact floor contact.
- Advanced deterministic generation to version 11 for the two new biomes and cultures, Sea Dragon nests, sparser landmark grids, connected wild peppermint, cave-mouth plant exclusion, and the full rooted-tree rewrite. Supported generator-v10 worlds migrate without discarding authored edits or release metadata.

### Attuned recall, apiaries, and Waygrid storage

- Capture Orbs can be attuned to one conscious creature, summon or recall that exact state at any distance, and return a fainted companion automatically in a white sparkle. Fainted orbs cannot deploy or unattune until Healing Stations or passive archive healing restore the creature.
- Neutral Hive Queens accept Royal Jelly without first becoming hostile. Crafted apiaries accept exact neutral or bonded queen entities, accept and release friendly workers, reject angry or foreign-owned residents, and preserve nectar/home metadata in both directions.
- Added searchable Waygrid item and creature terminals. Tiered item cells hold 1,000, 10,000, or 100,000 units, report exact utilization, and spill deterministic legal overflow when removed. Creature archives keep exact Capture Orb metadata and heal more slowly than a dedicated station.
- Crafting now plans atomically across player inventory, digital storage, and nearby owned chests. No source mutates unless the whole ingredient plan succeeds.

### Multiplayer authority and renderer stability

- Made the host authoritative for each player's inventory, selected slot, equipment, variant, vitals, XP, skills, drops, PvP, mob damage/death, shared chests, held lights, and reconnect state. Joining no longer imports a guest's unrelated local-world character, and reconnecting restores the last host-owned state.
- Guests receive smoothed 5 Hz creature snapshots and complete death animation state. Placement rejects every player body, shared chest actions use revisions, transactions commit item and gold atomically, and ending the host session returns guests to the title screen while leaving the invite code reusable for legitimate reconnects.
- Replaced per-preview WebGL renderers with one delayed-release shared preview renderer and a Canvas2D fallback. Both the preview and live renderer explicitly dispose and lose their contexts, while world rendering pauses and recovers safely after a genuine context-loss event.
- Fixed immediate hotbar HUD feedback while moving, the chest-opening pointer race, double-chest seam/lid orientation, door closing through players, cow milking consuming buckets, sentient right-click context menus, and hybrid touchscreen control selection.

### World, interface, trees, and sound

- Added biome-inked map samples, 1x-12x zoom, drag/button panning, player heading, multiplayer markers, blocky layered daily cloud fields, cloud sun/moon occlusion, fade transitions, and rain columns that continue in open space around a roofed player.
- Rebuilt generated trees around face-connected trunks and fuller owned crowns. Wide roots, larger trunks, orchard fruit, historical malformed branches, and chunk-spanning crowns now belong to one bounded felling result without swallowing neighboring builds.
- Added a dedicated Golems bestiary filter, production Wood Elf/Dwarf portraits, ingredient names in recipe previews, three independently pinned quest HUD cards, and corrected full-size Wild Apple Remedy and Slatefin Shark icon framing.
- Added the Suno-generated `13_blockwild_moonbough_lanterns.mp3` and `14_blockwild_deepgear_hearth.mp3` settlement themes, routed respectively to Moonbough Enclaves and Deepgear Holds. Bee and bird wings now flap faster with mirrored left/right rotation, and Leafwardens cast a visible three-leaf helical volley.

## 0.9.0 — Wyrmweave — 2026-07-11

### Dragons and underground lairs

- Added Fire, Ice, and Steel Dragons as three persistent production creatures. One normalized lifecycle carries sex, genetics, age, five smooth 25-day growth stages, health, home lair, disposition, ownership, commands, equipment, cargo, breeding, renewable scales, and alive state across save/load and distance unloading.
- Added fully articulated shared rigs with animated eyes, jaw, chest, three neck joints, seven tail joints, two-part wings, jointed legs and claws, breath and projectile origins, sex markers, saddles, paired cargo, and fitted armor. All three use gameplay geometry for their field-guide portraits and inspection sheets.
- Added distinct autonomous attack profiles. Every type can bite or claw, use a short-range breath, and project a ranged attack; Steel Dragons breathe scalding steam and throw a modeled metal spear. AI chooses an envelope from target distance, altitude, line of sight, provocation, and lair distance.
- Added sparse deterministic stage-four and stage-five lairs on a 704-block region grid. Elemental dragonstone caverns contain permanent guardians, Gold Blocks and piles, three or four hoard chests, type-aware scales, rare tomes and blueprints, and eggs when the guardian is female.
- Added rare Fire, Ice, and Steel Lair Survey Charters to merchant stock. Each consumed charter scans deterministic region rings and records the nearest matching elder lair that is not already known, without forcing its chunks to load.

### Eggs, husbandry, flight, and rewards

- Added physical dragon eggs with exact type, sex, genetics, parent, lair, and incubation metadata. Fire eggs need open flame, Ice eggs need freezing water, and Steel eggs need heated metal plus active steam. Natural incubation hatches in place; a blueprint-gated Draconic Incubator instead prepares a stable hatchling egg for deliberate placement.
- Added defensive hatchling bonding, meat-based healing, one-day Dragon Meal growth, stage-one shoulder carrying, follow/stay/guard/wander orders, and same-type opposite-sex adult breeding with an elemental catalyst and persistent cooldown.
- Added stage-three flight and riding with a Dragon Saddle. Mounted controls reserve `Z`, `X`, and `C` for melee, breath, and projectile attacks while normal held-item use remains available; `Space` and `Shift` control altitude, and `F` dismounts.
- Added four fitted armor positions, two visible chest modules, a dragon care interface, and a save-backed scale reserve that produces new scales every three world days. Cargo capacity derives from the number of attached chest modules rather than a separate creature inventory flag.
- Added stage-, type-, and sex-aware corpse and lair rewards: raw dragon meat, dragon bones, elemental scales and hearts, typed skulls, and possible eggs. Higher stages produce substantially larger stacks. New treatises unlock Dragonbone Greatsword, Pickaxe and Axe recipes, twelve player scale-armor pieces, incubation, tack, dragon armor, breeding catalysts, and Dragon Meal.

### Dragonwake quests and magic

- Extended the Hearthroads main line with **A Rumor Under Stone**, **Teeth of the Deep**, **The Dragonwake Accord**, and **The Fifth Shadow**. The branch moves from elder-lair discovery through a stage-four kill and draconic equipment to mana attunement and an optional stage-five mastery fight.
- Added three abandonable Dragonwake Field Studies side quests for capturing different rare creatures, delivering an elemental scale to a living scholar, and recording all three lair types. Rewards include gold and reusable spell tomes.
- Added six initial spells across Destruction, Restoration, Alteration, Conjuration, and Utility: Flame Jet, Frost Lance, Steel Spear, Healing Light, Blinkstep, and Arcane Ward. Each definition carries targeting, mana, cooldown, effect, projectile, cast pose, particle, camera, and layered sound plans.
- Spell tomes teach durable knowledge without being consumed. Players can discover and learn spells before attunement, keep or sell duplicate tomes, place one on a Tome Display, or store as many as six visible books in an occupancy-rendered Archive Shelf.
- Completing the Dragonwake Accord attunes the player and enables mana. Tap `Q` to cast the selected favorite or hold it for a radial wheel that grows to ten slots. Mana regenerates, spell cooldowns persist, and each Manaheart Draught permanently adds five capacity.

### Skills and Ascendant foundation

- Added eight save-backed skills: Melee, Ranged, Mining, Crafting, Survival, Husbandry, Exploration, and Magic. Relevant play awards skill and character XP, while next-rank costs rise linearly rather than exponentially.
- Every skill reaches rank 1000 and contributes exactly one percentage point per rank to its core multiplier, for 11 times the base at rank 1000 before perks and other effects. Character level remains uncapped, and each 25 ranks grants a perk point.
- Added sixteen prerequisite-aware starter perks spanning all eight trees. The data model supports percent bonuses, flat bonuses, and ability unlocks without embedding future perks in the save format.
- Magic 1000 makes mana effectively infinite and hides the mana bar. Mastering all eight skills unlocks the opt-in Ascendant foundation, currently a floor that prevents health from falling below ten percent; broader Ascendant switches remain future work.

### World repair, compatibility, and coverage

- Advanced deterministic generation to version 10 for bounded dragon lairs and a final tree-connectivity pass. Authored trunk islands are bridged back to the rooted component, nearby crown pieces attach before leaves are emitted, truly floating leaf islands are pruned, liquid exclusions remain intact, and POIs keep a five-block tree-free margin.
- Supported generator-v9 Sugarcourt worlds migrate without losing edited blocks. Dragon, egg, archive, tome, magic, skill, and Ascendant fields use bounded normalization and safe defaults, while dragons are explicitly ineligible for ordinary permanent cleanup.
- Expanded the generated creature catalog from 90 to 93 entries: 86 core creatures plus seven butterflies. Added dedicated dragon lifecycle, model, effects, world, content, magic, skills, and responsive UI suites alongside the existing full release gates.

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
