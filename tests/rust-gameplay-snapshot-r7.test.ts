import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  RUST_GAMEPLAY_SNAPSHOT_HEADER_BYTES_R7_V1,
  RustGameplaySnapshotEnvelopeErrorR7,
  cloneValidatedRustGameplaySnapshotR7V1,
  inspectRustGameplaySnapshotEnvelopeR7V1,
  rustGameplaySnapshotFileHashR7V1,
} from "../app/game/rust-gameplay-snapshot-r7.ts";

const FIXTURE_ROOT = new URL("./fixtures/rust-engine/r7/gameplay/", import.meta.url);

async function fixture() {
  const [hex, expected] = await Promise.all([
    readFile(new URL("gameplay-snapshot-v1-unicode.b64", FIXTURE_ROOT), "utf8"),
    readFile(new URL("gameplay-snapshot-v1-unicode.json", FIXTURE_ROOT), "utf8"),
  ]);
  return { bytes: Uint8Array.from(Buffer.from(hex.trim(), "base64")), expected: JSON.parse(expected) as Record<string, unknown> };
}

test("Rust V1 gameplay fixture has exact browser envelope parity", async () => {
  const { bytes, expected } = await fixture();
  const envelope = inspectRustGameplaySnapshotEnvelopeR7V1(bytes);
  assert.equal(envelope.schema, expected.schema);
  assert.equal(envelope.flags, 0);
  assert.equal(envelope.bytes.byteLength, expected.bytes);
  assert.equal(envelope.payloadLength, bytes.byteLength - RUST_GAMEPLAY_SNAPSHOT_HEADER_BYTES_R7_V1);
  assert.equal(envelope.stateHash, expected.stateHash);
  assert.equal(envelope.replayHash, expected.replayHash);
  assert.equal(envelope.snapshotHash, expected.snapshotHash);
  assert.equal(rustGameplaySnapshotFileHashR7V1(bytes), expected.snapshotHash);

  const extension = Uint8Array.from(Buffer.from(expected.opaqueExtensionHex as string, "hex"));
  assert.deepEqual(envelope.payload.subarray(-extension.byteLength), extension, "unknown high-byte extensions remain byte-identical");
  const declaredExtensionLength = new DataView(envelope.payload.buffer, envelope.payload.byteOffset + envelope.payload.byteLength - extension.byteLength - 4, 4).getUint32(0, true);
  assert.equal(declaredExtensionLength, extension.byteLength);
  assert.deepEqual(cloneValidatedRustGameplaySnapshotR7V1(bytes), bytes);
});

test("snapshot preflight rejects every outer-envelope corruption class", async () => {
  const { bytes } = await fixture();
  for (const cut of [0, 7, 8, 10, 12, 20, 36, 52, 67, 68, bytes.byteLength - 1]) {
    assert.throws(() => inspectRustGameplaySnapshotEnvelopeR7V1(bytes.subarray(0, cut)), RustGameplaySnapshotEnvelopeErrorR7);
  }

  const magic = bytes.slice(); magic[0] ^= 0xff;
  assert.throws(() => inspectRustGameplaySnapshotEnvelopeR7V1(magic), (error: unknown) => error instanceof RustGameplaySnapshotEnvelopeErrorR7 && error.code === "magic");
  const schema = bytes.slice(); new DataView(schema.buffer).setUint16(8, 2, true);
  assert.throws(() => inspectRustGameplaySnapshotEnvelopeR7V1(schema), (error: unknown) => error instanceof RustGameplaySnapshotEnvelopeErrorR7 && error.code === "schema");
  const flags = bytes.slice(); new DataView(flags.buffer).setUint16(10, 1, true);
  assert.throws(() => inspectRustGameplaySnapshotEnvelopeR7V1(flags), (error: unknown) => error instanceof RustGameplaySnapshotEnvelopeErrorR7 && error.code === "flags");
  const length = bytes.slice(); new DataView(length.buffer).setBigUint64(12, BigInt(bytes.byteLength), true);
  assert.throws(() => inspectRustGameplaySnapshotEnvelopeR7V1(length), (error: unknown) => error instanceof RustGameplaySnapshotEnvelopeErrorR7 && error.code === "length");
  const highLength = bytes.slice(); new DataView(highLength.buffer).setBigUint64(12, BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1), true);
  assert.throws(() => inspectRustGameplaySnapshotEnvelopeR7V1(highLength), (error: unknown) => error instanceof RustGameplaySnapshotEnvelopeErrorR7 && error.code === "capacity");
  const payload = bytes.slice(); payload[payload.byteLength - 1] ^= 0xff;
  assert.throws(() => inspectRustGameplaySnapshotEnvelopeR7V1(payload), (error: unknown) => error instanceof RustGameplaySnapshotEnvelopeErrorR7 && error.code === "payload-hash");
});

test("snapshot inspection owns buffers and cannot alias later mutation", async () => {
  const { bytes } = await fixture();
  const envelope = inspectRustGameplaySnapshotEnvelopeR7V1(bytes);
  const original = envelope.bytes[0];
  bytes[0] ^= 0xff;
  assert.equal(envelope.bytes[0], original);
  envelope.payload[0] ^= 0xff;
  assert.notEqual(envelope.payload[0], envelope.bytes[RUST_GAMEPLAY_SNAPSHOT_HEADER_BYTES_R7_V1], "payload and complete file are separately owned immutable-boundary copies");
});
