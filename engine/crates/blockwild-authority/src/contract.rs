use core::fmt;
use std::collections::BTreeSet;

pub const WORLD_AUTHORITY_PROTOCOL_V1: u16 = 1;
pub const WORLD_AUTHORITY_SCHEMA_V1: u16 = 1;
pub const WORLD_CHUNK_SIZE_V1: i32 = 16;
pub const WORLD_SECTION_HEIGHT_V1: i32 = 16;
pub const WORLD_MIN_Y_V1: i32 = -64;
pub const WORLD_MAX_Y_V1: i32 = 127;
pub const WORLD_SECTION_COUNT_V1: i32 = 12;
pub const WORLD_SECTION_CELL_COUNT_V1: usize = 16 * 16 * 16;
pub const WORLD_CHUNK_CELL_COUNT_V1: usize = 16 * 16 * 192;
pub const WORLD_CHUNK_COLUMN_COUNT_V1: usize = 16 * 16;
pub const WORLD_AIR_BLOCK_ID_V1: u16 = 0;
pub const WORLD_BEDROCK_BLOCK_ID_V1: u16 = 14;
pub const WORLD_UNLOADED_BLOCK_ID_V1: u16 = u16::MAX;
pub const WORLD_READ_WINDOW_MAX_CELLS_V1: usize = 128 * 1024;
pub const WORLD_MUTATION_BATCH_MAX_COMMANDS_V1: usize = 4_096;
pub const WORLD_CODEC_MAX_BYTES_V1: usize = 32 * 1024 * 1024;
pub const WORLD_MAX_LABEL_UTF16_V1: usize = 128;
pub const JS_MAX_SAFE_INTEGER_V1: u64 = 9_007_199_254_740_991;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuthorityError {
    pub code: &'static str,
    pub message: String,
}

impl AuthorityError {
    #[must_use]
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

impl fmt::Display for AuthorityError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for AuthorityError {}

pub type AuthorityResult<T> = Result<T, AuthorityError>;

#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct WorldAddressV1 {
    pub universe_id: String,
    pub location_id: String,
}

impl WorldAddressV1 {
    pub fn new(universe_id: impl Into<String>, location_id: impl Into<String>) -> AuthorityResult<Self> {
        let value = Self {
            universe_id: universe_id.into(),
            location_id: location_id.into(),
        };
        value.validate()?;
        Ok(value)
    }

    pub fn validate(&self) -> AuthorityResult<()> {
        validate_label(&self.universe_id, 64, "universeId")?;
        validate_label(&self.location_id, 128, "locationId")
    }

    #[must_use]
    pub fn key(&self) -> String {
        format!(
            "{}@{}",
            encode_uri_component(&self.universe_id),
            encode_uri_component(&self.location_id)
        )
    }
}

#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct WorldChunkAddressV1 {
    pub world: WorldAddressV1,
    pub chunk_x: i32,
    pub chunk_z: i32,
}

impl WorldChunkAddressV1 {
    #[must_use]
    pub fn key(&self) -> String {
        format!("{}:{},{}", self.world.key(), self.chunk_x, self.chunk_z)
    }
}

#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct WorldSectionAddressV1 {
    pub world: WorldAddressV1,
    pub chunk_x: i32,
    pub chunk_z: i32,
    pub section_y: i16,
}

impl WorldSectionAddressV1 {
    #[must_use]
    pub fn key(&self) -> String {
        format!(
            "{}:{},{}:{}",
            self.world.key(),
            self.chunk_x,
            self.chunk_z,
            self.section_y
        )
    }

    #[must_use]
    pub fn chunk(&self) -> WorldChunkAddressV1 {
        WorldChunkAddressV1 {
            world: self.world.clone(),
            chunk_x: self.chunk_x,
            chunk_z: self.chunk_z,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct CellPositionV1 {
    pub x: i32,
    pub y: i32,
    pub z: i32,
}

impl CellPositionV1 {
    #[must_use]
    pub fn chunk_x(self) -> i32 {
        self.x.div_euclid(WORLD_CHUNK_SIZE_V1)
    }

    #[must_use]
    pub fn chunk_z(self) -> i32 {
        self.z.div_euclid(WORLD_CHUNK_SIZE_V1)
    }

    #[must_use]
    pub fn section_y(self) -> i16 {
        ((self.y - WORLD_MIN_Y_V1).div_euclid(WORLD_SECTION_HEIGHT_V1)) as i16
    }

    #[must_use]
    pub fn section_address(self, world: &WorldAddressV1) -> WorldSectionAddressV1 {
        WorldSectionAddressV1 {
            world: world.clone(),
            chunk_x: self.chunk_x(),
            chunk_z: self.chunk_z(),
            section_y: self.section_y(),
        }
    }

    #[must_use]
    pub fn local_x(self) -> usize {
        self.x.rem_euclid(WORLD_CHUNK_SIZE_V1) as usize
    }

    #[must_use]
    pub fn local_z(self) -> usize {
        self.z.rem_euclid(WORLD_CHUNK_SIZE_V1) as usize
    }

    #[must_use]
    pub fn local_y(self) -> usize {
        (self.y - WORLD_MIN_Y_V1).rem_euclid(WORLD_SECTION_HEIGHT_V1) as usize
    }

    #[must_use]
    pub fn section_index(self) -> usize {
        self.local_x() + 16 * (self.local_z() + 16 * self.local_y())
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, Hash, PartialEq)]
pub struct WorldAuthorityRevisionV1 {
    pub epoch: u64,
    pub mutation: u64,
    pub residency: u64,
}

impl WorldAuthorityRevisionV1 {
    pub fn validate(self) -> AuthorityResult<()> {
        if self.epoch > JS_MAX_SAFE_INTEGER_V1
            || self.mutation > JS_MAX_SAFE_INTEGER_V1
            || self.residency > JS_MAX_SAFE_INTEGER_V1
        {
            return Err(AuthorityError::new(
                "revision-overflow",
                "world revision exceeds JavaScript's safe integer range",
            ));
        }
        Ok(())
    }

    #[must_use]
    pub fn key(self) -> String {
        format!("{}:{}:{}", self.epoch, self.mutation, self.residency)
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorldAuthorityIdentityV1 {
    pub address: WorldAddressV1,
    pub revision: WorldAuthorityRevisionV1,
    pub state_hash: String,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct WorldSectionRevisionV1 {
    pub blocks: u64,
    pub metadata: u64,
    pub halo: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AddressedSectionRevisionV1 {
    pub address: WorldSectionAddressV1,
    pub revision: WorldSectionRevisionV1,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
#[repr(u8)]
pub enum WorldBoundaryKindV1 {
    #[default]
    None = 0,
    AirAboveWorld = 1,
    BedrockBelowWorld = 2,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
#[repr(u8)]
pub enum WorldLiquidKindV1 {
    #[default]
    None = 0,
    Water = 1,
    Lava = 2,
    Honey = 3,
    Syrup = 4,
}

impl TryFrom<u8> for WorldLiquidKindV1 {
    type Error = AuthorityError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(Self::None),
            1 => Ok(Self::Water),
            2 => Ok(Self::Lava),
            3 => Ok(Self::Honey),
            4 => Ok(Self::Syrup),
            _ => Err(AuthorityError::new("liquid-kind", "unknown liquid kind")),
        }
    }
}

pub const CELL_FLAG_CONTAINS_WATER_V1: u8 = 1 << 0;
pub const CELL_FLAG_LIQUID_SOURCE_V1: u8 = 1 << 1;
pub const CELL_FLAG_LIQUID_FALLING_V1: u8 = 1 << 2;
pub const CELL_FLAG_WATERLOGGED_V1: u8 = 1 << 3;

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct LiquidMetadataV1 {
    pub kind: WorldLiquidKindV1,
    pub level: u8,
    pub source: bool,
    pub falling: bool,
    pub contains_water: bool,
    pub waterlogged: bool,
}

impl LiquidMetadataV1 {
    pub fn validate(self) -> AuthorityResult<()> {
        if self.level > 8 {
            return Err(AuthorityError::new("liquid-level", "liquid level must be in 0..8"));
        }
        if self.kind == WorldLiquidKindV1::None && self.level != 0 {
            return Err(AuthorityError::new(
                "liquid-level",
                "a cell without liquid must use level zero",
            ));
        }
        Ok(())
    }

    #[must_use]
    pub fn flags(self) -> u8 {
        (u8::from(self.contains_water) * CELL_FLAG_CONTAINS_WATER_V1)
            | (u8::from(self.source) * CELL_FLAG_LIQUID_SOURCE_V1)
            | (u8::from(self.falling) * CELL_FLAG_LIQUID_FALLING_V1)
            | (u8::from(self.waterlogged) * CELL_FLAG_WATERLOGGED_V1)
    }

    pub fn from_streams(kind: u8, level: u8, flags: u8) -> AuthorityResult<Self> {
        if flags & !0x0f != 0 {
            return Err(AuthorityError::new("cell-flags", "unknown cell flag bits"));
        }
        let value = Self {
            kind: WorldLiquidKindV1::try_from(kind)?,
            level,
            source: flags & CELL_FLAG_LIQUID_SOURCE_V1 != 0,
            falling: flags & CELL_FLAG_LIQUID_FALLING_V1 != 0,
            contains_water: flags & CELL_FLAG_CONTAINS_WATER_V1 != 0,
            waterlogged: flags & CELL_FLAG_WATERLOGGED_V1 != 0,
        };
        value.validate()?;
        Ok(value)
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct WorldCellV1 {
    pub block_id: u16,
    pub facing: u8,
    pub liquid: LiquidMetadataV1,
}

impl WorldCellV1 {
    pub fn validate(self) -> AuthorityResult<()> {
        if self.block_id == WORLD_UNLOADED_BLOCK_ID_V1 {
            return Err(AuthorityError::new(
                "loaded-cell",
                "resident cells cannot use the unloaded sentinel",
            ));
        }
        if self.facing > 3 {
            return Err(AuthorityError::new("facing", "facing must be in 0..3"));
        }
        self.liquid.validate()
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum WorldCellReadV1 {
    Unloaded {
        position: CellPositionV1,
    },
    Loaded {
        position: CellPositionV1,
        cell: WorldCellV1,
        boundary: WorldBoundaryKindV1,
    },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SectionInstallV1 {
    pub address: WorldSectionAddressV1,
    pub cells: Vec<WorldCellV1>,
    pub source_revision: u64,
    pub source_hash: String,
}

/// Renderer-independent generated data that belongs to a resident chunk but is
/// not encoded in individual authoritative cells. Generated bytes are
/// disposable and reproducible; authored edits remain in the separate journal.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ChunkAuxiliaryDataV1 {
    pub address: WorldChunkAddressV1,
    pub source_revision: u64,
    pub source_hash: String,
    pub heightmap: Vec<i16>,
    pub biomes: Vec<u8>,
    pub section_block_counts: Vec<u16>,
    pub sky_tops: Vec<i16>,
    pub light: Vec<u16>,
    pub light_indices: Vec<u32>,
    pub leaf_indices: Vec<u32>,
    /// Sorted canonical `[key, marker]` JSON rows retained without losing
    /// content-specific POI, loot, spawn, or map metadata.
    pub markers: Vec<(String, String)>,
}

impl ChunkAuxiliaryDataV1 {
    pub fn validate(&self) -> AuthorityResult<()> {
        self.address.world.validate()?;
        validate_hash(&self.source_hash, "sourceHash")?;
        if self.heightmap.len() != WORLD_CHUNK_COLUMN_COUNT_V1
            || self.biomes.len() != WORLD_CHUNK_COLUMN_COUNT_V1
            || self.sky_tops.len() != WORLD_CHUNK_COLUMN_COUNT_V1
            || self.section_block_counts.len() != WORLD_SECTION_COUNT_V1 as usize
            || self.light.len() != WORLD_CHUNK_CELL_COUNT_V1
        {
            return Err(AuthorityError::new(
                "chunk-auxiliary-length",
                "generated chunk auxiliary streams have incompatible lengths",
            ));
        }
        validate_sorted_indices(&self.light_indices, "lightIndices")?;
        validate_sorted_indices(&self.leaf_indices, "leafIndices")?;
        let mut prior = None;
        for (key, canonical_json) in &self.markers {
            validate_label(key, WORLD_MAX_LABEL_UTF16_V1, "marker key")?;
            if canonical_json.is_empty() || canonical_json.len() > 256 * 1024 {
                return Err(AuthorityError::new(
                    "marker-payload",
                    "marker JSON must contain 1..262144 bytes",
                ));
            }
            if prior.as_ref().is_some_and(|value: &String| value >= key) {
                return Err(AuthorityError::new(
                    "marker-order",
                    "marker rows must be sorted and unique",
                ));
            }
            prior = Some(key.clone());
        }
        Ok(())
    }
}

/// A revision-checked, section-granular update to already resident auxiliary
/// data. Lighting is the only 49k-cell auxiliary stream and is therefore
/// patched in 4096-cell sections; small derived streams use sorted sparse
/// entries, while the usually-small index/marker collections are replaced
/// atomically when they change.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ChunkAuxiliaryPatchV1 {
    pub address: WorldChunkAddressV1,
    pub expected_source_revision: u64,
    pub expected_source_hash: String,
    pub source_revision: u64,
    pub source_hash: String,
    pub light_sections: Vec<(i16, Vec<u16>)>,
    pub section_block_counts: Vec<(u16, u16)>,
    pub sky_tops: Vec<(u16, i16)>,
    pub light_indices: Option<Vec<u32>>,
    pub leaf_indices: Option<Vec<u32>>,
    pub markers: Option<Vec<(String, String)>>,
}

impl ChunkAuxiliaryPatchV1 {
    pub fn validate(&self) -> AuthorityResult<()> {
        self.address.world.validate()?;
        validate_hash(&self.expected_source_hash, "expectedSourceHash")?;
        validate_hash(&self.source_hash, "sourceHash")?;
        if self.source_revision <= self.expected_source_revision {
            return Err(AuthorityError::new(
                "chunk-auxiliary-revision",
                "auxiliary patch source revision must advance",
            ));
        }
        if self.light_sections.is_empty()
            && self.section_block_counts.is_empty()
            && self.sky_tops.is_empty()
            && self.light_indices.is_none()
            && self.leaf_indices.is_none()
            && self.markers.is_none()
        {
            return Err(AuthorityError::new(
                "chunk-auxiliary-empty-patch",
                "auxiliary patch must change at least one stream",
            ));
        }
        let mut prior_section = None;
        for (section, values) in &self.light_sections {
            if !(0..WORLD_SECTION_COUNT_V1 as i16).contains(section)
                || values.len() != WORLD_SECTION_CELL_COUNT_V1
                || prior_section.is_some_and(|prior| *section <= prior)
            {
                return Err(AuthorityError::new(
                    "chunk-auxiliary-light-section",
                    "light section patches must be sorted, unique, in range, and contain 4096 cells",
                ));
            }
            prior_section = Some(*section);
        }
        validate_sparse_indices(
            &self.section_block_counts,
            WORLD_SECTION_COUNT_V1 as usize,
            "sectionBlockCounts",
        )?;
        validate_sparse_indices(&self.sky_tops, WORLD_CHUNK_COLUMN_COUNT_V1, "skyTops")?;
        if let Some(indices) = &self.light_indices {
            validate_sorted_indices(indices, "lightIndices")?;
        }
        if let Some(indices) = &self.leaf_indices {
            validate_sorted_indices(indices, "leafIndices")?;
        }
        if let Some(markers) = &self.markers {
            let probe = ChunkAuxiliaryDataV1 {
                address: self.address.clone(),
                source_revision: self.source_revision,
                source_hash: self.source_hash.clone(),
                heightmap: vec![0; WORLD_CHUNK_COLUMN_COUNT_V1],
                biomes: vec![0; WORLD_CHUNK_COLUMN_COUNT_V1],
                section_block_counts: vec![0; WORLD_SECTION_COUNT_V1 as usize],
                sky_tops: vec![0; WORLD_CHUNK_COLUMN_COUNT_V1],
                light: vec![0; WORLD_CHUNK_CELL_COUNT_V1],
                light_indices: Vec::new(),
                leaf_indices: Vec::new(),
                markers: markers.clone(),
            };
            probe.validate()?;
        }
        Ok(())
    }
}

fn validate_sparse_indices<T>(values: &[(u16, T)], maximum: usize, label: &str) -> AuthorityResult<()> {
    let mut prior = None;
    for (index, _) in values {
        if usize::from(*index) >= maximum || prior.is_some_and(|value| *index <= value) {
            return Err(AuthorityError::new(
                "chunk-auxiliary-sparse-index",
                format!("{label} patches must be sorted, unique, and in range"),
            ));
        }
        prior = Some(*index);
    }
    Ok(())
}

fn validate_sorted_indices(indices: &[u32], label: &str) -> AuthorityResult<()> {
    let mut prior = None;
    for index in indices {
        if *index as usize >= WORLD_CHUNK_CELL_COUNT_V1 || prior.is_some_and(|value| *index <= value) {
            return Err(AuthorityError::new(
                "chunk-auxiliary-index",
                format!("{label} must be sorted, unique, and inside the chunk"),
            ));
        }
        prior = Some(*index);
    }
    Ok(())
}

impl SectionInstallV1 {
    pub fn validate(&self) -> AuthorityResult<()> {
        if self.cells.len() != WORLD_SECTION_CELL_COUNT_V1 {
            return Err(AuthorityError::new(
                "section-length",
                format!("section must contain {WORLD_SECTION_CELL_COUNT_V1} cells"),
            ));
        }
        validate_hash(&self.source_hash, "sourceHash")?;
        for cell in &self.cells {
            cell.validate()?;
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BlockCatalogV1 {
    pub directional_blocks: BTreeSet<u16>,
    pub waterlogged_blocks: BTreeSet<u16>,
    pub water_block_id: u16,
}

impl Default for BlockCatalogV1 {
    fn default() -> Self {
        Self {
            directional_blocks: BTreeSet::new(),
            waterlogged_blocks: BTreeSet::new(),
            water_block_id: 7,
        }
    }
}

#[must_use]
pub fn section_index(local_x: usize, local_y: usize, local_z: usize) -> Option<usize> {
    (local_x < 16 && local_y < 16 && local_z < 16).then_some(local_x + 16 * (local_z + 16 * local_y))
}

pub fn validate_label(value: &str, maximum_utf16: usize, label: &str) -> AuthorityResult<()> {
    let length = value.encode_utf16().count();
    if length == 0
        || length > maximum_utf16
        || value
            .chars()
            .any(|character| character <= '\u{1f}' || character == '\u{7f}')
    {
        return Err(AuthorityError::new(
            "invalid-label",
            format!("{label} must contain 1..{maximum_utf16} visible UTF-16 units"),
        ));
    }
    Ok(())
}

pub fn validate_hash(value: &str, label: &str) -> AuthorityResult<()> {
    if value.len() != 32
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(AuthorityError::new(
            "invalid-hash",
            format!("{label} must be a lowercase 128-bit hexadecimal hash"),
        ));
    }
    Ok(())
}

fn encode_uri_component(value: &str) -> String {
    let mut output = String::new();
    for byte in value.as_bytes() {
        if byte.is_ascii_alphanumeric()
            || matches!(*byte, b'-' | b'_' | b'.' | b'!' | b'~' | b'*' | b'\'' | b'(' | b')')
        {
            output.push(char::from(*byte));
        } else {
            use core::fmt::Write as _;
            write!(&mut output, "%{byte:02X}").expect("writing to String cannot fail");
        }
    }
    output
}
