use std::env;
use std::fs;
use std::path::PathBuf;

use blockwild_render::{
    RenderBlendModeV2, RenderMaterialTextureV2, RenderMaterialV2, RenderResourceBatchV2, RenderResourceId,
    RenderResourceOperationV2, RenderShadingModelV2, RenderTextureAnimationV2, RenderTextureAtlasV2,
    RenderTextureColorSpaceV2, RenderTextureFilterV2, RenderTextureMipmapFilterV2, RenderTextureOriginV2,
    RenderTextureSamplerV2, RenderTextureUvModeV2, RenderTextureV2, RenderTextureWrapV2,
    decode_render_resource_batch_v2, encode_render_resource_batch_v2,
};

const TEXTURE_ID: RenderResourceId = RenderResourceId(8_192);

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let output = env::args_os()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("../tests/fixtures/rust-engine/r11-renderer/texture-material-v2.bwrd"));
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent)?;
    }
    let batch = fixture()?;
    let bytes = encode_render_resource_batch_v2(&batch)?;
    if decode_render_resource_batch_v2(&bytes)? != batch {
        return Err("texture/material fixture failed its Rust round trip".into());
    }
    fs::write(&output, &bytes)?;
    println!(
        "renderer_texture_material_fixture=ok path={} bytes={} hash={:?}",
        output.display(),
        bytes.len(),
        batch.batch_hash,
    );
    Ok(())
}

fn fixture() -> Result<RenderResourceBatchV2, blockwild_render::RenderExtractionError> {
    let texture = RenderTextureV2 {
        id: TEXTURE_ID,
        revision: 1,
        width: 4,
        height: 2,
        color_space: RenderTextureColorSpaceV2::Srgb,
        filter: RenderTextureFilterV2::Nearest,
        sampler: Some(RenderTextureSamplerV2 {
            mag_filter: RenderTextureFilterV2::Nearest,
            min_filter: RenderTextureFilterV2::Nearest,
            mipmap_filter: RenderTextureMipmapFilterV2::Disabled,
            wrap_u: RenderTextureWrapV2::ClampToEdge,
            wrap_v: RenderTextureWrapV2::ClampToEdge,
        }),
        atlas: Some(RenderTextureAtlasV2 {
            columns: 2,
            rows: 1,
            tile_width: 2,
            tile_height: 2,
            edge_inset: 0.014,
            origin: RenderTextureOriginV2::TopLeft,
        }),
        rgba8: vec![
            38, 121, 74, 255, 0, 0, 0, 0, 164, 214, 241, 255, 184, 224, 248, 255, 56, 151, 89, 255, 0, 0, 0, 0, 146,
            202, 233, 255, 171, 218, 242, 255,
        ],
    };
    RenderResourceBatchV2::create(
        11,
        1,
        vec![
            RenderResourceOperationV2::UpsertTexture(texture),
            RenderResourceOperationV2::UpsertMaterial(material(
                8_193,
                RenderBlendModeV2::AlphaClip,
                [255; 4],
                1.0,
                0.32,
                Some(0),
                RenderTextureUvModeV2::AtlasTile,
                RenderTextureAnimationV2::None,
                true,
                true,
            )),
            RenderResourceOperationV2::UpsertMaterial(material(
                8_194,
                RenderBlendModeV2::Water,
                [255; 4],
                0.76,
                0.0,
                Some(1),
                RenderTextureUvModeV2::AtlasTile,
                RenderTextureAnimationV2::WaterScrollX,
                true,
                false,
            )),
            RenderResourceOperationV2::UpsertMaterial(material(
                8_195,
                RenderBlendModeV2::AlphaBlend,
                [255; 4],
                0.86,
                0.0,
                None,
                RenderTextureUvModeV2::Geometry,
                RenderTextureAnimationV2::None,
                false,
                true,
            )),
        ],
    )
}

#[allow(clippy::too_many_arguments)]
fn material(
    id: u64,
    blend: RenderBlendModeV2,
    base_color_rgba8: [u8; 4],
    opacity: f32,
    alpha_cutoff: f32,
    atlas_tile: Option<u16>,
    uv_mode: RenderTextureUvModeV2,
    animation: RenderTextureAnimationV2,
    double_sided: bool,
    depth_write: bool,
) -> RenderMaterialV2 {
    RenderMaterialV2 {
        id: RenderResourceId(id),
        revision: 1,
        shading: RenderShadingModelV2::BlockLambert,
        blend,
        base_color_rgba8,
        emissive_rgb8: [0; 3],
        emissive_strength: 0.0,
        roughness: 1.0,
        metalness: 0.0,
        alpha_cutoff,
        atlas_tile,
        texture: Some(RenderMaterialTextureV2 {
            texture: TEXTURE_ID,
            uv_mode,
            animation,
            opacity,
        }),
        double_sided,
        depth_write,
    }
}
