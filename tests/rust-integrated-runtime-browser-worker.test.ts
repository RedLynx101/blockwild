import assert from "node:assert/strict";
import test from "node:test";
import { RustIntegratedRuntimeBrowserKernelV1 } from "../app/game/rust-integrated-runtime-browser-worker.ts";
import { encodeRustIntegratedRuntimeResponseV1 } from "../app/game/rust-integrated-runtime-codec.ts";
import type { RustIntegratedRuntimeIdentityV1, RustIntegratedRuntimeResponseV1 } from "../app/game/rust-integrated-runtime-contract.ts";
import { RustEngineLoader, type RustEngineWasmExports } from "../app/game/rust-engine-loader.ts";
import { RUST_ENGINE_PROTOCOL_VERSION, RUST_ENGINE_SCHEMA_VERSION } from "../app/game/rust-engine-protocol.ts";

const ARTIFACT_HASH = "a".repeat(64);
const ZERO_HASH = "0".repeat(32);

function identity(): RustIntegratedRuntimeIdentityV1 {
  return Object.freeze({
    universeId: "1",
    locationId: "surface",
    revision: Object.freeze({ epoch: 1, world: 0, entities: 0, gameplay: 0, persistence: 0, network: 0, simulation: 0 }),
    tick: 0,
    stateHash: ZERO_HASH,
  });
}

function encoded(response: RustIntegratedRuntimeResponseV1) {
  return encodeRustIntegratedRuntimeResponseV1(response);
}

test("browser kernel attests the manifest-selected artifact instead of trusting Wasm self-reporting", async () => {
  const base: RustEngineWasmExports = {
    blockwild_protocol_version: () => RUST_ENGINE_PROTOCOL_VERSION,
    blockwild_schema_version: () => RUST_ENGINE_SCHEMA_VERSION,
    blockwild_engine_create: () => new Uint8Array(),
    blockwild_engine_ingest: () => new Uint8Array(),
    blockwild_engine_step: () => new Uint8Array(),
    blockwild_engine_take_events: () => new Uint8Array(),
    blockwild_engine_state_hash: () => new Uint8Array(),
    blockwild_engine_destroy: () => new Uint8Array(),
  };
  const namespace = {
    ...base,
    blockwild_runtime_create_v2: () => encoded({
      type: "runtime-ready-v1",
      requestId: 1,
      clientEpoch: 1,
      workerEpoch: 1,
      runtimeHandle: 9,
      identity: identity(),
      artifactHash: "wasm-self-report-is-not-authority",
      instanceId: "native:9",
      capabilities: ["integrated-runtime-v1"],
    }),
    blockwild_runtime_command_v2: () => new Uint8Array(),
    blockwild_runtime_step_v2: () => new Uint8Array(),
    blockwild_runtime_extract_v2: () => new Uint8Array(),
    blockwild_runtime_export_save_v2: () => new Uint8Array(),
    blockwild_runtime_bulk_v2: () => new Uint8Array(),
    blockwild_runtime_bulk_take_attachment_v2: () => new Uint8Array(),
    blockwild_runtime_destroy_v2: () => new Uint8Array(),
  };
  const loader = new RustEngineLoader({
    artifact: {
      moduleUrl: "https://fixture.invalid/blockwild.js",
      wasmUrl: "https://fixture.invalid/blockwild_bg.wasm",
      buildKind: "compatibility",
      buildHash: ARTIFACT_HASH,
    },
    importer: async () => namespace,
  });
  const kernel = new RustIntegratedRuntimeBrowserKernelV1(loader);
  const response = await kernel.handle({
    type: "runtime-create-v1",
    requestId: 1,
    clientEpoch: 1,
    config: {
      worldSeed: "fixture",
      universeId: "1",
      locationId: "surface",
      sessionId: "fixture",
      contentHash: ZERO_HASH,
      generatorHash: ZERO_HASH,
      waterBlockId: 7,
      directionalBlockIds: [],
      waterloggedBlockIds: [],
    },
  });
  assert.equal(response.type, "runtime-ready-v1");
  assert.equal(response.type === "runtime-ready-v1" ? response.artifactHash : null, ARTIFACT_HASH);
  assert.equal(response.type === "runtime-ready-v1" ? response.instanceId : null, "native:9");
});
