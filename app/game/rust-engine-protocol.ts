/**
 * Blockwild Engine Protocol (BWEP)
 *
 * The browser shell and Rust engine communicate in coarse binary envelopes.
 * The header is deliberately fixed-width so native tools, Wasm, workers, and
 * replay fixtures can validate messages without traversing JavaScript objects.
 */

export const RUST_ENGINE_PROTOCOL_MAGIC = 0x5045_5742;
export const RUST_ENGINE_PROTOCOL_VERSION = 1;
export const RUST_ENGINE_SCHEMA_VERSION = 1;
export const RUST_ENGINE_HEADER_BYTES = 32;
export const RUST_ENGINE_MAX_PAYLOAD_BYTES = 32 * 1024 * 1024;

export enum RustEngineMessageKind {
  CapabilityHello = 1,
  CapabilityAck = 2,
  Heartbeat = 3,
  Shutdown = 4,
  BufferRelease = 5,
  CommandBatch = 10,
  Step = 11,
  Events = 12,
  StateHash = 13,
  Error = 0x7ffe,
  Panic = 0x7fff,
}

/**
 * Bits 0-7 are required protocol semantics. Unknown required bits are fatal.
 * Bits 8-15 are optional hints and may be ignored by older peers.
 */
export enum RustEngineMessageFlag {
  Response = 0x0001,
  TransfersOwnership = 0x0002,
  Error = 0x0004,
  Final = 0x0008,
  Recoverable = 0x0100,
}

export const RUST_ENGINE_REQUIRED_FLAG_MASK = 0x00ff;
export const RUST_ENGINE_KNOWN_REQUIRED_FLAGS =
  RustEngineMessageFlag.Response
  | RustEngineMessageFlag.TransfersOwnership
  | RustEngineMessageFlag.Error
  | RustEngineMessageFlag.Final;

export type RustEngineEnvelopeHeader = Readonly<{
  protocolVersion: number;
  schemaVersion: number;
  kind: RustEngineMessageKind;
  flags: number;
  requestId: number;
  epoch: number;
  payloadLength: number;
  ownershipToken: bigint;
}>;

export type RustEngineEnvelope = Readonly<{
  header: RustEngineEnvelopeHeader;
  payload: Uint8Array;
  buffer: ArrayBuffer;
}>;

export type RustEngineWireMessage = Readonly<{
  envelope: ArrayBuffer;
  /** The buffer whose ownership is being returned by BufferRelease. */
  returnedBuffer?: ArrayBuffer;
}>;

export type RustEngineProtocolErrorCode =
  | "invalid-magic"
  | "protocol-mismatch"
  | "schema-mismatch"
  | "unknown-required-flags"
  | "unknown-message-kind"
  | "truncated-envelope"
  | "trailing-bytes"
  | "payload-too-large"
  | "invalid-json";

export class RustEngineProtocolError extends Error {
  readonly name = "RustEngineProtocolError";

  constructor(
    readonly code: RustEngineProtocolErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const KNOWN_MESSAGE_KINDS = new Set<number>(Object.values(RustEngineMessageKind).filter((value) => typeof value === "number"));
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

function asBytes(input: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
}

function checkedU16(value: number, name: string) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new RangeError(`${name} must be an unsigned 16-bit integer`);
  return value;
}

function checkedU32(value: number, name: string) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) throw new RangeError(`${name} must be an unsigned 32-bit integer`);
  return value;
}

export function encodeRustEngineEnvelope(options: Readonly<{
  kind: RustEngineMessageKind;
  payload?: ArrayBuffer | ArrayBufferView;
  flags?: number;
  requestId?: number;
  epoch?: number;
  ownershipToken?: bigint;
  protocolVersion?: number;
  schemaVersion?: number;
}>): ArrayBuffer {
  const payload = options.payload ? asBytes(options.payload) : new Uint8Array(0);
  if (payload.byteLength > RUST_ENGINE_MAX_PAYLOAD_BYTES) {
    throw new RustEngineProtocolError("payload-too-large", `Engine payload is ${payload.byteLength} bytes; maximum is ${RUST_ENGINE_MAX_PAYLOAD_BYTES}`);
  }
  if (!KNOWN_MESSAGE_KINDS.has(options.kind)) {
    throw new RustEngineProtocolError("unknown-message-kind", `Unknown engine message kind ${options.kind}`);
  }
  const flags = checkedU16(options.flags ?? 0, "flags");
  const unknownRequired = flags & RUST_ENGINE_REQUIRED_FLAG_MASK & ~RUST_ENGINE_KNOWN_REQUIRED_FLAGS;
  if (unknownRequired) {
    throw new RustEngineProtocolError("unknown-required-flags", `Cannot encode unknown required engine flags 0x${unknownRequired.toString(16)}`);
  }
  const buffer = new ArrayBuffer(RUST_ENGINE_HEADER_BYTES + payload.byteLength);
  const view = new DataView(buffer);
  view.setUint32(0, RUST_ENGINE_PROTOCOL_MAGIC, true);
  view.setUint16(4, checkedU16(options.protocolVersion ?? RUST_ENGINE_PROTOCOL_VERSION, "protocolVersion"), true);
  view.setUint16(6, checkedU16(options.schemaVersion ?? RUST_ENGINE_SCHEMA_VERSION, "schemaVersion"), true);
  view.setUint16(8, checkedU16(options.kind, "kind"), true);
  view.setUint16(10, flags, true);
  view.setUint32(12, checkedU32(options.requestId ?? 0, "requestId"), true);
  view.setUint32(16, checkedU32(options.epoch ?? 0, "epoch"), true);
  view.setUint32(20, checkedU32(payload.byteLength, "payloadLength"), true);
  view.setBigUint64(24, options.ownershipToken ?? BigInt(0), true);
  new Uint8Array(buffer, RUST_ENGINE_HEADER_BYTES).set(payload);
  return buffer;
}

export function decodeRustEngineEnvelope(
  input: ArrayBuffer | ArrayBufferView,
  options: Readonly<{
    protocolVersion?: number;
    schemaVersion?: number;
    maximumPayloadBytes?: number;
    allowUnknownKind?: boolean;
  }> = {},
): RustEngineEnvelope {
  const bytes = asBytes(input);
  if (bytes.byteLength < RUST_ENGINE_HEADER_BYTES) {
    throw new RustEngineProtocolError("truncated-envelope", `Engine envelope has ${bytes.byteLength} bytes; header requires ${RUST_ENGINE_HEADER_BYTES}`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(0, true);
  if (magic !== RUST_ENGINE_PROTOCOL_MAGIC) {
    throw new RustEngineProtocolError("invalid-magic", `Invalid engine protocol magic 0x${magic.toString(16)}`);
  }
  const protocolVersion = view.getUint16(4, true);
  const expectedProtocol = options.protocolVersion ?? RUST_ENGINE_PROTOCOL_VERSION;
  if (protocolVersion !== expectedProtocol) {
    throw new RustEngineProtocolError("protocol-mismatch", `Engine protocol ${protocolVersion} is incompatible with ${expectedProtocol}`);
  }
  const schemaVersion = view.getUint16(6, true);
  const expectedSchema = options.schemaVersion ?? RUST_ENGINE_SCHEMA_VERSION;
  if (schemaVersion !== expectedSchema) {
    throw new RustEngineProtocolError("schema-mismatch", `Engine schema ${schemaVersion} is incompatible with ${expectedSchema}`);
  }
  const kind = view.getUint16(8, true);
  if (!options.allowUnknownKind && !KNOWN_MESSAGE_KINDS.has(kind)) {
    throw new RustEngineProtocolError("unknown-message-kind", `Unknown engine message kind ${kind}`);
  }
  const flags = view.getUint16(10, true);
  const unknownRequired = flags & RUST_ENGINE_REQUIRED_FLAG_MASK & ~RUST_ENGINE_KNOWN_REQUIRED_FLAGS;
  if (unknownRequired) {
    throw new RustEngineProtocolError("unknown-required-flags", `Unknown required engine flags 0x${unknownRequired.toString(16)}`);
  }
  const payloadLength = view.getUint32(20, true);
  const maximumPayloadBytes = options.maximumPayloadBytes ?? RUST_ENGINE_MAX_PAYLOAD_BYTES;
  if (payloadLength > maximumPayloadBytes) {
    throw new RustEngineProtocolError("payload-too-large", `Engine payload declares ${payloadLength} bytes; maximum is ${maximumPayloadBytes}`);
  }
  const expectedLength = RUST_ENGINE_HEADER_BYTES + payloadLength;
  if (bytes.byteLength < expectedLength) {
    throw new RustEngineProtocolError("truncated-envelope", `Engine envelope declares ${expectedLength} bytes but contains ${bytes.byteLength}`);
  }
  if (bytes.byteLength > expectedLength) {
    throw new RustEngineProtocolError("trailing-bytes", `Engine envelope declares ${expectedLength} bytes but contains ${bytes.byteLength}`);
  }
  const buffer = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? bytes.buffer as ArrayBuffer
    : bytes.slice().buffer;
  return {
    header: {
      protocolVersion,
      schemaVersion,
      kind: kind as RustEngineMessageKind,
      flags,
      requestId: view.getUint32(12, true),
      epoch: view.getUint32(16, true),
      payloadLength,
      ownershipToken: view.getBigUint64(24, true),
    },
    payload: new Uint8Array(buffer, RUST_ENGINE_HEADER_BYTES, payloadLength),
    buffer,
  };
}

export function encodeRustEngineJson(value: unknown): Uint8Array {
  return textEncoder.encode(JSON.stringify(value));
}

export function decodeRustEngineJson<T = unknown>(payload: ArrayBuffer | ArrayBufferView): T {
  try {
    const text = textDecoder.decode(asBytes(payload));
    return JSON.parse(text) as T;
  } catch (error) {
    throw new RustEngineProtocolError("invalid-json", `Invalid engine JSON payload: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function hasRustEngineFlag(header: Pick<RustEngineEnvelopeHeader, "flags">, flag: RustEngineMessageFlag) {
  return (header.flags & flag) === flag;
}
