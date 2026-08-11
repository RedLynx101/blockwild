import assert from "node:assert/strict";
import test from "node:test";
import {
  RustEngineLoader,
  RustEngineLoadError,
  type RustEngineWasmExports,
} from "../app/game/rust-engine-loader.ts";
import { encodeRustEngineEnvelope, RustEngineMessageKind } from "../app/game/rust-engine-protocol.ts";

const response = () => encodeRustEngineEnvelope({ kind: RustEngineMessageKind.CapabilityAck });
const fakeArtifact = { moduleUrl: "test://blockwild-engine.js", wasmUrl: "test://blockwild-engine.wasm", buildKind: "compatibility" as const };

function fakeExports(schemaVersion = 1): RustEngineWasmExports {
  return {
    blockwild_protocol_version: () => 1,
    blockwild_schema_version: () => schemaVersion,
    blockwild_engine_create: response,
    blockwild_engine_ingest: response,
    blockwild_engine_step: response,
    blockwild_engine_take_events: response,
    blockwild_engine_state_hash: response,
    blockwild_engine_destroy: response,
  };
}

test("Rust loader is lazy, initializes once, and deduplicates concurrent loads", async () => {
  let imports = 0;
  let initializes = 0;
  const loader = new RustEngineLoader({
    artifact: fakeArtifact,
    importer: async () => {
      imports += 1;
      return { default: async () => { initializes += 1; }, ...fakeExports() };
    },
    now: () => 12,
  });
  assert.equal(imports, 0, "constructing or importing the loader must not fetch Wasm");
  const [first, second] = await Promise.all([loader.load(), loader.load()]);
  assert.equal(first, second);
  assert.equal(imports, 1);
  assert.equal(initializes, 1);
  assert.equal(loader.diagnostics().state, "ready");
});

test("Rust loader reports an absent artifact without poisoning a TypeScript caller", async () => {
  const loader = new RustEngineLoader({ artifact: fakeArtifact, importer: async () => { throw new Error("404"); } });
  await assert.rejects(loader.load(), (error: unknown) => error instanceof RustEngineLoadError && error.code === "artifact-unavailable");
  assert.equal(loader.diagnostics().failures, 1);
  assert.equal(loader.diagnostics().lastError?.code, "artifact-unavailable");
});

test("Rust loader rejects schema drift before exposing exports", async () => {
  const loader = new RustEngineLoader({ artifact: fakeArtifact, importer: async () => fakeExports(7) });
  await assert.rejects(loader.load(), (error: unknown) => error instanceof RustEngineLoadError && error.code === "schema-mismatch");
  assert.equal(loader.diagnostics().state, "failed");
});

test("Rust loader rejects incomplete wasm-bindgen namespaces", async () => {
  const loader = new RustEngineLoader({ artifact: fakeArtifact, importer: async () => ({ blockwild_protocol_version: () => 1 }) });
  await assert.rejects(loader.load(), (error: unknown) => error instanceof RustEngineLoadError && error.code === "invalid-module");
});

test("Rust loader resolves the immutable artifact selected by the published manifest", async () => {
  const hash = "a".repeat(64);
  const responses = new Map<string, unknown>([
    ["https://blockwild.test/engine/manifest.json", {
      schema: 1,
      defaultVariant: "compatibility",
      artifacts: { compatibility: { hash, directory: hash, manifest: `${hash}/manifest.json` } },
    }],
    [`https://blockwild.test/engine/${hash}/manifest.json`, {
      schema: 1,
      artifactHash: hash,
      variant: "compatibility",
      files: [
        { path: "engine.js", role: "glue" },
        { path: "engine_bg.wasm", role: "wasm" },
      ],
    }],
  ]);
  const imported: Array<{ moduleUrl: string; wasmUrl: string; buildHash: string }> = [];
  const loader = new RustEngineLoader({
    artifact: { indexUrl: "https://blockwild.test/engine/manifest.json", buildKind: "compatibility" },
    fetcher: async (url) => ({ ok: responses.has(url), status: responses.has(url) ? 200 : 404, json: async () => responses.get(url) }),
    importer: async (artifact) => {
      imported.push(artifact);
      return fakeExports();
    },
  });
  const loaded = await loader.load();
  assert.equal(imported[0]?.moduleUrl, `https://blockwild.test/engine/${hash}/engine.js`);
  assert.equal(imported[0]?.wasmUrl, `https://blockwild.test/engine/${hash}/engine_bg.wasm`);
  assert.equal(loaded.artifact.buildHash, hash);
});
