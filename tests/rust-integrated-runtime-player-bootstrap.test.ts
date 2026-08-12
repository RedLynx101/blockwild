import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createRustIntegratedRuntimeDomainOperationV1,
  rustIntegratedRuntimeWireChecksumV1,
} from "../app/game/rust-integrated-runtime-codec.ts";
import type {
  RustIntegratedRuntimeAcceptedReceiptV1,
  RustIntegratedRuntimeCommandBatchV1,
  RustIntegratedRuntimeCommandReceiptV1,
  RustIntegratedRuntimeIdentityV1,
} from "../app/game/rust-integrated-runtime-contract.ts";
import {
  decodeRustIntegratedEntityCompatibilityImportV1,
  encodeRustIntegratedEntityCompatibilityImportV1,
  encodeRustIntegratedEntityEventBatchReceiptV1,
  RUST_INTEGRATED_ENTITY_EVENT_RECEIPT_TYPE_V1,
} from "../app/game/rust-integrated-runtime-entities.ts";
import {
  deriveRustIntegratedLocationIdV1,
  deriveRustIntegratedPlayerIdV1,
} from "../app/game/rust-integrated-runtime-identity.ts";
import {
  executeRustIntegratedPlayerBootstrapV1,
  planRustIntegratedPlayerBootstrapV1,
  RustIntegratedPlayerBootstrapErrorV1,
  type RustIntegratedPlayerBootstrapIntentV1,
  type RustIntegratedPlayerBootstrapObservationV1,
  type RustIntegratedPlayerBootstrapServiceV1,
} from "../app/game/rust-integrated-runtime-player-bootstrap.ts";
import {
  RUST_INTEGRATED_PLAYER_BIND_RECEIPT_TYPE_V2,
} from "../app/game/rust-integrated-runtime-player.ts";
import type { RustEntityCompatibilityRecordR6 } from "../app/game/rust-entity-authority-contract-r6.ts";

const ZERO_HASH = "00000000000000000000000000000000";
const ENTITY_ID = BigInt("18446744069414584321");
const FIXTURE = JSON.parse(readFileSync(
  new URL("./fixtures/rust-engine/integrated-runtime-v1/player-bootstrap-v1.json", import.meta.url),
  "utf8",
)) as Readonly<{
  bwi5Hex: string;
}>;
const IDENTITY_VECTORS = readFileSync(
  new URL("../engine/crates/blockwild-types/fixtures/id-derivation-v1.txt", import.meta.url),
  "utf8",
).split(/\r?\n/gu).filter((line) => line.length > 0 && !line.startsWith("#")).map((line) => {
  const [universeKey, playerKey, locationKey, playerId, locationId, ...trailing] = line.split("|");
  assert.equal(trailing.length, 0);
  assert.ok(universeKey && playerKey && locationKey && playerId && locationId);
  return Object.freeze({ universeKey, playerKey, locationKey, playerId, locationId });
});

function identity(hash = "1".repeat(32), entities = 5): RustIntegratedRuntimeIdentityV1 {
  return Object.freeze({
    universeId: "blockwild:primary",
    locationId: "surface:spawn",
    revision: Object.freeze({ epoch: 1, world: 2, entities, gameplay: 4, persistence: 5, network: 6, simulation: 7 }),
    tick: 8,
    stateHash: hash,
  });
}

function playerRecord(): RustEntityCompatibilityRecordR6 {
  return Object.freeze({
    schema: 1,
    externalEntityId: "player:primary",
    legacyNumericId: null,
    specimenId: "player:primary",
    kindKey: "player",
    class: "player",
    variantKey: null,
    name: "Noah",
    locationId: deriveRustIntegratedLocationIdV1("blockwild:primary", "surface:spawn"),
    position: Object.freeze({ x: 0, y: 72, z: 0 }),
    yaw: 0,
    velocity: Object.freeze({ x: 0, y: 0, z: 0 }),
    health: 20,
    maximumHealth: 20,
    ageTicks: BigInt(0),
    naturalSpawned: false,
    everLed: false,
    ownerId: null,
    tamed: false,
    bondPoints: 0,
    bondTier: "unbound",
    socialGroupId: null,
    factionId: null,
    settlementId: null,
    equipment: Object.freeze([]),
    research: Object.freeze([]),
    custom: Object.freeze([]),
  });
}

function intent(): RustIntegratedPlayerBootstrapIntentV1 {
  const { class: _class, locationId: _locationId, ...entity } = playerRecord();
  assert.equal(_class, "player");
  assert(_locationId > BigInt(0));
  return Object.freeze({
    universeKey: "blockwild:primary",
    playerKey: "player:noah",
    locationKey: "surface:spawn",
    commandActorId: "runtime:bootstrap",
    desiredEntityId: null,
    residency: "hot",
    entity,
    binding: Object.freeze({
      actorId: "player:noah",
      creativeMode: false,
      radius: 0.3,
      standingHeight: 1.8,
      crouchingHeight: 1.45,
      mass: 80,
      walkSpeed: 4.3,
      sprintSpeed: 6.1,
      creativeFlightSpeed: 10,
      maximumOxygenSeconds: 15,
    }),
  });
}

function absentObservation(): RustIntegratedPlayerBootstrapObservationV1 {
  return Object.freeze({
    identity: identity("1".repeat(32), 5),
    entityAuthority: Object.freeze({ revision: BigInt(5), nextSequence: BigInt(91), tick: BigInt(8) }),
    entity: null,
    runtimePlayer: null,
    worldViewBinding: null,
    custody: Object.freeze({ status: "absent" }),
  });
}

function matchingObservation(): RustIntegratedPlayerBootstrapObservationV1 {
  const desired = intent();
  const playerId = deriveRustIntegratedPlayerIdV1(desired.universeKey, desired.playerKey);
  const record = Object.freeze({ ...playerRecord(), position: Object.freeze({ x: 19, y: 70, z: -4 }), health: 13 });
  const binding = Object.freeze({ ...desired.binding, externalEntityId: record.externalEntityId, playerId });
  const inventory = Object.freeze({ kind: "player" as const, id: binding.actorId, ownerId: binding.actorId });
  const equipment = Object.freeze({ kind: "equipment" as const, id: `${binding.actorId}:equipment`, ownerId: binding.actorId });
  return Object.freeze({
    identity: identity("1".repeat(32), 6),
    entityAuthority: Object.freeze({ revision: BigInt(6), nextSequence: BigInt(92), tick: BigInt(8) }),
    entity: Object.freeze({ entityId: ENTITY_ID, entityRevision: BigInt(4), residency: "hot" as const, record }),
    runtimePlayer: Object.freeze({ entityId: ENTITY_ID, binding }),
    worldViewBinding: Object.freeze({
      playerId,
      revision: BigInt(3),
      actorId: binding.actorId,
      entityId: ENTITY_ID,
      inventoryContainer: inventory,
      equipmentContainer: equipment,
      selectedSlot: 4,
      backSlot: 7,
    }),
    custody: Object.freeze({
      status: "present" as const,
      inventoryContainer: inventory,
      inventoryRevision: BigInt(12),
      equipmentContainer: equipment,
      equipmentRevision: BigInt(2),
    }),
  });
}

function bytes(hex: string) {
  return Uint8Array.from(hex.match(/.{2}/gu) ?? [], (pair) => Number.parseInt(pair, 16));
}

function bindAck(requestHash: string, terminalHash: string) {
  return Uint8Array.of(
    0x42, 0x57, 0x42, 0x36, 1, 0,
    ...bytes(requestHash),
    ...bytes(terminalHash),
  );
}

class FakeBootstrapService implements RustIntegratedPlayerBootstrapServiceV1 {
  readonly batches: RustIntegratedRuntimeCommandBatchV1[] = [];
  mode: "accept" | "reject" | "reverse" = "accept";
  current: RustIntegratedRuntimeIdentityV1;

  constructor(current = identity()) {
    this.current = current;
  }

  identity() {
    return this.current;
  }

  async command(batch: RustIntegratedRuntimeCommandBatchV1): Promise<RustIntegratedRuntimeCommandReceiptV1> {
    this.batches.push(batch);
    if (this.mode === "reject") {
      return Object.freeze({
        status: "rejected" as const,
        commandId: batch.commandId,
        idempotencyKey: batch.idempotencyKey,
        commandHash: batch.commandHash,
        code: "fixture-rejected",
        message: "fixture rollback",
        current: this.current,
        receiptHash: ZERO_HASH,
      });
    }
    const after = identity("2".repeat(32), this.current.revision.entities + (batch.operations.some((value) => value.domain === "entities") ? 1 : 0));
    const receipts = batch.operations.map((operation) => {
      if (operation.domain === "entities") {
        const request = decodeRustIntegratedEntityCompatibilityImportV1(operation.payload);
        return createRustIntegratedRuntimeDomainOperationV1({
          domain: "entities",
          typeId: RUST_INTEGRATED_ENTITY_EVENT_RECEIPT_TYPE_V1,
          schema: 1,
          payload: encodeRustIntegratedEntityEventBatchReceiptV1({
            schema: 1,
            sequence: request.sequence,
            previousRevision: request.expectedRevision,
            revision: request.expectedRevision + BigInt(1),
            events: Object.freeze([Object.freeze({
              commandIndex: 0,
              entityId: request.desiredEntityId ?? ENTITY_ID,
              previousEntityRevision: BigInt(0),
              entityRevision: BigInt(1),
              kind: Object.freeze({ type: "spawned" as const, residency: request.residency }),
            })]),
          }),
        });
      }
      return createRustIntegratedRuntimeDomainOperationV1({
        domain: "simulation",
        typeId: RUST_INTEGRATED_PLAYER_BIND_RECEIPT_TYPE_V2,
        schema: 2,
        payload: bindAck(operation.payloadHash, after.stateHash),
      });
    });
    const ordered = this.mode === "reverse" ? receipts.reverse() : receipts;
    const receipt: RustIntegratedRuntimeAcceptedReceiptV1 = Object.freeze({
      status: "accepted",
      commandId: batch.commandId,
      idempotencyKey: batch.idempotencyKey,
      commandHash: batch.commandHash,
      before: this.current,
      after,
      domainReceipts: Object.freeze(ordered),
      receiptHash: rustIntegratedRuntimeWireChecksumV1(new Uint8Array()),
    });
    this.current = after;
    return receipt;
  }
}

test("stable player and location derivation preserves full u64 cross-language vectors", () => {
  for (const vector of IDENTITY_VECTORS) {
    assert.equal(deriveRustIntegratedPlayerIdV1(vector.universeKey, vector.playerKey), BigInt(vector.playerId));
    assert.equal(deriveRustIntegratedLocationIdV1(vector.universeKey, vector.locationKey), BigInt(vector.locationId));
  }
  assert(deriveRustIntegratedPlayerIdV1("blockwild:primary", "player:noah") > BigInt(Number.MAX_SAFE_INTEGER));
});

test("BWI5 freezes the exact envelope, round-trips, and rejects corruption", () => {
  const request = Object.freeze({
    sequence: BigInt(91),
    expectedRevision: BigInt(5),
    tick: BigInt(8),
    desiredEntityId: null,
    residency: "hot" as const,
    record: playerRecord(),
  });
  const encoded = encodeRustIntegratedEntityCompatibilityImportV1(request);
  assert.equal(Buffer.from(encoded).toString("hex"), FIXTURE.bwi5Hex);
  assert.deepEqual(decodeRustIntegratedEntityCompatibilityImportV1(encoded), request);
  const high = Object.freeze({
    ...request,
    sequence: (BigInt(1) << BigInt(64)) - BigInt(1),
    expectedRevision: (BigInt(1) << BigInt(64)) - BigInt(2),
    tick: (BigInt(1) << BigInt(64)) - BigInt(3),
    desiredEntityId: ENTITY_ID,
  });
  assert.deepEqual(decodeRustIntegratedEntityCompatibilityImportV1(
    encodeRustIntegratedEntityCompatibilityImportV1(high),
  ), high);
  const corrupt = Uint8Array.from(encoded);
  corrupt[12] ^= 0xff;
  assert.throws(() => decodeRustIntegratedEntityCompatibilityImportV1(corrupt), /checksum/u);
  assert.throws(() => decodeRustIntegratedEntityCompatibilityImportV1(Uint8Array.of(...encoded, 0)), /length/u);
});

test("pristine bootstrap atomically orders BWI5 before BWB6 and validates both receipts", async () => {
  const observation = absentObservation();
  const service = new FakeBootstrapService(observation.identity);
  const result = await executeRustIntegratedPlayerBootstrapV1(service, observation, intent());
  assert.equal(result.status, "spawned-and-bound");
  assert.equal(result.entityId, ENTITY_ID);
  assert.equal(service.batches.length, 1);
  assert.deepEqual(service.batches[0].operations.map((operation) => operation.domain), ["entities", "simulation"]);
  assert.equal(decodeRustIntegratedEntityCompatibilityImportV1(service.batches[0].operations[0].payload).sequence, BigInt(91));
});

test("matching restored state is a no-op even when simulation fields evolved", async () => {
  const observation = matchingObservation();
  const service = new FakeBootstrapService(observation.identity);
  const result = await executeRustIntegratedPlayerBootstrapV1(service, observation, intent());
  assert.equal(result.status, "already-matching");
  assert.equal(result.entityId, ENTITY_ID);
  assert.equal(service.batches.length, 0);
});

test("an exact unbound entity emits only BWB6", async () => {
  const source = matchingObservation();
  const observation = Object.freeze({
    ...source,
    runtimePlayer: null,
    worldViewBinding: null,
    custody: Object.freeze({ status: "absent" as const }),
  });
  const service = new FakeBootstrapService(observation.identity);
  const result = await executeRustIntegratedPlayerBootstrapV1(service, observation, intent());
  assert.equal(result.status, "bound-existing");
  assert.equal(result.entityId, ENTITY_ID);
  assert.deepEqual(service.batches[0].operations.map((operation) => operation.domain), ["simulation"]);
});

test("missing sequence, partial state, and contradictory restored identities fail before dispatch", async () => {
  const missingSequence = Object.freeze({
    ...absentObservation(),
    entityAuthority: Object.freeze({ revision: BigInt(5), nextSequence: null, tick: BigInt(8) }),
  });
  assert.throws(() => planRustIntegratedPlayerBootstrapV1(missingSequence, intent()), /explicit next R6/u);
  const contradictoryCursor = Object.freeze({
    ...absentObservation(),
    entityAuthority: Object.freeze({ revision: BigInt(4), nextSequence: BigInt(91), tick: BigInt(8) }),
  });
  assert.throws(() => planRustIntegratedPlayerBootstrapV1(contradictoryCursor, intent()), /contradicts/u);

  const matching = matchingObservation();
  const partial = Object.freeze({ ...matching, runtimePlayer: null });
  assert.throws(() => planRustIntegratedPlayerBootstrapV1(partial, intent()), /disagree/u);

  const changedActor = Object.freeze({
    ...matching,
    runtimePlayer: Object.freeze({
      ...matching.runtimePlayer!,
      binding: Object.freeze({ ...matching.runtimePlayer!.binding, actorId: "player:intruder" }),
    }),
  });
  const service = new FakeBootstrapService(changedActor.identity);
  await assert.rejects(
    executeRustIntegratedPlayerBootstrapV1(service, changedActor, intent()),
    RustIntegratedPlayerBootstrapErrorV1,
  );
  assert.equal(service.batches.length, 0);

  const stale = new FakeBootstrapService(identity("3".repeat(32), 5));
  await assert.rejects(executeRustIntegratedPlayerBootstrapV1(stale, absentObservation(), intent()), /identity moved/u);
  assert.equal(stale.batches.length, 0);
});

test("rejection is rollback-shaped and receipt reordering fails closed", async () => {
  const observation = absentObservation();
  const before = structuredClone(observation);
  const rejected = new FakeBootstrapService(observation.identity);
  rejected.mode = "reject";
  await assert.rejects(executeRustIntegratedPlayerBootstrapV1(rejected, observation, intent()), /fixture rollback/u);
  assert.deepEqual(observation, before);
  assert.equal(rejected.current.stateHash, observation.identity.stateHash);

  const reordered = new FakeBootstrapService(observation.identity);
  reordered.mode = "reverse";
  await assert.rejects(executeRustIntegratedPlayerBootstrapV1(reordered, observation, intent()), /receipt/u);
});
