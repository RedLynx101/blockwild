use std::collections::BTreeMap;

use blockwild_types::EntityId;

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
#[repr(u16)]
pub enum SimulationTier {
    Hero = 0,
    Nearby = 1,
    Coarse = 2,
    Dormant = 3,
}

impl SimulationTier {
    #[must_use]
    pub const fn cadence_ticks(self) -> Option<u64> {
        match self {
            Self::Hero => Some(1),
            Self::Nearby => Some(2),
            Self::Coarse => Some(10),
            Self::Dormant => None,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ScheduleState {
    pub tier: SimulationTier,
    pub next_due_tick: u64,
    pub last_completed_tick: u64,
    pub entity_revision: u64,
    pub schedule_epoch: u64,
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct EntityScheduleToken {
    pub due_tick: u64,
    pub tier: SimulationTier,
    pub id: EntityId,
    pub entity_revision: u64,
    pub schedule_epoch: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ScheduleCompletionError {
    Missing,
    StaleGenerationOrIdentity,
    StaleEntityRevision,
    StaleScheduleEpoch,
    StaleDueTick,
}

#[derive(Clone, Debug, Default)]
pub struct EntityScheduler {
    states: BTreeMap<EntityId, ScheduleState>,
}

impl EntityScheduler {
    pub fn upsert(&mut self, id: EntityId, tier: SimulationTier, entity_revision: u64, current_tick: u64) {
        let next_due_tick = tier
            .cadence_ticks()
            .map_or(u64::MAX, |cadence| current_tick + u64::from(id.0.index()) % cadence);
        let schedule_epoch = self
            .states
            .get(&id)
            .map_or(1, |state| state.schedule_epoch.wrapping_add(1).max(1));
        self.states.insert(
            id,
            ScheduleState {
                tier,
                next_due_tick,
                last_completed_tick: current_tick,
                entity_revision,
                schedule_epoch,
            },
        );
    }

    pub fn remove(&mut self, id: EntityId) -> bool {
        self.states.remove(&id).is_some()
    }

    #[must_use]
    pub fn state(&self, id: EntityId) -> Option<ScheduleState> {
        self.states.get(&id).copied()
    }

    /// Select due entities in `(due tick, tier, entity ID)` order under a hard budget.
    #[must_use]
    pub fn due(&self, tick: u64, budget: usize) -> Vec<EntityId> {
        self.due_jobs(tick, budget).into_iter().map(|job| job.id).collect()
    }

    /// Returns immutable work tokens. Completion requires every revision field
    /// to still match, so an old job can never mutate a recycled slot.
    #[must_use]
    pub fn due_jobs(&self, tick: u64, budget: usize) -> Vec<EntityScheduleToken> {
        let mut due: Vec<_> = self
            .states
            .iter()
            .filter(|(_, state)| state.tier != SimulationTier::Dormant && state.next_due_tick <= tick)
            .map(|(id, state)| EntityScheduleToken {
                due_tick: state.next_due_tick,
                tier: state.tier,
                id: *id,
                entity_revision: state.entity_revision,
                schedule_epoch: state.schedule_epoch,
            })
            .collect();
        due.sort();
        due.truncate(budget);
        due
    }

    pub fn complete(
        &mut self,
        token: EntityScheduleToken,
        current_entity_revision: u64,
        tick: u64,
    ) -> Result<(), ScheduleCompletionError> {
        let Some(state) = self.states.get_mut(&token.id) else {
            return Err(if self.states.keys().any(|id| id.0.index() == token.id.0.index()) {
                ScheduleCompletionError::StaleGenerationOrIdentity
            } else {
                ScheduleCompletionError::Missing
            });
        };
        if token.entity_revision != current_entity_revision || state.entity_revision != token.entity_revision {
            return Err(ScheduleCompletionError::StaleEntityRevision);
        }
        if state.schedule_epoch != token.schedule_epoch {
            return Err(ScheduleCompletionError::StaleScheduleEpoch);
        }
        if state.next_due_tick != token.due_tick {
            return Err(ScheduleCompletionError::StaleDueTick);
        }
        state.last_completed_tick = tick;
        state.next_due_tick = state
            .tier
            .cadence_ticks()
            .map_or(u64::MAX, |cadence| tick.saturating_add(cadence));
        state.schedule_epoch = state.schedule_epoch.wrapping_add(1).max(1);
        Ok(())
    }

    #[must_use]
    pub fn len(&self) -> usize {
        self.states.len()
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.states.is_empty()
    }
}
