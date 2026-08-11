use std::collections::BTreeMap;

use blockwild_types::EntityId;

use crate::{MAX_ROUTE_POINTS, Vec3};

pub const MAX_ENTITY_PATH_JOBS: usize = 8_192;
pub const MAX_ECOLOGY_JOBS: usize = 4_096;

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct EcologyJobToken {
    pub due_tick: u64,
    pub sector: [i32; 2],
    pub ecology_revision: u64,
    pub epoch: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct EcologyJobState {
    pub due_tick: u64,
    pub ecology_revision: u64,
    pub epoch: u64,
    pub last_completed_tick: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum WorkTokenError {
    Missing,
    Capacity,
    StaleGenerationOrIdentity,
    StaleRevision,
    StaleEpoch,
    StaleDeadline,
    InvalidResult,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct EcologyJobQueue {
    states: BTreeMap<[i32; 2], EcologyJobState>,
}

impl EcologyJobQueue {
    pub fn schedule(
        &mut self,
        sector: [i32; 2],
        ecology_revision: u64,
        due_tick: u64,
    ) -> Result<EcologyJobToken, WorkTokenError> {
        if !self.states.contains_key(&sector) && self.states.len() >= MAX_ECOLOGY_JOBS {
            return Err(WorkTokenError::Capacity);
        }
        let epoch = self
            .states
            .get(&sector)
            .map_or(1, |state| state.epoch.wrapping_add(1).max(1));
        let last_completed_tick = self.states.get(&sector).map_or(0, |state| state.last_completed_tick);
        let state = EcologyJobState {
            due_tick,
            ecology_revision,
            epoch,
            last_completed_tick,
        };
        self.states.insert(sector, state);
        Ok(EcologyJobToken {
            due_tick,
            sector,
            ecology_revision,
            epoch,
        })
    }

    #[must_use]
    pub fn due(&self, tick: u64, budget: usize) -> Vec<EcologyJobToken> {
        let mut jobs: Vec<_> = self
            .states
            .iter()
            .filter(|(_, state)| state.due_tick <= tick)
            .map(|(sector, state)| EcologyJobToken {
                due_tick: state.due_tick,
                sector: *sector,
                ecology_revision: state.ecology_revision,
                epoch: state.epoch,
            })
            .collect();
        jobs.sort();
        jobs.truncate(budget);
        jobs
    }

    pub fn complete(
        &mut self,
        token: EcologyJobToken,
        current_revision: u64,
        completed_tick: u64,
        next_due_tick: u64,
    ) -> Result<(), WorkTokenError> {
        let state = self.states.get_mut(&token.sector).ok_or(WorkTokenError::Missing)?;
        if state.ecology_revision != token.ecology_revision || current_revision != token.ecology_revision {
            return Err(WorkTokenError::StaleRevision);
        }
        if state.epoch != token.epoch {
            return Err(WorkTokenError::StaleEpoch);
        }
        if state.due_tick != token.due_tick {
            return Err(WorkTokenError::StaleDeadline);
        }
        state.last_completed_tick = completed_tick;
        state.due_tick = next_due_tick;
        state.ecology_revision = current_revision.wrapping_add(1);
        state.epoch = state.epoch.wrapping_add(1).max(1);
        Ok(())
    }

    pub fn remove(&mut self, sector: [i32; 2]) -> bool {
        self.states.remove(&sector).is_some()
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PathJobRequest {
    pub id: EntityId,
    pub entity_revision: u64,
    pub route_epoch: u64,
    pub request_epoch: u64,
    pub due_tick: u64,
    pub priority: i16,
    pub origin: Vec3,
    pub goal: Vec3,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PathJobSubmission {
    pub id: EntityId,
    pub entity_revision: u64,
    pub route_epoch: u64,
    pub due_tick: u64,
    pub priority: i16,
    pub origin: Vec3,
    pub goal: Vec3,
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct PathJobToken {
    pub due_tick: u64,
    pub reverse_priority: i16,
    pub id: EntityId,
    pub entity_revision: u64,
    pub route_epoch: u64,
    pub request_epoch: u64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct AcceptedPathResult {
    pub id: EntityId,
    pub entity_revision: u64,
    pub route_epoch: u64,
    pub points: Vec<Vec3>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct PathJobQueue {
    requests: BTreeMap<EntityId, PathJobRequest>,
}

impl PathJobQueue {
    pub fn submit(&mut self, submission: PathJobSubmission) -> Result<PathJobToken, WorkTokenError> {
        if !submission.origin.is_finite() || !submission.goal.is_finite() || submission.entity_revision == 0 {
            return Err(WorkTokenError::InvalidResult);
        }
        if !self.requests.contains_key(&submission.id) && self.requests.len() >= MAX_ENTITY_PATH_JOBS {
            return Err(WorkTokenError::Capacity);
        }
        let request_epoch = self
            .requests
            .get(&submission.id)
            .map_or(1, |state| state.request_epoch.wrapping_add(1).max(1));
        let request = PathJobRequest {
            id: submission.id,
            entity_revision: submission.entity_revision,
            route_epoch: submission.route_epoch,
            request_epoch,
            due_tick: submission.due_tick,
            priority: submission.priority,
            origin: submission.origin,
            goal: submission.goal,
        };
        self.requests.insert(submission.id, request);
        Ok(path_token(request))
    }

    #[must_use]
    pub fn due(&self, tick: u64, budget: usize) -> Vec<PathJobToken> {
        let mut jobs: Vec<_> = self
            .requests
            .values()
            .filter(|request| request.due_tick <= tick)
            .copied()
            .map(path_token)
            .collect();
        jobs.sort();
        jobs.truncate(budget);
        jobs
    }

    pub fn accept(
        &mut self,
        token: PathJobToken,
        current_id: EntityId,
        current_entity_revision: u64,
        current_route_epoch: u64,
        points: Vec<Vec3>,
    ) -> Result<AcceptedPathResult, WorkTokenError> {
        let Some(request) = self.requests.get(&token.id).copied() else {
            return Err(if self.requests.keys().any(|id| id.0.index() == token.id.0.index()) {
                WorkTokenError::StaleGenerationOrIdentity
            } else {
                WorkTokenError::Missing
            });
        };
        if current_id != token.id || request.id != token.id {
            return Err(WorkTokenError::StaleGenerationOrIdentity);
        }
        if current_entity_revision != token.entity_revision || request.entity_revision != token.entity_revision {
            return Err(WorkTokenError::StaleRevision);
        }
        if current_route_epoch != token.route_epoch
            || request.route_epoch != token.route_epoch
            || request.request_epoch != token.request_epoch
        {
            return Err(WorkTokenError::StaleEpoch);
        }
        if request.due_tick != token.due_tick {
            return Err(WorkTokenError::StaleDeadline);
        }
        if points.len() > MAX_ROUTE_POINTS || points.iter().any(|point| !point.is_finite()) {
            return Err(WorkTokenError::InvalidResult);
        }
        self.requests.remove(&token.id);
        Ok(AcceptedPathResult {
            id: token.id,
            entity_revision: token.entity_revision,
            route_epoch: token.route_epoch,
            points,
        })
    }

    pub fn cancel(&mut self, id: EntityId) -> bool {
        self.requests.remove(&id).is_some()
    }
}

fn path_token(request: PathJobRequest) -> PathJobToken {
    PathJobToken {
        due_tick: request.due_tick,
        reverse_priority: request.priority.saturating_neg(),
        id: request.id,
        entity_revision: request.entity_revision,
        route_epoch: request.route_epoch,
        request_epoch: request.request_epoch,
    }
}
