import {
  assertMeshPacketMatchesSnapshotV1,
  assertSectionSnapshotV1,
  terrainSectionAddressKeyV1,
  terrainSectionRevisionKeyV1,
  type MeshPacketV1,
  type SectionSnapshotV1,
  type TerrainBufferPool,
  type TerrainSectionAddressV1,
  type TerrainSectionRevisionV1,
} from "./terrain-mesh-contract";

export type TerrainMesherBackendKind = "typescript-reference" | "rust-worker-shadow";

export type TerrainMesherRequestOptions = Readonly<{
  signal?: AbortSignal;
  /**
   * Optional authoritative oracle. A result is rejected when the source
   * revision ceased to be current while the worker was running.
   */
  currentRevision?: (address: TerrainSectionAddressV1) => TerrainSectionRevisionV1 | null;
}>;

export type TerrainMeshReadyResult = Readonly<{
  status: "ready";
  packet: MeshPacketV1;
  backend: TerrainMesherBackendKind;
  fallbackFrom?: TerrainMesherBackendKind;
  fallbackReason?: TerrainMesherFailureCode;
}>;

export type TerrainMeshStaleResult = Readonly<{
  status: "stale";
  backend: TerrainMesherBackendKind;
  addressKey: string;
  submittedRevision: string;
  currentRevision: string | null;
  reason: "superseded-request" | "authority-revision-changed" | "worker-generation-changed";
}>;

export type TerrainMesherResult = TerrainMeshReadyResult | TerrainMeshStaleResult;

export type TerrainMesherFailureCode =
  | "aborted"
  | "backend-disposed"
  | "worker-unavailable"
  | "worker-startup"
  | "worker-crash"
  | "worker-message"
  | "request-timeout"
  | "task-error"
  | "protocol-error"
  | "invalid-snapshot"
  | "invalid-packet";

export class TerrainMesherBackendError extends Error {
  readonly name = "TerrainMesherBackendError";

  constructor(
    readonly code: TerrainMesherFailureCode,
    message: string,
    readonly recoverable: boolean,
    readonly cause?: unknown,
  ) {
    super(message);
  }
}

export type TerrainMesherDiagnostics = Readonly<{
  kind: TerrainMesherBackendKind;
  disposed: boolean;
  submitted: number;
  completed: number;
  failed: number;
  stale: number;
  aborted: number;
  pending: number;
  fallback: number;
  workerRestarts: number;
  transferredToWorkerBytes: number;
  transferredFromWorkerBytes: number;
  returnedInputBytes: number;
  lastError: Readonly<{ code: TerrainMesherFailureCode; message: string }> | null;
}>;

export interface TerrainMesherBackend {
  readonly kind: TerrainMesherBackendKind;
  readonly bufferPool?: TerrainBufferPool;
  mesh(snapshot: SectionSnapshotV1, options?: TerrainMesherRequestOptions): Promise<TerrainMesherResult>;
  diagnostics(): TerrainMesherDiagnostics;
  dispose(): void | Promise<void>;
}

export function assertTerrainMesherReadyResult(
  result: TerrainMesherResult,
  snapshot: SectionSnapshotV1,
): asserts result is TerrainMeshReadyResult {
  if (result.status !== "ready") {
    throw new TerrainMesherBackendError(
      "invalid-packet",
      `Terrain mesh ${result.addressKey} revision ${result.submittedRevision} was rejected as stale`,
      true,
    );
  }
  assertMeshPacketMatchesSnapshotV1(result.packet, snapshot);
}

export function isTerrainSnapshotRevisionCurrent(
  snapshot: SectionSnapshotV1,
  currentRevision?: TerrainMesherRequestOptions["currentRevision"],
) {
  if (!currentRevision) return true;
  const current = currentRevision(snapshot.address);
  return current !== null && terrainSectionRevisionKeyV1(current) === terrainSectionRevisionKeyV1(snapshot.revision);
}

export function staleTerrainMeshResult(
  backend: TerrainMesherBackendKind,
  snapshot: SectionSnapshotV1,
  reason: TerrainMeshStaleResult["reason"],
  current: TerrainSectionRevisionV1 | null,
): TerrainMeshStaleResult {
  assertSectionSnapshotV1(snapshot);
  return {
    status: "stale",
    backend,
    addressKey: terrainSectionAddressKeyV1(snapshot.address),
    submittedRevision: terrainSectionRevisionKeyV1(snapshot.revision),
    currentRevision: current ? terrainSectionRevisionKeyV1(current) : null,
    reason,
  };
}

export function terrainMesherAbortError() {
  return new TerrainMesherBackendError("aborted", "Terrain mesh request was aborted", true);
}

export function throwIfTerrainMeshAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw terrainMesherAbortError();
}

