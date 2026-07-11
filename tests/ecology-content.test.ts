import assert from "node:assert/strict";
import test from "node:test";
import {
  APIARY_HONEY_CAP,
  APIARY_HONEY_CYCLE_SECONDS,
  APIARY_JELLY_CAP,
  APIARY_JELLY_CYCLE_SECONDS,
  APIARY_WORKER_CAP,
  beeStingProfile,
  breakApiary,
  canCatchHiveQueen,
  captureWorkerBeeItem,
  createApiary,
  createEmptyApiaryBlock,
  createStockedApiary,
  createWildApiary,
  insertQueenCellIntoApiary,
  planWorkerForaging,
  stepApiary,
  tameHiveQueen,
} from "../app/game/apiary.ts";
import {
  captureIntoOrb,
  decodeCaptureOrb,
  captureOrbFromInventorySlot,
  captureOrbInventorySlot,
  createCreatureHealer,
  createEmptyCaptureOrb,
  createOrbRack,
  healingStationContainerStatus,
  migrateCaptureOrbInventorySlot,
  orbRackContainerStatus,
  stepCreatureHealer,
} from "../app/game/capture-orbs.ts";
import { captureCreature, decodeCapturedCreature, encodeCapturedCreature, type CreatureMetadata } from "../app/game/creature-cage.ts";
import { BLOCKS, BlockId, Item, ITEMS, RECIPES } from "../app/game/data.ts";
import {
  CLOUDREED_GLEN,
  DENSE_CUTOUT_LEAF_POLICY,
  canRideReedstrider,
  createPeelopSheddingState,
  createReedstriderBond,
  feedReedstrider,
  peelopDefenseAction,
  planFullTree,
  planGroupSpawn,
  planSocialGroupMotion,
  planSubmergedFlora,
  puddlehopperJumpPlan,
  saddleReedstrider,
  stepPeelopShedding,
  treeLogsAreFaceConnected,
} from "../app/game/ecology.ts";
import { createMobVisual } from "../app/game/mob-models.ts";
import {
  AQUATIC_MOB_ORDER,
  CORE_MOB_ORDER,
  MOB_DEFS,
  POLLINATOR_ORDER,
  SURFACE_MOB_ORDER,
  type CoreMobKind,
} from "../app/game/mobs.ts";
import {
  BUTTERFLY_ANTENNA_CONTRACT,
  createApiarySpec,
  createCaptureOrbSpec,
  createHealingStationSpec,
  createOrbRackSpec,
  modelSpecForItemModel,
} from "../app/game/model-specs.ts";
import { planStructure, rollStructureLoot } from "../app/game/structures.ts";

const workers = Array.from({ length: APIARY_WORKER_CAP }, (_, index) => `worker-${index}`);

test("apiaries bootstrap from a queen, cap workers, and accelerate after dusk returns", () => {
  const queenOnly = createApiary("queen");
  assert.equal(queenOnly.workers.length, 0);
  const base = stepApiary({ ...queenOnly, nectar: 64 }, { phase: "day", nearbyFlowers: 0, attached: true, deltaSeconds: 180, worldDay: 0 });
  assert.equal(base.state.honeyClock, 45, "a queen alone advances honey at one quarter speed");

  const grown = stepApiary(queenOnly, { phase: "day", nearbyFlowers: 8, attached: true, deltaSeconds: 3600, worldDay: 0 });
  assert.equal(grown.state.workers.filter((worker) => worker.alive).length, APIARY_WORKER_CAP);
  assert.equal(grown.events.filter((event) => event === "worker-created").length, APIARY_WORKER_CAP);
  assert.equal(grown.state.workers.length, APIARY_WORKER_CAP, "dead slots are reused so simulation remains O(8)");

  const foraging = stepApiary(createApiary("queen", ["a", "b"]), { phase: "day", nearbyFlowers: 2, attached: true, deltaSeconds: 45, worldDay: 0 });
  assert.equal(foraging.state.workers.every((worker) => worker.outbound && !worker.home && worker.carryingNectar > 0), true);
  const returned = stepApiary(foraging.state, { phase: "dusk", nearbyFlowers: 2, attached: true, deltaSeconds: 1, worldDay: 0 });
  assert.equal(returned.events.includes("workers-returned"), true);
  assert.equal(returned.state.workers.every((worker) => worker.home && !worker.outbound && worker.carryingNectar === 0), true);
  assert.ok(returned.state.nectar > foraging.state.nectar);
});

test("missing apiary workers disconnect after one day and die two days later", () => {
  const outbound = stepApiary(createApiary("queen", ["lost-worker"]), {
    phase: "day", nearbyFlowers: 1, attached: true, deltaSeconds: 1, worldDay: 0,
  }).state;
  const disconnected = stepApiary(outbound, {
    phase: "dusk", nearbyFlowers: 0, attached: true, deltaSeconds: 0, worldDay: 1, workersCanReturn: false,
  });
  assert.equal(disconnected.events.includes("worker-disconnected"), true);
  assert.equal(disconnected.state.workers[0].disconnectedDay, 1);
  const waiting = stepApiary(disconnected.state, {
    phase: "night", nearbyFlowers: 0, attached: true, deltaSeconds: 0, worldDay: 2, workersCanReturn: false,
  });
  assert.equal(waiting.state.workers[0].alive, true);
  const dead = stepApiary(waiting.state, {
    phase: "night", nearbyFlowers: 0, attached: true, deltaSeconds: 0, worldDay: 3, workersCanReturn: false,
  });
  assert.equal(dead.events.includes("worker-died"), true);
  assert.equal(dead.state.workers[0].alive, false);
});

test("apiary products share hard caps and Royal Jelly is exactly four times slower", () => {
  assert.equal(APIARY_JELLY_CYCLE_SECONDS, APIARY_HONEY_CYCLE_SECONDS * 4);
  assert.equal(APIARY_HONEY_CAP, 12);
  assert.equal(APIARY_JELLY_CAP, 12);
  const full = createStockedApiary("queen", workers);
  const produced = stepApiary({
    ...full,
    nectar: 64,
    honey: 11,
    royalJelly: 11,
    honeyClock: APIARY_HONEY_CYCLE_SECONDS,
    jellyClock: APIARY_JELLY_CYCLE_SECONDS,
  }, { phase: "night", nearbyFlowers: 0, attached: true, deltaSeconds: 0, worldDay: 0 });
  assert.equal(produced.state.honey, 12);
  assert.equal(produced.state.royalJelly, 12);
  const capped = stepApiary({ ...produced.state, nectar: 64 }, { phase: "night", nearbyFlowers: 0, attached: true, deltaSeconds: 3600, worldDay: 0 });
  assert.equal(capped.state.honey, 12);
  assert.equal(capped.state.royalJelly, 12);
});

test("wild hives, break anger, queen capture/taming, and worker foraging are deterministic", () => {
  const wild = createWildApiary("grove-44");
  assert.deepEqual(createWildApiary("grove-44"), wild);
  assert.ok(wild.workers.length >= 0 && wild.workers.length <= 8);
  const stocked = { ...createApiary("wild-queen", ["worker"]), honey: 3, royalJelly: 1 };
  const broken = breakApiary(stocked);
  assert.equal(broken.released.queen?.angry, true);
  assert.equal(broken.released.workers.every((worker) => worker.angry), true);
  assert.deepEqual(broken.drops.map((drop) => [drop.item, drop.count]), [[Item.HoneyJar, 3], [Item.RoyalJelly, 1]]);
  assert.equal(canCatchHiveQueen(4, 8, "net"), false);
  assert.equal(canCatchHiveQueen(3, 8, "capture-orb"), true);
  const tamed = tameHiveQueen(stocked.queen, Item.RoyalJelly, "keeper");
  assert.equal(tamed.ownerId, "keeper");
  assert.deepEqual(beeStingProfile(tamed, true), { damage: 3, cooldownSeconds: 0.9, defendsOwner: true });
  assert.equal(captureWorkerBeeItem(stocked.workers[0])?.item, Item.WorkerBee);
  const flower = { x: 1, y: 2, z: 0 };
  assert.equal(planWorkerForaging({ phase: "day", position: { x: 0, y: 2, z: 0 }, hive: { x: 0, y: 0, z: 0 }, flowers: [flower], carryingNectar: 0 }).mode, "seek-flower");
  assert.equal(planWorkerForaging({ phase: "dusk", position: flower, hive: { x: 0, y: 0, z: 0 }, flowers: [flower], carryingNectar: 4 }).mode, "return");
});

test("Queen Cells insert into empty crafted apiaries", () => {
  assert.equal(insertQueenCellIntoApiary(createEmptyApiaryBlock(), Item.Honeycomb, "nope"), null);
  const apiary = insertQueenCellIntoApiary(createEmptyApiaryBlock(), Item.QueenCell, "new-queen", 8, 3)!;
  assert.equal(apiary.queen.id, "new-queen");
  assert.equal(apiary.workers.length, 0);
});

const creature: CreatureMetadata = {
  schema: 1,
  entityId: "peelop-99",
  kind: "peelop",
  health: 1,
  maxHealth: 7,
  ageTicks: 944,
  baby: true,
  temperament: "Gentle",
  hostile: false,
  tamed: true,
  ownerId: "keeper",
  name: "Mallow",
  geneticSeed: 771,
  command: "sit",
  custom: { nested: { bond: 0.73 }, flags: [true, "golden"] },
};

test("Capture Orbs preserve exact metadata and migrate old Waykeeper Cages", () => {
  const captured = captureIntoOrb(createEmptyCaptureOrb("orb-a"), creature, 123)!;
  const roundTrip = captureOrbFromInventorySlot(captureOrbInventorySlot(captured))!;
  assert.deepEqual(roundTrip.creature, creature);
  const legacy = captureCreature("legacy-cage", creature, 456)!;
  const oldSlot = { item: Item.CreatureCage, count: 1, metadata: { capturedCreature: encodeCapturedCreature(legacy) } };
  const migrated = migrateCaptureOrbInventorySlot(oldSlot);
  assert.equal(migrated.item, Item.CaptureOrb);
  assert.deepEqual(captureOrbFromInventorySlot(migrated)?.creature, creature);
  assert.equal(captureOrbFromInventorySlot({ item: Item.LegacyCaptureOrb, count: 1 })?.creature, null);
});

test("imported creature containers reject unknown species and malformed faction provenance", () => {
  const alignedPet: CreatureMetadata = {
    ...creature,
    entityId: "taffy-hound-bonbon",
    kind: "taffy-hound",
    factionId: "sugarcourt",
    settlementId: "bonbon-borough-test",
    aligned: true,
  };
  const captured = captureIntoOrb(createEmptyCaptureOrb("orb-sugarcourt"), alignedPet, 321)!;
  const encoded = JSON.parse(JSON.stringify(captured)) as { creature: Record<string, unknown> };
  assert.deepEqual(decodeCaptureOrb(JSON.stringify(captured))?.creature, alignedPet);
  assert.deepEqual(decodeCapturedCreature(encodeCapturedCreature(captureCreature("legacy-safe", alignedPet, 321)!))?.creature, alignedPet);

  assert.equal(decodeCaptureOrb(JSON.stringify({ ...encoded, creature: { ...encoded.creature, kind: "unknown-candy-beast" } })), null);
  assert.equal(decodeCaptureOrb(JSON.stringify({ ...encoded, creature: { ...encoded.creature, factionId: "unknown-faction" } })), null);
  assert.equal(decodeCaptureOrb(JSON.stringify({ ...encoded, creature: { ...encoded.creature, aligned: "yes" } })), null);
  assert.equal(decodeCaptureOrb(JSON.stringify({ ...encoded, creature: { ...encoded.creature, health: 99, maxHealth: 12 } })), null);
});

test("four-slot racks and healers expose UI state; healing is passive with optional gel acceleration", () => {
  const captured = captureIntoOrb(createEmptyCaptureOrb("orb-a"), creature, 123)!;
  const rack = createOrbRack([captured]);
  assert.equal(rack.slots.length, 4);
  assert.deepEqual(orbRackContainerStatus(rack), { kind: "orb-rack", capacity: 4, occupied: 1, slots: rack.slots });

  const passiveStart = createCreatureHealer([captured]);
  const halfway = stepCreatureHealer(passiveStart, 10);
  assert.equal(halfway.healed, 0);
  const passive = stepCreatureHealer(halfway.state, 10);
  assert.equal(passive.healed, 1);
  assert.equal(passive.gelUsed, 0);
  const accelerated = stepCreatureHealer(createCreatureHealer([captured], 4), 10);
  assert.equal(accelerated.healed, 1);
  assert.equal(accelerated.gelUsed, 1);
  const status = healingStationContainerStatus(passive.state);
  assert.equal(status.kind, "healing-station");
  assert.equal(status.capacity, 4);
  assert.equal(status.slots[0]?.healing, true);
});

test("Reedstriders tame and ride, Peelops defend selectively and shed bananas", () => {
  let bond = createReedstriderBond();
  bond = feedReedstrider(bond, "keeper", Item.GlowScale);
  bond = feedReedstrider(bond, "keeper", Item.GlowScale);
  assert.equal(bond.tamed, true);
  assert.equal(canRideReedstrider(bond, "keeper"), false);
  assert.equal(canRideReedstrider(saddleReedstrider(bond, "keeper"), "keeper"), true);
  assert.equal(peelopDefenseAction({ tamed: false, selfAttacked: false, ownerAttacked: true, hostileDistance: 1, cooldownSeconds: 0 }).attacks, false);
  assert.equal(peelopDefenseAction({ tamed: true, selfAttacked: false, ownerAttacked: true, hostileDistance: 1, cooldownSeconds: 0 }).damage, 2);
  const shed = createPeelopSheddingState(44);
  assert.deepEqual(stepPeelopShedding(shed, shed.nextShedAge).drop, { item: Item.Banana, count: 1 });
});

test("herds, shoals and Puddlehopper jumps are bounded, social and deterministic", () => {
  const herd = planGroupSpawn(7, "sunstep-grazer", { x: 0, y: 0, z: 0 }, "herd");
  const shoal = planGroupSpawn(7, "silverthread", { x: 0, y: 0, z: 0 }, "shoal");
  assert.ok(herd.length >= 4 && herd.length <= 7);
  assert.ok(shoal.length >= 6 && shoal.length <= 12);
  const motion = planSocialGroupMotion(Array.from({ length: 18 }, (_, index) => ({ id: String(index), x: index * 0.2, z: 0, vx: 1, vz: 0 })), "shoal");
  assert.equal(motion.length, 18);
  assert.equal(motion.every((entry) => Number.isFinite(entry.x) && entry.speedScale <= 1.3), true);
  assert.ok(puddlehopperJumpPlan("hop", 4, true, false).nextDecisionSeconds < puddlehopperJumpPlan("hop", 4, false, false).nextDecisionSeconds + 2);
});

test("submerged flora stays waterlogged and tree crowns remain dense cutouts", () => {
  let flora = planSubmergedFlora("river", 3, 20, 4, 6);
  for (let seed = 0; flora.length === 0 && seed < 100; seed += 1) flora = planSubmergedFlora(seed, 3, 20, 4, 6);
  assert.ok(flora.length > 0);
  assert.equal(flora.every((placement) => placement.waterlogged && placement.coexistsWith === BlockId.Water && !placement.replacesWater), true);
  assert.equal(DENSE_CUTOUT_LEAF_POLICY.preserveTextureCutout, true);
  assert.ok(DENSE_CUTOUT_LEAF_POLICY.exteriorPixelCoverage < 1);
  assert.equal(DENSE_CUTOUT_LEAF_POLICY.cullSameTypeInteriorFaces, "selective");
  const tree = planFullTree("dense", { x: 0, y: 0, z: 0 }, "ancient", BlockId.WildwoodLog, BlockId.WildwoodLeaves);
  assert.ok(tree.filter((block) => block.block === BlockId.WildwoodLeaves).length > 100);
  for (const form of ["rounded", "layered", "windswept", "ancient"] as const) {
    const plan = planFullTree(`connected-${form}`, { x: 0, y: 0, z: 0 }, form, BlockId.WildwoodLog, BlockId.WildwoodLeaves);
    assert.equal(treeLogsAreFaceConnected(plan, BlockId.WildwoodLog), true, `${form} wood must be face-connected`);
  }
});

test("new data, recipes, biome content and semantic held models are registered", () => {
  assert.equal(Item.CaptureOrb, Item.CreatureCage, "old saves keep numeric item id 156");
  assert.notEqual(Item.LegacyCaptureOrb, Item.CaptureOrb);
  assert.equal(ITEMS[Item.CaptureOrb].maxStack, 16, "empty orbs from the two-output recipe can stack");
  assert.equal(BLOCKS[BlockId.WildBeehive].name, "Wild Beehive");
  assert.notEqual(BlockId.WildBeehive, BlockId.Apiary);
  const orbRecipe = RECIPES.find((recipe) => recipe.id === "creature_cage")!;
  assert.deepEqual(orbRecipe.output, { item: Item.CaptureOrb, count: 2 });
  assert.equal(RECIPES.some((recipe) => recipe.id === "capture_orb"), false);
  assert.deepEqual(RECIPES.find((recipe) => recipe.id === "queen_cell")?.pattern, [Item.WorkerBee, Item.RoyalJelly]);
  assert.equal(ITEMS[BlockId.Chest].iconKind, "chest");
  assert.equal(ITEMS[BlockId.Chest].heldModel, "wildwood-chest");
  assert.equal(CLOUDREED_GLEN.signatureCreature, "mistmane");
  assert.equal(CLOUDREED_GLEN.flora.includes(BlockId.Cloudbell), true);
});

test("new creatures have distinct content and canonical production models", () => {
  for (const kind of ["wild-horse", "meadow-cow", "mistmane"] as const) assert.equal(SURFACE_MOB_ORDER.includes(kind), true);
  for (const kind of ["silverthread", "reedneedle", "emberribbon", "cavefilament"] as const) {
    assert.equal(AQUATIC_MOB_ORDER.includes(kind), true);
    assert.equal(MOB_DEFS[kind].aquatic, true);
  }
  assert.deepEqual(POLLINATOR_ORDER, ["honeybee", "hive-queen", "reed-dragonfly"]);
  assert.equal(MOB_DEFS.reedstrider.tameable, true);
  assert.equal(MOB_DEFS.peelop.damage, 2);
  assert.ok(MOB_DEFS["sunstep-grazer"].radius > 0.6);
  for (const kind of ["wild-horse", "meadow-cow", "mistmane", "silverthread", "reedneedle", "emberribbon", "cavefilament", "honeybee", "hive-queen", "reed-dragonfly"] as CoreMobKind[]) {
    const model = createMobVisual(kind, 1);
    assert.ok(model.visual.children.length >= 8, `${kind} needs readable production detail`);
    assert.equal(CORE_MOB_ORDER.includes(kind), true);
  }
});

test("utility model contracts and butterfly antenna dimensions are inspection-ready", () => {
  for (const spec of [createApiarySpec(), createCaptureOrbSpec(), createOrbRackSpec(), createHealingStationSpec()]) {
    assert.ok(spec.boxes.length >= 8);
  }
  assert.equal(modelSpecForItemModel("wildwood-chest").id, "wildwood-chest");
  assert.equal(modelSpecForItemModel("capture-orb").id, "waykeeper-capture-orb");
  assert.equal(BUTTERFLY_ANTENNA_CONTRACT.count, 2);
  assert.ok(BUTTERFLY_ANTENNA_CONTRACT.length > 0.1);
});

test("abandoned apiaries and healing grottos carry distinct blocks, residents and loot", () => {
  const apiary = planStructure("abandoned-apiary", { x: 0, y: 30, z: 0 }, "apiary");
  assert.equal(apiary.placements.some((placement) => placement.block === BlockId.WildBeehive), true);
  assert.equal(apiary.markers.some((marker) => marker.type === "spawn" && marker.mobKind === "hive-queen"), true);
  assert.equal(apiary.markers.some((marker) => marker.type === "chest" && marker.lootTable === "apiary-cache"), true);
  const grotto = planStructure("waykeeper-healing-grotto", { x: 0, y: 30, z: 0 }, "healer");
  assert.equal(grotto.placements.some((placement) => placement.block === BlockId.CreatureHealer), true);
  assert.equal(grotto.placements.some((placement) => placement.block === BlockId.CaptureOrbRack), true);
  assert.equal(grotto.markers.some((marker) => marker.type === "chest" && marker.lootTable === "healer-cache"), true);
  assert.deepEqual(rollStructureLoot("apiary-cache", 77), rollStructureLoot("apiary-cache", 77));
});
