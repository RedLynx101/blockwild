use std::collections::{BTreeMap, BTreeSet};
use std::error::Error;
use std::fmt;

use blockwild_types::{CanonicalHash, CanonicalHasher, EntityId, LocationId};

use crate::{ProtectionState, SimulationTier, Vec3};

pub const ENTITY_COMPATIBILITY_SCHEMA: u16 = 1;
pub const ENTITY_COMMAND_SCHEMA: u16 = 1;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum EntityClass {
    Creature = 0,
    Player = 1,
    Sentient = 2,
    Construct = 3,
    Projectile = 4,
    Vehicle = 5,
}

/// Lossless compatibility surface for current creature saves.
///
/// Hot runtime data deliberately stays compact, while authored and player-owned
/// data remains in this cold record. String keys are retained at the save and
/// content boundary so migrating the engine never rerolls a specimen.
#[derive(Clone, Debug, PartialEq)]
pub struct EntityCompatibilityRecord {
    pub schema: u16,
    pub external_entity_id: String,
    pub legacy_numeric_id: Option<u64>,
    pub specimen_id: String,
    pub kind_key: String,
    pub class: EntityClass,
    pub variant_key: Option<String>,
    pub name: Option<String>,
    pub location_id: LocationId,
    pub position: Vec3,
    pub yaw: f32,
    pub velocity: Vec3,
    pub health: f32,
    pub maximum_health: f32,
    pub age_ticks: u64,
    pub natural_spawned: bool,
    pub ever_led: bool,
    pub owner_id: Option<String>,
    pub tamed: bool,
    pub bond_points: u32,
    pub bond_tier: String,
    pub social_group_id: Option<String>,
    pub faction_id: Option<String>,
    pub settlement_id: Option<String>,
    pub equipment: BTreeMap<String, String>,
    pub research: BTreeMap<String, u32>,
    pub custom: BTreeMap<String, String>,
}

impl EntityCompatibilityRecord {
    #[must_use]
    pub fn new(
        external_entity_id: impl Into<String>,
        specimen_id: impl Into<String>,
        kind_key: impl Into<String>,
    ) -> Self {
        Self {
            schema: ENTITY_COMPATIBILITY_SCHEMA,
            external_entity_id: external_entity_id.into(),
            legacy_numeric_id: None,
            specimen_id: specimen_id.into(),
            kind_key: kind_key.into(),
            class: EntityClass::Creature,
            variant_key: None,
            name: None,
            location_id: LocationId::new(1, 1),
            position: Vec3::ZERO,
            yaw: 0.0,
            velocity: Vec3::ZERO,
            health: 1.0,
            maximum_health: 1.0,
            age_ticks: 0,
            natural_spawned: false,
            ever_led: false,
            owner_id: None,
            tamed: false,
            bond_points: 0,
            bond_tier: "wary".to_owned(),
            social_group_id: None,
            faction_id: None,
            settlement_id: None,
            equipment: BTreeMap::new(),
            research: BTreeMap::new(),
            custom: BTreeMap::new(),
        }
    }

    pub fn validate(&self) -> Result<(), EntityError> {
        if self.schema != ENTITY_COMPATIBILITY_SCHEMA {
            return Err(EntityError::UnsupportedSchema(self.schema));
        }
        if self.external_entity_id.is_empty() || self.specimen_id.is_empty() || self.kind_key.is_empty() {
            return Err(EntityError::InvalidRecord("identity fields cannot be empty"));
        }
        if !self.position.is_finite() || !self.velocity.is_finite() || !self.yaw.is_finite() {
            return Err(EntityError::InvalidRecord("transform must be finite"));
        }
        if !self.health.is_finite()
            || !self.maximum_health.is_finite()
            || self.maximum_health <= 0.0
            || self.health < 0.0
            || self.health > self.maximum_health
        {
            return Err(EntityError::InvalidRecord("health is outside its valid range"));
        }
        Ok(())
    }

    #[must_use]
    pub fn canonical_hash(&self) -> CanonicalHash {
        let mut hasher = CanonicalHasher::new("blockwild.entity.compatibility.v1");
        hasher.write_str(&self.external_entity_id);
        hasher.write_u64(self.legacy_numeric_id.unwrap_or_default());
        hasher.write_str(&self.specimen_id);
        hasher.write_str(&self.kind_key);
        hasher.write_u16(self.class as u16);
        hasher.write_str(self.variant_key.as_deref().unwrap_or_default());
        hasher.write_str(self.name.as_deref().unwrap_or_default());
        hasher.write_u64(self.location_id.packed());
        for value in self
            .position
            .to_array()
            .into_iter()
            .chain([self.yaw])
            .chain(self.velocity.to_array())
        {
            hasher.write_u32(value.to_bits());
        }
        hasher.write_u32(self.health.to_bits());
        hasher.write_u32(self.maximum_health.to_bits());
        hasher.write_u64(self.age_ticks);
        hasher.write_u16(u16::from(self.natural_spawned));
        hasher.write_u16(u16::from(self.ever_led));
        hasher.write_str(self.owner_id.as_deref().unwrap_or_default());
        hasher.write_u16(u16::from(self.tamed));
        hasher.write_u32(self.bond_points);
        hasher.write_str(&self.bond_tier);
        hasher.write_str(self.social_group_id.as_deref().unwrap_or_default());
        hasher.write_str(self.faction_id.as_deref().unwrap_or_default());
        hasher.write_str(self.settlement_id.as_deref().unwrap_or_default());
        hash_string_map(&mut hasher, &self.equipment);
        hash_u32_map(&mut hasher, &self.research);
        hash_string_map(&mut hasher, &self.custom);
        hasher.finish()
    }
}

fn hash_string_map(hasher: &mut CanonicalHasher, values: &BTreeMap<String, String>) {
    hasher.write_u32(values.len() as u32);
    for (key, value) in values {
        hasher.write_str(key);
        hasher.write_str(value);
    }
}

fn hash_u32_map(hasher: &mut CanonicalHasher, values: &BTreeMap<String, u32>) {
    hasher.write_u32(values.len() as u32);
    for (key, value) in values {
        hasher.write_str(key);
        hasher.write_u32(*value);
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct HotEntity {
    pub record: EntityCompatibilityRecord,
    pub tier: SimulationTier,
    pub protection: ProtectionState,
    pub out_of_range_seconds: f32,
    pub last_simulated_tick: u64,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct DormantEntitySummary {
    pub slept_at_tick: u64,
    pub last_advanced_tick: u64,
    pub care_cycles: u32,
    pub breeding_cycles: u32,
    pub work_cycles: u32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ColdEntity {
    pub record: EntityCompatibilityRecord,
    pub protection: ProtectionState,
    pub summary: DormantEntitySummary,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EntityResidency {
    Hot,
    Cold,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct EntitySlot {
    generation: u32,
    residency: Option<EntityResidency>,
}

impl EntitySlot {
    const fn reserved() -> Self {
        Self {
            generation: 0,
            residency: None,
        }
    }
}

#[derive(Clone, Debug)]
pub struct EntityAuthority {
    revision: u64,
    last_sequence: Option<u64>,
    slots: Vec<EntitySlot>,
    free: BTreeSet<u32>,
    hot: BTreeMap<EntityId, HotEntity>,
    cold: BTreeMap<EntityId, ColdEntity>,
}

impl Default for EntityAuthority {
    fn default() -> Self {
        Self {
            revision: 0,
            last_sequence: None,
            slots: vec![EntitySlot::reserved()],
            free: BTreeSet::new(),
            hot: BTreeMap::new(),
            cold: BTreeMap::new(),
        }
    }
}

impl EntityAuthority {
    #[must_use]
    pub const fn revision(&self) -> u64 {
        self.revision
    }

    #[must_use]
    pub fn hot(&self) -> &BTreeMap<EntityId, HotEntity> {
        &self.hot
    }

    #[must_use]
    pub fn cold(&self) -> &BTreeMap<EntityId, ColdEntity> {
        &self.cold
    }

    #[must_use]
    pub fn len(&self) -> usize {
        self.hot.len() + self.cold.len()
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.hot.is_empty() && self.cold.is_empty()
    }

    pub fn spawn(
        &mut self,
        record: EntityCompatibilityRecord,
        residency: EntityResidency,
        tick: u64,
    ) -> Result<EntityId, EntityError> {
        record.validate()?;
        if self
            .hot
            .values()
            .any(|entity| entity.record.external_entity_id == record.external_entity_id)
            || self
                .cold
                .values()
                .any(|entity| entity.record.external_entity_id == record.external_entity_id)
        {
            return Err(EntityError::DuplicateExternalId(record.external_entity_id));
        }
        let index = self.free.pop_first().unwrap_or_else(|| {
            let index = u32::try_from(self.slots.len()).expect("entity slot count exceeds u32");
            self.slots.push(EntitySlot {
                generation: 1,
                residency: None,
            });
            index
        });
        let slot = &mut self.slots[index as usize];
        slot.residency = Some(residency);
        let id = EntityId::new(index, slot.generation);
        self.insert_storage(id, record, residency, tick, ProtectionState::default());
        Ok(id)
    }

    /// Import a known generational identity without remapping old save records.
    pub fn insert_with_id(
        &mut self,
        id: EntityId,
        record: EntityCompatibilityRecord,
        residency: EntityResidency,
        tick: u64,
    ) -> Result<(), EntityError> {
        record.validate()?;
        let index = id.0.index();
        if index == 0 || id.0.generation() == 0 {
            return Err(EntityError::InvalidId(id));
        }
        if self
            .hot
            .values()
            .any(|entity| entity.record.external_entity_id == record.external_entity_id)
            || self
                .cold
                .values()
                .any(|entity| entity.record.external_entity_id == record.external_entity_id)
        {
            return Err(EntityError::DuplicateExternalId(record.external_entity_id));
        }
        let required = index as usize + 1;
        if self.slots.len() < required {
            for new_index in self.slots.len()..required {
                self.slots.push(EntitySlot {
                    generation: 1,
                    residency: None,
                });
                if new_index != index as usize {
                    self.free.insert(new_index as u32);
                }
            }
        }
        let slot = &mut self.slots[index as usize];
        if slot.residency.is_some() {
            return Err(EntityError::AlreadyOccupied(id));
        }
        self.free.remove(&index);
        slot.generation = id.0.generation().max(1);
        slot.residency = Some(residency);
        self.insert_storage(id, record, residency, tick, ProtectionState::default());
        Ok(())
    }

    fn insert_storage(
        &mut self,
        id: EntityId,
        record: EntityCompatibilityRecord,
        residency: EntityResidency,
        tick: u64,
        protection: ProtectionState,
    ) {
        match residency {
            EntityResidency::Hot => {
                self.hot.insert(
                    id,
                    HotEntity {
                        record,
                        tier: SimulationTier::Nearby,
                        protection,
                        out_of_range_seconds: 0.0,
                        last_simulated_tick: tick,
                    },
                );
            }
            EntityResidency::Cold => {
                self.cold.insert(
                    id,
                    ColdEntity {
                        record,
                        protection,
                        summary: DormantEntitySummary {
                            slept_at_tick: tick,
                            last_advanced_tick: tick,
                            ..DormantEntitySummary::default()
                        },
                    },
                );
            }
        }
    }

    #[must_use]
    pub fn contains(&self, id: EntityId) -> bool {
        self.validate_live_id(id).is_ok()
    }

    #[must_use]
    pub fn residency(&self, id: EntityId) -> Option<EntityResidency> {
        self.validate_live_id(id).ok()
    }

    pub fn hibernate(&mut self, id: EntityId, tick: u64) -> Result<(), EntityError> {
        match self.validate_live_id(id)? {
            EntityResidency::Cold => Ok(()),
            EntityResidency::Hot => {
                let hot = self.hot.remove(&id).ok_or(EntityError::MissingEntity(id))?;
                self.cold.insert(
                    id,
                    ColdEntity {
                        record: hot.record,
                        protection: hot.protection,
                        summary: DormantEntitySummary {
                            slept_at_tick: tick,
                            last_advanced_tick: tick,
                            ..DormantEntitySummary::default()
                        },
                    },
                );
                self.slots[id.0.index() as usize].residency = Some(EntityResidency::Cold);
                Ok(())
            }
        }
    }

    pub fn wake(&mut self, id: EntityId, tier: SimulationTier, tick: u64) -> Result<(), EntityError> {
        match self.validate_live_id(id)? {
            EntityResidency::Hot => {
                self.hot.get_mut(&id).ok_or(EntityError::MissingEntity(id))?.tier = tier;
                Ok(())
            }
            EntityResidency::Cold => {
                let cold = self.cold.remove(&id).ok_or(EntityError::MissingEntity(id))?;
                self.hot.insert(
                    id,
                    HotEntity {
                        record: cold.record,
                        tier,
                        protection: cold.protection,
                        out_of_range_seconds: 0.0,
                        last_simulated_tick: tick,
                    },
                );
                self.slots[id.0.index() as usize].residency = Some(EntityResidency::Hot);
                Ok(())
            }
        }
    }

    pub fn remove(&mut self, id: EntityId) -> Result<EntityCompatibilityRecord, EntityError> {
        let residency = self.validate_live_id(id)?;
        let record = match residency {
            EntityResidency::Hot => self.hot.remove(&id).ok_or(EntityError::MissingEntity(id))?.record,
            EntityResidency::Cold => self.cold.remove(&id).ok_or(EntityError::MissingEntity(id))?.record,
        };
        let index = id.0.index();
        let slot = &mut self.slots[index as usize];
        slot.residency = None;
        slot.generation = slot.generation.wrapping_add(1).max(1);
        self.free.insert(index);
        Ok(record)
    }

    pub fn hot_mut(&mut self, id: EntityId) -> Result<&mut HotEntity, EntityError> {
        if self.validate_live_id(id)? != EntityResidency::Hot {
            return Err(EntityError::WrongResidency(id));
        }
        self.hot.get_mut(&id).ok_or(EntityError::MissingEntity(id))
    }

    fn validate_live_id(&self, id: EntityId) -> Result<EntityResidency, EntityError> {
        let index = id.0.index() as usize;
        if index == 0 || index >= self.slots.len() {
            return Err(EntityError::MissingEntity(id));
        }
        let slot = self.slots[index];
        if slot.generation != id.0.generation() {
            return Err(EntityError::StaleEntity(id));
        }
        slot.residency.ok_or(EntityError::MissingEntity(id))
    }

    pub fn apply_batch(&mut self, batch: &EntityCommandBatch) -> Result<EntityEventBatch, EntityError> {
        if batch.schema != ENTITY_COMMAND_SCHEMA {
            return Err(EntityError::UnsupportedSchema(batch.schema));
        }
        if batch.expected_revision != self.revision {
            return Err(EntityError::StaleRevision {
                expected: self.revision,
                supplied: batch.expected_revision,
            });
        }
        if self.last_sequence.is_some_and(|sequence| batch.sequence <= sequence) {
            return Err(EntityError::StaleSequence {
                last: self.last_sequence.unwrap_or_default(),
                supplied: batch.sequence,
            });
        }
        let mut staged = self.clone();
        let mut events = Vec::with_capacity(batch.commands.len());
        for (command_index, command) in batch.commands.iter().enumerate() {
            staged.apply_command(command, batch.tick, command_index as u32, &mut events)?;
        }
        staged.revision = staged.revision.wrapping_add(1);
        staged.last_sequence = Some(batch.sequence);
        let result = EntityEventBatch {
            schema: ENTITY_COMMAND_SCHEMA,
            sequence: batch.sequence,
            previous_revision: self.revision,
            revision: staged.revision,
            events,
        };
        *self = staged;
        Ok(result)
    }

    fn apply_command(
        &mut self,
        command: &EntityCommand,
        tick: u64,
        command_index: u32,
        events: &mut Vec<EntityEvent>,
    ) -> Result<(), EntityError> {
        let (id, kind) = match command {
            EntityCommand::Spawn { record, residency } => {
                let id = self.spawn(record.clone(), *residency, tick)?;
                (id, EntityEventKind::Spawned { residency: *residency })
            }
            EntityCommand::SpawnAt { id, record, residency } => {
                self.insert_with_id(*id, record.clone(), *residency, tick)?;
                (*id, EntityEventKind::Spawned { residency: *residency })
            }
            EntityCommand::Despawn { id, reason } => {
                self.remove(*id)?;
                (*id, EntityEventKind::Despawned { reason: *reason })
            }
            EntityCommand::Hibernate { id } => {
                self.hibernate(*id, tick)?;
                (*id, EntityEventKind::ResidencyChanged(EntityResidency::Cold))
            }
            EntityCommand::Wake { id, tier } => {
                self.wake(*id, *tier, tick)?;
                (*id, EntityEventKind::ResidencyChanged(EntityResidency::Hot))
            }
            EntityCommand::UpdateMotion {
                id,
                position,
                yaw,
                velocity,
            } => {
                if !position.is_finite() || !velocity.is_finite() || !yaw.is_finite() {
                    return Err(EntityError::InvalidRecord("motion command must be finite"));
                }
                let entity = self.hot_mut(*id)?;
                entity.record.position = *position;
                entity.record.yaw = *yaw;
                entity.record.velocity = *velocity;
                entity.last_simulated_tick = tick;
                (*id, EntityEventKind::MotionUpdated)
            }
            EntityCommand::SetSimulationTier { id, tier } => {
                self.hot_mut(*id)?.tier = *tier;
                (*id, EntityEventKind::TierChanged(*tier))
            }
            EntityCommand::SetProtection { id, protection } => {
                match self.validate_live_id(*id)? {
                    EntityResidency::Hot => {
                        self.hot.get_mut(id).ok_or(EntityError::MissingEntity(*id))?.protection = *protection
                    }
                    EntityResidency::Cold => {
                        self.cold.get_mut(id).ok_or(EntityError::MissingEntity(*id))?.protection = *protection
                    }
                }
                (*id, EntityEventKind::ProtectionChanged)
            }
        };
        events.push(EntityEvent {
            command_index,
            entity_id: id,
            kind,
        });
        Ok(())
    }

    #[must_use]
    pub fn canonical_hash(&self) -> CanonicalHash {
        let mut hasher = CanonicalHasher::new("blockwild.entity.authority.v1");
        hasher.write_u64(self.revision);
        hasher.write_u64(self.last_sequence.unwrap_or_default());
        for (id, entity) in &self.hot {
            hasher.write_u64(id.packed());
            hasher.write_bytes(entity.record.canonical_hash().as_bytes());
            hasher.write_u16(entity.tier as u16);
            hasher.write_u64(entity.protection.bits());
            hasher.write_u32(entity.out_of_range_seconds.to_bits());
            hasher.write_u64(entity.last_simulated_tick);
        }
        for (id, entity) in &self.cold {
            hasher.write_u64(id.packed());
            hasher.write_bytes(entity.record.canonical_hash().as_bytes());
            hasher.write_u64(entity.protection.bits());
            hasher.write_u64(entity.summary.slept_at_tick);
            hasher.write_u64(entity.summary.last_advanced_tick);
            hasher.write_u32(entity.summary.care_cycles);
            hasher.write_u32(entity.summary.breeding_cycles);
            hasher.write_u32(entity.summary.work_cycles);
        }
        hasher.finish()
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct EntityCommandBatch {
    pub schema: u16,
    pub sequence: u64,
    pub expected_revision: u64,
    pub tick: u64,
    pub commands: Vec<EntityCommand>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum EntityCommand {
    Spawn {
        record: EntityCompatibilityRecord,
        residency: EntityResidency,
    },
    SpawnAt {
        id: EntityId,
        record: EntityCompatibilityRecord,
        residency: EntityResidency,
    },
    Despawn {
        id: EntityId,
        reason: DespawnReason,
    },
    Hibernate {
        id: EntityId,
    },
    Wake {
        id: EntityId,
        tier: SimulationTier,
    },
    UpdateMotion {
        id: EntityId,
        position: Vec3,
        yaw: f32,
        velocity: Vec3,
    },
    SetSimulationTier {
        id: EntityId,
        tier: SimulationTier,
    },
    SetProtection {
        id: EntityId,
        protection: ProtectionState,
    },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DespawnReason {
    NaturalRange,
    Defeated,
    Captured,
    Released,
    Admin,
}

#[derive(Clone, Debug, PartialEq)]
pub struct EntityEventBatch {
    pub schema: u16,
    pub sequence: u64,
    pub previous_revision: u64,
    pub revision: u64,
    pub events: Vec<EntityEvent>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct EntityEvent {
    pub command_index: u32,
    pub entity_id: EntityId,
    pub kind: EntityEventKind,
}

#[derive(Clone, Debug, PartialEq)]
pub enum EntityEventKind {
    Spawned { residency: EntityResidency },
    Despawned { reason: DespawnReason },
    ResidencyChanged(EntityResidency),
    MotionUpdated,
    TierChanged(SimulationTier),
    ProtectionChanged,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EntityError {
    UnsupportedSchema(u16),
    InvalidRecord(&'static str),
    InvalidId(EntityId),
    MissingEntity(EntityId),
    StaleEntity(EntityId),
    AlreadyOccupied(EntityId),
    WrongResidency(EntityId),
    DuplicateExternalId(String),
    StaleRevision { expected: u64, supplied: u64 },
    StaleSequence { last: u64, supplied: u64 },
}

impl fmt::Display for EntityError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnsupportedSchema(schema) => write!(formatter, "unsupported entity schema {schema}"),
            Self::InvalidRecord(message) => write!(formatter, "invalid entity record: {message}"),
            Self::InvalidId(id) => write!(formatter, "invalid entity id {id:?}"),
            Self::MissingEntity(id) => write!(formatter, "missing entity {id:?}"),
            Self::StaleEntity(id) => write!(formatter, "stale entity handle {id:?}"),
            Self::AlreadyOccupied(id) => write!(formatter, "entity slot already occupied {id:?}"),
            Self::WrongResidency(id) => write!(formatter, "entity has the wrong residency {id:?}"),
            Self::DuplicateExternalId(id) => write!(formatter, "duplicate external entity id {id}"),
            Self::StaleRevision { expected, supplied } => {
                write!(formatter, "stale revision {supplied}; expected {expected}")
            }
            Self::StaleSequence { last, supplied } => {
                write!(formatter, "stale sequence {supplied}; last accepted {last}")
            }
        }
    }
}

impl Error for EntityError {}
