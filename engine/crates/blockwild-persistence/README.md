# blockwild-persistence

Deterministic R8 save authority for the hybrid Rust engine. IndexedDB remains a
browser capability; save policy does not.

## Authority layers

`CanonicalWorldSaveSetV1::build` turns normalized compatibility chunks plus
individually addressed state records into a complete, hashed manifest. The
reserved compatibility records retain an exact compatibility export in 4 MiB
chunks. Missing, duplicate, extra, or corrupt records fail verification.

`PersistenceAuthorityV1` owns durable record revisions, dirty puts/deletes,
journal sequence, fingerprints, checkpoints, compaction thresholds, delete
tombstones, and deterministic state hashes. `prepare_commit` is side-effect
free with respect to durable state. `accept_durable_commit` advances only when
given an exact `DurableCommitReceiptV1` matching transaction ID, next journal
sequence, checkpoint hash, and a nonzero durable readback hash. Writes staged
while a commit is in flight remain dirty after that older receipt is accepted.

`PersistenceDispatcherV1` owns request IDs, transfer tokens, bounded BWPR
queueing, in-flight work, BWPA validation, idempotent response receipts,
backpressure, and retry decisions. Its stable methods are:

```text
prepare_commit(transaction, checkpoint)
recover(world_id, optional_checkpoint_id)
read_recovery_page(world_id, checkpoint_id, start, max_records, max_bytes)
estimate(world_id)
compact(world_id, checkpoint_id, expected_head_hash, retain_parents)
delete(world_id, optional_expected_head_hash, tombstone)
preserve_legacy_backup_chunk(world_id, backup_id, offset, total, bytes)
export_page(world_id, checkpoint_id, cursor, max_bytes)
import_chunk(world_id, import_id, offset, total, bytes)
finalize_import(world_id, import_id, archive_hash, total)
poll(max_bytes) -> optional { transfer_token, request_id, bytes }
complete(transfer_token, bwpa_bytes) -> PersistenceDispatchOutcomeV1
retry(previous_request_id)
checkpoint_state() / restore_state(bytes)
is_idle() / diagnostics() / close()
```

`poll` moves one request to the in-flight map. It never implicitly reissues an
indeterminate request. `complete` leaves a request in flight when a response is
malformed or belongs to another request, accepts an identical duplicate only
once, and rejects a conflicting duplicate. A forced-close dispatcher snapshot
preserves the original in-flight token.

## BWPR/BWPA operations

Operations 1-3 retain the existing byte-compatible commit and legacy recovery
fixture. Additive V1 platform operations are:

| ID | Rust decision | Browser capability |
| --- | --- | --- |
| 4 | `RecoverHead` | read latest or exact checkpoint metadata |
| 5 | `ReadRecoveryPage` | read the exact bounded descriptor/payload page |
| 6 | `Estimate` | return usage/quota observation |
| 7 | `Compact` | delete only Rust-named old journal/checkpoint data |
| 8 | `DeleteWorld` | apply expected-head delete plus tombstone |
| 9 | `PreserveLegacyBackupChunk` | durably store one raw legacy chunk |
| 10 | `ExportPage` | read one portable archive page |
| 11 | `ImportChunk` | stage one bounded archive chunk |
| 12 | `FinalizeImport` | validate and atomically publish staged import |

Every additive data payload is at most 4 MiB. `PagedRecoveryAssemblerV1` and
the portable `BWEX` frames reconstruct exact checkpoint/archive hashes without
a single 256 MiB message. `LegacyMigrationProgressV1` cannot complete until all
raw backup chunks, the new checkpoint, and the normalized semantic readback
have durable receipts.

## Browser integration

`app/game/rust-integrated-persistence-pump.ts` is deliberately policy-free. It
loops over `pollBulkPlatform`, passes each opaque BWPR to
`RustPersistenceBrowserRuntimeV1.execute`, and returns the opaque BWPA through
`completeBulkPlatform` under the Rust token. `wake` performs a scheduler-sized
bounded drain. `drainUntilIdle`, `flush`, and `shutdown` continue across bounded
batches until Rust returns empty.

Before operations 4-12 are enabled in an integrated runtime, the TypeScript
contract and IndexedDB adapter must decode/execute those exact capability
requests. Until that integration lands, only the existing 1-3 path is live;
the presence of this crate is not a production authority claim.

## Native inspection

After building the workspace:

```text
blockwild-tools save-inspect path/to/record.bwps
```

The inspector decodes and checks the outer checksum, canonical record hash,
schema, record count, and byte total without starting a renderer.

## Verification

```text
cargo test -p blockwild-persistence
cargo clippy -p blockwild-persistence --all-targets -- -D warnings
```

The native fixtures cover corruption, stale/racing responses, idempotent
completion, quota/retry policy, forced-close restoration, parent fallback,
migration backup gating, delete/no-resurrection, and chunked recovery/export.
The exact legacy TypeScript hash fixture remains a release veto until an
explicit schema migration is introduced.
