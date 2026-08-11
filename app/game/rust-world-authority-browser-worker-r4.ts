import {
  RustEngineLoader,
  assertRustWorldAuthorityWasmExportsR4V1,
  type RustEngineLoaderOptions,
  type RustWorldAuthorityWasmExportsR4V1,
} from "./rust-engine-loader";
import {
  decodeRustWorldAuthorityResponseR4V1,
  encodeRustWorldAuthorityRequestR4V1,
} from "./rust-world-authority-codec-r4";
import type {
  RustWorldAuthorityRequestR4V1,
  RustWorldAuthorityResponseR4V1,
} from "./rust-world-authority-bridge-r4";
import {
  installRustWorldAuthorityWorkerHandlerR4V1,
  type RustWorldAuthorityKernelPortR4V1,
} from "./rust-world-authority-worker-r4";

type LoadedAuthority = Readonly<{
  exports: RustWorldAuthorityWasmExportsR4V1;
  artifactHash: string;
}>;

/** Real worker kernel backed by the immutable content-addressed Wasm artifact. */
export function createRustWorldAuthorityBrowserKernelR4V1(
  options: RustEngineLoaderOptions = {},
): RustWorldAuthorityKernelPortR4V1 {
  const loader = new RustEngineLoader(options);
  let loaded: LoadedAuthority | null = null;
  let handle: number | null = null;
  let disposed = false;

  const load = async () => {
    if (loaded) return loaded;
    const candidate = await loader.load();
    assertRustWorldAuthorityWasmExportsR4V1(candidate.exports);
    loaded = { exports: candidate.exports, artifactHash: candidate.artifact.buildHash };
    return loaded;
  };

  return {
    async handle(request: RustWorldAuthorityRequestR4V1): Promise<RustWorldAuthorityResponseR4V1> {
      if (disposed && request.type !== "authority-dispose-r4-v1") throw new Error("Rust world authority kernel is disposed");
      const engine = await load();
      const encoded = encodeRustWorldAuthorityRequestR4V1(request);
      if (request.type === "authority-init-r4-v1") {
        if (handle !== null) throw new Error("Rust world authority kernel is already initialized");
        const decoded = decodeRustWorldAuthorityResponseR4V1(
          request,
          engine.exports.blockwild_world_authority_create_r4(encoded),
        );
        if (decoded.handle === undefined) throw new Error("Rust world authority create response omitted its handle");
        handle = decoded.handle;
        return decoded.response.type === "authority-ready-r4-v1"
          ? Object.freeze({ ...decoded.response, artifactHash: engine.artifactHash })
          : decoded.response;
      }
      if (request.type === "authority-dispose-r4-v1") {
        if (handle === null) {
          disposed = true;
          return Object.freeze({
            type: "authority-disposed-r4-v1",
            protocolVersion: 1,
            worldProtocolVersion: 1,
            schemaVersion: 1,
            requestId: request.requestId,
          });
        }
        const decoded = decodeRustWorldAuthorityResponseR4V1(
          request,
          engine.exports.blockwild_world_authority_destroy_r4(handle, encoded),
        );
        handle = null;
        disposed = true;
        return decoded.response;
      }
      if (handle === null) throw new Error("Rust world authority kernel is not initialized");
      return decodeRustWorldAuthorityResponseR4V1(
        request,
        engine.exports.blockwild_world_authority_request_r4(handle, encoded),
      ).response;
    },
    dispose() {
      disposed = true;
      handle = null;
      loader.reset();
    },
  };
}

const workerScope = globalThis as typeof globalThis & Readonly<{
  WorkerGlobalScope?: unknown;
  postMessage?: (message: unknown, transfer?: Transferable[]) => void;
  addEventListener?: (type: "message", listener: (event: MessageEvent<RustWorldAuthorityRequestR4V1>) => void) => void;
}>;

if (typeof workerScope.WorkerGlobalScope !== "undefined"
  && typeof workerScope.postMessage === "function"
  && typeof workerScope.addEventListener === "function") {
  installRustWorldAuthorityWorkerHandlerR4V1(
    workerScope as Parameters<typeof installRustWorldAuthorityWorkerHandlerR4V1>[0],
    createRustWorldAuthorityBrowserKernelR4V1(),
  );
}
