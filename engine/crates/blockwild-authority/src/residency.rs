use std::cmp::Ordering;
use std::collections::{BTreeMap, BTreeSet};

use blockwild_types::{CanonicalHash, CanonicalHasher};

use crate::{AuthorityError, AuthorityResult, WorldAuthorityRevisionV1, WorldSectionAddressV1, validate_hash};

pub const WORLD_RESIDENCY_MAX_QUEUED_V1: usize = 65_536;
pub const WORLD_RESIDENCY_MAX_ACTIVE_V1: usize = 256;

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
#[repr(u8)]
pub enum ResidencyPriorityClassV1 {
    OccupiedSupport = 0,
    PlayerEdited = 1,
    ImmediateOpaque = 2,
    ImmediateTranslucent = 3,
    MovementForward = 4,
    VisibleMid = 5,
    Background = 6,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ResidencyPurposeV1 {
    Generate,
    CacheRead,
    Light,
    Mesh,
    Retain,
}

impl ResidencyPurposeV1 {
    const fn order(self) -> u8 {
        match self {
            Self::Generate => 0,
            Self::CacheRead => 1,
            Self::Light => 2,
            Self::Mesh => 3,
            Self::Retain => 4,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResidencyRequestV1 {
    pub request_id: u64,
    pub epoch: u64,
    pub address: WorldSectionAddressV1,
    pub class: ResidencyPriorityClassV1,
    pub purpose: ResidencyPurposeV1,
    pub distance_squared: u32,
    pub direction_penalty: u16,
    pub sequence: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct QueueKey {
    class: ResidencyPriorityClassV1,
    distance_squared: u32,
    direction_penalty: u16,
    sequence: u64,
    purpose: u8,
    address: WorldSectionAddressV1,
    request_id: u64,
}

impl From<&ResidencyRequestV1> for QueueKey {
    fn from(value: &ResidencyRequestV1) -> Self {
        Self {
            class: value.class,
            distance_squared: value.distance_squared,
            direction_penalty: value.direction_penalty,
            sequence: value.sequence,
            purpose: value.purpose.order(),
            address: value.address.clone(),
            request_id: value.request_id,
        }
    }
}

impl Ord for QueueKey {
    fn cmp(&self, other: &Self) -> Ordering {
        (
            self.class,
            self.distance_squared,
            self.direction_penalty,
            self.sequence,
            self.purpose,
            &self.address,
            self.request_id,
        )
            .cmp(&(
                other.class,
                other.distance_squared,
                other.direction_penalty,
                other.sequence,
                other.purpose,
                &other.address,
                other.request_id,
            ))
    }
}

impl PartialOrd for QueueKey {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResidencyJobTokenV1 {
    pub request: ResidencyRequestV1,
    pub authority_revision: WorldAuthorityRevisionV1,
    pub source_hash: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ResidencyCompletionV1 {
    Accepted(ResidencyJobTokenV1),
    StaleEpoch,
    StaleRevision,
    Cancelled,
    UnknownJob,
}

#[derive(Clone, Debug)]
pub struct SectionResidencySchedulerV1 {
    epoch: u64,
    queue: BTreeSet<QueueKey>,
    queued: BTreeMap<u64, ResidencyRequestV1>,
    active: BTreeMap<u64, ResidencyJobTokenV1>,
    cancelled: BTreeSet<u64>,
}

impl SectionResidencySchedulerV1 {
    #[must_use]
    pub fn new(epoch: u64) -> Self {
        Self {
            epoch,
            queue: BTreeSet::new(),
            queued: BTreeMap::new(),
            active: BTreeMap::new(),
            cancelled: BTreeSet::new(),
        }
    }

    pub fn submit(&mut self, request: ResidencyRequestV1) -> AuthorityResult<()> {
        if request.epoch != self.epoch {
            return Err(AuthorityError::new(
                "stale-epoch",
                "residency request belongs to an obsolete epoch",
            ));
        }
        if request.request_id == 0 || request.sequence == 0 {
            return Err(AuthorityError::new(
                "invalid-residency-request",
                "request id and sequence must be positive",
            ));
        }
        if self.queued.contains_key(&request.request_id) || self.active.contains_key(&request.request_id) {
            return Err(AuthorityError::new(
                "duplicate-request",
                "residency request id already exists",
            ));
        }
        if self.queue.len() >= WORLD_RESIDENCY_MAX_QUEUED_V1 {
            return Err(AuthorityError::new("residency-capacity", "residency queue is full"));
        }
        self.queue.insert(QueueKey::from(&request));
        self.queued.insert(request.request_id, request);
        Ok(())
    }

    pub fn cancel(&mut self, request_id: u64) -> bool {
        if let Some(request) = self.queued.remove(&request_id) {
            self.queue.remove(&QueueKey::from(&request));
            self.cancelled.insert(request_id);
            return true;
        }
        if self.active.contains_key(&request_id) {
            self.cancelled.insert(request_id);
            return true;
        }
        false
    }

    pub fn cancel_section(&mut self, address: &WorldSectionAddressV1) -> usize {
        let ids = self
            .queued
            .values()
            .chain(self.active.values().map(|token| &token.request))
            .filter(|request| &request.address == address)
            .map(|request| request.request_id)
            .collect::<Vec<_>>();
        let count = ids.len();
        for id in ids {
            self.cancel(id);
        }
        count
    }

    pub fn start_next(
        &mut self,
        authority_revision: WorldAuthorityRevisionV1,
        source_hash: String,
    ) -> AuthorityResult<Option<ResidencyJobTokenV1>> {
        validate_hash(&source_hash, "sourceHash")?;
        if self.active.len() >= WORLD_RESIDENCY_MAX_ACTIVE_V1 {
            return Ok(None);
        }
        let Some(key) = self.queue.pop_first() else {
            return Ok(None);
        };
        let request = self
            .queued
            .remove(&key.request_id)
            .ok_or_else(|| AuthorityError::new("residency-invariant", "queued request was missing"))?;
        if self.cancelled.remove(&request.request_id) {
            return self.start_next(authority_revision, source_hash);
        }
        let token = ResidencyJobTokenV1 {
            request,
            authority_revision,
            source_hash,
        };
        self.active.insert(token.request.request_id, token.clone());
        Ok(Some(token))
    }

    #[must_use]
    pub fn finish(
        &mut self,
        token: &ResidencyJobTokenV1,
        current_revision: WorldAuthorityRevisionV1,
    ) -> ResidencyCompletionV1 {
        let Some(active) = self.active.remove(&token.request.request_id) else {
            return ResidencyCompletionV1::UnknownJob;
        };
        if self.cancelled.remove(&token.request.request_id) {
            return ResidencyCompletionV1::Cancelled;
        }
        if active != *token {
            return ResidencyCompletionV1::UnknownJob;
        }
        if token.request.epoch != self.epoch || current_revision.epoch != self.epoch {
            return ResidencyCompletionV1::StaleEpoch;
        }
        if token.authority_revision != current_revision {
            return ResidencyCompletionV1::StaleRevision;
        }
        ResidencyCompletionV1::Accepted(token.clone())
    }

    pub fn reset(&mut self, epoch: u64) {
        self.epoch = epoch;
        self.queue.clear();
        self.queued.clear();
        self.active.clear();
        self.cancelled.clear();
    }

    #[must_use]
    pub fn queued_len(&self) -> usize {
        self.queued.len()
    }

    #[must_use]
    pub fn active_len(&self) -> usize {
        self.active.len()
    }

    #[must_use]
    pub fn canonical_hash(&self) -> CanonicalHash {
        let mut hasher = CanonicalHasher::new("blockwild-world-residency-scheduler-v1");
        hasher.write_u64(self.epoch);
        hasher.write_u32(self.queued.len() as u32);
        for request in self.queued.values() {
            write_request_hash(&mut hasher, request);
        }
        hasher.write_u32(self.active.len() as u32);
        for token in self.active.values() {
            write_request_hash(&mut hasher, &token.request);
            hasher.write_u64(token.authority_revision.epoch);
            hasher.write_u64(token.authority_revision.mutation);
            hasher.write_u64(token.authority_revision.residency);
            hasher.write_str(&token.source_hash);
        }
        hasher.write_u32(self.cancelled.len() as u32);
        for request_id in &self.cancelled {
            hasher.write_u64(*request_id);
        }
        hasher.finish()
    }
}

fn write_request_hash(hasher: &mut CanonicalHasher, request: &ResidencyRequestV1) {
    hasher.write_u64(request.request_id);
    hasher.write_u64(request.epoch);
    hasher.write_str(&request.address.key());
    hasher.write_u16(request.class as u16);
    hasher.write_u16(u16::from(request.purpose.order()));
    hasher.write_u32(request.distance_squared);
    hasher.write_u16(request.direction_penalty);
    hasher.write_u64(request.sequence);
}
