import assert from "node:assert/strict";
import test from "node:test";
import { RustEngineLoader, type RustEngineWasmExports } from "../app/game/rust-engine-loader.ts";
import {
  decodeRustEngineEnvelope,
  decodeRustEngineJson,
  encodeRustEngineEnvelope,
  RustEngineMessageFlag,
  RustEngineMessageKind,
  type RustEngineWireMessage,
} from "../app/game/rust-engine-protocol.ts";
import { installRustEngineWorker, type RustEngineWorkerScope } from "../app/game/rust-engine-worker.ts";

function compactAck(request: Uint8Array) {
  const input = decodeRustEngineEnvelope(request);
  const payload = new Uint8Array(12);
  const view = new DataView(payload.buffer);
  view.setUint32(0, 7, true);
  view.setUint16(4, 1, true);
  view.setUint16(6, 1, true);
  view.setUint32(8, 0, true);
  return encodeRustEngineEnvelope({
    kind: RustEngineMessageKind.CapabilityAck,
    flags: RustEngineMessageFlag.Response,
    requestId: input.header.requestId,
    epoch: input.header.epoch,
    payload,
  });
}

function response(kind: RustEngineMessageKind, payloadLength: number) {
  return encodeRustEngineEnvelope({
    kind,
    flags: RustEngineMessageFlag.Response,
    payload: new Uint8Array(payloadLength),
  });
}

test("worker adapts compact Rust ABI controls into browser capability diagnostics", async () => {
  const exports: RustEngineWasmExports = {
    blockwild_protocol_version: () => 1,
    blockwild_schema_version: () => 1,
    blockwild_engine_create: compactAck,
    blockwild_engine_ingest: () => response(RustEngineMessageKind.Events, 4),
    blockwild_engine_step: () => response(RustEngineMessageKind.Step, 32),
    blockwild_engine_take_events: () => response(RustEngineMessageKind.Events, 4),
    blockwild_engine_state_hash: () => response(RustEngineMessageKind.StateHash, 16),
    blockwild_engine_destroy: () => response(RustEngineMessageKind.Shutdown, 0),
  };
  const loader = new RustEngineLoader({
    artifact: { moduleUrl: "test://blockwild-engine.js", wasmUrl: "test://blockwild-engine.wasm", buildKind: "compatibility" },
    importer: async () => exports,
  });
  const posted: RustEngineWireMessage[] = [];
  const scope: RustEngineWorkerScope = {
    onmessage: null,
    postMessage: (message) => { posted.push(message); },
  };
  installRustEngineWorker(scope, { loader });
  const hello = encodeRustEngineEnvelope({ kind: RustEngineMessageKind.CapabilityHello, requestId: 41, epoch: 3 });
  scope.onmessage?.({ data: { envelope: hello } } as MessageEvent<RustEngineWireMessage>);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(posted.length, 1);
  const acknowledgement = decodeRustEngineEnvelope(posted[0].envelope);
  assert.equal(acknowledgement.header.kind, RustEngineMessageKind.CapabilityAck);
  assert.equal(acknowledgement.header.requestId, 41);
  const capabilities = decodeRustEngineJson<{ engineHandle: number }>(acknowledgement.payload);
  assert.equal(capabilities.engineHandle, 7);

  const step = encodeRustEngineEnvelope({
    kind: RustEngineMessageKind.Step,
    requestId: 99,
    epoch: 4,
    payload: new TextEncoder().encode(JSON.stringify({ monotonicTimeUs: 1_000, budgetUs: 500 })),
  });
  scope.onmessage?.({ data: { envelope: step } } as MessageEvent<RustEngineWireMessage>);
  await new Promise<void>((resolve) => setImmediate(resolve));
  const stepResponse = decodeRustEngineEnvelope(posted[1].envelope);
  assert.equal(stepResponse.header.kind, RustEngineMessageKind.Step);
  assert.equal(stepResponse.header.requestId, 99, "worker correlates handle-only Rust ABI calls to browser requests");
  assert.equal(stepResponse.header.epoch, 4);
});
