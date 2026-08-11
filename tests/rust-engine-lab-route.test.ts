import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  BLOCKWILD_R0_SMOKE_SHADER,
  bytesToDiagnosticHex,
  describeWebGpuAvailability,
  instantiatePreparedRustArtifact,
  preparePublishedRustArtifact,
  selectPublishedRustArtifact,
} from "../app/game/rust-render-smoke";

const HASH = "a".repeat(64);
const INDEX = {
  schema: 1,
  defaultVariant: "compatibility",
  artifacts: {
    compatibility: {
      hash: HASH,
      directory: HASH,
      manifest: `${HASH}/manifest.json`,
    },
  },
};
const MANIFEST = {
  schema: 1,
  variant: "compatibility",
  artifactHash: HASH,
  files: [
    { path: "engine.js", role: "glue" },
    { path: "engine_bg.wasm", role: "wasm" },
  ],
};

test("engine lab resolves the content-addressed browser artifact", () => {
  assert.deepEqual(selectPublishedRustArtifact(INDEX, MANIFEST), {
    variant: "compatibility",
    hash: HASH,
    manifestUrl: `/engine/${HASH}/manifest.json`,
    moduleUrl: `/engine/${HASH}/engine.js`,
    wasmUrl: `/engine/${HASH}/engine_bg.wasm`,
  });
  assert.throws(
    () => selectPublishedRustArtifact(INDEX, { ...MANIFEST, artifactHash: "b".repeat(64) }),
    /does not match/,
  );
  assert.throws(
    () => selectPublishedRustArtifact(INDEX, { ...MANIFEST, files: [{ path: "../engine.js", role: "glue" }, MANIFEST.files[1]] }),
    /unsafe path/,
  );
});

test("engine lab times fetch, compile, and instantiate without WebGPU", async () => {
  const wasm = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
  const responses = new Map<string, Response>([
    ["/engine/manifest.json", Response.json(INDEX)],
    [`/engine/${HASH}/manifest.json`, Response.json(MANIFEST)],
    [`/engine/${HASH}/engine_bg.wasm`, new Response(wasm, { status: 200, headers: { "content-type": "application/wasm" } })],
  ]);
  let time = 0;
  const prepared = await preparePublishedRustArtifact({
    fetcher: async (url) => {
      time += 2;
      const response = responses.get(url);
      if (!response) return new Response("missing", { status: 404 });
      return response.clone();
    },
    now: () => time,
  });
  let initialized = false;
  const instantiated = await instantiatePreparedRustArtifact(prepared, {
    importer: async () => ({
      default: async (options: { module_or_path: WebAssembly.Module }) => {
        initialized = options.module_or_path instanceof WebAssembly.Module;
      },
      blockwild_protocol_version: () => 1,
      blockwild_schema_version: () => 1,
    }),
    now: () => ++time,
  });
  assert.equal(initialized, true);
  assert.equal(instantiated.status, "ready");
  assert.equal(instantiated.wasmBytes, wasm.byteLength);
  assert.equal(instantiated.protocolVersion, 1);
  assert.equal(instantiated.schemaVersion, 1);
  assert.equal(instantiated.fetchDurationMs, 6);
  assert.equal(instantiated.instantiateDurationMs, 1);
});

test("engine lab has a deterministic shader and graceful capability fallback", () => {
  assert.match(BLOCKWILD_R0_SMOKE_SHADER, /@builtin\(vertex_index\)/);
  assert.match(BLOCKWILD_R0_SMOKE_SHADER, /vec3<f32>\(0\.94, 0\.67, 0\.20\)/);
  assert.deepEqual(describeWebGpuAvailability(undefined), {
    available: false,
    message: "WebGPU is unavailable in this browser; the TypeScript/Canvas fallback remains active.",
  });
  assert.equal(bytesToDiagnosticHex(new Uint8Array([0, 1, 15, 16, 255])), "00010f10ff");
});

test("engine lab stays unlinked and route-local", () => {
  const root = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const wiki = readFileSync(new URL("../app/wiki/page.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/engine-lab/EngineLabClient.tsx", import.meta.url), "utf8");
  const loader = readFileSync(new URL("../app/game/rust-engine-loader.ts", import.meta.url), "utf8");
  const smoke = readFileSync(new URL("../app/game/rust-render-smoke.ts", import.meta.url), "utf8");
  assert.doesNotMatch(root, /engine-lab|rust-engine-service|rust-render-smoke/);
  assert.doesNotMatch(wiki, /engine-lab|rust-engine-service|rust-render-smoke/);
  assert.match(route, /import\("\.\.\/game\/rust-engine-service"\)/);
  assert.match(route, /import\("\.\.\/game\/indexeddb-persistence-adapter"\)/);
  assert.match(route, /import\("\.\.\/game\/rust-persistence-runtime-adapter"\)/);
  assert.match(route, /RUST_PERSISTENCE_COMMIT_FIXTURE_HEX/);
  assert.match(route, /reopenedRecoveryVerified/u);
  assert.match(route, /corruptionDetected/u);
  assert.match(route, /quotaClassified/u);
  assert.match(route, /atomicConflictRejected/u);
  assert.match(route, /render_engine_lab_to_text/);
  assert.match(route, /data-testid="engine-smoke-canvas"/);
  assert.match(route, /data-testid="engine-three-oracle-canvas"/);
  assert.match(route, /new THREE\.WebGLRenderer/);
  assert.match(route, /void cleanResources\(\)/);
  assert.match(loader, /URL\.createObjectURL\(new Blob/);
  assert.match(smoke, /URL\.createObjectURL\(new Blob/);
  assert.doesNotMatch(loader, /import\([^)]*artifact\.moduleUrl/);
  assert.doesNotMatch(smoke, /import\([^)]*prepared\.artifact\.moduleUrl/);
});
