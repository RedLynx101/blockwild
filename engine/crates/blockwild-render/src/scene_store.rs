//! Revisioned CPU-side render resource store.
//!
//! The store is deliberately independent of a GPU device. It validates and
//! retains the exact resources required to rebuild pipelines and buffers after
//! device loss, while stale presentation frames can be discarded cheaply.

use std::collections::{BTreeMap, BTreeSet};

use blockwild_types::CanonicalHash;

use crate::{
    RenderBlendModeV2, RenderExtractionError, RenderFrameV2, RenderGeometryV2, RenderMaterialV2, RenderResourceBatchV2,
    RenderResourceId, RenderResourceOperationV2, RenderTextureV2,
};

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct RenderStoreDiagnosticsV2 {
    pub epoch: u64,
    pub resource_revision: u64,
    pub last_frame_sequence: u64,
    pub material_count: u32,
    pub geometry_count: u32,
    pub texture_count: u32,
    pub geometry_bytes: u64,
    pub texture_bytes: u64,
    pub accepted_resource_batches: u64,
    pub duplicate_resource_batches: u64,
    pub accepted_frames: u64,
    pub stale_frames: u64,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct PreparedFrameSummaryV2 {
    pub instance_count: u32,
    pub particle_count: u32,
    pub opaque_instances: u32,
    pub alpha_clip_instances: u32,
    pub transparent_instances: u32,
    pub water_instances: u32,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FrameAdmissionV2 {
    Accepted(PreparedFrameSummaryV2),
    Stale,
}

#[derive(Clone, Debug, Default)]
pub struct RenderResourceStoreV2 {
    epoch: u64,
    resource_revision: u64,
    last_batch_hash: Option<CanonicalHash>,
    last_frame_sequence: u64,
    materials: BTreeMap<RenderResourceId, RenderMaterialV2>,
    geometries: BTreeMap<RenderResourceId, RenderGeometryV2>,
    textures: BTreeMap<RenderResourceId, RenderTextureV2>,
    diagnostics: RenderStoreDiagnosticsV2,
}

impl RenderResourceStoreV2 {
    #[must_use]
    pub fn material(&self, id: RenderResourceId) -> Option<&RenderMaterialV2> {
        self.materials.get(&id)
    }

    #[must_use]
    pub fn geometry(&self, id: RenderResourceId) -> Option<&RenderGeometryV2> {
        self.geometries.get(&id)
    }

    #[must_use]
    pub fn texture(&self, id: RenderResourceId) -> Option<&RenderTextureV2> {
        self.textures.get(&id)
    }

    pub fn materials(&self) -> impl Iterator<Item = &RenderMaterialV2> {
        self.materials.values()
    }

    #[must_use]
    pub const fn diagnostics(&self) -> RenderStoreDiagnosticsV2 {
        self.diagnostics
    }

    pub fn reset(&mut self, epoch: u64) {
        self.epoch = epoch;
        self.resource_revision = 0;
        self.last_batch_hash = None;
        self.last_frame_sequence = 0;
        self.materials.clear();
        self.geometries.clear();
        self.textures.clear();
        self.refresh_diagnostics();
    }

    pub fn apply_resource_batch(&mut self, batch: &RenderResourceBatchV2) -> Result<bool, RenderExtractionError> {
        batch.validate()?;
        if self.epoch == 0 {
            self.epoch = batch.epoch;
        }
        if batch.epoch < self.epoch {
            return Err(RenderExtractionError::StaleEpoch);
        }
        if batch.epoch > self.epoch {
            if batch.revision != 1 {
                return Err(RenderExtractionError::RevisionGap {
                    expected: 1,
                    actual: batch.revision,
                });
            }
            self.reset(batch.epoch);
        }
        if batch.revision == self.resource_revision && self.last_batch_hash == Some(batch.batch_hash) {
            self.diagnostics.duplicate_resource_batches = self.diagnostics.duplicate_resource_batches.wrapping_add(1);
            return Ok(false);
        }
        let expected = self.resource_revision.wrapping_add(1);
        if batch.revision != expected {
            return Err(RenderExtractionError::RevisionGap {
                expected,
                actual: batch.revision,
            });
        }
        self.preflight(batch)?;
        for operation in &batch.operations {
            match operation {
                RenderResourceOperationV2::UpsertMaterial(value) => {
                    self.materials.insert(value.id, value.clone());
                }
                RenderResourceOperationV2::UpsertGeometry(value) => {
                    self.geometries.insert(value.id, value.clone());
                }
                RenderResourceOperationV2::RemoveMaterial(id) => {
                    self.materials.remove(id);
                }
                RenderResourceOperationV2::RemoveGeometry(id) => {
                    self.geometries.remove(id);
                }
                RenderResourceOperationV2::UpsertTexture(value) => {
                    self.textures.insert(value.id, value.clone());
                }
                RenderResourceOperationV2::RemoveTexture(id) => {
                    self.textures.remove(id);
                }
            }
        }
        self.resource_revision = batch.revision;
        self.last_batch_hash = Some(batch.batch_hash);
        self.diagnostics.accepted_resource_batches = self.diagnostics.accepted_resource_batches.wrapping_add(1);
        self.refresh_diagnostics();
        Ok(true)
    }

    fn preflight(&self, batch: &RenderResourceBatchV2) -> Result<(), RenderExtractionError> {
        let mut material_ids = self.materials.keys().copied().collect::<BTreeSet<_>>();
        let mut geometry_ids = self.geometries.keys().copied().collect::<BTreeSet<_>>();
        let mut texture_ids = self.textures.keys().copied().collect::<BTreeSet<_>>();
        for operation in &batch.operations {
            match operation {
                RenderResourceOperationV2::UpsertMaterial(value) => {
                    if geometry_ids.contains(&value.id) || texture_ids.contains(&value.id) {
                        return Err(RenderExtractionError::ResourceKindConflict(value.id.0));
                    }
                    if self
                        .materials
                        .get(&value.id)
                        .is_some_and(|current| value.revision <= current.revision)
                    {
                        return Err(RenderExtractionError::ResourceRevisionConflict(value.id.0));
                    }
                    material_ids.insert(value.id);
                }
                RenderResourceOperationV2::UpsertGeometry(value) => {
                    if material_ids.contains(&value.id) || texture_ids.contains(&value.id) {
                        return Err(RenderExtractionError::ResourceKindConflict(value.id.0));
                    }
                    if self
                        .geometries
                        .get(&value.id)
                        .is_some_and(|current| value.revision <= current.revision)
                    {
                        return Err(RenderExtractionError::ResourceRevisionConflict(value.id.0));
                    }
                    geometry_ids.insert(value.id);
                }
                RenderResourceOperationV2::RemoveMaterial(id) => {
                    material_ids.remove(id);
                }
                RenderResourceOperationV2::RemoveGeometry(id) => {
                    geometry_ids.remove(id);
                }
                RenderResourceOperationV2::UpsertTexture(value) => {
                    if material_ids.contains(&value.id) || geometry_ids.contains(&value.id) {
                        return Err(RenderExtractionError::ResourceKindConflict(value.id.0));
                    }
                    if self
                        .textures
                        .get(&value.id)
                        .is_some_and(|current| value.revision <= current.revision)
                    {
                        return Err(RenderExtractionError::ResourceRevisionConflict(value.id.0));
                    }
                    texture_ids.insert(value.id);
                }
                RenderResourceOperationV2::RemoveTexture(id) => {
                    texture_ids.remove(id);
                }
            }
        }
        if material_ids.intersection(&geometry_ids).next().is_some()
            || material_ids.intersection(&texture_ids).next().is_some()
            || geometry_ids.intersection(&texture_ids).next().is_some()
        {
            return Err(RenderExtractionError::InvalidRecord("resource id spaces overlap"));
        }
        Ok(())
    }

    pub fn admit_frame(&mut self, frame: &RenderFrameV2) -> Result<FrameAdmissionV2, RenderExtractionError> {
        frame.validate()?;
        if frame.epoch != self.epoch {
            return Err(if frame.epoch < self.epoch {
                RenderExtractionError::StaleEpoch
            } else {
                RenderExtractionError::FutureEpoch
            });
        }
        if frame.resource_revision != self.resource_revision {
            return Err(RenderExtractionError::RevisionGap {
                expected: self.resource_revision,
                actual: frame.resource_revision,
            });
        }
        if frame.frame_sequence <= self.last_frame_sequence {
            self.diagnostics.stale_frames = self.diagnostics.stale_frames.wrapping_add(1);
            return Ok(FrameAdmissionV2::Stale);
        }
        let mut summary = PreparedFrameSummaryV2 {
            instance_count: u32::try_from(frame.instances.len()).unwrap_or(u32::MAX),
            particle_count: u32::try_from(frame.particles.len()).unwrap_or(u32::MAX),
            ..PreparedFrameSummaryV2::default()
        };
        for instance in &frame.instances {
            if !self.geometries.contains_key(&instance.geometry) {
                return Err(RenderExtractionError::MissingResource(instance.geometry.0));
            }
            let material = self
                .materials
                .get(&instance.material)
                .ok_or(RenderExtractionError::MissingResource(instance.material.0))?;
            match material.blend {
                RenderBlendModeV2::Opaque => summary.opaque_instances += 1,
                RenderBlendModeV2::AlphaClip => summary.alpha_clip_instances += 1,
                RenderBlendModeV2::AlphaBlend | RenderBlendModeV2::Additive => summary.transparent_instances += 1,
                RenderBlendModeV2::Water => summary.water_instances += 1,
            }
        }
        for particle in &frame.particles {
            if !self.materials.contains_key(&particle.material) {
                return Err(RenderExtractionError::MissingResource(particle.material.0));
            }
        }
        self.last_frame_sequence = frame.frame_sequence;
        self.diagnostics.accepted_frames = self.diagnostics.accepted_frames.wrapping_add(1);
        self.refresh_diagnostics();
        Ok(FrameAdmissionV2::Accepted(summary))
    }

    fn refresh_diagnostics(&mut self) {
        self.diagnostics.epoch = self.epoch;
        self.diagnostics.resource_revision = self.resource_revision;
        self.diagnostics.last_frame_sequence = self.last_frame_sequence;
        self.diagnostics.material_count = u32::try_from(self.materials.len()).unwrap_or(u32::MAX);
        self.diagnostics.geometry_count = u32::try_from(self.geometries.len()).unwrap_or(u32::MAX);
        self.diagnostics.texture_count = u32::try_from(self.textures.len()).unwrap_or(u32::MAX);
        self.diagnostics.geometry_bytes = self
            .geometries
            .values()
            .map(|value| u64::try_from(value.byte_length()).unwrap_or(u64::MAX))
            .sum();
        self.diagnostics.texture_bytes = self
            .textures
            .values()
            .map(|value| u64::try_from(value.byte_length()).unwrap_or(u64::MAX))
            .sum();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        BLOCK_ATLAS_TEXTURE_ID_V2, RenderBoundsV2, RenderCameraV2, RenderEnvironmentV2, RenderFrameInputV2,
        RenderGeometryKindV2, RenderInstanceDomainV2, RenderInstanceV2, RenderShadingModelV2,
        RenderTextureColorSpaceV2, RenderTextureFilterV2, RenderTransformV2,
    };

    fn material(id: u64, revision: u32, blend: RenderBlendModeV2) -> RenderMaterialV2 {
        RenderMaterialV2 {
            id: RenderResourceId(id),
            revision,
            shading: RenderShadingModelV2::BlockLambert,
            blend,
            base_color_rgba8: [255; 4],
            emissive_rgb8: [0; 3],
            emissive_strength: 0.0,
            roughness: 1.0,
            metalness: 0.0,
            alpha_cutoff: 0.5,
            atlas_tile: None,
            double_sided: false,
            depth_write: true,
        }
    }

    fn geometry(id: u64, revision: u32) -> RenderGeometryV2 {
        RenderGeometryV2 {
            id: RenderResourceId(id),
            revision,
            kind: RenderGeometryKindV2::Box,
            bounds: RenderBoundsV2 {
                minimum: [0.0; 3],
                maximum: [1.0; 3],
            },
            positions: vec![0.0, 0.0, 0.0],
            normals: vec![0, 127, 0],
            colors: Vec::new(),
            lights: Vec::new(),
            emissions: Vec::new(),
            occlusions: Vec::new(),
            uvs: Vec::new(),
            indices: vec![0],
        }
    }

    fn frame(sequence: u64, resource_revision: u64) -> RenderFrameV2 {
        RenderFrameV2::create(RenderFrameInputV2 {
            epoch: 1,
            frame_sequence: sequence,
            simulation_tick: sequence,
            animation_time_micros: sequence * 1_000,
            resource_revision,
            camera: RenderCameraV2 {
                position: [0.0; 3],
                orientation: [0.0, 0.0, 0.0, 1.0],
                vertical_fov_radians: 1.0,
                near: 0.05,
                far: 512.0,
                viewport: [1280, 720],
            },
            environment: RenderEnvironmentV2 {
                clear_rgba8: [0, 0, 0, 255],
                ambient_rgb8: [255; 3],
                ambient_intensity: 1.0,
                sun_direction: [0.0, 1.0, 0.0],
                sun_rgb8: [255; 3],
                sun_intensity: 1.0,
                fog_rgb8: [0; 3],
                fog_near: 64.0,
                fog_far: 256.0,
                underwater: 0.0,
                cave_occlusion: 0.0,
                lighting: None,
            },
            instances: vec![RenderInstanceV2 {
                stable_id: 11,
                domain: RenderInstanceDomainV2::Creature,
                geometry: RenderResourceId(2),
                material: RenderResourceId(1),
                parent: None,
                transform: RenderTransformV2::identity(),
                tint_rgba8: [255; 4],
                visibility_mask: u32::MAX,
                sort_key: 0,
                animation_flags: 0,
            }],
            particles: Vec::new(),
        })
        .unwrap()
    }

    #[test]
    fn textures_are_revisioned_owned_resources() {
        let mut store = RenderResourceStoreV2::default();
        let texture = RenderTextureV2 {
            id: BLOCK_ATLAS_TEXTURE_ID_V2,
            revision: 1,
            width: 1,
            height: 1,
            color_space: RenderTextureColorSpaceV2::Srgb,
            filter: RenderTextureFilterV2::Nearest,
            rgba8: vec![10, 20, 30, 255],
        };
        store
            .apply_resource_batch(
                &RenderResourceBatchV2::create(1, 1, vec![RenderResourceOperationV2::UpsertTexture(texture.clone())])
                    .unwrap(),
            )
            .unwrap();
        assert_eq!(store.texture(BLOCK_ATLAS_TEXTURE_ID_V2), Some(&texture));
        assert_eq!(store.diagnostics().texture_count, 1);
        assert_eq!(store.diagnostics().texture_bytes, 4);
    }

    #[test]
    fn resource_batches_are_transactional_revisioned_and_idempotent() {
        let mut store = RenderResourceStoreV2::default();
        let batch = RenderResourceBatchV2::create(
            1,
            1,
            vec![
                RenderResourceOperationV2::UpsertMaterial(material(1, 1, RenderBlendModeV2::Opaque)),
                RenderResourceOperationV2::UpsertGeometry(geometry(2, 1)),
            ],
        )
        .unwrap();
        assert!(store.apply_resource_batch(&batch).unwrap());
        assert!(!store.apply_resource_batch(&batch).unwrap());
        assert_eq!(store.diagnostics().geometry_count, 1);
        let gap = RenderResourceBatchV2::create(1, 3, Vec::new()).unwrap();
        assert_eq!(
            store.apply_resource_batch(&gap).unwrap_err(),
            RenderExtractionError::RevisionGap { expected: 2, actual: 3 }
        );
    }

    #[test]
    fn frames_require_exact_resources_and_discard_obsolete_presentation() {
        let mut store = RenderResourceStoreV2::default();
        let batch = RenderResourceBatchV2::create(
            1,
            1,
            vec![
                RenderResourceOperationV2::UpsertMaterial(material(1, 1, RenderBlendModeV2::Opaque)),
                RenderResourceOperationV2::UpsertGeometry(geometry(2, 1)),
            ],
        )
        .unwrap();
        store.apply_resource_batch(&batch).unwrap();
        assert_eq!(
            store.admit_frame(&frame(1, 1)).unwrap(),
            FrameAdmissionV2::Accepted(PreparedFrameSummaryV2 {
                instance_count: 1,
                opaque_instances: 1,
                ..PreparedFrameSummaryV2::default()
            })
        );
        assert_eq!(store.admit_frame(&frame(1, 1)).unwrap(), FrameAdmissionV2::Stale);
    }

    #[test]
    fn device_loss_reset_retains_no_stale_resource_handles() {
        let mut store = RenderResourceStoreV2::default();
        let first = RenderResourceBatchV2::create(
            1,
            1,
            vec![RenderResourceOperationV2::UpsertMaterial(material(
                1,
                1,
                RenderBlendModeV2::Opaque,
            ))],
        )
        .unwrap();
        store.apply_resource_batch(&first).unwrap();
        store.reset(2);
        assert_eq!(store.diagnostics().material_count, 0);
        assert_eq!(store.diagnostics().resource_revision, 0);
    }
}
