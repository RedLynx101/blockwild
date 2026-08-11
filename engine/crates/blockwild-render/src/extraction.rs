//! Renderer-neutral extraction records shared by the Three.js oracle and the
//! production `wgpu` renderer.
//!
//! The protocol separates durable GPU resources from per-frame presentation.
//! A renderer may skip obsolete frame epochs, but it must apply resource
//! batches in revision order and may never infer authoritative game state.

use std::collections::{BTreeMap, BTreeSet};
use std::error::Error;
use std::fmt;

use blockwild_types::{CanonicalHash, CanonicalHasher};

pub const RENDER_EXTRACTION_SCHEMA_V2: u16 = 2;
pub const RENDER_MAX_RESOURCE_OPERATIONS_V2: usize = 65_536;
pub const RENDER_MAX_INSTANCES_V2: usize = 262_144;
pub const RENDER_MAX_PARTICLES_V2: usize = 262_144;

#[derive(Clone, Copy, Debug, Default, Eq, Ord, PartialEq, PartialOrd)]
pub struct RenderResourceId(pub u64);

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct RenderTransformV2 {
    pub translation: [f32; 3],
    /// Normalized xyzw quaternion.
    pub rotation: [f32; 4],
    pub scale: [f32; 3],
}

impl RenderTransformV2 {
    #[must_use]
    pub const fn identity() -> Self {
        Self {
            translation: [0.0; 3],
            rotation: [0.0, 0.0, 0.0, 1.0],
            scale: [1.0; 3],
        }
    }

    fn validate(&self, label: &'static str) -> Result<(), RenderExtractionError> {
        if self
            .translation
            .into_iter()
            .chain(self.rotation)
            .chain(self.scale)
            .any(|value| !value.is_finite())
        {
            return Err(RenderExtractionError::InvalidRecord(label));
        }
        if self.scale.into_iter().any(|value| value.abs() > 1_000_000.0) {
            return Err(RenderExtractionError::InvalidRecord(
                "render scale exceeds the bounded range",
            ));
        }
        let length_squared = self.rotation.into_iter().map(|value| value * value).sum::<f32>();
        if !(0.998..=1.002).contains(&length_squared) {
            return Err(RenderExtractionError::InvalidRecord(
                "render quaternion is not normalized",
            ));
        }
        Ok(())
    }

    fn hash_into(&self, hasher: &mut CanonicalHasher) {
        for value in self.translation.into_iter().chain(self.rotation).chain(self.scale) {
            hasher.write_u32(canonical_f32(value).to_bits());
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RenderBoundsV2 {
    pub minimum: [f32; 3],
    pub maximum: [f32; 3],
}

impl RenderBoundsV2 {
    fn validate(&self) -> Result<(), RenderExtractionError> {
        for axis in 0..3 {
            if !self.minimum[axis].is_finite()
                || !self.maximum[axis].is_finite()
                || self.minimum[axis] > self.maximum[axis]
            {
                return Err(RenderExtractionError::InvalidRecord("render bounds are invalid"));
            }
        }
        Ok(())
    }

    fn hash_into(&self, hasher: &mut CanonicalHasher) {
        for value in self.minimum.into_iter().chain(self.maximum) {
            hasher.write_u32(canonical_f32(value).to_bits());
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum RenderBlendModeV2 {
    Opaque = 0,
    AlphaClip = 1,
    AlphaBlend = 2,
    Additive = 3,
    Water = 4,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum RenderShadingModelV2 {
    Unlit = 0,
    BlockLambert = 1,
    Standard = 2,
    Sky = 3,
    Particle = 4,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RenderMaterialV2 {
    pub id: RenderResourceId,
    pub revision: u32,
    pub shading: RenderShadingModelV2,
    pub blend: RenderBlendModeV2,
    pub base_color_rgba8: [u8; 4],
    pub emissive_rgb8: [u8; 3],
    pub emissive_strength: f32,
    pub roughness: f32,
    pub metalness: f32,
    pub alpha_cutoff: f32,
    pub atlas_tile: Option<u16>,
    pub double_sided: bool,
    pub depth_write: bool,
}

impl RenderMaterialV2 {
    fn validate(&self) -> Result<(), RenderExtractionError> {
        if self.id.0 == 0 {
            return Err(RenderExtractionError::InvalidRecord("material id is zero"));
        }
        for value in [
            self.emissive_strength,
            self.roughness,
            self.metalness,
            self.alpha_cutoff,
        ] {
            if !value.is_finite() {
                return Err(RenderExtractionError::InvalidRecord(
                    "material contains a non-finite scalar",
                ));
            }
        }
        if !(0.0..=1.0).contains(&self.roughness)
            || !(0.0..=1.0).contains(&self.metalness)
            || !(0.0..=1.0).contains(&self.alpha_cutoff)
            || !(0.0..=64.0).contains(&self.emissive_strength)
        {
            return Err(RenderExtractionError::InvalidRecord(
                "material scalar is outside its bounded range",
            ));
        }
        Ok(())
    }

    fn hash_into(&self, hasher: &mut CanonicalHasher) {
        hasher.write_u64(self.id.0);
        hasher.write_u32(self.revision);
        hasher.write_u16(self.shading as u16);
        hasher.write_u16(self.blend as u16);
        hasher.write_bytes(&self.base_color_rgba8);
        hasher.write_bytes(&self.emissive_rgb8);
        for value in [
            self.emissive_strength,
            self.roughness,
            self.metalness,
            self.alpha_cutoff,
        ] {
            hasher.write_u32(canonical_f32(value).to_bits());
        }
        hasher.write_u16(self.atlas_tile.unwrap_or(u16::MAX));
        hasher.write_u16(u16::from(self.double_sided));
        hasher.write_u16(u16::from(self.depth_write));
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum RenderGeometryKindV2 {
    Terrain = 0,
    Box = 1,
    Plane = 2,
    Sphere = 3,
    Cylinder = 4,
    Cone = 5,
    Torus = 6,
    Octahedron = 7,
    AuthoredMesh = 8,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RenderGeometryV2 {
    pub id: RenderResourceId,
    pub revision: u32,
    pub kind: RenderGeometryKindV2,
    pub bounds: RenderBoundsV2,
    pub positions: Vec<f32>,
    pub normals: Vec<i8>,
    pub colors: Vec<u8>,
    pub lights: Vec<u8>,
    pub emissions: Vec<u8>,
    pub occlusions: Vec<u8>,
    pub uvs: Vec<u16>,
    pub indices: Vec<u32>,
}

impl RenderGeometryV2 {
    #[must_use]
    pub fn vertex_count(&self) -> usize {
        self.positions.len() / 3
    }

    #[must_use]
    pub fn byte_length(&self) -> usize {
        self.positions.len() * size_of::<f32>()
            + self.normals.len()
            + self.colors.len()
            + self.lights.len()
            + self.emissions.len()
            + self.occlusions.len()
            + self.uvs.len() * size_of::<u16>()
            + self.indices.len() * size_of::<u32>()
    }

    fn validate(&self) -> Result<(), RenderExtractionError> {
        if self.id.0 == 0 || !self.positions.len().is_multiple_of(3) || self.vertex_count() == 0 {
            return Err(RenderExtractionError::InvalidRecord(
                "geometry identity or position stream is invalid",
            ));
        }
        let vertices = self.vertex_count();
        if self.positions.iter().any(|value| !value.is_finite())
            || self.normals.len() != vertices * 3
            || !matches!(self.colors.len(), 0) && self.colors.len() != vertices * 3
            || !matches!(self.lights.len(), 0) && self.lights.len() != vertices * 4
            || !matches!(self.emissions.len(), 0) && self.emissions.len() != vertices
            || !matches!(self.occlusions.len(), 0) && self.occlusions.len() != vertices
            || !matches!(self.uvs.len(), 0) && self.uvs.len() != vertices * 2
            || self.indices.iter().any(|index| *index as usize >= vertices)
        {
            return Err(RenderExtractionError::InvalidRecord(
                "geometry streams are inconsistent",
            ));
        }
        self.bounds.validate()
    }

    fn hash_into(&self, hasher: &mut CanonicalHasher) {
        hasher.write_u64(self.id.0);
        hasher.write_u32(self.revision);
        hasher.write_u16(self.kind as u16);
        self.bounds.hash_into(hasher);
        hasher.write_u64(self.positions.len() as u64);
        for value in &self.positions {
            hasher.write_u32(canonical_f32(*value).to_bits());
        }
        hasher.write_bytes(&self.normals.iter().map(|value| *value as u8).collect::<Vec<_>>());
        hasher.write_bytes(&self.colors);
        hasher.write_bytes(&self.lights);
        hasher.write_bytes(&self.emissions);
        hasher.write_bytes(&self.occlusions);
        hasher.write_u64(self.uvs.len() as u64);
        for value in &self.uvs {
            hasher.write_u16(*value);
        }
        hasher.write_u64(self.indices.len() as u64);
        for value in &self.indices {
            hasher.write_u32(*value);
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum RenderInstanceDomainV2 {
    Terrain = 0,
    Creature = 1,
    Player = 2,
    Item = 3,
    Prop = 4,
    Machine = 5,
    Projectile = 6,
    Vehicle = 7,
    Effect = 8,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RenderInstanceV2 {
    pub stable_id: u64,
    pub domain: RenderInstanceDomainV2,
    pub geometry: RenderResourceId,
    pub material: RenderResourceId,
    pub parent: Option<u64>,
    pub transform: RenderTransformV2,
    pub tint_rgba8: [u8; 4],
    pub visibility_mask: u32,
    pub sort_key: i32,
    pub animation_flags: u32,
}

impl RenderInstanceV2 {
    fn validate(&self) -> Result<(), RenderExtractionError> {
        if self.stable_id == 0 || self.geometry.0 == 0 || self.material.0 == 0 || self.parent == Some(self.stable_id) {
            return Err(RenderExtractionError::InvalidRecord(
                "render instance identity is invalid",
            ));
        }
        self.transform.validate("render instance transform is invalid")
    }

    fn hash_into(&self, hasher: &mut CanonicalHasher) {
        hasher.write_u64(self.stable_id);
        hasher.write_u16(self.domain as u16);
        hasher.write_u64(self.geometry.0);
        hasher.write_u64(self.material.0);
        hasher.write_u64(self.parent.unwrap_or_default());
        self.transform.hash_into(hasher);
        hasher.write_bytes(&self.tint_rgba8);
        hasher.write_u32(self.visibility_mask);
        hasher.write_i32(self.sort_key);
        hasher.write_u32(self.animation_flags);
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum RenderResourceOperationKindV2 {
    UpsertMaterial = 0,
    UpsertGeometry = 1,
    RemoveMaterial = 2,
    RemoveGeometry = 3,
}

#[derive(Clone, Debug, PartialEq)]
pub enum RenderResourceOperationV2 {
    UpsertMaterial(RenderMaterialV2),
    UpsertGeometry(RenderGeometryV2),
    RemoveMaterial(RenderResourceId),
    RemoveGeometry(RenderResourceId),
}

impl RenderResourceOperationV2 {
    fn kind(&self) -> RenderResourceOperationKindV2 {
        match self {
            Self::UpsertMaterial(_) => RenderResourceOperationKindV2::UpsertMaterial,
            Self::UpsertGeometry(_) => RenderResourceOperationKindV2::UpsertGeometry,
            Self::RemoveMaterial(_) => RenderResourceOperationKindV2::RemoveMaterial,
            Self::RemoveGeometry(_) => RenderResourceOperationKindV2::RemoveGeometry,
        }
    }

    fn id(&self) -> RenderResourceId {
        match self {
            Self::UpsertMaterial(value) => value.id,
            Self::UpsertGeometry(value) => value.id,
            Self::RemoveMaterial(value) | Self::RemoveGeometry(value) => *value,
        }
    }

    fn validate(&self) -> Result<(), RenderExtractionError> {
        match self {
            Self::UpsertMaterial(value) => value.validate(),
            Self::UpsertGeometry(value) => value.validate(),
            Self::RemoveMaterial(value) | Self::RemoveGeometry(value) if value.0 == 0 => {
                Err(RenderExtractionError::InvalidRecord("removed resource id is zero"))
            }
            Self::RemoveMaterial(_) | Self::RemoveGeometry(_) => Ok(()),
        }
    }

    fn hash_into(&self, hasher: &mut CanonicalHasher) {
        hasher.write_u16(self.kind() as u16);
        match self {
            Self::UpsertMaterial(value) => value.hash_into(hasher),
            Self::UpsertGeometry(value) => value.hash_into(hasher),
            Self::RemoveMaterial(value) | Self::RemoveGeometry(value) => hasher.write_u64(value.0),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct RenderResourceBatchV2 {
    pub schema: u16,
    pub epoch: u64,
    pub revision: u64,
    pub operations: Vec<RenderResourceOperationV2>,
    pub batch_hash: CanonicalHash,
}

impl RenderResourceBatchV2 {
    pub fn create(
        epoch: u64,
        revision: u64,
        operations: Vec<RenderResourceOperationV2>,
    ) -> Result<Self, RenderExtractionError> {
        let mut value = Self {
            schema: RENDER_EXTRACTION_SCHEMA_V2,
            epoch,
            revision,
            operations,
            batch_hash: CanonicalHash::default(),
        };
        value.batch_hash = value.canonical_hash();
        value.validate()?;
        Ok(value)
    }

    #[must_use]
    pub fn canonical_hash(&self) -> CanonicalHash {
        let mut hasher = CanonicalHasher::new("blockwild.render.resources.v2");
        hasher.write_u16(self.schema);
        hasher.write_u64(self.epoch);
        hasher.write_u64(self.revision);
        hasher.write_u64(self.operations.len() as u64);
        for operation in &self.operations {
            operation.hash_into(&mut hasher);
        }
        hasher.finish()
    }

    pub fn validate(&self) -> Result<(), RenderExtractionError> {
        if self.schema != RENDER_EXTRACTION_SCHEMA_V2 {
            return Err(RenderExtractionError::UnsupportedSchema(self.schema));
        }
        if self.operations.len() > RENDER_MAX_RESOURCE_OPERATIONS_V2 {
            return Err(RenderExtractionError::LimitExceeded("resource operation count"));
        }
        let mut touched = BTreeSet::new();
        for operation in &self.operations {
            operation.validate()?;
            if !touched.insert((operation.kind() as u8, operation.id())) {
                return Err(RenderExtractionError::DuplicateId("resource operation"));
            }
        }
        if self.batch_hash != self.canonical_hash() {
            return Err(RenderExtractionError::HashMismatch("resource batch"));
        }
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RenderCameraV2 {
    pub position: [f32; 3],
    pub orientation: [f32; 4],
    pub vertical_fov_radians: f32,
    pub near: f32,
    pub far: f32,
    pub viewport: [u32; 2],
}

impl RenderCameraV2 {
    fn validate(&self) -> Result<(), RenderExtractionError> {
        RenderTransformV2 {
            translation: self.position,
            rotation: self.orientation,
            scale: [1.0; 3],
        }
        .validate("camera transform is invalid")?;
        if !self.vertical_fov_radians.is_finite()
            || !self.near.is_finite()
            || !self.far.is_finite()
            || !(0.01..3.13).contains(&self.vertical_fov_radians)
            || self.near <= 0.0
            || self.far <= self.near
            || self.viewport[0] == 0
            || self.viewport[1] == 0
        {
            return Err(RenderExtractionError::InvalidRecord("camera projection is invalid"));
        }
        Ok(())
    }

    fn hash_into(&self, hasher: &mut CanonicalHasher) {
        for value in self.position.into_iter().chain(self.orientation) {
            hasher.write_u32(canonical_f32(value).to_bits());
        }
        for value in [self.vertical_fov_radians, self.near, self.far] {
            hasher.write_u32(canonical_f32(value).to_bits());
        }
        hasher.write_u32(self.viewport[0]);
        hasher.write_u32(self.viewport[1]);
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RenderEnvironmentV2 {
    pub clear_rgba8: [u8; 4],
    pub ambient_rgb8: [u8; 3],
    pub ambient_intensity: f32,
    pub sun_direction: [f32; 3],
    pub sun_rgb8: [u8; 3],
    pub sun_intensity: f32,
    pub fog_rgb8: [u8; 3],
    pub fog_near: f32,
    pub fog_far: f32,
    pub underwater: f32,
    pub cave_occlusion: f32,
}

impl RenderEnvironmentV2 {
    fn validate(&self) -> Result<(), RenderExtractionError> {
        let scalars = [
            self.ambient_intensity,
            self.sun_intensity,
            self.fog_near,
            self.fog_far,
            self.underwater,
            self.cave_occlusion,
        ];
        if scalars.into_iter().any(|value| !value.is_finite())
            || self.sun_direction.into_iter().any(|value| !value.is_finite())
            || self.ambient_intensity < 0.0
            || self.sun_intensity < 0.0
            || self.fog_near < 0.0
            || self.fog_far < self.fog_near
            || !(0.0..=1.0).contains(&self.underwater)
            || !(0.0..=1.0).contains(&self.cave_occlusion)
        {
            return Err(RenderExtractionError::InvalidRecord("environment record is invalid"));
        }
        Ok(())
    }

    fn hash_into(&self, hasher: &mut CanonicalHasher) {
        hasher.write_bytes(&self.clear_rgba8);
        hasher.write_bytes(&self.ambient_rgb8);
        hasher.write_u32(canonical_f32(self.ambient_intensity).to_bits());
        for value in self.sun_direction {
            hasher.write_u32(canonical_f32(value).to_bits());
        }
        hasher.write_bytes(&self.sun_rgb8);
        hasher.write_u32(canonical_f32(self.sun_intensity).to_bits());
        hasher.write_bytes(&self.fog_rgb8);
        for value in [self.fog_near, self.fog_far, self.underwater, self.cave_occlusion] {
            hasher.write_u32(canonical_f32(value).to_bits());
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RenderParticleV2 {
    pub stable_id: u64,
    pub material: RenderResourceId,
    pub position: [f32; 3],
    pub velocity: [f32; 3],
    pub size: f32,
    pub rotation: f32,
    pub color_rgba8: [u8; 4],
    pub age_seconds: f32,
    pub lifetime_seconds: f32,
}

impl RenderParticleV2 {
    fn validate(&self) -> Result<(), RenderExtractionError> {
        if self.stable_id == 0 || self.material.0 == 0 {
            return Err(RenderExtractionError::InvalidRecord("particle identity is invalid"));
        }
        if self
            .position
            .into_iter()
            .chain(self.velocity)
            .chain([self.size, self.rotation, self.age_seconds, self.lifetime_seconds])
            .any(|value| !value.is_finite())
            || self.size < 0.0
            || self.lifetime_seconds <= 0.0
        {
            return Err(RenderExtractionError::InvalidRecord("particle state is invalid"));
        }
        Ok(())
    }

    fn hash_into(&self, hasher: &mut CanonicalHasher) {
        hasher.write_u64(self.stable_id);
        hasher.write_u64(self.material.0);
        for value in self
            .position
            .into_iter()
            .chain(self.velocity)
            .chain([self.size, self.rotation])
        {
            hasher.write_u32(canonical_f32(value).to_bits());
        }
        hasher.write_bytes(&self.color_rgba8);
        hasher.write_u32(canonical_f32(self.age_seconds).to_bits());
        hasher.write_u32(canonical_f32(self.lifetime_seconds).to_bits());
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct RenderFrameV2 {
    pub schema: u16,
    pub epoch: u64,
    pub frame_sequence: u64,
    pub simulation_tick: u64,
    pub animation_time_micros: u64,
    pub resource_revision: u64,
    pub camera: RenderCameraV2,
    pub environment: RenderEnvironmentV2,
    pub instances: Vec<RenderInstanceV2>,
    pub particles: Vec<RenderParticleV2>,
    pub frame_hash: CanonicalHash,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RenderFrameInputV2 {
    pub epoch: u64,
    pub frame_sequence: u64,
    pub simulation_tick: u64,
    pub animation_time_micros: u64,
    pub resource_revision: u64,
    pub camera: RenderCameraV2,
    pub environment: RenderEnvironmentV2,
    pub instances: Vec<RenderInstanceV2>,
    pub particles: Vec<RenderParticleV2>,
}

impl RenderFrameV2 {
    pub fn create(source: RenderFrameInputV2) -> Result<Self, RenderExtractionError> {
        let mut value = Self {
            schema: RENDER_EXTRACTION_SCHEMA_V2,
            epoch: source.epoch,
            frame_sequence: source.frame_sequence,
            simulation_tick: source.simulation_tick,
            animation_time_micros: source.animation_time_micros,
            resource_revision: source.resource_revision,
            camera: source.camera,
            environment: source.environment,
            instances: source.instances,
            particles: source.particles,
            frame_hash: CanonicalHash::default(),
        };
        value.frame_hash = value.canonical_hash();
        value.validate()?;
        Ok(value)
    }

    #[must_use]
    pub fn canonical_hash(&self) -> CanonicalHash {
        let mut hasher = CanonicalHasher::new("blockwild.render.frame.v2");
        hasher.write_u16(self.schema);
        hasher.write_u64(self.epoch);
        hasher.write_u64(self.frame_sequence);
        hasher.write_u64(self.simulation_tick);
        hasher.write_u64(self.animation_time_micros);
        hasher.write_u64(self.resource_revision);
        self.camera.hash_into(&mut hasher);
        self.environment.hash_into(&mut hasher);
        let mut instances = self.instances.iter().collect::<Vec<_>>();
        instances.sort_by_key(|value| value.stable_id);
        hasher.write_u64(instances.len() as u64);
        for instance in instances {
            instance.hash_into(&mut hasher);
        }
        let mut particles = self.particles.iter().collect::<Vec<_>>();
        particles.sort_by_key(|value| value.stable_id);
        hasher.write_u64(particles.len() as u64);
        for particle in particles {
            particle.hash_into(&mut hasher);
        }
        hasher.finish()
    }

    pub fn validate(&self) -> Result<(), RenderExtractionError> {
        if self.schema != RENDER_EXTRACTION_SCHEMA_V2 {
            return Err(RenderExtractionError::UnsupportedSchema(self.schema));
        }
        if self.instances.len() > RENDER_MAX_INSTANCES_V2 {
            return Err(RenderExtractionError::LimitExceeded("instance count"));
        }
        if self.particles.len() > RENDER_MAX_PARTICLES_V2 {
            return Err(RenderExtractionError::LimitExceeded("particle count"));
        }
        self.camera.validate()?;
        self.environment.validate()?;
        let mut instance_ids = BTreeSet::new();
        let mut parents = BTreeMap::new();
        for instance in &self.instances {
            instance.validate()?;
            if !instance_ids.insert(instance.stable_id) {
                return Err(RenderExtractionError::DuplicateId("render instance"));
            }
            parents.insert(instance.stable_id, instance.parent);
        }
        for (id, parent) in &parents {
            if let Some(parent) = parent {
                if !parents.contains_key(parent) {
                    return Err(RenderExtractionError::MissingReference("instance parent"));
                }
                let mut cursor = Some(*parent);
                let mut visited = BTreeSet::from([*id]);
                while let Some(node) = cursor {
                    if !visited.insert(node) {
                        return Err(RenderExtractionError::HierarchyCycle);
                    }
                    cursor = parents.get(&node).copied().flatten();
                }
            }
        }
        let mut particle_ids = BTreeSet::new();
        for particle in &self.particles {
            particle.validate()?;
            if !particle_ids.insert(particle.stable_id) {
                return Err(RenderExtractionError::DuplicateId("particle"));
            }
        }
        if self.frame_hash != self.canonical_hash() {
            return Err(RenderExtractionError::HashMismatch("render frame"));
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RenderExtractionError {
    UnsupportedSchema(u16),
    InvalidRecord(&'static str),
    DuplicateId(&'static str),
    MissingReference(&'static str),
    HierarchyCycle,
    LimitExceeded(&'static str),
    HashMismatch(&'static str),
    StaleEpoch,
    FutureEpoch,
    RevisionGap { expected: u64, actual: u64 },
    ResourceKindConflict(u64),
    ResourceRevisionConflict(u64),
    MissingResource(u64),
}

impl fmt::Display for RenderExtractionError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnsupportedSchema(schema) => write!(formatter, "unsupported render extraction schema {schema}"),
            Self::InvalidRecord(message) => formatter.write_str(message),
            Self::DuplicateId(label) => write!(formatter, "duplicate {label} id"),
            Self::MissingReference(label) => write!(formatter, "missing {label}"),
            Self::HierarchyCycle => formatter.write_str("render hierarchy contains a cycle"),
            Self::LimitExceeded(label) => write!(formatter, "{label} exceeds its protocol limit"),
            Self::HashMismatch(label) => write!(formatter, "{label} hash does not match its contents"),
            Self::StaleEpoch => formatter.write_str("render message belongs to a stale epoch"),
            Self::FutureEpoch => formatter.write_str("render frame belongs to an uninitialized future epoch"),
            Self::RevisionGap { expected, actual } => {
                write!(
                    formatter,
                    "render resource revision gap: expected {expected}, received {actual}"
                )
            }
            Self::ResourceKindConflict(id) => write!(formatter, "render resource {id} changes resource kind"),
            Self::ResourceRevisionConflict(id) => write!(formatter, "render resource {id} has a stale revision"),
            Self::MissingResource(id) => write!(formatter, "render frame references missing resource {id}"),
        }
    }
}

impl Error for RenderExtractionError {}

fn canonical_f32(value: f32) -> f32 {
    if value == 0.0 { 0.0 } else { value }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn camera() -> RenderCameraV2 {
        RenderCameraV2 {
            position: [0.0, 2.0, 4.0],
            orientation: [0.0, 0.0, 0.0, 1.0],
            vertical_fov_radians: 0.9,
            near: 0.05,
            far: 512.0,
            viewport: [1920, 1080],
        }
    }

    fn environment() -> RenderEnvironmentV2 {
        RenderEnvironmentV2 {
            clear_rgba8: [90, 154, 205, 255],
            ambient_rgb8: [178, 195, 202],
            ambient_intensity: 0.72,
            sun_direction: [0.2, 0.9, 0.1],
            sun_rgb8: [255, 242, 200],
            sun_intensity: 1.1,
            fog_rgb8: [122, 168, 196],
            fog_near: 48.0,
            fog_far: 192.0,
            underwater: 0.0,
            cave_occlusion: 0.0,
        }
    }

    fn instance(id: u64, parent: Option<u64>) -> RenderInstanceV2 {
        RenderInstanceV2 {
            stable_id: id,
            domain: RenderInstanceDomainV2::Creature,
            geometry: RenderResourceId(10),
            material: RenderResourceId(20),
            parent,
            transform: RenderTransformV2::identity(),
            tint_rgba8: [255; 4],
            visibility_mask: u32::MAX,
            sort_key: 0,
            animation_flags: 0,
        }
    }

    #[test]
    fn frame_hash_is_independent_of_instance_storage_order() {
        let first = RenderFrameV2::create(RenderFrameInputV2 {
            epoch: 1,
            frame_sequence: 2,
            simulation_tick: 3,
            animation_time_micros: 4,
            resource_revision: 5,
            camera: camera(),
            environment: environment(),
            instances: vec![instance(10, None), instance(11, Some(10))],
            particles: Vec::new(),
        })
        .unwrap();
        let second = RenderFrameV2::create(RenderFrameInputV2 {
            epoch: 1,
            frame_sequence: 2,
            simulation_tick: 3,
            animation_time_micros: 4,
            resource_revision: 5,
            camera: camera(),
            environment: environment(),
            instances: vec![instance(11, Some(10)), instance(10, None)],
            particles: Vec::new(),
        })
        .unwrap();
        assert_eq!(first.frame_hash, second.frame_hash);
    }

    #[test]
    fn hierarchy_cycles_are_rejected() {
        let error = RenderFrameV2::create(RenderFrameInputV2 {
            epoch: 1,
            frame_sequence: 2,
            simulation_tick: 3,
            animation_time_micros: 4,
            resource_revision: 5,
            camera: camera(),
            environment: environment(),
            instances: vec![instance(10, Some(11)), instance(11, Some(10))],
            particles: Vec::new(),
        })
        .unwrap_err();
        assert_eq!(error, RenderExtractionError::HierarchyCycle);
    }

    #[test]
    fn resource_batches_reject_ambiguous_duplicate_operations() {
        let material = RenderMaterialV2 {
            id: RenderResourceId(2),
            revision: 1,
            shading: RenderShadingModelV2::BlockLambert,
            blend: RenderBlendModeV2::Opaque,
            base_color_rgba8: [255; 4],
            emissive_rgb8: [0; 3],
            emissive_strength: 0.0,
            roughness: 1.0,
            metalness: 0.0,
            alpha_cutoff: 0.5,
            atlas_tile: Some(2),
            double_sided: false,
            depth_write: true,
        };
        let error = RenderResourceBatchV2::create(
            1,
            1,
            vec![
                RenderResourceOperationV2::UpsertMaterial(material.clone()),
                RenderResourceOperationV2::UpsertMaterial(material),
            ],
        )
        .unwrap_err();
        assert_eq!(error, RenderExtractionError::DuplicateId("resource operation"));
    }

    #[test]
    fn geometry_validation_matches_the_packed_terrain_stream_shape() {
        let geometry = RenderGeometryV2 {
            id: RenderResourceId(9),
            revision: 1,
            kind: RenderGeometryKindV2::Terrain,
            bounds: RenderBoundsV2 {
                minimum: [0.0; 3],
                maximum: [1.0; 3],
            },
            positions: vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0],
            normals: vec![0, 0, 127, 0, 0, 127, 0, 0, 127],
            colors: vec![255; 9],
            lights: vec![255; 12],
            emissions: vec![0; 3],
            occlusions: vec![255; 3],
            uvs: vec![0, 0, u16::MAX, 0, 0, u16::MAX],
            indices: vec![0, 1, 2],
        };
        let batch =
            RenderResourceBatchV2::create(1, 1, vec![RenderResourceOperationV2::UpsertGeometry(geometry)]).unwrap();
        assert_ne!(batch.batch_hash, CanonicalHash::default());
    }
}
