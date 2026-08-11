use std::collections::{BTreeMap, BTreeSet, VecDeque};

use blockwild_types::{CanonicalHash, CanonicalHasher};

use crate::{
    NETWORK_MAX_SAFE_INTEGER_V1, NetworkAuthorityIdentityV1, NetworkAuthorityV1, NetworkCommandReceiptV1,
    NetworkCommandV1, NetworkError, NetworkErrorCode, NetworkPeerKindV1, NetworkReceiptStatusV1,
};

pub const AGENT_PLATFORM_SCHEMA_VERSION_V1: u16 = 1;
pub const AGENT_PROTOCOL_VERSION_V1: u16 = 1;
pub const AGENT_MAX_COMMAND_BYTES_V1: usize = 128 * 1024;
pub const AGENT_MAX_OBSERVATION_BYTES_V1: usize = 256 * 1024;
pub const AGENT_MAX_BUILD_CELLS_V1: u16 = 2_048;
pub const AGENT_MAX_TASKS_V1: usize = 128;
pub const AGENT_MAX_NEARBY_V1: usize = 4_096;
pub const AGENT_MAX_WORK_QUEUE_V1: usize = 256;
pub const AGENT_MAX_QUEUED_WORK_UNITS_V1: u32 = 65_536;

macro_rules! string_enum {
    ($name:ident, $($variant:ident = $value:literal),+ $(,)?) => {
        #[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
        #[repr(u8)]
        pub enum $name { $($variant),+ }

        impl $name {
            #[must_use]
            pub const fn as_str(self) -> &'static str {
                match self { $(Self::$variant => $value),+ }
            }

            pub fn from_wire(value: u8) -> Option<Self> {
                const VALUES: &[$name] = &[$($name::$variant),+];
                VALUES.get(value as usize).copied()
            }
        }
    };
}

string_enum!(
    AgentCapabilityV1,
    ObserveWorld = "observe.world",
    MoveSelf = "move.self",
    InteractBasic = "interact.basic",
    InventorySelfRead = "inventory.self.read",
    InventorySelfWrite = "inventory.self.write",
    ContainerRead = "container.read",
    ContainerWrite = "container.write",
    PlayerLocationRead = "player.location.read",
    PlayerInventoryRead = "player.inventory.read",
    Build = "build",
    Harvest = "harvest",
    ChatSend = "chat.send",
    VoiceSend = "voice.send",
    Diagnostics = "diagnostics",
    WorldAdmin = "world.admin",
);

pub const AGENT_CAPABILITY_ORDER_V1: [AgentCapabilityV1; 15] = [
    AgentCapabilityV1::ObserveWorld,
    AgentCapabilityV1::MoveSelf,
    AgentCapabilityV1::InteractBasic,
    AgentCapabilityV1::InventorySelfRead,
    AgentCapabilityV1::InventorySelfWrite,
    AgentCapabilityV1::ContainerRead,
    AgentCapabilityV1::ContainerWrite,
    AgentCapabilityV1::PlayerLocationRead,
    AgentCapabilityV1::PlayerInventoryRead,
    AgentCapabilityV1::Build,
    AgentCapabilityV1::Harvest,
    AgentCapabilityV1::ChatSend,
    AgentCapabilityV1::VoiceSend,
    AgentCapabilityV1::Diagnostics,
    AgentCapabilityV1::WorldAdmin,
];

string_enum!(
    AgentCommandKindV1,
    SessionStatus = "session.status",
    SessionPause = "session.pause",
    SessionResume = "session.resume",
    SessionStop = "session.stop",
    CapabilitiesList = "capabilities.list",
    Observe = "observe",
    InspectArea = "inspect_area",
    InspectTarget = "inspect_target",
    WikiLookup = "wiki_lookup",
    BestiaryLookup = "bestiary_lookup",
    RecipeLookup = "recipe_lookup",
    MoveTo = "move_to",
    MoveRelative = "move_relative",
    FollowPlayer = "follow_player",
    Face = "face",
    Wait = "wait",
    Stop = "stop",
    ChatRead = "chat_read",
    ChatSend = "chat_send",
    Speak = "speak",
    Emote = "emote",
    InventoryGet = "inventory_get",
    InventoryMove = "inventory_move",
    InventoryDrop = "inventory_drop",
    AgentInventoryOpenForHost = "agent_inventory_open_for_host",
    Interact = "interact",
    OpenContainer = "open_container",
    ContainerGet = "container_get",
    ContainerTransfer = "container_transfer",
    UseWorkstation = "use_workstation",
    HarvestArea = "harvest_area",
    GatherResource = "gather_resource",
    BuildPlan = "build_plan",
    BuildCommit = "build_commit",
    BuildCancel = "build_cancel",
    MemoryPin = "memory_pin",
    MemoryList = "memory_list",
    MemoryRemove = "memory_remove",
    TaskPin = "task_pin",
    TaskUpdate = "task_update",
    WaypointPin = "waypoint_pin",
    WorldList = "world_list",
    WorldCreate = "world_create",
    WorldLoad = "world_load",
    WorldExport = "world_export",
    WorldDelete = "world_delete",
    DiagnosticsStart = "diagnostics_start",
    DiagnosticsStop = "diagnostics_stop",
    DiagnosticsExport = "diagnostics_export",
);

impl AgentCommandKindV1 {
    #[must_use]
    pub const fn required_capability(self) -> Option<AgentCapabilityV1> {
        match self {
            Self::Observe
            | Self::InspectArea
            | Self::InspectTarget
            | Self::WikiLookup
            | Self::BestiaryLookup
            | Self::RecipeLookup
            | Self::TaskPin
            | Self::TaskUpdate
            | Self::WaypointPin => Some(AgentCapabilityV1::ObserveWorld),
            Self::MoveTo | Self::MoveRelative | Self::FollowPlayer | Self::Face | Self::Wait | Self::Stop => {
                Some(AgentCapabilityV1::MoveSelf)
            }
            Self::ChatSend | Self::Emote => Some(AgentCapabilityV1::ChatSend),
            Self::Speak => Some(AgentCapabilityV1::VoiceSend),
            Self::InventoryGet | Self::AgentInventoryOpenForHost => Some(AgentCapabilityV1::InventorySelfRead),
            Self::InventoryMove | Self::InventoryDrop => Some(AgentCapabilityV1::InventorySelfWrite),
            Self::OpenContainer | Self::ContainerGet => Some(AgentCapabilityV1::ContainerRead),
            Self::ContainerTransfer => Some(AgentCapabilityV1::ContainerWrite),
            Self::Interact | Self::UseWorkstation => Some(AgentCapabilityV1::InteractBasic),
            Self::HarvestArea | Self::GatherResource => Some(AgentCapabilityV1::Harvest),
            Self::BuildPlan | Self::BuildCommit | Self::BuildCancel => Some(AgentCapabilityV1::Build),
            Self::WorldList | Self::WorldCreate | Self::WorldLoad | Self::WorldExport | Self::WorldDelete => {
                Some(AgentCapabilityV1::WorldAdmin)
            }
            Self::DiagnosticsStart | Self::DiagnosticsStop | Self::DiagnosticsExport => {
                Some(AgentCapabilityV1::Diagnostics)
            }
            Self::SessionStatus
            | Self::SessionPause
            | Self::SessionResume
            | Self::SessionStop
            | Self::CapabilitiesList
            | Self::ChatRead
            | Self::MemoryPin
            | Self::MemoryList
            | Self::MemoryRemove => None,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AgentLifecycleStatusV1 {
    Pending,
    Approved,
    Paused,
    Revoked,
    Disconnected,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AgentCapabilityGrantV1 {
    pub agent_id: String,
    pub peer_id: String,
    pub connection_id: String,
    pub status: AgentLifecycleStatusV1,
    pub requested: Vec<AgentCapabilityV1>,
    pub granted: Vec<AgentCapabilityV1>,
    pub expires_at: u64,
}

impl AgentCapabilityGrantV1 {
    pub fn validate(&self) -> Result<(), NetworkError> {
        for value in [&self.agent_id, &self.peer_id, &self.connection_id] {
            if value.is_empty() || value.encode_utf16().count() > 128 {
                return Err(NetworkError::new(
                    NetworkErrorCode::InvalidLabel,
                    "agent grant identity is invalid",
                ));
            }
        }
        if self.expires_at > NETWORK_MAX_SAFE_INTEGER_V1 {
            return Err(NetworkError::new(
                NetworkErrorCode::InvalidInteger,
                "agent grant expiry exceeds safe range",
            ));
        }
        if normalize_agent_capabilities(&self.requested) != self.requested
            || normalize_agent_capabilities(&self.granted) != self.granted
            || self
                .granted
                .iter()
                .any(|capability| !self.requested.contains(capability))
        {
            return Err(NetworkError::new(
                NetworkErrorCode::InvalidEnum,
                "agent capability grant is not canonical",
            ));
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AgentWorkCommandV1 {
    pub schema_version: u16,
    pub protocol_version: u16,
    pub command_id: String,
    pub agent_id: String,
    pub kind: AgentCommandKindV1,
    pub expected_world_revision: u64,
    pub issued_at: u64,
    pub expires_at: u64,
    pub work_units: u16,
    pub task_id: Option<String>,
    pub arguments: Vec<u8>,
    pub command_hash: CanonicalHash,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AgentWorkCommandSourceV1 {
    pub command_id: String,
    pub agent_id: String,
    pub kind: AgentCommandKindV1,
    pub expected_world_revision: u64,
    pub issued_at: u64,
    pub expires_at: u64,
    pub work_units: u16,
    pub task_id: Option<String>,
    pub arguments: Vec<u8>,
}

impl AgentWorkCommandV1 {
    pub fn new(source: AgentWorkCommandSourceV1) -> Result<Self, NetworkError> {
        for value in [&source.command_id, &source.agent_id] {
            validate_agent_id(value)?;
        }
        if let Some(task_id) = &source.task_id {
            validate_agent_id(task_id)?;
        }
        if [source.expected_world_revision, source.issued_at, source.expires_at]
            .into_iter()
            .any(|value| value > NETWORK_MAX_SAFE_INTEGER_V1)
            || source.expires_at < source.issued_at
            || source.expires_at - source.issued_at > 10 * 60_000
        {
            return Err(NetworkError::new(
                NetworkErrorCode::InvalidInteger,
                "agent command timestamps or revision are invalid",
            ));
        }
        if source.work_units == 0 || source.work_units > AGENT_MAX_BUILD_CELLS_V1 {
            return Err(NetworkError::new(
                NetworkErrorCode::Budget,
                "agent command work units exceed V1 budget",
            ));
        }
        if source.arguments.len() > AGENT_MAX_COMMAND_BYTES_V1 {
            return Err(NetworkError::new(
                NetworkErrorCode::Budget,
                "agent command arguments exceed V1 budget",
            ));
        }
        let mut hasher = CanonicalHasher::new("blockwild-agent-work-command-v1");
        hasher.write_u16(AGENT_PLATFORM_SCHEMA_VERSION_V1);
        hasher.write_u16(AGENT_PROTOCOL_VERSION_V1);
        hasher.write_str(&source.command_id);
        hasher.write_str(&source.agent_id);
        hasher.write_str(source.kind.as_str());
        hasher.write_u64(source.expected_world_revision);
        hasher.write_u64(source.issued_at);
        hasher.write_u64(source.expires_at);
        hasher.write_u16(source.work_units);
        hasher.write_u16(u16::from(source.task_id.is_some()));
        if let Some(task_id) = &source.task_id {
            hasher.write_str(task_id);
        }
        hasher.write_bytes(&source.arguments);
        Ok(Self {
            schema_version: AGENT_PLATFORM_SCHEMA_VERSION_V1,
            protocol_version: AGENT_PROTOCOL_VERSION_V1,
            command_id: source.command_id,
            agent_id: source.agent_id,
            kind: source.kind,
            expected_world_revision: source.expected_world_revision,
            issued_at: source.issued_at,
            expires_at: source.expires_at,
            work_units: source.work_units,
            task_id: source.task_id,
            arguments: source.arguments,
            command_hash: hasher.finish(),
        })
    }

    pub fn validate(&self) -> Result<(), NetworkError> {
        if self.schema_version != AGENT_PLATFORM_SCHEMA_VERSION_V1 || self.protocol_version != AGENT_PROTOCOL_VERSION_V1
        {
            return Err(NetworkError::new(
                NetworkErrorCode::ProtocolMismatch,
                "agent command protocol/schema mismatch",
            ));
        }
        let rebuilt = Self::new(AgentWorkCommandSourceV1 {
            command_id: self.command_id.clone(),
            agent_id: self.agent_id.clone(),
            kind: self.kind,
            expected_world_revision: self.expected_world_revision,
            issued_at: self.issued_at,
            expires_at: self.expires_at,
            work_units: self.work_units,
            task_id: self.task_id.clone(),
            arguments: self.arguments.clone(),
        })?;
        if rebuilt != *self {
            return Err(NetworkError::new(
                NetworkErrorCode::HashMismatch,
                "agent command hash mismatch",
            ));
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AgentNearbyRecordV1 {
    pub entity_id: String,
    pub kind: u8,
    pub position_milliblocks: [i32; 3],
    pub distance_milliblocks: u32,
    pub interactable: bool,
    pub state: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AgentObservationV1 {
    pub schema_version: u16,
    pub protocol_version: u16,
    pub observation_sequence: u64,
    pub observed_at: u64,
    pub expires_at: u64,
    pub identity: NetworkAuthorityIdentityV1,
    pub coordinate_system: String,
    pub agent_id: String,
    pub agent_name: String,
    pub position_milliblocks: [i32; 3],
    pub velocity_milliblocks_per_second: [i32; 3],
    pub yaw_milliradians: i32,
    pub pitch_milliradians: i32,
    pub capabilities: Vec<AgentCapabilityV1>,
    pub nearby: Vec<AgentNearbyRecordV1>,
    pub task_ids: Vec<String>,
    pub context: Vec<u8>,
    pub observation_hash: CanonicalHash,
}

impl AgentObservationV1 {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        observation_sequence: u64,
        observed_at: u64,
        expires_at: u64,
        identity: NetworkAuthorityIdentityV1,
        coordinate_system: String,
        agent_id: String,
        agent_name: String,
        position_milliblocks: [i32; 3],
        velocity_milliblocks_per_second: [i32; 3],
        yaw_milliradians: i32,
        pitch_milliradians: i32,
        capabilities: Vec<AgentCapabilityV1>,
        mut nearby: Vec<AgentNearbyRecordV1>,
        mut task_ids: Vec<String>,
        context: Vec<u8>,
    ) -> Result<Self, NetworkError> {
        if [observation_sequence, observed_at, expires_at]
            .into_iter()
            .any(|value| value > NETWORK_MAX_SAFE_INTEGER_V1)
            || expires_at < observed_at
        {
            return Err(NetworkError::new(
                NetworkErrorCode::InvalidInteger,
                "agent observation timing is invalid",
            ));
        }
        identity.validate()?;
        validate_agent_id(&agent_id)?;
        if coordinate_system.is_empty()
            || coordinate_system.encode_utf16().count() > 240
            || agent_name.trim().is_empty()
            || agent_name.encode_utf16().count() > 48
        {
            return Err(NetworkError::new(
                NetworkErrorCode::InvalidLabel,
                "agent observation label is invalid",
            ));
        }
        if nearby.len() > AGENT_MAX_NEARBY_V1
            || task_ids.len() > AGENT_MAX_TASKS_V1
            || context.len() > AGENT_MAX_OBSERVATION_BYTES_V1
        {
            return Err(NetworkError::new(
                NetworkErrorCode::Budget,
                "agent observation exceeds V1 bounds",
            ));
        }
        for record in &nearby {
            validate_agent_id(&record.entity_id)?;
            if record.state.encode_utf16().count() > 160 {
                return Err(NetworkError::new(
                    NetworkErrorCode::InvalidLabel,
                    "nearby entity state is too long",
                ));
            }
        }
        for task_id in &task_ids {
            validate_agent_id(task_id)?;
        }
        let nearby_bytes = nearby.iter().try_fold(0_usize, |total, record| {
            total.checked_add(32 + record.entity_id.len() + record.state.len())
        });
        let task_bytes = task_ids
            .iter()
            .try_fold(0_usize, |total, task_id| total.checked_add(2 + task_id.len()));
        let observation_bytes = nearby_bytes
            .and_then(|value| value.checked_add(task_bytes?))
            .and_then(|value| value.checked_add(context.len()))
            .and_then(|value| value.checked_add(coordinate_system.len() + agent_id.len() + agent_name.len() + 192));
        if observation_bytes.is_none_or(|value| value > AGENT_MAX_OBSERVATION_BYTES_V1) {
            return Err(NetworkError::new(
                NetworkErrorCode::Budget,
                "agent observation encoded content exceeds V1 byte budget",
            ));
        }
        nearby.sort_by(|left, right| left.entity_id.cmp(&right.entity_id));
        if nearby.windows(2).any(|pair| pair[0].entity_id == pair[1].entity_id) {
            return Err(NetworkError::new(
                NetworkErrorCode::DuplicateInterest,
                "agent observation contains duplicate entity",
            ));
        }
        task_ids.sort();
        task_ids.dedup();
        let capabilities = normalize_agent_capabilities(&capabilities);
        let mut hasher = CanonicalHasher::new("blockwild-agent-observation-v1");
        hasher.write_u16(AGENT_PLATFORM_SCHEMA_VERSION_V1);
        hasher.write_u16(AGENT_PROTOCOL_VERSION_V1);
        hasher.write_u64(observation_sequence);
        hasher.write_u64(observed_at);
        hasher.write_u64(expires_at);
        hasher.write_str(&identity.state_hash.to_hex());
        hasher.write_str(&coordinate_system);
        hasher.write_str(&agent_id);
        hasher.write_str(&agent_name);
        for value in position_milliblocks {
            hasher.write_i32(value);
        }
        for value in velocity_milliblocks_per_second {
            hasher.write_i32(value);
        }
        hasher.write_i32(yaw_milliradians);
        hasher.write_i32(pitch_milliradians);
        hasher.write_u32(capabilities.len() as u32);
        for capability in &capabilities {
            hasher.write_str(capability.as_str());
        }
        hasher.write_u32(nearby.len() as u32);
        for record in &nearby {
            hasher.write_str(&record.entity_id);
            hasher.write_u16(u16::from(record.kind));
            for value in record.position_milliblocks {
                hasher.write_i32(value);
            }
            hasher.write_u32(record.distance_milliblocks);
            hasher.write_u16(u16::from(record.interactable));
            hasher.write_str(&record.state);
        }
        hasher.write_u32(task_ids.len() as u32);
        for task_id in &task_ids {
            hasher.write_str(task_id);
        }
        hasher.write_bytes(&context);
        Ok(Self {
            schema_version: AGENT_PLATFORM_SCHEMA_VERSION_V1,
            protocol_version: AGENT_PROTOCOL_VERSION_V1,
            observation_sequence,
            observed_at,
            expires_at,
            identity,
            coordinate_system,
            agent_id,
            agent_name,
            position_milliblocks,
            velocity_milliblocks_per_second,
            yaw_milliradians,
            pitch_milliradians,
            capabilities,
            nearby,
            task_ids,
            context,
            observation_hash: hasher.finish(),
        })
    }

    pub fn validate(&self) -> Result<(), NetworkError> {
        if self.schema_version != AGENT_PLATFORM_SCHEMA_VERSION_V1 || self.protocol_version != AGENT_PROTOCOL_VERSION_V1
        {
            return Err(NetworkError::new(
                NetworkErrorCode::ProtocolMismatch,
                "agent observation protocol/schema mismatch",
            ));
        }
        let rebuilt = Self::new(
            self.observation_sequence,
            self.observed_at,
            self.expires_at,
            self.identity.clone(),
            self.coordinate_system.clone(),
            self.agent_id.clone(),
            self.agent_name.clone(),
            self.position_milliblocks,
            self.velocity_milliblocks_per_second,
            self.yaw_milliradians,
            self.pitch_milliradians,
            self.capabilities.clone(),
            self.nearby.clone(),
            self.task_ids.clone(),
            self.context.clone(),
        )?;
        if rebuilt != *self {
            return Err(NetworkError::new(
                NetworkErrorCode::HashMismatch,
                "agent observation hash or ordering mismatch",
            ));
        }
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AgentAuthorityCodeV1 {
    Accepted,
    UnknownAgent,
    ConnectionMismatch,
    Pending,
    Paused,
    Revoked,
    Expired,
    CapabilityDenied,
    EnvelopeMismatch,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AgentAuthorityDecisionV1 {
    pub code: AgentAuthorityCodeV1,
    pub receipt: Option<NetworkCommandReceiptV1>,
}

#[derive(Clone, Debug, Default)]
pub struct AgentWorkAuthorityV1 {
    grants: BTreeMap<String, AgentCapabilityGrantV1>,
}

impl AgentWorkAuthorityV1 {
    pub fn upsert_grant(&mut self, grant: AgentCapabilityGrantV1) -> Result<(), NetworkError> {
        grant.validate()?;
        self.grants.insert(grant.agent_id.clone(), grant);
        Ok(())
    }

    #[must_use]
    pub fn grant(&self, agent_id: &str) -> Option<&AgentCapabilityGrantV1> {
        self.grants.get(agent_id)
    }

    pub fn authorize(
        &self,
        network: &mut NetworkAuthorityV1,
        envelope: &NetworkCommandV1,
        work: &AgentWorkCommandV1,
        current: &NetworkAuthorityIdentityV1,
        now: u64,
    ) -> Result<AgentAuthorityDecisionV1, NetworkError> {
        work.validate()?;
        if envelope.peer_kind != NetworkPeerKindV1::Agent
            || envelope.command_id != work.command_id
            || envelope.actor_id != work.agent_id
            || envelope.payload != encode_agent_work_command_v1(work)?
            || work.expected_world_revision != current.revision.world
        {
            return Ok(AgentAuthorityDecisionV1 {
                code: AgentAuthorityCodeV1::EnvelopeMismatch,
                receipt: None,
            });
        }
        let Some(grant) = self.grants.get(&work.agent_id) else {
            return Ok(AgentAuthorityDecisionV1 {
                code: AgentAuthorityCodeV1::UnknownAgent,
                receipt: None,
            });
        };
        if grant.peer_id != envelope.peer_id || grant.connection_id != envelope.connection_id {
            return Ok(AgentAuthorityDecisionV1 {
                code: AgentAuthorityCodeV1::ConnectionMismatch,
                receipt: None,
            });
        }
        let status_code = match grant.status {
            AgentLifecycleStatusV1::Pending => Some(AgentAuthorityCodeV1::Pending),
            AgentLifecycleStatusV1::Paused
                if !matches!(
                    work.kind,
                    AgentCommandKindV1::SessionStatus
                        | AgentCommandKindV1::SessionResume
                        | AgentCommandKindV1::SessionStop
                        | AgentCommandKindV1::CapabilitiesList
                ) =>
            {
                Some(AgentAuthorityCodeV1::Paused)
            }
            AgentLifecycleStatusV1::Revoked | AgentLifecycleStatusV1::Disconnected => {
                Some(AgentAuthorityCodeV1::Revoked)
            }
            _ => None,
        };
        if let Some(code) = status_code {
            return Ok(AgentAuthorityDecisionV1 { code, receipt: None });
        }
        if grant.expires_at < now || work.expires_at < now {
            return Ok(AgentAuthorityDecisionV1 {
                code: AgentAuthorityCodeV1::Expired,
                receipt: None,
            });
        }
        if work
            .kind
            .required_capability()
            .is_some_and(|capability| !grant.granted.contains(&capability))
        {
            return Ok(AgentAuthorityDecisionV1 {
                code: AgentAuthorityCodeV1::CapabilityDenied,
                receipt: None,
            });
        }
        let receipt = network.authorize(envelope, current, now)?;
        let code = if receipt.status == NetworkReceiptStatusV1::Accepted {
            AgentAuthorityCodeV1::Accepted
        } else {
            AgentAuthorityCodeV1::EnvelopeMismatch
        };
        Ok(AgentAuthorityDecisionV1 {
            code,
            receipt: Some(receipt),
        })
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AgentTaskLeaseV1 {
    pub command_id: String,
    pub agent_id: String,
    pub lease_keys: Vec<String>,
    pub expires_at: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AgentQueuedWorkV1 {
    pub command: AgentWorkCommandV1,
    pub lease: AgentTaskLeaseV1,
    pub remaining_units: u16,
}

#[derive(Clone, Debug, Default)]
pub struct AgentWorkQueueV1 {
    queue: VecDeque<AgentQueuedWorkV1>,
    queued_units: u32,
    seen: BTreeSet<String>,
    seen_order: VecDeque<String>,
}

impl AgentWorkQueueV1 {
    pub fn enqueue(
        &mut self,
        command: AgentWorkCommandV1,
        network_command: &NetworkCommandV1,
        receipt: &NetworkCommandReceiptV1,
    ) -> Result<(), NetworkError> {
        command.validate()?;
        if !receipt.accepted()
            || receipt.command_id != command.command_id
            || network_command.command_id != command.command_id
        {
            return Err(NetworkError::new(
                NetworkErrorCode::ProtocolMismatch,
                "agent work lacks matching accepted authority receipt",
            ));
        }
        if self.seen.contains(&command.command_id) {
            return Ok(());
        }
        let next_units = self
            .queued_units
            .checked_add(u32::from(command.work_units))
            .ok_or_else(|| NetworkError::new(NetworkErrorCode::Budget, "agent queued work overflow"))?;
        if self.queue.len() >= AGENT_MAX_WORK_QUEUE_V1 || next_units > AGENT_MAX_QUEUED_WORK_UNITS_V1 {
            return Err(NetworkError::new(NetworkErrorCode::Budget, "agent work queue is full"));
        }
        let lease = AgentTaskLeaseV1 {
            command_id: command.command_id.clone(),
            agent_id: command.agent_id.clone(),
            lease_keys: network_command.lease_keys.clone(),
            expires_at: command.expires_at.min(network_command.expires_at),
        };
        let remaining_units = command.work_units;
        let command_id = command.command_id.clone();
        self.queue.push_back(AgentQueuedWorkV1 {
            command,
            lease,
            remaining_units,
        });
        self.seen.insert(command_id.clone());
        self.seen_order.push_back(command_id);
        while self.seen_order.len() > crate::NETWORK_MAX_IDEMPOTENCY_RECEIPTS_V1 {
            if let Some(expired) = self.seen_order.pop_front() {
                self.seen.remove(&expired);
            }
        }
        self.queued_units = next_units;
        Ok(())
    }

    /// Consume at most `budget_units` in FIFO order. The host releases returned
    /// command leases after atomically committing each command's final result.
    pub fn tick(&mut self, mut budget_units: u16, now: u64) -> Vec<String> {
        let mut completed = Vec::new();
        while budget_units > 0 {
            let Some(front) = self.queue.front_mut() else {
                break;
            };
            if front.lease.expires_at < now {
                let expired = self.queue.pop_front().expect("front exists");
                self.queued_units -= u32::from(expired.remaining_units);
                completed.push(expired.command.command_id);
                continue;
            }
            let consumed = front.remaining_units.min(budget_units);
            front.remaining_units -= consumed;
            budget_units -= consumed;
            self.queued_units -= u32::from(consumed);
            if front.remaining_units == 0 {
                let done = self.queue.pop_front().expect("front exists");
                completed.push(done.command.command_id);
            }
        }
        completed
    }

    #[must_use]
    pub fn len(&self) -> usize {
        self.queue.len()
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.queue.is_empty()
    }

    #[must_use]
    pub fn queued_units(&self) -> u32 {
        self.queued_units
    }
}

fn normalize_agent_capabilities(input: &[AgentCapabilityV1]) -> Vec<AgentCapabilityV1> {
    AGENT_CAPABILITY_ORDER_V1
        .into_iter()
        .filter(|capability| input.contains(capability))
        .collect()
}

fn validate_agent_id(value: &str) -> Result<(), NetworkError> {
    let valid = !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .enumerate()
            .all(|(index, byte)| byte.is_ascii_alphanumeric() || (index > 0 && matches!(byte, b':' | b'_' | b'-')));
    if valid {
        Ok(())
    } else {
        Err(NetworkError::new(NetworkErrorCode::InvalidLabel, "agent id is invalid"))
    }
}

pub fn encode_agent_work_command_v1(value: &AgentWorkCommandV1) -> Result<Vec<u8>, NetworkError> {
    value.validate()?;
    let mut bytes = Vec::with_capacity(64 + value.arguments.len());
    bytes.extend_from_slice(b"BWA1");
    bytes.extend_from_slice(&AGENT_PLATFORM_SCHEMA_VERSION_V1.to_le_bytes());
    bytes.extend_from_slice(&AGENT_PROTOCOL_VERSION_V1.to_le_bytes());
    write_string(&mut bytes, &value.command_id);
    write_string(&mut bytes, &value.agent_id);
    bytes.push(value.kind as u8);
    bytes.extend_from_slice(&value.expected_world_revision.to_le_bytes());
    bytes.extend_from_slice(&value.issued_at.to_le_bytes());
    bytes.extend_from_slice(&value.expires_at.to_le_bytes());
    bytes.extend_from_slice(&value.work_units.to_le_bytes());
    match &value.task_id {
        Some(task_id) => {
            bytes.push(1);
            write_string(&mut bytes, task_id);
        }
        None => bytes.push(0),
    }
    bytes.extend_from_slice(&(value.arguments.len() as u32).to_le_bytes());
    bytes.extend_from_slice(&value.arguments);
    bytes.extend_from_slice(value.command_hash.as_bytes());
    if bytes.len() > AGENT_MAX_COMMAND_BYTES_V1 + 1024 {
        return Err(NetworkError::new(
            NetworkErrorCode::Budget,
            "encoded agent command exceeds wire budget",
        ));
    }
    Ok(bytes)
}

pub fn decode_agent_work_command_v1(bytes: &[u8]) -> Result<AgentWorkCommandV1, NetworkError> {
    if bytes.len() > AGENT_MAX_COMMAND_BYTES_V1 + 1024 {
        return Err(NetworkError::new(
            NetworkErrorCode::Budget,
            "agent command wire exceeds budget",
        ));
    }
    let mut cursor = 0_usize;
    if take(bytes, &mut cursor, 4)? != b"BWA1" {
        return Err(NetworkError::new(
            NetworkErrorCode::WireMagic,
            "agent command wire magic is not BWA1",
        ));
    }
    let schema = read_u16(bytes, &mut cursor)?;
    let protocol = read_u16(bytes, &mut cursor)?;
    if schema != AGENT_PLATFORM_SCHEMA_VERSION_V1 || protocol != AGENT_PROTOCOL_VERSION_V1 {
        return Err(NetworkError::new(
            NetworkErrorCode::ProtocolMismatch,
            "agent command wire version mismatch",
        ));
    }
    let command_id = read_string(bytes, &mut cursor, 128)?;
    let agent_id = read_string(bytes, &mut cursor, 128)?;
    let kind = AgentCommandKindV1::from_wire(read_u8(bytes, &mut cursor)?)
        .ok_or_else(|| NetworkError::new(NetworkErrorCode::InvalidEnum, "invalid agent command kind"))?;
    let expected_world_revision = read_u64(bytes, &mut cursor)?;
    let issued_at = read_u64(bytes, &mut cursor)?;
    let expires_at = read_u64(bytes, &mut cursor)?;
    let work_units = read_u16(bytes, &mut cursor)?;
    let task_id = match read_u8(bytes, &mut cursor)? {
        0 => None,
        1 => Some(read_string(bytes, &mut cursor, 128)?),
        _ => {
            return Err(NetworkError::new(
                NetworkErrorCode::InvalidEnum,
                "invalid task id presence flag",
            ));
        }
    };
    let argument_len = read_u32(bytes, &mut cursor)? as usize;
    if argument_len > AGENT_MAX_COMMAND_BYTES_V1 {
        return Err(NetworkError::new(
            NetworkErrorCode::Budget,
            "agent argument wire exceeds budget",
        ));
    }
    let arguments = take(bytes, &mut cursor, argument_len)?.to_vec();
    let supplied_hash = CanonicalHash(take(bytes, &mut cursor, 16)?.try_into().expect("fixed slice"));
    if cursor != bytes.len() {
        return Err(NetworkError::new(
            NetworkErrorCode::TrailingBytes,
            "agent command wire contains trailing bytes",
        ));
    }
    let value = AgentWorkCommandV1::new(AgentWorkCommandSourceV1 {
        command_id,
        agent_id,
        kind,
        expected_world_revision,
        issued_at,
        expires_at,
        work_units,
        task_id,
        arguments,
    })?;
    if value.command_hash != supplied_hash {
        return Err(NetworkError::new(
            NetworkErrorCode::HashMismatch,
            "agent command wire hash mismatch",
        ));
    }
    Ok(value)
}

fn write_string(output: &mut Vec<u8>, value: &str) {
    output.extend_from_slice(&(value.len() as u16).to_le_bytes());
    output.extend_from_slice(value.as_bytes());
}

fn take<'a>(bytes: &'a [u8], cursor: &mut usize, length: usize) -> Result<&'a [u8], NetworkError> {
    let end = cursor
        .checked_add(length)
        .ok_or_else(|| NetworkError::new(NetworkErrorCode::Truncated, "agent wire cursor overflow"))?;
    let value = bytes
        .get(*cursor..end)
        .ok_or_else(|| NetworkError::new(NetworkErrorCode::Truncated, "agent wire is truncated"))?;
    *cursor = end;
    Ok(value)
}

fn read_u8(bytes: &[u8], cursor: &mut usize) -> Result<u8, NetworkError> {
    Ok(take(bytes, cursor, 1)?[0])
}
fn read_u16(bytes: &[u8], cursor: &mut usize) -> Result<u16, NetworkError> {
    Ok(u16::from_le_bytes(
        take(bytes, cursor, 2)?.try_into().expect("fixed slice"),
    ))
}
fn read_u32(bytes: &[u8], cursor: &mut usize) -> Result<u32, NetworkError> {
    Ok(u32::from_le_bytes(
        take(bytes, cursor, 4)?.try_into().expect("fixed slice"),
    ))
}
fn read_u64(bytes: &[u8], cursor: &mut usize) -> Result<u64, NetworkError> {
    Ok(u64::from_le_bytes(
        take(bytes, cursor, 8)?.try_into().expect("fixed slice"),
    ))
}

fn read_string(bytes: &[u8], cursor: &mut usize, maximum: usize) -> Result<String, NetworkError> {
    let length = usize::from(read_u16(bytes, cursor)?);
    if length > maximum {
        return Err(NetworkError::new(
            NetworkErrorCode::InvalidLabel,
            "agent wire string exceeds bound",
        ));
    }
    String::from_utf8(take(bytes, cursor, length)?.to_vec())
        .map_err(|_| NetworkError::new(NetworkErrorCode::InvalidLabel, "agent wire string is not UTF-8"))
}
