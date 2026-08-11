import {
  GENERATED_CHUNK_SCHEMA_V2,
  GENERATE_CHUNK_REQUEST_SCHEMA_V2,
  TERRAIN_GENERATION_PROTOCOL_V2,
  generatedChunkTransferListV2,
  type TerrainGenerationWorkerRequestV2,
  type TerrainGenerationWorkerResponseV2,
} from "./terrain-generation-contract";
import { InjectedTerrainGenerationBackendV2, type TerrainGenerationBackendV2 } from "./rust-terrain-generation-backend";
import { RustTerrainGenerationBridgeV2 } from "./rust-terrain-generation-bridge";

declare const self: {
  onmessage: ((event: MessageEvent<TerrainGenerationWorkerRequestV2>) => void) | null;
  postMessage(message: TerrainGenerationWorkerResponseV2, options?: StructuredSerializeOptions): void;
};

const controllers = new Map<string, AbortController>();
let backendPromise: Promise<TerrainGenerationBackendV2> | null = null;

function taskKey(epoch: number, taskId: number) { return `${epoch}:${taskId}`; }

function backend() {
  backendPromise ??= Promise.resolve().then(async () => {
    const bridge = new RustTerrainGenerationBridgeV2();
    await bridge.initialize();
    return new InjectedTerrainGenerationBackendV2((request) => bridge.generate(request), "rust-wasm-authoritative");
  });
  return backendPromise;
}

function post(message: TerrainGenerationWorkerResponseV2, transfer: Transferable[] = []) {
  self.postMessage(message, { transfer });
}

void backend().then(() => post({
  type: "terrain-generation-ready-v2",
  protocolVersion: TERRAIN_GENERATION_PROTOCOL_V2,
  requestSchemaVersion: GENERATE_CHUNK_REQUEST_SCHEMA_V2,
  resultSchemaVersion: GENERATED_CHUNK_SCHEMA_V2,
  backend: "rust-wasm-authoritative",
})).catch(() => post({
  type: "terrain-generation-ready-v2",
  protocolVersion: TERRAIN_GENERATION_PROTOCOL_V2,
  requestSchemaVersion: GENERATE_CHUNK_REQUEST_SCHEMA_V2,
  resultSchemaVersion: GENERATED_CHUNK_SCHEMA_V2,
  backend: "rust-wasm-shadow",
}));

self.onmessage = (event: MessageEvent<TerrainGenerationWorkerRequestV2>) => {
  const message = event.data;
  if (message.type === "cancel-generate-chunk-v2") {
    controllers.get(taskKey(message.epoch, message.taskId))?.abort();
    return;
  }
  const { request } = message;
  const key = taskKey(request.epoch, request.taskId);
  const controller = new AbortController();
  controllers.set(key, controller);
  void backend().then((generator) => generator.generate(request, { signal: controller.signal })).then((result) => {
    if (result.status === "stale" || controller.signal.aborted) {
      post({ type: "generate-chunk-cancelled-v2", epoch: request.epoch, taskId: request.taskId });
      return;
    }
    post(
      { type: "generated-chunk-v2", epoch: request.epoch, taskId: request.taskId, result: result.chunk },
      generatedChunkTransferListV2(result.chunk),
    );
  }).catch((error) => {
    if (controller.signal.aborted) {
      post({ type: "generate-chunk-cancelled-v2", epoch: request.epoch, taskId: request.taskId });
      return;
    }
    post({
      type: "generate-chunk-error-v2",
      epoch: request.epoch,
      taskId: request.taskId,
      message: error instanceof Error ? error.message : String(error),
    });
  }).finally(() => controllers.delete(key));
};
