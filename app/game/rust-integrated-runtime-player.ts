import {
  createRustIntegratedRuntimeCommandBatchV1,
  createRustIntegratedRuntimeDomainOperationV1,
  rustIntegratedRuntimeWireChecksumV1,
} from "./rust-integrated-runtime-codec";
import { RustIntegratedRuntimeServiceV1 } from "./rust-integrated-runtime-service";

export const RUST_INTEGRATED_PLAYER_BIND_TYPE_V1 = "blockwild.simulation.player-bind.r5.v1";
export const RUST_INTEGRATED_PLAYER_BIND_RECEIPT_TYPE_V1 = "blockwild.simulation.player-bind-receipt.r5.v1";

const MAGIC = Uint8Array.from([0x42, 0x57, 0x42, 0x35]); // BWB5
const HEADER_BYTES = 28;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

export type RustIntegratedPlayerBindingV1 = Readonly<{
  externalEntityId: string;
  radius: number;
  standingHeight: number;
  crouchingHeight: number;
  mass: number;
  walkSpeed: number;
  sprintSpeed: number;
  creativeFlightSpeed: number;
  maximumOxygenSeconds: number;
}>;

export class RustIntegratedPlayerContractError extends Error {
  readonly name = "RustIntegratedPlayerContractError";

  constructor(readonly code: string, message: string) {
    super(message);
  }
}

function validate(value: RustIntegratedPlayerBindingV1) {
  const identity = value.externalEntityId;
  const malformedIdentity = typeof identity !== "string"
    || identity.length === 0
    || textEncoder.encode(identity).byteLength > 512
    || /[\u0000-\u001f\u007f-\u009f]/u.test(identity)
    || /[\ud800-\udfff]/u.test(identity);
  const values = [
    value.radius,
    value.standingHeight,
    value.crouchingHeight,
    value.mass,
    value.walkSpeed,
    value.sprintSpeed,
    value.creativeFlightSpeed,
    value.maximumOxygenSeconds,
  ];
  if (malformedIdentity
    || values.some((number) => !Number.isFinite(number) || number <= 0)
    || value.radius < 0.1 || value.radius > 4
    || value.standingHeight < 0.5 || value.standingHeight > 8
    || value.crouchingHeight > value.standingHeight
    || value.mass < 0.1 || value.mass > 100_000
    || value.walkSpeed < 0.1 || value.walkSpeed > 128
    || value.sprintSpeed < value.walkSpeed || value.sprintSpeed > 192
    || value.creativeFlightSpeed < 0.1 || value.creativeFlightSpeed > 256
    || value.maximumOxygenSeconds > 3_600) {
    throw new RustIntegratedPlayerContractError("player-binding", "player binding contains an invalid identity or physical profile");
  }
}

function checksumBytes(bytes: Uint8Array) {
  const hash = rustIntegratedRuntimeWireChecksumV1(bytes);
  return Uint8Array.from({ length: 16 }, (_, index) => Number.parseInt(hash.slice(index * 2, index * 2 + 2), 16));
}

export function encodeRustIntegratedPlayerBindingV1(value: RustIntegratedPlayerBindingV1) {
  validate(value);
  const identity = textEncoder.encode(value.externalEntityId);
  const body = new Uint8Array(4 + identity.byteLength + 8 * 8);
  const view = new DataView(body.buffer);
  view.setUint32(0, identity.byteLength, true);
  body.set(identity, 4);
  let offset = 4 + identity.byteLength;
  for (const number of [
    value.radius,
    value.standingHeight,
    value.crouchingHeight,
    value.mass,
    value.walkSpeed,
    value.sprintSpeed,
    value.creativeFlightSpeed,
    value.maximumOxygenSeconds,
  ]) {
    view.setFloat64(offset, number, true);
    offset += 8;
  }
  const packet = new Uint8Array(HEADER_BYTES + body.byteLength);
  const header = new DataView(packet.buffer);
  packet.set(MAGIC, 0);
  header.setUint16(4, 1, true);
  header.setUint16(6, 1, true);
  header.setUint32(8, body.byteLength, true);
  packet.set(checksumBytes(body), 12);
  packet.set(body, HEADER_BYTES);
  return packet;
}

export function decodeRustIntegratedPlayerBindingV1(packet: Uint8Array): RustIntegratedPlayerBindingV1 {
  if (!(packet instanceof Uint8Array) || packet.byteLength < HEADER_BYTES || !MAGIC.every((byte, index) => packet[index] === byte)) {
    throw new RustIntegratedPlayerContractError("player-binding", "player binding packet header is malformed");
  }
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  const length = view.getUint32(8, true);
  if (view.getUint16(4, true) !== 1 || view.getUint16(6, true) !== 1 || length !== packet.byteLength - HEADER_BYTES) {
    throw new RustIntegratedPlayerContractError("player-binding", "player binding packet version or length is invalid");
  }
  const body = packet.subarray(HEADER_BYTES);
  if (!checksumBytes(body).every((byte, index) => packet[12 + index] === byte)) {
    throw new RustIntegratedPlayerContractError("player-binding", "player binding packet checksum is invalid");
  }
  const identityLength = new DataView(body.buffer, body.byteOffset, body.byteLength).getUint32(0, true);
  if (identityLength === 0 || 4 + identityLength + 64 !== body.byteLength) {
    throw new RustIntegratedPlayerContractError("player-binding", "player binding body is truncated or has trailing bytes");
  }
  let offset = 4 + identityLength;
  const bodyView = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const numbers = Array.from({ length: 8 }, () => {
    const number = bodyView.getFloat64(offset, true);
    offset += 8;
    return number;
  });
  let externalEntityId: string;
  try {
    externalEntityId = textDecoder.decode(body.subarray(4, 4 + identityLength));
  } catch {
    throw new RustIntegratedPlayerContractError("player-binding", "player binding identity is not UTF-8");
  }
  const value = Object.freeze({
    externalEntityId,
    radius: numbers[0],
    standingHeight: numbers[1],
    crouchingHeight: numbers[2],
    mass: numbers[3],
    walkSpeed: numbers[4],
    sprintSpeed: numbers[5],
    creativeFlightSpeed: numbers[6],
    maximumOxygenSeconds: numbers[7],
  });
  validate(value);
  return value;
}

/** Coarse awaited installation into the sole Rust runtime. */
export class RustIntegratedPlayerRuntimePortV1 {
  private serial = Promise.resolve<unknown>(undefined);

  constructor(
    private readonly runtime: RustIntegratedRuntimeServiceV1,
    private readonly actorId = "platform:player",
  ) {}

  bind(binding: RustIntegratedPlayerBindingV1) {
    const payload = encodeRustIntegratedPlayerBindingV1(binding);
    const payloadHash = rustIntegratedRuntimeWireChecksumV1(payload);
    const operation = () => this.runtime.command(createRustIntegratedRuntimeCommandBatchV1({
      commandId: `player-bind:${binding.externalEntityId}:${payloadHash}`,
      idempotencyKey: `player-bind:${binding.externalEntityId}:${payloadHash}`,
      actorId: this.actorId,
      expected: this.runtime.identity(),
      operations: [createRustIntegratedRuntimeDomainOperationV1({
        domain: "simulation",
        typeId: RUST_INTEGRATED_PLAYER_BIND_TYPE_V1,
        schema: 1,
        payload,
      })],
    })).then((receipt) => {
      if (receipt.status === "rejected") throw new RustIntegratedPlayerContractError(receipt.code, receipt.message);
      const response = receipt.domainReceipts[0];
      if (receipt.domainReceipts.length !== 1
        || response.domain !== "simulation"
        || response.typeId !== RUST_INTEGRATED_PLAYER_BIND_RECEIPT_TYPE_V1
        || response.schema !== 1) {
        throw new RustIntegratedPlayerContractError("player-binding-receipt", "player binding returned an unexpected native receipt");
      }
    });
    const next = this.serial.then(operation, operation);
    this.serial = next.then(() => undefined, () => undefined);
    return next;
  }
}
