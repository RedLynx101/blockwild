import assert from "node:assert/strict";
import test from "node:test";
import { BlockId } from "../app/game/data.ts";
import {
  WORLD_AUTHORITY_SCHEMA_V1,
  WORLD_MAX_Y_V1,
  WORLD_MIN_Y_V1,
  WorldLiquidKindV1,
  WorldAuthorityContractError,
  assertWorldChunkCacheEnvelopeV1,
  createWorldAuthorityIdentityV1,
  createWorldChunkCacheEnvelopeV1,
  createWorldCompatibilitySaveV1,
  createWorldNetworkDeltaV1,
  decodeWorldCompatibilitySaveV1,
  decodeWorldNetworkDeltaV1,
  encodeWorldCompatibilitySaveV1,
  encodeWorldNetworkDeltaV1,
  isWorldJobCurrentV1,
  readWorldWindowCellV1,
  worldChunkCacheKeyV1,
  worldRevisionKeyV1,
  type WorldAddressV1,
  type WorldMutationBatchV1,
  type WorldResidencyEventV1,
} from "../app/game/world-authority-contract.ts";
import {
  TypeScriptWorldAuthorityV1,
  type TypeScriptWorldOracleCommitV1,
  type TypeScriptWorldOracleV1,
} from "../app/game/typescript-world-authority.ts";

const ADDRESS = Object.freeze({ universeId: "1", locationId: "overworld" }) satisfies WorldAddressV1;
const HASH_A = "0123456789abcdef0123456789abcdef";
const HASH_B = "fedcba9876543210fedcba9876543210";

function key(x: number, y: number, z: number) { return `${x},${y},${z}`; }

class MemoryWorldOracle implements TypeScriptWorldOracleV1 {
  readonly loaded = new Set<string>(["0,0", "-1,-1"]);
  readonly cells = new Map<string, { blockId: number; facing: number }>();
  commits: ReadonlyArray<readonly TypeScriptWorldOracleCommitV1[]> = [];
  failNextCommit = false;

  isChunkLoaded(chunkX: number, chunkZ: number) { return this.loaded.has(`${chunkX},${chunkZ}`); }
  readCell(x: number, y: number, z: number) {
    if (!this.isChunkLoaded(Math.floor(x / 16), Math.floor(z / 16))) return undefined;
    const cell = this.cells.get(key(x, y, z)) ?? { blockId: BlockId.Air, facing: 0 };
    const waterlogged = cell.blockId === BlockId.LumenKelp;
    const water = cell.blockId === BlockId.Water;
    return Object.freeze({
      ...cell,
      liquid: Object.freeze({
        kind: water ? WorldLiquidKindV1.Water : WorldLiquidKindV1.None,
        level: water ? 8 : 0,
        source: water,
        falling: false,
        containsWater: water || waterlogged,
        waterlogged,
      }),
    });
  }
  isDirectionalBlock(blockId: number) { return blockId === BlockId.Chest || blockId === BlockId.Furnace; }
  isWaterloggedBlock(blockId: number) { return blockId === BlockId.LumenKelp; }
  commitAtomic(changes: readonly TypeScriptWorldOracleCommitV1[]) {
    if (this.failNextCommit) { this.failNextCommit = false; throw new Error("injected atomic failure"); }
    this.commits = [...this.commits, changes];
    for (const change of changes) this.cells.set(key(change.x, change.y, change.z), { blockId: change.blockId, facing: change.facing });
  }
  exportEdits() {
    return [{ chunkX: 0, chunkZ: 0, entries: [[4, BlockId.Stone], [1, BlockId.Dirt]] as const }];
  }
  exportFacings() {
    return [{ x: 2, y: 0, z: 2, facing: 3 }];
  }
}

function batch(authority: TypeScriptWorldAuthorityV1, batchId: string, commands: WorldMutationBatchV1["commands"], address = ADDRESS): WorldMutationBatchV1 {
  return {
    schemaVersion: WORLD_AUTHORITY_SCHEMA_V1,
    batchId,
    authorityId: "host-test",
    address,
    expectedRevision: authority.currentRevision(),
    commands,
  };
}

test("near-field snapshots preserve negative coordinates and unloaded/Air/Bedrock distinctions", () => {
  const oracle = new MemoryWorldOracle();
  oracle.cells.set(key(-1, WORLD_MIN_Y_V1, -1), { blockId: BlockId.Bedrock, facing: 0 });
  const authority = new TypeScriptWorldAuthorityV1(ADDRESS, oracle);
  const vertical = authority.readNearField({ origin: { x: -1, y: WORLD_MIN_Y_V1 - 1, z: -1 }, size: { x: 1, y: 194, z: 1 } });
  const belowWorld = readWorldWindowCellV1(vertical, -1, WORLD_MIN_Y_V1 - 1, -1);
  assert.equal(belowWorld.kind, "bedrock");
  if (belowWorld.kind !== "bedrock") return;
  assert.equal(belowWorld.provenance, "vertical-boundary");
  const loadedBedrock = readWorldWindowCellV1(vertical, -1, WORLD_MIN_Y_V1, -1);
  assert.equal(loadedBedrock.kind, "bedrock");
  if (loadedBedrock.kind !== "bedrock") return;
  assert.equal(loadedBedrock.provenance, "loaded");
  assert.equal(readWorldWindowCellV1(vertical, -1, 0, -1).kind, "air");
  const aboveWorld = readWorldWindowCellV1(vertical, -1, WORLD_MAX_Y_V1 + 1, -1);
  assert.equal(aboveWorld.kind, "air");
  if (aboveWorld.kind !== "air") return;
  assert.equal(aboveWorld.provenance, "vertical-boundary");

  const unloaded = authority.readNearField({ origin: { x: 16, y: 0, z: 0 }, size: { x: 1, y: 1, z: 1 } });
  assert.equal(readWorldWindowCellV1(unloaded, 16, 0, 0).kind, "unloaded");
  assert.equal(unloaded.streams.blocks[0], 0xffff, "unloaded is never encoded as Air");
  assert.ok(Object.isFrozen(vertical), "the snapshot envelope is immutable");
  oracle.cells.set(key(-1, 0, -1), { blockId: BlockId.Stone, facing: 0 });
  assert.equal(readWorldWindowCellV1(vertical, -1, 0, -1).kind, "air", "the snapshot does not alias later oracle edits");
  assert.throws(() => authority.readNearField({ origin: { x: 0, y: 0, z: 0 }, size: { x: -1, y: 1, z: 1 } }), RangeError);
  assert.throws(() => authority.readNearField({ origin: { x: 0, y: 0, z: 0 }, size: { x: 256, y: 256, z: 3 } }), RangeError);
});

test("expected-revision batches preflight atomically, reject stale work, and preserve no-op revisions", () => {
  const oracle = new MemoryWorldOracle();
  const events: string[] = [];
  const authority = new TypeScriptWorldAuthorityV1(ADDRESS, oracle, (event) => events.push(event.kind));
  const before = authority.currentIdentity();
  const rejected = authority.applyMutationBatch(batch(authority, "atomic-reject", [
    { kind: "set-block", x: 0, y: 0, z: 0, blockId: BlockId.Stone },
    { kind: "set-block", x: 16, y: 0, z: 0, blockId: BlockId.Stone },
  ]));
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.code, "unloaded-cell");
  assert.equal(oracle.commits.length, 0);
  assert.equal(oracle.readCell(0, 0, 0)?.blockId, BlockId.Air, "preflight failure rolls the whole batch back");
  assert.deepEqual(authority.currentIdentity(), before);

  oracle.failNextCommit = true;
  const failed = authority.applyMutationBatch(batch(authority, "oracle-reject", [{ kind: "set-block", x: 0, y: 0, z: 0, blockId: BlockId.Stone }]));
  assert.equal(failed.status, "rejected");
  assert.equal(failed.code, "oracle-rejected");
  assert.equal(oracle.readCell(0, 0, 0)?.blockId, BlockId.Air);

  const accepted = authority.applyMutationBatch(batch(authority, "ordered", [
    { kind: "set-block", x: 15, y: -48, z: 0, blockId: BlockId.Stone },
    { kind: "set-block", x: -1, y: 0, z: -1, blockId: BlockId.Dirt },
  ]));
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.mutated, true);
  assert.deepEqual(accepted.changes.map((change) => [change.x, change.y, change.z]), [[15, -48, 0], [-1, 0, -1]], "committed deltas use canonical y/z/x order");
  assert.ok(accepted.dirty.sections.some((section) => section.chunkX === 1 && section.chunkZ === 0), "chunk-edge neighbor is dirtied");
  assert.ok(accepted.dirty.sections.some((section) => section.sectionY === 0), "section-boundary neighbor is dirtied");
  assert.deepEqual(accepted.dirty.subsystemSeeds.map((entry) => entry.subsystem), ["lighting", "liquids", "meshing", "navigation", "maps", "persistence"]);
  assert.deepEqual(events, ["world-edit-committed-v1"]);

  const stale = authority.applyMutationBatch({ ...batch(authority, "stale", [{ kind: "set-block", x: 0, y: 0, z: 0, blockId: BlockId.Dirt }]), expectedRevision: before.revision });
  assert.equal(stale.status, "rejected");
  assert.equal(stale.code, "stale-revision");

  const revisionBeforeNoop = authority.currentRevision();
  const noOp = authority.applyMutationBatch(batch(authority, "noop", [{ kind: "set-block", x: 15, y: -48, z: 0, blockId: BlockId.Stone }]));
  assert.equal(noOp.status, "accepted");
  assert.equal(noOp.mutated, false);
  assert.equal(noOp.delta, null);
  assert.equal(worldRevisionKeyV1(authority.currentRevision()), worldRevisionKeyV1(revisionBeforeNoop));
});

test("facing cleanup and waterlogged-flora replacement are explicit authority hooks", () => {
  const oracle = new MemoryWorldOracle();
  const authority = new TypeScriptWorldAuthorityV1(ADDRESS, oracle);
  const placed = authority.applyMutationBatch(batch(authority, "place-chest", [
    { kind: "set-block", x: 2, y: 0, z: 2, blockId: BlockId.Chest, facing: 3 },
  ]));
  assert.equal(placed.status, "accepted");
  assert.equal(oracle.readCell(2, 0, 2)?.facing, 3);
  const replaced = authority.applyMutationBatch(batch(authority, "replace-chest", [
    { kind: "set-block", x: 2, y: 0, z: 2, blockId: BlockId.Stone },
  ]));
  assert.equal(replaced.status, "accepted");
  assert.equal(oracle.readCell(2, 0, 2)?.facing, 0, "non-directional replacement clears sparse facing metadata");
  const invalidFacing = authority.applyMutationBatch(batch(authority, "face-stone", [
    { kind: "set-facing", x: 2, y: 0, z: 2, facing: 2 },
  ]));
  assert.equal(invalidFacing.status, "rejected");
  assert.equal(invalidFacing.code, "facing-not-supported");

  oracle.cells.set(key(3, 0, 3), { blockId: BlockId.LumenKelp, facing: 0 });
  const harvested = authority.applyMutationBatch(batch(authority, "harvest-kelp", [
    { kind: "set-block", x: 3, y: 0, z: 3, blockId: BlockId.Air },
  ]));
  assert.equal(harvested.status, "accepted");
  assert.equal(oracle.readCell(3, 0, 3)?.blockId, BlockId.Water, "waterlogged flora removal restores water instead of Air");
  const read = authority.readNearField({ origin: { x: 3, y: 0, z: 3 }, size: { x: 1, y: 1, z: 1 } });
  const harvestedCell = readWorldWindowCellV1(read, 3, 0, 3);
  assert.notEqual(harvestedCell.kind, "unloaded");
  if (harvestedCell.kind === "unloaded") return;
  assert.equal(harvestedCell.liquid.kind, WorldLiquidKindV1.Water);
});

test("residency sequencing and section identities reject stale jobs", () => {
  const oracle = new MemoryWorldOracle();
  const authority = new TypeScriptWorldAuthorityV1(ADDRESS, oracle);
  const resident = {
    schemaVersion: WORLD_AUTHORITY_SCHEMA_V1,
    sequence: 1,
    expectedResidencyRevision: 0,
    kind: "resident" as const,
    address: { ...ADDRESS, chunkX: -1, chunkZ: -1 },
    chunkRevision: 7,
    reason: "player-ring" as const,
  } satisfies WorldResidencyEventV1;
  assert.equal(authority.applyResidencyEvent(resident).status, "accepted");
  assert.equal(authority.applyResidencyEvent(resident).status, "duplicate");
  assert.equal(authority.applyResidencyEvent({ ...resident, sequence: 3, expectedResidencyRevision: 1 }).status, "stale");
  const sectionAddress = { ...ADDRESS, chunkX: -1, chunkZ: -1, sectionY: 4 };
  const section = authority.currentSectionRevision(sectionAddress)!;
  assert.equal(section.blocks, 7);
  const identity = authority.currentIdentity();
  const job = { address: sectionAddress, authority: identity, section, sourceHash: HASH_A };
  assert.equal(isWorldJobCurrentV1(job, identity, section), true);
  const changedIdentity = createWorldAuthorityIdentityV1(ADDRESS, { ...identity.revision, mutation: identity.revision.mutation + 1 });
  assert.equal(isWorldJobCurrentV1(job, changedIdentity, section), false);
  assert.equal(isWorldJobCurrentV1(job, identity, { ...section, halo: section.halo + 1 }), false);
  const evicted = authority.applyResidencyEvent({ ...resident, sequence: 2, expectedResidencyRevision: 1, kind: "evicted", reason: "retention" });
  assert.equal(evicted.status, "accepted");
});

test("cache keys/checksums and compatibility save/network bytes are canonical round trips", () => {
  const cacheInput = {
    address: { ...ADDRESS, chunkX: -2, chunkZ: 5 },
    generatorVersion: 18,
    generatorHash: HASH_A,
    contentHash: HASH_B,
    optionsHash: HASH_A,
    editHaloHash: HASH_B,
  };
  assert.equal(worldChunkCacheKeyV1(cacheInput), worldChunkCacheKeyV1({ ...cacheInput }));
  const envelope = createWorldChunkCacheEnvelopeV1({ ...cacheInput, revision: 9, payload: Uint8Array.from([5, 4, 3, 2, 1]) });
  assert.doesNotThrow(() => assertWorldChunkCacheEnvelopeV1(envelope));
  assert.throws(() => assertWorldChunkCacheEnvelopeV1({ ...envelope, payload: Uint8Array.from([5, 4, 3, 2, 0]) }), WorldAuthorityContractError);

  const save = createWorldCompatibilitySaveV1({
    address: ADDRESS,
    revision: { epoch: 1, mutation: 9, residency: 3 },
    edits: [
      { chunkX: 1, chunkZ: 0, entries: [[9, BlockId.Stone]] },
      { chunkX: -1, chunkZ: 0, entries: [[4, BlockId.Dirt], [1, BlockId.Grass]] },
    ],
    facings: [{ x: 3, y: 0, z: 2, facing: 2 }, { x: -1, y: -2, z: 0, facing: 1 }],
  });
  const saveDecoded = decodeWorldCompatibilitySaveV1(encodeWorldCompatibilitySaveV1(save));
  assert.deepEqual(saveDecoded, save);
  assert.deepEqual(saveDecoded.edits.map((entry) => [entry.chunkX, entry.chunkZ]), [[-1, 0], [1, 0]], "save chunks are canonicalized");

  const delta = createWorldNetworkDeltaV1({
    address: ADDRESS,
    batchId: "network-roundtrip",
    fromRevision: { epoch: 1, mutation: 8, residency: 3 },
    toRevision: { epoch: 1, mutation: 9, residency: 3 },
    changes: [{ x: -1, y: 0, z: 0, previousBlockId: BlockId.Air, blockId: BlockId.Stone, previousFacing: 0, facing: 0 }],
  });
  assert.deepEqual(decodeWorldNetworkDeltaV1(encodeWorldNetworkDeltaV1(delta)), delta);
  const corrupted = encodeWorldNetworkDeltaV1(delta);
  corrupted[corrupted.length - 2] ^= 1;
  assert.throws(() => decodeWorldNetworkDeltaV1(corrupted), WorldAuthorityContractError);
});
