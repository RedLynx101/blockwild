use std::collections::{BTreeMap, BTreeSet};
use std::error::Error;
use std::fmt;

use blockwild_types::{CanonicalHash, CanonicalHasher, EntityId};

use crate::Vec3;

pub const CREATURE_RENDER_ADMISSION_INTERVAL_MS: u64 = 200;
pub const CREATURE_RENDER_TIER_HOLD_MS: u64 = 900;
pub const CREATURE_ARTICULATED_DISTANCE: f32 = 88.0;
pub const CREATURE_SILHOUETTE_DISTANCE: f32 = 160.0;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Transform {
    pub translation: Vec3,
    pub rotation: Vec3,
    pub scale: Vec3,
}

impl Transform {
    pub const IDENTITY: Self = Self {
        translation: Vec3::ZERO,
        rotation: Vec3::ZERO,
        scale: Vec3::new(1.0, 1.0, 1.0),
    };

    #[must_use]
    pub fn is_valid(self) -> bool {
        self.translation.is_finite()
            && self.rotation.is_finite()
            && self.scale.is_finite()
            && self.scale.x > 0.0
            && self.scale.y > 0.0
            && self.scale.z > 0.0
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ColorRgba8 {
    pub red: u8,
    pub green: u8,
    pub blue: u8,
    pub alpha: u8,
}

impl ColorRgba8 {
    pub const WHITE: Self = Self {
        red: 255,
        green: 255,
        blue: 255,
        alpha: 255,
    };
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ModelMaterial {
    pub key: String,
    pub base_color: ColorRgba8,
    pub emissive_color: ColorRgba8,
    pub emissive_strength_milli: u16,
    pub roughness: u8,
    pub metallic: u8,
    pub transparent: bool,
    pub double_sided: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub enum ModelPrimitive {
    Cuboid { size: Vec3 },
    Plane { size: [f32; 2] },
    AuthoredMesh { mesh_key: String, bounds: Vec3 },
}

impl ModelPrimitive {
    fn is_valid(&self) -> bool {
        match self {
            Self::Cuboid { size } => size.is_finite() && size.x > 0.0 && size.y > 0.0 && size.z > 0.0,
            Self::Plane { size } => size.iter().all(|value| value.is_finite() && *value > 0.0),
            Self::AuthoredMesh { mesh_key, bounds } => {
                !mesh_key.is_empty() && bounds.is_finite() && bounds.x > 0.0 && bounds.y > 0.0 && bounds.z > 0.0
            }
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u16)]
pub enum JointSemantic {
    Root,
    Body,
    Neck,
    Head,
    Jaw,
    Tail,
    Leg,
    Foot,
    Wing,
    Fin,
    Antenna,
    Eye,
    EquipmentSocket,
    Ornament,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ModelNode {
    pub id: String,
    pub semantic: JointSemantic,
    /// Parent nodes must precede children, making evaluation allocation-free.
    pub parent: Option<u16>,
    pub transform: Transform,
    pub primitive: Option<ModelPrimitive>,
    pub material: Option<u16>,
    pub visible: bool,
    pub cast_shadow: bool,
    pub receive_shadow: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u16)]
pub enum AnimationProperty {
    Translation,
    Rotation,
    Scale,
    Visibility,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct AnimationKeyframe {
    pub time_millis: u32,
    pub value: [f32; 4],
}

#[derive(Clone, Debug, PartialEq)]
pub struct AnimationChannel {
    pub node: u16,
    pub property: AnimationProperty,
    pub keyframes: Vec<AnimationKeyframe>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct AnimationClip {
    pub key: String,
    pub duration_millis: u32,
    pub looping: bool,
    pub channels: Vec<AnimationChannel>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct AuthoredLodPolicy {
    pub articulated_nodes: Vec<u16>,
    pub silhouette_size: Vec3,
    pub silhouette_center_y: f32,
    pub primary_material: u16,
    pub accent_material: Option<u16>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ModelGraph {
    pub schema: u16,
    pub key: String,
    pub revision: u32,
    pub label: String,
    pub front_negative_z: bool,
    pub ground_y: f32,
    pub materials: Vec<ModelMaterial>,
    pub nodes: Vec<ModelNode>,
    pub animations: Vec<AnimationClip>,
    pub lod: AuthoredLodPolicy,
}

impl ModelGraph {
    pub fn validate(&self) -> Result<(), ModelError> {
        if self.schema != 1 {
            return Err(ModelError::UnsupportedSchema(self.schema));
        }
        if self.key.is_empty() || self.label.is_empty() || self.nodes.is_empty() || self.materials.is_empty() {
            return Err(ModelError::InvalidGraph(
                "model identity, nodes, and materials are required",
            ));
        }
        if !self.ground_y.is_finite()
            || !self.lod.silhouette_size.is_finite()
            || !self.lod.silhouette_center_y.is_finite()
        {
            return Err(ModelError::InvalidGraph("model bounds must be finite"));
        }
        if self.lod.silhouette_size.x <= 0.0 || self.lod.silhouette_size.y <= 0.0 || self.lod.silhouette_size.z <= 0.0 {
            return Err(ModelError::InvalidGraph("silhouette bounds must be positive"));
        }
        if usize::from(self.lod.primary_material) >= self.materials.len()
            || self
                .lod
                .accent_material
                .is_some_and(|index| usize::from(index) >= self.materials.len())
        {
            return Err(ModelError::InvalidMaterial);
        }
        let mut material_keys = BTreeSet::new();
        if self
            .materials
            .iter()
            .any(|material| material.key.is_empty() || !material_keys.insert(material.key.as_str()))
        {
            return Err(ModelError::InvalidMaterial);
        }
        let mut ids = BTreeSet::new();
        for (index, node) in self.nodes.iter().enumerate() {
            if node.id.is_empty() || !ids.insert(node.id.as_str()) {
                return Err(ModelError::DuplicateOrEmptyNode);
            }
            if !node.transform.is_valid() || node.primitive.as_ref().is_some_and(|primitive| !primitive.is_valid()) {
                return Err(ModelError::InvalidNode(index as u16));
            }
            if node.parent.is_some_and(|parent| usize::from(parent) >= index) {
                return Err(ModelError::InvalidParent(index as u16));
            }
            if node
                .material
                .is_some_and(|material| usize::from(material) >= self.materials.len())
            {
                return Err(ModelError::InvalidMaterial);
            }
            if node.primitive.is_some() && node.material.is_none() {
                return Err(ModelError::InvalidMaterial);
            }
        }
        for node in &self.lod.articulated_nodes {
            if usize::from(*node) >= self.nodes.len() {
                return Err(ModelError::InvalidNode(*node));
            }
        }
        let mut clips = BTreeSet::new();
        for clip in &self.animations {
            if clip.key.is_empty() || !clips.insert(clip.key.as_str()) || clip.duration_millis == 0 {
                return Err(ModelError::InvalidAnimation);
            }
            for channel in &clip.channels {
                if usize::from(channel.node) >= self.nodes.len() || channel.keyframes.is_empty() {
                    return Err(ModelError::InvalidAnimation);
                }
                let mut previous = None;
                for frame in &channel.keyframes {
                    if frame.time_millis > clip.duration_millis
                        || previous.is_some_and(|time| frame.time_millis <= time)
                        || frame.value.iter().any(|value| !value.is_finite())
                    {
                        return Err(ModelError::InvalidAnimation);
                    }
                    previous = Some(frame.time_millis);
                }
            }
        }
        Ok(())
    }

    #[must_use]
    pub fn canonical_hash(&self) -> CanonicalHash {
        let mut hasher = CanonicalHasher::new("blockwild.model.graph.v1");
        hasher.write_str(&self.key);
        hasher.write_u32(self.revision);
        hasher.write_str(&self.label);
        hasher.write_u16(u16::from(self.front_negative_z));
        hasher.write_u32(self.ground_y.to_bits());
        for material in &self.materials {
            hasher.write_str(&material.key);
            for value in [
                material.base_color.red,
                material.base_color.green,
                material.base_color.blue,
                material.base_color.alpha,
                material.emissive_color.red,
                material.emissive_color.green,
                material.emissive_color.blue,
                material.emissive_color.alpha,
                material.roughness,
                material.metallic,
            ] {
                hasher.write_u16(u16::from(value));
            }
            hasher.write_u16(material.emissive_strength_milli);
            hasher.write_u16(u16::from(material.transparent));
            hasher.write_u16(u16::from(material.double_sided));
        }
        for node in &self.nodes {
            hasher.write_str(&node.id);
            hasher.write_u16(node.semantic as u16);
            hasher.write_u16(node.parent.unwrap_or(u16::MAX));
            hash_transform(&mut hasher, node.transform);
            hash_primitive(&mut hasher, node.primitive.as_ref());
            hasher.write_u16(node.material.unwrap_or(u16::MAX));
            hasher.write_u16(u16::from(node.visible));
            hasher.write_u16(u16::from(node.cast_shadow));
            hasher.write_u16(u16::from(node.receive_shadow));
        }
        for clip in &self.animations {
            hasher.write_str(&clip.key);
            hasher.write_u32(clip.duration_millis);
            hasher.write_u16(u16::from(clip.looping));
            for channel in &clip.channels {
                hasher.write_u16(channel.node);
                hasher.write_u16(channel.property as u16);
                for frame in &channel.keyframes {
                    hasher.write_u32(frame.time_millis);
                    for value in frame.value {
                        hasher.write_u32(value.to_bits());
                    }
                }
            }
        }
        for node in &self.lod.articulated_nodes {
            hasher.write_u16(*node);
        }
        for value in self.lod.silhouette_size.to_array() {
            hasher.write_u32(value.to_bits());
        }
        hasher.write_u32(self.lod.silhouette_center_y.to_bits());
        hasher.write_u16(self.lod.primary_material);
        hasher.write_u16(self.lod.accent_material.unwrap_or(u16::MAX));
        hasher.finish()
    }
}

fn hash_transform(hasher: &mut CanonicalHasher, transform: Transform) {
    for value in transform
        .translation
        .to_array()
        .into_iter()
        .chain(transform.rotation.to_array())
        .chain(transform.scale.to_array())
    {
        hasher.write_u32(value.to_bits());
    }
}

fn hash_primitive(hasher: &mut CanonicalHasher, primitive: Option<&ModelPrimitive>) {
    match primitive {
        None => hasher.write_u16(0),
        Some(ModelPrimitive::Cuboid { size }) => {
            hasher.write_u16(1);
            for value in size.to_array() {
                hasher.write_u32(value.to_bits());
            }
        }
        Some(ModelPrimitive::Plane { size }) => {
            hasher.write_u16(2);
            for value in size {
                hasher.write_u32(value.to_bits());
            }
        }
        Some(ModelPrimitive::AuthoredMesh { mesh_key, bounds }) => {
            hasher.write_u16(3);
            hasher.write_str(mesh_key);
            for value in bounds.to_array() {
                hasher.write_u32(value.to_bits());
            }
        }
    }
}

#[derive(Clone, Debug, Default)]
pub struct ModelRegistry {
    models: BTreeMap<String, ModelGraph>,
}

impl ModelRegistry {
    pub fn insert(&mut self, graph: ModelGraph) -> Result<(), ModelError> {
        graph.validate()?;
        if self.models.contains_key(&graph.key) {
            return Err(ModelError::DuplicateModel(graph.key));
        }
        self.models.insert(graph.key.clone(), graph);
        Ok(())
    }

    #[must_use]
    pub fn get(&self, key: &str) -> Option<&ModelGraph> {
        self.models.get(key)
    }

    #[must_use]
    pub fn len(&self) -> usize {
        self.models.len()
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.models.is_empty()
    }
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
#[repr(u8)]
pub enum RenderTier {
    Hidden = 0,
    Silhouette = 1,
    Articulated = 2,
    Hero = 3,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RenderCandidate {
    pub id: EntityId,
    pub distance: f32,
    pub projected_size: f32,
    pub in_frustum: bool,
    pub critical: bool,
    pub important: bool,
    pub engaged: bool,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct RenderPressure {
    pub average_frame_milliseconds: f32,
    pub draw_calls: u32,
    pub low_resource_mode: bool,
}

#[must_use]
pub fn creature_hero_budget(pressure: RenderPressure) -> usize {
    let frame = pressure.average_frame_milliseconds.max(0.0);
    let draws = pressure.draw_calls;
    let base: usize = if pressure.low_resource_mode { 10 } else { 18 };
    if frame >= 38.0 || draws >= 700 {
        (base * 34 / 100).max(4)
    } else if frame >= 30.0 || draws >= 500 {
        (base / 2).max(6)
    } else if frame >= 24.0 || draws >= 350 {
        (base * 72 / 100).max(8)
    } else {
        base
    }
}

fn candidate_score(candidate: RenderCandidate) -> f32 {
    (if candidate.critical { 100_000.0 } else { 0.0 })
        + if candidate.engaged { 12_000.0 } else { 0.0 }
        + if candidate.important { 2_000.0 } else { 0.0 }
        + if candidate.in_frustum { 1_000.0 } else { 0.0 }
        + candidate.projected_size.clamp(0.0, 1.0) * 600.0
        + (320.0 - candidate.distance * 4.0).max(0.0)
}

fn desired_tier(candidate: RenderCandidate, heroes: &BTreeSet<EntityId>) -> RenderTier {
    if heroes.contains(&candidate.id) {
        RenderTier::Hero
    } else if (candidate.in_frustum || candidate.distance <= 18.0)
        && candidate.distance <= CREATURE_ARTICULATED_DISTANCE
    {
        RenderTier::Articulated
    } else if candidate.in_frustum && candidate.distance <= CREATURE_SILHOUETTE_DISTANCE {
        RenderTier::Silhouette
    } else {
        RenderTier::Hidden
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct AdmissionState {
    tier: RenderTier,
    changed_at: u64,
    last_seen_at: u64,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct AdmissionDiagnostics {
    pub candidates: usize,
    pub visible_candidates: usize,
    pub hero_budget: usize,
    pub critical_heroes: usize,
    pub transitions: usize,
    pub tier_counts: BTreeMap<RenderTier, usize>,
}

#[derive(Clone, Debug, Default)]
pub struct RenderAdmissionController {
    states: BTreeMap<EntityId, AdmissionState>,
    diagnostics: AdmissionDiagnostics,
}

impl RenderAdmissionController {
    pub fn evaluate(
        &mut self,
        candidates: &[RenderCandidate],
        pressure: RenderPressure,
        now_milliseconds: u64,
    ) -> AdmissionDiagnostics {
        let hero_budget = creature_hero_budget(pressure);
        let mut ranked: Vec<_> = candidates
            .iter()
            .copied()
            .filter(|candidate| {
                candidate.critical || candidate.engaged || candidate.in_frustum || candidate.distance <= 18.0
            })
            .collect();
        ranked.sort_by(|left, right| {
            candidate_score(*right)
                .total_cmp(&candidate_score(*left))
                .then_with(|| left.id.cmp(&right.id))
        });
        let mut heroes: BTreeSet<_> = ranked
            .iter()
            .filter(|candidate| candidate.critical)
            .map(|candidate| candidate.id)
            .collect();
        for candidate in &ranked {
            if heroes.len() >= hero_budget && !candidate.critical {
                break;
            }
            if candidate.critical || candidate.engaged || candidate.distance <= 24.0 || candidate.in_frustum {
                heroes.insert(candidate.id);
            }
        }

        let live: BTreeSet<_> = candidates.iter().map(|candidate| candidate.id).collect();
        let mut transitions = 0;
        let mut limited_transitions = 0;
        let mut counts = BTreeMap::from([
            (RenderTier::Hidden, 0),
            (RenderTier::Silhouette, 0),
            (RenderTier::Articulated, 0),
            (RenderTier::Hero, 0),
        ]);
        let mut ordered = candidates.to_vec();
        ordered.sort_by_key(|candidate| candidate.id);
        for candidate in ordered {
            let desired = desired_tier(candidate, &heroes);
            let previous = self.states.get(&candidate.id).copied();
            let mut tier = desired;
            if let Some(previous) = previous.filter(|state| state.tier != desired && !candidate.critical) {
                let promotion = desired > previous.tier;
                let held = now_milliseconds.saturating_sub(previous.changed_at) >= CREATURE_RENDER_TIER_HOLD_MS;
                if !promotion && (!held || limited_transitions >= 12) {
                    tier = previous.tier;
                }
            }
            if previous.is_none_or(|state| state.tier != tier) {
                transitions += 1;
                if !candidate.critical {
                    limited_transitions += 1;
                }
            }
            self.states.insert(
                candidate.id,
                AdmissionState {
                    tier,
                    changed_at: previous
                        .filter(|state| state.tier == tier)
                        .map_or(now_milliseconds, |state| state.changed_at),
                    last_seen_at: now_milliseconds,
                },
            );
            *counts.entry(tier).or_default() += 1;
        }
        self.states.retain(|id, state| {
            live.contains(id) || now_milliseconds.saturating_sub(state.last_seen_at) < CREATURE_RENDER_TIER_HOLD_MS
        });
        self.diagnostics = AdmissionDiagnostics {
            candidates: candidates.len(),
            visible_candidates: candidates.iter().filter(|candidate| candidate.in_frustum).count(),
            hero_budget,
            critical_heroes: candidates.iter().filter(|candidate| candidate.critical).count(),
            transitions,
            tier_counts: counts,
        };
        self.diagnostics.clone()
    }

    #[must_use]
    pub fn tier_for(&self, id: EntityId) -> RenderTier {
        self.states.get(&id).map_or(RenderTier::Hero, |state| state.tier)
    }

    #[must_use]
    pub fn diagnostics(&self) -> &AdmissionDiagnostics {
        &self.diagnostics
    }

    pub fn reset(&mut self) {
        self.states.clear();
        self.diagnostics = AdmissionDiagnostics::default();
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct PoseParameters {
    pub age_seconds: f32,
    pub gait_phase: f32,
    pub look_yaw: f32,
    pub look_pitch: f32,
    pub hurt: f32,
    pub action: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RenderEntityInput {
    pub id: EntityId,
    pub kind_key: String,
    pub model_key: String,
    pub transform: Transform,
    pub tier: RenderTier,
    pub pose: PoseParameters,
    pub primary_color: ColorRgba8,
    pub accent_color: ColorRgba8,
    pub visible: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct HeroRenderInstance {
    pub id: EntityId,
    pub kind_key: String,
    pub model_key: String,
    pub model_revision: u32,
    pub transform: Transform,
    pub pose: PoseParameters,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ArticulatedRenderInstance {
    pub id: EntityId,
    pub kind_key: String,
    pub model_key: String,
    pub model_revision: u32,
    pub transform: Transform,
    pub node_indices: Vec<u16>,
    pub pose: PoseParameters,
    pub primary_color: ColorRgba8,
    pub accent_color: ColorRgba8,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SilhouetteRenderInstance {
    pub id: EntityId,
    pub kind_key: String,
    pub position: Vec3,
    pub yaw: f32,
    pub size: Vec3,
    pub center_y: f32,
    pub color: ColorRgba8,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct RenderExtractionFrame {
    pub epoch: u64,
    pub heroes: Vec<HeroRenderInstance>,
    pub articulated: Vec<ArticulatedRenderInstance>,
    pub silhouettes: Vec<SilhouetteRenderInstance>,
    pub hidden_count: u32,
}

/// Extracts renderer-neutral hero, articulated-batch, and silhouette DTOs.
pub fn extract_render_frame(
    epoch: u64,
    inputs: &[RenderEntityInput],
    registry: &ModelRegistry,
) -> Result<RenderExtractionFrame, ModelError> {
    let mut ordered = inputs.to_vec();
    ordered.sort_by_key(|input| input.id);
    let mut frame = RenderExtractionFrame {
        epoch,
        ..RenderExtractionFrame::default()
    };
    for input in ordered {
        if !input.visible || input.tier == RenderTier::Hidden {
            frame.hidden_count = frame.hidden_count.saturating_add(1);
            continue;
        }
        if !input.transform.is_valid() {
            return Err(ModelError::InvalidTransform(input.id));
        }
        let graph = registry
            .get(&input.model_key)
            .ok_or_else(|| ModelError::MissingModel(input.model_key.clone()))?;
        match input.tier {
            RenderTier::Hero => frame.heroes.push(HeroRenderInstance {
                id: input.id,
                kind_key: input.kind_key,
                model_key: input.model_key,
                model_revision: graph.revision,
                transform: input.transform,
                pose: input.pose,
            }),
            RenderTier::Articulated => frame.articulated.push(ArticulatedRenderInstance {
                id: input.id,
                kind_key: input.kind_key,
                model_key: input.model_key,
                model_revision: graph.revision,
                transform: input.transform,
                node_indices: graph.lod.articulated_nodes.clone(),
                pose: input.pose,
                primary_color: input.primary_color,
                accent_color: input.accent_color,
            }),
            RenderTier::Silhouette => frame.silhouettes.push(SilhouetteRenderInstance {
                id: input.id,
                kind_key: input.kind_key,
                position: input.transform.translation,
                yaw: input.transform.rotation.y,
                size: Vec3::new(
                    graph.lod.silhouette_size.x * input.transform.scale.x,
                    graph.lod.silhouette_size.y * input.transform.scale.y,
                    graph.lod.silhouette_size.z * input.transform.scale.z,
                ),
                center_y: graph.lod.silhouette_center_y * input.transform.scale.y,
                color: input.primary_color,
            }),
            RenderTier::Hidden => unreachable!("hidden tier handled above"),
        }
    }
    Ok(frame)
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ModelError {
    UnsupportedSchema(u16),
    InvalidGraph(&'static str),
    DuplicateOrEmptyNode,
    InvalidNode(u16),
    InvalidParent(u16),
    InvalidMaterial,
    InvalidAnimation,
    DuplicateModel(String),
    MissingModel(String),
    InvalidTransform(EntityId),
}

impl fmt::Display for ModelError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnsupportedSchema(schema) => write!(formatter, "unsupported model schema {schema}"),
            Self::InvalidGraph(message) => write!(formatter, "invalid model graph: {message}"),
            Self::DuplicateOrEmptyNode => formatter.write_str("model node IDs must be non-empty and unique"),
            Self::InvalidNode(node) => write!(formatter, "invalid model node {node}"),
            Self::InvalidParent(node) => write!(formatter, "model node {node} has an invalid parent"),
            Self::InvalidMaterial => formatter.write_str("model references an invalid material"),
            Self::InvalidAnimation => formatter.write_str("model contains an invalid animation"),
            Self::DuplicateModel(key) => write!(formatter, "duplicate model {key}"),
            Self::MissingModel(key) => write!(formatter, "missing model {key}"),
            Self::InvalidTransform(id) => write!(formatter, "entity {id:?} has an invalid render transform"),
        }
    }
}

impl Error for ModelError {}
