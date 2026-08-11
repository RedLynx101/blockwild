use crate::{
    MAX_RECORD_BYTES_V1, MAX_RECORDS_PER_CHECKPOINT_V1, Mutation, PERSISTENCE_SCHEMA_V1, PersistenceError,
    RecordAddress, RecordDescriptor, Transaction, validate_label,
};
use blockwild_types::{CanonicalHash, CanonicalHasher};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Checkpoint {
    pub schema_version: u16,
    pub checkpoint_id: String,
    pub parent_checkpoint_id: Option<String>,
    pub world_id: String,
    pub journal_sequence: u64,
    pub generator_hash: CanonicalHash,
    pub content_hash: CanonicalHash,
    pub created_at: u64,
    pub records: Vec<RecordDescriptor>,
    pub checkpoint_hash: CanonicalHash,
}

impl Checkpoint {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        checkpoint_id: impl Into<String>,
        parent_checkpoint_id: Option<String>,
        world_id: impl Into<String>,
        journal_sequence: u64,
        generator_hash: CanonicalHash,
        content_hash: CanonicalHash,
        created_at: u64,
        mut records: Vec<RecordDescriptor>,
    ) -> Result<Self, PersistenceError> {
        let checkpoint_id = checkpoint_id.into();
        let world_id = world_id.into();
        validate_label(&checkpoint_id, 180, "checkpoint_id")?;
        validate_label(&world_id, 180, "world_id")?;
        if let Some(parent) = &parent_checkpoint_id {
            validate_label(parent, 180, "parent_checkpoint_id")?;
        }
        if records.len() > MAX_RECORDS_PER_CHECKPOINT_V1 {
            return Err(PersistenceError::new(
                "checkpoint-size",
                "checkpoint exceeds its record budget",
            ));
        }
        records.sort_by(|left, right| left.address.cmp(&right.address));
        let mut seen = BTreeSet::new();
        for record in &records {
            if record.revision == 0 || record.byte_length as usize > MAX_RECORD_BYTES_V1 {
                return Err(PersistenceError::new(
                    "record-descriptor",
                    "checkpoint record descriptor is invalid",
                ));
            }
            if !seen.insert(record.address.canonical_key()) {
                return Err(PersistenceError::new(
                    "duplicate-record",
                    "checkpoint contains duplicate record addresses",
                ));
            }
        }
        let checkpoint_hash = hash_checkpoint(
            &checkpoint_id,
            parent_checkpoint_id.as_deref(),
            &world_id,
            journal_sequence,
            generator_hash,
            content_hash,
            created_at,
            &records,
        );
        Ok(Self {
            schema_version: PERSISTENCE_SCHEMA_V1,
            checkpoint_id,
            parent_checkpoint_id,
            world_id,
            journal_sequence,
            generator_hash,
            content_hash,
            created_at,
            records,
            checkpoint_hash,
        })
    }

    pub fn verify(&self) -> Result<(), PersistenceError> {
        if self.schema_version != PERSISTENCE_SCHEMA_V1 {
            return Err(PersistenceError::new("schema", "unsupported checkpoint schema"));
        }
        let expected = hash_checkpoint(
            &self.checkpoint_id,
            self.parent_checkpoint_id.as_deref(),
            &self.world_id,
            self.journal_sequence,
            self.generator_hash,
            self.content_hash,
            self.created_at,
            &self.records,
        );
        if expected != self.checkpoint_hash {
            return Err(PersistenceError::new(
                "corrupt",
                "checkpoint hash does not match its canonical records",
            ));
        }
        Ok(())
    }

    #[must_use]
    pub fn record_revisions(&self) -> BTreeMap<RecordAddress, u64> {
        self.records
            .iter()
            .map(|record| (record.address.clone(), record.revision))
            .collect()
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CompactionPlan {
    pub journal_sequence: u64,
    pub records: Vec<RecordDescriptor>,
    pub dirty_record_keys: Vec<String>,
}

pub fn plan_compaction(checkpoint: &Checkpoint, journal: &[Transaction]) -> Result<CompactionPlan, PersistenceError> {
    checkpoint.verify()?;
    let mut latest: BTreeMap<RecordAddress, RecordDescriptor> = checkpoint
        .records
        .iter()
        .cloned()
        .map(|record| (record.address.clone(), record))
        .collect();
    let mut dirty = BTreeSet::new();
    let mut ordered = journal.to_vec();
    ordered.sort_by_key(|transaction| transaction.next_journal_sequence);
    let mut expected_sequence = checkpoint.journal_sequence;
    for transaction in &ordered {
        transaction.validate_against(
            expected_sequence,
            &latest
                .iter()
                .map(|(address, record)| (address.clone(), record.revision))
                .collect(),
        )?;
        expected_sequence = transaction.next_journal_sequence;
        for mutation in &transaction.mutations {
            dirty.insert(mutation.address().canonical_key());
            match mutation {
                Mutation::Put {
                    address,
                    next_record_revision,
                    payload,
                    payload_hash,
                    ..
                } => {
                    latest.insert(
                        address.clone(),
                        RecordDescriptor {
                            address: address.clone(),
                            revision: *next_record_revision,
                            byte_length: payload.len() as u32,
                            payload_hash: *payload_hash,
                        },
                    );
                }
                Mutation::Delete { address, .. } => {
                    latest.remove(address);
                }
            }
        }
    }
    Ok(CompactionPlan {
        journal_sequence: expected_sequence,
        records: latest.into_values().collect(),
        dirty_record_keys: dirty.into_iter().collect(),
    })
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn hash_checkpoint(
    checkpoint_id: &str,
    parent_checkpoint_id: Option<&str>,
    world_id: &str,
    journal_sequence: u64,
    generator_hash: CanonicalHash,
    content_hash: CanonicalHash,
    created_at: u64,
    records: &[RecordDescriptor],
) -> CanonicalHash {
    let mut hasher = CanonicalHasher::new("blockwild-persistence-checkpoint-v1");
    hasher.write_u16(PERSISTENCE_SCHEMA_V1);
    hasher.write_str(checkpoint_id);
    hasher.write_u16(u16::from(parent_checkpoint_id.is_some()));
    if let Some(parent) = parent_checkpoint_id {
        hasher.write_str(parent);
    }
    hasher.write_str(world_id);
    hasher.write_u64(journal_sequence);
    hasher.write_str(&generator_hash.to_hex());
    hasher.write_str(&content_hash.to_hex());
    hasher.write_u64(created_at);
    hasher.write_u32(records.len() as u32);
    for record in records {
        record.address.write_hash(&mut hasher);
        hasher.write_u64(record.revision);
        hasher.write_u32(record.byte_length);
        hasher.write_str(&record.payload_hash.to_hex());
    }
    hasher.finish()
}
