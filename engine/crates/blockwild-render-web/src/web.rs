use blockwild_render::{
    WgpuSceneDiagnosticsV2, WgpuSceneRendererV2, decode_render_frame_v2, decode_render_resource_batch_v2,
};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct WasmRenderSurfaceV2 {
    instance: wgpu::Instance,
    surface: wgpu::Surface<'static>,
    config: wgpu::SurfaceConfiguration,
    renderer: WgpuSceneRendererV2,
    surface_device: wgpu::Device,
    present_queue: wgpu::Queue,
    adapter_name: String,
    adapter_backend: String,
    timestamp_query_supported: bool,
}

#[wasm_bindgen]
pub async fn create_blockwild_renderer(
    canvas: web_sys::OffscreenCanvas,
    width: u32,
    height: u32,
) -> Result<WasmRenderSurfaceV2, JsValue> {
    if width == 0 || height == 0 {
        return Err(JsValue::from_str("renderer dimensions must be nonzero"));
    }
    let instance = wgpu::Instance::new(wgpu::InstanceDescriptor::new_without_display_handle());
    let surface = instance
        .create_surface(wgpu::SurfaceTarget::OffscreenCanvas(canvas))
        .map_err(js_error)?;
    let (config, renderer, surface_device, present_queue, adapter_name, adapter_backend, timestamp_query_supported) =
        create_device_and_renderer(&instance, &surface, width, height).await?;
    Ok(WasmRenderSurfaceV2 {
        instance,
        surface,
        config,
        renderer,
        surface_device,
        present_queue,
        adapter_name,
        adapter_backend,
        timestamp_query_supported,
    })
}

#[wasm_bindgen]
impl WasmRenderSurfaceV2 {
    pub fn capabilities(&self) -> String {
        format!(
            "{{\"backend\":\"{}\",\"adapter\":\"{}\",\"timestampQuerySupported\":{}}}",
            json_escape(&self.adapter_backend),
            json_escape(&self.adapter_name),
            self.timestamp_query_supported,
        )
    }

    pub fn apply_resources(&mut self, bytes: &[u8]) -> Result<String, JsValue> {
        let batch = decode_render_resource_batch_v2(bytes).map_err(js_error)?;
        let applied = self.renderer.apply_resource_batch(&batch).map_err(js_error)?;
        Ok(format!("{{\"revision\":{},\"applied\":{}}}", batch.revision, applied))
    }

    pub fn render_frame(&mut self, bytes: &[u8]) -> Result<String, JsValue> {
        let frame = decode_render_frame_v2(bytes).map_err(js_error)?;
        let output = match self.surface.get_current_texture() {
            wgpu::CurrentSurfaceTexture::Success(output) => output,
            wgpu::CurrentSurfaceTexture::Suboptimal(output) => {
                self.surface.configure(&self.surface_device, &self.config);
                output
            }
            wgpu::CurrentSurfaceTexture::Outdated => {
                self.surface.configure(&self.surface_device, &self.config);
                return Ok(skipped_frame_json("surface-outdated"));
            }
            wgpu::CurrentSurfaceTexture::Timeout => return Ok(skipped_frame_json("surface-timeout")),
            wgpu::CurrentSurfaceTexture::Occluded => return Ok(skipped_frame_json("surface-occluded")),
            wgpu::CurrentSurfaceTexture::Lost => return Err(JsValue::from_str("device-lost: WebGPU surface lost")),
            wgpu::CurrentSurfaceTexture::Validation => {
                return Err(JsValue::from_str("WebGPU surface validation failed"));
            }
        };
        let view = output.texture.create_view(&wgpu::TextureViewDescriptor::default());
        let started = web_time_micros();
        let diagnostics = self.renderer.render_to_view(&frame, &view).map_err(js_error)?;
        self.present_queue.present(output);
        Ok(diagnostics_json(
            &diagnostics,
            web_time_micros().saturating_sub(started),
        ))
    }

    pub fn resize(&mut self, width: u32, height: u32) -> Result<(), JsValue> {
        if width == 0 || height == 0 {
            return Err(JsValue::from_str("renderer dimensions must be nonzero"));
        }
        self.config.width = width;
        self.config.height = height;
        self.renderer.resize(width, height).map_err(js_error)?;
        self.surface.configure(&self.surface_device, &self.config);
        Ok(())
    }

    pub async fn recover(&mut self) -> Result<String, JsValue> {
        let (config, renderer, surface_device, present_queue, adapter_name, adapter_backend, timestamp_query_supported) =
            create_device_and_renderer(&self.instance, &self.surface, self.config.width, self.config.height).await?;
        self.config = config;
        self.renderer = renderer;
        self.surface_device = surface_device;
        self.present_queue = present_queue;
        self.adapter_name = adapter_name;
        self.adapter_backend = adapter_backend;
        self.timestamp_query_supported = timestamp_query_supported;
        Ok("{\"recovered\":true,\"requiresResourceReplay\":true}".into())
    }

    pub fn shutdown(&mut self) {
        // GPU resources drop with this wrapper. Authority remains outside it.
    }
}

async fn create_device_and_renderer(
    instance: &wgpu::Instance,
    surface: &wgpu::Surface<'static>,
    width: u32,
    height: u32,
) -> Result<
    (
        wgpu::SurfaceConfiguration,
        WgpuSceneRendererV2,
        wgpu::Device,
        wgpu::Queue,
        String,
        String,
        bool,
    ),
    JsValue,
> {
    let adapter = instance
        .request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            force_fallback_adapter: false,
            compatible_surface: Some(surface),
            apply_limit_buckets: false,
        })
        .await
        .map_err(js_error)?;
    let info = adapter.get_info();
    let timestamp_query_supported = adapter.features().contains(wgpu::Features::TIMESTAMP_QUERY);
    let adapter_name = info.name.clone();
    let adapter_backend = format!("{:?}", info.backend);
    let (device, queue) = adapter
        .request_device(&wgpu::DeviceDescriptor {
            label: Some("Blockwild R11 WebGPU surface device"),
            required_features: wgpu::Features::empty(),
            required_limits: wgpu::Limits::downlevel_webgl2_defaults(),
            memory_hints: wgpu::MemoryHints::MemoryUsage,
            trace: wgpu::Trace::Off,
            experimental_features: wgpu::ExperimentalFeatures::disabled(),
        })
        .await
        .map_err(js_error)?;
    let capabilities = surface.get_capabilities(&adapter);
    let color_format = capabilities
        .formats
        .iter()
        .copied()
        .find(wgpu::TextureFormat::is_srgb)
        .or_else(|| capabilities.formats.first().copied())
        .ok_or_else(|| JsValue::from_str("WebGPU surface has no supported format"))?;
    let mut config = surface
        .get_default_config(&adapter, width, height)
        .ok_or_else(|| JsValue::from_str("WebGPU surface is unsupported by the adapter"))?;
    config.format = color_format;
    config.desired_maximum_frame_latency = 2;
    surface.configure(&device, &config);
    let surface_device = device.clone();
    let present_queue = queue.clone();
    let renderer =
        WgpuSceneRendererV2::from_device(device, queue, info, width, height, color_format).map_err(js_error)?;
    Ok((
        config,
        renderer,
        surface_device,
        present_queue,
        adapter_name,
        adapter_backend,
        timestamp_query_supported,
    ))
}

fn diagnostics_json(value: &WgpuSceneDiagnosticsV2, cpu_micros: u64) -> String {
    format!(
        "{{\"cpuMicros\":{cpu_micros},\"gpuMicros\":null,\"backend\":\"{}\",\"adapter\":\"{}\",\"visibleInstances\":{},\"culledInstances\":{},\"drawCalls\":{},\"transparentDrawCalls\":{},\"geometryBytes\":{},\"instanceBytes\":{},\"residentInstanceBytes\":{},\"instanceBufferReallocations\":{},\"deviceLost\":{}}}",
        json_escape(&value.backend),
        json_escape(&value.adapter),
        value.visible_instances,
        value.culled_instances,
        value.draw_calls,
        value.transparent_draw_calls,
        value.uploaded_geometry_bytes,
        value.uploaded_instance_bytes,
        value.resident_instance_buffer_bytes,
        value.instance_buffer_reallocations,
        value.device_lost,
    )
}

fn skipped_frame_json(reason: &str) -> String {
    format!(
        "{{\"cpuMicros\":0,\"gpuMicros\":null,\"visibleInstances\":0,\"culledInstances\":0,\"drawCalls\":0,\"skipped\":\"{reason}\"}}"
    )
}

fn web_time_micros() -> u64 {
    (js_sys::Date::now() * 1_000.0).max(0.0) as u64
}

fn js_error(error: impl ToString) -> JsValue {
    JsValue::from_str(&error.to_string())
}

fn json_escape(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}
