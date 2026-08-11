use super::*;
use blockwild_types::CanonicalHash;
use std::collections::BTreeMap;

fn hash(hex: &str) -> CanonicalHash {
    assert_eq!(hex.len(), 32);
    let mut bytes = [0_u8; 16];
    for (index, byte) in bytes.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&hex[index * 2..index * 2 + 2], 16).expect("fixture hash");
    }
    CanonicalHash(bytes)
}

fn address(record_id: &str) -> RecordAddress {
    RecordAddress::new("universe:primary", "overworld", RecordKind::Entity, record_id).expect("address")
}

fn put(record_id: &str, payload: &[u8], expected: Option<u64>) -> MutationInput {
    MutationInput::Put {
        address: address(record_id),
        expected_record_revision: expected,
        next_record_revision: expected.map_or(1, |value| value + 1),
        payload: payload.to_vec(),
    }
}

fn fixture_transaction() -> Transaction {
    Transaction::new(
        "transaction:1",
        "world:fixture",
        "checkpoint:base",
        0,
        1,
        vec![put("zeta", &[9, 8, 7], None), put("alpha", &[1, 2, 3], None)],
    )
    .expect("transaction")
}

fn fixture_checkpoint(transaction: &Transaction) -> Checkpoint {
    Checkpoint::new(
        "checkpoint:base",
        None,
        "world:fixture",
        0,
        hash("0123456789abcdef0123456789abcdef"),
        hash("fedcba9876543210fedcba9876543210"),
        10,
        transaction
            .mutations
            .iter()
            .map(|mutation| match mutation {
                Mutation::Put {
                    address,
                    next_record_revision,
                    payload,
                    payload_hash,
                    ..
                } => RecordDescriptor {
                    address: address.clone(),
                    revision: *next_record_revision,
                    byte_length: payload.len() as u32,
                    payload_hash: *payload_hash,
                },
                Mutation::Delete { .. } => unreachable!("fixture contains puts"),
            })
            .collect(),
    )
    .expect("checkpoint")
}

#[test]
fn transaction_and_checkpoint_hashes_match_typescript_oracle() {
    let transaction = fixture_transaction();
    assert_eq!(
        transaction.transaction_hash.to_hex(),
        "0dc84e18e6a13a7370f7de204cc97d96"
    );
    assert_eq!(transaction.mutations[0].address().record_id, "alpha");
    assert_eq!(transaction.mutations[1].address().record_id, "zeta");
    let payload_hashes: Vec<_> = transaction
        .mutations
        .iter()
        .map(|mutation| match mutation {
            Mutation::Put { payload_hash, .. } => payload_hash.to_hex(),
            Mutation::Delete { .. } => String::new(),
        })
        .collect();
    assert_eq!(
        payload_hashes,
        ["82d0b0d3a4b3d70430787e1e6c6610d3", "a8d8d3faa487014a70f7de206c2e87e0"]
    );
    let checkpoint = fixture_checkpoint(&transaction);
    assert_eq!(checkpoint.checkpoint_hash.to_hex(), "533b9ddef51ef2d980ed94f603ae672e");
    checkpoint.verify().expect("valid checkpoint");
}

#[test]
fn uri_keys_match_javascript_encode_uri_component_rules() {
    let value = RecordAddress::new("a:b", "moon/hope", RecordKind::MapKnowledge, "rune owl! ðŸŒ¿").expect("address");
    assert_eq!(
        value.canonical_key(),
        "a%3Ab@moon%2Fhope/map-knowledge/rune%20owl!%20%C3%B0%C5%B8%C5%92%C2%BF"
    );
}

#[test]
fn journal_application_is_atomic_and_rejects_stale_or_partial_work() {
    let mut journal = JournalState::default();
    let receipt = journal.apply(&fixture_transaction()).expect("commit");
    assert_eq!(receipt.journal_sequence, 1);
    assert_eq!(journal.records().len(), 2);
    let before = journal.clone();
    let stale = Transaction::new(
        "transaction:2",
        "world:fixture",
        "checkpoint:base",
        1,
        2,
        vec![put("alpha", &[4], Some(1)), put("zeta", &[5], Some(9))],
    )
    .expect("structurally valid");
    let error = journal.apply(&stale).expect_err("record conflict");
    assert_eq!(error.code, "record-conflict");
    assert_eq!(journal, before, "failed multi-record work commits nothing");
}

#[test]
fn compaction_tracks_only_dirty_records_and_requires_contiguous_sequences() {
    let base_transaction = fixture_transaction();
    let checkpoint = fixture_checkpoint(&base_transaction);
    let update = Transaction::new(
        "transaction:1",
        "world:fixture",
        "checkpoint:base",
        0,
        1,
        vec![put("alpha", &[4, 5], Some(1))],
    )
    .expect("update");
    let delete = Transaction::new(
        "transaction:2",
        "world:fixture",
        "checkpoint:base",
        1,
        2,
        vec![MutationInput::Delete {
            address: address("zeta"),
            expected_record_revision: 1,
            next_record_revision: 2,
        }],
    )
    .expect("delete");
    let plan = plan_compaction(&checkpoint, &[delete.clone(), update]).expect("compaction");
    assert_eq!(plan.journal_sequence, 2);
    assert_eq!(plan.records.len(), 1);
    assert_eq!(plan.records[0].address.record_id, "alpha");
    assert_eq!(plan.dirty_record_keys.len(), 2);
    assert_eq!(
        plan_compaction(&checkpoint, &[delete]).expect_err("gap").code,
        "stale-sequence"
    );
}

#[test]
fn migration_matches_typescript_and_never_aliases_source_or_normalized_input() {
    let source = vec![9, 7, 5, 3];
    let normalized = vec![1, 3, 5, 7];
    let bundle = LegacyMigrationBundle::new(
        "legacy:fixture",
        LegacySourceFormat::BlockwildWorldV2,
        "world:fixture",
        &source,
        &normalized,
    )
    .expect("migration");
    assert_eq!(bundle.source_hash.to_hex(), "5148240d243f200cb0d1f17a91b7ca2f");
    assert_eq!(bundle.normalized_hash.to_hex(), "997bed47e11ec0e9f0c57d3390bf8490");
    assert_eq!(bundle.migration_hash.to_hex(), "37f542d10c0eda24800fa52fd90ff042");
    assert_eq!(source, [9, 7, 5, 3]);
    assert_eq!(normalized, [1, 3, 5, 7]);
    bundle.validate().expect("valid migration");
}

#[test]
fn recovery_uses_older_complete_checkpoint_before_repairing_newer_corruption() {
    let transaction = fixture_transaction();
    let older = fixture_checkpoint(&transaction);
    let newer = Checkpoint::new(
        "checkpoint:newer",
        Some(older.checkpoint_id.clone()),
        older.world_id.clone(),
        1,
        older.generator_hash,
        older.content_hash,
        20,
        older.records.clone(),
    )
    .expect("newer");
    let complete: BTreeMap<_, _> = older
        .records
        .iter()
        .map(|record| (record.address.canonical_key(), record.payload_hash))
        .collect();
    let corrupt = BTreeMap::from([(
        newer.records[0].address.canonical_key(),
        hash("fedcba9876543210fedcba9876543210"),
    )]);
    let decision = decide_recovery(&[
        RecoveryCandidate {
            checkpoint: newer.clone(),
            available_record_hashes: corrupt.clone(),
        },
        RecoveryCandidate {
            checkpoint: older.clone(),
            available_record_hashes: complete,
        },
    ]);
    assert_eq!(decision.status, RecoveryStatus::Ready);
    assert_eq!(
        decision.checkpoint.expect("checkpoint").checkpoint_id,
        older.checkpoint_id
    );
    let repair = decide_recovery(&[RecoveryCandidate {
        checkpoint: newer,
        available_record_hashes: corrupt,
    }]);
    assert_eq!(repair.status, RecoveryStatus::Repairable);
    assert_eq!(repair.missing_records.len(), 1);
    assert_eq!(repair.corrupt_records.len(), 1);
}

#[test]
fn wire_records_round_trip_and_checksum_corruption_fails_before_decode() {
    let transaction = fixture_transaction();
    let checkpoint = fixture_checkpoint(&transaction);
    let migration = LegacyMigrationBundle::new(
        "legacy:fixture",
        LegacySourceFormat::BlockwildWorldV2,
        "world:fixture",
        &[9, 7],
        &[1, 3],
    )
    .expect("migration");
    assert_eq!(
        decode_record(&encode_transaction(&transaction)).expect("transaction wire"),
        PersistenceWireRecord::Transaction(transaction)
    );
    assert_eq!(
        decode_record(&encode_checkpoint(&checkpoint)).expect("checkpoint wire"),
        PersistenceWireRecord::Checkpoint(checkpoint)
    );
    assert_eq!(
        decode_record(&encode_migration(&migration)).expect("migration wire"),
        PersistenceWireRecord::Migration(migration)
    );
    let mut corrupted = encode_checkpoint(&fixture_checkpoint(&fixture_transaction()));
    let last = corrupted.len() - 1;
    corrupted[last] ^= 1;
    assert_eq!(decode_record(&corrupted).expect_err("checksum").code, "wire-checksum");
}
