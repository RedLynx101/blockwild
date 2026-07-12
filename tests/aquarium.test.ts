import assert from "node:assert/strict";
import test from "node:test";
import {
  AQUARIUM_MAX_BLOCKS,
  buildAquariumTopology,
  createAquariumState,
  isAquariumCreature,
  normalizeAquariumStorage,
  planAquariumBreeding,
  reconcileAquariumStorage,
  sampleAquariumPose,
  storeAquariumResident,
} from "../app/game/aquarium.ts";
import type { CreatureMetadata } from "../app/game/creature-cage.ts";

const specimen = (id: string, kind = "reedneedle"): CreatureMetadata => ({
  schema: 1, entityId: id, kind: kind as CreatureMetadata["kind"], health: 3, maxHealth: 3, ageTicks: 48_000, baby: false,
  temperament: "Gentle", hostile: false, tamed: false, ownerId: null, name: null, geneticSeed: id.length * 17,
  command: null, custom: {},
});

test("connected aquariums scale to twenty one-resident cells and ignore detached blocks", () => {
  const blocks = Array.from({ length: 24 }, (_, x) => ({ x, y: 4, z: 0 }));
  blocks.push({ x: 99, y: 4, z: 0 });
  const topology = buildAquariumTopology(blocks, blocks[0]);
  assert.equal(topology.capacity, AQUARIUM_MAX_BLOCKS);
  assert.equal(topology.blocks.some((block) => block.x === 99), false);
  assert.equal(topology.blocks.every((block) => block.floor), true);
});

test("every clicked cell in a connected aquarium resolves the same canonical storage key", () => {
  const blocks = [{ x: 3, y: 5, z: -2 }, { x: 4, y: 5, z: -2 }, { x: 4, y: 6, z: -2 }];
  const fromFirst = buildAquariumTopology(blocks, blocks[0]);
  const fromSecond = buildAquariumTopology(blocks, blocks[1]);
  const fromTop = buildAquariumTopology(blocks, blocks[2]);
  assert.equal(fromFirst.originKey, "3,5,-2");
  assert.equal(fromSecond.originKey, fromFirst.originKey);
  assert.equal(fromTop.originKey, fromFirst.originKey);
});

test("aquariums accept small fish and sea slugs, keep swimmers suspended and slugs on pebbles", () => {
  const topology = buildAquariumTopology([{ x: 0, y: 4, z: 0 }, { x: 0, y: 5, z: 0 }], { x: 0, y: 4, z: 0 });
  assert.equal(isAquariumCreature("reedneedle"), true);
  assert.equal(isAquariumCreature("sunset-sea-slug"), true);
  assert.equal(isAquariumCreature("deepwater-shark"), false);
  const fishResidents = storeAquariumResident([], topology, specimen("fish"))!;
  const slugResidents = storeAquariumResident([], topology, specimen("slug", "sunset-sea-slug"))!;
  assert.equal(sampleAquariumPose(fishResidents[0], topology, 3).crawling, false);
  assert.equal(sampleAquariumPose(slugResidents[0], topology, 3).crawling, true);
});

test("mature same-species pairs repopulate only below the connected tank cap", () => {
  const topology = buildAquariumTopology([{ x: 0, y: 4, z: 0 }, { x: 1, y: 4, z: 0 }, { x: 2, y: 4, z: 0 }], { x: 0, y: 4, z: 0 });
  const residents = [
    { id: "a", metadata: specimen("a", "pocket-goldfish"), storedAt: 0 },
    { id: "b", metadata: specimen("b", "pocket-goldfish"), storedAt: 0 },
  ];
  const plan = planAquariumBreeding(residents, topology, 181);
  assert.deepEqual(plan?.parentIds, ["a", "b"]);
  assert.equal(plan?.child.baby, true);
  assert.equal(plan?.child.custom.bornInAquarium, true);
  assert.equal(planAquariumBreeding([...residents, { id: "c", metadata: specimen("c"), storedAt: 0 }], topology, 181), null);
});

test("tank splits preserve residents once and return only true capacity overflow", () => {
  const original = buildAquariumTopology([{ x: 0, y: 4, z: 0 }, { x: 1, y: 4, z: 0 }, { x: 2, y: 4, z: 0 }], { x: 0, y: 4, z: 0 });
  const state = {
    ...createAquariumState(original, 47),
    residents: ["a", "b", "c"].map((id) => ({ id, metadata: specimen(id, "pocket-goldfish"), storedAt: 12 })),
  };
  const left = buildAquariumTopology([{ x: 0, y: 4, z: 0 }], { x: 0, y: 4, z: 0 });
  const right = buildAquariumTopology([{ x: 2, y: 4, z: 0 }], { x: 2, y: 4, z: 0 });
  const result = reconcileAquariumStorage(new Map([[original.originKey, state]]), [left, right]);
  const residents = [...result.states.values()].flatMap((entry) => entry.residents.map((resident) => resident.id));
  assert.equal(residents.length, 2);
  assert.equal(new Set([...residents, ...result.overflow.map((resident) => resident.id)]).size, 3);
  assert.equal(result.overflow.length, 1);
  assert.equal([...result.states.values()].every((entry) => entry.lastBreedingCycle === 47), true);
});

test("storage restore rejects malformed residents and duplicate exact identities", () => {
  const metadata = specimen("kept", "sunset-sea-slug");
  const restored = normalizeAquariumStorage({
    "0,4,0": { schema: 1, blockKeys: ["0,4,0", "1,4,0"], residents: [
      { id: "kept", metadata, storedAt: 5 },
      { id: "kept", metadata, storedAt: 8 },
      { id: "large", metadata: specimen("large", "deepwater-shark"), storedAt: 8 },
    ], lastBreedingCycle: 9 },
    invalid: { schema: 1, blockKeys: ["oops"], residents: [], lastBreedingCycle: 1 },
  });
  assert.equal(restored.size, 1);
  assert.equal(restored.get("0,4,0")?.residents.length, 1);
  assert.equal(restored.get("0,4,0")?.residents[0]?.metadata.kind, "sunset-sea-slug");
});
