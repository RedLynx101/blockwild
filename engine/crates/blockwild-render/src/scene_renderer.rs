//! Integrated offscreen `wgpu` scene renderer for extraction V2.
//!
//! The renderer owns GPU buffers and pipelines. It accepts only validated
//! resource deltas and frames; it never reads or mutates simulation state.

use std::collections::BTreeMap;
#[cfg(not(target_arch = "wasm32"))]
use std::sync::mpsc;
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
#[cfg(not(target_arch = "wasm32"))]
use std::time::Duration;

use wgpu::util::DeviceExt;

use crate::{
    BLOCK_ATLAS_TEXTURE_ID_V2, FrameAdmissionV2, PreparedFrameSummaryV2, RenderBlendModeV2, RenderExtractionError,
    RenderFrameInputV2, RenderFrameV2, RenderGeometryKindV2, RenderGeometryV2, RenderInstanceDomainV2,
    RenderInstanceV2, RenderMaterialV2, RenderResourceBatchV2, RenderResourceId, RenderResourceOperationV2,
    RenderResourceStoreV2, RenderShadingModelV2, RenderTextureAnimationV2, RenderTextureColorSpaceV2,
    RenderTextureFilterV2, RenderTextureMipmapFilterV2, RenderTextureOriginV2, RenderTextureUvModeV2, RenderTextureV2,
    RenderTextureWrapV2, RenderTransformV2,
};

const SCENE_SHADER: &str = include_str!("scene.wgsl");
const OFFSCREEN_COLOR_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8UnormSrgb;
const DEPTH_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Depth24Plus;
const GPU_VERTEX_FLOATS: usize = 18;
const GPU_VERTEX_STRIDE: u64 = (GPU_VERTEX_FLOATS * size_of::<f32>()) as u64;
const GPU_INSTANCE_FLOATS: usize = 20;
const GPU_INSTANCE_STRIDE: u64 = (GPU_INSTANCE_FLOATS * size_of::<f32>()) as u64;
const PARTICLE_GEOMETRY_ID_V2: RenderResourceId = RenderResourceId(u64::MAX);

pub const RENDER_ANIMATION_BOB_V2: u32 = 1 << 0;
pub const RENDER_ANIMATION_SPIN_V2: u32 = 1 << 1;
pub const RENDER_ANIMATION_FLAP_V2: u32 = 1 << 2;
pub const RENDER_ANIMATION_SWAY_V2: u32 = 1 << 3;
pub const RENDER_ANIMATION_PULSE_V2: u32 = 1 << 4;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum WgpuSceneStatusV2 {
    Ready,
    AdapterUnavailable,
    DeviceUnavailable,
    ValidationFailed,
    ReadbackFailed,
}

#[derive(Clone, Debug, PartialEq)]
pub struct WgpuSceneDiagnosticsV2 {
    pub status: WgpuSceneStatusV2,
    pub backend: String,
    pub adapter: String,
    pub driver: String,
    pub width: u32,
    pub height: u32,
    pub submitted_frames: u64,
    pub draw_calls: u32,
    pub visible_instances: u32,
    pub culled_instances: u32,
    pub transparent_draw_calls: u32,
    pub uploaded_geometry_bytes: u64,
    pub uploaded_texture_bytes: u64,
    pub uploaded_instance_bytes: u64,
    pub resident_geometry_bytes: u64,
    pub resident_texture_bytes: u64,
    pub resident_instance_buffer_bytes: u64,
    pub instance_buffer_reallocations: u32,
    pub device_lost: bool,
    pub prepared: PreparedFrameSummaryV2,
    pub message: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct WgpuSceneArtifactV2 {
    pub diagnostics: WgpuSceneDiagnosticsV2,
    pub rgba8: Vec<u8>,
}

struct GpuGeometry {
    vertex: wgpu::Buffer,
    index: wgpu::Buffer,
    index_count: u32,
}

struct GpuMaterial {
    bind_group: wgpu::BindGroup,
    blend: RenderBlendModeV2,
    double_sided: bool,
    depth_write: bool,
}

struct GpuTexture {
    _texture: wgpu::Texture,
    view: wgpu::TextureView,
    sampler: wgpu::Sampler,
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
struct PipelineKey {
    blend: u8,
    double_sided: bool,
    depth_write: bool,
}

pub struct WgpuSceneRendererV2 {
    device: wgpu::Device,
    queue: wgpu::Queue,
    info: wgpu::AdapterInfo,
    width: u32,
    height: u32,
    color_format: wgpu::TextureFormat,
    target: wgpu::Texture,
    depth: wgpu::Texture,
    depth_view: wgpu::TextureView,
    readback: Option<wgpu::Buffer>,
    camera_buffer: wgpu::Buffer,
    instance_buffer: wgpu::Buffer,
    instance_capacity_bytes: u64,
    instance_buffer_reallocations: u32,
    camera_bind_group: wgpu::BindGroup,
    material_layout: wgpu::BindGroupLayout,
    pipeline_layout: wgpu::PipelineLayout,
    shader: wgpu::ShaderModule,
    pipelines: BTreeMap<PipelineKey, wgpu::RenderPipeline>,
    geometries: BTreeMap<RenderResourceId, GpuGeometry>,
    materials: BTreeMap<RenderResourceId, GpuMaterial>,
    textures: BTreeMap<RenderResourceId, GpuTexture>,
    fallback_texture: GpuTexture,
    resources: RenderResourceStoreV2,
    submitted_frames: u64,
    uploaded_geometry_bytes: u64,
    uploaded_texture_bytes: u64,
    device_lost: Arc<AtomicBool>,
}

struct DrawGroupV2 {
    geometry: RenderResourceId,
    material: RenderResourceId,
    first_instance: u32,
    instance_count: u32,
}

#[derive(Default)]
struct DrawPlanV2 {
    bytes: Vec<u8>,
    groups: Vec<DrawGroupV2>,
    visible_instances: u32,
    culled_instances: u32,
    transparent_draw_calls: u32,
}

struct PlannedInstanceV2 {
    stable_id: u64,
    geometry: RenderResourceId,
    material: RenderResourceId,
    sort_key: i32,
    matrix: [f32; 16],
    tint_rgba8: [u8; 4],
    depth_squared: f32,
}

/// Small but representative extraction fixture used by native, browser, and
/// Three.js comparison harnesses. It covers opaque, emissive, and water paths
/// without depending on gameplay or renderer-owned scene objects.
pub fn canonical_integrated_scene_v2(
    width: u32,
    height: u32,
) -> Result<(RenderResourceBatchV2, RenderFrameV2), RenderExtractionError> {
    let geometry = unit_box_geometry_v2(RenderResourceId(10), 1);
    let materials = [
        material_fixture_v2(
            RenderResourceId(1),
            RenderBlendModeV2::Opaque,
            [88, 137, 72, 255],
            [0; 3],
            0.0,
        ),
        material_fixture_v2(
            RenderResourceId(2),
            RenderBlendModeV2::Water,
            [46, 125, 190, 164],
            [12, 45, 78],
            0.1,
        ),
        material_fixture_v2(
            RenderResourceId(3),
            RenderBlendModeV2::Opaque,
            [227, 183, 70, 255],
            [255, 176, 58],
            0.85,
        ),
        material_fixture_v2(
            RenderResourceId(4),
            RenderBlendModeV2::Opaque,
            [48, 105, 84, 255],
            [0; 3],
            0.0,
        ),
    ];
    let resources = RenderResourceBatchV2::create(
        1,
        1,
        materials
            .into_iter()
            .map(RenderResourceOperationV2::UpsertMaterial)
            .chain([RenderResourceOperationV2::UpsertGeometry(geometry)])
            .collect(),
    )?;
    let make_instance = |stable_id, material, translation, scale, sort_key| RenderInstanceV2 {
        stable_id,
        domain: if stable_id == 100 {
            RenderInstanceDomainV2::Terrain
        } else {
            RenderInstanceDomainV2::Creature
        },
        geometry: RenderResourceId(10),
        material: RenderResourceId(material),
        parent: None,
        transform: RenderTransformV2 {
            translation,
            rotation: [0.0, 0.0, 0.0, 1.0],
            scale,
        },
        tint_rgba8: [255; 4],
        visibility_mask: u32::MAX,
        sort_key,
        animation_flags: 0,
    };
    let angle = -0.16_f32;
    let frame = RenderFrameV2::create(RenderFrameInputV2 {
        epoch: 1,
        frame_sequence: 1,
        simulation_tick: 1,
        animation_time_micros: 0,
        resource_revision: 1,
        camera: crate::RenderCameraV2 {
            position: [0.0, 2.45, 6.8],
            orientation: [angle.sin(), 0.0, 0.0, angle.cos()],
            vertical_fov_radians: 0.82,
            near: 0.05,
            far: 128.0,
            viewport: [width, height],
        },
        environment: crate::RenderEnvironmentV2 {
            clear_rgba8: [63, 105, 139, 255],
            ambient_rgb8: [176, 191, 190],
            ambient_intensity: 0.72,
            sun_direction: [-0.35, -0.82, -0.25],
            sun_rgb8: [255, 236, 188],
            sun_intensity: 0.88,
            fog_rgb8: [103, 141, 159],
            fog_near: 18.0,
            fog_far: 64.0,
            underwater: 0.0,
            cave_occlusion: 0.0,
            lighting: None,
        },
        instances: vec![
            make_instance(100, 1, [0.0, -0.92, 0.0], [4.4, 0.36, 3.8], 0),
            make_instance(101, 4, [-1.15, 0.0, -0.2], [0.82, 1.2, 0.82], 10),
            make_instance(102, 3, [1.15, 0.15, -0.35], [0.7, 1.5, 0.7], 11),
            make_instance(103, 2, [0.0, -0.55, 0.95], [3.0, 0.14, 1.35], 100),
        ],
        particles: Vec::new(),
    })?;
    Ok((resources, frame))
}

fn material_fixture_v2(
    id: RenderResourceId,
    blend: RenderBlendModeV2,
    base_color_rgba8: [u8; 4],
    emissive_rgb8: [u8; 3],
    emissive_strength: f32,
) -> RenderMaterialV2 {
    RenderMaterialV2 {
        id,
        revision: 1,
        shading: RenderShadingModelV2::BlockLambert,
        blend,
        base_color_rgba8,
        emissive_rgb8,
        emissive_strength,
        roughness: 0.86,
        metalness: 0.0,
        alpha_cutoff: if blend == RenderBlendModeV2::AlphaClip {
            0.5
        } else {
            0.0
        },
        atlas_tile: None,
        texture: None,
        double_sided: blend == RenderBlendModeV2::Water,
        depth_write: !matches!(
            blend,
            RenderBlendModeV2::AlphaBlend | RenderBlendModeV2::Additive | RenderBlendModeV2::Water
        ),
    }
}

pub(crate) fn unit_box_geometry_v2(id: RenderResourceId, revision: u32) -> RenderGeometryV2 {
    let faces = [
        (
            [1.0, 0.0, 0.0],
            [[0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5]],
        ),
        (
            [-1.0, 0.0, 0.0],
            [
                [-0.5, -0.5, 0.5],
                [-0.5, -0.5, -0.5],
                [-0.5, 0.5, -0.5],
                [-0.5, 0.5, 0.5],
            ],
        ),
        (
            [0.0, 1.0, 0.0],
            [[-0.5, 0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]],
        ),
        (
            [0.0, -1.0, 0.0],
            [
                [-0.5, -0.5, 0.5],
                [0.5, -0.5, 0.5],
                [0.5, -0.5, -0.5],
                [-0.5, -0.5, -0.5],
            ],
        ),
        (
            [0.0, 0.0, 1.0],
            [[0.5, -0.5, 0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5]],
        ),
        (
            [0.0, 0.0, -1.0],
            [
                [-0.5, -0.5, -0.5],
                [0.5, -0.5, -0.5],
                [0.5, 0.5, -0.5],
                [-0.5, 0.5, -0.5],
            ],
        ),
    ];
    let mut positions = Vec::with_capacity(72);
    let mut normals = Vec::with_capacity(72);
    let mut colors = Vec::with_capacity(72);
    let mut lights = Vec::with_capacity(96);
    let mut emissions = Vec::with_capacity(24);
    let mut occlusions = Vec::with_capacity(24);
    let mut uvs = Vec::with_capacity(48);
    let mut indices = Vec::with_capacity(36);
    for (face, (normal, corners)) in faces.into_iter().enumerate() {
        let base = u32::try_from(face * 4).expect("box vertex count is bounded");
        for (corner, position) in corners.into_iter().enumerate() {
            positions.extend_from_slice(&position);
            normals.extend(normal.map(|value| (value * 127.0) as i8));
            colors.extend_from_slice(&[255; 3]);
            lights.extend_from_slice(&[255, 0, 0, 0]);
            emissions.push(0);
            occlusions.push(255);
            let uv = match corner {
                0 => [0, 0],
                1 => [u16::MAX, 0],
                2 => [u16::MAX, u16::MAX],
                _ => [0, u16::MAX],
            };
            uvs.extend_from_slice(&uv);
        }
        indices.extend_from_slice(&[base, base + 1, base + 2, base, base + 2, base + 3]);
    }
    RenderGeometryV2 {
        id,
        revision,
        kind: RenderGeometryKindV2::Box,
        bounds: crate::RenderBoundsV2 {
            minimum: [-0.5; 3],
            maximum: [0.5; 3],
        },
        positions,
        normals,
        colors,
        lights,
        emissions,
        occlusions,
        uvs,
        indices,
    }
}

#[cfg(not(target_arch = "wasm32"))]
pub fn canonical_integrated_scene_artifact_blocking(width: u32, height: u32) -> Result<WgpuSceneArtifactV2, String> {
    let (resources, frame) = canonical_integrated_scene_v2(width, height).map_err(|error| error.to_string())?;
    let mut renderer = pollster::block_on(WgpuSceneRendererV2::new_offscreen(width, height))
        .map_err(|diagnostic| diagnostic.message)?;
    renderer
        .apply_resource_batch(&resources)
        .map_err(|error| error.to_string())?;
    renderer.render(&frame).map_err(|error| error.to_string())
}

impl WgpuSceneRendererV2 {
    pub async fn new_offscreen(width: u32, height: u32) -> Result<Self, WgpuSceneDiagnosticsV2> {
        if width == 0 || height == 0 {
            return Err(unavailable(
                WgpuSceneStatusV2::ValidationFailed,
                width,
                height,
                "offscreen dimensions must be nonzero",
            ));
        }
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor::new_without_display_handle());
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                force_fallback_adapter: false,
                compatible_surface: None,
                apply_limit_buckets: false,
            })
            .await
            .map_err(|error| unavailable(WgpuSceneStatusV2::AdapterUnavailable, width, height, error.to_string()))?;
        let info = adapter.get_info();
        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor {
                label: Some("Blockwild integrated scene device"),
                required_features: wgpu::Features::empty(),
                required_limits: wgpu::Limits::downlevel_defaults(),
                memory_hints: wgpu::MemoryHints::MemoryUsage,
                trace: wgpu::Trace::Off,
                experimental_features: wgpu::ExperimentalFeatures::disabled(),
            })
            .await
            .map_err(|error| unavailable(WgpuSceneStatusV2::DeviceUnavailable, width, height, error.to_string()))?;
        Self::from_device(device, queue, info, width, height, OFFSCREEN_COLOR_FORMAT)
            .map_err(|error| unavailable(WgpuSceneStatusV2::ValidationFailed, width, height, error.to_string()))
    }

    /// Construct the shared scene core over a caller-owned adapter/device.
    /// Surface frontends use this to share the exact offscreen pipelines,
    /// resource store, culling, animation, and diagnostics implementation.
    pub fn from_device(
        device: wgpu::Device,
        queue: wgpu::Queue,
        info: wgpu::AdapterInfo,
        width: u32,
        height: u32,
        color_format: wgpu::TextureFormat,
    ) -> Result<Self, RenderExtractionError> {
        if width == 0 || height == 0 {
            return Err(RenderExtractionError::InvalidRecord(
                "render dimensions must be nonzero",
            ));
        }
        let camera_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Blockwild scene camera layout"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });
        let material_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Blockwild scene material layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
            ],
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Blockwild scene pipeline layout"),
            bind_group_layouts: &[Some(&camera_layout), Some(&material_layout)],
            immediate_size: 0,
        });
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Blockwild integrated scene shader"),
            source: wgpu::ShaderSource::Wgsl(SCENE_SHADER.into()),
        });
        let camera_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Blockwild scene camera uniform"),
            size: 240,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let instance_capacity_bytes = GPU_INSTANCE_STRIDE.max(256);
        let instance_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Blockwild persistent instance page"),
            size: instance_capacity_bytes,
            usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let device_lost = Arc::new(AtomicBool::new(false));
        let lost_flag = Arc::clone(&device_lost);
        device.set_device_lost_callback(move |_reason, _message| {
            lost_flag.store(true, Ordering::Release);
        });
        let camera_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Blockwild scene camera bind group"),
            layout: &camera_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: camera_buffer.as_entire_binding(),
            }],
        });
        let (target, depth, depth_view, readback) = create_targets(&device, width, height, color_format);
        let fallback_texture = create_gpu_texture(
            &device,
            &queue,
            &RenderTextureV2 {
                id: BLOCK_ATLAS_TEXTURE_ID_V2,
                revision: 0,
                width: 1,
                height: 1,
                color_space: RenderTextureColorSpaceV2::Srgb,
                filter: RenderTextureFilterV2::Nearest,
                sampler: None,
                atlas: None,
                rgba8: vec![255; 4],
            },
        );
        Ok(Self {
            device,
            queue,
            info,
            width,
            height,
            color_format,
            target,
            depth,
            depth_view,
            readback,
            camera_buffer,
            instance_buffer,
            instance_capacity_bytes,
            instance_buffer_reallocations: 0,
            camera_bind_group,
            material_layout,
            pipeline_layout,
            shader,
            pipelines: BTreeMap::new(),
            geometries: BTreeMap::new(),
            materials: BTreeMap::new(),
            textures: BTreeMap::new(),
            fallback_texture,
            resources: RenderResourceStoreV2::default(),
            submitted_frames: 0,
            uploaded_geometry_bytes: 0,
            uploaded_texture_bytes: 0,
            device_lost,
        })
    }

    pub fn resize(&mut self, width: u32, height: u32) -> Result<(), RenderExtractionError> {
        if width == 0 || height == 0 {
            return Err(RenderExtractionError::InvalidRecord(
                "render target dimensions must be nonzero",
            ));
        }
        if self.width == width && self.height == height {
            return Ok(());
        }
        self.width = width;
        self.height = height;
        let (target, depth, depth_view, readback) = create_targets(&self.device, width, height, self.color_format);
        self.target = target;
        self.depth = depth;
        self.depth_view = depth_view;
        self.readback = readback;
        Ok(())
    }

    pub fn apply_resource_batch(&mut self, batch: &RenderResourceBatchV2) -> Result<bool, RenderExtractionError> {
        if batch.operations.iter().any(|operation| match operation {
            RenderResourceOperationV2::UpsertGeometry(value) => value.id == PARTICLE_GEOMETRY_ID_V2,
            RenderResourceOperationV2::RemoveGeometry(value) => *value == PARTICLE_GEOMETRY_ID_V2,
            RenderResourceOperationV2::UpsertMaterial(_)
            | RenderResourceOperationV2::RemoveMaterial(_)
            | RenderResourceOperationV2::UpsertTexture(_)
            | RenderResourceOperationV2::RemoveTexture(_) => false,
        }) {
            return Err(RenderExtractionError::InvalidRecord(
                "resource batch uses the renderer-reserved particle geometry id",
            ));
        }
        let applied = self.resources.apply_resource_batch(batch)?;
        if !applied {
            return Ok(false);
        }
        let textures_changed = batch.operations.iter().any(|operation| {
            matches!(
                operation,
                RenderResourceOperationV2::UpsertTexture(_) | RenderResourceOperationV2::RemoveTexture(_)
            )
        });
        for operation in &batch.operations {
            match operation {
                RenderResourceOperationV2::UpsertGeometry(value) => self.upload_geometry(value)?,
                RenderResourceOperationV2::RemoveGeometry(id) => {
                    self.geometries.remove(id);
                }
                RenderResourceOperationV2::UpsertTexture(value) => {
                    self.uploaded_texture_bytes = self
                        .uploaded_texture_bytes
                        .saturating_add(u64::try_from(value.byte_length()).unwrap_or(u64::MAX));
                    self.textures
                        .insert(value.id, create_gpu_texture(&self.device, &self.queue, value));
                }
                RenderResourceOperationV2::RemoveTexture(id) => {
                    self.textures.remove(id);
                }
                RenderResourceOperationV2::UpsertMaterial(_) | RenderResourceOperationV2::RemoveMaterial(_) => {}
            }
        }
        if textures_changed {
            let materials = self.resources.materials().cloned().collect::<Vec<_>>();
            for material in &materials {
                self.upload_material(material);
            }
        } else {
            for operation in &batch.operations {
                if let RenderResourceOperationV2::UpsertMaterial(value) = operation {
                    self.upload_material(value);
                }
            }
        }
        for operation in &batch.operations {
            if let RenderResourceOperationV2::RemoveMaterial(id) = operation {
                self.materials.remove(id);
            }
        }
        Ok(true)
    }

    fn upload_geometry(&mut self, geometry: &RenderGeometryV2) -> Result<(), RenderExtractionError> {
        let vertices = interleave_vertices(geometry)?;
        let indices = u32_bytes(&geometry.indices);
        let vertex = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Blockwild scene vertex buffer"),
            contents: &vertices,
            usage: wgpu::BufferUsages::VERTEX,
        });
        let index = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Blockwild scene index buffer"),
            contents: &indices,
            usage: wgpu::BufferUsages::INDEX,
        });
        let byte_length = u64::try_from(vertices.len() + indices.len()).unwrap_or(u64::MAX);
        self.uploaded_geometry_bytes = self.uploaded_geometry_bytes.saturating_add(byte_length);
        self.geometries.insert(
            geometry.id,
            GpuGeometry {
                vertex,
                index,
                index_count: u32::try_from(geometry.indices.len()).unwrap_or(u32::MAX),
            },
        );
        Ok(())
    }

    fn upload_material(&mut self, material: &RenderMaterialV2) {
        let texture_id = material.texture.map(|binding| binding.texture).or_else(|| {
            (material.atlas_tile.is_some() && self.textures.contains_key(&BLOCK_ATLAS_TEXTURE_ID_V2))
                .then_some(BLOCK_ATLAS_TEXTURE_ID_V2)
        });
        let texture = texture_id.and_then(|id| self.textures.get(&id));
        let texture_record = texture_id.and_then(|id| self.resources.texture(id));
        let bytes = material_uniform_bytes(material, texture_record, texture.is_some());
        let texture = texture.unwrap_or(&self.fallback_texture);
        let buffer = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Blockwild scene material uniform"),
            contents: &bytes,
            usage: wgpu::BufferUsages::UNIFORM,
        });
        let bind_group = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Blockwild scene material bind group"),
            layout: &self.material_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(&texture.view),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::Sampler(&texture.sampler),
                },
            ],
        });
        self.materials.insert(
            material.id,
            GpuMaterial {
                bind_group,
                blend: material.blend,
                double_sided: material.double_sided,
                depth_write: material.depth_write,
            },
        );
    }

    pub fn render(&mut self, frame: &RenderFrameV2) -> Result<WgpuSceneArtifactV2, RenderExtractionError> {
        let target_view = self.target.create_view(&wgpu::TextureViewDescriptor::default());
        self.render_to_view_internal(frame, &target_view, true)
    }

    /// Submit an offscreen frame without a readback fence. This is the native
    /// equivalent of browser presentation and is used by sustained renderer
    /// benchmarks; correctness evidence continues to use [`Self::render`].
    pub fn render_present_only(
        &mut self,
        frame: &RenderFrameV2,
    ) -> Result<WgpuSceneDiagnosticsV2, RenderExtractionError> {
        let target_view = self.target.create_view(&wgpu::TextureViewDescriptor::default());
        Ok(self.render_to_view_internal(frame, &target_view, false)?.diagnostics)
    }

    /// Render directly into a configured surface texture. Browser and native
    /// window frontends present that texture after this method submits work.
    pub fn render_to_view(
        &mut self,
        frame: &RenderFrameV2,
        target_view: &wgpu::TextureView,
    ) -> Result<WgpuSceneDiagnosticsV2, RenderExtractionError> {
        Ok(self.render_to_view_internal(frame, target_view, false)?.diagnostics)
    }

    fn render_to_view_internal(
        &mut self,
        frame: &RenderFrameV2,
        target_view: &wgpu::TextureView,
        copy_offscreen_target: bool,
    ) -> Result<WgpuSceneArtifactV2, RenderExtractionError> {
        #[cfg(target_arch = "wasm32")]
        let _ = copy_offscreen_target;
        if !frame.particles.is_empty() && !self.geometries.contains_key(&PARTICLE_GEOMETRY_ID_V2) {
            self.upload_geometry(&unit_box_geometry_v2(PARTICLE_GEOMETRY_ID_V2, 1))?;
        }
        let prepared = match self.resources.admit_frame(frame)? {
            FrameAdmissionV2::Stale => {
                let empty_plan = DrawPlanV2::default();
                return Ok(WgpuSceneArtifactV2 {
                    diagnostics: self.diagnostics(
                        WgpuSceneStatusV2::Ready,
                        &empty_plan,
                        PreparedFrameSummaryV2::default(),
                        "obsolete presentation frame skipped",
                    ),
                    rgba8: Vec::new(),
                });
            }
            FrameAdmissionV2::Accepted(summary) => summary,
        };
        if self.device_lost.load(Ordering::Acquire) {
            return Ok(WgpuSceneArtifactV2 {
                diagnostics: self.diagnostics(
                    WgpuSceneStatusV2::DeviceUnavailable,
                    &DrawPlanV2::default(),
                    prepared,
                    "GPU device was lost; recreate the renderer and replay resource pages",
                ),
                rgba8: Vec::new(),
            });
        }
        self.queue
            .write_buffer(&self.camera_buffer, 0, &camera_uniform_bytes(frame));
        let world = world_matrices(frame)?;
        let plan = build_draw_plan(frame, &world, &self.resources)?;
        self.ensure_instance_capacity(u64::try_from(plan.bytes.len()).unwrap_or(u64::MAX))?;
        if !plan.bytes.is_empty() {
            self.queue.write_buffer(&self.instance_buffer, 0, &plan.bytes);
        }

        #[cfg(not(target_arch = "wasm32"))]
        let validation_scope = self.device.push_error_scope(wgpu::ErrorFilter::Validation);
        let mut encoder = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("Blockwild integrated scene encoder"),
        });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("Blockwild integrated scene pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: target_view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(rgba8_color(frame.environment.clear_rgba8)),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: &self.depth_view,
                    depth_ops: Some(wgpu::Operations {
                        load: wgpu::LoadOp::Clear(1.0),
                        store: wgpu::StoreOp::Store,
                    }),
                    stencil_ops: None,
                }),
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            pass.set_bind_group(0, &self.camera_bind_group, &[]);
            for group in &plan.groups {
                let geometry = self
                    .geometries
                    .get(&group.geometry)
                    .ok_or(RenderExtractionError::MissingResource(group.geometry.0))?;
                let material = self
                    .materials
                    .get(&group.material)
                    .ok_or(RenderExtractionError::MissingResource(group.material.0))?;
                let key = PipelineKey {
                    blend: material.blend as u8,
                    double_sided: material.double_sided,
                    depth_write: material.depth_write,
                };
                if !self.pipelines.contains_key(&key) {
                    let pipeline = create_pipeline(
                        &self.device,
                        &self.shader,
                        &self.pipeline_layout,
                        material.blend,
                        material.double_sided,
                        material.depth_write,
                        self.color_format,
                    );
                    self.pipelines.insert(key, pipeline);
                }
                let pipeline = self.pipelines.get(&key).expect("pipeline inserted");
                pass.set_pipeline(pipeline);
                pass.set_bind_group(1, &material.bind_group, &[]);
                pass.set_vertex_buffer(0, geometry.vertex.slice(..));
                pass.set_vertex_buffer(1, self.instance_buffer.slice(..));
                pass.set_index_buffer(geometry.index.slice(..), wgpu::IndexFormat::Uint32);
                pass.draw_indexed(
                    0..geometry.index_count,
                    0,
                    group.first_instance..group.first_instance.saturating_add(group.instance_count),
                );
            }
        }
        #[cfg(not(target_arch = "wasm32"))]
        if copy_offscreen_target && let Some(readback) = &self.readback {
            encoder.copy_texture_to_buffer(
                wgpu::TexelCopyTextureInfo {
                    texture: &self.target,
                    mip_level: 0,
                    origin: wgpu::Origin3d::ZERO,
                    aspect: wgpu::TextureAspect::All,
                },
                wgpu::TexelCopyBufferInfo {
                    buffer: readback,
                    layout: wgpu::TexelCopyBufferLayout {
                        offset: 0,
                        bytes_per_row: Some(padded_bytes_per_row(self.width)),
                        rows_per_image: Some(self.height),
                    },
                },
                wgpu::Extent3d {
                    width: self.width,
                    height: self.height,
                    depth_or_array_layers: 1,
                },
            );
        }
        let submission = self.queue.submit([encoder.finish()]);
        self.submitted_frames = self.submitted_frames.wrapping_add(1);
        #[cfg(not(target_arch = "wasm32"))]
        let rgba8 = self
            .readback_rgba(submission)
            .map_err(|_| RenderExtractionError::InvalidRecord("wgpu readback failed"))?;
        #[cfg(target_arch = "wasm32")]
        let rgba8 = {
            let _ = submission;
            Vec::new()
        };
        #[cfg(not(target_arch = "wasm32"))]
        let validation = pollster::block_on(validation_scope.pop()).map(|error| error.to_string());
        #[cfg(target_arch = "wasm32")]
        let validation: Option<String> = None;
        if let Some(message) = validation {
            return Ok(WgpuSceneArtifactV2 {
                diagnostics: self.diagnostics(WgpuSceneStatusV2::ValidationFailed, &plan, prepared, message),
                rgba8: Vec::new(),
            });
        }
        Ok(WgpuSceneArtifactV2 {
            diagnostics: self.diagnostics(
                WgpuSceneStatusV2::Ready,
                &plan,
                prepared,
                "integrated extraction frame rendered",
            ),
            rgba8,
        })
    }

    fn ensure_instance_capacity(&mut self, required: u64) -> Result<(), RenderExtractionError> {
        if required <= self.instance_capacity_bytes {
            return Ok(());
        }
        let capacity = required
            .checked_next_power_of_two()
            .ok_or(RenderExtractionError::InvalidRecord(
                "instance buffer capacity overflow",
            ))?;
        self.instance_buffer = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Blockwild persistent instance page"),
            size: capacity,
            usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        self.instance_capacity_bytes = capacity;
        self.instance_buffer_reallocations = self.instance_buffer_reallocations.saturating_add(1);
        Ok(())
    }

    fn diagnostics(
        &self,
        status: WgpuSceneStatusV2,
        plan: &DrawPlanV2,
        prepared: PreparedFrameSummaryV2,
        message: impl Into<String>,
    ) -> WgpuSceneDiagnosticsV2 {
        let resources = self.resources.diagnostics();
        WgpuSceneDiagnosticsV2 {
            status,
            backend: format!("{:?}", self.info.backend),
            adapter: self.info.name.clone(),
            driver: self.info.driver.clone(),
            width: self.width,
            height: self.height,
            submitted_frames: self.submitted_frames,
            draw_calls: u32::try_from(plan.groups.len()).unwrap_or(u32::MAX),
            visible_instances: plan.visible_instances,
            culled_instances: plan.culled_instances,
            transparent_draw_calls: plan.transparent_draw_calls,
            uploaded_geometry_bytes: self.uploaded_geometry_bytes,
            uploaded_texture_bytes: self.uploaded_texture_bytes,
            uploaded_instance_bytes: u64::try_from(plan.bytes.len()).unwrap_or(u64::MAX),
            resident_geometry_bytes: resources.geometry_bytes,
            resident_texture_bytes: resources.texture_bytes,
            resident_instance_buffer_bytes: self.instance_capacity_bytes,
            instance_buffer_reallocations: self.instance_buffer_reallocations,
            device_lost: self.device_lost.load(Ordering::Acquire),
            prepared,
            message: message.into(),
        }
    }

    #[cfg(not(target_arch = "wasm32"))]
    fn readback_rgba(&self, submission: wgpu::SubmissionIndex) -> Result<Vec<u8>, String> {
        let readback = self.readback.as_ref().ok_or("readback buffer is unavailable")?;
        let (sender, receiver) = mpsc::sync_channel(1);
        readback.slice(..).map_async(wgpu::MapMode::Read, move |result| {
            let _ = sender.send(result.map_err(|error| error.to_string()));
        });
        self.device
            .poll(wgpu::PollType::Wait {
                submission_index: Some(submission),
                timeout: Some(Duration::from_secs(10)),
            })
            .map_err(|error| format!("GPU poll failed: {error}"))?;
        receiver
            .recv_timeout(Duration::from_secs(1))
            .map_err(|error| format!("GPU map callback missing: {error}"))??;
        let mapped = readback
            .slice(..)
            .get_mapped_range()
            .map_err(|error| error.to_string())?;
        let padded = usize::try_from(padded_bytes_per_row(self.width)).map_err(|error| error.to_string())?;
        let unpadded = usize::try_from(self.width * 4).map_err(|error| error.to_string())?;
        let mut output = Vec::with_capacity(unpadded * self.height as usize);
        for row in mapped.chunks(padded).take(self.height as usize) {
            output.extend_from_slice(&row[..unpadded]);
        }
        drop(mapped);
        readback.unmap();
        Ok(output)
    }
}

fn unavailable(
    status: WgpuSceneStatusV2,
    width: u32,
    height: u32,
    message: impl Into<String>,
) -> WgpuSceneDiagnosticsV2 {
    WgpuSceneDiagnosticsV2 {
        status,
        backend: "unavailable".into(),
        adapter: String::new(),
        driver: String::new(),
        width,
        height,
        submitted_frames: 0,
        draw_calls: 0,
        visible_instances: 0,
        culled_instances: 0,
        transparent_draw_calls: 0,
        uploaded_geometry_bytes: 0,
        uploaded_texture_bytes: 0,
        uploaded_instance_bytes: 0,
        resident_geometry_bytes: 0,
        resident_texture_bytes: 0,
        resident_instance_buffer_bytes: 0,
        instance_buffer_reallocations: 0,
        device_lost: false,
        prepared: PreparedFrameSummaryV2::default(),
        message: message.into(),
    }
}

fn create_targets(
    device: &wgpu::Device,
    width: u32,
    height: u32,
    color_format: wgpu::TextureFormat,
) -> (wgpu::Texture, wgpu::Texture, wgpu::TextureView, Option<wgpu::Buffer>) {
    let target = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("Blockwild integrated scene color"),
        size: wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: color_format,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
        view_formats: &[],
    });
    let depth = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("Blockwild integrated scene depth"),
        size: wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: DEPTH_FORMAT,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
        view_formats: &[],
    });
    let depth_view = depth.create_view(&wgpu::TextureViewDescriptor::default());
    #[cfg(not(target_arch = "wasm32"))]
    let readback = Some(device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("Blockwild integrated scene readback"),
        size: u64::from(padded_bytes_per_row(width)) * u64::from(height),
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    }));
    #[cfg(target_arch = "wasm32")]
    let readback = None;
    (target, depth, depth_view, readback)
}

fn build_draw_plan(
    frame: &RenderFrameV2,
    world: &BTreeMap<u64, [f32; 16]>,
    resources: &RenderResourceStoreV2,
) -> Result<DrawPlanV2, RenderExtractionError> {
    let view_projection = camera_view_projection(frame);
    let mut opaque = BTreeMap::<(i32, RenderResourceId, RenderResourceId), Vec<PlannedInstanceV2>>::new();
    let mut transparent = Vec::<PlannedInstanceV2>::new();
    let mut plan = DrawPlanV2::default();
    for instance in &frame.instances {
        let matrix = *world
            .get(&instance.stable_id)
            .ok_or(RenderExtractionError::MissingReference("instance world matrix"))?;
        let geometry = resources
            .geometry(instance.geometry)
            .ok_or(RenderExtractionError::MissingResource(instance.geometry.0))?;
        if instance.visibility_mask == 0 || bounds_outside_frustum(geometry, matrix, view_projection) {
            plan.culled_instances = plan.culled_instances.saturating_add(1);
            continue;
        }
        let material = resources
            .material(instance.material)
            .ok_or(RenderExtractionError::MissingResource(instance.material.0))?;
        let center = transform_point(
            matrix,
            [
                (geometry.bounds.minimum[0] + geometry.bounds.maximum[0]) * 0.5,
                (geometry.bounds.minimum[1] + geometry.bounds.maximum[1]) * 0.5,
                (geometry.bounds.minimum[2] + geometry.bounds.maximum[2]) * 0.5,
            ],
        );
        let dx = center[0] - frame.camera.position[0];
        let dy = center[1] - frame.camera.position[1];
        let dz = center[2] - frame.camera.position[2];
        let candidate = PlannedInstanceV2 {
            stable_id: instance.stable_id,
            geometry: instance.geometry,
            material: instance.material,
            sort_key: instance.sort_key,
            matrix,
            tint_rgba8: instance.tint_rgba8,
            depth_squared: dx.mul_add(dx, dy.mul_add(dy, dz * dz)),
        };
        if matches!(
            material.blend,
            RenderBlendModeV2::AlphaBlend | RenderBlendModeV2::Additive | RenderBlendModeV2::Water
        ) {
            transparent.push(candidate);
        } else {
            opaque
                .entry((instance.sort_key, instance.geometry, instance.material))
                .or_default()
                .push(candidate);
        }
    }
    for particle in &frame.particles {
        resources
            .material(particle.material)
            .ok_or(RenderExtractionError::MissingResource(particle.material.0))?;
        let dx = particle.position[0] - frame.camera.position[0];
        let dy = particle.position[1] - frame.camera.position[1];
        let dz = particle.position[2] - frame.camera.position[2];
        let life = (1.0 - particle.age_seconds / particle.lifetime_seconds).clamp(0.0, 1.0);
        let mut tint = particle.color_rgba8;
        tint[3] = (f32::from(tint[3]) * life * life).round().clamp(0.0, 255.0) as u8;
        let half_angle = particle.rotation * 0.5;
        let synthetic = RenderInstanceV2 {
            stable_id: particle.stable_id,
            domain: RenderInstanceDomainV2::Effect,
            geometry: PARTICLE_GEOMETRY_ID_V2,
            material: particle.material,
            parent: None,
            transform: RenderTransformV2 {
                translation: particle.position,
                rotation: [0.0, half_angle.sin(), 0.0, half_angle.cos()],
                scale: [particle.size; 3],
            },
            tint_rgba8: tint,
            visibility_mask: u32::MAX,
            sort_key: i32::MAX,
            animation_flags: 0,
        };
        transparent.push(PlannedInstanceV2 {
            stable_id: particle.stable_id,
            geometry: PARTICLE_GEOMETRY_ID_V2,
            material: particle.material,
            sort_key: i32::MAX,
            matrix: transform_matrix(&synthetic),
            tint_rgba8: tint,
            depth_squared: dx.mul_add(dx, dy.mul_add(dy, dz * dz)),
        });
    }
    for candidates in opaque.values_mut() {
        candidates.sort_by_key(|candidate| candidate.stable_id);
    }
    transparent.sort_by(|left, right| {
        right
            .depth_squared
            .total_cmp(&left.depth_squared)
            .then_with(|| left.sort_key.cmp(&right.sort_key))
            .then_with(|| left.stable_id.cmp(&right.stable_id))
    });

    for ((_sort_key, geometry, material), candidates) in opaque {
        let first_instance = append_instance_candidates(&mut plan.bytes, &candidates);
        plan.groups.push(DrawGroupV2 {
            geometry,
            material,
            first_instance,
            instance_count: u32::try_from(candidates.len()).unwrap_or(u32::MAX),
        });
        plan.visible_instances = plan
            .visible_instances
            .saturating_add(u32::try_from(candidates.len()).unwrap_or(u32::MAX));
    }
    for candidate in transparent {
        let first_instance = append_instance_candidates(&mut plan.bytes, std::slice::from_ref(&candidate));
        plan.groups.push(DrawGroupV2 {
            geometry: candidate.geometry,
            material: candidate.material,
            first_instance,
            instance_count: 1,
        });
        plan.visible_instances = plan.visible_instances.saturating_add(1);
        plan.transparent_draw_calls = plan.transparent_draw_calls.saturating_add(1);
    }
    Ok(plan)
}

fn append_instance_candidates(bytes: &mut Vec<u8>, candidates: &[PlannedInstanceV2]) -> u32 {
    let first = u32::try_from(bytes.len() as u64 / GPU_INSTANCE_STRIDE).unwrap_or(u32::MAX);
    for candidate in candidates {
        for value in candidate.matrix {
            push_f32(bytes, value);
        }
        for value in candidate.tint_rgba8 {
            push_f32(bytes, f32::from(value) / 255.0);
        }
    }
    first
}

fn transform_point(matrix: [f32; 16], point: [f32; 3]) -> [f32; 3] {
    [
        matrix[0].mul_add(
            point[0],
            matrix[4].mul_add(point[1], matrix[8].mul_add(point[2], matrix[12])),
        ),
        matrix[1].mul_add(
            point[0],
            matrix[5].mul_add(point[1], matrix[9].mul_add(point[2], matrix[13])),
        ),
        matrix[2].mul_add(
            point[0],
            matrix[6].mul_add(point[1], matrix[10].mul_add(point[2], matrix[14])),
        ),
    ]
}

fn bounds_outside_frustum(geometry: &RenderGeometryV2, world: [f32; 16], view_projection: [f32; 16]) -> bool {
    let mut clips = [[0.0_f32; 4]; 8];
    let mut index = 0;
    for x in [geometry.bounds.minimum[0], geometry.bounds.maximum[0]] {
        for y in [geometry.bounds.minimum[1], geometry.bounds.maximum[1]] {
            for z in [geometry.bounds.minimum[2], geometry.bounds.maximum[2]] {
                let point = transform_point(world, [x, y, z]);
                clips[index] = transform_homogeneous(view_projection, [point[0], point[1], point[2], 1.0]);
                index += 1;
            }
        }
    }
    (0..6).any(|plane| {
        clips.iter().all(|clip| match plane {
            0 => clip[0] < -clip[3],
            1 => clip[0] > clip[3],
            2 => clip[1] < -clip[3],
            3 => clip[1] > clip[3],
            4 => clip[2] < 0.0,
            _ => clip[2] > clip[3],
        })
    })
}

fn transform_homogeneous(matrix: [f32; 16], point: [f32; 4]) -> [f32; 4] {
    [
        matrix[0].mul_add(
            point[0],
            matrix[4].mul_add(point[1], matrix[8].mul_add(point[2], matrix[12] * point[3])),
        ),
        matrix[1].mul_add(
            point[0],
            matrix[5].mul_add(point[1], matrix[9].mul_add(point[2], matrix[13] * point[3])),
        ),
        matrix[2].mul_add(
            point[0],
            matrix[6].mul_add(point[1], matrix[10].mul_add(point[2], matrix[14] * point[3])),
        ),
        matrix[3].mul_add(
            point[0],
            matrix[7].mul_add(point[1], matrix[11].mul_add(point[2], matrix[15] * point[3])),
        ),
    ]
}

fn create_pipeline(
    device: &wgpu::Device,
    shader: &wgpu::ShaderModule,
    layout: &wgpu::PipelineLayout,
    blend: RenderBlendModeV2,
    double_sided: bool,
    depth_write: bool,
    color_format: wgpu::TextureFormat,
) -> wgpu::RenderPipeline {
    let blend_state = match blend {
        RenderBlendModeV2::Opaque | RenderBlendModeV2::AlphaClip => None,
        RenderBlendModeV2::AlphaBlend | RenderBlendModeV2::Water => Some(wgpu::BlendState::ALPHA_BLENDING),
        RenderBlendModeV2::Additive => Some(wgpu::BlendState {
            color: wgpu::BlendComponent {
                src_factor: wgpu::BlendFactor::SrcAlpha,
                dst_factor: wgpu::BlendFactor::One,
                operation: wgpu::BlendOperation::Add,
            },
            alpha: wgpu::BlendComponent::OVER,
        }),
    };
    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("Blockwild integrated scene pipeline"),
        layout: Some(layout),
        vertex: wgpu::VertexState {
            module: shader,
            entry_point: Some("vertex_main"),
            buffers: &[Some(vertex_layout()), Some(instance_layout())],
            compilation_options: Default::default(),
        },
        fragment: Some(wgpu::FragmentState {
            module: shader,
            entry_point: Some("fragment_main"),
            targets: &[Some(wgpu::ColorTargetState {
                format: color_format,
                blend: blend_state,
                write_mask: wgpu::ColorWrites::ALL,
            })],
            compilation_options: Default::default(),
        }),
        primitive: wgpu::PrimitiveState {
            cull_mode: if double_sided { None } else { Some(wgpu::Face::Back) },
            ..wgpu::PrimitiveState::default()
        },
        depth_stencil: Some(wgpu::DepthStencilState {
            format: DEPTH_FORMAT,
            depth_write_enabled: Some(depth_write),
            depth_compare: Some(wgpu::CompareFunction::LessEqual),
            stencil: wgpu::StencilState::default(),
            bias: wgpu::DepthBiasState::default(),
        }),
        multisample: wgpu::MultisampleState::default(),
        multiview_mask: None,
        cache: None,
    })
}

fn vertex_layout() -> wgpu::VertexBufferLayout<'static> {
    const ATTRIBUTES: [wgpu::VertexAttribute; 7] = wgpu::vertex_attr_array![
        0 => Float32x3,
        1 => Float32x3,
        2 => Float32x4,
        3 => Float32x4,
        4 => Float32,
        5 => Float32x2,
        6 => Float32
    ];
    wgpu::VertexBufferLayout {
        array_stride: GPU_VERTEX_STRIDE,
        step_mode: wgpu::VertexStepMode::Vertex,
        attributes: &ATTRIBUTES,
    }
}

fn instance_layout() -> wgpu::VertexBufferLayout<'static> {
    const ATTRIBUTES: [wgpu::VertexAttribute; 5] = wgpu::vertex_attr_array![
        7 => Float32x4,
        8 => Float32x4,
        9 => Float32x4,
        10 => Float32x4,
        11 => Float32x4
    ];
    wgpu::VertexBufferLayout {
        array_stride: GPU_INSTANCE_STRIDE,
        step_mode: wgpu::VertexStepMode::Instance,
        attributes: &ATTRIBUTES,
    }
}

fn interleave_vertices(geometry: &RenderGeometryV2) -> Result<Vec<u8>, RenderExtractionError> {
    let vertices = geometry.vertex_count();
    let mut bytes = Vec::with_capacity(vertices * GPU_VERTEX_FLOATS * size_of::<f32>());
    for index in 0..vertices {
        for component in 0..3 {
            push_f32(&mut bytes, geometry.positions[index * 3 + component]);
        }
        for component in 0..3 {
            let value = geometry
                .normals
                .get(index * 3 + component)
                .copied()
                .unwrap_or(if component == 1 { 127 } else { 0 });
            push_f32(&mut bytes, f32::from(value) / 127.0);
        }
        for component in 0..4 {
            let value = if component == 3 {
                255
            } else {
                geometry.colors.get(index * 3 + component).copied().unwrap_or(255)
            };
            push_f32(&mut bytes, f32::from(value) / 255.0);
        }
        for component in 0..4 {
            let value = geometry.lights.get(index * 4 + component).copied().unwrap_or(255);
            push_f32(&mut bytes, f32::from(value) / 255.0);
        }
        push_f32(
            &mut bytes,
            f32::from(geometry.emissions.get(index).copied().unwrap_or_default()) / 255.0,
        );
        for component in 0..2 {
            let value = geometry.uvs.get(index * 2 + component).copied().unwrap_or_default();
            push_f32(&mut bytes, f32::from(value) / f32::from(u16::MAX));
        }
        push_f32(
            &mut bytes,
            f32::from(geometry.occlusions.get(index).copied().unwrap_or(255)) / 255.0,
        );
    }
    Ok(bytes)
}

fn material_uniform_bytes(
    material: &RenderMaterialV2,
    texture: Option<&RenderTextureV2>,
    real_texture: bool,
) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(96);
    for (component, value) in material.base_color_rgba8.into_iter().enumerate() {
        let opacity = if component == 3 {
            material.texture.map_or(1.0, |binding| binding.opacity)
        } else {
            1.0
        };
        push_f32(&mut bytes, (f32::from(value) / 255.0) * opacity);
    }
    for value in material.emissive_rgb8 {
        push_f32(&mut bytes, f32::from(value) / 255.0);
    }
    push_f32(&mut bytes, material.emissive_strength);
    push_f32(&mut bytes, material.roughness);
    push_f32(&mut bytes, material.metalness);
    push_f32(&mut bytes, material.alpha_cutoff);
    push_f32(&mut bytes, material.shading as u8 as f32);
    push_f32(&mut bytes, material.blend as u8 as f32);
    push_f32(&mut bytes, material.atlas_tile.map_or(-1.0, f32::from));
    push_f32(&mut bytes, f32::from(u8::from(real_texture)));
    push_f32(&mut bytes, f32::from(u8::from(material.depth_write)));
    let atlas = texture.and_then(|value| value.atlas);
    let binding = material.texture;
    let legacy_block_atlas = binding.is_none() && material.atlas_tile.is_some() && texture.is_some();
    push_f32(
        &mut bytes,
        atlas.map_or(if legacy_block_atlas { 16.0 } else { 1.0 }, |value| {
            f32::from(value.columns)
        }),
    );
    push_f32(
        &mut bytes,
        atlas.map_or(if legacy_block_atlas { 16.0 } else { 1.0 }, |value| {
            f32::from(value.rows)
        }),
    );
    push_f32(
        &mut bytes,
        binding.map_or(RenderTextureUvModeV2::Geometry as u8 as f32, |value| {
            value.uv_mode as u8 as f32
        }),
    );
    push_f32(
        &mut bytes,
        binding.map_or_else(
            || {
                if material.blend == RenderBlendModeV2::Water {
                    RenderTextureAnimationV2::WaterScrollX as u8 as f32
                } else {
                    RenderTextureAnimationV2::None as u8 as f32
                }
            },
            |value| value.animation as u8 as f32,
        ),
    );
    push_f32(&mut bytes, atlas.map_or(0.014, |value| value.edge_inset));
    push_f32(
        &mut bytes,
        atlas.map_or(RenderTextureOriginV2::TopLeft as u8 as f32, |value| {
            value.origin as u8 as f32
        }),
    );
    push_f32(&mut bytes, 0.0);
    push_f32(&mut bytes, 0.0);
    bytes
}

fn create_gpu_texture(device: &wgpu::Device, queue: &wgpu::Queue, source: &RenderTextureV2) -> GpuTexture {
    let format = match source.color_space {
        RenderTextureColorSpaceV2::Linear => wgpu::TextureFormat::Rgba8Unorm,
        RenderTextureColorSpaceV2::Srgb => wgpu::TextureFormat::Rgba8UnormSrgb,
    };
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("Blockwild extraction texture"),
        size: wgpu::Extent3d {
            width: source.width,
            height: source.height,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });
    queue.write_texture(
        wgpu::TexelCopyTextureInfo {
            texture: &texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        &source.rgba8,
        wgpu::TexelCopyBufferLayout {
            offset: 0,
            bytes_per_row: Some(source.width * 4),
            rows_per_image: Some(source.height),
        },
        wgpu::Extent3d {
            width: source.width,
            height: source.height,
            depth_or_array_layers: 1,
        },
    );
    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
    let legacy_filter = match source.filter {
        RenderTextureFilterV2::Nearest => wgpu::FilterMode::Nearest,
        RenderTextureFilterV2::Linear => wgpu::FilterMode::Linear,
    };
    let sampler = source.sampler;
    let filter = |value| match value {
        RenderTextureFilterV2::Nearest => wgpu::FilterMode::Nearest,
        RenderTextureFilterV2::Linear => wgpu::FilterMode::Linear,
    };
    let address_mode = |value| match value {
        RenderTextureWrapV2::ClampToEdge => wgpu::AddressMode::ClampToEdge,
        RenderTextureWrapV2::Repeat => wgpu::AddressMode::Repeat,
        RenderTextureWrapV2::MirroredRepeat => wgpu::AddressMode::MirrorRepeat,
    };
    let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
        label: Some("Blockwild extraction texture sampler"),
        address_mode_u: sampler.map_or(wgpu::AddressMode::ClampToEdge, |value| address_mode(value.wrap_u)),
        address_mode_v: sampler.map_or(wgpu::AddressMode::ClampToEdge, |value| address_mode(value.wrap_v)),
        address_mode_w: wgpu::AddressMode::ClampToEdge,
        mag_filter: sampler.map_or(legacy_filter, |value| filter(value.mag_filter)),
        min_filter: sampler.map_or(legacy_filter, |value| filter(value.min_filter)),
        mipmap_filter: match sampler.map(|value| value.mipmap_filter) {
            Some(RenderTextureMipmapFilterV2::Linear) => wgpu::MipmapFilterMode::Linear,
            Some(RenderTextureMipmapFilterV2::Disabled | RenderTextureMipmapFilterV2::Nearest) | None => {
                wgpu::MipmapFilterMode::Nearest
            }
        },
        lod_min_clamp: 0.0,
        lod_max_clamp: 0.0,
        ..Default::default()
    });
    GpuTexture {
        _texture: texture,
        view,
        sampler,
    }
}

fn camera_uniform_bytes(frame: &RenderFrameV2) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(240);
    let view_projection = camera_view_projection(frame);
    for value in view_projection {
        push_f32(&mut bytes, value);
    }
    for value in frame.camera.position {
        push_f32(&mut bytes, value);
    }
    push_f32(&mut bytes, 1.0);
    for value in frame.environment.ambient_rgb8 {
        push_f32(&mut bytes, f32::from(value) / 255.0);
    }
    push_f32(&mut bytes, frame.environment.ambient_intensity);
    for value in frame.environment.sun_direction {
        push_f32(&mut bytes, value);
    }
    push_f32(&mut bytes, frame.environment.sun_intensity);
    for value in frame.environment.sun_rgb8 {
        push_f32(&mut bytes, f32::from(value) / 255.0);
    }
    push_f32(&mut bytes, 1.0);
    for value in frame.environment.fog_rgb8 {
        push_f32(&mut bytes, f32::from(value) / 255.0);
    }
    push_f32(&mut bytes, frame.environment.fog_near);
    push_f32(&mut bytes, frame.environment.fog_far);
    push_f32(&mut bytes, frame.environment.underwater);
    push_f32(&mut bytes, frame.environment.cave_occlusion);
    push_f32(&mut bytes, frame.animation_time_micros as f32 / 1_000_000.0);
    let lighting = frame.environment.lighting;
    push_f32(&mut bytes, lighting.map_or(1.35, |value| value.block_intensity));
    push_f32(
        &mut bytes,
        lighting.map_or(
            if frame.environment.underwater > 0.5 {
                0.035
            } else {
                0.026
            },
            |value| value.minimum_ambient,
        ),
    );
    push_f32(&mut bytes, lighting.map_or(0.0, |value| value.water_phase));
    push_f32(&mut bytes, 0.0);
    for light in [lighting.map(|value| value.held), lighting.map(|value| value.machine)] {
        let position = light.map_or([0.0; 3], |value| value.position);
        for value in position {
            push_f32(&mut bytes, value);
        }
        push_f32(&mut bytes, light.map_or(0.0, |value| value.radius));
        let color = light.map_or([0; 3], |value| value.color_rgb8);
        for value in color {
            push_f32(&mut bytes, f32::from(value) / 255.0);
        }
        push_f32(&mut bytes, light.map_or(0.0, |value| value.intensity));
    }
    bytes
}

fn world_matrices(frame: &RenderFrameV2) -> Result<BTreeMap<u64, [f32; 16]>, RenderExtractionError> {
    let by_id = frame
        .instances
        .iter()
        .map(|value| (value.stable_id, value))
        .collect::<BTreeMap<_, _>>();
    let mut result = BTreeMap::new();
    for instance in &frame.instances {
        resolve_world_matrix(instance, &by_id, &mut result, frame.animation_time_micros)?;
    }
    Ok(result)
}

fn resolve_world_matrix(
    instance: &RenderInstanceV2,
    by_id: &BTreeMap<u64, &RenderInstanceV2>,
    result: &mut BTreeMap<u64, [f32; 16]>,
    animation_time_micros: u64,
) -> Result<[f32; 16], RenderExtractionError> {
    if let Some(matrix) = result.get(&instance.stable_id) {
        return Ok(*matrix);
    }
    let local = animated_transform_matrix(instance, animation_time_micros);
    let world = if let Some(parent) = instance.parent {
        let parent = by_id
            .get(&parent)
            .ok_or(RenderExtractionError::MissingReference("instance parent"))?;
        multiply_matrix(
            resolve_world_matrix(parent, by_id, result, animation_time_micros)?,
            local,
        )
    } else {
        local
    };
    result.insert(instance.stable_id, world);
    Ok(world)
}

fn animated_transform_matrix(instance: &RenderInstanceV2, animation_time_micros: u64) -> [f32; 16] {
    if instance.animation_flags == 0 {
        return transform_matrix(instance);
    }
    let mut animated = instance.clone();
    let seconds = animation_time_micros as f32 / 1_000_000.0;
    let stable_phase =
        ((instance.stable_id.wrapping_mul(2_654_435_761) & 0xffff) as f32 / 65_535.0) * std::f32::consts::TAU;
    if instance.animation_flags & RENDER_ANIMATION_BOB_V2 != 0 {
        animated.transform.translation[1] += (seconds.mul_add(2.1, stable_phase)).sin() * 0.075;
    }
    if instance.animation_flags & RENDER_ANIMATION_SPIN_V2 != 0 {
        animated.transform.rotation = multiply_quaternion(
            animated.transform.rotation,
            axis_angle_quaternion([0.0, 1.0, 0.0], seconds.mul_add(0.85, stable_phase)),
        );
    }
    if instance.animation_flags & RENDER_ANIMATION_FLAP_V2 != 0 {
        let direction = if instance.stable_id & 1 == 0 { 1.0 } else { -1.0 };
        let angle = (seconds.mul_add(7.5, stable_phase)).sin() * 0.48 * direction;
        animated.transform.rotation = multiply_quaternion(
            animated.transform.rotation,
            axis_angle_quaternion([0.0, 0.0, 1.0], angle),
        );
    }
    if instance.animation_flags & RENDER_ANIMATION_SWAY_V2 != 0 {
        let angle = (seconds.mul_add(1.35, stable_phase)).sin() * 0.11;
        animated.transform.rotation = multiply_quaternion(
            animated.transform.rotation,
            axis_angle_quaternion([1.0, 0.0, 0.0], angle),
        );
    }
    if instance.animation_flags & RENDER_ANIMATION_PULSE_V2 != 0 {
        let pulse = 1.0 + (seconds.mul_add(2.8, stable_phase)).sin() * 0.045;
        for value in &mut animated.transform.scale {
            *value *= pulse;
        }
    }
    transform_matrix(&animated)
}

fn axis_angle_quaternion(axis: [f32; 3], angle: f32) -> [f32; 4] {
    let half = angle * 0.5;
    let sine = half.sin();
    [axis[0] * sine, axis[1] * sine, axis[2] * sine, half.cos()]
}

fn multiply_quaternion(left: [f32; 4], right: [f32; 4]) -> [f32; 4] {
    let [lx, ly, lz, lw] = left;
    let [rx, ry, rz, rw] = right;
    [
        lw.mul_add(rx, lx.mul_add(rw, ly.mul_add(rz, -lz * ry))),
        lw.mul_add(ry, (-lx).mul_add(rz, ly.mul_add(rw, lz * rx))),
        lw.mul_add(rz, lx.mul_add(ry, (-ly).mul_add(rx, lz * rw))),
        lw.mul_add(rw, (-lx).mul_add(rx, (-ly).mul_add(ry, -lz * rz))),
    ]
}

fn transform_matrix(instance: &RenderInstanceV2) -> [f32; 16] {
    let [x, y, z, w] = instance.transform.rotation;
    let [sx, sy, sz] = instance.transform.scale;
    let [tx, ty, tz] = instance.transform.translation;
    [
        (1.0 - 2.0 * (y * y + z * z)) * sx,
        (2.0 * (x * y + z * w)) * sx,
        (2.0 * (x * z - y * w)) * sx,
        0.0,
        (2.0 * (x * y - z * w)) * sy,
        (1.0 - 2.0 * (x * x + z * z)) * sy,
        (2.0 * (y * z + x * w)) * sy,
        0.0,
        (2.0 * (x * z + y * w)) * sz,
        (2.0 * (y * z - x * w)) * sz,
        (1.0 - 2.0 * (x * x + y * y)) * sz,
        0.0,
        tx,
        ty,
        tz,
        1.0,
    ]
}

fn camera_view_projection(frame: &RenderFrameV2) -> [f32; 16] {
    let transform = RenderInstanceV2 {
        stable_id: 1,
        domain: crate::RenderInstanceDomainV2::Player,
        geometry: RenderResourceId(1),
        material: RenderResourceId(1),
        parent: None,
        transform: crate::RenderTransformV2 {
            translation: frame.camera.position,
            rotation: frame.camera.orientation,
            scale: [1.0; 3],
        },
        tint_rgba8: [255; 4],
        visibility_mask: 0,
        sort_key: 0,
        animation_flags: 0,
    };
    let camera = transform_matrix(&transform);
    let rotation_transpose = [
        camera[0], camera[4], camera[8], 0.0, camera[1], camera[5], camera[9], 0.0, camera[2], camera[6], camera[10],
        0.0, 0.0, 0.0, 0.0, 1.0,
    ];
    let translation = [
        1.0,
        0.0,
        0.0,
        0.0,
        0.0,
        1.0,
        0.0,
        0.0,
        0.0,
        0.0,
        1.0,
        0.0,
        -frame.camera.position[0],
        -frame.camera.position[1],
        -frame.camera.position[2],
        1.0,
    ];
    let view = multiply_matrix(rotation_transpose, translation);
    let aspect = frame.camera.viewport[0] as f32 / frame.camera.viewport[1] as f32;
    let f = 1.0 / (frame.camera.vertical_fov_radians * 0.5).tan();
    let near = frame.camera.near;
    let far = frame.camera.far;
    let projection = [
        f / aspect,
        0.0,
        0.0,
        0.0,
        0.0,
        f,
        0.0,
        0.0,
        0.0,
        0.0,
        far / (near - far),
        -1.0,
        0.0,
        0.0,
        (far * near) / (near - far),
        0.0,
    ];
    multiply_matrix(projection, view)
}

fn multiply_matrix(left: [f32; 16], right: [f32; 16]) -> [f32; 16] {
    let mut output = [0.0; 16];
    for column in 0..4 {
        for row in 0..4 {
            output[column * 4 + row] = (0..4)
                .map(|index| left[index * 4 + row] * right[column * 4 + index])
                .sum();
        }
    }
    output
}

fn u32_bytes(values: &[u32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(std::mem::size_of_val(values));
    for value in values {
        bytes.extend_from_slice(&value.to_le_bytes());
    }
    bytes
}

fn push_f32(bytes: &mut Vec<u8>, value: f32) {
    bytes.extend_from_slice(&value.to_le_bytes());
}

fn rgba8_color(value: [u8; 4]) -> wgpu::Color {
    wgpu::Color {
        r: f64::from(value[0]) / 255.0,
        g: f64::from(value[1]) / 255.0,
        b: f64::from(value[2]) / 255.0,
        a: f64::from(value[3]) / 255.0,
    }
}

#[cfg(not(target_arch = "wasm32"))]
const fn padded_bytes_per_row(width: u32) -> u32 {
    let unpadded = width * 4;
    let alignment = wgpu::COPY_BYTES_PER_ROW_ALIGNMENT;
    unpadded.div_ceil(alignment) * alignment
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        ProductionTerrainLayerV2, RenderBoundsV2, RenderGeometryKindV2, RenderLightingExtensionV2, RenderPointLightV2,
        RenderTransformV2, production_block_atlas_texture_v2, production_terrain_material_v2,
    };

    #[test]
    fn matrix_hierarchy_preserves_parent_translation() {
        let parent = RenderInstanceV2 {
            stable_id: 1,
            domain: crate::RenderInstanceDomainV2::Creature,
            geometry: RenderResourceId(1),
            material: RenderResourceId(2),
            parent: None,
            transform: RenderTransformV2 {
                translation: [2.0, 3.0, 4.0],
                ..RenderTransformV2::identity()
            },
            tint_rgba8: [255; 4],
            visibility_mask: 0,
            sort_key: 0,
            animation_flags: 0,
        };
        let mut child = parent.clone();
        child.stable_id = 2;
        child.parent = Some(1);
        child.transform.translation = [1.0, 0.0, 0.0];
        let by_id = BTreeMap::from([(1, &parent), (2, &child)]);
        let mut result = BTreeMap::new();
        let world = resolve_world_matrix(&child, &by_id, &mut result, 0).unwrap();
        assert_eq!([world[12], world[13], world[14]], [3.0, 3.0, 4.0]);
    }

    #[test]
    fn packed_vertex_conversion_has_the_frozen_stride() {
        let geometry = RenderGeometryV2 {
            id: RenderResourceId(1),
            revision: 1,
            kind: RenderGeometryKindV2::Terrain,
            bounds: RenderBoundsV2 {
                minimum: [0.0; 3],
                maximum: [1.0; 3],
            },
            positions: vec![0.0, 1.0, 2.0],
            normals: vec![0, 127, 0],
            colors: vec![255, 128, 0],
            lights: vec![255, 0, 0, 0],
            emissions: vec![0],
            occlusions: vec![255],
            uvs: vec![0, u16::MAX],
            indices: vec![0],
        };
        assert_eq!(interleave_vertices(&geometry).unwrap().len() as u64, GPU_VERTEX_STRIDE);
    }

    #[test]
    fn camera_uniform_packs_exact_dynamic_terrain_lighting() {
        let (_, source) = canonical_integrated_scene_v2(640, 360).unwrap();
        let mut environment = source.environment;
        environment.lighting = Some(RenderLightingExtensionV2 {
            block_intensity: 1.35,
            minimum_ambient: 0.026,
            water_phase: 0.375,
            held: RenderPointLightV2 {
                position: [1.0, 2.0, 3.0],
                color_rgb8: [255, 116, 40],
                intensity: 0.72,
                radius: 9.0,
            },
            machine: RenderPointLightV2 {
                position: [-4.0, 5.0, 6.0],
                color_rgb8: [255, 133, 49],
                intensity: 0.42,
                radius: 7.5,
            },
        });
        let frame = RenderFrameV2::create(RenderFrameInputV2 {
            epoch: source.epoch,
            frame_sequence: source.frame_sequence + 1,
            simulation_tick: source.simulation_tick,
            animation_time_micros: source.animation_time_micros,
            resource_revision: source.resource_revision,
            camera: source.camera,
            environment,
            instances: source.instances,
            particles: source.particles,
        })
        .unwrap();
        let bytes = camera_uniform_bytes(&frame);
        let read = |offset: usize| f32::from_le_bytes(bytes[offset..offset + 4].try_into().unwrap());
        assert_eq!(bytes.len(), 240);
        assert_eq!([read(160), read(164), read(168)], [1.35, 0.026, 0.375]);
        assert_eq!([read(176), read(180), read(184), read(188)], [1.0, 2.0, 3.0, 9.0]);
        assert_eq!([read(208), read(212), read(216), read(220)], [-4.0, 5.0, 6.0, 7.5]);
        assert!((read(204) - 0.72).abs() < f32::EPSILON);
        assert!((read(236) - 0.42).abs() < f32::EPSILON);
    }

    #[test]
    fn material_uniform_packs_exact_atlas_and_authoritative_water_phase_contract() {
        let texture = production_block_atlas_texture_v2(1, vec![255; 256 * 256 * 4]).unwrap();
        let material = production_terrain_material_v2(RenderResourceId(8), 1, ProductionTerrainLayerV2::Water);
        let bytes = material_uniform_bytes(&material, Some(&texture), true);
        let read = |offset: usize| f32::from_le_bytes(bytes[offset..offset + 4].try_into().unwrap());
        assert_eq!(bytes.len(), 96);
        assert!((read(12) - 0.76).abs() < f32::EPSILON);
        assert_eq!([read(48), read(52), read(56)], [4.0, -1.0, 1.0]);
        assert_eq!([read(64), read(68), read(72), read(76)], [16.0, 16.0, 0.0, 1.0]);
        assert_eq!([read(80), read(84)], [0.014, 0.0]);
    }

    #[test]
    fn draw_plan_culls_invisible_geometry_and_sorts_transparency_back_to_front() {
        let (resources, source) = canonical_integrated_scene_v2(640, 360).unwrap();
        let mut store = RenderResourceStoreV2::default();
        store.apply_resource_batch(&resources).unwrap();
        let mut instances = source.instances.clone();
        let mut distant_water = instances[3].clone();
        distant_water.stable_id = 104;
        distant_water.transform.translation[2] = -8.0;
        instances.push(distant_water);
        let mut outside = instances[0].clone();
        outside.stable_id = 105;
        outside.transform.translation[0] = 10_000.0;
        instances.push(outside);
        let frame = RenderFrameV2::create(RenderFrameInputV2 {
            epoch: source.epoch,
            frame_sequence: source.frame_sequence + 1,
            simulation_tick: source.simulation_tick,
            animation_time_micros: source.animation_time_micros,
            resource_revision: source.resource_revision,
            camera: source.camera,
            environment: source.environment,
            instances,
            particles: source.particles,
        })
        .unwrap();
        let world = world_matrices(&frame).unwrap();
        let plan = build_draw_plan(&frame, &world, &store).unwrap();
        assert_eq!(plan.culled_instances, 1);
        assert_eq!(plan.transparent_draw_calls, 2);
        let transparent = &plan.groups[plan.groups.len() - 2..];
        let read_translation_z = |first_instance: u32| {
            let offset = first_instance as usize * GPU_INSTANCE_STRIDE as usize + 14 * size_of::<f32>();
            f32::from_le_bytes(plan.bytes[offset..offset + 4].try_into().unwrap())
        };
        assert!(
            read_translation_z(transparent[0].first_instance) < read_translation_z(transparent[1].first_instance),
            "more distant alpha geometry must be submitted first"
        );
    }

    #[test]
    fn hierarchical_animation_is_deterministic_and_mirrors_paired_flaps() {
        let mut left = RenderInstanceV2 {
            stable_id: 10,
            domain: crate::RenderInstanceDomainV2::Creature,
            geometry: RenderResourceId(1),
            material: RenderResourceId(1),
            parent: None,
            transform: RenderTransformV2::identity(),
            tint_rgba8: [255; 4],
            visibility_mask: u32::MAX,
            sort_key: 0,
            animation_flags: RENDER_ANIMATION_BOB_V2 | RENDER_ANIMATION_FLAP_V2,
        };
        let left_matrix = animated_transform_matrix(&left, 750_000);
        assert_eq!(left_matrix, animated_transform_matrix(&left, 750_000));
        left.stable_id = 11;
        let right_matrix = animated_transform_matrix(&left, 750_000);
        assert_ne!(left_matrix, right_matrix, "paired limbs receive stable mirrored phases");
    }
}
