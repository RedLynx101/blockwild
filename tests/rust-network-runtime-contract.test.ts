import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createNetworkAuthorityIdentityV1 } from "../app/game/network-authority-contract.ts";
import { TypeScriptCanonicalHasher } from "../app/game/rust-kernel-shadow.ts";
import {
  decodeRustNetworkRequestV1,
  decodeRustNetworkResponseV1,
  encodeRustNetworkCommandBatchRequestV1,
  encodeRustNetworkDeltaDeliveryRequestV1,
  encodeRustNetworkResponseV1,
} from "../app/game/rust-network-runtime-contract.ts";
import { RustNetworkRuntimeServiceV1 } from "../app/game/rust-network-runtime-service.ts";

function fixtureBytes(name = "network-browser-runtime-v1.hex") {
  const path = fileURLToPath(new URL(`./fixtures/rust-engine/r8-r9/${name}`, import.meta.url));
  const value = readFileSync(path, "utf8").trim();
  return Uint8Array.from({ length: value.length / 2 }, (_, index) => Number.parseInt(value.slice(index * 2, index * 2 + 2), 16));
}

test("native Rust network request is exact in TypeScript and preserves >=0x80 bytes", () => {
  const bytes = fixtureBytes(); const request = decodeRustNetworkRequestV1(bytes);
  assert.equal(request.kind, "command-batch");
  if (request.kind !== "command-batch") return;
  assert.equal(request.requestId, 0x0012_0304_0506_0708);
  assert.equal(request.current.revision.world, 41);
  assert.equal(request.commandPackets.length, 1);
  assert.ok(request.commandPackets[0].includes(0x80));
  assert.ok(request.commandPackets[0].includes(0xff));
  assert.deepEqual(encodeRustNetworkCommandBatchRequestV1(request.requestId, request.current, request.now, request.commandPackets), bytes);
});

test("native Rust delta request preserves canonical interest and high-byte keyframe data", () => {
  const bytes = fixtureBytes("network-delta-browser-runtime-v1.hex");
  const request = decodeRustNetworkRequestV1(bytes);
  assert.equal(request.kind, "delta-delivery");
  if (request.kind !== "delta-delivery") return;
  assert.equal(request.interest.sequence, 9);
  assert.deepEqual(request.interest.chunks.map(({ chunkX, chunkZ }) => [chunkX, chunkZ]), [[0, -2], [1, -2]]);
  assert.equal(request.interest.entityIds.length, 2);
  assert.ok(request.deltaPacket.includes(0x80));
  assert.ok(request.deltaPacket.includes(0xff));
  assert.deepEqual(
    encodeRustNetworkDeltaDeliveryRequestV1(
      request.requestId,
      request.checkpointPacket,
      request.interest,
      request.deltaPacket,
    ),
    bytes,
  );
});

test("response codec validates Rust receipt hashes and authority fingerprints", () => {
  const identity = createNetworkAuthorityIdentityV1({ universeId: "blockwild", locationId: "overworld" }, { epoch: 1, world: 2, entities: 3, gameplay: 4, persistence: 5 });
  const base = { commandId: "command:one", idempotencyKey: "idem:one", peerId: "peer:one", identity } as const;
  const receiptHash = new TypeScriptCanonicalHasher("blockwild-network-receipt-v1")
    .writeString("accepted")
    .writeString(base.commandId)
    .writeString(base.idempotencyKey)
    .writeString(base.peerId)
    .writeString(identity.stateHash)
    .finishHex();
  const response = { kind: "command-batch" as const, requestId: 7, receipts: [Object.freeze({ schemaVersion: 1 as const, status: "accepted" as const, ...base, receiptHash })], authorityFingerprint: "11111111111111111111111111111111" };
  assert.deepEqual(decodeRustNetworkResponseV1(encodeRustNetworkResponseV1(response)), response);
});

test("runtime service rejects a stale response id and drains pending work", async () => {
  const port = {
    backend: "rust-wasm-worker" as const,
    async request(message: Uint8Array) {
      const request = decodeRustNetworkRequestV1(message);
      return encodeRustNetworkResponseV1({ kind: "handshake", requestId: request.requestId + 1, compatible: true, code: "ok", capabilities: ["observe"], maxCommandBytes: 1024, message: "ok", recordHash: "11111111111111111111111111111111" });
    },
  };
  const service = new RustNetworkRuntimeServiceV1(port);
  await assert.rejects(() => service.negotiate(Uint8Array.of(1), Uint8Array.of(2)), /does not match request/u);
  assert.equal(service.pendingCount, 0);
});

test("runtime service rejects a response from the wrong Rust operation", async () => {
  const port = {
    backend: "rust-wasm-worker" as const,
    async request(message: Uint8Array) {
      const request = decodeRustNetworkRequestV1(message);
      return encodeRustNetworkResponseV1({
        kind: "delta-delivery",
        requestId: request.requestId,
        code: "duplicate",
        sequence: 0,
        stateHash: "11111111111111111111111111111111",
        message: "wrong operation",
      });
    },
  };
  const service = new RustNetworkRuntimeServiceV1(port);
  await assert.rejects(() => service.negotiate(Uint8Array.of(1), Uint8Array.of(2)), /Expected Rust handshake response/u);
  assert.equal(service.pendingCount, 0);
});

test("outer checksum corruption fails before a runtime packet can be trusted", () => {
  const bytes = fixtureBytes(); bytes[bytes.length - 1] ^= 0x80;
  assert.throws(() => decodeRustNetworkRequestV1(bytes), /checksum/u);
});
