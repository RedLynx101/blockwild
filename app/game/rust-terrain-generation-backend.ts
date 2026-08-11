import {
  assertGeneratedChunkMatchesRequestV2,
  assertGenerateChunkRequestV2,
  createGeneratedChunkV2,
  hashTerrainGenerationIdentityV2,
  type GeneratedChunkV2,
  type GeneratedChunkV2Payload,
  type GenerateChunkRequestV2,
} from "./terrain-generation-contract";

function bytesOf(view: ArrayBufferView) {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

function equalBytes(left: ArrayBufferView, right: ArrayBufferView) {
  const a = bytesOf(left), b = bytesOf(right);
  if (a.byteLength !== b.byteLength) return false;
  for (let index = 0; index < a.byteLength; index += 1) if (a[index] !== b[index]) return false;
  return true;
}

/** Collision-independent byte comparison used to mint the promotion certificate. */
export function terrainGenerationChunksByteEqualV2(left: GeneratedChunkV2, right: GeneratedChunkV2) {
  return left.protocolVersion === right.protocolVersion
    && left.schemaVersion === right.schemaVersion
    && left.epoch === right.epoch
    && left.taskId === right.taskId
    && left.revision === right.revision
    && left.namespace === right.namespace
    && left.contentHash === right.contentHash
    && left.generatorHash === right.generatorHash
    && left.requestHash === right.requestHash
    && left.key === right.key
    && left.cx === right.cx
    && left.cz === right.cz
    && equalBytes(left.blocks, right.blocks)
    && equalBytes(left.heightmap, right.heightmap)
    && equalBytes(left.biomes, right.biomes)
    && equalBytes(left.sectionBlockCounts, right.sectionBlockCounts)
    && equalBytes(left.skyTops, right.skyTops)
    && equalBytes(left.light, right.light)
    && equalBytes(left.lightIndices, right.lightIndices)
    && equalBytes(left.leafIndices, right.leafIndices)
    && equalBytes(left.markerTable.offsets, right.markerTable.offsets)
    && equalBytes(left.markerTable.bytes, right.markerTable.bytes);
}

export class TerrainGenerationParityLedgerV2 {
  private readonly cases = new Map<string, Readonly<{
    key: string;
    equal: boolean;
    referenceHash: string;
    candidateHash: string;
  }>>();
  private contentHash: string | null = null;
  private generatorHash: string | null = null;

  record(request: GenerateChunkRequestV2, reference: GeneratedChunkV2, candidate: GeneratedChunkV2) {
    assertGeneratedChunkMatchesRequestV2(reference, request);
    assertGeneratedChunkMatchesRequestV2(candidate, request);
    if ((this.contentHash && this.contentHash !== request.contentHash)
      || (this.generatorHash && this.generatorHash !== request.generatorHash)) {
      throw new Error("Terrain parity corpus mixed content or generator identities");
    }
    this.contentHash = request.contentHash;
    this.generatorHash = request.generatorHash;
    this.cases.set(request.requestHash, {
      key: `${request.seedText}\0${request.cx}\0${request.cz}\0${request.requestHash}`,
      equal: terrainGenerationChunksByteEqualV2(reference, candidate),
      referenceHash: reference.chunkHash,
      candidateHash: candidate.chunkHash,
    });
  }

  certificate() {
    const rows = [...this.cases.values()].sort((left, right) => left.key.localeCompare(right.key));
    return {
      generatorVersion: 18 as const,
      generatorHash: this.generatorHash ?? "0".repeat(32),
      contentHash: this.contentHash ?? "0".repeat(32),
      corpusHash: hashTerrainGenerationIdentityV2(
        "blockwild-terrain-parity-corpus-v2",
        ...rows.flatMap((row) => [row.key, row.referenceHash, row.candidateHash]),
      ),
      corpusCases: rows.length,
      byteEqual: rows.length > 0 && rows.every((row) => row.equal),
      mismatches: rows.filter((row) => !row.equal).map((row) => row.key),
    } as const;
  }
}

export type TerrainGenerationBackendKindV2 =
  | "injected-pure"
  | "typescript-compatibility-oracle"
  | "rust-wasm-shadow"
  | "rust-wasm-authoritative";

export type TerrainGenerationBackendContextV2 = Readonly<{
  signal?: AbortSignal;
  /** Optional authority lane checked again after asynchronous generation. */
  currentEpoch?: () => number;
  /** Optional authoritative chunk revision checked again before delivery. */
  currentRevision?: () => number | null;
}>;

export type TerrainGenerationFunctionV2 = (
  request: GenerateChunkRequestV2,
  context: TerrainGenerationBackendContextV2,
) => GeneratedChunkV2Payload | GeneratedChunkV2 | Promise<GeneratedChunkV2Payload | GeneratedChunkV2>;

export type TerrainGenerationBackendResultV2 =
  | Readonly<{ status: "ready"; chunk: GeneratedChunkV2; backend: TerrainGenerationBackendKindV2 }>
  | Readonly<{
    status: "stale";
    backend: TerrainGenerationBackendKindV2;
    reason: "epoch-changed" | "revision-changed" | "superseded-request";
    epoch: number;
    revision: number;
  }>;

export interface TerrainGenerationBackendV2 {
  readonly kind: TerrainGenerationBackendKindV2;
  generate(request: GenerateChunkRequestV2, context?: TerrainGenerationBackendContextV2): Promise<TerrainGenerationBackendResultV2>;
  diagnostics(): Readonly<{
    kind: TerrainGenerationBackendKindV2;
    disposed: boolean;
    submitted: number;
    completed: number;
    stale: number;
    aborted: number;
    failed: number;
    pending: number;
  }>;
  dispose(): void | Promise<void>;
}

export class TerrainGenerationBackendError extends Error {
  readonly name = "TerrainGenerationBackendError";

  constructor(
    readonly code: "aborted" | "backend-disposed" | "invalid-request" | "invalid-result" | "generation-failed",
    message: string,
    readonly cause?: unknown,
  ) { super(message); }
}

function abortError() {
  return new TerrainGenerationBackendError("aborted", "Terrain generation request was cancelled");
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

function isGeneratedChunk(value: GeneratedChunkV2Payload | GeneratedChunkV2): value is GeneratedChunkV2 {
  return "schemaVersion" in value && "chunkHash" in value;
}

/**
 * Pure injection boundary shared by the current TypeScript oracle and the
 * future Rust/Wasm implementation. This module imports no world or renderer.
 */
export class InjectedTerrainGenerationBackendV2 implements TerrainGenerationBackendV2 {
  readonly kind: TerrainGenerationBackendKindV2;
  private readonly latestTaskByChunk = new Map<string, number>();
  private disposed = false;
  private submitted = 0;
  private completed = 0;
  private stale = 0;
  private aborted = 0;
  private failed = 0;
  private pending = 0;

  constructor(
    private readonly generator: TerrainGenerationFunctionV2,
    kind: TerrainGenerationBackendKindV2 = "injected-pure",
  ) { this.kind = kind; }

  async generate(
    request: GenerateChunkRequestV2,
    context: TerrainGenerationBackendContextV2 = {},
  ): Promise<TerrainGenerationBackendResultV2> {
    this.submitted += 1;
    if (this.disposed) {
      this.failed += 1;
      throw new TerrainGenerationBackendError("backend-disposed", "Terrain generation backend is disposed");
    }
    try { assertGenerateChunkRequestV2(request); } catch (error) {
      this.failed += 1;
      throw new TerrainGenerationBackendError("invalid-request", error instanceof Error ? error.message : String(error), error);
    }
    try { throwIfAborted(context.signal); } catch (error) {
      this.aborted += 1;
      throw error;
    }
    const lane = `${request.epoch}:${request.key}`;
    this.latestTaskByChunk.set(lane, request.taskId);
    this.pending += 1;
    try {
      const generated = await this.generator(request, context);
      throwIfAborted(context.signal);
      const chunk = isGeneratedChunk(generated) ? generated : createGeneratedChunkV2(request, generated);
      try { assertGeneratedChunkMatchesRequestV2(chunk, request); } catch (error) {
        this.failed += 1;
        throw new TerrainGenerationBackendError("invalid-result", error instanceof Error ? error.message : String(error), error);
      }
      if (context.currentEpoch && context.currentEpoch() !== request.epoch) {
        this.stale += 1;
        return { status: "stale", backend: this.kind, reason: "epoch-changed", epoch: request.epoch, revision: request.revision };
      }
      if (context.currentRevision && context.currentRevision() !== request.revision) {
        this.stale += 1;
        return { status: "stale", backend: this.kind, reason: "revision-changed", epoch: request.epoch, revision: request.revision };
      }
      if (this.latestTaskByChunk.get(lane) !== request.taskId) {
        this.stale += 1;
        return { status: "stale", backend: this.kind, reason: "superseded-request", epoch: request.epoch, revision: request.revision };
      }
      this.completed += 1;
      return { status: "ready", chunk, backend: this.kind };
    } catch (error) {
      if (error instanceof TerrainGenerationBackendError) {
        if (error.code === "aborted") this.aborted += 1;
        throw error;
      }
      this.failed += 1;
      throw new TerrainGenerationBackendError("generation-failed", error instanceof Error ? error.message : String(error), error);
    } finally {
      this.pending -= 1;
    }
  }

  diagnostics() {
    return {
      kind: this.kind,
      disposed: this.disposed,
      submitted: this.submitted,
      completed: this.completed,
      stale: this.stale,
      aborted: this.aborted,
      failed: this.failed,
      pending: this.pending,
    } as const;
  }

  dispose() {
    this.disposed = true;
    this.latestTaskByChunk.clear();
  }
}
