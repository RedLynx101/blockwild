//! Rust-owned dirty records, journal planning, checkpointing, and lifecycle decisions.

use crate::{
    CanonicalWorldSaveSetV1, Checkpoint, JournalState, MAX_MUTATIONS_V1, MAX_TRANSACTION_BYTES_V1, MutationInput,
    PersistenceError, RecordAddress, RecordDescriptor, Transaction, payload_hash, validate_label,
};
use blockwild_types::{CanonicalHash, CanonicalHasher};
use std::collections::BTreeMap;

pub const DEFAULT_COMPACTION_TRANSACTION_THRESHOLD_V1: u32 = 64;
pub const DEFAULT_COMPACTION_DIRTY_BYTE_THRESHOLD_V1: u64 = 32 * 1024 * 1024;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DirtyRecordV1 {
    Put(Vec<u8>),
    Delete,
}

impl DirtyRecordV1 {
    fn signature(&self) -> CanonicalHash {
        let mut hasher = CanonicalHasher::new("blockwild-persistence-dirty-record-v1");
        match self {
            Self::Put(payload) => {
                hasher.write_u16(1);
                hasher.write_bytes(payload);
            }
            Self::Delete => hasher.write_u16(2),
        }
        hasher.finish()
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PreparedAuthorityCommitV1 {
    pub transaction: Transaction,
    pub checkpoint: Checkpoint,
    dirty_signatures: BTreeMap<RecordAddress, CanonicalHash>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DurableCommitReceiptV1 {
    pub request_id: u64,
    pub transaction_id: String,
    pub journal_sequence: u64,
    pub durable_hash: CanonicalHash,
    pub checkpoint_hash: CanonicalHash,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CompactionPolicyV1 {
    pub transaction_threshold: u32,
    pub dirty_byte_threshold: u64,
    pub retain_parent_count: u16,
}

impl Default for CompactionPolicyV1 {
    fn default() -> Self {
        Self {
            transaction_threshold: DEFAULT_COMPACTION_TRANSACTION_THRESHOLD_V1,
            dirty_byte_threshold: DEFAULT_COMPACTION_DIRTY_BYTE_THRESHOLD_V1,
            retain_parent_count: 2,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PersistenceAuthorityV1 {
    world_id: String,
    generator_hash: CanonicalHash,
    content_hash: CanonicalHash,
    journal: JournalState,
    checkpoint: Option<Checkpoint>,
    dirty: BTreeMap<RecordAddress, DirtyRecordV1>,
    pending_transaction_id: Option<String>,
    next_local_id: u64,
    transactions_since_compaction: u32,
    journal_bytes_since_compaction: u64,
    persistence_revision: u64,
    tombstone: Option<CanonicalHash>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PersistenceAuthorityDiagnosticsV1 {
    pub persistence_revision: u64,
    pub journal_sequence: u64,
    pub durable_records: usize,
    pub durable_bytes: u64,
    pub dirty_records: usize,
    pub dirty_bytes: u64,
    pub transactions_since_compaction: u32,
    pub journal_bytes_since_compaction: u64,
    pub commit_in_flight: bool,
    pub tombstoned: bool,
    pub state_hash: CanonicalHash,
}

impl PersistenceAuthorityV1 {
    pub fn empty(
        world_id: impl Into<String>,
        generator_hash: CanonicalHash,
        content_hash: CanonicalHash,
    ) -> Result<Self, PersistenceError> {
        let world_id = world_id.into();
        validate_label(&world_id, 180, "world_id")?;
        Ok(Self {
            world_id,
            generator_hash,
            content_hash,
            journal: JournalState::default(),
            checkpoint: None,
            dirty: BTreeMap::new(),
            pending_transaction_id: None,
            next_local_id: 1,
            transactions_since_compaction: 0,
            journal_bytes_since_compaction: 0,
            persistence_revision: 0,
            tombstone: None,
        })
    }

    pub fn recover(
        checkpoint: Checkpoint,
        payloads: BTreeMap<RecordAddress, Vec<u8>>,
    ) -> Result<Self, PersistenceError> {
        let journal = JournalState::from_checkpoint(&checkpoint, &payloads)?;
        Ok(Self {
            world_id: checkpoint.world_id.clone(),
            generator_hash: checkpoint.generator_hash,
            content_hash: checkpoint.content_hash,
            persistence_revision: checkpoint.journal_sequence,
            checkpoint: Some(checkpoint),
            journal,
            dirty: BTreeMap::new(),
            pending_transaction_id: None,
            next_local_id: 1,
            transactions_since_compaction: 0,
            journal_bytes_since_compaction: 0,
            tombstone: None,
        })
    }

    #[must_use]
    pub fn world_id(&self) -> &str {
        &self.world_id
    }

    #[must_use]
    pub const fn persistence_revision(&self) -> u64 {
        self.persistence_revision
    }

    #[must_use]
    pub const fn journal_sequence(&self) -> u64 {
        self.journal.sequence()
    }

    #[must_use]
    pub fn checkpoint(&self) -> Option<&Checkpoint> {
        self.checkpoint.as_ref()
    }

    #[must_use]
    pub fn records(&self) -> &BTreeMap<RecordAddress, crate::StoredRecord> {
        self.journal.records()
    }

    #[must_use]
    pub fn dirty_records(&self) -> &BTreeMap<RecordAddress, DirtyRecordV1> {
        &self.dirty
    }

    #[must_use]
    pub fn tombstone(&self) -> Option<CanonicalHash> {
        self.tombstone
    }

    pub fn stage_put(&mut self, address: RecordAddress, payload: Vec<u8>) -> Result<(), PersistenceError> {
        self.require_live()?;
        if payload.len() > crate::MAX_RECORD_BYTES_V1 {
            return Err(PersistenceError::new(
                "record-size",
                "dirty record exceeds its byte budget",
            ));
        }
        if self
            .journal
            .record(&address)
            .is_some_and(|record| record.payload == payload)
        {
            self.dirty.remove(&address);
        } else {
            self.dirty.insert(address, DirtyRecordV1::Put(payload));
        }
        Ok(())
    }

    pub fn stage_delete(&mut self, address: RecordAddress) -> Result<(), PersistenceError> {
        self.require_live()?;
        if self.journal.record(&address).is_none() {
            self.dirty.remove(&address);
        } else {
            self.dirty.insert(address, DirtyRecordV1::Delete);
        }
        Ok(())
    }

    pub fn stage_complete_save_set(&mut self, save: &CanonicalWorldSaveSetV1) -> Result<(), PersistenceError> {
        self.require_live()?;
        save.verify()?;
        if save.manifest.world_id != self.world_id
            || save.manifest.generator_hash != self.generator_hash
            || save.manifest.content_hash != self.content_hash
        {
            return Err(PersistenceError::new(
                "save-fingerprint",
                "save set does not match authority identity",
            ));
        }
        let current_addresses = self.journal.records().keys().cloned().collect::<Vec<_>>();
        for address in current_addresses {
            if !save.records.contains_key(&address) {
                self.stage_delete(address)?;
            }
        }
        for (address, payload) in &save.records {
            self.stage_put(address.clone(), payload.clone())?;
        }
        Ok(())
    }

    pub fn prepare_commit(&mut self, created_at: u64) -> Result<PreparedAuthorityCommitV1, PersistenceError> {
        self.require_live()?;
        if self.pending_transaction_id.is_some() {
            return Err(PersistenceError::new(
                "commit-in-flight",
                "one authority commit is already awaiting a durable receipt",
            ));
        }
        if self.dirty.is_empty() {
            return Err(PersistenceError::new(
                "nothing-dirty",
                "no dirty records require persistence",
            ));
        }
        let mut byte_length = 0_u64;
        let mut mutations = Vec::new();
        let mut dirty_signatures = BTreeMap::new();
        for (address, dirty) in &self.dirty {
            if mutations.len() == MAX_MUTATIONS_V1 {
                break;
            }
            let current = self.journal.record(address);
            let mutation = match dirty {
                DirtyRecordV1::Put(payload) => {
                    let next_bytes = byte_length.saturating_add(payload.len() as u64);
                    if !mutations.is_empty() && next_bytes > MAX_TRANSACTION_BYTES_V1 as u64 {
                        break;
                    }
                    byte_length = next_bytes;
                    MutationInput::Put {
                        address: address.clone(),
                        expected_record_revision: current.map(|record| record.revision),
                        next_record_revision: current.map_or(1, |record| record.revision.saturating_add(1)),
                        payload: payload.clone(),
                    }
                }
                DirtyRecordV1::Delete => {
                    let current = current
                        .ok_or_else(|| PersistenceError::new("dirty-delete", "dirty delete has no durable record"))?;
                    MutationInput::Delete {
                        address: address.clone(),
                        expected_record_revision: current.revision,
                        next_record_revision: current.revision.saturating_add(1),
                    }
                }
            };
            mutations.push(mutation);
            dirty_signatures.insert(address.clone(), dirty.signature());
        }
        let sequence = self.journal.sequence().saturating_add(1);
        let transaction_id = format!("bwtx:{sequence}:{}", self.next_local_id);
        let base_checkpoint_id = self
            .checkpoint
            .as_ref()
            .map_or_else(|| "root".to_owned(), |value| value.checkpoint_id.clone());
        let transaction = Transaction::new(
            transaction_id.clone(),
            self.world_id.clone(),
            base_checkpoint_id,
            self.journal.sequence(),
            sequence,
            mutations,
        )?;
        let mut next_journal = self.journal.clone();
        let receipt = next_journal.apply(&transaction)?;
        let checkpoint_id = format!("bwcp:{sequence}:{}", receipt.state_hash.to_hex());
        let checkpoint = Checkpoint::new(
            checkpoint_id,
            self.checkpoint.as_ref().map(|value| value.checkpoint_id.clone()),
            self.world_id.clone(),
            sequence,
            self.generator_hash,
            self.content_hash,
            created_at,
            next_journal
                .records()
                .iter()
                .map(|(address, record)| RecordDescriptor {
                    address: address.clone(),
                    revision: record.revision,
                    byte_length: record.payload.len() as u32,
                    payload_hash: record.payload_hash,
                })
                .collect(),
        )?;
        self.next_local_id = self.next_local_id.saturating_add(1);
        self.pending_transaction_id = Some(transaction_id);
        Ok(PreparedAuthorityCommitV1 {
            transaction,
            checkpoint,
            dirty_signatures,
        })
    }

    pub fn accept_durable_commit(
        &mut self,
        prepared: &PreparedAuthorityCommitV1,
        receipt: &DurableCommitReceiptV1,
    ) -> Result<(), PersistenceError> {
        if self.pending_transaction_id.as_deref() != Some(&prepared.transaction.transaction_id) {
            return Err(PersistenceError::new(
                "commit-receipt",
                "durable receipt does not match the in-flight authority commit",
            ));
        }
        if receipt.transaction_id != prepared.transaction.transaction_id
            || receipt.journal_sequence != prepared.transaction.next_journal_sequence
            || receipt.checkpoint_hash != prepared.checkpoint.checkpoint_hash
            || receipt.durable_hash == CanonicalHash::default()
        {
            return Err(PersistenceError::new(
                "commit-receipt",
                "durable receipt failed exact authority validation",
            ));
        }
        prepared.checkpoint.verify()?;
        let mut next_journal = self.journal.clone();
        next_journal.apply(&prepared.transaction)?;
        if descriptors(&next_journal) != prepared.checkpoint.records {
            return Err(PersistenceError::new(
                "commit-receipt",
                "prepared checkpoint does not match the committed journal state",
            ));
        }
        self.journal = next_journal;
        self.checkpoint = Some(prepared.checkpoint.clone());
        self.persistence_revision = self.persistence_revision.saturating_add(1);
        self.transactions_since_compaction = self.transactions_since_compaction.saturating_add(1);
        self.journal_bytes_since_compaction = self
            .journal_bytes_since_compaction
            .saturating_add(prepared.transaction.byte_length);
        for (address, signature) in &prepared.dirty_signatures {
            if self
                .dirty
                .get(address)
                .is_some_and(|dirty| dirty.signature() == *signature)
            {
                self.dirty.remove(address);
            }
        }
        self.pending_transaction_id = None;
        Ok(())
    }

    pub fn reject_or_abandon_commit(&mut self, prepared: &PreparedAuthorityCommitV1) -> Result<(), PersistenceError> {
        if self.pending_transaction_id.as_deref() != Some(&prepared.transaction.transaction_id) {
            return Err(PersistenceError::new(
                "commit-receipt",
                "prepared commit is not the in-flight authority commit",
            ));
        }
        self.pending_transaction_id = None;
        Ok(())
    }

    #[must_use]
    pub fn should_compact(&self, policy: CompactionPolicyV1) -> bool {
        self.transactions_since_compaction >= policy.transaction_threshold
            || self.journal_bytes_since_compaction >= policy.dirty_byte_threshold
    }

    pub fn accept_compaction(&mut self, expected_checkpoint_hash: CanonicalHash) -> Result<(), PersistenceError> {
        if self.checkpoint.as_ref().map(|value| value.checkpoint_hash) != Some(expected_checkpoint_hash) {
            return Err(PersistenceError::new(
                "compaction-race",
                "compaction receipt belongs to a stale checkpoint",
            ));
        }
        self.transactions_since_compaction = 0;
        self.journal_bytes_since_compaction = 0;
        self.persistence_revision = self.persistence_revision.saturating_add(1);
        Ok(())
    }

    pub fn delete_tombstone(&self) -> CanonicalHash {
        let mut hasher = CanonicalHasher::new("blockwild-persistence-world-delete-v1");
        hasher.write_str(&self.world_id);
        hasher.write_u64(self.persistence_revision);
        hasher.write_str(&self.checkpoint.as_ref().map_or_else(
            || CanonicalHash::default().to_hex(),
            |value| value.checkpoint_hash.to_hex(),
        ));
        hasher.finish()
    }

    pub fn accept_world_delete(&mut self, tombstone: CanonicalHash) -> Result<(), PersistenceError> {
        if tombstone != self.delete_tombstone() {
            return Err(PersistenceError::new(
                "delete-race",
                "world-delete receipt belongs to a stale authority state",
            ));
        }
        self.journal = JournalState::default();
        self.checkpoint = None;
        self.dirty.clear();
        self.pending_transaction_id = None;
        self.persistence_revision = self.persistence_revision.saturating_add(1);
        self.tombstone = Some(tombstone);
        Ok(())
    }

    pub fn recreate_after_delete(
        &mut self,
        expected_tombstone: CanonicalHash,
        generator_hash: CanonicalHash,
        content_hash: CanonicalHash,
    ) -> Result<(), PersistenceError> {
        if self.tombstone != Some(expected_tombstone) {
            return Err(PersistenceError::new(
                "delete-tombstone",
                "explicit recreate token does not match the deleted world",
            ));
        }
        self.generator_hash = generator_hash;
        self.content_hash = content_hash;
        self.tombstone = None;
        self.persistence_revision = self.persistence_revision.saturating_add(1);
        Ok(())
    }

    #[must_use]
    pub fn state_hash(&self) -> CanonicalHash {
        let mut hasher = CanonicalHasher::new("blockwild-persistence-authority-state-v1");
        hasher.write_str(&self.world_id);
        hasher.write_str(&self.generator_hash.to_hex());
        hasher.write_str(&self.content_hash.to_hex());
        hasher.write_u64(self.persistence_revision);
        hasher.write_str(&self.journal.state_hash().to_hex());
        hasher.write_u32(self.dirty.len() as u32);
        for (address, dirty) in &self.dirty {
            address.write_hash(&mut hasher);
            hasher.write_str(&dirty.signature().to_hex());
        }
        hasher.write_str(&self.tombstone.unwrap_or_default().to_hex());
        hasher.finish()
    }

    /// Stable counters for native/Wasm benchmarks and soak gates.
    #[must_use]
    pub fn diagnostics(&self) -> PersistenceAuthorityDiagnosticsV1 {
        PersistenceAuthorityDiagnosticsV1 {
            persistence_revision: self.persistence_revision,
            journal_sequence: self.journal.sequence(),
            durable_records: self.journal.records().len(),
            durable_bytes: self
                .journal
                .records()
                .values()
                .map(|record| record.payload.len() as u64)
                .sum(),
            dirty_records: self.dirty.len(),
            dirty_bytes: self
                .dirty
                .values()
                .map(|dirty| match dirty {
                    DirtyRecordV1::Put(payload) => payload.len() as u64,
                    DirtyRecordV1::Delete => 0,
                })
                .sum(),
            transactions_since_compaction: self.transactions_since_compaction,
            journal_bytes_since_compaction: self.journal_bytes_since_compaction,
            commit_in_flight: self.pending_transaction_id.is_some(),
            tombstoned: self.tombstone.is_some(),
            state_hash: self.state_hash(),
        }
    }

    fn require_live(&self) -> Result<(), PersistenceError> {
        if self.tombstone.is_some() {
            Err(PersistenceError::new(
                "world-deleted",
                "deleted world cannot acquire dirty records without explicit recreation",
            ))
        } else {
            Ok(())
        }
    }
}

fn descriptors(journal: &JournalState) -> Vec<RecordDescriptor> {
    journal
        .records()
        .iter()
        .map(|(address, record)| RecordDescriptor {
            address: address.clone(),
            revision: record.revision,
            byte_length: record.payload.len() as u32,
            payload_hash: payload_hash(&record.payload),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::RecordKind;

    fn address(id: &str) -> RecordAddress {
        RecordAddress::new("u", "surface", RecordKind::Entity, id).unwrap()
    }
    fn hash(byte: u8) -> CanonicalHash {
        CanonicalHash([byte; 16])
    }

    fn durable(prepared: &PreparedAuthorityCommitV1) -> DurableCommitReceiptV1 {
        DurableCommitReceiptV1 {
            request_id: 1,
            transaction_id: prepared.transaction.transaction_id.clone(),
            journal_sequence: prepared.transaction.next_journal_sequence,
            durable_hash: hash(9),
            checkpoint_hash: prepared.checkpoint.checkpoint_hash,
        }
    }

    #[test]
    fn dirty_state_advances_only_after_exact_durable_receipt_and_preserves_racing_write() {
        let mut authority = PersistenceAuthorityV1::empty("world", hash(1), hash(2)).unwrap();
        authority.stage_put(address("e"), vec![1]).unwrap();
        let prepared = authority.prepare_commit(10).unwrap();
        authority.stage_put(address("e"), vec![2]).unwrap();
        assert_eq!(authority.journal_sequence(), 0);
        authority.accept_durable_commit(&prepared, &durable(&prepared)).unwrap();
        assert_eq!(authority.journal_sequence(), 1);
        assert_eq!(authority.records().get(&address("e")).unwrap().payload, [1]);
        assert_eq!(
            authority.dirty_records().get(&address("e")),
            Some(&DirtyRecordV1::Put(vec![2]))
        );
    }

    #[test]
    fn rejected_receipt_cannot_advance_and_delete_tombstone_prevents_resurrection() {
        let mut authority = PersistenceAuthorityV1::empty("world", hash(1), hash(2)).unwrap();
        authority.stage_put(address("e"), vec![1]).unwrap();
        let prepared = authority.prepare_commit(10).unwrap();
        let mut invalid = durable(&prepared);
        invalid.checkpoint_hash = hash(8);
        assert_eq!(
            authority.accept_durable_commit(&prepared, &invalid).unwrap_err().code,
            "commit-receipt"
        );
        assert_eq!(authority.journal_sequence(), 0);
        authority.reject_or_abandon_commit(&prepared).unwrap();
        let tombstone = authority.delete_tombstone();
        authority.accept_world_delete(tombstone).unwrap();
        assert_eq!(
            authority.stage_put(address("e"), vec![2]).unwrap_err().code,
            "world-deleted"
        );
        assert_eq!(
            authority
                .recreate_after_delete(hash(7), hash(1), hash(2))
                .unwrap_err()
                .code,
            "delete-tombstone"
        );
        authority.recreate_after_delete(tombstone, hash(1), hash(2)).unwrap();
        authority.stage_put(address("e"), vec![2]).unwrap();
    }
}
