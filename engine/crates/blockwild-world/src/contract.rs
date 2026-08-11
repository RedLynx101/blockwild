use core::fmt;

use blockwild_types::CanonicalHasher;

pub const SECTION_SNAPSHOT_SCHEMA_V1: u16 = 1;
pub const MESH_PACKET_SCHEMA_V1: u16 = 1;
pub const TERRAIN_MESH_PROTOCOL_V1: u16 = 1;
pub const TERRAIN_SECTION_SIZE_V1: usize = 16;
pub const TERRAIN_SECTION_HALO_V1: usize = 1;
pub const TERRAIN_SECTION_HALO_SIZE_V1: usize = 18;
pub const TERRAIN_SECTION_CORE_CELL_COUNT_V1: usize = 16 * 16 * 16;
pub const TERRAIN_SECTION_HALO_CELL_COUNT_V1: usize = 18 * 18 * 18;
pub const TERRAIN_SECTION_HALO_COLUMN_COUNT_V1: usize = 18 * 18;

pub const TERRAIN_HIDDEN_GEOMETRY_V1: u8 = 1 << 0;
pub const TERRAIN_HIDDEN_UNKNOWN_HALO_V1: u8 = 1 << 1;
pub const TERRAIN_FLUID_PRESENT_V1: u8 = 1 << 0;
pub const TERRAIN_FLUID_SOURCE_V1: u8 = 1 << 1;
pub const TERRAIN_FLUID_FALLING_V1: u8 = 1 << 2;
pub const TERRAIN_FLUID_WATERLOGGED_V1: u8 = 1 << 3;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TerrainMeshContractError {
    pub issues: Vec<String>,
}

impl TerrainMeshContractError {
    #[must_use]
    pub fn new(issue: impl Into<String>) -> Self {
        Self {
            issues: vec![issue.into()],
        }
    }

    #[must_use]
    pub fn from_issues(issues: Vec<String>) -> Self {
        Self { issues }
    }
}

impl fmt::Display for TerrainMeshContractError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "terrain mesh contract rejected: {}", self.issues.join("; "))
    }
}

impl std::error::Error for TerrainMeshContractError {}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TerrainSectionAddressV1 {
    pub universe_id: String,
    pub location_id: String,
    pub chunk_x: i32,
    pub chunk_z: i32,
    pub section_y: i32,
}

impl TerrainSectionAddressV1 {
    #[must_use]
    pub fn key(&self) -> String {
        format!(
            "{}/{}/{}/{}/{}",
            self.universe_id, self.location_id, self.chunk_x, self.chunk_z, self.section_y
        )
    }

    fn validate(&self, issues: &mut Vec<String>, path: &str) {
        validate_bounded_js_string(&self.universe_id, issues, &format!("{path}.universeId"));
        validate_bounded_js_string(&self.location_id, issues, &format!("{path}.locationId"));
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct TerrainSectionRevisionV1 {
    pub section: u32,
    pub halo: u32,
    pub lighting: u32,
}

impl TerrainSectionRevisionV1 {
    #[must_use]
    pub fn key(self) -> String {
        format!("{}:{}:{}", self.section, self.halo, self.lighting)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct TerrainSectionDimensionsV1 {
    pub width: u16,
    pub height: u16,
    pub depth: u16,
    pub halo: u16,
}

impl Default for TerrainSectionDimensionsV1 {
    fn default() -> Self {
        Self {
            width: TERRAIN_SECTION_SIZE_V1 as u16,
            height: TERRAIN_SECTION_SIZE_V1 as u16,
            depth: TERRAIN_SECTION_SIZE_V1 as u16,
            halo: TERRAIN_SECTION_HALO_V1 as u16,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TerrainSectionSnapshotStreamsV1 {
    pub blocks: Vec<u16>,
    pub light: Vec<u16>,
    pub facing: Vec<u8>,
    pub hidden: Vec<u8>,
    pub fluid_level: Vec<u8>,
    pub fluid_flags: Vec<u8>,
    pub biomes: Vec<u8>,
}

impl TerrainSectionSnapshotStreamsV1 {
    #[must_use]
    pub fn empty() -> Self {
        Self {
            blocks: vec![0; TERRAIN_SECTION_HALO_CELL_COUNT_V1],
            light: vec![0; TERRAIN_SECTION_HALO_CELL_COUNT_V1],
            facing: vec![0; TERRAIN_SECTION_HALO_CELL_COUNT_V1],
            hidden: vec![0; TERRAIN_SECTION_HALO_CELL_COUNT_V1],
            fluid_level: vec![0; TERRAIN_SECTION_HALO_CELL_COUNT_V1],
            fluid_flags: vec![0; TERRAIN_SECTION_HALO_CELL_COUNT_V1],
            biomes: vec![0; TERRAIN_SECTION_HALO_COLUMN_COUNT_V1],
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SectionSnapshotV1 {
    pub schema_version: u16,
    pub content_hash: String,
    pub address: TerrainSectionAddressV1,
    pub revision: TerrainSectionRevisionV1,
    pub dimensions: TerrainSectionDimensionsV1,
    pub streams: TerrainSectionSnapshotStreamsV1,
    pub snapshot_hash: String,
}

impl SectionSnapshotV1 {
    pub fn create(
        content_hash: String,
        address: TerrainSectionAddressV1,
        revision: TerrainSectionRevisionV1,
        streams: TerrainSectionSnapshotStreamsV1,
    ) -> Result<Self, TerrainMeshContractError> {
        let mut snapshot = Self {
            schema_version: SECTION_SNAPSHOT_SCHEMA_V1,
            content_hash,
            address,
            revision,
            dimensions: TerrainSectionDimensionsV1::default(),
            streams,
            snapshot_hash: String::new(),
        };
        snapshot.snapshot_hash = hash_section_snapshot_v1(&snapshot);
        snapshot.validate(true)?;
        Ok(snapshot)
    }

    pub fn validate(&self, verify_hash: bool) -> Result<(), TerrainMeshContractError> {
        let issues = self.issues(verify_hash);
        if issues.is_empty() {
            Ok(())
        } else {
            Err(TerrainMeshContractError::from_issues(issues))
        }
    }

    #[must_use]
    pub fn issues(&self, verify_hash: bool) -> Vec<String> {
        let mut issues = Vec::new();
        if self.schema_version != SECTION_SNAPSHOT_SCHEMA_V1 {
            issues.push(format!("schemaVersion must be {SECTION_SNAPSHOT_SCHEMA_V1}"));
        }
        validate_hash(&self.content_hash, &mut issues, "contentHash");
        self.address.validate(&mut issues, "address");
        if self.dimensions != TerrainSectionDimensionsV1::default() {
            issues.push("dimensions must be exactly 16x16x16 with a one-cell halo".into());
        }
        validate_length(
            self.streams.blocks.len(),
            TERRAIN_SECTION_HALO_CELL_COUNT_V1,
            &mut issues,
            "streams.blocks",
        );
        validate_length(
            self.streams.light.len(),
            TERRAIN_SECTION_HALO_CELL_COUNT_V1,
            &mut issues,
            "streams.light",
        );
        validate_length(
            self.streams.facing.len(),
            TERRAIN_SECTION_HALO_CELL_COUNT_V1,
            &mut issues,
            "streams.facing",
        );
        validate_length(
            self.streams.hidden.len(),
            TERRAIN_SECTION_HALO_CELL_COUNT_V1,
            &mut issues,
            "streams.hidden",
        );
        validate_length(
            self.streams.fluid_level.len(),
            TERRAIN_SECTION_HALO_CELL_COUNT_V1,
            &mut issues,
            "streams.fluidLevel",
        );
        validate_length(
            self.streams.fluid_flags.len(),
            TERRAIN_SECTION_HALO_CELL_COUNT_V1,
            &mut issues,
            "streams.fluidFlags",
        );
        validate_length(
            self.streams.biomes.len(),
            TERRAIN_SECTION_HALO_COLUMN_COUNT_V1,
            &mut issues,
            "streams.biomes",
        );
        if self.streams.facing.iter().any(|&facing| facing > 3) {
            issues.push("streams.facing contains a value outside 0..3".into());
        }
        validate_hash(&self.snapshot_hash, &mut issues, "snapshotHash");
        if issues.is_empty() && verify_hash && hash_section_snapshot_v1(self) != self.snapshot_hash {
            issues.push("snapshotHash does not match snapshot content".into());
        }
        issues
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u16)]
pub enum TerrainMeshLayerV1 {
    Opaque = 0,
    Cutout = 1,
    Emissive = 2,
    TranslucentSolid = 3,
    Water = 4,
    Transparent = 5,
    Glass = 6,
}

impl TerrainMeshLayerV1 {
    pub const ALL: [Self; 7] = [
        Self::Opaque,
        Self::Cutout,
        Self::Emissive,
        Self::TranslucentSolid,
        Self::Water,
        Self::Transparent,
        Self::Glass,
    ];

    #[must_use]
    pub const fn wire_name(self) -> &'static str {
        match self {
            Self::Opaque => "opaque",
            Self::Cutout => "cutout",
            Self::Emissive => "emissive",
            Self::TranslucentSolid => "translucentSolid",
            Self::Water => "water",
            Self::Transparent => "transparent",
            Self::Glass => "glass",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TerrainMeshLayerSpanV1 {
    pub layer: TerrainMeshLayerV1,
    pub vertex_start: u32,
    pub vertex_count: u32,
    pub index_start: u32,
    pub index_count: u32,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TerrainIndexStreamV1 {
    U16(Vec<u16>),
    U32(Vec<u32>),
}

impl TerrainIndexStreamV1 {
    #[must_use]
    pub fn len(&self) -> usize {
        match self {
            Self::U16(values) => values.len(),
            Self::U32(values) => values.len(),
        }
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    #[must_use]
    pub fn get(&self, index: usize) -> Option<u32> {
        match self {
            Self::U16(values) => values.get(index).copied().map(u32::from),
            Self::U32(values) => values.get(index).copied(),
        }
    }

    #[must_use]
    pub const fn element_width(&self) -> u8 {
        match self {
            Self::U16(_) => 2,
            Self::U32(_) => 4,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct TerrainMeshStreamsV1 {
    pub positions: Vec<f32>,
    pub normals: Vec<i8>,
    pub colors: Vec<u8>,
    pub lights: Vec<u8>,
    pub emissions: Vec<u8>,
    pub occlusions: Vec<u8>,
    pub uvs: Vec<u16>,
    pub indices: TerrainIndexStreamV1,
}

impl TerrainMeshStreamsV1 {
    #[must_use]
    pub fn empty() -> Self {
        Self {
            positions: Vec::new(),
            normals: Vec::new(),
            colors: Vec::new(),
            lights: Vec::new(),
            emissions: Vec::new(),
            occlusions: Vec::new(),
            uvs: Vec::new(),
            indices: TerrainIndexStreamV1::U16(Vec::new()),
        }
    }

    #[must_use]
    pub fn vertex_count(&self) -> usize {
        self.positions.len() / 3
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TerrainLightingDeltaV1 {
    pub changed_cell_indices: Vec<u16>,
    pub packed_light: Vec<u16>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct MeshPacketV1 {
    pub schema_version: u16,
    pub source_snapshot_hash: String,
    pub content_hash: String,
    pub address: TerrainSectionAddressV1,
    pub revision: TerrainSectionRevisionV1,
    pub layers: Vec<TerrainMeshLayerSpanV1>,
    pub streams: TerrainMeshStreamsV1,
    pub lighting_delta: Option<TerrainLightingDeltaV1>,
    pub packet_hash: String,
}

impl MeshPacketV1 {
    pub fn create(
        snapshot: &SectionSnapshotV1,
        layers: Vec<TerrainMeshLayerSpanV1>,
        streams: TerrainMeshStreamsV1,
        lighting_delta: Option<TerrainLightingDeltaV1>,
    ) -> Result<Self, TerrainMeshContractError> {
        snapshot.validate(true)?;
        let mut packet = Self {
            schema_version: MESH_PACKET_SCHEMA_V1,
            source_snapshot_hash: snapshot.snapshot_hash.clone(),
            content_hash: snapshot.content_hash.clone(),
            address: snapshot.address.clone(),
            revision: snapshot.revision,
            layers,
            streams,
            lighting_delta,
            packet_hash: String::new(),
        };
        packet.packet_hash = hash_mesh_packet_v1(&packet);
        packet.validate(true)?;
        Ok(packet)
    }

    pub fn validate(&self, verify_hash: bool) -> Result<(), TerrainMeshContractError> {
        let issues = self.issues(verify_hash);
        if issues.is_empty() {
            Ok(())
        } else {
            Err(TerrainMeshContractError::from_issues(issues))
        }
    }

    #[must_use]
    pub fn matches_snapshot(&self, snapshot: &SectionSnapshotV1) -> bool {
        self.source_snapshot_hash == snapshot.snapshot_hash
            && self.content_hash == snapshot.content_hash
            && self.address == snapshot.address
            && self.revision == snapshot.revision
    }

    pub fn validate_matches_snapshot(&self, snapshot: &SectionSnapshotV1) -> Result<(), TerrainMeshContractError> {
        self.validate(true)?;
        snapshot.validate(true)?;
        if self.matches_snapshot(snapshot) {
            Ok(())
        } else {
            Err(TerrainMeshContractError::new(
                "mesh packet source hash, content hash, address, or revision does not match its section snapshot",
            ))
        }
    }

    #[must_use]
    pub fn issues(&self, verify_hash: bool) -> Vec<String> {
        let mut issues = Vec::new();
        if self.schema_version != MESH_PACKET_SCHEMA_V1 {
            issues.push(format!("schemaVersion must be {MESH_PACKET_SCHEMA_V1}"));
        }
        validate_hash(&self.source_snapshot_hash, &mut issues, "sourceSnapshotHash");
        validate_hash(&self.content_hash, &mut issues, "contentHash");
        self.address.validate(&mut issues, "address");
        if !self.streams.positions.len().is_multiple_of(3) {
            issues.push("streams.positions length must be divisible by 3".into());
        }
        if self.streams.positions.iter().any(|value| !value.is_finite()) {
            issues.push("streams.positions must contain only finite values".into());
        }
        let vertex_count = self.streams.vertex_count();
        validate_length(
            self.streams.normals.len(),
            vertex_count * 3,
            &mut issues,
            "streams.normals",
        );
        validate_length(
            self.streams.colors.len(),
            vertex_count * 3,
            &mut issues,
            "streams.colors",
        );
        validate_length(
            self.streams.lights.len(),
            vertex_count * 4,
            &mut issues,
            "streams.lights",
        );
        validate_length(
            self.streams.emissions.len(),
            vertex_count,
            &mut issues,
            "streams.emissions",
        );
        validate_length(
            self.streams.occlusions.len(),
            vertex_count,
            &mut issues,
            "streams.occlusions",
        );
        validate_length(self.streams.uvs.len(), vertex_count * 2, &mut issues, "streams.uvs");
        if matches!(self.streams.indices, TerrainIndexStreamV1::U16(_)) && vertex_count > u16::MAX as usize {
            issues.push("streams.indices must use Uint32Array when vertex count exceeds 65535".into());
        }

        let mut next_vertex = 0_u32;
        let mut next_index = 0_u32;
        let mut last_layer_order = None;
        for (index, span) in self.layers.iter().enumerate() {
            let path = format!("layers[{index}]");
            let layer_order = span.layer as u16;
            if last_layer_order.is_some_and(|last| layer_order <= last) {
                issues.push(format!("{path}.layer must follow canonical order without duplicates"));
            }
            last_layer_order = Some(layer_order);
            if span.vertex_start != next_vertex {
                issues.push(format!("{path}.vertexStart must be contiguous ({next_vertex})"));
            }
            if span.index_start != next_index {
                issues.push(format!("{path}.indexStart must be contiguous ({next_index})"));
            }
            if span.vertex_count == 0 {
                issues.push(format!("{path}.vertexCount must be positive; omit empty layers"));
            }
            if span.index_count == 0 || span.index_count % 3 != 0 {
                issues.push(format!("{path}.indexCount must be a positive triangle count"));
            }
            let vertex_end = span.vertex_start.checked_add(span.vertex_count);
            let index_end = span.index_start.checked_add(span.index_count);
            if vertex_end.is_none() {
                issues.push(format!("{path} vertex span overflows u32"));
            }
            if index_end.is_none() {
                issues.push(format!("{path} index span overflows u32"));
            }
            if let Some(index_end) = index_end
                && index_end as usize <= self.streams.indices.len()
            {
                let vertex_end = vertex_end.unwrap_or(u32::MAX);
                for cursor in span.index_start..index_end {
                    let Some(referenced) = self.streams.indices.get(cursor as usize) else {
                        break;
                    };
                    if referenced < span.vertex_start || referenced >= vertex_end {
                        issues.push(format!(
                            "{path} index {cursor} references vertex {referenced} outside its layer span"
                        ));
                        break;
                    }
                }
            }
            next_vertex = vertex_end.unwrap_or(u32::MAX);
            next_index = index_end.unwrap_or(u32::MAX);
        }
        if next_vertex as usize != vertex_count {
            issues.push(format!("layers must cover all {vertex_count} vertices"));
        }
        if next_index as usize != self.streams.indices.len() {
            issues.push(format!("layers must cover all {} indices", self.streams.indices.len()));
        }
        if self.layers.is_empty() {
            if vertex_count != 0 {
                issues.push("an empty layer list requires empty vertex streams".into());
            }
            if !self.streams.indices.is_empty() {
                issues.push("an empty layer list requires empty indices".into());
            }
        }
        if let Some(delta) = &self.lighting_delta {
            if delta.changed_cell_indices.len() != delta.packed_light.len() {
                issues.push("lightingDelta streams must have equal lengths".into());
            }
            let mut previous = None;
            for &cell in &delta.changed_cell_indices {
                if cell as usize >= TERRAIN_SECTION_CORE_CELL_COUNT_V1 || previous.is_some_and(|prior| cell <= prior) {
                    issues.push(
                        "lightingDelta.changedCellIndices must be sorted, unique, and inside the core section".into(),
                    );
                    break;
                }
                previous = Some(cell);
            }
        }
        validate_hash(&self.packet_hash, &mut issues, "packetHash");
        if issues.is_empty() && verify_hash && hash_mesh_packet_v1(self) != self.packet_hash {
            issues.push("packetHash does not match packet content".into());
        }
        issues
    }
}

#[must_use]
pub fn halo_cell_index_v1(local_x: i32, local_y: i32, local_z: i32) -> Option<usize> {
    if !(-1..=16).contains(&local_x) || !(-1..=16).contains(&local_y) || !(-1..=16).contains(&local_z) {
        return None;
    }
    let x = (local_x + 1) as usize;
    let y = (local_y + 1) as usize;
    let z = (local_z + 1) as usize;
    Some(x + TERRAIN_SECTION_HALO_SIZE_V1 * (z + TERRAIN_SECTION_HALO_SIZE_V1 * y))
}

#[must_use]
pub fn core_cell_index_v1(local_x: usize, local_y: usize, local_z: usize) -> Option<usize> {
    if local_x >= 16 || local_y >= 16 || local_z >= 16 {
        return None;
    }
    Some(local_x + 16 * (local_z + 16 * local_y))
}

#[must_use]
pub fn halo_biome_index_v1(local_x: i32, local_z: i32) -> Option<usize> {
    if !(-1..=16).contains(&local_x) || !(-1..=16).contains(&local_z) {
        return None;
    }
    Some((local_x + 1) as usize + TERRAIN_SECTION_HALO_SIZE_V1 * (local_z + 1) as usize)
}

#[must_use]
pub fn hash_section_snapshot_v1(snapshot: &SectionSnapshotV1) -> String {
    let mut hasher = CanonicalHasher::new("blockwild-section-snapshot-v1");
    hasher.write_u16(snapshot.schema_version);
    hasher.write_str(&snapshot.content_hash);
    write_address(&mut hasher, &snapshot.address);
    write_revision(&mut hasher, snapshot.revision);
    hasher.write_u16(snapshot.dimensions.width);
    hasher.write_u16(snapshot.dimensions.height);
    hasher.write_u16(snapshot.dimensions.depth);
    hasher.write_u16(snapshot.dimensions.halo);
    hash_u16_stream(&mut hasher, &snapshot.streams.blocks);
    hash_u16_stream(&mut hasher, &snapshot.streams.light);
    hasher.write_bytes(&snapshot.streams.facing);
    hasher.write_bytes(&snapshot.streams.hidden);
    hasher.write_bytes(&snapshot.streams.fluid_level);
    hasher.write_bytes(&snapshot.streams.fluid_flags);
    hasher.write_bytes(&snapshot.streams.biomes);
    hasher.finish().to_hex()
}

#[must_use]
pub fn hash_mesh_packet_v1(packet: &MeshPacketV1) -> String {
    let mut hasher = CanonicalHasher::new("blockwild-mesh-packet-v1");
    hasher.write_u16(packet.schema_version);
    hasher.write_str(&packet.source_snapshot_hash);
    hasher.write_str(&packet.content_hash);
    write_address(&mut hasher, &packet.address);
    write_revision(&mut hasher, packet.revision);
    hasher.write_u32(packet.layers.len() as u32);
    for span in &packet.layers {
        hasher.write_u16(span.layer as u16);
        hasher.write_u32(span.vertex_start);
        hasher.write_u32(span.vertex_count);
        hasher.write_u32(span.index_start);
        hasher.write_u32(span.index_count);
    }
    hash_f32_stream(&mut hasher, &packet.streams.positions);
    hash_i8_stream(&mut hasher, &packet.streams.normals);
    hasher.write_bytes(&packet.streams.colors);
    hasher.write_bytes(&packet.streams.lights);
    hasher.write_bytes(&packet.streams.emissions);
    hasher.write_bytes(&packet.streams.occlusions);
    hash_u16_stream(&mut hasher, &packet.streams.uvs);
    match &packet.streams.indices {
        TerrainIndexStreamV1::U16(values) => hash_u16_stream(&mut hasher, values),
        TerrainIndexStreamV1::U32(values) => hash_u32_stream(&mut hasher, values),
    }
    hasher.write_u16(u16::from(packet.lighting_delta.is_some()));
    if let Some(delta) = &packet.lighting_delta {
        hash_u16_stream(&mut hasher, &delta.changed_cell_indices);
        hash_u16_stream(&mut hasher, &delta.packed_light);
    }
    hasher.finish().to_hex()
}

fn validate_bounded_js_string(value: &str, issues: &mut Vec<String>, path: &str) {
    let utf16_length = value.encode_utf16().count();
    if utf16_length == 0 || utf16_length > 128 {
        issues.push(format!("{path} must be a non-empty bounded string"));
    }
}

fn validate_hash(value: &str, issues: &mut Vec<String>, path: &str) {
    if value.len() != 32
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        issues.push(format!("{path} must be 32 lowercase hexadecimal characters"));
    }
}

fn validate_length(actual: usize, expected: usize, issues: &mut Vec<String>, path: &str) {
    if actual != expected {
        issues.push(format!("{path} must contain {expected} elements"));
    }
}

fn write_address(hasher: &mut CanonicalHasher, address: &TerrainSectionAddressV1) {
    hasher.write_str(&address.universe_id);
    hasher.write_str(&address.location_id);
    hasher.write_i32(address.chunk_x);
    hasher.write_i32(address.chunk_z);
    hasher.write_i32(address.section_y);
}

fn write_revision(hasher: &mut CanonicalHasher, revision: TerrainSectionRevisionV1) {
    hasher.write_u32(revision.section);
    hasher.write_u32(revision.halo);
    hasher.write_u32(revision.lighting);
}

fn hash_u16_stream(hasher: &mut CanonicalHasher, values: &[u16]) {
    let mut bytes = Vec::with_capacity(values.len() * 2);
    for value in values {
        bytes.extend_from_slice(&value.to_le_bytes());
    }
    hasher.write_bytes(&bytes);
}

fn hash_u32_stream(hasher: &mut CanonicalHasher, values: &[u32]) {
    let mut bytes = Vec::with_capacity(values.len() * 4);
    for value in values {
        bytes.extend_from_slice(&value.to_le_bytes());
    }
    hasher.write_bytes(&bytes);
}

fn hash_f32_stream(hasher: &mut CanonicalHasher, values: &[f32]) {
    let mut bytes = Vec::with_capacity(values.len() * 4);
    for value in values {
        bytes.extend_from_slice(&value.to_bits().to_le_bytes());
    }
    hasher.write_bytes(&bytes);
}

fn hash_i8_stream(hasher: &mut CanonicalHasher, values: &[i8]) {
    let bytes = values.iter().map(|value| value.to_le_bytes()[0]).collect::<Vec<_>>();
    hasher.write_bytes(&bytes);
}
