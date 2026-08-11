import {
  WORLD_AUTHORITY_PROTOCOL_V1,
  WORLD_AUTHORITY_SCHEMA_V1,
  createWorldReadWindowV1,
  sameWorldAddressV1,
  sameWorldRevisionV1,
  worldAddressKeyV1,
  worldSectionAddressKeyV1,
  type WorldAuthorityIdentityV1,
  type WorldReadWindowV1,
  type WorldSectionAddressV1,
  type WorldSectionRevisionV1,
} from "./world-authority-contract";

export type RustWorldMirrorRequestV1 = Readonly<{
  type: "rust-world-mirror-read-v1";
  protocolVersion: typeof WORLD_AUTHORITY_PROTOCOL_V1;
  schemaVersion: typeof WORLD_AUTHORITY_SCHEMA_V1;
  requestId: number;
  snapshot: WorldReadWindowV1;
}>;

export type RustWorldMirrorResponseV1 = Readonly<{
  type: "rust-world-mirror-result-v1";
  protocolVersion: typeof WORLD_AUTHORITY_PROTOCOL_V1;
  schemaVersion: typeof WORLD_AUTHORITY_SCHEMA_V1;
  requestId: number;
  sourceSnapshotHash: string;
  sourceIdentity: WorldAuthorityIdentityV1;
  resultHash: string;
  /** Renderer/simulation-independent opaque output owned by the caller. */
  payload: Uint8Array;
}>;

export interface RustWorldMirrorTransportV1 {
  evaluate(request: RustWorldMirrorRequestV1, transfer?: readonly ArrayBuffer[]): Promise<RustWorldMirrorResponseV1>;
  dispose?(): void | Promise<void>;
}

export type RustWorldMirrorCurrentStateV1 = Readonly<{
  identity(): WorldAuthorityIdentityV1;
  section(address: WorldSectionAddressV1): WorldSectionRevisionV1 | null;
}>;

export type RustWorldMirrorResultV1 =
  | Readonly<{ status: "disabled"; reason: "not-enabled" | "transport-unavailable" }>
  | Readonly<{ status: "ready"; sourceSnapshotHash: string; resultHash: string; payload: Uint8Array }>
  | Readonly<{ status: "stale"; reason: "authority-changed" | "section-changed" | "superseded-request" }>
  | Readonly<{ status: "error"; reason: "transport-error" | "invalid-response"; message: string }>;

export type RustWorldMirrorDiagnosticsV1 = Readonly<{
  enabled: boolean;
  submitted: number;
  completed: number;
  stale: number;
  failed: number;
  pending: number;
  transferredBytes: number;
  lastError: string | null;
}>;

export function cloneWorldReadWindowForTransferV1(snapshot: WorldReadWindowV1) {
  return createWorldReadWindowV1({
    address: snapshot.address,
    origin: snapshot.origin,
    size: snapshot.size,
    identity: snapshot.identity,
    sectionRevisions: snapshot.sectionRevisions,
    streams: snapshot.streams,
  });
}

export function worldReadWindowTransferListV1(snapshot: WorldReadWindowV1) {
  return [
    snapshot.streams.loadedMask.buffer as ArrayBuffer,
    snapshot.streams.boundary.buffer as ArrayBuffer,
    snapshot.streams.blocks.buffer as ArrayBuffer,
    snapshot.streams.facing.buffer as ArrayBuffer,
    snapshot.streams.liquidKind.buffer as ArrayBuffer,
    snapshot.streams.liquidLevel.buffer as ArrayBuffer,
    snapshot.streams.flags.buffer as ArrayBuffer,
  ] as const;
}

function identityMatches(left: WorldAuthorityIdentityV1, right: WorldAuthorityIdentityV1) {
  return sameWorldAddressV1(left.address, right.address)
    && sameWorldRevisionV1(left.revision, right.revision)
    && left.stateHash === right.stateHash;
}

function sectionMatches(left: WorldSectionRevisionV1, right: WorldSectionRevisionV1 | null) {
  return Boolean(right)
    && worldSectionAddressKeyV1(left.address) === worldSectionAddressKeyV1(right!.address)
    && left.blocks === right!.blocks
    && left.metadata === right!.metadata
    && left.halo === right!.halo;
}

/**
 * Dormant coarse Rust read mirror. It can compare/derive data from immutable
 * snapshots, but deliberately exposes no mutation method and grants no world
 * authority. The adapter does not contact a transport unless explicitly enabled.
 */
export class RustWorldAuthorityMirrorV1 {
  private nextRequestId = 1;
  private latestRequestByWorld = new Map<string, number>();
  private submitted = 0;
  private completed = 0;
  private stale = 0;
  private failed = 0;
  private pending = 0;
  private transferredBytes = 0;
  private lastError: string | null = null;

  constructor(
    private readonly options: Readonly<{
      enabled?: boolean;
      transport?: RustWorldMirrorTransportV1;
    }> = {},
  ) {}

  async inspect(snapshot: WorldReadWindowV1, current: RustWorldMirrorCurrentStateV1): Promise<RustWorldMirrorResultV1> {
    if (!this.options.enabled) return Object.freeze({ status: "disabled", reason: "not-enabled" });
    if (!this.options.transport) return Object.freeze({ status: "disabled", reason: "transport-unavailable" });
    const requestId = this.nextRequestId++;
    const worldKey = worldAddressKeyV1(snapshot.address);
    this.latestRequestByWorld.set(worldKey, requestId);
    if (!identityMatches(snapshot.identity, current.identity())) return this.markStale("authority-changed");
    if (snapshot.sectionRevisions.some((section) => !sectionMatches(section, current.section(section.address)))) return this.markStale("section-changed");

    const transferredSnapshot = cloneWorldReadWindowForTransferV1(snapshot);
    const transfer = worldReadWindowTransferListV1(transferredSnapshot);
    this.submitted += 1;
    this.pending += 1;
    this.transferredBytes += transfer.reduce((total, buffer) => total + buffer.byteLength, 0);
    let response: RustWorldMirrorResponseV1;
    try {
      response = await this.options.transport.evaluate(Object.freeze({
        type: "rust-world-mirror-read-v1",
        protocolVersion: WORLD_AUTHORITY_PROTOCOL_V1,
        schemaVersion: WORLD_AUTHORITY_SCHEMA_V1,
        requestId,
        snapshot: transferredSnapshot,
      }), transfer);
    } catch (error) {
      this.pending -= 1;
      this.failed += 1;
      this.lastError = error instanceof Error ? error.message : String(error);
      return Object.freeze({ status: "error", reason: "transport-error", message: this.lastError });
    }
    this.pending -= 1;
    if (this.latestRequestByWorld.get(worldKey) !== requestId) return this.markStale("superseded-request");
    if (!identityMatches(snapshot.identity, current.identity())) return this.markStale("authority-changed");
    if (snapshot.sectionRevisions.some((section) => !sectionMatches(section, current.section(section.address)))) return this.markStale("section-changed");
    const valid = response.type === "rust-world-mirror-result-v1"
      && response.protocolVersion === WORLD_AUTHORITY_PROTOCOL_V1
      && response.schemaVersion === WORLD_AUTHORITY_SCHEMA_V1
      && response.requestId === requestId
      && response.sourceSnapshotHash === snapshot.snapshotHash
      && identityMatches(response.sourceIdentity, snapshot.identity)
      && /^[0-9a-f]{32}$/u.test(response.resultHash)
      && response.payload instanceof Uint8Array;
    if (!valid) {
      this.failed += 1;
      this.lastError = "Rust world mirror returned a response that does not match its immutable source snapshot";
      return Object.freeze({ status: "error", reason: "invalid-response", message: this.lastError });
    }
    this.completed += 1;
    this.lastError = null;
    return Object.freeze({
      status: "ready",
      sourceSnapshotHash: response.sourceSnapshotHash,
      resultHash: response.resultHash,
      payload: Uint8Array.from(response.payload),
    });
  }

  private markStale(reason: Extract<RustWorldMirrorResultV1, { status: "stale" }>["reason"]): RustWorldMirrorResultV1 {
    this.stale += 1;
    return Object.freeze({ status: "stale", reason });
  }

  diagnostics(): RustWorldMirrorDiagnosticsV1 {
    return Object.freeze({
      enabled: Boolean(this.options.enabled),
      submitted: this.submitted,
      completed: this.completed,
      stale: this.stale,
      failed: this.failed,
      pending: this.pending,
      transferredBytes: this.transferredBytes,
      lastError: this.lastError,
    });
  }

  async dispose() {
    this.latestRequestByWorld.clear();
    await this.options.transport?.dispose?.();
  }
}
