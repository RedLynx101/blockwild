use std::collections::BTreeMap;

use blockwild_types::CanonicalHasher;

use crate::canonical::{address_json, hash_canonical_json, json_string, revision_json};
use crate::{
    AuthorityError, AuthorityResult, CellPositionV1, LiquidMetadataV1, WORLD_AUTHORITY_SCHEMA_V1, WORLD_CHUNK_SIZE_V1,
    WORLD_CODEC_MAX_BYTES_V1, WORLD_MAX_Y_V1, WORLD_MIN_Y_V1, WorldAddressV1, WorldAuthorityRevisionV1,
    WorldAuthorityStoreR4V1, WorldCellV1, WorldChunkAddressV1, WorldChunkCacheEnvelopeV1, WorldChunkCacheIdentityV1,
    WorldCommittedCellR4V1, WorldNetworkDeltaR4V1, validate_hash,
};

const SAVE_MAGIC: &[u8; 4] = b"BWAS";
const DELTA_MAGIC: &[u8; 4] = b"BWAD";
const CACHE_MAGIC: &[u8; 4] = b"BWAC";

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CompatibilityChunkEditsV1 {
    pub chunk_x: i32,
    pub chunk_z: i32,
    pub entries: Vec<(u32, u16)>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CompatibilityFacingV1 {
    pub position: CellPositionV1,
    pub facing: u8,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CompatibilityLiquidV1 {
    pub position: CellPositionV1,
    pub liquid: LiquidMetadataV1,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorldCompatibilitySaveR4V1 {
    pub schema_version: u16,
    pub address: WorldAddressV1,
    pub revision: WorldAuthorityRevisionV1,
    pub edits: Vec<CompatibilityChunkEditsV1>,
    pub facings: Vec<CompatibilityFacingV1>,
    pub liquids: Vec<CompatibilityLiquidV1>,
    /** Exact checksum of the current TypeScript V1 save shape (liquids excluded). */
    pub compatibility_checksum: String,
    /** Checksum of the complete R4 record, including liquid metadata. */
    pub extension_checksum: String,
}

impl WorldAuthorityStoreR4V1 {
    #[must_use]
    pub fn export_compatibility_save(&self) -> WorldCompatibilitySaveR4V1 {
        let mut chunks = BTreeMap::<(i32, i32), Vec<(u32, u16)>>::new();
        let mut facings = Vec::new();
        let mut liquids = Vec::new();
        for (position, cell) in self.edit_journal() {
            let index = compatibility_chunk_index(*position);
            chunks
                .entry((position.chunk_x(), position.chunk_z()))
                .or_default()
                .push((index, cell.block_id));
            if self.is_directional_block(cell.block_id) {
                facings.push(CompatibilityFacingV1 {
                    position: *position,
                    facing: cell.facing,
                });
            }
            if cell.liquid != LiquidMetadataV1::default() {
                liquids.push(CompatibilityLiquidV1 {
                    position: *position,
                    liquid: cell.liquid,
                });
            }
        }
        let edits = chunks
            .into_iter()
            .map(|((chunk_x, chunk_z), mut entries)| {
                entries.sort_unstable_by_key(|entry| entry.0);
                CompatibilityChunkEditsV1 {
                    chunk_x,
                    chunk_z,
                    entries,
                }
            })
            .collect::<Vec<_>>();
        facings.sort_by_key(|entry| (entry.position.y, entry.position.z, entry.position.x));
        liquids.sort_by_key(|entry| (entry.position.y, entry.position.z, entry.position.x));
        create_compatibility_save(self.active_address().clone(), self.revision(), edits, facings, liquids)
    }

    pub fn import_compatibility_save(
        &mut self,
        save: &WorldCompatibilitySaveR4V1,
        preserve_recorded_epoch: bool,
    ) -> AuthorityResult<()> {
        save.validate()?;
        if &save.address != self.active_address() {
            return Err(AuthorityError::new(
                "address-mismatch",
                "compatibility save belongs to another active location",
            ));
        }
        let mut cells = BTreeMap::<CellPositionV1, WorldCellV1>::new();
        for chunk in &save.edits {
            for (index, block_id) in &chunk.entries {
                let position = position_from_compatibility_index(chunk.chunk_x, chunk.chunk_z, *index)?;
                if cells
                    .insert(
                        position,
                        WorldCellV1 {
                            block_id: *block_id,
                            ..WorldCellV1::default()
                        },
                    )
                    .is_some()
                {
                    return Err(AuthorityError::new(
                        "duplicate-edit",
                        "save contains a duplicate edited cell",
                    ));
                }
            }
        }
        for facing in &save.facings {
            let Some(cell) = cells.get_mut(&facing.position) else {
                return Err(AuthorityError::new(
                    "orphan-facing",
                    "save facing metadata has no corresponding edited cell",
                ));
            };
            if !self.is_directional_block(cell.block_id) {
                return Err(AuthorityError::new(
                    "facing-not-supported",
                    "save facing metadata targets a non-directional block",
                ));
            }
            cell.facing = facing.facing;
        }
        for liquid in &save.liquids {
            let Some(cell) = cells.get_mut(&liquid.position) else {
                return Err(AuthorityError::new(
                    "orphan-liquid",
                    "save liquid metadata has no corresponding edited cell",
                ));
            };
            cell.liquid = liquid.liquid;
        }
        self.replace_active_journal(cells, save.revision, preserve_recorded_epoch);
        if preserve_recorded_epoch {
            self.reserve_epoch_after(save.revision.epoch);
        } else {
            // Live import is an atomic authority replacement, not a mutation
            // within the prior epoch. A fresh epoch invalidates every page,
            // job, and request that captured the pre-import identity.
            self.advance_active_replacement_epoch();
        }
        Ok(())
    }
}

pub fn create_compatibility_save(
    address: WorldAddressV1,
    revision: WorldAuthorityRevisionV1,
    mut edits: Vec<CompatibilityChunkEditsV1>,
    mut facings: Vec<CompatibilityFacingV1>,
    mut liquids: Vec<CompatibilityLiquidV1>,
) -> WorldCompatibilitySaveR4V1 {
    edits.sort_by_key(|entry| (entry.chunk_x, entry.chunk_z));
    for chunk in &mut edits {
        chunk.entries.sort_unstable_by_key(|entry| entry.0);
    }
    facings.sort_by_key(|entry| (entry.position.y, entry.position.z, entry.position.x));
    liquids.sort_by_key(|entry| (entry.position.y, entry.position.z, entry.position.x));
    let compatibility_json = compatibility_save_without_checksum_json(&address, revision, &edits, &facings);
    let compatibility_checksum = hash_canonical_json("blockwild-world-compatibility-save-v1", &compatibility_json);
    let extension_checksum =
        hash_save_extension(&address, revision, &edits, &facings, &liquids, &compatibility_checksum);
    WorldCompatibilitySaveR4V1 {
        schema_version: WORLD_AUTHORITY_SCHEMA_V1,
        address,
        revision,
        edits,
        facings,
        liquids,
        compatibility_checksum,
        extension_checksum,
    }
}

impl WorldCompatibilitySaveR4V1 {
    pub fn validate(&self) -> AuthorityResult<()> {
        if self.schema_version != WORLD_AUTHORITY_SCHEMA_V1 {
            return Err(AuthorityError::new("schema-mismatch", "save schema is incompatible"));
        }
        self.address.validate()?;
        self.revision.validate()?;
        validate_hash(&self.compatibility_checksum, "compatibilityChecksum")?;
        validate_hash(&self.extension_checksum, "extensionChecksum")?;
        if self.edits.len() > 65_536 || self.facings.len() > 1_000_000 || self.liquids.len() > 1_000_000 {
            return Err(AuthorityError::new(
                "save-size",
                "save collection exceeds bounded maximum",
            ));
        }
        let mut previous_chunk = None;
        for chunk in &self.edits {
            let key = (chunk.chunk_x, chunk.chunk_z);
            if previous_chunk.is_some_and(|previous| previous >= key) {
                return Err(AuthorityError::new(
                    "save-order",
                    "save chunks must be canonical and unique",
                ));
            }
            previous_chunk = Some(key);
            let mut previous_index = None;
            for (index, block_id) in &chunk.entries {
                if *index >= 49_152
                    || *block_id == u16::MAX
                    || previous_index.is_some_and(|previous| previous >= *index)
                {
                    return Err(AuthorityError::new(
                        "save-edit",
                        "save edits must be in range, canonical, and unique",
                    ));
                }
                previous_index = Some(*index);
            }
        }
        let mut previous_facing = None;
        for facing in &self.facings {
            if facing.facing > 3 || facing.position.y < WORLD_MIN_Y_V1 || facing.position.y > WORLD_MAX_Y_V1 {
                return Err(AuthorityError::new("save-facing", "save facing metadata is invalid"));
            }
            let key = (facing.position.y, facing.position.z, facing.position.x);
            if previous_facing.is_some_and(|previous| previous >= key) {
                return Err(AuthorityError::new(
                    "save-order",
                    "save facings must be canonical and unique",
                ));
            }
            previous_facing = Some(key);
        }
        let mut previous_liquid = None;
        for liquid in &self.liquids {
            liquid.liquid.validate()?;
            if liquid.position.y < WORLD_MIN_Y_V1 || liquid.position.y > WORLD_MAX_Y_V1 {
                return Err(AuthorityError::new(
                    "save-liquid",
                    "save liquid metadata is outside world bounds",
                ));
            }
            let key = (liquid.position.y, liquid.position.z, liquid.position.x);
            if previous_liquid.is_some_and(|previous| previous >= key) {
                return Err(AuthorityError::new(
                    "save-order",
                    "save liquids must be canonical and unique",
                ));
            }
            previous_liquid = Some(key);
        }
        let rebuilt = create_compatibility_save(
            self.address.clone(),
            self.revision,
            self.edits.clone(),
            self.facings.clone(),
            self.liquids.clone(),
        );
        if rebuilt != *self {
            return Err(AuthorityError::new(
                "save-checksum",
                "save record is not canonical or has been corrupted",
            ));
        }
        Ok(())
    }

    pub fn compatibility_json_bytes(&self) -> AuthorityResult<Vec<u8>> {
        self.validate()?;
        // Canonical key ordering requires checksum between address and edits.
        let body = format!(
            "{{\"address\":{},\"checksum\":{},\"edits\":{},\"facings\":{},\"revision\":{},\"schemaVersion\":1}}",
            address_json(&self.address),
            json_string(&self.compatibility_checksum),
            edits_json(&self.edits),
            facings_json(&self.facings),
            revision_json(self.revision)
        );
        Ok(body.into_bytes())
    }
}

pub fn encode_compatibility_save_binary_v1(save: &WorldCompatibilitySaveR4V1) -> AuthorityResult<Vec<u8>> {
    save.validate()?;
    let mut writer = WireWriter::new(SAVE_MAGIC);
    writer.u16(save.schema_version);
    writer.string(&save.address.universe_id)?;
    writer.string(&save.address.location_id)?;
    writer.revision(save.revision);
    writer.u32_len(save.edits.len())?;
    for chunk in &save.edits {
        writer.i32(chunk.chunk_x);
        writer.i32(chunk.chunk_z);
        writer.u32_len(chunk.entries.len())?;
        for (index, block_id) in &chunk.entries {
            writer.u32(*index);
            writer.u16(*block_id);
        }
    }
    writer.u32_len(save.facings.len())?;
    for facing in &save.facings {
        writer.position(facing.position);
        writer.u8(facing.facing);
    }
    writer.u32_len(save.liquids.len())?;
    for liquid in &save.liquids {
        writer.position(liquid.position);
        writer.liquid(liquid.liquid);
    }
    writer.hash(&save.compatibility_checksum)?;
    writer.hash(&save.extension_checksum)?;
    writer.finish()
}

pub fn decode_compatibility_save_binary_v1(bytes: &[u8]) -> AuthorityResult<WorldCompatibilitySaveR4V1> {
    let mut reader = WireReader::new(bytes, SAVE_MAGIC)?;
    let schema_version = reader.u16()?;
    let address = WorldAddressV1::new(reader.string(64)?, reader.string(128)?)?;
    let revision = reader.revision()?;
    let edits_len = reader.count(65_536)?;
    let mut edits = Vec::with_capacity(edits_len);
    for _ in 0..edits_len {
        let chunk_x = reader.i32()?;
        let chunk_z = reader.i32()?;
        let entry_len = reader.count(49_152)?;
        let mut entries = Vec::with_capacity(entry_len);
        for _ in 0..entry_len {
            entries.push((reader.u32()?, reader.u16()?));
        }
        edits.push(CompatibilityChunkEditsV1 {
            chunk_x,
            chunk_z,
            entries,
        });
    }
    let facing_len = reader.count(1_000_000)?;
    let mut facings = Vec::with_capacity(facing_len);
    for _ in 0..facing_len {
        facings.push(CompatibilityFacingV1 {
            position: reader.position()?,
            facing: reader.u8()?,
        });
    }
    let liquid_len = reader.count(1_000_000)?;
    let mut liquids = Vec::with_capacity(liquid_len);
    for _ in 0..liquid_len {
        liquids.push(CompatibilityLiquidV1 {
            position: reader.position()?,
            liquid: reader.liquid()?,
        });
    }
    let compatibility_checksum = reader.hash()?;
    let extension_checksum = reader.hash()?;
    reader.finish()?;
    let save = WorldCompatibilitySaveR4V1 {
        schema_version,
        address,
        revision,
        edits,
        facings,
        liquids,
        compatibility_checksum,
        extension_checksum,
    };
    save.validate()?;
    Ok(save)
}

pub fn encode_network_delta_binary_v1(delta: &WorldNetworkDeltaR4V1) -> AuthorityResult<Vec<u8>> {
    validate_network_delta(delta)?;
    let mut writer = WireWriter::new(DELTA_MAGIC);
    writer.u16(delta.schema_version);
    writer.string(&delta.address.universe_id)?;
    writer.string(&delta.address.location_id)?;
    writer.string(&delta.batch_id)?;
    writer.revision(delta.from_revision);
    writer.revision(delta.to_revision);
    writer.u32_len(delta.changes.len())?;
    for change in &delta.changes {
        writer.position(change.position);
        writer.cell(change.previous);
        writer.cell(change.current);
    }
    writer.hash(&delta.checksum)?;
    writer.finish()
}

pub fn decode_network_delta_binary_v1(bytes: &[u8]) -> AuthorityResult<WorldNetworkDeltaR4V1> {
    let mut reader = WireReader::new(bytes, DELTA_MAGIC)?;
    let schema_version = reader.u16()?;
    let address = WorldAddressV1::new(reader.string(64)?, reader.string(128)?)?;
    let batch_id = reader.string(160)?;
    let from_revision = reader.revision()?;
    let to_revision = reader.revision()?;
    let change_len = reader.count(4_096)?;
    let mut changes = Vec::with_capacity(change_len);
    for _ in 0..change_len {
        changes.push(WorldCommittedCellR4V1 {
            position: reader.position()?,
            previous: reader.cell()?,
            current: reader.cell()?,
        });
    }
    let checksum = reader.hash()?;
    reader.finish()?;
    let delta = WorldNetworkDeltaR4V1 {
        schema_version,
        address,
        batch_id,
        from_revision,
        to_revision,
        changes,
        checksum,
    };
    validate_network_delta(&delta)?;
    Ok(delta)
}

pub fn encode_chunk_cache_envelope_binary_v1(envelope: &WorldChunkCacheEnvelopeV1) -> AuthorityResult<Vec<u8>> {
    envelope.validate()?;
    let mut writer = WireWriter::new(CACHE_MAGIC);
    writer.u16(envelope.schema_version);
    writer.string(&envelope.identity.address.world.universe_id)?;
    writer.string(&envelope.identity.address.world.location_id)?;
    writer.i32(envelope.identity.address.chunk_x);
    writer.i32(envelope.identity.address.chunk_z);
    writer.u32(envelope.identity.generator_version);
    writer.hash(&envelope.identity.generator_hash)?;
    writer.hash(&envelope.identity.content_hash)?;
    writer.hash(&envelope.identity.options_hash)?;
    writer.hash(&envelope.identity.edit_halo_hash)?;
    writer.string(&envelope.key)?;
    writer.u64(envelope.revision);
    writer.bytes(&envelope.payload)?;
    writer.hash(&envelope.checksum)?;
    writer.finish()
}

pub fn decode_chunk_cache_envelope_binary_v1(bytes: &[u8]) -> AuthorityResult<WorldChunkCacheEnvelopeV1> {
    let mut reader = WireReader::new(bytes, CACHE_MAGIC)?;
    let schema_version = reader.u16()?;
    let world = WorldAddressV1::new(reader.string(64)?, reader.string(128)?)?;
    let identity = WorldChunkCacheIdentityV1 {
        address: WorldChunkAddressV1 {
            world,
            chunk_x: reader.i32()?,
            chunk_z: reader.i32()?,
        },
        generator_version: reader.u32()?,
        generator_hash: reader.hash()?,
        content_hash: reader.hash()?,
        options_hash: reader.hash()?,
        edit_halo_hash: reader.hash()?,
    };
    let key = reader.string(512)?;
    let revision = reader.u64()?;
    let payload = reader.bytes(WORLD_CODEC_MAX_BYTES_V1)?;
    let checksum = reader.hash()?;
    reader.finish()?;
    let envelope = WorldChunkCacheEnvelopeV1 {
        schema_version,
        identity,
        key,
        revision,
        checksum,
        payload,
    };
    envelope.validate()?;
    Ok(envelope)
}

pub fn validate_network_delta(delta: &WorldNetworkDeltaR4V1) -> AuthorityResult<()> {
    if delta.schema_version != WORLD_AUTHORITY_SCHEMA_V1 {
        return Err(AuthorityError::new(
            "schema-mismatch",
            "network delta schema is incompatible",
        ));
    }
    delta.address.validate()?;
    crate::validate_label(&delta.batch_id, 160, "delta.batchId")?;
    delta.from_revision.validate()?;
    delta.to_revision.validate()?;
    validate_hash(&delta.checksum, "delta.checksum")?;
    if delta.changes.len() > 4_096 {
        return Err(AuthorityError::new(
            "delta-size",
            "network delta exceeds bounded maximum",
        ));
    }
    let mut prior = None;
    for change in &delta.changes {
        if change.position.y < WORLD_MIN_Y_V1 || change.position.y > WORLD_MAX_Y_V1 {
            return Err(AuthorityError::new(
                "delta-position",
                "network delta position is outside world bounds",
            ));
        }
        change.previous.validate()?;
        change.current.validate()?;
        let order = (change.position.y, change.position.z, change.position.x);
        if prior.is_some_and(|value| value >= order) {
            return Err(AuthorityError::new(
                "delta-order",
                "network changes must be canonical and unique",
            ));
        }
        prior = Some(order);
    }
    let expected = network_compatibility_checksum(delta);
    if expected != delta.checksum {
        return Err(AuthorityError::new("delta-checksum", "network delta checksum mismatch"));
    }
    Ok(())
}

fn network_compatibility_checksum(delta: &WorldNetworkDeltaR4V1) -> String {
    let changes = delta
        .changes
        .iter()
        .map(|change| {
            format!(
                "{{\"blockId\":{},\"facing\":{},\"previousBlockId\":{},\"previousFacing\":{},\"x\":{},\"y\":{},\"z\":{}}}",
                change.current.block_id,
                change.current.facing,
                change.previous.block_id,
                change.previous.facing,
                change.position.x,
                change.position.y,
                change.position.z
            )
        })
        .collect::<Vec<_>>()
        .join(",");
    let canonical = format!(
        "{{\"address\":{},\"batchId\":{},\"changes\":[{}],\"fromRevision\":{},\"schemaVersion\":1,\"toRevision\":{}}}",
        address_json(&delta.address),
        json_string(&delta.batch_id),
        changes,
        revision_json(delta.from_revision),
        revision_json(delta.to_revision)
    );
    hash_canonical_json("blockwild-world-network-delta-v1", &canonical)
}

fn compatibility_chunk_index(position: CellPositionV1) -> u32 {
    (position.local_x()
        + usize::try_from(WORLD_CHUNK_SIZE_V1).expect("positive chunk size") * position.local_z()
        + usize::try_from(WORLD_CHUNK_SIZE_V1 * WORLD_CHUNK_SIZE_V1).expect("positive chunk area")
            * usize::try_from(position.y - WORLD_MIN_Y_V1).expect("journal y is in world")) as u32
}

fn position_from_compatibility_index(chunk_x: i32, chunk_z: i32, index: u32) -> AuthorityResult<CellPositionV1> {
    let height = u32::try_from(WORLD_MAX_Y_V1 - WORLD_MIN_Y_V1 + 1).expect("positive world height");
    let maximum = u32::try_from(WORLD_CHUNK_SIZE_V1 * WORLD_CHUNK_SIZE_V1).expect("positive chunk area") * height;
    if index >= maximum {
        return Err(AuthorityError::new(
            "save-index",
            "save edit index is outside the world column",
        ));
    }
    let layer_area = u32::try_from(WORLD_CHUNK_SIZE_V1 * WORLD_CHUNK_SIZE_V1).expect("positive chunk area");
    let local_y = index / layer_area;
    let remainder = index % layer_area;
    let width = u32::try_from(WORLD_CHUNK_SIZE_V1).expect("positive chunk width");
    let local_z = remainder / width;
    let local_x = remainder % width;
    Ok(CellPositionV1 {
        x: chunk_x * WORLD_CHUNK_SIZE_V1 + i32::try_from(local_x).expect("local x fits i32"),
        y: WORLD_MIN_Y_V1 + i32::try_from(local_y).expect("local y fits i32"),
        z: chunk_z * WORLD_CHUNK_SIZE_V1 + i32::try_from(local_z).expect("local z fits i32"),
    })
}

fn compatibility_save_without_checksum_json(
    address: &WorldAddressV1,
    revision: WorldAuthorityRevisionV1,
    edits: &[CompatibilityChunkEditsV1],
    facings: &[CompatibilityFacingV1],
) -> String {
    format!(
        "{{\"address\":{},\"edits\":{},\"facings\":{},\"revision\":{},\"schemaVersion\":1}}",
        address_json(address),
        edits_json(edits),
        facings_json(facings),
        revision_json(revision)
    )
}

fn edits_json(edits: &[CompatibilityChunkEditsV1]) -> String {
    format!(
        "[{}]",
        edits
            .iter()
            .map(|chunk| {
                let entries = chunk
                    .entries
                    .iter()
                    .map(|(index, block)| format!("[{index},{block}]"))
                    .collect::<Vec<_>>()
                    .join(",");
                format!(
                    "{{\"chunkX\":{},\"chunkZ\":{},\"entries\":[{}]}}",
                    chunk.chunk_x, chunk.chunk_z, entries
                )
            })
            .collect::<Vec<_>>()
            .join(",")
    )
}

fn facings_json(facings: &[CompatibilityFacingV1]) -> String {
    format!(
        "[{}]",
        facings
            .iter()
            .map(|facing| format!(
                "{{\"facing\":{},\"x\":{},\"y\":{},\"z\":{}}}",
                facing.facing, facing.position.x, facing.position.y, facing.position.z
            ))
            .collect::<Vec<_>>()
            .join(",")
    )
}

fn hash_save_extension(
    address: &WorldAddressV1,
    revision: WorldAuthorityRevisionV1,
    edits: &[CompatibilityChunkEditsV1],
    facings: &[CompatibilityFacingV1],
    liquids: &[CompatibilityLiquidV1],
    compatibility_checksum: &str,
) -> String {
    let mut hasher = CanonicalHasher::new("blockwild-world-compatibility-save-r4-v1");
    hasher.write_str(&address.key());
    hasher.write_u64(revision.epoch);
    hasher.write_u64(revision.mutation);
    hasher.write_u64(revision.residency);
    hasher.write_u32(edits.len() as u32);
    for chunk in edits {
        hasher.write_i32(chunk.chunk_x);
        hasher.write_i32(chunk.chunk_z);
        hasher.write_u32(chunk.entries.len() as u32);
        for (index, block) in &chunk.entries {
            hasher.write_u32(*index);
            hasher.write_u16(*block);
        }
    }
    hasher.write_u32(facings.len() as u32);
    for facing in facings {
        hasher.write_i32(facing.position.x);
        hasher.write_i32(facing.position.y);
        hasher.write_i32(facing.position.z);
        hasher.write_bytes(&[facing.facing]);
    }
    hasher.write_u32(liquids.len() as u32);
    for liquid in liquids {
        hasher.write_i32(liquid.position.x);
        hasher.write_i32(liquid.position.y);
        hasher.write_i32(liquid.position.z);
        hasher.write_bytes(&[liquid.liquid.kind as u8, liquid.liquid.level, liquid.liquid.flags()]);
    }
    hasher.write_str(compatibility_checksum);
    hasher.finish().to_hex()
}

struct WireWriter {
    bytes: Vec<u8>,
}

impl WireWriter {
    fn new(magic: &[u8; 4]) -> Self {
        Self { bytes: magic.to_vec() }
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
    fn u64(&mut self, value: u64) {
        self.bytes.extend_from_slice(&value.to_le_bytes());
    }
    fn i32(&mut self, value: i32) {
        self.bytes.extend_from_slice(&value.to_le_bytes());
    }

    fn u32_len(&mut self, value: usize) -> AuthorityResult<()> {
        self.u32(u32::try_from(value).map_err(|_| AuthorityError::new("wire-size", "collection length exceeds u32"))?);
        Ok(())
    }

    fn string(&mut self, value: &str) -> AuthorityResult<()> {
        let bytes = value.as_bytes();
        self.u16(
            u16::try_from(bytes.len()).map_err(|_| AuthorityError::new("wire-string", "string exceeds u16 bytes"))?,
        );
        self.bytes.extend_from_slice(bytes);
        Ok(())
    }

    fn bytes(&mut self, value: &[u8]) -> AuthorityResult<()> {
        self.u32_len(value.len())?;
        self.bytes.extend_from_slice(value);
        Ok(())
    }

    fn hash(&mut self, value: &str) -> AuthorityResult<()> {
        validate_hash(value, "wire hash")?;
        self.bytes.extend_from_slice(value.as_bytes());
        Ok(())
    }

    fn revision(&mut self, value: WorldAuthorityRevisionV1) {
        self.u64(value.epoch);
        self.u64(value.mutation);
        self.u64(value.residency);
    }

    fn position(&mut self, value: CellPositionV1) {
        self.i32(value.x);
        self.i32(value.y);
        self.i32(value.z);
    }

    fn liquid(&mut self, value: LiquidMetadataV1) {
        self.u8(value.kind as u8);
        self.u8(value.level);
        self.u8(value.flags());
    }

    fn cell(&mut self, value: WorldCellV1) {
        self.u16(value.block_id);
        self.u8(value.facing);
        self.liquid(value.liquid);
    }

    fn finish(self) -> AuthorityResult<Vec<u8>> {
        if self.bytes.len() > WORLD_CODEC_MAX_BYTES_V1 {
            return Err(AuthorityError::new(
                "wire-size",
                "encoded record exceeds bounded maximum",
            ));
        }
        Ok(self.bytes)
    }
}

struct WireReader<'a> {
    bytes: &'a [u8],
    cursor: usize,
}

impl<'a> WireReader<'a> {
    fn new(bytes: &'a [u8], magic: &[u8; 4]) -> AuthorityResult<Self> {
        if bytes.len() > WORLD_CODEC_MAX_BYTES_V1 || bytes.get(..4) != Some(magic) {
            return Err(AuthorityError::new(
                "wire-header",
                "invalid or oversized authority wire record",
            ));
        }
        Ok(Self { bytes, cursor: 4 })
    }

    fn take(&mut self, length: usize) -> AuthorityResult<&'a [u8]> {
        let end = self
            .cursor
            .checked_add(length)
            .ok_or_else(|| AuthorityError::new("wire-eof", "wire cursor overflow"))?;
        let value = self
            .bytes
            .get(self.cursor..end)
            .ok_or_else(|| AuthorityError::new("wire-eof", "truncated authority wire record"))?;
        self.cursor = end;
        Ok(value)
    }

    fn u8(&mut self) -> AuthorityResult<u8> {
        Ok(self.take(1)?[0])
    }
    fn u16(&mut self) -> AuthorityResult<u16> {
        Ok(u16::from_le_bytes(self.take(2)?.try_into().expect("exact length")))
    }
    fn u32(&mut self) -> AuthorityResult<u32> {
        Ok(u32::from_le_bytes(self.take(4)?.try_into().expect("exact length")))
    }
    fn u64(&mut self) -> AuthorityResult<u64> {
        Ok(u64::from_le_bytes(self.take(8)?.try_into().expect("exact length")))
    }
    fn i32(&mut self) -> AuthorityResult<i32> {
        Ok(i32::from_le_bytes(self.take(4)?.try_into().expect("exact length")))
    }

    fn count(&mut self, maximum: usize) -> AuthorityResult<usize> {
        let value = self.u32()? as usize;
        if value > maximum {
            return Err(AuthorityError::new(
                "wire-count",
                "wire collection exceeds bounded maximum",
            ));
        }
        Ok(value)
    }

    fn string(&mut self, maximum_utf16: usize) -> AuthorityResult<String> {
        let length = usize::from(self.u16()?);
        let value = std::str::from_utf8(self.take(length)?)
            .map_err(|_| AuthorityError::new("wire-utf8", "wire string is not valid UTF-8"))?
            .to_owned();
        if value.encode_utf16().count() > maximum_utf16 {
            return Err(AuthorityError::new(
                "wire-string",
                "wire string exceeds bounded maximum",
            ));
        }
        Ok(value)
    }

    fn bytes(&mut self, maximum: usize) -> AuthorityResult<Vec<u8>> {
        let length = self.count(maximum)?;
        Ok(self.take(length)?.to_vec())
    }

    fn hash(&mut self) -> AuthorityResult<String> {
        let value = std::str::from_utf8(self.take(32)?)
            .map_err(|_| AuthorityError::new("wire-hash", "hash is not ASCII"))?
            .to_owned();
        validate_hash(&value, "wire hash")?;
        Ok(value)
    }

    fn revision(&mut self) -> AuthorityResult<WorldAuthorityRevisionV1> {
        let value = WorldAuthorityRevisionV1 {
            epoch: self.u64()?,
            mutation: self.u64()?,
            residency: self.u64()?,
        };
        value.validate()?;
        Ok(value)
    }

    fn position(&mut self) -> AuthorityResult<CellPositionV1> {
        let position = CellPositionV1 {
            x: self.i32()?,
            y: self.i32()?,
            z: self.i32()?,
        };
        if position.y < WORLD_MIN_Y_V1 || position.y > WORLD_MAX_Y_V1 {
            return Err(AuthorityError::new(
                "wire-position",
                "wire position is outside world bounds",
            ));
        }
        Ok(position)
    }

    fn liquid(&mut self) -> AuthorityResult<LiquidMetadataV1> {
        LiquidMetadataV1::from_streams(self.u8()?, self.u8()?, self.u8()?)
    }

    fn cell(&mut self) -> AuthorityResult<WorldCellV1> {
        let value = WorldCellV1 {
            block_id: self.u16()?,
            facing: self.u8()?,
            liquid: self.liquid()?,
        };
        value.validate()?;
        Ok(value)
    }

    fn finish(self) -> AuthorityResult<()> {
        if self.cursor != self.bytes.len() {
            return Err(AuthorityError::new(
                "wire-trailing",
                "wire record contains trailing bytes",
            ));
        }
        Ok(())
    }
}
