import assert from "node:assert/strict";
import test from "node:test";
import {
  TypeScriptNetworkAuthorityV1,
  createNetworkAuthorityIdentityV1,
  createNetworkCommandV1,
  createNetworkDeltaV1,
  createNetworkHandshakeV1,
  createNetworkInterestSetV1,
  createNetworkReconnectCheckpointV1,
  diagnoseNetworkDesyncV1,
  negotiateNetworkHandshakeV1,
  networkDeltaMatchesInterestV1,
  networkDeltaTransferListV1,
  type NetworkCommandSourceV1,
  type NetworkPeerGrantV1,
} from "../app/game/network-authority-contract.ts";

const HASH_A = "0123456789abcdef0123456789abcdef";
const HASH_B = "fedcba9876543210fedcba9876543210";
const ADDRESS = Object.freeze({ universeId: "universe:primary", locationId: "overworld" });
const identity = createNetworkAuthorityIdentityV1(ADDRESS, { epoch: 1, world: 10, entities: 8, gameplay: 6, persistence: 4 });

function handshake(peerId: string, role: "host" | "guest", peerKind: "human" | "agent" = "human") {
  return createNetworkHandshakeV1({
    sessionId: "session:fixture", peerId, peerKind, role, engineVersion: "rust-1",
    contentHash: HASH_A, generatorHash: HASH_B,
    capabilities: ["observe", "chat", "interact", "inventory", ...(peerKind === "agent" ? ["agent-work" as const] : [])],
  });
}

const interest = createNetworkInterestSetV1({
  sequence: 1,
  chunks: [
    { ...ADDRESS, chunkX: 1, chunkZ: 0 },
    { ...ADDRESS, chunkX: -1, chunkZ: 0 },
  ],
  entityIds: ["entity:zeta", "entity:alpha", "entity:zeta"],
});

function command(overrides: Partial<NetworkCommandSourceV1> = {}) {
  return createNetworkCommandV1({
    sessionId: "session:fixture", commandId: "command:1", idempotencyKey: "peer:1:sequence:0", peerId: "peer:human",
    connectionId: "connection:human", actorId: "actor:human", peerKind: "human", kind: "gameplay", requiredCapability: "interact",
    sequence: 0, expected: identity, expiresAt: 10_000, leaseKeys: ["machine:b", "machine:a", "machine:b"], payload: Uint8Array.from([1, 2, 3]),
    ...overrides,
  });
}

function grant(overrides: Partial<NetworkPeerGrantV1> = {}): NetworkPeerGrantV1 {
  return Object.freeze({
    sessionId: "session:fixture", peerId: "peer:human", connectionId: "connection:human", actorId: "actor:human",
    peerKind: "human", role: "guest", capabilities: ["observe", "chat", "interact"] as const, expiresAt: 20_000, nextSequence: 0, interest,
    ...overrides,
  });
}

test("handshake negotiation rejects incompatible engines/content and intersects capabilities", () => {
  const host = handshake("peer:host", "host");
  const guest = handshake("peer:guest", "guest", "agent");
  const accepted = negotiateNetworkHandshakeV1(host, guest);
  assert.equal(accepted.status, "compatible");
  assert.deepEqual(accepted.capabilities, ["observe", "chat", "interact", "inventory"]);
  assert.equal(negotiateNetworkHandshakeV1(host, { ...guest, engineVersion: "legacy-ts" }).code, "engine-mismatch");
  assert.equal(negotiateNetworkHandshakeV1(host, { ...guest, contentHash: HASH_B }).code, "content-mismatch");
  assert.equal(negotiateNetworkHandshakeV1(host, { ...guest, role: "host" }).code, "role-conflict");
});

test("interest and commands use stable order, defensive buffers, and canonical hashes", () => {
  assert.deepEqual(interest.chunks.map((chunk) => chunk.chunkX), [-1, 1]);
  assert.deepEqual(interest.entityIds, ["entity:alpha", "entity:zeta"]);
  const sourcePayload = Uint8Array.from([1, 2, 3]);
  const built = command({ payload: sourcePayload });
  assert.deepEqual(built.leaseKeys, ["machine:a", "machine:b"]);
  assert.notEqual(built.payload.buffer, sourcePayload.buffer);
  sourcePayload[0] = 9;
  assert.deepEqual([...built.payload], [1, 2, 3]);
  assert.equal(command().commandHash, built.commandHash);
});

test("human and agent commands share idempotency, revisions, capabilities, interest, and lease validation", () => {
  const authority = new TypeScriptNetworkAuthorityV1("session:fixture");
  authority.upsertGrant(grant());
  authority.upsertGrant(grant({ peerId: "peer:agent", connectionId: "connection:agent", actorId: "actor:agent", peerKind: "agent", capabilities: ["observe", "interact", "agent-work"] }));
  const human = command();
  const humanAccepted = authority.authorize(human, identity, 100);
  assert.equal(humanAccepted.status, "accepted");
  assert.equal(authority.authorize(human, identity, 100), humanAccepted, "duplicate delivery returns the exact cached final receipt");
  assert.equal(authority.activeLeaseCount(), 2);

  const agent = command({ commandId: "command:agent", idempotencyKey: "peer:agent:sequence:0", peerId: "peer:agent", connectionId: "connection:agent", actorId: "actor:agent", peerKind: "agent", kind: "agent", requiredCapability: "agent-work", leaseKeys: ["machine:a"] });
  const conflict = authority.authorize(agent, identity, 100);
  assert.equal(conflict.status, "rejected");
  if (conflict.status === "rejected") assert.equal(conflict.code, "lease-conflict");
  authority.releaseCommand(human.commandId);
  const retriedWithNewKey = createNetworkCommandV1({ ...agent, idempotencyKey: "peer:agent:sequence:0:retry" });
  assert.equal(authority.authorize(retriedWithNewKey, identity, 100).status, "accepted");

  const staleIdentity = createNetworkAuthorityIdentityV1(ADDRESS, { ...identity.revision, gameplay: identity.revision.gameplay - 1 });
  const stale = command({ commandId: "command:stale", idempotencyKey: "peer:human:sequence:1", sequence: 1, expected: staleIdentity, leaseKeys: [] });
  const staleReceipt = authority.authorize(stale, identity, 100);
  assert.equal(staleReceipt.status, "rejected");
  if (staleReceipt.status === "rejected") assert.equal(staleReceipt.code, "stale-revision");

  authority.upsertGrant(grant({ peerId: "peer:outside", connectionId: "connection:outside", actorId: "actor:outside", interest: createNetworkInterestSetV1({ sequence: 1, chunks: [], entityIds: [] }) }));
  const outside = command({ commandId: "command:outside", idempotencyKey: "peer:outside:0", peerId: "peer:outside", connectionId: "connection:outside", actorId: "actor:outside", leaseKeys: [] });
  const denied = authority.authorize(outside, identity, 100);
  assert.equal(denied.status, "rejected");
  if (denied.status === "rejected") assert.equal(denied.code, "interest-denied");
});

test("delta records are canonical, bounded, interest-scoped, and transfer coarse buffers", () => {
  const nextIdentity = createNetworkAuthorityIdentityV1(ADDRESS, { ...identity.revision, entities: identity.revision.entities + 1 });
  const delta = createNetworkDeltaV1({
    sessionId: "session:fixture", deltaId: "delta:1", peerId: "peer:human", keyframe: false, sequence: 1, acknowledgedCommandSequence: 0,
    from: identity, to: nextIdentity, interestHash: interest.interestHash,
    records: [
      { kind: "entity", recordId: "zeta", revision: 2, payload: Uint8Array.from([9, 9]) },
      { kind: "entity", recordId: "alpha", revision: 4, payload: Uint8Array.from([1, 1, 1]) },
    ],
  });
  assert.deepEqual(delta.records.map((record) => record.recordId), ["alpha", "zeta"]);
  assert.equal(delta.byteLength, 5);
  assert.equal(networkDeltaTransferListV1(delta).length, 2);
  assert.ok(networkDeltaMatchesInterestV1(delta, interest));
  assert.throws(() => createNetworkDeltaV1({
    ...delta,
    records: [
      { kind: "entity", recordId: "same", revision: 1, payload: Uint8Array.from([1]) },
      { kind: "entity", recordId: "same", revision: 2, payload: Uint8Array.from([2]) },
    ],
  }), /duplicate record/u);
});

test("reconnect checkpoints pinpoint the first divergent authority subsystem", () => {
  const checkpoint = createNetworkReconnectCheckpointV1({
    sessionId: "session:fixture", peerId: "peer:human", connectionGeneration: 2,
    acknowledgedCommandSequence: 8, acknowledgedDeltaSequence: 11, identity, interestHash: interest.interestHash,
  });
  assert.equal(diagnoseNetworkDesyncV1(checkpoint, identity), null);
  const divergent = createNetworkAuthorityIdentityV1(ADDRESS, { ...identity.revision, entities: identity.revision.entities + 1, gameplay: identity.revision.gameplay + 1 });
  const diagnostic = diagnoseNetworkDesyncV1(checkpoint, divergent);
  assert.equal(diagnostic?.firstDivergentSubsystem, "entities");
  assert.equal(diagnostic?.replaySequence, 8);
});
