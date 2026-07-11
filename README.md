# Blockwild

Blockwild is an endless browser voxel-survival game built with TypeScript, React, and Three.js. A seed produces a deterministic world of streamed 16 x 16 chunks, 22 biomes, cave networks, surface and underwater settlements, temples, dragon lairs, changing weather, creatures, and terrain running from Y -64 to Y 127. The game supports survival and builder modes, browser-local world management, adaptive touch controls, and direct host-authoritative multiplayer sessions. The current in-game release is **v0.9.0 Wyrmweave**.

The project is a real game rather than a voxel-rendering demo. You can mine, build, craft, smelt, farm, fight, collect field notes, manage several worlds, and carry those worlds between browsers with export files.

**Play the current hosted build:** [blockwild.noahhicks.chatgpt.site](https://blockwild.noahhicks.chatgpt.site)

![Blockwild field guide with all 93 rendered creatures](public/creatures/blockwild-creatures.svg)

## v0.9 Wyrmweave

Wyrmweave adds Fire, Ice, and Steel Dragons as persistent creatures rather than scripted bosses. Each dragon has a sex, genetic seed, lair bond, smooth growth across five 25-day stages, stage-scaled health and collision, an unloadable save record, and a production model whose neck, jaw, eyes, legs, claws, tail, wings, breath origin, tack, cargo, and armor animate as one rig. Wild elders defend rare underground lairs with melee, breath, and ranged attacks. Fire and Ice Dragons project their elements; Steel Dragons use scalding steam at close range and throw visible metal spears farther out.

Dragon lairs are deterministic map POIs built from elemental dragonstone, hoard piles, Gold Blocks, several loot chests, rare tomes, and occasional eggs. Type-specific Survey Charters sold rarely by merchants scan deterministic world regions and mark the nearest matching stage-four-or-higher lair that the player has not already recorded. Eggs hatch naturally only under their elemental conditions—open flame, freezing water, or heated metal and steam—or can be stabilized by a Draconic Incubator into a placeable hatchling egg. Generated trees also receive a final connectivity repair so trunks reach their crowns and truly detached leaf islands are pruned before felling data is recorded.

Hatchlings are defensive but otherwise passive and can bond after patient feeding. Stage-one companions can ride on a shoulder; stage-three and older dragons accept a saddle, fitted elemental armor, and two visible chest modules, then fly under player control. Their care panel exposes commands, growth, vitality, equipment, cargo, and a renewable scale reserve. Same-type adult males and females breed with the matching elemental catalyst, while Dragon Meal advances one full world day of growth. Defeated dragons drop stage-, type-, and sex-aware quantities of meat, scales, bones, hearts, skulls, and possible eggs; larger dragons yield materially larger remains.

The Hearthroads main line now branches through finding a lair, surviving an elder dragon, crafting draconic equipment, and completing the Dragonwake Accord. Tomes can be learned before that point and are never consumed, so they remain tradeable and displayable after teaching a spell; the Accord unlocks mana and casting. Six initial spells cover Destruction, Restoration, Alteration, Conjuration, and Utility. Tap `Q` to cast the selected spell or hold it to open a radial wheel of up to ten favorites. Archive Shelves visibly fill with as many as six books, Tome Displays place one volume as decoration, and Manaheart Draughts permanently raise capacity.

Eight practice-driven RPG skills—Melee, Ranged, Mining, Crafting, Survival, Husbandry, Exploration, and Magic—use linear next-rank costs through rank 1000. Every rank contributes one percentage point to its core multiplier, character level has no cap, and milestone perk nodes leave room for deeper branches. Magic 1000 removes mana cost and hides the mana bar. Mastering every skill unlocks an opt-in Ascendant foundation, currently including a ten-percent health floor; additional Ascendant controls, dragon hybrids, and later settlement systems remain explicit future work in [ROADMAP.md](ROADMAP.md). Sugarcourt, Tidelight, and Hearthroads remain part of the same release; [CHANGELOG.md](CHANGELOG.md) carries the release-oriented history.

## What is in the game

- **Endless deterministic terrain.** Twenty-two named biomes are generated from a text seed, including variable ocean shelves and basins, rivers, Sunwash Coast, forests, wetlands, deserts, snowfields, highlands, volcanic wastes, Cloudreed Glen, Rainveil Jungle, Sakurabloom Grove, the bioluminescent Lumen Trench, and the candy-grown Sugarplum Vale. Caves, aquifers, lava, ores, and structures extend through terrain from Y -64 to Y 127.
- **Survival and builder modes.** Survival tracks health, hunger, armor, XP, tool durability, fall and lava damage, hostile nights, and dropped inventory. Builder mode provides fast harvesting, infinite placement, and a creative catalog.
- **A full item loop.** The 36-slot inventory supports stacking, splitting, double-click collection, hotbar selection, equipment slots, dropped items, and shift-click transfers. Hand crafting uses a 2 x 2 grid; crafting tables unlock shaped 3 x 3 recipes. The searchable recipe book previews patterns on hover and stages ingredients into the board when clicked; it never silently crafts an output. Mirrored axe patterns work from either side. Advanced crossbows, spears, faction tonics, Honeymead, Sugarcourt arms, Sugarplate armor, dragonbone arms, scale armor, dragon husbandry, and incubation stay locked until their physical blueprints are learned; duplicate blueprints remain saleable. Tools, armor, materials, plants, food, torches, doors, beds, boats, Capture Orbs, nets, dragon tack, eggs, tomes, workstations, bottles, jars, and filled buckets have purpose-built full-size inventory icons and held models instead of flat color swatches.
- **Machines, storage, farming, and brewing.** Furnaces continue processing against real elapsed time. Chests hold 27 slots, and adjacent chests merge into 54-slot storage. Four-slot Capture Orb Racks display preserved creatures, and Healing Stations restore four captured creatures over time with optional Cave Gel acceleration. Alchemy Stands turn bottles, water, fruit, cave materials, honey, flowers, gold, and dragon hearts into health, travel, faction-specific, Tidebreath, Peppermint Rush, Marshmallow Ward, and permanent-capacity Manaheart Draughts; Distilleries run selected timed batches and initially support blueprint-locked Honeymead. The Sugarworks runs save-backed, timed candy batches and atomically consumes inputs only when a batch can start. Hoes till soil, nearby water hydrates farmland, and wild wheat, Moonrice, Sunroot, Peppermint, and Cocoa Puffs grow through visible stages. A scythe harvests and replants mature crops in one action. Any ordinary flower planted on farmland can mature into a tall, pollinator-compatible form that yields several blooms. Moonberry and Sunberry bushes regrow fruit after right-click harvesting. Planted apples become varied orchard trees with separately harvestable hanging fruit that returns over time. Empty buckets collect water, lava, honey, or syrup and filled buckets place the same liquid again.
- **Placement-aware building pieces.** Floor torches stand upright, while torches placed against a side face lean out from that wall, persist their direction, and break when their support disappears. Doors render textured narrow edges instead of exposing an untextured slab.
- **Connected enclosures.** Wildwood fences join neighboring fences, gates, and solid blocks; closed pieces use 1.25-block collision while open gates remain pathable. Braided Leads attach creatures to the player and can be hitched to an enclosure.
- **Beds and flexible time skipping.** A Wildwood Bed can advance the world from any hour to the next dawn or next dusk, always moving forward. Multiplayer worlds can require any player, a configurable percentage, or every connected player to choose the same destination.
- **Material progression through draconic craft.** Wood, stone, sunmetal, and star-crystal tools have different mining speeds, damage, harvest requirements, and durability. Trailhide and sunmetal armor reduce incoming damage and wear down in use. The Dragonwake branch adds a 2,400-use Dragonbone Greatsword, 2,600-use Pickaxe, 2,500-use Axe, and complete Fire, Ice, and Steel scale-armor sets behind learned treatises.
- **Two living field guides.** The filterable creature bestiary tracks discovery, kills, captures, taming, breeding, food, sentience, drops, habitat, activity, behavior, utility, and lore for 86 core creatures and seven butterfly species. Each of the 93 entries and list icons uses a front-three-quarter portrait rendered from the same model as gameplay, with a completion ring and a hidden post-tame section where relevant. Unknown entries retain a habitat clue instead of becoming blank cards. A separate plant journal covers 39 trees, crops, bushes, flowers, aquatic plants, and wild growths with their habitat, growth rules, drops, and practical use.
- **Creature keeping.** Waykeeper Capture Orbs preserve health, age, baby state, name, temperament, faction alignment, ownership, pet commands, taming progress, and species-specific state. Friendly and neutral creatures can be moved freely; hostiles must be below half health or at one heart. Tamed, named, POI-resident, and enclosed creatures are protected from normal despawning. Eligible wildlife can be fed, healed, bred, and raised from babies. Shadecrawlers, Reedstriders, Wildwood Coursers, Wargs, Worldshells, Aetherbells, and Taffalo have distinct trust, growth, saddle, cargo, and riding paths; Tidepups, Sakurakits, Taffy Hounds, and Praline Cats cover different companion roles. Aligned borough pets retain their Sugarcourt provenance through capture and release and remain untameable; only unaligned stock can bond with a player. Connected Butterfly Conservatory blocks fuse into clean habitats up to 20 blocks, accept jarred butterflies and eligible small orb-preserved wildlife with exact metadata, add flowers and branches by tier, contain flight to their cells, and permit capped in-habitat breeding.
- **Persistent dragons.** Fire, Ice, and Steel Dragons use one migration-safe state contract for age, five growth stages, sex, genetics, health, ownership, home lair, commands, equipment, two cargo modules, carried scales, breeding cooldown, and survival outside the active simulation radius. Wild dragons can unload at distance but are exempt from ordinary cleanup. Hatchlings can bond and perch on a shoulder; stage-three adults can be saddled and flown. Same-type, opposite-sex breeding yields physical eggs, food heals injuries, Dragon Meal adds a growth day, and renewable scales accumulate every three world days for collection through the dragon care interface.
- **Apiaries and living pollinators.** Wild hives hold a queen and up to eight workers. Workers seek flowers, gather nectar, and return at dusk; crafted apiaries bootstrap from a Queen Cell or preserved queen, grow their own workforce, and store up to 12 Wildflower Honey and 12 Royal Jelly. Breaking a wild hive releases an angry colony. Weakened queens can be captured or bonded with Royal Jelly, while workers can be netted for Queen Cell crafting.
- **Physical, path-aware wildlife.** Medium and large ground creatures collide with players and each other, route around blocked terrain, liquids, ledges, crowds, and closed doors, and pass through open gates and doors. Following companions match travel speed, form widening offset rows instead of crowding the camera, and safely teleport back when separated beyond recovery distance.
- **Water and food-liquid ecology.** Water animates, flows downward and outward, renews a source between supported adjacent sources, and has oxygen/drowning mechanics. Players naturally sink, can swim upward, crouch-dive, and get enough lift at a bank to climb onto land. Honey and syrup use the same bounded liquid queue but spread less far, never renew, and slow movement more heavily; Syrupfins remain confined to natural syrup rather than ordinary water or honey. Variable rivers and oceans run deeper and reject surface flora from occupied water cells. Seven waterlogged flora species render inside water without replacing its source; they can be targeted, broken back into water, replanted, and, where appropriate, grow upward to bounded heights. Habitat-weighted schools include Glassfins and Lanternjaws, while Abyss Skaters stay near the seafloor, rare Dreadcoils hunt exposed swimmers, and leviathans remain much rarer than ordinary fish. The two-seat Wayfarer is a larger sailboat with a working sail and an 18-slot cargo hold opened with crouch-right-click.
- **Temples, lairs, and biome landmarks.** Sparse desert and forest temples contain generated chests, Reliquary Sentinel guardians, and a rare 4,096-use Sunward Compass that points toward nearby unopened structure caches. Peelop groves, meadow butterfly sanctuaries, abandoned apiaries, and Waykeeper healing grottoes add deterministic landmarks, their own inhabitants, and rare loot without turning the world into a dense POI map. Much rarer dragon lairs occupy bounded underground regions, contain stage-four or stage-five permanent guardians, and slice cleanly across chunk seams without retaining distant cavern geometry. A shared amenity pass gives surface structures supported doors, directional torches, tables, stools, shelves, and barrels while preserving their clearings from generated trees.
- **A map that records actual exploration.** Press `M` to open a parchment map of chunks that have rendered for the local player. Discovered natural POIs, dragon lairs, the active bed spawn, and crafted wayshrines appear automatically; manual markers can be named and removed but are never legal fast-travel targets. A consumed Fire, Ice, or Steel Lair Survey Charter reveals the nearest still-unknown matching elder lair without generating its chunks. A two-seat Cartography Table merges explored chunks and transferable markers between two players without leaking personal bed locations or travel charges.
- **Bounded fast travel.** Drinking a Wayskip Draught banks one map journey to a known natural POI, active bed spawn, or wayshrine. A player standing at one wayshrine can travel to another known shrine without spending a charge. Both routes channel for five seconds and cancel if the player moves or takes damage.
- **Branching quests with real failure state.** Press `J` for the Hearthroads quest journal. The opening main line branches through surviving day one, surviving day five, finding a settlement, and completing a first trade before the Dragonwake branch asks the player to discover an elder lair, defeat its guardian, equip draconic craft, attune to magic, and eventually face a stage-five dragon. Three field-study side quests cover rare-creature capture, scale delivery, and recording all three lair temperatures. Quests can carry multiple objectives, prerequisites, gold/item/blueprint/alignment rewards, a pinned HUD card, deadlines, and giver-dependent failure. Side quests can be abandoned and reaccepted when their definition allows it; delivery rewards resolve through the giver rather than appearing at the moment an objective counter changes.
- **Reusable tomes and attuned spellcasting.** Reading a spell tome records knowledge without consuming the item. Knowledge can therefore precede attunement, while actual casting requires completion of the Dragonwake Accord. Flame Jet, Frost Lance, Steel Spear, Healing Light, Blinkstep, and Arcane Ward cover five schools and use authored mana costs, cooldowns, targeting, projectile/effect plans, hand poses, particles, and sound cues. The spell journal owns a configurable favorite list; tap `Q` to cast the current spell or hold it for the radial wheel, which grows from one to ten slots.
- **Uncapped character progression.** Melee, Ranged, Mining, Crafting, Survival, Husbandry, Exploration, and Magic advance through relevant play. Next-rank XP rises linearly to rank 1000, each rank adds one percent to its core multiplier, every 25 ranks grants a perk point, and the overall character level has no ceiling. Magic mastery makes mana infinite. Full eight-skill mastery unlocks an opt-in Ascendant state with a safe health-floor foundation for later godlike switches.
- **Surface and underwater settlements.** Sparse Hearthkin Freeholds, Brassroot Clanholds, and Sugarcourt Bonbon Boroughs generate with biome-aware spacing, roads, walls, gates, lights, themed buildings, beds, doors, work areas, furniture, and a population soft cap. Bonbon Boroughs use Candywood buildings, Sugarworks rooms, gardens, kennels, and hard Boiled Sugarbrick defenses. Below the sea, Atlantian Lumen Tidemoots use an open, vertical topology of reef homes, current lanes, luminous markers, nests, and rest alcoves instead of surface walls and beds. Named residents follow culture- and role-aware daily plans. Civilians avoid danger, guards protect approaches with faction equipment, Goblin settlements keep aligned Road Wargs, Sugarcourt settlements keep aligned Taffy Hounds and Praline Cats, and settlement lights suppress nearby monster spawns.
- **Faction standing and direct trade.** The player, Hobbits, Goblins, Atlantians, and Sugarcourt have separate faction records. Quests and fair work can raise standing; killing residents or aligned animals lowers it, and sufficiently low standing makes a faction hostile. Merchants carry finite stock and gold, value goods differently by profession, accept ordinary inventory items rather than fixed emerald-style exchanges, and restock over time. Atlantian inventories favor aquatic materials; Sugarcourt Gardeners, Sugarboilers, Candysmiths, Sweetbrokers, and Kennelkeepers sell crops, candy materials, finished equipment, physical blueprints, potions, and unaligned pet orbs according to role. Gold lives in a dedicated save-backed wallet instead of consuming a 64-item pack slot.
- **Hobbit banking and local ventures.** Goldkeepers accept free deposits and withdrawals. Deposits compound by exactly 5% for each elapsed world day. Four fictional settlement ventures change price deterministically over time, trend upward over a long horizon, and split shares when their nominal price grows too high. This is a game economy, not a market simulation.
- **Sentient residents and new wildlife.** Seven Hobbit roles, five Goblin roles, six Atlantian roles, and seven Sugarcourt roles form 25 sentient field-guide entries. Sugarcourt adds Taffy Hounds, Praline Cats, Sprinklebugs, herd-forming Taffalo, syrup-only Syrupfins, and Bonbonwings. Tidelight's Sunwash Crabs, Tidewing Gulls, Glassfins, Lanternjaws, Abyss Skaters, Dreadcoils, Tidepups, Sakurakits, Worldshell Leviathans, and larval/adult Aetherbells remain in the world alongside the earlier wildlife roster.
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

World creation exposes controls for difficulty, day length, multiplayer rest policy, mob and butterfly density, cave frequency, biome scale, resource abundance, structures, inventory retention, friendly fire, and which of the four NPC factions may generate settlements and aligned residents. Selecting no factions creates a valid wilderness-only world without removing those cultures' home biomes or ordinary wildlife. Weather belongs to the seeded biome-aware world simulation rather than a player-facing toggle. Percentage-based rest rules accept a 10%-100% threshold and default to 50%.

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

The host owns the world catalog entry and sends authoritative state for player poses, appearance, terrain edits, creatures, drops, Wayfarer positions/passengers, time, weather, world options, settlements, and rest votes. A time skip resolves only when enough connected players choose the same dawn or dusk target under the world's Any Player, Percentage, or All Players rule. Map knowledge remains personal until two players use the same Cartography Table; that exchange is bounded, idempotent, and omits personal beds and travel charges. Guests receive session state but do not gain ownership of the host's save. The invite code scopes the decentralized signaling room and should only be shared with people you trust.

Inventory and container action types are already defined in the multiplayer protocol, but the current engine does not yet synchronize those systems between peers.

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
|     |- alchemy.ts            Potion and distillery recipes, batches, and timed effects
|     |- candyworks.ts         Sugarworks recipes, atomic batches, output, and save codec
|     |- factions.ts           Alignment, diplomacy, cultures, and canonical spawn choices
|     |- economy.ts            Gold wallet, merchants, banking, and local ventures
|     |- settlements.ts        Surface, aquatic, and candy towns, residents, schedules, and jobs
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
|     |- capture-orbs.ts       Save-compatible orbs, four-slot racks, and timed healing
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
|- ROADMAP.md                  Explicit post-Wyrmweave feature boundary
|- .openai/hosting.json        Sites project and optional binding declaration
|- db/                         Unused Drizzle/D1 scaffold; schema is intentionally empty
`- examples/d1/                Optional database example, not part of game state
```

### Runtime boundaries

React owns the interface and translates player actions into method calls on `VoxelEngine`. The engine owns mutable simulation state and emits compact HUD snapshots back to React. Keeping the frame loop outside React avoids rerendering the component tree for physics and animation updates.

`ChunkWorld` owns deterministic generation, streamed chunk sections, geometry, terrain edits, skylight data, and nearby light indices. Generated terrain is reproducible from the seed, so saves store player-made edits rather than a copy of every generated block.

`mob-models.ts` is the canonical builder for the 86 core creatures, including the articulated Fire, Ice, and Steel Dragon rigs. The game engine instantiates those models directly, while the inspection script extracts their actual posed Three.js geometry for grounding checks and bestiary portraits. Seven butterfly builders complete the 93-entry field guide. `held-items.ts` reuses those same butterfly builders and centralizes player-held geometry, while conservatories, Capture Orbs, racks, healers, leviathan and dragon eggs, mount cargo, and faction pet sales preserve the same exact creature records. This keeps gameplay, catalog images, held creatures, habitat residents, and QA renders on shared implementations.

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

The Tidelight suites retain focused contracts for ocean depth variance, targetable waterlogged flora, bounded underwater growth, full-tree connectivity and felling, cultivated flowers, Moonrice and Sunroot, weather plans, ocean rarity, leviathan lifecycles, Atlantian systems, and the local Suno MP3 set. Sugarcourt retains focused suites for all 22 biomes and generator-v9 migration, seam-clean syrup ponds, Candywood connectivity, Sugarplum crops and flora, nonrenewing honey/syrup flow, bucket interactions, syrup-only fish, Taffalo riding, Sugarcourt roles and pets, Sugarworks batch safety, faction selection, and multiplayer option validation. Wyrmweave adds pure and engine-facing coverage for five-stage dragon normalization, unload-without-delete persistence, same-type breeding, elemental incubation, rider attacks, model articulation, deterministic lairs and charters, hoard content, tree connectivity repair, reusable tomes, mana gates, spell-wheel input, linear skills, Ascendant rules, responsive magic interfaces, and all 93 creature portraits.

A focused test can be run without the build wrapper:

```bash
node --import tsx --test tests/world-engine.test.ts
```

The model inspector reads the production creature and player models. It is useful for checking orientation, silhouettes, and ground contact after changing a creature, player pose, or held tool:

```bash
npm run models:render -- --out outputs/model-inspection
```

The command writes isometric, front, and side SVG sheets plus a machine-readable grounding manifest. PNG copies are also written when `sharp` is available.

To render all 93 bestiary entries as individual front-three-quarter portraits and a field-guide sheet:

```bash
npm run models:render -- --creatures --portraits outputs/model-portraits --portrait-only --portrait-png
```

The browser-facing SVGs under `public/creatures/` are generated with the same path:

```bash
npm run models:render -- --creatures --portraits public/creatures --portrait-only
```

Review the contact sheet before committing regenerated portraits. `outputs/` is ignored so temporary inspection artifacts do not enter commits by accident.

### Music provenance

The following ten release MP3s were generated with Suno for Blockwild and are stored locally under `public/music/`: `blockwild-ironbloom-skirmish-a/b`, `blockwild-hearthroad-home-a/b`, `blockwild-brassroot-market-a/b`, `blockwild-tidelight-shelf-a/b`, and `blockwild-lantern-sea-a/b`. The final two pairs are the v0.7 Tidelight additions. The runtime rotates them through combat, faction-settlement, coast/open-sea, and deep-sea/Atlantian scenes; it does not stream from or call Suno during play. `tests/audio-assets.test.mjs` verifies that every declared Suno asset exists, is a substantive complete MP3, and has a valid MP3 header. Other music files in `public/music/` are pre-existing project assets and are not assigned Suno provenance here.

## Build and deployment

```bash
npm run build
npm run validate:artifact
npm run start
```

The build is intentionally bounded and non-retrying. It produces `dist/server/index.js`, packages `.openai/hosting.json`, and verifies that the Worker has an ESM `default.fetch` export. The configured Sites builder runs `npm run build` against the pushed commit. Generated `dist/`, `.sites-runtime/`, and Wrangler state should remain untracked.

No `wrangler.jsonc` is required. Local Cloudflare bindings are derived from `.openai/hosting.json`; both D1 and R2 are currently `null`.

## Saves, ownership, and limits

Worlds live in `localStorage` for the current browser and origin. A save includes its last-written game version, terrain and liquid edits, player appearance and position, inventory metadata, equipment, crafting state, loaded ranged ammunition, health, hunger, XP, time, dynamic weather, furnaces, chests, apiaries, Alchemy Stands, Distilleries, Sugarworks batches, Archive Shelves, Tome Displays, Capture Orb racks, healing stations, conservatories, boats, persistent creatures and mount bonds, creature faction provenance, leviathan and dragon growth/egg metadata, dragon genetics, sex, lair, commands, tack, armor, scale reserve and cargo, active lead anchors, drops, crop/sapling/orchard timers, activated POI residents, surface, Sugarcourt, and Atlantian settlements, merchants, gold, bank and venture state, map knowledge and lair records, quests, learned blueprints and spell tomes, mana and favorites, skill XP/perks/Ascendant preferences, creature and plant journal progress, and world options including faction-spawn choices.

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
