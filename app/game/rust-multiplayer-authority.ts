import {
  AGENT_COMMAND_KINDS,
  AGENT_MAX_COMMAND_BYTES,
  type AgentCapabilityGrant,
  type AgentCommandEnvelope,
} from "./agent-platform";
import {
  NETWORK_MAX_COMMAND_BYTES_V1,
  createNetworkReconnectCheckpointV1,
  type NetworkAuthorityIdentityV1,
  type NetworkCapabilityV1,
  type NetworkCommandKindV1,
  type NetworkInterestSetV1,
  type NetworkPeerGrantV1,
} from "./network-authority-contract";
import type { RustIntegratedNetworkRuntimePortV1 } from "./rust-integrated-runtime-domain-adapters";
import type {
  RustIntegratedNetworkDeltaBuildRequestV1,
  RustIntegratedScopedDeltaRecordV1,
} from "./rust-integrated-runtime-network-lifecycle";
import { RustNetworkRuntimeContractError } from "./rust-network-runtime-contract";
import { RustNetworkRuntimeServiceV1 } from "./rust-network-runtime-service";
import {
  encodeNetworkCommandSourceWireV1,
  encodeNetworkHandshakeSourceWireV1,
  encodeNetworkReconnectCheckpointWireV1,
} from "./rust-network-wire-v1";
import { TypeScriptCanonicalHasher } from "./rust-kernel-shadow";

const encoder = new TextEncoder();
const AGENT_WORK_MAGIC = encoder.encode("BWA1");
const AGENT_WORK_SCHEMA = 1;
const AGENT_WORK_PROTOCOL = 1;
const AGENT_MAX_WORK_UNITS = 2_048;
const DEFAULT_GRANT_LIFETIME_MS = 10 * 60_000;

export type RustMultiplayerAuthorityModeV1 = "rust-authoritative" | "legacy-compatibility";

export type RustMultiplayerAuthorityPeerV1 = Readonly<{
  sessionId: string;
  peerId: string;
  connectionId: string;
  actorId: string;
  peerKind: "human" | "agent";
  role: "host" | "guest";
  capabilities: readonly NetworkCapabilityV1[];
  expiresAt: number;
  nextSequence: number;
  interest: NetworkInterestSetV1;
  connectionGeneration: number;
}>;

export type RustMultiplayerInboundCommandV1 = Readonly<{
  sessionId: string;
  peerId: string;
  connectionId: string;
  peerKind: "human" | "agent";
  actorId: string;
  messageType: string;
  sequence: number;
  sentAt: number;
  expected: NetworkAuthorityIdentityV1;
  encodedEnvelope: string;
  payload: unknown;
}>;

export type RustMultiplayerAuthorityDecisionV1 = Readonly<{
  accepted: boolean;
  commandId: string;
  idempotencyKey: string;
  code: string;
  receiptHash: string | null;
}>;

export type RustMultiplayerDeltaFrameV1 = Readonly<{
  sessionId: string;
  peerId: string;
  connectionGeneration: number;
  keyframe: boolean;
  interest: NetworkInterestSetV1;
  remoteIdentity: NetworkAuthorityIdentityV1;
  packet: Uint8Array;
}>;

export interface RustMultiplayerAuthorityV1 {
  readonly backend: "rust-wasm-worker";
  currentIdentity(): NetworkAuthorityIdentityV1;
  createHandshake(input: Readonly<{ sessionId: string; peerId: string; peerKind: "human" | "agent"; role: "host" | "guest" }>): Uint8Array;
  negotiate(hostPacket: Uint8Array, peerPacket: Uint8Array): Promise<Readonly<{ capabilities: readonly NetworkCapabilityV1[]; maxCommandBytes: number }>>;
  installPeer(peer: RustMultiplayerAuthorityPeerV1): Promise<void>;
  authorizeInbound(command: RustMultiplayerInboundCommandV1): Promise<RustMultiplayerAuthorityDecisionV1>;
  installAgentGrant(grant: AgentCapabilityGrant, peer: RustMultiplayerAuthorityPeerV1): Promise<void>;
  upsertReplicationRecord(value: RustIntegratedScopedDeltaRecordV1): Promise<void>;
  removeReplicationRecord(value: RustIntegratedScopedDeltaRecordV1): Promise<void>;
  buildDelta(value: RustIntegratedNetworkDeltaBuildRequestV1): Promise<Readonly<{ scopeProbes: number; candidateRecords: number; emittedRecords: number; packet: Uint8Array }>>;
  acceptDelta(value: RustMultiplayerDeltaFrameV1): Promise<Readonly<{ code: string; sequence: number; stateHash: string }>>;
  reconnectCheckpoint(sessionId: string, peerId: string, connectionGeneration: number): Promise<Uint8Array | null>;
  releaseCommand(commandId: string): Promise<void>;
  releasePeer(peerId: string): Promise<void>;
  drain(): Promise<void>;
}

export type IntegratedRustMultiplayerAuthorityOptionsV1 = Readonly<{
  network: RustNetworkRuntimeServiceV1;
  lifecycle: RustIntegratedNetworkRuntimePortV1;
  identity: () => NetworkAuthorityIdentityV1;
  engineVersion: string;
  contentHash: string;
  generatorHash: string;
  now?: () => number;
  grantLifetimeMs?: number;
}>;

type CommandShape = Readonly<{
  kind: NetworkCommandKindV1;
  capability: NetworkCapabilityV1;
}>;

const COMMAND_SHAPES: Readonly<Record<string, CommandShape>> = Object.freeze({
  "player-pose": { kind: "gameplay", capability: "interact" },
  "block-action": { kind: "world", capability: "build" },
  "sleep-vote": { kind: "gameplay", capability: "interact" },
  "inventory-action": { kind: "gameplay", capability: "inventory" },
  "container-action": { kind: "gameplay", capability: "inventory" },
  "facility-action": { kind: "gameplay", capability: "interact" },
  "player-state": { kind: "gameplay", capability: "interact" },
  "player-progress": { kind: "gameplay", capability: "interact" },
  "boat-action": { kind: "gameplay", capability: "travel" },
  "combat-action": { kind: "gameplay", capability: "combat" },
  "creature-action": { kind: "gameplay", capability: "creature-care" },
  "tcg-action": { kind: "gameplay", capability: "interact" },
  "map-share": { kind: "gameplay", capability: "travel" },
  "agent-command": { kind: "agent", capability: "agent-work" },
  chat: { kind: "chat", capability: "chat" },
  "voice-chunk": { kind: "chat", capability: "chat" },
});

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stableLeaseKey(prefix: string, value: unknown) {
  const source = typeof value === "string" ? value : JSON.stringify(value);
  return `${prefix}:${new TypeScriptCanonicalHasher("blockwild-network-lease-key-v1").writeString(source).finishHex()}`;
}

function commandIdentity(value: RustMultiplayerInboundCommandV1) {
  const payload = record(value.payload);
  if (value.messageType === "agent-command" && typeof payload?.commandId === "string") return payload.commandId;
  if (typeof payload?.requestId === "string") return payload.requestId;
  return `${value.messageType}:${value.peerId}:${value.sequence}`;
}

function commandLeaseKeys(value: RustMultiplayerInboundCommandV1) {
  const payload = record(value.payload) ?? {};
  const keys = value.messageType === "block-action" ? [] : [stableLeaseKey("request", `${value.sessionId}/${value.peerId}/${commandIdentity(value)}`)];
  if (value.messageType === "block-action") {
    const edits = Array.isArray(payload.edits) ? payload.edits : [];
    for (const edit of edits) {
      const cell = record(edit);
      keys.push(stableLeaseKey("block", [cell?.x, cell?.y, cell?.z]));
    }
  }
  else if (value.messageType === "container-action") keys.push(stableLeaseKey("container", payload.containerKey ?? payload.target ?? value.actorId));
  else if (value.messageType === "facility-action") keys.push(stableLeaseKey("facility", payload.facilityKey ?? payload.key ?? value.actorId));
  else if (value.messageType === "boat-action") keys.push(stableLeaseKey("boat", payload.boatId ?? value.actorId));
  else if (value.messageType === "combat-action") keys.push(stableLeaseKey("combat", payload.targetId ?? payload.mobId ?? value.actorId));
  else if (value.messageType === "creature-action") keys.push(stableLeaseKey("creature", payload.creatureId ?? payload.mobId ?? value.actorId));
  else if (value.messageType === "agent-command") keys.push(stableLeaseKey("agent", value.actorId));
  else if (["inventory-action", "player-state", "player-progress"].includes(value.messageType)) keys.push(stableLeaseKey("player", value.actorId));
  return Object.freeze([...new Set(keys)].sort());
}

class BinaryWriter {
  private readonly parts: Uint8Array[] = [];
  private length = 0;
  private append(value: Uint8Array) { this.parts.push(value); this.length += value.byteLength; }
  raw(value: Uint8Array) { this.append(value); }
  u8(value: number) { this.append(Uint8Array.of(value)); }
  u16(value: number) { const bytes = new Uint8Array(2); new DataView(bytes.buffer).setUint16(0, value, true); this.append(bytes); }
  u32(value: number) { const bytes = new Uint8Array(4); new DataView(bytes.buffer).setUint32(0, value, true); this.append(bytes); }
  u64(value: number) {
    if (!Number.isSafeInteger(value) || value < 0) throw new RustNetworkRuntimeContractError("integer", "agent work u64 exceeds JavaScript's exact range");
    const bytes = new Uint8Array(8); const view = new DataView(bytes.buffer);
    view.setUint32(0, value >>> 0, true); view.setUint32(4, Math.floor(value / 0x1_0000_0000), true); this.append(bytes);
  }
  bytes(value: Uint8Array) { this.u32(value.byteLength); this.append(value); }
  string(value: string) { this.bytes(encoder.encode(value)); }
  finish() { const output = new Uint8Array(this.length); let offset = 0; for (const part of this.parts) { output.set(part, offset); offset += part.byteLength; } return output; }
}

function agentWorkUnits(command: AgentCommandEnvelope) {
  const args = record(command.arguments) ?? {};
  const candidates = [args.placements, args.removals, args.cells, args.targets]
    .filter(Array.isArray)
    .reduce((total, value) => total + (value as unknown[]).length, 0);
  return Math.max(1, Math.min(AGENT_MAX_WORK_UNITS, candidates || 1));
}

function encodeAgentWorkCommand(command: AgentCommandEnvelope) {
  const kindTag = AGENT_COMMAND_KINDS.indexOf(command.kind);
  if (kindTag < 0) throw new RustNetworkRuntimeContractError("agent-kind", "unknown agent command kind");
  const taskId = typeof command.arguments.taskId === "string" && command.arguments.taskId.length <= 128
    ? command.arguments.taskId
    : null;
  const argumentsBytes = encoder.encode(JSON.stringify({ arguments: command.arguments, ...(command.clientIntent ? { clientIntent: command.clientIntent } : {}) }));
  if (argumentsBytes.byteLength > AGENT_MAX_COMMAND_BYTES) throw new RustNetworkRuntimeContractError("agent-size", "agent command arguments exceed the Rust V1 budget");
  const workUnits = agentWorkUnits(command);
  const hash = new TypeScriptCanonicalHasher("blockwild-agent-work-command-v1")
    .writeU16(AGENT_WORK_SCHEMA).writeU16(AGENT_WORK_PROTOCOL)
    .writeString(command.commandId).writeString(command.agentId).writeString(command.kind)
    .writeU64(command.expectedWorldRevision).writeU64(command.issuedAt).writeU64(command.expiresAt)
    .writeU16(workUnits).writeU16(taskId ? 1 : 0);
  if (taskId) hash.writeString(taskId);
  hash.writeBytes(argumentsBytes);
  const commandHash = hash.finishHex();
  const writer = new BinaryWriter();
  writer.raw(AGENT_WORK_MAGIC); writer.u16(AGENT_WORK_SCHEMA); writer.u16(AGENT_WORK_PROTOCOL);
  writer.string(command.commandId); writer.string(command.agentId); writer.u8(kindTag);
  writer.u64(command.expectedWorldRevision); writer.u64(command.issuedAt); writer.u64(command.expiresAt); writer.u16(workUnits);
  writer.u8(taskId ? 1 : 0); if (taskId) writer.string(taskId);
  writer.bytes(argumentsBytes);
  writer.raw(Uint8Array.from({ length: 16 }, (_, index) => Number.parseInt(commandHash.slice(index * 2, index * 2 + 2), 16)));
  return writer.finish();
}

function agentEnvelope(value: unknown): AgentCommandEnvelope | null {
  const candidate = record(value);
  if (!candidate || candidate.schema !== 1 || typeof candidate.commandId !== "string" || typeof candidate.agentId !== "string"
    || typeof candidate.kind !== "string" || !AGENT_COMMAND_KINDS.includes(candidate.kind as AgentCommandEnvelope["kind"])
    || !Number.isSafeInteger(candidate.expectedWorldRevision) || !Number.isSafeInteger(candidate.issuedAt)
    || !Number.isSafeInteger(candidate.expiresAt) || !record(candidate.arguments)) return null;
  return candidate as AgentCommandEnvelope;
}

export class IntegratedRustMultiplayerAuthorityV1 implements RustMultiplayerAuthorityV1 {
  readonly backend = "rust-wasm-worker" as const;
  private readonly now: () => number;
  private readonly grantLifetimeMs: number;
  private readonly peerNextSequences = new Map<string, number>();
  private serial = Promise.resolve<unknown>(undefined);

  constructor(private readonly options: IntegratedRustMultiplayerAuthorityOptionsV1) {
    this.now = options.now ?? (() => Date.now());
    this.grantLifetimeMs = options.grantLifetimeMs ?? DEFAULT_GRANT_LIFETIME_MS;
    if (!Number.isSafeInteger(this.grantLifetimeMs) || this.grantLifetimeMs < 1_000 || this.grantLifetimeMs > 24 * 60 * 60_000) {
      throw new RustNetworkRuntimeContractError("grant-lifetime", "multiplayer grant lifetime is outside the V1 bound");
    }
  }

  currentIdentity() { return this.options.identity(); }

  createHandshake(input: Readonly<{ sessionId: string; peerId: string; peerKind: "human" | "agent"; role: "host" | "guest" }>) {
    return encodeNetworkHandshakeSourceWireV1({
      ...input,
      engineVersion: this.options.engineVersion,
      contentHash: this.options.contentHash,
      generatorHash: this.options.generatorHash,
      capabilities: ["observe", "chat", "interact", "inventory", "build", "combat", "creature-care", "trade", "travel", ...(input.peerKind === "agent" ? ["agent-work" as const] : [])],
      maxCommandBytes: NETWORK_MAX_COMMAND_BYTES_V1,
    });
  }

  async negotiate(hostPacket: Uint8Array, peerPacket: Uint8Array) {
    const result = await this.options.network.negotiate(hostPacket, peerPacket);
    if (result.kind !== "handshake") throw new RustNetworkRuntimeContractError("response-kind", `Expected Rust handshake response, received ${result.kind}`);
    if (!result.compatible || result.code !== "ok") throw new RustNetworkRuntimeContractError(result.code, result.message);
    return Object.freeze({ capabilities: result.capabilities, maxCommandBytes: result.maxCommandBytes });
  }

  installPeer(peer: RustMultiplayerAuthorityPeerV1) {
    const nextSequence = Math.max(peer.nextSequence, this.peerNextSequences.get(peer.peerId) ?? 0);
    const grant: NetworkPeerGrantV1 = Object.freeze({
      sessionId: peer.sessionId, peerId: peer.peerId, connectionId: peer.connectionId, actorId: peer.actorId,
      peerKind: peer.peerKind, role: peer.role, capabilities: peer.capabilities,
      expiresAt: peer.expiresAt || this.now() + this.grantLifetimeMs, nextSequence, interest: peer.interest,
    });
    return this.track(async () => {
      await this.options.lifecycle.installPeerGrant(grant);
      this.peerNextSequences.set(peer.peerId, nextSequence);
    });
  }

  authorizeInbound(command: RustMultiplayerInboundCommandV1) {
    return this.track(async () => {
      const shape = COMMAND_SHAPES[command.messageType];
      if (!shape) throw new RustNetworkRuntimeContractError("message-type", `Rust authority does not recognize ${command.messageType}`);
      const commandId = commandIdentity(command);
      const idempotencyKey = `idem:${new TypeScriptCanonicalHasher("blockwild-network-idempotency-v1").writeString(command.sessionId).writeString(command.peerId).writeString(commandId).finishHex()}`;
      const agent = command.messageType === "agent-command" ? agentEnvelope(command.payload) : null;
      if (command.messageType === "agent-command" && !agent) throw new RustNetworkRuntimeContractError("agent-envelope", "agent command cannot be encoded for Rust authority");
      const payload = agent ? encodeAgentWorkCommand(agent) : encoder.encode(command.encodedEnvelope);
      const expiresAt = agent?.expiresAt ?? Math.max(this.now() + 1, Math.min(this.now() + 120_000, command.sentAt + 30_000));
      const packet = encodeNetworkCommandSourceWireV1({
        sessionId: command.sessionId, commandId, idempotencyKey, peerId: command.peerId,
        connectionId: command.connectionId, actorId: command.actorId, peerKind: command.peerKind,
        kind: shape.kind, requiredCapability: shape.capability, sequence: command.sequence,
        expected: command.expected, expiresAt, leaseKeys: commandLeaseKeys(command), payload,
      });
      if (agent) {
        const response = await this.options.network.authorizeAgent(this.currentIdentity(), this.now(), packet, payload);
        if (response.kind !== "agent-command") throw new RustNetworkRuntimeContractError("response-kind", `Expected Rust agent-command response, received ${response.kind}`);
        const receipt = response.receipt;
        const accepted = response.code === "accepted" && receipt?.status === "accepted";
        if (accepted) this.peerNextSequences.set(command.peerId, Math.max(this.peerNextSequences.get(command.peerId) ?? 0, command.sequence + 1));
        return Object.freeze({
          accepted,
          commandId, idempotencyKey, code: response.code, receiptHash: receipt?.receiptHash ?? null,
        });
      }
      const response = await this.options.network.authorize(this.currentIdentity(), this.now(), [packet]);
      if (response.kind !== "command-batch") throw new RustNetworkRuntimeContractError("response-kind", `Expected Rust command-batch response, received ${response.kind}`);
      const receipt = response.receipts[0];
      if (response.receipts.length !== 1 || !receipt) throw new RustNetworkRuntimeContractError("receipt-count", "Rust authority did not return exactly one command receipt");
      const accepted = receipt.status === "accepted";
      if (accepted) this.peerNextSequences.set(command.peerId, Math.max(this.peerNextSequences.get(command.peerId) ?? 0, command.sequence + 1));
      return Object.freeze({
        accepted, commandId, idempotencyKey,
        code: receipt.status === "accepted" ? "accepted" : receipt.code,
        receiptHash: receipt.receiptHash,
      });
    });
  }

  installAgentGrant(grant: AgentCapabilityGrant, peer: RustMultiplayerAuthorityPeerV1) {
    return this.track(() => this.options.lifecycle.installAgentGrant({
      agentId: grant.agentId, peerId: peer.peerId, connectionId: grant.connectionId,
      status: grant.status, requested: grant.requested, granted: grant.granted,
      expiresAt: peer.expiresAt || this.now() + this.grantLifetimeMs,
    }));
  }

  upsertReplicationRecord(value: RustIntegratedScopedDeltaRecordV1) { return this.track(() => this.options.lifecycle.upsertReplicationRecord(value)); }
  removeReplicationRecord(value: RustIntegratedScopedDeltaRecordV1) { return this.track(() => this.options.lifecycle.removeReplicationRecord(value)); }

  buildDelta(value: RustIntegratedNetworkDeltaBuildRequestV1) {
    return this.track(async () => {
      const result = await this.options.lifecycle.buildDelta(value);
      return Object.freeze({ scopeProbes: result.scopeProbes, candidateRecords: result.candidateRecords, emittedRecords: result.emittedRecords, packet: result.deltaPacket });
    });
  }

  acceptDelta(value: RustMultiplayerDeltaFrameV1) {
    return this.track(async () => {
      const recovered = await this.options.lifecycle.reconnectCheckpoint(value.sessionId, value.peerId, value.connectionGeneration);
      const checkpoint = recovered ?? encodeNetworkReconnectCheckpointWireV1(createNetworkReconnectCheckpointV1({
        sessionId: value.sessionId, peerId: value.peerId, connectionGeneration: value.connectionGeneration,
        acknowledgedCommandSequence: 0, acknowledgedDeltaSequence: 0, identity: value.remoteIdentity,
        interestHash: value.interest.interestHash,
      }));
      const result = await this.options.network.validateDelta(checkpoint, value.interest, value.packet);
      if (result.kind !== "delta-delivery") throw new RustNetworkRuntimeContractError("response-kind", `Expected Rust delta-delivery response, received ${result.kind}`);
      return Object.freeze({ code: result.code, sequence: result.sequence, stateHash: result.stateHash });
    });
  }

  reconnectCheckpoint(sessionId: string, peerId: string, connectionGeneration: number) {
    return this.track(() => this.options.lifecycle.reconnectCheckpoint(sessionId, peerId, connectionGeneration));
  }

  releaseCommand(commandId: string) { return this.track(() => this.options.lifecycle.releaseCommand(commandId)); }
  releasePeer(peerId: string) {
    return this.track(async () => {
      await this.options.lifecycle.releasePeer(peerId);
      this.peerNextSequences.delete(peerId);
    });
  }
  async drain() { await this.serial; }

  private track<T>(operation: () => Promise<T>) {
    const next = this.serial.then(operation, operation);
    this.serial = next.then(() => undefined, () => undefined);
    return next;
  }
}
