import assert from "node:assert/strict";
import test from "node:test";
import { createNetworkAuthorityIdentityV1, createNetworkInterestSetV1 } from "../app/game/network-authority-contract.ts";
import { decodeNetworkCommandWireV1 } from "../app/game/rust-network-wire-v1.ts";
import { RustNetworkRuntimeServiceV1 } from "../app/game/rust-network-runtime-service.ts";
import type { RustIntegratedNetworkRuntimePortV1 } from "../app/game/rust-integrated-runtime-domain-adapters.ts";
import { IntegratedRustMultiplayerAuthorityV1, type RustMultiplayerInboundCommandV1 } from "../app/game/rust-multiplayer-authority.ts";

const identity = createNetworkAuthorityIdentityV1(
  { universeId: "blockwild", locationId: "world-main" },
  { epoch: 1, world: 2, entities: 3, gameplay: 4, persistence: 5 },
);
const interest = createNetworkInterestSetV1({
  sequence: 0,
  chunks: [{ universeId: "blockwild", locationId: "world-main", chunkX: -2, chunkZ: 3 }],
  entityIds: ["agent_drone_001"],
});

function containsBytes(haystack: Uint8Array, needle: Uint8Array) {
  outer: for (let offset = 0; offset <= haystack.byteLength - needle.byteLength; offset += 1) {
    for (let index = 0; index < needle.byteLength; index += 1) if (haystack[offset + index] !== needle[index]) continue outer;
    return true;
  }
  return false;
}

test("integrated multiplayer adapter keeps high-byte agent work opaque and delegates lease lifecycle", async () => {
  const captured: { envelope?: Uint8Array; work?: Uint8Array } = {};
  const lifecycleCalls: string[] = [];
  const receipt = {
    schemaVersion: 1 as const,
    status: "accepted" as const,
    commandId: "command_agent_0001",
    idempotencyKey: "idem:agent",
    peerId: "agent_drone_001",
    identity,
    receiptHash: "1".repeat(32),
  };
  const network = {
    async negotiate() { return { kind: "handshake" as const, requestId: 1, compatible: true, code: "ok", capabilities: ["agent-work", "chat"] as const, maxCommandBytes: 1_048_576, message: "ok", recordHash: "2".repeat(32) }; },
    async authorizeAgent(_current: unknown, _now: unknown, envelope: Uint8Array, work: Uint8Array) {
      captured.envelope = envelope; captured.work = work;
      return { kind: "agent-command" as const, requestId: 2, code: "accepted" as const, receipt, authorityFingerprint: "3".repeat(32) };
    },
    async authorize() { throw new Error("not used"); },
    async validateDelta() { throw new Error("not used"); },
  } as unknown as RustNetworkRuntimeServiceV1;
  const lifecycle = {
    async installPeerGrant() { lifecycleCalls.push("peer-install"); },
    async installAgentGrant() { lifecycleCalls.push("agent-install"); },
    async releaseCommand(commandId: string) { lifecycleCalls.push(`command-release:${commandId}`); },
    async releasePeer(peerId: string) { lifecycleCalls.push(`peer-release:${peerId}`); },
  } as unknown as RustIntegratedNetworkRuntimePortV1;
  const authority = new IntegratedRustMultiplayerAuthorityV1({
    network, lifecycle, identity: () => identity, engineVersion: "1.12.0",
    contentHash: "4".repeat(32), generatorHash: "5".repeat(32), now: () => 1_000,
  });
  const peer = {
    sessionId: "session_rust_001", peerId: "agent_drone_001", connectionId: "invite_agent_001",
    actorId: "agent_drone_001", peerKind: "agent" as const, role: "guest" as const,
    capabilities: ["agent-work", "chat"] as const, expiresAt: 60_000, nextSequence: 0,
    interest, connectionGeneration: 1,
  };
  await authority.installPeer(peer);
  await authority.installAgentGrant({ schema: 1, agentId: peer.peerId, connectionId: peer.connectionId, status: "approved", requested: ["observe.world"], granted: ["observe.world"], updatedAt: 1_000 }, peer);
  const payload = {
    schema: 1 as const, commandId: "command_agent_0001", agentId: peer.peerId, kind: "observe" as const,
    expectedWorldRevision: 4, issuedAt: 1_000, expiresAt: 30_000,
    arguments: { note: "雪・水・🐉 and byte \u0080" }, clientIntent: "Inspect the luminous shore.",
  };
  const command: RustMultiplayerInboundCommandV1 = {
    sessionId: peer.sessionId, peerId: peer.peerId, connectionId: peer.connectionId,
    peerKind: "agent", actorId: peer.actorId, messageType: "agent-command", sequence: 0,
    sentAt: 1_000, expected: identity, encodedEnvelope: JSON.stringify({ payload }), payload,
  };
  const decision = await authority.authorizeInbound(command);
  assert.equal(decision.accepted, true);
  assert.ok(captured.envelope && captured.work);
  assert.deepEqual([...captured.work!.subarray(0, 4)], [...new TextEncoder().encode("BWA1")]);
  assert.equal(containsBytes(captured.work!, new TextEncoder().encode("雪・水・🐉 and byte \u0080")), true);
  const outer = decodeNetworkCommandWireV1(captured.envelope!);
  assert.deepEqual([...outer.payload], [...captured.work!], "the BWN command carries one complete BWA packet, not per-entity calls");
  await authority.releaseCommand(payload.commandId);
  await authority.releasePeer(peer.peerId);
  await authority.drain();
  assert.deepEqual(lifecycleCalls, ["peer-install", "agent-install", `command-release:${payload.commandId}`, `peer-release:${peer.peerId}`]);
});

test("integrated multiplayer adapter leases every cell in a maximum block batch", async () => {
  let leaseCount = 0;
  const network = {
    async authorize(_current: unknown, _now: unknown, packets: readonly Uint8Array[]) {
      const decoded = decodeNetworkCommandWireV1(packets[0]!);
      leaseCount = decoded.leaseKeys.length;
      return {
        kind: "command-batch" as const, requestId: 1,
        receipts: [{ schemaVersion: 1 as const, status: "accepted" as const, commandId: decoded.commandId, idempotencyKey: decoded.idempotencyKey, peerId: decoded.peerId, identity, receiptHash: "6".repeat(32) }],
        authorityFingerprint: "7".repeat(32),
      };
    },
    async negotiate() { throw new Error("not used"); },
    async authorizeAgent() { throw new Error("not used"); },
    async validateDelta() { throw new Error("not used"); },
  } as unknown as RustNetworkRuntimeServiceV1;
  const lifecycle = {
    async installPeerGrant() {}, async releasePeer() {},
  } as unknown as RustIntegratedNetworkRuntimePortV1;
  const authority = new IntegratedRustMultiplayerAuthorityV1({ network, lifecycle, identity: () => identity, engineVersion: "1.12.0", contentHash: "8".repeat(32), generatorHash: "9".repeat(32), now: () => 1_000 });
  const edits = Array.from({ length: 2_048 }, (_, index) => ({ x: index, y: 40, z: -3, type: 1 }));
  const payload = { requestId: "request_batch_001", actorId: "player_guest_01", tick: 1, kind: "batch", edits };
  const decision = await authority.authorizeInbound({
    sessionId: "session_rust_001", peerId: payload.actorId, connectionId: "invite_human_001", peerKind: "human",
    actorId: payload.actorId, messageType: "block-action", sequence: 0, sentAt: 1_000,
    expected: identity, encodedEnvelope: JSON.stringify({ payload }), payload,
  });
  assert.equal(decision.accepted, true);
  assert.equal(leaseCount, 2_048);
});
