import {
  RUST_INTEGRATED_RUNTIME_MAX_DOMAIN_PAYLOAD_BYTES,
  type RustIntegratedRuntimeDomainOperationV1,
} from "./rust-integrated-runtime-contract";
import { rustIntegratedRuntimeWireChecksumV1 } from "./rust-integrated-runtime-codec";
import {
  type RustEntityCompatibilityRecordR6,
  type RustEntityEventBatchR6,
  type RustEntityEventKindR6,
  type RustEntityResidencyR6,
} from "./rust-entity-authority-contract-r6";
import {
  decodeRustEntityCompatibilityRecordR6V1,
  encodeRustEntityCompatibilityRecordR6V1,
} from "./rust-entity-authority-codec-r6";

export const RUST_INTEGRATED_ENTITY_COMPATIBILITY_IMPORT_TYPE_V1 = "blockwild.entities.compatibility-import.r6.v1";
export const RUST_INTEGRATED_ENTITY_EVENT_RECEIPT_TYPE_V1 = "blockwild.entities.event-batch.r6.v1";

const BWI5_MAGIC = Uint8Array.of(0x42, 0x57, 0x49, 0x35);
const BWA6_MAGIC = Uint8Array.of(0x42, 0x57, 0x41, 0x36);
const DOMAIN_HEADER_BYTES_V1 = 28;
const DOMAIN_PROTOCOL_V1 = 1;
const DOMAIN_SCHEMA_V1 = 1;
const MAX_ENTITY_EVENTS_V1 = 256;
const U64_MAX = (BigInt(1) << BigInt(64)) - BigInt(1);
const U32_MAX = 0xffff_ffff;

export type RustIntegratedEntityCompatibilityImportV1 = Readonly<{
  sequence: bigint;
  expectedRevision: bigint;
  tick: bigint;
  desiredEntityId: bigint | null;
  residency: RustEntityResidencyR6;
  record: RustEntityCompatibilityRecordR6;
}>;

export class RustIntegratedEntityWireErrorV1 extends Error {
  readonly name = "RustIntegratedEntityWireErrorV1";

  constructor(readonly code: string, message: string) {
    super(message);
  }
}

function fail(code: string, message: string): never {
  throw new RustIntegratedEntityWireErrorV1(code, message);
}

function unsigned64(value: bigint, label: string) {
  if (typeof value !== "bigint" || value < BigInt(0) || value > U64_MAX) {
    fail("entity-u64", `${label} is outside the u64 range`);
  }
  return value;
}

function entityId(value: bigint, label: string) {
  const checked = unsigned64(value, label);
  if (checked === BigInt(0)) fail("entity-id", `${label} uses the reserved zero identity`);
  return checked;
}

function checksumBytes(value: Uint8Array) {
  const checksum = rustIntegratedRuntimeWireChecksumV1(value);
  return Uint8Array.from({ length: 16 }, (_, index) => Number.parseInt(checksum.slice(index * 2, index * 2 + 2), 16));
}

function bytesEqual(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function wrapDomainPacket(magic: Uint8Array, body: Uint8Array) {
  if (body.byteLength > RUST_INTEGRATED_RUNTIME_MAX_DOMAIN_PAYLOAD_BYTES - DOMAIN_HEADER_BYTES_V1) {
    fail("domain-size", "native domain body exceeds its byte budget");
  }
  const packet = new Uint8Array(DOMAIN_HEADER_BYTES_V1 + body.byteLength);
  const view = new DataView(packet.buffer);
  packet.set(magic, 0);
  view.setUint16(4, DOMAIN_PROTOCOL_V1, true);
  view.setUint16(6, DOMAIN_SCHEMA_V1, true);
  view.setUint32(8, body.byteLength, true);
  packet.set(checksumBytes(body), 12);
  packet.set(body, DOMAIN_HEADER_BYTES_V1);
  return packet;
}

function unwrapDomainPacket(packet: Uint8Array, magic: Uint8Array) {
  if (!(packet instanceof Uint8Array)
    || packet.byteLength < DOMAIN_HEADER_BYTES_V1
    || packet.byteLength > RUST_INTEGRATED_RUNTIME_MAX_DOMAIN_PAYLOAD_BYTES) {
    fail("domain-size", "native domain packet is outside its byte budget");
  }
  if (!magic.every((byte, index) => packet[index] === byte)) fail("domain-magic", "native domain packet magic mismatch");
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  if (view.getUint16(4, true) !== DOMAIN_PROTOCOL_V1 || view.getUint16(6, true) !== DOMAIN_SCHEMA_V1) {
    fail("domain-version", "native domain packet version is unsupported");
  }
  const length = view.getUint32(8, true);
  if (length !== packet.byteLength - DOMAIN_HEADER_BYTES_V1) fail("domain-length", "native domain packet length mismatch");
  const body = packet.subarray(DOMAIN_HEADER_BYTES_V1);
  if (!bytesEqual(packet.subarray(12, 28), checksumBytes(body))) fail("domain-checksum", "native domain packet checksum mismatch");
  return body;
}

class Writer {
  private readonly bytes: number[] = [];

  u8(value: number) {
    if (!Number.isInteger(value) || value < 0 || value > 0xff) fail("entity-integer", "u8 is outside its range");
    this.bytes.push(value);
  }

  u32(value: number) {
    if (!Number.isInteger(value) || value < 0 || value > U32_MAX) fail("entity-integer", "u32 is outside its range");
    this.bytes.push(value & 0xff, value >>> 8 & 0xff, value >>> 16 & 0xff, value >>> 24 & 0xff);
  }

  u64(value: bigint) {
    let remaining = unsigned64(value, "u64");
    for (let index = 0; index < 8; index += 1) {
      this.bytes.push(Number(remaining & BigInt(0xff)));
      remaining >>= BigInt(8);
    }
  }

  raw(value: Uint8Array) {
    this.bytes.push(...value);
  }

  finish() {
    return Uint8Array.from(this.bytes);
  }
}

class Reader {
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  take(length: number) {
    if (!Number.isInteger(length) || length < 0 || this.offset + length > this.bytes.byteLength) {
      fail("entity-truncated", "native entity payload is truncated");
    }
    const result = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return result;
  }

  u8() {
    return this.take(1)[0];
  }

  u32() {
    const bytes = this.take(4);
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true);
  }

  u64() {
    const bytes = this.take(8);
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(0, true);
  }

  finish() {
    if (this.offset !== this.bytes.byteLength) fail("entity-trailing", "native entity payload has trailing bytes");
  }
}

function residencyTag(value: RustEntityResidencyR6) {
  if (value === "hot") return 0;
  if (value === "cold") return 1;
  return fail("entity-residency", "entity residency is unknown");
}

function residencyFromTag(value: number): RustEntityResidencyR6 {
  if (value === 0) return "hot";
  if (value === 1) return "cold";
  return fail("entity-residency", "entity residency tag is unknown");
}

/** Exact TypeScript mirror of the native BWI5 compatibility-import codec. */
export function encodeRustIntegratedEntityCompatibilityImportV1(value: RustIntegratedEntityCompatibilityImportV1) {
  unsigned64(value.sequence, "entity sequence");
  unsigned64(value.expectedRevision, "entity revision");
  unsigned64(value.tick, "entity tick");
  if (value.desiredEntityId !== null) entityId(value.desiredEntityId, "desired entity id");
  const record = encodeRustEntityCompatibilityRecordR6V1(value.record);
  const writer = new Writer();
  writer.u64(value.sequence);
  writer.u64(value.expectedRevision);
  writer.u64(value.tick);
  writer.u8(value.desiredEntityId === null ? 0 : 1);
  if (value.desiredEntityId !== null) writer.u64(value.desiredEntityId);
  writer.u8(residencyTag(value.residency));
  writer.u32(record.byteLength);
  writer.raw(record);
  return wrapDomainPacket(BWI5_MAGIC, writer.finish());
}

export function decodeRustIntegratedEntityCompatibilityImportV1(packet: Uint8Array): RustIntegratedEntityCompatibilityImportV1 {
  const reader = new Reader(unwrapDomainPacket(packet, BWI5_MAGIC));
  const sequence = reader.u64();
  const expectedRevision = reader.u64();
  const tick = reader.u64();
  const desiredTag = reader.u8();
  if (desiredTag > 1) fail("entity-id", "desired entity id option tag is not boolean");
  const desiredEntityId = desiredTag === 1 ? entityId(reader.u64(), "desired entity id") : null;
  const residency = residencyFromTag(reader.u8());
  const recordLength = reader.u32();
  const record = decodeRustEntityCompatibilityRecordR6V1(reader.take(recordLength));
  reader.finish();
  return Object.freeze({ sequence, expectedRevision, tick, desiredEntityId, residency, record });
}

const SIMPLE_EVENT_TAGS = Object.freeze([
  "motion-updated",
  "protection-changed",
  "vitals-environment-changed",
  "locomotion-changed",
  "ai-changed",
  "social-changed",
  "mount-changed",
  "network-authority-changed",
  "care-changed",
  "husbandry-changed",
  "work-changed",
  "equipment-changed",
  "dragon-changed",
  "legendary-changed",
  "summon-changed",
  "sentient-changed",
  "components-replaced",
  "compatibility-record-changed",
  "range-state-changed",
  "dormant-summary-changed",
] as const);

const SIMPLE_EVENT_WIRE_TAG = Object.freeze(new Map<string, number>([
  ["motion-updated", 3],
  ["protection-changed", 5],
  ["vitals-environment-changed", 6],
  ["locomotion-changed", 7],
  ["ai-changed", 8],
  ["social-changed", 9],
  ["mount-changed", 10],
  ["network-authority-changed", 11],
  ["care-changed", 12],
  ["husbandry-changed", 13],
  ["work-changed", 14],
  ["equipment-changed", 15],
  ["dragon-changed", 16],
  ["legendary-changed", 17],
  ["summon-changed", 18],
  ["sentient-changed", 19],
  ["components-replaced", 20],
  ["compatibility-record-changed", 21],
  ["range-state-changed", 22],
  ["dormant-summary-changed", 23],
]));

const DESPAWN_REASONS = ["natural-range", "defeated", "captured", "released", "admin"] as const;
const SIMULATION_TIERS = ["hero", "nearby", "coarse", "dormant"] as const;

function writeEventKind(writer: Writer, kind: RustEntityEventKindR6) {
  if (kind.type === "spawned") {
    writer.u8(0);
    writer.u8(residencyTag(kind.residency));
  } else if (kind.type === "despawned") {
    const reason = DESPAWN_REASONS.indexOf(kind.reason);
    if (reason < 0) fail("entity-event", "entity despawn reason is unknown");
    writer.u8(1);
    writer.u8(reason);
  } else if (kind.type === "residency-changed") {
    writer.u8(2);
    writer.u8(residencyTag(kind.residency));
  } else if (kind.type === "tier-changed") {
    const tier = SIMULATION_TIERS.indexOf(kind.tier);
    if (tier < 0) fail("entity-event", "entity simulation tier is unknown");
    writer.u8(4);
    writer.u8(tier);
  } else {
    const tag = SIMPLE_EVENT_WIRE_TAG.get(kind.type);
    if (tag === undefined) fail("entity-event", "entity event kind is unknown");
    writer.u8(tag);
  }
}

function readEventKind(reader: Reader): RustEntityEventKindR6 {
  const tag = reader.u8();
  if (tag === 0) return Object.freeze({ type: "spawned", residency: residencyFromTag(reader.u8()) });
  if (tag === 1) {
    const reason = DESPAWN_REASONS[reader.u8()];
    if (!reason) fail("entity-event", "entity despawn reason tag is unknown");
    return Object.freeze({ type: "despawned", reason });
  }
  if (tag === 2) return Object.freeze({ type: "residency-changed", residency: residencyFromTag(reader.u8()) });
  if (tag === 4) {
    const tier = SIMULATION_TIERS[reader.u8()];
    if (!tier) fail("entity-event", "entity simulation tier tag is unknown");
    return Object.freeze({ type: "tier-changed", tier });
  }
  const type = SIMPLE_EVENT_TAGS.find((candidate) => SIMPLE_EVENT_WIRE_TAG.get(candidate) === tag);
  if (!type) fail("entity-event", "entity event tag is unknown");
  return Object.freeze({ type });
}

export function encodeRustIntegratedEntityEventBatchReceiptV1(value: RustEntityEventBatchR6) {
  if (value.schema !== 1 || value.events.length > MAX_ENTITY_EVENTS_V1) fail("entity-event", "entity event batch is invalid");
  unsigned64(value.sequence, "event sequence");
  unsigned64(value.previousRevision, "previous entity revision");
  unsigned64(value.revision, "entity revision");
  if (value.revision !== ((value.previousRevision + BigInt(1)) & U64_MAX)) {
    fail("entity-event", "entity event authority revision is discontinuous");
  }
  const writer = new Writer();
  writer.u64(value.sequence);
  writer.u64(value.previousRevision);
  writer.u64(value.revision);
  writer.u32(value.events.length);
  for (const event of value.events) {
    writer.u32(event.commandIndex);
    writer.u64(entityId(event.entityId, "event entity id"));
    writer.u64(event.previousEntityRevision);
    writer.u64(event.entityRevision);
    writeEventKind(writer, event.kind);
  }
  return wrapDomainPacket(BWA6_MAGIC, writer.finish());
}

export function decodeRustIntegratedEntityEventBatchReceiptV1(packet: Uint8Array): RustEntityEventBatchR6 {
  const reader = new Reader(unwrapDomainPacket(packet, BWA6_MAGIC));
  const sequence = reader.u64();
  const previousRevision = reader.u64();
  const revision = reader.u64();
  if (revision !== ((previousRevision + BigInt(1)) & U64_MAX)) fail("entity-event", "entity event authority revision is discontinuous");
  const count = reader.u32();
  if (count > MAX_ENTITY_EVENTS_V1) fail("entity-event", "entity event count exceeds its bound");
  const events = Object.freeze(Array.from({ length: count }, () => Object.freeze({
    commandIndex: reader.u32(),
    entityId: entityId(reader.u64(), "event entity id"),
    previousEntityRevision: reader.u64(),
    entityRevision: reader.u64(),
    kind: readEventKind(reader),
  })));
  reader.finish();
  return Object.freeze({ schema: 1 as const, sequence, previousRevision, revision, events });
}

/** Validates the exact BWA6 spawn receipt returned for one BWI5 operation. */
export function validateRustIntegratedEntityCompatibilityImportReceiptV1(
  operation: RustIntegratedRuntimeDomainOperationV1,
  request: RustIntegratedEntityCompatibilityImportV1,
) {
  if (operation.domain !== "entities"
    || operation.typeId !== RUST_INTEGRATED_ENTITY_EVENT_RECEIPT_TYPE_V1
    || operation.schema !== 1
    || operation.payloadHash !== rustIntegratedRuntimeWireChecksumV1(operation.payload)) {
    fail("entity-receipt", "BWI5 returned the wrong ordered native receipt type or payload hash");
  }
  const receipt = decodeRustIntegratedEntityEventBatchReceiptV1(operation.payload);
  const event = receipt.events[0];
  if (receipt.sequence !== request.sequence
    || receipt.previousRevision !== request.expectedRevision
    || receipt.events.length !== 1
    || !event
    || event.commandIndex !== 0
    || event.previousEntityRevision !== BigInt(0)
    || event.entityRevision !== BigInt(1)
    || event.kind.type !== "spawned"
    || event.kind.residency !== request.residency
    || (request.desiredEntityId !== null && event.entityId !== request.desiredEntityId)) {
    fail("entity-receipt", "BWI5 spawn receipt does not attest the requested entity transaction");
  }
  return Object.freeze({ receipt, entityId: event.entityId });
}
