import {
  NETWORK_CAPABILITY_ORDER_V1,
  createNetworkInterestSetV1,
  type NetworkAuthorityIdentityV1,
  type NetworkDeltaRecordV1,
  type NetworkInterestSetV1,
  type NetworkPeerGrantV1,
} from "./network-authority-contract";
import { rustIntegratedRuntimeWireChecksumV1 } from "./rust-integrated-runtime-codec";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const HASH = /^[0-9a-f]{32}$/u;

export const RUST_INTEGRATED_NETWORK_PEER_GRANT_TYPE_V1 = "blockwild.network.peer-grant.install.v1";
export const RUST_INTEGRATED_NETWORK_AGENT_GRANT_TYPE_V1 = "blockwild.network.agent-grant.install.v1";
export const RUST_INTEGRATED_NETWORK_REPLICATION_UPSERT_TYPE_V1 = "blockwild.network.replication-record.upsert.v1";
export const RUST_INTEGRATED_NETWORK_REPLICATION_REMOVE_TYPE_V1 = "blockwild.network.replication-record.remove.v1";
export const RUST_INTEGRATED_NETWORK_DELTA_BUILD_TYPE_V1 = "blockwild.network.delta.build.v1";
export const RUST_INTEGRATED_NETWORK_DELTA_BUILD_RESPONSE_TYPE_V1 = "blockwild.network.delta.build-response.v1";
export const RUST_INTEGRATED_NETWORK_RECONNECT_TYPE_V1 = "blockwild.network.reconnect-checkpoint.read.v1";
export const RUST_INTEGRATED_NETWORK_RECONNECT_RESPONSE_TYPE_V1 = "blockwild.network.reconnect-checkpoint.response.v1";
export const RUST_INTEGRATED_NETWORK_PEER_RELEASE_TYPE_V1 = "blockwild.network.peer.release.v1";
export const RUST_INTEGRATED_NETWORK_COMMAND_RELEASE_TYPE_V1 = "blockwild.network.command.release.v1";

const AGENT_CAPABILITIES = [
  "observe.world", "move.self", "interact.basic", "inventory.self.read", "inventory.self.write",
  "container.read", "container.write", "player.location.read", "player.inventory.read", "build",
  "harvest", "chat.send", "voice.send", "diagnostics", "world.admin",
] as const;
const AGENT_STATUSES = ["pending", "approved", "paused", "revoked", "disconnected"] as const;
const RECORD_KINDS = ["world", "entity", "gameplay", "player", "agent", "tombstone"] as const;

export type RustIntegratedNetworkAgentGrantV1 = Readonly<{
  agentId: string;
  peerId: string;
  connectionId: string;
  status: typeof AGENT_STATUSES[number];
  requested: readonly typeof AGENT_CAPABILITIES[number][];
  granted: readonly typeof AGENT_CAPABILITIES[number][];
  expiresAt: number;
}>;

export type RustIntegratedReplicationScopeV1 =
  | Readonly<{ kind: "global" }>
  | Readonly<{ kind: "location"; universeId: string; locationId: string }>
  | Readonly<{ kind: "chunk"; universeId: string; locationId: string; chunkX: number; chunkZ: number }>
  | Readonly<{ kind: "entity"; entityId: string }>;

export type RustIntegratedScopedDeltaRecordV1 = Readonly<{
  scope: RustIntegratedReplicationScopeV1;
  record: NetworkDeltaRecordV1;
}>;

export type RustIntegratedNetworkDeltaBuildRequestV1 = Readonly<{
  sessionId: string;
  deltaId: string;
  peerId: string;
  keyframe: boolean;
  sequence: number;
  acknowledgedCommandSequence: number;
  from: NetworkAuthorityIdentityV1;
  to: NetworkAuthorityIdentityV1;
  interest: NetworkInterestSetV1;
}>;

export type RustIntegratedNetworkDeltaBuildResponseV1 = Readonly<{
  scopeProbes: number;
  candidateRecords: number;
  emittedRecords: number;
  deltaPacket: Uint8Array;
}>;

class Writer {
  private readonly parts: Uint8Array[] = [];
  private length = 0;
  private append(value: Uint8Array) { this.parts.push(value); this.length += value.byteLength; }
  u8(value: number) { this.append(Uint8Array.of(value)); }
  flag(value: boolean) { this.u8(value ? 1 : 0); }
  u16(value: number) { const bytes = new Uint8Array(2); new DataView(bytes.buffer).setUint16(0, value, true); this.append(bytes); }
  u32(value: number) { const bytes = new Uint8Array(4); new DataView(bytes.buffer).setUint32(0, value, true); this.append(bytes); }
  i32(value: number) { const bytes = new Uint8Array(4); new DataView(bytes.buffer).setInt32(0, value, true); this.append(bytes); }
  u64(value: number) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("integrated network u64 is outside JavaScript's exact range");
    const bytes = new Uint8Array(8); const view = new DataView(bytes.buffer);
    view.setUint32(0, value >>> 0, true); view.setUint32(4, Math.floor(value / 0x1_0000_0000), true); this.append(bytes);
  }
  bytes(value: Uint8Array) { this.u32(value.byteLength); this.append(value); }
  string(value: string) { this.bytes(encoder.encode(value)); }
  hash(value: string) {
    if (!HASH.test(value)) throw new Error("integrated network hash is not canonical hex");
    this.append(Uint8Array.from({ length: 16 }, (_, index) => Number.parseInt(value.slice(index * 2, index * 2 + 2), 16)));
  }
  raw(value: Uint8Array) { this.append(value); }
  finish() { const output = new Uint8Array(this.length); let offset = 0; for (const part of this.parts) { output.set(part, offset); offset += part.byteLength; } return output; }
}

class Reader {
  private offset = 0;
  constructor(private readonly bytes: Uint8Array) {}
  take(length: number) { const end = this.offset + length; if (end > this.bytes.byteLength) throw new Error("integrated network packet is truncated"); const value = this.bytes.subarray(this.offset, end); this.offset = end; return value; }
  u8() { return this.take(1)[0]; }
  u16() { const value = this.take(2); return new DataView(value.buffer, value.byteOffset, 2).getUint16(0, true); }
  u32() { const value = this.take(4); return new DataView(value.buffer, value.byteOffset, 4).getUint32(0, true); }
  bytesValue() { return Uint8Array.from(this.take(this.u32())); }
  stringValue() { return decoder.decode(this.bytesValue()); }
  finish() { if (this.offset !== this.bytes.byteLength) throw new Error("integrated network packet has trailing bytes"); }
}

function checksumBytes(value: string) {
  return Uint8Array.from({ length: 16 }, (_, index) => Number.parseInt(value.slice(index * 2, index * 2 + 2), 16));
}

function wrap(magic: string, body: Uint8Array) {
  const writer = new Writer(); writer.raw(encoder.encode(magic)); writer.u16(1); writer.u16(1); writer.u32(body.byteLength);
  writer.raw(checksumBytes(rustIntegratedRuntimeWireChecksumV1(body))); writer.raw(body); return writer.finish();
}

function unwrap(magic: string, packet: Uint8Array) {
  const reader = new Reader(packet);
  if (decoder.decode(reader.take(4)) !== magic || reader.u16() !== 1 || reader.u16() !== 1) throw new Error("integrated network packet header mismatch");
  const length = reader.u32(); const checksum = [...reader.take(16)].map((value) => value.toString(16).padStart(2, "0")).join("");
  const body = reader.take(length); reader.finish();
  if (rustIntegratedRuntimeWireChecksumV1(body) !== checksum) throw new Error("integrated network packet checksum mismatch");
  return body;
}

function writeIdentity(writer: Writer, value: NetworkAuthorityIdentityV1) {
  writer.string(value.address.universeId); writer.string(value.address.locationId);
  writer.u64(value.revision.epoch); writer.u64(value.revision.world); writer.u64(value.revision.entities);
  writer.u64(value.revision.gameplay); writer.u64(value.revision.persistence); writer.hash(value.stateHash);
}

function writeInterest(writer: Writer, value: NetworkInterestSetV1) {
  const interest = createNetworkInterestSetV1(value);
  if (interest.interestHash !== value.interestHash) throw new Error("integrated network interest is not canonical");
  writer.u64(interest.sequence); writer.u32(interest.chunks.length);
  for (const chunk of interest.chunks) { writer.string(chunk.universeId); writer.string(chunk.locationId); writer.i32(chunk.chunkX); writer.i32(chunk.chunkZ); }
  writer.u32(interest.entityIds.length); for (const entityId of interest.entityIds) writer.string(entityId); writer.hash(interest.interestHash);
}

function writeRecord(writer: Writer, value: NetworkDeltaRecordV1) {
  const tag = RECORD_KINDS.indexOf(value.kind); if (tag < 0) throw new Error("unknown integrated network record kind");
  writer.u8(tag); writer.string(value.recordId); writer.u64(value.revision); writer.bytes(value.payload); writer.hash(value.payloadHash);
}

export function encodeRustIntegratedNetworkPeerGrantV1(value: NetworkPeerGrantV1) {
  const writer = new Writer(); writer.string(value.sessionId); writer.string(value.peerId); writer.string(value.connectionId); writer.string(value.actorId);
  writer.u8(value.peerKind === "human" ? 0 : 1); writer.u8(value.role === "host" ? 0 : 1);
  writer.u8(value.capabilities.length);
  for (const capability of value.capabilities) { const tag = NETWORK_CAPABILITY_ORDER_V1.indexOf(capability); if (tag < 0) throw new Error("unknown network capability"); writer.u8(tag); }
  writer.u64(value.expiresAt); writer.u64(value.nextSequence); writeInterest(writer, value.interest); return wrap("BWP9", writer.finish());
}

export function encodeRustIntegratedNetworkAgentGrantV1(value: RustIntegratedNetworkAgentGrantV1) {
  const writer = new Writer(); writer.string(value.agentId); writer.string(value.peerId); writer.string(value.connectionId);
  writer.u8(AGENT_STATUSES.indexOf(value.status));
  for (const capabilities of [value.requested, value.granted]) {
    writer.u8(capabilities.length);
    for (const capability of capabilities) { const tag = AGENT_CAPABILITIES.indexOf(capability); if (tag < 0) throw new Error("unknown agent capability"); writer.u8(tag); }
  }
  writer.u64(value.expiresAt); return wrap("BWJ9", writer.finish());
}

export function encodeRustIntegratedNetworkReplicationRecordV1(value: RustIntegratedScopedDeltaRecordV1) {
  const writer = new Writer();
  if (value.scope.kind === "global") writer.u8(0);
  else if (value.scope.kind === "location") { writer.u8(1); writer.string(value.scope.universeId); writer.string(value.scope.locationId); }
  else if (value.scope.kind === "chunk") { writer.u8(2); writer.string(value.scope.universeId); writer.string(value.scope.locationId); writer.i32(value.scope.chunkX); writer.i32(value.scope.chunkZ); }
  else { writer.u8(3); writer.string(value.scope.entityId); }
  writeRecord(writer, value.record); return wrap("BWI9", writer.finish());
}

export function encodeRustIntegratedNetworkDeltaBuildV1(value: RustIntegratedNetworkDeltaBuildRequestV1) {
  const writer = new Writer(); writer.string(value.sessionId); writer.string(value.deltaId); writer.string(value.peerId); writer.flag(value.keyframe);
  writer.u64(value.sequence); writer.u64(value.acknowledgedCommandSequence); writeIdentity(writer, value.from); writeIdentity(writer, value.to);
  writeInterest(writer, value.interest); return wrap("BWD9", writer.finish());
}

export function decodeRustIntegratedNetworkDeltaBuildResponseV1(packet: Uint8Array): RustIntegratedNetworkDeltaBuildResponseV1 {
  const reader = new Reader(packet); if (decoder.decode(reader.take(4)) !== "BWH9" || reader.u16() !== 1) throw new Error("integrated delta response header mismatch");
  const result = Object.freeze({ scopeProbes: reader.u32(), candidateRecords: reader.u32(), emittedRecords: reader.u32(), deltaPacket: reader.bytesValue() }); reader.finish(); return result;
}

export function encodeRustIntegratedNetworkReconnectV1(sessionId: string, peerId: string, connectionGeneration: number) {
  const writer = new Writer(); writer.string(sessionId); writer.string(peerId); writer.u64(connectionGeneration); return wrap("BWC9", writer.finish());
}

export function decodeRustIntegratedNetworkReconnectResponseV1(packet: Uint8Array) {
  const reader = new Reader(packet); if (decoder.decode(reader.take(4)) !== "BWC9" || reader.u16() !== 1) throw new Error("integrated reconnect response header mismatch");
  const present = reader.u8(); if (present > 1) throw new Error("integrated reconnect response flag is invalid"); const result = present === 1 ? reader.bytesValue() : null; reader.finish(); return result;
}

export function encodeRustIntegratedNetworkPeerReleaseV1(peerId: string) { const writer = new Writer(); writer.string(peerId); return wrap("BWL9", writer.finish()); }

export function encodeRustIntegratedNetworkCommandReleaseV1(commandId: string) { const writer = new Writer(); writer.string(commandId); return wrap("BWM9", writer.finish()); }

export function decodeRustIntegratedNetworkCommandReleaseV1(packet: Uint8Array) {
  const reader = new Reader(unwrap("BWM9", packet));
  const commandId = reader.stringValue();
  reader.finish();
  return commandId;
}
