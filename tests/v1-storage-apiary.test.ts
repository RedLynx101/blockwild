import test from "node:test";
import assert from "node:assert/strict";
import { Item, type InventorySlot } from "../app/game/data";
import {
  apiaryIsFriendly,
  captureWorkerBeeItem,
  createEmptyApiaryBlock,
  extractApiaryBee,
  insertApiaryBee,
  workerBeeFromInventorySlot,
  type ApiaryBee,
} from "../app/game/apiary";
import {
  attuneCaptureOrb,
  captureIntoOrb,
  createCreatureHealer,
  createEmptyCaptureOrb,
  deployAttunedCaptureOrb,
  recallAttunedCreature,
  stepCreatureHealer,
  unattuneCaptureOrb,
} from "../app/game/capture-orbs";
import {
  createDigitalCreatureArchive,
  createDigitalItemVault,
  addDigitalCreatureCell,
  addDigitalItemCell,
  depositCreatureOrb,
  depositDigitalItem,
  digitalItemUtilization,
  digitalCellCounts,
  normalizeDigitalCreatureArchive,
  normalizeDigitalItemVault,
  planAreaCrafting,
  removeDigitalCreatureCell,
  removeDigitalItemCell,
  searchCreatureArchive,
  searchDigitalItems,
  stepDigitalCreatureHealing,
  withdrawDigitalItem,
} from "../app/game/digital-storage";
import type { CreatureMetadata } from "../app/game/creature-cage";

const bee = (id: string, role: "queen" | "worker", overrides: Partial<ApiaryBee> = {}): ApiaryBee => ({
  id,
  role,
  alive: true,
  home: false,
  outbound: false,
  carryingNectar: 0,
  lastReturnDay: 0,
  disconnectedDay: null,
  geneticSeed: id.length * 991,
  angry: false,
  tamed: false,
  ownerId: null,
  ...overrides,
});

const creature = (health = 6): CreatureMetadata => ({
  schema: 1,
  entityId: "puddlehopper-v1",
  kind: "puddlehopper",
  health,
  maxHealth: 6,
  ageTicks: 24_000,
  baby: false,
  temperament: "Gentle",
  hostile: false,
  tamed: true,
  ownerId: "player-a",
  name: "Pip",
  geneticSeed: 17,
  command: "follow",
  custom: {},
});

test("neutral or bonded queens activate a hive as exact entities and friendly workers move both directions", () => {
  const neutralQueen = bee("queen-lumen", "queen");
  const activated = insertApiaryBee(createEmptyApiaryBlock(), neutralQueen, "player-a", 4);
  assert.equal(activated.inserted, true);
  assert.notEqual(activated.state.queen, null);
  if (activated.state.queen === null) return;
  assert.equal(activated.state.queen.id, "queen-lumen");
  assert.equal(apiaryIsFriendly(activated.state, "player-a"), true);

  const worker = bee("worker-mint", "worker", { tamed: true, ownerId: "player-a" });
  const capsule = captureWorkerBeeItem(worker)!;
  assert.deepEqual(workerBeeFromInventorySlot(capsule), worker);
  const inserted = insertApiaryBee(activated.state, workerBeeFromInventorySlot(capsule)!, "player-a", 4);
  assert.equal(inserted.inserted, true);
  if (inserted.state.queen === null) return;
  assert.equal(inserted.state.workers.length, 1);

  const extracted = extractApiaryBee(inserted.state, worker.id, "player-a");
  assert.equal(extracted.reason, "ok");
  assert.equal(extracted.bee?.id, worker.id);
  const queenOut = extractApiaryBee(extracted.state, neutralQueen.id, "player-a");
  assert.equal(queenOut.reason, "ok");
  assert.equal(queenOut.state.queen, null);
});

test("angry queens cannot be stuffed into crafted apiaries and foreign bonded colonies are private", () => {
  const angry = insertApiaryBee(createEmptyApiaryBlock(), bee("queen-angry", "queen", { angry: true }), "player-a");
  assert.equal(angry.reason, "not-friendly");
  const bonded = insertApiaryBee(createEmptyApiaryBlock(), bee("queen-bonded", "queen", { tamed: true, ownerId: "player-a" }), "player-a");
  assert.equal(bonded.inserted, true);
  if (bonded.state.queen === null) return;
  assert.equal(apiaryIsFriendly(bonded.state, "player-b"), false);
  assert.equal(insertApiaryBee(bonded.state, bee("worker-b", "worker"), "player-b").reason, "not-friendly");
});

test("attuned orbs retain their creature while deployed, recall white-sparkle, and enforce fainting", () => {
  const filled = captureIntoOrb(createEmptyCaptureOrb("orb-pip"), creature(), 10)!;
  const attuned = attuneCaptureOrb(filled, "player-a", 11)!;
  const deployed = deployAttunedCaptureOrb(attuned, "player-a")!;
  assert.equal(deployed.orb.creature?.name, "Pip");
  assert.equal(deployed.orb.attunement?.activeEntityId, "puddlehopper-v1");
  assert.equal(deployAttunedCaptureOrb(deployed.orb, "player-a"), null);

  const fainted = recallAttunedCreature(deployed.orb, { ...deployed.creature, health: 0 }, "player-a", "fainted", 12)!;
  assert.equal(fainted.orb.attunement?.fainted, true);
  assert.equal(fainted.orb.creature?.health, 0);
  assert.equal(fainted.effect.tint, "white");
  assert.ok(fainted.effect.particleCount >= 24);
  assert.equal(deployAttunedCaptureOrb(fainted.orb, "player-a"), null);
  assert.equal(unattuneCaptureOrb(fainted.orb, "player-a"), null);

  const healer = stepCreatureHealer(createCreatureHealer([fainted.orb]), 20);
  assert.equal(healer.state.slots[0]?.creature?.health, 1);
  assert.equal(healer.state.slots[0]?.attunement?.fainted, false);
  assert.ok(deployAttunedCaptureOrb(healer.state.slots[0]!, "player-a"));
});

test("digital item cells scale by powers of ten, search, withdraw, and spill exact legal overflow", () => {
  let vault = createDigitalItemVault([{ id: "base", tier: 1 }]);
  const apples: InventorySlot = { item: Item.Apple, count: 900 };
  const berries: InventorySlot = { item: Item.Berry, count: 250 };
  const first = depositDigitalItem(vault, apples);
  vault = first.state;
  assert.equal(first.accepted, 900);
  const second = depositDigitalItem(vault, berries);
  vault = second.state;
  assert.equal(second.accepted, 100);
  assert.equal(second.remainder?.count, 150);
  assert.equal(digitalItemUtilization(vault).label, "1,000/1,000");
  assert.equal(searchDigitalItems(vault, "apple", (item) => item === Item.Apple ? "Wild Apple" : "Moonberry").length, 1);

  const withdrawn = withdrawDigitalItem(vault, Item.Apple, 64);
  assert.equal(withdrawn.withdrawn?.count, 64);
  const expanded = { ...withdrawn.state, cells: [...withdrawn.state.cells, { id: "dense", tier: 2 as const }] };
  assert.equal(digitalItemUtilization(expanded).capacity, 11_000);
  const removed = removeDigitalItemCell(expanded, "dense");
  assert.equal(removed.overflow.length, 0, "remaining usage fits the base cell");

  const noCells = removeDigitalItemCell(removed.state, "base");
  assert.equal(noCells.state.stacks.length, 0);
  assert.equal(noCells.overflow.reduce((sum, slot) => sum + slot.count, 0), 936);
  assert.ok(noCells.overflow.every((slot) => slot.count <= 64));
});

test("digital creature storage searches exact metadata, heals slowly, and spills excess orbs on capacity loss", () => {
  const fainted = attuneCaptureOrb(captureIntoOrb(createEmptyCaptureOrb("orb-pip"), creature(0))!, "player-a");
  assert.equal(fainted, null, "a creature must be conscious when first attuned");
  const conscious = attuneCaptureOrb(captureIntoOrb(createEmptyCaptureOrb("orb-pip"), creature(1))!, "player-a")!;
  const recalled = recallAttunedCreature(deployAttunedCaptureOrb(conscious, "player-a")!.orb, creature(0), "player-a", "fainted")!.orb;
  let archive = createDigitalCreatureArchive([{ id: "creature-base", tier: 1 }]);
  const stored = depositCreatureOrb(archive, recalled);
  assert.equal(stored.accepted, true);
  archive = stored.state;
  assert.equal(searchCreatureArchive(archive, "pip").length, 1);
  assert.equal(stepDigitalCreatureHealing(archive, 59).healed, 0);
  const healed = stepDigitalCreatureHealing(archive, 60);
  assert.equal(healed.healed, 1);
  assert.equal(healed.state.orbs[0].attunement?.fainted, false);
  const overflow = removeDigitalCreatureCell(healed.state, "creature-base");
  assert.equal(overflow.state.orbs.length, 0);
  assert.equal(overflow.overflow[0].orbId, "orb-pip");
});

test("area crafting plans atomically across player, digital storage, and nearby chests", () => {
  const success = planAreaCrafting([
    { item: Item.Stick, count: 3 },
    { item: Item.SunmetalIngot, count: 2 },
  ], [
    { id: "player", kind: "player", slots: [{ item: Item.Stick, count: 1 }] },
    { id: "vault", kind: "digital", slots: [{ item: Item.Stick, count: 2 }, { item: Item.SunmetalIngot, count: 1 }] },
    { id: "chest-near", kind: "chest", slots: [{ item: Item.SunmetalIngot, count: 1 }] },
  ]);
  assert.equal(success.ok, true);
  assert.deepEqual(success.allocations.map((entry) => entry.sourceKind), ["player", "digital", "digital", "chest"]);

  const failed = planAreaCrafting([{ item: Item.SunmetalIngot, count: 3 }], [
    { id: "vault", kind: "digital", slots: [{ item: Item.SunmetalIngot, count: 2 }] },
  ]);
  assert.equal(failed.ok, false);
  assert.deepEqual(failed.allocations, []);
  assert.deepEqual(failed.missing, [{ item: Item.SunmetalIngot, count: 1 }]);
});

test("digital network saves normalize cells, reject duplicates, and preserve exact archived metadata", () => {
  const vault = addDigitalItemCell(addDigitalItemCell(createDigitalItemVault([]), { id: "tier-two", tier: 2 }), { id: "tier-two", tier: 3 });
  assert.deepEqual(digitalCellCounts(vault), [0, 1, 0]);
  const normalizedVault = normalizeDigitalItemVault({
    schema: 99,
    cells: [{ id: "tier-one", tier: 1 }, { id: "tier-one", tier: 2 }, { id: "bad", tier: 9 }],
    stacks: [{ item: Item.Apple, count: 70 }],
  });
  assert.deepEqual(digitalCellCounts(normalizedVault), [1, 1, 0]);
  assert.equal(digitalItemUtilization(normalizedVault).used, 70);

  const orb = captureIntoOrb(createEmptyCaptureOrb("archive-exact"), creature(3))!;
  const archive = addDigitalCreatureCell(createDigitalCreatureArchive([]), { id: "archive-cell", tier: 1 });
  const normalizedArchive = normalizeDigitalCreatureArchive({ ...archive, orbs: [orb, orb], healClock: 22 });
  assert.equal(normalizedArchive.orbs.length, 1);
  assert.equal(normalizedArchive.orbs[0].creature?.name, "Pip");
  assert.deepEqual(digitalCellCounts(normalizedArchive), [1, 0, 0]);
});
