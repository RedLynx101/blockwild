import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeRustEngineEnvelope,
  decodeRustEngineJson,
  encodeRustEngineEnvelope,
  encodeRustEngineJson,
  RUST_ENGINE_HEADER_BYTES,
  RUST_ENGINE_PROTOCOL_MAGIC,
  RustEngineMessageFlag,
  RustEngineMessageKind,
  RustEngineProtocolError,
} from "../app/game/rust-engine-protocol.ts";

test("BWEP round-trips its fixed 32-byte little-endian header and payload", () => {
  const payload = encodeRustEngineJson({ command: "step", ticks: 3 });
  const buffer = encodeRustEngineEnvelope({
    kind: RustEngineMessageKind.CommandBatch,
    flags: RustEngineMessageFlag.TransfersOwnership,
    requestId: 0x1020_3040,
    epoch: 19,
    ownershipToken: BigInt("9007199254740993"),
    payload,
  });
  assert.equal(buffer.byteLength, RUST_ENGINE_HEADER_BYTES + payload.byteLength);
  const header = new DataView(buffer);
  assert.equal(header.getUint32(0, true), RUST_ENGINE_PROTOCOL_MAGIC);
  assert.equal(header.getUint32(12, true), 0x1020_3040);
  assert.equal(header.getBigUint64(24, true), BigInt("9007199254740993"));
  const decoded = decodeRustEngineEnvelope(buffer);
  assert.equal(decoded.header.kind, RustEngineMessageKind.CommandBatch);
  assert.equal(decoded.header.epoch, 19);
  assert.deepEqual(decodeRustEngineJson(decoded.payload), { command: "step", ticks: 3 });
});

test("BWEP rejects incompatible, truncated, trailing, and unknown-required envelopes", () => {
  const baseline = encodeRustEngineEnvelope({ kind: RustEngineMessageKind.Heartbeat });
  const incompatible = baseline.slice(0);
  new DataView(incompatible).setUint16(6, 2, true);
  assert.throws(() => decodeRustEngineEnvelope(incompatible), (error: unknown) => error instanceof RustEngineProtocolError && error.code === "schema-mismatch");

  const truncated = baseline.slice(0, RUST_ENGINE_HEADER_BYTES - 1);
  assert.throws(() => decodeRustEngineEnvelope(truncated), (error: unknown) => error instanceof RustEngineProtocolError && error.code === "truncated-envelope");

  const trailing = new Uint8Array(baseline.byteLength + 1);
  trailing.set(new Uint8Array(baseline));
  assert.throws(() => decodeRustEngineEnvelope(trailing), (error: unknown) => error instanceof RustEngineProtocolError && error.code === "trailing-bytes");

  const unknownRequired = baseline.slice(0);
  new DataView(unknownRequired).setUint16(10, 0x0040, true);
  assert.throws(() => decodeRustEngineEnvelope(unknownRequired), (error: unknown) => error instanceof RustEngineProtocolError && error.code === "unknown-required-flags");
});

test("optional future flag bits remain forward-compatible", () => {
  const envelope = encodeRustEngineEnvelope({ kind: RustEngineMessageKind.Heartbeat, flags: 0x8000 });
  assert.equal(decodeRustEngineEnvelope(envelope).header.flags, 0x8000);
});
