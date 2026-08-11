import assert from "node:assert/strict";
import test from "node:test";
import { BlockId } from "../app/game/data.ts";
import {
  WORLD_AUTHORITY_PROTOCOL_V1,
  WORLD_AUTHORITY_SCHEMA_V1,
  WorldLiquidKindV1,
  hashCanonicalWorldValueV1,
  type WorldSectionAddressV1,
} from "../app/game/world-authority-contract.ts";
import {
  RustWorldAuthorityMirrorV1,
  cloneWorldReadWindowForTransferV1,
  worldReadWindowTransferListV1,
  type RustWorldMirrorRequestV1,
  type RustWorldMirrorResponseV1,
  type RustWorldMirrorTransportV1,
} from "../app/game/rust-world-authority.ts";
import { TypeScriptWorldAuthorityV1, type TypeScriptWorldOracleV1 } from "../app/game/typescript-world-authority.ts";

const ADDRESS = Object.freeze({ universeId: "1", locationId: "overworld" });

function authorityFixture() {
  const cells = new Map<string, { blockId: number; facing: number }>();
  const oracle: TypeScriptWorldOracleV1 = {
    isChunkLoaded(chunkX, chunkZ) { return chunkX === 0 && chunkZ === 0; },
    readCell(x, y, z) {
      if (x < 0 || x >= 16 || z < 0 || z >= 16) return undefined;
      const cell = cells.get(`${x},${y},${z}`) ?? { blockId: BlockId.Air, facing: 0 };
      return {
        ...cell,
        liquid: { kind: WorldLiquidKindV1.None, level: 0, source: false, falling: false, containsWater: false, waterlogged: false },
      };
    },
    isDirectionalBlock(blockId) { return blockId === BlockId.Chest; },
    isWaterloggedBlock() { return false; },
    commitAtomic(changes) { for (const change of changes) cells.set(`${change.x},${change.y},${change.z}`, { blockId: change.blockId, facing: change.facing }); },
  };
  const authority = new TypeScriptWorldAuthorityV1(ADDRESS, oracle);
  const snapshot = authority.readNearField({ origin: { x: 0, y: 0, z: 0 }, size: { x: 2, y: 2, z: 2 } });
  const current = {
    identity: () => authority.currentIdentity(),
    section: (address: WorldSectionAddressV1) => authority.currentSectionRevision(address),
  };
  return { authority, snapshot, current };
}

function validResponse(request: RustWorldMirrorRequestV1): RustWorldMirrorResponseV1 {
  return {
    type: "rust-world-mirror-result-v1",
    protocolVersion: WORLD_AUTHORITY_PROTOCOL_V1,
    schemaVersion: WORLD_AUTHORITY_SCHEMA_V1,
    requestId: request.requestId,
    sourceSnapshotHash: request.snapshot.snapshotHash,
    sourceIdentity: request.snapshot.identity,
    resultHash: hashCanonicalWorldValueV1("test-rust-world-result", { snapshotHash: request.snapshot.snapshotHash }),
    payload: Uint8Array.from([1, 2, 3]),
  };
}

test("Rust world mirror is dormant by default and never calls a configured transport", async () => {
  const { snapshot, current } = authorityFixture();
  let calls = 0;
  const transport: RustWorldMirrorTransportV1 = { async evaluate(request) { calls += 1; return validResponse(request); } };
  const mirror = new RustWorldAuthorityMirrorV1({ transport });
  assert.deepEqual(await mirror.inspect(snapshot, current), { status: "disabled", reason: "not-enabled" });
  assert.equal(calls, 0);
  assert.equal(mirror.diagnostics().submitted, 0);
});

test("enabled mirror uses one coarse transferable snapshot and copies opaque output ownership", async () => {
  const { snapshot, current } = authorityFixture();
  let transfers: readonly ArrayBuffer[] = [];
  const transport: RustWorldMirrorTransportV1 = {
    async evaluate(request, received) {
      transfers = received ?? [];
      assert.notEqual(request.snapshot.streams.blocks.buffer, snapshot.streams.blocks.buffer);
      return validResponse(request);
    },
  };
  const mirror = new RustWorldAuthorityMirrorV1({ enabled: true, transport });
  const result = await mirror.inspect(snapshot, current);
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.deepEqual([...result.payload], [1, 2, 3]);
  assert.equal(transfers.length, 7);
  assert.equal(mirror.diagnostics().completed, 1);
  assert.equal(mirror.diagnostics().transferredBytes, transfers.reduce((sum, buffer) => sum + buffer.byteLength, 0));
  const clone = cloneWorldReadWindowForTransferV1(snapshot);
  assert.equal(clone.snapshotHash, snapshot.snapshotHash);
  assert.equal(worldReadWindowTransferListV1(clone).length, 7);
});

test("authority changes, section changes, superseded requests, and malformed replies are rejected", async () => {
  const first = authorityFixture();
  let resolveSlow!: (response: RustWorldMirrorResponseV1) => void;
  let slowRequest!: RustWorldMirrorRequestV1;
  const slowTransport: RustWorldMirrorTransportV1 = {
    evaluate(request) {
      slowRequest = request;
      return new Promise((resolve) => { resolveSlow = resolve; });
    },
  };
  const slowMirror = new RustWorldAuthorityMirrorV1({ enabled: true, transport: slowTransport });
  const pending = slowMirror.inspect(first.snapshot, first.current);
  const changed = first.authority.applyMutationBatch({
    schemaVersion: WORLD_AUTHORITY_SCHEMA_V1,
    batchId: "change-while-rust-runs",
    authorityId: "host",
    address: ADDRESS,
    expectedRevision: first.authority.currentRevision(),
    commands: [{ kind: "set-block", x: 0, y: 0, z: 0, blockId: BlockId.Stone }],
  });
  assert.equal(changed.status, "accepted");
  assert.ok(slowRequest && resolveSlow);
  resolveSlow(validResponse(slowRequest));
  assert.deepEqual(await pending, { status: "stale", reason: "authority-changed" });

  const second = authorityFixture();
  const malformed = new RustWorldAuthorityMirrorV1({
    enabled: true,
    transport: { async evaluate(request) { return { ...validResponse(request), resultHash: "bad" }; } },
  });
  const invalid = await malformed.inspect(second.snapshot, second.current);
  assert.equal(invalid.status, "error");
  assert.equal(invalid.reason, "invalid-response");

  const requests: RustWorldMirrorRequestV1[] = [];
  const resolvers: Array<(response: RustWorldMirrorResponseV1) => void> = [];
  const superseded = new RustWorldAuthorityMirrorV1({
    enabled: true,
    transport: {
      evaluate(request) {
        requests.push(request);
        return new Promise((resolve) => resolvers.push(resolve));
      },
    },
  });
  const oldPending = superseded.inspect(second.snapshot, second.current);
  const newPending = superseded.inspect(second.snapshot, second.current);
  resolvers[1](validResponse(requests[1]));
  assert.equal((await newPending).status, "ready");
  resolvers[0](validResponse(requests[0]));
  assert.deepEqual(await oldPending, { status: "stale", reason: "superseded-request" });
});
