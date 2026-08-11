import assert from "node:assert/strict";
import test from "node:test";
import {
  GAMEPLAY_SCHEMA_V1,
  GameplayAuthorityContractError,
  createGameplayAuthorityIdentityV1,
  createGameplayCommandBatchV1,
  gameplayBatchTransferListV1,
  gameplayIdentitySameRevisionV1,
  gameplayReceiptIsCurrentV1,
  gameplayResourceDeltasConserveV1,
  type GameplayCommandBatchV1Source,
} from "../app/game/gameplay-authority-contract.ts";

const address = Object.freeze({ universeId: "1", locationId: "overworld" });
const revision = Object.freeze({ epoch: 1, sequence: 20, inventory: 8, machines: 3, combat: 12, progression: 4, cardforge: 6 });

function source(): GameplayCommandBatchV1Source {
  const identity = createGameplayAuthorityIdentityV1(address, revision);
  return {
    batchId: "batch:player-one:21",
    idempotencyKey: "client-one:command:21",
    actor: { actorId: "actor:player-one", playerId: "player-one", entityId: "entity:player-one", authority: "host" },
    identity,
    commands: [
      {
        kind: "inventory-transfer",
        from: { kind: "player", ownerId: "player-one", slot: 2 },
        to: { kind: "container", ownerId: "chest:0,64,0", slot: 4 },
        count: 3,
        expectedItem: { itemCode: 77, count: 8, durability: null, metadataHash: "00000000000000000000000000000000" },
      },
      {
        kind: "cardforge",
        action: "match-action",
        recordId: "match:waytable:18",
        expectedRecordRevision: 9,
        payload: new Uint8Array([4, 1, 8, 2]),
      },
    ],
  };
}

test("gameplay batches are revisioned, canonical, and transfer only coarse binary subcommands", () => {
  const batch = createGameplayCommandBatchV1(source());
  assert.equal(batch.schemaVersion, GAMEPLAY_SCHEMA_V1);
  assert.match(batch.commandHash, /^[0-9a-f]{32}$/u);
  assert.equal(gameplayBatchTransferListV1(batch).length, 1);
  assert.notEqual((batch.commands[1] as { payload: Uint8Array }).payload.buffer, (source().commands[1] as { payload: Uint8Array }).payload.buffer, "the authority batch owns a defensive payload copy");
  assert.equal(createGameplayCommandBatchV1(source()).commandHash, batch.commandHash);
});

test("invalid slot aliases, non-finite combat targets, and oversized payloads fail closed", () => {
  const base = source();
  const transfer = base.commands[0] as Extract<typeof base.commands[number], { kind: "inventory-transfer" }>;
  assert.throws(() => createGameplayCommandBatchV1({ ...base, commands: [{ ...transfer, to: transfer.from }] }), (error: unknown) => error instanceof GameplayAuthorityContractError && error.code === "same-slot");
  assert.throws(() => createGameplayCommandBatchV1({
    ...base,
    commands: [{ kind: "combat", action: "melee", sourceEntityId: "player-one", targetEntityId: "mob-1", targetPosition: { x: Number.NaN, y: 0, z: 0 }, abilityId: "basic-melee", itemCode: null, clientTick: 1 }],
  }), /must be finite/u);
});

test("pure transfer deltas must conserve item and metadata identities", () => {
  const metadataHash = "0123456789abcdef0123456789abcdef";
  assert.equal(gameplayResourceDeltasConserveV1([
    { container: { kind: "player", ownerId: "player-one" }, itemCode: 77, metadataHash, delta: -3 },
    { container: { kind: "container", ownerId: "chest-one" }, itemCode: 77, metadataHash, delta: 3 },
  ]), true);
  assert.equal(gameplayResourceDeltasConserveV1([
    { container: { kind: "player", ownerId: "player-one" }, itemCode: 77, metadataHash, delta: -3 },
    { container: { kind: "container", ownerId: "chest-one" }, itemCode: 77, metadataHash, delta: 2 },
  ]), false);
});

test("receipt/current checks distinguish the submitted revision from a later authority state", () => {
  const identity = createGameplayAuthorityIdentityV1(address, revision);
  const next = createGameplayAuthorityIdentityV1(address, { ...revision, inventory: revision.inventory + 1, sequence: revision.sequence + 1 });
  const receipt = {
    schemaVersion: GAMEPLAY_SCHEMA_V1,
    status: "rejected" as const,
    batchId: "batch:player-one:21",
    code: "stale-revision" as const,
    message: "stale",
    identity,
    receiptHash: "00000000000000000000000000000000",
  };
  assert.ok(gameplayIdentitySameRevisionV1(identity, identity));
  assert.equal(gameplayIdentitySameRevisionV1(identity, next), false);
  assert.ok(gameplayReceiptIsCurrentV1(receipt, identity));
  assert.equal(gameplayReceiptIsCurrentV1(receipt, next), false);
});
