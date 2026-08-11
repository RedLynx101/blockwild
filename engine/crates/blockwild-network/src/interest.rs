use std::collections::{BTreeMap, BTreeSet};

use crate::{
    NetworkAuthorityIdentityV1, NetworkDeltaRecordV1, NetworkDeltaSourceV1, NetworkDeltaV1, NetworkError,
    NetworkErrorCode, NetworkInterestChunkV1, NetworkInterestSetV1, WorldAddressV1,
};

#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum ReplicationScopeV1 {
    Global,
    Location(WorldAddressV1),
    Chunk(NetworkInterestChunkV1),
    Entity(String),
}

impl ReplicationScopeV1 {
    pub fn validate(&self) -> Result<(), NetworkError> {
        match self {
            Self::Global => Ok(()),
            Self::Location(address) => address.validate(),
            Self::Chunk(chunk) => chunk.address.validate(),
            Self::Entity(entity_id) => {
                if entity_id.is_empty() || entity_id.encode_utf16().count() > 128 {
                    Err(NetworkError::new(
                        NetworkErrorCode::InvalidLabel,
                        "replication entity id is invalid",
                    ))
                } else {
                    Ok(())
                }
            }
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ScopedDeltaRecordV1 {
    pub scope: ReplicationScopeV1,
    pub record: NetworkDeltaRecordV1,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct InterestSelectionStatsV1 {
    pub scope_probes: usize,
    pub candidate_records: usize,
    pub emitted_records: usize,
}

#[derive(Clone, Debug)]
pub struct InterestDeltaBuildSourceV1 {
    pub session_id: String,
    pub delta_id: String,
    pub peer_id: String,
    pub keyframe: bool,
    pub sequence: u64,
    pub acknowledged_command_sequence: u64,
    pub from: NetworkAuthorityIdentityV1,
    pub to: NetworkAuthorityIdentityV1,
}

/// Indexes replication records by explicit authority scope so unrelated
/// locations are never linearly scanned for a peer's steady-state delta.
#[derive(Clone, Debug, Default)]
pub struct InterestIndexV1 {
    records: BTreeMap<String, ScopedDeltaRecordV1>,
    scope_records: BTreeMap<ReplicationScopeV1, BTreeSet<String>>,
}

impl InterestIndexV1 {
    pub fn upsert(&mut self, value: ScopedDeltaRecordV1) -> Result<(), NetworkError> {
        value.scope.validate()?;
        let rebuilt = NetworkDeltaRecordV1::new(
            value.record.kind,
            value.record.record_id.clone(),
            value.record.revision,
            value.record.payload.clone(),
        )?;
        if rebuilt != value.record {
            return Err(NetworkError::new(
                NetworkErrorCode::HashMismatch,
                "indexed delta record hash mismatch",
            ));
        }
        let key = value.record.key();
        if let Some(previous) = self.records.insert(key.clone(), value.clone()) {
            self.remove_scope_key(&previous.scope, &key);
        }
        self.scope_records.entry(value.scope).or_default().insert(key);
        Ok(())
    }

    pub fn remove(&mut self, record: &NetworkDeltaRecordV1) -> bool {
        let key = record.key();
        let Some(previous) = self.records.remove(&key) else {
            return false;
        };
        self.remove_scope_key(&previous.scope, &key);
        true
    }

    #[must_use]
    pub fn record_count(&self) -> usize {
        self.records.len()
    }

    #[must_use]
    pub fn select(&self, interest: &NetworkInterestSetV1) -> (Vec<NetworkDeltaRecordV1>, InterestSelectionStatsV1) {
        let mut scopes = BTreeSet::from([ReplicationScopeV1::Global]);
        for chunk in &interest.chunks {
            scopes.insert(ReplicationScopeV1::Location(chunk.address.clone()));
            scopes.insert(ReplicationScopeV1::Chunk(chunk.clone()));
        }
        for entity_id in &interest.entity_ids {
            scopes.insert(ReplicationScopeV1::Entity(entity_id.clone()));
        }
        let mut record_keys = BTreeSet::new();
        let mut stats = InterestSelectionStatsV1 {
            scope_probes: scopes.len(),
            ..InterestSelectionStatsV1::default()
        };
        for scope in scopes {
            if let Some(keys) = self.scope_records.get(&scope) {
                stats.candidate_records += keys.len();
                record_keys.extend(keys.iter().cloned());
            }
        }
        let records = record_keys
            .into_iter()
            .filter_map(|key| self.records.get(&key).map(|value| value.record.clone()))
            .collect::<Vec<_>>();
        stats.emitted_records = records.len();
        (records, stats)
    }

    pub fn build_delta(
        &self,
        source: InterestDeltaBuildSourceV1,
        interest: &NetworkInterestSetV1,
    ) -> Result<(NetworkDeltaV1, InterestSelectionStatsV1), NetworkError> {
        interest.validate()?;
        let (records, stats) = self.select(interest);
        let delta = NetworkDeltaV1::new(NetworkDeltaSourceV1 {
            session_id: source.session_id,
            delta_id: source.delta_id,
            peer_id: source.peer_id,
            keyframe: source.keyframe,
            sequence: source.sequence,
            acknowledged_command_sequence: source.acknowledged_command_sequence,
            from: source.from,
            to: source.to,
            interest_hash: interest.interest_hash,
            records,
        })?;
        Ok((delta, stats))
    }

    fn remove_scope_key(&mut self, scope: &ReplicationScopeV1, key: &str) {
        let remove_scope = if let Some(keys) = self.scope_records.get_mut(scope) {
            keys.remove(key);
            keys.is_empty()
        } else {
            false
        };
        if remove_scope {
            self.scope_records.remove(scope);
        }
    }
}
