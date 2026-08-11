use crate::contract::{
    MeshPacketV1, SECTION_SNAPSHOT_SCHEMA_V1, SectionSnapshotV1, TerrainIndexStreamV1, TerrainLightingDeltaV1,
    TerrainMeshContractError, TerrainMeshLayerSpanV1, TerrainMeshLayerV1, TerrainMeshStreamsV1,
    TerrainSectionAddressV1, TerrainSectionDimensionsV1, TerrainSectionRevisionV1, TerrainSectionSnapshotStreamsV1,
};
use crate::lighting::SectionLightingResultV1;
use crate::material::{OpaqueCubeMaterialV1, SectionIneligibilityV1, TerrainMaterialRegistryV1, TerrainMaterialV1};

const SNAPSHOT_MAGIC: [u8; 4] = *b"BWS1";
const REGISTRY_MAGIC: [u8; 4] = *b"BWR1";
const MESH_MAGIC: [u8; 4] = *b"BWM1";
const LIGHT_MAGIC: [u8; 4] = *b"BWL1";
const INELIGIBLE_MAGIC: [u8; 4] = *b"BWI1";
const ERROR_MAGIC: [u8; 4] = *b"BWE1";
const MAX_WORLD_WIRE_BYTES_V1: usize = 64 * 1024 * 1024;

/// Encode a whole-section refusal. `BWI1` is distinct from a valid empty mesh.
#[must_use]
pub fn encode_section_ineligibility_v1(reason: &SectionIneligibilityV1) -> Vec<u8> {
    let mut bytes = Vec::new();
    bytes.extend_from_slice(&INELIGIBLE_MAGIC);
    match reason {
        SectionIneligibilityV1::ContentHashMismatch => push_u16(&mut bytes, 1),
        SectionIneligibilityV1::UnsupportedBlock { halo_index, block_id } => {
            push_u16(&mut bytes, 2);
            push_u16(&mut bytes, *halo_index);
            push_u16(&mut bytes, *block_id);
        }
        SectionIneligibilityV1::SpecialtyBlock { halo_index, block_id } => {
            push_u16(&mut bytes, 3);
            push_u16(&mut bytes, *halo_index);
            push_u16(&mut bytes, *block_id);
        }
        SectionIneligibilityV1::HiddenGeometry { halo_index, flags } => {
            push_u16(&mut bytes, 4);
            push_u16(&mut bytes, *halo_index);
            bytes.push(*flags);
        }
        SectionIneligibilityV1::FluidMetadata {
            halo_index,
            level,
            flags,
        } => {
            push_u16(&mut bytes, 5);
            push_u16(&mut bytes, *halo_index);
            bytes.push(*level);
            bytes.push(*flags);
        }
        SectionIneligibilityV1::UnsupportedBiome {
            halo_column_index,
            biome_id,
        } => {
            push_u16(&mut bytes, 6);
            push_u16(&mut bytes, *halo_column_index);
            bytes.push(*biome_id);
        }
    }
    bytes
}

/// Encode strict-validation failures without panicking across the Wasm ABI.
#[must_use]
pub fn encode_world_error_v1(error: &TerrainMeshContractError) -> Vec<u8> {
    let mut bytes = Vec::new();
    bytes.extend_from_slice(&ERROR_MAGIC);
    push_u32(&mut bytes, error.issues.len() as u32);
    for issue in &error.issues {
        push_string(&mut bytes, issue);
    }
    bytes
}

#[must_use]
pub fn encode_section_snapshot_v1(snapshot: &SectionSnapshotV1) -> Vec<u8> {
    let mut bytes = Vec::new();
    bytes.extend_from_slice(&SNAPSHOT_MAGIC);
    push_u16(&mut bytes, snapshot.schema_version);
    push_string(&mut bytes, &snapshot.content_hash);
    push_address(&mut bytes, &snapshot.address);
    push_revision(&mut bytes, snapshot.revision);
    push_u16(&mut bytes, snapshot.dimensions.width);
    push_u16(&mut bytes, snapshot.dimensions.height);
    push_u16(&mut bytes, snapshot.dimensions.depth);
    push_u16(&mut bytes, snapshot.dimensions.halo);
    push_u16_vec(&mut bytes, &snapshot.streams.blocks);
    push_u16_vec(&mut bytes, &snapshot.streams.light);
    push_u8_vec(&mut bytes, &snapshot.streams.facing);
    push_u8_vec(&mut bytes, &snapshot.streams.hidden);
    push_u8_vec(&mut bytes, &snapshot.streams.fluid_level);
    push_u8_vec(&mut bytes, &snapshot.streams.fluid_flags);
    push_u8_vec(&mut bytes, &snapshot.streams.biomes);
    push_string(&mut bytes, &snapshot.snapshot_hash);
    bytes
}

pub fn decode_section_snapshot_v1(bytes: &[u8]) -> Result<SectionSnapshotV1, TerrainMeshContractError> {
    validate_wire_size(bytes)?;
    let mut reader = Reader::new(bytes);
    reader.expect_magic(SNAPSHOT_MAGIC)?;
    let snapshot = SectionSnapshotV1 {
        schema_version: reader.read_u16()?,
        content_hash: reader.read_string()?,
        address: reader.read_address()?,
        revision: reader.read_revision()?,
        dimensions: TerrainSectionDimensionsV1 {
            width: reader.read_u16()?,
            height: reader.read_u16()?,
            depth: reader.read_u16()?,
            halo: reader.read_u16()?,
        },
        streams: TerrainSectionSnapshotStreamsV1 {
            blocks: reader.read_u16_vec()?,
            light: reader.read_u16_vec()?,
            facing: reader.read_u8_vec()?,
            hidden: reader.read_u8_vec()?,
            fluid_level: reader.read_u8_vec()?,
            fluid_flags: reader.read_u8_vec()?,
            biomes: reader.read_u8_vec()?,
        },
        snapshot_hash: reader.read_string()?,
    };
    reader.finish()?;
    snapshot.validate(true)?;
    Ok(snapshot)
}

#[must_use]
pub fn encode_material_registry_v1(registry: &TerrainMaterialRegistryV1) -> Vec<u8> {
    let mut bytes = Vec::new();
    bytes.extend_from_slice(&REGISTRY_MAGIC);
    push_string(&mut bytes, &registry.content_hash);
    push_u32(&mut bytes, registry.blocks.len() as u32);
    for material in &registry.blocks {
        match material {
            None => bytes.push(0),
            Some(TerrainMaterialV1::Air) => bytes.push(1),
            Some(TerrainMaterialV1::OpaqueFullCube(material)) => {
                bytes.push(2);
                push_u16(&mut bytes, material.side_tile);
                push_u16(&mut bytes, material.top_tile);
                push_u16(&mut bytes, material.bottom_tile);
                push_u16(&mut bytes, material.emitted_light);
                push_f64(&mut bytes, material.emissive_strength);
                bytes.push(material.light_dampening);
                bytes.push(u8::from(material.ambient_occlusion));
            }
            Some(TerrainMaterialV1::Specialty) => bytes.push(3),
        }
    }
    push_u32(&mut bytes, registry.biome_tints.len() as u32);
    for tint in &registry.biome_tints {
        if let Some(tint) = tint {
            bytes.push(1);
            for channel in tint {
                push_f64(&mut bytes, *channel);
            }
        } else {
            bytes.push(0);
        }
    }
    bytes
}

pub fn decode_material_registry_v1(bytes: &[u8]) -> Result<TerrainMaterialRegistryV1, TerrainMeshContractError> {
    validate_wire_size(bytes)?;
    let mut reader = Reader::new(bytes);
    reader.expect_magic(REGISTRY_MAGIC)?;
    let content_hash = reader.read_string()?;
    let block_count = reader.read_count("registry block count")?;
    if block_count > u16::MAX as usize + 1 {
        return Err(TerrainMeshContractError::new(
            "registry block count exceeds the u16 ID space",
        ));
    }
    let mut blocks = Vec::with_capacity(block_count);
    for _ in 0..block_count {
        blocks.push(match reader.read_u8()? {
            0 => None,
            1 => Some(TerrainMaterialV1::Air),
            2 => Some(TerrainMaterialV1::OpaqueFullCube(OpaqueCubeMaterialV1 {
                side_tile: reader.read_u16()?,
                top_tile: reader.read_u16()?,
                bottom_tile: reader.read_u16()?,
                emitted_light: reader.read_u16()?,
                emissive_strength: reader.read_f64()?,
                light_dampening: reader.read_u8()?,
                ambient_occlusion: match reader.read_u8()? {
                    0 => false,
                    1 => true,
                    value => {
                        return Err(TerrainMeshContractError::new(format!(
                            "material ambient-occlusion flag must be 0 or 1, got {value}"
                        )));
                    }
                },
            })),
            3 => Some(TerrainMaterialV1::Specialty),
            tag => {
                return Err(TerrainMeshContractError::new(format!(
                    "unknown registry material tag {tag}"
                )));
            }
        });
    }
    let biome_count = reader.read_count("registry biome count")?;
    if biome_count > u8::MAX as usize + 1 {
        return Err(TerrainMeshContractError::new(
            "registry biome count exceeds the u8 ID space",
        ));
    }
    let mut biome_tints = Vec::with_capacity(biome_count);
    for _ in 0..biome_count {
        biome_tints.push(match reader.read_u8()? {
            0 => None,
            1 => Some([reader.read_f64()?, reader.read_f64()?, reader.read_f64()?]),
            tag => {
                return Err(TerrainMeshContractError::new(format!(
                    "unknown registry biome tag {tag}"
                )));
            }
        });
    }
    reader.finish()?;
    let registry = TerrainMaterialRegistryV1 {
        content_hash,
        blocks,
        biome_tints,
    };
    registry.validate()?;
    Ok(registry)
}

#[must_use]
pub fn encode_mesh_packet_v1(packet: &MeshPacketV1) -> Vec<u8> {
    let mut bytes = Vec::new();
    bytes.extend_from_slice(&MESH_MAGIC);
    push_u16(&mut bytes, packet.schema_version);
    push_string(&mut bytes, &packet.source_snapshot_hash);
    push_string(&mut bytes, &packet.content_hash);
    push_address(&mut bytes, &packet.address);
    push_revision(&mut bytes, packet.revision);
    push_u32(&mut bytes, packet.layers.len() as u32);
    for span in &packet.layers {
        push_u16(&mut bytes, span.layer as u16);
        push_u32(&mut bytes, span.vertex_start);
        push_u32(&mut bytes, span.vertex_count);
        push_u32(&mut bytes, span.index_start);
        push_u32(&mut bytes, span.index_count);
    }
    push_f32_vec(&mut bytes, &packet.streams.positions);
    push_i8_vec(&mut bytes, &packet.streams.normals);
    push_u8_vec(&mut bytes, &packet.streams.colors);
    push_u8_vec(&mut bytes, &packet.streams.lights);
    push_u8_vec(&mut bytes, &packet.streams.emissions);
    push_u8_vec(&mut bytes, &packet.streams.occlusions);
    push_u16_vec(&mut bytes, &packet.streams.uvs);
    match &packet.streams.indices {
        TerrainIndexStreamV1::U16(indices) => {
            bytes.push(2);
            push_u16_vec(&mut bytes, indices);
        }
        TerrainIndexStreamV1::U32(indices) => {
            bytes.push(4);
            push_u32_vec(&mut bytes, indices);
        }
    }
    bytes.push(u8::from(packet.lighting_delta.is_some()));
    if let Some(delta) = &packet.lighting_delta {
        push_u16_vec(&mut bytes, &delta.changed_cell_indices);
        push_u16_vec(&mut bytes, &delta.packed_light);
    }
    push_string(&mut bytes, &packet.packet_hash);
    bytes
}

pub fn decode_mesh_packet_v1(bytes: &[u8]) -> Result<MeshPacketV1, TerrainMeshContractError> {
    validate_wire_size(bytes)?;
    let mut reader = Reader::new(bytes);
    reader.expect_magic(MESH_MAGIC)?;
    let schema_version = reader.read_u16()?;
    let source_snapshot_hash = reader.read_string()?;
    let content_hash = reader.read_string()?;
    let address = reader.read_address()?;
    let revision = reader.read_revision()?;
    let layer_count = reader.read_count("mesh layer count")?;
    if layer_count > TerrainMeshLayerV1::ALL.len() {
        return Err(TerrainMeshContractError::new(
            "mesh layer count exceeds the V1 canonical layer set",
        ));
    }
    let mut layers = Vec::with_capacity(layer_count);
    for _ in 0..layer_count {
        let layer = match reader.read_u16()? {
            0 => TerrainMeshLayerV1::Opaque,
            1 => TerrainMeshLayerV1::Cutout,
            2 => TerrainMeshLayerV1::Emissive,
            3 => TerrainMeshLayerV1::TranslucentSolid,
            4 => TerrainMeshLayerV1::Water,
            5 => TerrainMeshLayerV1::Transparent,
            6 => TerrainMeshLayerV1::Glass,
            value => return Err(TerrainMeshContractError::new(format!("unknown mesh layer {value}"))),
        };
        layers.push(TerrainMeshLayerSpanV1 {
            layer,
            vertex_start: reader.read_u32()?,
            vertex_count: reader.read_u32()?,
            index_start: reader.read_u32()?,
            index_count: reader.read_u32()?,
        });
    }
    let positions = reader.read_f32_vec()?;
    let normals = reader.read_i8_vec()?;
    let colors = reader.read_u8_vec()?;
    let lights = reader.read_u8_vec()?;
    let emissions = reader.read_u8_vec()?;
    let occlusions = reader.read_u8_vec()?;
    let uvs = reader.read_u16_vec()?;
    let indices = match reader.read_u8()? {
        2 => TerrainIndexStreamV1::U16(reader.read_u16_vec()?),
        4 => TerrainIndexStreamV1::U32(reader.read_u32_vec()?),
        width => {
            return Err(TerrainMeshContractError::new(format!(
                "unsupported mesh index width {width}"
            )));
        }
    };
    let lighting_delta = match reader.read_u8()? {
        0 => None,
        1 => Some(TerrainLightingDeltaV1 {
            changed_cell_indices: reader.read_u16_vec()?,
            packed_light: reader.read_u16_vec()?,
        }),
        tag => {
            return Err(TerrainMeshContractError::new(format!(
                "unsupported lighting delta tag {tag}"
            )));
        }
    };
    let packet_hash = reader.read_string()?;
    reader.finish()?;
    let packet = MeshPacketV1 {
        schema_version,
        source_snapshot_hash,
        content_hash,
        address,
        revision,
        layers,
        streams: TerrainMeshStreamsV1 {
            positions,
            normals,
            colors,
            lights,
            emissions,
            occlusions,
            uvs,
            indices,
        },
        lighting_delta,
        packet_hash,
    };
    packet.validate(true)?;
    Ok(packet)
}

#[must_use]
pub fn encode_lighting_result_v1(result: &SectionLightingResultV1) -> Vec<u8> {
    let mut bytes = Vec::new();
    bytes.extend_from_slice(&LIGHT_MAGIC);
    push_u16(&mut bytes, SECTION_SNAPSHOT_SCHEMA_V1);
    push_string(&mut bytes, &result.source_snapshot_hash);
    push_string(&mut bytes, &result.content_hash);
    push_address(&mut bytes, &result.address);
    push_revision(&mut bytes, result.revision);
    push_u16_vec(&mut bytes, &result.light);
    push_u16_vec(&mut bytes, &result.delta.changed_cell_indices);
    push_u16_vec(&mut bytes, &result.delta.packed_light);
    bytes
}

pub fn decode_lighting_result_v1(bytes: &[u8]) -> Result<SectionLightingResultV1, TerrainMeshContractError> {
    validate_wire_size(bytes)?;
    let mut reader = Reader::new(bytes);
    reader.expect_magic(LIGHT_MAGIC)?;
    if reader.read_u16()? != SECTION_SNAPSHOT_SCHEMA_V1 {
        return Err(TerrainMeshContractError::new("unsupported lighting result schema"));
    }
    let result = SectionLightingResultV1 {
        source_snapshot_hash: reader.read_string()?,
        content_hash: reader.read_string()?,
        address: reader.read_address()?,
        revision: reader.read_revision()?,
        light: reader.read_u16_vec()?,
        delta: TerrainLightingDeltaV1 {
            changed_cell_indices: reader.read_u16_vec()?,
            packed_light: reader.read_u16_vec()?,
        },
    };
    reader.finish()?;
    result.validate()?;
    Ok(result)
}

struct Reader<'a> {
    bytes: &'a [u8],
    cursor: usize,
}

impl<'a> Reader<'a> {
    const fn new(bytes: &'a [u8]) -> Self {
        Self { bytes, cursor: 0 }
    }

    fn expect_magic(&mut self, expected: [u8; 4]) -> Result<(), TerrainMeshContractError> {
        if self.read_exact(4)? != expected {
            return Err(TerrainMeshContractError::new(
                "binary world payload has the wrong magic",
            ));
        }
        Ok(())
    }

    fn finish(&self) -> Result<(), TerrainMeshContractError> {
        if self.cursor == self.bytes.len() {
            Ok(())
        } else {
            Err(TerrainMeshContractError::new("binary world payload has trailing bytes"))
        }
    }

    fn read_exact(&mut self, length: usize) -> Result<&'a [u8], TerrainMeshContractError> {
        let end = self
            .cursor
            .checked_add(length)
            .ok_or_else(|| TerrainMeshContractError::new("binary world payload length overflow"))?;
        let value = self
            .bytes
            .get(self.cursor..end)
            .ok_or_else(|| TerrainMeshContractError::new("binary world payload is truncated"))?;
        self.cursor = end;
        Ok(value)
    }

    fn read_u8(&mut self) -> Result<u8, TerrainMeshContractError> {
        Ok(self.read_exact(1)?[0])
    }

    fn read_u16(&mut self) -> Result<u16, TerrainMeshContractError> {
        Ok(u16::from_le_bytes(
            self.read_exact(2)?.try_into().expect("exact two-byte slice"),
        ))
    }

    fn read_u32(&mut self) -> Result<u32, TerrainMeshContractError> {
        Ok(u32::from_le_bytes(
            self.read_exact(4)?.try_into().expect("exact four-byte slice"),
        ))
    }

    fn read_i32(&mut self) -> Result<i32, TerrainMeshContractError> {
        Ok(i32::from_le_bytes(
            self.read_exact(4)?.try_into().expect("exact four-byte slice"),
        ))
    }

    fn read_f64(&mut self) -> Result<f64, TerrainMeshContractError> {
        Ok(f64::from_bits(u64::from_le_bytes(
            self.read_exact(8)?.try_into().expect("exact eight-byte slice"),
        )))
    }

    fn read_count(&mut self, label: &str) -> Result<usize, TerrainMeshContractError> {
        usize::try_from(self.read_u32()?).map_err(|_| TerrainMeshContractError::new(format!("{label} exceeds usize")))
    }

    fn read_string(&mut self) -> Result<String, TerrainMeshContractError> {
        let length = self.read_count("string length")?;
        String::from_utf8(self.read_exact(length)?.to_vec())
            .map_err(|_| TerrainMeshContractError::new("binary world string is not UTF-8"))
    }

    fn read_address(&mut self) -> Result<TerrainSectionAddressV1, TerrainMeshContractError> {
        Ok(TerrainSectionAddressV1 {
            universe_id: self.read_string()?,
            location_id: self.read_string()?,
            chunk_x: self.read_i32()?,
            chunk_z: self.read_i32()?,
            section_y: self.read_i32()?,
        })
    }

    fn read_revision(&mut self) -> Result<TerrainSectionRevisionV1, TerrainMeshContractError> {
        Ok(TerrainSectionRevisionV1 {
            section: self.read_u32()?,
            halo: self.read_u32()?,
            lighting: self.read_u32()?,
        })
    }

    fn read_u8_vec(&mut self) -> Result<Vec<u8>, TerrainMeshContractError> {
        let length = self.read_count("u8 stream length")?;
        Ok(self.read_exact(length)?.to_vec())
    }

    fn read_i8_vec(&mut self) -> Result<Vec<i8>, TerrainMeshContractError> {
        Ok(self
            .read_u8_vec()?
            .into_iter()
            .map(|value| i8::from_le_bytes([value]))
            .collect())
    }

    fn read_u16_vec(&mut self) -> Result<Vec<u16>, TerrainMeshContractError> {
        let length = self.read_count("u16 stream length")?;
        let byte_length = length
            .checked_mul(2)
            .ok_or_else(|| TerrainMeshContractError::new("u16 stream length overflow"))?;
        Ok(self
            .read_exact(byte_length)?
            .chunks_exact(2)
            .map(|chunk| u16::from_le_bytes(chunk.try_into().expect("exact two-byte chunk")))
            .collect())
    }

    fn read_u32_vec(&mut self) -> Result<Vec<u32>, TerrainMeshContractError> {
        let length = self.read_count("u32 stream length")?;
        let byte_length = length
            .checked_mul(4)
            .ok_or_else(|| TerrainMeshContractError::new("u32 stream length overflow"))?;
        Ok(self
            .read_exact(byte_length)?
            .chunks_exact(4)
            .map(|chunk| u32::from_le_bytes(chunk.try_into().expect("exact four-byte chunk")))
            .collect())
    }

    fn read_f32_vec(&mut self) -> Result<Vec<f32>, TerrainMeshContractError> {
        let length = self.read_count("f32 stream length")?;
        let byte_length = length
            .checked_mul(4)
            .ok_or_else(|| TerrainMeshContractError::new("f32 stream length overflow"))?;
        Ok(self
            .read_exact(byte_length)?
            .chunks_exact(4)
            .map(|chunk| f32::from_bits(u32::from_le_bytes(chunk.try_into().expect("exact four-byte chunk"))))
            .collect())
    }
}

fn validate_wire_size(bytes: &[u8]) -> Result<(), TerrainMeshContractError> {
    if bytes.len() > MAX_WORLD_WIRE_BYTES_V1 {
        Err(TerrainMeshContractError::new(format!(
            "binary world payload exceeds the {MAX_WORLD_WIRE_BYTES_V1}-byte V1 limit"
        )))
    } else {
        Ok(())
    }
}

fn push_u16(bytes: &mut Vec<u8>, value: u16) {
    bytes.extend_from_slice(&value.to_le_bytes());
}

fn push_u32(bytes: &mut Vec<u8>, value: u32) {
    bytes.extend_from_slice(&value.to_le_bytes());
}

fn push_i32(bytes: &mut Vec<u8>, value: i32) {
    bytes.extend_from_slice(&value.to_le_bytes());
}

fn push_f64(bytes: &mut Vec<u8>, value: f64) {
    bytes.extend_from_slice(&value.to_bits().to_le_bytes());
}

fn push_string(bytes: &mut Vec<u8>, value: &str) {
    push_u32(bytes, value.len() as u32);
    bytes.extend_from_slice(value.as_bytes());
}

fn push_address(bytes: &mut Vec<u8>, address: &TerrainSectionAddressV1) {
    push_string(bytes, &address.universe_id);
    push_string(bytes, &address.location_id);
    push_i32(bytes, address.chunk_x);
    push_i32(bytes, address.chunk_z);
    push_i32(bytes, address.section_y);
}

fn push_revision(bytes: &mut Vec<u8>, revision: TerrainSectionRevisionV1) {
    push_u32(bytes, revision.section);
    push_u32(bytes, revision.halo);
    push_u32(bytes, revision.lighting);
}

fn push_u8_vec(bytes: &mut Vec<u8>, values: &[u8]) {
    push_u32(bytes, values.len() as u32);
    bytes.extend_from_slice(values);
}

fn push_i8_vec(bytes: &mut Vec<u8>, values: &[i8]) {
    push_u32(bytes, values.len() as u32);
    bytes.extend(values.iter().map(|value| value.to_le_bytes()[0]));
}

fn push_u16_vec(bytes: &mut Vec<u8>, values: &[u16]) {
    push_u32(bytes, values.len() as u32);
    for value in values {
        push_u16(bytes, *value);
    }
}

fn push_u32_vec(bytes: &mut Vec<u8>, values: &[u32]) {
    push_u32(bytes, values.len() as u32);
    for value in values {
        push_u32(bytes, *value);
    }
}

fn push_f32_vec(bytes: &mut Vec<u8>, values: &[f32]) {
    push_u32(bytes, values.len() as u32);
    for value in values {
        push_u32(bytes, value.to_bits());
    }
}
