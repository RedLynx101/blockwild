//! Exact native codecs carried by the integrated BWRQ/BWRS domain envelope.
//!
//! These are deliberately boring, bounded little-endian codecs.  They are the
//! canonical source for native and Wasm execution; TypeScript implements the
//! same byte layout and is locked to the fixtures in this module.

use std::collections::{BTreeMap, BTreeSet};

use blockwild_entity::{
    DespawnReason, EntityClass, EntityCommand, EntityCommandBatch, EntityCompatibilityRecord, EntityEventBatch,
    EntityEventKind, EntityResidency, ProtectionState, SimulationTier, Vec3 as EntityVec3,
};
use blockwild_gameplay::{
    AcceptedReceipt, ActivityLease, ActorGrant, ActorRole, AuthorityIdentity, BattleAction, CardforgeCommand,
    CombatCommand, ContainerKey, ContainerKind, CraftCommand, Domain, ExpectedStack, FixedVec3, FurnaceAdvanceCommand,
    GameplayActor, GameplayBatch, GameplayCommand, GameplayEvent, GameplayReceipt, GameplayRevision, Ingredient,
    InventoryCommand, MachineCommand, MachineOperation, OpaquePayload, PacifyMethod, PrintingKey, ProgressionAction,
    ProgressionCommand, Rejection, RejectionCode, ResourceDelta, ResourceEndpoint, ResourceKey, ResourceKind, Scope,
    SlotRef, StatDelta, TransferCommand, WorldKey,
};
use blockwild_network::{
    AgentCapabilityGrantV1, AgentCapabilityV1, AgentLifecycleStatusV1, InterestDeltaBuildSourceV1,
    NetworkAuthorityIdentityV1, NetworkAuthorityRevisionV1, NetworkCapabilityV1, NetworkDeltaRecordKindV1,
    NetworkDeltaRecordV1, NetworkInterestChunkV1, NetworkInterestSetV1, NetworkPeerGrantV1, NetworkPeerKindV1,
    NetworkPeerRoleV1, ReplicationScopeV1, ScopedDeltaRecordV1, WorldAddressV1 as NetworkWorldAddressV1,
};
use blockwild_runtime_wire::{MAX_DOMAIN_PAYLOAD_BYTES, WireError, wire_checksum_v1};
use blockwild_types::{CanonicalHash, EntityId, LocationId, PlayerId};

const DOMAIN_PROTOCOL_V1: u16 = 1;
const DOMAIN_SCHEMA_V1: u16 = 1;
const DOMAIN_HEADER_BYTES: usize = 28;
const MAX_COLLECTION: usize = 65_536;
const MAX_MAP_ENTRIES: usize = 4_096;
const MAX_STRING_BYTES: usize = 16 * 1024;
const ENTITY_COMMAND_MAGIC: [u8; 4] = *b"BWE6";
const ENTITY_RECEIPT_MAGIC: [u8; 4] = *b"BWA6";
const GAMEPLAY_COMMAND_MAGIC: [u8; 4] = *b"BWG7";
const GAMEPLAY_RECEIPT_MAGIC: [u8; 4] = *b"BWA7";
const GAMEPLAY_GRANT_MAGIC: [u8; 4] = *b"BWK7";
const NETWORK_PEER_GRANT_MAGIC: [u8; 4] = *b"BWP9";
const NETWORK_AGENT_GRANT_MAGIC: [u8; 4] = *b"BWJ9";
const NETWORK_REPLICATION_MAGIC: [u8; 4] = *b"BWI9";
const NETWORK_DELTA_BUILD_MAGIC: [u8; 4] = *b"BWD9";
const NETWORK_RECONNECT_MAGIC: [u8; 4] = *b"BWC9";
const NETWORK_PEER_RELEASE_MAGIC: [u8; 4] = *b"BWL9";
const NETWORK_COMMAND_RELEASE_MAGIC: [u8; 4] = *b"BWM9";
const PLAYER_BINDING_MAGIC: [u8; 4] = *b"BWB5";
const PERSISTENCE_DISPATCH_MAGIC: [u8; 4] = *b"BWD8";
const PERSISTENCE_DISPATCH_RECEIPT_MAGIC: [u8; 4] = *b"BWA8";

/// Bounded control-plane requests that ask the Rust persistence dispatcher to
/// issue one complete BWPR. Large BWPR/BWPA packets themselves leave through
/// the detached bulk lane; this packet never changes the normal BWRQ ceiling.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RuntimePersistenceDispatchWireV1 {
    Commit {
        browser_request: Vec<u8>,
    },
    Recover {
        world_id: String,
        checkpoint_id: Option<String>,
    },
    ReadRecoveryPage {
        world_id: String,
        checkpoint_id: String,
        start_record: u64,
        max_records: u32,
        max_bytes: u32,
    },
    Estimate {
        world_id: String,
    },
    Compact {
        world_id: String,
        checkpoint_id: String,
        expected_head_hash: CanonicalHash,
        retain_parent_count: u16,
    },
    Delete {
        world_id: String,
        expected_head_hash: Option<CanonicalHash>,
        tombstone: CanonicalHash,
    },
    PreserveLegacyBackupChunk {
        world_id: String,
        backup_id: String,
        offset: u64,
        total_bytes: u64,
        bytes: Vec<u8>,
    },
    ExportPage {
        world_id: String,
        checkpoint_id: String,
        cursor: u64,
        max_bytes: u32,
    },
    ImportChunk {
        world_id: String,
        import_id: String,
        offset: u64,
        total_bytes: u64,
        bytes: Vec<u8>,
    },
    FinalizeImport {
        world_id: String,
        import_id: String,
        archive_hash: CanonicalHash,
        total_bytes: u64,
    },
    Retry {
        previous_request_id: u64,
    },
    Close,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RuntimePersistenceDispatchReceiptWireV1 {
    pub request_id: Option<u64>,
    pub persistence_revision: u64,
    pub pending: u32,
    pub queued_bytes: u64,
    pub state_hash: CanonicalHash,
    pub closed: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RuntimePlayerBindingWireV1 {
    pub external_entity_id: String,
    pub radius: f64,
    pub standing_height: f64,
    pub crouching_height: f64,
    pub mass: f64,
    pub walk_speed: f64,
    pub sprint_speed: f64,
    pub creative_flight_speed: f64,
    pub maximum_oxygen_seconds: f64,
}

impl RuntimePlayerBindingWireV1 {
    pub fn validate(&self) -> Result<(), WireError> {
        let values = [
            self.radius,
            self.standing_height,
            self.crouching_height,
            self.mass,
            self.walk_speed,
            self.sprint_speed,
            self.creative_flight_speed,
            self.maximum_oxygen_seconds,
        ];
        if self.external_entity_id.is_empty()
            || self.external_entity_id.len() > 512
            || self.external_entity_id.chars().any(char::is_control)
            || values.iter().any(|value| !value.is_finite() || *value <= 0.0)
            || !(0.1..=4.0).contains(&self.radius)
            || !(0.5..=8.0).contains(&self.standing_height)
            || self.crouching_height > self.standing_height
            || !(0.1..=100_000.0).contains(&self.mass)
            || !(0.1..=128.0).contains(&self.walk_speed)
            || self.sprint_speed < self.walk_speed
            || self.sprint_speed > 192.0
            || !(0.1..=256.0).contains(&self.creative_flight_speed)
            || self.maximum_oxygen_seconds > 3_600.0
        {
            return Err(WireError::new(
                "player-binding",
                "player binding contains an invalid identity or physical profile",
            ));
        }
        Ok(())
    }
}

pub fn encode_runtime_player_binding_v1(value: &RuntimePlayerBindingWireV1) -> Result<Vec<u8>, WireError> {
    value.validate()?;
    let mut writer = Writer::default();
    writer.string(&value.external_entity_id)?;
    writer.f64(value.radius);
    writer.f64(value.standing_height);
    writer.f64(value.crouching_height);
    writer.f64(value.mass);
    writer.f64(value.walk_speed);
    writer.f64(value.sprint_speed);
    writer.f64(value.creative_flight_speed);
    writer.f64(value.maximum_oxygen_seconds);
    wrap(PLAYER_BINDING_MAGIC, writer.finish())
}

pub fn decode_runtime_player_binding_v1(bytes: &[u8]) -> Result<RuntimePlayerBindingWireV1, WireError> {
    let mut reader = Reader::new(unwrap(PLAYER_BINDING_MAGIC, bytes)?);
    let value = RuntimePlayerBindingWireV1 {
        external_entity_id: reader.string()?,
        radius: reader.f64()?,
        standing_height: reader.f64()?,
        crouching_height: reader.f64()?,
        mass: reader.f64()?,
        walk_speed: reader.f64()?,
        sprint_speed: reader.f64()?,
        creative_flight_speed: reader.f64()?,
        maximum_oxygen_seconds: reader.f64()?,
    };
    reader.finish()?;
    value.validate()?;
    Ok(value)
}

pub fn encode_runtime_persistence_dispatch_v1(value: &RuntimePersistenceDispatchWireV1) -> Result<Vec<u8>, WireError> {
    let mut writer = Writer::default();
    match value {
        RuntimePersistenceDispatchWireV1::Commit { browser_request } => {
            writer.u8(1);
            writer.bytes(
                browser_request,
                MAX_DOMAIN_PAYLOAD_BYTES - DOMAIN_HEADER_BYTES,
                "persistence commit",
            )?;
        }
        RuntimePersistenceDispatchWireV1::Recover {
            world_id,
            checkpoint_id,
        } => {
            writer.u8(4);
            writer.string(world_id)?;
            writer.option_string(checkpoint_id.as_deref())?;
        }
        RuntimePersistenceDispatchWireV1::ReadRecoveryPage {
            world_id,
            checkpoint_id,
            start_record,
            max_records,
            max_bytes,
        } => {
            writer.u8(5);
            writer.string(world_id)?;
            writer.string(checkpoint_id)?;
            writer.u64(*start_record);
            writer.u32(*max_records);
            writer.u32(*max_bytes);
        }
        RuntimePersistenceDispatchWireV1::Estimate { world_id } => {
            writer.u8(6);
            writer.string(world_id)?;
        }
        RuntimePersistenceDispatchWireV1::Compact {
            world_id,
            checkpoint_id,
            expected_head_hash,
            retain_parent_count,
        } => {
            writer.u8(7);
            writer.string(world_id)?;
            writer.string(checkpoint_id)?;
            writer.hash(*expected_head_hash);
            writer.u16(*retain_parent_count);
        }
        RuntimePersistenceDispatchWireV1::Delete {
            world_id,
            expected_head_hash,
            tombstone,
        } => {
            writer.u8(8);
            writer.string(world_id)?;
            writer.flag(expected_head_hash.is_some());
            if let Some(hash) = expected_head_hash {
                writer.hash(*hash);
            }
            writer.hash(*tombstone);
        }
        RuntimePersistenceDispatchWireV1::PreserveLegacyBackupChunk {
            world_id,
            backup_id,
            offset,
            total_bytes,
            bytes,
        } => {
            writer.u8(9);
            writer.string(world_id)?;
            writer.string(backup_id)?;
            writer.u64(*offset);
            writer.u64(*total_bytes);
            writer.bytes(
                bytes,
                MAX_DOMAIN_PAYLOAD_BYTES - DOMAIN_HEADER_BYTES,
                "legacy backup chunk",
            )?;
        }
        RuntimePersistenceDispatchWireV1::ExportPage {
            world_id,
            checkpoint_id,
            cursor,
            max_bytes,
        } => {
            writer.u8(10);
            writer.string(world_id)?;
            writer.string(checkpoint_id)?;
            writer.u64(*cursor);
            writer.u32(*max_bytes);
        }
        RuntimePersistenceDispatchWireV1::ImportChunk {
            world_id,
            import_id,
            offset,
            total_bytes,
            bytes,
        } => {
            writer.u8(11);
            writer.string(world_id)?;
            writer.string(import_id)?;
            writer.u64(*offset);
            writer.u64(*total_bytes);
            writer.bytes(bytes, MAX_DOMAIN_PAYLOAD_BYTES - DOMAIN_HEADER_BYTES, "import chunk")?;
        }
        RuntimePersistenceDispatchWireV1::FinalizeImport {
            world_id,
            import_id,
            archive_hash,
            total_bytes,
        } => {
            writer.u8(12);
            writer.string(world_id)?;
            writer.string(import_id)?;
            writer.hash(*archive_hash);
            writer.u64(*total_bytes);
        }
        RuntimePersistenceDispatchWireV1::Retry { previous_request_id } => {
            writer.u8(13);
            writer.u64(*previous_request_id);
        }
        RuntimePersistenceDispatchWireV1::Close => writer.u8(14),
    }
    wrap(PERSISTENCE_DISPATCH_MAGIC, writer.finish())
}

pub fn decode_runtime_persistence_dispatch_v1(bytes: &[u8]) -> Result<RuntimePersistenceDispatchWireV1, WireError> {
    let mut reader = Reader::new(unwrap(PERSISTENCE_DISPATCH_MAGIC, bytes)?);
    let value = match reader.u8()? {
        1 => RuntimePersistenceDispatchWireV1::Commit {
            browser_request: reader.bytes(MAX_DOMAIN_PAYLOAD_BYTES - DOMAIN_HEADER_BYTES, "persistence commit")?,
        },
        4 => RuntimePersistenceDispatchWireV1::Recover {
            world_id: reader.string()?,
            checkpoint_id: reader.option_string()?,
        },
        5 => RuntimePersistenceDispatchWireV1::ReadRecoveryPage {
            world_id: reader.string()?,
            checkpoint_id: reader.string()?,
            start_record: reader.u64()?,
            max_records: reader.u32()?,
            max_bytes: reader.u32()?,
        },
        6 => RuntimePersistenceDispatchWireV1::Estimate {
            world_id: reader.string()?,
        },
        7 => RuntimePersistenceDispatchWireV1::Compact {
            world_id: reader.string()?,
            checkpoint_id: reader.string()?,
            expected_head_hash: reader.hash()?,
            retain_parent_count: reader.u16()?,
        },
        8 => RuntimePersistenceDispatchWireV1::Delete {
            world_id: reader.string()?,
            expected_head_hash: if reader.flag()? { Some(reader.hash()?) } else { None },
            tombstone: reader.hash()?,
        },
        9 => RuntimePersistenceDispatchWireV1::PreserveLegacyBackupChunk {
            world_id: reader.string()?,
            backup_id: reader.string()?,
            offset: reader.u64()?,
            total_bytes: reader.u64()?,
            bytes: reader.bytes(MAX_DOMAIN_PAYLOAD_BYTES - DOMAIN_HEADER_BYTES, "legacy backup chunk")?,
        },
        10 => RuntimePersistenceDispatchWireV1::ExportPage {
            world_id: reader.string()?,
            checkpoint_id: reader.string()?,
            cursor: reader.u64()?,
            max_bytes: reader.u32()?,
        },
        11 => RuntimePersistenceDispatchWireV1::ImportChunk {
            world_id: reader.string()?,
            import_id: reader.string()?,
            offset: reader.u64()?,
            total_bytes: reader.u64()?,
            bytes: reader.bytes(MAX_DOMAIN_PAYLOAD_BYTES - DOMAIN_HEADER_BYTES, "import chunk")?,
        },
        12 => RuntimePersistenceDispatchWireV1::FinalizeImport {
            world_id: reader.string()?,
            import_id: reader.string()?,
            archive_hash: reader.hash()?,
            total_bytes: reader.u64()?,
        },
        13 => RuntimePersistenceDispatchWireV1::Retry {
            previous_request_id: reader.u64()?,
        },
        14 => RuntimePersistenceDispatchWireV1::Close,
        _ => {
            return Err(WireError::new(
                "persistence-operation",
                "unknown persistence dispatcher operation",
            ));
        }
    };
    reader.finish()?;
    Ok(value)
}

pub fn encode_runtime_persistence_dispatch_receipt_v1(
    value: &RuntimePersistenceDispatchReceiptWireV1,
) -> Result<Vec<u8>, WireError> {
    let mut writer = Writer::default();
    writer.flag(value.request_id.is_some());
    if let Some(request_id) = value.request_id {
        writer.u64(request_id);
    }
    writer.u64(value.persistence_revision);
    writer.u32(value.pending);
    writer.u64(value.queued_bytes);
    writer.hash(value.state_hash);
    writer.flag(value.closed);
    wrap(PERSISTENCE_DISPATCH_RECEIPT_MAGIC, writer.finish())
}

pub fn decode_runtime_persistence_dispatch_receipt_v1(
    bytes: &[u8],
) -> Result<RuntimePersistenceDispatchReceiptWireV1, WireError> {
    let mut reader = Reader::new(unwrap(PERSISTENCE_DISPATCH_RECEIPT_MAGIC, bytes)?);
    let value = RuntimePersistenceDispatchReceiptWireV1 {
        request_id: if reader.flag()? { Some(reader.u64()?) } else { None },
        persistence_revision: reader.u64()?,
        pending: reader.u32()?,
        queued_bytes: reader.u64()?,
        state_hash: reader.hash()?,
        closed: reader.flag()?,
    };
    reader.finish()?;
    Ok(value)
}

#[derive(Clone, Debug)]
pub struct NetworkDeltaBuildRequestWireV1 {
    pub source: InterestDeltaBuildSourceV1,
    pub interest: NetworkInterestSetV1,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NetworkReconnectRequestWireV1 {
    pub session_id: String,
    pub peer_id: String,
    pub connection_generation: u64,
}

pub fn encode_network_replication_record_v1(value: &ScopedDeltaRecordV1) -> Result<Vec<u8>, WireError> {
    let mut writer = Writer::default();
    write_replication_scope(&mut writer, &value.scope)?;
    write_network_delta_record(&mut writer, &value.record)?;
    wrap(NETWORK_REPLICATION_MAGIC, writer.finish())
}

pub fn decode_network_replication_record_v1(bytes: &[u8]) -> Result<ScopedDeltaRecordV1, WireError> {
    let mut reader = Reader::new(unwrap(NETWORK_REPLICATION_MAGIC, bytes)?);
    let value = ScopedDeltaRecordV1 {
        scope: read_replication_scope(&mut reader)?,
        record: read_network_delta_record(&mut reader)?,
    };
    reader.finish()?;
    value
        .scope
        .validate()
        .map_err(|error| WireError::new("network-replication", error.to_string()))?;
    Ok(value)
}

pub fn encode_network_delta_build_request_v1(value: &NetworkDeltaBuildRequestWireV1) -> Result<Vec<u8>, WireError> {
    value
        .interest
        .validate()
        .map_err(|error| WireError::new("network-delta", error.to_string()))?;
    let mut writer = Writer::default();
    writer.string(&value.source.session_id)?;
    writer.string(&value.source.delta_id)?;
    writer.string(&value.source.peer_id)?;
    writer.flag(value.source.keyframe);
    writer.u64(value.source.sequence);
    writer.u64(value.source.acknowledged_command_sequence);
    write_network_identity(&mut writer, &value.source.from)?;
    write_network_identity(&mut writer, &value.source.to)?;
    write_network_interest(&mut writer, &value.interest)?;
    wrap(NETWORK_DELTA_BUILD_MAGIC, writer.finish())
}

pub fn decode_network_delta_build_request_v1(bytes: &[u8]) -> Result<NetworkDeltaBuildRequestWireV1, WireError> {
    let mut reader = Reader::new(unwrap(NETWORK_DELTA_BUILD_MAGIC, bytes)?);
    let source = InterestDeltaBuildSourceV1 {
        session_id: reader.string()?,
        delta_id: reader.string()?,
        peer_id: reader.string()?,
        keyframe: reader.flag()?,
        sequence: reader.u64()?,
        acknowledged_command_sequence: reader.u64()?,
        from: read_network_identity(&mut reader)?,
        to: read_network_identity(&mut reader)?,
    };
    let interest = read_network_interest(&mut reader)?;
    reader.finish()?;
    Ok(NetworkDeltaBuildRequestWireV1 { source, interest })
}

pub fn encode_network_reconnect_request_v1(value: &NetworkReconnectRequestWireV1) -> Result<Vec<u8>, WireError> {
    let mut writer = Writer::default();
    writer.string(&value.session_id)?;
    writer.string(&value.peer_id)?;
    writer.u64(value.connection_generation);
    wrap(NETWORK_RECONNECT_MAGIC, writer.finish())
}

pub fn decode_network_reconnect_request_v1(bytes: &[u8]) -> Result<NetworkReconnectRequestWireV1, WireError> {
    let mut reader = Reader::new(unwrap(NETWORK_RECONNECT_MAGIC, bytes)?);
    let value = NetworkReconnectRequestWireV1 {
        session_id: reader.string()?,
        peer_id: reader.string()?,
        connection_generation: reader.u64()?,
    };
    reader.finish()?;
    Ok(value)
}

pub fn encode_network_peer_release_v1(peer_id: &str) -> Result<Vec<u8>, WireError> {
    let mut writer = Writer::default();
    writer.string(peer_id)?;
    wrap(NETWORK_PEER_RELEASE_MAGIC, writer.finish())
}

pub fn decode_network_peer_release_v1(bytes: &[u8]) -> Result<String, WireError> {
    let mut reader = Reader::new(unwrap(NETWORK_PEER_RELEASE_MAGIC, bytes)?);
    let peer_id = reader.string()?;
    reader.finish()?;
    Ok(peer_id)
}

pub fn encode_network_command_release_v1(command_id: &str) -> Result<Vec<u8>, WireError> {
    let mut writer = Writer::default();
    writer.string(command_id)?;
    wrap(NETWORK_COMMAND_RELEASE_MAGIC, writer.finish())
}

pub fn decode_network_command_release_v1(bytes: &[u8]) -> Result<String, WireError> {
    let mut reader = Reader::new(unwrap(NETWORK_COMMAND_RELEASE_MAGIC, bytes)?);
    let command_id = reader.string()?;
    reader.finish()?;
    Ok(command_id)
}

pub fn encode_network_peer_grant_v1(value: &NetworkPeerGrantV1) -> Result<Vec<u8>, WireError> {
    value
        .validate()
        .map_err(|error| WireError::new("network-grant", error.to_string()))?;
    let mut writer = Writer::default();
    writer.string(&value.session_id)?;
    writer.string(&value.peer_id)?;
    writer.string(&value.connection_id)?;
    writer.string(&value.actor_id)?;
    writer.u8(value.peer_kind as u8);
    writer.u8(value.role as u8);
    if value.capabilities.len() > 10 {
        return Err(WireError::new(
            "network-grant",
            "network capability count exceeds its budget",
        ));
    }
    writer.u8(value.capabilities.len() as u8);
    for capability in &value.capabilities {
        writer.u8(*capability as u8);
    }
    writer.u64(value.expires_at);
    writer.u64(value.next_sequence);
    write_network_interest(&mut writer, &value.interest)?;
    wrap(NETWORK_PEER_GRANT_MAGIC, writer.finish())
}

pub fn decode_network_peer_grant_v1(bytes: &[u8]) -> Result<NetworkPeerGrantV1, WireError> {
    let mut reader = Reader::new(unwrap(NETWORK_PEER_GRANT_MAGIC, bytes)?);
    let session_id = reader.string()?;
    let peer_id = reader.string()?;
    let connection_id = reader.string()?;
    let actor_id = reader.string()?;
    let peer_kind = match reader.u8()? {
        0 => NetworkPeerKindV1::Human,
        1 => NetworkPeerKindV1::Agent,
        _ => return Err(WireError::new("network-grant", "unknown network peer kind")),
    };
    let role = match reader.u8()? {
        0 => NetworkPeerRoleV1::Host,
        1 => NetworkPeerRoleV1::Guest,
        _ => return Err(WireError::new("network-grant", "unknown network peer role")),
    };
    let capability_count = reader.u8()? as usize;
    if capability_count > 10 {
        return Err(WireError::new(
            "network-grant",
            "network capability count exceeds its budget",
        ));
    }
    let mut capabilities = Vec::with_capacity(capability_count);
    for _ in 0..capability_count {
        capabilities.push(network_capability(reader.u8()?)?);
    }
    let expires_at = reader.u64()?;
    let next_sequence = reader.u64()?;
    let interest = read_network_interest(&mut reader)?;
    reader.finish()?;
    let value = NetworkPeerGrantV1 {
        session_id,
        peer_id,
        connection_id,
        actor_id,
        peer_kind,
        role,
        capabilities,
        expires_at,
        next_sequence,
        interest,
    };
    value
        .validate()
        .map_err(|error| WireError::new("network-grant", error.to_string()))?;
    Ok(value)
}

pub fn encode_network_agent_grant_v1(value: &AgentCapabilityGrantV1) -> Result<Vec<u8>, WireError> {
    value
        .validate()
        .map_err(|error| WireError::new("agent-grant", error.to_string()))?;
    let mut writer = Writer::default();
    writer.string(&value.agent_id)?;
    writer.string(&value.peer_id)?;
    writer.string(&value.connection_id)?;
    writer.u8(agent_lifecycle_tag(value.status));
    write_agent_capabilities(&mut writer, &value.requested)?;
    write_agent_capabilities(&mut writer, &value.granted)?;
    writer.u64(value.expires_at);
    wrap(NETWORK_AGENT_GRANT_MAGIC, writer.finish())
}

pub fn decode_network_agent_grant_v1(bytes: &[u8]) -> Result<AgentCapabilityGrantV1, WireError> {
    let mut reader = Reader::new(unwrap(NETWORK_AGENT_GRANT_MAGIC, bytes)?);
    let value = AgentCapabilityGrantV1 {
        agent_id: reader.string()?,
        peer_id: reader.string()?,
        connection_id: reader.string()?,
        status: read_agent_lifecycle(&mut reader)?,
        requested: read_agent_capabilities(&mut reader)?,
        granted: read_agent_capabilities(&mut reader)?,
        expires_at: reader.u64()?,
    };
    reader.finish()?;
    value
        .validate()
        .map_err(|error| WireError::new("agent-grant", error.to_string()))?;
    Ok(value)
}

fn write_network_interest(writer: &mut Writer, value: &NetworkInterestSetV1) -> Result<(), WireError> {
    value
        .validate()
        .map_err(|error| WireError::new("network-interest", error.to_string()))?;
    writer.u64(value.sequence);
    writer.count(value.chunks.len(), 1_024, "network interest chunk count")?;
    for chunk in &value.chunks {
        writer.string(&chunk.address.universe_id)?;
        writer.string(&chunk.address.location_id)?;
        writer.i32(chunk.chunk_x);
        writer.i32(chunk.chunk_z);
    }
    writer.count(value.entity_ids.len(), 16_384, "network interest entity count")?;
    for entity_id in &value.entity_ids {
        writer.string(entity_id)?;
    }
    writer.hash(value.interest_hash);
    Ok(())
}

fn read_network_interest(reader: &mut Reader<'_>) -> Result<NetworkInterestSetV1, WireError> {
    let sequence = reader.u64()?;
    let chunk_count = reader.count(1_024, "network interest chunk count")?;
    let mut chunks = Vec::with_capacity(chunk_count);
    for _ in 0..chunk_count {
        chunks.push(NetworkInterestChunkV1 {
            address: NetworkWorldAddressV1 {
                universe_id: reader.string()?,
                location_id: reader.string()?,
            },
            chunk_x: reader.i32()?,
            chunk_z: reader.i32()?,
        });
    }
    let entity_count = reader.count(16_384, "network interest entity count")?;
    let mut entity_ids = Vec::with_capacity(entity_count);
    for _ in 0..entity_count {
        entity_ids.push(reader.string()?);
    }
    let interest_hash = reader.hash()?;
    let value = NetworkInterestSetV1 {
        sequence,
        chunks,
        entity_ids,
        interest_hash,
    };
    value
        .validate()
        .map_err(|error| WireError::new("network-interest", error.to_string()))?;
    Ok(value)
}

fn write_network_identity(writer: &mut Writer, value: &NetworkAuthorityIdentityV1) -> Result<(), WireError> {
    value
        .validate()
        .map_err(|error| WireError::new("network-identity", error.to_string()))?;
    writer.string(&value.address.universe_id)?;
    writer.string(&value.address.location_id)?;
    writer.u64(value.revision.epoch);
    writer.u64(value.revision.world);
    writer.u64(value.revision.entities);
    writer.u64(value.revision.gameplay);
    writer.u64(value.revision.persistence);
    writer.hash(value.state_hash);
    Ok(())
}

fn read_network_identity(reader: &mut Reader<'_>) -> Result<NetworkAuthorityIdentityV1, WireError> {
    let address = NetworkWorldAddressV1 {
        universe_id: reader.string()?,
        location_id: reader.string()?,
    };
    let revision = NetworkAuthorityRevisionV1 {
        epoch: reader.u64()?,
        world: reader.u64()?,
        entities: reader.u64()?,
        gameplay: reader.u64()?,
        persistence: reader.u64()?,
    };
    let state_hash = reader.hash()?;
    let value = NetworkAuthorityIdentityV1 {
        address,
        revision,
        state_hash,
    };
    value
        .validate()
        .map_err(|error| WireError::new("network-identity", error.to_string()))?;
    Ok(value)
}

fn write_replication_scope(writer: &mut Writer, value: &ReplicationScopeV1) -> Result<(), WireError> {
    value
        .validate()
        .map_err(|error| WireError::new("network-scope", error.to_string()))?;
    match value {
        ReplicationScopeV1::Global => writer.u8(0),
        ReplicationScopeV1::Location(address) => {
            writer.u8(1);
            writer.string(&address.universe_id)?;
            writer.string(&address.location_id)?;
        }
        ReplicationScopeV1::Chunk(chunk) => {
            writer.u8(2);
            writer.string(&chunk.address.universe_id)?;
            writer.string(&chunk.address.location_id)?;
            writer.i32(chunk.chunk_x);
            writer.i32(chunk.chunk_z);
        }
        ReplicationScopeV1::Entity(entity_id) => {
            writer.u8(3);
            writer.string(entity_id)?;
        }
    }
    Ok(())
}

fn read_replication_scope(reader: &mut Reader<'_>) -> Result<ReplicationScopeV1, WireError> {
    match reader.u8()? {
        0 => Ok(ReplicationScopeV1::Global),
        1 => Ok(ReplicationScopeV1::Location(NetworkWorldAddressV1 {
            universe_id: reader.string()?,
            location_id: reader.string()?,
        })),
        2 => Ok(ReplicationScopeV1::Chunk(NetworkInterestChunkV1 {
            address: NetworkWorldAddressV1 {
                universe_id: reader.string()?,
                location_id: reader.string()?,
            },
            chunk_x: reader.i32()?,
            chunk_z: reader.i32()?,
        })),
        3 => Ok(ReplicationScopeV1::Entity(reader.string()?)),
        _ => Err(WireError::new("network-scope", "unknown network replication scope")),
    }
}

fn write_network_delta_record(writer: &mut Writer, value: &NetworkDeltaRecordV1) -> Result<(), WireError> {
    let rebuilt = NetworkDeltaRecordV1::new(
        value.kind,
        value.record_id.clone(),
        value.revision,
        value.payload.clone(),
    )
    .map_err(|error| WireError::new("network-record", error.to_string()))?;
    if rebuilt != *value {
        return Err(WireError::new("network-record", "network record hash mismatch"));
    }
    writer.u8(value.kind as u8);
    writer.string(&value.record_id)?;
    writer.u64(value.revision);
    writer.bytes(&value.payload, MAX_DOMAIN_PAYLOAD_BYTES, "network record payload")?;
    writer.hash(value.payload_hash);
    Ok(())
}

fn read_network_delta_record(reader: &mut Reader<'_>) -> Result<NetworkDeltaRecordV1, WireError> {
    let kind = match reader.u8()? {
        0 => NetworkDeltaRecordKindV1::World,
        1 => NetworkDeltaRecordKindV1::Entity,
        2 => NetworkDeltaRecordKindV1::Gameplay,
        3 => NetworkDeltaRecordKindV1::Player,
        4 => NetworkDeltaRecordKindV1::Agent,
        5 => NetworkDeltaRecordKindV1::Tombstone,
        _ => return Err(WireError::new("network-record", "unknown network record kind")),
    };
    let record_id = reader.string()?;
    let revision = reader.u64()?;
    let payload = reader.bytes(MAX_DOMAIN_PAYLOAD_BYTES, "network record payload")?;
    let payload_hash = reader.hash()?;
    let value = NetworkDeltaRecordV1::new(kind, record_id, revision, payload)
        .map_err(|error| WireError::new("network-record", error.to_string()))?;
    if value.payload_hash != payload_hash {
        return Err(WireError::new("network-record", "network record hash mismatch"));
    }
    Ok(value)
}

fn network_capability(tag: u8) -> Result<NetworkCapabilityV1, WireError> {
    match tag {
        0 => Ok(NetworkCapabilityV1::Observe),
        1 => Ok(NetworkCapabilityV1::Chat),
        2 => Ok(NetworkCapabilityV1::Interact),
        3 => Ok(NetworkCapabilityV1::Inventory),
        4 => Ok(NetworkCapabilityV1::Build),
        5 => Ok(NetworkCapabilityV1::Combat),
        6 => Ok(NetworkCapabilityV1::CreatureCare),
        7 => Ok(NetworkCapabilityV1::Trade),
        8 => Ok(NetworkCapabilityV1::Travel),
        9 => Ok(NetworkCapabilityV1::AgentWork),
        _ => Err(WireError::new("network-grant", "unknown network capability")),
    }
}

fn agent_lifecycle_tag(value: AgentLifecycleStatusV1) -> u8 {
    match value {
        AgentLifecycleStatusV1::Pending => 0,
        AgentLifecycleStatusV1::Approved => 1,
        AgentLifecycleStatusV1::Paused => 2,
        AgentLifecycleStatusV1::Revoked => 3,
        AgentLifecycleStatusV1::Disconnected => 4,
    }
}

fn read_agent_lifecycle(reader: &mut Reader<'_>) -> Result<AgentLifecycleStatusV1, WireError> {
    match reader.u8()? {
        0 => Ok(AgentLifecycleStatusV1::Pending),
        1 => Ok(AgentLifecycleStatusV1::Approved),
        2 => Ok(AgentLifecycleStatusV1::Paused),
        3 => Ok(AgentLifecycleStatusV1::Revoked),
        4 => Ok(AgentLifecycleStatusV1::Disconnected),
        _ => Err(WireError::new("agent-grant", "unknown agent lifecycle status")),
    }
}

fn write_agent_capabilities(writer: &mut Writer, values: &[AgentCapabilityV1]) -> Result<(), WireError> {
    if values.len() > 15 {
        return Err(WireError::new(
            "agent-grant",
            "agent capability count exceeds its budget",
        ));
    }
    writer.u8(values.len() as u8);
    for value in values {
        writer.u8(*value as u8);
    }
    Ok(())
}

fn read_agent_capabilities(reader: &mut Reader<'_>) -> Result<Vec<AgentCapabilityV1>, WireError> {
    let count = reader.u8()? as usize;
    if count > 15 {
        return Err(WireError::new(
            "agent-grant",
            "agent capability count exceeds its budget",
        ));
    }
    let mut values = Vec::with_capacity(count);
    for _ in 0..count {
        let tag = reader.u8()?;
        values.push(
            AgentCapabilityV1::from_wire(tag)
                .ok_or_else(|| WireError::new("agent-grant", "unknown agent capability"))?,
        );
    }
    Ok(values)
}

pub fn encode_gameplay_actor_grant_v1(actor_id: &str, grant: &ActorGrant) -> Result<Vec<u8>, WireError> {
    let mut writer = Writer::default();
    writer.string(actor_id)?;
    writer.option_player_id(grant.player_id);
    writer.option_entity_id(grant.entity_id);
    writer.u8(actor_role_tag(grant.role));
    writer.count(grant.scopes.len(), 16, "gameplay scope count")?;
    for scope in &grant.scopes {
        writer.u8(scope_tag(*scope));
    }
    wrap(GAMEPLAY_GRANT_MAGIC, writer.finish())
}

pub fn decode_gameplay_actor_grant_v1(bytes: &[u8]) -> Result<(String, ActorGrant), WireError> {
    let mut reader = Reader::new(unwrap(GAMEPLAY_GRANT_MAGIC, bytes)?);
    let actor_id = reader.string()?;
    let player_id = reader.option_player_id()?;
    let entity_id = reader.option_entity_id()?;
    let role = read_actor_role(&mut reader)?;
    let count = reader.count(16, "gameplay scope count")?;
    let mut scopes = BTreeSet::new();
    for _ in 0..count {
        if !scopes.insert(read_scope(&mut reader)?) {
            return Err(WireError::new(
                "gameplay-grant",
                "gameplay grant contains a duplicate scope",
            ));
        }
    }
    reader.finish()?;
    Ok((
        actor_id,
        ActorGrant {
            player_id,
            entity_id,
            role,
            scopes,
        },
    ))
}

pub fn encode_gameplay_batch_v1(value: &GameplayBatch) -> Result<Vec<u8>, WireError> {
    let mut writer = Writer::default();
    writer.string(&value.batch_id)?;
    writer.string(&value.idempotency_key)?;
    write_gameplay_actor(&mut writer, &value.actor)?;
    write_gameplay_identity(&mut writer, &value.identity)?;
    writer.count(
        value.commands.len(),
        blockwild_gameplay::MAX_COMMANDS_PER_BATCH,
        "gameplay command count",
    )?;
    for command in &value.commands {
        write_gameplay_command(&mut writer, command)?;
    }
    writer.hash(value.command_hash);
    wrap(GAMEPLAY_COMMAND_MAGIC, writer.finish())
}

pub fn decode_gameplay_batch_v1(bytes: &[u8]) -> Result<GameplayBatch, WireError> {
    let mut reader = Reader::new(unwrap(GAMEPLAY_COMMAND_MAGIC, bytes)?);
    let batch_id = reader.string()?;
    let idempotency_key = reader.string()?;
    let actor = read_gameplay_actor(&mut reader)?;
    let identity = read_gameplay_identity(&mut reader)?;
    let count = reader.count(blockwild_gameplay::MAX_COMMANDS_PER_BATCH, "gameplay command count")?;
    if count == 0 {
        return Err(WireError::new("gameplay-count", "gameplay batch cannot be empty"));
    }
    let mut commands = Vec::with_capacity(count);
    for _ in 0..count {
        commands.push(read_gameplay_command(&mut reader)?);
    }
    let command_hash = reader.hash()?;
    reader.finish()?;
    let value = GameplayBatch {
        schema_version: blockwild_gameplay::GAMEPLAY_SCHEMA_VERSION,
        batch_id,
        idempotency_key,
        actor,
        identity,
        commands,
        command_hash,
    };
    if value.command_hash != value.calculate_command_hash() {
        return Err(WireError::new("gameplay-hash", "gameplay command hash mismatch"));
    }
    Ok(value)
}

pub fn encode_gameplay_receipt_v1(value: &GameplayReceipt) -> Result<Vec<u8>, WireError> {
    let mut writer = Writer::default();
    match value {
        GameplayReceipt::Accepted(receipt) => {
            writer.u8(1);
            write_accepted_gameplay_receipt(&mut writer, receipt)?;
        }
        GameplayReceipt::Rejected {
            batch_id,
            identity,
            rejection,
        } => {
            writer.u8(0);
            writer.string(batch_id)?;
            write_gameplay_identity(&mut writer, identity)?;
            writer.u8(rejection_code_tag(rejection.code));
            writer.string(&rejection.message)?;
        }
    }
    wrap(GAMEPLAY_RECEIPT_MAGIC, writer.finish())
}

pub fn decode_gameplay_receipt_v1(bytes: &[u8]) -> Result<GameplayReceipt, WireError> {
    let mut reader = Reader::new(unwrap(GAMEPLAY_RECEIPT_MAGIC, bytes)?);
    let result = match reader.u8()? {
        0 => GameplayReceipt::Rejected {
            batch_id: reader.string()?,
            identity: read_gameplay_identity(&mut reader)?,
            rejection: Rejection {
                code: read_rejection_code(&mut reader)?,
                message: reader.string()?,
            },
        },
        1 => GameplayReceipt::Accepted(read_accepted_gameplay_receipt(&mut reader)?),
        _ => return Err(WireError::new("gameplay-receipt", "unknown gameplay receipt tag")),
    };
    reader.finish()?;
    Ok(result)
}

fn write_gameplay_actor(writer: &mut Writer, value: &GameplayActor) -> Result<(), WireError> {
    writer.string(&value.actor_id)?;
    writer.option_player_id(value.player_id);
    writer.option_entity_id(value.entity_id);
    writer.u8(actor_role_tag(value.role));
    Ok(())
}

fn read_gameplay_actor(reader: &mut Reader<'_>) -> Result<GameplayActor, WireError> {
    Ok(GameplayActor {
        actor_id: reader.string()?,
        player_id: reader.option_player_id()?,
        entity_id: reader.option_entity_id()?,
        role: read_actor_role(reader)?,
    })
}

fn write_gameplay_identity(writer: &mut Writer, value: &AuthorityIdentity) -> Result<(), WireError> {
    writer.string(&value.world.universe)?;
    writer.string(&value.world.location)?;
    writer.u32(value.revision.epoch);
    writer.u64(value.revision.sequence);
    writer.u64(value.revision.inventory);
    writer.u64(value.revision.machines);
    writer.u64(value.revision.combat);
    writer.u64(value.revision.progression);
    writer.u64(value.revision.cardforge);
    writer.hash(value.state_hash);
    Ok(())
}

fn read_gameplay_identity(reader: &mut Reader<'_>) -> Result<AuthorityIdentity, WireError> {
    Ok(AuthorityIdentity {
        world: WorldKey::new(reader.string()?, reader.string()?),
        revision: GameplayRevision {
            epoch: reader.u32()?,
            sequence: reader.u64()?,
            inventory: reader.u64()?,
            machines: reader.u64()?,
            combat: reader.u64()?,
            progression: reader.u64()?,
            cardforge: reader.u64()?,
        },
        state_hash: reader.hash()?,
    })
}

fn write_gameplay_command(writer: &mut Writer, value: &GameplayCommand) -> Result<(), WireError> {
    match value {
        GameplayCommand::Inventory(value) => {
            writer.u8(0);
            write_inventory_command(writer, value)?;
        }
        GameplayCommand::Machine(value) => {
            writer.u8(1);
            write_machine_command(writer, value)?;
        }
        GameplayCommand::Combat(value) => {
            writer.u8(2);
            write_combat_command(writer, value)?;
        }
        GameplayCommand::Progression(value) => {
            writer.u8(3);
            write_progression_command(writer, value)?;
        }
        GameplayCommand::Cardforge(value) => {
            writer.u8(4);
            write_cardforge_command(writer, value)?;
        }
    }
    Ok(())
}

fn read_gameplay_command(reader: &mut Reader<'_>) -> Result<GameplayCommand, WireError> {
    match reader.u8()? {
        0 => Ok(GameplayCommand::Inventory(read_inventory_command(reader)?)),
        1 => Ok(GameplayCommand::Machine(read_machine_command(reader)?)),
        2 => Ok(GameplayCommand::Combat(read_combat_command(reader)?)),
        3 => Ok(GameplayCommand::Progression(read_progression_command(reader)?)),
        4 => Ok(GameplayCommand::Cardforge(read_cardforge_command(reader)?)),
        _ => Err(WireError::new("gameplay-command", "unknown gameplay command domain")),
    }
}

fn write_inventory_command(writer: &mut Writer, value: &InventoryCommand) -> Result<(), WireError> {
    match value {
        InventoryCommand::Transfer(value) => {
            writer.u8(0);
            write_slot_ref(writer, &value.from)?;
            write_slot_ref(writer, &value.to)?;
            writer.u32(value.count);
            writer.flag(value.expected.is_some());
            if let Some(expected) = &value.expected {
                writer.u32(expected.item_code);
                writer.hash(expected.metadata_hash);
                writer.u32(expected.minimum_count);
            }
        }
        InventoryCommand::Craft(value) => {
            writer.u8(1);
            writer.string(&value.recipe_id)?;
            writer.u16(value.quantity);
            writer.option_string(value.station_id.as_deref())?;
            write_container_key(writer, &value.source)?;
            write_container_key(writer, &value.destination)?;
            writer.option_u64(value.expected_source_revision);
            writer.option_u64(value.expected_destination_revision);
        }
        InventoryCommand::AdvanceFurnace(value) => {
            writer.u8(2);
            writer.string(&value.furnace_id)?;
            writer.u64(value.expected_revision);
            writer.u64(value.to_tick);
            writer.flag(value.fuel_item.is_some());
            if let Some(ingredient) = &value.fuel_item {
                write_ingredient(writer, ingredient);
            }
            writer.u32(value.fuel_ticks_per_item);
        }
    }
    Ok(())
}

fn read_inventory_command(reader: &mut Reader<'_>) -> Result<InventoryCommand, WireError> {
    match reader.u8()? {
        0 => Ok(InventoryCommand::Transfer(TransferCommand {
            from: read_slot_ref(reader)?,
            to: read_slot_ref(reader)?,
            count: reader.u32()?,
            expected: if reader.flag()? {
                Some(ExpectedStack {
                    item_code: reader.u32()?,
                    metadata_hash: reader.hash()?,
                    minimum_count: reader.u32()?,
                })
            } else {
                None
            },
        })),
        1 => Ok(InventoryCommand::Craft(CraftCommand {
            recipe_id: reader.string()?,
            quantity: reader.u16()?,
            station_id: reader.option_string()?,
            source: read_container_key(reader)?,
            destination: read_container_key(reader)?,
            expected_source_revision: reader.option_u64()?,
            expected_destination_revision: reader.option_u64()?,
        })),
        2 => Ok(InventoryCommand::AdvanceFurnace(FurnaceAdvanceCommand {
            furnace_id: reader.string()?,
            expected_revision: reader.u64()?,
            to_tick: reader.u64()?,
            fuel_item: if reader.flag()? {
                Some(read_ingredient(reader)?)
            } else {
                None
            },
            fuel_ticks_per_item: reader.u32()?,
        })),
        _ => Err(WireError::new("inventory-command", "unknown inventory command tag")),
    }
}

fn write_container_key(writer: &mut Writer, value: &ContainerKey) -> Result<(), WireError> {
    writer.u8(container_kind_tag(value.kind));
    writer.string(&value.id)?;
    writer.option_string(value.owner_id.as_deref())
}

fn read_container_key(reader: &mut Reader<'_>) -> Result<ContainerKey, WireError> {
    Ok(ContainerKey {
        kind: read_container_kind(reader)?,
        id: reader.string()?,
        owner_id: reader.option_string()?,
    })
}

fn write_slot_ref(writer: &mut Writer, value: &SlotRef) -> Result<(), WireError> {
    write_container_key(writer, &value.container)?;
    writer.u16(value.slot);
    writer.option_u64(value.expected_container_revision);
    Ok(())
}

fn read_slot_ref(reader: &mut Reader<'_>) -> Result<SlotRef, WireError> {
    Ok(SlotRef {
        container: read_container_key(reader)?,
        slot: reader.u16()?,
        expected_container_revision: reader.option_u64()?,
    })
}

fn write_ingredient(writer: &mut Writer, value: &Ingredient) {
    writer.u32(value.item_code);
    writer.flag(value.metadata_hash.is_some());
    if let Some(hash) = value.metadata_hash {
        writer.hash(hash);
    }
    writer.u32(value.count);
}

fn read_ingredient(reader: &mut Reader<'_>) -> Result<Ingredient, WireError> {
    Ok(Ingredient {
        item_code: reader.u32()?,
        metadata_hash: if reader.flag()? { Some(reader.hash()?) } else { None },
        count: reader.u32()?,
    })
}

fn write_machine_command(writer: &mut Writer, value: &MachineCommand) -> Result<(), WireError> {
    match value {
        MachineCommand::Operate {
            machine_id,
            expected_revision,
            operation,
        } => {
            writer.u8(0);
            writer.string(machine_id)?;
            writer.u64(*expected_revision);
            match operation {
                MachineOperation::Configure { settings } => {
                    writer.u8(0);
                    write_opaque(writer, settings)?;
                }
                MachineOperation::Activate => writer.u8(1),
                MachineOperation::Deactivate => writer.u8(2),
                MachineOperation::ClaimOutput {
                    port_id,
                    resource,
                    amount,
                } => {
                    writer.u8(3);
                    writer.string(port_id)?;
                    write_resource_key(writer, resource)?;
                    writer.u64(*amount);
                }
            }
        }
        MachineCommand::Transfer {
            from,
            to,
            resource,
            amount,
            expected_from_revision,
            expected_to_revision,
        } => {
            writer.u8(1);
            write_resource_endpoint(writer, from)?;
            write_resource_endpoint(writer, to)?;
            write_resource_key(writer, resource)?;
            writer.u64(*amount);
            writer.u64(*expected_from_revision);
            writer.u64(*expected_to_revision);
        }
        MachineCommand::Advance {
            machine_id,
            expected_revision,
            to_tick,
        } => {
            writer.u8(2);
            writer.string(machine_id)?;
            writer.u64(*expected_revision);
            writer.u64(*to_tick);
        }
        MachineCommand::GrantLease {
            machine_id,
            expected_revision,
            lease,
        } => {
            writer.u8(3);
            writer.string(machine_id)?;
            writer.u64(*expected_revision);
            writer.string(&lease.lease_id)?;
            writer.string(&lease.owner_id)?;
            writer.u64(lease.start_tick);
            writer.u64(lease.end_tick);
            writer.u32(lease.max_cycles);
        }
        MachineCommand::PowerTransfer {
            network_id,
            expected_revision,
            machine_id,
            amount,
        } => {
            writer.u8(4);
            writer.string(network_id)?;
            writer.u64(*expected_revision);
            writer.string(machine_id)?;
            writer.i64(*amount);
        }
    }
    Ok(())
}

fn read_machine_command(reader: &mut Reader<'_>) -> Result<MachineCommand, WireError> {
    match reader.u8()? {
        0 => {
            let machine_id = reader.string()?;
            let expected_revision = reader.u64()?;
            let operation = match reader.u8()? {
                0 => MachineOperation::Configure {
                    settings: read_opaque(reader)?,
                },
                1 => MachineOperation::Activate,
                2 => MachineOperation::Deactivate,
                3 => MachineOperation::ClaimOutput {
                    port_id: reader.string()?,
                    resource: read_resource_key(reader)?,
                    amount: reader.u64()?,
                },
                _ => return Err(WireError::new("machine-operation", "unknown machine operation tag")),
            };
            Ok(MachineCommand::Operate {
                machine_id,
                expected_revision,
                operation,
            })
        }
        1 => Ok(MachineCommand::Transfer {
            from: read_resource_endpoint(reader)?,
            to: read_resource_endpoint(reader)?,
            resource: read_resource_key(reader)?,
            amount: reader.u64()?,
            expected_from_revision: reader.u64()?,
            expected_to_revision: reader.u64()?,
        }),
        2 => Ok(MachineCommand::Advance {
            machine_id: reader.string()?,
            expected_revision: reader.u64()?,
            to_tick: reader.u64()?,
        }),
        3 => Ok(MachineCommand::GrantLease {
            machine_id: reader.string()?,
            expected_revision: reader.u64()?,
            lease: ActivityLease {
                lease_id: reader.string()?,
                owner_id: reader.string()?,
                start_tick: reader.u64()?,
                end_tick: reader.u64()?,
                max_cycles: reader.u32()?,
            },
        }),
        4 => Ok(MachineCommand::PowerTransfer {
            network_id: reader.string()?,
            expected_revision: reader.u64()?,
            machine_id: reader.string()?,
            amount: reader.i64()?,
        }),
        _ => Err(WireError::new("machine-command", "unknown machine command tag")),
    }
}

fn write_resource_endpoint(writer: &mut Writer, value: &ResourceEndpoint) -> Result<(), WireError> {
    writer.string(&value.machine_id)?;
    writer.string(&value.port_id)
}

fn read_resource_endpoint(reader: &mut Reader<'_>) -> Result<ResourceEndpoint, WireError> {
    Ok(ResourceEndpoint {
        machine_id: reader.string()?,
        port_id: reader.string()?,
    })
}

fn write_resource_key(writer: &mut Writer, value: &ResourceKey) -> Result<(), WireError> {
    writer.u8(resource_kind_tag(value.kind));
    writer.string(&value.content_id)?;
    writer.option_u32(value.item_code);
    writer.hash(value.metadata_hash);
    Ok(())
}

fn read_resource_key(reader: &mut Reader<'_>) -> Result<ResourceKey, WireError> {
    Ok(ResourceKey {
        kind: read_resource_kind(reader)?,
        content_id: reader.string()?,
        item_code: reader.option_u32()?,
        metadata_hash: reader.hash()?,
    })
}

fn write_combat_command(writer: &mut Writer, value: &CombatCommand) -> Result<(), WireError> {
    match value {
        CombatCommand::UseAbility {
            source_id,
            expected_source_revision,
            target_id,
            expected_target_revision,
            ability_id,
            projectile_id,
            aim,
            tick,
        } => {
            writer.u8(0);
            writer.string(source_id)?;
            writer.u64(*expected_source_revision);
            writer.string(target_id)?;
            writer.u64(*expected_target_revision);
            writer.string(ability_id)?;
            writer.option_string(projectile_id.as_deref())?;
            writer.fixed_vec3(*aim);
            writer.u64(*tick);
        }
        CombatCommand::ResolveProjectile {
            projectile_id,
            expected_revision,
            target_id,
            impact,
            tick,
        } => {
            writer.u8(1);
            writer.string(projectile_id)?;
            writer.u64(*expected_revision);
            writer.option_string(target_id.as_deref())?;
            writer.fixed_vec3(*impact);
            writer.u64(*tick);
        }
        CombatCommand::Capture {
            source_id,
            creature_id,
            expected_creature_revision,
            orb_item_code,
            tick,
        } => {
            writer.u8(2);
            writer.string(source_id)?;
            writer.string(creature_id)?;
            writer.u64(*expected_creature_revision);
            writer.u32(*orb_item_code);
            writer.u64(*tick);
        }
        CombatCommand::Pacify {
            source_id,
            creature_id,
            expected_creature_revision,
            method,
            evidence,
            tick,
        } => {
            writer.u8(3);
            writer.string(source_id)?;
            writer.string(creature_id)?;
            writer.u64(*expected_creature_revision);
            writer.u8(match method {
                PacifyMethod::Outmaneuver => 0,
                PacifyMethod::LureAndCare => 1,
            });
            write_opaque(writer, evidence)?;
            writer.u64(*tick);
        }
        CombatCommand::Care {
            source_id,
            creature_id,
            expected_creature_revision,
            care_item_code,
            amount,
            tick,
        } => {
            writer.u8(4);
            writer.string(source_id)?;
            writer.string(creature_id)?;
            writer.u64(*expected_creature_revision);
            writer.u32(*care_item_code);
            writer.u16(*amount);
            writer.u64(*tick);
        }
        CombatCommand::Summon {
            source_id,
            summon_id,
            content_id,
            duration_ticks,
            grounding_item_code,
            tick,
        } => {
            writer.u8(5);
            writer.string(source_id)?;
            writer.string(summon_id)?;
            writer.string(content_id)?;
            writer.option_u32(*duration_ticks);
            writer.option_u32(*grounding_item_code);
            writer.u64(*tick);
        }
        CombatCommand::Advance { to_tick } => {
            writer.u8(6);
            writer.u64(*to_tick);
        }
    }
    Ok(())
}

fn read_combat_command(reader: &mut Reader<'_>) -> Result<CombatCommand, WireError> {
    match reader.u8()? {
        0 => Ok(CombatCommand::UseAbility {
            source_id: reader.string()?,
            expected_source_revision: reader.u64()?,
            target_id: reader.string()?,
            expected_target_revision: reader.u64()?,
            ability_id: reader.string()?,
            projectile_id: reader.option_string()?,
            aim: reader.fixed_vec3()?,
            tick: reader.u64()?,
        }),
        1 => Ok(CombatCommand::ResolveProjectile {
            projectile_id: reader.string()?,
            expected_revision: reader.u64()?,
            target_id: reader.option_string()?,
            impact: reader.fixed_vec3()?,
            tick: reader.u64()?,
        }),
        2 => Ok(CombatCommand::Capture {
            source_id: reader.string()?,
            creature_id: reader.string()?,
            expected_creature_revision: reader.u64()?,
            orb_item_code: reader.u32()?,
            tick: reader.u64()?,
        }),
        3 => Ok(CombatCommand::Pacify {
            source_id: reader.string()?,
            creature_id: reader.string()?,
            expected_creature_revision: reader.u64()?,
            method: match reader.u8()? {
                0 => PacifyMethod::Outmaneuver,
                1 => PacifyMethod::LureAndCare,
                _ => return Err(WireError::new("pacify-method", "unknown pacify method")),
            },
            evidence: read_opaque(reader)?,
            tick: reader.u64()?,
        }),
        4 => Ok(CombatCommand::Care {
            source_id: reader.string()?,
            creature_id: reader.string()?,
            expected_creature_revision: reader.u64()?,
            care_item_code: reader.u32()?,
            amount: reader.u16()?,
            tick: reader.u64()?,
        }),
        5 => Ok(CombatCommand::Summon {
            source_id: reader.string()?,
            summon_id: reader.string()?,
            content_id: reader.string()?,
            duration_ticks: reader.option_u32()?,
            grounding_item_code: reader.option_u32()?,
            tick: reader.u64()?,
        }),
        6 => Ok(CombatCommand::Advance { to_tick: reader.u64()? }),
        _ => Err(WireError::new("combat-command", "unknown combat command tag")),
    }
}

fn write_progression_command(writer: &mut Writer, value: &ProgressionCommand) -> Result<(), WireError> {
    writer.u8(progression_action_tag(value.action));
    writer.string(&value.owner_id)?;
    writer.string(&value.record_id)?;
    writer.u64(value.expected_record_revision);
    writer.string(&value.option_id)?;
    writer.u32(value.quantity);
    writer.option_string(value.currency_id.as_deref())?;
    writer.flag(value.payload.is_some());
    if let Some(payload) = &value.payload {
        write_opaque(writer, payload)?;
    }
    Ok(())
}

fn read_progression_command(reader: &mut Reader<'_>) -> Result<ProgressionCommand, WireError> {
    Ok(ProgressionCommand {
        action: read_progression_action(reader)?,
        owner_id: reader.string()?,
        record_id: reader.string()?,
        expected_record_revision: reader.u64()?,
        option_id: reader.string()?,
        quantity: reader.u32()?,
        currency_id: reader.option_string()?,
        payload: if reader.flag()? {
            Some(read_opaque(reader)?)
        } else {
            None
        },
    })
}

fn write_cardforge_command(writer: &mut Writer, value: &CardforgeCommand) -> Result<(), WireError> {
    match value {
        CardforgeCommand::OpenPack {
            record_id,
            owner_id,
            expected_revision,
        } => {
            writer.u8(0);
            writer.string(record_id)?;
            writer.string(owner_id)?;
            writer.u64(*expected_revision);
        }
        CardforgeCommand::MoveCard {
            owner_id,
            printing,
            count,
            to_archive,
            expected_custody_revision,
        } => {
            writer.u8(1);
            writer.string(owner_id)?;
            write_printing(writer, printing)?;
            writer.u32(*count);
            writer.flag(*to_archive);
            writer.u64(*expected_custody_revision);
        }
        CardforgeCommand::ArchiveDuplicate {
            owner_id,
            printing,
            keep,
            expected_custody_revision,
        } => {
            writer.u8(2);
            writer.string(owner_id)?;
            write_printing(writer, printing)?;
            writer.u32(*keep);
            writer.u64(*expected_custody_revision);
        }
        CardforgeCommand::BuildDeck {
            deck_id,
            owner_id,
            rules_id,
            cards,
            expected_revision,
        } => {
            writer.u8(3);
            writer.string(deck_id)?;
            writer.string(owner_id)?;
            writer.string(rules_id)?;
            writer.count(cards.len(), MAX_COLLECTION, "deck card count")?;
            for (printing, count) in cards {
                write_printing(writer, printing)?;
                writer.u16(*count);
            }
            writer.option_u64(*expected_revision);
        }
        CardforgeCommand::StartMatch {
            match_id,
            player_one,
            deck_one,
            player_two,
            deck_two,
        } => {
            writer.u8(4);
            writer.string(match_id)?;
            writer.string(player_one)?;
            writer.string(deck_one)?;
            writer.string(player_two)?;
            writer.string(deck_two)?;
        }
        CardforgeCommand::MatchAction {
            match_id,
            owner_id,
            expected_revision,
            action,
        } => {
            writer.u8(5);
            writer.string(match_id)?;
            writer.string(owner_id)?;
            writer.u64(*expected_revision);
            match action {
                BattleAction::Draw => writer.u8(0),
                BattleAction::Play { hand_index } => {
                    writer.u8(1);
                    writer.u16(*hand_index);
                }
                BattleAction::AttackPlayer { board_index } => {
                    writer.u8(2);
                    writer.u16(*board_index);
                }
                BattleAction::EndTurn => writer.u8(3),
                BattleAction::Concede => writer.u8(4),
            }
        }
        CardforgeCommand::ClaimReward {
            owner_id,
            reward_id,
            expected_custody_revision,
        } => {
            writer.u8(6);
            writer.string(owner_id)?;
            writer.string(reward_id)?;
            writer.u64(*expected_custody_revision);
        }
    }
    Ok(())
}

fn read_cardforge_command(reader: &mut Reader<'_>) -> Result<CardforgeCommand, WireError> {
    match reader.u8()? {
        0 => Ok(CardforgeCommand::OpenPack {
            record_id: reader.string()?,
            owner_id: reader.string()?,
            expected_revision: reader.u64()?,
        }),
        1 => Ok(CardforgeCommand::MoveCard {
            owner_id: reader.string()?,
            printing: read_printing(reader)?,
            count: reader.u32()?,
            to_archive: reader.flag()?,
            expected_custody_revision: reader.u64()?,
        }),
        2 => Ok(CardforgeCommand::ArchiveDuplicate {
            owner_id: reader.string()?,
            printing: read_printing(reader)?,
            keep: reader.u32()?,
            expected_custody_revision: reader.u64()?,
        }),
        3 => {
            let deck_id = reader.string()?;
            let owner_id = reader.string()?;
            let rules_id = reader.string()?;
            let count = reader.count(MAX_COLLECTION, "deck card count")?;
            let mut cards = BTreeMap::new();
            for _ in 0..count {
                let printing = read_printing(reader)?;
                let amount = reader.u16()?;
                if cards.insert(printing, amount).is_some() {
                    return Err(WireError::new("cardforge-deck", "deck contains duplicate printing"));
                }
            }
            Ok(CardforgeCommand::BuildDeck {
                deck_id,
                owner_id,
                rules_id,
                cards,
                expected_revision: reader.option_u64()?,
            })
        }
        4 => Ok(CardforgeCommand::StartMatch {
            match_id: reader.string()?,
            player_one: reader.string()?,
            deck_one: reader.string()?,
            player_two: reader.string()?,
            deck_two: reader.string()?,
        }),
        5 => {
            let match_id = reader.string()?;
            let owner_id = reader.string()?;
            let expected_revision = reader.u64()?;
            let action = match reader.u8()? {
                0 => BattleAction::Draw,
                1 => BattleAction::Play {
                    hand_index: reader.u16()?,
                },
                2 => BattleAction::AttackPlayer {
                    board_index: reader.u16()?,
                },
                3 => BattleAction::EndTurn,
                4 => BattleAction::Concede,
                _ => return Err(WireError::new("cardforge-action", "unknown Cardforge action")),
            };
            Ok(CardforgeCommand::MatchAction {
                match_id,
                owner_id,
                expected_revision,
                action,
            })
        }
        6 => Ok(CardforgeCommand::ClaimReward {
            owner_id: reader.string()?,
            reward_id: reader.string()?,
            expected_custody_revision: reader.u64()?,
        }),
        _ => Err(WireError::new("cardforge-command", "unknown Cardforge command tag")),
    }
}

fn write_printing(writer: &mut Writer, value: &PrintingKey) -> Result<(), WireError> {
    writer.string(&value.card_id)?;
    writer.string(&value.variant_id)?;
    writer.string(&value.finish_id)
}

fn read_printing(reader: &mut Reader<'_>) -> Result<PrintingKey, WireError> {
    Ok(PrintingKey {
        card_id: reader.string()?,
        variant_id: reader.string()?,
        finish_id: reader.string()?,
    })
}

fn write_opaque(writer: &mut Writer, value: &OpaquePayload) -> Result<(), WireError> {
    writer.string(&value.type_id)?;
    writer.u16(value.schema);
    writer.bytes(
        &value.bytes,
        blockwild_gameplay::MAX_PAYLOAD_BYTES,
        "opaque gameplay payload",
    )
}

fn read_opaque(reader: &mut Reader<'_>) -> Result<OpaquePayload, WireError> {
    Ok(OpaquePayload {
        type_id: reader.string()?,
        schema: reader.u16()?,
        bytes: reader.bytes(blockwild_gameplay::MAX_PAYLOAD_BYTES, "opaque gameplay payload")?,
    })
}

fn write_accepted_gameplay_receipt(writer: &mut Writer, value: &AcceptedReceipt) -> Result<(), WireError> {
    writer.string(&value.batch_id)?;
    write_gameplay_identity(writer, &value.before)?;
    write_gameplay_identity(writer, &value.after)?;
    writer.count(value.touched_domains.len(), 5, "touched gameplay domains")?;
    for domain in &value.touched_domains {
        writer.u8(domain_tag(*domain));
    }
    writer.count(value.resource_deltas.len(), MAX_COLLECTION, "resource delta count")?;
    for delta in &value.resource_deltas {
        writer.u32(delta.item_code);
        writer.hash(delta.metadata_hash);
        writer.i64(delta.amount);
        writer.string(&delta.reason)?;
    }
    writer.count(value.stat_deltas.len(), MAX_COLLECTION, "stat delta count")?;
    for delta in &value.stat_deltas {
        writer.string(&delta.record_id)?;
        writer.string(&delta.stat_id)?;
        writer.i64(delta.amount);
    }
    writer.count(value.events.len(), MAX_COLLECTION, "gameplay event count")?;
    for event in &value.events {
        write_gameplay_event(writer, event)?;
    }
    writer.hash(value.receipt_hash);
    Ok(())
}

fn read_accepted_gameplay_receipt(reader: &mut Reader<'_>) -> Result<AcceptedReceipt, WireError> {
    let batch_id = reader.string()?;
    let before = read_gameplay_identity(reader)?;
    let after = read_gameplay_identity(reader)?;
    let domain_count = reader.count(5, "touched gameplay domains")?;
    let mut touched_domains = BTreeSet::new();
    for _ in 0..domain_count {
        if !touched_domains.insert(read_domain(reader)?) {
            return Err(WireError::new("gameplay-receipt", "duplicate touched domain"));
        }
    }
    let resource_count = reader.count(MAX_COLLECTION, "resource delta count")?;
    let mut resource_deltas = Vec::with_capacity(resource_count);
    for _ in 0..resource_count {
        resource_deltas.push(ResourceDelta {
            item_code: reader.u32()?,
            metadata_hash: reader.hash()?,
            amount: reader.i64()?,
            reason: reader.string()?,
        });
    }
    let stat_count = reader.count(MAX_COLLECTION, "stat delta count")?;
    let mut stat_deltas = Vec::with_capacity(stat_count);
    for _ in 0..stat_count {
        stat_deltas.push(StatDelta {
            record_id: reader.string()?,
            stat_id: reader.string()?,
            amount: reader.i64()?,
        });
    }
    let event_count = reader.count(MAX_COLLECTION, "gameplay event count")?;
    let mut events = Vec::with_capacity(event_count);
    for _ in 0..event_count {
        events.push(read_gameplay_event(reader)?);
    }
    Ok(AcceptedReceipt {
        batch_id,
        before,
        after,
        touched_domains,
        resource_deltas,
        stat_deltas,
        events,
        receipt_hash: reader.hash()?,
    })
}

fn write_gameplay_event(writer: &mut Writer, value: &GameplayEvent) -> Result<(), WireError> {
    writer.string(&value.event_id)?;
    writer.string(&value.kind)?;
    writer.string(&value.actor_id)?;
    writer.option_string(value.record_id.as_deref())?;
    write_opaque(writer, &value.payload)
}

fn read_gameplay_event(reader: &mut Reader<'_>) -> Result<GameplayEvent, WireError> {
    Ok(GameplayEvent {
        event_id: reader.string()?,
        kind: reader.string()?,
        actor_id: reader.string()?,
        record_id: reader.option_string()?,
        payload: read_opaque(reader)?,
    })
}

const fn actor_role_tag(value: ActorRole) -> u8 {
    match value {
        ActorRole::Host => 0,
        ActorRole::Guest => 1,
        ActorRole::Agent => 2,
        ActorRole::System => 3,
    }
}
fn read_actor_role(reader: &mut Reader<'_>) -> Result<ActorRole, WireError> {
    match reader.u8()? {
        0 => Ok(ActorRole::Host),
        1 => Ok(ActorRole::Guest),
        2 => Ok(ActorRole::Agent),
        3 => Ok(ActorRole::System),
        _ => Err(WireError::new("actor-role", "unknown gameplay actor role")),
    }
}
const fn scope_tag(value: Scope) -> u8 {
    match value {
        Scope::InventorySelf => 0,
        Scope::InventoryAny => 1,
        Scope::Machines => 2,
        Scope::CombatSelf => 3,
        Scope::CombatAny => 4,
        Scope::ProgressionSelf => 5,
        Scope::ProgressionAny => 6,
        Scope::CardforgeSelf => 7,
        Scope::CardforgeAny => 8,
        Scope::System => 9,
    }
}
fn read_scope(reader: &mut Reader<'_>) -> Result<Scope, WireError> {
    match reader.u8()? {
        0 => Ok(Scope::InventorySelf),
        1 => Ok(Scope::InventoryAny),
        2 => Ok(Scope::Machines),
        3 => Ok(Scope::CombatSelf),
        4 => Ok(Scope::CombatAny),
        5 => Ok(Scope::ProgressionSelf),
        6 => Ok(Scope::ProgressionAny),
        7 => Ok(Scope::CardforgeSelf),
        8 => Ok(Scope::CardforgeAny),
        9 => Ok(Scope::System),
        _ => Err(WireError::new("gameplay-scope", "unknown gameplay scope")),
    }
}
const fn container_kind_tag(value: ContainerKind) -> u8 {
    match value {
        ContainerKind::Player => 0,
        ContainerKind::Equipment => 1,
        ContainerKind::Container => 2,
        ContainerKind::Machine => 3,
        ContainerKind::Waygrid => 4,
        ContainerKind::CardforgeCase => 5,
    }
}
fn read_container_kind(reader: &mut Reader<'_>) -> Result<ContainerKind, WireError> {
    match reader.u8()? {
        0 => Ok(ContainerKind::Player),
        1 => Ok(ContainerKind::Equipment),
        2 => Ok(ContainerKind::Container),
        3 => Ok(ContainerKind::Machine),
        4 => Ok(ContainerKind::Waygrid),
        5 => Ok(ContainerKind::CardforgeCase),
        _ => Err(WireError::new("container-kind", "unknown container kind")),
    }
}
const fn resource_kind_tag(value: ResourceKind) -> u8 {
    match value {
        ResourceKind::Item => 0,
        ResourceKind::Liquid => 1,
        ResourceKind::Gas => 2,
        ResourceKind::Energy => 3,
        ResourceKind::Heat => 4,
    }
}
fn read_resource_kind(reader: &mut Reader<'_>) -> Result<ResourceKind, WireError> {
    match reader.u8()? {
        0 => Ok(ResourceKind::Item),
        1 => Ok(ResourceKind::Liquid),
        2 => Ok(ResourceKind::Gas),
        3 => Ok(ResourceKind::Energy),
        4 => Ok(ResourceKind::Heat),
        _ => Err(WireError::new("resource-kind", "unknown resource kind")),
    }
}
const fn progression_action_tag(value: ProgressionAction) -> u8 {
    match value {
        ProgressionAction::UnlockPerk => 0,
        ProgressionAction::QuestChoice => 1,
        ProgressionAction::FactionChoice => 2,
        ProgressionAction::GuildAction => 3,
        ProgressionAction::Trade => 4,
        ProgressionAction::FastTravel => 5,
        ProgressionAction::DialogueChoice => 6,
        ProgressionAction::DragonTraining => 7,
        ProgressionAction::SettlementAction => 8,
        ProgressionAction::LegendaryAction => 9,
    }
}
fn read_progression_action(reader: &mut Reader<'_>) -> Result<ProgressionAction, WireError> {
    match reader.u8()? {
        0 => Ok(ProgressionAction::UnlockPerk),
        1 => Ok(ProgressionAction::QuestChoice),
        2 => Ok(ProgressionAction::FactionChoice),
        3 => Ok(ProgressionAction::GuildAction),
        4 => Ok(ProgressionAction::Trade),
        5 => Ok(ProgressionAction::FastTravel),
        6 => Ok(ProgressionAction::DialogueChoice),
        7 => Ok(ProgressionAction::DragonTraining),
        8 => Ok(ProgressionAction::SettlementAction),
        9 => Ok(ProgressionAction::LegendaryAction),
        _ => Err(WireError::new("progression-action", "unknown progression action")),
    }
}
const fn domain_tag(value: Domain) -> u8 {
    match value {
        Domain::Inventory => 0,
        Domain::Machines => 1,
        Domain::Combat => 2,
        Domain::Progression => 3,
        Domain::Cardforge => 4,
    }
}
fn read_domain(reader: &mut Reader<'_>) -> Result<Domain, WireError> {
    match reader.u8()? {
        0 => Ok(Domain::Inventory),
        1 => Ok(Domain::Machines),
        2 => Ok(Domain::Combat),
        3 => Ok(Domain::Progression),
        4 => Ok(Domain::Cardforge),
        _ => Err(WireError::new("gameplay-domain", "unknown gameplay domain")),
    }
}
const fn rejection_code_tag(value: RejectionCode) -> u8 {
    match value {
        RejectionCode::WrongWorld => 0,
        RejectionCode::StaleRevision => 1,
        RejectionCode::Duplicate => 2,
        RejectionCode::Unauthorized => 3,
        RejectionCode::InvalidCommand => 4,
        RejectionCode::InsufficientResource => 5,
        RejectionCode::InvalidTarget => 6,
        RejectionCode::Cooldown => 7,
        RejectionCode::RulesRejected => 8,
        RejectionCode::Capacity => 9,
        RejectionCode::Conflict => 10,
    }
}
fn read_rejection_code(reader: &mut Reader<'_>) -> Result<RejectionCode, WireError> {
    match reader.u8()? {
        0 => Ok(RejectionCode::WrongWorld),
        1 => Ok(RejectionCode::StaleRevision),
        2 => Ok(RejectionCode::Duplicate),
        3 => Ok(RejectionCode::Unauthorized),
        4 => Ok(RejectionCode::InvalidCommand),
        5 => Ok(RejectionCode::InsufficientResource),
        6 => Ok(RejectionCode::InvalidTarget),
        7 => Ok(RejectionCode::Cooldown),
        8 => Ok(RejectionCode::RulesRejected),
        9 => Ok(RejectionCode::Capacity),
        10 => Ok(RejectionCode::Conflict),
        _ => Err(WireError::new("gameplay-rejection", "unknown gameplay rejection code")),
    }
}

pub fn encode_entity_command_batch_v1(value: &EntityCommandBatch) -> Result<Vec<u8>, WireError> {
    let mut writer = Writer::default();
    writer.u64(value.sequence);
    writer.u64(value.expected_revision);
    writer.u64(value.tick);
    writer.count(value.commands.len(), 256, "entity command count")?;
    for command in &value.commands {
        write_entity_command(&mut writer, command)?;
    }
    wrap(ENTITY_COMMAND_MAGIC, writer.finish())
}

pub fn decode_entity_command_batch_v1(bytes: &[u8]) -> Result<EntityCommandBatch, WireError> {
    let mut reader = Reader::new(unwrap(ENTITY_COMMAND_MAGIC, bytes)?);
    let sequence = reader.u64()?;
    let expected_revision = reader.u64()?;
    let tick = reader.u64()?;
    let count = reader.count(256, "entity command count")?;
    let mut commands = Vec::with_capacity(count);
    for _ in 0..count {
        commands.push(read_entity_command(&mut reader)?);
    }
    reader.finish()?;
    Ok(EntityCommandBatch {
        schema: blockwild_entity::ENTITY_COMMAND_SCHEMA,
        sequence,
        expected_revision,
        tick,
        commands,
    })
}

pub fn encode_entity_event_batch_v1(value: &EntityEventBatch) -> Result<Vec<u8>, WireError> {
    let mut writer = Writer::default();
    writer.u64(value.sequence);
    writer.u64(value.previous_revision);
    writer.u64(value.revision);
    writer.count(value.events.len(), 256, "entity event count")?;
    for event in &value.events {
        writer.u32(event.command_index);
        writer.u64(event.entity_id.packed());
        match event.kind {
            EntityEventKind::Spawned { residency } => {
                writer.u8(0);
                writer.u8(residency as u8);
            }
            EntityEventKind::Despawned { reason } => {
                writer.u8(1);
                writer.u8(reason as u8);
            }
            EntityEventKind::ResidencyChanged(residency) => {
                writer.u8(2);
                writer.u8(residency as u8);
            }
            EntityEventKind::MotionUpdated => writer.u8(3),
            EntityEventKind::TierChanged(tier) => {
                writer.u8(4);
                writer.u8(tier as u8);
            }
            EntityEventKind::ProtectionChanged => writer.u8(5),
        }
    }
    wrap(ENTITY_RECEIPT_MAGIC, writer.finish())
}

pub fn decode_entity_event_batch_v1(bytes: &[u8]) -> Result<EntityEventBatch, WireError> {
    let mut reader = Reader::new(unwrap(ENTITY_RECEIPT_MAGIC, bytes)?);
    let sequence = reader.u64()?;
    let previous_revision = reader.u64()?;
    let revision = reader.u64()?;
    let count = reader.count(256, "entity event count")?;
    let mut events = Vec::with_capacity(count);
    for _ in 0..count {
        let command_index = reader.u32()?;
        let entity_id = unpack_entity_id(reader.u64()?)?;
        let kind = match reader.u8()? {
            0 => EntityEventKind::Spawned {
                residency: read_residency(&mut reader)?,
            },
            1 => EntityEventKind::Despawned {
                reason: read_despawn_reason(&mut reader)?,
            },
            2 => EntityEventKind::ResidencyChanged(read_residency(&mut reader)?),
            3 => EntityEventKind::MotionUpdated,
            4 => EntityEventKind::TierChanged(read_tier(&mut reader)?),
            5 => EntityEventKind::ProtectionChanged,
            _ => return Err(WireError::new("entity-event", "unknown entity event tag")),
        };
        events.push(blockwild_entity::EntityEvent {
            command_index,
            entity_id,
            kind,
        });
    }
    reader.finish()?;
    Ok(EntityEventBatch {
        schema: blockwild_entity::ENTITY_COMMAND_SCHEMA,
        sequence,
        previous_revision,
        revision,
        events,
    })
}

fn write_entity_command(writer: &mut Writer, command: &EntityCommand) -> Result<(), WireError> {
    match command {
        EntityCommand::Spawn { record, residency } => {
            writer.u8(0);
            write_entity_record(writer, record)?;
            writer.u8(*residency as u8);
        }
        EntityCommand::SpawnAt { id, record, residency } => {
            writer.u8(1);
            writer.u64(id.packed());
            write_entity_record(writer, record)?;
            writer.u8(*residency as u8);
        }
        EntityCommand::Despawn { id, reason } => {
            writer.u8(2);
            writer.u64(id.packed());
            writer.u8(*reason as u8);
        }
        EntityCommand::Hibernate { id } => {
            writer.u8(3);
            writer.u64(id.packed());
        }
        EntityCommand::Wake { id, tier } => {
            writer.u8(4);
            writer.u64(id.packed());
            writer.u8(*tier as u8);
        }
        EntityCommand::UpdateMotion {
            id,
            position,
            yaw,
            velocity,
        } => {
            writer.u8(5);
            writer.u64(id.packed());
            writer.entity_vec3(*position);
            writer.f32(*yaw);
            writer.entity_vec3(*velocity);
        }
        EntityCommand::SetSimulationTier { id, tier } => {
            writer.u8(6);
            writer.u64(id.packed());
            writer.u8(*tier as u8);
        }
        EntityCommand::SetProtection { id, protection } => {
            writer.u8(7);
            writer.u64(id.packed());
            writer.u64(protection.bits());
        }
    }
    Ok(())
}

fn read_entity_command(reader: &mut Reader<'_>) -> Result<EntityCommand, WireError> {
    match reader.u8()? {
        0 => Ok(EntityCommand::Spawn {
            record: read_entity_record(reader)?,
            residency: read_residency(reader)?,
        }),
        1 => Ok(EntityCommand::SpawnAt {
            id: unpack_entity_id(reader.u64()?)?,
            record: read_entity_record(reader)?,
            residency: read_residency(reader)?,
        }),
        2 => Ok(EntityCommand::Despawn {
            id: unpack_entity_id(reader.u64()?)?,
            reason: read_despawn_reason(reader)?,
        }),
        3 => Ok(EntityCommand::Hibernate {
            id: unpack_entity_id(reader.u64()?)?,
        }),
        4 => Ok(EntityCommand::Wake {
            id: unpack_entity_id(reader.u64()?)?,
            tier: read_tier(reader)?,
        }),
        5 => Ok(EntityCommand::UpdateMotion {
            id: unpack_entity_id(reader.u64()?)?,
            position: reader.entity_vec3()?,
            yaw: reader.f32()?,
            velocity: reader.entity_vec3()?,
        }),
        6 => Ok(EntityCommand::SetSimulationTier {
            id: unpack_entity_id(reader.u64()?)?,
            tier: read_tier(reader)?,
        }),
        7 => Ok(EntityCommand::SetProtection {
            id: unpack_entity_id(reader.u64()?)?,
            protection: ProtectionState::from_bits(reader.u64()?),
        }),
        _ => Err(WireError::new("entity-command", "unknown entity command tag")),
    }
}

fn write_entity_record(writer: &mut Writer, value: &EntityCompatibilityRecord) -> Result<(), WireError> {
    value
        .validate()
        .map_err(|error| WireError::new("entity-record", error.to_string()))?;
    writer.string(&value.external_entity_id)?;
    writer.option_u64(value.legacy_numeric_id);
    writer.string(&value.specimen_id)?;
    writer.string(&value.kind_key)?;
    writer.u8(value.class as u8);
    writer.option_string(value.variant_key.as_deref())?;
    writer.option_string(value.name.as_deref())?;
    writer.u64(value.location_id.packed());
    writer.entity_vec3(value.position);
    writer.f32(value.yaw);
    writer.entity_vec3(value.velocity);
    writer.f32(value.health);
    writer.f32(value.maximum_health);
    writer.u64(value.age_ticks);
    writer.flag(value.natural_spawned);
    writer.flag(value.ever_led);
    writer.option_string(value.owner_id.as_deref())?;
    writer.flag(value.tamed);
    writer.u32(value.bond_points);
    writer.string(&value.bond_tier)?;
    writer.option_string(value.social_group_id.as_deref())?;
    writer.option_string(value.faction_id.as_deref())?;
    writer.option_string(value.settlement_id.as_deref())?;
    writer.string_map(&value.equipment)?;
    writer.u32_map(&value.research)?;
    writer.string_map(&value.custom)
}

fn read_entity_record(reader: &mut Reader<'_>) -> Result<EntityCompatibilityRecord, WireError> {
    let external_entity_id = reader.string()?;
    let legacy_numeric_id = reader.option_u64()?;
    let specimen_id = reader.string()?;
    let kind_key = reader.string()?;
    let class = match reader.u8()? {
        0 => EntityClass::Creature,
        1 => EntityClass::Player,
        2 => EntityClass::Sentient,
        3 => EntityClass::Construct,
        4 => EntityClass::Projectile,
        5 => EntityClass::Vehicle,
        _ => return Err(WireError::new("entity-class", "unknown entity class")),
    };
    let variant_key = reader.option_string()?;
    let name = reader.option_string()?;
    let location_id = unpack_location_id(reader.u64()?)?;
    let position = reader.entity_vec3()?;
    let yaw = reader.f32()?;
    let velocity = reader.entity_vec3()?;
    let health = reader.f32()?;
    let maximum_health = reader.f32()?;
    let age_ticks = reader.u64()?;
    let natural_spawned = reader.flag()?;
    let ever_led = reader.flag()?;
    let owner_id = reader.option_string()?;
    let tamed = reader.flag()?;
    let bond_points = reader.u32()?;
    let bond_tier = reader.string()?;
    let social_group_id = reader.option_string()?;
    let faction_id = reader.option_string()?;
    let settlement_id = reader.option_string()?;
    let equipment = reader.string_map()?;
    let research = reader.u32_map()?;
    let custom = reader.string_map()?;
    let value = EntityCompatibilityRecord {
        schema: blockwild_entity::ENTITY_COMPATIBILITY_SCHEMA,
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
    value
        .validate()
        .map_err(|error| WireError::new("entity-record", error.to_string()))?;
    Ok(value)
}

fn read_residency(reader: &mut Reader<'_>) -> Result<EntityResidency, WireError> {
    match reader.u8()? {
        0 => Ok(EntityResidency::Hot),
        1 => Ok(EntityResidency::Cold),
        _ => Err(WireError::new("entity-residency", "unknown entity residency")),
    }
}

fn read_tier(reader: &mut Reader<'_>) -> Result<SimulationTier, WireError> {
    match reader.u8()? {
        0 => Ok(SimulationTier::Hero),
        1 => Ok(SimulationTier::Nearby),
        2 => Ok(SimulationTier::Coarse),
        3 => Ok(SimulationTier::Dormant),
        _ => Err(WireError::new("entity-tier", "unknown simulation tier")),
    }
}

fn read_despawn_reason(reader: &mut Reader<'_>) -> Result<DespawnReason, WireError> {
    match reader.u8()? {
        0 => Ok(DespawnReason::NaturalRange),
        1 => Ok(DespawnReason::Defeated),
        2 => Ok(DespawnReason::Captured),
        3 => Ok(DespawnReason::Released),
        4 => Ok(DespawnReason::Admin),
        _ => Err(WireError::new("entity-despawn", "unknown despawn reason")),
    }
}

fn unpack_entity_id(value: u64) -> Result<EntityId, WireError> {
    let result = EntityId::new(value as u32, (value >> 32) as u32);
    if result.packed() == 0 {
        Err(WireError::new("entity-id", "zero entity id is reserved"))
    } else {
        Ok(result)
    }
}

fn unpack_location_id(value: u64) -> Result<LocationId, WireError> {
    let result = LocationId::new(value as u32, (value >> 32) as u32);
    if result.packed() == 0 {
        Err(WireError::new("location-id", "zero location id is reserved"))
    } else {
        Ok(result)
    }
}

fn wrap(magic: [u8; 4], body: Vec<u8>) -> Result<Vec<u8>, WireError> {
    if body.len() > MAX_DOMAIN_PAYLOAD_BYTES.saturating_sub(DOMAIN_HEADER_BYTES) {
        return Err(WireError::new(
            "domain-size",
            "native domain payload exceeds its byte budget",
        ));
    }
    let mut output = Vec::with_capacity(DOMAIN_HEADER_BYTES + body.len());
    output.extend_from_slice(&magic);
    output.extend_from_slice(&DOMAIN_PROTOCOL_V1.to_le_bytes());
    output.extend_from_slice(&DOMAIN_SCHEMA_V1.to_le_bytes());
    output.extend_from_slice(&(body.len() as u32).to_le_bytes());
    output.extend_from_slice(&wire_checksum_v1(&body));
    output.extend_from_slice(&body);
    Ok(output)
}

fn unwrap(magic: [u8; 4], bytes: &[u8]) -> Result<&[u8], WireError> {
    if bytes.len() < DOMAIN_HEADER_BYTES || bytes.len() > MAX_DOMAIN_PAYLOAD_BYTES {
        return Err(WireError::new(
            "domain-size",
            "native domain packet is outside its byte budget",
        ));
    }
    if bytes[..4] != magic {
        return Err(WireError::new("domain-magic", "native domain packet magic mismatch"));
    }
    if u16::from_le_bytes(bytes[4..6].try_into().expect("fixed slice")) != DOMAIN_PROTOCOL_V1
        || u16::from_le_bytes(bytes[6..8].try_into().expect("fixed slice")) != DOMAIN_SCHEMA_V1
    {
        return Err(WireError::new(
            "domain-version",
            "unsupported native domain packet version",
        ));
    }
    let length = u32::from_le_bytes(bytes[8..12].try_into().expect("fixed slice")) as usize;
    if length != bytes.len() - DOMAIN_HEADER_BYTES {
        return Err(WireError::new("domain-length", "native domain packet length mismatch"));
    }
    let body = &bytes[DOMAIN_HEADER_BYTES..];
    if bytes[12..28] != wire_checksum_v1(body) {
        return Err(WireError::new(
            "domain-checksum",
            "native domain packet checksum mismatch",
        ));
    }
    Ok(body)
}

#[derive(Default)]
struct Writer {
    bytes: Vec<u8>,
}

impl Writer {
    fn u8(&mut self, value: u8) {
        self.bytes.push(value);
    }
    fn flag(&mut self, value: bool) {
        self.u8(u8::from(value));
    }
    fn u16(&mut self, value: u16) {
        self.bytes.extend_from_slice(&value.to_le_bytes());
    }
    fn u32(&mut self, value: u32) {
        self.bytes.extend_from_slice(&value.to_le_bytes());
    }
    fn u64(&mut self, value: u64) {
        self.bytes.extend_from_slice(&value.to_le_bytes());
    }
    fn i32(&mut self, value: i32) {
        self.bytes.extend_from_slice(&value.to_le_bytes());
    }
    fn i64(&mut self, value: i64) {
        self.bytes.extend_from_slice(&value.to_le_bytes());
    }
    fn f32(&mut self, value: f32) {
        self.u32(value.to_bits());
    }
    fn f64(&mut self, value: f64) {
        self.u64(value.to_bits());
    }
    fn hash(&mut self, value: CanonicalHash) {
        self.bytes.extend_from_slice(value.as_bytes());
    }
    fn bytes(&mut self, value: &[u8], maximum: usize, label: &str) -> Result<(), WireError> {
        if value.len() > maximum || value.len() > u32::MAX as usize {
            return Err(WireError::new(
                "domain-size",
                format!("{label} exceeds its byte budget"),
            ));
        }
        self.u32(value.len() as u32);
        self.bytes.extend_from_slice(value);
        Ok(())
    }
    fn string(&mut self, value: &str) -> Result<(), WireError> {
        if value.is_empty() || value.len() > MAX_STRING_BYTES || value.chars().any(char::is_control) {
            return Err(WireError::new("domain-string", "native domain string is malformed"));
        }
        self.bytes(value.as_bytes(), MAX_STRING_BYTES, "domain string")
    }
    fn option_string(&mut self, value: Option<&str>) -> Result<(), WireError> {
        self.flag(value.is_some());
        if let Some(value) = value {
            self.string(value)?;
        }
        Ok(())
    }
    fn option_u32(&mut self, value: Option<u32>) {
        self.flag(value.is_some());
        if let Some(value) = value {
            self.u32(value);
        }
    }
    fn option_u64(&mut self, value: Option<u64>) {
        self.flag(value.is_some());
        if let Some(value) = value {
            self.u64(value);
        }
    }
    fn option_player_id(&mut self, value: Option<PlayerId>) {
        self.flag(value.is_some());
        if let Some(value) = value {
            self.u64(value.packed());
        }
    }
    fn option_entity_id(&mut self, value: Option<EntityId>) {
        self.flag(value.is_some());
        if let Some(value) = value {
            self.u64(value.packed());
        }
    }
    fn count(&mut self, count: usize, maximum: usize, label: &str) -> Result<(), WireError> {
        if count > maximum || count > u32::MAX as usize {
            return Err(WireError::new("domain-count", format!("{label} exceeds its budget")));
        }
        self.u32(count as u32);
        Ok(())
    }
    fn entity_vec3(&mut self, value: EntityVec3) {
        self.f32(value.x);
        self.f32(value.y);
        self.f32(value.z);
    }
    fn fixed_vec3(&mut self, value: FixedVec3) {
        self.i32(value.x_milli);
        self.i32(value.y_milli);
        self.i32(value.z_milli);
    }
    fn string_map(&mut self, values: &BTreeMap<String, String>) -> Result<(), WireError> {
        self.count(values.len(), MAX_MAP_ENTRIES, "string map")?;
        for (key, value) in values {
            self.string(key)?;
            self.string(value)?;
        }
        Ok(())
    }
    fn u32_map(&mut self, values: &BTreeMap<String, u32>) -> Result<(), WireError> {
        self.count(values.len(), MAX_MAP_ENTRIES, "integer map")?;
        for (key, value) in values {
            self.string(key)?;
            self.u32(*value);
        }
        Ok(())
    }
    fn finish(self) -> Vec<u8> {
        self.bytes
    }
}

struct Reader<'a> {
    bytes: &'a [u8],
    offset: usize,
}

impl<'a> Reader<'a> {
    const fn new(bytes: &'a [u8]) -> Self {
        Self { bytes, offset: 0 }
    }
    fn take(&mut self, length: usize) -> Result<&'a [u8], WireError> {
        let end = self
            .offset
            .checked_add(length)
            .ok_or_else(|| WireError::new("domain-truncated", "native domain offset overflow"))?;
        let value = self
            .bytes
            .get(self.offset..end)
            .ok_or_else(|| WireError::new("domain-truncated", "native domain packet is truncated"))?;
        self.offset = end;
        Ok(value)
    }
    fn u8(&mut self) -> Result<u8, WireError> {
        Ok(self.take(1)?[0])
    }
    fn flag(&mut self) -> Result<bool, WireError> {
        match self.u8()? {
            0 => Ok(false),
            1 => Ok(true),
            _ => Err(WireError::new("domain-flag", "native domain flag is not boolean")),
        }
    }
    fn u16(&mut self) -> Result<u16, WireError> {
        Ok(u16::from_le_bytes(self.take(2)?.try_into().expect("fixed slice")))
    }
    fn u32(&mut self) -> Result<u32, WireError> {
        Ok(u32::from_le_bytes(self.take(4)?.try_into().expect("fixed slice")))
    }
    fn u64(&mut self) -> Result<u64, WireError> {
        Ok(u64::from_le_bytes(self.take(8)?.try_into().expect("fixed slice")))
    }
    fn i32(&mut self) -> Result<i32, WireError> {
        Ok(i32::from_le_bytes(self.take(4)?.try_into().expect("fixed slice")))
    }
    fn i64(&mut self) -> Result<i64, WireError> {
        Ok(i64::from_le_bytes(self.take(8)?.try_into().expect("fixed slice")))
    }
    fn f32(&mut self) -> Result<f32, WireError> {
        let value = f32::from_bits(self.u32()?);
        if !value.is_finite() {
            return Err(WireError::new("domain-number", "native domain f32 is not finite"));
        }
        Ok(value)
    }
    fn f64(&mut self) -> Result<f64, WireError> {
        let value = f64::from_bits(self.u64()?);
        if !value.is_finite() {
            return Err(WireError::new("domain-number", "native domain f64 is not finite"));
        }
        Ok(value)
    }
    fn hash(&mut self) -> Result<CanonicalHash, WireError> {
        Ok(CanonicalHash(self.take(16)?.try_into().expect("fixed slice")))
    }
    fn bytes(&mut self, maximum: usize, label: &str) -> Result<Vec<u8>, WireError> {
        let length = self.u32()? as usize;
        if length > maximum {
            return Err(WireError::new(
                "domain-size",
                format!("{label} exceeds its byte budget"),
            ));
        }
        Ok(self.take(length)?.to_vec())
    }
    fn string(&mut self) -> Result<String, WireError> {
        let value = String::from_utf8(self.bytes(MAX_STRING_BYTES, "domain string")?)
            .map_err(|_| WireError::new("domain-utf8", "native domain string is not UTF-8"))?;
        if value.is_empty() || value.chars().any(char::is_control) {
            return Err(WireError::new("domain-string", "native domain string is malformed"));
        }
        Ok(value)
    }
    fn option_string(&mut self) -> Result<Option<String>, WireError> {
        if self.flag()? {
            Ok(Some(self.string()?))
        } else {
            Ok(None)
        }
    }
    fn option_u32(&mut self) -> Result<Option<u32>, WireError> {
        if self.flag()? { Ok(Some(self.u32()?)) } else { Ok(None) }
    }
    fn option_u64(&mut self) -> Result<Option<u64>, WireError> {
        if self.flag()? { Ok(Some(self.u64()?)) } else { Ok(None) }
    }
    fn option_player_id(&mut self) -> Result<Option<PlayerId>, WireError> {
        if self.flag()? {
            Ok(Some(player_id_from_packed(self.u64()?)))
        } else {
            Ok(None)
        }
    }
    fn option_entity_id(&mut self) -> Result<Option<EntityId>, WireError> {
        if self.flag()? {
            Ok(Some(entity_id_from_packed(self.u64()?)))
        } else {
            Ok(None)
        }
    }
    fn count(&mut self, maximum: usize, label: &str) -> Result<usize, WireError> {
        let count = self.u32()? as usize;
        if count > maximum {
            return Err(WireError::new("domain-count", format!("{label} exceeds its budget")));
        }
        Ok(count)
    }
    fn entity_vec3(&mut self) -> Result<EntityVec3, WireError> {
        Ok(EntityVec3::new(self.f32()?, self.f32()?, self.f32()?))
    }
    fn fixed_vec3(&mut self) -> Result<FixedVec3, WireError> {
        Ok(FixedVec3 {
            x_milli: self.i32()?,
            y_milli: self.i32()?,
            z_milli: self.i32()?,
        })
    }
    fn string_map(&mut self) -> Result<BTreeMap<String, String>, WireError> {
        let count = self.count(MAX_MAP_ENTRIES, "string map")?;
        let mut result = BTreeMap::new();
        for _ in 0..count {
            let key = self.string()?;
            let value = self.string()?;
            if result.insert(key, value).is_some() {
                return Err(WireError::new("domain-map", "native domain map contains duplicate key"));
            }
        }
        Ok(result)
    }
    fn u32_map(&mut self) -> Result<BTreeMap<String, u32>, WireError> {
        let count = self.count(MAX_MAP_ENTRIES, "integer map")?;
        let mut result = BTreeMap::new();
        for _ in 0..count {
            let key = self.string()?;
            let value = self.u32()?;
            if result.insert(key, value).is_some() {
                return Err(WireError::new("domain-map", "native domain map contains duplicate key"));
            }
        }
        Ok(result)
    }
    fn finish(&self) -> Result<(), WireError> {
        if self.offset == self.bytes.len() {
            Ok(())
        } else {
            Err(WireError::new(
                "domain-trailing",
                "native domain packet has trailing bytes",
            ))
        }
    }
}

fn player_id_from_packed(value: u64) -> PlayerId {
    PlayerId::new(value as u32, (value >> 32) as u32)
}

fn entity_id_from_packed(value: u64) -> EntityId {
    EntityId::new(value as u32, (value >> 32) as u32)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn entity_wire_round_trips_high_bytes_and_rejects_corruption() {
        let mut record = EntityCompatibilityRecord::new("mob:é߿", "specimen:1", "frostquill");
        record.location_id = LocationId::new(1, 1);
        record.variant_key = Some("aurora".into());
        record.custom.insert("binary-label".into(), "é��".into());
        let batch = EntityCommandBatch {
            schema: blockwild_entity::ENTITY_COMMAND_SCHEMA,
            sequence: 7,
            expected_revision: 0,
            tick: 11,
            commands: vec![EntityCommand::Spawn {
                record,
                residency: EntityResidency::Hot,
            }],
        };
        let encoded = encode_entity_command_batch_v1(&batch).unwrap();
        assert_eq!(decode_entity_command_batch_v1(&encoded).unwrap(), batch);
        assert!(encoded.iter().any(|byte| *byte >= 0x80));
        let mut corrupt = encoded;
        *corrupt.last_mut().unwrap() ^= 0x80;
        assert_eq!(
            decode_entity_command_batch_v1(&corrupt).unwrap_err().code,
            "domain-checksum"
        );
    }

    #[test]
    fn persistence_dispatch_wire_round_trips_high_utf8_and_rejects_corruption() {
        let command = RuntimePersistenceDispatchWireV1::Estimate {
            world_id: "wørld".into(),
        };
        let encoded = encode_runtime_persistence_dispatch_v1(&command).unwrap();
        assert_eq!(
            encoded.iter().map(|byte| format!("{byte:02x}")).collect::<String>(),
            "42574438010001000b0000005df174d7207aef3588f6935cac2b6c8e060600000077c3b8726c64",
        );
        assert!(encoded.iter().any(|byte| *byte >= 0x80));
        assert_eq!(decode_runtime_persistence_dispatch_v1(&encoded).unwrap(), command);
        let mut corrupt = encoded;
        *corrupt.last_mut().unwrap() ^= 0x80;
        assert_eq!(
            decode_runtime_persistence_dispatch_v1(&corrupt).unwrap_err().code,
            "domain-checksum"
        );
    }
}
