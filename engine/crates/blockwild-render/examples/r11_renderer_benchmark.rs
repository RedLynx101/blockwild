#![cfg_attr(target_arch = "wasm32", allow(dead_code, unused_imports))]

use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

use blockwild_render::{
    RenderFrameInputV2, RenderFrameV2, WgpuSceneRendererV2, canonical_live_canvas_scene_v2,
    decode_compiled_model_catalog_v2,
};

const WIDTH: u32 = 1280;
const HEIGHT: u32 = 720;
const WARMUP_FRAMES: u64 = 30;
const MEASURED_FRAMES: u64 = 180;

#[cfg(not(target_arch = "wasm32"))]
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let output = env::args_os()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("../work/hybrid-rust-migration/renderer-r11/native-benchmark.json"));
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent)?;
    }
    let catalog_path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../public/renderer/12c522f880e94c1ae527de701ae3e710fee13701d66fbb0a4ad24895557011b4/models.bwm2");
    let catalog = decode_compiled_model_catalog_v2(&fs::read(catalog_path)?)?;
    let scene = canonical_live_canvas_scene_v2(&catalog, [WIDTH, HEIGHT])?;
    let mut renderer = pollster::block_on(WgpuSceneRendererV2::new_offscreen(WIDTH, HEIGHT))
        .map_err(|diagnostic| diagnostic.message)?;
    renderer.apply_resource_batch(&scene.resources)?;
    for sequence in 1..=WARMUP_FRAMES {
        let frame = animation_frame(&scene.frame, sequence)?;
        renderer.render_present_only(&frame)?;
    }
    let mut micros = Vec::with_capacity(MEASURED_FRAMES as usize);
    let mut last = None;
    for sequence in 1..=MEASURED_FRAMES {
        let frame = animation_frame(&scene.frame, WARMUP_FRAMES + sequence)?;
        let started = Instant::now();
        last = Some(renderer.render_present_only(&frame)?);
        micros.push(started.elapsed().as_secs_f64() * 1_000_000.0);
    }
    micros.sort_by(f64::total_cmp);
    let mean = micros.iter().sum::<f64>() / micros.len() as f64;
    let p50 = percentile(&micros, 0.50);
    let p95 = percentile(&micros, 0.95);
    let p99 = percentile(&micros, 0.99);
    let diagnostics = last.ok_or("renderer benchmark submitted no frames")?;
    let json = format!(
        "{{\n  \"schema\": 1,\n  \"renderer\": \"blockwild-wgpu-r11\",\n  \"adapter\": \"{}\",\n  \"backend\": \"{}\",\n  \"width\": {WIDTH},\n  \"height\": {HEIGHT},\n  \"warmupFrames\": {WARMUP_FRAMES},\n  \"measuredFrames\": {MEASURED_FRAMES},\n  \"instances\": {},\n  \"particles\": {},\n  \"drawCalls\": {},\n  \"visibleInstances\": {},\n  \"culledInstances\": {},\n  \"residentGeometryBytes\": {},\n  \"residentTextureBytes\": {},\n  \"residentInstanceBytes\": {},\n  \"uploadedTextureBytes\": {},\n  \"instanceBufferReallocations\": {},\n  \"cpuSubmitMicros\": {{\"mean\": {:.2}, \"p50\": {:.2}, \"p95\": {:.2}, \"p99\": {:.2}}}\n}}\n",
        escape_json(&diagnostics.adapter),
        escape_json(&diagnostics.backend),
        scene.frame.instances.len(),
        scene.frame.particles.len(),
        diagnostics.draw_calls,
        diagnostics.visible_instances,
        diagnostics.culled_instances,
        diagnostics.resident_geometry_bytes,
        diagnostics.resident_texture_bytes,
        diagnostics.resident_instance_buffer_bytes,
        diagnostics.uploaded_texture_bytes,
        diagnostics.instance_buffer_reallocations,
        mean,
        p50,
        p95,
        p99,
    );
    fs::write(&output, json)?;
    println!(
        "renderer_benchmark=ok path={} mean_us={mean:.2} p95_us={p95:.2} draws={} visible={}",
        output.display(),
        diagnostics.draw_calls,
        diagnostics.visible_instances,
    );
    Ok(())
}

#[cfg(target_arch = "wasm32")]
fn main() {}

fn animation_frame(
    source: &RenderFrameV2,
    sequence: u64,
) -> Result<RenderFrameV2, blockwild_render::RenderExtractionError> {
    RenderFrameV2::create(RenderFrameInputV2 {
        epoch: source.epoch,
        frame_sequence: sequence,
        simulation_tick: sequence,
        animation_time_micros: sequence.saturating_mul(16_667),
        resource_revision: source.resource_revision,
        camera: source.camera,
        environment: source.environment,
        instances: source.instances.clone(),
        particles: source.particles.clone(),
    })
}

fn percentile(sorted: &[f64], percentile: f64) -> f64 {
    let index = ((sorted.len() - 1) as f64 * percentile).round() as usize;
    sorted[index]
}

fn escape_json(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}
