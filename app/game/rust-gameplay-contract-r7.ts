import { TypeScriptCanonicalHasher } from "./rust-kernel-shadow";
import {
  RUST_GAMEPLAY_MAX_SNAPSHOT_BYTES_R7_V1,
  inspectRustGameplaySnapshotEnvelopeR7V1,
} from "./rust-gameplay-snapshot-r7";

export const RUST_GAMEPLAY_BROWSER_PROTOCOL_R7_V1 = 1 as const;
export const RUST_GAMEPLAY_BROWSER_SCHEMA_R7_V1 = 1 as const;
export const RUST_GAMEPLAY_MAX_COMMANDS_R7_V1 = 256;
export const RUST_GAMEPLAY_MAX_COMMAND_PAYLOAD_BYTES_R7_V1 = 256 * 1_024;
export const RUST_GAMEPLAY_MAX_BATCH_PAYLOAD_BYTES_R7_V1 = 8 * 1_048_576;
export const RUST_GAMEPLAY_MAX_VIEW_RECORDS_R7_V1 = 4_096;
export const RUST_GAMEPLAY_MAX_VIEW_BYTES_R7_V1 = 4 * 1_048_576;

const HASH = /^[0-9a-f]{32}$/u;
const U64_MAX = (BigInt(1) << BigInt(64)) - BigInt(1);
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export const RUST_GAMEPLAY_VIEW_DOMAINS_R7 = Object.freeze([
  "inventory", "machines", "combat", "capture", "progression", "quests", "economy", "cardforge",
] as const);

export type RustGameplayViewDomainR7 = typeof RUST_GAMEPLAY_VIEW_DOMAINS_R7[number];
export type RustGameplayAuthorityDomainR7 = "inventory" | "machines" | "combat" | "progression" | "cardforge";

export type RustGameplayRevisionR7 = Readonly<{
  epoch: number;
  sequence: bigint;
  inventory: bigint;
  machines: bigint;
  combat: bigint;
  progression: bigint;
  cardforge: bigint;
}>;

export type RustGameplayAuthorityIdentityR7 = Readonly<{
  universe: string;
  location: string;
  revision: RustGameplayRevisionR7;
  stateHash: string;
  replayHash: string;
}>;

export type RustGameplayActorR7 = Readonly<{
  actorId: string;
  playerId: bigint | null;
  entityId: bigint | null;
  role: "host" | "guest" | "agent" | "system";
}>;

/**
 * One coarse, transferable Rust command. Domain-specific payloads are decoded
 * only by `blockwild-gameplay`; the browser cannot mutate their meaning.
 * Capture belongs to Combat, while quests/economy belong to Progression.
 */
export type RustGameplayOpaqueCommandR7 = Readonly<{
  commandId: string;
  domain: RustGameplayViewDomainR7;
  authorityDomain: RustGameplayAuthorityDomainR7;
  typeId: string;
  schema: number;
  payload: Uint8Array;
}>;

export type RustGameplayCommandBatchR7 = Readonly<{
  schema: typeof RUST_GAMEPLAY_BROWSER_SCHEMA_R7_V1;
  batchId: string;
  idempotencyKey: string;
  actor: RustGameplayActorR7;
  expected: RustGameplayAuthorityIdentityR7;
  commands: readonly RustGameplayOpaqueCommandR7[];
  commandHash: string;
}>;

export type RustGameplayCommandBatchSourceR7 = Omit<RustGameplayCommandBatchR7, "schema" | "commandHash" | "commands"> & Readonly<{
  commands: readonly Omit<RustGameplayOpaqueCommandR7, "authorityDomain">[];
}>;

export type RustGameplayViewQueryR7 = Readonly<{
  queryId: string;
  afterSequence: bigint | null;
  domains: readonly RustGameplayViewDomainR7[];
  owners: readonly string[];
  recordIds: readonly string[];
  cursor: string | null;
  maxRecords: number;
  maxBytes: number;
}>;

export type RustGameplayViewRecordR7 = Readonly<{
  domain: RustGameplayViewDomainR7;
  recordId: string;
  revision: bigint;
  typeId: string;
  schema: number;
  payload: Uint8Array;
}>;

export type RustGameplayViewPageR7 = Readonly<{
  schema: 1;
  queryId: string;
  mode: "snapshot" | "delta";
  baseSequence: bigint;
  identity: RustGameplayAuthorityIdentityR7;
  records: readonly RustGameplayViewRecordR7[];
  removed: readonly Readonly<{ domain: RustGameplayViewDomainR7; recordId: string; revision: bigint }>[];
  nextCursor: string | null;
  truncated: boolean;
  byteLength: number;
}>;

export type RustGameplayReceiptEventR7 = Readonly<{
  eventId: string;
  domain: RustGameplayViewDomainR7;
  recordId: string | null;
  typeId: string;
  schema: number;
  payload: Uint8Array;
}>;

export type RustGameplayCommandReceiptR7 =
  | Readonly<{
    status: "accepted";
    batchId: string;
    commandHash: string;
    before: RustGameplayAuthorityIdentityR7;
    after: RustGameplayAuthorityIdentityR7;
    touchedDomains: readonly RustGameplayAuthorityDomainR7[];
    events: readonly RustGameplayReceiptEventR7[];
    receiptHash: string;
  }>
  | Readonly<{
    status: "rejected";
    batchId: string;
    commandHash: string;
    identity: RustGameplayAuthorityIdentityR7;
    code: "wrong-world" | "stale-revision" | "duplicate" | "unauthorized" | "invalid-command" | "insufficient-resource" | "invalid-target" | "cooldown" | "rules-rejected" | "capacity" | "conflict";
    message: string;
  }>;

type RequestBase = Readonly<{
  protocolVersion: typeof RUST_GAMEPLAY_BROWSER_PROTOCOL_R7_V1;
  schemaVersion: typeof RUST_GAMEPLAY_BROWSER_SCHEMA_R7_V1;
  requestId: number;
  runtimeEpoch: number;
}>;

export type RustGameplayAuthorityRequestR7 =
  | (RequestBase & Readonly<{ type: "gameplay-initialize-r7-v1"; bytes: ArrayBuffer }>)
  | (RequestBase & Readonly<{ type: "gameplay-apply-r7-v1"; batch: RustGameplayCommandBatchR7 }>)
  | (RequestBase & Readonly<{ type: "gameplay-view-r7-v1"; query: RustGameplayViewQueryR7 }>)
  | (RequestBase & Readonly<{ type: "gameplay-export-snapshot-r7-v1"; expected: RustGameplayAuthorityIdentityR7 }>)
  | (RequestBase & Readonly<{ type: "gameplay-replace-snapshot-r7-v1"; expected: RustGameplayAuthorityIdentityR7; bytes: ArrayBuffer }>)
  | (RequestBase & Readonly<{ type: "gameplay-dispose-r7-v1" }>);

type ResponseBase = RequestBase;

export type RustGameplayAuthorityResponseR7 =
  | (ResponseBase & Readonly<{ type: "gameplay-ready-r7-v1"; identity: RustGameplayAuthorityIdentityR7 }>)
  | (ResponseBase & Readonly<{ type: "gameplay-receipt-r7-v1"; authority: RustGameplayAuthorityIdentityR7; receipt: RustGameplayCommandReceiptR7 }>)
  | (ResponseBase & Readonly<{ type: "gameplay-view-page-r7-v1"; page: RustGameplayViewPageR7 }>)
  | (ResponseBase & Readonly<{ type: "gameplay-snapshot-r7-v1"; identity: RustGameplayAuthorityIdentityR7; bytes: ArrayBuffer }>)
  | (ResponseBase & Readonly<{ type: "gameplay-snapshot-replaced-r7-v1"; previous: RustGameplayAuthorityIdentityR7; identity: RustGameplayAuthorityIdentityR7 }>)
  | (ResponseBase & Readonly<{ type: "gameplay-disposed-r7-v1" }>)
  | (ResponseBase & Readonly<{ type: "gameplay-error-r7-v1"; code: string; message: string; retriable: boolean }>);

export interface RustGameplayAuthorityTransportR7 {
  request(request: RustGameplayAuthorityRequestR7, transfer?: readonly ArrayBuffer[]): Promise<RustGameplayAuthorityResponseR7>;
  dispose(): void;
}

export interface RustGameplayAuthorityKernelR7 {
  handle(request: RustGameplayAuthorityRequestR7): Promise<RustGameplayAuthorityResponseR7>;
  dispose?(): Promise<void> | void;
}

export class RustGameplayContractErrorR7 extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "RustGameplayContractErrorR7";
  }
}

function fail(code: string, message: string): never { throw new RustGameplayContractErrorR7(code, message); }
function u32(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) fail("integer", `${label} is not a u32`);
  return value;
}
function u16(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 0xffff) fail("integer", `${label} is not a non-zero u16`);
  return value;
}
function u64(value: bigint, label: string) {
  if (typeof value !== "bigint" || value < BigInt(0) || value > U64_MAX) fail("integer", `${label} is not a u64`);
  return value;
}
function boundedText(value: string, label: string, maximum = 160) {
  if (typeof value !== "string" || value.length === 0 || [...value].some((character) => /[\u0000-\u001f\u007f]/u.test(character))) fail("text", `${label} is empty or contains control characters`);
  const bytes = encoder.encode(value);
  if (bytes.byteLength > maximum || decoder.decode(bytes) !== value) fail("text", `${label} exceeds ${maximum} UTF-8 bytes or contains an unpaired surrogate`);
  return value;
}
function canonicalHash(value: string, label: string) {
  if (!HASH.test(value)) fail("hash", `${label} is not a canonical 128-bit hash`);
  return value;
}
function ownedPayload(value: Uint8Array, label: string, maximum = RUST_GAMEPLAY_MAX_COMMAND_PAYLOAD_BYTES_R7_V1) {
  if (!(value instanceof Uint8Array) || value.byteLength > maximum) fail("payload", `${label} is not a bounded Uint8Array`);
  return Uint8Array.from(value);
}

function compareUtf8(left: string, right: string) {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.min(a.byteLength, b.byteLength);
  for (let index = 0; index < length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.byteLength - b.byteLength;
}

function authorityDomain(domain: RustGameplayViewDomainR7): RustGameplayAuthorityDomainR7 {
  if (domain === "capture") return "combat";
  if (domain === "quests" || domain === "economy") return "progression";
  return domain;
}

export function assertRustGameplayIdentityR7(value: RustGameplayAuthorityIdentityR7) {
  boundedText(value.universe, "identity.universe");
  boundedText(value.location, "identity.location");
  u32(value.revision.epoch, "revision.epoch");
  u64(value.revision.sequence, "revision.sequence");
  u64(value.revision.inventory, "revision.inventory");
  u64(value.revision.machines, "revision.machines");
  u64(value.revision.combat, "revision.combat");
  u64(value.revision.progression, "revision.progression");
  u64(value.revision.cardforge, "revision.cardforge");
  canonicalHash(value.stateHash, "identity.stateHash");
  canonicalHash(value.replayHash, "identity.replayHash");
  return value;
}

export function rustGameplayIdentityEqualsR7(left: RustGameplayAuthorityIdentityR7, right: RustGameplayAuthorityIdentityR7) {
  return left.universe === right.universe && left.location === right.location
    && left.stateHash === right.stateHash && left.replayHash === right.replayHash
    && left.revision.epoch === right.revision.epoch
    && left.revision.sequence === right.revision.sequence
    && left.revision.inventory === right.revision.inventory
    && left.revision.machines === right.revision.machines
    && left.revision.combat === right.revision.combat
    && left.revision.progression === right.revision.progression
    && left.revision.cardforge === right.revision.cardforge;
}

function writeCommand(hasher: TypeScriptCanonicalHasher, command: RustGameplayOpaqueCommandR7) {
  hasher.writeString(command.commandId).writeString(command.domain).writeString(command.authorityDomain)
    .writeString(command.typeId).writeU16(command.schema).writeBytes(command.payload);
}

export function createRustGameplayCommandBatchR7(source: RustGameplayCommandBatchSourceR7): RustGameplayCommandBatchR7 {
  boundedText(source.batchId, "batchId");
  boundedText(source.idempotencyKey, "idempotencyKey");
  boundedText(source.actor.actorId, "actor.actorId");
  if (source.actor.playerId !== null) u64(source.actor.playerId, "actor.playerId");
  if (source.actor.entityId !== null) u64(source.actor.entityId, "actor.entityId");
  if (!["host", "guest", "agent", "system"].includes(source.actor.role)) fail("role", "actor role is unknown");
  assertRustGameplayIdentityR7(source.expected);
  if (!Array.isArray(source.commands) || source.commands.length < 1 || source.commands.length > RUST_GAMEPLAY_MAX_COMMANDS_R7_V1) fail("commands", "gameplay batch requires 1..256 commands");
  const ids = new Set<string>();
  let bytes = 0;
  const commands = source.commands.map((command, index): RustGameplayOpaqueCommandR7 => {
    boundedText(command.commandId, `commands[${index}].commandId`);
    if (ids.has(command.commandId)) fail("duplicate", `duplicate gameplay command id ${command.commandId}`);
    ids.add(command.commandId);
    if (!RUST_GAMEPLAY_VIEW_DOMAINS_R7.includes(command.domain)) fail("domain", `commands[${index}] has an unknown domain`);
    boundedText(command.typeId, `commands[${index}].typeId`);
    u16(command.schema, `commands[${index}].schema`);
    const payload = ownedPayload(command.payload, `commands[${index}].payload`);
    bytes += payload.byteLength;
    return Object.freeze({ ...command, authorityDomain: authorityDomain(command.domain), payload });
  });
  if (bytes > RUST_GAMEPLAY_MAX_BATCH_PAYLOAD_BYTES_R7_V1) fail("capacity", "gameplay batch exceeds its 8 MiB browser transfer budget");
  const hasher = new TypeScriptCanonicalHasher("blockwild.gameplay.browser-command-batch.r7.v1").writeU32(commands.length);
  for (const command of commands) writeCommand(hasher, command);
  return Object.freeze({
    schema: 1 as const,
    batchId: source.batchId,
    idempotencyKey: source.idempotencyKey,
    actor: Object.freeze({ ...source.actor }),
    expected: source.expected,
    commands: Object.freeze(commands),
    commandHash: hasher.finishHex(),
  });
}

export function assertRustGameplayCommandBatchR7(batch: RustGameplayCommandBatchR7) {
  if (batch.schema !== 1) fail("schema", "gameplay command schema is incompatible");
  const rebuilt = createRustGameplayCommandBatchR7({
    batchId: batch.batchId,
    idempotencyKey: batch.idempotencyKey,
    actor: batch.actor,
    expected: batch.expected,
    commands: batch.commands,
  });
  if (rebuilt.commandHash !== batch.commandHash) fail("hash", "gameplay command hash does not match its payloads");
  return batch;
}

export function rustGameplayBatchTransferListR7(batch: RustGameplayCommandBatchR7) {
  assertRustGameplayCommandBatchR7(batch);
  return [...new Set(batch.commands.map((command) => command.payload.buffer as ArrayBuffer))];
}

function canonicalStrings(values: readonly string[], label: string, maximum: number) {
  if (!Array.isArray(values) || values.length > maximum) fail("capacity", `${label} exceeds ${maximum} entries`);
  const result = values.map((value, index) => boundedText(value, `${label}[${index}]`));
  const sorted = [...result].sort(compareUtf8);
  if (new Set(sorted).size !== sorted.length) fail("duplicate", `${label} contains duplicates`);
  return Object.freeze(sorted);
}

export function createRustGameplayViewQueryR7(source: RustGameplayViewQueryR7): RustGameplayViewQueryR7 {
  boundedText(source.queryId, "queryId");
  if (source.afterSequence !== null) u64(source.afterSequence, "afterSequence");
  const domains = [...source.domains];
  if (domains.length < 1 || domains.length > RUST_GAMEPLAY_VIEW_DOMAINS_R7.length || domains.some((domain) => !RUST_GAMEPLAY_VIEW_DOMAINS_R7.includes(domain))) fail("domain", "view domains are empty or invalid");
  const domainOrder = new Map(RUST_GAMEPLAY_VIEW_DOMAINS_R7.map((domain, index) => [domain, index]));
  domains.sort((left, right) => domainOrder.get(left)! - domainOrder.get(right)!);
  if (new Set(domains).size !== domains.length) fail("duplicate", "view domains contain duplicates");
  if (source.cursor !== null) boundedText(source.cursor, "cursor", 512);
  if (!Number.isSafeInteger(source.maxRecords) || source.maxRecords < 1 || source.maxRecords > RUST_GAMEPLAY_MAX_VIEW_RECORDS_R7_V1) fail("capacity", "view maxRecords is outside 1..4096");
  if (!Number.isSafeInteger(source.maxBytes) || source.maxBytes < 1 || source.maxBytes > RUST_GAMEPLAY_MAX_VIEW_BYTES_R7_V1) fail("capacity", "view maxBytes is outside 1..4 MiB");
  return Object.freeze({ ...source, domains: Object.freeze(domains), owners: canonicalStrings(source.owners, "owners", 256), recordIds: canonicalStrings(source.recordIds, "recordIds", 1_024) });
}

function compareRecordKey(left: Readonly<{ domain: RustGameplayViewDomainR7; recordId: string }>, right: Readonly<{ domain: RustGameplayViewDomainR7; recordId: string }>) {
  const domain = RUST_GAMEPLAY_VIEW_DOMAINS_R7.indexOf(left.domain) - RUST_GAMEPLAY_VIEW_DOMAINS_R7.indexOf(right.domain);
  return domain === 0 ? compareUtf8(left.recordId, right.recordId) : domain;
}

export function assertRustGameplayViewPageR7(page: RustGameplayViewPageR7, query: RustGameplayViewQueryR7) {
  if (page.schema !== 1 || page.queryId !== query.queryId) fail("view", "gameplay view page does not match its query");
  if (page.mode !== (query.afterSequence === null ? "snapshot" : "delta")) fail("view", "gameplay view page mode does not match its query");
  u64(page.baseSequence, "view.baseSequence");
  assertRustGameplayIdentityR7(page.identity);
  if (page.records.length > query.maxRecords || page.removed.length > query.maxRecords) fail("capacity", "gameplay view page exceeds its record budget");
  let measured = 0;
  let previous: RustGameplayViewRecordR7 | null = null;
  for (const [index, record] of page.records.entries()) {
    if (!RUST_GAMEPLAY_VIEW_DOMAINS_R7.includes(record.domain) || !query.domains.includes(record.domain)) fail("view", `record ${index} has an unrequested domain`);
    boundedText(record.recordId, `records[${index}].recordId`);
    boundedText(record.typeId, `records[${index}].typeId`);
    u64(record.revision, `records[${index}].revision`);
    u16(record.schema, `records[${index}].schema`);
    ownedPayload(record.payload, `records[${index}].payload`, RUST_GAMEPLAY_MAX_VIEW_BYTES_R7_V1);
    measured += record.payload.byteLength;
    if (previous) {
      const order = compareRecordKey(previous, record);
      if (order >= 0) fail(order === 0 ? "duplicate" : "order", "gameplay view records are not in strict canonical order");
    }
    previous = record;
  }
  let previousRemoval: RustGameplayViewPageR7["removed"][number] | null = null;
  for (const [index, removed] of page.removed.entries()) {
    if (!RUST_GAMEPLAY_VIEW_DOMAINS_R7.includes(removed.domain) || !query.domains.includes(removed.domain)) fail("view", `removed record ${index} has an unrequested domain`);
    boundedText(removed.recordId, `removed[${index}].recordId`);
    u64(removed.revision, `removed[${index}].revision`);
    if (previousRemoval) {
      const order = compareRecordKey(previousRemoval, removed);
      if (order >= 0) fail(order === 0 ? "duplicate" : "order", "gameplay view removals are not in strict canonical order");
    }
    previousRemoval = removed;
  }
  if (!Number.isSafeInteger(page.byteLength) || page.byteLength !== measured || measured > query.maxBytes) fail("capacity", "gameplay view byte count is invalid");
  if (page.nextCursor !== null) boundedText(page.nextCursor, "view.nextCursor", 512);
  if (page.truncated !== (page.nextCursor !== null)) fail("view", "truncated gameplay views require exactly one continuation cursor");
  return page;
}

function assertReceipt(receipt: RustGameplayCommandReceiptR7, authority: RustGameplayAuthorityIdentityR7, batch: RustGameplayCommandBatchR7) {
  if (receipt.batchId !== batch.batchId || receipt.commandHash !== batch.commandHash) fail("receipt", "gameplay receipt does not identify its command batch");
  if (receipt.status === "accepted") {
    assertRustGameplayIdentityR7(receipt.before);
    assertRustGameplayIdentityR7(receipt.after);
    canonicalHash(receipt.receiptHash, "receipt.receiptHash");
    const domainOrder = ["inventory", "machines", "combat", "progression", "cardforge"] as const;
    if (!receipt.touchedDomains.every((domain) => domainOrder.includes(domain))) fail("receipt", "accepted receipt has an unknown touched domain");
    if (new Set(receipt.touchedDomains).size !== receipt.touchedDomains.length) fail("duplicate", "accepted receipt repeats a touched domain");
    if (receipt.touchedDomains.some((domain, index) => index > 0 && domainOrder.indexOf(receipt.touchedDomains[index - 1]) >= domainOrder.indexOf(domain))) fail("order", "accepted receipt domains are not in canonical order");
    if (receipt.events.length > RUST_GAMEPLAY_MAX_VIEW_RECORDS_R7_V1) fail("capacity", "accepted receipt exceeds its event count bound");
    const eventIds = new Set<string>();
    let eventBytes = 0;
    for (const [index, event] of receipt.events.entries()) {
      boundedText(event.eventId, `events[${index}].eventId`);
      if (eventIds.has(event.eventId)) fail("duplicate", "accepted receipt repeats an event id");
      eventIds.add(event.eventId);
      if (!RUST_GAMEPLAY_VIEW_DOMAINS_R7.includes(event.domain)) fail("domain", `events[${index}] has an unknown domain`);
      if (event.recordId !== null) boundedText(event.recordId, `events[${index}].recordId`);
      boundedText(event.typeId, `events[${index}].typeId`);
      u16(event.schema, `events[${index}].schema`);
      ownedPayload(event.payload, `events[${index}].payload`);
      eventBytes += event.payload.byteLength;
    }
    if (eventBytes > RUST_GAMEPLAY_MAX_VIEW_BYTES_R7_V1) fail("capacity", "accepted receipt exceeds its event byte budget");
    if (rustGameplayIdentityEqualsR7(receipt.before, receipt.after)) fail("receipt", "accepted receipt did not advance authority");
  } else {
    assertRustGameplayIdentityR7(receipt.identity);
    if (!rustGameplayIdentityEqualsR7(receipt.identity, authority)) fail("stale", "rejected receipt reports a stale authority identity");
    boundedText(receipt.message, "receipt.message", 4_096);
  }
}

export function assertRustGameplayAuthorityRequestR7(request: RustGameplayAuthorityRequestR7) {
  if (request.protocolVersion !== 1 || request.schemaVersion !== 1) fail("protocol", "R7 gameplay request protocol is incompatible");
  u32(request.requestId, "requestId");
  u32(request.runtimeEpoch, "runtimeEpoch");
  if (request.type === "gameplay-initialize-r7-v1") inspectRustGameplaySnapshotEnvelopeR7V1(request.bytes);
  else if (request.type === "gameplay-apply-r7-v1") assertRustGameplayCommandBatchR7(request.batch);
  else if (request.type === "gameplay-view-r7-v1") createRustGameplayViewQueryR7(request.query);
  else if (request.type === "gameplay-export-snapshot-r7-v1") assertRustGameplayIdentityR7(request.expected);
  else if (request.type === "gameplay-replace-snapshot-r7-v1") { assertRustGameplayIdentityR7(request.expected); inspectRustGameplaySnapshotEnvelopeR7V1(request.bytes); }
  else if (request.type !== "gameplay-dispose-r7-v1") fail("request", "unknown R7 gameplay request");
  return request;
}

export function assertRustGameplayAuthorityResponseR7(response: RustGameplayAuthorityResponseR7, request: RustGameplayAuthorityRequestR7) {
  if (response.protocolVersion !== 1 || response.schemaVersion !== 1 || response.requestId !== request.requestId || response.runtimeEpoch !== request.runtimeEpoch) fail("stale", "R7 gameplay response identity does not match its request");
  if (response.type === "gameplay-error-r7-v1") {
    boundedText(response.code, "error.code");
    if (typeof response.message !== "string" || typeof response.retriable !== "boolean") fail("response", "R7 gameplay error is malformed");
    return response;
  }
  const expected = request.type === "gameplay-initialize-r7-v1" ? "gameplay-ready-r7-v1"
    : request.type === "gameplay-apply-r7-v1" ? "gameplay-receipt-r7-v1"
      : request.type === "gameplay-view-r7-v1" ? "gameplay-view-page-r7-v1"
        : request.type === "gameplay-export-snapshot-r7-v1" ? "gameplay-snapshot-r7-v1"
          : request.type === "gameplay-replace-snapshot-r7-v1" ? "gameplay-snapshot-replaced-r7-v1"
            : "gameplay-disposed-r7-v1";
  if (response.type !== expected) fail("response", `R7 gameplay response ${response.type} does not match ${request.type}`);
  if (response.type === "gameplay-ready-r7-v1") {
    const envelope = request.type === "gameplay-initialize-r7-v1" ? inspectRustGameplaySnapshotEnvelopeR7V1(request.bytes) : null;
    assertRustGameplayIdentityR7(response.identity);
    if (!envelope || response.identity.stateHash !== envelope.stateHash || response.identity.replayHash !== envelope.replayHash) fail("snapshot", "ready identity diverges from the validated snapshot envelope");
  } else if (response.type === "gameplay-receipt-r7-v1") {
    if (request.type !== "gameplay-apply-r7-v1") fail("response", "receipt response has no command batch");
    assertRustGameplayIdentityR7(response.authority);
    assertReceipt(response.receipt, response.authority, request.batch);
  } else if (response.type === "gameplay-view-page-r7-v1") {
    if (request.type !== "gameplay-view-r7-v1") fail("response", "view response has no query");
    assertRustGameplayViewPageR7(response.page, request.query);
  } else if (response.type === "gameplay-snapshot-r7-v1") {
    const envelope = inspectRustGameplaySnapshotEnvelopeR7V1(response.bytes);
    assertRustGameplayIdentityR7(response.identity);
    if (response.identity.stateHash !== envelope.stateHash || response.identity.replayHash !== envelope.replayHash) fail("snapshot", "export identity diverges from its snapshot envelope");
  } else if (response.type === "gameplay-snapshot-replaced-r7-v1") {
    if (request.type !== "gameplay-replace-snapshot-r7-v1") fail("response", "replacement response has no candidate");
    const envelope = inspectRustGameplaySnapshotEnvelopeR7V1(request.bytes);
    assertRustGameplayIdentityR7(response.previous);
    assertRustGameplayIdentityR7(response.identity);
    if (!rustGameplayIdentityEqualsR7(response.previous, request.expected) || response.identity.stateHash !== envelope.stateHash || response.identity.replayHash !== envelope.replayHash) fail("snapshot", "replacement acknowledgement diverges from the validated candidate");
  }
  return response;
}

export function rustGameplayRequestTransferListR7(request: RustGameplayAuthorityRequestR7) {
  if (request.type === "gameplay-initialize-r7-v1" || request.type === "gameplay-replace-snapshot-r7-v1") return [request.bytes] as const;
  if (request.type === "gameplay-apply-r7-v1") return rustGameplayBatchTransferListR7(request.batch);
  return [] as const;
}

export function rustGameplayResponseTransferListR7(response: RustGameplayAuthorityResponseR7) {
  if (response.type === "gameplay-snapshot-r7-v1") return [response.bytes] as const;
  if (response.type === "gameplay-view-page-r7-v1") return response.page.records.map((record) => record.payload.buffer as ArrayBuffer);
  if (response.type === "gameplay-receipt-r7-v1" && response.receipt.status === "accepted") return response.receipt.events.map((event) => event.payload.buffer as ArrayBuffer);
  return [] as readonly ArrayBuffer[];
}

export function assertRustGameplaySnapshotBufferR7(buffer: ArrayBuffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength > RUST_GAMEPLAY_MAX_SNAPSHOT_BYTES_R7_V1) fail("snapshot", "R7 gameplay snapshot buffer is invalid");
  return inspectRustGameplaySnapshotEnvelopeR7V1(buffer);
}
