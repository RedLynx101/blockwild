import {
  assertMeshPacketMatchesSnapshotV1,
  assertSectionSnapshotV1,
  terrainSectionAddressKeyV1,
  terrainSectionRevisionKeyV1,
  type MeshPacketV1,
  type SectionSnapshotV1,
  type TerrainBufferPool,
} from "./terrain-mesh-contract";
import {
  TerrainMesherBackendError,
  staleTerrainMeshResult,
  throwIfTerrainMeshAborted,
  type TerrainMesherBackend,
  type TerrainMesherDiagnostics,
  type TerrainMesherRequestOptions,
  type TerrainMesherResult,
} from "./terrain-mesher-backend";

/**
 * Injection point for world.ts' existing section mesher. R2 intentionally does
 * not duplicate that large, specialty-shape-aware implementation here.
 */
export type ExistingTerrainMesherV1 = (
  snapshot: SectionSnapshotV1,
  options: TerrainMesherRequestOptions,
) => MeshPacketV1 | Promise<MeshPacketV1>;

export type TypeScriptTerrainMesherOptions = Readonly<{
  mesh: ExistingTerrainMesherV1;
  bufferPool?: TerrainBufferPool;
}>;

export class TypeScriptTerrainMesherBackend implements TerrainMesherBackend {
  readonly kind = "typescript-reference" as const;
  readonly bufferPool?: TerrainBufferPool;
  private readonly referenceMesher: ExistingTerrainMesherV1;
  private readonly latestRevision = new Map<string, string>();
  private disposed = false;
  private generation = 1;
  private submitted = 0;
  private completed = 0;
  private failed = 0;
  private stale = 0;
  private aborted = 0;
  private pending = 0;
  private lastError: TerrainMesherDiagnostics["lastError"] = null;

  constructor(options: TypeScriptTerrainMesherOptions) {
    if (typeof options.mesh !== "function") {
      throw new TerrainMesherBackendError("worker-unavailable", "TypeScript terrain mesher requires an injected reference implementation", false);
    }
    this.referenceMesher = options.mesh;
    this.bufferPool = options.bufferPool;
  }

  async mesh(snapshot: SectionSnapshotV1, options: TerrainMesherRequestOptions = {}): Promise<TerrainMesherResult> {
    this.submitted += 1;
    if (this.disposed) {
      this.failed += 1;
      throw new TerrainMesherBackendError("backend-disposed", "TypeScript terrain mesher is disposed", false);
    }
    try {
      assertSectionSnapshotV1(snapshot);
    } catch (error) {
      this.failed += 1;
      this.lastError = { code: "invalid-snapshot", message: error instanceof Error ? error.message : String(error) };
      throw new TerrainMesherBackendError("invalid-snapshot", this.lastError.message, false, error);
    }
    try {
      throwIfTerrainMeshAborted(options.signal);
    } catch (error) {
      this.aborted += 1;
      throw error;
    }
    const addressKey = terrainSectionAddressKeyV1(snapshot.address);
    const revisionKey = terrainSectionRevisionKeyV1(snapshot.revision);
    const generation = this.generation;
    this.latestRevision.set(addressKey, revisionKey);
    this.pending += 1;
    try {
      const packet = await this.referenceMesher(snapshot, options);
      if (this.disposed || generation !== this.generation) {
        this.failed += 1;
        throw new TerrainMesherBackendError("backend-disposed", "TypeScript terrain mesher was disposed while a job was active", false);
      }
      throwIfTerrainMeshAborted(options.signal);
      try {
        assertMeshPacketMatchesSnapshotV1(packet, snapshot);
      } catch (error) {
        this.failed += 1;
        this.lastError = { code: "invalid-packet", message: error instanceof Error ? error.message : String(error) };
        throw new TerrainMesherBackendError("invalid-packet", this.lastError.message, false, error);
      }
      const current = options.currentRevision ? options.currentRevision(snapshot.address) : snapshot.revision;
      if (options.currentRevision && (current === null || terrainSectionRevisionKeyV1(current) !== revisionKey)) {
        this.stale += 1;
        return staleTerrainMeshResult(this.kind, snapshot, "authority-revision-changed", current);
      }
      if (this.latestRevision.get(addressKey) !== revisionKey) {
        this.stale += 1;
        return staleTerrainMeshResult(this.kind, snapshot, "superseded-request", current);
      }
      this.completed += 1;
      this.lastError = null;
      return { status: "ready", packet, backend: this.kind };
    } catch (error) {
      if (error instanceof TerrainMesherBackendError) {
        if (error.code === "aborted") this.aborted += 1;
        throw error;
      }
      this.failed += 1;
      this.lastError = { code: "task-error", message: error instanceof Error ? error.message : String(error) };
      throw new TerrainMesherBackendError("task-error", this.lastError.message, true, error);
    } finally {
      this.pending = Math.max(0, this.pending - 1);
    }
  }

  diagnostics(): TerrainMesherDiagnostics {
    return {
      kind: this.kind,
      disposed: this.disposed,
      submitted: this.submitted,
      completed: this.completed,
      failed: this.failed,
      stale: this.stale,
      aborted: this.aborted,
      pending: this.pending,
      fallback: 0,
      workerRestarts: 0,
      transferredToWorkerBytes: 0,
      transferredFromWorkerBytes: 0,
      returnedInputBytes: 0,
      lastError: this.lastError,
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.latestRevision.clear();
  }
}
