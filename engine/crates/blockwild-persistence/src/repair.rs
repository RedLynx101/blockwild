use crate::{Checkpoint, PersistenceError};
use blockwild_types::CanonicalHash;
use std::collections::BTreeMap;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RecoveryCandidate {
    pub checkpoint: Checkpoint,
    pub available_record_hashes: BTreeMap<String, CanonicalHash>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RecoveryStatus {
    Ready,
    Repairable,
    Unrecoverable,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RecoveryDecision {
    pub status: RecoveryStatus,
    pub checkpoint: Option<Checkpoint>,
    pub missing_records: Vec<String>,
    pub corrupt_records: Vec<String>,
    pub message: String,
}

pub fn decide_recovery(candidates: &[RecoveryCandidate]) -> RecoveryDecision {
    let mut ordered = candidates.to_vec();
    ordered.sort_by(|left, right| {
        right
            .checkpoint
            .journal_sequence
            .cmp(&left.checkpoint.journal_sequence)
            .then_with(|| right.checkpoint.created_at.cmp(&left.checkpoint.created_at))
            .then_with(|| left.checkpoint.checkpoint_id.cmp(&right.checkpoint.checkpoint_id))
    });
    let mut best_repair: Option<RecoveryDecision> = None;
    for candidate in ordered {
        let mut missing = Vec::new();
        let mut corrupt = Vec::new();
        if candidate.checkpoint.verify().is_err() {
            corrupt.push("$checkpoint".to_owned());
        }
        for record in &candidate.checkpoint.records {
            let key = record.address.canonical_key();
            match candidate.available_record_hashes.get(&key) {
                None => missing.push(key),
                Some(actual) if actual != &record.payload_hash => corrupt.push(key),
                Some(_) => {}
            }
        }
        if missing.is_empty() && corrupt.is_empty() {
            return RecoveryDecision {
                status: RecoveryStatus::Ready,
                checkpoint: Some(candidate.checkpoint),
                missing_records: Vec::new(),
                corrupt_records: Vec::new(),
                message: "Newest complete checkpoint is ready.".to_owned(),
            };
        }
        let should_replace = best_repair.as_ref().is_none_or(|current| {
            missing.len() + corrupt.len() < current.missing_records.len() + current.corrupt_records.len()
        });
        if should_replace {
            best_repair = Some(RecoveryDecision {
                status: RecoveryStatus::Repairable,
                checkpoint: Some(candidate.checkpoint),
                missing_records: missing,
                corrupt_records: corrupt,
                message: "Checkpoint requires record repair or fallback to an older complete checkpoint.".to_owned(),
            });
        }
    }
    best_repair.unwrap_or_else(|| RecoveryDecision {
        status: RecoveryStatus::Unrecoverable,
        checkpoint: None,
        missing_records: Vec::new(),
        corrupt_records: Vec::new(),
        message: "No checkpoint is available; preserve the legacy source and request import or repair.".to_owned(),
    })
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InspectionReport {
    pub checkpoint_id: String,
    pub world_id: String,
    pub journal_sequence: u64,
    pub records: usize,
    pub bytes: u64,
    pub valid: bool,
    pub issue: Option<PersistenceError>,
}

#[must_use]
pub fn inspect_checkpoint(checkpoint: &Checkpoint) -> InspectionReport {
    let issue = checkpoint.verify().err();
    InspectionReport {
        checkpoint_id: checkpoint.checkpoint_id.clone(),
        world_id: checkpoint.world_id.clone(),
        journal_sequence: checkpoint.journal_sequence,
        records: checkpoint.records.len(),
        bytes: checkpoint
            .records
            .iter()
            .map(|record| u64::from(record.byte_length))
            .sum(),
        valid: issue.is_none(),
        issue,
    }
}
