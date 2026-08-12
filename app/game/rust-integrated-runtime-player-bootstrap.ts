import {
  createRustIntegratedRuntimeCommandBatchV1,
  createRustIntegratedRuntimeDomainOperationV1,
  rustIntegratedRuntimeWireChecksumV1,
} from "./rust-integrated-runtime-codec";
import {
  rustIntegratedRuntimeIdentityEqualsV1,
  type RustIntegratedRuntimeCommandBatchV1,
  type RustIntegratedRuntimeCommandReceiptV1,
  type RustIntegratedRuntimeIdentityV1,
} from "./rust-integrated-runtime-contract";
import {
  encodeRustIntegratedEntityCompatibilityImportV1,
  RUST_INTEGRATED_ENTITY_COMPATIBILITY_IMPORT_TYPE_V1,
  type RustIntegratedEntityCompatibilityImportV1,
  validateRustIntegratedEntityCompatibilityImportReceiptV1,
} from "./rust-integrated-runtime-entities";
import {
  deriveRustIntegratedLocationIdV1,
  deriveRustIntegratedPlayerIdV1,
} from "./rust-integrated-runtime-identity";
import {
  encodeRustIntegratedPlayerBindingV1,
  RUST_INTEGRATED_PLAYER_BIND_RECEIPT_TYPE_V2,
  RUST_INTEGRATED_PLAYER_BIND_TYPE_V2,
  type RustIntegratedPlayerBindingV1,
} from "./rust-integrated-runtime-player";
import type {
  RustEntityCompatibilityRecordR6,
  RustEntityResidencyR6,
} from "./rust-entity-authority-contract-r6";

const BWB6_ACK_MAGIC = Uint8Array.of(0x42, 0x57, 0x42, 0x36);
const BWB6_ACK_BYTES = 38;
const PLAYER_INVENTORY_SLOTS_V1 = 9;
const PLAYER_BACK_SLOT_V1 = 7;
const U64_MAX = (BigInt(1) << BigInt(64)) - BigInt(1);
const textEncoder = new TextEncoder();

export type RustIntegratedContainerKeyV1 = Readonly<{
  kind: "player" | "equipment";
  id: string;
  ownerId: string;
}>;

export type RustIntegratedPlayerInventoryBindingAttestationV1 = Readonly<{
  playerId: bigint;
  revision: bigint;
  actorId: string;
  entityId: bigint;
  inventoryContainer: RustIntegratedContainerKeyV1;
  equipmentContainer: RustIntegratedContainerKeyV1;
  selectedSlot: number;
  backSlot: number | null;
}>;

export type RustIntegratedPlayerCustodyAttestationV1 =
  | Readonly<{ status: "absent" }>
  | Readonly<{
    status: "present";
    inventoryContainer: RustIntegratedContainerKeyV1;
    inventoryRevision: bigint;
    equipmentContainer: RustIntegratedContainerKeyV1;
    equipmentRevision: bigint;
  }>;

export type RustIntegratedPlayerBootstrapObservationV1 = Readonly<{
  /** Exact identity that the extraction/status record was produced from. */
  identity: RustIntegratedRuntimeIdentityV1;
  /** Exact R6 authority cursor; nextSequence must be supplied by Rust when a spawn is needed. */
  entityAuthority: Readonly<{
    revision: bigint;
    nextSequence: bigint | null;
    tick: bigint;
  }>;
  entity: Readonly<{
    entityId: bigint;
    entityRevision: bigint;
    residency: RustEntityResidencyR6;
    record: RustEntityCompatibilityRecordR6;
  }> | null;
  runtimePlayer: Readonly<{
    entityId: bigint;
    binding: RustIntegratedPlayerBindingV1;
  }> | null;
  worldViewBinding: RustIntegratedPlayerInventoryBindingAttestationV1 | null;
  custody: RustIntegratedPlayerCustodyAttestationV1;
}>;

export type RustIntegratedPlayerBootstrapIntentV1 = Readonly<{
  universeKey: string;
  playerKey: string;
  locationKey: string;
  commandActorId: string;
  desiredEntityId: bigint | null;
  residency: RustEntityResidencyR6;
  entity: Omit<RustEntityCompatibilityRecordR6, "class" | "locationId">;
  binding: Omit<RustIntegratedPlayerBindingV1, "externalEntityId" | "playerId">;
}>;

export type RustIntegratedPlayerBootstrapPlanV1 =
  | Readonly<{
    status: "already-matching";
    entityId: bigint;
    expected: RustIntegratedRuntimeIdentityV1;
    batch: null;
    entityImport: null;
  }>
  | Readonly<{
    status: "bind-existing";
    entityId: bigint;
    expected: RustIntegratedRuntimeIdentityV1;
    batch: RustIntegratedRuntimeCommandBatchV1;
    entityImport: null;
  }>
  | Readonly<{
    status: "spawn-and-bind";
    entityId: bigint | null;
    expected: RustIntegratedRuntimeIdentityV1;
    batch: RustIntegratedRuntimeCommandBatchV1;
    entityImport: RustIntegratedEntityCompatibilityImportV1;
  }>;

export type RustIntegratedPlayerBootstrapResultV1 = Readonly<{
  status: "already-matching" | "bound-existing" | "spawned-and-bound";
  entityId: bigint;
  identity: RustIntegratedRuntimeIdentityV1;
  receipt: RustIntegratedRuntimeCommandReceiptV1 | null;
}>;

export interface RustIntegratedPlayerBootstrapServiceV1 {
  identity(): RustIntegratedRuntimeIdentityV1;
  command(batch: RustIntegratedRuntimeCommandBatchV1): Promise<RustIntegratedRuntimeCommandReceiptV1>;
}

export class RustIntegratedPlayerBootstrapErrorV1 extends Error {
  readonly name = "RustIntegratedPlayerBootstrapErrorV1";

  constructor(readonly code: string, message: string) {
    super(message);
  }
}

function fail(code: string, message: string): never {
  throw new RustIntegratedPlayerBootstrapErrorV1(code, message);
}

function bytesEqual(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function hexBytes(value: string, label: string) {
  if (!/^[0-9a-f]{32}$/u.test(value)) fail("bootstrap-hash", `${label} is not an exact native hash`);
  return Uint8Array.from(value.match(/.{2}/gu) ?? [], (pair) => Number.parseInt(pair, 16));
}

function visibleId(value: string, label: string, maximumBytes = 160) {
  if (typeof value !== "string"
    || value.length === 0
    || textEncoder.encode(value).byteLength > maximumBytes
    || /[\u0000-\u001f\u007f-\u009f]/u.test(value)
    || /[\ud800-\udfff]/u.test(value)) {
    fail("bootstrap-identity", `${label} is not a bounded, visible UTF-8 identity`);
  }
  return value;
}

function u64(value: bigint, label: string, allowZero = true) {
  if (typeof value !== "bigint" || value < BigInt(allowZero ? 0 : 1) || value > U64_MAX) {
    fail("bootstrap-u64", `${label} is outside its authoritative u64 range`);
  }
  return value;
}

function sameContainer(left: RustIntegratedContainerKeyV1, right: RustIntegratedContainerKeyV1) {
  return left.kind === right.kind && left.id === right.id && left.ownerId === right.ownerId;
}

function expectedContainers(actorId: string) {
  return Object.freeze({
    inventory: Object.freeze({ kind: "player" as const, id: actorId, ownerId: actorId }),
    equipment: Object.freeze({ kind: "equipment" as const, id: `${actorId}:equipment`, ownerId: actorId }),
  });
}

function samePlayerEntityIdentity(left: RustEntityCompatibilityRecordR6, right: RustEntityCompatibilityRecordR6) {
  // Position, vitals, age and other simulation fields legitimately evolve after
  // restore. These authored identity fields must not. Runtime BWB6 additionally
  // resolves the exact external id and requires the authoritative player class.
  return left.schema === right.schema
    && left.externalEntityId === right.externalEntityId
    && left.legacyNumericId === right.legacyNumericId
    && left.specimenId === right.specimenId
    && left.kindKey === right.kindKey
    && left.class === "player"
    && left.locationId === right.locationId;
}

function normalizedIntent(intent: RustIntegratedPlayerBootstrapIntentV1) {
  visibleId(intent.commandActorId, "bootstrap command actor");
  // Gameplay container ids are capped at 160 bytes and equipment appends ten.
  visibleId(intent.binding.actorId, "player actor", 150);
  if (intent.residency !== "hot") fail("bootstrap-residency", "the authoritative player entity must be resident and hot");
  if (intent.desiredEntityId !== null) u64(intent.desiredEntityId, "desired player entity id", false);
  const playerId = deriveRustIntegratedPlayerIdV1(intent.universeKey, intent.playerKey);
  const locationId = deriveRustIntegratedLocationIdV1(intent.universeKey, intent.locationKey);
  const record = Object.freeze({ ...intent.entity, class: "player" as const, locationId });
  const binding = Object.freeze({
    ...intent.binding,
    externalEntityId: record.externalEntityId,
    playerId,
  });
  // Existing native encoders are also the canonical shape validators.
  encodeRustIntegratedPlayerBindingV1(binding);
  encodeRustIntegratedEntityCompatibilityImportV1({
    sequence: BigInt(0), expectedRevision: BigInt(0), tick: BigInt(0), desiredEntityId: intent.desiredEntityId,
    residency: intent.residency, record,
  });
  return Object.freeze({ playerId, locationId, record, binding });
}

function validateCustody(
  value: RustIntegratedPlayerCustodyAttestationV1,
  actorId: string,
  expectedPresent: boolean,
) {
  if (!expectedPresent) {
    if (value.status !== "absent") fail("bootstrap-partial", "player custody exists without a complete authoritative binding");
    return;
  }
  if (value.status !== "present") fail("bootstrap-partial", "authoritative player binding is missing its gameplay custody");
  const expected = expectedContainers(actorId);
  if (!sameContainer(value.inventoryContainer, expected.inventory)
    || !sameContainer(value.equipmentContainer, expected.equipment)
  ) {
    fail("bootstrap-mismatch", "player custody does not match the native BWB6 inventory layout");
  }
  u64(value.inventoryRevision, "player inventory container revision");
  u64(value.equipmentRevision, "player equipment container revision");
}

function validateMatchingBindings(
  observation: RustIntegratedPlayerBootstrapObservationV1,
  recordEntityId: bigint,
  binding: RustIntegratedPlayerBindingV1,
) {
  const runtime = observation.runtimePlayer;
  const worldView = observation.worldViewBinding;
  if (!runtime || !worldView) fail("bootstrap-partial", "player binding attestations are only partially present");
  if (runtime.entityId !== recordEntityId
    || !bytesEqual(encodeRustIntegratedPlayerBindingV1(runtime.binding), encodeRustIntegratedPlayerBindingV1(binding))) {
    fail("bootstrap-mismatch", "restored runtime player binding contradicts the requested player");
  }
  const expected = expectedContainers(binding.actorId);
  if (worldView.playerId !== binding.playerId
    || worldView.actorId !== binding.actorId
    || worldView.entityId !== recordEntityId
    || !sameContainer(worldView.inventoryContainer, expected.inventory)
    || !sameContainer(worldView.equipmentContainer, expected.equipment)
    || !Number.isInteger(worldView.selectedSlot)
    || worldView.selectedSlot < 0
    || worldView.selectedSlot >= PLAYER_INVENTORY_SLOTS_V1
    || worldView.backSlot !== PLAYER_BACK_SLOT_V1) {
    fail("bootstrap-mismatch", "restored world-view inventory binding contradicts the requested player");
  }
  u64(worldView.revision, "world-view player binding revision");
  validateCustody(observation.custody, binding.actorId, true);
}

function bindingOperation(binding: RustIntegratedPlayerBindingV1) {
  return createRustIntegratedRuntimeDomainOperationV1({
    domain: "simulation",
    typeId: RUST_INTEGRATED_PLAYER_BIND_TYPE_V2,
    schema: 2,
    payload: encodeRustIntegratedPlayerBindingV1(binding),
  });
}

function batchFor(
  expected: RustIntegratedRuntimeIdentityV1,
  commandActorId: string,
  operations: RustIntegratedRuntimeCommandBatchV1["operations"],
) {
  const operationFingerprint = operations.map((operation) => operation.payloadHash).join("");
  const commandIdentity = [
    expected.universeId,
    expected.locationId,
    expected.stateHash,
    String(expected.tick),
    operationFingerprint,
  ].join("\u0000");
  const key = `player-bootstrap:${rustIntegratedRuntimeWireChecksumV1(textEncoder.encode(commandIdentity))}`;
  return createRustIntegratedRuntimeCommandBatchV1({
    commandId: key,
    idempotencyKey: key,
    actorId: commandActorId,
    expected,
    operations,
  });
}

/**
 * Produces an atomic BWRQ bootstrap only from a complete authoritative status.
 * It never guesses an R6 command sequence and never emits a blind restored-state rebind.
 */
export function planRustIntegratedPlayerBootstrapV1(
  observation: RustIntegratedPlayerBootstrapObservationV1,
  intent: RustIntegratedPlayerBootstrapIntentV1,
): RustIntegratedPlayerBootstrapPlanV1 {
  const desired = normalizedIntent(intent);
  u64(observation.entityAuthority.revision, "entity authority revision");
  u64(observation.entityAuthority.tick, "entity authority tick");
  if (observation.entityAuthority.revision !== BigInt(observation.identity.revision.entities)
    || observation.entityAuthority.tick !== BigInt(observation.identity.tick)) {
    fail("bootstrap-status", "entity authority cursor contradicts the integrated runtime identity");
  }
  if (observation.entityAuthority.nextSequence !== null) {
    u64(observation.entityAuthority.nextSequence, "next entity command sequence");
  }
  const hasRuntimeBinding = observation.runtimePlayer !== null;
  const hasWorldViewBinding = observation.worldViewBinding !== null;
  if (hasRuntimeBinding !== hasWorldViewBinding) {
    fail("bootstrap-partial", "runtime and world-view player binding attestations disagree");
  }

  if (observation.entity === null) {
    if (hasRuntimeBinding || observation.custody.status !== "absent") {
      fail("bootstrap-partial", "player binding or custody exists without its authoritative entity");
    }
    const sequence = observation.entityAuthority.nextSequence;
    if (sequence === null) fail("bootstrap-sequence", "spawn requires an explicit next R6 entity command sequence");
    const entityImport = Object.freeze({
      sequence,
      expectedRevision: observation.entityAuthority.revision,
      tick: observation.entityAuthority.tick,
      desiredEntityId: intent.desiredEntityId,
      residency: intent.residency,
      record: desired.record,
    });
    const operations = Object.freeze([
      createRustIntegratedRuntimeDomainOperationV1({
        domain: "entities",
        typeId: RUST_INTEGRATED_ENTITY_COMPATIBILITY_IMPORT_TYPE_V1,
        schema: 1,
        payload: encodeRustIntegratedEntityCompatibilityImportV1(entityImport),
      }),
      bindingOperation(desired.binding),
    ]);
    return Object.freeze({
      status: "spawn-and-bind",
      entityId: intent.desiredEntityId,
      expected: observation.identity,
      batch: batchFor(observation.identity, intent.commandActorId, operations),
      entityImport,
    });
  }

  const entity = observation.entity;
  u64(entity.entityId, "attested player entity id", false);
  u64(entity.entityRevision, "attested player entity revision");
  if (entity.residency !== "hot"
    || (intent.desiredEntityId !== null && entity.entityId !== intent.desiredEntityId)
    || !samePlayerEntityIdentity(entity.record, desired.record)) {
    fail("bootstrap-mismatch", "authoritative entity contradicts the requested player record");
  }

  if (!hasRuntimeBinding) {
    validateCustody(observation.custody, desired.binding.actorId, false);
    const operation = bindingOperation(desired.binding);
    return Object.freeze({
      status: "bind-existing",
      entityId: entity.entityId,
      expected: observation.identity,
      batch: batchFor(observation.identity, intent.commandActorId, Object.freeze([operation])),
      entityImport: null,
    });
  }

  validateMatchingBindings(observation, entity.entityId, desired.binding);
  return Object.freeze({
    status: "already-matching",
    entityId: entity.entityId,
    expected: observation.identity,
    batch: null,
    entityImport: null,
  });
}

function validateBindReceipt(
  receipt: Extract<RustIntegratedRuntimeCommandReceiptV1, { status: "accepted" }>,
  operationIndex: number,
  request: RustIntegratedRuntimeCommandBatchV1["operations"][number],
) {
  const operation = receipt.domainReceipts[operationIndex];
  if (!operation
    || operation.domain !== "simulation"
    || operation.typeId !== RUST_INTEGRATED_PLAYER_BIND_RECEIPT_TYPE_V2
    || operation.schema !== 2
    || operation.payloadHash !== rustIntegratedRuntimeWireChecksumV1(operation.payload)
    || operation.payload.byteLength !== BWB6_ACK_BYTES
    || !BWB6_ACK_MAGIC.every((byte, index) => operation.payload[index] === byte)) {
    fail("bootstrap-receipt", "BWB6 returned the wrong ordered native receipt");
  }
  const view = new DataView(operation.payload.buffer, operation.payload.byteOffset, operation.payload.byteLength);
  if (view.getUint16(4, true) !== 1
    || !bytesEqual(operation.payload.subarray(6, 22), hexBytes(request.payloadHash, "BWB6 request payload hash"))
    || !bytesEqual(operation.payload.subarray(22, 38), hexBytes(receipt.after.stateHash, "BWB6 terminal state hash"))) {
    fail("bootstrap-receipt", "BWB6 acknowledgement does not attest the request and terminal runtime state");
  }
}

/** Executes one planned batch and requires exact, ordered BWA6 then BWB6 receipts. */
export async function executeRustIntegratedPlayerBootstrapV1(
  service: RustIntegratedPlayerBootstrapServiceV1,
  observation: RustIntegratedPlayerBootstrapObservationV1,
  intent: RustIntegratedPlayerBootstrapIntentV1,
): Promise<RustIntegratedPlayerBootstrapResultV1> {
  const plan = planRustIntegratedPlayerBootstrapV1(observation, intent);
  if (!rustIntegratedRuntimeIdentityEqualsV1(service.identity(), observation.identity)) {
    fail("bootstrap-stale", "runtime identity moved after the bootstrap status was observed");
  }
  if (plan.status === "already-matching") {
    return Object.freeze({ status: "already-matching", entityId: plan.entityId, identity: observation.identity, receipt: null });
  }
  const receipt = await service.command(plan.batch);
  if (receipt.commandId !== plan.batch.commandId
    || receipt.idempotencyKey !== plan.batch.idempotencyKey
    || receipt.commandHash !== plan.batch.commandHash) {
    fail("bootstrap-receipt", "bootstrap receipt does not identify the exact BWRQ command");
  }
  if (receipt.status === "rejected") {
    if (!rustIntegratedRuntimeIdentityEqualsV1(receipt.current, plan.expected)) {
      fail("bootstrap-receipt", "rejected bootstrap receipt moved the authoritative runtime identity");
    }
    if (!rustIntegratedRuntimeIdentityEqualsV1(service.identity(), receipt.current)) {
      fail("bootstrap-receipt", "runtime identity disagrees with the rejected bootstrap receipt");
    }
    fail(receipt.code, receipt.message);
  }
  if (!rustIntegratedRuntimeIdentityEqualsV1(receipt.before, plan.expected)
    || receipt.domainReceipts.length !== plan.batch.operations.length) {
    fail("bootstrap-receipt", "accepted bootstrap receipt does not attest the expected atomic operation count");
  }
  if (!rustIntegratedRuntimeIdentityEqualsV1(service.identity(), receipt.after)) {
    fail("bootstrap-receipt", "runtime identity disagrees with the accepted bootstrap receipt");
  }
  if (plan.status === "spawn-and-bind") {
    const spawned = validateRustIntegratedEntityCompatibilityImportReceiptV1(
      receipt.domainReceipts[0],
      plan.entityImport,
    );
    validateBindReceipt(receipt, 1, plan.batch.operations[1]);
    return Object.freeze({ status: "spawned-and-bound", entityId: spawned.entityId, identity: receipt.after, receipt });
  }
  validateBindReceipt(receipt, 0, plan.batch.operations[0]);
  return Object.freeze({ status: "bound-existing", entityId: plan.entityId, identity: receipt.after, receipt });
}
