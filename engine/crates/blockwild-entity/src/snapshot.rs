use std::collections::{BTreeMap, BTreeSet};
use std::error::Error;
use std::fmt;

use blockwild_types::{EntityId, LocationId};

use crate::{
    ActionState, AiIntentKind, AiState, BlackboardValue, BodyShape, CareState, ColdEntity, DormantEntitySummary,
    DragonState, EntityAuthority, EntityClass, EntityCompatibilityRecord, EntityComponents, EntityResidency,
    EntitySlot, EquipmentSlotState, HotEntity, HusbandryState, LegendaryState, LocomotionBody,
    MAX_COMPONENT_MAP_ENTRIES, MAX_COMPONENT_TEXT_BYTES, MAX_ENTITY_COMPATIBILITY_MAP_ENTRIES,
    MAX_ENTITY_COMPATIBILITY_STRING_BYTES, MAX_ENTITY_COUNT, MAX_MOUNT_SEATS, MAX_ROUTE_POINTS, MAX_THREATS,
    MAX_UNKNOWN_EXTENSION_BYTES, MountSeat, MountState, MovementMode, NetworkAuthorityState, ProtectionProvenance,
    ProtectionState, SentientState, SimulationTier, SocialFollowerState, SummonState, ThreatMemory, Vec3,
    VitalsEnvironment, WorkState,
};

pub const ENTITY_AUTHORITY_SNAPSHOT_SCHEMA: u16 = 2;
pub const MAX_ENTITY_AUTHORITY_SNAPSHOT_BYTES: usize = 64 * 1_048_576;
const AUTHORITY_MAGIC: &[u8; 4] = b"BWEA";
const COMPATIBILITY_MAGIC: &[u8; 4] = b"BWEC";

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SnapshotError {
    Truncated,
    InvalidMagic,
    UnsupportedSchema(u16),
    InvalidTag(&'static str, u8),
    InvalidUtf8,
    InvalidData(&'static str),
    LimitExceeded(&'static str),
    TrailingBytes,
}

impl fmt::Display for SnapshotError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Truncated => formatter.write_str("truncated entity snapshot"),
            Self::InvalidMagic => formatter.write_str("invalid entity snapshot magic"),
            Self::UnsupportedSchema(schema) => write!(formatter, "unsupported entity snapshot schema {schema}"),
            Self::InvalidTag(kind, tag) => write!(formatter, "invalid {kind} tag {tag}"),
            Self::InvalidUtf8 => formatter.write_str("entity snapshot contains invalid UTF-8"),
            Self::InvalidData(message) => write!(formatter, "invalid entity snapshot: {message}"),
            Self::LimitExceeded(kind) => write!(formatter, "entity snapshot {kind} exceeds its bound"),
            Self::TrailingBytes => formatter.write_str("entity snapshot contains trailing bytes"),
        }
    }
}

impl Error for SnapshotError {}

#[derive(Default)]
struct Writer(Vec<u8>);

impl Writer {
    fn byte(&mut self, value: u8) {
        self.0.push(value);
    }

    fn bytes(&mut self, value: &[u8]) {
        self.0.extend_from_slice(value);
    }

    fn u16(&mut self, value: u16) {
        self.bytes(&value.to_le_bytes());
    }

    fn i16(&mut self, value: i16) {
        self.bytes(&value.to_le_bytes());
    }

    fn u32(&mut self, value: u32) {
        self.bytes(&value.to_le_bytes());
    }

    fn i32(&mut self, value: i32) {
        self.bytes(&value.to_le_bytes());
    }

    fn u64(&mut self, value: u64) {
        self.bytes(&value.to_le_bytes());
    }

    fn i64(&mut self, value: i64) {
        self.bytes(&value.to_le_bytes());
    }

    fn f32(&mut self, value: f32) {
        self.u32(value.to_bits());
    }

    fn bool(&mut self, value: bool) {
        self.byte(u8::from(value));
    }

    fn string(&mut self, value: &str) {
        self.u32(value.len() as u32);
        self.bytes(value.as_bytes());
    }

    fn blob(&mut self, value: &[u8]) {
        self.u32(value.len() as u32);
        self.bytes(value);
    }

    fn vec3(&mut self, value: Vec3) {
        self.f32(value.x);
        self.f32(value.y);
        self.f32(value.z);
    }

    fn opt_string(&mut self, value: Option<&str>) {
        self.bool(value.is_some());
        if let Some(value) = value {
            self.string(value);
        }
    }

    fn opt_u64(&mut self, value: Option<u64>) {
        self.bool(value.is_some());
        if let Some(value) = value {
            self.u64(value);
        }
    }

    fn opt_id(&mut self, value: Option<EntityId>) {
        self.bool(value.is_some());
        if let Some(value) = value {
            self.u64(value.packed());
        }
    }
}

struct Reader<'a> {
    bytes: &'a [u8],
    offset: usize,
}

impl<'a> Reader<'a> {
    fn new(bytes: &'a [u8]) -> Result<Self, SnapshotError> {
        if bytes.len() > MAX_ENTITY_AUTHORITY_SNAPSHOT_BYTES {
            return Err(SnapshotError::LimitExceeded("byte length"));
        }
        Ok(Self { bytes, offset: 0 })
    }

    fn take(&mut self, length: usize) -> Result<&'a [u8], SnapshotError> {
        let end = self.offset.checked_add(length).ok_or(SnapshotError::Truncated)?;
        let value = self.bytes.get(self.offset..end).ok_or(SnapshotError::Truncated)?;
        self.offset = end;
        Ok(value)
    }

    fn byte(&mut self) -> Result<u8, SnapshotError> {
        Ok(self.take(1)?[0])
    }

    fn u16(&mut self) -> Result<u16, SnapshotError> {
        Ok(u16::from_le_bytes(self.take(2)?.try_into().expect("fixed width")))
    }

    fn i16(&mut self) -> Result<i16, SnapshotError> {
        Ok(i16::from_le_bytes(self.take(2)?.try_into().expect("fixed width")))
    }

    fn u32(&mut self) -> Result<u32, SnapshotError> {
        Ok(u32::from_le_bytes(self.take(4)?.try_into().expect("fixed width")))
    }

    fn i32(&mut self) -> Result<i32, SnapshotError> {
        Ok(i32::from_le_bytes(self.take(4)?.try_into().expect("fixed width")))
    }

    fn u64(&mut self) -> Result<u64, SnapshotError> {
        Ok(u64::from_le_bytes(self.take(8)?.try_into().expect("fixed width")))
    }

    fn i64(&mut self) -> Result<i64, SnapshotError> {
        Ok(i64::from_le_bytes(self.take(8)?.try_into().expect("fixed width")))
    }

    fn f32(&mut self) -> Result<f32, SnapshotError> {
        Ok(f32::from_bits(self.u32()?))
    }

    fn bool(&mut self) -> Result<bool, SnapshotError> {
        match self.byte()? {
            0 => Ok(false),
            1 => Ok(true),
            tag => Err(SnapshotError::InvalidTag("boolean", tag)),
        }
    }

    fn bounded_len(&mut self, maximum: usize, kind: &'static str) -> Result<usize, SnapshotError> {
        let length = usize::try_from(self.u32()?).map_err(|_| SnapshotError::LimitExceeded(kind))?;
        if length > maximum {
            return Err(SnapshotError::LimitExceeded(kind));
        }
        Ok(length)
    }

    fn string(&mut self, maximum: usize) -> Result<String, SnapshotError> {
        let length = self.bounded_len(maximum, "string")?;
        let value = std::str::from_utf8(self.take(length)?).map_err(|_| SnapshotError::InvalidUtf8)?;
        Ok(value.to_owned())
    }

    fn blob(&mut self, maximum: usize) -> Result<Vec<u8>, SnapshotError> {
        let length = self.bounded_len(maximum, "blob")?;
        Ok(self.take(length)?.to_vec())
    }

    fn vec3(&mut self) -> Result<Vec3, SnapshotError> {
        Ok(Vec3::new(self.f32()?, self.f32()?, self.f32()?))
    }

    fn opt_string(&mut self, maximum: usize) -> Result<Option<String>, SnapshotError> {
        self.bool()?.then(|| self.string(maximum)).transpose()
    }

    fn opt_u64(&mut self) -> Result<Option<u64>, SnapshotError> {
        self.bool()?.then(|| self.u64()).transpose()
    }

    fn opt_id(&mut self) -> Result<Option<EntityId>, SnapshotError> {
        self.bool()?.then(|| self.entity_id()).transpose()
    }

    fn entity_id(&mut self) -> Result<EntityId, SnapshotError> {
        let packed = self.u64()?;
        let id = EntityId::new(packed as u32, (packed >> 32) as u32);
        if id.0.index() == 0 || id.0.generation() == 0 {
            return Err(SnapshotError::InvalidData("entity ID contains a reserved component"));
        }
        Ok(id)
    }

    fn finish(self) -> Result<(), SnapshotError> {
        if self.offset == self.bytes.len() {
            Ok(())
        } else {
            Err(SnapshotError::TrailingBytes)
        }
    }
}

fn write_compatibility(writer: &mut Writer, value: &EntityCompatibilityRecord) {
    writer.u16(value.schema);
    writer.string(&value.external_entity_id);
    writer.opt_u64(value.legacy_numeric_id);
    writer.string(&value.specimen_id);
    writer.string(&value.kind_key);
    writer.byte(value.class as u8);
    writer.opt_string(value.variant_key.as_deref());
    writer.opt_string(value.name.as_deref());
    writer.u64(value.location_id.packed());
    writer.vec3(value.position);
    writer.f32(value.yaw);
    writer.vec3(value.velocity);
    writer.f32(value.health);
    writer.f32(value.maximum_health);
    writer.u64(value.age_ticks);
    writer.bool(value.natural_spawned);
    writer.bool(value.ever_led);
    writer.opt_string(value.owner_id.as_deref());
    writer.bool(value.tamed);
    writer.u32(value.bond_points);
    writer.string(&value.bond_tier);
    writer.opt_string(value.social_group_id.as_deref());
    writer.opt_string(value.faction_id.as_deref());
    writer.opt_string(value.settlement_id.as_deref());
    write_string_map(writer, &value.equipment);
    writer.u32(value.research.len() as u32);
    for (key, item) in &value.research {
        writer.string(key);
        writer.u32(*item);
    }
    write_string_map(writer, &value.custom);
}

fn read_compatibility(reader: &mut Reader<'_>) -> Result<EntityCompatibilityRecord, SnapshotError> {
    let schema = reader.u16()?;
    let external_entity_id = reader.string(MAX_ENTITY_COMPATIBILITY_STRING_BYTES)?;
    let legacy_numeric_id = reader.opt_u64()?;
    let specimen_id = reader.string(MAX_ENTITY_COMPATIBILITY_STRING_BYTES)?;
    let kind_key = reader.string(MAX_ENTITY_COMPATIBILITY_STRING_BYTES)?;
    let class = match reader.byte()? {
        0 => EntityClass::Creature,
        1 => EntityClass::Player,
        2 => EntityClass::Sentient,
        3 => EntityClass::Construct,
        4 => EntityClass::Projectile,
        5 => EntityClass::Vehicle,
        tag => return Err(SnapshotError::InvalidTag("entity class", tag)),
    };
    let variant_key = reader.opt_string(MAX_ENTITY_COMPATIBILITY_STRING_BYTES)?;
    let name = reader.opt_string(MAX_ENTITY_COMPATIBILITY_STRING_BYTES)?;
    let packed_location = reader.u64()?;
    let location_id = LocationId::new(packed_location as u32, (packed_location >> 32) as u32);
    let position = reader.vec3()?;
    let yaw = reader.f32()?;
    let velocity = reader.vec3()?;
    let health = reader.f32()?;
    let maximum_health = reader.f32()?;
    let age_ticks = reader.u64()?;
    let natural_spawned = reader.bool()?;
    let ever_led = reader.bool()?;
    let owner_id = reader.opt_string(MAX_ENTITY_COMPATIBILITY_STRING_BYTES)?;
    let tamed = reader.bool()?;
    let bond_points = reader.u32()?;
    let bond_tier = reader.string(MAX_ENTITY_COMPATIBILITY_STRING_BYTES)?;
    let social_group_id = reader.opt_string(MAX_ENTITY_COMPATIBILITY_STRING_BYTES)?;
    let faction_id = reader.opt_string(MAX_ENTITY_COMPATIBILITY_STRING_BYTES)?;
    let settlement_id = reader.opt_string(MAX_ENTITY_COMPATIBILITY_STRING_BYTES)?;
    let equipment = read_string_map(reader)?;
    let research_count = reader.bounded_len(MAX_ENTITY_COMPATIBILITY_MAP_ENTRIES, "research map")?;
    let mut research = BTreeMap::new();
    for _ in 0..research_count {
        let key = reader.string(MAX_ENTITY_COMPATIBILITY_STRING_BYTES)?;
        if key.is_empty() || research.insert(key, reader.u32()?).is_some() {
            return Err(SnapshotError::InvalidData("duplicate or empty research key"));
        }
    }
    let custom = read_string_map(reader)?;
    let record = EntityCompatibilityRecord {
        schema,
        external_entity_id,
        legacy_numeric_id,
        specimen_id,
        kind_key,
        class,
        variant_key,
        name,
        location_id,
        position,
        yaw,
        velocity,
        health,
        maximum_health,
        age_ticks,
        natural_spawned,
        ever_led,
        owner_id,
        tamed,
        bond_points,
        bond_tier,
        social_group_id,
        faction_id,
        settlement_id,
        equipment,
        research,
        custom,
    };
    record
        .validate()
        .map_err(|_| SnapshotError::InvalidData("compatibility record failed validation"))?;
    Ok(record)
}

fn write_string_map(writer: &mut Writer, value: &BTreeMap<String, String>) {
    writer.u32(value.len() as u32);
    for (key, value) in value {
        writer.string(key);
        writer.string(value);
    }
}

fn read_string_map(reader: &mut Reader<'_>) -> Result<BTreeMap<String, String>, SnapshotError> {
    let count = reader.bounded_len(MAX_ENTITY_COMPATIBILITY_MAP_ENTRIES, "string map")?;
    let mut result = BTreeMap::new();
    for _ in 0..count {
        let key = reader.string(MAX_ENTITY_COMPATIBILITY_STRING_BYTES)?;
        let value = reader.string(MAX_ENTITY_COMPATIBILITY_STRING_BYTES)?;
        if key.is_empty() || result.insert(key, value).is_some() {
            return Err(SnapshotError::InvalidData("duplicate or empty string map key"));
        }
    }
    Ok(result)
}

pub fn encode_compatibility_record(value: &EntityCompatibilityRecord) -> Result<Vec<u8>, SnapshotError> {
    value
        .validate()
        .map_err(|_| SnapshotError::InvalidData("compatibility record failed validation"))?;
    let mut writer = Writer::default();
    writer.bytes(COMPATIBILITY_MAGIC);
    write_compatibility(&mut writer, value);
    Ok(writer.0)
}

pub fn decode_compatibility_record(bytes: &[u8]) -> Result<EntityCompatibilityRecord, SnapshotError> {
    let mut reader = Reader::new(bytes)?;
    if reader.take(4)? != COMPATIBILITY_MAGIC {
        return Err(SnapshotError::InvalidMagic);
    }
    let value = read_compatibility(&mut reader)?;
    reader.finish()?;
    Ok(value)
}

fn write_components(writer: &mut Writer, value: &EntityComponents) {
    let vitals = &value.vitals;
    writer.f32(vitals.health);
    writer.f32(vitals.maximum_health);
    writer.u16(vitals.hunger_milli);
    writer.u16(vitals.saturation_milli);
    writer.u16(vitals.oxygen_milli);
    writer.i16(vitals.temperature_milli);
    writer.u16(vitals.wetness_milli);
    writer.u32(vitals.environment_flags);
    writer.u64(vitals.last_damage_tick);
    writer.u64(vitals.last_breath_tick);

    let locomotion = &value.locomotion;
    writer.byte(locomotion.shape as u8);
    writer.f32(locomotion.radius);
    writer.f32(locomotion.half_height);
    writer.f32(locomotion.mass);
    writer.f32(locomotion.step_height);
    writer.vec3(locomotion.velocity);
    writer.vec3(locomotion.desired_velocity);
    writer.bool(locomotion.grounded);
    writer.bool(locomotion.submerged);
    writer.byte(locomotion.movement_mode as u8);
    write_action(writer, &locomotion.action);
    writer.u32(locomotion.cooldowns.len() as u32);
    for (key, tick) in &locomotion.cooldowns {
        writer.string(key);
        writer.u64(*tick);
    }

    let ai = &value.ai;
    writer.byte(ai.intent as u8);
    writer.string(&ai.intent_key);
    writer.opt_id(ai.target);
    writer.vec3(ai.home);
    writer.u32(ai.blackboard.len() as u32);
    for (key, item) in &ai.blackboard {
        writer.string(key);
        match item {
            BlackboardValue::Bool(value) => {
                writer.byte(0);
                writer.bool(*value);
            }
            BlackboardValue::Signed(value) => {
                writer.byte(1);
                writer.i64(*value);
            }
            BlackboardValue::Unsigned(value) => {
                writer.byte(2);
                writer.u64(*value);
            }
            BlackboardValue::FixedMilli(value) => {
                writer.byte(3);
                writer.i64(*value);
            }
            BlackboardValue::Text(value) => {
                writer.byte(4);
                writer.string(value);
            }
            BlackboardValue::Entity(value) => {
                writer.byte(5);
                writer.u64(value.packed());
            }
            BlackboardValue::Bytes(value) => {
                writer.byte(6);
                writer.blob(value);
            }
        }
    }
    writer.u64(ai.route_epoch);
    writer.u16(ai.route_cursor);
    writer.u32(ai.route.len() as u32);
    for point in &ai.route {
        writer.vec3(*point);
    }
    writer.u32(ai.threats.len() as u32);
    for threat in &ai.threats {
        writer.u64(threat.entity.packed());
        writer.u32(threat.score_milli);
        writer.u64(threat.last_seen_tick);
        for coordinate in threat.last_known_cell {
            writer.i32(coordinate);
        }
    }
    writer.u64(ai.decision_due_tick);

    let social = &value.social;
    writer.opt_string(social.group_id.as_deref());
    writer.opt_id(social.leader);
    writer.opt_id(social.following);
    writer.i16(social.herd_rank);
    writer.i16(social.disposition_milli);
    writer.f32(social.preferred_separation);
    writer.u64(social.last_social_tick);

    let mount = &value.mount;
    writer.opt_id(mount.parent_mount);
    writer.bool(mount.occupied_seat.is_some());
    if let Some(seat) = mount.occupied_seat {
        writer.byte(seat);
    }
    writer.u32(mount.seats.len() as u32);
    for seat in &mount.seats {
        writer.byte(seat.index);
        writer.string(&seat.role);
        writer.vec3(seat.offset);
        writer.opt_id(seat.occupant);
        writer.u16(seat.control_weight_milli);
    }
    writer.opt_string(mount.saddle_key.as_deref());
    writer.bool(mount.accepts_riders);

    let protection = &value.protection;
    writer.u64(protection.flags.bits());
    writer.opt_u64(protection.first_owned_tick);
    writer.opt_u64(protection.first_led_tick);
    writer.opt_u64(protection.enclosure_verified_tick);
    writer.opt_u64(protection.named_tick);
    writer.opt_string(protection.provenance_key.as_deref());

    let network = &value.network;
    writer.opt_string(network.owner_peer_id.as_deref());
    writer.u64(network.last_command_sequence);
    writer.u64(network.last_command_tick);
    writer.u64(network.lease_epoch);
    writer.u64(network.lease_expires_tick);

    write_option(writer, value.care.as_ref(), |writer, state| {
        writer.bool(state.stabilized);
        writer.u16(state.nourishment_milli);
        writer.u16(state.trust_milli);
        writer.u16(state.care_stage);
        writer.u64(state.last_care_tick);
    });
    write_option(writer, value.husbandry.as_ref(), |writer, state| {
        writer.byte(state.sex);
        writer.u16(state.maturity_milli);
        writer.u64(state.breed_cooldown_until_tick);
        writer.u64(state.gestation_until_tick);
        writer.u32(state.parent_specimen_ids.len() as u32);
        for parent in &state.parent_specimen_ids {
            writer.string(parent);
        }
    });
    write_option(writer, value.work.as_ref(), |writer, state| {
        writer.string(&state.task_key);
        writer.u16(state.progress_milli);
        writer.opt_id(state.target_entity);
        writer.bool(state.target_cell.is_some());
        if let Some(cell) = state.target_cell {
            for coordinate in cell {
                writer.i32(coordinate);
            }
        }
        writer.opt_string(state.carrying_item_key.as_deref());
        writer.u64(state.due_tick);
    });
    writer.u32(value.equipment.len() as u32);
    for (slot, state) in &value.equipment {
        writer.string(slot);
        writer.string(&state.item_key);
        writer.u16(state.count);
        writer.u32(state.durability);
        writer.u32(state.custom.len() as u32);
        for (key, bytes) in &state.custom {
            writer.string(key);
            writer.blob(bytes);
        }
    }
    write_option(writer, value.dragon.as_ref(), |writer, state| {
        writer.string(&state.lineage_key);
        writer.string(&state.element_key);
        writer.u16(state.life_stage);
        writer.u16(state.flight_stamina_milli);
        writer.u16(state.breath_charge_milli);
        writer.bool(state.egg_or_hatchling);
    });
    write_option(writer, value.legendary.as_ref(), |writer, state| {
        writer.string(&state.encounter_key);
        writer.u16(state.phase);
        writer.bool(state.defeated);
        writer.u64(state.capture_lock_until_tick);
        writer.u32(state.world_flags.len() as u32);
        for (key, flag) in &state.world_flags {
            writer.string(key);
            writer.u64(*flag);
        }
    });
    write_option(writer, value.summon.as_ref(), |writer, state| {
        writer.string(&state.origin_realm_key);
        writer.opt_string(state.summoner_id.as_deref());
        writer.u64(state.expires_tick);
        writer.bool(state.grounded);
        writer.opt_string(state.grounding_item_key.as_deref());
    });
    write_option(writer, value.sentient.as_ref(), |writer, state| {
        writer.opt_string(state.faction_id.as_deref());
        writer.opt_string(state.settlement_id.as_deref());
        writer.string(&state.occupation_key);
        writer.u32(state.dialogue_state.len() as u32);
        for (key, item) in &state.dialogue_state {
            writer.string(key);
            writer.u32(*item);
        }
        writer.i32(state.reputation_milli);
    });
    writer.u32(value.unknown_extensions.len() as u32);
    for (key, bytes) in &value.unknown_extensions {
        writer.string(key);
        writer.blob(bytes);
    }
}

fn write_action(writer: &mut Writer, value: &ActionState) {
    writer.string(&value.key);
    writer.u16(value.phase);
    writer.u64(value.started_tick);
    writer.u64(value.ends_tick);
    writer.opt_id(value.target);
}

fn write_option<T>(writer: &mut Writer, value: Option<&T>, write: impl FnOnce(&mut Writer, &T)) {
    writer.bool(value.is_some());
    if let Some(value) = value {
        write(writer, value);
    }
}

fn read_components(reader: &mut Reader<'_>) -> Result<EntityComponents, SnapshotError> {
    let vitals = VitalsEnvironment {
        health: reader.f32()?,
        maximum_health: reader.f32()?,
        hunger_milli: reader.u16()?,
        saturation_milli: reader.u16()?,
        oxygen_milli: reader.u16()?,
        temperature_milli: reader.i16()?,
        wetness_milli: reader.u16()?,
        environment_flags: reader.u32()?,
        last_damage_tick: reader.u64()?,
        last_breath_tick: reader.u64()?,
    };
    let shape = match reader.byte()? {
        0 => BodyShape::Capsule,
        1 => BodyShape::Box,
        2 => BodyShape::Sphere,
        3 => BodyShape::Serpentine,
        4 => BodyShape::Flying,
        5 => BodyShape::Aquatic,
        tag => return Err(SnapshotError::InvalidTag("body shape", tag)),
    };
    let radius = reader.f32()?;
    let half_height = reader.f32()?;
    let mass = reader.f32()?;
    let step_height = reader.f32()?;
    let velocity = reader.vec3()?;
    let desired_velocity = reader.vec3()?;
    let grounded = reader.bool()?;
    let submerged = reader.bool()?;
    let movement_mode = match reader.byte()? {
        0 => MovementMode::Ground,
        1 => MovementMode::Swim,
        2 => MovementMode::Fly,
        3 => MovementMode::Burrow,
        4 => MovementMode::Climb,
        5 => MovementMode::Mounted,
        6 => MovementMode::KnockedBack,
        7 => MovementMode::Disabled,
        tag => return Err(SnapshotError::InvalidTag("movement mode", tag)),
    };
    let action = read_action(reader)?;
    let cooldown_count = reader.bounded_len(MAX_COMPONENT_MAP_ENTRIES, "cooldown map")?;
    let mut cooldowns = BTreeMap::new();
    for _ in 0..cooldown_count {
        let key = reader.string(MAX_COMPONENT_TEXT_BYTES)?;
        if key.is_empty() || cooldowns.insert(key, reader.u64()?).is_some() {
            return Err(SnapshotError::InvalidData("duplicate or empty cooldown key"));
        }
    }
    let locomotion = LocomotionBody {
        shape,
        radius,
        half_height,
        mass,
        step_height,
        velocity,
        desired_velocity,
        grounded,
        submerged,
        movement_mode,
        action,
        cooldowns,
    };

    let intent = match reader.byte()? {
        0 => AiIntentKind::Idle,
        1 => AiIntentKind::Wander,
        2 => AiIntentKind::Graze,
        3 => AiIntentKind::Flee,
        4 => AiIntentKind::Pursue,
        5 => AiIntentKind::Attack,
        6 => AiIntentKind::Follow,
        7 => AiIntentKind::Work,
        8 => AiIntentKind::ReturnHome,
        9 => AiIntentKind::Scripted,
        tag => return Err(SnapshotError::InvalidTag("AI intent", tag)),
    };
    let intent_key = reader.string(MAX_COMPONENT_TEXT_BYTES)?;
    let target = reader.opt_id()?;
    let home = reader.vec3()?;
    let blackboard_count = reader.bounded_len(MAX_COMPONENT_MAP_ENTRIES, "AI blackboard")?;
    let mut blackboard = BTreeMap::new();
    for _ in 0..blackboard_count {
        let key = reader.string(MAX_COMPONENT_TEXT_BYTES)?;
        let value = match reader.byte()? {
            0 => BlackboardValue::Bool(reader.bool()?),
            1 => BlackboardValue::Signed(reader.i64()?),
            2 => BlackboardValue::Unsigned(reader.u64()?),
            3 => BlackboardValue::FixedMilli(reader.i64()?),
            4 => BlackboardValue::Text(reader.string(MAX_COMPONENT_TEXT_BYTES)?),
            5 => BlackboardValue::Entity(reader.entity_id()?),
            6 => BlackboardValue::Bytes(reader.blob(MAX_COMPONENT_TEXT_BYTES)?),
            tag => return Err(SnapshotError::InvalidTag("blackboard value", tag)),
        };
        if key.is_empty() || blackboard.insert(key, value).is_some() {
            return Err(SnapshotError::InvalidData("duplicate or empty blackboard key"));
        }
    }
    let route_epoch = reader.u64()?;
    let route_cursor = reader.u16()?;
    let route_count = reader.bounded_len(MAX_ROUTE_POINTS, "AI route")?;
    let mut route = Vec::with_capacity(route_count);
    for _ in 0..route_count {
        route.push(reader.vec3()?);
    }
    let threat_count = reader.bounded_len(MAX_THREATS, "AI threats")?;
    let mut threats = Vec::with_capacity(threat_count);
    let mut previous_threat = None;
    for _ in 0..threat_count {
        let entity = reader.entity_id()?;
        if previous_threat.is_some_and(|previous| previous >= entity) {
            return Err(SnapshotError::InvalidData("threat memories are not strictly ordered"));
        }
        previous_threat = Some(entity);
        threats.push(ThreatMemory {
            entity,
            score_milli: reader.u32()?,
            last_seen_tick: reader.u64()?,
            last_known_cell: [reader.i32()?, reader.i32()?, reader.i32()?],
        });
    }
    let ai = AiState {
        intent,
        intent_key,
        target,
        home,
        blackboard,
        route_epoch,
        route_cursor,
        route,
        threats,
        decision_due_tick: reader.u64()?,
    };

    let social = SocialFollowerState {
        group_id: reader.opt_string(MAX_COMPONENT_TEXT_BYTES)?,
        leader: reader.opt_id()?,
        following: reader.opt_id()?,
        herd_rank: reader.i16()?,
        disposition_milli: reader.i16()?,
        preferred_separation: reader.f32()?,
        last_social_tick: reader.u64()?,
    };
    let parent_mount = reader.opt_id()?;
    let occupied_seat = reader.bool()?.then(|| reader.byte()).transpose()?;
    let seat_count = reader.bounded_len(MAX_MOUNT_SEATS, "mount seats")?;
    let mut seats = Vec::with_capacity(seat_count);
    let mut previous_seat = None;
    for _ in 0..seat_count {
        let index = reader.byte()?;
        if previous_seat.is_some_and(|previous| previous >= index) {
            return Err(SnapshotError::InvalidData("mount seats are not strictly ordered"));
        }
        previous_seat = Some(index);
        seats.push(MountSeat {
            index,
            role: reader.string(MAX_COMPONENT_TEXT_BYTES)?,
            offset: reader.vec3()?,
            occupant: reader.opt_id()?,
            control_weight_milli: reader.u16()?,
        });
    }
    let mount = MountState {
        parent_mount,
        occupied_seat,
        seats,
        saddle_key: reader.opt_string(MAX_COMPONENT_TEXT_BYTES)?,
        accepts_riders: reader.bool()?,
    };
    let protection = ProtectionProvenance {
        flags: ProtectionState::from_bits(reader.u64()?),
        first_owned_tick: reader.opt_u64()?,
        first_led_tick: reader.opt_u64()?,
        enclosure_verified_tick: reader.opt_u64()?,
        named_tick: reader.opt_u64()?,
        provenance_key: reader.opt_string(MAX_COMPONENT_TEXT_BYTES)?,
    };
    let network = NetworkAuthorityState {
        owner_peer_id: reader.opt_string(MAX_COMPONENT_TEXT_BYTES)?,
        last_command_sequence: reader.u64()?,
        last_command_tick: reader.u64()?,
        lease_epoch: reader.u64()?,
        lease_expires_tick: reader.u64()?,
    };
    let care = read_option(reader, |reader| {
        Ok(CareState {
            stabilized: reader.bool()?,
            nourishment_milli: reader.u16()?,
            trust_milli: reader.u16()?,
            care_stage: reader.u16()?,
            last_care_tick: reader.u64()?,
        })
    })?;
    let husbandry = read_option(reader, |reader| {
        let sex = reader.byte()?;
        let maturity_milli = reader.u16()?;
        let breed_cooldown_until_tick = reader.u64()?;
        let gestation_until_tick = reader.u64()?;
        let parent_count = reader.bounded_len(2, "husbandry parents")?;
        let mut parent_specimen_ids = Vec::with_capacity(parent_count);
        for _ in 0..parent_count {
            parent_specimen_ids.push(reader.string(MAX_COMPONENT_TEXT_BYTES)?);
        }
        Ok(HusbandryState {
            sex,
            maturity_milli,
            breed_cooldown_until_tick,
            gestation_until_tick,
            parent_specimen_ids,
        })
    })?;
    let work = read_option(reader, |reader| {
        let task_key = reader.string(MAX_COMPONENT_TEXT_BYTES)?;
        let progress_milli = reader.u16()?;
        let target_entity = reader.opt_id()?;
        let target_cell = reader
            .bool()?
            .then(|| Ok([reader.i32()?, reader.i32()?, reader.i32()?]))
            .transpose()?;
        let carrying_item_key = reader.opt_string(MAX_COMPONENT_TEXT_BYTES)?;
        let due_tick = reader.u64()?;
        Ok(WorkState {
            task_key,
            progress_milli,
            target_entity,
            target_cell,
            carrying_item_key,
            due_tick,
        })
    })?;
    let equipment_count = reader.bounded_len(MAX_COMPONENT_MAP_ENTRIES, "equipment")?;
    let mut equipment = BTreeMap::new();
    for _ in 0..equipment_count {
        let slot = reader.string(MAX_COMPONENT_TEXT_BYTES)?;
        let item_key = reader.string(MAX_COMPONENT_TEXT_BYTES)?;
        let count = reader.u16()?;
        let durability = reader.u32()?;
        let custom_count = reader.bounded_len(MAX_COMPONENT_MAP_ENTRIES, "equipment custom map")?;
        let mut custom = BTreeMap::new();
        for _ in 0..custom_count {
            let key = reader.string(MAX_COMPONENT_TEXT_BYTES)?;
            let bytes = reader.blob(MAX_COMPONENT_TEXT_BYTES)?;
            if key.is_empty() || custom.insert(key, bytes).is_some() {
                return Err(SnapshotError::InvalidData("duplicate or empty equipment extension key"));
            }
        }
        if slot.is_empty()
            || equipment
                .insert(
                    slot,
                    EquipmentSlotState {
                        item_key,
                        count,
                        durability,
                        custom,
                    },
                )
                .is_some()
        {
            return Err(SnapshotError::InvalidData("duplicate or empty equipment slot"));
        }
    }
    let dragon = read_option(reader, |reader| {
        Ok(DragonState {
            lineage_key: reader.string(MAX_COMPONENT_TEXT_BYTES)?,
            element_key: reader.string(MAX_COMPONENT_TEXT_BYTES)?,
            life_stage: reader.u16()?,
            flight_stamina_milli: reader.u16()?,
            breath_charge_milli: reader.u16()?,
            egg_or_hatchling: reader.bool()?,
        })
    })?;
    let legendary = read_option(reader, |reader| {
        let encounter_key = reader.string(MAX_COMPONENT_TEXT_BYTES)?;
        let phase = reader.u16()?;
        let defeated = reader.bool()?;
        let capture_lock_until_tick = reader.u64()?;
        let count = reader.bounded_len(MAX_COMPONENT_MAP_ENTRIES, "legendary world flags")?;
        let mut world_flags = BTreeMap::new();
        for _ in 0..count {
            let key = reader.string(MAX_COMPONENT_TEXT_BYTES)?;
            if key.is_empty() || world_flags.insert(key, reader.u64()?).is_some() {
                return Err(SnapshotError::InvalidData("duplicate or empty legendary flag"));
            }
        }
        Ok(LegendaryState {
            encounter_key,
            phase,
            defeated,
            capture_lock_until_tick,
            world_flags,
        })
    })?;
    let summon = read_option(reader, |reader| {
        Ok(SummonState {
            origin_realm_key: reader.string(MAX_COMPONENT_TEXT_BYTES)?,
            summoner_id: reader.opt_string(MAX_COMPONENT_TEXT_BYTES)?,
            expires_tick: reader.u64()?,
            grounded: reader.bool()?,
            grounding_item_key: reader.opt_string(MAX_COMPONENT_TEXT_BYTES)?,
        })
    })?;
    let sentient = read_option(reader, |reader| {
        let faction_id = reader.opt_string(MAX_COMPONENT_TEXT_BYTES)?;
        let settlement_id = reader.opt_string(MAX_COMPONENT_TEXT_BYTES)?;
        let occupation_key = reader.string(MAX_COMPONENT_TEXT_BYTES)?;
        let count = reader.bounded_len(MAX_COMPONENT_MAP_ENTRIES, "sentient dialogue map")?;
        let mut dialogue_state = BTreeMap::new();
        for _ in 0..count {
            let key = reader.string(MAX_COMPONENT_TEXT_BYTES)?;
            if key.is_empty() || dialogue_state.insert(key, reader.u32()?).is_some() {
                return Err(SnapshotError::InvalidData("duplicate or empty dialogue key"));
            }
        }
        Ok(SentientState {
            faction_id,
            settlement_id,
            occupation_key,
            dialogue_state,
            reputation_milli: reader.i32()?,
        })
    })?;
    let extension_count = reader.bounded_len(MAX_COMPONENT_MAP_ENTRIES, "unknown extensions")?;
    let mut unknown_extensions = BTreeMap::new();
    let mut unknown_bytes = 0usize;
    for _ in 0..extension_count {
        let key = reader.string(MAX_COMPONENT_TEXT_BYTES)?;
        let bytes = reader.blob(MAX_UNKNOWN_EXTENSION_BYTES)?;
        unknown_bytes = unknown_bytes
            .checked_add(bytes.len())
            .ok_or(SnapshotError::LimitExceeded("unknown extensions"))?;
        if unknown_bytes > MAX_UNKNOWN_EXTENSION_BYTES {
            return Err(SnapshotError::LimitExceeded("unknown extensions"));
        }
        if key.is_empty() || unknown_extensions.insert(key, bytes).is_some() {
            return Err(SnapshotError::InvalidData("duplicate or empty unknown extension key"));
        }
    }
    let components = EntityComponents {
        vitals,
        locomotion,
        ai,
        social,
        mount,
        protection,
        network,
        care,
        husbandry,
        work,
        equipment,
        dragon,
        legendary,
        summon,
        sentient,
        unknown_extensions,
    };
    components
        .validate()
        .map_err(|_| SnapshotError::InvalidData("entity components failed validation"))?;
    Ok(components)
}

fn read_action(reader: &mut Reader<'_>) -> Result<ActionState, SnapshotError> {
    Ok(ActionState {
        key: reader.string(MAX_COMPONENT_TEXT_BYTES)?,
        phase: reader.u16()?,
        started_tick: reader.u64()?,
        ends_tick: reader.u64()?,
        target: reader.opt_id()?,
    })
}

fn read_option<T>(
    reader: &mut Reader<'_>,
    read: impl FnOnce(&mut Reader<'_>) -> Result<T, SnapshotError>,
) -> Result<Option<T>, SnapshotError> {
    if reader.bool()? {
        Ok(Some(read(reader)?))
    } else {
        Ok(None)
    }
}

pub fn encode_entity_authority_snapshot(authority: &EntityAuthority) -> Result<Vec<u8>, SnapshotError> {
    validate_authority(authority)?;
    let mut writer = Writer::default();
    writer.bytes(AUTHORITY_MAGIC);
    writer.u16(ENTITY_AUTHORITY_SNAPSHOT_SCHEMA);
    writer.u64(authority.revision);
    writer.opt_u64(authority.last_sequence);
    writer.u32(authority.slots.len() as u32);
    for slot in &authority.slots {
        writer.u32(slot.generation);
        writer.byte(match slot.residency {
            None => 0,
            Some(EntityResidency::Hot) => 1,
            Some(EntityResidency::Cold) => 2,
        });
    }
    writer.u32(authority.free.len() as u32);
    for index in &authority.free {
        writer.u32(*index);
    }
    writer.u32(authority.hot.len() as u32);
    for (id, entity) in &authority.hot {
        writer.u64(id.packed());
        write_compatibility(&mut writer, &entity.record);
        write_components(&mut writer, &entity.components);
        writer.u64(entity.entity_revision);
        writer.u16(entity.tier as u16);
        writer.u64(entity.protection.bits());
        writer.f32(entity.out_of_range_seconds);
        writer.u64(entity.last_simulated_tick);
    }
    writer.u32(authority.cold.len() as u32);
    for (id, entity) in &authority.cold {
        writer.u64(id.packed());
        write_compatibility(&mut writer, &entity.record);
        write_components(&mut writer, &entity.components);
        writer.u64(entity.entity_revision);
        writer.u64(entity.protection.bits());
        write_dormant_summary(&mut writer, &entity.summary);
    }
    if writer.0.len() > MAX_ENTITY_AUTHORITY_SNAPSHOT_BYTES {
        return Err(SnapshotError::LimitExceeded("byte length"));
    }
    Ok(writer.0)
}

pub fn decode_entity_authority_snapshot(bytes: &[u8]) -> Result<EntityAuthority, SnapshotError> {
    let mut reader = Reader::new(bytes)?;
    if reader.take(4)? != AUTHORITY_MAGIC {
        return Err(SnapshotError::InvalidMagic);
    }
    let schema = reader.u16()?;
    if schema != ENTITY_AUTHORITY_SNAPSHOT_SCHEMA {
        return Err(SnapshotError::UnsupportedSchema(schema));
    }
    let revision = reader.u64()?;
    let last_sequence = reader.opt_u64()?;
    let slot_count = reader.bounded_len(MAX_ENTITY_COUNT + 1, "slot count")?;
    if slot_count == 0 {
        return Err(SnapshotError::InvalidData("reserved slot is missing"));
    }
    let mut slots = Vec::with_capacity(slot_count);
    for _ in 0..slot_count {
        let generation = reader.u32()?;
        let residency = match reader.byte()? {
            0 => None,
            1 => Some(EntityResidency::Hot),
            2 => Some(EntityResidency::Cold),
            tag => return Err(SnapshotError::InvalidTag("entity residency", tag)),
        };
        slots.push(EntitySlot { generation, residency });
    }
    let free_count = reader.bounded_len(MAX_ENTITY_COUNT, "free slot count")?;
    let mut free = BTreeSet::new();
    for _ in 0..free_count {
        let index = reader.u32()?;
        if index == 0 || usize::try_from(index).map_or(true, |index| index >= slot_count) || !free.insert(index) {
            return Err(SnapshotError::InvalidData(
                "free slot set contains an invalid or duplicate index",
            ));
        }
    }
    let hot_count = reader.bounded_len(MAX_ENTITY_COUNT, "hot entity count")?;
    let mut hot = BTreeMap::new();
    for _ in 0..hot_count {
        let id = reader.entity_id()?;
        let record = read_compatibility(&mut reader)?;
        let components = read_components(&mut reader)?;
        let entity_revision = reader.u64()?;
        let tier = match reader.u16()? {
            0 => SimulationTier::Hero,
            1 => SimulationTier::Nearby,
            2 => SimulationTier::Coarse,
            3 => SimulationTier::Dormant,
            _ => return Err(SnapshotError::InvalidData("invalid simulation tier")),
        };
        let protection = ProtectionState::from_bits(reader.u64()?);
        let out_of_range_seconds = reader.f32()?;
        let last_simulated_tick = reader.u64()?;
        if hot
            .insert(
                id,
                HotEntity {
                    record,
                    components,
                    entity_revision,
                    tier,
                    protection,
                    out_of_range_seconds,
                    last_simulated_tick,
                },
            )
            .is_some()
        {
            return Err(SnapshotError::InvalidData("duplicate hot entity ID"));
        }
    }
    let cold_count = reader.bounded_len(MAX_ENTITY_COUNT, "cold entity count")?;
    if hot_count.saturating_add(cold_count) > MAX_ENTITY_COUNT {
        return Err(SnapshotError::LimitExceeded("entity count"));
    }
    let mut cold = BTreeMap::new();
    for _ in 0..cold_count {
        let id = reader.entity_id()?;
        if hot.contains_key(&id) {
            return Err(SnapshotError::InvalidData("entity ID exists in both residencies"));
        }
        let record = read_compatibility(&mut reader)?;
        let components = read_components(&mut reader)?;
        let entity_revision = reader.u64()?;
        let protection = ProtectionState::from_bits(reader.u64()?);
        let summary = read_dormant_summary(&mut reader)?;
        if cold
            .insert(
                id,
                ColdEntity {
                    record,
                    components,
                    entity_revision,
                    protection,
                    summary,
                },
            )
            .is_some()
        {
            return Err(SnapshotError::InvalidData("duplicate cold entity ID"));
        }
    }
    reader.finish()?;
    let authority = EntityAuthority {
        revision,
        last_sequence,
        slots,
        free,
        hot,
        cold,
    };
    validate_authority(&authority)?;
    Ok(authority)
}

fn write_dormant_summary(writer: &mut Writer, value: &DormantEntitySummary) {
    writer.u64(value.slept_at_tick);
    writer.u64(value.last_advanced_tick);
    writer.u32(value.care_cycles);
    writer.u32(value.breeding_cycles);
    writer.u32(value.work_cycles);
    writer.u64(value.next_care_tick);
    writer.u64(value.next_breeding_tick);
    writer.u64(value.next_work_tick);
    writer.u64(value.next_ecology_tick);
    writer.u64(value.route_epoch);
    writer.u32(value.population_cost_quarters);
}

fn read_dormant_summary(reader: &mut Reader<'_>) -> Result<DormantEntitySummary, SnapshotError> {
    Ok(DormantEntitySummary {
        slept_at_tick: reader.u64()?,
        last_advanced_tick: reader.u64()?,
        care_cycles: reader.u32()?,
        breeding_cycles: reader.u32()?,
        work_cycles: reader.u32()?,
        next_care_tick: reader.u64()?,
        next_breeding_tick: reader.u64()?,
        next_work_tick: reader.u64()?,
        next_ecology_tick: reader.u64()?,
        route_epoch: reader.u64()?,
        population_cost_quarters: reader.u32()?,
    })
}

fn validate_authority(authority: &EntityAuthority) -> Result<(), SnapshotError> {
    if authority.slots.is_empty() || authority.slots.len() > MAX_ENTITY_COUNT + 1 {
        return Err(SnapshotError::LimitExceeded("slot count"));
    }
    if authority.slots[0].generation != 0 || authority.slots[0].residency.is_some() {
        return Err(SnapshotError::InvalidData("reserved slot is not canonical"));
    }
    if authority.hot.len().saturating_add(authority.cold.len()) > MAX_ENTITY_COUNT {
        return Err(SnapshotError::LimitExceeded("entity count"));
    }
    let expected_free: BTreeSet<_> = authority
        .slots
        .iter()
        .enumerate()
        .skip(1)
        .filter_map(|(index, slot)| slot.residency.is_none().then_some(index as u32))
        .collect();
    if expected_free != authority.free {
        return Err(SnapshotError::InvalidData("free set does not match empty slots"));
    }
    let mut external_ids = BTreeSet::new();
    for (id, entity) in &authority.hot {
        validate_slot(authority, *id, EntityResidency::Hot)?;
        validate_entity(
            &entity.record,
            &entity.components,
            entity.entity_revision,
            entity.protection,
            &mut external_ids,
        )?;
        if !entity.out_of_range_seconds.is_finite() || entity.out_of_range_seconds < 0.0 {
            return Err(SnapshotError::InvalidData("hot range timer is invalid"));
        }
        if entity.tier == SimulationTier::Dormant {
            return Err(SnapshotError::InvalidData("hot entity uses dormant simulation tier"));
        }
    }
    for (id, entity) in &authority.cold {
        validate_slot(authority, *id, EntityResidency::Cold)?;
        validate_entity(
            &entity.record,
            &entity.components,
            entity.entity_revision,
            entity.protection,
            &mut external_ids,
        )?;
        if entity.summary.route_epoch != entity.components.ai.route_epoch {
            return Err(SnapshotError::InvalidData("dormant route epoch diverged from AI state"));
        }
    }
    for (index, slot) in authority.slots.iter().enumerate().skip(1) {
        if slot.generation == 0 {
            return Err(SnapshotError::InvalidData("non-reserved slot has zero generation"));
        }
        if let Some(residency) = slot.residency {
            let id = EntityId::new(index as u32, slot.generation);
            let present = match residency {
                EntityResidency::Hot => authority.hot.contains_key(&id),
                EntityResidency::Cold => authority.cold.contains_key(&id),
            };
            if !present {
                return Err(SnapshotError::InvalidData("occupied slot has no matching entity"));
            }
        }
    }
    Ok(())
}

fn validate_slot(authority: &EntityAuthority, id: EntityId, residency: EntityResidency) -> Result<(), SnapshotError> {
    let Some(slot) = authority.slots.get(id.0.index() as usize) else {
        return Err(SnapshotError::InvalidData("entity ID is outside slot table"));
    };
    if slot.generation != id.0.generation() || slot.residency != Some(residency) {
        return Err(SnapshotError::InvalidData(
            "entity ID does not match slot generation and residency",
        ));
    }
    Ok(())
}

fn validate_entity(
    record: &EntityCompatibilityRecord,
    components: &EntityComponents,
    entity_revision: u64,
    protection: ProtectionState,
    external_ids: &mut BTreeSet<String>,
) -> Result<(), SnapshotError> {
    record
        .validate()
        .map_err(|_| SnapshotError::InvalidData("compatibility record failed validation"))?;
    components
        .validate()
        .map_err(|_| SnapshotError::InvalidData("entity components failed validation"))?;
    if entity_revision == 0 {
        return Err(SnapshotError::InvalidData("live entity has zero revision"));
    }
    if protection != components.protection.flags {
        return Err(SnapshotError::InvalidData(
            "protection mirror diverged from typed provenance",
        ));
    }
    if record.health.to_bits() != components.vitals.health.to_bits()
        || record.maximum_health.to_bits() != components.vitals.maximum_health.to_bits()
        || record.velocity != components.locomotion.velocity
        || record.social_group_id != components.social.group_id
    {
        return Err(SnapshotError::InvalidData(
            "compatibility shell diverged from typed components",
        ));
    }
    let equipment: BTreeMap<_, _> = components
        .equipment
        .iter()
        .map(|(slot, item)| (slot.clone(), item.item_key.clone()))
        .collect();
    if record.equipment != equipment {
        return Err(SnapshotError::InvalidData(
            "compatibility equipment diverged from typed components",
        ));
    }
    if !external_ids.insert(record.external_entity_id.clone()) {
        return Err(SnapshotError::InvalidData("duplicate external entity ID"));
    }
    Ok(())
}
