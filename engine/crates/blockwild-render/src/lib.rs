//! Renderer-independent scene fixtures and the first offscreen `wgpu` smoke path.

use blockwild_protocol::{Envelope, MessageKind};
use blockwild_types::{CanonicalHash, CanonicalHasher};

pub const SMOKE_SHADER: &str = include_str!("smoke.wgsl");
pub const SMOKE_WIDTH: u32 = 64;
pub const SMOKE_HEIGHT: u32 = 64;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CameraFixture {
    pub eye: [f32; 3],
    pub target: [f32; 3],
    pub vertical_fov_radians: f32,
    pub near: f32,
    pub far: f32,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct MaterialFixture {
    pub id: u32,
    pub base_color_rgba8: [u8; 4],
    pub emissive_rgb8: [u8; 3],
    pub flags: u8,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct InstanceFixture {
    pub stable_id: u64,
    pub material_id: u32,
    pub translation: [f32; 3],
    pub scale: [f32; 3],
}

/// Cross-renderer image comparison tolerances attached to every canonical scene.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VisualDiffPolicy {
    pub per_channel_tolerance: u8,
    pub max_mismatched_pixels: u32,
    /// Rectangles use inclusive x/y plus width/height in fixture pixels.
    pub ignored_rects: Vec<[u16; 4]>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SceneFixture {
    pub schema: u16,
    pub name: String,
    pub animation_tick: u64,
    pub clear_rgba8: [u8; 4],
    pub camera: CameraFixture,
    pub materials: Vec<MaterialFixture>,
    pub instances: Vec<InstanceFixture>,
    pub diff_policy: VisualDiffPolicy,
}

impl SceneFixture {
    #[must_use]
    pub fn smoke() -> Self {
        Self {
            schema: 1,
            name: "blockwild-wgpu-smoke".into(),
            animation_tick: 0,
            clear_rgba8: [18, 32, 28, 255],
            camera: CameraFixture {
                eye: [2.5, 2.0, 3.5],
                target: [0.0, 0.0, 0.0],
                vertical_fov_radians: core::f32::consts::FRAC_PI_4,
                near: 0.05,
                far: 256.0,
            },
            materials: vec![MaterialFixture {
                id: 1,
                base_color_rgba8: [91, 159, 93, 255],
                emissive_rgb8: [0, 0, 0],
                flags: 0,
            }],
            instances: vec![InstanceFixture {
                stable_id: 1,
                material_id: 1,
                translation: [0.0, 0.0, 0.0],
                scale: [1.0, 1.0, 1.0],
            }],
            diff_policy: VisualDiffPolicy {
                per_channel_tolerance: 3,
                max_mismatched_pixels: 8,
                ignored_rects: Vec::new(),
            },
        }
    }

    #[must_use]
    pub fn canonical_hash(&self) -> CanonicalHash {
        let mut hasher = CanonicalHasher::new("blockwild-render-scene-v1");
        hasher.write_u16(self.schema);
        hasher.write_str(&self.name);
        hasher.write_u64(self.animation_tick);
        hasher.write_bytes(&self.clear_rgba8);
        for value in self.camera.eye.into_iter().chain(self.camera.target) {
            hasher.write_u32(value.to_bits());
        }
        hasher.write_u32(self.camera.vertical_fov_radians.to_bits());
        hasher.write_u32(self.camera.near.to_bits());
        hasher.write_u32(self.camera.far.to_bits());
        let mut materials = self.materials.clone();
        materials.sort_by_key(|material| material.id);
        hasher.write_u64(materials.len() as u64);
        for material in materials {
            hasher.write_u32(material.id);
            hasher.write_bytes(&material.base_color_rgba8);
            hasher.write_bytes(&material.emissive_rgb8);
            hasher.write_bytes(&[material.flags]);
        }
        let mut instances = self.instances.clone();
        instances.sort_by_key(|instance| instance.stable_id);
        hasher.write_u64(instances.len() as u64);
        for instance in instances {
            hasher.write_u64(instance.stable_id);
            hasher.write_u32(instance.material_id);
            for value in instance.translation.into_iter().chain(instance.scale) {
                hasher.write_u32(value.to_bits());
            }
        }
        hasher.write_bytes(&[self.diff_policy.per_channel_tolerance]);
        hasher.write_u32(self.diff_policy.max_mismatched_pixels);
        let mut ignored_rects = self.diff_policy.ignored_rects.clone();
        ignored_rects.sort_unstable();
        hasher.write_u64(ignored_rects.len() as u64);
        for rectangle in ignored_rects {
            for value in rectangle {
                hasher.write_u16(value);
            }
        }
        hasher.finish()
    }

    #[must_use]
    pub fn envelope(&self) -> Envelope {
        let mut payload = Vec::new();
        payload.extend_from_slice(self.canonical_hash().as_bytes());
        payload.extend_from_slice(&self.schema.to_le_bytes());
        payload.extend_from_slice(&(self.name.len() as u32).to_le_bytes());
        payload.extend_from_slice(self.name.as_bytes());
        payload.extend_from_slice(&self.animation_tick.to_le_bytes());
        payload.extend_from_slice(&self.clear_rgba8);
        for value in self.camera.eye.into_iter().chain(self.camera.target) {
            payload.extend_from_slice(&value.to_bits().to_le_bytes());
        }
        payload.extend_from_slice(&self.camera.vertical_fov_radians.to_bits().to_le_bytes());
        payload.extend_from_slice(&self.camera.near.to_bits().to_le_bytes());
        payload.extend_from_slice(&self.camera.far.to_bits().to_le_bytes());
        let mut materials = self.materials.clone();
        materials.sort_by_key(|material| material.id);
        payload.extend_from_slice(&(materials.len() as u32).to_le_bytes());
        for material in materials {
            payload.extend_from_slice(&material.id.to_le_bytes());
            payload.extend_from_slice(&material.base_color_rgba8);
            payload.extend_from_slice(&material.emissive_rgb8);
            payload.push(material.flags);
        }
        let mut instances = self.instances.clone();
        instances.sort_by_key(|instance| instance.stable_id);
        payload.extend_from_slice(&(instances.len() as u32).to_le_bytes());
        for instance in instances {
            payload.extend_from_slice(&instance.stable_id.to_le_bytes());
            payload.extend_from_slice(&instance.material_id.to_le_bytes());
            for value in instance.translation.into_iter().chain(instance.scale) {
                payload.extend_from_slice(&value.to_bits().to_le_bytes());
            }
        }
        payload.push(self.diff_policy.per_channel_tolerance);
        payload.extend_from_slice(&self.diff_policy.max_mismatched_pixels.to_le_bytes());
        let mut ignored_rects = self.diff_policy.ignored_rects.clone();
        ignored_rects.sort_unstable();
        payload.extend_from_slice(&(ignored_rects.len() as u32).to_le_bytes());
        for rectangle in ignored_rects {
            for value in rectangle {
                payload.extend_from_slice(&value.to_le_bytes());
            }
        }
        Envelope::new(MessageKind::RenderScene, 0, 0, 0, payload)
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SmokeStatus {
    Rendered,
    AdapterUnavailable,
    DeviceUnavailable,
    ValidationFailed,
    ReadbackFailed,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RenderDiagnostics {
    pub status: SmokeStatus,
    pub backend: String,
    pub adapter_name: String,
    pub device_type: String,
    pub driver: String,
    pub message: String,
    pub fixture_hash: CanonicalHash,
    pub image_hash: Option<CanonicalHash>,
    pub features: String,
    pub max_texture_dimension_2d: u32,
    pub max_storage_buffer_binding_size: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RenderSmokeArtifact {
    pub diagnostics: RenderDiagnostics,
    pub rgba8: Vec<u8>,
}

impl RenderDiagnostics {
    fn unavailable(status: SmokeStatus, message: impl Into<String>) -> Self {
        Self {
            status,
            backend: "unavailable".into(),
            adapter_name: String::new(),
            device_type: String::new(),
            driver: String::new(),
            message: message.into(),
            fixture_hash: SceneFixture::smoke().canonical_hash(),
            image_hash: None,
            features: String::new(),
            max_texture_dimension_2d: 0,
            max_storage_buffer_binding_size: 0,
        }
    }
}

/// Compile and submit the canonical triangle to an offscreen texture.
///
/// This has no window/surface dependency and can run in native CI or a browser
/// worker. Adapter absence is a reported capability result, never a panic.
pub async fn smoke_offscreen_artifact() -> RenderSmokeArtifact {
    let instance = wgpu::Instance::new(wgpu::InstanceDescriptor::new_without_display_handle());
    let adapter = match instance
        .request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::LowPower,
            force_fallback_adapter: false,
            compatible_surface: None,
            apply_limit_buckets: false,
        })
        .await
    {
        Ok(adapter) => adapter,
        Err(error) => {
            return RenderSmokeArtifact {
                diagnostics: RenderDiagnostics::unavailable(SmokeStatus::AdapterUnavailable, error.to_string()),
                rgba8: Vec::new(),
            };
        }
    };
    let info = adapter.get_info();
    let features = adapter.features();
    let limits = adapter.limits();
    let requested = adapter
        .request_device(&wgpu::DeviceDescriptor {
            label: Some("Blockwild R0 smoke device"),
            required_features: wgpu::Features::empty(),
            required_limits: wgpu::Limits::downlevel_defaults(),
            memory_hints: wgpu::MemoryHints::MemoryUsage,
            trace: wgpu::Trace::Off,
            experimental_features: wgpu::ExperimentalFeatures::disabled(),
        })
        .await;
    let (device, queue) = match requested {
        Ok(pair) => pair,
        Err(error) => {
            return RenderSmokeArtifact {
                diagnostics: RenderDiagnostics {
                    status: SmokeStatus::DeviceUnavailable,
                    backend: format!("{:?}", info.backend),
                    adapter_name: info.name,
                    device_type: format!("{:?}", info.device_type),
                    driver: info.driver,
                    message: error.to_string(),
                    fixture_hash: SceneFixture::smoke().canonical_hash(),
                    image_hash: None,
                    features: format!("{features:?}"),
                    max_texture_dimension_2d: limits.max_texture_dimension_2d,
                    max_storage_buffer_binding_size: limits.max_storage_buffer_binding_size,
                },
                rgba8: Vec::new(),
            };
        }
    };

    let validation_scope = device.push_error_scope(wgpu::ErrorFilter::Validation);
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("Blockwild R0 smoke shader"),
        source: wgpu::ShaderSource::Wgsl(SMOKE_SHADER.into()),
    });
    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("Blockwild R0 smoke pipeline layout"),
        bind_group_layouts: &[],
        immediate_size: 0,
    });
    let format = wgpu::TextureFormat::Rgba8UnormSrgb;
    let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("Blockwild R0 smoke pipeline"),
        layout: Some(&pipeline_layout),
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: Some("vertex_main"),
            buffers: &[],
            compilation_options: Default::default(),
        },
        fragment: Some(wgpu::FragmentState {
            module: &shader,
            entry_point: Some("fragment_main"),
            targets: &[Some(wgpu::ColorTargetState {
                format,
                blend: None,
                write_mask: wgpu::ColorWrites::ALL,
            })],
            compilation_options: Default::default(),
        }),
        primitive: wgpu::PrimitiveState::default(),
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        multiview_mask: None,
        cache: None,
    });
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("Blockwild R0 smoke target"),
        size: wgpu::Extent3d {
            width: SMOKE_WIDTH,
            height: SMOKE_HEIGHT,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
        view_formats: &[],
    });
    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
    #[cfg(not(target_arch = "wasm32"))]
    let readback = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("Blockwild R0 smoke readback"),
        size: u64::from(SMOKE_WIDTH * 4 * SMOKE_HEIGHT),
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });
    let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
        label: Some("Blockwild R0 smoke encoder"),
    });
    {
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("Blockwild R0 smoke pass"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: &view,
                resolve_target: None,
                depth_slice: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Clear(wgpu::Color {
                        r: 0.071,
                        g: 0.125,
                        b: 0.110,
                        a: 1.0,
                    }),
                    store: wgpu::StoreOp::Store,
                },
            })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        });
        pass.set_pipeline(&pipeline);
        pass.draw(0..3, 0..1);
    }
    #[cfg(not(target_arch = "wasm32"))]
    encoder.copy_texture_to_buffer(
        wgpu::TexelCopyTextureInfo {
            texture: &texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        wgpu::TexelCopyBufferInfo {
            buffer: &readback,
            layout: wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(SMOKE_WIDTH * 4),
                rows_per_image: Some(SMOKE_HEIGHT),
            },
        },
        wgpu::Extent3d {
            width: SMOKE_WIDTH,
            height: SMOKE_HEIGHT,
            depth_or_array_layers: 1,
        },
    );
    let submission = queue.submit([encoder.finish()]);
    let validation_error = validation_scope.pop().await;
    #[cfg(not(target_arch = "wasm32"))]
    let readback_result = if validation_error.is_none() {
        readback_rgba(&device, &readback, submission)
    } else {
        Ok(Vec::new())
    };
    #[cfg(target_arch = "wasm32")]
    let readback_result: Result<Vec<u8>, String> = {
        let _ = submission;
        Ok(Vec::new())
    };
    let (status, message, rgba8) = match (validation_error, readback_result) {
        (Some(error), _) => (SmokeStatus::ValidationFailed, error.to_string(), Vec::new()),
        (None, Err(error)) => (SmokeStatus::ReadbackFailed, error, Vec::new()),
        (None, Ok(bytes)) => {
            let message = if bytes.is_empty() {
                "offscreen triangle submitted; browser readback intentionally deferred".into()
            } else {
                format!("offscreen triangle submitted and {} RGBA bytes read back", bytes.len())
            };
            (SmokeStatus::Rendered, message, bytes)
        }
    };
    let image_hash = if rgba8.is_empty() {
        None
    } else {
        let mut hasher = CanonicalHasher::new("blockwild-render-smoke-rgba-v1");
        hasher.write_u32(SMOKE_WIDTH);
        hasher.write_u32(SMOKE_HEIGHT);
        hasher.write_bytes(&rgba8);
        Some(hasher.finish())
    };
    RenderSmokeArtifact {
        diagnostics: RenderDiagnostics {
            status,
            backend: format!("{:?}", info.backend),
            adapter_name: info.name,
            device_type: format!("{:?}", info.device_type),
            driver: info.driver,
            message,
            fixture_hash: SceneFixture::smoke().canonical_hash(),
            image_hash,
            features: format!("{features:?}"),
            max_texture_dimension_2d: limits.max_texture_dimension_2d,
            max_storage_buffer_binding_size: limits.max_storage_buffer_binding_size,
        },
        rgba8,
    }
}

pub async fn smoke_offscreen() -> RenderDiagnostics {
    smoke_offscreen_artifact().await.diagnostics
}

#[cfg(not(target_arch = "wasm32"))]
fn readback_rgba(
    device: &wgpu::Device,
    buffer: &wgpu::Buffer,
    submission: wgpu::SubmissionIndex,
) -> Result<Vec<u8>, String> {
    use std::sync::mpsc;
    use std::time::Duration;

    let (sender, receiver) = mpsc::sync_channel(1);
    buffer.slice(..).map_async(wgpu::MapMode::Read, move |result| {
        let _ = sender.send(result.map_err(|error| error.to_string()));
    });
    device
        .poll(wgpu::PollType::Wait {
            submission_index: Some(submission),
            timeout: Some(Duration::from_secs(10)),
        })
        .map_err(|error| format!("GPU poll failed: {error}"))?;
    receiver
        .recv_timeout(Duration::from_secs(1))
        .map_err(|error| format!("GPU map callback missing: {error}"))??;
    let mapped = buffer.slice(..).get_mapped_range().map_err(|error| error.to_string())?;
    let bytes = mapped.to_vec();
    drop(mapped);
    buffer.unmap();
    Ok(bytes)
}

#[cfg(not(target_arch = "wasm32"))]
#[must_use]
pub fn smoke_offscreen_blocking() -> RenderDiagnostics {
    pollster::block_on(smoke_offscreen())
}

#[cfg(not(target_arch = "wasm32"))]
#[must_use]
pub fn smoke_offscreen_artifact_blocking() -> RenderSmokeArtifact {
    pollster::block_on(smoke_offscreen_artifact())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scene_hash_is_independent_of_storage_order() {
        let first = SceneFixture::smoke();
        let mut second = first.clone();
        second.materials.push(MaterialFixture {
            id: 4,
            base_color_rgba8: [1, 2, 3, 4],
            emissive_rgb8: [5, 6, 7],
            flags: 1,
        });
        second.materials.reverse();
        let mut third = first;
        third.materials.push(MaterialFixture {
            id: 4,
            base_color_rgba8: [1, 2, 3, 4],
            emissive_rgb8: [5, 6, 7],
            flags: 1,
        });
        assert_eq!(second.canonical_hash(), third.canonical_hash());
    }

    #[test]
    fn fixture_uses_versioned_render_envelope() {
        let fixture = SceneFixture::smoke();
        let decoded = Envelope::decode(&fixture.envelope().encode()).unwrap();
        assert_eq!(decoded.header.kind, MessageKind::RenderScene);
        assert_eq!(&decoded.payload[..16], fixture.canonical_hash().as_bytes());
    }
}
