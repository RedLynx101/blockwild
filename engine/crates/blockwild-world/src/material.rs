use crate::contract::{
    SectionSnapshotV1, TERRAIN_SECTION_HALO_CELL_COUNT_V1, TERRAIN_SECTION_HALO_COLUMN_COUNT_V1,
    TerrainMeshContractError,
};

pub const ATLAS_GRID_V1: u16 = 16;
pub const ATLAS_TILE_COUNT_V1: u16 = ATLAS_GRID_V1 * ATLAS_GRID_V1;
pub const PACKED_VERTEX_COLOR_RANGE_V1: f64 = 1.1;
pub const MAX_LIGHT_LEVEL: u8 = 15;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct OpaqueCubeMaterialV1 {
    pub side_tile: u16,
    pub top_tile: u16,
    pub bottom_tile: u16,
    /// Packed B/G/R nibbles plus a zero sky nibble, matching `packVoxelLight`.
    pub emitted_light: u16,
    /// Scalar authored glow in the normalized 0..1 range.
    pub emissive_strength: f64,
    /// Destination-material attenuation input in the inclusive 0..15 range.
    pub light_dampening: u8,
    pub ambient_occlusion: bool,
}

impl OpaqueCubeMaterialV1 {
    pub fn validate(self) -> Result<(), TerrainMeshContractError> {
        let mut issues = Vec::new();
        for (name, tile) in [
            ("sideTile", self.side_tile),
            ("topTile", self.top_tile),
            ("bottomTile", self.bottom_tile),
        ] {
            if tile >= ATLAS_TILE_COUNT_V1 {
                issues.push(format!("material.{name} must be inside the 16x16 atlas"));
            }
        }
        if self.emitted_light & 0xf000 != 0 {
            issues.push("material.emittedLight must not contain a sky source".into());
        }
        if !self.emissive_strength.is_finite() || !(0.0..=1.0).contains(&self.emissive_strength) {
            issues.push("material.emissiveStrength must be finite and inside 0..1".into());
        }
        if self.light_dampening > MAX_LIGHT_LEVEL {
            issues.push("material.lightDampening must be inside 0..15".into());
        }
        if issues.is_empty() {
            Ok(())
        } else {
            Err(TerrainMeshContractError::from_issues(issues))
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum TerrainMaterialV1 {
    Air,
    OpaqueFullCube(OpaqueCubeMaterialV1),
    /// Known content whose authored geometry/layer is intentionally still TypeScript-owned.
    Specialty,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TerrainMaterialRegistryV1 {
    pub content_hash: String,
    /// Direct lookup by numeric block ID. Missing entries are unsupported, never air.
    pub blocks: Vec<Option<TerrainMaterialV1>>,
    /// Direct lookup by numeric biome ID, in the current authored linear RGB range.
    pub biome_tints: Vec<Option<[f64; 3]>>,
}

impl TerrainMaterialRegistryV1 {
    pub fn validate(&self) -> Result<(), TerrainMeshContractError> {
        let mut issues = Vec::new();
        if self.content_hash.len() != 32
            || !self
                .content_hash
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        {
            issues.push("registry.contentHash must be 32 lowercase hexadecimal characters".into());
        }
        if self.blocks.first().and_then(Option::as_ref) != Some(&TerrainMaterialV1::Air) {
            issues.push("registry block ID zero must explicitly be Air".into());
        }
        for (block_id, material) in self.blocks.iter().enumerate() {
            if let Some(TerrainMaterialV1::OpaqueFullCube(material)) = material
                && let Err(error) = material.validate()
            {
                issues.extend(
                    error
                        .issues
                        .into_iter()
                        .map(|issue| format!("registry.blocks[{block_id}]: {issue}")),
                );
            }
        }
        for (biome_id, tint) in self.biome_tints.iter().enumerate() {
            if let Some(tint) = tint
                && tint
                    .iter()
                    .any(|value| !value.is_finite() || !(0.0..=PACKED_VERTEX_COLOR_RANGE_V1).contains(value))
            {
                issues.push(format!(
                    "registry.biomeTints[{biome_id}] channels must be finite and inside 0..{PACKED_VERTEX_COLOR_RANGE_V1}"
                ));
            }
        }
        if issues.is_empty() {
            Ok(())
        } else {
            Err(TerrainMeshContractError::from_issues(issues))
        }
    }

    #[must_use]
    pub fn material(&self, block_id: u16) -> Option<TerrainMaterialV1> {
        self.blocks.get(block_id as usize).and_then(|entry| *entry)
    }

    #[must_use]
    pub fn biome_tint(&self, biome_id: u8) -> Option<[f64; 3]> {
        self.biome_tints.get(biome_id as usize).and_then(|entry| *entry)
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SectionIneligibilityV1 {
    ContentHashMismatch,
    UnsupportedBlock { halo_index: u16, block_id: u16 },
    SpecialtyBlock { halo_index: u16, block_id: u16 },
    HiddenGeometry { halo_index: u16, flags: u8 },
    FluidMetadata { halo_index: u16, level: u8, flags: u8 },
    UnsupportedBiome { halo_column_index: u16, biome_id: u8 },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SectionEligibilityV1 {
    Eligible,
    Ineligible(SectionIneligibilityV1),
}

impl SectionEligibilityV1 {
    #[must_use]
    pub const fn is_eligible(&self) -> bool {
        matches!(self, Self::Eligible)
    }
}

pub fn opaque_section_eligibility_v1(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
) -> Result<SectionEligibilityV1, TerrainMeshContractError> {
    snapshot.validate(true)?;
    registry.validate()?;
    if snapshot.content_hash != registry.content_hash {
        return Ok(SectionEligibilityV1::Ineligible(
            SectionIneligibilityV1::ContentHashMismatch,
        ));
    }
    debug_assert_eq!(snapshot.streams.blocks.len(), TERRAIN_SECTION_HALO_CELL_COUNT_V1);
    for index in 0..TERRAIN_SECTION_HALO_CELL_COUNT_V1 {
        let block_id = snapshot.streams.blocks[index];
        let Some(material) = registry.material(block_id) else {
            return Ok(SectionEligibilityV1::Ineligible(
                SectionIneligibilityV1::UnsupportedBlock {
                    halo_index: index as u16,
                    block_id,
                },
            ));
        };
        if matches!(material, TerrainMaterialV1::Specialty) {
            return Ok(SectionEligibilityV1::Ineligible(
                SectionIneligibilityV1::SpecialtyBlock {
                    halo_index: index as u16,
                    block_id,
                },
            ));
        }
        let hidden = snapshot.streams.hidden[index];
        if hidden != 0 {
            return Ok(SectionEligibilityV1::Ineligible(
                SectionIneligibilityV1::HiddenGeometry {
                    halo_index: index as u16,
                    flags: hidden,
                },
            ));
        }
        let fluid_level = snapshot.streams.fluid_level[index];
        let fluid_flags = snapshot.streams.fluid_flags[index];
        if fluid_level != 0 || fluid_flags != 0 {
            return Ok(SectionEligibilityV1::Ineligible(
                SectionIneligibilityV1::FluidMetadata {
                    halo_index: index as u16,
                    level: fluid_level,
                    flags: fluid_flags,
                },
            ));
        }
    }
    debug_assert_eq!(snapshot.streams.biomes.len(), TERRAIN_SECTION_HALO_COLUMN_COUNT_V1);
    for (index, &biome_id) in snapshot.streams.biomes.iter().enumerate() {
        if registry.biome_tint(biome_id).is_none() {
            return Ok(SectionEligibilityV1::Ineligible(
                SectionIneligibilityV1::UnsupportedBiome {
                    halo_column_index: index as u16,
                    biome_id,
                },
            ));
        }
    }
    Ok(SectionEligibilityV1::Eligible)
}
