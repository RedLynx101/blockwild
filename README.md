# Blockwild

Blockwild is an endless browser voxel-survival game built with TypeScript, React, and Three.js. A seed produces a deterministic world of streamed 16 x 16 chunks, 17 surface biomes, cave networks, temples, changing weather, creatures, and terrain running from Y -64 to Y 127. The game supports survival and builder modes, browser-local world management, touch controls, and direct host-authoritative multiplayer sessions. The current in-game release is **v0.2.0 Menagerie**.

The project is a real game rather than a voxel-rendering demo. You can mine, build, craft, smelt, farm, fight, collect field notes, manage several worlds, and carry those worlds between browsers with export files.

![Blockwild field guide with all 28 rendered creatures](public/creatures/blockwild-creatures.svg)

## What is in the game

- **Endless deterministic terrain.** Oceans, rivers, coasts, forests, wetlands, deserts, snowfields, highlands, volcanic wastes, caves, aquifers, lava, ores, and structures are generated from a text seed.
- **Survival and builder modes.** Survival tracks health, hunger, armor, XP, tool durability, fall and lava damage, hostile nights, and dropped inventory. Builder mode provides fast harvesting, infinite placement, and a creative catalog.
- **A full item loop.** The 36-slot inventory supports stacking, splitting, double-click collection, hotbar selection, equipment slots, dropped items, and shift-click transfers. Hand crafting uses a 2 x 2 grid; crafting tables unlock shaped 3 x 3 recipes. The searchable recipe book previews patterns on hover and stages ingredients into the board when clicked; it never silently crafts an output. Mirrored axe patterns work from either side. Tools, armor, materials, plants, food, torches, doors, beds, boats, cages, nets, and jars have purpose-built inventory icons instead of flat color swatches.
- **Machines and storage.** Furnaces continue processing against real elapsed time. Chests hold 27 slots, and adjacent chests merge into 54-slot storage. Farmland, crops, saplings, tree felling, loot-bearing generated chests, and interactive doors are implemented.
- **Placement-aware building pieces.** Floor torches stand upright, while torches placed against a side face lean out from that wall, persist their direction, and break when their support disappears. Doors render textured narrow edges instead of exposing an untextured slab.
- **Beds and flexible time skipping.** A Wildwood Bed can advance the world from any hour to the next dawn or next dusk, always moving forward. Multiplayer worlds can require any player, a configurable percentage, or every connected player to choose the same destination.
- **Four material tiers.** Wood, stone, sunmetal, and star-crystal tools have different mining speeds, damage, harvest requirements, and durability. Trailhide and sunmetal armor reduce incoming damage and wear down in use.
- **A living field guide.** The filterable bestiary tracks discovery, kills, captures, drops, habitat, activity, behavior, utility, and lore for 22 core creatures and six butterfly species. Each entry and list icon uses a front-three-quarter portrait rendered from the same model as gameplay. The roster includes distinct surface wildlife, perching birds, ocean/river/cave fish, temple guardians, a ranged Skeleton Archer, and the tameable banana-rabbit Peelop.
- **Creature keeping.** Waykeeper Cages preserve health, age, baby state, name, temperament, ownership, and pet commands. Friendly and neutral creatures can be moved freely; hostiles must be below half health or at one heart. Tamed, named, POI-resident, and enclosed creatures are protected from normal despawning. Connected Butterfly Conservatory blocks grow into habitats up to 20 blocks, accept one jarred butterfly per block, add flowers and branches by tier, and animate their residents landing and flying inside.
- **Water travel and ecology.** Water animates, flows downward and outward, renews a source between supported adjacent sources, and has oxygen/drowning mechanics plus a shore-exit boost. Oceans, rivers, and underground aquifers have distinct attackable fish. The two-seat Wayfarer is a larger sailboat with a working sail, water-constrained steering, and an 18-slot cargo hold opened with crouch-right-click.
- **Temples and biome landmarks.** Sparse desert and forest temples contain generated chests, Reliquary Sentinel guardians, and a rare 4,096-use Sunward Compass that points toward nearby unopened structure caches. Peelop groves and meadow butterfly sanctuaries add gentler deterministic landmarks without turning the world into a dense POI map.
- **A changing sky and soundscape.** Day/night lighting, larger sun and moon discs, stars, poofy instanced cloud banks, biome-aware rain, thunder, snow, mist, sandstorms and ashfall, underwater and underground atmosphere, placed and held lights, synthesized ambience, sampled effects, and biome/activity-driven music respond to the world state. The soundtrack includes two Wildwood Dawn variants and two Emberdeep Passage variants.
- **First- and third-person play.** The camera cycles between first person, rear third person, and front third person. The local and remote player models are articulated and animate for movement, crouching, running, mining, and held items.
- **Direct multiplayer.** A host can create a single-use WebRTC offer for a guest, accept the returned answer, and maintain several peer connections. The host is authoritative for the world; there is no matchmaking service or cloud-owned save.
- **Browser-owned worlds.** The title screen manages multiple local worlds with rename, duplicate, delete, import, and export operations. Saves are versioned and older supported saves are migrated without regenerating their edited blocks.

## Gameplay loop

Start with a few moonberries and whatever the seed gives you. Harvest a tree, turn a log into planks, build a crafting table, then move through wood, cobblestone, sunmetal, and star crystal. A furnace opens smelting, cooked food, glass, and charcoal. Chests make a permanent base practical; doors, directional torches, crops, saplings, armor, and a bed make it survivable.

The surface is safer in daylight, though not empty. At night and underground, hostile creatures become a larger part of the resource loop. Their drops unlock equipment and building materials while the bestiary records what you have learned. Deeper terrain carries better ores, lava, aquifers, and more dangerous encounters.

Craft a Wildwood Bed at a crafting table with three Cloudwool across the top row and three Wildwood Planks below. It needs two clear, supported blocks and points away from the player when placed. Right-click either half to choose the next dawn (about 6:30 AM) or next dusk (about 6:30 PM); this works at any time and never rewinds the clock.

World creation exposes controls for difficulty, day length, multiplayer rest policy, mob and butterfly density, cave frequency, biome scale, resource abundance, structures, weather, inventory retention, and friendly fire. Percentage-based rest rules accept a 10%-100% threshold and default to 50%.

## Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` | Move relative to the camera; double-tap `W` to sprint |
| Mouse | Look; click the world to capture the pointer |
| `Space` | Jump, swim upward while held, or dismount a Wayfarer |
| `Shift` | Crouch, move quietly, and stop at ledges |
| `Ctrl` | Sprint while moving (alternate to double-tap `W`) |
| `V` | Cycle first person, rear third person, and front third person |
| Hold left mouse | Mine the targeted block or attack the targeted creature |
| Right mouse | Use, place, open, eat, rest, board, catch, or release; crouch-use opens boat cargo and pet commands |
| `1`-`9` / mouse wheel | Select a hotbar slot |
| `E` | Open the inventory and 2 x 2 crafting grid |
| `Q` | Drop one item from the selected stack |
| Middle mouse | Pick the targeted block in builder mode |
| `F3` | Toggle coordinates, depth, chunk, seed, mode, and weather diagnostics |
| `H` | Show the compact control reminder |
| `Esc` | Pause or close the current menu |

Coarse-pointer devices get an on-screen movement pad, touch-look zone, jump, mine, place/use, hotbar, and pause controls.

## Multiplayer model

Multiplayer is a session layer over the host's existing world, not a shared cloud account:

1. The host opens **Pause > Multiplayer**, chooses a name, and creates an invite code.
2. The guest pastes that invite, creates an answer code, and sends it back.
3. The host accepts the answer to finish the direct WebRTC connection.

The host owns the world catalog entry and sends authoritative state for player poses, appearance, terrain edits, creatures, drops, Wayfarer positions/passengers, time, weather, world options, and rest votes. A time skip resolves only when enough connected players choose the same dawn or dusk target under the world's Any Player, Percentage, or All Players rule. Guests receive session state but do not gain ownership of the host's save. Connection codes may contain session-negotiation data and should only be shared with people you trust.

Inventory and container action types are already defined in the multiplayer protocol, but the current engine does not yet synchronize those systems between peers.

Sessions require a secure context and browser WebRTC support. The default connection uses a public STUN server but has no TURN relay, so restrictive NAT or firewall configurations can still prevent peers from connecting.

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
|     |- world-storage.ts      Local world catalog, import/export, and migrations
|     |- data.ts               Blocks, items, recipes, loot, fuel, and smelting
|     |- mobs.ts               Creature definitions and bestiary data
|     |- mob-models.ts         Canonical production models shared by game and tools
|     |- fauna.ts              Stable steering, bird behavior, habitats, and despawn rules
|     |- peelop.ts             Pet taming, care, commands, naming, breeding, and persistence
|     |- creature-cage.ts      Exact creature metadata capture/release codec
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
|     |- multiplayer.ts        WebRTC signaling, channels, protocol, and peer state
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
|- .openai/hosting.json        Sites project and optional binding declaration
|- db/                         Unused Drizzle/D1 scaffold; schema is intentionally empty
`- examples/d1/                Optional database example, not part of game state
```

### Runtime boundaries

React owns the interface and translates player actions into method calls on `VoxelEngine`. The engine owns mutable simulation state and emits compact HUD snapshots back to React. Keeping the frame loop outside React avoids rerendering the component tree for physics and animation updates.

`ChunkWorld` owns deterministic generation, streamed chunk sections, geometry, terrain edits, skylight data, and nearby light indices. Generated terrain is reproducible from the seed, so saves store player-made edits rather than a copy of every generated block.

`mob-models.ts` is the canonical builder for the 22 core creatures. The game engine instantiates those models directly, while the inspection script extracts their actual posed Three.js geometry for grounding checks and bestiary portraits. This keeps the in-game mob, its catalog image, and its QA render on one implementation.

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

`npm test` first creates and validates the production artifact, then runs the Node test suite. Coverage includes deterministic generation, chunk boundaries and streaming, save migration and failure isolation, world options, meshing, skylight and local lighting, directional torch persistence, bed placement and dawn/dusk transitions, multiplayer rest thresholds, inventory behavior, crafting, armor, doors, trees, furnaces, chests, drops, creature grounding and death, player animation, butterflies, portrait export, multiplayer protocol behavior, and rendered deployment metadata.

A focused test can be run without the build wrapper:

```bash
node --import tsx --test tests/world-engine.test.ts
```

The model inspector reads the production creature and player models. It is useful for checking orientation, silhouettes, and ground contact after changing a creature, player pose, or held tool:

```bash
npm run models:render -- --out outputs/model-inspection
```

The command writes isometric, front, and side SVG sheets plus a machine-readable grounding manifest. PNG copies are also written when `sharp` is available.

To render all 28 bestiary entries as individual front-three-quarter portraits and a field-guide sheet:

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

Worlds live in `localStorage` for the current browser and origin. A save includes its last-written game version, terrain and liquid edits, player appearance and position, inventory metadata, equipment, crafting state, health, hunger, XP, time, dynamic weather, furnaces, chests, conservatories, boats, persistent creatures and pets, drops, sapling timers, activated POI residents, bestiary progress, and world options.

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
