use crate::catalog::{CanonicalLiquidV1, CanonicalSpecialtyMaterialV1, canonical_specialty_material_v1};
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
    /// Fully self-describing BWR2 material. Production meshing never consults
    /// the frozen BWR1 block-ID catalog for this variant.
    DataDriven(CanonicalSpecialtyMaterialV1),
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
            if let Some(TerrainMaterialV1::DataDriven(material)) = material
                && let Err(error) = validate_data_driven_material_v2(*material)
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
    pub(crate) fn resolved_material(&self, block_id: u16) -> Option<ResolvedTerrainMaterialV1> {
        match self.material(block_id)? {
            TerrainMaterialV1::Air => Some(ResolvedTerrainMaterialV1::Air),
            TerrainMaterialV1::OpaqueFullCube(material) => Some(ResolvedTerrainMaterialV1::OpaqueFullCube(material)),
            TerrainMaterialV1::Specialty => {
                canonical_specialty_material_v1(block_id).map(ResolvedTerrainMaterialV1::Specialty)
            }
            TerrainMaterialV1::DataDriven(material) => Some(ResolvedTerrainMaterialV1::Specialty(material)),
        }
    }

    #[must_use]
    pub fn biome_tint(&self, biome_id: u8) -> Option<[f64; 3]> {
        self.biome_tints.get(biome_id as usize).and_then(|entry| *entry)
    }
}

fn validate_data_driven_material_v2(material: CanonicalSpecialtyMaterialV1) -> Result<(), TerrainMeshContractError> {
    let mut issues = Vec::new();
    for (name, tile) in [
        ("sideTile", material.side_tile),
        ("topTile", material.top_tile),
        ("bottomTile", material.bottom_tile),
    ] {
        if tile >= ATLAS_TILE_COUNT_V1 {
            issues.push(format!("material.{name} must be inside the 16x16 atlas"));
        }
    }
    if material.emitted_light & 0xf000 != 0 {
        issues.push("material.emittedLight must not contain a sky source".into());
    }
    let emissive_strength = material.emissive_strength();
    if !emissive_strength.is_finite() || !(0.0..=1.0).contains(&emissive_strength) {
        issues.push("material.emissiveStrength must be finite and inside 0..1".into());
    }
    if material.light_dampening > MAX_LIGHT_LEVEL {
        issues.push("material.lightDampening must be inside 0..15".into());
    }
    if material.geometry_revision != 1 {
        issues.push("material.geometryRevision is unsupported".into());
    }
    if material.tint_policy > 1 {
        issues.push("material.tintPolicy is unsupported".into());
    }
    if material.aquatic_profile > 12 {
        issues.push("material.aquaticProfile is unsupported".into());
    }
    if material.waterlogged && !matches!(material.liquid, CanonicalLiquidV1::None) {
        issues.push("material cannot be both intrinsically liquid and waterlogged".into());
    }
    let liquid_layer_valid = match material.liquid {
        CanonicalLiquidV1::None => material.layer != crate::contract::TerrainMeshLayerV1::Water,
        CanonicalLiquidV1::Water => material.layer == crate::contract::TerrainMeshLayerV1::Water,
        CanonicalLiquidV1::Lava | CanonicalLiquidV1::Honey | CanonicalLiquidV1::Syrup => {
            material.layer == crate::contract::TerrainMeshLayerV1::Transparent
        }
    };
    if !liquid_layer_valid {
        issues.push("material liquid kind and render layer are inconsistent".into());
    }
    if material.aquatic_profile != 0 && !matches!(material.shape, crate::catalog::CanonicalShapeV1::Aquatic) {
        issues.push("material aquatic profile and shape are inconsistent".into());
    }
    let variant_valid = match material.shape {
        crate::catalog::CanonicalShapeV1::Cube => matches!(material.shape_variant, 0 | 1),
        crate::catalog::CanonicalShapeV1::Torch => matches!(material.shape_variant, 0 | 2..=5),
        crate::catalog::CanonicalShapeV1::Gate => matches!(material.shape_variant, 10..=13),
        crate::catalog::CanonicalShapeV1::Door => matches!(material.shape_variant, 20..=35),
        crate::catalog::CanonicalShapeV1::Bed => matches!(material.shape_variant, 40..=47),
        crate::catalog::CanonicalShapeV1::ArchiveShelf => matches!(material.shape_variant, 50..=56),
        _ => material.shape_variant == 0,
    };
    if !variant_valid {
        issues.push("material shapeVariant is invalid for its shape".into());
    }
    if issues.is_empty() {
        Ok(())
    } else {
        Err(TerrainMeshContractError::from_issues(issues))
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum ResolvedTerrainMaterialV1 {
    Air,
    OpaqueFullCube(OpaqueCubeMaterialV1),
    Specialty(CanonicalSpecialtyMaterialV1),
}

impl ResolvedTerrainMaterialV1 {
    #[must_use]
    pub(crate) const fn light_dampening(self) -> u8 {
        match self {
            Self::Air => 0,
            Self::OpaqueFullCube(material) => material.light_dampening,
            Self::Specialty(material) => material.light_dampening,
        }
    }

    #[must_use]
    pub(crate) const fn emitted_light(self) -> u16 {
        match self {
            Self::Air => 0,
            Self::OpaqueFullCube(material) => material.emitted_light,
            Self::Specialty(material) => material.emitted_light,
        }
    }

    #[must_use]
    pub(crate) const fn accepts_fluid_metadata(self) -> bool {
        matches!(
            self,
            Self::Specialty(CanonicalSpecialtyMaterialV1 {
                liquid: CanonicalLiquidV1::Water
                    | CanonicalLiquidV1::Lava
                    | CanonicalLiquidV1::Honey
                    | CanonicalLiquidV1::Syrup,
                ..
            }) | Self::Specialty(CanonicalSpecialtyMaterialV1 { waterlogged: true, .. })
        )
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

pub fn section_eligibility_v1(
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
        let Some(material) = registry.resolved_material(block_id) else {
            return Ok(SectionEligibilityV1::Ineligible(
                if matches!(registry.material(block_id), Some(TerrainMaterialV1::Specialty)) {
                    SectionIneligibilityV1::SpecialtyBlock {
                        halo_index: index as u16,
                        block_id,
                    }
                } else {
                    SectionIneligibilityV1::UnsupportedBlock {
                        halo_index: index as u16,
                        block_id,
                    }
                },
            ));
        };
        let fluid_level = snapshot.streams.fluid_level[index];
        let fluid_flags = snapshot.streams.fluid_flags[index];
        if (fluid_level != 0 || fluid_flags != 0) && !material.accepts_fluid_metadata() {
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

/// Backward-compatible name retained for the coarse V1 Wasm ABI.
pub fn opaque_section_eligibility_v1(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
) -> Result<SectionEligibilityV1, TerrainMeshContractError> {
    section_eligibility_v1(snapshot, registry)
}
