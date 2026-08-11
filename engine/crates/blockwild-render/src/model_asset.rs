//! Compact build-time model catalog consumed by the Rust renderer.
//!
//! The browser never reconstructs authored models from Three.js objects. The
//! offline compiler emits this bounded, deterministic catalog from Blockwild's
//! renderer-neutral cuboid specifications; runtime instantiation only creates
//! resource/instance records.

use std::collections::{BTreeMap, BTreeSet};

use blockwild_types::{CanonicalHash, CanonicalHasher};

use crate::scene_renderer::unit_box_geometry_v2;
use crate::{
    RENDER_EXTRACTION_SCHEMA_V2, RenderBlendModeV2, RenderExtractionError, RenderInstanceDomainV2, RenderInstanceV2,
    RenderMaterialV2, RenderResourceBatchV2, RenderResourceId, RenderResourceOperationV2, RenderShadingModelV2,
    RenderTransformV2,
};

const MODEL_CATALOG_MAGIC_V2: &[u8; 4] = b"BWM2";
const MODEL_CATALOG_MAX_BYTES_V2: usize = 64 * 1024 * 1024;
const MODEL_CATALOG_MAX_MODELS_V2: usize = 4_096;
const MODEL_CATALOG_MAX_NODES_V2: usize = 16_384;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum CompiledModelCategoryV2 {
    Tool = 0,
    Creature = 1,
    Player = 2,
    Block = 3,
    Utility = 4,
    Prop = 5,
    Machine = 6,
    Vehicle = 7,
    Projectile = 8,
}

impl CompiledModelCategoryV2 {
    fn decode(value: u8) -> Result<Self, RenderExtractionError> {
        match value {
            0 => Ok(Self::Tool),
            1 => Ok(Self::Creature),
            2 => Ok(Self::Player),
            3 => Ok(Self::Block),
            4 => Ok(Self::Utility),
            5 => Ok(Self::Prop),
            6 => Ok(Self::Machine),
            7 => Ok(Self::Vehicle),
            8 => Ok(Self::Projectile),
            _ => Err(RenderExtractionError::InvalidRecord(
                "compiled model category is invalid",
            )),
        }
    }

    const fn domain(self) -> RenderInstanceDomainV2 {
        match self {
            Self::Tool => RenderInstanceDomainV2::Item,
            Self::Creature => RenderInstanceDomainV2::Creature,
            Self::Player => RenderInstanceDomainV2::Player,
            Self::Block | Self::Utility | Self::Prop => RenderInstanceDomainV2::Prop,
            Self::Machine => RenderInstanceDomainV2::Machine,
            Self::Vehicle => RenderInstanceDomainV2::Vehicle,
            Self::Projectile => RenderInstanceDomainV2::Projectile,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct CompiledModelNodeV2 {
    pub node_id: u32,
    pub parent_node_id: Option<u32>,
    pub part_tag: u16,
    pub transform: RenderTransformV2,
    pub color_rgba8: [u8; 4],
    pub emissive: bool,
    pub animation_flags: u32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct CompiledModelV2 {
    pub model_id: String,
    pub label: String,
    pub category: CompiledModelCategoryV2,
    pub ground_y: Option<f32>,
    pub nodes: Vec<CompiledModelNodeV2>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct CompiledModelCatalogV2 {
    pub schema: u16,
    pub models: Vec<CompiledModelV2>,
    pub catalog_hash: CanonicalHash,
}

#[derive(Clone, Debug, PartialEq)]
pub struct CompiledModelRenderBundleV2 {
    pub resources: RenderResourceBatchV2,
    pub instances: Vec<RenderInstanceV2>,
}

impl CompiledModelCatalogV2 {
    pub fn create(mut models: Vec<CompiledModelV2>) -> Result<Self, RenderExtractionError> {
        models.sort_by(|left, right| left.model_id.cmp(&right.model_id));
        let mut value = Self {
            schema: RENDER_EXTRACTION_SCHEMA_V2,
            models,
            catalog_hash: CanonicalHash::default(),
        };
        value.validate_models()?;
        value.catalog_hash = value.canonical_hash();
        Ok(value)
    }

    pub fn validate(&self) -> Result<(), RenderExtractionError> {
        if self.schema != RENDER_EXTRACTION_SCHEMA_V2 {
            return Err(RenderExtractionError::UnsupportedSchema(self.schema));
        }
        self.validate_models()?;
        if self.catalog_hash != self.canonical_hash() {
            return Err(RenderExtractionError::HashMismatch("compiled model catalog"));
        }
        Ok(())
    }

    fn validate_models(&self) -> Result<(), RenderExtractionError> {
        if self.models.is_empty() || self.models.len() > MODEL_CATALOG_MAX_MODELS_V2 {
            return Err(RenderExtractionError::InvalidRecord("compiled model count is invalid"));
        }
        let mut previous = None;
        for model in &self.models {
            validate_string(&model.model_id, 128, "compiled model id is invalid")?;
            validate_string(&model.label, 192, "compiled model label is invalid")?;
            if previous.is_some_and(|value: &str| value >= model.model_id.as_str()) {
                return Err(RenderExtractionError::InvalidRecord(
                    "compiled models must be canonical and unique",
                ));
            }
            previous = Some(model.model_id.as_str());
            if model.nodes.is_empty() || model.nodes.len() > MODEL_CATALOG_MAX_NODES_V2 {
                return Err(RenderExtractionError::InvalidRecord(
                    "compiled model node count is invalid",
                ));
            }
            if model.ground_y.is_some_and(|value| !value.is_finite()) {
                return Err(RenderExtractionError::InvalidRecord(
                    "compiled model ground plane is invalid",
                ));
            }
            let mut ids = BTreeSet::new();
            for node in &model.nodes {
                if node.node_id == 0 || !ids.insert(node.node_id) {
                    return Err(RenderExtractionError::InvalidRecord(
                        "compiled model node id is invalid",
                    ));
                }
                if node.parent_node_id.is_some_and(|parent| !ids.contains(&parent)) {
                    return Err(RenderExtractionError::InvalidRecord(
                        "compiled model parent must precede its child",
                    ));
                }
                validate_transform(node.transform)?;
            }
        }
        Ok(())
    }

    #[must_use]
    pub fn canonical_hash(&self) -> CanonicalHash {
        let mut hasher = CanonicalHasher::new("blockwild.render.model-catalog.v2");
        hasher.write_u16(self.schema);
        hasher.write_u32(self.models.len() as u32);
        for model in &self.models {
            hasher.write_str(&model.model_id);
            hasher.write_str(&model.label);
            hasher.write_u16(model.category as u16);
            hasher.write_u16(u16::from(model.ground_y.is_some()));
            if let Some(value) = model.ground_y {
                hasher.write_u32(value.to_bits());
            }
            hasher.write_u32(model.nodes.len() as u32);
            for node in &model.nodes {
                hasher.write_u32(node.node_id);
                hasher.write_u32(node.parent_node_id.unwrap_or_default());
                hasher.write_u16(node.part_tag);
                for value in node
                    .transform
                    .translation
                    .into_iter()
                    .chain(node.transform.rotation)
                    .chain(node.transform.scale)
                {
                    hasher.write_u32(value.to_bits());
                }
                hasher.write_bytes(&node.color_rgba8);
                hasher.write_u16(u16::from(node.emissive));
                hasher.write_u32(node.animation_flags);
            }
        }
        hasher.finish()
    }

    #[must_use]
    pub fn model(&self, model_id: &str) -> Option<&CompiledModelV2> {
        self.models
            .binary_search_by(|candidate| candidate.model_id.as_str().cmp(model_id))
            .ok()
            .map(|index| &self.models[index])
    }
}

pub fn instantiate_compiled_model_v2(
    model: &CompiledModelV2,
    epoch: u64,
    resource_revision: u64,
    base_resource_id: u64,
    base_stable_id: u64,
) -> Result<CompiledModelRenderBundleV2, RenderExtractionError> {
    if base_resource_id == 0 || base_stable_id == 0 {
        return Err(RenderExtractionError::InvalidRecord(
            "compiled model base identity is zero",
        ));
    }
    let resource_revision_u32 = u32::try_from(resource_revision)
        .map_err(|_| RenderExtractionError::InvalidRecord("compiled model resource revision exceeds u32"))?;
    let geometry_id = RenderResourceId(base_resource_id);
    let mut palette = BTreeMap::<([u8; 4], bool), RenderResourceId>::new();
    for node in &model.nodes {
        if !palette.contains_key(&(node.color_rgba8, node.emissive)) {
            let offset = u64::try_from(palette.len()).unwrap_or(u64::MAX).saturating_add(1);
            let id = RenderResourceId(
                base_resource_id
                    .checked_add(offset)
                    .ok_or(RenderExtractionError::InvalidRecord("compiled material id overflow"))?,
            );
            palette.insert((node.color_rgba8, node.emissive), id);
        }
    }
    let mut operations = Vec::with_capacity(palette.len() + 1);
    operations.push(RenderResourceOperationV2::UpsertGeometry(unit_box_geometry_v2(
        geometry_id,
        resource_revision_u32,
    )));
    for ((color, emissive), id) in &palette {
        operations.push(RenderResourceOperationV2::UpsertMaterial(RenderMaterialV2 {
            id: *id,
            revision: resource_revision_u32,
            shading: RenderShadingModelV2::BlockLambert,
            blend: if color[3] == 255 {
                RenderBlendModeV2::Opaque
            } else {
                RenderBlendModeV2::AlphaBlend
            },
            base_color_rgba8: *color,
            emissive_rgb8: [color[0], color[1], color[2]],
            emissive_strength: if *emissive { 0.85 } else { 0.0 },
            roughness: 0.82,
            metalness: 0.0,
            alpha_cutoff: 0.0,
            atlas_tile: None,
            double_sided: false,
            depth_write: color[3] == 255,
        }));
    }
    let resources = RenderResourceBatchV2::create(epoch, resource_revision, operations)?;
    let mut instances = Vec::with_capacity(model.nodes.len());
    for node in &model.nodes {
        let stable_id = base_stable_id
            .checked_add(u64::from(node.node_id))
            .ok_or(RenderExtractionError::InvalidRecord("compiled stable id overflow"))?;
        let parent = match node.parent_node_id {
            Some(value) => Some(
                base_stable_id
                    .checked_add(u64::from(value))
                    .ok_or(RenderExtractionError::InvalidRecord("compiled parent id overflow"))?,
            ),
            None => None,
        };
        instances.push(RenderInstanceV2 {
            stable_id,
            domain: model.category.domain(),
            geometry: geometry_id,
            material: *palette
                .get(&(node.color_rgba8, node.emissive))
                .expect("palette was built from every node"),
            parent,
            transform: node.transform,
            tint_rgba8: [255; 4],
            // Alpha-zero catalog nodes are transform-only rig anchors. They
            // participate in hierarchy resolution but never enter a draw list.
            visibility_mask: if node.color_rgba8[3] == 0 { 0 } else { u32::MAX },
            sort_key: i32::from(node.part_tag),
            animation_flags: node.animation_flags,
        });
    }
    Ok(CompiledModelRenderBundleV2 { resources, instances })
}

pub fn encode_compiled_model_catalog_v2(catalog: &CompiledModelCatalogV2) -> Result<Vec<u8>, RenderExtractionError> {
    catalog.validate()?;
    let mut writer = Writer::new();
    writer.bytes_raw(MODEL_CATALOG_MAGIC_V2);
    writer.u16(catalog.schema);
    writer.u32_len(catalog.models.len())?;
    for model in &catalog.models {
        writer.string(&model.model_id)?;
        writer.string(&model.label)?;
        writer.u8(model.category as u8);
        writer.u8(u8::from(model.ground_y.is_some()));
        if let Some(value) = model.ground_y {
            writer.f32(value);
        }
        writer.u32_len(model.nodes.len())?;
        for node in &model.nodes {
            writer.u32(node.node_id);
            writer.u32(node.parent_node_id.unwrap_or_default());
            writer.u16(node.part_tag);
            for value in node
                .transform
                .translation
                .into_iter()
                .chain(node.transform.rotation)
                .chain(node.transform.scale)
            {
                writer.f32(value);
            }
            writer.bytes_raw(&node.color_rgba8);
            writer.u8(u8::from(node.emissive));
            writer.u32(node.animation_flags);
        }
    }
    writer.bytes_raw(catalog.catalog_hash.as_bytes());
    writer.finish()
}

pub fn decode_compiled_model_catalog_v2(bytes: &[u8]) -> Result<CompiledModelCatalogV2, RenderExtractionError> {
    if bytes.len() > MODEL_CATALOG_MAX_BYTES_V2 {
        return Err(RenderExtractionError::InvalidRecord(
            "compiled model catalog is oversized",
        ));
    }
    let mut reader = Reader::new(bytes);
    if reader.take(4)? != MODEL_CATALOG_MAGIC_V2 {
        return Err(RenderExtractionError::InvalidRecord(
            "compiled model catalog magic is invalid",
        ));
    }
    let schema = reader.u16()?;
    let model_count = reader.count(MODEL_CATALOG_MAX_MODELS_V2)?;
    let mut models = Vec::with_capacity(model_count);
    for _ in 0..model_count {
        let model_id = reader.string(128)?;
        let label = reader.string(192)?;
        let category = CompiledModelCategoryV2::decode(reader.u8()?)?;
        let ground_y = match reader.u8()? {
            0 => None,
            1 => Some(reader.f32()?),
            _ => return Err(RenderExtractionError::InvalidRecord("compiled ground flag is invalid")),
        };
        let node_count = reader.count(MODEL_CATALOG_MAX_NODES_V2)?;
        let mut nodes = Vec::with_capacity(node_count);
        for _ in 0..node_count {
            let node_id = reader.u32()?;
            let parent = reader.u32()?;
            let part_tag = reader.u16()?;
            let translation = [reader.f32()?, reader.f32()?, reader.f32()?];
            let rotation = [reader.f32()?, reader.f32()?, reader.f32()?, reader.f32()?];
            let scale = [reader.f32()?, reader.f32()?, reader.f32()?];
            let color_rgba8 = reader.array4()?;
            let emissive = match reader.u8()? {
                0 => false,
                1 => true,
                _ => {
                    return Err(RenderExtractionError::InvalidRecord(
                        "compiled emissive flag is invalid",
                    ));
                }
            };
            let animation_flags = reader.u32()?;
            nodes.push(CompiledModelNodeV2 {
                node_id,
                parent_node_id: (parent != 0).then_some(parent),
                part_tag,
                transform: RenderTransformV2 {
                    translation,
                    rotation,
                    scale,
                },
                color_rgba8,
                emissive,
                animation_flags,
            });
        }
        models.push(CompiledModelV2 {
            model_id,
            label,
            category,
            ground_y,
            nodes,
        });
    }
    let mut hash = [0_u8; 16];
    hash.copy_from_slice(reader.take(16)?);
    reader.finish()?;
    let catalog = CompiledModelCatalogV2 {
        schema,
        models,
        catalog_hash: CanonicalHash(hash),
    };
    catalog.validate()?;
    Ok(catalog)
}

fn validate_transform(transform: RenderTransformV2) -> Result<(), RenderExtractionError> {
    if transform
        .translation
        .into_iter()
        .chain(transform.rotation)
        .chain(transform.scale)
        .any(|value| !value.is_finite())
        || transform.scale.into_iter().any(|value| value <= 0.0)
    {
        return Err(RenderExtractionError::InvalidRecord(
            "compiled model transform is invalid",
        ));
    }
    let norm = transform.rotation.into_iter().map(|value| value * value).sum::<f32>();
    if !(0.98..=1.02).contains(&norm) {
        return Err(RenderExtractionError::InvalidRecord(
            "compiled model rotation is not normalized",
        ));
    }
    Ok(())
}

fn validate_string(value: &str, maximum: usize, message: &'static str) -> Result<(), RenderExtractionError> {
    if value.is_empty() || value.len() > maximum || value.chars().any(char::is_control) {
        return Err(RenderExtractionError::InvalidRecord(message));
    }
    Ok(())
}

#[derive(Default)]
struct Writer {
    bytes: Vec<u8>,
}

impl Writer {
    fn new() -> Self {
        Self::default()
    }
    fn bytes_raw(&mut self, value: &[u8]) {
        self.bytes.extend_from_slice(value);
    }
    fn u8(&mut self, value: u8) {
        self.bytes.push(value);
    }
    fn u16(&mut self, value: u16) {
        self.bytes_raw(&value.to_le_bytes());
    }
    fn u32(&mut self, value: u32) {
        self.bytes_raw(&value.to_le_bytes());
    }
    fn f32(&mut self, value: f32) {
        self.u32(value.to_bits());
    }
    fn u32_len(&mut self, value: usize) -> Result<(), RenderExtractionError> {
        self.u32(
            u32::try_from(value)
                .map_err(|_| RenderExtractionError::InvalidRecord("compiled model length exceeds u32"))?,
        );
        Ok(())
    }
    fn string(&mut self, value: &str) -> Result<(), RenderExtractionError> {
        self.u32_len(value.len())?;
        self.bytes_raw(value.as_bytes());
        Ok(())
    }
    fn finish(self) -> Result<Vec<u8>, RenderExtractionError> {
        if self.bytes.len() > MODEL_CATALOG_MAX_BYTES_V2 {
            Err(RenderExtractionError::InvalidRecord(
                "compiled model catalog is oversized",
            ))
        } else {
            Ok(self.bytes)
        }
    }
}

struct Reader<'a> {
    bytes: &'a [u8],
    cursor: usize,
}

impl<'a> Reader<'a> {
    const fn new(bytes: &'a [u8]) -> Self {
        Self { bytes, cursor: 0 }
    }
    fn take(&mut self, length: usize) -> Result<&'a [u8], RenderExtractionError> {
        let end = self
            .cursor
            .checked_add(length)
            .ok_or(RenderExtractionError::InvalidRecord("compiled model offset overflow"))?;
        let value = self
            .bytes
            .get(self.cursor..end)
            .ok_or(RenderExtractionError::InvalidRecord(
                "compiled model catalog is truncated",
            ))?;
        self.cursor = end;
        Ok(value)
    }
    fn u8(&mut self) -> Result<u8, RenderExtractionError> {
        Ok(self.take(1)?[0])
    }
    fn u16(&mut self) -> Result<u16, RenderExtractionError> {
        Ok(u16::from_le_bytes(self.take(2)?.try_into().expect("exact slice")))
    }
    fn u32(&mut self) -> Result<u32, RenderExtractionError> {
        Ok(u32::from_le_bytes(self.take(4)?.try_into().expect("exact slice")))
    }
    fn f32(&mut self) -> Result<f32, RenderExtractionError> {
        Ok(f32::from_bits(self.u32()?))
    }
    fn count(&mut self, maximum: usize) -> Result<usize, RenderExtractionError> {
        let value =
            usize::try_from(self.u32()?).map_err(|_| RenderExtractionError::InvalidRecord("count conversion"))?;
        if value > maximum {
            Err(RenderExtractionError::InvalidRecord(
                "compiled model count is oversized",
            ))
        } else {
            Ok(value)
        }
    }
    fn string(&mut self, maximum: usize) -> Result<String, RenderExtractionError> {
        let length = self.count(maximum)?;
        String::from_utf8(self.take(length)?.to_vec())
            .map_err(|_| RenderExtractionError::InvalidRecord("compiled model string is not UTF-8"))
    }
    fn array4(&mut self) -> Result<[u8; 4], RenderExtractionError> {
        Ok(self.take(4)?.try_into().expect("exact slice"))
    }
    fn finish(self) -> Result<(), RenderExtractionError> {
        if self.cursor == self.bytes.len() {
            Ok(())
        } else {
            Err(RenderExtractionError::InvalidRecord(
                "compiled model catalog has trailing bytes",
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{RENDER_ANIMATION_BOB_V2, RENDER_ANIMATION_FLAP_V2};

    fn fixture() -> CompiledModelCatalogV2 {
        CompiledModelCatalogV2::create(vec![CompiledModelV2 {
            model_id: "renderer-runeowl".into(),
            label: "Renderer Runeowl".into(),
            category: CompiledModelCategoryV2::Creature,
            ground_y: Some(0.0),
            nodes: vec![
                CompiledModelNodeV2 {
                    node_id: 1,
                    parent_node_id: None,
                    part_tag: 1,
                    transform: RenderTransformV2::identity(),
                    color_rgba8: [55, 76, 91, 255],
                    emissive: false,
                    animation_flags: RENDER_ANIMATION_BOB_V2,
                },
                CompiledModelNodeV2 {
                    node_id: 2,
                    parent_node_id: Some(1),
                    part_tag: 2,
                    transform: RenderTransformV2 {
                        translation: [0.7, 0.1, 0.0],
                        rotation: [0.0, 0.0, 0.0, 1.0],
                        scale: [1.2, 0.2, 0.7],
                    },
                    color_rgba8: [112, 184, 204, 230],
                    emissive: true,
                    animation_flags: RENDER_ANIMATION_FLAP_V2,
                },
            ],
        }])
        .unwrap()
    }

    #[test]
    fn compiled_model_catalog_round_trips_and_rejects_corruption() {
        let catalog = fixture();
        let bytes = encode_compiled_model_catalog_v2(&catalog).unwrap();
        assert_eq!(decode_compiled_model_catalog_v2(&bytes).unwrap(), catalog);
        for length in 0..bytes.len().min(64) {
            assert!(decode_compiled_model_catalog_v2(&bytes[..length]).is_err());
        }
        let mut corrupt = bytes;
        let last = corrupt.len() - 1;
        corrupt[last] ^= 1;
        assert!(decode_compiled_model_catalog_v2(&corrupt).is_err());
    }

    #[test]
    fn compiled_model_instantiation_preserves_hierarchy_palette_and_animation() {
        let catalog = fixture();
        let bundle = instantiate_compiled_model_v2(&catalog.models[0], 2, 3, 100, 1_000).unwrap();
        assert_eq!(bundle.instances.len(), 2);
        assert_eq!(bundle.instances[1].parent, Some(1_001));
        assert_eq!(bundle.instances[1].animation_flags, RENDER_ANIMATION_FLAP_V2);
        assert_eq!(
            bundle.resources.operations.len(),
            3,
            "one cube and two palette materials"
        );
    }

    #[test]
    fn production_typescript_catalog_decodes_with_exact_rust_hash_parity() {
        let bytes = include_bytes!(
            "../../../../public/renderer/12c522f880e94c1ae527de701ae3e710fee13701d66fbb0a4ad24895557011b4/models.bwm2"
        );
        let catalog = decode_compiled_model_catalog_v2(bytes).unwrap();
        assert_eq!(catalog.models.len(), 252);
        assert_eq!(
            catalog.models.iter().map(|model| model.nodes.len()).sum::<usize>(),
            13_121
        );
        assert_eq!(
            catalog.catalog_hash.to_hex(),
            "52fd4aebb0c457f3c83af79af6b83c93",
            "offline TypeScript compiler and native Rust decoder share one canonical model graph"
        );
        let asterjaw = catalog.model("asterjaw").expect("Asterjaw is compiled");
        assert_eq!(asterjaw.nodes[0].color_rgba8[3], 0, "the rig root is transform-only");
        assert!(
            asterjaw.nodes.iter().skip(1).any(|node| node.parent_node_id.is_some()),
            "production creature hierarchy must survive offline compilation"
        );
        assert!(catalog.model("sea-dragon").is_some());
        assert!(catalog.model("sailboat").is_some());
        assert!(catalog.model("arrow-projectile").is_some());
    }
}
