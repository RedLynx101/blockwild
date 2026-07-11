import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  createBirdBehavior,
  createStableSteering,
  chooseLocalWalkableGround,
  fishKindsForHabitat,
  passiveMobKindForBiome,
  shouldKeepCreatureLoaded,
  updateBirdBehavior,
  updateStableSteering,
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
import { CREATURE_SOUND_EVENTS, creatureSoundCue } from "../app/game/creature-sounds.ts";
import {
  canCaptureCreature,
  captureCreature,
  decodeCapturedCreature,
  encodeCapturedCreature,
  releaseCreature,
  type CreatureMetadata,
} from "../app/game/creature-cage.ts";
import {
  buildExhibitTopology,
  createExhibitInventory,
  MAX_EXHIBIT_BLOCKS,
  sampleExhibitButterflyPose,
  storeExhibitButterfly,
  takeExhibitButterfly,
  type ExhibitButterfly,
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
  MOB_DEFS,
  SURFACE_MOB_ORDER,
} from "../app/game/mobs.ts";
import { createMobVisual, createSkeletonArrowVisual } from "../app/game/mob-models.ts";

test("expanded ecology catalog has nine surface creatures, two birds, four fish, a pet, temple guardian, and archer", () => {
  assert.equal(SURFACE_MOB_ORDER.length, 9);
  assert.equal(new Set(SURFACE_MOB_ORDER).size, 9);
  for (const kind of ["thimbledeer", "lanternshell", "puddlehopper", "reedstrider"] as const) {
    assert.ok(SURFACE_MOB_ORDER.includes(kind));
    assert.equal(MOB_DEFS[kind].hostile, false);
    assert.ok(MOB_DEFS[kind].discoveryHint);
    assert.ok(MOB_DEFS[kind].utility);
  }
  assert.equal(BIRD_ORDER.length, 2);
  assert.equal(AQUATIC_MOB_ORDER.length, 4);
  assert.deepEqual(fishKindsForHabitat("ocean"), ["shoalfin", "coralback"]);
  assert.deepEqual(fishKindsForHabitat("river"), ["brookdart"]);
  assert.deepEqual(fishKindsForHabitat("underground"), ["gloomfin"]);
  assert.equal(MOB_DEFS.peelop.persistent, true);
  assert.equal(MOB_DEFS.skeleton.ranged, true);
  assert.equal(MOB_DEFS["reliquary-sentinel"].hostile, true);
  assert.equal(passiveMobKindForBiome(BiomeId.Meadow, 0.01), "thimbledeer");
  assert.equal(passiveMobKindForBiome(BiomeId.Siltfen, 0.3), "lanternshell");
  assert.equal(passiveMobKindForBiome(BiomeId.Siltfen, 0.52), "puddlehopper");
  assert.equal(passiveMobKindForBiome(BiomeId.Siltfen, 0.72), "reedstrider");
  assert.equal(CORE_MOB_ORDER.every((kind) => MOB_DEFS[kind].sentient !== true), true);
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

test("creature sound events define Ridgeback and companion cues with a generic hit fallback", () => {
  assert.equal(CREATURE_SOUND_EVENTS.ridgeback?.hurt?.asset, "ridgeback-stone-bellow");
  assert.equal(CREATURE_SOUND_EVENTS.shadecrawler?.tame?.fallback, "craft");
  assert.equal(creatureSoundCue("thimbledeer", "hurt").asset, "creature-generic-hurt");
  assert.equal(creatureSoundCue("thimbledeer", "hurt").fallback, "attack");
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
