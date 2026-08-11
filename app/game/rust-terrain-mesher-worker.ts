import {
  MESH_PACKET_SCHEMA_V1,
  SECTION_SNAPSHOT_SCHEMA_V1,
  TERRAIN_MESH_PROTOCOL_V1,
  assertSectionSnapshotV1,
  meshPacketTransferListV1,
  sectionSnapshotTransferListV1,
  type SectionSnapshotV1,
} from "./terrain-mesh-contract";
import {
  RustEngineLoader,
  assertRustTerrainWasmExports,
  type LoadedRustEngine,
  type RustEngineArtifact,
  type RustTerrainWasmExports,
} from "./rust-engine-loader";
import {
  decodeRustTerrainWireResponseV1,
  encodeSectionSnapshotWireV1,
  encodeTerrainMaterialRegistryWireV2,
  type RustTerrainLightingResultV1,
} from "./rust-terrain-mesh-codec";
import { canonicalTerrainMaterialRegistryV2 } from "./terrain-material-registry";
import type {
  TerrainMesherWorkerHelloV1,
  TerrainMesherWorkerMeshRequestV1,
  TerrainMesherWorkerResponseV1,
  TerrainMesherWorkerShutdownV1,
} from "./rust-terrain-mesher";

export type TerrainMesherWorkerLightRequestV1 = Readonly<{
  type: "terrain-light-section-v1";
  requestId: number;
  snapshot: SectionSnapshotV1;
  /** Exactly 16x16 sky nibbles in x + 16*z order. */
  directSkyAbove: Uint8Array;
}>;

export type TerrainMesherWorkerLightResultV1 = Readonly<{
  type: "terrain-light-result-v1";
  requestId: number;
  result: RustTerrainLightingResultV1;
  returnedInputBuffers: readonly ArrayBuffer[];
}>;

type WorkerRequest = TerrainMesherWorkerHelloV1 | TerrainMesherWorkerMeshRequestV1
  | TerrainMesherWorkerLightRequestV1 | TerrainMesherWorkerShutdownV1;
type WorkerResponse = TerrainMesherWorkerResponseV1 | TerrainMesherWorkerLightResultV1;

export type RustTerrainMesherWorkerScope = Readonly<{
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
  close?: () => void;
}> & {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  onmessageerror?: ((event: MessageEvent) => void) | null;
};

type ReadyTerrainEngine = LoadedRustEngine & Readonly<{ exports: RustTerrainWasmExports }>;

function messageOf(error: unknown) { return error instanceof Error ? error.message : String(error); }

function transferredSnapshotBuffers(snapshot: SectionSnapshotV1) {
  return sectionSnapshotTransferListV1(snapshot);
}

function transferableViewBuffer(view: ArrayBufferView) {
  if (!(view.buffer instanceof ArrayBuffer)) throw new TypeError("Rust terrain worker requires transferable ArrayBuffer-backed views");
  return view.buffer;
}

export function installRustTerrainMesherWorker(scope: RustTerrainMesherWorkerScope) {
  let loader: RustEngineLoader | null = null;
  let loaded: ReadyTerrainEngine | null = null;
  let registryBytes: Uint8Array | null = null;
  let shuttingDown = false;
  let chain = Promise.resolve();

  const load = async (artifact?: RustEngineArtifact) => {
    if (loaded) return loaded;
    loader ??= new RustEngineLoader({ ...(artifact ? { artifact } : {}) });
    const candidate = await loader.load();
    assertRustTerrainWasmExports(candidate.exports);
    loaded = candidate as ReadyTerrainEngine;
    registryBytes ??= encodeTerrainMaterialRegistryWireV2(canonicalTerrainMaterialRegistryV2());
    return loaded;
  };

  const replyTaskError = (
    requestId: number,
    error: unknown,
    returnedInputBuffers: readonly ArrayBuffer[] = [],
    code: "ineligible-section" | "task-error" = "task-error",
  ) => {
    scope.postMessage({
      type: "terrain-mesh-task-error-v1",
      requestId,
      message: messageOf(error),
      recoverable: true,
      code,
      returnedInputBuffers,
    }, [...returnedInputBuffers]);
  };

  const mesh = async (request: TerrainMesherWorkerMeshRequestV1) => {
    const returnedInputBuffers = transferredSnapshotBuffers(request.snapshot);
    try {
      assertSectionSnapshotV1(request.snapshot);
      const engine = await load();
      const snapshotBytes = encodeSectionSnapshotWireV1(request.snapshot);
      const response = decodeRustTerrainWireResponseV1(
        engine.exports.blockwild_world_mesh_section_v1(snapshotBytes, registryBytes!),
      );
      if (response.kind === "ineligible") {
        replyTaskError(request.requestId, response.message, returnedInputBuffers, "ineligible-section");
        return;
      }
      if (response.kind === "error") {
        replyTaskError(request.requestId, response.issues.join("; "), returnedInputBuffers);
        return;
      }
      if (response.kind !== "mesh") throw new TypeError(`Rust mesh export returned ${response.kind}`);
      const packetBuffers = meshPacketTransferListV1(response.packet);
      scope.postMessage({
        type: "terrain-mesh-result-v1",
        requestId: request.requestId,
        packet: response.packet,
        returnedInputBuffers,
      }, [...packetBuffers, ...returnedInputBuffers]);
    } catch (error) {
      replyTaskError(request.requestId, error, returnedInputBuffers);
    }
  };

  const light = async (request: TerrainMesherWorkerLightRequestV1) => {
    const returnedInputBuffers = [...transferredSnapshotBuffers(request.snapshot), transferableViewBuffer(request.directSkyAbove)];
    try {
      assertSectionSnapshotV1(request.snapshot);
      if (!(request.directSkyAbove instanceof Uint8Array) || request.directSkyAbove.length !== 256
        || !request.directSkyAbove.every((value) => value <= 15)) {
        throw new TypeError("directSkyAbove must contain exactly 256 sky nibbles");
      }
      const engine = await load();
      const response = decodeRustTerrainWireResponseV1(engine.exports.blockwild_world_light_section_v1(
        encodeSectionSnapshotWireV1(request.snapshot),
        registryBytes!,
        request.directSkyAbove,
      ));
      if (response.kind === "ineligible") {
        replyTaskError(request.requestId, response.message, returnedInputBuffers, "ineligible-section");
        return;
      }
      if (response.kind === "error") {
        replyTaskError(request.requestId, response.issues.join("; "), returnedInputBuffers);
        return;
      }
      if (response.kind !== "lighting") throw new TypeError(`Rust light export returned ${response.kind}`);
      const transfer = [
        transferableViewBuffer(response.light),
        transferableViewBuffer(response.changedCellIndices),
        transferableViewBuffer(response.packedLight),
        ...returnedInputBuffers,
      ];
      scope.postMessage({
        type: "terrain-light-result-v1",
        requestId: request.requestId,
        result: response,
        returnedInputBuffers,
      }, transfer);
    } catch (error) {
      replyTaskError(request.requestId, error, returnedInputBuffers);
    }
  };

  const execute = async (request: WorkerRequest) => {
    if (shuttingDown) return;
    if (request.type === "terrain-mesher-shutdown-v1") {
      shuttingDown = true;
      scope.close?.();
      return;
    }
    if (request.type === "terrain-mesher-hello-v1") {
      if (request.protocolVersion !== TERRAIN_MESH_PROTOCOL_V1
        || request.snapshotSchemaVersion !== SECTION_SNAPSHOT_SCHEMA_V1
        || request.meshSchemaVersion !== MESH_PACKET_SCHEMA_V1) {
        scope.postMessage({ type: "terrain-mesher-fatal-v1", message: "Rust terrain worker received an incompatible contract hello" });
        return;
      }
      try {
        await load(request.artifact);
        scope.postMessage({
          type: "terrain-mesher-ready-v1",
          protocolVersion: TERRAIN_MESH_PROTOCOL_V1,
          snapshotSchemaVersion: SECTION_SNAPSHOT_SCHEMA_V1,
          meshSchemaVersion: MESH_PACKET_SCHEMA_V1,
          backend: "rust-wasm",
        });
      } catch (error) {
        scope.postMessage({ type: "terrain-mesher-fatal-v1", message: messageOf(error) });
      }
      return;
    }
    if (request.type === "terrain-mesh-section-v1") await mesh(request);
    else if (request.type === "terrain-light-section-v1") await light(request);
  };

  scope.onmessage = (event) => {
    chain = chain.then(() => execute(event.data)).catch((error) => {
      scope.postMessage({ type: "terrain-mesher-fatal-v1", message: messageOf(error) });
    });
  };
  if ("onmessageerror" in scope) {
    scope.onmessageerror = () => scope.postMessage({ type: "terrain-mesher-fatal-v1", message: "Rust terrain worker received an unreadable structured-clone message" });
  }

  return {
    diagnostics: () => ({
      shuttingDown,
      loaded: Boolean(loaded),
      artifactHash: loaded?.artifact.buildHash ?? null,
      loader: loader?.diagnostics() ?? null,
    } as const),
  };
}

const possibleWorkerScope = globalThis as unknown as Partial<RustTerrainMesherWorkerScope>;
if (typeof document === "undefined" && typeof possibleWorkerScope.postMessage === "function" && typeof possibleWorkerScope.close === "function") {
  installRustTerrainMesherWorker(possibleWorkerScope as RustTerrainMesherWorkerScope);
}
