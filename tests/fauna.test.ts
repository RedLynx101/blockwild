import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  createBirdBehavior,
  createStableSteering,
  chooseLocalWalkableGround,
  fishKindsForHabitat,
  fishSpawnTableForHabitat,
  husbandryAgeScale,
  naturalGroupSizeForMob,
  naturalActivityAllowsSpawn,
  naturalMicrohabitatAffinity,
  passiveMobKindForBiome,
  passiveMobSpawnTableForBiome,
  shouldKeepCreatureLoaded,
  COMPANION_BOND_MOB_KINDS,
  usesGenericCreatureBond,
  updateBirdBehavior,
  updateStableSteering,
  wildHiveResidentSpawnPlan,
} from "../app/game/fauna.ts";
import { Item } from "../app/game/data.ts";
import { BiomeId } from "../app/game/world.ts";
import {
  breedCreatureStates,
  createCreatureHusbandryState,
  feedCreatureForHusbandry,
  tickCreatureHusbandry,
} from "../app/game/creature-care.ts";
import {
  SHADECRAWLER_GROWTH_FEEDS,
  SHADECRAWLER_TRUST_FEEDS,
  canRideShadecrawler,
  createShadecrawlerState,
  equipShadecrawlerSaddle,
  feedShadecrawler,
  shadecrawlerScale,
} from "../app/game/shadecrawler.ts";
import { CREATURE_SAMPLE_BY_ASSET, CREATURE_SOUND_EVENTS, creatureSoundCue } from "../app/game/creature-sounds.ts";
import {
  canCaptureCreature,
  captureCreature,
  decodeCapturedCreature,
  encodeCapturedCreature,
  releaseCreature,
  type CreatureMetadata,
} from "../app/game/creature-cage.ts";

test("bestiary activity prose now gates natural spawning by time and weather", () => {
  assert.equal(naturalActivityAllowsSpawn("glowmoth", { timeOfDay: 0.5, daylight: 1, weather: "clear", underground: false }), false);
  assert.equal(naturalActivityAllowsSpawn("glowmoth", { timeOfDay: 0.75, daylight: 0.15, weather: "clear", underground: false }), true);
  assert.equal(naturalActivityAllowsSpawn("puddlehopper", { timeOfDay: 0.05, daylight: 0, weather: "rain", underground: false }), true);
});

test("natural spawns prefer described microhabitats without making them exclusive", () => {
  const dry = naturalMicrohabitatAffinity("puddlehopper", { nearWater: false, nearFlowers: false, nearLeaves: false, snowy: false, arid: false });
  const wet = naturalMicrohabitatAffinity("puddlehopper", { nearWater: true, nearFlowers: false, nearLeaves: false, snowy: false, arid: false });
  assert.equal(wet, 1);
  assert.ok(dry > 0 && dry < wet);
});
import {
  buildExhibitTopology,
  createExhibitInventory,
  exteriorExhibitFrameEdges,
  isSmallExhibitCreature,
  MAX_EXHIBIT_BLOCKS,
  planExhibitBreeding,
  sampleExhibitButterflyPose,
  sampleExhibitResidentPose,
  storeExhibitButterfly,
  takeExhibitButterfly,
  type ExhibitButterfly,
  type ExhibitCreature,
} from "../app/game/butterfly-exhibit.ts";
import {
  breedPeelops,
  canBreedPeelops,
  commandPeelop,
  createPeelopState,
  deserializePeelop,
  feedPeelop,
  renamePeelop,
  serializePeelop,
  tryTamePeelop,
} from "../app/game/peelop.ts";
import {
  AQUATIC_MOB_ORDER,
  BIRD_ORDER,
  CORE_MOB_ORDER,
  DWARF_ORDER,
  GOBLIN_ORDER,
  HEARTHROADS_AQUATIC_ORDER,
  HEARTHROADS_WILDLIFE_ORDER,
  HOBBIT_ORDER,
  MOB_DEFS,
  MOSSLING_VARIANT_ORDER,
  POLLINATOR_ORDER,
  RABBIT_ORDER,
  SENTIENT_MOB_ORDER,
  SUGARCOURT_ORDER,
  SURFACE_MOB_ORDER,
  TIDEGLASS_AQUATIC_ORDER,
  WOOD_ELF_ORDER,
} from "../app/game/mobs.ts";
import { applyCompanionPose, applyOceanCreaturePose, applyWildlifePose, createMobVisual, createSkeletonArrowVisual } from "../app/game/mob-models.ts";
import {
  chooseBirdFlightRoute,
  chooseBirdPerch,
  chooseCreatureRoute,
  createBirdFlightRouteState,
  createCreatureRouteState,
  creatureBodyMass,
  creatureMeleeReach,
  creatureCollisionProfile,
  creatureKnockbackSpeed,
  findFollowerTeleportTarget,
  followerTravelSpeed,
  planFollowerFormation,
  separateCreatureCircles,
  shouldTeleportFollower,
  splitCreatureSeparation,
} from "../app/game/creature-pathing.ts";

test("expanded ecology catalog includes mounts, livestock, thin fish, pollinators, a pet, guardian, and archer", () => {
  assert.equal(SURFACE_MOB_ORDER.length, 29);
  assert.equal(new Set(SURFACE_MOB_ORDER).size, 29);
  for (const kind of ["thimbledeer", "lanternshell", "puddlehopper", "reedstrider", "rimehoof-courser", "sunscar-courser", "mirestride-courser", "starbough-courser"] as const) {
    assert.ok(SURFACE_MOB_ORDER.includes(kind));
    assert.equal(MOB_DEFS[kind].hostile, false);
    assert.ok(MOB_DEFS[kind].discoveryHint);
    assert.ok(MOB_DEFS[kind].utility);
  }
  assert.deepEqual(BIRD_ORDER, ["emberjay", "canopy-lark", "tidewing-gull", "frostquill"]);
  assert.equal(AQUATIC_MOB_ORDER.length, 8);
  assert.equal(POLLINATOR_ORDER.length, 4);
  assert.ok(POLLINATOR_ORDER.includes("lightning-bug"));
  assert.deepEqual(MOSSLING_VARIANT_ORDER, ["boglantern-mossling", "cindercone-mossling", "moonbloom-mossling", "moonbrawn-mossling"]);
  assert.equal(usesGenericCreatureBond("moonbrawn-mossling"), true);
  assert.equal(MOB_DEFS["moonbrawn-mossling"].tameable, true);
  assert.deepEqual(MOB_DEFS["moonbrawn-mossling"].tameItems, [Item.Berry]);
  assert.ok(TIDEGLASS_AQUATIC_ORDER.includes("reefglide-terrapin"));
  assert.deepEqual(fishKindsForHabitat("ocean"), [
    "shoalfin", "pocket-goldfish", "silverthread", "blue-mackerel", "coralback", "sunwheel-angelfish", "tideglass-crab", "reefglide-terrapin",
    "emberribbon", "glassfin", "tidepup", "sunset-sea-slug", "blue-dragon-sea-slug", "leafsheep-sea-slug", "sea-bunny-nudibranch",
    "spanish-dancer-sea-slug", "ringed-phyllidia", "embercrown-sea-slug", "kelpwarden-sea-slug", "inkveil-cuttle",
    "prismclaw-mantis-shrimp", "reefmender-shrimp", "shellcarrier-hermit", "wreckwhistle-porpoise",
  ]);
  assert.deepEqual(fishKindsForHabitat("river"), ["brookdart", "reedneedle", "redfin-salmon", "pocket-goldfish", "stonewhisker-loach"]);
  assert.deepEqual(fishKindsForHabitat("deep-ocean"), [
    "blue-mackerel", "glassfin", "silverthread", "lanternjaw", "shoalfin", "coralback", "deepwater-shark", "abyss-skater", "tidepup", "dreadcoil", "worldshell-leviathan", "aetherbell-leviathan", "pocket-goldfish", "sunset-sea-slug", "moonlace-sea-slug",
    "crystal-tipped-nudibranch", "hooded-melibe", "sea-angel-slug", "starlight-choir-sea-slug", "voidglass-sea-slug", "inkveil-cuttle",
    "currentweaver-eel", "wreckwhistle-porpoise", "voidmantle-ray",
  ]);
  assert.deepEqual(fishKindsForHabitat("underground"), ["gloomfin", "cavefilament", "stonewhisker-loach", "currentweaver-eel", "fossilback-trilobite"]);
  assert.deepEqual(HEARTHROADS_WILDLIFE_ORDER, ["burrowbell", "dewback-tapir"]);
  assert.deepEqual(HEARTHROADS_AQUATIC_ORDER, ["redfin-salmon", "blue-mackerel", "deepwater-shark"]);
  assert.equal(HOBBIT_ORDER.length, 7);
  assert.equal(GOBLIN_ORDER.length, 5);
  assert.equal(SENTIENT_MOB_ORDER.length, HOBBIT_ORDER.length + GOBLIN_ORDER.length + 6 + SUGARCOURT_ORDER.length + WOOD_ELF_ORDER.length + DWARF_ORDER.length);
  assert.equal(SUGARCOURT_ORDER.length, 7);
  assert.equal(WOOD_ELF_ORDER.length, 7);
  assert.equal(DWARF_ORDER.length, 7);
  for (const kind of WOOD_ELF_ORDER) {
    assert.equal(MOB_DEFS[kind].sentient, true);
    assert.equal(MOB_DEFS[kind].faction, "wood-elves");
  }
  for (const kind of DWARF_ORDER) {
    assert.equal(MOB_DEFS[kind].sentient, true);
    assert.equal(MOB_DEFS[kind].faction, "dwarves");
  }
  for (const kind of SUGARCOURT_ORDER) {
    assert.equal(MOB_DEFS[kind].sentient, true);
    assert.equal(MOB_DEFS[kind].faction, "sugarcourt");
    assert.ok(MOB_DEFS[kind].role);
  }
  for (const kind of HOBBIT_ORDER) {
    assert.equal(MOB_DEFS[kind].sentient, true);
    assert.equal(MOB_DEFS[kind].faction, "hobbits");
    assert.ok(MOB_DEFS[kind].role);
    assert.ok(MOB_DEFS[kind].profession);
  }
  for (const kind of GOBLIN_ORDER) {
    assert.equal(MOB_DEFS[kind].sentient, true);
    assert.equal(MOB_DEFS[kind].faction, "goblins");
    assert.ok(MOB_DEFS[kind].role);
    assert.ok(MOB_DEFS[kind].tradeSpecialty);
  }
  assert.equal(MOB_DEFS.warg.sentient, false);
  assert.equal(MOB_DEFS.warg.factionAffinity, "goblins");
  assert.equal(MOB_DEFS.warg.tameRequiresUnaligned, true);
  assert.equal(MOB_DEFS.warg.rideable, true);
  assert.equal(MOB_DEFS["deepwater-shark"].hostile, true);
  assert.match(MOB_DEFS["deepwater-shark"].behavior, /ignores occupied boats/i);
  assert.equal(MOB_DEFS.peelop.persistent, true);
  assert.equal(MOB_DEFS.skeleton.ranged, true);
  assert.equal(MOB_DEFS["reliquary-sentinel"].hostile, true);
  assert.equal(passiveMobKindForBiome(BiomeId.Meadow, 0.01), "thimbledeer");
  assert.equal(passiveMobKindForBiome(BiomeId.Siltfen, 0.3), "puddlehopper");
  assert.equal(passiveMobKindForBiome(BiomeId.Siltfen, 0.4), "reedstrider");
  assert.equal(passiveMobKindForBiome(BiomeId.Siltfen, 0.45), "mirestride-courser");
  assert.equal(passiveMobKindForBiome(BiomeId.Siltfen, 0.58), "lightning-bug");
  assert.equal(passiveMobKindForBiome(BiomeId.Siltfen, 0.68), "pebbletortoise");
  assert.equal(CORE_MOB_ORDER.filter((kind) => MOB_DEFS[kind].sentient).length, SENTIENT_MOB_ORDER.length);
  assert.equal(usesGenericCreatureBond("rimecoat-hound"), true);
  assert.equal(usesGenericCreatureBond("bramblewhisk-cat"), true);
  assert.deepEqual(COMPANION_BOND_MOB_KINDS, ["tidepup", "sakurakit", "taffy-hound", "praline-cat", "rimecoat-hound", "bramblewhisk-cat"]);
});

test("birdlike flight rigs expose mirrored wing sides on one shared stroke phase", () => {
  const synchronizedKinds = [
    ...BIRD_ORDER,
    "runeowl",
    "vaultwing",
    "mossback-kite",
    "lanternray",
    "prismtail-swift",
    "sailfin-skimmer",
    "ashnose-bat",
    "chimewing",
    "cinder-kite",
  ] as const;
  for (const kind of synchronizedKinds) {
    const model = createMobVisual(kind, 7_400);
    const pairedWings = model.parts.wings.filter((wing) => /-(?:left|right)-(?:wing|fin)/u.test(wing.name));
    assert.ok(pairedWings.length >= 2, `${kind} needs a paired flight rig`);
    for (const wing of pairedWings) {
      const expectedSide = wing.name.includes("-left-") ? -1 : 1;
      assert.equal(Number(wing.userData.side), expectedSide, `${wing.name} needs its authored side`);
      assert.equal(Number(wing.userData.phase) || 0, 0, `${wing.name} must share its mate's stroke phase`);
    }
  }

  for (const kind of ["prismtail-swift", "ashnose-bat", "chimewing", "cinder-kite"] as const) {
    const model = createMobVisual(kind, 7_401);
    applyWildlifePose(model.visual, kind, 1.37, 0.82, 0.25);
    const left = model.visual.getObjectByName(`${kind}-left-wing-pivot`);
    const right = model.visual.getObjectByName(`${kind}-right-wing-pivot`);
    assert.ok(left && right);
    assert.ok(Math.abs(left.rotation.z + right.rotation.z) < 1e-10, `${kind} wings must mirror one shared stroke`);
  }

  const reedstrider = createMobVisual("reedstrider", 7_402);
  applyWildlifePose(reedstrider.visual, "reedstrider", 1.37, 0.82, 0.25);
  const reedLeft = reedstrider.visual.getObjectByName("reedstrider-left-wing-pivot");
  const reedRight = reedstrider.visual.getObjectByName("reedstrider-right-wing-pivot");
  assert.ok(reedLeft && reedRight);
  assert.ok(Math.abs(reedLeft.rotation.z + reedRight.rotation.z) < 1e-10, "Reedstrider's vestigial wings must lift together");
});

test("v0.5 habitat tables place mammals, pollinators, and fish without ambient queen spam", () => {
  const meadowKinds = passiveMobSpawnTableForBiome(BiomeId.Meadow).map(([kind]) => kind);
  assert.ok(meadowKinds.includes("wild-horse"));
  assert.ok(meadowKinds.includes("meadow-cow"));
  assert.ok(meadowKinds.includes("meadow-cottontail"));
  assert.equal(passiveMobKindForBiome(BiomeId.CloudreedGlen, 0.01), "mistmane");
  assert.equal(passiveMobKindForBiome(BiomeId.CloudreedGlen, 0.5), "reed-dragonfly");
  assert.equal(passiveMobKindForBiome(BiomeId.River, 0.35), "reed-dragonfly");
  const wildwoodKinds = passiveMobSpawnTableForBiome(BiomeId.Wildwood).map(([kind]) => kind);
  for (const kind of ["wild-horse", "bramblewhisk-cat", "burrowbell", "sakurakit", "meadow-cottontail", "russet-rabbit"] as const) assert.ok(wildwoodKinds.includes(kind));
  assert.ok(passiveMobSpawnTableForBiome(BiomeId.Frostpine).some(([kind]) => kind === "rimehoof-courser"));
  assert.ok(passiveMobSpawnTableForBiome(BiomeId.Desert).some(([kind]) => kind === "sunscar-courser"));
  assert.ok(passiveMobSpawnTableForBiome(BiomeId.Siltfen).some(([kind]) => kind === "mirestride-courser"));
  assert.ok(passiveMobSpawnTableForBiome(BiomeId.Glimmerwood).some(([kind]) => kind === "starbough-courser"));
  for (const [biome, expected] of [
    [BiomeId.Siltfen, ["boglantern-mossling", "reedcrown-deer"]],
    [BiomeId.Badlands, ["cindercone-mossling", "emberbrush-fox", "sunbloom-longhorn"]],
    [BiomeId.Glimmerwood, ["moonbloom-mossling", "moonpetal-fox"]],
    [BiomeId.SnowcapRange, ["frostlace-hart"]],
  ] as const) {
    const kinds = passiveMobSpawnTableForBiome(biome).map(([kind]) => kind);
    for (const kind of expected) assert.ok(kinds.includes(kind), `${BiomeId[biome]} should spawn ${kind}`);
  }
  for (const biome of [BiomeId.Snowfield, BiomeId.Frostpine, BiomeId.SnowcapRange]) {
    assert.ok(passiveMobSpawnTableForBiome(biome).some(([kind]) => kind === "frostquill"), `${BiomeId[biome]} should spawn Frostquill coveys`);
    assert.ok(passiveMobSpawnTableForBiome(biome).some(([kind]) => kind === "rimecoat-hound"), `${BiomeId[biome]} should spawn Rimecoat Hounds`);
  }
  for (const biome of [BiomeId.Wildwood, BiomeId.Bloomwood, BiomeId.Birchlight, BiomeId.RainveilJungle]) {
    assert.ok(passiveMobSpawnTableForBiome(biome).some(([kind]) => kind === "bramblewhisk-cat"), `${BiomeId[biome]} should spawn Bramblewhisk Cats`);
  }

  for (const biome of Object.values(BiomeId).filter((value): value is BiomeId => typeof value === "number")) {
    const kinds = passiveMobSpawnTableForBiome(biome).map(([kind]) => kind);
    assert.equal(kinds.includes("hive-queen"), false, `${BiomeId[biome]} must not ambient-spawn queens`);
    assert.equal(kinds.includes("honeybee"), false, `${BiomeId[biome]} must keep workers hive-owned`);
    assert.ok(passiveMobSpawnTableForBiome(biome).reduce((sum, [, weight]) => sum + weight, 0) > 0);
  }

  assert.deepEqual(fishSpawnTableForHabitat("river").map(([kind]) => kind), ["brookdart", "reedneedle", "redfin-salmon", "pocket-goldfish", "stonewhisker-loach"]);
  assert.deepEqual(fishSpawnTableForHabitat("underground").map(([kind]) => kind), ["gloomfin", "cavefilament", "stonewhisker-loach", "currentweaver-eel", "fossilback-trilobite"]);
  assert.equal(new Set(fishSpawnTableForHabitat("ocean").map(([kind]) => kind)).size, 24);
  assert.equal(fishSpawnTableForHabitat("ocean").some(([kind]) => kind === "tideglass-crab"), true);
  assert.equal(fishSpawnTableForHabitat("ocean").some(([kind]) => kind === "reefglide-terrapin"), true);
  assert.equal(fishSpawnTableForHabitat("ocean").some(([kind]) => kind === "deepwater-shark"), false);
  assert.equal(fishSpawnTableForHabitat("deep-ocean").some(([kind]) => kind === "deepwater-shark"), true);
  assert.ok(fishSpawnTableForHabitat("deep-ocean").some(([kind, weight]) => kind === "aetherbell-leviathan" && weight <= 0.002));
});

test("natural group ranges remain capped and wild hives own exactly one queen", () => {
  assert.equal(naturalGroupSizeForMob("sunstep-grazer", 0), 4);
  assert.equal(naturalGroupSizeForMob("sunstep-grazer", 0.999999), 7);
  assert.equal(naturalGroupSizeForMob("rimehoof-courser", 0), 3);
  assert.equal(naturalGroupSizeForMob("starbough-courser", 0.999999), 4);
  assert.equal(naturalGroupSizeForMob("frostquill", 0), 2);
  assert.equal(naturalGroupSizeForMob("frostquill", 0.999999), 5);
  assert.equal(naturalGroupSizeForMob("tideglass-crab", 0), 1);
  assert.equal(naturalGroupSizeForMob("tideglass-crab", 0.999999), 3);
  assert.equal(naturalGroupSizeForMob("rimecoat-hound", 0.999999), 3);
  assert.equal(naturalGroupSizeForMob("bramblewhisk-cat", 0.999999), 2);
  assert.equal(naturalGroupSizeForMob("silverthread", 0), 8);
  assert.equal(naturalGroupSizeForMob("silverthread", 0.999999), 12);
  assert.equal(naturalGroupSizeForMob("mistmane", 0.5), 4);
  assert.equal(naturalGroupSizeForMob("burrowbell", 0), 3);
  assert.equal(naturalGroupSizeForMob("burrowbell", 0.999999), 6);
  assert.equal(naturalGroupSizeForMob("deepwater-shark", 0.999999), 1);
  assert.equal(naturalGroupSizeForMob("peelop", 0.9), 1);
  assert.deepEqual(wildHiveResidentSpawnPlan(-4), [{ kind: "hive-queen", count: 1, group: "hive" }]);
  assert.deepEqual(wildHiveResidentSpawnPlan(3), [
    { kind: "hive-queen", count: 1, group: "hive" },
    { kind: "honeybee", count: 3, group: "hive" },
  ]);
  assert.equal(wildHiveResidentSpawnPlan(99).at(-1)?.count, 8);
});

test("every non-butterfly catalog entry has a detailed production model", () => {
  for (const [index, kind] of CORE_MOB_ORDER.entries()) {
    const model = createMobVisual(kind, -(index + 1));
    let meshes = 0;
    model.group.traverse((object) => { if (object instanceof THREE.Mesh) meshes += 1; });
    assert.ok(meshes >= 8, `${kind} should have at least eight visual components`);
  }
  const arrow = createSkeletonArrowVisual();
  assert.equal(arrow.children.length, 4);
  const shade = createMobVisual("shadecrawler", -99);
  assert.equal(shade.visual.getObjectByName("shadecrawler-saddle")?.visible, false, "wild portraits hide progression equipment");
});

test("redesigned birds keep species-specific production anatomy", () => {
  const requiredParts = {
    emberjay: ["black-eye-mask", "swept-crest", "rust-covert", "long-tail"],
    "canopy-lark": ["golden-breast", "crown-tuft", "leaf-feather", "forked-tail"],
    "tidewing-gull": ["hooked-beak", "swept-primary", "tail-fan", "webbed-foot"],
    frostquill: ["downy-breast", "winter-mask", "snow-feather", "snow-boot"],
  } as const;
  for (const [kind, fragments] of Object.entries(requiredParts)) {
    const model = createMobVisual(kind as keyof typeof requiredParts, 41);
    const names: string[] = [];
    model.group.traverse((object) => { if (object.name) names.push(object.name); });
    for (const fragment of fragments) assert.ok(names.some((name) => name.includes(fragment)), `${kind} needs ${fragment}`);
    assert.ok(model.parts.wings.length === 2, `${kind} needs an articulated opposing wing pair`);
  }
});

test("redesigned pets and crab variants preserve articulated runtime motion", () => {
  for (const kind of ["taffy-hound", "rimecoat-hound", "praline-cat", "bramblewhisk-cat"] as const) {
    const model = createMobVisual(kind, 52);
    const tail = model.visual.getObjectByName(`${kind}-tail-root-pivot`)!;
    const head = model.visual.getObjectByName(`${kind}-head-pivot`)!;
    const before = { tail: tail.rotation.y, head: head.rotation.y };
    assert.equal(applyCompanionPose(model.visual, kind, 1.75, 0.8, 1), true);
    assert.notEqual(tail.rotation.y, before.tail, `${kind} tail should animate`);
    assert.notEqual(head.rotation.y, before.head, `${kind} head should animate`);
    assert.equal(model.parts.legs.length, 4, `${kind} should retain a four-leg gait rig`);
  }
  for (const kind of ["sunwash-crab", "tideglass-crab"] as const) {
    const model = createMobVisual(kind, 53);
    const leg = model.visual.getObjectByName(`${kind}-left-leg-1-pivot`)!;
    const claw = model.visual.getObjectByName(`${kind}-right-claw-arm-pivot`)!;
    const before = { leg: leg.rotation.x, claw: claw.rotation.z };
    applyOceanCreaturePose(model.visual, kind, 2.1, 0.9);
    assert.notEqual(leg.rotation.x, before.leg, `${kind} legs should scuttle`);
    assert.notEqual(claw.rotation.z, before.claw, `${kind} claws should articulate`);
    assert.equal(model.parts.legs.length, 8, `${kind} should retain eight walking-leg pivots`);
    assert.equal(model.parts.arms.length, 2, `${kind} should retain two claw pivots`);
  }
});

test("redesigned wildlife and biome variants keep distinct anatomy, gait rigs, and secondary motion", () => {
  const groundKinds = [
    "mossling", "boglantern-mossling", "cindercone-mossling", "moonbloom-mossling",
    "ridgeback", "woolhorn", "sunstep-grazer", "pebbletortoise", "petalfox", "emberbrush-fox", "moonpetal-fox",
    "thimbledeer", "frostlace-hart", "reedcrown-deer", "meadow-cow", "sunbloom-longhorn", "mistmane",
    "burrowbell", "dewback-tapir", "peelop", "warg",
  ] as const;
  for (const kind of groundKinds) {
    const model = createMobVisual(kind, 64);
    assert.ok(model.parts.legs.length >= 2, `${kind} needs an articulated walking rig`);
    const animated = applyWildlifePose(model.visual, kind, 2.35, 0.8, 1);
    assert.equal(animated, true, `${kind} needs its wildlife secondary pose`);
  }
  for (const kind of ["deepwater-shark", "tidepup", "reefglide-terrapin"] as const) {
    const model = createMobVisual(kind, 65);
    const before = model.visual.getObjectByName(`${kind}-tail-root-pivot`)?.rotation.y ?? 0;
    assert.equal(applyWildlifePose(model.visual, kind, 1.9, 0.9, 0), true);
    const after = model.visual.getObjectByName(`${kind}-tail-root-pivot`)?.rotation.y ?? 0;
    assert.notEqual(after, before, `${kind} needs visible propulsion motion`);
    assert.ok(model.parts.wings.length >= 2, `${kind} needs paired articulated flippers or fins`);
  }
  const anatomy: Readonly<Record<string, readonly string[]>> = {
    "frostlace-hart": ["ice-tine", "snow-star"],
    "reedcrown-deer": ["cattail", "marsh-saddle"],
    "sunbloom-longhorn": ["horn-tip", "sunflower"],
    "boglantern-mossling": ["fungus-brim", "lantern-cap"],
    "cindercone-mossling": ["cone-scale", "ember-seed"],
    "moonbloom-mossling": ["moon-petal", "root-pad"],
    "reefglide-terrapin": ["flipper", "coral"],
    "emberbrush-fox": ["tail-fork", "ember-tail-core"],
    "moonpetal-fox": ["tail-secondary", "tail-eye"],
  };
  for (const [kind, fragments] of Object.entries(anatomy)) {
    const model = createMobVisual(kind as keyof typeof MOB_DEFS, 66);
    const names: string[] = [];
    model.group.traverse((object) => { if (object.name) names.push(object.name); });
    for (const fragment of fragments) assert.ok(names.some((name) => name.includes(fragment)), `${kind} needs ${fragment}`);
  }
});

test("Thimbledeer antlers form attached crown-to-post-to-cup chains", () => {
  const model = createMobVisual("thimbledeer", 138);
  model.visual.updateWorldMatrix(true, true);
  for (const side of ["left", "right"] as const) {
    const crown = model.visual.getObjectByName(`thimbledeer-${side}-antler-crown`)!;
    const root = model.visual.getObjectByName(`thimbledeer-${side}-antler-root`)!;
    const post = model.visual.getObjectByName(`thimbledeer-${side}-antler-post`)!;
    const branch = model.visual.getObjectByName(`thimbledeer-${side}-antler-branch`)!;
    const firstStem = model.visual.getObjectByName(`thimbledeer-${side}-thimble-1-stem`)!;
    const secondStem = model.visual.getObjectByName(`thimbledeer-${side}-thimble-2-stem`)!;
    const firstCup = model.visual.getObjectByName(`thimbledeer-${side}-thimble-1-cup`)!;
    assert.equal(root.parent, crown);
    assert.equal(post.parent, crown);
    assert.equal(branch.parent, crown);
    assert.ok(new THREE.Box3().setFromObject(root).intersectsBox(new THREE.Box3().setFromObject(post)), `${side} root must meet its post`);
    assert.ok(new THREE.Box3().setFromObject(post).intersectsBox(new THREE.Box3().setFromObject(firstStem)), `${side} post must meet the inner cup stem`);
    assert.ok(new THREE.Box3().setFromObject(branch).intersectsBox(new THREE.Box3().setFromObject(secondStem)), `${side} branch must meet the outer cup stem`);
    assert.ok(new THREE.Box3().setFromObject(firstStem).intersectsBox(new THREE.Box3().setFromObject(firstCup)), `${side} cup must sit on its stem`);
  }
});

test("every rabbit ear is physically bridged to its crown in production models and portraits", () => {
  for (const kind of RABBIT_ORDER) {
    const model = createMobVisual(kind, 73);
    model.visual.updateMatrixWorld(true);
    const head = model.visual.getObjectByName(`${kind}-head`);
    assert.ok(head, `${kind} needs its crown mesh`);
    for (const side of ["left", "right"] as const) {
      const pivot = model.visual.getObjectByName(`${kind}-${side}-ear-pivot`);
      const ear = model.visual.getObjectByName(`${kind}-${side}-ear`);
      const root = model.visual.getObjectByName(`${kind}-${side}-ear-root`);
      assert.ok(pivot && ear && root, `${kind} ${side} ear needs a shared articulated root`);
      const headBounds = new THREE.Box3().setFromObject(head!);
      const rootBounds = new THREE.Box3().setFromObject(root!);
      const earBounds = new THREE.Box3().setFromObject(ear!);
      assert.equal(headBounds.intersectsBox(rootBounds), true, `${kind} ${side} ear root must overlap the crown`);
      assert.equal(rootBounds.intersectsBox(earBounds), true, `${kind} ${side} ear shaft must overlap its root`);
      if (kind === "frost-hare") {
        const tip = model.visual.getObjectByName(`${kind}-${side}-ear-tip`);
        assert.ok(tip && tip.parent === pivot, `${kind} ${side} dark tip must inherit the ear pose`);
        assert.equal(new THREE.Box3().setFromObject(tip!).intersectsBox(earBounds), true);
      }
    }
  }
});

test("blocked Ridgeback steering holds one avoidance decision instead of rotationally twitching", () => {
  let steering = createStableSteering(0);
  const headings: number[] = [];
  const targets: number[] = [];
  for (let frame = 0; frame < 24; frame += 1) {
    steering = updateStableSteering(steering, { dt: 1 / 60, turnRate: MOB_DEFS.ridgeback.turnRate, blocked: true, mobId: 17 });
    headings.push(steering.heading);
    targets.push(steering.targetHeading);
  }
  assert.equal(new Set(targets.map((value) => value.toFixed(6))).size, 1, "avoidance target must not be rerolled every blocked frame");
  const signs = headings.map(Math.sign).filter(Boolean);
  assert.equal(new Set(signs).size, 1, "turn direction must remain stable through the avoidance hold");
  assert.ok(Math.abs(headings.at(-1)!) > Math.abs(headings[0]));
});

test("local ground search ignores overhead canopies and steps over one-block ledges", () => {
  assert.equal(chooseLocalWalkableGround(40, (ground) => ground === 41), 41);
  // A canopy at 46 is deliberately not in the local candidate range.
  assert.equal(chooseLocalWalkableGround(40, (ground) => ground === 46), null);
  assert.equal(chooseLocalWalkableGround(40, (ground) => ground === 39, 1, 1), 39);
});

test("scaled collision policy makes medium and large ground creatures solid without blocking on babies, birds, or fish", () => {
  const adultPeelop = creatureCollisionProfile(MOB_DEFS.peelop, 1, false);
  const babyPeelop = creatureCollisionProfile(MOB_DEFS.peelop, 1, true);
  const zombie = creatureCollisionProfile(MOB_DEFS.zombie);
  const grownShadecrawler = creatureCollisionProfile(MOB_DEFS.shadecrawler, 3);
  assert.equal(adultPeelop.solid, true);
  assert.equal(adultPeelop.size, "medium");
  assert.equal(babyPeelop.solid, false);
  assert.equal(babyPeelop.size, "small");
  assert.equal(zombie.size, "large");
  assert.ok(grownShadecrawler.radius > zombie.radius);
  assert.equal(creatureCollisionProfile(MOB_DEFS.emberjay).solid, false);
  assert.equal(creatureCollisionProfile(MOB_DEFS.coralback).solid, false);
  const separation = separateCreatureCircles({ x: 0, z: 0, radius: 0.5 }, { x: 0.7, z: 0, radius: 0.5 });
  assert.ok(separation && separation.dx < 0);
  assert.ok(Math.abs(separation!.overlap - 0.36) < 0.00001);
});

test("physical creature contacts move lighter bodies farther and resist knockback by authored size", () => {
  const rabbitMass = creatureBodyMass({ size: "small", radius: 0.22, height: 0.42 });
  const peelopMass = creatureBodyMass({ size: "medium", radius: 0.52, height: 1.15 });
  const ridgebackMass = creatureBodyMass({ size: "large", radius: 0.9, height: 1.85 });
  assert.ok(rabbitMass < peelopMass && peelopMass < ridgebackMass);

  const split = splitCreatureSeparation(0.8, rabbitMass, ridgebackMass);
  assert.ok(split.first > split.second, "the rabbit-sized body should yield farther than the ridgeback-sized body");
  assert.ok(Math.abs(split.first + split.second - 0.8) < 0.00001);
  assert.ok(creatureKnockbackSpeed(4, rabbitMass) > creatureKnockbackSpeed(4, ridgebackMass));
  assert.ok(creatureKnockbackSpeed(100, rabbitMass) <= 6.2, "extreme impacts remain numerically bounded");
});

test("followers own stable Skyrim-like formation slots that stand farther back and spread with group size", () => {
  const leader = { x: 10, z: -4, heading: 0 };
  const smallGroup = planFollowerFormation(leader, [{ id: 8, radius: 0.42 }, { id: 3, radius: 0.42 }]);
  const reordered = planFollowerFormation(leader, [{ id: 3, radius: 0.42 }, { id: 8, radius: 0.42 }]);
  assert.deepEqual(smallGroup, reordered, "slot ownership must not depend on update order");
  assert.equal(smallGroup[0].id, 3);
  assert.ok(smallGroup[0].trailingDistance >= 2.8, "closest follower stays at least another half-block back");
  assert.ok(Math.abs(smallGroup[0].lateralOffset) >= 0.8, "the closest follower must leave the rear-camera lane open");
  assert.ok(smallGroup[0].lateralOffset < 0 && smallGroup[1].lateralOffset > 0, "the first pair fans to opposite sides");
  const crowd = planFollowerFormation(leader, Array.from({ length: 7 }, (_, id) => ({ id, radius: 0.5 })));
  assert.ok(Math.max(...crowd.map((slot) => Math.abs(slot.lateralOffset))) > Math.max(...smallGroup.map((slot) => Math.abs(slot.lateralOffset))) * 2);
  for (let index = 1; index < crowd.length; index += 1) {
    assert.ok(Math.hypot(crowd[index].x - crowd[index - 1].x, crowd[index].z - crowd[index - 1].z) > 1);
  }
});

test("followers match sprint speed, settle softly in formation, and recover only from meaningful separation", () => {
  const sprintCatchup = followerTravelSpeed({ walkSpeed: 0.7, chaseSpeed: 2.8, leaderSpeed: 6.35, distanceToSlot: 6 });
  assert.ok(sprintCatchup > 6.35);
  assert.equal(followerTravelSpeed({ walkSpeed: 0.7, chaseSpeed: 2.8, leaderSpeed: 0, distanceToSlot: 0.4, arrivalRadius: 0.5 }), 0);
  assert.equal(shouldTeleportFollower({ distanceToLeader: 19, verticalSeparation: 0, blockedSeconds: 0 }), false);
  assert.equal(shouldTeleportFollower({ distanceToLeader: 20, verticalSeparation: 0, blockedSeconds: 0 }), true);
  assert.equal(shouldTeleportFollower({ distanceToLeader: 12, verticalSeparation: 0, blockedSeconds: 2.74 }), false);
  assert.equal(shouldTeleportFollower({ distanceToLeader: 12, verticalSeparation: 0, blockedSeconds: 2.75 }), true);
  assert.equal(shouldTeleportFollower({ distanceToLeader: 3, verticalSeparation: 9, blockedSeconds: 0 }), true);

  const checked: Array<[number, number]> = [];
  const target = findFollowerTeleportTarget({ x: 4, z: 7 }, 11, (x, z) => {
    checked.push([x, z]);
    return checked.length === 4 ? 22.5 : null;
  });
  assert.deepEqual(target, { x: checked[3][0], y: 22.5, z: checked[3][1] });
  assert.deepEqual(
    findFollowerTeleportTarget({ x: 4, z: 7 }, 11, (x, z) => checked.findIndex(([cx, cz]) => cx === x && cz === z) === 3 ? 22.5 : null),
    target,
    "safe recovery search must be deterministic",
  );
});

test("ground route planning holds a stable side around trunks and avoids hazards, water, ledges, and crowded bodies", () => {
  let state = createCreatureRouteState(0);
  const headings: number[] = [];
  for (let frame = 0; frame < 20; frame += 1) {
    const decision = chooseCreatureRoute({
      state,
      dt: 1 / 60,
      desiredHeading: 0,
      mobId: 17,
      probe: (heading) => Math.abs(heading) < 0.2
        ? { walkable: false, clearance: 0 }
        : { walkable: true, clearance: 1, crowding: 0 },
    });
    assert.equal(decision.blocked, false);
    state = decision.state;
    headings.push(decision.heading);
  }
  assert.equal(new Set(headings.map((heading) => Math.sign(heading))).size, 1, "a trunk detour must not twitch between sides");

  const openDoor = chooseCreatureRoute({
    state: createCreatureRouteState(), dt: 1 / 60, desiredHeading: 0, mobId: 4,
    probe: (heading) => Math.abs(heading) < 0.01
      ? { walkable: true, openDoor: true, clearance: 1 }
      : { walkable: true, clearance: 1 },
  });
  assert.ok(Math.abs(openDoor.heading) < 0.001, "open doors remain a direct route");

  const safeSide = chooseCreatureRoute({
    state: createCreatureRouteState(), dt: 1 / 60, desiredHeading: 0, mobId: 2,
    probe: (heading) => {
      if (Math.abs(heading) < 0.01) return { walkable: true, crowding: 1, clearance: 0.5 };
      if (heading < 0) return { walkable: true, water: true, clearance: 1 };
      if (heading > Math.PI / 3) return { walkable: true, hazard: true, clearance: 1 };
      return { walkable: true, crowding: 0, clearance: 1, elevationDelta: 0 };
    },
  });
  assert.ok(safeSide.heading > 0 && safeSide.heading < Math.PI / 3);

  const unsafeLedge = chooseCreatureRoute({
    state: createCreatureRouteState(), dt: 0.1, desiredHeading: 0, mobId: 6, maxStepUp: 1, maxDrop: 1,
    probe: () => ({ walkable: true, elevationDelta: 2 }),
  });
  assert.equal(unsafeLedge.blocked, true);
  assert.equal(unsafeLedge.state.blockedSeconds, 0.1);
  const flying = chooseCreatureRoute({
    state: createCreatureRouteState(), dt: 0.1, desiredHeading: 0.75, mobId: 6, movement: "flying",
    probe: () => { throw new Error("birds must bypass ground probes"); },
  });
  assert.equal(flying.heading, 0.75);

  const swimmer = chooseCreatureRoute({
    state: createCreatureRouteState(), dt: 0.1, desiredHeading: 0, mobId: 8, allowWater: true,
    probe: () => ({ walkable: true, water: true, clearance: 1 }),
  });
  assert.equal(swimmer.blocked, false, "living ground mobs may choose a safe swimming route");

  const backedOut = chooseCreatureRoute({
    state: { ...createCreatureRouteState(), blockedSeconds: 0.4 }, dt: 0.1, desiredHeading: 0, mobId: 8,
    probe: (heading) => Math.abs(Math.abs(heading) - Math.PI) < 0.01
      ? { walkable: true, clearance: 1 }
      : { walkable: false, clearance: 0 },
  });
  assert.equal(backedOut.blocked, false, "a persistently wedged mob may back away before replanning");
});

test("ground route look-ahead caches a proven heading without losing detour hysteresis", () => {
  let state = createCreatureRouteState(0);
  let probes = 0;
  const decisions = [];
  for (let frame = 0; frame < 12; frame += 1) {
    const decision = chooseCreatureRoute({
      state,
      dt: 1 / 60,
      desiredHeading: 0,
      mobId: 91,
      probe: (heading) => {
        probes += 1;
        return Math.abs(heading) < 0.1 ? { walkable: false } : { walkable: true, clearance: 1 };
      },
    });
    state = decision.state;
    decisions.push(decision.heading);
  }
  assert.ok(probes < 12, `short safe-route caching should avoid one voxel probe every frame (got ${probes})`);
  assert.equal(new Set(decisions.map((heading) => Math.sign(heading))).size, 1);
});

test("bird flight routing uses bounded stable tree avoidance and climbs when lateral air is closed", () => {
  let state = createBirdFlightRouteState(0);
  const headings: number[] = [];
  let totalProbes = 0;
  for (let frame = 0; frame < 18; frame += 1) {
    const decision = chooseBirdFlightRoute({
      state,
      dt: 1 / 60,
      desiredHeading: 0,
      mobId: 19,
      flying: true,
      probe: (heading) => ({
        clear: Math.abs(heading) >= 0.25,
        clearance: Math.abs(heading) >= 0.25 ? 1 : 0,
      }),
    });
    assert.ok(decision.probes <= 15, `bird route exceeded fixed probe budget: ${decision.probes}`);
    totalProbes += decision.probes;
    state = decision.state;
    headings.push(decision.heading);
  }
  assert.ok(totalProbes < 35, `cached bird routing should not rescan every frame (got ${totalProbes})`);
  assert.equal(new Set(headings.map((heading) => Math.sign(heading)).filter(Boolean)).size, 1, "tree avoidance must keep one side");

  const climb = chooseBirdFlightRoute({
    state: createBirdFlightRouteState(0),
    dt: 1 / 60,
    desiredHeading: 0,
    mobId: 20,
    flying: true,
    probe: (_heading, altitude) => ({ clear: altitude > 0.5, clearance: altitude > 0.5 ? 1 : 0 }),
  });
  assert.ok(climb.altitudeOffset > 1, "a bird should climb over a canopy when every level route is closed");
});

test("birds choose reachable exposed perches by score rather than scan order", () => {
  const candidates = [
    { id: "blocked-near", x: 1, y: 6, z: 0, altitude: 4, clearance: 1, approachClear: false },
    { id: "tight-near", x: 1.5, y: 6, z: 0, altitude: 4, clearance: 0.25, approachClear: true },
    { id: "open-far", x: 4, y: 7, z: 1, altitude: 5, clearance: 1, approachClear: true },
    { id: "open-favorite", x: 4.2, y: 7, z: -1, altitude: 5, clearance: 1, approachClear: true },
  ] as const;
  assert.equal(chooseBirdPerch(candidates, { x: 0, z: 0, heading: 0 })?.id, "open-far");
  assert.equal(chooseBirdPerch(candidates, { x: 0, z: 0, heading: 0 }, "open-favorite")?.id, "open-favorite");
});

test("species and body scale extend melee reach without requiring creature overlap", () => {
  const small = creatureMeleeReach({ attackRange: 0.9, radius: 0.24 });
  const medium = creatureMeleeReach({ attackRange: 0.9, radius: 0.58 });
  const grown = creatureMeleeReach({ attackRange: 0.9, radius: 0.58 }, 2.4);
  assert.ok(small > 0.9);
  assert.ok(medium > small);
  assert.ok(grown > medium);
  assert.ok(grown < 2.4, "large reach remains bounded");
});

test("birds perch, forage, and flee fast approaching or attacking humans", () => {
  const perched = createBirdBehavior("emberjay");
  const rushed = updateBirdBehavior(perched, { dt: 1 / 60, distanceToHuman: 5, humanSpeed: 3.4, attacked: false, onGround: false });
  assert.equal(rushed.mode, "takeoff");
  assert.equal(rushed.perchId, null);
  const attacked = updateBirdBehavior(createBirdBehavior("canopy-lark"), { dt: 1 / 60, distanceToHuman: 9, humanSpeed: 0, attacked: true, onGround: true });
  assert.equal(attacked.mode, "takeoff");
  assert.ok(attacked.timer >= 5.9);
});

test("creature cages preserve exact metadata and gate healthy hostiles", () => {
  const hostile: CreatureMetadata = {
    schema: 1, entityId: "sentinel:44", kind: "reliquary-sentinel", health: 18, maxHealth: 18,
    ageTicks: 9123, baby: false, temperament: "Hostile", hostile: true, tamed: false,
    ownerId: null, name: "Vaultkeeper", geneticSeed: 991, command: null,
    custom: { awakened: true, room: [4, 8, 15], lootBond: { tier: 3 } },
  };
  assert.equal(canCaptureCreature(hostile), false);
  assert.equal(canCaptureCreature({ ...hostile, health: 9 }), false, "exactly half health is not yet subdued");
  assert.equal(canCaptureCreature({ ...hostile, health: 8.99 }), true);
  assert.equal(canCaptureCreature({ ...hostile, health: 1, maxHealth: 1 }), true, "one-health dangerous creatures remain cageable");
  const wounded = { ...hostile, health: 8 };
  const captured = captureCreature("cage:1", wounded, 12345)!;
  const decoded = decodeCapturedCreature(encodeCapturedCreature(captured))!;
  assert.deepEqual(releaseCreature(decoded), wounded);
  const released = releaseCreature(decoded);
  released.custom.awakened = false;
  assert.equal(decoded.creature.custom.awakened, true, "released metadata must not alias storage");
});

test("tamed or enclosed creatures are protected from distance and age despawn", () => {
  assert.equal(shouldKeepCreatureLoaded({}), false);
  assert.equal(shouldKeepCreatureLoaded({ tamed: true }), true);
  assert.equal(shouldKeepCreatureLoaded({ enclosed: true }), true);
  assert.equal(shouldKeepCreatureLoaded({ named: true }), true);
  assert.equal(shouldKeepCreatureLoaded({ leashed: true }), true);
  assert.equal(shouldKeepCreatureLoaded({ everLed: true }), true);
  assert.equal(husbandryAgeScale("meadow-cottontail", false), 0.78);
  assert.equal(husbandryAgeScale("frost-hare", true), 0.38);
  assert.equal(husbandryAgeScale("thimbledeer", true), 0.62);
});

test("Peelops tame, heal, rename, obey, persist, and breed with inherited metadata", () => {
  let left = createPeelopState(123);
  const tame = tryTamePeelop(left, "player-a", "apple", 0.2);
  assert.equal(tame.tamed, true);
  left = commandPeelop(renamePeelop(tame.state, "  Pudding   Peel  "), "player-a", "sit");
  assert.equal(left.name, "Pudding Peel");
  assert.equal(left.command, "sit");
  left = feedPeelop({ ...left, health: 2 }, "berry");
  assert.equal(left.health, 4);
  left = { ...left, health: 7 };
  const right = { ...createPeelopState(456), tamed: true, ownerId: "player-a", command: "follow" as const };
  assert.equal(canBreedPeelops(left, right), true);
  const family = breedPeelops(left, right)!;
  assert.equal(family.child.baby, true);
  assert.equal(family.child.ownerId, "player-a");
  assert.notEqual(family.child.geneticSeed, left.geneticSeed);
  assert.deepEqual(deserializePeelop(serializePeelop(family.child)), family.child);
});

test("eligible surface creatures accept their diet, enter love mode, breed, and mature", () => {
  const definition = MOB_DEFS.thimbledeer;
  const left = createCreatureHusbandryState(11);
  const right = createCreatureHusbandryState(22);
  const ignored = feedCreatureForHusbandry(definition, left, Item.Coal);
  assert.equal(ignored.accepted, false);
  const fedLeft = feedCreatureForHusbandry(definition, left, Item.Apple);
  const fedRight = feedCreatureForHusbandry(definition, right, Item.Apple);
  assert.equal(fedLeft.breedingFood, true);
  const family = breedCreatureStates("thimbledeer", fedLeft.state, "thimbledeer", fedRight.state)!;
  assert.equal(family.child.baby, true);
  assert.ok(family.left.loveCooldownTicks > 0);
  assert.equal(tickCreatureHusbandry(family.child, 24_000).baby, false);
  assert.equal(breedCreatureStates("thimbledeer", fedLeft.state, "puddlehopper", fedRight.state), null);
});

test("bonded Moonbrawn Mosslings breed true to their morphed form", () => {
  const definition = MOB_DEFS["moonbrawn-mossling"];
  const fedLeft = feedCreatureForHusbandry(definition, createCreatureHusbandryState(301), Item.Berry);
  const fedRight = feedCreatureForHusbandry(definition, createCreatureHusbandryState(302), Item.Berry);
  assert.equal(fedLeft.accepted, true);
  assert.equal(fedLeft.breedingFood, true);
  const family = breedCreatureStates("moonbrawn-mossling", fedLeft.state, "moonbrawn-mossling", fedRight.state);
  assert.ok(family);
  assert.equal(family.child.baby, true);
  assert.equal(breedCreatureStates("moonbrawn-mossling", fedLeft.state, "mossling", fedRight.state), null);
});

test("Shadecrawlers require patient Moonberry feeding, a rare catalyst, growth, and a saddle before riding", () => {
  let state = createShadecrawlerState();
  for (let feeding = 0; feeding < SHADECRAWLER_TRUST_FEEDS; feeding += 1) {
    const result = feedShadecrawler(state, "keeper", Item.Berry);
    assert.equal(result.accepted, true);
    state = result.state;
  }
  assert.equal(feedShadecrawler(createShadecrawlerState(), "keeper", Item.NocturneHeart).accepted, false);
  const tame = feedShadecrawler(state, "keeper", Item.NocturneHeart);
  assert.equal(tame.tamedNow, true);
  state = tame.state;
  for (let feeding = 0; feeding < SHADECRAWLER_GROWTH_FEEDS; feeding += 1) state = feedShadecrawler(state, "keeper", Item.RawMeat).state;
  assert.equal(shadecrawlerScale(state), 3);
  assert.equal(canRideShadecrawler(state, "keeper"), false);
  state = equipShadecrawlerSaddle(state, "keeper");
  assert.equal(canRideShadecrawler(state, "keeper"), true);
  assert.equal(canRideShadecrawler(state, "someone-else"), false);
  assert.equal(MOB_DEFS.shadecrawler.tameItems?.includes(Item.NocturneHeart), true);
  assert.match(MOB_DEFS.shadecrawler.postTameNotes ?? "", /three times/i);
});

test("creature sound events define Ridgeback and thoughtfully shared wildlife cues", () => {
  assert.equal(CREATURE_SOUND_EVENTS.ridgeback?.hurt?.asset, "ridgeback-stone-bellow");
  assert.equal(CREATURE_SOUND_EVENTS.shadecrawler?.tame?.fallback, "craft");
  assert.equal(creatureSoundCue("thimbledeer", "hurt").asset, "horse-whinny-b");
  assert.equal(creatureSoundCue("thimbledeer", "hurt").fallback, "attack");
  for (const kind of ["wild-horse", "rimehoof-courser", "sunscar-courser", "mirestride-courser", "starbough-courser", "mistmane"] as const) {
    const sound = creatureSoundCue(kind, "ambient");
    assert.equal(sound.asset, "horse-whinny-a");
    assert.deepEqual(sound.variants, ["horse-whinny-b"]);
  }
  assert.equal(creatureSoundCue("deepgear-courser-golem", "ambient").asset, "deepgear-courser-whinny");
  assert.equal(creatureSoundCue("deepgear-courser-golem", "ambient").variants, undefined);
  assert.equal(creatureSoundCue("emberjay", "ambient").asset, "emberjay-squawk");
  assert.equal(creatureSoundCue("canopy-lark", "ambient").asset, "canopy-lark-call");
  assert.deepEqual(creatureSoundCue("tidewing-gull", "ambient").variants, ["tidewing-gull-call-b"]);
  assert.equal(creatureSoundCue("frostquill", "ambient").asset, "bird-chirp");
  assert.deepEqual(creatureSoundCue("praline-cat", "ambient").variants, ["cat-call-b"]);
  assert.deepEqual(creatureSoundCue("bramblewhisk-cat", "ambient").variants, ["cat-call-b"]);
  assert.deepEqual(creatureSoundCue("taffy-hound", "ambient").variants, ["hound-call-b"]);
  assert.deepEqual(creatureSoundCue("rimecoat-hound", "ambient").variants, ["hound-call-b"]);
  assert.equal(creatureSoundCue("sunwash-crab", "ambient").asset, "crab-chitter");
  assert.equal(creatureSoundCue("tideglass-crab", "ambient").asset, "crab-chitter");
  assert.equal(creatureSoundCue("meadow-cottontail", "ambient").asset, "rabbit-squeak");
  assert.equal(creatureSoundCue("mossling", "ambient").asset, "little-animal-squeak");
  assert.equal(creatureSoundCue("tidepup", "ambient").asset, "little-animal-squeak");
  assert.deepEqual(creatureSoundCue("runeowl", "ambient").variants, ["owl-call-b"]);
  assert.deepEqual(creatureSoundCue("worldshell-leviathan", "ambient").variants, ["leviathan-growl-underwater-b"]);
});

test("Deepgear automatons use restrained spatial one-shots and explicit attack cues", () => {
  assert.deepEqual({
    metalBreath: CREATURE_SAMPLE_BY_ASSET["dwarven-automaton-metal-breath"],
    metallicBark: CREATURE_SAMPLE_BY_ASSET["clockwork-hound-metallic-bark"],
    steamA: CREATURE_SAMPLE_BY_ASSET["dwarven-automaton-steam-release-a"],
    steamB: CREATURE_SAMPLE_BY_ASSET["dwarven-automaton-steam-release-b"],
  }, {
    metalBreath: "dwarvenAutomatonMetalBreath",
    metallicBark: "clockworkHoundMetallicBark",
    steamA: "dwarvenAutomatonSteamReleaseA",
    steamB: "dwarvenAutomatonSteamReleaseB",
  });
  assert.equal(creatureSoundCue("clockwork-hound-golem", "ambient").asset, "dwarven-automaton-metal-breath");
  assert.equal(creatureSoundCue("clockwork-hound-golem", "attack").asset, "clockwork-hound-metallic-bark");
  assert.equal(creatureSoundCue("clockwork-hound-golem", "hurt").asset, "dwarven-automaton-metal-breath");
  assert.equal(creatureSoundCue("clockwork-hound-golem", "tame").fallback, "craft");
  assert.equal(creatureSoundCue("webspinner-golem", "ambient").asset, "dwarven-automaton-steam-release-b");
  assert.equal(creatureSoundCue("webspinner-golem", "attack").asset, "dwarven-automaton-steam-release-a");
  assert.ok(creatureSoundCue("webspinner-golem", "ambient").gain < creatureSoundCue("webspinner-golem", "attack").gain);
  for (const kind of ["copper-scout-golem", "stone-bulwark-golem", "aetherforged-sentinel"] as const) {
    assert.equal(creatureSoundCue(kind, "ambient").asset, "dwarven-automaton-metal-breath");
    assert.equal(creatureSoundCue(kind, "attack").asset, "dwarven-automaton-steam-release-a");
    assert.equal(creatureSoundCue(kind, "hurt").asset, "dwarven-automaton-steam-release-b");
  }
  assert.equal(creatureSoundCue("deepgear-courser-golem", "ambient").asset, "deepgear-courser-whinny");
  assert.equal(creatureSoundCue("deepgear-courser-golem", "attack").asset, "dwarven-automaton-steam-release-a");
  assert.equal(creatureSoundCue("mossling", "attack").fallback, "attack", "unmapped attack events should keep the combat fallback");
});

test("connected exhibit blocks cap at 20, grow lower flowers, and store one exact butterfly per block", () => {
  const blocks = Array.from({ length: 24 }, (_, y) => ({ x: 2, y: 10 + y, z: -3 }));
  const topology = buildExhibitTopology(blocks, blocks[0]);
  assert.equal(topology.capacity, MAX_EXHIBIT_BLOCKS);
  assert.equal(topology.truncated, true);
  assert.equal(topology.blocks[0].tier, "flower-floor");
  assert.ok(topology.landingSites.filter((site) => site.flower).length >= 2);
  let inventory = createExhibitInventory();
  for (let index = 0; index < MAX_EXHIBIT_BLOCKS; index += 1) {
    const butterfly: ExhibitButterfly = {
      schema: 1, id: `wing-${index}`, kind: index % 2 ? "meadowwing" : "bloom-monarch",
      capturedAt: 100 + index, ageTicks: index * 12, name: index === 0 ? "Goldie" : null,
      geneticSeed: index + 10, custom: { favoriteFlower: index % 3, history: [index, index + 1] },
    };
    const stored = storeExhibitButterfly(inventory, topology, butterfly);
    assert.equal(stored.stored, true);
    inventory = stored.inventory;
  }
  const overflow = storeExhibitButterfly(inventory, topology, { ...inventory.butterflies[0], id: "overflow" });
  assert.equal(overflow.stored, false);
  const taken = takeExhibitButterfly(inventory, "wing-0");
  assert.equal(taken.butterfly?.name, "Goldie");
  assert.deepEqual(taken.butterfly?.custom, { favoriteFlower: 0, history: [0, 1] });
  const poses = Array.from({ length: 20 }, (_, time) => sampleExhibitButterflyPose(inventory.butterflies[3], topology, time));
  assert.equal(poses.some((pose) => pose.landed), true);
  assert.equal(poses.some((pose) => !pose.landed), true);
});

test("connected conservatory framing removes coplanar seams and residents remain inside one component cell", () => {
  const frameTopology = buildExhibitTopology([{ x: 0, y: 8, z: 0 }, { x: 1, y: 8, z: 0 }], { x: 0, y: 8, z: 0 });
  const edges = exteriorExhibitFrameEdges(frameTopology);
  assert.equal(edges.some((edge) => edge.axis === "y" && edge.center[0] === 0.5 && edge.center[1] === 8 && Math.abs(edge.center[2]) === 0.5), false, "joined front/back panes must not retain a vertical block seam");
  assert.equal(edges.some((edge) => edge.axis === "z" && edge.center[0] === 0.5 && edge.center[1] === 8.5), false, "joined top panes must not retain a horizontal block seam");

  const topology = buildExhibitTopology([{ x: 0, y: 8, z: 0 }, { x: 1, y: 8, z: 0 }, { x: 1, y: 9, z: 0 }], { x: 0, y: 8, z: 0 });
  const butterfly: ExhibitButterfly = {
    schema: 1, id: "strict-wing", kind: "meadowwing", capturedAt: 0, ageTicks: 0, name: null, geneticSeed: 41, custom: {},
  };
  for (let frame = 0; frame < 1_000; frame += 1) {
    const pose = sampleExhibitResidentPose(butterfly, topology, frame / 30);
    const cell = topology.blocks.find((block) => block.key === pose.cellKey)!;
    assert.ok(Math.abs(pose.x - cell.x) < 0.5 && Math.abs(pose.y - cell.y) < 0.5 && Math.abs(pose.z - cell.z) < 0.5);
  }
  assert.equal(isSmallExhibitCreature("emberjay"), true);
  assert.equal(isSmallExhibitCreature("ridgeback"), false);
});

test("eligible same-species conservatory residents breed one metadata-exact baby below capacity", () => {
  const parent = (id: string, seed: number): ExhibitCreature => ({
    schema: 1,
    id,
    kind: "emberjay",
    capturedAt: 100,
    ageTicks: 48_000,
    name: id,
    geneticSeed: seed,
    custom: { favoritePerch: id },
    source: "cage",
    metadata: {
      schema: 1, entityId: id, kind: "emberjay", health: 3, maxHealth: 3, ageTicks: 48_000, baby: false,
      temperament: "Skittish", hostile: false, tamed: false, ownerId: null, name: id, geneticSeed: seed, command: null,
      custom: { favoritePerch: id },
    },
  });
  const residents = [parent("jay-a", 11), parent("jay-b", 29)];
  const plan = planExhibitBreeding(residents, 4, 7);
  assert.equal(plan?.kind, "emberjay");
  assert.deepEqual(plan?.parentIds, ["jay-a", "jay-b"]);
  assert.equal(plan?.child.baby, true);
  assert.equal(plan?.child.custom.bornInConservatory, true);
  assert.equal(planExhibitBreeding(residents, 2, 8), null, "capacity is a hard breeding limit");
});

test("dragonfly wing pairs flap as mirrored limbs", () => {
  const visual = createMobVisual("reed-dragonfly", -120).visual;
  for (const pair of ["front", "rear"] as const) {
    const left = visual.getObjectByName(`reed-dragonfly-left-${pair}-wing`)!;
    const right = visual.getObjectByName(`reed-dragonfly-right-${pair}-wing`)!;
    assert.equal(left.userData.side, -1);
    assert.equal(right.userData.side, 1);
    assert.equal(left.userData.phase, right.userData.phase);
  }
});
