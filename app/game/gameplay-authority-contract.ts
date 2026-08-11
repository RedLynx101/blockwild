import { TypeScriptCanonicalHasher } from "./rust-kernel-shadow";
import { sameWorldAddressV1, type WorldAddressV1 } from "./world-authority-contract";

/** Versioned, renderer-free command boundary for the R7 gameplay cutover. */
export const GAMEPLAY_PROTOCOL_V1 = 1 as const;
export const GAMEPLAY_SCHEMA_V1 = 1 as const;
export const GAMEPLAY_MAX_COMMANDS_V1 = 256;
export const GAMEPLAY_MAX_EVENT_BYTES_V1 = 256 * 1024;
export const GAMEPLAY_MAX_STACK_COUNT_V1 = 0x7fff_ffff;

const HASH_PATTERN = /^[0-9a-f]{32}$/u;
const EMPTY_HASH = "00000000000000000000000000000000";
const floatBuffer = new ArrayBuffer(8);
const floatView = new DataView(floatBuffer);

export type GameplayAuthorityRevisionV1 = Readonly<{
  epoch: number;
  sequence: number;
  inventory: number;
  machines: number;
  combat: number;
  progression: number;
  cardforge: number;
}>;

export type GameplayAuthorityIdentityV1 = Readonly<{
  address: WorldAddressV1;
  revision: GameplayAuthorityRevisionV1;
  stateHash: string;
}>;

export type GameplayActorV1 = Readonly<{
  actorId: string;
  playerId: string;
  entityId: string;
  authority: "host" | "guest" | "agent" | "system";
}>;

export type GameplayContainerRefV1 = Readonly<{
  kind: "player" | "equipment" | "container" | "machine" | "waygrid" | "cardforge-case";
  ownerId: string;
  slot: number;
}>;

export type GameplayItemStackV1 = Readonly<{
  itemCode: number;
  count: number;
  durability: number | null;
  metadataHash: string;
}>;

export type InventoryTransferCommandV1 = Readonly<{
  kind: "inventory-transfer";
  from: GameplayContainerRefV1;
  to: GameplayContainerRefV1;
  count: number;
  expectedItem: GameplayItemStackV1;
}>;

export type CraftCommandV1 = Readonly<{
  kind: "craft";
  recipeId: string;
  quantity: number;
  stationId: string | null;
  sourceContainerId: string;
  destinationContainerId: string;
}>;

export type MachineCommandV1 = Readonly<{
  kind: "machine";
  machineId: string;
  operation: "insert" | "extract" | "configure" | "activate" | "deactivate" | "claim-output";
  port: string;
  itemCode: number | null;
  amount: number;
  settingKey: string | null;
  settingValue: number | null;
}>;

export type CombatCommandV1 = Readonly<{
  kind: "combat";
  action: "melee" | "ranged" | "cast" | "use-item" | "capture" | "pacify" | "care" | "summon";
  sourceEntityId: string;
  targetEntityId: string | null;
  targetPosition: Readonly<{ x: number; y: number; z: number }> | null;
  abilityId: string;
  itemCode: number | null;
  clientTick: number;
}>;

export type ProgressionCommandV1 = Readonly<{
  kind: "progression";
  action: "unlock-perk" | "quest-choice" | "faction-choice" | "guild-action" | "trade" | "fast-travel" | "dialogue-choice";
  recordId: string;
  optionId: string;
  quantity: number;
  currencyCode: string | null;
}>;

export type CardforgeCommandV1 = Readonly<{
  kind: "cardforge";
  action: "open-pack" | "move-card" | "archive-duplicate" | "build-deck" | "start-match" | "match-action" | "claim-reward";
  recordId: string;
  expectedRecordRevision: number;
  /** Canonical binary subcommand validated by the Cardforge rules crate. */
  payload: Uint8Array;
}>;

export type GameplayCommandV1 =
  | InventoryTransferCommandV1
  | CraftCommandV1
  | MachineCommandV1
  | CombatCommandV1
  | ProgressionCommandV1
  | CardforgeCommandV1;

export type GameplayCommandBatchV1 = Readonly<{
  schemaVersion: typeof GAMEPLAY_SCHEMA_V1;
  batchId: string;
  idempotencyKey: string;
  actor: GameplayActorV1;
  identity: GameplayAuthorityIdentityV1;
  commands: readonly GameplayCommandV1[];
  commandHash: string;
}>;

export type GameplayCommandBatchV1Source = Omit<GameplayCommandBatchV1, "schemaVersion" | "commandHash">;

export type GameplayResourceDeltaV1 = Readonly<{
  container: Omit<GameplayContainerRefV1, "slot">;
  itemCode: number;
  metadataHash: string;
  delta: number;
}>;

export type GameplayStatDeltaV1 = Readonly<{
  entityId: string;
  stat: "health" | "hunger" | "mana" | "stamina" | "experience" | "currency" | "bond" | "research";
  delta: number;
}>;

export type GameplayEventV1 = Readonly<{
  sequence: number;
  domain: "inventory" | "machine" | "combat" | "progression" | "cardforge";
  code: string;
  subjectId: string;
  payload: Uint8Array;
}>;

export type GameplayRejectionCodeV1 =
  | "wrong-world"
  | "stale-revision"
  | "duplicate"
  | "unauthorized"
  | "invalid-command"
  | "insufficient-resource"
  | "invalid-target"
  | "cooldown"
  | "rules-rejected"
  | "capacity"
  | "conflict";

export type GameplayCommandReceiptV1 =
  | Readonly<{
    schemaVersion: typeof GAMEPLAY_SCHEMA_V1;
    status: "rejected";
    batchId: string;
    code: GameplayRejectionCodeV1;
    message: string;
    identity: GameplayAuthorityIdentityV1;
    receiptHash: string;
  }>
  | Readonly<{
    schemaVersion: typeof GAMEPLAY_SCHEMA_V1;
    status: "accepted";
    batchId: string;
    before: GameplayAuthorityIdentityV1;
    after: GameplayAuthorityIdentityV1;
    resourceDeltas: readonly GameplayResourceDeltaV1[];
    statDeltas: readonly GameplayStatDeltaV1[];
    events: readonly GameplayEventV1[];
    receiptHash: string;
  }>;

export class GameplayAuthorityContractError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "GameplayAuthorityContractError";
  }
}

function integer(value: number, minimum: number, maximum: number, label: string) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new GameplayAuthorityContractError("invalid-integer", `${label} must be an integer in ${minimum}..${maximum}`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function finite(value: number, minimum: number, maximum: number, label: string) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new GameplayAuthorityContractError("invalid-number", `${label} must be finite and in ${minimum}..${maximum}`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function label(value: string, name: string, maximum = 160) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum) {
    throw new GameplayAuthorityContractError("invalid-label", `${name} must be a non-empty string no longer than ${maximum} code units`);
  }
  return value;
}

function hash(value: string, name: string) {
  if (!HASH_PATTERN.test(value)) throw new GameplayAuthorityContractError("invalid-hash", `${name} must be a canonical 128-bit lowercase hash`);
  return value;
}

function writeFloat(hasher: TypeScriptCanonicalHasher, value: number) {
  floatView.setFloat64(0, Object.is(value, -0) ? 0 : value, true);
  hasher.writeBytes(new Uint8Array(floatBuffer));
}

function writeOptionalString(hasher: TypeScriptCanonicalHasher, value: string | null) {
  hasher.writeU16(value === null ? 0 : 1);
  if (value !== null) hasher.writeString(value);
}

function writeOptionalU32(hasher: TypeScriptCanonicalHasher, value: number | null) {
  hasher.writeU16(value === null ? 0 : 1);
  if (value !== null) hasher.writeU32(value);
}

function normalizeRevision(revision: GameplayAuthorityRevisionV1): GameplayAuthorityRevisionV1 {
  return Object.freeze({
    epoch: integer(revision.epoch, 0, Number.MAX_SAFE_INTEGER, "revision.epoch"),
    sequence: integer(revision.sequence, 0, Number.MAX_SAFE_INTEGER, "revision.sequence"),
    inventory: integer(revision.inventory, 0, Number.MAX_SAFE_INTEGER, "revision.inventory"),
    machines: integer(revision.machines, 0, Number.MAX_SAFE_INTEGER, "revision.machines"),
    combat: integer(revision.combat, 0, Number.MAX_SAFE_INTEGER, "revision.combat"),
    progression: integer(revision.progression, 0, Number.MAX_SAFE_INTEGER, "revision.progression"),
    cardforge: integer(revision.cardforge, 0, Number.MAX_SAFE_INTEGER, "revision.cardforge"),
  });
}

function writeIdentity(hasher: TypeScriptCanonicalHasher, identity: GameplayAuthorityIdentityV1) {
  hasher.writeString(identity.address.universeId).writeString(identity.address.locationId);
  for (const value of Object.values(identity.revision)) hasher.writeU64(value);
  hasher.writeString(identity.stateHash);
}

export function createGameplayAuthorityIdentityV1(address: WorldAddressV1, revision: GameplayAuthorityRevisionV1): GameplayAuthorityIdentityV1 {
  label(address.universeId, "address.universeId", 64);
  label(address.locationId, "address.locationId", 128);
  const normalizedRevision = normalizeRevision(revision);
  const withoutHash = Object.freeze({ address: Object.freeze({ ...address }), revision: normalizedRevision });
  const hasher = new TypeScriptCanonicalHasher("blockwild-gameplay-authority-v1");
  hasher.writeString(address.universeId).writeString(address.locationId);
  for (const value of Object.values(normalizedRevision)) hasher.writeU64(value);
  return Object.freeze({ ...withoutHash, stateHash: hasher.finishHex() });
}

function normalizeContainer(value: GameplayContainerRefV1, name: string): GameplayContainerRefV1 {
  if (!["player", "equipment", "container", "machine", "waygrid", "cardforge-case"].includes(value.kind)) {
    throw new GameplayAuthorityContractError("invalid-container", `${name}.kind is unknown`);
  }
  return Object.freeze({ kind: value.kind, ownerId: label(value.ownerId, `${name}.ownerId`), slot: integer(value.slot, 0, 0xffff, `${name}.slot`) });
}

function normalizeStack(value: GameplayItemStackV1, name: string): GameplayItemStackV1 {
  return Object.freeze({
    itemCode: integer(value.itemCode, 0, 0xffff_ffff, `${name}.itemCode`),
    count: integer(value.count, 1, GAMEPLAY_MAX_STACK_COUNT_V1, `${name}.count`),
    durability: value.durability === null ? null : finite(value.durability, 0, 1, `${name}.durability`),
    metadataHash: hash(value.metadataHash || EMPTY_HASH, `${name}.metadataHash`),
  });
}

function normalizeCommand(command: GameplayCommandV1, index: number): GameplayCommandV1 {
  const prefix = `commands[${index}]`;
  switch (command.kind) {
    case "inventory-transfer": {
      const from = normalizeContainer(command.from, `${prefix}.from`);
      const to = normalizeContainer(command.to, `${prefix}.to`);
      if (from.kind === to.kind && from.ownerId === to.ownerId && from.slot === to.slot) throw new GameplayAuthorityContractError("same-slot", "inventory transfer source and destination are identical");
      return Object.freeze({ ...command, from, to, count: integer(command.count, 1, GAMEPLAY_MAX_STACK_COUNT_V1, `${prefix}.count`), expectedItem: normalizeStack(command.expectedItem, `${prefix}.expectedItem`) });
    }
    case "craft":
      return Object.freeze({ ...command, recipeId: label(command.recipeId, `${prefix}.recipeId`), quantity: integer(command.quantity, 1, 65_535, `${prefix}.quantity`),
        stationId: command.stationId === null ? null : label(command.stationId, `${prefix}.stationId`), sourceContainerId: label(command.sourceContainerId, `${prefix}.sourceContainerId`), destinationContainerId: label(command.destinationContainerId, `${prefix}.destinationContainerId`) });
    case "machine":
      return Object.freeze({ ...command, machineId: label(command.machineId, `${prefix}.machineId`), port: label(command.port, `${prefix}.port`, 96),
        itemCode: command.itemCode === null ? null : integer(command.itemCode, 0, 0xffff_ffff, `${prefix}.itemCode`), amount: integer(command.amount, 0, GAMEPLAY_MAX_STACK_COUNT_V1, `${prefix}.amount`),
        settingKey: command.settingKey === null ? null : label(command.settingKey, `${prefix}.settingKey`, 96), settingValue: command.settingValue === null ? null : finite(command.settingValue, -1e15, 1e15, `${prefix}.settingValue`) });
    case "combat":
      return Object.freeze({ ...command, sourceEntityId: label(command.sourceEntityId, `${prefix}.sourceEntityId`), targetEntityId: command.targetEntityId === null ? null : label(command.targetEntityId, `${prefix}.targetEntityId`),
        targetPosition: command.targetPosition === null ? null : Object.freeze({ x: finite(command.targetPosition.x, -0x8000_0000, 0x7fff_ffff, `${prefix}.target.x`), y: finite(command.targetPosition.y, -0x8000_0000, 0x7fff_ffff, `${prefix}.target.y`), z: finite(command.targetPosition.z, -0x8000_0000, 0x7fff_ffff, `${prefix}.target.z`) }),
        abilityId: label(command.abilityId, `${prefix}.abilityId`), itemCode: command.itemCode === null ? null : integer(command.itemCode, 0, 0xffff_ffff, `${prefix}.itemCode`), clientTick: integer(command.clientTick, 0, Number.MAX_SAFE_INTEGER, `${prefix}.clientTick`) });
    case "progression":
      return Object.freeze({ ...command, recordId: label(command.recordId, `${prefix}.recordId`), optionId: label(command.optionId, `${prefix}.optionId`), quantity: integer(command.quantity, 0, GAMEPLAY_MAX_STACK_COUNT_V1, `${prefix}.quantity`), currencyCode: command.currencyCode === null ? null : label(command.currencyCode, `${prefix}.currencyCode`, 64) });
    case "cardforge":
      if (!(command.payload instanceof Uint8Array) || command.payload.byteLength > GAMEPLAY_MAX_EVENT_BYTES_V1) throw new GameplayAuthorityContractError("cardforge-payload", "Cardforge command payload is invalid or too large");
      return Object.freeze({ ...command, recordId: label(command.recordId, `${prefix}.recordId`), expectedRecordRevision: integer(command.expectedRecordRevision, 0, Number.MAX_SAFE_INTEGER, `${prefix}.expectedRecordRevision`), payload: Uint8Array.from(command.payload) });
    default: throw new GameplayAuthorityContractError("invalid-command", `unknown gameplay command ${(command as { kind?: unknown }).kind as string}`);
  }
}

function writeContainer(hasher: TypeScriptCanonicalHasher, container: GameplayContainerRefV1) {
  hasher.writeString(container.kind).writeString(container.ownerId).writeU16(container.slot);
}

function writeStack(hasher: TypeScriptCanonicalHasher, stack: GameplayItemStackV1) {
  hasher.writeU32(stack.itemCode).writeU32(stack.count);
  hasher.writeU16(stack.durability === null ? 0 : 1);
  if (stack.durability !== null) writeFloat(hasher, stack.durability);
  hasher.writeString(stack.metadataHash);
}

function writeCommand(hasher: TypeScriptCanonicalHasher, command: GameplayCommandV1) {
  hasher.writeString(command.kind);
  switch (command.kind) {
    case "inventory-transfer": writeContainer(hasher, command.from); writeContainer(hasher, command.to); hasher.writeU32(command.count); writeStack(hasher, command.expectedItem); break;
    case "craft": hasher.writeString(command.recipeId).writeU32(command.quantity); writeOptionalString(hasher, command.stationId); hasher.writeString(command.sourceContainerId).writeString(command.destinationContainerId); break;
    case "machine": hasher.writeString(command.machineId).writeString(command.operation).writeString(command.port); writeOptionalU32(hasher, command.itemCode); hasher.writeU32(command.amount); writeOptionalString(hasher, command.settingKey); hasher.writeU16(command.settingValue === null ? 0 : 1); if (command.settingValue !== null) writeFloat(hasher, command.settingValue); break;
    case "combat": hasher.writeString(command.action).writeString(command.sourceEntityId); writeOptionalString(hasher, command.targetEntityId); hasher.writeU16(command.targetPosition === null ? 0 : 1); if (command.targetPosition) { writeFloat(hasher, command.targetPosition.x); writeFloat(hasher, command.targetPosition.y); writeFloat(hasher, command.targetPosition.z); } hasher.writeString(command.abilityId); writeOptionalU32(hasher, command.itemCode); hasher.writeU64(command.clientTick); break;
    case "progression": hasher.writeString(command.action).writeString(command.recordId).writeString(command.optionId).writeU32(command.quantity); writeOptionalString(hasher, command.currencyCode); break;
    case "cardforge": hasher.writeString(command.action).writeString(command.recordId).writeU64(command.expectedRecordRevision).writeBytes(command.payload); break;
  }
}

export function createGameplayCommandBatchV1(source: GameplayCommandBatchV1Source): GameplayCommandBatchV1 {
  label(source.batchId, "batchId");
  label(source.idempotencyKey, "idempotencyKey");
  label(source.actor.actorId, "actor.actorId");
  label(source.actor.playerId, "actor.playerId");
  label(source.actor.entityId, "actor.entityId");
  if (!["host", "guest", "agent", "system"].includes(source.actor.authority)) throw new GameplayAuthorityContractError("invalid-authority", "actor authority is unknown");
  if (source.commands.length < 1 || source.commands.length > GAMEPLAY_MAX_COMMANDS_V1) throw new GameplayAuthorityContractError("command-count", `a gameplay batch requires 1..${GAMEPLAY_MAX_COMMANDS_V1} commands`);
  const identity = Object.freeze({ address: Object.freeze({ ...source.identity.address }), revision: normalizeRevision(source.identity.revision), stateHash: hash(source.identity.stateHash, "identity.stateHash") });
  const commands = Object.freeze(source.commands.map(normalizeCommand));
  const withoutHash = Object.freeze({ schemaVersion: GAMEPLAY_SCHEMA_V1, batchId: source.batchId, idempotencyKey: source.idempotencyKey, actor: Object.freeze({ ...source.actor }), identity, commands });
  const hasher = new TypeScriptCanonicalHasher("blockwild-gameplay-command-batch-v1");
  hasher.writeU16(withoutHash.schemaVersion).writeString(withoutHash.batchId).writeString(withoutHash.idempotencyKey)
    .writeString(withoutHash.actor.actorId).writeString(withoutHash.actor.playerId).writeString(withoutHash.actor.entityId).writeString(withoutHash.actor.authority);
  writeIdentity(hasher, identity); hasher.writeU32(commands.length); for (const command of commands) writeCommand(hasher, command);
  return Object.freeze({ ...withoutHash, commandHash: hasher.finishHex() });
}

export function gameplayBatchTransferListV1(batch: GameplayCommandBatchV1) {
  const result: ArrayBuffer[] = [];
  const seen = new Set<ArrayBuffer>();
  for (const command of batch.commands) if (command.kind === "cardforge") {
    if (!(command.payload.buffer instanceof ArrayBuffer)) throw new GameplayAuthorityContractError("shared-buffer", "V1 command payloads must be transferable ArrayBuffers");
    if (!seen.has(command.payload.buffer)) { seen.add(command.payload.buffer); result.push(command.payload.buffer); }
  }
  return result;
}

export function gameplayReceiptIsCurrentV1(receipt: GameplayCommandReceiptV1, current: GameplayAuthorityIdentityV1) {
  const identity = receipt.status === "accepted" ? receipt.after : receipt.identity;
  return sameWorldAddressV1(identity.address, current.address)
    && Object.entries(identity.revision).every(([key, value]) => value === current.revision[key as keyof GameplayAuthorityRevisionV1])
    && identity.stateHash === current.stateHash;
}

/** Resource conservation gate for commands that only move existing items. */
export function gameplayResourceDeltasConserveV1(deltas: readonly GameplayResourceDeltaV1[]) {
  const totals = new Map<string, number>();
  for (const delta of deltas) {
    integer(delta.itemCode, 0, 0xffff_ffff, "resource.itemCode");
    hash(delta.metadataHash, "resource.metadataHash");
    integer(delta.delta, -GAMEPLAY_MAX_STACK_COUNT_V1, GAMEPLAY_MAX_STACK_COUNT_V1, "resource.delta");
    const key = `${delta.itemCode}:${delta.metadataHash}`;
    totals.set(key, (totals.get(key) ?? 0) + delta.delta);
  }
  return [...totals.values()].every((value) => value === 0);
}

export function gameplayIdentitySameRevisionV1(left: GameplayAuthorityIdentityV1, right: GameplayAuthorityIdentityV1) {
  return sameWorldAddressV1(left.address, right.address)
    && Object.keys(left.revision).every((key) => left.revision[key as keyof GameplayAuthorityRevisionV1] === right.revision[key as keyof GameplayAuthorityRevisionV1]);
}
