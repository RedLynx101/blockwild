# Blockwild

Blockwild is an endless browser voxel-survival game built with TypeScript, React, and Three.js. A seed produces a deterministic world of streamed 16 x 16 chunks, 18 surface biomes, cave networks, settlements, temples, changing weather, creatures, and terrain running from Y -64 to Y 127. The game supports survival and builder modes, browser-local world management, adaptive touch controls, and direct host-authoritative multiplayer sessions. The current in-game release is **v0.6.0 Hearthroads**.

The project is a real game rather than a voxel-rendering demo. You can mine, build, craft, smelt, farm, fight, collect field notes, manage several worlds, and carry those worlds between browsers with export files.

**Play the current hosted build:** [blockwild.noahhicks.chatgpt.site](https://blockwild.noahhicks.chatgpt.site)

![Blockwild field guide with all 60 rendered creatures](public/creatures/blockwild-creatures.svg)

## v0.6 Hearthroads

Hearthroads gives exploration a memory and puts inhabited places into the world. The map records chunks when they first render, natural landmarks appear when discovered, beds and wayshrines become usable destinations, and two players can exchange exploration at a Cartography Table. Fast travel is deliberately scarce: a Wayskip Draught banks one journey, while travel between known wayshrines is free only when started at a shrine. Either path requires five uninterrupted seconds without movement or damage.

The release also introduces the first questline, Hobbit and Goblin settlements, faction standing, named residents with professions and schedules, direct buy-and-sell trade, a separate gold wallet, Hobbit banking, fictional local investments, recipe blueprints, alchemy, distilling, crossbows, spears, Road Wargs, and a plant field guide. These are playable systems, but they are not the finished settlement strategy layer. Player-founded towns, full settlement administration, raiding parties, broad faction wars, fishing, and spellcasting remain explicitly deferred in [ROADMAP.md](ROADMAP.md).

## What is in the game

- **Endless deterministic terrain.** Oceans, rivers, coasts, forests, wetlands, deserts, snowfields, highlands, volcanic wastes, the cool Cloudreed Glen, caves, aquifers, lava, ores, and structures are generated from a text seed.
- **Survival and builder modes.** Survival tracks health, hunger, armor, XP, tool durability, fall and lava damage, hostile nights, and dropped inventory. Builder mode provides fast harvesting, infinite placement, and a creative catalog.
- **A full item loop.** The 36-slot inventory supports stacking, splitting, double-click collection, hotbar selection, equipment slots, dropped items, and shift-click transfers. Hand crafting uses a 2 x 2 grid; crafting tables unlock shaped 3 x 3 recipes. The searchable recipe book previews patterns on hover and stages ingredients into the board when clicked; it never silently crafts an output. Mirrored axe patterns work from either side. Advanced crossbows, spears, faction tonics, and Honeymead stay locked until their physical blueprint is learned; duplicate blueprints remain saleable. Tools, armor, materials, plants, food, torches, doors, beds, boats, Capture Orbs, nets, workstations, bottles, and jars have purpose-built full-size inventory icons and held models instead of flat color swatches.
- **Machines, storage, farming, and brewing.** Furnaces continue processing against real elapsed time. Chests hold 27 slots, and adjacent chests merge into 54-slot storage. Four-slot Capture Orb Racks display preserved creatures, and Healing Stations restore four captured creatures over time with optional Cave Gel acceleration. Alchemy Stands turn bottles, water, fruit, cave materials, honey, and flowers into health, travel, and faction-specific potions; Distilleries run selected timed batches and initially support blueprint-locked Honeymead. Hoes till soil, nearby water hydrates farmland, wild wheat grows through visible stages, and a scythe harvests and replants it in one action. Moonberry and Sunberry bushes regrow fruit after right-click harvesting. Planted apples become varied orchard trees with separately harvestable hanging fruit that returns over time. Empty buckets collect water or lava and filled buckets place it again.
- **Placement-aware building pieces.** Floor torches stand upright, while torches placed against a side face lean out from that wall, persist their direction, and break when their support disappears. Doors render textured narrow edges instead of exposing an untextured slab.
- **Connected enclosures.** Wildwood fences join neighboring fences, gates, and solid blocks; closed pieces use 1.25-block collision while open gates remain pathable. Braided Leads attach creatures to the player and can be hitched to an enclosure.
- **Beds and flexible time skipping.** A Wildwood Bed can advance the world from any hour to the next dawn or next dusk, always moving forward. Multiplayer worlds can require any player, a configurable percentage, or every connected player to choose the same destination.
- **Four material tiers.** Wood, stone, sunmetal, and star-crystal tools have different mining speeds, damage, harvest requirements, and durability. Trailhide and sunmetal armor reduce incoming damage and wear down in use.
- **Two living field guides.** The filterable creature bestiary tracks discovery, kills, captures, taming, breeding, food, sentience, drops, habitat, activity, behavior, utility, and lore for 54 core creatures and six butterfly species. Each entry and list icon uses a front-three-quarter portrait rendered from the same model as gameplay, with a completion ring and a hidden post-tame section where relevant. Unknown entries retain a habitat clue instead of becoming blank cards. A separate plant journal covers 18 trees, crops, bushes, flowers, aquatic plants, and wild growths with their habitat, growth rules, drops, and practical use.
- **Creature keeping.** Waykeeper Capture Orbs preserve health, age, baby state, name, temperament, ownership, pet commands, taming progress, and species-specific state. Friendly and neutral creatures can be moved freely; hostiles must be below half health or at one heart. Tamed, named, POI-resident, and enclosed creatures are protected from normal despawning. Eligible wildlife can be fed, healed, bred, and raised from babies. Shadecrawlers, Reedstriders, and Wildwood Coursers have distinct trust, saddle, and riding paths. Connected Butterfly Conservatory blocks fuse into clean habitats up to 20 blocks, accept jarred butterflies and eligible small orb-preserved wildlife with exact metadata, add flowers and branches by tier, contain flight to their cells, and permit capped in-habitat breeding.
- **Apiaries and living pollinators.** Wild hives hold a queen and up to eight workers. Workers seek flowers, gather nectar, and return at dusk; crafted apiaries bootstrap from a Queen Cell or preserved queen, grow their own workforce, and store up to 12 Wildflower Honey and 12 Royal Jelly. Breaking a wild hive releases an angry colony. Weakened queens can be captured or bonded with Royal Jelly, while workers can be netted for Queen Cell crafting.
- **Physical, path-aware wildlife.** Medium and large ground creatures collide with players and each other, route around blocked terrain, liquids, ledges, crowds, and closed doors, and pass through open gates and doors. Following companions match travel speed, form widening offset rows instead of crowding the camera, and safely teleport back when separated beyond recovery distance.
- **Water travel and ecology.** Water animates, flows downward and outward, renews a source between supported adjacent sources, and has oxygen/drowning mechanics. Players naturally sink, can swim upward, crouch-dive, and get enough lift at a bank to climb onto land. Variable rivers run deeper and reject surface flora from occupied water cells, while River Ribbon, Reed Bloom, and Glow Kelp render inside water without replacing its source. Oceans, rivers, and underground aquifers have habitat-weighted shoals of distinct attackable fish. The two-seat Wayfarer is a larger sailboat with a working sail and an 18-slot cargo hold opened with crouch-right-click.
- **Temples and biome landmarks.** Sparse desert and forest temples contain generated chests, Reliquary Sentinel guardians, and a rare 4,096-use Sunward Compass that points toward nearby unopened structure caches. Peelop groves, meadow butterfly sanctuaries, abandoned apiaries, and Waykeeper healing grottoes add deterministic landmarks, their own inhabitants, and rare loot without turning the world into a dense POI map.
- **A map that records actual exploration.** Press `M` to open a parchment map of chunks that have rendered for the local player. Discovered natural POIs, the active bed spawn, and crafted wayshrines appear automatically; manual markers can be named and removed but are never legal fast-travel targets. A two-seat Cartography Table merges explored chunks and transferable markers between two players without leaking personal bed locations or travel charges.
- **Bounded fast travel.** Drinking a Wayskip Draught banks one map journey to a known natural POI, active bed spawn, or wayshrine. A player standing at one wayshrine can travel to another known shrine without spending a charge. Both routes channel for five seconds and cancel if the player moves or takes damage.
- **Branching quests with real failure state.** Press `J` for the Hearthroads quest journal. The opening main line branches through surviving day one, surviving day five, finding a settlement, and completing a first trade. Quests can carry multiple objectives, prerequisites, gold/item/blueprint/alignment rewards, a pinned HUD card, deadlines, and giver-dependent failure. Side quests can be abandoned and reaccepted when their definition allows it; delivery rewards resolve through the giver rather than appearing at the moment an objective counter changes.
- **Hobbit and Goblin settlements.** Sparse Hearthkin Freeholds and Brassroot Clanholds generate with biome-aware spacing, roads, walls, gates, lights, themed buildings, beds, doors, work areas, furniture, and a population soft cap. Named mayors, farmers, miners, brewers, merchants, bankers, alchemists, blacksmiths, and guards follow role-aware daily plans. Civilian residents avoid danger, guards defend their gates with hammers, crossbows, or spears, and Goblin settlements keep aligned Road Wargs that cannot be tamed. Town lights feed the same hostile-spawn suppression as player torches.
- **Faction standing and direct trade.** The player, Hobbits, and Goblins have separate faction records. Quests and fair work can raise standing; killing residents lowers it, and sufficiently low standing makes a faction hostile. Merchants carry finite stock and gold, value goods differently by profession, accept ordinary inventory items rather than fixed emerald-style exchanges, and restock over time. Gold lives in a dedicated save-backed wallet instead of consuming a 64-item pack slot.
- **Hobbit banking and local ventures.** Goldkeepers accept free deposits and withdrawals. Deposits compound by exactly 5% for each elapsed world day. Four fictional settlement ventures change price deterministically over time, trend upward over a long horizon, and split shares when their nominal price grows too high. This is a game economy, not a market simulation.
- **Sentient residents and new wildlife.** Seven Hobbit roles and five Goblin roles are the first sentient creature families in the bestiary. The same production catalog adds rideable unaligned Road Wargs, Burrowbells, Dewback Tapirs, Redfin Salmon, Blue Mackerel, and a sparse Slatefin Shark for deep ocean water. Sharks ignore occupied boats.
- **Crossbows and mounted combat.** Hobbit blueprints unlock a one-bolt Hearthguard Crossbow and a stronger Wayfarer Crossbow; Goblin blueprints unlock a reach-focused spear. Hold right mouse to aim a crossbow, use left mouse to fire, and press `R` to load a bolt from the pack. The HUD shows loaded and spare ammunition, and attacks remain available while riding a saddled Warg.
- **A changing sky and soundscape.** Day/night lighting, larger sun and moon discs, stars, poofy instanced cloud banks, biome-aware rain, thunder, snow, mist, sandstorms and ashfall, underwater and underground atmosphere, falling leaves, animated torchlight, sampled creature calls, terrain-aware footsteps, falling cues, synthesized fallbacks, and biome/activity-driven music respond to the world state. Rain particles and rain ambience require open sky, so caves and covered interiors stay dry. Thunderstorms close the entire sky into an overcast layer and fully hide the sun, moon, and stars. Combat music persists through the post-fight cooldown and alternates dedicated encounter cues; Hobbit and Goblin settlement themes follow the current owner of the nearby town and rotate two Suno-produced variants each.
- **First- and third-person play.** The camera cycles between first person, rear third person, and front third person. Local and remote player models are articulated and animate for movement, crouching, running, mining, and held items. Shared production models put tools at a forward working angle and render nets, chests, apiaries, Capture Orbs, workstations, buckets, and captured butterflies clearly ahead of the hands. The female variant has a distinct black-haired, shorter rig and matching eye height.
- **Adjustable performance policy.** Render distance defaults to 10 chunks and scales to 16, while simulation distance defaults to 8 and never exceeds the view. Adaptive budgets protect frame time; optional CPU and memory reserve modes trade additional local resources for steadier streaming. The settings menu can enable a compact live FPS counter.
- **One-code multiplayer.** A host chooses one short invite code and shares it with guests. Guests can join directly from the title screen and wait for the host's authoritative snapshot without creating or saving a throwaway local world. A lightweight [Trystero](https://github.com/dmotz/trystero) rendezvous exchanges the underlying WebRTC offer and answer automatically. Per-peer offer/answer flights are idempotent, guest-first joins retry transient signaling races, and normal WebRTC cleanup cannot overwrite a successful join with a false error. The existing manual exchange remains under an advanced fallback. The host stays authoritative for the world, multiplayer menus do not pause the simulation, and there is no cloud-owned save.
- **Browser-owned worlds.** The title screen manages multiple local worlds with rename, duplicate, delete, import, and export operations. Saves are versioned and older supported saves are migrated without regenerating their edited blocks.

## Gameplay loop

Start with a few moonberries and whatever the seed gives you. Harvest a tree, turn a log into planks, build a crafting table, then move through wood, cobblestone, sunmetal, and star crystal. A furnace opens smelting, cooked food, glass, and charcoal. Chests make a permanent base practical; doors, directional torches, crops, saplings, armor, and a bed make it survivable.

The surface is safer in daylight, though not empty. At night and underground, hostile creatures become a larger part of the resource loop. Their drops unlock equipment and building materials while the bestiary records what you have learned. Deeper terrain carries better ores, lava, aquifers, and more dangerous encounters.

Craft a Wildwood Bed at a crafting table with three Cloudwool across the top row and three Wildwood Planks below. It needs two clear, supported blocks and points away from the player when placed. Right-click either half to choose the next dawn (about 6:30 AM) or next dusk (about 6:30 PM); this works at any time and never rewinds the clock.

World creation exposes controls for difficulty, day length, multiplayer rest policy, mob and butterfly density, cave frequency, biome scale, resource abundance, structures, inventory retention, and friendly fire. Weather belongs to the seeded biome-aware world simulation rather than a player-facing toggle. Percentage-based rest rules accept a 10%-100% threshold and default to 50%.

## Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` | Move relative to the camera; double-tap `W` to sprint |
| Mouse | Look; click the world to capture the pointer |
| `Space` | Jump, swim upward while held, or dismount a boat or creature |
| `Shift` | Crouch, move quietly, stop at ledges, dive faster, or bypass a block's normal use action while placing |
| `Ctrl` | Sprint while moving (alternate to double-tap `W`) |
| `V` | Cycle first person, rear third person, and front third person |
| Left mouse | Hold to mine, swing a melee weapon, attack a creature, or fire a loaded crossbow |
| Right mouse | Use, place, open, eat, plant, milk, till, harvest, pour, rest, board, catch, or release; hold to aim a selected crossbow; crouch-use places on interactive blocks, opens boat cargo and pet commands, or hitches a lead to a fence |
| `1`-`9` / mouse wheel | Select a hotbar slot |
| `E` | Open the inventory and 2 x 2 crafting grid |
| `M` | Open the explored-world map |
| `J` | Open the quest journal |
| `R` | Reload the selected crossbow from loose bolts |
| `Q` | Drop one item from the selected stack |
| Middle mouse | Pick the targeted block in builder mode |
| `F3` | Toggle coordinates, depth, chunk, seed, mode, and weather diagnostics |
| `H` | Show the compact control reminder |
| `Esc` | Pause or close the current menu |

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
|     |- world-storage.ts      Local world catalog, import/export, and migrations
|     |- data.ts               Blocks, items, recipes, loot, fuel, and smelting
|     |- map-system.ts         Explored chunks, markers, cartography, and fast travel
|     |- quests.ts             Questlines, objectives, failure state, and turn-ins
|     |- HearthroadsPanels.tsx Map, quest, station, trade, bank, and town interfaces
|     |- blueprints.ts         Save-backed recipe knowledge and duplicate resale
|     |- alchemy.ts            Potion and distillery recipes, batches, and effects
|     |- factions.ts           Alignment, hostility, authority, and diplomacy records
|     |- economy.ts            Gold wallet, merchants, banking, and local ventures
|     |- settlements.ts        Sparse towns, layouts, residents, schedules, and jobs
|     |- hearthroads-adapter.ts Item/resource translation for economy and stations
|     |- plants.ts             Separate flora journal and discovery records
|     |- farming.ts            Crops, orchards, buckets, fences, gates, and lead rules
|     |- world-effects.ts      Bounded falling leaves and shared torch flicker samples
|     |- mobs.ts               Creature definitions and bestiary data
|     |- mob-models.ts         Canonical production models shared by game and tools
|     |- fauna.ts              Stable steering, bird behavior, habitats, and despawn rules
|     |- creature-pathing.ts   Collision profiles, routing, follower formations, and recovery
|     |- creature-care.ts      Generic feeding, breeding, babies, and maturation
|     |- creature-sounds.ts    Species event cues and synthesized fallback metadata
|     |- peelop.ts             Pet taming, care, commands, naming, breeding, and persistence
|     |- shadecrawler.ts       Trust, taming, growth, saddle, and mount progression
|     |- creature-cage.ts      Exact creature metadata capture/release codec
|     |- capture-orbs.ts       Save-compatible orbs, four-slot racks, and timed healing
|     |- apiary.ts             Queen/worker lifecycle, nectar, honey, jelly, and hive breaks
|     |- ecology.ts            Herds, shoals, mounts, submerged flora, and tree forms
|     |- butterflies.ts        Butterfly spawning, flight, capture, and release
|     |- butterfly-exhibit.ts  Connected habitat topology, capacity, flowers, and poses
|     |- boats.ts              Two-seat Wayfarer model, storage, and water movement
|     |- liquids.ts            Flow queue, source renewal, water animation, and swimming
|     |- weather.ts            Biome weather state machine and cloud-field planning
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
|  |- benchmark-simulation.ts  Repeatable liquid/POI/weather/chunk CPU benchmark
|  |- install-ci.sh            Bounded, locked Sites dependency install
|  |- build-verified.sh        Bounded Vinext build plus artifact validation
|  `- validate-artifact.sh     Checks the Worker export and hosting manifest
|- tests/                      Node test suite for game and deployment behavior
|- worker/index.ts             Cloudflare Worker/Vinext request entry point
|- build/sites-vite-plugin.ts  Packages the Sites deployment artifact
|- vite.config.ts              Vinext, Sites, and local Worker configuration
|- ROADMAP.md                  Explicit post-Hearthroads feature boundary
|- .openai/hosting.json        Sites project and optional binding declaration
|- db/                         Unused Drizzle/D1 scaffold; schema is intentionally empty
`- examples/d1/                Optional database example, not part of game state
```

### Runtime boundaries

React owns the interface and translates player actions into method calls on `VoxelEngine`. The engine owns mutable simulation state and emits compact HUD snapshots back to React. Keeping the frame loop outside React avoids rerendering the component tree for physics and animation updates.

`ChunkWorld` owns deterministic generation, streamed chunk sections, geometry, terrain edits, skylight data, and nearby light indices. Generated terrain is reproducible from the seed, so saves store player-made edits rather than a copy of every generated block.

`mob-models.ts` is the canonical builder for the 54 core creatures. The game engine instantiates those models directly, while the inspection script extracts their actual posed Three.js geometry for grounding checks and bestiary portraits. `held-items.ts` reuses those same butterfly builders and centralizes player-held geometry, while conservatories, Capture Orbs, racks, and healers preserve the same exact creature records. This keeps gameplay, catalog images, held creatures, habitat residents, and QA renders on shared implementations.

The Hearthroads modules keep save-normalizable rules away from presentation code. Map transfer and travel validation live in `map-system.ts`; quest transitions in `quests.ts`; settlement planning and resident schedules in `settlements.ts`; authority-checked gold, trade, banking, and venture mutations in `economy.ts`; and station batches in `alchemy.ts`. `HearthroadsPanels.tsx` renders those snapshots but does not own their simulation state.

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

`npm test` first creates and validates the production artifact, then runs the Node test suite. Coverage includes deterministic generation, Cloudreed climate selection, cave and river variance, chunk boundaries and streaming, save migration and failure isolation, world options, meshing, skylight and local lighting, directional torch persistence, plant growth and harvest rules, orchards, buckets, fences and leads, bed placement and dawn/dusk transitions, one-code and manual multiplayer negotiation, inventory behavior, icon semantics, crafting, armor, doors, dense cutout leaves, furnaces, chests, drops, creature grounding and collision, route choice, follower formations and recovery, husbandry and death, apiary production and worker lifecycle, Capture Orb migration, racks and healing, herd/shoal motion, mounts, conservatory topology and capacity, Shadecrawler progression, player animation and held models, water movement, boat steering, storm visibility, butterflies, portrait export, explored-map merge and travel validation, quest transitions, blueprint locks, alchemy/distillery batches, plant discovery, faction authority, settlement layouts and schedules, merchant accounting, exact bank interest, venture splits, multiplayer protocol behavior, and rendered deployment metadata.

A focused test can be run without the build wrapper:

```bash
node --import tsx --test tests/world-engine.test.ts
```

The model inspector reads the production creature and player models. It is useful for checking orientation, silhouettes, and ground contact after changing a creature, player pose, or held tool:

```bash
npm run models:render -- --out outputs/model-inspection
```

The command writes isometric, front, and side SVG sheets plus a machine-readable grounding manifest. PNG copies are also written when `sharp` is available.

To render all 60 bestiary entries as individual front-three-quarter portraits and a field-guide sheet:

```bash
npm run models:render -- --creatures --portraits outputs/model-portraits --portrait-only --portrait-png
```

The browser-facing SVGs under `public/creatures/` are generated with the same path:

```bash
npm run models:render -- --creatures --portraits public/creatures --portrait-only
```

Review the contact sheet before committing regenerated portraits. `outputs/` is ignored so temporary inspection artifacts do not enter commits by accident.

## Build and deployment

```bash
npm run build
npm run validate:artifact
npm run start
```

The build is intentionally bounded and non-retrying. It produces `dist/server/index.js`, packages `.openai/hosting.json`, and verifies that the Worker has an ESM `default.fetch` export. The configured Sites builder runs `npm run build` against the pushed commit. Generated `dist/`, `.sites-runtime/`, and Wrangler state should remain untracked.

No `wrangler.jsonc` is required. Local Cloudflare bindings are derived from `.openai/hosting.json`; both D1 and R2 are currently `null`.

## Saves, ownership, and limits

Worlds live in `localStorage` for the current browser and origin. A save includes its last-written game version, terrain and liquid edits, player appearance and position, inventory metadata, equipment, crafting state, loaded ranged ammunition, health, hunger, XP, time, dynamic weather, furnaces, chests, apiaries, Alchemy Stands, Distilleries, Capture Orb racks, healing stations, conservatories, boats, persistent creatures and mount bonds, active lead anchors, drops, crop/sapling/orchard timers, activated POI residents, settlements, merchants, gold, bank and venture state, map knowledge, quests, learned blueprints, creature and plant journal progress, and world options.

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
- When adding a block or item, update its definition, placement and support rules, drop behavior, rendering or icon path, recipes where appropriate, and focused tests.
- When changing a full-size creature, start in `mob-models.ts`, then keep its `mobs.ts` definition, dimensions, foot offset, animation semantics, and tests aligned. Regenerate the bestiary portraits and review the inspection sheets visually.
- New world options must be normalized in `world-storage.ts`, represented in multiplayer snapshots/codecs when session-relevant, and given backward-compatible defaults.
- Multiplayer changes should preserve host authority, bounded codecs, versioned envelopes, and the separation between reliable actions and disposable movement updates.
- Audio under `public/` ships with the application. Compress new tracks and effects before committing them, then wire them into scene selection rather than leaving unreachable assets.
- Do not add game persistence to the empty D1 scaffold unless the ownership and migration model is deliberately being changed.

No license file is currently included in this repository.
