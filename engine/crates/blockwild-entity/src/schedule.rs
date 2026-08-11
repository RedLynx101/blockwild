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
}

#[derive(Clone, Debug, Default)]
pub struct EntityScheduler {
    states: BTreeMap<EntityId, ScheduleState>,
}

impl EntityScheduler {
    pub fn upsert(&mut self, id: EntityId, tier: SimulationTier, current_tick: u64) {
        let next_due_tick = tier
            .cadence_ticks()
            .map_or(u64::MAX, |cadence| current_tick + u64::from(id.0.index()) % cadence);
        self.states.insert(
            id,
            ScheduleState {
                tier,
                next_due_tick,
                last_completed_tick: current_tick,
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
        let mut due: Vec<_> = self
            .states
            .iter()
            .filter(|(_, state)| state.tier != SimulationTier::Dormant && state.next_due_tick <= tick)
            .map(|(id, state)| (state.next_due_tick, state.tier, *id))
            .collect();
        due.sort();
        due.truncate(budget);
        due.into_iter().map(|(_, _, id)| id).collect()
    }

    pub fn complete(&mut self, id: EntityId, tick: u64) -> bool {
        let Some(state) = self.states.get_mut(&id) else {
            return false;
        };
        state.last_completed_tick = tick;
        state.next_due_tick = state
            .tier
            .cadence_ticks()
            .map_or(u64::MAX, |cadence| tick.saturating_add(cadence));
        true
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
