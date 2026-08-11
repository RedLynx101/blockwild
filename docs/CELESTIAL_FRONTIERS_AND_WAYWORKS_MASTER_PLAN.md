# Celestial Frontiers and Wayworks Master Plan

Status: proposal only; this document changes no game data or behavior

Prepared: 2026-08-11

Target branch: `main`

Design thesis: expand Blockwild into a coherent voxel solar-system adventure in which every world is a place to live, explore, build, automate, study, and return to—not a disposable ore dimension. Galacticraft supplies the expedition grammar; Mekanism supplies the reusable automation grammar; Blockwild supplies the identity, creatures, factions, magic, ecology, visual language, dynamic combat, capture systems, and long-lived worlds.

Companion graphic: `docs/artifacts/celestial-frontiers/waystar-system-plan.svg`

## Executive vision

The expansion is called **Celestial Frontiers**. Its industrial foundation is the **Wayworks**: a Blockwild-native family of power, storage, processing, life-support, logistics, drilling, and vehicle systems. The Wayworks should be recognizable to players who enjoy Mekanism-like automation, but it must not copy Mekanism's product identity, assets, recipes, balance constants, names, or UI. Likewise, planetary travel should preserve Galacticraft's preparation, launch, hazard, station, and return rhythms without reproducing its exact celestial roster or progression.

The initial star system is the **Waystar System**. It contains six primary worlds and nine named moons or moon-scale destinations, plus orbit spaces, stations, and deterministic asteroid fields. The current Blockwild world remains the home planet and starting save. Two user-authored anchors define the middle system:

- **Talon**, a dry red world divided between a collective hive civilization and rival medieval saurian bannerholds; its bright moon **Hope** supports high-elven mage-spacers and their grand orbital station, **Ad Astra**.
- **Suno**, an almost entirely oceanic world of reef civilizations, abyssal architecture, immense wildlife, and powered submarines; its moons are lush **Jun** and mineral-rich, blue-and-black **Styx**.

Every primary body can be orbited. Every solid body can be landed on. The Waystar gas giant supports orbital and floating-atmosphere locations rather than an impossible solid surface. Players can build sealed stations in orbit, attach bases to deterministic asteroids, move in zero gravity, establish powered and pressurized habitats, automate resources, and operate across locations without keeping every planet loaded.

The expansion is deliberately built as a platform:

- celestial catalogs support predetermined and deterministically generated systems;
- locations are first-class save/multiplayer/map scopes;
- physics, sky, atmosphere, ecology, and generation are policies supplied by each body;
- automation resource networks are reusable across planets and later systems;
- content is data-driven so a new planet does not require another branch through the entire engine;
- active chunks, remote machines, and stations use bounded summary simulation so scope does not destroy browser performance.

## Design pillars

### 1. Preparation creates stories

A voyage should ask the player to plan fuel, life support, cargo, landing conditions, power, and a return path. It should not require a wiki checklist or punish one forgotten component with permanent loss. Every launch UI therefore includes a readable readiness manifest, warnings, and at least one recoverable rescue route.

### 2. Each world changes how play feels

Gravity, atmosphere, temperature, terrain, navigation, ecology, factions, resources, weather, and the sky all vary. A planet is not “the desert but red.” Talon changes movement, settlement politics, dust exposure, and siege ecology. Suno changes the world to vertical ocean navigation and vehicle-supported habitation. Hope changes traversal to bright low-gravity mountain magic.

### 3. Industry is legible

Power is generated, buffered, transferred, and consumed. Items, fluids, gases/chemicals, and heat remain distinct resources. A stalled machine always explains the bottleneck: no power, wrong side, empty input, full output, incompatible gas, insufficient pressure, unavailable destination, or unloaded/unanchored route.

### 4. Automation respects the world

Machines do not turn the game into an abstract spreadsheet. Their blocks have material construction, moving mechanisms, readable ports, restrained light, and contents visible through windows. Mining and pumps are powerful but remain spatial, audible, inspectable, interruptible, and respectful of claims, POIs, edited builds, and ecology rules.

### 5. Space remains Blockwild

Creatures follow `docs/CREATURE_MODEL_STYLE.md`: handcrafted voxel naturalism, connected anatomy, strong silhouettes, cubic detail, material storytelling, and readable animation. Blocks and machines follow `docs/BLOCKWILD_VISUAL_THEME_PROPOSAL.md`: material honesty, construction legibility, restrained magic, quiet surfaces, and state-driven accents.

### 6. Scope is explicit

A “world” is no longer assumed to mean one terrain coordinate space. Surface, orbit, station, asteroid, and vehicle interiors are explicit locations under a celestial body. Maps, edits, entities, machines, weather, physics, audio, multiplayer, and persistence all consume that identity.

## Inspiration boundary and clean-room rule

### What is being adapted

From legacy Galacticraft:

- tiered expedition readiness;
- launch pad, fueling, ascent, destination selection, landing, and return;
- body-specific gravity, atmosphere, generation, dungeons, and hazards;
- personal oxygen gear and tanks;
- powered sealed habitats and airlocks;
- orbiting player-built stations and asteroid operations;
- durable vehicle fuel/cargo across travel;
- progression through exploration and rare schematics.

From modern Mekanism concepts:

- separate energy generation, transfer, storage, and portable charge;
- typed item/fluid/chemical/heat networks;
- aggregate connected networks with explicit buffers and throughput;
- face configuration, auto-eject, filters, priorities, and backpressure;
- rechargeable batteries and charge stations;
- electrolysis into oxygen and hydrogen;
- formed multiblock tanks and power storage;
- parallel factories and machine-specific upgrades;
- filtered remote mining with a previewable scan;
- compact visual telemetry driven by actual state.

### What will not be copied

- code, models, textures, icons, sounds, UI layouts, recipes, balance constants, progression text, or trademarked product names;
- an exact planet roster;
- opaque seal failures or random schematic grind;
- unlimited always-loaded areas;
- one rendered item object moving through every pipe segment;
- every Mekanism machine or tier merely for completeness;
- “modern plastic box” aesthetics inconsistent with Blockwild.

If literal third-party code is ever considered, it requires a separate provenance and license review. The default implementation is original and behaviorally inspired.

## Research-derived design lessons

### Galacticraft lessons

- Galacticraft's rocket tiers are destination gates, but the deeper value is the expedition contract: launch infrastructure, power, fuel, oxygen, cargo, and credible return logistics.
- Its oxygen loop combines equipment with world infrastructure. Personal tanks let the player scout; sealed rooms let the player inhabit.
- Space stations are separately owned worlds with access policy, not decorations attached to the sky.
- Low gravity affects players, creatures, projectiles, drops, and fall damage. Treating it as only jump height breaks the illusion.
- Celestial selection is an authoritative travel gate. It is not the same thing as a local exploration map.
- Persistent rocket cargo, station identity, player gear, and body transition state prevent travel from behaving like a lossy teleport.

### Mekanism lessons

- Resource types should share framework code without losing their rules. Energy, fluids, gases, heat, and item stacks behave differently.
- A connected pipe network can be simulated as one aggregate buffer plus cached endpoints; every segment does not need an independent per-unit simulation.
- Items remain discrete because metadata, filters, routing, destination capacity, and transactional insertion matter.
- Capacity, transfer bandwidth, generation rate, and local buffers are separate dimensions. That creates understandable bottlenecks.
- Machines need reusable side configuration, ejection, redstone/control, ownership, security, upgrades, and error components.
- An electrolyzer's two outputs create real backpressure: if either internal tank fills, production stops unless routed or deliberately vented.
- A good remote miner is bounded, previewable, cancelable, revision-aware, and suspended by full output—not an invisible infinite deletion loop.

### Real life-support grounding

NASA's Environmental Control and Life Support System separates atmosphere pressure, oxygen generation, carbon-dioxide removal, ventilation, water recovery, and storage. The Oxygen Generation System electrolyzes water into oxygen and hydrogen. Blockwild should simplify these into enjoyable systems, but the separation provides a strong causal model: making oxygen alone is not the same as maintaining a habitable room.

## Target player journey

### Chapter 0 — The sky becomes a map

- The home world's observatories, Waygrid scholars, dwarven engineers, and mage guild independently notice repeatable celestial alignments.
- The player repairs an astrolabe at a Starless Observatory and unlocks System Map mode.
- Planets already exist visually in the sky, but names, orbits, and destination data are revealed through observation and research.
- Early telescopes provide discovery and lore; they do not teleport the player.

### Chapter 1 — Power before rockets

- The player builds a small Wayworks grid: generator, cable, bench battery, charger, crusher, compressor, and fluid pump.
- Oil or biofeedstock is refined into first-generation rocket fuel.
- Water is electrolyzed into oxygen and hydrogen. Oxygen fills a back tank; hydrogen is stored or used later.
- The first sealed test chamber teaches pressure diagnostics safely on the home world.

### Chapter 2 — Home orbit

- A Survey Hopper reaches Blockwild orbit.
- The player experiences zero gravity, learns a tether and EVA pack, claims a small station frame, and collects orbital salvage.
- The System Map changes from an observatory catalog into an active mission planner.
- First orbital construction unlocks permanent station modules and a rescue beacon.

### Chapter 3 — Talon and Hope

- A Hearthwing Shuttle reaches Talon.
- Talon provides iron-rich dust, pressure minerals, faction questlines, hive architecture, saurian fortresses, and low-gravity travel.
- Hope is unlocked through Talon orbit or diplomacy. It is safer but geographically dramatic: radiant slopes, valleys, magical materials, high-elven mages, and Ad Astra.
- Hope's arcanists provide spell-tech components for reliable outer-system navigation.

### Chapter 4 — Suno and its moons

- A Wayfarer Lander and a powered submersible open Suno.
- The player builds surface platforms, descends through reef shelves and open ocean, and visits grand underwater structures.
- Jun provides dense living materials, canopy launch clearings, and symbiotic bioengineering.
- Styx provides cold, airless mining, rare conductive minerals, and long shadows beneath Suno's enormous sky presence.

### Chapter 5 — Outer system

- Cargo ships, higher-density batteries, heat management, and multi-stage fuel reach the Waystar giant and Hollowmere.
- Gas-giant aerostats, storm power, frozen vaults, asteroid docks, and deep-space stations support large-scale automation.
- A Deepstar ship and a future stellar navigation core become the bridge to additional solar systems, but interstellar generation remains a later expansion.

## World hierarchy and identifiers

The current `worldId` cannot safely stand for a whole universe. Terrain edits use X/Z chunk keys, `WorldSave` is one broad document, map knowledge assumes one world, and multiplayer snapshots lack body identity. Do not fake planets as distant coordinates.

### Canonical hierarchy

```text
UniverseSave
└── StarSystemState (systemId, systemSeed, catalogVersion)
    ├── CelestialBodyState (bodyId, parentBodyId, ephemeris, discoveries)
    │   ├── SurfaceLocation (locationId = system/body/surface)
    │   ├── OrbitLocation (locationId = system/body/orbit/band)
    │   ├── StationLocation(s)
    │   ├── AsteroidLocation(s)
    │   └── VehicleInteriorLocation(s)
    └── TransitState(s)
PlayerProfile
├── currentLocationId
├── position/orientation/velocity for that location
├── equipment including back slot
├── celestial discoveries and research
└── active travel/vehicle custody
```

### Stable IDs

- `systemId`: immutable catalog ID, e.g. `waystar`.
- `bodyId`: immutable within catalog, e.g. `talon`, `talon/hope`, `suno/styx`.
- `locationId`: immutable address for a terrain or vehicle coordinate space.
- `instanceId`: durable station, asteroid claim, dungeon, or vehicle interior ID.
- `locationEpoch`: changes when a location is regenerated under an incompatible contract.
- Every chunk, block edit, entity, drop, container, machine, network, marker, weather event, and packet includes `locationId`.

### Seed derivation

Use a stable versioned hash:

```text
systemSeed = hash(universeSeed, systemId, systemCatalogVersion)
bodySeed = hash(systemSeed, bodyId, bodyGeneratorVersion)
locationSeed = hash(bodySeed, locationKind, instanceId, locationGeneratorVersion)
chunkSeed = hash(locationSeed, chunkX, chunkZ)
```

Predetermined bodies have authored catalogs but deterministic terrain within those contracts. Future procedural systems can generate their body catalogs from a separate `systemGeneratorVersion`; changing it never mutates an existing catalog snapshot.

## Save and persistence architecture

### Universe manifest

A small manifest records:

- universe ID and seed;
- catalog and schema versions;
- known systems and discovered bodies;
- current player location;
- station/ship registry summaries;
- location snapshot revisions;
- last durable checkpoint and recovery marker.

### Per-location records

Each surface/orbit/station/asteroid location stores independently:

- sparse block edits grouped by vertical section;
- generated-content contract and discovered POIs;
- durable creatures, NPCs, drops, vehicles, and projectiles that must survive unload;
- containers and machine records;
- formed network/multiblock *inputs*, not derived graphs or meshes;
- map knowledge for that location;
- weather, local clock, ecology, faction control, and authored encounter state;
- dormant simulation deadlines and activity leases.

### Transaction rules

- Travel is a multi-record transaction: freeze vehicle/player custody, checkpoint origin, create/validate destination, commit current location, then release origin hot state.
- A reconnect resumes from the last committed stage. It never duplicates a ship or loses its cargo.
- Derived meshes, pipe graphs, pressure flood fills, and route caches are reconstructed.
- IndexedDB is the authoritative browser store; `localStorage` retains only small catalog/preferences compatibility. Export/import remains a portable single archive.
- Periodic snapshot compaction requires checksum and read-back before old journal records are removed.

### Legacy migration

- Existing worlds become a `waystar/blockwild/surface` location without changing their terrain seed, edits, time, progression, map, creatures, or containers.
- The old `WorldSave` is preserved as a rollback payload until the first new-format save validates.
- Existing map markers gain the home location ID.
- Existing equipment gains `back: null`.
- No celestial content spawns into already edited chunks unless the system uses an explicit authored POI placement contract.

## Celestial catalog schema

```ts
type CelestialBodyDefinition = Readonly<{
  id: string;
  name: string;
  kind: "star" | "planet" | "gas-giant" | "moon" | "dwarf-world";
  parentId: string | null;
  orbit: {
    semiMajorAxisAu: number;
    eccentricity: number;
    inclinationDegrees: number;
    ascendingNodeDegrees: number;
    phaseAtEpoch: number;
    orbitalPeriodDays: number;
  } | null;
  rotation: {
    dayLengthMinutes: number;
    axialTiltDegrees: number;
    phaseAtEpoch: number;
  };
  physical: {
    massEarths: number;
    radiusEarths: number;
    surfaceGravityG: number;
  };
  environment: EnvironmentPolicy;
  sky: SkyPresentationPolicy;
  generatorId: string;
  biomeCatalogId: string;
  contentCatalogId: string;
  travel: TravelPolicy;
}>;
```

`surfaceGravityG` is derived and validated from relative mass/radius (`g = M / R²`) unless a magical anomaly explicitly overrides it. Numerical values serve gameplay and visual consistency; Blockwild is not an orbital simulator.

## Sky, orbits, phases, and eclipses

### Deterministic ephemeris

- Use hierarchical two-body Keplerian approximations evaluated from universe time and a fixed epoch.
- Planets orbit the Waystar; moons orbit their parent; stations and asteroid bands use authored orbital bands.
- The host computes authoritative coarse ephemeris time. Clients independently render the same catalog and receive occasional clock correction.
- No N-body integration runs per frame. Body transforms are analytic and cacheable.

### What players see

- The Waystar's direction, brightness, color, sunrise path, and apparent angular size depend on the current body and time.
- Planets and moons render as phase-aware sprites or low-poly spheres with clamped minimum visibility. Real angular size informs the image, but distant important bodies receive a modest readability floor rather than disappearing to subpixels.
- From a moon, the parent planet is the dominant sky body and rotates relative to local longitude.
- Inner and outer planets appear in the correct broad direction and change through conjunctions/oppositions.
- Moons visibly move, phase, eclipse the star, and cast parent-shadow events. Eclipses are scheduled, deterministic world events—not random screen filters.
- Ring shadows, atmospheric scattering, aurora, cloud decks, and star visibility come from the body's sky policy.
- Underground celestial occlusion continues using the existing camera-environment contract; a new sky must not reintroduce sunlight through caves.

### Night identities

| Location | Night-sky identity |
| --- | --- |
| Blockwild | familiar moon and stars; new planets become legible after observatory research |
| Cinderhymn | immense copper Waystar, short dark intervals, heat shimmer and ash aurora |
| Talon | rust-red horizon, Hope as a brilliant moving crescent, frequent dust-veiled stars |
| Hope | Talon dominates the sky in red and ochre bands; Ad Astra transits as a slow light |
| Suno | reflected ocean light, Jun and Styx crossing at different speeds, deep teal nights |
| Jun | Suno fills a large part of the sky; ocean storms are visible as moving white spirals |
| Styx | hard black sky, blue-black ground, huge blue Suno and bright Jun conjunctions |
| Orison orbit/moons | banded giant and ring arcs dominate; lightning storms illuminate undersides |
| Hollowmere | long indigo night, distant small Waystar, crystalline aurora and slow moon Wick |

### Day length and simulation

Body day lengths are authored in real gameplay minutes, not real-world hours. Crops, solar output, creature behavior, thermal risk, factions, and sky use the same local solar clock. Offline/remote simulation advances analytically across sunrise/sunset intervals rather than replaying every tick.

## Gravity and movement

### Surface gravity

- Each surface location has one local down vector and constant effective gravity derived from its body. The terrain remains planar voxel space; Blockwild does not wrap chunks over a sphere.
- Gravity affects player acceleration, jump arc, fall speed/damage, swimming buoyancy, creature locomotion, projectile ballistics, drops, particles, vehicle handling, and loose blocks/items.
- AI navigation profiles declare minimum/maximum usable gravity and alternative gaits. Creatures do not blindly use home-world jump constants.
- Animation uses contact and stride timing derived from effective gravity, so low-G movement reads as deliberate rather than slow-motion clipping.

### Orbital zero gravity

The user-requested gameplay rule is explicit: orbit, stations, and free asteroids are **0 G**. Physically this represents continuous freefall in the local orbital frame.

- Characters retain velocity when no force acts.
- Push-off strength depends on contact surface and carried mass.
- Air drag is absent outside pressurized spaces; tiny numerical damping only prevents unbounded floating-point drift and is exposed in tests.
- Crouch near a valid hull surface engages magnetic boots when equipped.
- A tether prevents unrecoverable drift and can be reeled.
- An EVA Maneuver Rig uses stored compressed gas/energy for six-axis impulse and attitude control.
- Camera roll is optional; default “comfort mode” gradually maintains a stable up reference without changing authoritative velocity.
- Loose items can be collected with a short-range cargo tether to reduce frustration and object count.

### Representative gravity catalog

| Body | Mass (Earths) | Radius (Earths) | Derived surface g | Play consequence |
| --- | ---: | ---: | ---: | --- |
| Cinderhymn | 0.34 | 0.72 | 0.66 g | long jumps, heavy heat-driven winds |
| Blockwild | 1.00 | 1.00 | 1.00 g | current baseline |
| Blockwild's moon, Morrow | 0.012 | 0.25 | 0.19 g | first low-G field training |
| Talon | 0.16 | 0.64 | 0.39 g | bounding travel, dust launches, longer projectile arcs |
| Hope | 0.045 | 0.36 | 0.35 g | gentle alpine leaps and floating spell bridges |
| Suno | 1.28 | 1.18 | 0.92 g | familiar surface motion; buoyancy dominates exploration |
| Jun | 0.22 | 0.57 | 0.68 g | canopy leaps and gliding wildlife |
| Styx | 0.018 | 0.28 | 0.23 g | mining recoil and long shadow traversal |
| Orison cloud deck | 72.0 | 8.70 | 0.95 g | near-normal in aerostat zones; no solid surface |
| Aerie | 0.060 | 0.38 | 0.42 g | storm-swept mesas and sail traversal |
| Rimehold | 0.110 | 0.47 | 0.50 g | icy ravines and denser industrial bases |
| Vanta | 0.030 | 0.31 | 0.31 g | dark volcanic glass and weak solar power |
| Hollowmere | 0.080 | 0.42 | 0.45 g | slow snow falls and long cavern drops |
| Wick | 0.006 | 0.18 | 0.19 g | tiny bright ice moon and observatory ruins |

Values are proposed balance targets and can change after movement prototypes. Orbit remains zero-G regardless of the underlying body's surface value.

## Atmosphere and environmental policy

```ts
type EnvironmentPolicy = Readonly<{
  pressureKPa: number;
  oxygenFraction: number;
  inertFraction: number;
  co2Fraction: number;
  temperatureRangeC: readonly [number, number];
  corrosive: number;
  radiation: number;
  liquidMedium: "none" | "water-dominant" | "hydrocarbon";
  breathable: boolean;
  requiresPressureSuit: boolean;
  windModel: string;
  weatherCatalog: string;
  gravityG: number;
}>;
```

Hazards are compositional. “No oxygen,” “low pressure,” “extreme cold,” “corrosive air,” and “radiation” are not one generic space-damage flag. Equipment can solve different subsets and body designs can combine them tastefully.

## Personal life support and the back slot

### Equipment schema

Extend `EquipmentSlot` from `head | chest | legs | feet` to:

```ts
type EquipmentSlot = "head" | "chest" | "legs" | "feet" | "back";
```

The back slot coexists with body armor and supports:

- oxygen tanks;
- backpacks and cargo frames;
- gliders/capes where appropriate;
- EVA Maneuver Rig;
- later magical wings or companion perches.

Multiplayer inventory operations, snapshots, save normalization, creative inventory, armor UI, equipment clicks, drops-on-death, agent inventory tools, and bestiary/character renderers all migrate together. Old saves default to `back: null`.

### Minimum survival rule

In an atmosphere with insufficient breathable oxygen or pressure, the minimum safe personal setup is:

1. a **sealed helmet** in the head slot; and
2. a filled **oxygen tank** in the back slot.

This intentionally leaves chest armor available. The helmet reads the back source through a standardized life-support capability. If pressure is near vacuum, the helmet includes a neck seal and minimal pressure hood; longer exposure, temperature extremes, corrosion, or radiation may additionally require EVA body pieces.

### Equipment progression

| Equipment | Role | Limitation |
| --- | --- | --- |
| Field Breather Helmet | sealed breathing interface and HUD | no oxygen source by itself |
| Light O2 Tank | early back tank | short expeditions; occupies back slot |
| Expedition O2 Tank | larger refillable tank | heavier; slower refill |
| Twin-Tank Harness | two removable tanks | later research; bulkier |
| Pressure Weave | chest/legs/feet thermal and pressure protection | no breathing without helmet/back source |
| EVA Maneuver Rig | back unit with thrusters, battery, scrubber, and two tank sockets | expensive; tanks inserted into rig UI rather than equipped directly |
| Aurelian Spell-Rig | Hope-derived EVA alternative using charge and O2 | rare repair components; not infinite air |
| Dive Harness | underwater pressure/propulsion back unit | not vacuum-rated unless upgraded |

### HUD and alarms

- A compact O2 gauge appears only when relevant.
- It shows source, remaining time at current draw, pressure seal status, CO2 scrubber state, and leak modifier.
- Threshold alarms use color, icon, text, and spatial audio; no critical state is conveyed by color alone.
- Tank swapping is allowed from inventory but uses a short interruptible animation so vacuum swapping is a decision.
- At zero oxygen, a grace interval and escalating impairment precede health damage. Creative mode and invulnerable agents ignore harm but still expose diagnostics.

## Deterministic pressurization and habitat simulation

### Design target

A player can build a sealed station, lunar base, submarine compartment, or Talon habitat; supply power and oxygen; cycle an airlock; then safely remove the helmet. A broken wall, open outer door, unpowered life-support machine, or exhausted O2 reserve has clear, deterministic consequences.

### Air zone model

Each enclosed volume is an `AirZone`:

```ts
type AirZoneState = Readonly<{
  zoneId: string;
  locationId: string;
  topologyRevision: number;
  cellCount: number;
  boundaryLeakArea: number;
  pressureMilliKPa: number;
  oxygenMilliMoles: number;
  inertMilliMoles: number;
  co2MilliMoles: number;
  temperatureMilliC: number;
  controllerIds: readonly string[];
  status: "unknown" | "checking" | "sealed" | "leaking" | "depressurized" | "over-capacity";
}>;
```

Use fixed-point integers for authoritative resource accounting. UI converts to familiar pressure, oxygen percentage, and estimated breathable time.

### Topology algorithm

1. A Life-Support Controller requests evaluation when placed, powered, configured, or notified of a relevant topology change.
2. The world maintains sealability flags for blocks and six faces. Doors and airlocks expose their current seal state.
3. A bounded worker flood-fill starts from controller air cells, using loaded/available section snapshots and a hard cell budget.
4. Crossing an unknown/unavailable chunk boundary is conservatively a leak unless a valid cached boundary-seal digest proves closure.
5. The fill returns cell count, boundary leaks, controllers, connected vents, occupants, and topology revision.
6. Main authority installs the result only if the location and topology revisions still match.
7. Later block edits invalidate only zones whose bounding box or boundary digest intersects the edit.

Do not scan rooms every tick. Re-evaluate topology only after relevant block/door/controller/chunk changes, with a low-frequency integrity audit as a safety net.

### Capacity and multiple controllers

- One entry controller supports a proposed 2,048 air cells.
- Controllers in the same zone add capacity and airflow, allowing large halls without one arbitrary 800-block cap.
- Initial maximum zone size is 16,384 cells to protect the browser. Larger habitats require bulkheads into multiple zones.
- Capacity is a design/technical limit with a clear UI, not a hidden failure.
- Future hardware tiers can raise the cap only after performance validation.

### Gas and pressure update

At a 5 Hz authoritative cadence, one zone-level update accounts for:

- oxygen injected by life-support vents;
- oxygen consumed and CO2 produced by players, NPCs, creatures, fire, and select machines;
- CO2 removed by scrubbers;
- plant contribution at low, balanced rates;
- gas lost through leak area toward the external pressure;
- gas equalization through open internal doors and airlocks;
- thermal adjustment from heaters/coolers and external conditions.

This is zone arithmetic, not per-voxel computational fluid dynamics.

### Airlocks

- A proper airlock is functionally player-built from an inner pressure door, a sealed chamber of any valid shape within the controller cap, an outer pressure door, an Airlock Controller, at least one chamber vent, and an optional recovery pump/tank connection.
- Interlocks prevent both doors opening simultaneously unless manually overridden.
- Cycle direction is explicit; the chamber pumps valuable gas back into storage before opening outward.
- Emergency override works but warns about decompression.
- Doors show locked/cycling/safe/unsafe states with physical latches and restrained lamps.

#### Buildable pressure components

| Block | Function | Visual language |
| --- | --- | --- |
| Pressure Door | one- or two-block powered sealing door for personnel | fitted iron/ceramic leaves retract into a visible frame; narrow reinforced window; small state lamp |
| Horizon Door | cleaner futuristic pressure door unlocked with Wayworks | two or four interlocking panels slide into wall pockets; beveled cubic frame, mechanical center seam, no featureless glowing slab |
| Hangar Pressure Gate | formed wide/tall vehicle door | modular frame, segmented shutters, redundant locks; controller validates the complete opening |
| Airlock Controller | owns one chamber cycle and door interlock | physical lever/wheel, pressure dials, route arrow, small status display |
| Atmosphere Vent | injects or withdraws a selected gas mixture from its current AirZone | visible grille, directional vanes, pipe port, restrained flow ribbon only while active |
| Equalization Vent | transfers atmosphere between two adjacent sealed zones | two-sided grille with check-valve mode and target pressure |
| Recovery Pump | returns chamber gas to a tank before vacuum opening | iron pump, glass moisture trap, audible mechanical cadence |
| Pressure Sensor | emits control signal from pressure/O2/CO2 thresholds | dial/needle plus configurable output |
| Emergency Shutter | automatically seals a corridor on rapid pressure loss | heavy drop panels with manual crank and fail-safe stored charge |
| Reinforced Window | sealable transparent face | thick framed glass with connected borders and impact state |

#### Vent and room-to-room behavior

- Atmosphere Vents are normal machine endpoints for gaslines and energy. They can pressurize, depressurize, recycle, or hold a target composition.
- Equalization Vents connect two known AirZones without merging their topology. They move gas deterministically toward a configured target pressure and can preserve different gas compositions when closed.
- A room can have multiple vents. Zone flow is aggregated at the AirZone level; the game does not simulate air particles moving voxel by voxel.
- Vents expose intake/output/balanced modes, maximum rate, filters, and backflow prevention.
- Pressure doors and shutters are sealable on their frame faces when closed and open boundaries when retracted. Their exact state increments topology revision.
- A player can build a corridor of several independently controlled pressure rooms, not only one exterior airlock.
- The controller can link doors/vents by selecting them with the Field Wrench, with a visible in-world line and range/cap diagnostics.
- Manual doors remain usable without power through a slow crank where pressure difference is safe. Unsafe opening requires a held confirmation and produces decompression rather than silently refusing forever.

#### Airlock cycle state machine

```text
idle-inner-safe
  -> seal-inner
  -> verify-chamber-topology
  -> equalize/recover-to-exterior-target
  -> unlock-outer
  -> occupied-open-outer
  -> seal-outer
  -> equalize-to-interior-target
  -> unlock-inner
  -> idle-inner-safe
```

Every transition is host-authoritative, restartable after save/load, and has a timeout/error state. Breaking a linked door or vent invalidates the cycle and closes any still-operable pressure door before recalculation.

The Horizon Door is the recommended “futuristic” everyday door. It should look advanced through precision, compact actuators, material fit, and state legibility—not through a giant neon surface. It is usable on stations, advanced surface bases, submarines, and Ad Astra; faction skins change frames/material accents without changing collision or sealing rules.

### Diagnostics

The controller UI must show:

- zone volume and controller capacity;
- pressure, O2, CO2, temperature, consumption, production, and reserve time;
- power draw and current source;
- exact leak direction or nearest known leak coordinate;
- open door/airlock responsible;
- unknown/unloaded boundary;
- over-capacity status;
- occupants and major consumers;
- last topology check and revision.

Holding a Field Wrench overlays the zone boundary, vents, leaks, and flow arrows.

## Wayworks resource model

### Authoritative resource kinds

| Kind | Examples | Representation | Transport behavior |
| --- | --- | --- | --- |
| Item | blocks, ores, parts, food, filled tanks | discrete metadata-bearing stacks | routed transactionally; no silent voiding |
| Fluid | water, oil, fuel, coolant, brine | typed fixed-point quantity | one compatible type per tank/network buffer unless explicitly partitioned |
| Gas/Chemical | oxygen, hydrogen, steam, methane, CO2, chlorine later | typed fixed-point quantity plus optional temperature/pressure | pressure-rated gaslines; explicit vent modes |
| Energy | stored electrical work | integer joules internally | aggregate network buffer and bandwidth |
| Heat | thermal energy/temperature delta | zone/machine quantity | lossy transfer to neighbors/environment |

“Solids” that are inventory items use item channels. Slurries can be modeled as fluids or chemicals by their recipe semantics; do not add a resource type merely for a name.

### Real units, game scale

Use recognizable UI units:

- joules/kilojoules/megajoules for stored energy;
- watts/kilowatts for rate;
- millibuckets or liters for fluid volume (choose one before implementation; recommendation: liters in UI, integer milliliters internally);
- liters or moles for gases (recommend liters-at-standard-conditions in UI, fixed-point amount internally);
- degrees Celsius for machine/environment temperature;
- kilopascals for habitat pressure.

Numbers are tuned for play. Using real unit names should improve causal understanding, not imply scientific fidelity.

### Shared capability interfaces

```ts
type ResourceKind = "item" | "fluid" | "chemical" | "energy" | "heat";

interface ResourceEndpoint<T> {
  readonly endpointId: string;
  readonly locationId: string;
  readonly revision: number;
  simulateInsert(resource: T, side: LocalFace): TransferQuote<T>;
  commitInsert(quote: TransferQuote<T>): TransferReceipt<T>;
  simulateExtract(filter: ResourceFilter<T>, side: LocalFace): TransferQuote<T>;
  commitExtract(quote: TransferQuote<T>): TransferReceipt<T>;
}
```

Two-phase simulate/commit prevents duplication and loss when inventories change between route planning and execution.

## Six-face machine configuration

Placed blocks retain their four horizontal facing for presentation. Machine ports use local faces:

```text
front / back / left / right / top / bottom
```

Each supported resource kind assigns a mode per face:

- disabled;
- input;
- output;
- input/output;
- passive;
- pull;
- maintenance/service.

The **Field Wrench** rotates blocks, selects resource overlays, changes a face, copies a machine configuration, pastes compatible settings, and inspects networks. It replaces any need to mimic Mekanism's Configurator identity.

## Connected-network simulation

### Physical blocks

- **Grid Cable** — energy.
- **Cargo Channel** — items.
- **Liquid Pipe** — fluids.
- **Gasline** — gases/chemicals.
- **Heat Conduit** — heat.
- **Universal Service Trunk** — late-game multiblock corridor carrying several isolated logical channels; expensive and not an early universal cable.

### Logical graph

- Connectivity is rebuilt only when a segment, endpoint, face mode, color/channel, or chunk availability changes.
- Each connected component gets a stable derived network ID and topology revision.
- Energy, fluid, chemical, and heat networks simulate one aggregate buffer plus cached emitters/acceptors.
- Item networks cache graph distances and endpoint filters but keep stacks discrete.
- Networks across an unloaded boundary split unless an active Wayanchor lease authorizes both sides or a later remote-link machine bridges them.
- Derived graphs are not persisted. Blocks, endpoint configuration, and in-flight transactional item state are authoritative; graphs reconstruct on load.

### Throughput

Effective continuous-resource throughput is bounded by:

```text
min(network bandwidth, available source rate, destination acceptance rate, free buffer capacity)
```

Capacity and bandwidth scale independently. A long pipe network can store more in its distributed buffer without automatically becoming faster.

### Item routing

Cargo Channels support:

- passive, push, pull, and disconnected connections;
- allow/deny filters by item, tag/category, metadata, or bestiary/material family;
- destination priority;
- round-robin distribution;
- fallback routes;
- strict color/channel routing;
- maximum in-flight reservations per network;
- visible item pulses derived from transaction events, not one permanent 3D item per segment.

If no destination can accept a stack, it remains at the source or a bounded network buffer; it is never silently deleted.

### Remote frequencies

Late-game **Waylink Relays** connect owner-scoped named channels across distance or locations. A channel stores:

- name and stable ID;
- owner/faction/team;
- public/trusted/private security;
- permitted resource kinds;
- source/destination endpoints;
- bandwidth and energy cost;
- body/location reach constraints;
- last transaction revisions.

Waylink does not keep remote chunks fully alive. It exchanges with durable network endpoints through scheduled summary transactions and requires powered relays at both ends.

## Power system

### Separation of concerns

- generator output rate;
- machine input rate and local buffer;
- cable bandwidth and buffer;
- stationary battery capacity and I/O;
- portable battery capacity and charge rate;
- losses or environmental derating where it adds real decisions.

A dead battery is never destroyed. It remains at zero charge and every dependent machine cleanly stops or switches to an external source.

### Early generators

| Generator | Inputs/context | Identity | Role |
| --- | --- | --- | --- |
| Hand Dynamo | player interaction | iron flywheel and leather grip | emergency/tutorial power only |
| Heat Engine | fuel or adjacent heat | masonry hearth, iron exchanger, visible piston | reliable early base power |
| Wind Rotor | wind exposure | timber/cloth/iron rotor | biome/weather-dependent trickle |
| Sunplate Array | direct sky | star-crystal cells in iron frame | daylight generation; body-distance and weather modify output |
| Waterwheel Generator | flowing water | wildwood wheel and iron dynamo | steady home-world/riverside power |
| Biofuel Engine | processed plant/organic fuel | copper vat, iron cylinder | farm-integrated generation |

### Mid-game generators

- Geothermal Bore: consumes pump power but produces strong continuous heat/electricity in volcanic areas.
- Hydrogen Turbine: burns or recombines stored hydrogen with controlled oxygen; electrolysis alone is deliberately not a perpetual-energy loop.
- Methane Reformer and Gas Engine: processes biomass/CO2/hydrogen into a storable fuel chain.
- Solar Tower: formed structure that concentrates light and stores heat; strongest on Cinderhymn and Hope's clear peaks.
- Tidal Generator: Suno-specific current structure whose output follows deterministic tide phases.
- Storm Mast: Orison/Aerie lightning and wind system with surge storage and grounding risk.

### Late-game power

- Accumulator Hall: formed bulk energy storage, with separate cells for capacity and gates for I/O bandwidth.
- Orbital Solar Sail: large station array with exposure/orientation mechanics.
- Hope Arc Reactor (magic-tech, not nuclear): stabilizes spell charge through star-crystal resonators; high output, rare Aurelian components.
- Fission/fusion may be a later Wayworks expansion after core machines and safety telemetry are proven. They are not required for first celestial release.

### Rechargeable storage

| Item/block | Behavior |
| --- | --- |
| Charge Cell | portable rechargeable item; powers tools or inserts into machines |
| Field Battery | placeable early buffer; front gauge and fill-lit core |
| Grid Battery | higher capacity and configurable sides |
| Ship Battery Bank | vehicle-rated replaceable modules; provides launch, avionics, pumps, lights, and emergency O2 |
| Accumulator Hall | formed bulk storage; separate capacity and transfer blocks |
| Charging Pedestal | charges held/equipped cells and compatible tools; pauses at full |

## Machine framework

Every machine uses shared components rather than another bespoke loop in `engine.ts`:

- schema/version normalization;
- owner/security;
- orientation and six-face resource configuration;
- local item/fluid/chemical/energy/heat buffers;
- recipe cache and progress/deadline;
- active/idle/blocked/error state;
- auto-eject;
- control signal mode;
- supported upgrade sockets;
- compact visual telemetry;
- deterministic elapsed-time advancement;
- multiplayer revision and agent capability checks.

### Core machine roster

| Machine | Inputs | Outputs | Purpose |
| --- | --- | --- | --- |
| Powered Crusher | items + energy | crushed items | early ore/material preparation |
| Enrichment Mill | items + energy | concentrated material | improved yield without excessive chain depth |
| Electric Smelter | items + energy | ingots/glass/ceramics | powered furnace path |
| Alloy Infuser | item + infusion material + energy | alloys/components | Wayworks tiers and ship parts |
| Plate Press | ingots + energy | plates/casings | structural components |
| Precision Sawmill | logs/items + energy | boards/byproducts | efficient wood automation |
| Fluid Pump | world liquid + energy | quantified fluid | throttled bridge from voxel liquid to tanks |
| Atmospheric Condenser | atmosphere + energy | gases/liquids | body-dependent harvesting |
| Electrolyzer | water + energy | oxygen + hydrogen | life support and fuel chain; dual-output backpressure |
| Gas Compressor | gas + energy | filled tank / high-pressure store | equipment and ship fueling |
| Fluid Refinery | oil/biomass + heat/energy | refined fuel/byproducts | rocket and engine fuels |
| Chemical Mixer | chemicals + energy | compound chemical | coolant, propellant, treatment chemistry |
| Reaction Chamber | item + fluid + gas + energy | material + byproduct | advanced processing |
| Carbon Scrubber | CO2 + filter/energy | cleaned gas + carbon byproduct | habitat loop |
| Life-Support Controller | oxygen/inert gas + energy | pressurized AirZone | habitat control and diagnostics |
| Thermal Regulator | energy/heat + coolant | zone temperature control | hostile environments |
| Auto Assembler | item recipe + energy | crafted items | bounded recipe automation |
| Factory Frame | machine core + parallel modules | multiple processes | 3/5/7/9 lane factories; concurrency, not free speed |
| Waylink Relay | network resources + energy | remote scheduled transfer | owner-scoped cross-location logistics |

### Upgrades

- Speed: increases process rate and usually peak energy demand superlinearly.
- Efficiency: lowers energy/resource loss at the cost of process speed or slots.
- Capacity: enlarges local buffers.
- Filter: adds or expands routing/filter slots.
- Muffling: reduces machine audio radius, never makes hazards silent.
- Seal: improves vacuum/corrosion operation.
- Thermal: increases safe temperature range.
- Anchor: allows the machine to request an existing Wayanchor lease; it does not create free chunk activity.

Machines declare supported upgrades. Invalid modules cannot be inserted.

## Tanks and formed structures

### Small tanks

- Portable fluid canisters and gas cylinders retain contents when empty/full and are refillable.
- Placed tanks hold one compatible type and show fill level through a narrow window.
- Gas tanks expose pressure rating and safe vent controls.
- Breaking a nonempty tank requires safe pickup conditions or explicit drain confirmation.

### Reservoir Hall

A rectangular formed storage structure inspired by the *idea* of a dynamic tank, with Blockwild construction:

- iron/stone/Deepgear frame edges;
- fitted plate or reinforced glass faces;
- face-mounted Valve blocks, not edges;
- 3x3x3 minimum and an initially smaller browser-safe maximum such as 12x12x12;
- one fluid or one chemical per formed chamber;
- capacity derived from interior volume and installed lining;
- visible contents rendered as one cached interior volume, not voxel-by-voxel fluid;
- formation and split/merge checked only on topology change;
- capacity shrink never silently destroys content.

### Accumulator Hall

- formed rectangular electrical storage;
- Capacity Cells add energy volume;
- Gate Coils add transfer bandwidth;
- ports choose input/output/bidirectional;
- front/core brightness reflects state of charge;
- UI separates stored energy, transfer limit, current input/output, and estimated runtime.

## Dynamic machine and network visuals

Visuals are a diagnostic layer:

- tank windows rise/fall with fill percentage and take the stored material's restrained color;
- cables pulse softly by real throughput and dim when idle;
- pipes show a cached central fill core, not thousands of moving particles;
- Cargo Channels display occasional traveling silhouettes sampled from committed transfers;
- battery cores brighten by charge, with a shape/gauge cue for accessibility;
- machines expose moving parts only while active and stop in a readable mechanical pose;
- blocked machines show one local amber indicator plus an icon/tooltip in UI;
- formed structures show valves, braces, contents, and one controller identity;
- hazardous venting has audible/visual warning and cannot be mistaken for normal operation.

Per the visual theme, luminous accents generally remain below roughly one quarter of the visible machine surface. Bodies are built from iron, stone, wood, copper/brass, ceramic, glass, and location-specific materials; emissive strips do not replace construction.

## Wayanchor and chunk outlines

### Player-facing block

The **Wayanchor** is cheap to craft and activates the exact chunk in which it is placed. It is a quality-of-life infrastructure block, not an expensive endgame trophy.

### Operational rule

- It consumes a small continuous amount of grid power.
- It keeps deterministic machines, network endpoints, managed crops, and approved persistent summaries active.
- It does not render the chunk, play animations, spawn natural mobs, or run full remote creature AI.
- One anchor never expands implicitly to neighboring chunks.
- Cross-chunk networks need an active lease on each required chunk or split at the boundary.
- A host budget prevents pathological numbers from destroying performance. The UI queues or downgrades extra anchors; it does not delete them.

### Chunk outlines

- Add `Show chunk boundaries` to Settings, off by default.
- Add a rebindable function key, off/toggle state persisted per client.
- Holding a Wayanchor previews the current chunk automatically even if the global option is off.
- The preview shows horizontal 16x16 edges, chunk coordinates, location ID short name, and whether the lease is active/queued/blocked.
- Underground, vertical boundaries fade by depth so they remain useful without becoming a glowing cage.

## Mining drills

### Design rule

Drills have no artificial “number of blocks ever mined” lifetime cap. They can keep extracting as long as actual eligible blocks exist, power/resources are supplied, output has room, and the target remains valid. Rates, radius, energy, heat, tool heads, and routing still create balance.

### Drill families

| Drill | Scope | Use |
| --- | --- | --- |
| Face Drill | straight bounded tunnel | construction, station rock, asteroid access |
| Bore Rig | configurable rectangular shaft | base excavation and ore following |
| Survey Extractor | filtered radius/height job | Mekanism-like remote ore mining, but visibly planned |
| Asteroid Mole | low-G anchored drill | bores a claimed asteroid without pushing itself away |
| Seafloor Dredger | sediment/mineral nodes | Suno resources with ecology exclusions |

### Survey Extractor workflow

1. Place and power the extractor.
2. Choose radius, vertical range, include/exclude filters, replacement behavior, and output side.
3. Preview the exact bounding volume and estimated targets.
4. Start an incremental/worker scan against a frozen world revision.
5. Store targets compactly by chunk/section bitset.
6. Extract one or a bounded batch per scheduled operation.
7. Pause on output full, missing power, unavailable chunk, claim conflict, protected block, or world-revision invalidation.
8. Rescan only by explicit action or a safe incremental invalidation.

### Safety

- Never target player-placed blocks by default.
- Exclude containers, machines, waystones, anchors, POI structural palettes, dungeon gates, settlement claims, habitat seals, quest blocks, living Veinmetal nodes, and ecological protected areas unless a dedicated override is authorized.
- Do not force-load the entire scan radius. The scan operates on available generated summaries and schedules bounded generation only where the player/host policy permits.
- Replacing mined blocks with spoil is optional and previewed.
- Mining output is transactional; a full destination pauses before block removal.

## Vehicles and ships

### Shared durable vehicle state

```ts
type SpaceVehicleState = Readonly<{
  vehicleId: string;
  definitionId: string;
  ownerId: string;
  locationId: string;
  transform: TransformState;
  velocity: Vec3;
  phase: "parked" | "fueling" | "countdown" | "ascent" | "orbit" | "transfer" | "descent" | "landed" | "disabled";
  hull: number;
  batteryJoules: number;
  propellant: readonly FluidStack[];
  oxidizer: readonly ChemicalStack[];
  oxygen: ChemicalStack | null;
  passengers: readonly SeatOccupant[];
  cargo: readonly InventorySlot[];
  modules: readonly VehicleModuleState[];
  origin: LocationAddress;
  destination: LocationAddress | null;
  transitionRevision: number;
}>;
```

Fuel, cargo, passengers, hull, battery, and modules survive transitions and reconnects. Travel never reconstructs the ship from only a type ID.

### Ship roster

| Ship | Seats/cargo | Reach | Identity and use |
| --- | --- | --- | --- |
| Survey Hopper | 1 / 9 slots | home surface ↔ home orbit/Morrow | compact reusable capsule; first zero-G tutorial |
| Hearthwing Shuttle | 2 / 27 | inner worlds and Talon/Hope | iron-and-copper lifting body with fold-out landing feet |
| Wayfarer Lander | 4 / 54 | Suno/Jun/Styx and ordinary system transfers | modular lander with life-support and cargo bay |
| Atlas Freighter | 6 / 162 | system-wide | large cargo vessel assembled in orbit; cannot launch from primitive pad fully loaded |
| Orbital Tug | 2 / 36 | within orbit bands | moves station modules, ships, and asteroid anchors |
| Aurelian Spellskiff | 2 / 18 | Hope/Talon/orbit, later system-wide | high-elf magic-tech craft; low fuel, high charge/crystal cost |
| Deepstar Vessel | 8 / modular | future other star systems | late platform; outside first release's interstellar destinations |

### Launch infrastructure

- Launch Pad: formed, flat, clear footprint with orientation and exhaust exclusion.
- Fuel Gantry: connects fluid/chemical/energy networks to ship ports.
- Mission Console: destination, mass, delta-v abstraction, fuel, battery, life support, weather, seats, cargo, return plan, and rescue state.
- Tracking Beacon: validates landing zones and permits automated/cargo arrivals.
- Recovery Crane: retrieves capsules and handles damaged craft.
- Orbital Dock: station counterpart with power, oxygen, cargo, and crew transfer.

### Fuels

| Stage | Propellant | Production | Use |
| --- | --- | --- | --- |
| Early | Refined Rocket Fuel | oil/bio-oil refinery | Hopper/Hearthwing; forgiving storage |
| Mid | Methane + Oxygen | reformer + electrolyzer/compressor | efficient reusable ships and Suno operations |
| Mid/late | Hydrogen + Oxygen | electrolysis + cryogenic processing | high performance; boil-off/insulation decisions |
| Late | Starwake Charge + conventional maneuver fuel | Hope crystals/Wayworks | deep transfer and magic-tech systems; not free energy |

Fuel loaders draw only while a valid docked ship can accept material. Separate tanks and gauges show fuel and oxidizer. A ship battery powers avionics, pumps, cabin, landing aids, and emergency systems; empty batteries halt those functions but remain rechargeable.

### Travel state machine

1. **Plan:** select a discovered destination and intended landing/orbit location.
2. **Validate:** host checks ship tier/modules, pad, clearance, weather, fuel, energy, life support, passenger consent, permissions, and destination availability.
3. **Reserve:** lock required fuel/cargo changes and create a travel transaction.
4. **Countdown:** players may abort; machine transfers freeze at final seconds.
5. **Ascent:** short interactive flight, camera spectacle, and atmospheric effects; authority remains host-side.
6. **Orbit insertion:** ship enters the origin orbit location; System Map opens with reachable routes.
7. **Transfer:** deterministic duration/cost; optional events are seeded and never duplicate rewards on reconnect.
8. **Approach:** destination sky and hazards load behind a transition boundary.
9. **Landing/docking:** ship becomes durable state in destination location.
10. **Commit:** destination checkpoint completes before origin hot state is released.

The system supports direct surface-to-surface abstractions later, but orbit is never skipped for first discovery.

### Recovery, not save loss

- Each launch can register a Rescue Beacon and home station.
- If stranded, the player can issue a slow emergency recovery after a clear cost: cargo limits, time advance, reputation/fee, or a rescue quest.
- Multiplayer allies can accept a rescue contract.
- Creative mode can relocate ships without cost but records a debug action.

## Submarines and Suno traversal

### Vehicle roster

| Submarine | Capacity | Systems | Role |
| --- | --- | --- | --- |
| Reefskiff | 1 pilot + 9 cargo | battery, one O2 tank, lights, shallow hull | early reef and island scouting |
| Bathyscout | 2 crew + 27 cargo | swappable batteries, two O2 tanks, sonar, manipulator | mid-depth exploration and ruins |
| Pelagic Houseboat | 4 crew + 81 cargo | pressurized cabin, dock, crafting, ballast, rescue winch | mobile Suno base |
| Abyssal Lander | 3 crew + 54 cargo | high-pressure hull, thermal control, drill arm | trenches, deep structures, rare ecology |

### Systems

- Batteries are rechargeable at docks or from installed generators; zero charge stops propulsion and active life support but does not destroy the battery or vehicle.
- Filled O2 tanks feed the cabin. Surface snorkel/intake and electrolysis can refill with sufficient power.
- Buoyancy is an authoritative ballast quantity; ascend/descend is not a hidden vertical teleport.
- Hull rating determines safe depth. Warning, leaks, and crush risk are gradual and repairable.
- Sonar reveals coarse terrain/large creatures without populating the permanent map until surveyed.
- Vehicle interiors are compact instanced locations only for larger subs; small subs use seated vehicle UI and an external model.

## Maps and navigation

### Four modes

1. **Local Map** — current explored chunks, terrain, POIs, players, markers; existing behavior generalized by `locationId`.
2. **Planetary Atlas** — discovered regions, biomes, settlements, landing sites, orbital facilities, moon relationships, and surface layers for one body.
3. **Orbital Chart** — stations, docks, ships, asteroid claims, orbital bands, transfer windows, debris/weather hazards, and surface landing beacons.
4. **System Map** — Waystar, planets, moons, current positions, phases, discovered routes, travel reach, estimated fuel/time, faction controls, and future system exits.

### Interaction

- Scroll/drag/pinch all work with accessible keyboard controls.
- Selecting a body expands moons/stations without overlapping labels.
- Locked/unknown bodies show observational silhouettes, not spoilers.
- A route preview explains every blocker inline.
- Current location, ship, fuel, O2 reserve, and return route remain visible.
- The same screen works at observatories, ship mission consoles, and the main map, with permissions appropriate to context.
- Fast travel remains local; it never substitutes for a ship between celestial locations.

### Map knowledge schema

Replace one `MapKnowledge.worldId` document with a catalog:

```ts
type CelestialMapKnowledge = Readonly<{
  universeId: string;
  playerId: string;
  systemDiscoveries: Readonly<Record<string, SystemDiscovery>>;
  locationMaps: Readonly<Record<string, MapKnowledgeVNext>>;
  sharedRevision: number;
}>;
```

Markers include `locationId`; cross-location route markers contain both origin and destination. Map sharing checks universe/system permissions and merges per-location knowledge without pretending chunks on Talon overlap chunks on Suno.

## Orbit, stations, and asteroids

### Orbit locations

Each body exposes one or more authored orbital bands:

- low orbit: easy access, faster visual parent movement, more debris;
- high orbit: expensive transfer, clearer solar exposure, larger station capacity;
- moon transfer band: efficient route to moons;
- special ring/cloud bands for Orison.

An orbit location is a finite but expandable zero-G voxel shard with a background parent body and deterministic celestial sky. It is not an infinite empty copy of the surface world.

### Station construction

- First orbital claim places a small structural core and docking collar.
- Hull, reinforced window, bulkhead, airlock, truss, solar array, radiator, tank, battery, life-support, cargo, habitation, greenhouse, and observatory blocks form the kit.
- Station blocks are ordinary placeable voxels with sealable-face definitions.
- Ownership supports private, trusted, faction/guild, and public access.
- Build permissions, container permissions, airlock use, ship docking, Waylink access, and life-support controls are separate grants.
- Station name, icon, orbit band, owner, members, docking registry, pressure zones, Wayanchor leases, and location revision persist.

### Asteroid fields

- Orbital catalogs seed asteroid clusters by body/band.
- Each discovered asteroid gets a stable ID, composition seed, shape seed, local frame, slow spin policy, and claim state.
- Entering or anchoring an asteroid creates a finite zero-G voxel location.
- Players can attach station blocks directly to rock; the local frame makes construction stable even while its sky position changes.
- Small loose meteoroids are visual/encounter objects. Large buildable asteroids are durable locations.
- Asteroid resources are finite by actual blocks but drills have no artificial operation limit.
- Collisions/debris storms are seeded events with warnings and shield/hull consequences, not arbitrary base deletion.

### Ad Astra

**Ad Astra** is a grand authored station in the Talon–Hope transfer band:

- owned by Hope's Aurelian high elves but politically open through reputation;
- concentric crescent rings around a living star-crystal observatory;
- pressurized gardens, mage academies, docking spires, Wayworks exchange, spellskiff shipyard, embassy decks, and a public rescue office;
- visible crossing Hope's sky as a bright moving point/short line;
- unlocks outer-system charts, magic-tech modules, and a system-wide diplomatic hub;
- functions as a real station location with pressure, power, NPC schedules, quests, markets, capture habitats, and multiplayer access—not only a menu.

## Performance model for multiple worlds

- Only players' current locations are hot-rendered.
- A host may have several active locations if multiplayer participants are separated; each gets independent budgets and a smaller per-location simulation envelope.
- Unoccupied locations collapse to durable summaries and deadlines.
- Wayanchors activate exact chunk summaries, not meshes or full worlds.
- Networks do not traverse unloaded locations except through explicit scheduled Waylink transactions.
- Pressure zones are topology-cached and dormant when no relevant event occurs.
- Sky ephemeris is analytic and independent of world generation.
- Ship transfers unload origin hot state only after destination commit.
- Per-location LRU caches are byte bounded and can be evicted without losing edits.
- The host exposes CPU/memory cost by location, anchors, networks, pressure zones, creatures, and players.

## The Waystar System roster

The order below is deliberate. Apparent sky relationships and route costs derive from it.

| Order | Body | Kind | Moons/destinations | Core identity |
| ---: | --- | --- | --- | --- |
| 0 | Waystar | star | solar observatories | warm gold-white star; source of local calendars and solar power |
| 1 | Cinderhymn | rocky planet | none | scorched iron deserts, glass canyons, terminator settlements, solar industry |
| 2 | Blockwild | home planet | Morrow | existing living world; balanced ecology and origin of Wayworks |
| 3 | Talon | rocky planet | Hope | red basins, hive civilization, saurian bannerholds, political frontier |
| 4 | Suno | ocean planet | Jun, Styx | water world, reef cultures, underwater megastructures, submarine exploration |
| 5 | Orison | gas giant | Aerie, Rimehold, Vanta | cloud cities, ring mining, storms, outer automation |
| 6 | Hollowmere | dwarf world | Wick | cryogenic wilderness, dark oceans under ice, ancient navigation vaults |

The exact names of Waystar, Cinderhymn, Morrow, Orison, Aerie, Rimehold, Vanta, Hollowmere, and Wick are recommendations. Talon, Hope, Suno, Jun, Styx, and Ad Astra are user-specified and fixed in this plan.

## Destination design: Cinderhymn

### Environmental identity

Cinderhymn is the innermost rocky world. It is not a featureless lava planet. Much of the surface is a dry iron-and-ceramic desert cut by glass canyons, collapsed lava tubes, and a narrow terminator region where permanent dawn/dusk creates the most habitable settlements.

- Gravity: 0.66 g.
- Atmosphere: thin, hot, nonbreathable, mineral-laden; sealed helmet and O2 back source required outdoors.
- Temperature: lethal at exposed noon without thermal protection; cold during the short night; terminator valleys are manageable.
- Weather: ash veils, electrostatic glass storms, radiant heat fronts.
- Solar power: exceptional in clear regions; output must be cooled.
- Water: rare subsurface brine and polar shadow ice.
- Signature play: heat management, solar infrastructure, shade construction, glass traversal, and ancient furnace ruins.

### Biomes

| Biome | Terrain and palette | Flora/ecology | Gameplay |
| --- | --- | --- | --- |
| Saffron Terminator | long gold-orange ridges under permanent low sun | heat-fold lichens, copper reeds | safest landing band and early bases |
| Blackglass Run | obsidian-like channels and splintered glass fans | reflective crust colonies | vehicle hazard, optics, rare glass materials |
| Iron Choir | rust-red hoodoos that resonate in wind | buried mineral worms | sound-based navigation and ore |
| Cinder Salt | pale ceramic flats over brine pockets | salt lace, dormant spore plates | brine extraction and sudden sinkholes |
| Sunward Scarps | blazing cliffs and solar mirrors | almost none | high solar yield, extreme exposure |
| Nightward Hollows | cold lava tubes and black ice | faint thermal mats in ecological centers | caves, water, ancient machinery |

### Factions

- **The Kilnward Compact:** mixed dwarven and local craft houses living in mobile shade-cities. They value repair, water accounting, and honest machine efficiency.
- **The Glass Cantors:** nonhuman resonant artisans who “sing” glass into structural ribs. They are cautious, not automatically hostile, and teach advanced optics.
- **The Ash Ledger:** a salvage cartel that claims abandoned solar fields and creates economic conflict without becoming a universal evil army.

### Creatures

| Creature | Role and silhouette | Behavior/use |
| --- | --- | --- |
| Kilnback Ram | squat six-segment legs, ceramic shoulder plates, ember vents | neutral herd; heat-resistant mount after care bond |
| Glasswing Kite | broad cubic sail wings with dark joint spars | rides thermals; leads to shade and safe passes |
| Ferric Skitter | low iron-shelled arthropod with magnetic forelimbs | scavenges exposed metal; source of magnetic fibers |
| Sunblind Vulp | long-eared blocky fox with mirrored brow shutters | nocturnal tracker and companion |
| Choirworm | segmented canyon burrower with resonant throat plates | territorial; reveals ore through calls; mythic prime form |
| Cinder Siphon | floating heat bladder with four anchored tendrils | absorbs machine waste heat; dangerous near overheated grids |

All use connected cubic anatomy and theme-document materials. Glass is used as inset membrane or plate, not a glowing blob.

### POIs and resources

- Terminator Shade City.
- Buried Solar Choir.
- Blackglass Observatory.
- Kilnship Wreck.
- Brine Vault.
- The Long Furnace dungeon.

Key materials: sun-glass, ferric fiber, kiln ceramic, concentrated brine, solar salts, heatstone. No material is required solely as a decorative progression tax; each supports optics, thermal systems, storage, or ship components.

## Destination design: Blockwild and Morrow

### Blockwild home planet

The current world remains the richest baseline ecology and should not become obsolete after launch.

- Home resources remain necessary for wood, foods, medicines, capture care, ordinary iron, magic, and early Wayworks.
- Celestial research adds observatories, launch clearings, machine trades, and sky events while leaving existing biomes intact.
- Some factions respond differently to off-world materials, creating return reasons.
- Bestiary ecology records gain “world” and environmental-tolerance sections without demoting existing creatures.

### Morrow, the home moon

Morrow is a small grey-green moon visible in the existing night sky. Its exact name is optional, but giving the familiar moon a real location creates continuity.

- Gravity: 0.19 g.
- Atmosphere: trace and nonbreathable.
- Hazards: vacuum, cold night, micrometeor showers.
- Signature: first off-world landing, enormous quiet, crater caves, low-risk station building, and old Waystone ruins that suggest prior celestial travel.

Biomes:

- Pale Regolith Sea.
- Starshadow Craters.
- Moon-Slate Highlands.
- Ice-Lantern Rilles.
- Buried Waystone Galleries.

Creatures:

- **Rillehopper:** plump low-G grazer whose four feet land in sequence; eats mineral frost.
- **Vacuum Lantern:** small shell creature with sealed bioluminescent chamber; caught in jars only inside a pressure enclosure.
- **Slatefin Burrower:** broad plated subterranean swimmer through regolith.
- **Morrow Owl:** silent wide-wing magical migrant that can cross vacuum briefly through a dream veil; rare and not a generic space bird.

Morrow has no large settled native faction. Small observatories, prospectors, rescue shelters, and the first player-owned stations keep its tone uncluttered.

## Destination design: Talon

### Environmental identity

Talon is Mars-like in color and broad environmental grammar, but it is a living contested world rather than an empty analogue.

- Gravity: 0.39 g.
- Atmosphere: thin, cold, dusty, and not safely breathable; helmet plus back O2 required outdoors.
- Water: subsurface ice, seasonal brine channels, protected cavern reservoirs.
- Weather: regional dust fronts, dry lightning, night frost, rare basin rain after magical atmospheric events.
- Signature play: long low-G traversals, fortifications, political territory, hive tunnels, caravans, siege beasts, and water diplomacy.

### Major factions

#### The Veyr Broodweave

A distributed hive civilization of eusocial insectoid people. “Hive” does not mean mindless swarm.

- Queens act as biological archives and long-term coordinators, not absolute remote controls.
- Workers, wardens, gardeners, speakers, and wanderers have individual personalities and roles.
- Cities are excavated spirals around fungal gardens, pressure membranes, and water vaults.
- Their technology combines living resin, ceramics, iron nodules, scent routes, and Wayworks interfaces learned through trade.
- Their central conflict is resource security and memory continuity: dust loss can erase pheromone archives.
- Reputation routes include water engineering, creature husbandry, archive restoration, and defensive war.

#### The Kharuun Bannerholds

Humanoid saurian peoples organized into rival medieval bannerholds.

- Armor uses layered iron, leather, painted ceramic, and creature-scale motifs.
- Settlements are cliff keeps, bridge towns, caravan yards, and brine-farm forts.
- Culture emphasizes oath, hospitality, mounted prowess, heraldry, and public craft.
- They are technologically selective rather than unintelligent; excellent ballistics, water mechanics, and animal breeding coexist with limited electronics.
- Several holds favor diplomacy, some raid, and some are compromised by internal succession conflicts.

#### The Dustbound Exchange

A neutral mixed network of off-world traders, Broodweave speakers, Kharuun merchants, and dwarven mechanics. It prevents the two-faction premise from flattening all Talon life into a binary war.

### Conflict structure

- World generation assigns territories, contested corridors, neutral wells, and historical claims deterministically.
- Settlements are not perpetually attacking. Escalation depends on quest/faction state and resources.
- Players can ally with one faction, mediate, remain independent, or establish a recognized free settlement.
- Captured creatures, water access, and mining can affect reputation; ecology destruction has visible political consequence.
- No path permanently erases all content. Rival questlines remain readable through diplomacy, archives, or later reconciliation.

### Biomes

| Biome | Terrain | Life | Special play |
| --- | --- | --- | --- |
| Red Banner Steppe | rolling iron-red shelves and dry grass | herd animals, caravan life | mounted travel and forts |
| Broodglass Basin | shallow crater plains with resin-glass vents | fungus groves, insect colonies | hive cities and pressure membranes |
| Knife Mesa | tall layered mesas and natural bridges | cliff nests and tough shrubs | vertical keeps and gliding |
| Brine Scar | seasonal salt channels and ice wells | dormant reeds, burrowers | water extraction and diplomacy |
| Stormbone Badlands | pale fossil ridges under static storms | armored scavengers | lightning resources and combat |
| Ember Night Dunes | warm dark sand, cold surface nights | nocturnal hunters | stealth, glass tracks, long moon shadows |
| Underloom | immense connected hive/cave region | fungal farms, cave ponds, living resin | underground settlements and ecology |

### Talon creatures

| Creature | Design | Ecology/combat/capture value |
| --- | --- | --- |
| Bannercrest Strider | bipedal pack beast with layered neck crest, grounded toes, fitted saddle ribs | Kharuun mount; wild herds defend young |
| Brinehorn | low quadruped with hollow horn reservoir and broad digging feet | finds subsurface water; leather/meat only when sensible |
| Redwake Warg | cubic long-bodied predator with two-part legs and dust banner mane | aggressive companion route; faction war mount |
| Resinback Gardener | six-legged beetle-like grazer carrying fungus shelves | Broodweave agriculture and compost utility |
| Needlewing Courier | narrow segmented flyer with paired membrane panels | carries local signals; capturable scout |
| Stormjaw Drake | small wingless drake with conductive jaw plates | hunts during lightning; power-grid hazard/companion |
| Dust Choir | flock organism of many small cubic floaters | environmental weather signal; captured as colony habitat |
| Mesa Crown Tyrant | rare large feathered saurian with connected multi-segment legs and blocky plume | legendary territorial encounter; not a Kharuun person |
| Wellshell | tortoise-like animal with mineral-filter shell | improves brine farms and settlement ecology |
| Archive Mite | tiny social arthropod that preserves scent tablets | noncombat collectible with research utility |

### Talon POIs/dungeons

- Veyr Spiral City.
- Kharuun Bannerhold (several architectural variants).
- Neutral Brine Confluence.
- Fallen Sky-Gantry.
- Fossil Siege Road.
- Dustbound Caravanserai.
- Queenless Archive dungeon.
- The Red Crown arena/fortress.
- Underloom Resin Cathedral.
- Hopeward Launch Monastery.

### Resources

- Talon iron (ordinary iron, visually red-weathered but interoperable).
- Brine ice and perchlorate-like salts for chemistry (fictionalized safely).
- Resin ceramic.
- Stormglass.
- Fossil fiber.
- Red quartz.
- Hive wax/resin components.

## Destination design: Hope

### Environmental identity

Hope is Talon's bright moon: divine in atmosphere without being a generic heaven realm.

- Gravity: 0.35 g.
- Atmosphere: thin but magically stabilized and breathable in most valleys; high peaks and exposed outer slopes require supplemental O2.
- Climate: clear, cool, luminous, with fast cloud ribbons and rare gentle star-snow.
- Terrain: deliberately sloping and hilly, with large valleys, high mountains, suspended stone arches, mirror lakes, and sheltered alpine forests.
- Danger: lower than other off-world destinations. Hazards are weather, altitude, navigation, and magical instability rather than constant hostile mobs.
- Signature play: graceful low-G traversal, spellcraft, diplomacy, observatories, rare materials, sanctuaries, and Ad Astra.

### The Aurelian High Elves

- Spacer faction blending precise magic, living crystal optics, sail-like solar craft, Wayworks adapters, and old high-elven architecture.
- Their culture values navigation, stewardship, memory, and deliberately beautiful infrastructure.
- They are powerful mages but not omniscient; their outer-system charts depend on maintained observatories and alliances.
- Technology is visibly constructed: moonstone frames, fitted pale wood, star-crystal lenses, iron jointwork, cloth light-sails, restrained gold accents.
- Internal groups include the Ad Astra Navigators, Valley Conservators, Spell-Rig Artificers, and the politically cautious Horizon Synod.
- High reputation unlocks spellskiffs, starwake navigation, advanced EVA modules, and sanctuary-based creature care.

### Biomes

| Biome | Identity | Content |
| --- | --- | --- |
| Aureate Valley | broad bright meadow valleys between peaks | villages, orchards, gentle grazers |
| Star-Snow Slope | pale snow with rare luminous flakes | mage towers, cold herbs, high O2 caution |
| Mirror Lake | calm lakes reflecting Talon | observatories, water magic, celestial events |
| Pilgrim Stair | immense terraced mountains | monasteries, launch paths, gliders |
| Whitebough Grove | pale alpine forest with restrained glow | sanctuary creatures and magic wood |
| Skyfold Arch | natural bridges and floating-looking cantilevers grounded by magic | traversal puzzles and spell materials |
| Grand Hollow | enormous sheltered valley cavern open to sky | living settlement and large gentle flyers |

### Creatures

| Creature | Design/use |
| --- | --- |
| Hopehorn Ibex | plump articulated mountain grazer with star-crystal horn facets; sure-footed mount |
| Aurelian Kite | broad squared feather/sail wings, connected shoulder blocks; rideable glider at high bond |
| Valleylight Hart | detailed cubic deer with restrained luminous antler insets; sanctuary guide |
| Psalmfin | small fish that swims in mirror lakes and short air ribbons during conjunctions |
| Cloudmantle | large gentle six-winged sky ray with blocky central body; group transport after quest |
| Bellmoss Familiar | tiny round-cubic plant creature used by mages to detect pressure leaks and magic instability |
| Dawn Gryphon | rare, connected quadruped/avian anatomy; guardian, not ordinary hostile |

### POIs/resources

- Ad Astra orbital station.
- Valley Conservatory.
- Spell-Rig Atelier.
- Mirror Lake Observatory.
- Pilgrim Launch Stair.
- Whitebough Sanctuary.
- Fallen Comet Chapel.
- The Ninefold Lens dungeon, focused on navigation rather than killing.

Materials: hopeglass, star-snow crystal, whitebough timber, auric thread, sky-iron, resonant water. All have crafting, navigation, EVA, or magic uses.

## Destination design: Suno

### Environmental identity

Suno is a water world with very few islands. Its inspiration is the wonder, scale, family ecology, reef culture, and aquatic traversal associated with grand ocean science-fantasy—not copied Avatar names, peoples, animals, vehicles, architecture, or story.

- Gravity: 0.92 g.
- Atmosphere: breathable, humid, storm-prone.
- Surface: more than 99% ocean in the authored fantasy geography; islands are rare volcanic, coral, or floating-root formations.
- Ocean: vertically layered shelves, open water, kelp forests, warm reefs, blue holes, abyssal plains, trenches, thermal vents, and submerged cave worlds.
- Signature play: submarine progression, pressure, O2 logistics, vertical mapping, megafauna, reef settlement, rescue, current riding, and underwater construction.

### Factions

#### The Pelagic Concord

A network of reef-city cultures built around current calendars, creature partnership, and living-stone architecture. They use both free swimming and pressure habitats; they are not direct analogues of any Avatar culture.

#### The Brasswake Fleet

Mixed surface/off-world sailors and dwarven engineers operating ships, platforms, submersibles, and salvage yards. Their conflict with the Concord is about extraction boundaries and safety, not simple good versus evil.

#### The Deep Choir

An ancient distributed civilization occupying pressure-sealed abyssal structures. Their communication uses low-frequency water resonance and patterned light. Some enclaves are alive; others are automated ruins.

### Ocean regions

| Region | Depth/terrain | Dominant life | Play |
| --- | --- | --- | --- |
| Sunlit Endless | surface to shallow open ocean | shoals, sail creatures, drifting flora | boats, storms, first submarine |
| Crown Reef | shelves and coral towers | dense colorful ecology | settlements, gathering, capture |
| Ribbon Kelp | tall connected forests | grazers, ambush animals | vertical navigation and farming |
| Sapphire Bluehole | steep circular descents | cave fish, pressure flora | natural route to deep layers |
| Pilgrim Current | strong stable current corridors | migrating megafauna | fast travel with skill/vehicle |
| Lantern Midwater | dark open water with ecological glow centers | bioluminescent colonies | navigation by life, not everywhere-glowing soup |
| Blackwater Plain | deep cold seafloor | sparse large scavengers | submarine reliance and ruins |
| Furnace Trench | thermal vents and mineral chimneys | chemosynthetic gardens | power/resources/hazard |
| Drowned Crown | grand underwater city/temple structures | Concord/Deep Choir content | politics, dungeons, habitation |

### Suno flora

- Crown Kelp: dominant tall staple; trunks and fronds connect cleanly across blocks.
- Currentgrass: dominant low seafloor meadow.
- Fan Coral: structural reef staple with restrained variants.
- Driftbloom: floating surface-root plant that forms rare rest islands.
- Lantern Cups: uncommon bioluminescent ecology-center plant, not general ocean carpet.
- Pressure Vine: deep flexible cable-like plant used in crafting.
- Glass Sponge: filter feeder and habitat resource.
- Thermal Lace: vent colony used in heat chemistry.

### Suno creatures

| Creature | Design | Role |
| --- | --- | --- |
| Reefback Treader | broad six-flipper grazer with a small living reef on connected shell plates | sanctuary and mobile farming ecology |
| Ribbonray | long squared fins with articulated root joints | rideable current glider after bond |
| Tidebell Calf | plump aquatic mammal with clear eyes, jaw, and tail flukes | social companion and rescue helper |
| Crownjaw | large reef predator with blocky armored brow and visible mouth anatomy | dynamic combat and capture route |
| Lantern Choir | coordinated school with one colony identity | mobile light and sonar research |
| Kelpkeeper Crab | sturdy multi-segment legs, claws connected at shoulders | kelp farm utility and drops |
| Bluehole Serpent | long segmented swimmer with restrained fins, not a tube | rare mount/guardian |
| Stormsail | surface flyer/swimmer with foldable cubic sail | weather prediction and travel |
| Furnace Whale | immense deep megafauna with vent-resistant plates | legendary nonharvest ecology encounter |
| Cathedral Nautilus | grand spiral shell creature with connected tentacle bases | Deep Choir key and habitat restoration |
| Blackwater Prowler | mean deep predator with pressure-sensing facial plates | abyssal threat, sub defense |
| Pearlkin Otter | compact cubic otter with tool use | playful companion, item retrieval |

### Structures and POIs

- Concord Reef-City.
- Brasswake Surface Platform.
- Deep Choir Resonance Cathedral.
- Sunken Observatory.
- Pilgrim Current Gate.
- Abyssal Garden Dome.
- Thermal Foundry.
- Whale-Fall Sanctuary.
- Drowned Crown megadungeon.
- Rare volcanic island village and launch field.

### Construction and farming

- Underwater blocks follow explicit waterlogging/placement rules.
- Pressure habitats can pump out water after sealing and consume energy proportional to volume/depth.
- Shellfruit and other underwater crops integrate with Suno farming rather than being forgotten.
- Kelp/coral farming has regrowth and ecology constraints; harvesting mature nodes can leave the root/young state, matching the current QoL crop rule.
- Large builds use pressure bulkheads and sub docks; exterior machines require depth/pressure ratings.

## Destination design: Jun

Jun is Suno's lush jungle moon, seen as a green-gold orb from the ocean.

- Gravity: 0.68 g.
- Atmosphere: breathable, warm, oxygen-rich within safe game limits.
- Terrain: dense jungle, canyon rivers, huge root shelves, cloud forests, sinkhole lakes, and high canopy plateaus.
- Signature: vertical canopy settlement, living materials, biofuel, gliding, pollination, and large plant-creature symbioses.

Biomes:

- Great Root Jungle.
- Rainstep Escarpment.
- Cloud Orchard.
- Mirror Marsh.
- Thunder Canopy.
- Sunken Green Caldera.

Factions:

- **The Junward Gardeners:** mixed local peoples organized around ecological stewardship and living architecture.
- **The Canopy Freeholds:** independent rope-bridge settlements, glider pilots, and traders.
- **The Green Engine:** a semi-sentient ancient terraforming ecology; a faction-like system rather than a speaking empire.

Creatures:

- Rootstride Tapir: large plump articulated browsing mount.
- Canopy Marmoset: small social tool user and farm helper.
- Thunderplume: colorful emu-like runner with conductive feathers.
- Sailtail Gecko: blocky toes and fold-out gliding membrane.
- Orchard Gryphlet: small quadruped-bird pollinator.
- River Crown Crocodile: armored predator with connected jaw and tail segments.
- Walking Bromeliad: plant creature holding a real water cup ecology.
- Verdant Titan: rare gentle long-legged megafauna that carries a canopy garden without floating limbs.

POIs include living villages, pollen observatories, storm orchards, root-engine chambers, and a caldera sanctuary.

## Destination design: Styx

Styx is Suno's smaller outer moon with blue and black sands and unusually rich mineral seams.

- Gravity: 0.23 g.
- Atmosphere: negligible; helmet plus back O2 mandatory.
- Temperature: cold with severe shadow gradients.
- Surface: cobalt-blue sand seas, black basalt shelves, impact melt glass, deep rifts, and ice-shadow deposits.
- Signature: low-G mining, recoil management, solar shadow planning, rare materials, and stark views of Suno and Jun.

Biomes:

- Cobalt Dune.
- Vantablack Shelf.
- Starfall Glass.
- Ice-Shadow Rift.
- Magnetic Basin.
- Suno-Facing Cliffs.

Creatures:

- Magnetail Hopper: uses a heavy tail anchor before leaps.
- Blueglass Scarab: small articulated mineral grazer.
- Shadowfin: glides through electrostatic dust above the surface.
- Basalt Hound: territorial four-legged pack animal with magnetic feet.
- Styx Crown Moth: vacuum cocoon stage and brief active flights near geothermal vents.

Factions/POIs:

- small mining cooperatives and abandoned Deep Choir sky-listeners;
- Brasswake extraction camps;
- Magnetic Abbey;
- Black Sand Vault;
- Impact Glass Labyrinth;
- ancient Suno-facing signal array.

Key materials: cobalt sand, black basalt fiber, impact glass, cryo-ice, magnetite, styxite conductor, rare star crystal. Veinmetal may occur but its exact nature remains unresolved as required by existing world design.

## Destination design: Orison and its moons

### Orison

Orison is a banded gas giant. It can be orbited but not landed on a solid surface.

- Gameplay gravity at stable cloud-deck aerostats: roughly 0.95 g.
- Atmosphere: hydrogen-rich, nonbreathable, high wind, lightning, increasing pressure with depth.
- Locations: orbital rings, floating aerostat settlements, storm-harvesting platforms, descending research balloons, and temporary sky-islands of dense crystal/fungal mats.
- Signature: storm energy, vertical atmospheric navigation, gas harvesting, ring mining, and dramatic sky scale.

Factions:

- **The Orison Aerarchy:** diverse floating settlements linked by sailships and pressure elevators.
- **Stormwright Union:** engineers operating lightning farms and weather observatories.
- **The Quiet Below:** mysterious Deep Choir-related signals from pressure depths, mostly explored through probes rather than humanoid cities.

Creatures:

- Cloud Grazer: enormous buoyant animal with blocky rib/sail silhouette.
- Storm Manta: angular flyer whose conductive tips flash before lightning.
- Bellowsquid: gas-bladder animal with connected articulated arms.
- Ring Kite: small orbital/upper-atmosphere migrator.
- Thunder Crown: rare legendary storm organism encountered as a moving weather ecology.

### Aerie

- Gravity 0.42 g; breathable but thin.
- Wind-cut mesas, vast canyon skies, grass shelves, and storm sails.
- Rideable flyers and sail carts dominate.
- Settlements build into leeward cliff faces.
- Key materials: windstone, storm silk, light alloy ores.

### Rimehold

- Gravity 0.50 g; thin nonbreathable atmosphere.
- Thick ice crust over a dark subsurface ocean and geothermal caverns.
- Strong base for cryogenic fuel, coolant, and outer-system agriculture in heated domes.
- Creatures include ice-boring seals, lantern shrimp colonies, plated rime bears, and geothermal finwhales.
- Dungeons preserve old pressure laboratories and frozen navigation records.

### Vanta

- Gravity 0.31 g; vacuum.
- Volcanic black-glass moon with faint aurora and weak solar exposure.
- Exceptional heat gradients, rare heavy minerals, and dangerous glass quakes.
- Creatures are sparse: vent scarabs, magnetic basalt crawlers, and the rare Vanta Wyrm.
- Remote industry needs geothermal power, radiators, and robust seals.

## Destination design: Hollowmere and Wick

### Hollowmere

An outer dwarf world: quiet, cold, and more alive beneath its crust than from orbit.

- Gravity: 0.45 g.
- Atmosphere: thin nitrogen/methane-like haze, nonbreathable.
- Surface: nitrogen frost analogues, dark blue ice, low mountains, cryovolcanic plains.
- Interior: huge warm caverns, black freshwater seas, fungal forests concentrated around geothermal centers, and ancient navigation vaults.
- Signature: long-range logistics, heat scarcity, sub-ice exploration, dormant civilization mysteries, and first clues to other star systems.

Biomes:

- Indigo Frost Plain.
- Cryogeyser Reach.
- Glass-Ice Ridge.
- Warm Hollow Forest.
- Under-Mere Shore.
- Navigator Vault Belt.

Factions:

- **The Hearthkeepers:** small subterranean settlements organized around shared heat and careful hospitality.
- **Vault Cartographers:** scholars mapping old stellar routes.
- **The Pale Current:** a nonhumanoid aquatic intelligence communicating through pressure pulses.

Creatures:

- Frostbell Yak: compact heavily furred utility grazer with removable visual wool.
- Cryojaw Newt: large amphibious cavern hunter.
- Glass-Ice Owl: broad cubic wing and silent low-G flight.
- Mere Lanternfish: social school lighting only ecological centers.
- Warmroot Mole: subterranean tunneler and soil helper.
- Pale Current Leviathan: legendary intelligent undersea encounter.

### Wick

Wick is a tiny bright ice moon and observatory destination.

- Gravity 0.19 g, vacuum, highly reflective terrain.
- Crystal spires, shallow craters, and one enormous ruined lens array.
- Sparse life exists in sun-warmed crystal cracks.
- Completing the Wick Array reveals deterministic seeds/catalog hooks for future star systems without opening them yet.

## Planetary faction and settlement framework

- `FactionDefinition` gains `homeBodies`, environmental tolerances, ship access, technology/magic tags, settlement generators, diplomatic relations, and orbital presence.
- Settlement placement is body/biome aware and uses local generator policies.
- A faction can own surface settlements, stations, fleets, POIs, and waylink frequencies.
- Reputation remains per faction but can include system-wide treaties and body-local consequences.
- Roads generalize to routes: roads on land, current lanes on Suno, caravan beacons on Talon, air lanes on Hope/Aerie, and transfer lanes in orbit.
- Guilds can establish chapters in off-world settlements, but faction identity and guild identity remain distinct.
- NPC schedules respect local day length and pressure zones.
- Hostility does not bypass environmental rules; an NPC in vacuum needs appropriate equipment or biological tolerance.

## Planetary creatures, capture, and bestiary

### Definition extensions

```ts
type EnvironmentalTolerance = Readonly<{
  minGravityG: number;
  maxGravityG: number;
  pressureRangeKPa: readonly [number, number];
  breathableMedia: readonly ("oxygen-air" | "water" | "methane-haze" | "vacuum")[];
  temperatureRangeC: readonly [number, number];
  radiationResistance: number;
  corrosionResistance: number;
}>;
```

Every creature definition declares native locations/biomes, environmental tolerance, locomotion profile, and whether capture storage provides life support. Capturing a creature does not make it friendly; the existing care/bond/conversion model remains authoritative.

### Off-world capture rules

- The ordinary Capture Orb remains the one player-facing orb type.
- The orb preserves a safe suspended state; it does not consume O2 during storage.
- Releasing checks the target environment. The UI warns or blocks release that would immediately kill an ineligible creature.
- Habitat displays and ranches need appropriate pressure, atmosphere, water, gravity aids, temperature, and ecology.
- Research can reveal environmental needs before full capture details.
- Prime/special variants use meaningful world conditions, not universal shininess.

### Bestiary expansion

Add expandable sections per creature:

- home system/body/location;
- biome and vertical layer;
- gravity/atmosphere/temperature tolerances;
- locomotion in alternate gravity;
- capture readiness and care bond;
- habitat pressure and life-support needs;
- drops/resources with ethical/ecological notes;
- faction relationships;
- research steps and observations;
- variants and off-world adaptations;
- mount/flight/swim/space utility;
- sounds and communication medium.

Cards remain performance-efficient renders derived from actual creature models and authored framing, not separate inconsistent designs.

## Audio and environmental presentation

- Vacuum outside a suit removes ordinary spatial air-borne sound; suit contact, radio, impacts through structures, breathing, and equipment remain.
- A frequency/radio module can carry nearby player, NPC, agent-drone, and ship communication.
- TTS spatial/global settings extend naturally to radio channels.
- Low pressure filters high frequencies; underwater audio uses distance and material propagation.
- Each body receives ambience: Talon dust and distant stone calls; Hope wind bells and thin air; Suno currents and animal calls; Styx suit/contact silence; Orison storms; Hollowmere ice and under-mere resonance.
- Machine loops are layered, distance-bounded, state-driven, and mufflable. A blocked machine does not keep its full active loop.
- Suno/space content will likely need new original sound assets; existing sounds may be reused only where species/material similarity makes sense.

## Weather and celestial events

- Events are deterministic from body seed, local time, and region; the host announces authoritative start/end.
- Talon: dust fronts, frost, dry lightning, rare brine thaw.
- Hope: star-snow, valley inversion clouds, conjunction festivals.
- Suno: storms, tides, current reversals, rare calm windows, moon-driven reef blooms.
- Jun: canopy storms, pollen seasons, river surges.
- Styx: micrometeor showers, eclipse cold, electrostatic dust.
- Orison: lightning belts, pressure tides, ring debris windows.
- Hollowmere: cryogeyser cycles, aurora, deep warm pulses.
- Solar flares can affect exposed grids and radio late in progression, with warnings and grounding/capacitor counterplay.

## UI and UX system

### Machine panel shell

Reusable panel regions:

- title, owner/security, orientation, and status;
- input/output slots/tanks;
- energy and heat;
- process progress;
- exact blocker text;
- six-face configuration tab;
- auto-eject/filter/control tab;
- upgrades tab;
- network inspector link;
- help/wiki key opening the exact machine page.

Mobile/compact layouts use tabs and drawers rather than shrinking everything.

### Mission console

The mission console presents:

- destination portrait and orbit relationship;
- discovered landing/docking choices;
- ship reach and module requirements;
- fuel/oxidizer/energy needed versus loaded;
- crew, seats, personal O2, and cabin life support;
- cargo mass abstraction and return reserve;
- weather and route hazards;
- estimated travel duration;
- rescue beacon and abort plan;
- one clear **Launch** action only when host validation passes.

Each failed requirement is actionable (“Load 320 L oxygen into the cabin tank”) rather than a red mystery icon.

### Life-support UX

- Field helmet HUD stays compact.
- Controller UI provides detailed zone composition.
- Door/airlock indicators show safe cycle direction.
- Leak overlay leads to a coordinate/face.
- A pressure change uses screen/audio feedback without inducing excessive motion or flashing.

### Accessibility

- Shape/icon labels accompany resource colors.
- Motion reduction reduces sky/parallax/UI animation without changing orbital state.
- Comfort 0G mode controls camera roll and acceleration easing.
- Critical alarms have captions and controller log entries.
- Map and machine panels are fully keyboard navigable and scroll correctly.
- Text size scales without clipping resource bars or system-map labels.

## Economy, crafting, and progression balance

### Principles

- Early Wayworks should improve existing play before demanding space travel. A crusher, battery, pump, and charger are useful on the home world.
- New planets add lateral advantages and specialized materials rather than multiplying every stat by ten.
- Basic oxygen, power, and rescue components remain replaceable. A lost tank should create a recovery problem, not a dead save.
- High-tier ships require cooperation between exploration, factions, magic, automation, and construction; they should not be unlocked by one ore grind.
- Renewable systems have infrastructure, area, weather, or throughput constraints; fuels have processing/logistics constraints.
- Faction markets buy and sell useful consumables and repair parts, with buy/sell-all quantity controls inherited from existing trading QoL.

### Material ladder

| Stage | Materials | Unlocks |
| --- | --- | --- |
| Foundation | iron, copper/brass where present, glass, stone, wildwood, leather, redstone-like control materials already in Blockwild | cables, batteries, basic machines, field helmet/tank, launch pad |
| Orbital | compressed plate, star crystal, insulated fabric, moon slate, refined fuel | Survey Hopper, station hull, solar array, EVA basics |
| Talon | resin ceramic, stormglass, red quartz, fossil fiber | pressure membranes, dust seals, Hearthwing upgrades |
| Hope | hopeglass, auric thread, sky-iron, star-snow crystal | spell-rig, navigation lens, Starwake components |
| Suno system | pressure vine, nacre composite, cobalt/styxite conductor, cryo-ice | submarines, high-pressure hull, methane/O2 systems, Wayfarer |
| Outer system | storm silk, ring metal, rime coolant, Vanta glass, navigator crystal | Atlas Freighter, high-capacity storage, deep-system charts |

Veinmetal may interact with late Wayworks, but its exact biological/magical/mechanical nature remains intentionally unresolved. Machines can measure behavior without the lore deciding what it “really is.”

### Research and blueprints

- Recipes use existing crafting, workstation, faction, quest, guild, dungeon, and blueprint systems.
- Essential safety recipes are deterministic unlocks, not low-probability boss drops.
- Major ship/frame blueprints come from explicit milestones with bad-luck protection if loot remains involved.
- Research reveals route efficiency, environment data, machine upgrades, and creature care rather than imposing repeated scan gates on every craft.
- The wiki and in-game field guide share one content source, with spoiler stages based on discovery/research.

## Multiplayer and authority

### Host ownership

The host remains authoritative for:

- universe time and ephemeris correction;
- current location and travel transactions;
- block edits and generation contracts;
- gravity/environmental damage;
- AirZone topology and gas accounting;
- machines, networks, transfers, Wayanchors, and drills;
- vehicles, fuel, cargo, passengers, docking, and landing;
- factions, quests, captures, and durable creatures;
- station/ship ownership and permissions.

Clients may predict camera, local movement, ship controls, door animation, and UI progress, but reconcile to host tick/revision.

### Multiple locations

- Player poses, actions, entities, edits, drops, vehicles, and snapshots include `locationId`.
- A client receives full state only for its current location and authorized remote panels.
- The host allocates a per-location budget when players separate across planets/orbits.
- Natural spawning and full AI occur only near players in each location.
- Station chat/radio can bridge locations through powered communication systems; ordinary spatial voice cannot.
- A player joining a world loads the universe catalog and current-location checkpoint first.

### Travel concurrency cases

- All passengers explicitly consent before countdown, or the pilot launches only consenting occupied seats.
- Disconnect during countdown removes the passenger safely and revalidates mass/O2.
- Disconnect during committed transfer keeps the passenger in vehicle custody; reconnect resumes there.
- Host shutdown during transfer resumes from transaction journal.
- Vehicle destruction uses a separately balanced rescue/escape path and never duplicates cargo on rollback.
- Players can remain on origin while another group travels; origin remains hot only because a player is there.

### Ownership and security

- Machines, networks, stations, ships, Waylinks, and anchors support private, trusted, faction/guild, and public modes.
- Read, configure, insert/extract, operate, dock, build, and administer are separate permissions.
- Agent-drone capabilities use the same authority checks and revision/lease system as human actions.
- Public-facing UI never substitutes for server-side enforcement.

## Agent-player support

The existing Blockwild agent platform should understand the expansion through stable tools rather than screen scraping:

- read current system/body/location, gravity, atmosphere, pressure, and hazards;
- inspect personal O2, back equipment, battery, ship, and route readiness;
- query system map discoveries and reachable destinations;
- configure machine sides/filters only with permission;
- inspect network throughput and blocker states;
- build from inventory with location-aware coordinates and pressure warnings;
- operate airlock cycles and verify both doors/vents;
- pilot/follow in vehicles through bounded high-level commands;
- manage farms/machines in an anchored chunk;
- start deterministic test worlds/locations for debugging.

Agent mode keeps simulation distance 3 and full render distance 4 as already intended. Basic Render Distance remains disabled. Remote machine activity uses summaries, not the agent's visual client.

## Code architecture proposal

### New domain modules

| Module | Responsibility |
| --- | --- |
| `celestial-catalog.ts` | body/system definitions, validation, stable IDs, discovery metadata |
| `celestial-ephemeris.ts` | deterministic orbits, phases, eclipses, sky transforms |
| `location-address.ts` | typed system/body/location/instance/chunk keys |
| `universe-storage.ts` | manifest, per-location IndexedDB records, transaction journal, migration/export |
| `location-manager.ts` | hot/warm/dormant lifecycle, load/unload, budget ownership |
| `environment-policy.ts` | gravity, atmosphere, temperature, corrosion, radiation, water medium |
| `life-support.ts` | personal O2, equipment capability, consumption, alarms |
| `air-zone.ts` | pressure topology request/result, zone gas arithmetic, diagnostics |
| `air-zone-worker.ts` | bounded revisioned topology flood-fill |
| `resource-stack.ts` | fluid/chemical/energy/heat fixed-point types and validation |
| `machine-framework.ts` | shared machine components, scheduler, errors, upgrades, persistence |
| `resource-network.ts` | topology graph and aggregate continuous-resource networks |
| `item-logistics.ts` | discrete item reservation, filters, routing, priority, transactions |
| `power-grid.ts` | generation, battery, consumption, energy telemetry |
| `wayanchor.ts` | ActivityLease request, policy, summary simulation, chunk preview |
| `drilling.ts` | scan jobs, filters, protected blocks, extraction transactions |
| `space-vehicles.ts` | ships, pads, fuel, travel state, custody, docking |
| `submarines.ts` | ballast, depth pressure, batteries, O2, sonar, docking |
| `celestial-map.ts` | local/atlas/orbit/system knowledge and route planning |
| `station-system.ts` | station registry, ownership, orbit bands, docking, modules |

Names can change, but ownership should remain narrow. Do not add all state and per-frame loops directly to `engine.ts`.

### Existing integration seams

| Existing file/system | Planned change |
| --- | --- |
| `app/game/data.ts` | new block/item/recipe definitions; `back` equipment slot; machine and vehicle items |
| `app/game/engine.ts` | coordinate new services; remove assumptions that one engine owns one undifferentiated world; preserve host authority |
| `app/game/world.ts` | location-aware chunk/section keys and generator policy injection |
| `app/game/world-storage.ts` | legacy adapter into universe storage; retain catalog/export UX |
| `app/game/map-system.ts` | per-location maps and celestial catalog; no planet encoded in marker layer |
| `app/game/multiplayer.ts` | location-scoped poses/actions/snapshots/travel authority |
| `app/game/multiplayer-inventory.ts` | back slot and machine/vehicle transactions |
| `app/game/block-facing.ts` | derive six local machine faces from horizontal facing |
| `app/game/digital-storage.ts` / Waygrid UI | integrate bounded automation import/export and owner-scoped networks; do not clone QIO |
| `app/game/liquids.ts` | explicit pump interface between voxel liquids and quantified machine fluids |
| `app/game/aquarium.ts` | reuse bounded topology/reconciliation lessons for formed structures, not its exact rules |
| `app/game/boats.ts` | durable vehicle precedent; share identity/cargo/passenger concepts |
| `app/game/creature-mounts.ts` | environmental protection and per-body vehicle/mount capability |
| `app/game/agent-platform.ts` | location, machine, network, airlock, ship, and environment tools with revisions/leases |
| `app/game/VoxelGame.tsx` | map modes, equipment back slot, mission/machine/life-support panels, settings/chunk outline |

### Registries, not switches

Body, biome, creature, block, item, machine, recipe, ship, fuel, faction, POI, and map-layer definitions should be data registries with validation. A new moon should register policies and content rather than requiring repeated `if (body === ...)` branches.

## Determinism contracts

- Celestial catalog snapshot is immutable after world creation except additive discovered/user content.
- Ephemeris is a pure function of catalog, authoritative universe time, and location.
- Body generation is a pure function of body/location seed, generator version, options, and coordinates.
- Weather/event schedules are pure functions of body seed, region, local clock, and event version.
- Machine processing uses fixed-point quantities and tick/deadline IDs.
- Network rebuild output is independent of block discovery order.
- AirZone topology output is independent of chunk load order for the same available snapshot; unknown boundaries fail closed.
- Mining scan results bind to world revisions and cannot remove a block that no longer matches.
- Travel events and rewards bind to transaction ID and cannot replay after reconnect.

## Performance budgets

### Per active location

- Location coordinator work is budgeted separately from render frame.
- Pressure topology worker has bounded concurrent requests, cells, and result bytes.
- Network topology rebuilds are dirty/event driven and capped per tick.
- Continuous-resource networks update at 5–20 Hz according to activity; visuals interpolate.
- Item routes cap concurrent reservations and visible pulses.
- Machine recipes use cached matches and staggered phase buckets.
- Dormant locations advance analytically by deadline, not historical tick replay.
- Wayanchors activate one chunk summary each.
- System-map ephemeris and sky bodies use cached analytic transforms, not per-frame procedural worlds.

### Visual caps

- Pipe contents are one cached core geometry per visible network sector.
- Station hull blocks batch like ordinary terrain where shape/material allows.
- Planet sky bodies share materials and low-poly/sprite geometry.
- Distant stations/ships use authored silhouettes; interior locations are not rendered simultaneously with exteriors unless explicitly visible through a bounded portal.
- Large creatures use existing render admission and instancing/batching policies with location-aware budgets.
- Dynamic machine visuals update only when state bands change or at a low visual cadence.

### Telemetry additions

- CPU/active time by location and domain.
- hot/warm/dormant locations and bytes.
- network count/segments/endpoints/rebuilds/throughput by resource kind.
- machines active/idle/blocked and scheduler debt.
- pressure zones/cells/rechecks/leaks and worker time.
- Wayanchors active/queued and summary tick cost.
- ship transition phase latency and checkpoint duration.
- O2/power/fluid transactions and failed/rolled-back counts.
- celestial render draw calls/triangles/GPU time.
- multiplayer bytes by location and channel.

## Failure behavior and recovery

| Failure | Required behavior |
| --- | --- |
| Machine loses power | progress pauses or follows explicit decay rule; battery remains; blocker visible |
| Output fills | process stops before consuming another input unless recipe explicitly buffers atomically |
| Pipe/network splits | buffers distribute deterministically within capacities; overflow pauses or returns, never vanishes |
| Tank/multiblock shrinks | formation invalid/remaining capacity reported; contents preserved in controller record until safe drain/rebuild |
| Pressure topology unknown | zone reports checking/unknown and fails safe; no fake breathable air |
| Wall breaks | leak starts from authoritative edit; pressure decays visibly; emergency shutters may respond |
| Airlock loses power | stored actuator charge attempts safe close; manual crank works under safe differential |
| O2 tank empties | alarms/grace/harm; item remains refillable |
| Battery empties | vehicle/machine stops dependent systems; battery remains recharge-ready |
| Ship travel interrupted | resume idempotent transaction from journal; no duplicate ship/cargo |
| Destination fails to load | remain/return to safe origin orbit checkpoint and report error |
| Worker crashes | bounded main-thread fallback or paused service with diagnostic; never corrupt authority |
| IndexedDB quota | preserve authoritative edits/inventory; evict reconstructible cache; surface recovery/export UI |
| Player drifts in 0G | tether/rescue beacon/ship remote recovery; avoid irreversible loss by distance alone |

## Implementation program

This expansion should be built in independently playable phases. Each phase receives its own focused commit(s), deterministic tests, visual review, performance capture, migration check, and rollback flag.

### Phase 0 — Architecture and content freeze

- Approve names, initial destination roster, gravity/atmosphere table, visual references, resource kinds, and first ship/submarine roster.
- Record generator/catalog version contracts.
- Freeze acceptance fixtures and old-world saves.
- Build concept model sheets for machines, pressure doors, ships, and representative creatures under the theme docs.

**Playable result:** none; implementation foundation only.

### Phase 1 — Location identity and universe persistence

- Introduce system/body/location IDs throughout chunk keys, edits, entities, map markers, vehicles, and multiplayer messages.
- Build IndexedDB universe manifest, per-location snapshots, journal, export/import, and legacy migration.
- Keep only home surface enabled in production.

**Gate:** current worlds load and play identically; old save rollback works; no chunk-key collision.

### Phase 2 — Environment and sky foundation

- Add body catalog, ephemeris, local clocks, sky planets/moons/phases/eclipses, gravity policy, and atmosphere policy.
- Create isolated developer test locations for low-G, vacuum, and zero-G.
- Generalize player/creature/projectile/drop physics.

**Playable result:** debug travel among test bodies; visually correct sky relationships.

### Phase 3 — Back slot and personal life support

- Migrate equipment UI/save/multiplayer/agent systems.
- Add helmet, O2 tanks, refilling, consumption, alarms, and creative behavior.
- Add EVA Maneuver Rig, tether, magnetic boots, and comfort controls.

**Gate:** a player can survive, move, run out, swap, refill, save/reload, and reconnect correctly in vacuum.

### Phase 4 — Wayworks power and machine kernel

- Implement resource quantities, machine state framework, power grid, generators, batteries, charger, crusher, press, smelter, pump, tanks, and side configuration.
- Integrate current Waygrid rather than duplicating storage.
- Add shared machine UI shell and Field Wrench.

**Playable result:** useful home-world powered workshop.

### Phase 5 — Fluids, chemicals, oxygen production, and pressure

- Add quantified fluid/gas networks, electrolyzer, compressor, oxygen storage, scrubber, controller, vent blocks, equalization vents, recovery pump, pressure doors, Horizon Doors, Hangar Gates, sensors, shutters, and airlock state machine.
- Add bounded AirZone worker and diagnostics.

**Playable result:** build a complete functional home-world vacuum test habitat and cycle between independently pressurized rooms.

### Phase 6 — Orbit and first ship

- Add pad, gantry, mission console, Survey Hopper, home orbit, Morrow, stations, docking, zero-G construction, asteroid test claims, rescue, and orbital map.
- Make ship custody transaction-safe.

**Playable result:** launch, orbit, build a sealed station, land on Morrow, and return.

### Phase 7 — Talon and Hope vertical slice

- Add Talon generation, weather, biomes, two major factions plus exchange, settlements, creatures, POIs, quests, resources, and Hearthwing.
- Add Hope, Aurelian faction, magic-tech, creatures, and Ad Astra.
- Add faction travel and orbital transfers.

**Playable result:** first full off-world narrative arc.

### Phase 8 — Logistics, factories, Wayanchors, and drills

- Add item/fluid/gas/energy/heat networks, filters/priorities, factories, Reservoir/Accumulator Halls, Waylink, Wayanchor, chunk outline settings, and drill families.
- Validate remote/dormant summary simulation.

**Playable result:** sustainable multi-base industry between Blockwild, Talon, Hope, and stations.

### Phase 9 — Suno, Jun, Styx, and submarines

- Add water-world generation, currents/depth regions, flora, creatures, factions, structures, pressure-rated building, submarines, sonar, battery/O2 docks, and moon content.

**Playable result:** complete ocean-system expedition with surface, reef, abyss, jungle moon, and airless mining moon.

### Phase 10 — Orison outer system

- Add gas-giant orbit/cloud locations, three moons, storm power, ring asteroids, cargo ships, cryogenic systems, and outer settlements.

### Phase 11 — Hollowmere, Wick, and future-system hook

- Add outer dwarf world, sub-ice ecology, navigator vault arc, Deepstar construction, and the data hooks/UX for future systems.
- Do not generate or promise infinite systems until the first one is complete and performant.

### Phase 12 — Full polish and balance

- Complete bestiary/wiki entries, tutorialization, creative inventory, sounds, TCG cards, achievements, accessibility, controller/mobile UX, visual pass, optimization, multiplayer soak, and migration audits.
- Run a final creature model pass against Asterjaw-level detail and connected anatomy.

## Test and validation matrix

### Celestial math and sky

- same seed/time/catalog produces identical body positions;
- parent/moon hierarchy and orbital order are correct;
- phases/eclipses and local sunrise are stable across reload/host/client;
- apparent parent dominates moon sky as authored;
- cave/roof occlusion still hides celestial bodies;
- extreme time values remain numerically stable;
- system map matches the sky within presentation tolerances.

### Location and persistence

- old save migrates to Blockwild surface without terrain/progression loss;
- same X/Z edits on two planets never collide;
- location unload/reload preserves edits, containers, creatures, machines, stations, maps, and weather state;
- interrupted journal transaction recovers to one valid state;
- export/import contains every location and validates checksums;
- storage quota failure preserves authority and offers export/recovery.

### Physics and life support

- player, mob, projectile, drop, mount, and vehicle respond consistently to each gravity;
- zero-G inertia, push-off, tether, magnetic boots, and EVA impulse are deterministic;
- head helmet plus filled back tank satisfies minimum vacuum breathing;
- missing helmet or source fails visibly;
- creative/invulnerable agent does not die but reports environment;
- tank drain/refill/swap persists and replicates;
- thermal/corrosion/radiation layers stack independently.

### Pressure, vents, doors, and airlocks

- rooms of varied shapes seal consistently regardless of flood-fill traversal order;
- unknown chunk boundary fails closed;
- single block/door edit invalidates only intersecting zones;
- Atmosphere Vent reaches target pressure/composition at declared rate;
- Equalization Vent transfers between rooms without topology merge;
- two AirZones can intentionally hold different pressure/composition;
- Horizon Door and ordinary Pressure Door seal only when fully closed;
- Hangar Gate validates every frame segment and full opening;
- both airlock doors cannot open through ordinary control simultaneously;
- recovery pump returns gas before outer opening;
- power failure, manual crank, emergency override, broken door, and save/reload in every cycle state are safe and deterministic;
- leak coordinate/face diagnostics point to a real boundary;
- large/over-capacity zone returns an actionable error without a long frame.

### Automation

- resource insert/extract simulate/commit prevents duplication/loss;
- network topology output is order-independent;
- split/merge, incompatible contents, capacity shrink, full output, and unloaded boundaries are defined;
- continuous throughput respects source/network/destination limits;
- item filters, priority, round robin, fallback, metadata, and full destinations work;
- battery reaches zero, stops machines, remains, and recharges;
- electrolyzer stops when either output fills unless routed/vented;
- machines do not advance from FPS; dormant deadlines match active outcomes;
- Waygrid import/export never exceeds storage or bypasses permissions;
- Waylink uses owner/security and does not duplicate across reconnect.

### Wayanchors and drills

- exact one-chunk lease, release, power pause, queue, permissions, and location scope;
- remote summary advances eligible machines/crops but not natural spawning/full AI/rendering;
- holding anchor previews correct chunk; setting/key default off;
- drill preview equals eligible scan snapshot;
- modified/protected/claimed/POI/seal blocks are not removed;
- output full pauses before removal;
- scan cancel/reset/revision invalidation is safe;
- no artificial lifetime extraction cap exists.

### Ships, stations, and submarines

- mission validation reports each missing resource accurately;
- fueling consumes correct resource and stops at full;
- launch/abort/reconnect/host shutdown are idempotent;
- passengers and cargo remain in exactly one custody record;
- ship battery/O2/fuel state survives every phase;
- station ownership, pressure, docking, and construction persist;
- asteroid IDs/shapes/claims remain stable;
- submarine ballast/depth/battery/O2/hull behavior is deterministic;
- vehicle at zero battery remains recoverable and rechargeable;
- rescue never duplicates cargo or bypasses intended cost.

### World content and art

- each advertised biome generates in normal worldgen and appears in survey tools;
- each faction settlement and POI has valid terrain placement and access;
- tall/connected flora joins across blocks/chunks;
- aquatic content obeys water support and pressure;
- every creature has connected anatomy, collision, locomotion, sound mapping, drops where sensible, capture rules, care, bestiary, and habitat;
- held/inventory/world icons/models exist for every new item/block;
- machine dynamic visuals correspond to authoritative content/state;
- no default/fallback model survives the content audit.

### Performance and soak

- multiple locations with separate players remain within per-location budgets;
- 30-minute factory/pressure/anchor soak has bounded memory and graph work;
- large station edit invalidates bounded pressure/network regions;
- no per-segment per-frame pipe simulation;
- celestial sky and map add negligible frame cost relative to terrain;
- location travel releases old GPU/CPU owners;
- high-speed ship/sub traversal keeps occupied chunks complete;
- telemetry distinguishes rendering, simulation, machine, network, pressure, storage, and multiplayer costs.

## Visual review artifacts required during implementation

For each phase, produce and manually inspect:

- machine/door/vehicle model turntables or three-quarter renders;
- in-game placement gallery under neutral, night, vacuum, and underwater lighting as relevant;
- before/after or reference/production comparison sheets;
- pressure overlay and airlock cycle sequence;
- system map at desktop and compact widths;
- sky views from Blockwild, Talon, Hope, Suno, Jun, Styx, and Orison orbit;
- creature lineups with contact shadows and visible connected joints;
- travel/mission UI states including failure and recovery;
- performance graphs tied to exact commits and settings.

## Rollout and compatibility

- Experimental developer flag first; normal players do not see half-migrated planets.
- Additive save schema with one-release rollback reader.
- Feature flags by domain: celestial IDs, sky, environment, life support, machines, pressure, ships, each destination.
- Creative test worlds for each body and system remain separate from player saves.
- When a body generator changes incompatibly, existing locations stay on their captured generator version; new universes use the new version.
- Multiplayer protocol negotiates celestial schema and rejects incompatible clients clearly.
- Websites deploy only after exact commit, build, production alias, and visible UI verification.

## Content scope summary

Initial full plan proposes:

- 1 star;
- 6 primary worlds including one gas giant and one dwarf world;
- 9 named moons/moon-scale destinations;
- orbit locations for every celestial body;
- player-built stations and deterministic asteroid locations;
- 7 ship classes and 4 submarine classes;
- 5 resource network types and late Waylink relays;
- at least 20 core machines plus formed tanks/storage;
- personal oxygen, back slot, EVA, pressure, vents, airlocks, futuristic pressure doors, and thermal systems;
- more than 50 proposed creature concepts across the system;
- multiple factions, settlement families, biomes, POIs, and dungeons on each major destination;
- a four-mode map architecture and future-system data path.

This is a platform-sized update and should be treated as a sequence of releases, not one unreviewable mega-commit.

## Open decisions for Noah

### Names and roster

1. Approve or replace the recommended names Waystar, Cinderhymn, Morrow, Orison, Aerie, Rimehold, Vanta, Hollowmere, and Wick. Talon, Hope, Suno, Jun, Styx, and Ad Astra are fixed from the brief.
2. Confirm whether the familiar home moon should be named Morrow or remain simply “the Moon” until discovered.
3. Decide whether Cinderhymn and Hollowmere are launch content or the first post-release destination packs. Recommendation: architecture and sky include them at launch; playable terrain can follow Talon/Suno if production scope demands it.

### Survival and complexity

4. Confirm simplified gas composition. Recommendation: pressure, O2, CO2, inert gas, and temperature are enough initially; add trace toxins later.
5. Decide whether radiation belongs in the first release. Recommendation: keep the policy/equipment hook, use it only in narrow outer locations later.
6. Confirm rescue philosophy. Recommendation: every expedition has a slow/costly recovery path; no ordinary preparation mistake bricks a world.

### Automation

7. Confirm real-ish units versus bespoke energy names. Recommendation: use joules/watts, liters, kPa, and °C for clarity, with game-tuned values.
8. Confirm Wayanchor continuous power. Recommendation: cheap block, small power draw, exact one-chunk summary lease, visible host soft budget.
9. Confirm formed-structure maximum. Recommendation: start at 12³ rather than Mekanism's 18³ and increase only after browser benchmarks.
10. Decide whether item channels visibly show sample items. Recommendation: yes, but derived, capped pulses only.

### Travel

11. Confirm physical flight depth. Recommendation: short interactive ascent/descent and local orbit piloting; interplanetary transfer is a planned travel state with optional seeded events, not hours of empty real-time flight.
12. Confirm ship loss. Recommendation: damage/disable and rescue are common; permanent total loss only through explicit high-risk settings.
13. Confirm whether Atlas Freighters are built only in orbit. Recommendation: yes; this makes stations functionally important.

### Doors and habitats

14. Confirm Horizon Door as the default futuristic pressure door name. Alternatives: Starframe Door, Wayseal Door, or Transit Door.
15. Confirm whether unsafe manual opening should be possible. Recommendation: yes with hold-to-confirm and real decompression, while normal controls interlock safely.
16. Confirm player-made pressurized submarines use the same AirZone system. Recommendation: large sub interiors do; small subs use one vehicle cabin zone to avoid expensive topology.

## Acceptance criteria for the future implementation

### Architecture

- [ ] Every mutable world object is scoped to an immutable `locationId`.
- [ ] Existing worlds migrate safely and remain visually/gameplay compatible.
- [ ] Predetermined Waystar content and future generated system catalogs use the same validated schema.
- [ ] Inactive planets/stations consume only bounded durable summary/cache storage.

### Celestial presentation

- [ ] Body order, parent/moon hierarchy, phases, eclipses, local day, and major sky appearance are deterministic and visibly distinct.
- [ ] Every body is orbitable; every solid body is landable; Orison has orbit/aerostat play instead of a fake solid surface.
- [ ] Solar System Map, Orbital Chart, Planetary Atlas, and Local Map are coherent and accessible.

### Survival and building

- [ ] Head helmet plus filled back O2 is the minimum functional survival pair in low/no O2/pressure.
- [ ] Back slot works across save, multiplayer, creative, agent, equipment, visuals, and drops.
- [ ] EVA movement, tether, magnetic boots, zero-G, and low-G are playable and deterministic.
- [ ] Players can build, diagnose, pressurize, depressurize, and safely occupy rooms/stations.
- [ ] Players can build functional multi-room vent systems and complete airlocks with pressure doors, Horizon Doors, vents, pumps, sensors, and interlocks.

### Automation

- [ ] Power generation, rechargeable batteries, storage, transfer, and machine consumption are causal and visible.
- [ ] Items, fluids, gases, energy, and heat move through distinct, reusable, bounded network systems.
- [ ] Machine side configuration, filters, backpressure, upgrades, security, and blocker UX are consistent.
- [ ] Oxygen production from water, compression, tank filling, habitat use, and ship/sub fueling form one interoperable resource loop.
- [ ] Drills run without an arbitrary total-extraction limit while respecting real blocks, power, output, revisions, claims, POIs, and ecology.
- [ ] Wayanchors keep exact chunk summaries active and expose chunk outlines without enabling natural remote spawning or full AI.

### Content

- [ ] Talon, Hope, Suno, Jun, and Styx meet every user-specified identity, faction, terrain, moon, and gameplay requirement.
- [ ] Every other planned destination has a distinct biome/ecology/faction/resource/traversal identity.
- [ ] Ad Astra is a real visitable, pressurized, powered, populated orbital station.
- [ ] Every new creature meets the local theme docs and complete model/animation/capture/bestiary/content audits.
- [ ] Every new block/item/machine has intentional world, held, inventory, and UI presentation.

### Reliability and performance

- [ ] Travel, machines, transfers, drilling, pressure, and persistence are host-authoritative and transaction-safe.
- [ ] No loss/duplication occurs across abort, disconnect, host shutdown, full output, network split, or save migration.
- [ ] Multiple active player locations and anchored dormant chunks remain within explicit budgets.
- [ ] Full automated, deterministic, migration, multiplayer, visual, accessibility, production-build, and long-soak gates pass.
- [ ] The exact release commits are verified on GitHub and both websites before being called deployed.

## Primary external references

### Legacy Galacticraft

- [Official Galacticraft version/installation guide](https://micdoodle8.com/galacticraft-installation-guide/)
- [Official rocket overview](https://micdoodle8.com/rocket/)
- [Official getting-started guide](https://micdoodle8.com/galacticraft-getting-started-guide/)
- [Galacticraft Legacy source](https://github.com/micdoodle8/Galacticraft)
- [Planet Selection Screen](https://galacticraft.mods.wiki/wiki/Planet_Selection_Screen)
- [Tier 1 Rocket](https://galacticraft.mods.wiki/wiki/Tier_1_Rocket)
- [Oxygen tutorial](https://galacticraft.mods.wiki/wiki/Tutorials/Oxygen)
- [Oxygen Sealer](https://micdoodle8.com/oxygen-sealer/)
- [Air Lock Controller](https://galacticraft.mods.wiki/wiki/Air_Lock_Controller)
- [Overworld Space Station](https://galacticraft.mods.wiki/wiki/Overworld_Space_Station)
- [Moon](https://galacticraft.mods.wiki/wiki/Moon)
- [Mars](https://micdoodle8.com/mars/)
- [Astro Miner](https://micdoodle8.com/astro-miner/)

Old Galacticraft behavior varies by version. Exact tank, fuel, tier, and block-count values are treated as historical context, not copied balance.

### Mekanism

- [Official Mekanism wiki home](https://wiki.aidancbrady.com/wiki/Home)
- [Mekanism source and releases](https://github.com/mekanism/Mekanism)
- [Transmitter and system overview](https://wiki.aidancbrady.com/wiki/mekanism)
- [Throughput](https://wiki.aidancbrady.com/wiki/Throughput)
- [Electrolytic Separator](https://wiki.aidancbrady.com/wiki/Electrolytic_Separator)
- [Dynamic Tank](https://wiki.aidancbrady.com/wiki/Dynamic_Tank)
- [Digital Miner](https://wiki.aidancbrady.com/wiki/Digital_Miner)
- [Energy Cube](https://wiki.aidancbrady.com/wiki/Energy_Cube)
- [Logistical Transporter](https://wiki.aidancbrady.com/wiki/Logistical_Transporter)
- [Logistical Sorter](https://wiki.aidancbrady.com/wiki/Logistical_Sorter)
- [Machine configuration](https://wiki.aidancbrady.com/wiki/Tutorials/Machine_Configuration)

The official wiki warns that portions are outdated. Current source governs architectural claims; exact Mekanism names, UI, recipes, visuals, code, and values are not Blockwild specifications.

### Life support and platform grounding

- [NASA — Environmental Control and Life Support Systems](https://www.nasa.gov/reference/environmental-control-and-life-support-systems-eclss/)
- [NASA — Crew Systems](https://www.nasa.gov/reference/crew-systems/)
- [Microsoft — Simulation Distance, Render Distance, and Ticking Areas](https://learn.microsoft.com/en-us/minecraft/creator/documents/simulationrenderdistanceguide?view=minecraft-bedrock-stable)
- [MDN — IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)

## Repository references

- `docs/CREATURE_MODEL_STYLE.md`
- `docs/BLOCKWILD_VISUAL_THEME_PROPOSAL.md`
- `docs/ARCHITECTURE.md`
- `docs/ENGINEERING_OVERVIEW.md`
- `docs/PERFORMANCE_OVERHAUL_MASTER_PLAN.md`
- `docs/BEDROCK_INSPIRED_PERFORMANCE_ARCHITECTURE_PLAN.md`
- `app/game/data.ts`
- `app/game/engine.ts`
- `app/game/world.ts`
- `app/game/world-storage.ts`
- `app/game/map-system.ts`
- `app/game/multiplayer.ts`
- `app/game/multiplayer-inventory.ts`
- `app/game/digital-storage.ts`
- `app/game/liquids.ts`
- `app/game/aquarium.ts`
- `app/game/boats.ts`
- `app/game/creature-mounts.ts`
- `app/game/agent-platform.ts`

## Final recommendation

Approve the architecture before approving all content at once. The right first implementation milestone is not “add Talon.” It is:

1. location identity and universe persistence;
2. environmental/sky policies;
3. back slot and life support;
4. reusable Wayworks power/resource/machine foundation;
5. truly functional pressure rooms, vents, futuristic pressure doors, and airlocks;
6. home orbit, Morrow, one ship, and one station.

That vertical slice proves the hardest cross-cutting systems while keeping the current world playable. Talon/Hope can then be the first content-rich planetary release, followed by Suno/Jun/Styx. The result preserves the strong loops players remember from Galacticraft and Mekanism while making them native to Blockwild's worlds, creatures, factions, magic, browser architecture, and visual theme.
