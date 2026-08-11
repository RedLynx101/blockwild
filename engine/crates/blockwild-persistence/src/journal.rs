use crate::{
    MAX_MUTATIONS_V1, MAX_RECORD_BYTES_V1, MAX_TRANSACTION_BYTES_V1, PERSISTENCE_SCHEMA_V1, PersistenceError,
    RecordAddress, payload_hash, validate_label,
};
use blockwild_types::{CanonicalHash, CanonicalHasher};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MutationInput {
    Put {
        address: RecordAddress,
        expected_record_revision: Option<u64>,
        next_record_revision: u64,
        payload: Vec<u8>,
    },
    Delete {
        address: RecordAddress,
        expected_record_revision: u64,
        next_record_revision: u64,
    },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Mutation {
    Put {
        address: RecordAddress,
        expected_record_revision: Option<u64>,
        next_record_revision: u64,
        payload: Vec<u8>,
        payload_hash: CanonicalHash,
    },
    Delete {
        address: RecordAddress,
        expected_record_revision: u64,
        next_record_revision: u64,
    },
}

impl Mutation {
    #[must_use]
    pub const fn address(&self) -> &RecordAddress {
        match self {
            Self::Put { address, .. } | Self::Delete { address, .. } => address,
        }
    }

    #[must_use]
    pub const fn next_record_revision(&self) -> u64 {
        match self {
            Self::Put {
                next_record_revision, ..
            }
            | Self::Delete {
                next_record_revision, ..
            } => *next_record_revision,
        }
    }

    #[must_use]
    pub const fn expected_record_revision(&self) -> Option<u64> {
        match self {
            Self::Put {
                expected_record_revision,
                ..
            } => *expected_record_revision,
            Self::Delete {
                expected_record_revision,
                ..
            } => Some(*expected_record_revision),
        }
    }

    #[must_use]
    pub fn payload(&self) -> Option<&[u8]> {
        match self {
            Self::Put { payload, .. } => Some(payload),
            Self::Delete { .. } => None,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Transaction {
    pub schema_version: u16,
    pub transaction_id: String,
    pub world_id: String,
    pub checkpoint_id: String,
    pub expected_journal_sequence: u64,
    pub next_journal_sequence: u64,
    pub mutations: Vec<Mutation>,
    pub byte_length: u64,
    pub transaction_hash: CanonicalHash,
}

impl Transaction {
    pub fn new(
        transaction_id: impl Into<String>,
        world_id: impl Into<String>,
        checkpoint_id: impl Into<String>,
        expected_journal_sequence: u64,
        next_journal_sequence: u64,
        mutations: Vec<MutationInput>,
    ) -> Result<Self, PersistenceError> {
        let transaction_id = transaction_id.into();
        let world_id = world_id.into();
        let checkpoint_id = checkpoint_id.into();
        validate_label(&transaction_id, 180, "transaction_id")?;
        validate_label(&world_id, 180, "world_id")?;
        validate_label(&checkpoint_id, 180, "checkpoint_id")?;
        if next_journal_sequence != expected_journal_sequence.saturating_add(1) {
            return Err(PersistenceError::new(
                "journal-sequence",
                "next journal sequence must be exactly one greater than expected",
            ));
        }
        if mutations.is_empty() || mutations.len() > MAX_MUTATIONS_V1 {
            return Err(PersistenceError::new(
                "mutation-count",
                format!("transaction requires 1..={MAX_MUTATIONS_V1} mutations"),
            ));
        }
        let mut normalized = Vec::with_capacity(mutations.len());
        for mutation in mutations {
            normalized.push(normalize_mutation(mutation)?);
        }
        normalized.sort_by(|left, right| left.address().cmp(right.address()));
        let mut seen = BTreeSet::new();
        for mutation in &normalized {
            if !seen.insert(mutation.address().canonical_key()) {
                return Err(PersistenceError::new(
                    "duplicate-record",
                    "one transaction may mutate each record at most once",
                ));
            }
        }
        let byte_length = normalized.iter().try_fold(0_u64, |total, mutation| {
            let length = mutation.payload().map_or(0, |payload| payload.len() as u64);
            total
                .checked_add(length)
                .ok_or_else(|| PersistenceError::new("transaction-size", "transaction byte length overflow"))
        })?;
        if byte_length > MAX_TRANSACTION_BYTES_V1 as u64 {
            return Err(PersistenceError::new(
                "transaction-size",
                "transaction payload exceeds the V1 byte budget",
            ));
        }
        let transaction_hash = hash_transaction(
            &transaction_id,
            &world_id,
            &checkpoint_id,
            expected_journal_sequence,
            next_journal_sequence,
            &normalized,
        );
        Ok(Self {
            schema_version: PERSISTENCE_SCHEMA_V1,
            transaction_id,
            world_id,
            checkpoint_id,
            expected_journal_sequence,
            next_journal_sequence,
            mutations: normalized,
            byte_length,
            transaction_hash,
        })
    }

    pub fn validate_against(
        &self,
        journal_sequence: u64,
        current_revisions: &BTreeMap<RecordAddress, u64>,
    ) -> Result<(), PersistenceError> {
        if self.schema_version != PERSISTENCE_SCHEMA_V1 {
            return Err(PersistenceError::new(
                "schema",
                "unsupported persistence transaction schema",
            ));
        }
        if self.expected_journal_sequence != journal_sequence
            || self.next_journal_sequence != journal_sequence.saturating_add(1)
        {
            return Err(PersistenceError::new(
                "stale-sequence",
                "transaction journal sequence is stale",
            ));
        }
        let expected_hash = hash_transaction(
            &self.transaction_id,
            &self.world_id,
            &self.checkpoint_id,
            self.expected_journal_sequence,
            self.next_journal_sequence,
            &self.mutations,
        );
        if expected_hash != self.transaction_hash {
            return Err(PersistenceError::new(
                "corrupt",
                "transaction hash does not match its canonical contents",
            ));
        }
        for mutation in &self.mutations {
            let current = current_revisions.get(mutation.address()).copied();
            if current != mutation.expected_record_revision() {
                return Err(PersistenceError::new(
                    "record-conflict",
                    format!("record {} revision changed", mutation.address().canonical_key()),
                ));
            }
        }
        Ok(())
    }
}

fn normalize_mutation(input: MutationInput) -> Result<Mutation, PersistenceError> {
    match input {
        MutationInput::Put {
            address,
            expected_record_revision,
            next_record_revision,
            payload,
        } => {
            if payload.len() > MAX_RECORD_BYTES_V1 {
                return Err(PersistenceError::new(
                    "record-size",
                    "record payload exceeds the V1 byte budget",
                ));
            }
            match expected_record_revision {
                Some(expected) if next_record_revision == expected.saturating_add(1) => {}
                None if next_record_revision == 1 => {}
                Some(_) => {
                    return Err(PersistenceError::new(
                        "record-revision",
                        "next record revision must be exactly one greater than expected",
                    ));
                }
                None => {
                    return Err(PersistenceError::new(
                        "record-create-revision",
                        "a newly created record begins at revision 1",
                    ));
                }
            }
            let digest = payload_hash(&payload);
            Ok(Mutation::Put {
                address,
                expected_record_revision,
                next_record_revision,
                payload,
                payload_hash: digest,
            })
        }
        MutationInput::Delete {
            address,
            expected_record_revision,
            next_record_revision,
        } => {
            if next_record_revision != expected_record_revision.saturating_add(1) {
                return Err(PersistenceError::new(
                    "record-revision",
                    "delete revision must be exactly one greater than expected",
                ));
            }
            Ok(Mutation::Delete {
                address,
                expected_record_revision,
                next_record_revision,
            })
        }
    }
}

pub(crate) fn hash_transaction(
    transaction_id: &str,
    world_id: &str,
    checkpoint_id: &str,
    expected_journal_sequence: u64,
    next_journal_sequence: u64,
    mutations: &[Mutation],
) -> CanonicalHash {
    let mut hasher = CanonicalHasher::new("blockwild-persistence-transaction-v1");
    hasher.write_u16(PERSISTENCE_SCHEMA_V1);
    hasher.write_str(transaction_id);
    hasher.write_str(world_id);
    hasher.write_str(checkpoint_id);
    hasher.write_u64(expected_journal_sequence);
    hasher.write_u64(next_journal_sequence);
    hasher.write_u32(mutations.len() as u32);
    for mutation in mutations {
        match mutation {
            Mutation::Put {
                address,
                expected_record_revision,
                next_record_revision,
                payload,
                payload_hash,
            } => {
                hasher.write_str("put");
                address.write_hash(&mut hasher);
                hasher.write_u16(u16::from(expected_record_revision.is_some()));
                if let Some(expected) = expected_record_revision {
                    hasher.write_u64(*expected);
                }
                hasher.write_u64(*next_record_revision);
                hasher.write_str(&payload_hash.to_hex());
                hasher.write_bytes(payload);
            }
            Mutation::Delete {
                address,
                expected_record_revision,
                next_record_revision,
            } => {
                hasher.write_str("delete");
                address.write_hash(&mut hasher);
                hasher.write_u16(1);
                hasher.write_u64(*expected_record_revision);
                hasher.write_u64(*next_record_revision);
            }
        }
    }
    hasher.finish()
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StoredRecord {
    pub revision: u64,
    pub payload: Vec<u8>,
    pub payload_hash: CanonicalHash,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct JournalCommitReceipt {
    pub transaction_id: String,
    pub journal_sequence: u64,
    pub dirty_record_keys: Vec<String>,
    pub state_hash: CanonicalHash,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct JournalState {
    sequence: u64,
    records: BTreeMap<RecordAddress, StoredRecord>,
}

impl JournalState {
    pub fn from_checkpoint(
        checkpoint: &crate::Checkpoint,
        payloads: &BTreeMap<RecordAddress, Vec<u8>>,
    ) -> Result<Self, PersistenceError> {
        checkpoint.verify()?;
        if checkpoint.records.len() != payloads.len() {
            return Err(PersistenceError::new(
                "recovery-completeness",
                "checkpoint and recovered payload counts disagree",
            ));
        }
        let mut records = BTreeMap::new();
        for descriptor in &checkpoint.records {
            let payload = payloads
                .get(&descriptor.address)
                .ok_or_else(|| PersistenceError::new("recovery-completeness", "checkpoint payload is missing"))?;
            if payload.len() != descriptor.byte_length as usize || payload_hash(payload) != descriptor.payload_hash {
                return Err(PersistenceError::new(
                    "corrupt",
                    "recovered payload does not match its checkpoint",
                ));
            }
            records.insert(
                descriptor.address.clone(),
                StoredRecord {
                    revision: descriptor.revision,
                    payload: payload.clone(),
                    payload_hash: descriptor.payload_hash,
                },
            );
        }
        Ok(Self {
            sequence: checkpoint.journal_sequence,
            records,
        })
    }

    #[must_use]
    pub const fn sequence(&self) -> u64 {
        self.sequence
    }

    #[must_use]
    pub fn record(&self, address: &RecordAddress) -> Option<&StoredRecord> {
        self.records.get(address)
    }

    #[must_use]
    pub fn records(&self) -> &BTreeMap<RecordAddress, StoredRecord> {
        &self.records
    }

    pub fn apply(&mut self, transaction: &Transaction) -> Result<JournalCommitReceipt, PersistenceError> {
        let revisions = self
            .records
            .iter()
            .map(|(address, record)| (address.clone(), record.revision))
            .collect();
        transaction.validate_against(self.sequence, &revisions)?;
        let mut next = self.records.clone();
        let mut dirty_record_keys = Vec::with_capacity(transaction.mutations.len());
        for mutation in &transaction.mutations {
            dirty_record_keys.push(mutation.address().canonical_key());
            match mutation {
                Mutation::Put {
                    address,
                    next_record_revision,
                    payload,
                    payload_hash,
                    ..
                } => {
                    next.insert(
                        address.clone(),
                        StoredRecord {
                            revision: *next_record_revision,
                            payload: payload.clone(),
                            payload_hash: *payload_hash,
                        },
                    );
                }
                Mutation::Delete { address, .. } => {
                    next.remove(address);
                }
            }
        }
        self.records = next;
        self.sequence = transaction.next_journal_sequence;
        Ok(JournalCommitReceipt {
            transaction_id: transaction.transaction_id.clone(),
            journal_sequence: self.sequence,
            dirty_record_keys,
            state_hash: self.state_hash(),
        })
    }

    #[must_use]
    pub fn state_hash(&self) -> CanonicalHash {
        let mut hasher = CanonicalHasher::new("blockwild-persistence-journal-state-v1");
        hasher.write_u64(self.sequence);
        hasher.write_u32(self.records.len() as u32);
        for (address, record) in &self.records {
            address.write_hash(&mut hasher);
            hasher.write_u64(record.revision);
            hasher.write_str(&record.payload_hash.to_hex());
            hasher.write_bytes(&record.payload);
        }
        hasher.finish()
    }
}
