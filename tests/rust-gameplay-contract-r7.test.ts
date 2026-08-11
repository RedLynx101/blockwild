import assert from "node:assert/strict";
import test from "node:test";

import {
  RustGameplayContractErrorR7,
  assertRustGameplayCommandBatchR7,
  assertRustGameplayViewPageR7,
  createRustGameplayCommandBatchR7,
  createRustGameplayViewQueryR7,
  rustGameplayBatchTransferListR7,
  type RustGameplayAuthorityIdentityR7,
  type RustGameplayViewPageR7,
} from "../app/game/rust-gameplay-contract-r7.ts";

const ZERO = "0".repeat(32);

function identity(sequence = BigInt(0)): RustGameplayAuthorityIdentityR7 {
  return Object.freeze({
    universe: "univers-é-🌌",
    location: "Talon/希望",
    revision: Object.freeze({ epoch: 17, sequence, inventory: sequence, machines: sequence, combat: sequence, progression: sequence, cardforge: sequence }),
    stateHash: sequence.toString(16).padStart(32, "0"),
    replayHash: sequence.toString(16).padStart(32, "f").slice(-32),
  });
}

const DOMAINS = ["inventory", "machines", "combat", "capture", "progression", "quests", "economy", "cardforge"] as const;

test("one coarse command boundary covers every gameplay UI domain without browser mutation", () => {
  const metadata = new TextEncoder().encode('{"name":"Crème 🌿","bytes":[0,128,255]}');
  const batch = createRustGameplayCommandBatchR7({
    batchId: "batch-é",
    idempotencyKey: "idem-🌌",
    actor: { actorId: "player-希望", playerId: BigInt(7), entityId: BigInt(9), role: "host" },
    expected: identity(),
    commands: DOMAINS.map((domain, index) => ({ commandId: `command-${index}`, domain, typeId: `blockwild.${domain}.command.v1`, schema: 1, payload: Uint8Array.from(metadata) })),
  });
  assert.equal(batch.commands.length, 8);
  assert.deepEqual(batch.commands.map((command) => command.authorityDomain), ["inventory", "machines", "combat", "combat", "progression", "progression", "progression", "cardforge"]);
  assert.equal(rustGameplayBatchTransferListR7(batch).length, 8);
  assert.equal(batch.commands[0].payload.buffer === batch.commands[1].payload.buffer, false, "each transferred payload has independent ownership");
  assert.equal(assertRustGameplayCommandBatchR7(batch), batch);

  metadata.fill(0);
  assert.notEqual(batch.commands[0].payload[0], 0, "the command batch owns metadata bytes independently from the caller");
  const corrupt = { ...batch, commands: batch.commands.map((command, index) => index === 0 ? { ...command, payload: Uint8Array.of(9) } : command) };
  assert.throws(() => assertRustGameplayCommandBatchR7(corrupt), (error: unknown) => error instanceof RustGameplayContractErrorR7 && error.code === "hash");
});

test("commands reject duplicate ids, excessive bytes, malformed Unicode, and unknown domains", () => {
  const base = {
    batchId: "batch",
    idempotencyKey: "idem",
    actor: { actorId: "actor", playerId: BigInt(1), entityId: BigInt(1), role: "host" as const },
    expected: identity(),
  };
  assert.throws(() => createRustGameplayCommandBatchR7({ ...base, commands: [
    { commandId: "same", domain: "combat", typeId: "a", schema: 1, payload: new Uint8Array() },
    { commandId: "same", domain: "capture", typeId: "b", schema: 1, payload: new Uint8Array() },
  ] }), (error: unknown) => error instanceof RustGameplayContractErrorR7 && error.code === "duplicate");
  assert.throws(() => createRustGameplayCommandBatchR7({ ...base, commands: [
    { commandId: "large", domain: "inventory", typeId: "a", schema: 1, payload: new Uint8Array(256 * 1_024 + 1) },
  ] }), (error: unknown) => error instanceof RustGameplayContractErrorR7 && error.code === "payload");
  assert.throws(() => createRustGameplayCommandBatchR7({ ...base, batchId: "bad\ud800", commands: [
    { commandId: "one", domain: "inventory", typeId: "a", schema: 1, payload: new Uint8Array() },
  ] }), RustGameplayContractErrorR7);
  assert.throws(() => createRustGameplayCommandBatchR7({ ...base, commands: [
    { commandId: "one", domain: "unknown" as "inventory", typeId: "a", schema: 1, payload: new Uint8Array() },
  ] }), (error: unknown) => error instanceof RustGameplayContractErrorR7 && error.code === "domain");
});

test("bounded view queries canonicalize filters and pages reject duplicate or unordered records", () => {
  const query = createRustGameplayViewQueryR7({
    queryId: "field-guide",
    afterSequence: null,
    domains: ["cardforge", "inventory", "capture"],
    owners: ["zeta", "alpha"],
    recordIds: ["three", "one"],
    cursor: null,
    maxRecords: 8,
    maxBytes: 1_024,
  });
  assert.deepEqual(query.domains, ["inventory", "capture", "cardforge"]);
  assert.deepEqual(query.owners, ["alpha", "zeta"]);
  const records = [
    { domain: "inventory" as const, recordId: "bag", revision: BigInt(1), typeId: "inventory.view", schema: 1, payload: Uint8Array.of(0, 0x80, 0xff) },
    { domain: "capture" as const, recordId: "care-bond", revision: BigInt(1), typeId: "capture.view", schema: 1, payload: new TextEncoder().encode("友好的 🌿") },
    { domain: "cardforge" as const, recordId: "binder", revision: BigInt(1), typeId: "cardforge.view", schema: 1, payload: Uint8Array.of(7) },
  ];
  const page: RustGameplayViewPageR7 = {
    schema: 1,
    queryId: query.queryId,
    mode: "snapshot",
    baseSequence: BigInt(1),
    identity: identity(BigInt(1)),
    records,
    removed: [],
    nextCursor: null,
    truncated: false,
    byteLength: records.reduce((sum, record) => sum + record.payload.byteLength, 0),
  };
  assert.equal(assertRustGameplayViewPageR7(page, query), page);
  assert.throws(() => assertRustGameplayViewPageR7({ ...page, records: [records[1], records[0]] }, query), (error: unknown) => error instanceof RustGameplayContractErrorR7 && error.code === "order");
  assert.throws(() => assertRustGameplayViewPageR7({ ...page, records: [records[0], records[0]], byteLength: 6 }, query), (error: unknown) => error instanceof RustGameplayContractErrorR7 && error.code === "duplicate");
  assert.throws(() => createRustGameplayViewQueryR7({ ...query, domains: ["inventory", "inventory"] }), (error: unknown) => error instanceof RustGameplayContractErrorR7 && error.code === "duplicate");
  assert.throws(() => createRustGameplayViewQueryR7({ ...query, owners: ["same", "same"] }), (error: unknown) => error instanceof RustGameplayContractErrorR7 && error.code === "duplicate");
  assert.throws(() => assertRustGameplayViewPageR7({ ...page, nextCursor: "next", truncated: false }, query), RustGameplayContractErrorR7);
});

test("delta pages require after-sequence mode and exact byte accounting", () => {
  const query = createRustGameplayViewQueryR7({ queryId: "delta", afterSequence: BigInt(7), domains: ["quests"], owners: [], recordIds: [], cursor: null, maxRecords: 4, maxBytes: 32 });
  const page: RustGameplayViewPageR7 = {
    schema: 1,
    queryId: "delta",
    mode: "delta",
    baseSequence: BigInt(7),
    identity: identity(BigInt(8)),
    records: [],
    removed: [{ domain: "quests", recordId: "quest-é", revision: BigInt(8) }],
    nextCursor: null,
    truncated: false,
    byteLength: 0,
  };
  assert.equal(assertRustGameplayViewPageR7(page, query), page);
  assert.throws(() => assertRustGameplayViewPageR7({ ...page, mode: "snapshot" }, query), RustGameplayContractErrorR7);
  assert.throws(() => assertRustGameplayViewPageR7({ ...page, byteLength: 1 }, query), RustGameplayContractErrorR7);
  assert.equal(ZERO.length, 32);
});

