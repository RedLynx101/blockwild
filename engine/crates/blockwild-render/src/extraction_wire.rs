//! Canonical little-endian wire encoding for renderer resource deltas and frames.

use blockwild_types::CanonicalHash;

use crate::{
    RENDER_EXTRACTION_SCHEMA_V2, RenderBlendModeV2, RenderBoundsV2, RenderCameraV2, RenderEnvironmentV2,
    RenderExtractionError, RenderFrameInputV2, RenderFrameV2, RenderGeometryKindV2, RenderGeometryV2,
    RenderInstanceDomainV2, RenderInstanceV2, RenderMaterialV2, RenderParticleV2, RenderResourceBatchV2,
    RenderResourceId, RenderResourceOperationV2, RenderShadingModelV2, RenderTransformV2,
};

const RESOURCE_MAGIC: [u8; 4] = *b"BWRD";
const FRAME_MAGIC: [u8; 4] = *b"BWRF";
const MAX_WIRE_BYTES: usize = 256 * 1024 * 1024;

pub fn encode_render_resource_batch_v2(value: &RenderResourceBatchV2) -> Result<Vec<u8>, RenderExtractionError> {
    value.validate()?;
    let mut writer = Writer::new();
    writer.bytes_raw(&RESOURCE_MAGIC);
    writer.u16(value.schema);
    writer.u16(0);
    writer.u64(value.epoch);
    writer.u64(value.revision);
    writer.u32(length_u32(value.operations.len(), "resource operation count")?);
    writer.hash(value.batch_hash);
    for operation in &value.operations {
        match operation {
            RenderResourceOperationV2::UpsertMaterial(material) => {
                writer.u8(0);
                writer.material(material);
            }
            RenderResourceOperationV2::UpsertGeometry(geometry) => {
                writer.u8(1);
                writer.geometry(geometry)?;
            }
            RenderResourceOperationV2::RemoveMaterial(id) => {
                writer.u8(2);
                writer.u64(id.0);
            }
            RenderResourceOperationV2::RemoveGeometry(id) => {
                writer.u8(3);
                writer.u64(id.0);
            }
        }
    }
    writer.finish()
}

pub fn decode_render_resource_batch_v2(bytes: &[u8]) -> Result<RenderResourceBatchV2, RenderExtractionError> {
    let mut reader = Reader::new(bytes)?;
    reader.magic(RESOURCE_MAGIC)?;
    let schema = reader.u16()?;
    if schema != RENDER_EXTRACTION_SCHEMA_V2 {
        return Err(RenderExtractionError::UnsupportedSchema(schema));
    }
    if reader.u16()? != 0 {
        return Err(RenderExtractionError::InvalidRecord(
            "resource wire reserved bits are nonzero",
        ));
    }
    let epoch = reader.u64()?;
    let revision = reader.u64()?;
    let count = reader.length("resource operation count")?;
    let expected_hash = reader.hash()?;
    let mut operations = Vec::with_capacity(count);
    for _ in 0..count {
        operations.push(match reader.u8()? {
            0 => RenderResourceOperationV2::UpsertMaterial(reader.material()?),
            1 => RenderResourceOperationV2::UpsertGeometry(reader.geometry()?),
            2 => RenderResourceOperationV2::RemoveMaterial(RenderResourceId(reader.u64()?)),
            3 => RenderResourceOperationV2::RemoveGeometry(RenderResourceId(reader.u64()?)),
            _ => {
                return Err(RenderExtractionError::InvalidRecord(
                    "unknown render resource operation",
                ));
            }
        });
    }
    reader.finish()?;
    let result = RenderResourceBatchV2::create(epoch, revision, operations)?;
    if result.batch_hash != expected_hash {
        return Err(RenderExtractionError::HashMismatch("resource wire"));
    }
    Ok(result)
}

pub fn encode_render_frame_v2(value: &RenderFrameV2) -> Result<Vec<u8>, RenderExtractionError> {
    value.validate()?;
    let mut writer = Writer::new();
    writer.bytes_raw(&FRAME_MAGIC);
    writer.u16(value.schema);
    writer.u16(0);
    writer.u64(value.epoch);
    writer.u64(value.frame_sequence);
    writer.u64(value.simulation_tick);
    writer.u64(value.animation_time_micros);
    writer.u64(value.resource_revision);
    writer.hash(value.frame_hash);
    writer.camera(value.camera);
    writer.environment(value.environment);
    writer.u32(length_u32(value.instances.len(), "instance count")?);
    for instance in &value.instances {
        writer.instance(instance);
    }
    writer.u32(length_u32(value.particles.len(), "particle count")?);
    for particle in &value.particles {
        writer.particle(*particle);
    }
    writer.finish()
}

pub fn decode_render_frame_v2(bytes: &[u8]) -> Result<RenderFrameV2, RenderExtractionError> {
    let mut reader = Reader::new(bytes)?;
    reader.magic(FRAME_MAGIC)?;
    let schema = reader.u16()?;
    if schema != RENDER_EXTRACTION_SCHEMA_V2 {
        return Err(RenderExtractionError::UnsupportedSchema(schema));
    }
    if reader.u16()? != 0 {
        return Err(RenderExtractionError::InvalidRecord(
            "frame wire reserved bits are nonzero",
        ));
    }
    let epoch = reader.u64()?;
    let frame_sequence = reader.u64()?;
    let simulation_tick = reader.u64()?;
    let animation_time_micros = reader.u64()?;
    let resource_revision = reader.u64()?;
    let expected_hash = reader.hash()?;
    let camera = reader.camera()?;
    let environment = reader.environment()?;
    let instance_count = reader.length("instance count")?;
    let mut instances = Vec::with_capacity(instance_count);
    for _ in 0..instance_count {
        instances.push(reader.instance()?);
    }
    let particle_count = reader.length("particle count")?;
    let mut particles = Vec::with_capacity(particle_count);
    for _ in 0..particle_count {
        particles.push(reader.particle()?);
    }
    reader.finish()?;
    let result = RenderFrameV2::create(RenderFrameInputV2 {
        epoch,
        frame_sequence,
        simulation_tick,
        animation_time_micros,
        resource_revision,
        camera,
        environment,
        instances,
        particles,
    })?;
    if result.frame_hash != expected_hash {
        return Err(RenderExtractionError::HashMismatch("frame wire"));
    }
    Ok(result)
}

struct Writer {
    bytes: Vec<u8>,
}

impl Writer {
    fn new() -> Self {
        Self { bytes: Vec::new() }
    }

    fn finish(self) -> Result<Vec<u8>, RenderExtractionError> {
        if self.bytes.len() > MAX_WIRE_BYTES {
            return Err(RenderExtractionError::LimitExceeded("render wire byte length"));
        }
        Ok(self.bytes)
    }

    fn bytes_raw(&mut self, bytes: &[u8]) {
        self.bytes.extend_from_slice(bytes);
    }

    fn u8(&mut self, value: u8) {
        self.bytes.push(value);
    }

    fn u16(&mut self, value: u16) {
        self.bytes.extend_from_slice(&value.to_le_bytes());
    }

    fn u32(&mut self, value: u32) {
        self.bytes.extend_from_slice(&value.to_le_bytes());
    }

    fn i32(&mut self, value: i32) {
        self.bytes.extend_from_slice(&value.to_le_bytes());
    }

    fn u64(&mut self, value: u64) {
        self.bytes.extend_from_slice(&value.to_le_bytes());
    }

    fn f32(&mut self, value: f32) {
        self.u32((if value == 0.0 { 0.0 } else { value }).to_bits());
    }

    fn hash(&mut self, value: CanonicalHash) {
        self.bytes_raw(value.as_bytes());
    }

    fn material(&mut self, value: &RenderMaterialV2) {
        self.u64(value.id.0);
        self.u32(value.revision);
        self.u8(value.shading as u8);
        self.u8(value.blend as u8);
        self.bytes_raw(&value.base_color_rgba8);
        self.bytes_raw(&value.emissive_rgb8);
        self.u8(u8::from(value.double_sided) | (u8::from(value.depth_write) << 1));
        self.f32(value.emissive_strength);
        self.f32(value.roughness);
        self.f32(value.metalness);
        self.f32(value.alpha_cutoff);
        self.u16(value.atlas_tile.unwrap_or(u16::MAX));
    }

    fn bounds(&mut self, value: RenderBoundsV2) {
        for component in value.minimum.into_iter().chain(value.maximum) {
            self.f32(component);
        }
    }

    fn geometry(&mut self, value: &RenderGeometryV2) -> Result<(), RenderExtractionError> {
        self.u64(value.id.0);
        self.u32(value.revision);
        self.u8(value.kind as u8);
        self.bytes_raw(&[0; 3]);
        self.bounds(value.bounds);
        self.f32s(&value.positions)?;
        self.i8s(&value.normals)?;
        self.u8s(&value.colors)?;
        self.u8s(&value.lights)?;
        self.u8s(&value.emissions)?;
        self.u8s(&value.occlusions)?;
        self.u16s(&value.uvs)?;
        self.u32s(&value.indices)?;
        Ok(())
    }

    fn f32s(&mut self, values: &[f32]) -> Result<(), RenderExtractionError> {
        self.u32(length_u32(values.len(), "f32 stream length")?);
        for value in values {
            self.f32(*value);
        }
        Ok(())
    }

    fn i8s(&mut self, values: &[i8]) -> Result<(), RenderExtractionError> {
        self.u32(length_u32(values.len(), "i8 stream length")?);
        self.bytes.extend(values.iter().map(|value| *value as u8));
        Ok(())
    }

    fn u8s(&mut self, values: &[u8]) -> Result<(), RenderExtractionError> {
        self.u32(length_u32(values.len(), "u8 stream length")?);
        self.bytes_raw(values);
        Ok(())
    }

    fn u16s(&mut self, values: &[u16]) -> Result<(), RenderExtractionError> {
        self.u32(length_u32(values.len(), "u16 stream length")?);
        for value in values {
            self.u16(*value);
        }
        Ok(())
    }

    fn u32s(&mut self, values: &[u32]) -> Result<(), RenderExtractionError> {
        self.u32(length_u32(values.len(), "u32 stream length")?);
        for value in values {
            self.u32(*value);
        }
        Ok(())
    }

    fn camera(&mut self, value: RenderCameraV2) {
        for component in value.position.into_iter().chain(value.orientation) {
            self.f32(component);
        }
        self.f32(value.vertical_fov_radians);
        self.f32(value.near);
        self.f32(value.far);
        self.u32(value.viewport[0]);
        self.u32(value.viewport[1]);
    }

    fn environment(&mut self, value: RenderEnvironmentV2) {
        self.bytes_raw(&value.clear_rgba8);
        self.bytes_raw(&value.ambient_rgb8);
        self.f32(value.ambient_intensity);
        for component in value.sun_direction {
            self.f32(component);
        }
        self.bytes_raw(&value.sun_rgb8);
        self.f32(value.sun_intensity);
        self.bytes_raw(&value.fog_rgb8);
        self.f32(value.fog_near);
        self.f32(value.fog_far);
        self.f32(value.underwater);
        self.f32(value.cave_occlusion);
    }

    fn transform(&mut self, value: RenderTransformV2) {
        for component in value.translation.into_iter().chain(value.rotation).chain(value.scale) {
            self.f32(component);
        }
    }

    fn instance(&mut self, value: &RenderInstanceV2) {
        self.u64(value.stable_id);
        self.u8(value.domain as u8);
        self.bytes_raw(&[0; 3]);
        self.u64(value.geometry.0);
        self.u64(value.material.0);
        self.u64(value.parent.unwrap_or_default());
        self.transform(value.transform);
        self.bytes_raw(&value.tint_rgba8);
        self.u32(value.visibility_mask);
        self.i32(value.sort_key);
        self.u32(value.animation_flags);
    }

    fn particle(&mut self, value: RenderParticleV2) {
        self.u64(value.stable_id);
        self.u64(value.material.0);
        for component in value.position.into_iter().chain(value.velocity) {
            self.f32(component);
        }
        self.f32(value.size);
        self.f32(value.rotation);
        self.bytes_raw(&value.color_rgba8);
        self.f32(value.age_seconds);
        self.f32(value.lifetime_seconds);
    }
}

struct Reader<'a> {
    bytes: &'a [u8],
    cursor: usize,
}

impl<'a> Reader<'a> {
    fn new(bytes: &'a [u8]) -> Result<Self, RenderExtractionError> {
        if bytes.len() > MAX_WIRE_BYTES {
            return Err(RenderExtractionError::LimitExceeded("render wire byte length"));
        }
        Ok(Self { bytes, cursor: 0 })
    }

    fn finish(&self) -> Result<(), RenderExtractionError> {
        if self.cursor == self.bytes.len() {
            Ok(())
        } else {
            Err(RenderExtractionError::InvalidRecord("render wire has trailing bytes"))
        }
    }

    fn take(&mut self, length: usize) -> Result<&'a [u8], RenderExtractionError> {
        let end = self
            .cursor
            .checked_add(length)
            .filter(|end| *end <= self.bytes.len())
            .ok_or(RenderExtractionError::InvalidRecord("render wire is truncated"))?;
        let result = &self.bytes[self.cursor..end];
        self.cursor = end;
        Ok(result)
    }

    fn magic(&mut self, expected: [u8; 4]) -> Result<(), RenderExtractionError> {
        if self.take(4)? == expected {
            Ok(())
        } else {
            Err(RenderExtractionError::InvalidRecord("render wire magic is invalid"))
        }
    }

    fn u8(&mut self) -> Result<u8, RenderExtractionError> {
        Ok(self.take(1)?[0])
    }

    fn u16(&mut self) -> Result<u16, RenderExtractionError> {
        Ok(u16::from_le_bytes(self.take(2)?.try_into().expect("exact length")))
    }

    fn u32(&mut self) -> Result<u32, RenderExtractionError> {
        Ok(u32::from_le_bytes(self.take(4)?.try_into().expect("exact length")))
    }

    fn i32(&mut self) -> Result<i32, RenderExtractionError> {
        Ok(i32::from_le_bytes(self.take(4)?.try_into().expect("exact length")))
    }

    fn u64(&mut self) -> Result<u64, RenderExtractionError> {
        Ok(u64::from_le_bytes(self.take(8)?.try_into().expect("exact length")))
    }

    fn f32(&mut self) -> Result<f32, RenderExtractionError> {
        Ok(f32::from_bits(self.u32()?))
    }

    fn hash(&mut self) -> Result<CanonicalHash, RenderExtractionError> {
        Ok(CanonicalHash(self.take(16)?.try_into().expect("exact length")))
    }

    fn length(&mut self, label: &'static str) -> Result<usize, RenderExtractionError> {
        usize::try_from(self.u32()?).map_err(|_| RenderExtractionError::LimitExceeded(label))
    }

    fn material(&mut self) -> Result<RenderMaterialV2, RenderExtractionError> {
        let id = RenderResourceId(self.u64()?);
        let revision = self.u32()?;
        let shading = match self.u8()? {
            0 => RenderShadingModelV2::Unlit,
            1 => RenderShadingModelV2::BlockLambert,
            2 => RenderShadingModelV2::Standard,
            3 => RenderShadingModelV2::Sky,
            4 => RenderShadingModelV2::Particle,
            _ => return Err(RenderExtractionError::InvalidRecord("unknown render shading model")),
        };
        let blend = match self.u8()? {
            0 => RenderBlendModeV2::Opaque,
            1 => RenderBlendModeV2::AlphaClip,
            2 => RenderBlendModeV2::AlphaBlend,
            3 => RenderBlendModeV2::Additive,
            4 => RenderBlendModeV2::Water,
            _ => return Err(RenderExtractionError::InvalidRecord("unknown render blend mode")),
        };
        let base_color_rgba8 = self.take(4)?.try_into().expect("exact length");
        let emissive_rgb8 = self.take(3)?.try_into().expect("exact length");
        let flags = self.u8()?;
        if flags & !0b11 != 0 {
            return Err(RenderExtractionError::InvalidRecord("unknown material flags"));
        }
        let emissive_strength = self.f32()?;
        let roughness = self.f32()?;
        let metalness = self.f32()?;
        let alpha_cutoff = self.f32()?;
        let tile = self.u16()?;
        Ok(RenderMaterialV2 {
            id,
            revision,
            shading,
            blend,
            base_color_rgba8,
            emissive_rgb8,
            emissive_strength,
            roughness,
            metalness,
            alpha_cutoff,
            atlas_tile: (tile != u16::MAX).then_some(tile),
            double_sided: flags & 1 != 0,
            depth_write: flags & 2 != 0,
        })
    }

    fn bounds(&mut self) -> Result<RenderBoundsV2, RenderExtractionError> {
        Ok(RenderBoundsV2 {
            minimum: [self.f32()?, self.f32()?, self.f32()?],
            maximum: [self.f32()?, self.f32()?, self.f32()?],
        })
    }

    fn geometry(&mut self) -> Result<RenderGeometryV2, RenderExtractionError> {
        let id = RenderResourceId(self.u64()?);
        let revision = self.u32()?;
        let kind = match self.u8()? {
            0 => RenderGeometryKindV2::Terrain,
            1 => RenderGeometryKindV2::Box,
            2 => RenderGeometryKindV2::Plane,
            3 => RenderGeometryKindV2::Sphere,
            4 => RenderGeometryKindV2::Cylinder,
            5 => RenderGeometryKindV2::Cone,
            6 => RenderGeometryKindV2::Torus,
            7 => RenderGeometryKindV2::Octahedron,
            8 => RenderGeometryKindV2::AuthoredMesh,
            _ => return Err(RenderExtractionError::InvalidRecord("unknown render geometry kind")),
        };
        if self.take(3)? != [0; 3] {
            return Err(RenderExtractionError::InvalidRecord(
                "geometry reserved bits are nonzero",
            ));
        }
        Ok(RenderGeometryV2 {
            id,
            revision,
            kind,
            bounds: self.bounds()?,
            positions: self.f32s()?,
            normals: self.i8s()?,
            colors: self.u8s()?,
            lights: self.u8s()?,
            emissions: self.u8s()?,
            occlusions: self.u8s()?,
            uvs: self.u16s()?,
            indices: self.u32s()?,
        })
    }

    fn f32s(&mut self) -> Result<Vec<f32>, RenderExtractionError> {
        let length = self.length("f32 stream length")?;
        (0..length).map(|_| self.f32()).collect()
    }

    fn i8s(&mut self) -> Result<Vec<i8>, RenderExtractionError> {
        let length = self.length("i8 stream length")?;
        Ok(self.take(length)?.iter().map(|value| *value as i8).collect())
    }

    fn u8s(&mut self) -> Result<Vec<u8>, RenderExtractionError> {
        let length = self.length("u8 stream length")?;
        Ok(self.take(length)?.to_vec())
    }

    fn u16s(&mut self) -> Result<Vec<u16>, RenderExtractionError> {
        let length = self.length("u16 stream length")?;
        (0..length).map(|_| self.u16()).collect()
    }

    fn u32s(&mut self) -> Result<Vec<u32>, RenderExtractionError> {
        let length = self.length("u32 stream length")?;
        (0..length).map(|_| self.u32()).collect()
    }

    fn camera(&mut self) -> Result<RenderCameraV2, RenderExtractionError> {
        Ok(RenderCameraV2 {
            position: [self.f32()?, self.f32()?, self.f32()?],
            orientation: [self.f32()?, self.f32()?, self.f32()?, self.f32()?],
            vertical_fov_radians: self.f32()?,
            near: self.f32()?,
            far: self.f32()?,
            viewport: [self.u32()?, self.u32()?],
        })
    }

    fn environment(&mut self) -> Result<RenderEnvironmentV2, RenderExtractionError> {
        Ok(RenderEnvironmentV2 {
            clear_rgba8: self.take(4)?.try_into().expect("exact length"),
            ambient_rgb8: self.take(3)?.try_into().expect("exact length"),
            ambient_intensity: self.f32()?,
            sun_direction: [self.f32()?, self.f32()?, self.f32()?],
            sun_rgb8: self.take(3)?.try_into().expect("exact length"),
            sun_intensity: self.f32()?,
            fog_rgb8: self.take(3)?.try_into().expect("exact length"),
            fog_near: self.f32()?,
            fog_far: self.f32()?,
            underwater: self.f32()?,
            cave_occlusion: self.f32()?,
        })
    }

    fn transform(&mut self) -> Result<RenderTransformV2, RenderExtractionError> {
        Ok(RenderTransformV2 {
            translation: [self.f32()?, self.f32()?, self.f32()?],
            rotation: [self.f32()?, self.f32()?, self.f32()?, self.f32()?],
            scale: [self.f32()?, self.f32()?, self.f32()?],
        })
    }

    fn instance(&mut self) -> Result<RenderInstanceV2, RenderExtractionError> {
        let stable_id = self.u64()?;
        let domain = match self.u8()? {
            0 => RenderInstanceDomainV2::Terrain,
            1 => RenderInstanceDomainV2::Creature,
            2 => RenderInstanceDomainV2::Player,
            3 => RenderInstanceDomainV2::Item,
            4 => RenderInstanceDomainV2::Prop,
            5 => RenderInstanceDomainV2::Machine,
            6 => RenderInstanceDomainV2::Projectile,
            7 => RenderInstanceDomainV2::Vehicle,
            8 => RenderInstanceDomainV2::Effect,
            _ => return Err(RenderExtractionError::InvalidRecord("unknown render instance domain")),
        };
        if self.take(3)? != [0; 3] {
            return Err(RenderExtractionError::InvalidRecord(
                "instance reserved bits are nonzero",
            ));
        }
        let geometry = RenderResourceId(self.u64()?);
        let material = RenderResourceId(self.u64()?);
        let parent = self.u64()?;
        Ok(RenderInstanceV2 {
            stable_id,
            domain,
            geometry,
            material,
            parent: (parent != 0).then_some(parent),
            transform: self.transform()?,
            tint_rgba8: self.take(4)?.try_into().expect("exact length"),
            visibility_mask: self.u32()?,
            sort_key: self.i32()?,
            animation_flags: self.u32()?,
        })
    }

    fn particle(&mut self) -> Result<RenderParticleV2, RenderExtractionError> {
        Ok(RenderParticleV2 {
            stable_id: self.u64()?,
            material: RenderResourceId(self.u64()?),
            position: [self.f32()?, self.f32()?, self.f32()?],
            velocity: [self.f32()?, self.f32()?, self.f32()?],
            size: self.f32()?,
            rotation: self.f32()?,
            color_rgba8: self.take(4)?.try_into().expect("exact length"),
            age_seconds: self.f32()?,
            lifetime_seconds: self.f32()?,
        })
    }
}

fn length_u32(length: usize, label: &'static str) -> Result<u32, RenderExtractionError> {
    u32::try_from(length).map_err(|_| RenderExtractionError::LimitExceeded(label))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{RenderInstanceDomainV2, RenderShadingModelV2};

    fn material() -> RenderMaterialV2 {
        RenderMaterialV2 {
            id: RenderResourceId(2),
            revision: 3,
            shading: RenderShadingModelV2::Standard,
            blend: RenderBlendModeV2::AlphaClip,
            base_color_rgba8: [1, 2, 3, 4],
            emissive_rgb8: [5, 6, 7],
            emissive_strength: 0.5,
            roughness: 0.7,
            metalness: 0.2,
            alpha_cutoff: 0.4,
            atlas_tile: Some(12),
            double_sided: true,
            depth_write: false,
        }
    }

    fn frame() -> RenderFrameV2 {
        RenderFrameV2::create(RenderFrameInputV2 {
            epoch: 1,
            frame_sequence: 2,
            simulation_tick: 3,
            animation_time_micros: 4,
            resource_revision: 5,
            camera: RenderCameraV2 {
                position: [0.0, 2.0, 4.0],
                orientation: [0.0, 0.0, 0.0, 1.0],
                vertical_fov_radians: 0.9,
                near: 0.05,
                far: 512.0,
                viewport: [1280, 720],
            },
            environment: RenderEnvironmentV2 {
                clear_rgba8: [1, 2, 3, 255],
                ambient_rgb8: [4, 5, 6],
                ambient_intensity: 0.7,
                sun_direction: [0.0, 1.0, 0.0],
                sun_rgb8: [255, 240, 200],
                sun_intensity: 1.0,
                fog_rgb8: [20, 30, 40],
                fog_near: 20.0,
                fog_far: 100.0,
                underwater: 0.0,
                cave_occlusion: 0.0,
            },
            instances: vec![RenderInstanceV2 {
                stable_id: 8,
                domain: RenderInstanceDomainV2::Creature,
                geometry: RenderResourceId(9),
                material: RenderResourceId(2),
                parent: None,
                transform: RenderTransformV2::identity(),
                tint_rgba8: [255; 4],
                visibility_mask: u32::MAX,
                sort_key: -4,
                animation_flags: 12,
            }],
            particles: vec![RenderParticleV2 {
                stable_id: 10,
                material: RenderResourceId(2),
                position: [1.0, 2.0, 3.0],
                velocity: [0.0, 1.0, 0.0],
                size: 0.2,
                rotation: 0.5,
                color_rgba8: [8, 9, 10, 11],
                age_seconds: 0.1,
                lifetime_seconds: 2.0,
            }],
        })
        .unwrap()
    }

    #[test]
    fn resource_wire_round_trips_and_rejects_corruption() {
        let batch = RenderResourceBatchV2::create(
            3,
            7,
            vec![
                RenderResourceOperationV2::UpsertMaterial(material()),
                RenderResourceOperationV2::RemoveGeometry(RenderResourceId(91)),
            ],
        )
        .unwrap();
        let bytes = encode_render_resource_batch_v2(&batch).unwrap();
        assert_eq!(decode_render_resource_batch_v2(&bytes).unwrap(), batch);
        let mut corrupted = bytes;
        let last = corrupted.len() - 1;
        corrupted[last] ^= 0x40;
        assert!(decode_render_resource_batch_v2(&corrupted).is_err());
    }

    #[test]
    fn frame_wire_round_trips_exactly() {
        let expected = frame();
        let bytes = encode_render_frame_v2(&expected).unwrap();
        let actual = decode_render_frame_v2(&bytes).unwrap();
        assert_eq!(actual, expected);
    }

    #[test]
    fn wire_rejects_trailing_and_truncated_payloads() {
        let bytes = encode_render_frame_v2(&frame()).unwrap();
        let mut trailing = bytes.clone();
        trailing.push(0);
        assert!(decode_render_frame_v2(&trailing).is_err());
        assert!(decode_render_frame_v2(&bytes[..bytes.len() - 1]).is_err());
    }
}
