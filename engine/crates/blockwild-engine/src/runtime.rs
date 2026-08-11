//! Integrated renderer-independent authority assembled during the R4-R9 cutover.
//!
//! This module deliberately keeps the original R0 `Engine` facade intact while
//! the browser adapters are promoted.  Unlike the R0 shadow facade, this runtime
//! owns the canonical world, entity, gameplay, persistence, simulation-job, and
//! network-authority boundaries in one coarse-grained handle.

use std::cell::Cell;
use std::collections::{BTreeMap, VecDeque};
use std::fmt;
use std::sync::Arc;

use blockwild_authority::{
    BlockCatalogV1, ChunkAuxiliaryDataV1, LiquidMetadataV1, ReadOriginV1, ReadSizeV1, SectionInstallV1,
    WORLD_SECTION_CELL_COUNT_V1, WorldAddressV1 as AuthorityWorldAddressV1, WorldAuthorityStoreR4V1, WorldCellV1,
    WorldChunkAddressV1 as AuthorityChunkAddressV1, WorldLiquidKindV1, WorldMutationBatchR4V1,
    WorldMutationReceiptR4V1, WorldReadPageV1, WorldSectionAddressV1, decode_compatibility_save_binary_v1,
    encode_compatibility_save_binary_v1,
};
use blockwild_entity::{
    ENTITY_COMMAND_SCHEMA, EntityAuthority, EntityClass, EntityCommand, EntityCommandBatch, EntityEventBatch,
    Vec3 as EntityVec3,
};
use blockwild_gameplay::{
    CombatCommand, GameplayAuthority, GameplayBatch, GameplayReceipt, GameplayState, MachineCommand, WorldKey,
};
use blockwild_generation::{
    Block as GeneratedBlock, ChunkPayloadV2, GenerateChunkRequestV2, GenerationDiagnostics, GenerationOutcome,
    GenerationService,
};
use blockwild_network::{
    AgentCapabilityGrantV1, InterestDeltaBuildSourceV1, InterestIndexV1, InterestSelectionStatsV1,
    NetworkAuthorityIdentityV1, NetworkAuthorityRevisionV1, NetworkBrowserAuthorityRuntimeV1, NetworkDeltaRecordV1,
    NetworkDeltaV1, NetworkInterestSetV1, NetworkPeerGrantV1, NetworkReconnectCheckpointV1, ScopedDeltaRecordV1,
    WorldAddressV1 as NetworkWorldAddressV1,
};
use blockwild_persistence::{
    COMPATIBILITY_RECORD_PREFIX_V1, CanonicalWorldSaveSetV1, JournalCommitReceipt, JournalState,
    NormalizedStateRecordV1, PagedRecoveryAssemblerV1, PagedRecoveryCompleteV1, PersistenceAuthorityV1,
    PersistenceBrowserRequestV1, PersistenceDispatchOutcomeV1, PersistenceDispatchPacketV1,
    PersistenceDispatchStatusV1, PersistenceDispatcherLimitsV1, PersistenceDispatcherV1,
    PersistencePlatformOperationV1, PreparedAuthorityCommitV1, RecordAddress, RecordKind, Transaction,
    WORLD_SAVE_MANIFEST_RECORD_ID_V1, decode_paged_recovery_head_v1, decode_paged_recovery_page_v1,
    decode_persistence_browser_request_v1, decode_world_save_manifest_v1,
};
use blockwild_runtime_wire::{
    MAX_INPUT_FRAMES, RUNTIME_BULK_MAX_ATTACHMENT_BYTES_V1, RUNTIME_BULK_MAX_SAVE_CHUNKS_V1,
    RUNTIME_BULK_SAVE_CHUNK_BYTES_V1, RUNTIME_INPUT_BUTTON_ASCEND_V1, RUNTIME_INPUT_BUTTON_CROUCH_V1,
    RUNTIME_INPUT_BUTTON_DESCEND_V1, RUNTIME_INPUT_BUTTON_JUMP_V1, RUNTIME_INPUT_BUTTON_MASK_V1,
    RUNTIME_INPUT_BUTTON_SPRINT_V1, RUNTIME_INPUT_FLAG_CREATIVE_V1, RUNTIME_INPUT_FLAG_FLYING_V1,
    RUNTIME_INPUT_FLAG_MASK_V1, RUNTIME_INPUT_LIVE_MOVEMENT_BUTTON_MASK_V1, RuntimeInputFrameV1,
};
use blockwild_simulation::{
    AirZoneTopologyJobV1, AirZoneTopologyResultV1, ContractError, GravityProfileV1, LiquidFrontierResultV1,
    LiquidFrontierStepV1, PHYSICS_CONTACT_HEAD_SUBMERGED, PHYSICS_CONTACT_IN_LIQUID, PHYSICS_CONTROL_CROUCH,
    PHYSICS_CONTROL_JUMP, PHYSICS_CONTROL_SPRINT, PathJobResultV1, PathJobV1, PhysicsBodyV1, PhysicsControlsV1,
    PhysicsEventKindV1, PhysicsStepInputV1, PhysicsStepResultV1, PhysicsSwimProfileV1, SimulationJobIdentityV1,
    Vec3 as SimulationVec3, WorldAddressV1 as SimulationWorldAddressV1, WorldIdentityV1, WorldReadWindowV1,
    WorldRevisionV1, find_path, solve_air_zones, step_liquid_frontier, step_physics,
};
use blockwild_types::{CanonicalHash, CanonicalHasher, EntityId, seed_stream};

use crate::{RuntimePersistenceDispatchReceiptWireV1, RuntimePersistenceDispatchWireV1, RuntimePlayerBindingWireV1};

pub const INTEGRATED_RUNTIME_SCHEMA_V2: u16 = 2;
pub const INTEGRATED_RUNTIME_FIXED_STEP_US: u64 = 50_000;
pub const INTEGRATED_RUNTIME_MAX_QUEUED_BATCHES: usize = 128;
pub const INTEGRATED_RUNTIME_MAX_BATCHES_PER_STEP: usize = 32;
pub const INTEGRATED_RUNTIME_MAX_DOMAIN_BATCHES: usize = 256;
pub const INTEGRATED_RUNTIME_MAX_REPLAY_ENTRIES: usize = 8_192;
pub const INTEGRATED_RUNTIME_MAX_IDEMPOTENCY_RECEIPTS: usize = 4_096;
pub const INTEGRATED_RUNTIME_MAX_INPUT_LEAD_TICKS: u64 = 256;
pub const INTEGRATED_RUNTIME_MAX_EFFECT_EVENTS: usize = 256;
pub const INTEGRATED_RUNTIME_MAX_MACHINES_PER_STEP: usize = 64;
pub const INTEGRATED_RUNTIME_PERSISTENCE_MAX_PENDING: usize = 32;
pub const INTEGRATED_RUNTIME_PERSISTENCE_MAX_QUEUED_BYTES: usize = 64 * 1024 * 1024;
pub const INTEGRATED_RUNTIME_PERSISTENCE_MAX_PACKET_BYTES: usize = 8 * 1024 * 1024;
pub const INTEGRATED_RUNTIME_PERSISTENCE_MAX_COMPLETED: usize = 256;
pub const INTEGRATED_RUNTIME_PERSISTENCE_MAX_RETRIES: u8 = 3;
pub const INTEGRATED_RUNTIME_MAX_SAVE_STAGES: usize = 1;
pub const INTEGRATED_RUNTIME_MAX_RECOVERY_ASSEMBLERS: usize = 2;
pub const INTEGRATED_RUNTIME_MAX_HYDRATED_EXPORTS: usize = 2;
pub const INTEGRATED_RUNTIME_NATIVE_WORLD_DOMAIN_V1: u16 = 1;
const NATIVE_WORLD_RECORD_ID_V1: &str = "rust-world-r4-v1";
const HYDRATION_TRANSFER_TOKEN_BASE_V1: u64 = 4_500_000_000_000_000;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum IntegratedRuntimeEffectKindV2 {
    Jump = 0,
    Land = 1,
    FallDamage = 2,
    DrownDamage = 3,
    LiquidEnter = 4,
    LiquidExit = 5,
    ShoreExit = 6,
}

#[derive(Clone, Debug, PartialEq)]
pub struct IntegratedRuntimeEffectEventV2 {
    pub sequence: u64,
    pub tick: u64,
    pub entity_external_id: String,
    pub kind: IntegratedRuntimeEffectKindV2,
    pub amount: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct IntegratedRuntimePlayerStateV2 {
    pub binding: RuntimePlayerBindingWireV1,
    pub entity_id: EntityId,
    pub body: PhysicsBodyV1,
    pub contact_flags: u16,
    pub selected_slot: u8,
    pub look_pitch: i16,
    pub buttons: u32,
    pub flags: u8,
    pub last_input_sequence: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IntegratedRuntimeConfigV2 {
    pub world_seed: String,
    pub universe_id: String,
    pub location_id: String,
    pub session_id: String,
    pub content_hash: CanonicalHash,
    pub generator_hash: CanonicalHash,
    pub block_catalog: BlockCatalogV1,
}

impl Default for IntegratedRuntimeConfigV2 {
    fn default() -> Self {
        Self {
            world_seed: "blockwild-integrated-runtime".into(),
            universe_id: "1".into(),
            location_id: "blockwild".into(),
            session_id: "local-host".into(),
            content_hash: CanonicalHash::default(),
            generator_hash: CanonicalHash::default(),
            block_catalog: BlockCatalogV1::default(),
        }
    }
}

impl IntegratedRuntimeConfigV2 {
    fn validate(&self) -> Result<(), IntegratedRuntimeError> {
        if self.world_seed.encode_utf16().count() > 512 {
            return Err(IntegratedRuntimeError::new(
                "invalid-seed",
                "world seed exceeds 512 UTF-16 code units",
            ));
        }
        AuthorityWorldAddressV1::new(&self.universe_id, &self.location_id)
            .map_err(|error| IntegratedRuntimeError::domain("world", error))?;
        NetworkBrowserAuthorityRuntimeV1::new(self.session_id.clone())
            .map_err(|error| IntegratedRuntimeError::domain("network", error))?;
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct IntegratedRuntimeRevisionV2 {
    pub epoch: u64,
    pub world: u64,
    pub entities: u64,
    pub gameplay: u64,
    pub persistence: u64,
    pub network: u64,
    pub simulation: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IntegratedRuntimeIdentityV2 {
    pub schema_version: u16,
    pub universe_id: String,
    pub location_id: String,
    pub revision: IntegratedRuntimeRevisionV2,
    pub tick: u64,
    pub state_hash: CanonicalHash,
}

#[derive(Clone, Debug)]
pub struct IntegratedRuntimeBatchV2 {
    pub schema_version: u16,
    pub batch_id: String,
    pub expected: IntegratedRuntimeIdentityV2,
    pub world: Vec<WorldMutationBatchR4V1>,
    pub entities: Vec<EntityCommandBatch>,
    pub gameplay: Vec<GameplayBatch>,
    pub persistence: Vec<Transaction>,
    /** Present on every BWRQ command; legacy native callers remain explicit. */
    pub reliability: Option<IntegratedRuntimeReliabilityV2>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IntegratedRuntimeReliabilityV2 {
    pub actor_id: String,
    pub idempotency_key: String,
    /** Exact `blockwild.integrated.wire.checksum.v1` command-body checksum. */
    pub command_hash: [u8; 16],
}

impl IntegratedRuntimeBatchV2 {
    #[must_use]
    pub fn empty(batch_id: impl Into<String>, expected: IntegratedRuntimeIdentityV2) -> Self {
        Self {
            schema_version: INTEGRATED_RUNTIME_SCHEMA_V2,
            batch_id: batch_id.into(),
            expected,
            world: Vec::new(),
            entities: Vec::new(),
            gameplay: Vec::new(),
            persistence: Vec::new(),
            reliability: None,
        }
    }

    #[must_use]
    pub fn with_reliability(
        mut self,
        actor_id: impl Into<String>,
        idempotency_key: impl Into<String>,
        command_hash: [u8; 16],
    ) -> Self {
        self.reliability = Some(IntegratedRuntimeReliabilityV2 {
            actor_id: actor_id.into(),
            idempotency_key: idempotency_key.into(),
            command_hash,
        });
        self
    }

    fn validate(&self) -> Result<(), IntegratedRuntimeError> {
        if self.schema_version != INTEGRATED_RUNTIME_SCHEMA_V2 {
            return Err(IntegratedRuntimeError::new(
                "schema-mismatch",
                "integrated runtime batch uses an unsupported schema",
            ));
        }
        validate_label(&self.batch_id, "batch id")?;
        if let Some(reliability) = &self.reliability {
            validate_label(&reliability.actor_id, "actor id")?;
            validate_label(&reliability.idempotency_key, "idempotency key")?;
        }
        let count = self.world.len() + self.entities.len() + self.gameplay.len() + self.persistence.len();
        if count == 0 || count > INTEGRATED_RUNTIME_MAX_DOMAIN_BATCHES {
            return Err(IntegratedRuntimeError::new(
                "batch-shape",
                format!("integrated batch must contain 1..{INTEGRATED_RUNTIME_MAX_DOMAIN_BATCHES} domain batches"),
            ));
        }
        Ok(())
    }
}

#[derive(Clone, Debug)]
pub struct IntegratedRuntimeAcceptedV2 {
    pub batch_id: String,
    pub before: IntegratedRuntimeIdentityV2,
    pub after: IntegratedRuntimeIdentityV2,
    pub world: Vec<WorldMutationReceiptR4V1>,
    pub entities: Vec<EntityEventBatch>,
    pub gameplay: Vec<GameplayReceipt>,
    pub persistence: Vec<JournalCommitReceipt>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IntegratedRuntimeRejectionV2 {
    pub batch_id: String,
    pub code: String,
    pub message: String,
    pub current: IntegratedRuntimeIdentityV2,
}

#[derive(Clone, Debug)]
pub enum IntegratedRuntimeReceiptV2 {
    Accepted(IntegratedRuntimeAcceptedV2),
    Rejected(IntegratedRuntimeRejectionV2),
}

#[derive(Clone, Debug)]
struct IntegratedRuntimeIdempotencyEntryV2 {
    command_hash: [u8; 16],
    receipt: IntegratedRuntimeReceiptV2,
}

impl IntegratedRuntimeReceiptV2 {
    #[must_use]
    pub const fn accepted(&self) -> bool {
        matches!(self, Self::Accepted(_))
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IntegratedRuntimeReplayEntryV2 {
    pub sequence: u64,
    pub batch_id: String,
    pub before_hash: CanonicalHash,
    pub after_hash: CanonicalHash,
    pub receipt_hash: CanonicalHash,
}

#[derive(Clone, Copy, Debug, Default)]
struct IntegratedReplayDigestV2 {
    sum_low: u64,
    sum_high: u64,
    xor_low: u64,
    xor_high: u64,
}

impl IntegratedReplayDigestV2 {
    fn add(&mut self, hash: CanonicalHash) {
        let (low, high) = canonical_hash_lanes(hash);
        self.sum_low = self.sum_low.wrapping_add(low);
        self.sum_high = self.sum_high.wrapping_add(high);
        self.xor_low ^= low;
        self.xor_high ^= high;
    }

    fn remove(&mut self, hash: CanonicalHash) {
        let (low, high) = canonical_hash_lanes(hash);
        self.sum_low = self.sum_low.wrapping_sub(low);
        self.sum_high = self.sum_high.wrapping_sub(high);
        self.xor_low ^= low;
        self.xor_high ^= high;
    }

    fn write_hash(self, hasher: &mut CanonicalHasher) {
        hasher.write_u64(self.sum_low);
        hasher.write_u64(self.sum_high);
        hasher.write_u64(self.xor_low);
        hasher.write_u64(self.xor_high);
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct IntegratedRuntimeStepSummaryV2 {
    pub tick: u64,
    pub fixed_steps: u32,
    pub processed_batches: u32,
    pub accepted_batches: u32,
    pub inputs_applied: u32,
    pub state_hash: CanonicalHash,
    pub replay_hash: CanonicalHash,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct GeneratedChunkInstallSummaryV2 {
    pub chunk_x: i32,
    pub chunk_z: i32,
    pub sections_installed: u16,
    pub markers_installed: u32,
    pub cache_hit: bool,
    pub state_hash: CanonicalHash,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IntegratedRuntimeSaveProgressV1 {
    pub stage_id: String,
    pub received_chunks: u32,
    pub chunk_count: u32,
    pub received_bytes: u64,
    pub set_hash: CanonicalHash,
    pub manifest_hash: CanonicalHash,
    pub dispatcher_request_id: Option<u64>,
    pub remaining_dirty_records: u32,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IntegratedRuntimeHydrationSummaryV1 {
    pub recovery_id: String,
    pub native_domains: u16,
    pub chunk_count: u32,
    pub total_bytes: u64,
    pub compatibility_hash: CanonicalHash,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IntegratedRuntimeHydrationChunkV1 {
    pub transfer_token: u64,
    pub chunk_index: u32,
    pub chunk_count: u32,
    pub bytes: Vec<u8>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct IntegratedRuntimeSaveStageV1 {
    stage_id: String,
    chunk_count: u32,
    total_bytes: u64,
    chunks: BTreeMap<u32, Vec<u8>>,
    chunk_hashes: BTreeMap<u32, CanonicalHash>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct IntegratedRuntimeHydratedExportV1 {
    chunks: Vec<Vec<u8>>,
    total_bytes: u64,
    compatibility_hash: CanonicalHash,
}

#[derive(Clone)]
pub struct IntegratedRuntimeV2 {
    config: IntegratedRuntimeConfigV2,
    world: WorldAuthorityStoreR4V1,
    generation: Arc<GenerationService>,
    entities: EntityAuthority,
    gameplay: GameplayAuthority,
    persistence: JournalState,
    persistence_authority: PersistenceAuthorityV1,
    persistence_dispatcher: PersistenceDispatcherV1,
    save_stages: BTreeMap<String, IntegratedRuntimeSaveStageV1>,
    prepared_persistence_commits: BTreeMap<u64, PreparedAuthorityCommitV1>,
    latest_commit_created_at: u64,
    recovery_assemblers: BTreeMap<String, PagedRecoveryAssemblerV1>,
    recovered_save_sets: BTreeMap<String, PagedRecoveryCompleteV1>,
    hydrated_exports: BTreeMap<String, IntegratedRuntimeHydratedExportV1>,
    next_hydration_transfer_token: u64,
    network: NetworkBrowserAuthorityRuntimeV1,
    replication: InterestIndexV1,
    replication_record_hashes: BTreeMap<String, CanonicalHash>,
    tick: u64,
    last_monotonic_time_us: u64,
    accumulator_us: u64,
    rng_state: u32,
    network_revision: u64,
    simulation_revision: u64,
    gameplay_authority_revision: u64,
    entity_command_sequence: u64,
    player: Option<IntegratedRuntimePlayerStateV2>,
    effect_events: VecDeque<IntegratedRuntimeEffectEventV2>,
    next_effect_sequence: u64,
    queued_inputs: VecDeque<RuntimeInputFrameV1>,
    last_input_sequence: Option<u64>,
    last_applied_input: Option<RuntimeInputFrameV1>,
    queued: VecDeque<IntegratedRuntimeBatchV2>,
    receipts: VecDeque<IntegratedRuntimeReceiptV2>,
    replay: VecDeque<IntegratedRuntimeReplayEntryV2>,
    replay_digest: IntegratedReplayDigestV2,
    idempotency: BTreeMap<String, IntegratedRuntimeIdempotencyEntryV2>,
    idempotency_order: VecDeque<String>,
    state_hash_cache: Cell<Option<CanonicalHash>>,
    stopped: bool,
}

impl IntegratedRuntimeV2 {
    pub fn new(config: IntegratedRuntimeConfigV2) -> Result<Self, IntegratedRuntimeError> {
        config.validate()?;
        let address = AuthorityWorldAddressV1::new(&config.universe_id, &config.location_id)
            .map_err(|error| IntegratedRuntimeError::domain("world", error))?;
        let world = WorldAuthorityStoreR4V1::new(address, config.block_catalog.clone())
            .map_err(|error| IntegratedRuntimeError::domain("world", error))?;
        let gameplay = GameplayAuthority::new(GameplayState::new(
            WorldKey::new(&config.universe_id, &config.location_id),
            1,
        ));
        let network = NetworkBrowserAuthorityRuntimeV1::new(config.session_id.clone())
            .map_err(|error| IntegratedRuntimeError::domain("network", error))?;
        let persistence_dispatcher = PersistenceDispatcherV1::new(PersistenceDispatcherLimitsV1 {
            max_pending: INTEGRATED_RUNTIME_PERSISTENCE_MAX_PENDING,
            max_queued_bytes: INTEGRATED_RUNTIME_PERSISTENCE_MAX_QUEUED_BYTES,
            max_packet_bytes: INTEGRATED_RUNTIME_PERSISTENCE_MAX_PACKET_BYTES,
            max_completed: INTEGRATED_RUNTIME_PERSISTENCE_MAX_COMPLETED,
            max_retries: INTEGRATED_RUNTIME_PERSISTENCE_MAX_RETRIES,
        })
        .map_err(|error| IntegratedRuntimeError::domain("persistence-dispatcher", error))?;
        let persistence_authority = PersistenceAuthorityV1::empty(
            format!("{}@{}", config.universe_id, config.location_id),
            config.generator_hash,
            config.content_hash,
        )
        .map_err(|error| IntegratedRuntimeError::domain("persistence-authority", error))?;
        let rng_state = seed_stream(&config.world_seed, "integrated-runtime-v2");
        Ok(Self {
            config,
            world,
            generation: Arc::new(GenerationService::default()),
            entities: EntityAuthority::default(),
            gameplay,
            persistence: JournalState::default(),
            persistence_authority,
            persistence_dispatcher,
            save_stages: BTreeMap::new(),
            prepared_persistence_commits: BTreeMap::new(),
            latest_commit_created_at: 0,
            recovery_assemblers: BTreeMap::new(),
            recovered_save_sets: BTreeMap::new(),
            hydrated_exports: BTreeMap::new(),
            next_hydration_transfer_token: HYDRATION_TRANSFER_TOKEN_BASE_V1,
            network,
            replication: InterestIndexV1::default(),
            replication_record_hashes: BTreeMap::new(),
            tick: 0,
            last_monotonic_time_us: 0,
            accumulator_us: 0,
            rng_state,
            network_revision: 0,
            simulation_revision: 0,
            gameplay_authority_revision: 0,
            entity_command_sequence: 0,
            player: None,
            effect_events: VecDeque::new(),
            next_effect_sequence: 1,
            queued_inputs: VecDeque::new(),
            last_input_sequence: None,
            last_applied_input: None,
            queued: VecDeque::new(),
            receipts: VecDeque::new(),
            replay: VecDeque::new(),
            replay_digest: IntegratedReplayDigestV2::default(),
            idempotency: BTreeMap::new(),
            idempotency_order: VecDeque::new(),
            state_hash_cache: Cell::new(None),
            stopped: false,
        })
    }

    #[must_use]
    pub fn world(&self) -> &WorldAuthorityStoreR4V1 {
        &self.world
    }

    pub fn world_mut_for_platform_install(&mut self) -> &mut WorldAuthorityStoreR4V1 {
        self.invalidate_state_hash();
        &mut self.world
    }

    #[must_use]
    pub fn entities(&self) -> &EntityAuthority {
        &self.entities
    }

    #[must_use]
    pub fn gameplay(&self) -> &GameplayAuthority {
        &self.gameplay
    }

    #[must_use]
    pub fn player(&self) -> Option<&IntegratedRuntimePlayerStateV2> {
        self.player.as_ref()
    }

    #[must_use]
    pub fn effect_events(&self) -> &VecDeque<IntegratedRuntimeEffectEventV2> {
        &self.effect_events
    }

    #[must_use]
    pub fn persistence(&self) -> &JournalState {
        &self.persistence
    }

    #[must_use]
    pub fn persistence_dispatcher(&self) -> &PersistenceDispatcherV1 {
        &self.persistence_dispatcher
    }

    #[must_use]
    pub fn persistence_authority(&self) -> &PersistenceAuthorityV1 {
        &self.persistence_authority
    }

    /// Accepts one ordered compatibility-save chunk. Exact duplicate retries
    /// are idempotent; conflicting duplicates and reordered chunks fail before
    /// any stage state changes.
    pub fn stage_compatibility_save_chunk(
        &mut self,
        stage_id: &str,
        chunk_index: u32,
        chunk_count: u32,
        total_bytes: u64,
        bytes: &[u8],
    ) -> Result<IntegratedRuntimeSaveProgressV1, IntegratedRuntimeError> {
        self.ensure_running()?;
        validate_label(stage_id, "stage_id")?;
        if chunk_count == 0
            || chunk_count > RUNTIME_BULK_MAX_SAVE_CHUNKS_V1
            || chunk_index >= chunk_count
            || bytes.is_empty()
            || bytes.len() > RUNTIME_BULK_SAVE_CHUNK_BYTES_V1
            || total_bytes == 0
            || total_bytes > RUNTIME_BULK_MAX_ATTACHMENT_BYTES_V1 as u64
        {
            return Err(IntegratedRuntimeError::new(
                "save-stage-capacity",
                "compatibility save chunk metadata exceeds its bounded lane",
            ));
        }
        if !self.save_stages.contains_key(stage_id) {
            if self.save_stages.len() >= INTEGRATED_RUNTIME_MAX_SAVE_STAGES {
                return Err(IntegratedRuntimeError::new(
                    "save-stage-capacity",
                    "one compatibility save stage is already active for this world",
                ));
            }
            self.save_stages.insert(
                stage_id.to_owned(),
                IntegratedRuntimeSaveStageV1 {
                    stage_id: stage_id.to_owned(),
                    chunk_count,
                    total_bytes,
                    chunks: BTreeMap::new(),
                    chunk_hashes: BTreeMap::new(),
                },
            );
        }
        let stage = self.save_stages.get_mut(stage_id).expect("stage was inserted");
        if stage.chunk_count != chunk_count || stage.total_bytes != total_bytes {
            return Err(IntegratedRuntimeError::new(
                "save-stage-conflict",
                "save stage metadata conflicts with the existing generation",
            ));
        }
        if let Some(existing) = stage.chunks.get(&chunk_index) {
            if existing != bytes {
                return Err(IntegratedRuntimeError::new(
                    "save-stage-conflict",
                    "save stage received conflicting bytes for an existing chunk",
                ));
            }
            return Ok(save_stage_progress(stage));
        }
        if chunk_index as usize != stage.chunks.len() {
            return Err(IntegratedRuntimeError::new(
                "save-stage-order",
                "save chunks must arrive contiguously from index zero",
            ));
        }
        let received = stage.chunks.values().fold(bytes.len() as u64, |total, chunk| {
            total.saturating_add(chunk.len() as u64)
        });
        if received > total_bytes || (chunk_index + 1 == chunk_count && received != total_bytes) {
            return Err(IntegratedRuntimeError::new(
                "save-stage-length",
                "save chunk totals disagree with the declared compatibility byte length",
            ));
        }
        let mut hasher = CanonicalHasher::new("blockwild-persistence-stage-chunk-v1");
        hasher.write_u32(chunk_index);
        hasher.write_bytes(bytes);
        stage.chunks.insert(chunk_index, bytes.to_vec());
        stage.chunk_hashes.insert(chunk_index, hasher.finish());
        let progress = save_stage_progress(stage);
        self.invalidate_state_hash();
        Ok(progress)
    }

    /// Builds the canonical save set and lets PersistenceAuthorityV1 choose
    /// the first bounded transaction. Browser code never shards or journals.
    pub fn finalize_compatibility_save(
        &mut self,
        stage_id: &str,
        created_at: u64,
    ) -> Result<IntegratedRuntimeSaveProgressV1, IntegratedRuntimeError> {
        self.ensure_running()?;
        let stage = self.save_stages.get(stage_id).cloned().ok_or_else(|| {
            IntegratedRuntimeError::new("save-stage-stale", "save stage is unknown or already finalized")
        })?;
        if stage.chunks.len() != stage.chunk_count as usize
            || stage.chunks.values().map(Vec::len).sum::<usize>() as u64 != stage.total_bytes
        {
            return Err(IntegratedRuntimeError::new(
                "save-stage-incomplete",
                "save stage cannot finalize until every declared chunk is present",
            ));
        }
        let world_record = NormalizedStateRecordV1 {
            address: RecordAddress::new(
                &self.config.universe_id,
                &self.config.location_id,
                RecordKind::ChunkEdits,
                NATIVE_WORLD_RECORD_ID_V1,
            )
            .map_err(|error| IntegratedRuntimeError::domain("persistence-save", error))?,
            payload: encode_compatibility_save_binary_v1(&self.world.export_compatibility_save())
                .map_err(|error| IntegratedRuntimeError::domain("persistence-save", error))?,
        };
        let save = CanonicalWorldSaveSetV1::build(
            self.persistence_authority.world_id(),
            &self.config.universe_id,
            &self.config.location_id,
            self.config.generator_hash,
            self.config.content_hash,
            stage.chunks.values().cloned(),
            [world_record],
        )
        .map_err(|error| IntegratedRuntimeError::domain("persistence-save", error))?;

        let mut candidate = self.clone();
        candidate
            .persistence_authority
            .stage_complete_save_set(&save)
            .map_err(|error| IntegratedRuntimeError::domain("persistence-save", error))?;
        candidate.latest_commit_created_at = candidate.latest_commit_created_at.max(created_at);
        let dispatcher_request_id = candidate.prepare_next_authority_commit()?;
        candidate.save_stages.remove(stage_id);
        candidate.invalidate_state_hash();
        let remaining_dirty_records = u32::try_from(candidate.persistence_authority.dirty_records().len())
            .map_err(|_| IntegratedRuntimeError::new("save-stage-capacity", "dirty record count exceeds u32"))?;
        let progress = IntegratedRuntimeSaveProgressV1 {
            stage_id: stage.stage_id,
            received_chunks: stage.chunk_count,
            chunk_count: stage.chunk_count,
            received_bytes: stage.total_bytes,
            set_hash: save.set_hash,
            manifest_hash: save.manifest.manifest_hash,
            dispatcher_request_id,
            remaining_dirty_records,
        };
        *self = candidate;
        Ok(progress)
    }

    pub fn cancel_compatibility_save_stage(
        &mut self,
        stage_id: &str,
    ) -> Result<IntegratedRuntimeSaveProgressV1, IntegratedRuntimeError> {
        self.ensure_running()?;
        let stage = self.save_stages.remove(stage_id).ok_or_else(|| {
            IntegratedRuntimeError::new("save-stage-stale", "save stage is unknown or already closed")
        })?;
        let progress = save_stage_progress(&stage);
        self.invalidate_state_hash();
        Ok(progress)
    }

    /// Atomically installs one fully assembled, checkpoint-verified recovery.
    /// Compatibility bytes remain an export shell and never substitute for a
    /// successfully decoded native authority record.
    pub fn hydrate_recovery(
        &mut self,
        recovery_id: &str,
    ) -> Result<IntegratedRuntimeHydrationSummaryV1, IntegratedRuntimeError> {
        self.ensure_running()?;
        let complete = self.recovered_save_sets.get(recovery_id).cloned().ok_or_else(|| {
            IntegratedRuntimeError::new("recovery-incomplete", "recovery is not fully assembled and verified")
        })?;
        if !complete.missing_record_keys.is_empty() {
            return Err(IntegratedRuntimeError::new(
                "recovery-incomplete",
                "recovery is missing one or more required record payloads",
            ));
        }
        if complete.checkpoint.world_id != self.persistence_authority.world_id()
            || complete.checkpoint.generator_hash != self.config.generator_hash
            || complete.checkpoint.content_hash != self.config.content_hash
        {
            return Err(IntegratedRuntimeError::new(
                "recovery-fingerprint",
                "recovery checkpoint does not match this runtime's world fingerprints",
            ));
        }
        let manifest_payload = complete
            .payloads
            .iter()
            .find(|(address, _)| {
                address.kind == RecordKind::LocationManifest && address.record_id == WORLD_SAVE_MANIFEST_RECORD_ID_V1
            })
            .map(|(_, payload)| payload)
            .ok_or_else(|| IntegratedRuntimeError::new("recovery-manifest", "recovery manifest record is missing"))?;
        let manifest = decode_world_save_manifest_v1(manifest_payload)
            .map_err(|error| IntegratedRuntimeError::domain("recovery-manifest", error))?;
        if manifest.world_id != complete.checkpoint.world_id
            || manifest.universe_id != self.config.universe_id
            || manifest.location_id != self.config.location_id
            || manifest.generator_hash != self.config.generator_hash
            || manifest.content_hash != self.config.content_hash
        {
            return Err(IntegratedRuntimeError::new(
                "recovery-manifest",
                "recovery manifest does not match the active runtime identity",
            ));
        }
        let mut chunks = Vec::with_capacity(manifest.compatibility_chunks as usize);
        let mut compatibility_hasher = CanonicalHasher::new("blockwild-persistence-compatibility-stream-v1");
        let mut total_bytes = 0_u64;
        for index in 0..manifest.compatibility_chunks {
            let record_id = format!("{COMPATIBILITY_RECORD_PREFIX_V1}{index:08x}");
            let payload = complete
                .payloads
                .iter()
                .find(|(address, _)| address.kind == RecordKind::SettingsReference && address.record_id == record_id)
                .map(|(_, payload)| payload)
                .ok_or_else(|| {
                    IntegratedRuntimeError::new("recovery-compatibility", "compatibility recovery chunk is missing")
                })?;
            total_bytes = total_bytes.saturating_add(payload.len() as u64);
            compatibility_hasher.write_u32(index);
            compatibility_hasher.write_bytes(payload);
            chunks.push(payload.clone());
        }
        let compatibility_hash = compatibility_hasher.finish();
        if total_bytes != manifest.compatibility_byte_length || compatibility_hash != manifest.compatibility_hash {
            return Err(IntegratedRuntimeError::new(
                "recovery-compatibility",
                "compatibility recovery stream failed its manifest proof",
            ));
        }
        let world_payload = complete
            .payloads
            .iter()
            .find(|(address, _)| {
                address.kind == RecordKind::ChunkEdits && address.record_id == NATIVE_WORLD_RECORD_ID_V1
            })
            .map(|(_, payload)| payload)
            .ok_or_else(|| {
                IntegratedRuntimeError::new("recovery-native-world", "required R4 world record is missing")
            })?;
        let world_save = decode_compatibility_save_binary_v1(world_payload)
            .map_err(|error| IntegratedRuntimeError::domain("recovery-native-world", error))?;

        let mut candidate = self.clone();
        candidate
            .world
            .import_compatibility_save(&world_save, false)
            .map_err(|error| IntegratedRuntimeError::domain("recovery-native-world", error))?;
        candidate.persistence_authority =
            PersistenceAuthorityV1::recover(complete.checkpoint.clone(), complete.payloads.clone())
                .map_err(|error| IntegratedRuntimeError::domain("recovery-authority", error))?;
        while candidate.hydrated_exports.len() >= INTEGRATED_RUNTIME_MAX_HYDRATED_EXPORTS
            && !candidate.hydrated_exports.contains_key(recovery_id)
        {
            if let Some(expired) = candidate.hydrated_exports.keys().next().cloned() {
                candidate.hydrated_exports.remove(&expired);
            }
        }
        candidate.hydrated_exports.insert(
            recovery_id.to_owned(),
            IntegratedRuntimeHydratedExportV1 {
                chunks,
                total_bytes,
                compatibility_hash,
            },
        );
        candidate.recovered_save_sets.remove(recovery_id);
        candidate.invalidate_state_hash();
        let summary = IntegratedRuntimeHydrationSummaryV1 {
            recovery_id: recovery_id.to_owned(),
            native_domains: INTEGRATED_RUNTIME_NATIVE_WORLD_DOMAIN_V1,
            chunk_count: manifest.compatibility_chunks,
            total_bytes,
            compatibility_hash,
        };
        *self = candidate;
        Ok(summary)
    }

    pub fn read_hydrated_compatibility_chunk(
        &mut self,
        recovery_id: &str,
        chunk_index: u32,
    ) -> Result<IntegratedRuntimeHydrationChunkV1, IntegratedRuntimeError> {
        self.ensure_running()?;
        let export = self.hydrated_exports.get(recovery_id).ok_or_else(|| {
            IntegratedRuntimeError::new("hydration-export", "hydrated compatibility export is unavailable")
        })?;
        let bytes = export.chunks.get(chunk_index as usize).cloned().ok_or_else(|| {
            IntegratedRuntimeError::new("hydration-export", "hydrated compatibility chunk index is out of range")
        })?;
        let transfer_token = self.next_hydration_transfer_token;
        self.next_hydration_transfer_token = self
            .next_hydration_transfer_token
            .checked_add(1)
            .ok_or_else(|| IntegratedRuntimeError::new("hydration-token", "hydration token space exhausted"))?;
        Ok(IntegratedRuntimeHydrationChunkV1 {
            transfer_token,
            chunk_index,
            chunk_count: export.chunks.len() as u32,
            bytes,
        })
    }

    /// Queues one Rust-selected persistence platform operation. The returned
    /// request identity becomes a complete BWPR only when the detached bulk
    /// lane polls it; no browser mutation occurs in this call.
    pub fn dispatch_persistence(
        &mut self,
        command: RuntimePersistenceDispatchWireV1,
    ) -> Result<RuntimePersistenceDispatchReceiptWireV1, IntegratedRuntimeError> {
        self.ensure_running()?;
        let request_id = match command {
            RuntimePersistenceDispatchWireV1::Commit { browser_request } => {
                let decoded = decode_persistence_browser_request_v1(&browser_request)
                    .map_err(|error| IntegratedRuntimeError::domain("persistence-dispatch", error))?;
                let PersistenceBrowserRequestV1::Commit {
                    transaction,
                    checkpoint,
                    ..
                } = decoded
                else {
                    return Err(IntegratedRuntimeError::new(
                        "persistence-operation",
                        "commit dispatch requires one complete operation-1 BWPR",
                    ));
                };
                Some(
                    self.persistence_dispatcher
                        .prepare_commit(&transaction, &checkpoint)
                        .map_err(|error| IntegratedRuntimeError::domain("persistence-dispatch", error))?,
                )
            }
            RuntimePersistenceDispatchWireV1::Recover {
                world_id,
                checkpoint_id,
            } => Some(
                self.persistence_dispatcher
                    .recover(&world_id, checkpoint_id.as_deref())
                    .map_err(|error| IntegratedRuntimeError::domain("persistence-dispatch", error))?,
            ),
            RuntimePersistenceDispatchWireV1::ReadRecoveryPage {
                world_id,
                checkpoint_id,
                start_record,
                max_records,
                max_bytes,
            } => Some(
                self.persistence_dispatcher
                    .read_recovery_page(&world_id, &checkpoint_id, start_record, max_records, max_bytes)
                    .map_err(|error| IntegratedRuntimeError::domain("persistence-dispatch", error))?,
            ),
            RuntimePersistenceDispatchWireV1::Estimate { world_id } => Some(
                self.persistence_dispatcher
                    .estimate(&world_id)
                    .map_err(|error| IntegratedRuntimeError::domain("persistence-dispatch", error))?,
            ),
            RuntimePersistenceDispatchWireV1::Compact {
                world_id,
                checkpoint_id,
                expected_head_hash,
                retain_parent_count,
            } => Some(
                self.persistence_dispatcher
                    .compact(&world_id, &checkpoint_id, expected_head_hash, retain_parent_count)
                    .map_err(|error| IntegratedRuntimeError::domain("persistence-dispatch", error))?,
            ),
            RuntimePersistenceDispatchWireV1::Delete {
                world_id,
                expected_head_hash,
                tombstone,
            } => Some(
                self.persistence_dispatcher
                    .delete(&world_id, expected_head_hash, tombstone)
                    .map_err(|error| IntegratedRuntimeError::domain("persistence-dispatch", error))?,
            ),
            RuntimePersistenceDispatchWireV1::PreserveLegacyBackupChunk {
                world_id,
                backup_id,
                offset,
                total_bytes,
                bytes,
            } => Some(
                self.persistence_dispatcher
                    .preserve_legacy_backup_chunk(&world_id, &backup_id, offset, total_bytes, bytes)
                    .map_err(|error| IntegratedRuntimeError::domain("persistence-dispatch", error))?,
            ),
            RuntimePersistenceDispatchWireV1::ExportPage {
                world_id,
                checkpoint_id,
                cursor,
                max_bytes,
            } => Some(
                self.persistence_dispatcher
                    .export_page(&world_id, &checkpoint_id, cursor, max_bytes)
                    .map_err(|error| IntegratedRuntimeError::domain("persistence-dispatch", error))?,
            ),
            RuntimePersistenceDispatchWireV1::ImportChunk {
                world_id,
                import_id,
                offset,
                total_bytes,
                bytes,
            } => Some(
                self.persistence_dispatcher
                    .import_chunk(&world_id, &import_id, offset, total_bytes, bytes)
                    .map_err(|error| IntegratedRuntimeError::domain("persistence-dispatch", error))?,
            ),
            RuntimePersistenceDispatchWireV1::FinalizeImport {
                world_id,
                import_id,
                archive_hash,
                total_bytes,
            } => Some(
                self.persistence_dispatcher
                    .finalize_import(&world_id, &import_id, archive_hash, total_bytes)
                    .map_err(|error| IntegratedRuntimeError::domain("persistence-dispatch", error))?,
            ),
            RuntimePersistenceDispatchWireV1::Retry { previous_request_id } => Some(
                self.persistence_dispatcher
                    .retry(previous_request_id)
                    .map_err(|error| IntegratedRuntimeError::domain("persistence-dispatch", error))?,
            ),
            RuntimePersistenceDispatchWireV1::Close => {
                self.persistence_dispatcher.close();
                None
            }
        };
        self.invalidate_state_hash();
        Ok(self.persistence_dispatch_receipt(request_id))
    }

    pub fn poll_persistence_platform(
        &mut self,
        max_bytes: usize,
    ) -> Result<Option<PersistenceDispatchPacketV1>, IntegratedRuntimeError> {
        self.ensure_running()?;
        let packet = self
            .persistence_dispatcher
            .poll(max_bytes)
            .map_err(|error| IntegratedRuntimeError::domain("persistence-dispatch", error))?;
        if packet.is_some() {
            self.invalidate_state_hash();
        }
        Ok(packet)
    }

    pub fn complete_persistence_platform(
        &mut self,
        transfer_token: u64,
        response: &[u8],
    ) -> Result<PersistenceDispatchOutcomeV1, IntegratedRuntimeError> {
        self.ensure_running()?;
        let mut candidate = self.clone();
        let outcome = candidate
            .persistence_dispatcher
            .complete(transfer_token, response)
            .map_err(|error| IntegratedRuntimeError::domain("persistence-dispatch", error))?;
        if let Some(durable) = &outcome.durable_commit {
            if let Some(prepared) = candidate.prepared_persistence_commits.remove(&outcome.request_id) {
                candidate
                    .persistence_authority
                    .accept_durable_commit(&prepared, durable)
                    .map_err(|error| IntegratedRuntimeError::domain("persistence-authority", error))?;
                candidate.prepare_next_authority_commit()?;
            }
        } else if outcome.operation.is_none()
            && outcome.status == PersistenceDispatchStatusV1::Rejected
            && let Some(prepared) = candidate.prepared_persistence_commits.remove(&outcome.request_id)
        {
            candidate
                .persistence_authority
                .reject_or_abandon_commit(&prepared)
                .map_err(|error| IntegratedRuntimeError::domain("persistence-authority", error))?;
        }
        if outcome.status == PersistenceDispatchStatusV1::Accepted {
            match outcome.operation {
                Some(PersistencePlatformOperationV1::RecoverHead) => {
                    let head = decode_paged_recovery_head_v1(&outcome.payload)
                        .map_err(|error| IntegratedRuntimeError::domain("persistence-recovery", error))?;
                    if !candidate.recovery_assemblers.contains_key(&head.checkpoint_id)
                        && candidate.recovery_assemblers.len() >= INTEGRATED_RUNTIME_MAX_RECOVERY_ASSEMBLERS
                    {
                        return Err(IntegratedRuntimeError::new(
                            "recovery-capacity",
                            "recovery assembler capacity is exhausted",
                        ));
                    }
                    candidate
                        .recovery_assemblers
                        .entry(head.checkpoint_id.clone())
                        .or_insert_with(|| PagedRecoveryAssemblerV1::new(head));
                }
                Some(PersistencePlatformOperationV1::ReadRecoveryPage) => {
                    let page = decode_paged_recovery_page_v1(&outcome.payload)
                        .map_err(|error| IntegratedRuntimeError::domain("persistence-recovery", error))?;
                    let recovery_id = page.checkpoint_id.clone();
                    let assembler = candidate.recovery_assemblers.get_mut(&recovery_id).ok_or_else(|| {
                        IntegratedRuntimeError::new(
                            "recovery-page-order",
                            "recovery page arrived before its verified head",
                        )
                    })?;
                    if let Some(complete) = assembler
                        .accept_page(page)
                        .map_err(|error| IntegratedRuntimeError::domain("persistence-recovery", error))?
                    {
                        candidate.recovery_assemblers.remove(&recovery_id);
                        candidate.recovered_save_sets.insert(recovery_id, complete);
                    }
                }
                _ => {}
            }
        }
        candidate.invalidate_state_hash();
        *self = candidate;
        Ok(outcome)
    }

    /// Recovery-shell state only. It preserves in-flight BWPR tokens and retry
    /// policy across a Worker crash; it is deliberately not a world/gameplay
    /// checkpoint and must never be passed to RuntimeRequestV1::Restore.
    pub fn persistence_dispatcher_checkpoint(&self) -> Result<Vec<u8>, IntegratedRuntimeError> {
        self.persistence_dispatcher
            .checkpoint_state()
            .map_err(|error| IntegratedRuntimeError::domain("persistence-dispatch", error))
    }

    pub fn restore_persistence_dispatcher_checkpoint(
        &mut self,
        checkpoint: &[u8],
    ) -> Result<(), IntegratedRuntimeError> {
        self.ensure_running()?;
        self.persistence_dispatcher = PersistenceDispatcherV1::restore_state(checkpoint)
            .map_err(|error| IntegratedRuntimeError::domain("persistence-dispatch", error))?;
        self.invalidate_state_hash();
        Ok(())
    }

    fn persistence_dispatch_receipt(&self, request_id: Option<u64>) -> RuntimePersistenceDispatchReceiptWireV1 {
        let diagnostics = self.persistence_dispatcher.diagnostics();
        RuntimePersistenceDispatchReceiptWireV1 {
            request_id,
            persistence_revision: diagnostics.persistence_revision,
            pending: u32::try_from(diagnostics.queued.saturating_add(diagnostics.in_flight))
                .expect("dispatcher pending count is bounded"),
            queued_bytes: diagnostics.queued_bytes as u64,
            state_hash: diagnostics.state_hash,
            closed: diagnostics.closed,
        }
    }

    fn prepare_next_authority_commit(&mut self) -> Result<Option<u64>, IntegratedRuntimeError> {
        if !self.prepared_persistence_commits.is_empty() || self.persistence_authority.dirty_records().is_empty() {
            return Ok(None);
        }
        let prepared = self
            .persistence_authority
            .prepare_commit(self.latest_commit_created_at)
            .map_err(|error| IntegratedRuntimeError::domain("persistence-authority", error))?;
        let request_id = match self
            .persistence_dispatcher
            .prepare_commit(&prepared.transaction, &prepared.checkpoint)
        {
            Ok(request_id) => request_id,
            Err(error) => {
                self.persistence_authority
                    .reject_or_abandon_commit(&prepared)
                    .map_err(|abandon| IntegratedRuntimeError::domain("persistence-authority", abandon))?;
                return Err(IntegratedRuntimeError::domain("persistence-dispatch", error));
            }
        };
        self.prepared_persistence_commits.insert(request_id, prepared);
        Ok(Some(request_id))
    }

    #[must_use]
    pub fn network(&self) -> &NetworkBrowserAuthorityRuntimeV1 {
        &self.network
    }

    #[must_use]
    pub fn generation_diagnostics(&self) -> GenerationDiagnostics {
        self.generation.diagnostics()
    }

    #[must_use]
    pub const fn tick(&self) -> u64 {
        self.tick
    }

    #[must_use]
    pub const fn is_stopped(&self) -> bool {
        self.stopped
    }

    #[must_use]
    pub fn revision(&self) -> IntegratedRuntimeRevisionV2 {
        let world_revision = self.world.revision();
        IntegratedRuntimeRevisionV2 {
            epoch: world_revision.epoch,
            world: world_revision.mutation.saturating_add(world_revision.residency),
            entities: self.entities.revision(),
            gameplay: self
                .gameplay
                .state
                .revision
                .sequence
                .saturating_add(self.gameplay_authority_revision),
            persistence: self
                .persistence
                .sequence()
                .saturating_add(self.persistence_dispatcher.persistence_revision())
                .saturating_add(self.persistence_authority.persistence_revision()),
            network: self.network_revision,
            simulation: self.simulation_revision,
        }
    }

    #[must_use]
    pub fn identity(&self) -> IntegratedRuntimeIdentityV2 {
        IntegratedRuntimeIdentityV2 {
            schema_version: INTEGRATED_RUNTIME_SCHEMA_V2,
            universe_id: self.config.universe_id.clone(),
            location_id: self.config.location_id.clone(),
            revision: self.revision(),
            tick: self.tick,
            state_hash: self.state_hash(),
        }
    }

    #[must_use]
    pub fn state_hash(&self) -> CanonicalHash {
        if let Some(hash) = self.state_hash_cache.get() {
            return hash;
        }
        let mut hasher = CanonicalHasher::new("blockwild-integrated-authority-v2");
        hasher.write_u16(INTEGRATED_RUNTIME_SCHEMA_V2);
        hasher.write_str(&self.config.world_seed);
        hasher.write_str(&self.config.universe_id);
        hasher.write_str(&self.config.location_id);
        hasher.write_bytes(self.config.content_hash.as_bytes());
        hasher.write_bytes(self.config.generator_hash.as_bytes());
        hasher.write_u64(self.tick);
        hasher.write_u64(self.accumulator_us);
        hasher.write_u32(self.rng_state);
        let revision = self.revision();
        write_runtime_revision(&mut hasher, revision);
        hasher.write_bytes(self.world.canonical_state_hash().as_bytes());
        hasher.write_bytes(self.entities.canonical_hash().as_bytes());
        hasher.write_u64(self.entity_command_sequence);
        if let Some(player) = &self.player {
            hasher.write_u16(1);
            write_player_state(&mut hasher, player);
        } else {
            hasher.write_u16(0);
        }
        hasher.write_u32(self.effect_events.len() as u32);
        for event in &self.effect_events {
            write_effect_event(&mut hasher, event);
        }
        hasher.write_u64(self.next_effect_sequence);
        hasher.write_bytes(self.gameplay.state.state_hash().as_bytes());
        hasher.write_u64(self.gameplay_authority_revision);
        hasher.write_bytes(self.persistence.state_hash().as_bytes());
        hasher.write_bytes(self.persistence_authority.state_hash().as_bytes());
        hasher.write_bytes(self.persistence_dispatcher.state_hash().as_bytes());
        hasher.write_u32(self.save_stages.len() as u32);
        for (stage_id, stage) in &self.save_stages {
            hasher.write_str(stage_id);
            hasher.write_u32(stage.chunk_count);
            hasher.write_u64(stage.total_bytes);
            hasher.write_u32(stage.chunks.len() as u32);
            for (index, chunk) in &stage.chunks {
                hasher.write_u32(*index);
                hasher.write_u64(chunk.len() as u64);
                hasher.write_bytes(
                    stage
                        .chunk_hashes
                        .get(index)
                        .expect("save-stage chunk hash accompanies every chunk")
                        .as_bytes(),
                );
            }
        }
        hasher.write_u32(self.prepared_persistence_commits.len() as u32);
        for (request_id, prepared) in &self.prepared_persistence_commits {
            hasher.write_u64(*request_id);
            hasher.write_str(&prepared.transaction.transaction_id);
            hasher.write_bytes(prepared.checkpoint.checkpoint_hash.as_bytes());
        }
        hasher.write_bytes(self.network.authority_fingerprint().as_bytes());
        hasher.write_u32(self.replication_record_hashes.len() as u32);
        for (key, hash) in &self.replication_record_hashes {
            hasher.write_str(key);
            hasher.write_bytes(hash.as_bytes());
        }
        hasher.write_u64(self.last_input_sequence.unwrap_or_default());
        hasher.write_u32(self.queued_inputs.len() as u32);
        for input in &self.queued_inputs {
            write_runtime_input(&mut hasher, input);
        }
        if let Some(input) = &self.last_applied_input {
            hasher.write_u16(1);
            write_runtime_input(&mut hasher, input);
        } else {
            hasher.write_u16(0);
        }
        let hash = hasher.finish();
        self.state_hash_cache.set(Some(hash));
        hash
    }

    #[must_use]
    pub fn replay_hash(&self) -> CanonicalHash {
        let mut hasher = CanonicalHasher::new("blockwild-integrated-replay-v2");
        hasher.write_u64(self.replay.len() as u64);
        self.replay_digest.write_hash(&mut hasher);
        hasher.finish()
    }

    pub fn enqueue(&mut self, batch: IntegratedRuntimeBatchV2) -> Result<(), IntegratedRuntimeError> {
        self.ensure_running()?;
        batch.validate()?;
        if self.queued.len() >= INTEGRATED_RUNTIME_MAX_QUEUED_BATCHES {
            return Err(IntegratedRuntimeError::new(
                "queue-capacity",
                "integrated command queue is full",
            ));
        }
        self.queued.push_back(batch);
        Ok(())
    }

    pub fn commit(&mut self, batch: IntegratedRuntimeBatchV2) -> IntegratedRuntimeReceiptV2 {
        let current = self.identity();
        if self.stopped {
            return reject_batch(
                &batch.batch_id,
                "engine-stopped",
                "integrated runtime is stopped",
                current,
            );
        }
        if let Err(error) = batch.validate() {
            return reject_batch(&batch.batch_id, error.code, &error.message, current);
        }
        let idempotency_key = batch
            .reliability
            .as_ref()
            .map(|reliability| format!("{}\0{}", reliability.actor_id, reliability.idempotency_key));
        if let (Some(key), Some(reliability)) = (idempotency_key.as_ref(), batch.reliability.as_ref())
            && let Some(cached) = self.idempotency.get(key)
        {
            if cached.command_hash == reliability.command_hash {
                return cached.receipt.clone();
            }
            return reject_batch(
                &batch.batch_id,
                "idempotency-conflict",
                "idempotency key was reused for different command bytes",
                current,
            );
        }
        let receipt = self.commit_uncached(batch.clone());
        self.cache_idempotent_receipt(&batch, idempotency_key, &receipt);
        receipt
    }

    fn commit_uncached(&mut self, batch: IntegratedRuntimeBatchV2) -> IntegratedRuntimeReceiptV2 {
        let current = self.identity();
        if batch.expected != current {
            return reject_batch(
                &batch.batch_id,
                "stale-runtime",
                "integrated batch was authored against a stale authority identity",
                current,
            );
        }

        let before = current;
        let mut world_receipts = Vec::with_capacity(batch.world.len());
        let mut entity_receipts = Vec::with_capacity(batch.entities.len());
        let mut gameplay_receipts = Vec::with_capacity(batch.gameplay.len());
        let mut persistence_receipts = Vec::with_capacity(batch.persistence.len());
        let domain_batch_count =
            batch.world.len() + batch.entities.len() + batch.gameplay.len() + batch.persistence.len();

        if domain_batch_count == 1 {
            if let Some(command) = batch.world.first() {
                let receipt = self.world.apply_mutation_batch(command.clone());
                if let WorldMutationReceiptR4V1::Rejected { code, message, .. } = &receipt {
                    return reject_batch(
                        &batch.batch_id,
                        "world-rejected",
                        &format!("{code:?}: {message}"),
                        before,
                    );
                }
                world_receipts.push(receipt);
            } else if let Some(command) = batch.entities.first() {
                match self.entities.apply_batch(command) {
                    Ok(receipt) => entity_receipts.push(receipt),
                    Err(error) => {
                        return reject_batch(&batch.batch_id, "entity-rejected", &format!("{error:?}"), before);
                    }
                }
            } else if let Some(command) = batch.gameplay.first() {
                let receipt = self.gameplay.apply_batch(command);
                if let GameplayReceipt::Rejected { rejection, .. } = &receipt {
                    return reject_batch(
                        &batch.batch_id,
                        "gameplay-rejected",
                        &format!("{:?}: {}", rejection.code, rejection.message),
                        before,
                    );
                }
                gameplay_receipts.push(receipt);
            } else if let Some(command) = batch.persistence.first() {
                match self.persistence.apply(command) {
                    Ok(receipt) => persistence_receipts.push(receipt),
                    Err(error) => {
                        return reject_batch(&batch.batch_id, "persistence-rejected", &error.to_string(), before);
                    }
                }
            }
        } else {
            let mut staged_world = (!batch.world.is_empty()).then(|| self.world.clone());
            let mut staged_entities = (!batch.entities.is_empty()).then(|| self.entities.clone());
            let mut staged_gameplay = (!batch.gameplay.is_empty()).then(|| self.gameplay.clone());
            let mut staged_persistence = (!batch.persistence.is_empty()).then(|| self.persistence.clone());

            for command in &batch.world {
                let receipt = staged_world
                    .as_mut()
                    .expect("world stage exists for world commands")
                    .apply_mutation_batch(command.clone());
                if let WorldMutationReceiptR4V1::Rejected { code, message, .. } = &receipt {
                    return reject_batch(
                        &batch.batch_id,
                        "world-rejected",
                        &format!("{code:?}: {message}"),
                        before,
                    );
                }
                world_receipts.push(receipt);
            }
            for command in &batch.entities {
                match staged_entities
                    .as_mut()
                    .expect("entity stage exists for entity commands")
                    .apply_batch(command)
                {
                    Ok(receipt) => entity_receipts.push(receipt),
                    Err(error) => {
                        return reject_batch(&batch.batch_id, "entity-rejected", &format!("{error:?}"), before);
                    }
                }
            }
            for command in &batch.gameplay {
                let receipt = staged_gameplay
                    .as_mut()
                    .expect("gameplay stage exists for gameplay commands")
                    .apply_batch(command);
                if let GameplayReceipt::Rejected { rejection, .. } = &receipt {
                    return reject_batch(
                        &batch.batch_id,
                        "gameplay-rejected",
                        &format!("{:?}: {}", rejection.code, rejection.message),
                        before,
                    );
                }
                gameplay_receipts.push(receipt);
            }
            for command in &batch.persistence {
                match staged_persistence
                    .as_mut()
                    .expect("persistence stage exists for persistence commands")
                    .apply(command)
                {
                    Ok(receipt) => persistence_receipts.push(receipt),
                    Err(error) => {
                        return reject_batch(&batch.batch_id, "persistence-rejected", &error.to_string(), before);
                    }
                }
            }

            if let Some(world) = staged_world {
                self.world = world;
            }
            if let Some(entities) = staged_entities {
                self.entities = entities;
            }
            if let Some(gameplay) = staged_gameplay {
                self.gameplay = gameplay;
            }
            if let Some(persistence) = staged_persistence {
                self.persistence = persistence;
            }
        }

        self.entity_command_sequence = entity_receipts
            .iter()
            .fold(self.entity_command_sequence, |sequence, receipt| {
                sequence.max(receipt.sequence)
            });
        self.invalidate_state_hash();
        let after = self.identity();
        let receipt_hash = hash_runtime_receipt(&batch.batch_id, &before, &after);
        let sequence = self.replay.back().map_or(1, |entry| entry.sequence.saturating_add(1));
        let replay_entry = IntegratedRuntimeReplayEntryV2 {
            sequence,
            batch_id: batch.batch_id.clone(),
            before_hash: before.state_hash,
            after_hash: after.state_hash,
            receipt_hash,
        };
        self.replay_digest.add(hash_runtime_replay_entry(&replay_entry));
        self.replay.push_back(replay_entry);
        while self.replay.len() > INTEGRATED_RUNTIME_MAX_REPLAY_ENTRIES {
            if let Some(removed) = self.replay.pop_front() {
                self.replay_digest.remove(hash_runtime_replay_entry(&removed));
            }
        }
        IntegratedRuntimeReceiptV2::Accepted(IntegratedRuntimeAcceptedV2 {
            batch_id: batch.batch_id.clone(),
            before,
            after,
            world: world_receipts,
            entities: entity_receipts,
            gameplay: gameplay_receipts,
            persistence: persistence_receipts,
        })
    }

    pub fn step(
        &mut self,
        monotonic_time_us: u64,
        budget_us: u32,
    ) -> Result<IntegratedRuntimeStepSummaryV2, IntegratedRuntimeError> {
        self.ensure_running()?;
        self.invalidate_state_hash();
        let delta = if self.last_monotonic_time_us == 0 {
            0
        } else {
            monotonic_time_us
                .saturating_sub(self.last_monotonic_time_us)
                .min(250_000)
        };
        self.last_monotonic_time_us = monotonic_time_us;
        self.accumulator_us = self.accumulator_us.saturating_add(delta);
        let maximum_steps = (u64::from(budget_us) / 250).clamp(1, 8) as u32;
        let due_steps = (self.accumulator_us / INTEGRATED_RUNTIME_FIXED_STEP_US).min(u64::from(maximum_steps)) as u32;
        let mut inputs_applied = 0_u32;
        for _ in 0..due_steps {
            self.tick = self.tick.saturating_add(1);
            self.rng_state = super::xorshift32(self.rng_state);
            self.accumulator_us -= INTEGRATED_RUNTIME_FIXED_STEP_US;
            while self
                .queued_inputs
                .front()
                .is_some_and(|input| input.target_tick <= self.tick)
            {
                self.last_applied_input = self.queued_inputs.pop_front();
                inputs_applied = inputs_applied.saturating_add(1);
            }
            self.advance_authoritative_fixed_step()?;
        }

        let command_budget =
            (usize::try_from(budget_us).unwrap_or(usize::MAX) / 200).clamp(1, INTEGRATED_RUNTIME_MAX_BATCHES_PER_STEP);
        let mut processed = 0_u32;
        let mut accepted = 0_u32;
        for _ in 0..command_budget {
            let Some(batch) = self.queued.pop_front() else {
                break;
            };
            let receipt = self.commit(batch);
            processed += 1;
            accepted += u32::from(receipt.accepted());
            self.receipts.push_back(receipt);
        }
        Ok(IntegratedRuntimeStepSummaryV2 {
            tick: self.tick,
            fixed_steps: due_steps,
            processed_batches: processed,
            accepted_batches: accepted,
            inputs_applied,
            state_hash: self.state_hash(),
            replay_hash: self.replay_hash(),
        })
    }

    pub fn take_receipts(&mut self) -> Vec<IntegratedRuntimeReceiptV2> {
        self.receipts.drain(..).collect()
    }

    pub fn bind_player(&mut self, binding: RuntimePlayerBindingWireV1) -> Result<(), IntegratedRuntimeError> {
        self.ensure_running()?;
        binding
            .validate()
            .map_err(|error| IntegratedRuntimeError::new(error.code, error.message))?;
        let (entity_id, record) = self
            .entities
            .hot()
            .iter()
            .find(|(_, entity)| entity.record.external_entity_id == binding.external_entity_id)
            .map(|(id, entity)| (*id, entity.record.clone()))
            .ok_or_else(|| {
                IntegratedRuntimeError::new(
                    "player-binding-missing",
                    "player binding requires a resident hot entity with the requested external id",
                )
            })?;
        if record.class != EntityClass::Player {
            return Err(IntegratedRuntimeError::new(
                "player-binding-class",
                "player binding target is not an authoritative player entity",
            ));
        }
        let existing = self
            .player
            .as_ref()
            .filter(|player| player.binding.external_entity_id == binding.external_entity_id);
        let body = PhysicsBodyV1 {
            handle: binding.external_entity_id.clone(),
            position: SimulationVec3::new(
                f64::from(record.position.x),
                f64::from(record.position.y),
                f64::from(record.position.z),
            ),
            velocity: SimulationVec3::new(
                f64::from(record.velocity.x),
                f64::from(record.velocity.y),
                f64::from(record.velocity.z),
            ),
            radius: binding.radius,
            height: binding.standing_height,
            mass: binding.mass,
            grounded: existing.map_or_else(
                || parse_custom_bool(&record.custom, "physics.grounded", false),
                |player| player.body.grounded,
            ),
            crouching: false,
            fall_distance: existing.map_or(0.0, |player| player.body.fall_distance),
            oxygen_seconds: existing.map_or(binding.maximum_oxygen_seconds, |player| {
                player.body.oxygen_seconds.min(binding.maximum_oxygen_seconds)
            }),
            drowning_accumulator: existing.map_or(0.0, |player| player.body.drowning_accumulator),
            swim_entry_momentum_speed: existing.map_or(0.0, |player| player.body.swim_entry_momentum_speed),
            swim_surface_breach_ready: existing.is_some_and(|player| player.body.swim_surface_breach_ready),
            swim_surface_breach_seconds: existing.map_or(0.0, |player| player.body.swim_surface_breach_seconds),
            swim_stroke_cooldown_seconds: existing.map_or(0.0, |player| player.body.swim_stroke_cooldown_seconds),
            swim_surface_bob_active: existing.is_some_and(|player| player.body.swim_surface_bob_active),
        };
        self.player = Some(IntegratedRuntimePlayerStateV2 {
            binding,
            entity_id,
            body,
            contact_flags: existing.map_or(0, |player| player.contact_flags),
            selected_slot: existing.map_or(0, |player| player.selected_slot),
            look_pitch: existing.map_or(0, |player| player.look_pitch),
            buttons: existing.map_or(0, |player| player.buttons),
            flags: existing.map_or(0, |player| player.flags),
            last_input_sequence: existing.map_or(0, |player| player.last_input_sequence),
        });
        self.simulation_revision = self.simulation_revision.saturating_add(1);
        self.invalidate_state_hash();
        Ok(())
    }

    fn advance_authoritative_fixed_step(&mut self) -> Result<(), IntegratedRuntimeError> {
        if self.player.is_none() && self.last_applied_input.is_some() {
            return Err(IntegratedRuntimeError::new(
                "player-binding-required",
                "fixed-step player input cannot execute before a hot player entity is explicitly bound",
            ));
        }
        if self.player.is_some() {
            self.advance_bound_player()?;
        }
        self.advance_entity_and_gameplay_schedules()?;
        self.simulation_revision = self.simulation_revision.saturating_add(1);
        self.invalidate_state_hash();
        Ok(())
    }

    fn advance_bound_player(&mut self) -> Result<(), IntegratedRuntimeError> {
        let input = self.last_applied_input.unwrap_or_default();
        let player = self.player.as_ref().expect("player binding was checked").clone();
        let resident = self
            .entities
            .hot()
            .get(&player.entity_id)
            .filter(|entity| {
                entity.record.class == EntityClass::Player
                    && entity.record.external_entity_id == player.binding.external_entity_id
            })
            .ok_or_else(|| {
                IntegratedRuntimeError::new(
                    "player-binding-stale",
                    "bound player entity is no longer resident with the same generational identity",
                )
            })?;
        let mut body = player.body.clone();
        // External entity commands may teleport the player between fixed steps.
        if resident.record.position
            != EntityVec3::new(body.position.x as f32, body.position.y as f32, body.position.z as f32)
        {
            body.position = SimulationVec3::new(
                f64::from(resident.record.position.x),
                f64::from(resident.record.position.y),
                f64::from(resident.record.position.z),
            );
            body.velocity = SimulationVec3::new(
                f64::from(resident.record.velocity.x),
                f64::from(resident.record.velocity.y),
                f64::from(resident.record.velocity.z),
            );
        }
        let crouching = input.buttons & (RUNTIME_INPUT_BUTTON_CROUCH_V1 | RUNTIME_INPUT_BUTTON_DESCEND_V1) != 0;
        body.crouching = crouching;
        body.height = if crouching {
            player.binding.crouching_height
        } else {
            player.binding.standing_height
        };
        let origin = ReadOriginV1 {
            x: floor_i32(body.position.x)?.saturating_sub(3),
            y: floor_i32(body.position.y)?.saturating_sub(2),
            z: floor_i32(body.position.z)?.saturating_sub(3),
        };
        let window = self.capture_simulation_window(origin, ReadSizeV1 { x: 7, y: 10, z: 7 })?;
        let yaw = normalized_i16(input.look_yaw) * std::f64::consts::PI;
        let creative_flying = input.flags & (RUNTIME_INPUT_FLAG_CREATIVE_V1 | RUNTIME_INPUT_FLAG_FLYING_V1)
            == (RUNTIME_INPUT_FLAG_CREATIVE_V1 | RUNTIME_INPUT_FLAG_FLYING_V1);
        let sprinting = input.buttons & RUNTIME_INPUT_BUTTON_SPRINT_V1 != 0;
        let mut controls_flags = 0_u16;
        if input.buttons & (RUNTIME_INPUT_BUTTON_JUMP_V1 | RUNTIME_INPUT_BUTTON_ASCEND_V1) != 0 {
            controls_flags |= PHYSICS_CONTROL_JUMP;
        }
        if crouching {
            controls_flags |= PHYSICS_CONTROL_CROUCH;
        }
        if sprinting {
            controls_flags |= PHYSICS_CONTROL_SPRINT;
        }
        if creative_flying {
            let vertical = f64::from(input.buttons & RUNTIME_INPUT_BUTTON_ASCEND_V1 != 0)
                - f64::from(input.buttons & RUNTIME_INPUT_BUTTON_DESCEND_V1 != 0);
            body.velocity.y = vertical * player.binding.creative_flight_speed;
            body.grounded = false;
        }
        let identity = SimulationJobIdentityV1 {
            job_id: format!("player:{}:{}", player.binding.external_entity_id, self.tick),
            sequence: self.tick as u32,
            world: window.identity.clone(),
            source_snapshot_hash: window.snapshot_hash,
        };
        let physics = PhysicsStepInputV1 {
            identity,
            fixed_delta_micros: INTEGRATED_RUNTIME_FIXED_STEP_US as u32,
            window,
            body,
            controls: PhysicsControlsV1 {
                flags: controls_flags,
                forward: normalized_i16(input.move_z),
                strafe: normalized_i16(input.move_x),
                yaw,
                desired_speed: if creative_flying {
                    player.binding.creative_flight_speed
                } else if sprinting {
                    player.binding.sprint_speed
                } else {
                    player.binding.walk_speed
                },
            },
            gravity: if creative_flying {
                GravityProfileV1::scaled(0.0)
            } else {
                GravityProfileV1::default()
            },
            swimming: PhysicsSwimProfileV1 {
                enabled: !creative_flying,
                max_oxygen_seconds: player.binding.maximum_oxygen_seconds,
                ..PhysicsSwimProfileV1::default()
            },
            external_impulses: Vec::new(),
            input_hash: CanonicalHash::default(),
        }
        .seal();
        let result = self.run_physics(&physics)?;
        self.entity_command_sequence = self.entity_command_sequence.saturating_add(1).max(1);
        let entity_event = self
            .entities
            .apply_batch(&EntityCommandBatch {
                schema: ENTITY_COMMAND_SCHEMA,
                sequence: self.entity_command_sequence,
                expected_revision: self.entities.revision(),
                tick: self.tick,
                commands: vec![EntityCommand::UpdateMotion {
                    id: player.entity_id,
                    position: EntityVec3::new(
                        result.body.position.x as f32,
                        result.body.position.y as f32,
                        result.body.position.z as f32,
                    ),
                    yaw: yaw as f32,
                    velocity: EntityVec3::new(
                        result.body.velocity.x as f32,
                        result.body.velocity.y as f32,
                        result.body.velocity.z as f32,
                    ),
                }],
            })
            .map_err(|error| IntegratedRuntimeError::new("player-motion", error.to_string()))?;
        self.entity_command_sequence = self.entity_command_sequence.max(entity_event.sequence);
        let damage = result
            .events
            .iter()
            .filter(|event| {
                matches!(
                    event.kind,
                    PhysicsEventKindV1::FallDamage | PhysicsEventKindV1::DrownDamage
                )
            })
            .map(|event| event.amount)
            .sum::<f64>() as f32;
        let entity = self
            .entities
            .hot_mut(player.entity_id)
            .map_err(|error| IntegratedRuntimeError::new("player-motion", error.to_string()))?;
        entity.record.health = (entity.record.health - damage).max(0.0);
        entity
            .record
            .custom
            .insert("physics.grounded".into(), result.body.grounded.to_string());
        entity.record.custom.insert(
            "physics.inLiquid".into(),
            (result.contact_flags & PHYSICS_CONTACT_IN_LIQUID != 0).to_string(),
        );
        entity.record.custom.insert(
            "physics.headSubmerged".into(),
            (result.contact_flags & PHYSICS_CONTACT_HEAD_SUBMERGED != 0).to_string(),
        );
        entity.record.custom.insert(
            "physics.oxygenSeconds".into(),
            format!("{:.6}", result.body.oxygen_seconds),
        );
        let binding_id = player.binding.external_entity_id.clone();
        for event in &result.events {
            self.push_effect_event(&binding_id, event.kind, event.amount);
        }
        self.player = Some(IntegratedRuntimePlayerStateV2 {
            binding: player.binding,
            entity_id: player.entity_id,
            body: result.body,
            contact_flags: result.contact_flags,
            selected_slot: input.selected_slot,
            look_pitch: input.look_pitch,
            buttons: input.buttons,
            flags: input.flags,
            last_input_sequence: input.sequence,
        });
        Ok(())
    }

    fn advance_entity_and_gameplay_schedules(&mut self) -> Result<(), IntegratedRuntimeError> {
        let hot_ids = self.entities.hot().keys().copied().collect::<Vec<_>>();
        for id in hot_ids {
            let entity = self
                .entities
                .hot_mut(id)
                .map_err(|error| IntegratedRuntimeError::new("entity-schedule", error.to_string()))?;
            entity.record.age_ticks = entity.record.age_ticks.saturating_add(1);
            entity.last_simulated_tick = self.tick;
        }

        self.gameplay.state.tick = self.tick;
        self.gameplay
            .state
            .combat
            .apply(&CombatCommand::Advance { to_tick: self.tick })
            .map_err(|error| IntegratedRuntimeError::new("combat-schedule", error.message))?;
        let machine_jobs = self
            .gameplay
            .state
            .machines
            .machines
            .values()
            .filter(|machine| machine.active && machine.last_tick < self.tick && machine.recipe_id.is_some())
            .take(INTEGRATED_RUNTIME_MAX_MACHINES_PER_STEP)
            .map(|machine| (machine.machine_id.clone(), machine.revision))
            .collect::<Vec<_>>();
        let mut machines_advanced = 0_u64;
        for (machine_id, expected_revision) in machine_jobs {
            if self
                .gameplay
                .state
                .machines
                .apply(
                    &MachineCommand::Advance {
                        machine_id,
                        expected_revision,
                        to_tick: self.tick,
                    },
                    self.tick,
                )
                .is_ok()
            {
                machines_advanced = machines_advanced.saturating_add(1);
            }
        }
        self.gameplay.state.revision.sequence = self.gameplay.state.revision.sequence.saturating_add(1);
        self.gameplay.state.revision.combat = self.gameplay.state.revision.combat.saturating_add(1);
        if machines_advanced > 0 {
            self.gameplay.state.revision.machines = self.gameplay.state.revision.machines.saturating_add(1);
        }
        self.gameplay_authority_revision = self.gameplay_authority_revision.saturating_add(1);
        Ok(())
    }

    fn push_effect_event(&mut self, entity_external_id: &str, kind: PhysicsEventKindV1, amount: f64) {
        let kind = match kind {
            PhysicsEventKindV1::Jump => IntegratedRuntimeEffectKindV2::Jump,
            PhysicsEventKindV1::Land => IntegratedRuntimeEffectKindV2::Land,
            PhysicsEventKindV1::FallDamage => IntegratedRuntimeEffectKindV2::FallDamage,
            PhysicsEventKindV1::DrownDamage => IntegratedRuntimeEffectKindV2::DrownDamage,
            PhysicsEventKindV1::LiquidEnter => IntegratedRuntimeEffectKindV2::LiquidEnter,
            PhysicsEventKindV1::LiquidExit => IntegratedRuntimeEffectKindV2::LiquidExit,
            PhysicsEventKindV1::ShoreExit => IntegratedRuntimeEffectKindV2::ShoreExit,
        };
        self.effect_events.push_back(IntegratedRuntimeEffectEventV2 {
            sequence: self.next_effect_sequence,
            tick: self.tick,
            entity_external_id: entity_external_id.to_owned(),
            kind,
            amount,
        });
        self.next_effect_sequence = self.next_effect_sequence.saturating_add(1);
        while self.effect_events.len() > INTEGRATED_RUNTIME_MAX_EFFECT_EVENTS {
            self.effect_events.pop_front();
        }
    }

    pub fn accept_inputs(&mut self, inputs: &[RuntimeInputFrameV1]) -> Result<(), IntegratedRuntimeError> {
        self.ensure_running()?;
        if inputs.len() > MAX_INPUT_FRAMES || self.queued_inputs.len().saturating_add(inputs.len()) > MAX_INPUT_FRAMES {
            return Err(IntegratedRuntimeError::new(
                "input-capacity",
                "fixed-step input queue exceeds its bounded capacity",
            ));
        }
        let mut previous = self
            .queued_inputs
            .back()
            .map(|input| input.sequence)
            .or(self.last_input_sequence);
        for input in inputs {
            if input.sequence == 0 || previous.is_some_and(|sequence| input.sequence <= sequence) {
                return Err(IntegratedRuntimeError::new(
                    "input-sequence",
                    "fixed-step input sequences must be nonzero and strictly increasing",
                ));
            }
            if input.target_tick < self.tick
                || input.target_tick > self.tick.saturating_add(INTEGRATED_RUNTIME_MAX_INPUT_LEAD_TICKS)
            {
                return Err(IntegratedRuntimeError::new(
                    "input-target",
                    "fixed-step input target is stale or exceeds the bounded prediction horizon",
                ));
            }
            if input.selected_slot > 8 {
                return Err(IntegratedRuntimeError::new(
                    "input-slot",
                    "fixed-step input selected slot must be in 0..=8",
                ));
            }
            if input.buttons & !RUNTIME_INPUT_BUTTON_MASK_V1 != 0 || input.flags & !RUNTIME_INPUT_FLAG_MASK_V1 != 0 {
                return Err(IntegratedRuntimeError::new(
                    "input-bits",
                    "fixed-step input contains an unregistered button or state flag",
                ));
            }
            if input.buttons & !RUNTIME_INPUT_LIVE_MOVEMENT_BUTTON_MASK_V1 != 0 {
                return Err(IntegratedRuntimeError::new(
                    "input-action-unavailable",
                    "attack, use, interact, mount, flight-toggle, and drop inputs remain fail-closed until their native command dispatch is attached",
                ));
            }
            if input.flags != 0 {
                return Err(IntegratedRuntimeError::new(
                    "input-state-unavailable",
                    "creative, flight, and mounted state flags remain fail-closed until Rust owns their eligibility transitions",
                ));
            }
            previous = Some(input.sequence);
        }
        self.queued_inputs.extend(inputs.iter().copied());
        if let Some(sequence) = previous {
            self.last_input_sequence = Some(sequence);
        }
        self.invalidate_state_hash();
        Ok(())
    }

    #[must_use]
    pub const fn last_applied_input(&self) -> Option<RuntimeInputFrameV1> {
        self.last_applied_input
    }

    pub fn process_network_browser_packet(&mut self, packet: &[u8]) -> Result<Vec<u8>, IntegratedRuntimeError> {
        self.ensure_running()?;
        let response = self
            .network
            .process(packet)
            .map_err(|error| IntegratedRuntimeError::domain("network", error))?;
        self.network_revision = self.network_revision.saturating_add(1);
        self.invalidate_state_hash();
        Ok(response)
    }

    pub fn grant_gameplay_actor(
        &mut self,
        actor_id: impl Into<String>,
        grant: blockwild_gameplay::ActorGrant,
    ) -> Result<(), IntegratedRuntimeError> {
        self.ensure_running()?;
        self.gameplay
            .grant_actor(actor_id, grant)
            .map_err(|error| IntegratedRuntimeError::new("gameplay-grant", error.message))?;
        self.gameplay_authority_revision = self.gameplay_authority_revision.saturating_add(1);
        self.invalidate_state_hash();
        Ok(())
    }

    pub fn upsert_network_peer_grant(&mut self, grant: NetworkPeerGrantV1) -> Result<(), IntegratedRuntimeError> {
        self.ensure_running()?;
        grant
            .validate()
            .map_err(|error| IntegratedRuntimeError::domain("network-grant", error))?;
        self.network
            .upsert_peer_grant(grant)
            .map_err(|error| IntegratedRuntimeError::domain("network-grant", error))?;
        self.network_revision = self.network_revision.saturating_add(1);
        self.invalidate_state_hash();
        Ok(())
    }

    pub fn upsert_network_agent_grant(&mut self, grant: AgentCapabilityGrantV1) -> Result<(), IntegratedRuntimeError> {
        self.ensure_running()?;
        grant
            .validate()
            .map_err(|error| IntegratedRuntimeError::domain("agent-grant", error))?;
        self.network
            .upsert_agent_grant(grant)
            .map_err(|error| IntegratedRuntimeError::domain("agent-grant", error))?;
        self.network_revision = self.network_revision.saturating_add(1);
        self.invalidate_state_hash();
        Ok(())
    }

    pub fn upsert_network_replication_record(
        &mut self,
        value: ScopedDeltaRecordV1,
    ) -> Result<(), IntegratedRuntimeError> {
        self.ensure_running()?;
        let key = value.record.key();
        let hash = value.record.payload_hash;
        self.replication
            .upsert(value)
            .map_err(|error| IntegratedRuntimeError::domain("network-replication", error))?;
        self.replication_record_hashes.insert(key, hash);
        self.network_revision = self.network_revision.saturating_add(1);
        self.invalidate_state_hash();
        Ok(())
    }

    pub fn remove_network_replication_record(&mut self, value: &NetworkDeltaRecordV1) -> bool {
        let key = value.key();
        let removed = self.replication.remove(value);
        if removed {
            self.replication_record_hashes.remove(&key);
            self.network_revision = self.network_revision.saturating_add(1);
            self.invalidate_state_hash();
        }
        removed
    }

    pub fn build_network_delta(
        &self,
        source: InterestDeltaBuildSourceV1,
        interest: &NetworkInterestSetV1,
    ) -> Result<(NetworkDeltaV1, InterestSelectionStatsV1), IntegratedRuntimeError> {
        self.replication
            .build_delta(source, interest)
            .map_err(|error| IntegratedRuntimeError::domain("network-delta", error))
    }

    pub fn network_reconnect_checkpoint(
        &self,
        session_id: &str,
        peer_id: &str,
        connection_generation: u64,
    ) -> Result<Option<NetworkReconnectCheckpointV1>, IntegratedRuntimeError> {
        self.network
            .reconnect_checkpoint(session_id, peer_id, connection_generation)
            .map_err(|error| IntegratedRuntimeError::domain("network-reconnect", error))
    }

    pub fn release_network_peer(&mut self, peer_id: &str) -> Result<(), IntegratedRuntimeError> {
        self.ensure_running()?;
        self.network.release_peer(peer_id);
        self.network_revision = self.network_revision.saturating_add(1);
        self.invalidate_state_hash();
        Ok(())
    }

    pub fn release_network_command(&mut self, command_id: &str) -> Result<(), IntegratedRuntimeError> {
        self.ensure_running()?;
        self.network.release_command(command_id);
        self.network_revision = self.network_revision.saturating_add(1);
        self.invalidate_state_hash();
        Ok(())
    }

    pub fn capture_simulation_window(
        &self,
        origin: ReadOriginV1,
        size: ReadSizeV1,
    ) -> Result<WorldReadWindowV1, IntegratedRuntimeError> {
        let page = WorldReadPageV1::capture(&self.world, origin, size)
            .map_err(|error| IntegratedRuntimeError::domain("world-read", error))?;
        page_to_simulation_window(&page)
    }

    pub fn generate_and_install_chunk(
        &mut self,
        request: &GenerateChunkRequestV2,
    ) -> Result<GeneratedChunkInstallSummaryV2, IntegratedRuntimeError> {
        self.ensure_running()?;
        self.validate_generation_request(request)?;
        let cancellation = blockwild_generation::CancellationToken::default();
        let outcome = self
            .generation
            .generate(request, &cancellation, || request.epoch, || Some(request.revision))
            .map_err(|error| IntegratedRuntimeError::domain("generation", error))?;
        let GenerationOutcome::Ready { chunk, cache_hit } = outcome else {
            return Err(IntegratedRuntimeError::new(
                "stale-generation",
                "generation result became stale before authority installation",
            ));
        };
        self.install_generated_chunk(request, *chunk, cache_hit)
    }

    fn validate_generation_request(&self, request: &GenerateChunkRequestV2) -> Result<(), IntegratedRuntimeError> {
        request
            .validate()
            .map_err(|error| IntegratedRuntimeError::domain("generation", error))?;
        if request.seed_text != self.config.world_seed
            || request.content_hash != self.config.content_hash.to_hex()
            || request.generator_hash != self.config.generator_hash.to_hex()
        {
            return Err(IntegratedRuntimeError::new(
                "generation-identity",
                "generation request does not match the integrated runtime seed and content identities",
            ));
        }
        Ok(())
    }

    fn install_generated_chunk(
        &mut self,
        request: &GenerateChunkRequestV2,
        chunk: ChunkPayloadV2,
        cache_hit: bool,
    ) -> Result<GeneratedChunkInstallSummaryV2, IntegratedRuntimeError> {
        chunk
            .validate(request)
            .map_err(|error| IntegratedRuntimeError::domain("generation-result", error))?;
        let address = self.world.active_address().clone();
        let mut installs = Vec::with_capacity(12);
        for section_y in 0_i16..12_i16 {
            let offset = section_y as usize * WORLD_SECTION_CELL_COUNT_V1;
            let cells = chunk.blocks[offset..offset + WORLD_SECTION_CELL_COUNT_V1]
                .iter()
                .map(|block_id| generated_cell(*block_id))
                .collect();
            let install = SectionInstallV1 {
                address: WorldSectionAddressV1 {
                    world: address.clone(),
                    chunk_x: chunk.cx,
                    chunk_z: chunk.cz,
                    section_y,
                },
                cells,
                source_revision: u64::from(chunk.revision),
                source_hash: chunk.chunk_hash.clone(),
            };
            install
                .validate()
                .map_err(|error| IntegratedRuntimeError::domain("world-install", error))?;
            installs.push(install);
        }
        let markers = chunk
            .markers
            .iter()
            .map(|marker| (marker.key.clone(), marker.canonical_json.clone()))
            .collect::<Vec<_>>();
        let marker_count = markers.len() as u32;
        let auxiliary = ChunkAuxiliaryDataV1 {
            address: AuthorityChunkAddressV1 {
                world: address,
                chunk_x: chunk.cx,
                chunk_z: chunk.cz,
            },
            source_revision: u64::from(chunk.revision),
            source_hash: chunk.chunk_hash,
            heightmap: chunk.heightmap,
            biomes: chunk.biomes,
            section_block_counts: chunk.section_block_counts,
            sky_tops: chunk.sky_tops,
            light: chunk.light,
            light_indices: chunk.light_indices,
            leaf_indices: chunk.leaf_indices,
            markers,
        };
        auxiliary
            .validate()
            .map_err(|error| IntegratedRuntimeError::domain("world-install", error))?;

        // Every fallible content/address validation completed before the first
        // authoritative write. These installs cannot fail without an internal
        // contract regression, so a whole-world clone is unnecessary.
        for install in installs {
            self.world
                .install_section_for_replay(install)
                .expect("prevalidated generated section install");
        }
        self.world
            .install_chunk_auxiliary(auxiliary)
            .expect("prevalidated generated chunk metadata install");
        self.invalidate_state_hash();
        Ok(GeneratedChunkInstallSummaryV2 {
            chunk_x: request.cx,
            chunk_z: request.cz,
            sections_installed: 12,
            markers_installed: marker_count,
            cache_hit,
            state_hash: self.state_hash(),
        })
    }

    pub fn run_physics(&self, input: &PhysicsStepInputV1) -> Result<PhysicsStepResultV1, IntegratedRuntimeError> {
        self.ensure_current_simulation_identity(&input.identity.world)?;
        step_physics(input).map_err(|error| IntegratedRuntimeError::domain("physics", error))
    }

    pub fn run_liquids(&self, input: &LiquidFrontierStepV1) -> Result<LiquidFrontierResultV1, IntegratedRuntimeError> {
        self.ensure_current_simulation_identity(&input.identity.world)?;
        step_liquid_frontier(input).map_err(|error| IntegratedRuntimeError::domain("liquids", error))
    }

    pub fn run_path(&self, input: &PathJobV1) -> Result<PathJobResultV1, IntegratedRuntimeError> {
        self.ensure_current_simulation_identity(&input.identity.world)?;
        find_path(input).map_err(|error| IntegratedRuntimeError::domain("path", error))
    }

    pub fn run_air_zones(
        &self,
        input: &AirZoneTopologyJobV1,
    ) -> Result<AirZoneTopologyResultV1, IntegratedRuntimeError> {
        self.ensure_current_simulation_identity(&input.identity.world)?;
        solve_air_zones(input).map_err(|error| IntegratedRuntimeError::domain("air", error))
    }

    fn ensure_current_simulation_identity(&self, identity: &WorldIdentityV1) -> Result<(), IntegratedRuntimeError> {
        let current = self.simulation_identity()?;
        if identity != &current {
            return Err(IntegratedRuntimeError::new(
                "stale-simulation",
                "simulation job references an obsolete world snapshot",
            ));
        }
        Ok(())
    }

    pub fn simulation_identity(&self) -> Result<WorldIdentityV1, IntegratedRuntimeError> {
        let identity = self.world.identity();
        Ok(WorldIdentityV1 {
            address: SimulationWorldAddressV1 {
                universe_id: identity.address.universe_id,
                location_id: identity.address.location_id,
            },
            revision: WorldRevisionV1 {
                epoch: identity.revision.epoch,
                mutation: identity.revision.mutation,
                residency: identity.revision.residency,
            },
            state_hash: parse_canonical_hash(&identity.state_hash)?,
        })
    }

    pub fn network_identity(&self) -> Result<NetworkAuthorityIdentityV1, IntegratedRuntimeError> {
        let revision = self.revision();
        NetworkAuthorityIdentityV1::new(
            NetworkWorldAddressV1 {
                universe_id: self.config.universe_id.clone(),
                location_id: self.config.location_id.clone(),
            },
            NetworkAuthorityRevisionV1 {
                epoch: revision.epoch,
                world: revision.world,
                entities: revision.entities,
                gameplay: revision.gameplay,
                persistence: revision.persistence,
            },
        )
        .map_err(|error| IntegratedRuntimeError::domain("network-identity", error))
    }

    pub fn shutdown(&mut self) {
        self.persistence_dispatcher.close();
        self.save_stages.clear();
        self.prepared_persistence_commits.clear();
        self.recovery_assemblers.clear();
        self.recovered_save_sets.clear();
        self.hydrated_exports.clear();
        self.queued.clear();
        self.receipts.clear();
        self.idempotency.clear();
        self.idempotency_order.clear();
        self.queued_inputs.clear();
        self.stopped = true;
    }

    fn cache_idempotent_receipt(
        &mut self,
        batch: &IntegratedRuntimeBatchV2,
        key: Option<String>,
        receipt: &IntegratedRuntimeReceiptV2,
    ) {
        let (Some(key), Some(reliability)) = (key, batch.reliability.as_ref()) else {
            return;
        };
        self.idempotency.insert(
            key.clone(),
            IntegratedRuntimeIdempotencyEntryV2 {
                command_hash: reliability.command_hash,
                receipt: receipt.clone(),
            },
        );
        self.idempotency_order.push_back(key);
        while self.idempotency_order.len() > INTEGRATED_RUNTIME_MAX_IDEMPOTENCY_RECEIPTS {
            if let Some(expired) = self.idempotency_order.pop_front() {
                self.idempotency.remove(&expired);
            }
        }
    }

    fn ensure_running(&self) -> Result<(), IntegratedRuntimeError> {
        if self.stopped {
            Err(IntegratedRuntimeError::new(
                "engine-stopped",
                "integrated runtime is stopped",
            ))
        } else {
            Ok(())
        }
    }

    fn invalidate_state_hash(&self) {
        self.state_hash_cache.set(None);
    }
}

fn page_to_simulation_window(page: &WorldReadPageV1) -> Result<WorldReadWindowV1, IntegratedRuntimeError> {
    // Authority pages and simulation windows intentionally use distinct hash
    // domains. Seal once after the zero-copy stream conversion; reusing the
    // authority page hash here would make every native simulation job reject.
    Ok(WorldReadWindowV1 {
        address: SimulationWorldAddressV1 {
            universe_id: page.address.universe_id.clone(),
            location_id: page.address.location_id.clone(),
        },
        origin: blockwild_simulation::CellPos::new(page.origin.x, page.origin.y, page.origin.z),
        size: [u32::from(page.size.x), u32::from(page.size.y), u32::from(page.size.z)],
        identity: WorldIdentityV1 {
            address: SimulationWorldAddressV1 {
                universe_id: page.identity.address.universe_id.clone(),
                location_id: page.identity.address.location_id.clone(),
            },
            revision: WorldRevisionV1 {
                epoch: page.identity.revision.epoch,
                mutation: page.identity.revision.mutation,
                residency: page.identity.revision.residency,
            },
            state_hash: parse_canonical_hash(&page.identity.state_hash)?,
        },
        loaded_mask: page.streams.loaded_mask.to_vec(),
        boundary: page.streams.boundary.to_vec(),
        blocks: page.streams.blocks.to_vec(),
        facing: page.streams.facing.to_vec(),
        liquid_kind: page.streams.liquid_kind.to_vec(),
        liquid_level: page.streams.liquid_level.to_vec(),
        flags: page.streams.flags.to_vec(),
        snapshot_hash: CanonicalHash::default(),
    }
    .seal())
}

fn save_stage_progress(stage: &IntegratedRuntimeSaveStageV1) -> IntegratedRuntimeSaveProgressV1 {
    IntegratedRuntimeSaveProgressV1 {
        stage_id: stage.stage_id.clone(),
        received_chunks: stage.chunks.len() as u32,
        chunk_count: stage.chunk_count,
        received_bytes: stage.chunks.values().map(Vec::len).sum::<usize>() as u64,
        set_hash: CanonicalHash::default(),
        manifest_hash: CanonicalHash::default(),
        dispatcher_request_id: None,
        remaining_dirty_records: 0,
    }
}

fn generated_cell(block_id: u16) -> WorldCellV1 {
    let liquid = match block_id {
        GeneratedBlock::WATER => LiquidMetadataV1 {
            kind: WorldLiquidKindV1::Water,
            level: 0,
            source: true,
            falling: false,
            contains_water: true,
            waterlogged: false,
        },
        GeneratedBlock::LAVA => LiquidMetadataV1 {
            kind: WorldLiquidKindV1::Lava,
            level: 0,
            source: true,
            falling: false,
            contains_water: false,
            waterlogged: false,
        },
        _ => LiquidMetadataV1::default(),
    };
    WorldCellV1 {
        block_id,
        facing: 0,
        liquid,
    }
}

fn parse_canonical_hash(value: &str) -> Result<CanonicalHash, IntegratedRuntimeError> {
    if value.len() != 32 {
        return Err(IntegratedRuntimeError::new(
            "canonical-hash",
            "canonical hash must contain 32 hexadecimal characters",
        ));
    }
    let mut bytes = [0_u8; 16];
    for (index, target) in bytes.iter_mut().enumerate() {
        let offset = index * 2;
        *target = u8::from_str_radix(&value[offset..offset + 2], 16).map_err(|_| {
            IntegratedRuntimeError::new("canonical-hash", "canonical hash contains non-hexadecimal bytes")
        })?;
    }
    Ok(CanonicalHash(bytes))
}

fn write_runtime_revision(hasher: &mut CanonicalHasher, revision: IntegratedRuntimeRevisionV2) {
    hasher.write_u64(revision.epoch);
    hasher.write_u64(revision.world);
    hasher.write_u64(revision.entities);
    hasher.write_u64(revision.gameplay);
    hasher.write_u64(revision.persistence);
    hasher.write_u64(revision.network);
    hasher.write_u64(revision.simulation);
}

fn write_runtime_input(hasher: &mut CanonicalHasher, input: &RuntimeInputFrameV1) {
    hasher.write_u64(input.sequence);
    hasher.write_u64(input.target_tick);
    hasher.write_i32(i32::from(input.move_x));
    hasher.write_i32(i32::from(input.move_z));
    hasher.write_i32(i32::from(input.look_yaw));
    hasher.write_i32(i32::from(input.look_pitch));
    hasher.write_u32(input.buttons);
    hasher.write_u16(u16::from(input.selected_slot));
    hasher.write_u16(u16::from(input.flags));
}

fn write_player_state(hasher: &mut CanonicalHasher, player: &IntegratedRuntimePlayerStateV2) {
    let binding = &player.binding;
    hasher.write_str(&binding.external_entity_id);
    for value in [
        binding.radius,
        binding.standing_height,
        binding.crouching_height,
        binding.mass,
        binding.walk_speed,
        binding.sprint_speed,
        binding.creative_flight_speed,
        binding.maximum_oxygen_seconds,
        player.body.position.x,
        player.body.position.y,
        player.body.position.z,
        player.body.velocity.x,
        player.body.velocity.y,
        player.body.velocity.z,
        player.body.radius,
        player.body.height,
        player.body.mass,
        player.body.fall_distance,
        player.body.oxygen_seconds,
        player.body.drowning_accumulator,
        player.body.swim_entry_momentum_speed,
        player.body.swim_surface_breach_seconds,
        player.body.swim_stroke_cooldown_seconds,
    ] {
        hasher.write_u64(value.to_bits());
    }
    hasher.write_u64(player.entity_id.packed());
    hasher.write_u16(u16::from(player.body.grounded));
    hasher.write_u16(u16::from(player.body.crouching));
    hasher.write_u16(u16::from(player.body.swim_surface_breach_ready));
    hasher.write_u16(u16::from(player.body.swim_surface_bob_active));
    hasher.write_u16(player.contact_flags);
    hasher.write_u16(u16::from(player.selected_slot));
    hasher.write_i32(i32::from(player.look_pitch));
    hasher.write_u32(player.buttons);
    hasher.write_u16(u16::from(player.flags));
    hasher.write_u64(player.last_input_sequence);
}

fn write_effect_event(hasher: &mut CanonicalHasher, event: &IntegratedRuntimeEffectEventV2) {
    hasher.write_u64(event.sequence);
    hasher.write_u64(event.tick);
    hasher.write_str(&event.entity_external_id);
    hasher.write_u16(event.kind as u16);
    hasher.write_u64(event.amount.to_bits());
}

fn normalized_i16(value: i16) -> f64 {
    (f64::from(value) / 32_767.0).clamp(-1.0, 1.0)
}

fn floor_i32(value: f64) -> Result<i32, IntegratedRuntimeError> {
    let value = value.floor();
    if !value.is_finite() || value < f64::from(i32::MIN) || value > f64::from(i32::MAX) {
        Err(IntegratedRuntimeError::new(
            "player-position",
            "bound player position is outside the simulation coordinate range",
        ))
    } else {
        Ok(value as i32)
    }
}

fn parse_custom_bool(values: &BTreeMap<String, String>, key: &str, fallback: bool) -> bool {
    values
        .get(key)
        .and_then(|value| value.parse::<bool>().ok())
        .unwrap_or(fallback)
}

fn hash_runtime_receipt(
    batch_id: &str,
    before: &IntegratedRuntimeIdentityV2,
    after: &IntegratedRuntimeIdentityV2,
) -> CanonicalHash {
    let mut hasher = CanonicalHasher::new("blockwild-integrated-receipt-v2");
    hasher.write_str(batch_id);
    hasher.write_bytes(before.state_hash.as_bytes());
    hasher.write_bytes(after.state_hash.as_bytes());
    write_runtime_revision(&mut hasher, after.revision);
    hasher.finish()
}

fn hash_runtime_replay_entry(entry: &IntegratedRuntimeReplayEntryV2) -> CanonicalHash {
    let mut hasher = CanonicalHasher::new("blockwild-integrated-replay-entry-v2");
    hasher.write_u64(entry.sequence);
    hasher.write_str(&entry.batch_id);
    hasher.write_bytes(entry.before_hash.as_bytes());
    hasher.write_bytes(entry.after_hash.as_bytes());
    hasher.write_bytes(entry.receipt_hash.as_bytes());
    hasher.finish()
}

fn canonical_hash_lanes(hash: CanonicalHash) -> (u64, u64) {
    let bytes = hash.as_bytes();
    (
        u64::from_le_bytes(bytes[..8].try_into().expect("canonical hash low lane")),
        u64::from_le_bytes(bytes[8..].try_into().expect("canonical hash high lane")),
    )
}

fn validate_label(value: &str, label: &str) -> Result<(), IntegratedRuntimeError> {
    let length = value.encode_utf16().count();
    if length == 0 || length > 180 || value.chars().any(char::is_control) {
        return Err(IntegratedRuntimeError::new(
            "invalid-label",
            format!("{label} must contain 1..180 visible UTF-16 code units"),
        ));
    }
    Ok(())
}

fn reject_batch(
    batch_id: &str,
    code: impl Into<String>,
    message: &str,
    current: IntegratedRuntimeIdentityV2,
) -> IntegratedRuntimeReceiptV2 {
    IntegratedRuntimeReceiptV2::Rejected(IntegratedRuntimeRejectionV2 {
        batch_id: batch_id.to_owned(),
        code: code.into(),
        message: message.to_owned(),
        current,
    })
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IntegratedRuntimeError {
    pub code: String,
    pub message: String,
}

impl IntegratedRuntimeError {
    #[must_use]
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }

    fn domain(domain: &str, error: impl fmt::Display) -> Self {
        Self::new(format!("{domain}-error"), error.to_string())
    }
}

impl fmt::Display for IntegratedRuntimeError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for IntegratedRuntimeError {}

impl From<ContractError> for IntegratedRuntimeError {
    fn from(error: ContractError) -> Self {
        Self::domain("simulation", error)
    }
}

#[cfg(test)]
mod tests {
    use blockwild_authority::{
        CellPositionV1, SectionInstallV1, WORLD_SECTION_CELL_COUNT_V1, WorldCellV1, WorldSectionAddressV1,
    };
    use blockwild_entity::{ENTITY_COMMAND_SCHEMA, EntityCommand, EntityCompatibilityRecord, EntityResidency};

    use super::*;

    fn runtime_with_section() -> IntegratedRuntimeV2 {
        let mut runtime = IntegratedRuntimeV2::new(IntegratedRuntimeConfigV2::default()).unwrap();
        let address = runtime.world().active_address().clone();
        for section_y in [4_i16, 7_i16, 8_i16] {
            let mut cells = vec![WorldCellV1::default(); WORLD_SECTION_CELL_COUNT_V1];
            if section_y == 7 {
                for z in 0..16 {
                    for x in 0..16 {
                        cells[x + 16 * (z + 16 * 15)] = WorldCellV1 {
                            block_id: 1,
                            ..WorldCellV1::default()
                        };
                    }
                }
            }
            runtime
                .world_mut_for_platform_install()
                .install_section_for_replay(SectionInstallV1 {
                    address: WorldSectionAddressV1 {
                        world: address.clone(),
                        chunk_x: 0,
                        chunk_z: 0,
                        section_y,
                    },
                    cells,
                    source_revision: u64::from(section_y as u16),
                    source_hash: format!("{section_y:032x}"),
                })
                .unwrap();
        }
        runtime
    }

    fn runtime_with_bound_player() -> IntegratedRuntimeV2 {
        let mut runtime = runtime_with_section();
        let mut record = EntityCompatibilityRecord::new("player:one", "player:one", "player");
        record.class = EntityClass::Player;
        record.position = EntityVec3::new(8.0, 63.5, 8.0);
        record.health = 20.0;
        record.maximum_health = 20.0;
        record.custom.insert("physics.grounded".into(), "true".into());
        let mut batch = IntegratedRuntimeBatchV2::empty("spawn-player", runtime.identity());
        batch.entities.push(EntityCommandBatch {
            schema: ENTITY_COMMAND_SCHEMA,
            sequence: 1,
            expected_revision: 0,
            tick: 0,
            commands: vec![EntityCommand::Spawn {
                record,
                residency: EntityResidency::Hot,
            }],
        });
        assert!(runtime.commit(batch).accepted());
        runtime
            .bind_player(RuntimePlayerBindingWireV1 {
                external_entity_id: "player:one".into(),
                radius: 0.35,
                standing_height: 1.8,
                crouching_height: 1.35,
                mass: 80.0,
                walk_speed: 4.3,
                sprint_speed: 6.2,
                creative_flight_speed: 8.0,
                maximum_oxygen_seconds: 15.0,
            })
            .unwrap();
        runtime
    }

    fn accept_next_authority_commit(runtime: &mut IntegratedRuntimeV2) {
        let packet = runtime
            .poll_persistence_platform(INTEGRATED_RUNTIME_PERSISTENCE_MAX_PACKET_BYTES)
            .unwrap()
            .expect("authority commit platform packet");
        let request = blockwild_persistence::decode_persistence_browser_request_v1(&packet.bytes)
            .expect("decode authority commit");
        let blockwild_persistence::PersistenceBrowserRequestV1::Commit {
            request_id,
            transaction,
            checkpoint,
        } = request
        else {
            panic!("expected authority commit request")
        };
        let response = blockwild_persistence::encode_persistence_browser_response_v1(
            &blockwild_persistence::PersistenceBrowserResponseV1::Commit(
                blockwild_persistence::PersistenceBrowserCommitResultV1 {
                    request_id,
                    code: blockwild_persistence::PersistenceBrowserCommitCodeV1::Committed,
                    transaction_id: transaction.transaction_id.clone(),
                    journal_sequence: transaction.next_journal_sequence,
                    durable_hash: CanonicalHash([0x77; 16]),
                    checkpoint_hash: checkpoint.checkpoint_hash,
                    verified_readback: true,
                    message: "durable fixture".into(),
                },
            ),
        )
        .expect("encode durable authority receipt");
        let outcome = runtime
            .complete_persistence_platform(packet.transfer_token, &response)
            .expect("accept durable authority receipt");
        assert_eq!(outcome.status, PersistenceDispatchStatusV1::Accepted);
    }

    fn recovered_authority_save(runtime: &IntegratedRuntimeV2) -> PagedRecoveryCompleteV1 {
        PagedRecoveryCompleteV1 {
            checkpoint: runtime
                .persistence_authority()
                .checkpoint()
                .expect("durable checkpoint")
                .clone(),
            payloads: runtime
                .persistence_authority()
                .records()
                .iter()
                .map(|(address, record)| (address.clone(), record.payload.clone()))
                .collect(),
            missing_record_keys: Vec::new(),
        }
    }

    fn loaded_block_id(runtime: &IntegratedRuntimeV2, position: CellPositionV1) -> u16 {
        let blockwild_authority::WorldCellReadV1::Loaded { cell, .. } = runtime.world().read_cell(position) else {
            panic!("fixture cell must be loaded")
        };
        cell.block_id
    }

    #[test]
    fn integrated_identity_is_stable_for_equal_runtime_state() {
        let first = runtime_with_section();
        let second = runtime_with_section();
        assert_eq!(first.identity(), second.identity());
        assert_eq!(first.network_identity().unwrap(), second.network_identity().unwrap());
    }

    #[test]
    fn canonical_high_byte_fixture_matches_the_typescript_oracle() {
        let mut hasher = CanonicalHasher::new("legacy-binary");
        hasher.write_bytes(&[0x80, 0xff]);
        assert_eq!(hasher.finish().to_hex(), "1077e0e354d95fe1f0fc9f1ea3ffc021");
    }

    #[test]
    fn fixed_step_input_moves_the_bound_authoritative_player_and_updates_vitals() {
        let mut runtime = runtime_with_bound_player();
        let before = runtime.player().unwrap().body.position;
        runtime
            .accept_inputs(&[RuntimeInputFrameV1 {
                sequence: 1,
                target_tick: 1,
                move_z: 32_767,
                selected_slot: 4,
                ..RuntimeInputFrameV1::default()
            }])
            .unwrap();
        runtime.step(1_000_000, 8_000).unwrap();
        let summary = runtime.step(1_050_000, 8_000).unwrap();
        let player = runtime.player().unwrap();
        assert_eq!(summary.fixed_steps, 1);
        assert_eq!(summary.inputs_applied, 1);
        assert_ne!(player.body.position, before);
        assert_eq!(player.selected_slot, 4);
        let entity = runtime.entities().hot().get(&player.entity_id).unwrap();
        assert!((f64::from(entity.record.position.z) - player.body.position.z).abs() < 1.0e-5);
        assert_eq!(entity.record.age_ticks, 1);
        assert_eq!(runtime.gameplay().state.tick, 1);
        assert_eq!(runtime.gameplay().state.combat.tick, 1);
    }

    #[test]
    fn fixed_step_replay_is_equivalent_at_30_60_and_120_hz() {
        fn run(refresh_hz: u64) -> (CanonicalHash, SimulationVec3, u64) {
            let mut runtime = runtime_with_bound_player();
            runtime
                .accept_inputs(&[RuntimeInputFrameV1 {
                    sequence: 1,
                    target_tick: 1,
                    move_x: 8_192,
                    move_z: 32_767,
                    buttons: RUNTIME_INPUT_BUTTON_SPRINT_V1,
                    ..RuntimeInputFrameV1::default()
                }])
                .unwrap();
            let start = 1_000_000_u64;
            runtime.step(start, 8_000).unwrap();
            for frame in 1..=refresh_hz {
                let timestamp = start + frame * 1_000_000 / refresh_hz;
                runtime.step(timestamp, 8_000).unwrap();
            }
            (
                runtime.state_hash(),
                runtime.player().unwrap().body.position,
                runtime.tick(),
            )
        }
        let at_30 = run(30);
        let at_60 = run(60);
        let at_120 = run(120);
        assert_eq!(at_30, at_60);
        assert_eq!(at_60, at_120);
        assert_eq!(at_120.2, 20);
    }

    #[test]
    fn registered_but_unintegrated_action_bits_fail_closed() {
        let mut runtime = runtime_with_bound_player();
        let before = runtime.identity();
        let error = runtime
            .accept_inputs(&[RuntimeInputFrameV1 {
                sequence: 1,
                target_tick: 1,
                buttons: blockwild_runtime_wire::RUNTIME_INPUT_BUTTON_PRIMARY_ATTACK_V1,
                ..RuntimeInputFrameV1::default()
            }])
            .unwrap_err();
        assert_eq!(error.code, "input-action-unavailable");
        assert_eq!(runtime.identity(), before);
    }

    #[test]
    fn registered_but_unintegrated_state_flags_fail_closed() {
        let mut runtime = runtime_with_bound_player();
        let before = runtime.identity();
        let error = runtime
            .accept_inputs(&[RuntimeInputFrameV1 {
                sequence: 1,
                target_tick: 1,
                flags: blockwild_runtime_wire::RUNTIME_INPUT_FLAG_FLYING_V1,
                ..RuntimeInputFrameV1::default()
            }])
            .unwrap_err();
        assert_eq!(error.code, "input-state-unavailable");
        assert_eq!(runtime.identity(), before);
    }

    #[test]
    fn persistence_dispatcher_owns_tokens_completion_and_recovery_shell_state() {
        let mut runtime = runtime_with_section();
        let receipt = runtime
            .dispatch_persistence(RuntimePersistenceDispatchWireV1::Estimate {
                world_id: "world:runtime".into(),
            })
            .unwrap();
        assert_eq!(receipt.request_id, Some(1));
        assert_eq!(receipt.pending, 1);
        let packet = runtime
            .poll_persistence_platform(INTEGRATED_RUNTIME_PERSISTENCE_MAX_PACKET_BYTES)
            .unwrap()
            .unwrap();
        assert_eq!(packet.request_id, 1);
        let request = blockwild_persistence::decode_persistence_platform_request_v1(&packet.bytes).unwrap();
        let response = blockwild_persistence::encode_persistence_platform_response_v1(
            &blockwild_persistence::PersistencePlatformResponseV1 {
                request_id: request.request_id,
                operation: request.operation,
                code: blockwild_persistence::PersistencePlatformResultCodeV1::Accepted,
                storage_revision: 9,
                durable_hash: CanonicalHash([7; 16]),
                next_cursor: None,
                payload: Vec::new(),
                message: "estimated".into(),
            },
        )
        .unwrap();
        let outcome = runtime
            .complete_persistence_platform(packet.transfer_token, &response)
            .unwrap();
        assert_eq!(
            outcome.status,
            blockwild_persistence::PersistenceDispatchStatusV1::Accepted
        );
        assert!(runtime.persistence_dispatcher().is_idle());
        let checkpoint = runtime.persistence_dispatcher_checkpoint().unwrap();
        let mut restored = runtime_with_section();
        restored.restore_persistence_dispatcher_checkpoint(&checkpoint).unwrap();
        assert_eq!(
            restored.persistence_dispatcher().state_hash(),
            runtime.persistence_dispatcher().state_hash(),
        );
        restored
            .dispatch_persistence(RuntimePersistenceDispatchWireV1::Close)
            .unwrap();
        assert!(restored.persistence_dispatcher().is_closed());
    }

    #[test]
    fn compatibility_save_staging_is_bounded_idempotent_and_cancellable() {
        let mut runtime = runtime_with_section();
        let first = vec![0x80, 0xff, 0, 0x7f];
        let staged = runtime
            .stage_compatibility_save_chunk("sävë-一-🌿", 0, 2, 7, &first)
            .unwrap();
        assert_eq!(staged.received_chunks, 1);
        let identity_after_first = runtime.identity();
        assert_eq!(
            runtime
                .stage_compatibility_save_chunk("sävë-一-🌿", 0, 2, 7, &first)
                .unwrap(),
            staged,
            "an identical retry is idempotent",
        );
        assert_eq!(runtime.identity(), identity_after_first);
        let conflict = runtime
            .stage_compatibility_save_chunk("sävë-一-🌿", 0, 2, 7, &[0x80, 0xfe, 0, 0x7f])
            .unwrap_err();
        assert_eq!(conflict.code, "save-stage-conflict");
        assert_eq!(runtime.identity(), identity_after_first);
        let second_stage = runtime
            .stage_compatibility_save_chunk("another", 0, 1, 1, &[1])
            .unwrap_err();
        assert_eq!(second_stage.code, "save-stage-capacity");
        let cancelled = runtime.cancel_compatibility_save_stage("sävë-一-🌿").unwrap();
        assert_eq!(cancelled.received_chunks, 1);
        assert_eq!(
            runtime.cancel_compatibility_save_stage("sävë-一-🌿").unwrap_err().code,
            "save-stage-stale",
        );
        runtime
            .stage_compatibility_save_chunk("after-cancel", 0, 1, 2, &[1, 2])
            .unwrap();
        runtime.shutdown();
        assert_eq!(
            runtime
                .cancel_compatibility_save_stage("after-cancel")
                .unwrap_err()
                .code,
            "engine-stopped",
            "forced close makes every staged generation terminal",
        );
    }

    #[test]
    fn durable_receipt_alone_advances_persistence_and_racing_dirty_save_survives() {
        let mut runtime = runtime_with_section();
        runtime
            .stage_compatibility_save_chunk("first", 0, 1, 4, &[0x80, 0xff, 1, 2])
            .unwrap();
        let finalized = runtime.finalize_compatibility_save("first", 10).unwrap();
        assert_eq!(finalized.dispatcher_request_id, Some(1));
        assert_eq!(runtime.persistence_authority().persistence_revision(), 0);
        assert!(runtime.persistence_authority().diagnostics().commit_in_flight);

        runtime
            .stage_compatibility_save_chunk("racing", 0, 1, 4, &[0x80, 0xff, 9, 2])
            .unwrap();
        let racing = runtime.finalize_compatibility_save("racing", 11).unwrap();
        assert_eq!(racing.dispatcher_request_id, None);
        assert!(racing.remaining_dirty_records > 0);

        accept_next_authority_commit(&mut runtime);
        assert_eq!(runtime.persistence_authority().persistence_revision(), 1);
        assert!(
            !runtime.persistence_authority().dirty_records().is_empty(),
            "dirty signatures changed during the in-flight commit and must remain queued",
        );
        assert!(runtime.persistence_authority().diagnostics().commit_in_flight);
        assert_eq!(runtime.persistence_dispatcher().diagnostics().queued, 1);
    }

    #[test]
    fn recovery_hydration_is_atomic_and_compatibility_bytes_are_export_only() {
        let mut source = runtime_with_section();
        let position = CellPositionV1 { x: 1, y: 1, z: 1 };
        let expected = source.world().identity();
        let mut batch = IntegratedRuntimeBatchV2::empty("saved-world-edit", source.identity());
        batch.world.push(WorldMutationBatchR4V1 {
            schema_version: blockwild_authority::WORLD_AUTHORITY_SCHEMA_V1,
            batch_id: "saved-world-edit".into(),
            authority_id: "fixture".into(),
            address: expected.address,
            expected_revision: expected.revision,
            commands: vec![blockwild_authority::WorldMutationCommandR4V1::SetBlock {
                position,
                block_id: 1,
                facing: None,
            }],
        });
        assert!(source.commit(batch).accepted());
        let compatibility = "compatibility-shell-🌿".as_bytes();
        source
            .stage_compatibility_save_chunk("source", 0, 1, compatibility.len() as u64, compatibility)
            .unwrap();
        source.finalize_compatibility_save("source", 12).unwrap();
        accept_next_authority_commit(&mut source);
        let recovered = recovered_authority_save(&source);

        let mut target = runtime_with_section();
        assert_eq!(loaded_block_id(&target, position), 0);
        let mut mismatched = recovered.clone();
        mismatched.checkpoint.content_hash = CanonicalHash([0x44; 16]);
        target.recovered_save_sets.insert("mismatch".into(), mismatched);
        let before_mismatch = target.identity();
        assert_eq!(
            target.hydrate_recovery("mismatch").unwrap_err().code,
            "recovery-fingerprint"
        );
        assert_eq!(target.identity(), before_mismatch);
        assert_eq!(loaded_block_id(&target, position), 0);

        target.recovered_save_sets.insert("ready".into(), recovered);
        let summary = target.hydrate_recovery("ready").unwrap();
        assert_eq!(summary.native_domains, INTEGRATED_RUNTIME_NATIVE_WORLD_DOMAIN_V1);
        assert_eq!(
            target.world().edit_journal().get(&position).map(|cell| cell.block_id),
            Some(1)
        );
        let chunk = target.read_hydrated_compatibility_chunk("ready", 0).unwrap();
        assert_eq!(chunk.bytes, compatibility);
        assert_eq!(chunk.chunk_count, 1);
        assert_eq!(
            target.read_hydrated_compatibility_chunk("missing", 0).unwrap_err().code,
            "hydration-export",
        );
    }

    #[test]
    fn cross_domain_batch_is_atomic_on_rejection() {
        let mut runtime = runtime_with_section();
        let before = runtime.identity();
        let mut batch = IntegratedRuntimeBatchV2::empty("atomic-reject", before.clone());
        batch.entities.push(EntityCommandBatch {
            schema: ENTITY_COMMAND_SCHEMA,
            sequence: 1,
            expected_revision: 0,
            tick: 1,
            commands: vec![EntityCommand::Spawn {
                record: EntityCompatibilityRecord::new("mob:1", "specimen:1", "frostquill"),
                residency: EntityResidency::Hot,
            }],
        });
        batch.entities.push(EntityCommandBatch {
            schema: ENTITY_COMMAND_SCHEMA,
            sequence: 2,
            expected_revision: 99,
            tick: 1,
            commands: Vec::new(),
        });
        let receipt = runtime.commit(batch);
        assert!(!receipt.accepted());
        assert_eq!(runtime.identity(), before);
        assert!(runtime.entities().is_empty());
    }

    #[test]
    fn accepted_entity_batch_advances_root_and_replay() {
        let mut runtime = runtime_with_section();
        let before = runtime.identity();
        let mut batch = IntegratedRuntimeBatchV2::empty("spawn", before.clone());
        batch.entities.push(EntityCommandBatch {
            schema: ENTITY_COMMAND_SCHEMA,
            sequence: 1,
            expected_revision: 0,
            tick: 1,
            commands: vec![EntityCommand::Spawn {
                record: EntityCompatibilityRecord::new("mob:1", "specimen:1", "frostquill"),
                residency: EntityResidency::Hot,
            }],
        });
        let receipt = runtime.commit(batch);
        assert!(receipt.accepted());
        assert_eq!(runtime.entities().len(), 1);
        assert_ne!(runtime.state_hash(), before.state_hash);
        assert_ne!(runtime.replay_hash(), CanonicalHash::default());
    }

    #[test]
    fn wire_reliability_returns_cached_receipt_without_reapplying_and_rejects_conflicts() {
        let mut runtime = runtime_with_section();
        let before = runtime.identity();
        let mut batch = IntegratedRuntimeBatchV2::empty("reliable-spawn", before).with_reliability(
            "player-one",
            "spawn:1",
            [0x80, 0xff, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
        );
        batch.entities.push(EntityCommandBatch {
            schema: ENTITY_COMMAND_SCHEMA,
            sequence: 1,
            expected_revision: 0,
            tick: 1,
            commands: vec![EntityCommand::Spawn {
                record: EntityCompatibilityRecord::new("mob:reliable", "specimen:reliable", "frostquill"),
                residency: EntityResidency::Hot,
            }],
        });
        let retry = batch.clone();
        assert!(runtime.commit(batch).accepted());
        let after = runtime.identity();
        let replay = runtime.replay_hash();
        assert!(runtime.commit(retry.clone()).accepted());
        assert_eq!(runtime.identity(), after);
        assert_eq!(runtime.replay_hash(), replay);
        assert_eq!(runtime.entities().len(), 1);

        let mut conflict = retry;
        conflict.reliability.as_mut().expect("reliability").command_hash[0] ^= 0xff;
        let receipt = runtime.commit(conflict);
        let IntegratedRuntimeReceiptV2::Rejected(rejection) = receipt else {
            panic!("conflicting command bytes must reject")
        };
        assert_eq!(rejection.code, "idempotency-conflict");
        assert_eq!(runtime.identity(), after);
    }

    #[test]
    fn stale_batch_is_rejected_without_mutation() {
        let mut runtime = runtime_with_section();
        let stale = runtime.identity();
        runtime.step(1_000_000, 1_000).unwrap();
        runtime.step(1_050_000, 1_000).unwrap();
        let mut batch = IntegratedRuntimeBatchV2::empty("stale", stale);
        batch.entities.push(EntityCommandBatch {
            schema: ENTITY_COMMAND_SCHEMA,
            sequence: 1,
            expected_revision: 0,
            tick: 1,
            commands: Vec::new(),
        });
        assert!(!runtime.commit(batch).accepted());
        assert!(runtime.entities().is_empty());
    }

    #[test]
    fn read_page_converts_to_current_simulation_window() {
        let runtime = runtime_with_section();
        let window = runtime
            .capture_simulation_window(ReadOriginV1 { x: 0, y: 0, z: 0 }, ReadSizeV1 { x: 4, y: 4, z: 4 })
            .unwrap();
        assert_eq!(window.identity, runtime.simulation_identity().unwrap());
        assert_eq!(window.blocks.len(), 64);
        window.validate().unwrap();
    }

    #[test]
    fn shutdown_clears_work_and_is_terminal() {
        let mut runtime = runtime_with_section();
        let mut batch = IntegratedRuntimeBatchV2::empty("queued", runtime.identity());
        batch.entities.push(EntityCommandBatch {
            schema: ENTITY_COMMAND_SCHEMA,
            sequence: 1,
            expected_revision: 0,
            tick: 1,
            commands: Vec::new(),
        });
        runtime.enqueue(batch).unwrap();
        runtime.shutdown();
        assert!(runtime.is_stopped());
        assert!(runtime.step(1, 1).is_err());
        assert!(runtime.take_receipts().is_empty());
    }

    #[test]
    fn world_edit_journal_changes_root_hash() {
        let mut runtime = runtime_with_section();
        let before = runtime.state_hash();
        let position = CellPositionV1 { x: 1, y: 0, z: 1 };
        let expected = runtime.world().identity();
        let batch = WorldMutationBatchR4V1 {
            schema_version: blockwild_authority::WORLD_AUTHORITY_SCHEMA_V1,
            batch_id: "world-edit".into(),
            authority_id: "player:1".into(),
            address: expected.address.clone(),
            expected_revision: expected.revision,
            commands: vec![blockwild_authority::WorldMutationCommandR4V1::SetBlock {
                position,
                block_id: 1,
                facing: None,
            }],
        };
        let mut integrated = IntegratedRuntimeBatchV2::empty("integrated-edit", runtime.identity());
        integrated.world.push(batch);
        assert!(runtime.commit(integrated).accepted());
        assert_ne!(runtime.state_hash(), before);
        assert_eq!(runtime.world().edit_journal().get(&position).unwrap().block_id, 1);
    }

    #[test]
    fn generated_chunk_installs_all_authority_and_auxiliary_streams_atomically() {
        let request = blockwild_generation::fixture_request("integrated-generation", 0, 0, 1);
        let mut config = IntegratedRuntimeConfigV2 {
            world_seed: request.seed_text.clone(),
            content_hash: parse_canonical_hash(&request.content_hash).unwrap(),
            generator_hash: parse_canonical_hash(&request.generator_hash).unwrap(),
            ..IntegratedRuntimeConfigV2::default()
        };
        config.block_catalog.water_block_id = GeneratedBlock::WATER;
        let mut runtime = IntegratedRuntimeV2::new(config).unwrap();
        let before = runtime.state_hash();
        let installed = runtime.generate_and_install_chunk(&request).unwrap();
        assert_eq!(installed.sections_installed, 12);
        assert_ne!(installed.state_hash, before);
        assert_eq!(runtime.world().resident_section_count(), 12);
        let auxiliary = runtime
            .world()
            .chunk_auxiliary(&AuthorityChunkAddressV1 {
                world: runtime.world().active_address().clone(),
                chunk_x: 0,
                chunk_z: 0,
            })
            .expect("chunk auxiliary data");
        assert_eq!(auxiliary.heightmap.len(), 256);
        assert_eq!(auxiliary.light.len(), 49_152);
        assert_eq!(runtime.generation_diagnostics().completed, 1);
    }
}
