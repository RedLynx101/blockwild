//! Frozen production block-atlas and terrain-material profiles.
//!
//! These values mirror `createBlockAtlas` and `createVoxelWorldMaterial` in
//! the current Three compatibility renderer. Keeping them in one renderer-
//! owned module prevents visual fixtures from inventing nearby-but-different
//! alpha, depth, color-space, filtering, wrapping, or animation behavior.

use crate::{
    BLOCK_ATLAS_TEXTURE_ID_V2, RenderBlendModeV2, RenderExtractionError, RenderMaterialTextureV2, RenderMaterialV2,
    RenderResourceId, RenderShadingModelV2, RenderTextureAnimationV2, RenderTextureAtlasV2, RenderTextureColorSpaceV2,
    RenderTextureFilterV2, RenderTextureMipmapFilterV2, RenderTextureOriginV2, RenderTextureSamplerV2,
    RenderTextureUvModeV2, RenderTextureV2, RenderTextureWrapV2,
};

pub const BLOCK_ATLAS_GRID_V2: u16 = 16;
pub const BLOCK_ATLAS_TILE_PIXELS_V2: u16 = 16;
pub const BLOCK_ATLAS_PIXELS_V2: u32 = 256;
pub const BLOCK_ATLAS_EDGE_INSET_V2: f32 = 0.014;
pub const TERRAIN_CUTOUT_ALPHA_CUTOFF_V2: f32 = 0.32;
pub const TERRAIN_EMISSIVE_ALPHA_CUTOFF_V2: f32 = 0.20;
pub const TERRAIN_TRANSLUCENT_SOLID_OPACITY_V2: f32 = 0.86;
pub const TERRAIN_TRANSPARENT_OPACITY_V2: f32 = 0.76;
pub const TERRAIN_GLASS_OPACITY_V2: f32 = 0.42;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ProductionTerrainLayerV2 {
    Opaque,
    Cutout,
    Emissive,
    TranslucentSolid,
    Water,
    Transparent,
    Glass,
}

/// Wrap immutable Canvas/ImageData bytes in the exact production atlas
/// descriptor. The caller owns extraction revisioning; every returned record
/// owns its pixel allocation and can be replayed after device loss.
pub fn production_block_atlas_texture_v2(
    revision: u32,
    rgba8: Vec<u8>,
) -> Result<RenderTextureV2, RenderExtractionError> {
    let expected = usize::try_from(BLOCK_ATLAS_PIXELS_V2 * BLOCK_ATLAS_PIXELS_V2 * 4)
        .expect("production block atlas dimensions fit usize");
    if revision == 0 || rgba8.len() != expected {
        return Err(RenderExtractionError::InvalidRecord(
            "production block atlas pixels are invalid",
        ));
    }
    Ok(RenderTextureV2 {
        id: BLOCK_ATLAS_TEXTURE_ID_V2,
        revision,
        width: BLOCK_ATLAS_PIXELS_V2,
        height: BLOCK_ATLAS_PIXELS_V2,
        color_space: RenderTextureColorSpaceV2::Srgb,
        // Retained for legacy decoders; the explicit sampler below is the
        // authoritative additive record.
        filter: RenderTextureFilterV2::Nearest,
        sampler: Some(RenderTextureSamplerV2 {
            mag_filter: RenderTextureFilterV2::Nearest,
            min_filter: RenderTextureFilterV2::Nearest,
            mipmap_filter: RenderTextureMipmapFilterV2::Disabled,
            wrap_u: RenderTextureWrapV2::ClampToEdge,
            wrap_v: RenderTextureWrapV2::ClampToEdge,
        }),
        atlas: Some(RenderTextureAtlasV2 {
            columns: BLOCK_ATLAS_GRID_V2,
            rows: BLOCK_ATLAS_GRID_V2,
            tile_width: BLOCK_ATLAS_TILE_PIXELS_V2,
            tile_height: BLOCK_ATLAS_TILE_PIXELS_V2,
            edge_inset: BLOCK_ATLAS_EDGE_INSET_V2,
            origin: RenderTextureOriginV2::TopLeft,
        }),
        rgba8,
    })
}

/// Exact shared material state for one production terrain render layer.
/// Texture alpha remains multiplicative: cutout/emissive discard against the
/// authored atlas alpha, while translucent layers multiply it by layer opacity.
#[must_use]
pub fn production_terrain_material_v2(
    id: RenderResourceId,
    revision: u32,
    layer: ProductionTerrainLayerV2,
) -> RenderMaterialV2 {
    let (blend, opacity, alpha_cutoff, double_sided, depth_write, animation) = match layer {
        ProductionTerrainLayerV2::Opaque => (
            RenderBlendModeV2::Opaque,
            1.0,
            0.0,
            false,
            true,
            RenderTextureAnimationV2::None,
        ),
        ProductionTerrainLayerV2::Cutout => (
            RenderBlendModeV2::AlphaClip,
            1.0,
            TERRAIN_CUTOUT_ALPHA_CUTOFF_V2,
            true,
            true,
            RenderTextureAnimationV2::None,
        ),
        ProductionTerrainLayerV2::Emissive => (
            RenderBlendModeV2::AlphaClip,
            1.0,
            TERRAIN_EMISSIVE_ALPHA_CUTOFF_V2,
            true,
            true,
            RenderTextureAnimationV2::None,
        ),
        ProductionTerrainLayerV2::TranslucentSolid => (
            RenderBlendModeV2::AlphaBlend,
            TERRAIN_TRANSLUCENT_SOLID_OPACITY_V2,
            0.0,
            false,
            true,
            RenderTextureAnimationV2::None,
        ),
        ProductionTerrainLayerV2::Water => (
            RenderBlendModeV2::Water,
            TERRAIN_TRANSPARENT_OPACITY_V2,
            0.0,
            true,
            false,
            RenderTextureAnimationV2::WaterScrollX,
        ),
        ProductionTerrainLayerV2::Transparent => (
            RenderBlendModeV2::AlphaBlend,
            TERRAIN_TRANSPARENT_OPACITY_V2,
            0.0,
            true,
            false,
            RenderTextureAnimationV2::None,
        ),
        ProductionTerrainLayerV2::Glass => (
            RenderBlendModeV2::AlphaBlend,
            TERRAIN_GLASS_OPACITY_V2,
            0.0,
            true,
            false,
            RenderTextureAnimationV2::None,
        ),
    };
    RenderMaterialV2 {
        id,
        revision,
        shading: RenderShadingModelV2::BlockLambert,
        blend,
        base_color_rgba8: [u8::MAX; 4],
        // Terrain emission is vertex-authored; the compatibility material does
        // not add a constant emissive wash to every pixel in the layer.
        emissive_rgb8: [0; 3],
        emissive_strength: 0.0,
        roughness: 1.0,
        metalness: 0.0,
        alpha_cutoff,
        atlas_tile: None,
        texture: Some(RenderMaterialTextureV2 {
            texture: BLOCK_ATLAS_TEXTURE_ID_V2,
            uv_mode: RenderTextureUvModeV2::Geometry,
            animation,
            opacity,
        }),
        double_sided,
        depth_write,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn production_atlas_descriptor_matches_three_canvas_texture() {
        let texture = production_block_atlas_texture_v2(1, vec![0; 256 * 256 * 4]).unwrap();
        assert_eq!(texture.color_space, RenderTextureColorSpaceV2::Srgb);
        assert_eq!(
            texture.sampler.unwrap().mipmap_filter,
            RenderTextureMipmapFilterV2::Disabled
        );
        assert_eq!(texture.sampler.unwrap().wrap_u, RenderTextureWrapV2::ClampToEdge);
        assert_eq!(texture.atlas.unwrap().edge_inset, 0.014);
        assert_eq!(texture.atlas.unwrap().origin, RenderTextureOriginV2::TopLeft);
    }

    #[test]
    fn production_layers_freeze_alpha_cutout_depth_and_animation() {
        let material = |layer| production_terrain_material_v2(RenderResourceId(7), 1, layer);
        let cutout = material(ProductionTerrainLayerV2::Cutout);
        assert_eq!(cutout.blend, RenderBlendModeV2::AlphaClip);
        assert_eq!(cutout.alpha_cutoff, 0.32);
        assert!(cutout.double_sided && cutout.depth_write);

        let ice = material(ProductionTerrainLayerV2::TranslucentSolid);
        assert_eq!(ice.texture.unwrap().opacity, 0.86);
        assert!(ice.depth_write && !ice.double_sided);

        let water = material(ProductionTerrainLayerV2::Water);
        assert_eq!(water.texture.unwrap().opacity, 0.76);
        assert!(!water.depth_write && water.double_sided);
        assert_eq!(water.texture.unwrap().animation, RenderTextureAnimationV2::WaterScrollX);

        let glass = material(ProductionTerrainLayerV2::Glass);
        assert_eq!(glass.texture.unwrap().opacity, 0.42);
    }
}
