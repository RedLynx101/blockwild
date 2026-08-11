import assert from "node:assert/strict";
import test from "node:test";
import {
  RUST_INTEGRATED_PERSISTENCE_CONTROL_MAX_BYTES_V1,
  encodeRustIntegratedPersistenceDispatchV1,
} from "../app/game/rust-integrated-runtime-persistence.ts";

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

test("persistence dispatch estimate is byte-identical to the native high-UTF8 fixture", () => {
  assert.equal(
    hex(encodeRustIntegratedPersistenceDispatchV1({ kind: "estimate", worldId: "wørld" })),
    "42574438010001000b0000005df174d7207aef3588f6935cac2b6c8e060600000077c3b8726c64",
  );
});

test("persistence dispatch rejects lone surrogates and normal-lane overflow before encoding", () => {
  assert.throws(
    () => encodeRustIntegratedPersistenceDispatchV1({ kind: "estimate", worldId: "world\ud800" }),
    /unpaired surrogate/u,
  );
  assert.throws(
    () => encodeRustIntegratedPersistenceDispatchV1({
      kind: "import-chunk",
      worldId: "world",
      importId: "import",
      offset: 0,
      totalBytes: RUST_INTEGRATED_PERSISTENCE_CONTROL_MAX_BYTES_V1 + 1,
      bytes: new Uint8Array(RUST_INTEGRATED_PERSISTENCE_CONTROL_MAX_BYTES_V1 + 1),
    }),
    /normal BWRQ byte ceiling/u,
  );
});
