use std::collections::{BTreeMap, BTreeSet, VecDeque};

use blockwild_types::{CanonicalHash, CanonicalHasher};

use crate::store::{
    ChunkAuxiliaryRecord, LocationShard, SectionRecord, digest_edit_journal, hash_chunk_auxiliary, hash_section_cells,
};
use crate::{
    AuthorityError, AuthorityResult, BlockCatalogV1, CellPositionV1, ChunkAuxiliaryDataV1, DirtySubsystemV1,
    ImmediateWorldEditEventR4V1, JS_MAX_SAFE_INTEGER_V1, LiquidMetadataV1, ResidencyJobTokenV1,
    ResidencyPriorityClassV1, ResidencyPurposeV1, ResidencyRequestV1, SectionResidencySchedulerV1,
    SectionResidencySnapshotV1, WORLD_CHUNK_CELL_COUNT_V1, WORLD_IMMEDIATE_EVENT_CAPACITY_V1, WORLD_MAX_Y_V1,
    WORLD_MIN_Y_V1, WORLD_MUTATION_BATCH_MAX_COMMANDS_V1, WORLD_SECTION_CELL_COUNT_V1, WORLD_SECTION_COUNT_V1,
    WorldAddressV1, WorldAuthorityIdentityV1, WorldAuthorityRevisionV1, WorldAuthorityStoreR4V1, WorldCellV1,
    WorldChunkAddressV1, WorldCommittedCellR4V1, WorldSectionAddressV1, WorldSectionRevisionV1, validate_hash,
};

pub const WORLD_AUTHORITY_SNAPSHOT_SCHEMA_V1: u16 = 1;
/// Leaves one MiB of headroom for the native record envelope and persistence
/// descriptor under the 64 MiB canonical-record ceiling.
pub const WORLD_AUTHORITY_SNAPSHOT_MAX_BYTES_V1: usize = 63 * 1_048_576;

const SNAPSHOT_MAGIC_V1: &[u8; 4] = b"BWWS";
const SNAPSHOT_MAX_LOCATIONS_V1: usize = 1_024;
const SNAPSHOT_MAX_SECTIONS_V1: usize = 65_536;
const SNAPSHOT_MAX_CHUNKS_V1: usize = 65_536;
const SNAPSHOT_MAX_JOURNAL_CELLS_V1: usize = 2_097_152;
const SNAPSHOT_MAX_RESIDENCY_REQUESTS_V1: usize = 262_144;
const SNAPSHOT_MAX_INDICES_V1: usize = WORLD_CHUNK_CELL_COUNT_V1;
const SNAPSHOT_MAX_MARKERS_V1: usize = 65_536;
const SNAPSHOT_MAX_STRING_BYTES_V1: usize = 256 * 1024;

#[derive(Clone, Debug)]
pub struct DecodedWorldAuthoritySnapshotR4V1 {
    pub authority: WorldAuthorityStoreR4V1,
    pub unknown_extension_bytes: Vec<u8>,
}

/// Encodes every deterministic R4 field, including resident generated data,
/// scheduler state, revision ledgers, immediate events, and unknown extension
/// bytes. BWAS remains the intentionally lossy TypeScript compatibility view.
pub fn encode_world_authority_snapshot_r4_v1(
    authority: &WorldAuthorityStoreR4V1,
    unknown_extension_bytes: &[u8],
) -> AuthorityResult<Vec<u8>> {
    let mut writer = SnapshotWriterV1::default();
    writer.raw(SNAPSHOT_MAGIC_V1)?;
    writer.u16(WORLD_AUTHORITY_SNAPSHOT_SCHEMA_V1)?;
    write_catalog(&mut writer, &authority.catalog)?;
    write_world_address(&mut writer, &authority.active)?;
    writer.safe_u64(authority.next_epoch, "next epoch")?;
    writer.count(authority.locations.len(), SNAPSHOT_MAX_LOCATIONS_V1, "locations")?;
    for (address, location) in &authority.locations {
        if address != &location.address {
            return Err(snapshot_error(
                "snapshot-location-key",
                "location key and payload address differ",
            ));
        }
        write_location(&mut writer, location)?;
    }
    writer.hash(authority.canonical_state_hash())?;
    writer.bytes(unknown_extension_bytes)?;
    let body = writer.finish();
    let checksum = snapshot_checksum(&body);
    let mut output = SnapshotWriterV1::from_prefix(body)?;
    output.hash(checksum)?;
    Ok(output.finish())
}

/// Decodes and validates into a private store. No caller-visible authority is
/// mutated unless the complete checksum and canonical state hash both agree.
pub fn decode_world_authority_snapshot_r4_v1(bytes: &[u8]) -> AuthorityResult<DecodedWorldAuthoritySnapshotR4V1> {
    if bytes.len() < SNAPSHOT_MAGIC_V1.len() + 2 + 16 || bytes.len() > WORLD_AUTHORITY_SNAPSHOT_MAX_BYTES_V1 {
        return Err(snapshot_error(
            "snapshot-size",
            "world authority snapshot is truncated or exceeds its bounded maximum",
        ));
    }
    let checksum_offset = bytes.len() - 16;
    let expected_checksum = snapshot_checksum(&bytes[..checksum_offset]);
    let mut reader = SnapshotReaderV1::new(bytes);
    reader.magic(SNAPSHOT_MAGIC_V1)?;
    if reader.u16()? != WORLD_AUTHORITY_SNAPSHOT_SCHEMA_V1 {
        return Err(snapshot_error(
            "snapshot-schema",
            "world authority snapshot schema is unsupported",
        ));
    }
    let catalog = read_catalog(&mut reader)?;
    let active = read_world_address(&mut reader)?;
    let next_epoch = reader.u64()?;
    let location_count = reader.count(SNAPSHOT_MAX_LOCATIONS_V1, "locations")?;
    let mut locations = BTreeMap::new();
    let mut maximum_epoch = 0_u64;
    for _ in 0..location_count {
        let location = read_location(&mut reader, &catalog)?;
        maximum_epoch = maximum_epoch.max(location.revision.epoch);
        if locations.insert(location.address.clone(), location).is_some() {
            return Err(snapshot_error(
                "snapshot-duplicate",
                "world snapshot repeats a location",
            ));
        }
    }
    let expected_state_hash = reader.hash()?;
    let unknown_extension_bytes = reader.bytes(WORLD_AUTHORITY_SNAPSHOT_MAX_BYTES_V1)?;
    let stored_checksum = reader.hash()?;
    reader.finish()?;
    if stored_checksum != expected_checksum {
        return Err(snapshot_error(
            "snapshot-checksum",
            "world authority snapshot checksum does not match",
        ));
    }
    if !locations.contains_key(&active) {
        return Err(snapshot_error(
            "snapshot-active",
            "world snapshot active location is absent",
        ));
    }
    if next_epoch == 0 || next_epoch > JS_MAX_SAFE_INTEGER_V1 || next_epoch <= maximum_epoch {
        return Err(snapshot_error(
            "snapshot-next-epoch",
            "world snapshot next epoch is not monotonic",
        ));
    }
    let authority = WorldAuthorityStoreR4V1 {
        catalog,
        locations,
        active,
        next_epoch,
    };
    if authority.canonical_state_hash() != expected_state_hash {
        return Err(snapshot_error(
            "snapshot-state-hash",
            "world snapshot fields do not reproduce their canonical authority hash",
        ));
    }
    Ok(DecodedWorldAuthoritySnapshotR4V1 {
        authority,
        unknown_extension_bytes,
    })
}

fn write_location(writer: &mut SnapshotWriterV1, value: &LocationShard) -> AuthorityResult<()> {
    write_world_address(writer, &value.address)?;
    write_world_revision(writer, value.revision)?;
    writer.safe_u64(value.next_event_sequence, "next event sequence")?;
    write_residency(writer, &value.residency.exact_snapshot())?;

    writer.count(value.revisions.len(), SNAPSHOT_MAX_SECTIONS_V1, "section revisions")?;
    for (address, revision) in &value.revisions {
        write_section_address(writer, address)?;
        write_section_revision(writer, *revision)?;
    }
    writer.count(value.sections.len(), SNAPSHOT_MAX_SECTIONS_V1, "resident sections")?;
    for (address, section) in &value.sections {
        write_section_address(writer, address)?;
        write_section_revision(writer, section.revision)?;
        writer.safe_u64(section.source_revision, "section source revision")?;
        writer.string(&section.source_hash)?;
        writer.hash(section.content_hash)?;
        writer.count(section.dirty.len(), 7, "section dirty systems")?;
        for subsystem in &section.dirty {
            writer.u8(dirty_subsystem_tag(*subsystem))?;
        }
        writer.count(section.cells.len(), WORLD_SECTION_CELL_COUNT_V1, "section cells")?;
        for cell in &section.cells {
            write_cell(writer, *cell)?;
        }
    }
    writer.count(
        value.chunk_auxiliary.len(),
        SNAPSHOT_MAX_CHUNKS_V1,
        "chunk auxiliary records",
    )?;
    for (address, record) in &value.chunk_auxiliary {
        if address != &record.data.address {
            return Err(snapshot_error(
                "snapshot-auxiliary-address",
                "chunk auxiliary key and payload address differ",
            ));
        }
        write_chunk_address(writer, address)?;
        writer.hash(record.content_hash)?;
        write_chunk_auxiliary(writer, &record.data)?;
    }
    writer.count(value.edit_journal.len(), SNAPSHOT_MAX_JOURNAL_CELLS_V1, "journal cells")?;
    for (position, cell) in &value.edit_journal {
        write_position(writer, *position)?;
        write_cell(writer, *cell)?;
    }
    writer.count(
        value.events.len(),
        WORLD_IMMEDIATE_EVENT_CAPACITY_V1,
        "immediate events",
    )?;
    for event in &value.events {
        write_event(writer, event)?;
    }
    Ok(())
}

fn read_location(reader: &mut SnapshotReaderV1<'_>, catalog: &BlockCatalogV1) -> AuthorityResult<LocationShard> {
    let address = read_world_address(reader)?;
    let revision = read_world_revision(reader)?;
    let next_event_sequence = reader.u64()?;
    let residency = SectionResidencySchedulerV1::from_exact_snapshot(read_residency(reader)?)?;
    if residency.exact_snapshot().epoch != revision.epoch {
        return Err(snapshot_error(
            "snapshot-residency-epoch",
            "location revision and residency scheduler epochs differ",
        ));
    }

    let revision_count = reader.count(SNAPSHOT_MAX_SECTIONS_V1, "section revisions")?;
    let mut revisions = BTreeMap::new();
    for _ in 0..revision_count {
        let section_address = read_section_address(reader)?;
        validate_section_address(&section_address, &address)?;
        let section_revision = read_section_revision(reader)?;
        if revisions.insert(section_address, section_revision).is_some() {
            return Err(snapshot_error(
                "snapshot-duplicate",
                "world snapshot repeats a section revision",
            ));
        }
    }

    let section_count = reader.count(SNAPSHOT_MAX_SECTIONS_V1, "resident sections")?;
    let mut sections = BTreeMap::new();
    for _ in 0..section_count {
        let section_address = read_section_address(reader)?;
        validate_section_address(&section_address, &address)?;
        let section_revision = read_section_revision(reader)?;
        let source_revision = reader.safe_u64("section source revision")?;
        let source_hash = reader.string(SNAPSHOT_MAX_STRING_BYTES_V1)?;
        validate_hash(&source_hash, "sourceHash")?;
        let content_hash = reader.hash()?;
        let dirty_count = reader.count(7, "section dirty systems")?;
        let mut dirty = BTreeSet::new();
        for _ in 0..dirty_count {
            if !dirty.insert(dirty_subsystem(reader.u8()?)?) {
                return Err(snapshot_error(
                    "snapshot-duplicate",
                    "section repeats a dirty subsystem",
                ));
            }
        }
        let cell_count = reader.count(WORLD_SECTION_CELL_COUNT_V1, "section cells")?;
        if cell_count != WORLD_SECTION_CELL_COUNT_V1 {
            return Err(snapshot_error(
                "snapshot-section-length",
                "resident section has the wrong cell count",
            ));
        }
        let mut cells = Vec::with_capacity(cell_count);
        for _ in 0..cell_count {
            let cell = read_cell(reader)?;
            cell.validate()?;
            cells.push(cell);
        }
        if hash_section_cells(&cells) != content_hash {
            return Err(snapshot_error(
                "snapshot-section-hash",
                "resident section content hash does not match",
            ));
        }
        if revisions.get(&section_address) != Some(&section_revision) {
            return Err(snapshot_error(
                "snapshot-section-revision",
                "resident section and revision ledger disagree",
            ));
        }
        let record = SectionRecord {
            cells,
            content_hash,
            revision: section_revision,
            source_revision,
            source_hash,
            dirty,
        };
        if sections.insert(section_address, record).is_some() {
            return Err(snapshot_error(
                "snapshot-duplicate",
                "world snapshot repeats a resident section",
            ));
        }
    }

    let auxiliary_count = reader.count(SNAPSHOT_MAX_CHUNKS_V1, "chunk auxiliary records")?;
    let mut chunk_auxiliary = BTreeMap::new();
    for _ in 0..auxiliary_count {
        let chunk_address = read_chunk_address(reader)?;
        validate_chunk_address(&chunk_address, &address)?;
        let content_hash = reader.hash()?;
        let data = read_chunk_auxiliary(reader, chunk_address.clone())?;
        data.validate()?;
        if hash_chunk_auxiliary(&data) != content_hash {
            return Err(snapshot_error(
                "snapshot-auxiliary-hash",
                "chunk auxiliary content hash does not match",
            ));
        }
        if chunk_auxiliary
            .insert(chunk_address, ChunkAuxiliaryRecord { data, content_hash })
            .is_some()
        {
            return Err(snapshot_error(
                "snapshot-duplicate",
                "world snapshot repeats chunk auxiliary data",
            ));
        }
    }

    let journal_count = reader.count(SNAPSHOT_MAX_JOURNAL_CELLS_V1, "journal cells")?;
    let mut edit_journal = BTreeMap::new();
    for _ in 0..journal_count {
        let position = read_position(reader)?;
        if !(WORLD_MIN_Y_V1..=WORLD_MAX_Y_V1).contains(&position.y) {
            return Err(snapshot_error(
                "snapshot-position",
                "journal cell is outside world height bounds",
            ));
        }
        let cell = read_cell(reader)?;
        cell.validate()?;
        if cell.facing != 0 && !catalog.directional_blocks.contains(&cell.block_id) {
            return Err(snapshot_error(
                "snapshot-facing",
                "journal cell has facing metadata for a non-directional block",
            ));
        }
        if cell.liquid.waterlogged && !catalog.waterlogged_blocks.contains(&cell.block_id) {
            return Err(snapshot_error(
                "snapshot-waterlogged",
                "journal cell waterlogs a block absent from the catalog",
            ));
        }
        if edit_journal.insert(position, cell).is_some() {
            return Err(snapshot_error(
                "snapshot-duplicate",
                "world snapshot repeats a journal cell",
            ));
        }
    }

    let event_count = reader.count(WORLD_IMMEDIATE_EVENT_CAPACITY_V1, "immediate events")?;
    let mut events = VecDeque::with_capacity(event_count);
    let mut prior_sequence = 0_u64;
    for _ in 0..event_count {
        let event = read_event(reader)?;
        if event.address != address
            || event.identity.address != address
            || event.sequence <= prior_sequence
            || event.sequence >= next_event_sequence
        {
            return Err(snapshot_error(
                "snapshot-event",
                "immediate event identity or sequence is invalid",
            ));
        }
        prior_sequence = event.sequence;
        events.push_back(event);
    }
    if next_event_sequence == 0 || next_event_sequence > JS_MAX_SAFE_INTEGER_V1 {
        return Err(snapshot_error(
            "snapshot-event-sequence",
            "next immediate event sequence is invalid",
        ));
    }
    Ok(LocationShard {
        address,
        revision,
        sections,
        revisions,
        chunk_auxiliary,
        edit_journal_digest: digest_edit_journal(&edit_journal),
        edit_journal,
        residency,
        events,
        next_event_sequence,
    })
}

fn write_catalog(writer: &mut SnapshotWriterV1, value: &BlockCatalogV1) -> AuthorityResult<()> {
    writer.u16(value.water_block_id)?;
    writer.count(value.directional_blocks.len(), u16::MAX as usize, "directional blocks")?;
    for block in &value.directional_blocks {
        writer.u16(*block)?;
    }
    writer.count(value.waterlogged_blocks.len(), u16::MAX as usize, "waterlogged blocks")?;
    for block in &value.waterlogged_blocks {
        writer.u16(*block)?;
    }
    Ok(())
}

fn read_catalog(reader: &mut SnapshotReaderV1<'_>) -> AuthorityResult<BlockCatalogV1> {
    let water_block_id = reader.u16()?;
    let directional_count = reader.count(u16::MAX as usize, "directional blocks")?;
    let mut directional_blocks = BTreeSet::new();
    for _ in 0..directional_count {
        if !directional_blocks.insert(reader.u16()?) {
            return Err(snapshot_error(
                "snapshot-duplicate",
                "catalog repeats a directional block",
            ));
        }
    }
    let waterlogged_count = reader.count(u16::MAX as usize, "waterlogged blocks")?;
    let mut waterlogged_blocks = BTreeSet::new();
    for _ in 0..waterlogged_count {
        if !waterlogged_blocks.insert(reader.u16()?) {
            return Err(snapshot_error(
                "snapshot-duplicate",
                "catalog repeats a waterlogged block",
            ));
        }
    }
    Ok(BlockCatalogV1 {
        directional_blocks,
        waterlogged_blocks,
        water_block_id,
    })
}

fn write_residency(writer: &mut SnapshotWriterV1, value: &SectionResidencySnapshotV1) -> AuthorityResult<()> {
    writer.u64(value.epoch)?;
    writer.count(
        value.queued.len(),
        SNAPSHOT_MAX_RESIDENCY_REQUESTS_V1,
        "queued residency",
    )?;
    for request in &value.queued {
        write_residency_request(writer, request)?;
    }
    writer.count(
        value.active.len(),
        SNAPSHOT_MAX_RESIDENCY_REQUESTS_V1,
        "active residency",
    )?;
    for token in &value.active {
        write_residency_request(writer, &token.request)?;
        write_world_revision(writer, token.authority_revision)?;
        writer.string(&token.source_hash)?;
    }
    writer.count(
        value.cancelled.len(),
        SNAPSHOT_MAX_RESIDENCY_REQUESTS_V1,
        "cancelled residency",
    )?;
    for request_id in &value.cancelled {
        writer.u64(*request_id)?;
    }
    Ok(())
}

fn read_residency(reader: &mut SnapshotReaderV1<'_>) -> AuthorityResult<SectionResidencySnapshotV1> {
    let epoch = reader.u64()?;
    let queued_count = reader.count(SNAPSHOT_MAX_RESIDENCY_REQUESTS_V1, "queued residency")?;
    let mut queued = Vec::with_capacity(queued_count);
    for _ in 0..queued_count {
        queued.push(read_residency_request(reader)?);
    }
    let active_count = reader.count(SNAPSHOT_MAX_RESIDENCY_REQUESTS_V1, "active residency")?;
    let mut active = Vec::with_capacity(active_count);
    for _ in 0..active_count {
        active.push(ResidencyJobTokenV1 {
            request: read_residency_request(reader)?,
            authority_revision: read_world_revision(reader)?,
            source_hash: reader.string(SNAPSHOT_MAX_STRING_BYTES_V1)?,
        });
    }
    let cancelled_count = reader.count(SNAPSHOT_MAX_RESIDENCY_REQUESTS_V1, "cancelled residency")?;
    let mut cancelled = Vec::with_capacity(cancelled_count);
    for _ in 0..cancelled_count {
        cancelled.push(reader.u64()?);
    }
    Ok(SectionResidencySnapshotV1 {
        epoch,
        queued,
        active,
        cancelled,
    })
}

fn write_residency_request(writer: &mut SnapshotWriterV1, value: &ResidencyRequestV1) -> AuthorityResult<()> {
    writer.u64(value.request_id)?;
    writer.u64(value.epoch)?;
    write_section_address(writer, &value.address)?;
    writer.u8(value.class as u8)?;
    writer.u8(residency_purpose_tag(value.purpose))?;
    writer.u32(value.distance_squared)?;
    writer.u16(value.direction_penalty)?;
    writer.u64(value.sequence)
}

fn read_residency_request(reader: &mut SnapshotReaderV1<'_>) -> AuthorityResult<ResidencyRequestV1> {
    Ok(ResidencyRequestV1 {
        request_id: reader.u64()?,
        epoch: reader.u64()?,
        address: read_section_address(reader)?,
        class: residency_priority(reader.u8()?)?,
        purpose: residency_purpose(reader.u8()?)?,
        distance_squared: reader.u32()?,
        direction_penalty: reader.u16()?,
        sequence: reader.u64()?,
    })
}

fn write_chunk_auxiliary(writer: &mut SnapshotWriterV1, value: &ChunkAuxiliaryDataV1) -> AuthorityResult<()> {
    writer.safe_u64(value.source_revision, "chunk auxiliary source revision")?;
    writer.string(&value.source_hash)?;
    writer.i16_slice(&value.heightmap)?;
    writer.bytes(&value.biomes)?;
    writer.u16_slice(&value.section_block_counts)?;
    writer.i16_slice(&value.sky_tops)?;
    writer.u16_slice(&value.light)?;
    writer.u32_slice(&value.light_indices)?;
    writer.u32_slice(&value.leaf_indices)?;
    writer.count(value.markers.len(), SNAPSHOT_MAX_MARKERS_V1, "chunk markers")?;
    for (key, json) in &value.markers {
        writer.string(key)?;
        writer.string(json)?;
    }
    Ok(())
}

fn read_chunk_auxiliary(
    reader: &mut SnapshotReaderV1<'_>,
    address: WorldChunkAddressV1,
) -> AuthorityResult<ChunkAuxiliaryDataV1> {
    let source_revision = reader.safe_u64("chunk auxiliary source revision")?;
    let source_hash = reader.string(SNAPSHOT_MAX_STRING_BYTES_V1)?;
    let heightmap = reader.i16_vec(256, "heightmap")?;
    let biomes = reader.bytes(256)?;
    let section_block_counts = reader.u16_vec(WORLD_SECTION_COUNT_V1 as usize, "section block counts")?;
    let sky_tops = reader.i16_vec(256, "sky tops")?;
    let light = reader.u16_vec(WORLD_CHUNK_CELL_COUNT_V1, "chunk light")?;
    let light_indices = reader.u32_vec(SNAPSHOT_MAX_INDICES_V1, "light indices")?;
    let leaf_indices = reader.u32_vec(SNAPSHOT_MAX_INDICES_V1, "leaf indices")?;
    let marker_count = reader.count(SNAPSHOT_MAX_MARKERS_V1, "chunk markers")?;
    let mut markers = Vec::with_capacity(marker_count);
    for _ in 0..marker_count {
        markers.push((
            reader.string(SNAPSHOT_MAX_STRING_BYTES_V1)?,
            reader.string(SNAPSHOT_MAX_STRING_BYTES_V1)?,
        ));
    }
    Ok(ChunkAuxiliaryDataV1 {
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
    })
}

fn write_event(writer: &mut SnapshotWriterV1, value: &ImmediateWorldEditEventR4V1) -> AuthorityResult<()> {
    writer.u64(value.sequence)?;
    write_world_address(writer, &value.address)?;
    writer.string(&value.batch_id)?;
    write_world_identity(writer, &value.identity)?;
    writer.count(
        value.changes.len(),
        WORLD_MUTATION_BATCH_MAX_COMMANDS_V1,
        "event changes",
    )?;
    for change in &value.changes {
        write_committed_cell(writer, change)?;
    }
    writer.count(
        value.dirty_sections.len(),
        SNAPSHOT_MAX_SECTIONS_V1,
        "event dirty sections",
    )?;
    for address in &value.dirty_sections {
        write_section_address(writer, address)?;
    }
    Ok(())
}

fn read_event(reader: &mut SnapshotReaderV1<'_>) -> AuthorityResult<ImmediateWorldEditEventR4V1> {
    let sequence = reader.u64()?;
    let address = read_world_address(reader)?;
    let batch_id = reader.string(SNAPSHOT_MAX_STRING_BYTES_V1)?;
    let identity = read_world_identity(reader)?;
    let change_count = reader.count(WORLD_MUTATION_BATCH_MAX_COMMANDS_V1, "event changes")?;
    let mut changes = Vec::with_capacity(change_count);
    for _ in 0..change_count {
        changes.push(read_committed_cell(reader)?);
    }
    let dirty_count = reader.count(SNAPSHOT_MAX_SECTIONS_V1, "event dirty sections")?;
    let mut dirty_sections = Vec::with_capacity(dirty_count);
    for _ in 0..dirty_count {
        dirty_sections.push(read_section_address(reader)?);
    }
    identity.address.validate()?;
    identity.revision.validate()?;
    validate_hash(&identity.state_hash, "event state hash")?;
    Ok(ImmediateWorldEditEventR4V1 {
        sequence,
        address,
        batch_id,
        identity,
        changes,
        dirty_sections,
    })
}

fn write_committed_cell(writer: &mut SnapshotWriterV1, value: &WorldCommittedCellR4V1) -> AuthorityResult<()> {
    write_position(writer, value.position)?;
    write_cell(writer, value.previous)?;
    write_cell(writer, value.current)
}

fn read_committed_cell(reader: &mut SnapshotReaderV1<'_>) -> AuthorityResult<WorldCommittedCellR4V1> {
    let position = read_position(reader)?;
    let previous = read_cell(reader)?;
    let current = read_cell(reader)?;
    previous.validate()?;
    current.validate()?;
    Ok(WorldCommittedCellR4V1 {
        position,
        previous,
        current,
    })
}

fn write_world_identity(writer: &mut SnapshotWriterV1, value: &WorldAuthorityIdentityV1) -> AuthorityResult<()> {
    write_world_address(writer, &value.address)?;
    write_world_revision(writer, value.revision)?;
    writer.string(&value.state_hash)
}

fn read_world_identity(reader: &mut SnapshotReaderV1<'_>) -> AuthorityResult<WorldAuthorityIdentityV1> {
    Ok(WorldAuthorityIdentityV1 {
        address: read_world_address(reader)?,
        revision: read_world_revision(reader)?,
        state_hash: reader.string(SNAPSHOT_MAX_STRING_BYTES_V1)?,
    })
}

fn write_world_address(writer: &mut SnapshotWriterV1, value: &WorldAddressV1) -> AuthorityResult<()> {
    value.validate()?;
    writer.string(&value.universe_id)?;
    writer.string(&value.location_id)
}

fn read_world_address(reader: &mut SnapshotReaderV1<'_>) -> AuthorityResult<WorldAddressV1> {
    WorldAddressV1::new(
        reader.string(SNAPSHOT_MAX_STRING_BYTES_V1)?,
        reader.string(SNAPSHOT_MAX_STRING_BYTES_V1)?,
    )
}

fn write_chunk_address(writer: &mut SnapshotWriterV1, value: &WorldChunkAddressV1) -> AuthorityResult<()> {
    write_world_address(writer, &value.world)?;
    writer.i32(value.chunk_x)?;
    writer.i32(value.chunk_z)
}

fn read_chunk_address(reader: &mut SnapshotReaderV1<'_>) -> AuthorityResult<WorldChunkAddressV1> {
    Ok(WorldChunkAddressV1 {
        world: read_world_address(reader)?,
        chunk_x: reader.i32()?,
        chunk_z: reader.i32()?,
    })
}

fn write_section_address(writer: &mut SnapshotWriterV1, value: &WorldSectionAddressV1) -> AuthorityResult<()> {
    write_world_address(writer, &value.world)?;
    writer.i32(value.chunk_x)?;
    writer.i32(value.chunk_z)?;
    writer.i16(value.section_y)
}

fn read_section_address(reader: &mut SnapshotReaderV1<'_>) -> AuthorityResult<WorldSectionAddressV1> {
    Ok(WorldSectionAddressV1 {
        world: read_world_address(reader)?,
        chunk_x: reader.i32()?,
        chunk_z: reader.i32()?,
        section_y: reader.i16()?,
    })
}

fn validate_section_address(value: &WorldSectionAddressV1, world: &WorldAddressV1) -> AuthorityResult<()> {
    if &value.world != world || !(0..WORLD_SECTION_COUNT_V1 as i16).contains(&value.section_y) {
        return Err(snapshot_error(
            "snapshot-section-address",
            "section address is outside its location or vertical bounds",
        ));
    }
    Ok(())
}

fn validate_chunk_address(value: &WorldChunkAddressV1, world: &WorldAddressV1) -> AuthorityResult<()> {
    if &value.world != world {
        return Err(snapshot_error(
            "snapshot-chunk-address",
            "chunk address belongs to another location",
        ));
    }
    Ok(())
}

fn write_world_revision(writer: &mut SnapshotWriterV1, value: WorldAuthorityRevisionV1) -> AuthorityResult<()> {
    value.validate()?;
    writer.u64(value.epoch)?;
    writer.u64(value.mutation)?;
    writer.u64(value.residency)
}

fn read_world_revision(reader: &mut SnapshotReaderV1<'_>) -> AuthorityResult<WorldAuthorityRevisionV1> {
    let value = WorldAuthorityRevisionV1 {
        epoch: reader.u64()?,
        mutation: reader.u64()?,
        residency: reader.u64()?,
    };
    value.validate()?;
    Ok(value)
}

fn write_section_revision(writer: &mut SnapshotWriterV1, value: WorldSectionRevisionV1) -> AuthorityResult<()> {
    writer.safe_u64(value.blocks, "section blocks revision")?;
    writer.safe_u64(value.metadata, "section metadata revision")?;
    writer.safe_u64(value.halo, "section halo revision")
}

fn read_section_revision(reader: &mut SnapshotReaderV1<'_>) -> AuthorityResult<WorldSectionRevisionV1> {
    Ok(WorldSectionRevisionV1 {
        blocks: reader.safe_u64("section blocks revision")?,
        metadata: reader.safe_u64("section metadata revision")?,
        halo: reader.safe_u64("section halo revision")?,
    })
}

fn write_position(writer: &mut SnapshotWriterV1, value: CellPositionV1) -> AuthorityResult<()> {
    writer.i32(value.x)?;
    writer.i32(value.y)?;
    writer.i32(value.z)
}

fn read_position(reader: &mut SnapshotReaderV1<'_>) -> AuthorityResult<CellPositionV1> {
    Ok(CellPositionV1 {
        x: reader.i32()?,
        y: reader.i32()?,
        z: reader.i32()?,
    })
}

fn write_cell(writer: &mut SnapshotWriterV1, value: WorldCellV1) -> AuthorityResult<()> {
    value.validate()?;
    writer.u16(value.block_id)?;
    writer.u8(value.facing)?;
    writer.u8(value.liquid.kind as u8)?;
    writer.u8(value.liquid.level)?;
    writer.u8(value.liquid.flags())
}

fn read_cell(reader: &mut SnapshotReaderV1<'_>) -> AuthorityResult<WorldCellV1> {
    let block_id = reader.u16()?;
    let facing = reader.u8()?;
    let liquid = LiquidMetadataV1::from_streams(reader.u8()?, reader.u8()?, reader.u8()?)?;
    Ok(WorldCellV1 {
        block_id,
        facing,
        liquid,
    })
}

fn dirty_subsystem_tag(value: DirtySubsystemV1) -> u8 {
    match value {
        DirtySubsystemV1::Lighting => 1,
        DirtySubsystemV1::Liquids => 2,
        DirtySubsystemV1::Topology => 3,
        DirtySubsystemV1::Meshing => 4,
        DirtySubsystemV1::Navigation => 5,
        DirtySubsystemV1::Maps => 6,
        DirtySubsystemV1::Persistence => 7,
    }
}

fn dirty_subsystem(value: u8) -> AuthorityResult<DirtySubsystemV1> {
    match value {
        1 => Ok(DirtySubsystemV1::Lighting),
        2 => Ok(DirtySubsystemV1::Liquids),
        3 => Ok(DirtySubsystemV1::Topology),
        4 => Ok(DirtySubsystemV1::Meshing),
        5 => Ok(DirtySubsystemV1::Navigation),
        6 => Ok(DirtySubsystemV1::Maps),
        7 => Ok(DirtySubsystemV1::Persistence),
        _ => Err(snapshot_error(
            "snapshot-dirty-subsystem",
            "unknown dirty subsystem tag",
        )),
    }
}

fn residency_priority(value: u8) -> AuthorityResult<ResidencyPriorityClassV1> {
    match value {
        0 => Ok(ResidencyPriorityClassV1::OccupiedSupport),
        1 => Ok(ResidencyPriorityClassV1::PlayerEdited),
        2 => Ok(ResidencyPriorityClassV1::ImmediateOpaque),
        3 => Ok(ResidencyPriorityClassV1::ImmediateTranslucent),
        4 => Ok(ResidencyPriorityClassV1::MovementForward),
        5 => Ok(ResidencyPriorityClassV1::VisibleMid),
        6 => Ok(ResidencyPriorityClassV1::Background),
        _ => Err(snapshot_error(
            "snapshot-residency-priority",
            "unknown residency priority tag",
        )),
    }
}

fn residency_purpose_tag(value: ResidencyPurposeV1) -> u8 {
    match value {
        ResidencyPurposeV1::Generate => 0,
        ResidencyPurposeV1::CacheRead => 1,
        ResidencyPurposeV1::Light => 2,
        ResidencyPurposeV1::Mesh => 3,
        ResidencyPurposeV1::Retain => 4,
    }
}

fn residency_purpose(value: u8) -> AuthorityResult<ResidencyPurposeV1> {
    match value {
        0 => Ok(ResidencyPurposeV1::Generate),
        1 => Ok(ResidencyPurposeV1::CacheRead),
        2 => Ok(ResidencyPurposeV1::Light),
        3 => Ok(ResidencyPurposeV1::Mesh),
        4 => Ok(ResidencyPurposeV1::Retain),
        _ => Err(snapshot_error(
            "snapshot-residency-purpose",
            "unknown residency purpose tag",
        )),
    }
}

fn snapshot_checksum(bytes: &[u8]) -> CanonicalHash {
    let mut hasher = CanonicalHasher::new("blockwild-world-authority-snapshot-r4-v1");
    hasher.write_bytes(bytes);
    hasher.finish()
}

fn snapshot_error(code: &'static str, message: impl Into<String>) -> AuthorityError {
    AuthorityError::new(code, message)
}

#[derive(Default)]
struct SnapshotWriterV1 {
    bytes: Vec<u8>,
}

impl SnapshotWriterV1 {
    fn from_prefix(bytes: Vec<u8>) -> AuthorityResult<Self> {
        if bytes.len() > WORLD_AUTHORITY_SNAPSHOT_MAX_BYTES_V1 {
            return Err(snapshot_error(
                "snapshot-size",
                "world authority snapshot exceeds its bounded maximum",
            ));
        }
        Ok(Self { bytes })
    }

    fn finish(self) -> Vec<u8> {
        self.bytes
    }

    fn reserve(&self, additional: usize) -> AuthorityResult<()> {
        if self.bytes.len().saturating_add(additional) > WORLD_AUTHORITY_SNAPSHOT_MAX_BYTES_V1 {
            return Err(snapshot_error(
                "snapshot-size",
                "world authority snapshot exceeds its bounded maximum",
            ));
        }
        Ok(())
    }

    fn raw(&mut self, value: &[u8]) -> AuthorityResult<()> {
        self.reserve(value.len())?;
        self.bytes.extend_from_slice(value);
        Ok(())
    }

    fn u8(&mut self, value: u8) -> AuthorityResult<()> {
        self.raw(&[value])
    }

    fn u16(&mut self, value: u16) -> AuthorityResult<()> {
        self.raw(&value.to_le_bytes())
    }

    fn i16(&mut self, value: i16) -> AuthorityResult<()> {
        self.raw(&value.to_le_bytes())
    }

    fn u32(&mut self, value: u32) -> AuthorityResult<()> {
        self.raw(&value.to_le_bytes())
    }

    fn i32(&mut self, value: i32) -> AuthorityResult<()> {
        self.raw(&value.to_le_bytes())
    }

    fn u64(&mut self, value: u64) -> AuthorityResult<()> {
        self.raw(&value.to_le_bytes())
    }

    fn safe_u64(&mut self, value: u64, label: &str) -> AuthorityResult<()> {
        if value > JS_MAX_SAFE_INTEGER_V1 {
            return Err(snapshot_error(
                "snapshot-integer",
                format!("{label} exceeds the supported range"),
            ));
        }
        self.u64(value)
    }

    fn count(&mut self, value: usize, maximum: usize, label: &str) -> AuthorityResult<()> {
        if value > maximum || value > u32::MAX as usize {
            return Err(snapshot_error(
                "snapshot-capacity",
                format!("{label} exceeds bounded capacity"),
            ));
        }
        self.u32(value as u32)
    }

    fn bytes(&mut self, value: &[u8]) -> AuthorityResult<()> {
        self.count(value.len(), WORLD_AUTHORITY_SNAPSHOT_MAX_BYTES_V1, "byte field")?;
        self.raw(value)
    }

    fn string(&mut self, value: &str) -> AuthorityResult<()> {
        if value.len() > SNAPSHOT_MAX_STRING_BYTES_V1 {
            return Err(snapshot_error(
                "snapshot-string",
                "snapshot string exceeds bounded capacity",
            ));
        }
        self.bytes(value.as_bytes())
    }

    fn hash(&mut self, value: CanonicalHash) -> AuthorityResult<()> {
        self.raw(value.as_bytes())
    }

    fn i16_slice(&mut self, value: &[i16]) -> AuthorityResult<()> {
        self.count(value.len(), WORLD_CHUNK_CELL_COUNT_V1, "i16 stream")?;
        for entry in value {
            self.i16(*entry)?;
        }
        Ok(())
    }

    fn u16_slice(&mut self, value: &[u16]) -> AuthorityResult<()> {
        self.count(value.len(), WORLD_CHUNK_CELL_COUNT_V1, "u16 stream")?;
        for entry in value {
            self.u16(*entry)?;
        }
        Ok(())
    }

    fn u32_slice(&mut self, value: &[u32]) -> AuthorityResult<()> {
        self.count(value.len(), SNAPSHOT_MAX_INDICES_V1, "u32 stream")?;
        for entry in value {
            self.u32(*entry)?;
        }
        Ok(())
    }
}

struct SnapshotReaderV1<'a> {
    bytes: &'a [u8],
    offset: usize,
}

impl<'a> SnapshotReaderV1<'a> {
    fn new(bytes: &'a [u8]) -> Self {
        Self { bytes, offset: 0 }
    }

    fn take(&mut self, length: usize) -> AuthorityResult<&'a [u8]> {
        let end = self
            .offset
            .checked_add(length)
            .ok_or_else(|| snapshot_error("snapshot-truncated", "world authority snapshot offset overflowed"))?;
        let value = self
            .bytes
            .get(self.offset..end)
            .ok_or_else(|| snapshot_error("snapshot-truncated", "world authority snapshot is truncated"))?;
        self.offset = end;
        Ok(value)
    }

    fn finish(&self) -> AuthorityResult<()> {
        if self.offset != self.bytes.len() {
            return Err(snapshot_error(
                "snapshot-trailing",
                "world authority snapshot has trailing bytes",
            ));
        }
        Ok(())
    }

    fn magic(&mut self, expected: &[u8]) -> AuthorityResult<()> {
        if self.take(expected.len())? != expected {
            return Err(snapshot_error(
                "snapshot-magic",
                "world authority snapshot magic is invalid",
            ));
        }
        Ok(())
    }

    fn u8(&mut self) -> AuthorityResult<u8> {
        Ok(self.take(1)?[0])
    }

    fn u16(&mut self) -> AuthorityResult<u16> {
        let mut bytes = [0_u8; 2];
        bytes.copy_from_slice(self.take(2)?);
        Ok(u16::from_le_bytes(bytes))
    }

    fn i16(&mut self) -> AuthorityResult<i16> {
        let mut bytes = [0_u8; 2];
        bytes.copy_from_slice(self.take(2)?);
        Ok(i16::from_le_bytes(bytes))
    }

    fn u32(&mut self) -> AuthorityResult<u32> {
        let mut bytes = [0_u8; 4];
        bytes.copy_from_slice(self.take(4)?);
        Ok(u32::from_le_bytes(bytes))
    }

    fn i32(&mut self) -> AuthorityResult<i32> {
        let mut bytes = [0_u8; 4];
        bytes.copy_from_slice(self.take(4)?);
        Ok(i32::from_le_bytes(bytes))
    }

    fn u64(&mut self) -> AuthorityResult<u64> {
        let mut bytes = [0_u8; 8];
        bytes.copy_from_slice(self.take(8)?);
        Ok(u64::from_le_bytes(bytes))
    }

    fn safe_u64(&mut self, label: &str) -> AuthorityResult<u64> {
        let value = self.u64()?;
        if value > JS_MAX_SAFE_INTEGER_V1 {
            return Err(snapshot_error(
                "snapshot-integer",
                format!("{label} exceeds the supported range"),
            ));
        }
        Ok(value)
    }

    fn count(&mut self, maximum: usize, label: &str) -> AuthorityResult<usize> {
        let value = self.u32()? as usize;
        if value > maximum {
            return Err(snapshot_error(
                "snapshot-capacity",
                format!("{label} exceeds bounded capacity"),
            ));
        }
        Ok(value)
    }

    fn bytes(&mut self, maximum: usize) -> AuthorityResult<Vec<u8>> {
        let length = self.count(maximum, "byte field")?;
        Ok(self.take(length)?.to_vec())
    }

    fn string(&mut self, maximum: usize) -> AuthorityResult<String> {
        let value = self.bytes(maximum)?;
        String::from_utf8(value).map_err(|_| snapshot_error("snapshot-utf8", "snapshot string is not UTF-8"))
    }

    fn hash(&mut self) -> AuthorityResult<CanonicalHash> {
        let mut bytes = [0_u8; 16];
        bytes.copy_from_slice(self.take(16)?);
        Ok(CanonicalHash(bytes))
    }

    fn i16_vec(&mut self, maximum: usize, label: &str) -> AuthorityResult<Vec<i16>> {
        let length = self.count(maximum, label)?;
        let mut values = Vec::with_capacity(length);
        for _ in 0..length {
            values.push(self.i16()?);
        }
        Ok(values)
    }

    fn u16_vec(&mut self, maximum: usize, label: &str) -> AuthorityResult<Vec<u16>> {
        let length = self.count(maximum, label)?;
        let mut values = Vec::with_capacity(length);
        for _ in 0..length {
            values.push(self.u16()?);
        }
        Ok(values)
    }

    fn u32_vec(&mut self, maximum: usize, label: &str) -> AuthorityResult<Vec<u32>> {
        let length = self.count(maximum, label)?;
        let mut values = Vec::with_capacity(length);
        for _ in 0..length {
            values.push(self.u32()?);
        }
        Ok(values)
    }
}

#[cfg(test)]
mod tests {
    use crate::{
        BlockCatalogV1, CellPositionV1, ResidencyPriorityClassV1, ResidencyPurposeV1, ResidencyRequestV1,
        SectionInstallV1, WORLD_AUTHORITY_SCHEMA_V1, WORLD_SECTION_CELL_COUNT_V1, WorldAddressV1, WorldCellV1,
        WorldMutationBatchR4V1, WorldMutationCommandR4V1, WorldSectionAddressV1,
    };

    use super::*;

    #[test]
    fn exact_snapshot_preserves_loaded_residency_extensions_and_rejects_corruption() {
        let address = WorldAddressV1::new("universe", "surface").unwrap();
        let mut authority = WorldAuthorityStoreR4V1::new(address.clone(), BlockCatalogV1::default()).unwrap();
        let mut cells = vec![WorldCellV1::default(); WORLD_SECTION_CELL_COUNT_V1];
        cells[17].block_id = 4;
        authority
            .install_section_for_replay(SectionInstallV1 {
                address: WorldSectionAddressV1 {
                    world: address,
                    chunk_x: -3,
                    chunk_z: 9,
                    section_y: 5,
                },
                cells,
                source_revision: 7,
                source_hash: "07070707070707070707070707070707".into(),
            })
            .unwrap();
        let identity = authority.identity();
        let position = CellPositionV1 { x: -48, y: 16, z: 144 };
        assert!(matches!(
            authority.apply_mutation_batch(WorldMutationBatchR4V1 {
                schema_version: WORLD_AUTHORITY_SCHEMA_V1,
                batch_id: "snapshot-edit".into(),
                authority_id: "fixture".into(),
                address: identity.address,
                expected_revision: identity.revision,
                commands: vec![WorldMutationCommandR4V1::SetBlock {
                    position,
                    block_id: 6,
                    facing: None,
                }],
            }),
            crate::WorldMutationReceiptR4V1::Accepted { .. }
        ));
        let revision = authority.revision();
        let queued_address = WorldSectionAddressV1 {
            world: authority.active_address().clone(),
            chunk_x: -2,
            chunk_z: 9,
            section_y: 5,
        };
        authority
            .scheduler_mut()
            .submit(ResidencyRequestV1 {
                request_id: 41,
                epoch: revision.epoch,
                address: queued_address,
                class: ResidencyPriorityClassV1::VisibleMid,
                purpose: ResidencyPurposeV1::Generate,
                distance_squared: 4,
                direction_penalty: 1,
                sequence: 1,
            })
            .unwrap();
        let token = authority
            .scheduler_mut()
            .start_next(revision, "41414141414141414141414141414141".into())
            .unwrap()
            .unwrap();
        assert!(authority.scheduler_mut().cancel(token.request.request_id));
        let expected_events = authority.clone().drain_immediate_events();
        let expected_hash = authority.canonical_state_hash();
        let encoded = encode_world_authority_snapshot_r4_v1(&authority, &[0, 0x80, 0xff]).unwrap();
        let decoded = decode_world_authority_snapshot_r4_v1(&encoded).unwrap();
        assert_eq!(decoded.authority.canonical_state_hash(), expected_hash);
        assert_eq!(decoded.authority.resident_section_count(), 1);
        assert_eq!(decoded.unknown_extension_bytes, vec![0, 0x80, 0xff]);
        assert_eq!(decoded.authority.clone().drain_immediate_events(), expected_events);

        let mut corrupt = encoded;
        let middle = corrupt.len() / 2;
        corrupt[middle] ^= 0x40;
        assert!(decode_world_authority_snapshot_r4_v1(&corrupt).is_err());
    }

    #[test]
    fn exact_snapshot_bounds_and_truncation_fail_closed() {
        let address = WorldAddressV1::new("universe", "surface").unwrap();
        let authority = WorldAuthorityStoreR4V1::new(address, BlockCatalogV1::default()).unwrap();
        assert!(
            encode_world_authority_snapshot_r4_v1(&authority, &vec![0; WORLD_AUTHORITY_SNAPSHOT_MAX_BYTES_V1]).is_err()
        );
        let encoded = encode_world_authority_snapshot_r4_v1(&authority, &[]).unwrap();
        assert!(decode_world_authority_snapshot_r4_v1(&encoded[..encoded.len() - 1]).is_err());
    }
}
