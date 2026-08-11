//! Coarse browser-worker facade for the R4 authoritative world store.
//!
//! The wire format is deliberately compact and bounded. A browser crosses the
//! Wasm boundary once per lifecycle operation, section batch, mutation batch,
//! or immutable read page; it never performs per-cell calls.

use std::cell::RefCell;
use std::collections::{BTreeMap, BTreeSet};

use blockwild_authority::{
    AuthorityError, AuthorityResult, BlockCatalogV1, CellPositionV1, ChunkAuxiliaryDataV1, ChunkAuxiliaryPatchV1,
    CompatibilityChunkEditsV1, CompatibilityFacingV1, LiquidMetadataV1, MutationRejectionCodeR4V1, ReadOriginV1,
    ReadSizeV1, ResidencyPriorityClassV1, ResidencyPurposeV1, ResidencyRequestV1, SectionInstallV1,
    WORLD_AUTHORITY_SCHEMA_V1, WORLD_CODEC_MAX_BYTES_V1, WORLD_MUTATION_BATCH_MAX_COMMANDS_V1,
    WORLD_SECTION_CELL_COUNT_V1, WorldAddressV1, WorldAuthorityIdentityV1, WorldAuthorityRevisionV1,
    WorldAuthorityStoreR4V1, WorldCellV1, WorldChunkAddressV1, WorldCompatibilitySaveR4V1, WorldMutationBatchR4V1,
    WorldMutationCommandR4V1, WorldMutationReceiptR4V1, WorldReadPageV1, WorldSectionAddressV1,
    create_compatibility_save, decode_compatibility_save_binary_v1, encode_compatibility_save_binary_v1,
};
use wasm_bindgen::prelude::*;

const REQUEST_MAGIC: &[u8; 4] = b"BWQ4";
const RESPONSE_MAGIC: &[u8; 4] = b"BWA4";
const BRIDGE_VERSION: u16 = 1;
const HASH_LENGTH: usize = 32;
const MAX_SECTIONS: usize = 256;
const MAX_AUXILIARY: usize = 64;
const MAX_MARKERS: usize = 16_384;
const MAX_RESIDENCY_INTENTS: usize = 65_536;

const OP_CREATE: u8 = 0;
const OP_INSTALL: u8 = 1;
const OP_IMPORT_SAVE: u8 = 2;
const OP_RESIDENCY: u8 = 3;
const OP_MUTATE: u8 = 4;
const OP_READ_PAGE: u8 = 5;
const OP_EVICT: u8 = 6;
const OP_SWITCH_LOCATION: u8 = 7;
const OP_EXPORT_SAVE: u8 = 8;
const OP_DESTROY: u8 = 9;
const OP_PATCH_AUXILIARY: u8 = 10;

#[derive(Default)]
struct AuthorityStore {
    next_handle: u32,
    worlds: BTreeMap<u32, WorldAuthorityStoreR4V1>,
}

impl AuthorityStore {
    fn insert(&mut self, world: WorldAuthorityStoreR4V1) -> u32 {
        self.next_handle = self.next_handle.wrapping_add(1).max(1);
        while self.worlds.contains_key(&self.next_handle) {
            self.next_handle = self.next_handle.wrapping_add(1).max(1);
        }
        let handle = self.next_handle;
        self.worlds.insert(handle, world);
        handle
    }
}

thread_local! {
    static AUTHORITIES: RefCell<AuthorityStore> = RefCell::new(AuthorityStore::default());
}

/// Create one long-lived R4 authority. The request includes the complete
/// directional/waterlogging catalog required to preserve mutation semantics.
#[wasm_bindgen]
#[must_use]
pub fn blockwild_world_authority_create_r4(request_bytes: &[u8]) -> Vec<u8> {
    let mut reader = match Reader::request(request_bytes, OP_CREATE) {
        Ok(reader) => reader,
        Err(error) => return encode_error(0, OP_CREATE, &error),
    };
    let request_id = reader.request_id;
    let result = (|| {
        let address = reader.address()?;
        let water_block_id = reader.u16()?;
        let directional_blocks = reader.u16_set(65_535)?;
        let waterlogged_blocks = reader.u16_set(65_535)?;
        reader.finish()?;
        let world = WorldAuthorityStoreR4V1::new(
            address,
            BlockCatalogV1 {
                directional_blocks,
                waterlogged_blocks,
                water_block_id,
            },
        )?;
        let identity = world.identity();
        let handle = AUTHORITIES.with(|store| store.borrow_mut().insert(world));
        let mut writer = Writer::response(request_id, OP_CREATE);
        writer.u32(handle);
        writer.identity(&identity)?;
        writer.finish()
    })();
    result.unwrap_or_else(|error| encode_error(request_id, OP_CREATE, &error))
}

/// Execute a bounded R4 authority request against a live handle.
#[wasm_bindgen]
#[must_use]
pub fn blockwild_world_authority_request_r4(handle: u32, request_bytes: &[u8]) -> Vec<u8> {
    let (request_id, operation) = match Reader::request_header(request_bytes) {
        Ok(header) => header,
        Err(error) => return encode_error(0, 0xff, &error),
    };
    if operation == OP_CREATE || operation == OP_DESTROY {
        return encode_error(
            request_id,
            operation,
            &AuthorityError::new("operation", "operation requires its dedicated facade export"),
        );
    }
    AUTHORITIES.with(|store| {
        let mut store = store.borrow_mut();
        let Some(world) = store.worlds.get_mut(&handle) else {
            return encode_error(
                request_id,
                operation,
                &AuthorityError::new("invalid-handle", "unknown R4 world authority handle"),
            );
        };
        execute_request(world, request_bytes, request_id, operation)
            .unwrap_or_else(|error| encode_error(request_id, operation, &error))
    })
}

/// Destroy a live R4 authority. Destruction is identity-bound so an obsolete
/// worker cannot tear down a replacement authority that reused a request path.
#[wasm_bindgen]
#[must_use]
pub fn blockwild_world_authority_destroy_r4(handle: u32, request_bytes: &[u8]) -> Vec<u8> {
    let mut reader = match Reader::request(request_bytes, OP_DESTROY) {
        Ok(reader) => reader,
        Err(error) => return encode_error(0, OP_DESTROY, &error),
    };
    let request_id = reader.request_id;
    let result = (|| {
        let expected = reader.optional_identity()?;
        reader.finish()?;
        AUTHORITIES.with(|store| {
            let mut store = store.borrow_mut();
            let Some(world) = store.worlds.get(&handle) else {
                return Err(AuthorityError::new(
                    "invalid-handle",
                    "unknown R4 world authority handle",
                ));
            };
            if let Some(identity) = expected {
                require_identity(world, &identity)?;
            }
            store.worlds.remove(&handle);
            Ok(())
        })?;
        Writer::response(request_id, OP_DESTROY).finish()
    })();
    result.unwrap_or_else(|error| encode_error(request_id, OP_DESTROY, &error))
}

fn execute_request(
    world: &mut WorldAuthorityStoreR4V1,
    request_bytes: &[u8],
    request_id: u32,
    operation: u8,
) -> AuthorityResult<Vec<u8>> {
    let mut reader = Reader::request(request_bytes, operation)?;
    match operation {
        OP_INSTALL => execute_install(world, &mut reader),
        OP_IMPORT_SAVE => execute_import_save(world, &mut reader),
        OP_RESIDENCY => execute_residency(world, &mut reader),
        OP_MUTATE => execute_mutation(world, &mut reader),
        OP_READ_PAGE => execute_read_page(world, &mut reader),
        OP_EVICT => execute_evict(world, &mut reader),
        OP_SWITCH_LOCATION => execute_switch(world, &mut reader),
        OP_EXPORT_SAVE => execute_export_save(world, &mut reader),
        OP_PATCH_AUXILIARY => execute_patch_auxiliary(world, &mut reader),
        _ => Err(AuthorityError::new("operation", "unknown R4 authority operation")),
    }
    .and_then(|payload| {
        reader.finish()?;
        let mut writer = Writer::response(request_id, operation);
        writer.bytes_raw(&payload);
        writer.finish()
    })
}

fn execute_patch_auxiliary(world: &mut WorldAuthorityStoreR4V1, reader: &mut Reader<'_>) -> AuthorityResult<Vec<u8>> {
    let expected = reader.identity()?;
    require_identity(world, &expected)?;
    let patch_count = reader.count_u16(MAX_AUXILIARY)?;
    let mut patches = Vec::with_capacity(patch_count);
    let mut light_section_count = 0_u32;
    let mut light_cell_count = 0_u32;
    for _ in 0..patch_count {
        let address = WorldChunkAddressV1 {
            world: reader.address()?,
            chunk_x: reader.i32()?,
            chunk_z: reader.i32()?,
        };
        let expected_source_revision = reader.u64()?;
        let expected_source_hash = reader.hash()?;
        let source_revision = reader.u64()?;
        let source_hash = reader.hash()?;
        let light_count = reader.count_u16(12)?;
        let mut light_sections = Vec::with_capacity(light_count);
        for _ in 0..light_count {
            let section = reader.u16()? as i16;
            let values = (0..WORLD_SECTION_CELL_COUNT_V1)
                .map(|_| reader.u16())
                .collect::<AuthorityResult<Vec<_>>>()?;
            light_sections.push((section, values));
        }
        light_section_count = light_section_count.saturating_add(light_count as u32);
        light_cell_count = light_cell_count.saturating_add(
            u32::try_from(light_count.saturating_mul(WORLD_SECTION_CELL_COUNT_V1))
                .map_err(|_| AuthorityError::new("wire-size", "light patch size overflowed"))?,
        );
        let section_count = reader.count_u16(12)?;
        let section_block_counts = (0..section_count)
            .map(|_| Ok((reader.u16()?, reader.u16()?)))
            .collect::<AuthorityResult<Vec<_>>>()?;
        let sky_count = reader.count_u16(256)?;
        let sky_tops = (0..sky_count)
            .map(|_| Ok((reader.u16()?, reader.u16()? as i16)))
            .collect::<AuthorityResult<Vec<_>>>()?;
        let light_indices = reader.optional_u32_indices()?;
        let leaf_indices = reader.optional_u32_indices()?;
        let markers = match reader.u8()? {
            0 => None,
            1 => {
                let count = reader.count_u32(MAX_MARKERS)?;
                Some(
                    (0..count)
                        .map(|_| Ok((reader.string(128)?, reader.large_string(262_144)?)))
                        .collect::<AuthorityResult<Vec<_>>>()?,
                )
            }
            _ => return Err(AuthorityError::new("wire-option", "invalid marker patch option")),
        };
        patches.push(ChunkAuxiliaryPatchV1 {
            address,
            expected_source_revision,
            expected_source_hash,
            source_revision,
            source_hash,
            light_sections,
            section_block_counts,
            sky_tops,
            light_indices,
            leaf_indices,
            markers,
        });
    }
    let mut candidate = world.clone();
    for patch in patches {
        candidate.patch_chunk_auxiliary(patch)?;
    }
    *world = candidate;
    let mut writer = Writer::new();
    writer.identity(&world.identity())?;
    writer.u32(u32::try_from(patch_count).map_err(|_| AuthorityError::new("wire-size", "patch count overflowed"))?);
    writer.u32(light_section_count);
    writer.u32(light_cell_count);
    writer.finish()
}

fn execute_install(world: &mut WorldAuthorityStoreR4V1, reader: &mut Reader<'_>) -> AuthorityResult<Vec<u8>> {
    let expected = reader.identity()?;
    require_identity(world, &expected)?;
    let section_count = reader.count_u16(MAX_SECTIONS)?;
    let mut sections = Vec::with_capacity(section_count);
    for _ in 0..section_count {
        let address = reader.section_address()?;
        let source_revision = reader.u64()?;
        let source_hash = reader.hash()?;
        let mut blocks = Vec::with_capacity(WORLD_SECTION_CELL_COUNT_V1);
        for _ in 0..WORLD_SECTION_CELL_COUNT_V1 {
            blocks.push(reader.u16()?);
        }
        let facing = reader.exact_bytes(WORLD_SECTION_CELL_COUNT_V1)?;
        let liquid_kind = reader.exact_bytes(WORLD_SECTION_CELL_COUNT_V1)?;
        let liquid_level = reader.exact_bytes(WORLD_SECTION_CELL_COUNT_V1)?;
        let flags = reader.exact_bytes(WORLD_SECTION_CELL_COUNT_V1)?;
        let cells = (0..WORLD_SECTION_CELL_COUNT_V1)
            .map(|index| {
                Ok(WorldCellV1 {
                    block_id: blocks[index],
                    facing: facing[index],
                    liquid: LiquidMetadataV1::from_streams(liquid_kind[index], liquid_level[index], flags[index])?,
                })
            })
            .collect::<AuthorityResult<Vec<_>>>()?;
        sections.push(SectionInstallV1 {
            address,
            cells,
            source_revision,
            source_hash,
        });
    }
    let auxiliary_count = reader.count_u16(MAX_AUXILIARY)?;
    let mut auxiliary = Vec::with_capacity(auxiliary_count);
    let mut marker_rows = 0_usize;
    for _ in 0..auxiliary_count {
        let value = reader.chunk_auxiliary()?;
        marker_rows = marker_rows.saturating_add(value.markers.len());
        auxiliary.push(value);
    }

    let mut candidate = world.clone();
    let mut accepted = 0_u32;
    let mut stale = 0_u32;
    for section in sections {
        if let Some((revision, hash)) = candidate.section_source_identity(&section.address) {
            if section.source_revision < revision {
                stale = stale.saturating_add(1);
                continue;
            }
            if section.source_revision == revision {
                if section.source_hash != hash {
                    return Err(AuthorityError::new(
                        "source-conflict",
                        "equal section source revisions must use the same source hash",
                    ));
                }
                stale = stale.saturating_add(1);
                continue;
            }
        }
        candidate.install_section_for_replay(section)?;
        accepted = accepted.saturating_add(1);
    }
    for data in auxiliary {
        candidate.install_chunk_auxiliary(data)?;
    }
    *world = candidate;
    let mut writer = Writer::new();
    writer.identity(&world.identity())?;
    writer.u32(accepted);
    writer.u32(stale);
    writer.u32(
        u32::try_from(auxiliary_count).map_err(|_| AuthorityError::new("wire-size", "auxiliary count overflowed"))?,
    );
    writer.u32(u32::try_from(marker_rows).map_err(|_| AuthorityError::new("wire-size", "marker count overflowed"))?);
    writer.finish()
}

fn execute_import_save(world: &mut WorldAuthorityStoreR4V1, reader: &mut Reader<'_>) -> AuthorityResult<Vec<u8>> {
    let expected = reader.identity()?;
    require_identity(world, &expected)?;
    let compatibility = reader.compatibility_save()?;
    let extension = reader.bytes(WORLD_CODEC_MAX_BYTES_V1)?;
    let save = if extension.is_empty() {
        compatibility
    } else {
        let decoded = decode_compatibility_save_binary_v1(&extension)?;
        if decoded.address != compatibility.address
            || decoded.revision != compatibility.revision
            || decoded.edits != compatibility.edits
            || decoded.facings != compatibility.facings
            || decoded.compatibility_checksum != compatibility.compatibility_checksum
        {
            return Err(AuthorityError::new(
                "save-extension-mismatch",
                "Rust save extension does not match the compatibility save",
            ));
        }
        decoded
    };
    let edit_count = save.edits.iter().map(|chunk| chunk.entries.len()).sum::<usize>();
    let mut candidate = world.clone();
    candidate.import_compatibility_save(&save, false)?;
    *world = candidate;
    let mut writer = Writer::new();
    writer.identity(&world.identity())?;
    writer.u32(u32::try_from(edit_count).map_err(|_| AuthorityError::new("save-size", "save edit count overflowed"))?);
    writer.finish()
}

fn execute_residency(world: &mut WorldAuthorityStoreR4V1, reader: &mut Reader<'_>) -> AuthorityResult<Vec<u8>> {
    let expected = reader.identity()?;
    require_identity(world, &expected)?;
    let intent_count = reader.count_u32(MAX_RESIDENCY_INTENTS)?;
    let mut intents = Vec::with_capacity(intent_count);
    for _ in 0..intent_count {
        intents.push(ResidencyRequestV1 {
            request_id: reader.u64()?,
            epoch: expected.revision.epoch,
            address: reader.section_address()?,
            class: match reader.u8()? {
                0 => ResidencyPriorityClassV1::OccupiedSupport,
                1 => ResidencyPriorityClassV1::PlayerEdited,
                2 => ResidencyPriorityClassV1::ImmediateOpaque,
                3 => ResidencyPriorityClassV1::ImmediateTranslucent,
                4 => ResidencyPriorityClassV1::MovementForward,
                5 => ResidencyPriorityClassV1::VisibleMid,
                6 => ResidencyPriorityClassV1::Background,
                _ => {
                    return Err(AuthorityError::new(
                        "residency-class",
                        "unknown residency priority class",
                    ));
                }
            },
            purpose: match reader.u8()? {
                0 => ResidencyPurposeV1::Generate,
                1 => ResidencyPurposeV1::CacheRead,
                2 => ResidencyPurposeV1::Light,
                3 => ResidencyPurposeV1::Mesh,
                4 => ResidencyPurposeV1::Retain,
                _ => return Err(AuthorityError::new("residency-purpose", "unknown residency purpose")),
            },
            distance_squared: reader.u32()?,
            direction_penalty: reader.u16()?,
            sequence: reader.u64()?,
        });
    }
    let cancelled_count = reader.count_u32(MAX_RESIDENCY_INTENTS)?;
    let cancelled = (0..cancelled_count)
        .map(|_| reader.u64())
        .collect::<AuthorityResult<Vec<_>>>()?;
    let mut candidate = world.clone();
    let mut cancelled_actual = 0_u32;
    for request_id in cancelled {
        cancelled_actual = cancelled_actual.saturating_add(u32::from(candidate.scheduler_mut().cancel(request_id)));
    }
    for intent in intents {
        candidate.scheduler_mut().submit(intent)?;
    }
    let queued = u32::try_from(candidate.scheduler_mut().queued_len())
        .map_err(|_| AuthorityError::new("residency-size", "residency queue count overflowed"))?;
    *world = candidate;
    let mut writer = Writer::new();
    writer.identity(&world.identity())?;
    writer.u32(queued);
    writer.u32(cancelled_actual);
    writer.finish()
}

fn execute_mutation(world: &mut WorldAuthorityStoreR4V1, reader: &mut Reader<'_>) -> AuthorityResult<Vec<u8>> {
    let expected = reader.identity()?;
    let batch_id = reader.string(160)?;
    let authority_id = reader.string(128)?;
    let address = reader.address()?;
    let command_count = reader.count_u32(WORLD_MUTATION_BATCH_MAX_COMMANDS_V1)?;
    let mut commands = Vec::with_capacity(command_count);
    for _ in 0..command_count {
        let kind = reader.u8()?;
        let position = reader.position()?;
        commands.push(match kind {
            0 => {
                let block_id = reader.u16()?;
                let facing = match reader.u8()? {
                    0xff => None,
                    value => Some(value),
                };
                WorldMutationCommandR4V1::SetBlock {
                    position,
                    block_id,
                    facing,
                }
            }
            1 => WorldMutationCommandR4V1::SetFacing {
                position,
                facing: reader.u8()?,
            },
            2 => WorldMutationCommandR4V1::SetLiquid {
                position,
                liquid: LiquidMetadataV1::from_streams(reader.u8()?, reader.u8()?, reader.u8()?)?,
            },
            _ => return Err(AuthorityError::new("mutation-command", "unknown mutation command")),
        });
    }
    let receipt = world.apply_mutation_batch(WorldMutationBatchR4V1 {
        schema_version: WORLD_AUTHORITY_SCHEMA_V1,
        batch_id,
        authority_id,
        address,
        expected_revision: expected.revision,
        commands,
    });
    let mut writer = Writer::new();
    match receipt {
        WorldMutationReceiptR4V1::Rejected {
            code,
            message,
            identity,
            ..
        } => {
            writer.identity(&identity)?;
            writer.u8(1);
            writer.u8(0);
            writer.string(rejection_code(code))?;
            writer.string(&message)?;
            writer.u8(0);
        }
        WorldMutationReceiptR4V1::Accepted {
            mutated,
            after,
            immediate_event,
            ..
        } => {
            writer.identity(&after)?;
            writer.u8(0);
            writer.u8(u8::from(mutated));
            writer.string("")?;
            writer.string("")?;
            if let Some(event) = immediate_event {
                writer.u8(1);
                writer.u64(event.sequence);
                writer.address(&event.address)?;
                writer.string(&event.batch_id)?;
                writer.identity(&event.identity)?;
                writer.u32_len(event.changes.len())?;
                for change in event.changes {
                    writer.position(change.position);
                    writer.cell(change.previous);
                    writer.cell(change.current);
                }
                writer.u32_len(event.dirty_sections.len())?;
                for section in event.dirty_sections {
                    writer.string(&section.key())?;
                }
            } else {
                writer.u8(0);
            }
        }
    }
    writer.finish()
}

fn execute_read_page(world: &WorldAuthorityStoreR4V1, reader: &mut Reader<'_>) -> AuthorityResult<Vec<u8>> {
    let expected = reader.identity()?;
    require_identity(world, &expected)?;
    let origin = ReadOriginV1 {
        x: reader.i32()?,
        y: reader.i32()?,
        z: reader.i32()?,
    };
    let size = ReadSizeV1 {
        x: reader.u16()?,
        y: reader.u16()?,
        z: reader.u16()?,
    };
    let page = WorldReadPageV1::capture(world, origin, size)?;
    let mut writer = Writer::new();
    writer.identity(&page.identity)?;
    writer.address(&page.address)?;
    writer.i32(page.origin.x);
    writer.i32(page.origin.y);
    writer.i32(page.origin.z);
    writer.u16(page.size.x);
    writer.u16(page.size.y);
    writer.u16(page.size.z);
    writer.u32_len(page.section_revisions.len())?;
    for section in page.section_revisions.iter() {
        writer.section_address(&section.address)?;
        writer.u64(section.revision.blocks);
        writer.u64(section.revision.metadata);
        writer.u64(section.revision.halo);
    }
    writer.string(&page.snapshot_hash)?;
    writer.bytes(&page.streams.loaded_mask)?;
    writer.bytes(&page.streams.boundary)?;
    writer.u16_slice(&page.streams.blocks)?;
    writer.bytes(&page.streams.facing)?;
    writer.bytes(&page.streams.liquid_kind)?;
    writer.bytes(&page.streams.liquid_level)?;
    writer.bytes(&page.streams.flags)?;
    writer.finish()
}

fn execute_evict(world: &mut WorldAuthorityStoreR4V1, reader: &mut Reader<'_>) -> AuthorityResult<Vec<u8>> {
    let expected = reader.identity()?;
    require_identity(world, &expected)?;
    let count = reader.count_u16(MAX_SECTIONS)?;
    let sections = (0..count)
        .map(|_| reader.section_address())
        .collect::<AuthorityResult<Vec<_>>>()?;
    let mut candidate = world.clone();
    let evicted = sections
        .iter()
        .filter(|section| candidate.evict_section(section))
        .count();
    *world = candidate;
    let mut writer = Writer::new();
    writer.identity(&world.identity())?;
    writer.u32(u32::try_from(evicted).map_err(|_| AuthorityError::new("evict-size", "eviction count overflowed"))?);
    writer.finish()
}

fn execute_switch(world: &mut WorldAuthorityStoreR4V1, reader: &mut Reader<'_>) -> AuthorityResult<Vec<u8>> {
    let expected = reader.identity()?;
    require_identity(world, &expected)?;
    let address = reader.address()?;
    world.switch_active_location(address)?;
    let mut writer = Writer::new();
    writer.identity(&world.identity())?;
    writer.finish()
}

fn execute_export_save(world: &WorldAuthorityStoreR4V1, reader: &mut Reader<'_>) -> AuthorityResult<Vec<u8>> {
    let expected = reader.identity()?;
    require_identity(world, &expected)?;
    let save = world.export_compatibility_save();
    let compatibility_json = save.compatibility_json_bytes()?;
    let extension = encode_compatibility_save_binary_v1(&save)?;
    let mut writer = Writer::new();
    writer.identity(&world.identity())?;
    writer.bytes(&compatibility_json)?;
    writer.bytes(&extension)?;
    writer.finish()
}

fn require_identity(world: &WorldAuthorityStoreR4V1, expected: &WorldAuthorityIdentityV1) -> AuthorityResult<()> {
    if world.identity() != *expected {
        return Err(AuthorityError::new(
            "stale-revision",
            "request expected an obsolete world authority identity",
        ));
    }
    Ok(())
}

fn rejection_code(code: MutationRejectionCodeR4V1) -> &'static str {
    match code {
        MutationRejectionCodeR4V1::AddressMismatch => "address-mismatch",
        MutationRejectionCodeR4V1::StaleRevision => "stale-revision",
        MutationRejectionCodeR4V1::InvalidCommand => "invalid-command",
        MutationRejectionCodeR4V1::UnloadedCell => "unloaded-cell",
        MutationRejectionCodeR4V1::VerticalBoundary => "vertical-boundary",
        MutationRejectionCodeR4V1::FacingNotSupported => "facing-not-supported",
    }
}

fn encode_error(request_id: u32, operation: u8, error: &AuthorityError) -> Vec<u8> {
    let mut writer = Writer::error_response(request_id, operation);
    if writer.string(error.code).is_err() || writer.string(&error.message).is_err() {
        return b"BWA4\x01\0\xff\x01\0\0\0\0\x0b\0wire-error\x00\0".to_vec();
    }
    writer.finish().unwrap_or_else(|_| Vec::new())
}

struct Writer {
    bytes: Vec<u8>,
}

impl Writer {
    fn new() -> Self {
        Self { bytes: Vec::new() }
    }

    fn response(request_id: u32, operation: u8) -> Self {
        let mut writer = Self::new();
        writer.bytes_raw(RESPONSE_MAGIC);
        writer.u16(BRIDGE_VERSION);
        writer.u8(operation);
        writer.u8(0);
        writer.u32(request_id);
        writer
    }

    fn error_response(request_id: u32, operation: u8) -> Self {
        let mut writer = Self::response(request_id, operation);
        writer.bytes[7] = 1;
        writer
    }

    fn finish(self) -> AuthorityResult<Vec<u8>> {
        if self.bytes.len() > WORLD_CODEC_MAX_BYTES_V1 {
            return Err(AuthorityError::new(
                "wire-size",
                "R4 authority wire payload exceeds 32 MiB",
            ));
        }
        Ok(self.bytes)
    }

    fn u8(&mut self, value: u8) {
        self.bytes.push(value);
    }

    fn u16(&mut self, value: u16) {
        self.bytes.extend_from_slice(&value.to_le_bytes());
    }

    fn u32(&mut self, value: u32) {
        self.bytes.extend_from_slice(&value.to_le_bytes());
    }

    fn i32(&mut self, value: i32) {
        self.bytes.extend_from_slice(&value.to_le_bytes());
    }

    fn u64(&mut self, value: u64) {
        self.bytes.extend_from_slice(&value.to_le_bytes());
    }

    fn bytes_raw(&mut self, value: &[u8]) {
        self.bytes.extend_from_slice(value);
    }

    fn string(&mut self, value: &str) -> AuthorityResult<()> {
        let length = u16::try_from(value.len())
            .map_err(|_| AuthorityError::new("wire-string", "wire string exceeds 65535 bytes"))?;
        self.u16(length);
        self.bytes_raw(value.as_bytes());
        Ok(())
    }

    fn bytes(&mut self, value: &[u8]) -> AuthorityResult<()> {
        self.u32_len(value.len())?;
        self.bytes_raw(value);
        Ok(())
    }

    fn u16_slice(&mut self, value: &[u16]) -> AuthorityResult<()> {
        self.u32_len(value.len())?;
        for item in value {
            self.u16(*item);
        }
        Ok(())
    }

    fn u32_len(&mut self, length: usize) -> AuthorityResult<()> {
        self.u32(u32::try_from(length).map_err(|_| AuthorityError::new("wire-size", "wire count overflowed"))?);
        Ok(())
    }

    fn address(&mut self, address: &WorldAddressV1) -> AuthorityResult<()> {
        self.string(&address.universe_id)?;
        self.string(&address.location_id)
    }

    fn section_address(&mut self, address: &WorldSectionAddressV1) -> AuthorityResult<()> {
        self.address(&address.world)?;
        self.i32(address.chunk_x);
        self.i32(address.chunk_z);
        self.u16(address.section_y as u16);
        Ok(())
    }

    fn identity(&mut self, identity: &WorldAuthorityIdentityV1) -> AuthorityResult<()> {
        self.address(&identity.address)?;
        self.u64(identity.revision.epoch);
        self.u64(identity.revision.mutation);
        self.u64(identity.revision.residency);
        self.string(&identity.state_hash)
    }

    fn position(&mut self, position: CellPositionV1) {
        self.i32(position.x);
        self.i32(position.y);
        self.i32(position.z);
    }

    fn cell(&mut self, cell: WorldCellV1) {
        self.u16(cell.block_id);
        self.u8(cell.facing);
        self.u8(cell.liquid.kind as u8);
        self.u8(cell.liquid.level);
        self.u8(cell.liquid.flags());
    }
}

struct Reader<'a> {
    bytes: &'a [u8],
    offset: usize,
    request_id: u32,
}

#[cfg(test)]
#[allow(clippy::items_after_test_module)]
mod tests {
    use super::*;

    const HASH: &str = "0123456789abcdef0123456789abcdef";

    fn request(operation: u8, request_id: u32) -> Writer {
        let mut writer = Writer::new();
        writer.bytes_raw(REQUEST_MAGIC);
        writer.u16(BRIDGE_VERSION);
        writer.u8(operation);
        writer.u8(0);
        writer.u32(request_id);
        writer
    }

    fn response_reader(bytes: &[u8], operation: u8, request_id: u32) -> Reader<'_> {
        assert!(bytes.len() >= 12);
        assert_eq!(&bytes[..4], RESPONSE_MAGIC);
        assert_eq!(u16::from_le_bytes(bytes[4..6].try_into().unwrap()), BRIDGE_VERSION);
        assert_eq!(bytes[6], operation);
        assert_eq!(bytes[7], 0, "response error: {bytes:?}");
        assert_eq!(u32::from_le_bytes(bytes[8..12].try_into().unwrap()), request_id);
        Reader {
            bytes,
            offset: 12,
            request_id,
        }
    }

    fn write_identity(writer: &mut Writer, identity: &WorldAuthorityIdentityV1) {
        writer.identity(identity).unwrap();
    }

    fn write_compatibility_save(writer: &mut Writer, save: &WorldCompatibilitySaveR4V1) {
        writer.address(&save.address).unwrap();
        writer.u64(save.revision.epoch);
        writer.u64(save.revision.mutation);
        writer.u64(save.revision.residency);
        writer.u32(u32::try_from(save.edits.len()).unwrap());
        for chunk in &save.edits {
            writer.i32(chunk.chunk_x);
            writer.i32(chunk.chunk_z);
            writer.u32(u32::try_from(chunk.entries.len()).unwrap());
            for (index, block_id) in &chunk.entries {
                writer.u32(*index);
                writer.u16(*block_id);
            }
        }
        writer.u32(u32::try_from(save.facings.len()).unwrap());
        for facing in &save.facings {
            writer.position(facing.position);
            writer.u8(facing.facing);
        }
        writer.string(&save.compatibility_checksum).unwrap();
    }

    #[test]
    fn facade_covers_complete_lifecycle_auxiliary_mutation_staleness_and_save() {
        let address = WorldAddressV1::new("1", "r4-test").unwrap();
        let section_address = WorldSectionAddressV1 {
            world: address.clone(),
            chunk_x: -1,
            chunk_z: 0,
            section_y: 0,
        };

        let mut create = request(OP_CREATE, 1);
        create.address(&address).unwrap();
        create.u16(7);
        create.u16(1);
        create.u16(31);
        create.u16(1);
        create.u16(44);
        let created = blockwild_world_authority_create_r4(&create.finish().unwrap());
        let mut decoded = response_reader(&created, OP_CREATE, 1);
        let handle = decoded.u32().unwrap();
        let initial = decoded.identity().unwrap();
        decoded.finish().unwrap();
        assert_eq!(initial.revision.epoch, 1);

        let mut install = request(OP_INSTALL, 2);
        write_identity(&mut install, &initial);
        install.u16(1);
        install.section_address(&section_address).unwrap();
        install.u64(18);
        install.string(HASH).unwrap();
        install.u16(1);
        for _ in 1..WORLD_SECTION_CELL_COUNT_V1 {
            install.u16(0);
        }
        install.bytes_raw(&[0; WORLD_SECTION_CELL_COUNT_V1]);
        install.bytes_raw(&[0; WORLD_SECTION_CELL_COUNT_V1]);
        install.bytes_raw(&[0; WORLD_SECTION_CELL_COUNT_V1]);
        install.bytes_raw(&[0; WORLD_SECTION_CELL_COUNT_V1]);
        install.u16(1);
        install.address(&address).unwrap();
        install.i32(-1);
        install.i32(0);
        install.u64(18);
        install.string(HASH).unwrap();
        for _ in 0..256 {
            install.u16((-64_i16) as u16);
        }
        install.bytes_raw(&[0; 256]);
        install.u16(1);
        for _ in 1..12 {
            install.u16(0);
        }
        for _ in 0..256 {
            install.u16((-65_i16) as u16);
        }
        for _ in 0..49_152 {
            install.u16(0);
        }
        install.u32(0);
        install.u32(0);
        install.u32(1);
        install.string("poi:test").unwrap();
        let marker = br#"{"kind":"test","position":{"x":-16,"y":-64,"z":0}}"#;
        install.u32(marker.len() as u32);
        install.bytes_raw(marker);
        let installed = blockwild_world_authority_request_r4(handle, &install.finish().unwrap());
        let mut decoded = response_reader(&installed, OP_INSTALL, 2);
        let installed_identity = decoded.identity().unwrap();
        assert_eq!(decoded.u32().unwrap(), 1);
        assert_eq!(decoded.u32().unwrap(), 0);
        assert_eq!(decoded.u32().unwrap(), 1);
        assert_eq!(decoded.u32().unwrap(), 1);
        decoded.finish().unwrap();
        assert_eq!(
            installed_identity.revision.residency, 2,
            "section and auxiliary are separate residency transitions"
        );

        let mut read = request(OP_READ_PAGE, 3);
        write_identity(&mut read, &installed_identity);
        read.i32(-16);
        read.i32(-64);
        read.i32(0);
        read.u16(1);
        read.u16(1);
        read.u16(1);
        let read_response = blockwild_world_authority_request_r4(handle, &read.finish().unwrap());
        let mut decoded = response_reader(&read_response, OP_READ_PAGE, 3);
        assert_eq!(decoded.identity().unwrap(), installed_identity);
        assert_eq!(decoded.address().unwrap(), address);
        assert_eq!(decoded.i32().unwrap(), -16);
        assert_eq!(decoded.i32().unwrap(), -64);
        assert_eq!(decoded.i32().unwrap(), 0);
        assert_eq!(
            (decoded.u16().unwrap(), decoded.u16().unwrap(), decoded.u16().unwrap()),
            (1, 1, 1)
        );
        assert_eq!(decoded.u32().unwrap(), 1);
        assert_eq!(decoded.section_address().unwrap(), section_address);
        assert_eq!(decoded.u64().unwrap(), 18);
        assert_eq!(decoded.u64().unwrap(), 18);
        assert_eq!(decoded.u64().unwrap(), 18);
        let _snapshot_hash = decoded.hash().unwrap();
        assert_eq!(decoded.bytes(1).unwrap(), [1]);
        assert_eq!(decoded.bytes(1).unwrap(), [0]);
        assert_eq!(decoded.count_u32(1).unwrap(), 1);
        assert_eq!(decoded.u16().unwrap(), 1);
        for _ in 0..4 {
            assert_eq!(decoded.bytes(1).unwrap(), [0]);
        }
        decoded.finish().unwrap();

        let mut mutate = request(OP_MUTATE, 4);
        write_identity(&mut mutate, &installed_identity);
        mutate.string("edit-1").unwrap();
        mutate.string("browser-test").unwrap();
        mutate.address(&address).unwrap();
        mutate.u32(1);
        mutate.u8(0);
        mutate.position(CellPositionV1 { x: -16, y: -64, z: 0 });
        mutate.u16(31);
        mutate.u8(2);
        let mutation_response = blockwild_world_authority_request_r4(handle, &mutate.finish().unwrap());
        let mut decoded = response_reader(&mutation_response, OP_MUTATE, 4);
        let mutated_identity = decoded.identity().unwrap();
        assert_eq!(decoded.u8().unwrap(), 0);
        assert_eq!(decoded.u8().unwrap(), 1);
        assert_eq!(decoded.string(1).unwrap(), "");
        assert_eq!(decoded.string(1).unwrap(), "");
        assert_eq!(decoded.u8().unwrap(), 1, "accepted mutation has an immediate event");
        assert_eq!(mutated_identity.revision.mutation, 1);

        let mut stale = request(OP_MUTATE, 5);
        write_identity(&mut stale, &installed_identity);
        stale.string("stale").unwrap();
        stale.string("browser-test").unwrap();
        stale.address(&address).unwrap();
        stale.u32(1);
        stale.u8(0);
        stale.position(CellPositionV1 { x: -16, y: -64, z: 0 });
        stale.u16(1);
        stale.u8(0xff);
        let stale_response = blockwild_world_authority_request_r4(handle, &stale.finish().unwrap());
        let mut decoded = response_reader(&stale_response, OP_MUTATE, 5);
        assert_eq!(decoded.identity().unwrap(), mutated_identity);
        assert_eq!(decoded.u8().unwrap(), 1);
        assert_eq!(decoded.u8().unwrap(), 0);
        assert_eq!(decoded.string(64).unwrap(), "stale-revision");

        let mut export = request(OP_EXPORT_SAVE, 6);
        write_identity(&mut export, &mutated_identity);
        let exported = blockwild_world_authority_request_r4(handle, &export.finish().unwrap());
        let mut decoded = response_reader(&exported, OP_EXPORT_SAVE, 6);
        assert_eq!(decoded.identity().unwrap(), mutated_identity);
        let compatibility_json = decoded.bytes(WORLD_CODEC_MAX_BYTES_V1).unwrap();
        let extension = decoded.bytes(WORLD_CODEC_MAX_BYTES_V1).unwrap();
        decoded.finish().unwrap();
        assert!(compatibility_json.starts_with(b"{"));
        assert!(extension.starts_with(b"BWAS"));

        let save = decode_compatibility_save_binary_v1(&extension).unwrap();
        let mut import = request(OP_IMPORT_SAVE, 7);
        write_identity(&mut import, &mutated_identity);
        write_compatibility_save(&mut import, &save);
        import.bytes(&extension).unwrap();
        let imported = blockwild_world_authority_request_r4(handle, &import.finish().unwrap());
        let mut decoded = response_reader(&imported, OP_IMPORT_SAVE, 7);
        let imported_identity = decoded.identity().unwrap();
        assert!(imported_identity.revision.epoch > mutated_identity.revision.epoch);
        assert_eq!(imported_identity.revision.mutation, mutated_identity.revision.mutation);
        assert_eq!(imported_identity.revision.residency, 0);
        assert_eq!(decoded.u32().unwrap(), 1);

        let mut obsolete = request(OP_EXPORT_SAVE, 8);
        write_identity(&mut obsolete, &mutated_identity);
        let obsolete = blockwild_world_authority_request_r4(handle, &obsolete.finish().unwrap());
        assert_eq!(obsolete[7], 1, "pre-import identities are invalidated");

        let mut switch = request(OP_SWITCH_LOCATION, 9);
        write_identity(&mut switch, &imported_identity);
        switch.address(&WorldAddressV1::new("1", "r4-next").unwrap()).unwrap();
        let switched = blockwild_world_authority_request_r4(handle, &switch.finish().unwrap());
        let mut decoded = response_reader(&switched, OP_SWITCH_LOCATION, 9);
        let switched_identity = decoded.identity().unwrap();
        assert_eq!(switched_identity.address.location_id, "r4-next");
        assert!(switched_identity.revision.epoch > imported_identity.revision.epoch);

        let mut destroy = request(OP_DESTROY, 10);
        destroy.u8(1);
        write_identity(&mut destroy, &switched_identity);
        let destroyed = blockwild_world_authority_destroy_r4(handle, &destroy.finish().unwrap());
        response_reader(&destroyed, OP_DESTROY, 10).finish().unwrap();

        let mut missing_request = request(OP_EXPORT_SAVE, 11);
        write_identity(&mut missing_request, &switched_identity);
        let missing = blockwild_world_authority_request_r4(handle, &missing_request.finish().unwrap());
        assert_eq!(&missing[..4], RESPONSE_MAGIC);
        assert_eq!(missing[7], 1);
    }
}

impl<'a> Reader<'a> {
    fn request(bytes: &'a [u8], expected_operation: u8) -> AuthorityResult<Self> {
        let (request_id, operation) = Self::request_header(bytes)?;
        if operation != expected_operation {
            return Err(AuthorityError::new(
                "operation",
                "R4 authority request operation mismatch",
            ));
        }
        Ok(Self {
            bytes,
            offset: 12,
            request_id,
        })
    }

    fn request_header(bytes: &[u8]) -> AuthorityResult<(u32, u8)> {
        if bytes.len() < 12 || &bytes[..4] != REQUEST_MAGIC {
            return Err(AuthorityError::new("wire-magic", "invalid R4 authority request header"));
        }
        if u16::from_le_bytes([bytes[4], bytes[5]]) != BRIDGE_VERSION || bytes[7] != 0 {
            return Err(AuthorityError::new(
                "wire-version",
                "incompatible R4 authority wire version or flags",
            ));
        }
        let request_id = u32::from_le_bytes(bytes[8..12].try_into().expect("header length checked"));
        Ok((request_id, bytes[6]))
    }

    fn finish(&self) -> AuthorityResult<()> {
        if self.offset != self.bytes.len() {
            return Err(AuthorityError::new(
                "wire-trailing",
                "R4 authority request has trailing bytes",
            ));
        }
        Ok(())
    }

    fn take(&mut self, length: usize) -> AuthorityResult<&'a [u8]> {
        let end = self
            .offset
            .checked_add(length)
            .filter(|end| *end <= self.bytes.len())
            .ok_or_else(|| AuthorityError::new("wire-truncated", "R4 authority request is truncated"))?;
        let value = &self.bytes[self.offset..end];
        self.offset = end;
        Ok(value)
    }

    fn u8(&mut self) -> AuthorityResult<u8> {
        Ok(self.take(1)?[0])
    }

    fn u16(&mut self) -> AuthorityResult<u16> {
        Ok(u16::from_le_bytes(
            self.take(2)?.try_into().expect("exact two-byte slice"),
        ))
    }

    fn u32(&mut self) -> AuthorityResult<u32> {
        Ok(u32::from_le_bytes(
            self.take(4)?.try_into().expect("exact four-byte slice"),
        ))
    }

    fn i32(&mut self) -> AuthorityResult<i32> {
        Ok(i32::from_le_bytes(
            self.take(4)?.try_into().expect("exact four-byte slice"),
        ))
    }

    fn u64(&mut self) -> AuthorityResult<u64> {
        let value = u64::from_le_bytes(self.take(8)?.try_into().expect("exact eight-byte slice"));
        if value > blockwild_authority::JS_MAX_SAFE_INTEGER_V1 {
            return Err(AuthorityError::new(
                "wire-integer",
                "R4 wire integer exceeds JavaScript safe range",
            ));
        }
        Ok(value)
    }

    fn string(&mut self, maximum_utf16: usize) -> AuthorityResult<String> {
        let length = usize::from(self.u16()?);
        let bytes = self.take(length)?;
        let value = std::str::from_utf8(bytes)
            .map_err(|_| AuthorityError::new("wire-string", "R4 wire string is not UTF-8"))?
            .to_owned();
        if value.encode_utf16().count() > maximum_utf16 {
            return Err(AuthorityError::new(
                "wire-string",
                "R4 wire string exceeds its UTF-16 bound",
            ));
        }
        Ok(value)
    }

    fn large_string(&mut self, maximum_utf16: usize) -> AuthorityResult<String> {
        let length = self.count_u32(WORLD_CODEC_MAX_BYTES_V1)?;
        let bytes = self.take(length)?;
        let value = std::str::from_utf8(bytes)
            .map_err(|_| AuthorityError::new("wire-string", "R4 wire string is not UTF-8"))?
            .to_owned();
        if value.encode_utf16().count() > maximum_utf16 {
            return Err(AuthorityError::new(
                "wire-string",
                "R4 wire string exceeds its UTF-16 bound",
            ));
        }
        Ok(value)
    }

    fn hash(&mut self) -> AuthorityResult<String> {
        let value = self.string(HASH_LENGTH)?;
        if value.len() != HASH_LENGTH
            || !value
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
        {
            return Err(AuthorityError::new(
                "wire-hash",
                "R4 wire hash must be 32 lowercase hexadecimal characters",
            ));
        }
        Ok(value)
    }

    fn bytes(&mut self, maximum: usize) -> AuthorityResult<Vec<u8>> {
        let length = self.count_u32(maximum)?;
        Ok(self.take(length)?.to_vec())
    }

    fn exact_bytes(&mut self, length: usize) -> AuthorityResult<Vec<u8>> {
        Ok(self.take(length)?.to_vec())
    }

    fn count_u16(&mut self, maximum: usize) -> AuthorityResult<usize> {
        let count = usize::from(self.u16()?);
        if count > maximum {
            return Err(AuthorityError::new("wire-count", "R4 wire count exceeds its bound"));
        }
        Ok(count)
    }

    fn count_u32(&mut self, maximum: usize) -> AuthorityResult<usize> {
        let count = usize::try_from(self.u32()?).expect("u32 fits usize on supported Wasm/native targets");
        if count > maximum {
            return Err(AuthorityError::new("wire-count", "R4 wire count exceeds its bound"));
        }
        Ok(count)
    }

    fn optional_u32_indices(&mut self) -> AuthorityResult<Option<Vec<u32>>> {
        match self.u8()? {
            0 => Ok(None),
            1 => {
                let count = self.count_u32(49_152)?;
                (0..count)
                    .map(|_| self.u32())
                    .collect::<AuthorityResult<Vec<_>>>()
                    .map(Some)
            }
            _ => Err(AuthorityError::new(
                "wire-option",
                "invalid auxiliary index patch option",
            )),
        }
    }

    fn address(&mut self) -> AuthorityResult<WorldAddressV1> {
        WorldAddressV1::new(self.string(64)?, self.string(128)?)
    }

    fn section_address(&mut self) -> AuthorityResult<WorldSectionAddressV1> {
        Ok(WorldSectionAddressV1 {
            world: self.address()?,
            chunk_x: self.i32()?,
            chunk_z: self.i32()?,
            section_y: self.u16()? as i16,
        })
    }

    fn identity(&mut self) -> AuthorityResult<WorldAuthorityIdentityV1> {
        let identity = WorldAuthorityIdentityV1 {
            address: self.address()?,
            revision: WorldAuthorityRevisionV1 {
                epoch: self.u64()?,
                mutation: self.u64()?,
                residency: self.u64()?,
            },
            state_hash: self.hash()?,
        };
        identity.revision.validate()?;
        Ok(identity)
    }

    fn optional_identity(&mut self) -> AuthorityResult<Option<WorldAuthorityIdentityV1>> {
        match self.u8()? {
            0 => Ok(None),
            1 => self.identity().map(Some),
            _ => Err(AuthorityError::new("wire-option", "invalid optional identity tag")),
        }
    }

    fn position(&mut self) -> AuthorityResult<CellPositionV1> {
        Ok(CellPositionV1 {
            x: self.i32()?,
            y: self.i32()?,
            z: self.i32()?,
        })
    }

    fn u16_set(&mut self, maximum: usize) -> AuthorityResult<BTreeSet<u16>> {
        let count = self.count_u16(maximum)?;
        let mut values = BTreeSet::new();
        for _ in 0..count {
            if !values.insert(self.u16()?) {
                return Err(AuthorityError::new("wire-order", "catalog block ids must be unique"));
            }
        }
        Ok(values)
    }

    fn chunk_auxiliary(&mut self) -> AuthorityResult<ChunkAuxiliaryDataV1> {
        let address = WorldChunkAddressV1 {
            world: self.address()?,
            chunk_x: self.i32()?,
            chunk_z: self.i32()?,
        };
        let source_revision = self.u64()?;
        let source_hash = self.hash()?;
        let heightmap = (0..256)
            .map(|_| self.u16().map(|value| value as i16))
            .collect::<AuthorityResult<Vec<_>>>()?;
        let biomes = self.exact_bytes(256)?;
        let section_block_counts = (0..12).map(|_| self.u16()).collect::<AuthorityResult<Vec<_>>>()?;
        let sky_tops = (0..256)
            .map(|_| self.u16().map(|value| value as i16))
            .collect::<AuthorityResult<Vec<_>>>()?;
        let light = (0..49_152).map(|_| self.u16()).collect::<AuthorityResult<Vec<_>>>()?;
        let light_index_count = self.count_u32(49_152)?;
        let light_indices = (0..light_index_count)
            .map(|_| self.u32())
            .collect::<AuthorityResult<Vec<_>>>()?;
        let leaf_index_count = self.count_u32(49_152)?;
        let leaf_indices = (0..leaf_index_count)
            .map(|_| self.u32())
            .collect::<AuthorityResult<Vec<_>>>()?;
        let marker_count = self.count_u32(MAX_MARKERS)?;
        let markers = (0..marker_count)
            .map(|_| Ok((self.string(128)?, self.large_string(262_144)?)))
            .collect::<AuthorityResult<Vec<_>>>()?;
        let value = ChunkAuxiliaryDataV1 {
            address,
            source_revision,
            source_hash,
            heightmap,
            biomes,
            section_block_counts,
            sky_tops,
            light,
            light_indices,
            leaf_indices,
            markers,
        };
        value.validate()?;
        Ok(value)
    }

    fn compatibility_save(&mut self) -> AuthorityResult<WorldCompatibilitySaveR4V1> {
        let address = self.address()?;
        let revision = WorldAuthorityRevisionV1 {
            epoch: self.u64()?,
            mutation: self.u64()?,
            residency: self.u64()?,
        };
        let edit_count = self.count_u32(65_536)?;
        let mut edits = Vec::with_capacity(edit_count);
        for _ in 0..edit_count {
            let chunk_x = self.i32()?;
            let chunk_z = self.i32()?;
            let entry_count = self.count_u32(49_152)?;
            let entries = (0..entry_count)
                .map(|_| Ok((self.u32()?, self.u16()?)))
                .collect::<AuthorityResult<Vec<_>>>()?;
            edits.push(CompatibilityChunkEditsV1 {
                chunk_x,
                chunk_z,
                entries,
            });
        }
        let facing_count = self.count_u32(1_000_000)?;
        let facings = (0..facing_count)
            .map(|_| {
                Ok(CompatibilityFacingV1 {
                    position: self.position()?,
                    facing: self.u8()?,
                })
            })
            .collect::<AuthorityResult<Vec<_>>>()?;
        let checksum = self.hash()?;
        let save = create_compatibility_save(address, revision, edits, facings, Vec::new());
        if save.compatibility_checksum != checksum {
            return Err(AuthorityError::new(
                "save-checksum",
                "compatibility save checksum mismatch",
            ));
        }
        Ok(save)
    }
}
