# Blockwild

Blockwild is an endless browser voxel-survival game built with TypeScript, React, and Three.js. A seed produces a deterministic world of streamed 16 x 16 chunks, 24 biomes, cave networks, surface, underwater, and subterranean settlements, temples, dragon lairs, changing weather, creatures, and terrain running from Y -64 to Y 127. The game supports survival and builder modes, browser-local world management, adaptive touch controls, and direct host-authoritative multiplayer sessions. The current in-game release is **v1.1.0 Shared Wilds**.

The project is a real game rather than a voxel-rendering demo. You can mine, build, craft, smelt, farm, fight, collect field notes, manage several worlds, and carry those worlds between browsers with export files.

**Play the current hosted build:** [blockwild.noahhicks.chatgpt.site](https://blockwild.noahhicks.chatgpt.site)

![Blockwild field guide with all 121 rendered creatures](public/creatures/blockwild-creatures.svg)

The Courser family now includes five ecological breeds. Wildwood Coursers keep to meadows and old forest roads; broad-hoofed Rimehoofs cross Frostpine snow; lean Sunscars run desert washes; Mirestrides test Siltfen ground; and luminous Starboughs travel Glimmerwood at night. Deepgear Golemsmiths also sell and forge a sixth mechanical riding construct, the brass-and-steel Deepgear Courser.

## v1.0 Realms and Recall

Realms and Recall adds Wood Elves and Dwarves as optional world factions. Luminous Moonbough Enclaves occupy the new Glimmerwood biome with Moonbough trees, glowing flora, Glowfin ponds, Glimmerharts, Runeowls, Moonveil butterflies, leaf-magic guards, tomes, bows, potions, and tiled walled towns. Deepgear Holds sit beneath the snowcapped Snowcap Range, connected to the surface by guarded mountain entrances and lit with high-output brass lanterns. Their carved streets contain powderworks, flintlocks, Copper Moles, aligned automatons, and a mana-fed Golem Forge for three blueprint-gated golem tiers.

Sea Dragons extend the persistent dragon lifecycle with fast swimming, capable land travel, deliberately slower flight, deep-ocean nests, tide-aware incubation, aquatic attacks, Tideglass armor, and Atlantian-sold nest charts. Dragon care exposes individual stage, travel, power, ward, growth, and equipment information. All four dragon families keep sex, genetics, growth, lair, ownership, commands, cargo, armor, carried scales, and survival records when their chunks unload.

Capture Orbs can be attuned to a specific conscious creature. An attuned companion can be summoned or recalled from the same orb at any distance; recall preserves its exact state and returns it in a white sparkle. A fainted companion returns automatically, remains locked to its orb, and must heal before it can be summoned or unattuned. Crafted apiaries accept neutral or bonded queen entities and exact worker-bee records, and friendly colonies allow workers to be inserted or removed through the hive interface.

The Waygrid adds searchable digital item and creature storage. Item cells provide 1,000, 10,000, or 100,000 units of capacity; connected terminals show exact use, search stacks, and spill only the precise overflow if capacity is removed. The creature archive preserves complete Capture Orb metadata and heals stored creatures more slowly than a dedicated Healing Station. Crafting can atomically draw a complete recipe from the player, the Waygrid, and nearby owned chests without consuming a partial set on failure.

Multiplayer state is explicitly host-owned for every player. Inventories, selected slots, equipment, health, hunger, appearance, skills, mob health/death, drops, PvP, shared chests, and reconnect state come from the host world instead of leaking in from a guest's local save. The host ending the session returns guests to the title screen, and a departed guest can rejoin with the same code. Renderer previews share one disposable WebGL context, preventing menu remounts from evicting the live world renderer into a white canvas.

## What is in the game

- **Endless deterministic terrain.** Twenty-four named biomes are generated from a text seed, including variable ocean shelves and basins, rivers, Sunwash Coast, forests, wetlands, deserts, snowfields, highlands, volcanic wastes, Cloudreed Glen, Rainveil Jungle, Sakurabloom Grove, Lumen Trench, Sugarplum Vale, bioluminescent Glimmerwood, and the snowcapped Snowcap Range. Caves, aquifers, lava, ores, and structures extend through terrain from Y -64 to Y 127.
- **Survival and builder modes.** Survival tracks health, hunger, armor, XP, tool durability, fall and lava damage, hostile nights, and dropped inventory. Builder mode provides fast harvesting, infinite placement, and a creative catalog.
- **A full item loop.** The 36-slot inventory supports stacking, splitting, double-click collection, hotbar selection, equipment slots, dropped items, and shift-click transfers. Hand crafting uses a 2 x 2 grid; crafting tables unlock shaped 3 x 3 recipes. The searchable recipe book previews patterns on hover and stages ingredients into the board when clicked; it never silently crafts an output. Mirrored axe patterns work from either side. Advanced crossbows, spears, faction tonics, Honeymead, Sugarcourt arms, Sugarplate armor, dragonbone arms, scale armor, dragon husbandry, and incubation stay locked until their physical blueprints are learned; duplicate blueprints remain saleable. Tools, armor, materials, plants, food, torches, doors, beds, boats, Capture Orbs, nets, dragon tack, eggs, tomes, workstations, bottles, jars, and filled buckets have purpose-built full-size inventory icons and held models instead of flat color swatches.
- **Machines, storage, farming, and brewing.** Furnaces continue processing against real elapsed time. Chests hold 27 slots, adjacent chests merge into 54-slot storage, and the searchable Waygrid scales from 1,000-item cells through 100,000-item cells while supporting atomic area crafting from the pack, digital storage, and nearby chests. Capture Orb Racks display preserved creatures, Healing Stations restore four at a time, and a separate searchable creature archive heals larger collections slowly. Alchemy Stands turn bottles, water, fruit, cave materials, honey, flowers, gold, and dragon hearts into health, travel, faction-specific, Tidebreath, Peppermint Rush, Marshmallow Ward, Moonstep, Verdant Renewal, and permanent-capacity Manaheart Draughts. Distilleries ferment Honeymead, Sugarworks run timed candy batches, and mana-fed Golem Forges assemble four blueprint-gated automatons, including the rideable Deepgear Courser, only after every resource is committed. Farming covers hydrated soil, scythe replanting, cultivated flowers, regrowing berries, orchards, and waterlogged flora.
- **Placement-aware building pieces.** Floor torches stand upright, while torches placed against a side face lean out from that wall, persist their direction, and break when their support disappears. Doors render textured narrow edges instead of exposing an untextured slab.
- **Connected enclosures.** Wildwood fences join neighboring fences, gates, and solid blocks; closed pieces use 1.25-block collision while open gates remain pathable. Braided Leads attach creatures to the player and can be hitched to an enclosure.
- **Beds and flexible time skipping.** A Wildwood Bed can advance the world from any hour to the next dawn or next dusk, always moving forward. Multiplayer worlds can require any player, a configurable percentage, or every connected player to choose the same destination.
- **Material progression through draconic craft.** Wood, stone, sunmetal, and star-crystal tools have different mining speeds, damage, harvest requirements, and durability. Trailhide and sunmetal armor reduce incoming damage and wear down in use. The Dragonwake branch adds a 2,400-use Dragonbone Greatsword, 2,600-use Pickaxe, 2,500-use Axe, and complete Fire, Ice, and Steel scale-armor sets behind learned treatises.
- **Two living field guides.** The filterable creature bestiary tracks discovery, kills, captures, taming, breeding, food, sentience, drops, habitat, activity, behavior, utility, lore, and a dedicated Golem category for 113 core creatures and eight butterfly species. Each of the 121 entries and list icons uses a front-three-quarter portrait rendered from the same model as gameplay, with a completion ring and a hidden post-tame section where relevant. Unknown entries retain a habitat clue instead of becoming blank cards. A separate plant journal covers 39 trees, crops, bushes, flowers, aquatic plants, and wild growths with their habitat, growth rules, drops, and practical use.
- **Creature keeping.** Waykeeper Capture Orbs preserve health, age, baby state, name, temperament, faction alignment, ownership, pet commands, taming progress, and species-specific state. Friendly and neutral creatures can be moved freely; hostiles must be below half health or at one heart. Tamed, named, POI-resident, and enclosed creatures are protected from normal despawning. Eligible wildlife can be fed, healed, bred, and raised from babies. Shadecrawlers, Reedstriders, all five living Courser breeds, the Deepgear Courser, Wargs, Worldshells, Aetherbells, and Taffalo have trust, growth, saddle, cargo, or riding paths; Tidepups, Sakurakits, Taffy Hounds, and Praline Cats cover different companion roles. Aligned borough pets retain their Sugarcourt provenance through capture and release and remain untameable; only unaligned stock can bond with a player. Connected Butterfly Conservatory blocks fuse into clean habitats up to 20 blocks, accept jarred butterflies and eligible small orb-preserved wildlife with exact metadata, add flowers and branches by tier, contain flight to their cells, and permit capped in-habitat breeding.
- **Persistent dragons.** Fire, Ice, Steel, and Sea Dragons use one migration-safe state contract for age, five growth stages, sex, genetics, health, ownership, home lair, commands, equipment, two cargo modules, carried scales, breeding cooldown, and survival outside the active simulation radius. Wild dragons can unload at distance but are exempt from ordinary cleanup. Sea Dragons use swim-first travel attributes and abyssal nests; hatchlings can bond and perch on a shoulder, while stage-three adults can be saddled and flown. Same-type, opposite-sex breeding yields physical eggs, food heals injuries, Dragon Meal adds a growth day, and renewable scales accumulate every three world days for collection through the dragon care interface.
- **Apiaries and living pollinators.** Wild hives hold a queen and up to eight workers. Workers seek flowers, gather nectar, and return at dusk; crafted apiaries activate from a Queen Cell or an exact neutral/tamed queen entity, accept and release friendly worker records, grow their own workforce, and store up to 12 Wildflower Honey and 12 Royal Jelly. Breaking a wild hive releases an angry colony. A neutral queen can bond through Royal Jelly, while an agitated queen must first be weakened; workers can be netted and transferred without losing their hive metadata.
- **Physical, path-aware wildlife.** Medium and large ground creatures collide with players and each other, route around blocked terrain, liquids, ledges, crowds, and closed doors, and pass through open gates and doors. Following companions match travel speed, form widening offset rows instead of crowding the camera, and safely teleport back when separated beyond recovery distance.
- **Water and food-liquid ecology.** Water animates, flows downward and outward, renews a source between supported adjacent sources, and has oxygen/drowning mechanics. Players naturally sink, can swim upward, crouch-dive, and get enough lift at a bank to climb onto land. Honey and syrup use the same bounded liquid queue but spread less far, never renew, and slow movement more heavily; Syrupfins remain confined to natural syrup rather than ordinary water or honey. Variable rivers and oceans run deeper and reject surface flora from occupied water cells. Seven waterlogged flora species render inside water without replacing its source; they can be targeted, broken back into water, replanted, and, where appropriate, grow upward to bounded heights. Habitat-weighted schools include Glassfins and Lanternjaws, while Abyss Skaters stay near the seafloor, rare Dreadcoils hunt exposed swimmers, and leviathans remain much rarer than ordinary fish. The two-seat Wayfarer is a larger sailboat with a working sail and an 18-slot cargo hold opened with crouch-right-click.
- **Temples, lairs, and biome landmarks.** Sparse desert and forest temples contain generated chests, Reliquary Sentinel guardians, and a rare 4,096-use Sunward Compass that points toward nearby unopened structure caches. Peelop groves, meadow butterfly sanctuaries, abandoned apiaries, and Waykeeper healing grottoes add deterministic landmarks, their own inhabitants, and rare loot without turning the world into a dense POI map. Much rarer dragon lairs occupy bounded underground regions, contain stage-four or stage-five permanent guardians, and slice cleanly across chunk seams without retaining distant cavern geometry. A shared amenity pass gives surface structures supported doors, directional torches, tables, stools, shelves, and barrels while preserving their clearings from generated trees.
- **A map that records actual exploration.** Press `M` to open a biome-inked parchment map of chunks that have rendered for the local player. It supports 1x-12x zoom, panning, heading, and connected-player markers. Discovered natural POIs, all four dragon lair/nest types, the active bed spawn, and crafted wayshrines appear automatically; manual markers can be named and removed but are never legal fast-travel targets. Type-specific Lair Survey Charters and Atlantian Sea Dragon Charts reveal the nearest still-unknown matching elder lair without generating its chunks. A two-seat Cartography Table merges explored chunks and transferable markers without leaking personal beds or travel charges.
- **Bounded fast travel.** Drinking a Wayskip Draught banks one map journey to a known natural POI, active bed spawn, or wayshrine. A player standing at one wayshrine can travel to another known shrine without spending a charge. Both routes channel for five seconds and cancel if the player moves or takes damage.
- **Branching quests with real failure state.** Press `J` for the Hearthroads quest journal. The opening main line branches through surviving, settlement discovery, first trade, and Dragonwake progression; faction branches now include Glimmerwood, Deepgear, and Sea Dragon work. Quests can carry multiple objectives, prerequisites, gold/item/blueprint/alignment rewards, deadlines, and giver-dependent failure. As many as three active quests can be pinned at once. Side quests can be abandoned and reaccepted when their definition allows it; delivery rewards resolve through the giver rather than appearing at the moment an objective counter changes.
- **Reusable tomes and attuned spellcasting.** Reading a spell tome records knowledge without consuming the item. Knowledge can therefore precede attunement, while actual casting requires completion of the Dragonwake Accord. Flame Jet, Frost Lance, Steel Spear, Healing Light, Blinkstep, and Arcane Ward cover five schools and use authored mana costs, cooldowns, targeting, projectile/effect plans, hand poses, particles, and sound cues. The spell journal owns a configurable favorite list; tap `Q` to cast the current spell or hold it for the radial wheel, which grows from one to ten slots.
- **Uncapped character progression.** Melee, Ranged, Mining, Crafting, Survival, Husbandry, Exploration, and Magic advance through relevant play. Next-rank XP rises linearly to rank 1000, each rank adds one percent to its core multiplier, every 25 ranks grants a perk point, and the overall character level has no ceiling. Mining changes break speed; Melee and Ranged change damage; Ranged changes reload time; Magic changes damage, mana regeneration, and summon effectiveness. Each discipline unlocks its own opt-in Ascendant trait independently at rank 1000, and Magic mastery removes mana cost.
- **Surface, underwater, and subterranean settlements.** Sparse Hearthkin Freeholds, Brassroot Clanholds, Sugarcourt Bonbon Boroughs, Lethari Moonbough Enclaves, Deepgear Holds, and Atlantian Lumen Tidemoots generate with biome-aware spacing and culture-specific topologies. Wood Elves use connected tiles, paths, a continuous living perimeter and one guarded gate; Dwarves use a surface entrance, guarded ramp, civic cavern, deep forge layer, brass lanterns, and automatons. Named residents follow role-aware daily plans, civilians avoid danger, guards protect approaches with faction equipment, and settlement lights suppress nearby monster spawns.
- **Faction standing and direct trade.** The player plus Hobbits, Goblins, Atlantians, Sugarcourt, Wood Elves, and Dwarves have separate faction records. Quests and fair work raise standing; killing residents or aligned animals lowers it, and sufficiently low standing makes a faction hostile. Merchants carry finite stock and gold, value goods by profession, accept ordinary inventory items, and restock over time. Wood Elf stock covers bows, tomes, formulas, and neutral magical companions; Dwarf stock covers flintlocks, ammunition, alloys, golem plans, and Copper Moles. Trade commits inventory and payment atomically so a failed transaction cannot mint gold or lose stock.
- **Hobbit banking and local ventures.** Goldkeepers accept free deposits and withdrawals. Deposits compound by exactly 5% for each elapsed world day. Four fictional settlement ventures change price deterministically over time, trend upward over a long horizon, and split shares when their nominal price grows too high. This is a game economy, not a market simulation.
- **Sentient residents and new wildlife.** Seven Wood Elf and seven Dwarf professions bring the sentient roster to 39 entries. Glimmerwood adds Glimmerharts, Runeowls, Glowfins, and Moonveil Wings; Snowcap adds Copper Moles and three golem types; Sea Dragons join the ocean food web without displacing ordinary schools. All earlier Sugarcourt, Tidelight, Hearthroads, and wilderness creatures remain in the same production-model field guide.
- **Crossbows and mounted combat.** Hobbit blueprints unlock a one-bolt Hearthguard Crossbow and a stronger Wayfarer Crossbow; Goblin blueprints unlock a reach-focused spear. Hold right mouse to aim a crossbow, use left mouse to fire, and press `R` to load a bolt from the pack. The HUD shows loaded and spare ammunition, and melee and ranged attacks remain available while riding supported saddled mounts.
- **A changing sky and soundscape.** Day/night lighting, larger sun and moon discs, stars, layered puffy white cloud banks, biome-aware rain, thunder, snow, mist, sandstorms and ashfall, underwater and underground atmosphere, falling leaves, animated torchlight, sampled creature calls, terrain-aware footsteps, falling cues, synthesized fallbacks, and biome/activity-driven music respond to the world state. Rain particles and rain ambience require open sky, so caves and covered interiors stay dry. Thunderstorms remove discrete cloud objects, close the entire visible sky into an overcast layer, and fully hide the sun, moon, and stars. Fire, Ice, and Steel Dragons have distinct layered ambient, roar, pain, death, wing, melee, breath, projectile, and egg-crack voices that scale with their stage. Combat music persists through the post-fight cooldown and alternates dedicated encounter cues; Hobbit, Goblin, and Atlantian settlement themes follow the current owner or culture of the nearby town. Coastal, deep-sea, combat, Hobbit, and Goblin scenes include tested local Suno-generated MP3 variants.
- **First- and third-person play.** The camera cycles between first person, rear third person, and front third person. Local and remote player models are articulated and animate for movement, crouching, running, mining, and held items. Shared production models put tools at a forward working angle and render nets, chests, apiaries, Capture Orbs, workstations, buckets, and captured butterflies clearly ahead of the hands. The female variant has a distinct black-haired, shorter rig and matching eye height.
- **Adjustable performance policy.** Render distance defaults to 10 chunks and scales to 16, while simulation distance defaults to 8 and never exceeds the view. Adaptive budgets protect frame time; optional CPU and memory reserve modes trade additional local resources for steadier streaming. The settings menu can enable a compact live FPS counter.
- **One-code multiplayer.** A host chooses one short invite code and shares it with guests. Guests can join directly from the title screen and wait for the host's authoritative snapshot without creating or saving a throwaway local world. A lightweight [Trystero](https://github.com/dmotz/trystero) rendezvous exchanges the underlying WebRTC offer and answer automatically. Per-peer offer/answer flights are idempotent, guest-first joins retry transient signaling races, and normal WebRTC cleanup cannot overwrite a successful join with a false error. The existing manual exchange remains under an advanced fallback. The host stays authoritative for the world, multiplayer menus do not pause the simulation, and there is no cloud-owned save.
- **Browser-owned, culture-selectable worlds.** The title screen manages multiple local worlds with rename, duplicate, delete, import, and export operations. Advanced creation exposes one switch per NPC faction plus All and None controls. Those choices are saved, validated in multiplayer snapshots, and projected into deterministic settlement planning; omitted legacy data enables every faction, while an explicit empty list remains a valid wilderness-only world. Saves are versioned and older supported saves are migrated without regenerating their edited blocks.

## Gameplay loop

Start with a few moonberries and whatever the seed gives you. Harvest a tree, turn a log into planks, build a crafting table, then move through wood, cobblestone, sunmetal, and star crystal. A furnace opens smelting, cooked food, glass, and charcoal. Chests make a permanent base practical; doors, directional torches, crops, saplings, armor, and a bed make it survivable.

The surface is safer in daylight, though not empty. At night and underground, hostile creatures become a larger part of the resource loop. Their drops unlock equipment and building materials while the bestiary records what you have learned. Deeper terrain carries better ores, lava, aquifers, and more dangerous encounters.

The ocean is its own progression route. A Wayfarer carries two players and a small hold across the surface; a Tidebreath Philter brewed from one Water Bottle, two Lumen Kelp Fronds, and one Abyss Bloom Nectar gives five minutes of underwater breathing. Tameable sea companions and rare leviathans reward longer expeditions, while Atlantian Tidemoots add trade, quests, and safe lit destinations below the waterline.

Sugarplum Vale offers a separate craft route. Harvest Gumdrops, Lollipop Petals, Marshmallow Tufts, peppermint, cocoa, Candywood, honey, and pond syrup; farm the two new crops; then build a Sugarworks to boil masonry and Tempered Candy Alloy. Sugarcourt Candysmiths and Sugarboilers sell finished goods and the physical patterns needed to make equipment or brew their two potions yourself. Bonbonwings release with ordinary use and can instead be eaten with crouch-use. Wild Taffalo can be bonded and saddled, while neutral Taffy Hounds and Praline Cats come from Kennelkeeper Capture Orbs rather than from the borough's aligned companions.

The Dragonwake route begins after the first Hearthroads trade. Explore until a deep lair is revealed naturally or buy the matching Survey Charter, then prepare for a stage-four or stage-five guardian whose attacks change with distance and line of sight. Its hoard supplies Gold Blocks, scales, bones, rare tomes, and the treatises needed for dragonbone gear, scale armor, incubation, and husbandry. A recovered egg can hatch in its element or become a controlled placement through an Incubator. A bonded hatchling grows over world days, produces harvestable scales, accepts broader equipment at stage three, and eventually becomes a combat-capable flying mount.

Spell knowledge is collectable before the character can use it. Read a tome to copy the spell into the journal, place the still-intact volume on a Tome Display or six-book Archive Shelf, and complete the Dragonwake Accord to awaken mana. The initial six-spell set mixes direct attacks, healing, defense, and movement; favorites live on the `Q` wheel. Normal play feeds the eight skill tracks, while crafted Manaheart Draughts and quest rewards expand the long-horizon magic progression.

Craft a Wildwood Bed at a crafting table with three Cloudwool across the top row and three Wildwood Planks below. It needs two clear, supported blocks and points away from the player when placed. Right-click either half to choose the next dawn (about 6:30 AM) or next dusk (about 6:30 PM); this works at any time and never rewinds the clock.

World creation exposes controls for difficulty, day length, multiplayer rest policy, mob and butterfly density, cave frequency, biome scale, resource abundance, structures, inventory retention, friendly fire, and which of the six NPC factions may generate settlements and aligned residents. Selecting no factions creates a valid wilderness-only world without removing those cultures' home biomes or ordinary wildlife. Weather belongs to the seeded biome-aware world simulation rather than a player-facing toggle. Percentage-based rest rules accept a 10%-100% threshold and default to 50%.

## Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` | Move relative to the camera; double-tap `W` to sprint |
| Mouse | Look; click the world to capture the pointer |
| `Space` | Jump, swim upward while held, dismount a boat or ordinary creature, or ascend while flying a dragon |
| `Shift` | Crouch, move quietly, stop at ledges, dive faster, descend while flying a dragon, or bypass a block's normal use action while placing |
| `Ctrl` | Sprint while moving (alternate to double-tap `W`) |
| `V` | Cycle first person, rear third person, and front third person |
| Left mouse | Hold to mine, swing a melee weapon, attack a creature, or fire a loaded crossbow |
| Right mouse | Use, place, open, eat, plant, milk, till, harvest, pour, rest, board, catch, or release; hold to aim a selected crossbow; crouch-use places on interactive blocks, eats a held Bonbonwing, opens boat cargo and pet commands, or hitches a lead to a fence |
| `1`-`9` / mouse wheel | Select a hotbar slot |
| `E` | Open the inventory and 2 x 2 crafting grid |
| `M` | Open the explored-world map |
| `J` | Open the quest journal |
| `K` | Open the spell journal and favorite editor |
| `L` | Open the skill trees and Ascendant controls |
| `R` | Reload the selected crossbow from loose bolts |
| Tap `Q` | Cast the selected learned spell after attunement |
| Hold `Q` | Open the dynamic favorite-spell wheel; release after choosing a slot |
| `G` | Drop one item from the selected stack |
| `Z` / `X` / `C` | While riding a dragon: melee / breath / ranged attack; held items remain usable |
| `F` | Dismount a dragon without consuming its flight controls |
| Middle mouse | Pick the targeted block in builder mode |
| `F3` | Toggle coordinates, depth, chunk, seed, mode, and weather diagnostics |
| `H` | Show the compact control reminder |
| `Esc` | Pause or close the current menu |

Rideable creatures must be bonded, adult where required, and equipped by right-clicking them with a Trail Saddle or Dragon Saddle. Right-click again to mount. Adult leviathans accept a Chest while bonded; crouch-right-click opens their cargo. Mounted Aetherbells follow the camera pitch while moving through water or air, and `Space` dismounts ordinary creatures or boats. A stage-three-or-older saddled dragon uses `Space` and `Shift` for vertical flight, `F` to dismount, and `Z` / `X` / `C` for its three independent attacks.

Touch-primary devices get an on-screen movement pad, touch-look zone, jump, mine, place/use, hotbar, and pause controls. Hybrid touchscreen PCs stay in mouse/keyboard layout until an actual primary touch event; Settings can force touch controls on or off.

## Multiplayer model

Multiplayer is a session layer over the host's existing world, not a shared cloud account:

1. The host opens **Pause > Multiplayer**, chooses a name and invite code, then selects **Host with this code**.
2. Each guest enters the same code from the title screen or **Pause > Multiplayer**, then selects **Join with code**. Blockwild performs the WebRTC negotiation in the background.

The host owns the world catalog entry and sends authoritative state for player poses, appearance, per-player inventory/equipment/skills/vitals, selected hotbar slot, terrain edits, shared chests, creatures and health, drops, PvP, Wayfarer positions/passengers, held lights, time, weather, world options, settlements, and rest votes. A time skip resolves only when enough connected players choose the same dawn or dusk target under the world's Any Player, Percentage, or All Players rule. Map knowledge remains personal until two players use the same Cartography Table; that exchange is bounded, idempotent, and omits personal beds and travel charges. Guests receive session state but do not gain ownership of the host's save. Reconnect state is keyed to the same player identity, and closing the host session returns guests to the title screen. The invite code scopes the decentralized signaling room and should only be shared with people you trust.

Sessions require a secure context and browser WebRTC support. One-code discovery uses Trystero's Nostr signaling strategy; the negotiated game session remains peer-to-peer and host-authoritative. The default connection uses a public STUN server but has no TURN relay, so restrictive NAT or firewall configurations can still prevent peers from connecting. The advanced manual offer/answer flow is retained for rendezvous outages, but it does not solve a network that blocks direct WebRTC.

## Repository layout

```text
blockwild/
|- app/
|  |- page.tsx                 Next.js entry; mounts the game
|  |- globals.css              Game UI, menus, HUD, and responsive controls
|  |- chatgpt-auth.ts          Optional Sites identity helper; unused by the game
|  `- game/
|     |- VoxelGame.tsx         React shell: menus, HUD, inventory, and overlays
|     |- engine.ts             Three.js simulation, physics, combat, and interaction
|     |- world.ts              Terrain generation, chunks, meshing, and block edits
|     |- caves.ts              Cave mouths, chambers, chimneys, and strata
|     |- world-storage.ts      Local catalog, migration, exports, and faction options
|     |- data.ts               Blocks, items, recipes, loot, fuel, and smelting
|     |- map-system.ts         Explored chunks, markers, cartography, and fast travel
|     |- quests.ts             Questlines, objectives, failure state, and turn-ins
|     |- HearthroadsPanels.tsx Map, quest, station, trade, bank, and town interfaces
|     |- dragons.ts            Pure dragon lifecycle, care, breeding, combat, loot, and saves
|     |- dragon-world.ts       Lairs, survey scans, incubation content, and book storage
|     |- dragon-effects.ts     Fire, ice, steam, spear, and impact render effects
|     |- DragonPanel.tsx       Dragon care, commands, tack, scales, and cargo interface
|     |- magic.ts              Spell catalog, tomes, mana, casting, and Q-wheel input state
|     |- skills.ts             Rank-1000 skills, linear XP, perks, and Ascendant state
|     |- DragonMagicPanels.tsx Spell journal, wheel, mana HUD, and skill interfaces
|     |- blueprints.ts         Save-backed recipe knowledge and duplicate resale
|     |- digital-storage.ts    Waygrid item/creature cells, search, healing, and area craft
|     |- WaygridPanels.tsx     Searchable item and creature archive interfaces
|     |- v1-cultures.ts        Wood Elf/Dwarf tile layouts, golem plans, and Sea attributes
|     |- GolemForgePanel.tsx   Blueprint/resource/mana-gated automaton forge interface
|     |- alchemy.ts            Potion and distillery recipes, batches, and timed effects
|     |- candyworks.ts         Sugarworks recipes, atomic batches, output, and save codec
|     |- factions.ts           Alignment, diplomacy, cultures, and canonical spawn choices
|     |- economy.ts            Gold wallet, merchants, banking, and local ventures
|     |- settlements.ts        Surface, aquatic, subterranean, and tiled culture settlements
|     |- hearthroads-adapter.ts Item/resource translation for economy and stations
|     |- plants.ts             Flora journal, aquatic entries, and discovery records
|     |- farming.ts            Crops, aquatic growth, tree felling, and husbandry blocks
|     |- world-effects.ts      Bounded falling leaves and shared torch flicker samples
|     |- mobs.ts               Creature definitions and bestiary data
|     |- mob-models.ts         Canonical production models shared by game and tools
|     |- fauna.ts              Habitats, social groups, leviathan lifecycles, and mount rules
|     |- creature-pathing.ts   Collision profiles, routing, follower formations, and recovery
|     |- creature-care.ts      Generic feeding, breeding, babies, and maturation
|     |- creature-sounds.ts    Species event cues and synthesized fallback metadata
|     |- peelop.ts             Pet taming, care, commands, naming, breeding, and persistence
|     |- shadecrawler.ts       Trust, taming, growth, saddle, and mount progression
|     |- creature-cage.ts      Exact creature metadata capture/release codec
|     |- capture-orbs.ts       Attuned orbs, exact recall, four-slot racks, and timed healing
|     |- apiary.ts             Queen/worker lifecycle, nectar, honey, jelly, and hive breaks
|     |- ecology.ts            Herds, shoals, connected tree forms, and submerged flora
|     |- butterflies.ts        Butterfly spawning, flight, capture, and release
|     |- butterfly-exhibit.ts  Connected habitat topology, capacity, flowers, and poses
|     |- boats.ts              Two-seat Wayfarer model, storage, and water movement
|     |- liquids.ts            Bounded water, lava, honey, and syrup flow contracts
|     |- weather.ts            Biome weather, fair cloud fields, and storm overcast planning
|     |- structures.ts         Temples, groves, sanctuaries, markers, and loot tables
|     |- projectiles.ts        Visible swept-collision arrow projectiles
|     |- performance.ts        View-distance policy, sampling, and adaptive budgets
|     |- version.ts            Human-visible release identity used by saves and title UI
|     |- model-specs.ts        Shared box-model specifications and grounding data
|     |- player-model.ts       Local/remote player model and pose interpolation
|     |- held-items.ts         Shared first-person, third-person, and remote held models
|     |- multiplayer.ts        WebRTC signaling, channels, protocol, and peer state
|     |- invite-rendezvous.ts  One-code Trystero discovery and automatic negotiation
|     `- audio.ts              Music scenes, sampled effects, and synthesized audio
|- public/                     Music, effects, generated creature portraits, and icons
|- scripts/
|  |- render-models.ts         Inspection sheets, creature portraits, and manifest
|  |- render-dragon-magic-audit.ts
|  |                            Responsive spell/skill interface audit captures
|  |- benchmark-simulation.ts  Repeatable liquid/POI/weather/chunk CPU benchmark
|  |- install-ci.sh            Bounded, locked Sites dependency install
|  |- build-verified.sh        Bounded Vinext build plus artifact validation
|  `- validate-artifact.sh     Checks the Worker export and hosting manifest
|- tests/                      Node test suite for game and deployment behavior
|- worker/index.ts             Cloudflare Worker/Vinext request entry point
|- build/sites-vite-plugin.ts  Packages the Sites deployment artifact
|- vite.config.ts              Vinext, Sites, and local Worker configuration
|- CHANGELOG.md                Current named-release notes and compatibility highlights
|- ROADMAP.md                  Explicit post-1.0 feature boundary
|- .openai/hosting.json        Sites project and optional binding declaration
|- db/                         Unused Drizzle/D1 scaffold; schema is intentionally empty
`- examples/d1/                Optional database example, not part of game state
```

### Runtime boundaries

React owns the interface and translates player actions into method calls on `VoxelEngine`. The engine owns mutable simulation state and emits compact HUD snapshots back to React. Keeping the frame loop outside React avoids rerendering the component tree for physics and animation updates.

`ChunkWorld` owns deterministic generation, streamed chunk sections, geometry, terrain edits, skylight data, and nearby light indices. Generated terrain is reproducible from the seed, so saves store player-made edits rather than a copy of every generated block.

`mob-models.ts` is the canonical builder for 114 core creatures, including four articulated dragon rigs, 39 sentient residents, and four golem rigs. The game engine instantiates those models directly, while the inspection script extracts their actual posed Three.js geometry for grounding checks and bestiary portraits. Eight butterfly builders complete the 122-entry field guide. `held-items.ts` reuses those builders and centralizes player-held geometry, while conservatories, attuned Capture Orbs, Waygrid archives, racks, healers, eggs, mount cargo, and faction pet sales preserve the same exact creature records.

The progression modules keep save-normalizable rules away from presentation code. Map transfer and travel validation live in `map-system.ts`; quest transitions in `quests.ts`; surface, aquatic, and Sugarcourt settlement planning in `settlements.ts`; authority-checked gold, trade, banking, and venture mutations in `economy.ts`; potion and distillery batches in `alchemy.ts`; atomic blueprint-gated Sugarworks batches in `candyworks.ts`; and deterministic populations, eggs, growth, morphing, cargo limits, and riding profiles in `fauna.ts`. `dragons.ts` owns dragon state independently of Three.js, `dragon-world.ts` plans lairs and bounded survey scans, `magic.ts` owns tome knowledge and cast plans, and `skills.ts` owns XP and mastery. Their React panels render engine snapshots and dispatch actions but do not become alternate simulation owners.

Faction selection has one canonical boundary. `factions.ts` defines the ordered NPC faction IDs and removes duplicates or unknown values. `world-storage.ts` normalizes the saved option, treating a missing legacy field as all cultures enabled while preserving an explicit empty list, then projects it into `world.ts`. Deterministic settlement planning consumes that list; it does not remove the corresponding biome or ordinary wildlife. `multiplayer.ts` accepts the same bounded list in host snapshots and rejects duplicate or invalid faction IDs.

The deployment is a Next.js 16 app compiled through Vinext and Vite for a Cloudflare Worker. D1 and R2 are currently disabled, and the game does not depend on a server database.

## Local development

Requirements:

- Node.js `>=22.13.0`
- A current WebGL-capable browser with hardware acceleration
- Linux or WSL for the checked-in lifecycle scripts: Bash, `flock`, `curl`, `sha256sum`, and GNU `timeout`

Recommended setup on Linux or WSL:

```bash
git clone https://github.com/RedLynx101/blockwild.git
cd blockwild
npm run install:ci
npm run dev
```

Open the local address printed by Vite. `install:ci` runs one bounded `npm ci`, verifies the lockfile-pinned Vinext package, and keeps its writable home, cache, temporary files, and Wrangler state under `.sites-runtime/`.

For a native PowerShell development loop, `npm ci` followed by `npx vite` can run the local server. The production build and full-test wrappers remain Bash/Linux scripts, so use WSL for the same path used by Sites. `.gitattributes` pins shell scripts to LF line endings so Windows checkouts do not corrupt those helpers.

## Tests and model inspection

```bash
npm run lint
npm test
npm run benchmark:simulation
```

`npm test` first creates and validates the production artifact, then runs the Node test suite. Core coverage includes deterministic generation, cave and river variance, chunk boundaries and streaming, save migration and failure isolation, world options, meshing, lighting, directional torches, farming and orchards, buckets, fences and leads, beds, one-code multiplayer, inventory and crafting, doors, leaves, machines and storage, creature grounding and collision, pathing and follower recovery, husbandry, apiaries, Capture Orbs, conservatories, mounts, dragon lifecycle and combat, spellcasting, rank-1000 progression, player animation, held models, water and boats, weather, map and quest transitions, blueprints, alchemy, faction authority, trade, banking, settlements, and deployment metadata. `npm run benchmark:simulation` separately profiles liquid settling, structure planning, weather/cloud planning, and radius-16 chunk ordering.

The focused release suites cover all 24 biomes, tree topology and full felling, waterlogged flora, renewable water and nonrenewing food liquids, Sugarcourt production, map/weather plans, exact apiary transfers, attuned-orb faint/recall rules, three quest pins, Waygrid capacity/search/overflow/area crafting, host-authoritative reconnect state, trade atomicity, Wood Elf/Dwarf tiled settlements, Glimmerwood ecology, golem forging and defense, four five-stage dragon families, Sea Dragon nests/charts/incubation, spellcasting, per-skill Ascendant traits, responsive interfaces, and all 122 production-model portraits.

A focused test can be run without the build wrapper:

```bash
node --import tsx --test tests/world-engine.test.ts
```

The model inspector reads the production creature and player models. It is useful for checking orientation, silhouettes, and ground contact after changing a creature, player pose, or held tool:

```bash
npm run models:render -- --out outputs/model-inspection
```

The command writes isometric, front, and side SVG sheets plus a machine-readable grounding manifest. PNG copies are also written when `sharp` is available.

To render all 122 bestiary entries as individual front-three-quarter portraits and a field-guide sheet:

```bash
npm run models:render -- --creatures --portraits outputs/model-portraits --portrait-only --portrait-png
```

The browser-facing SVGs under `public/creatures/` are generated with the same path:

```bash
npm run models:render -- --creatures --portraits public/creatures --portrait-only
```

Review the contact sheet before committing regenerated portraits. `outputs/` is ignored so temporary inspection artifacts do not enter commits by accident.

### Music provenance

The release MP3s under `public/music/` include Suno-generated combat, Hearthkin, Goblin, Tidelight, Atlantian, Wood Elf, and Dwarf themes. The v1.0 additions are `13_blockwild_moonbough_lanterns.mp3` and `14_blockwild_deepgear_hearth.mp3`; the runtime selects them near Moonbough Enclaves and Deepgear Holds and never calls Suno during play. `tests/audio-assets.test.mjs` verifies that every declared asset exists, is substantive, and has a valid MP3 header.

## Build and deployment

```bash
npm run build
npm run validate:artifact
npm run start
```

The build is intentionally bounded and non-retrying. It produces `dist/server/index.js`, packages `.openai/hosting.json`, and verifies that the Worker has an ESM `default.fetch` export. The configured Sites builder runs `npm run build` against the pushed commit. Generated `dist/`, `.sites-runtime/`, and Wrangler state should remain untracked.

No `wrangler.jsonc` is required. Local Cloudflare bindings are derived from `.openai/hosting.json`; both D1 and R2 are currently `null`.

## Saves, ownership, and limits

Worlds live in `localStorage` for the current browser and origin. A save includes its last-written game version, terrain and liquid edits, player and multiplayer-member records, inventory metadata, equipment, crafting state, loaded ammunition, vitals, time, weather, machines, shared chests, apiaries, Waygrid item/creature networks, Golem Forges, book furniture, Capture Orb racks and attunement, healing stations, conservatories, boats, persistent creatures and mount bonds, faction provenance, leviathan and dragon lifecycle/equipment/cargo data, drops, growth timers, POIs, all settlement cultures, merchants, economy state, map knowledge, quests and pins, learned blueprints and tomes, mana and favorites, skill XP/perks/Ascendant preferences, field guides, and world options including faction-spawn choices.

That design keeps single-player play private and serverless, but it has consequences:

- Clearing site data, changing origin, using a temporary browser profile, or exceeding the browser's storage quota can remove or block saves.
- Saves do not automatically follow a user to another browser or device.
- The host's browser is the only owner of a multiplayer world's persistent catalog entry.
- Long-running, heavily edited worlds can approach browser storage limits.

Use the title screen's **Export** action to create a `.blockwild.json` backup, and **Import** to restore or move it. Keep important exports outside the browser profile.

## Contributor notes

- Keep frame-by-frame simulation in the engine rather than React state. React should receive HUD snapshots and overlay state, not every entity transform.
- Preserve deterministic generation. Changes to voxel indexing, world height, seed sampling, or generated features need migration coverage and may require a generator-version change.
- Treat save compatibility as a feature. New persistent fields should have safe defaults so existing worlds still load.
- Block IDs remain byte-backed and some newer block values overlap historical item numbers. Route inventory-facing forms through `itemForBlock` and `BLOCK_ITEM_ALIASES` instead of assuming a placeable block and its item always share one numeric code.
- When adding a block or item, update its definition, placement and support rules, drop behavior, rendering or icon path, recipes where appropriate, and focused tests.
- When changing a full-size creature, start in `mob-models.ts`, then keep its `mobs.ts` definition, dimensions, foot offset, animation semantics, and tests aligned. Regenerate the bestiary portraits and review the inspection sheets visually.
- Treat dragons as durable records, not ordinary spawn-table mobs. Change lifecycle rules in `dragons.ts`, normalize every persisted field, keep lair and survey planning deterministic in `dragon-world.ts`, and verify both unloaded state and production-rig poses before touching engine-only behavior.
- Keep spell definitions, tome acquisition, casting checks, mana mutations, and `Q` key transitions in `magic.ts`; keep XP, rank curves, perk prerequisites, and Ascendant gates in `skills.ts`. React panels should render snapshots and invoke bounded engine actions rather than duplicating either rule set.
- New world options must be normalized in `world-storage.ts`, represented in multiplayer snapshots/codecs when session-relevant, and given backward-compatible defaults.
- Multiplayer changes should preserve host authority, bounded codecs, versioned envelopes, and the separation between reliable actions and disposable movement updates.
- Audio under `public/` ships with the application. Compress new tracks and effects before committing them, then wire them into scene selection rather than leaving unreachable assets.
- Do not add game persistence to the empty D1 scaffold unless the ownership and migration model is deliberately being changed.

No license file is currently included in this repository.
