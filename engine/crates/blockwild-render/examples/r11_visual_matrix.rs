use std::env;
use std::fmt::Write as _;
use std::fs;
use std::path::{Path, PathBuf};

use blockwild_render::{
    WgpuSceneRendererV2, canonical_visual_matrix_v2, decode_compiled_model_catalog_v2, encode_render_frame_v2,
    encode_render_resource_batch_v2,
};

const WIDTH: u32 = 640;
const HEIGHT: u32 = 360;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let arguments = env::args_os().skip(1).collect::<Vec<_>>();
    let fixtures_only = arguments.iter().any(|value| value == "--fixtures-only");
    let output = arguments
        .iter()
        .find(|value| *value != "--fixtures-only")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("../work/hybrid-rust-migration/renderer-r11/visual-matrix"));
    fs::create_dir_all(&output)?;
    let catalog_path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../public/renderer/12c522f880e94c1ae527de701ae3e710fee13701d66fbb0a4ad24895557011b4/models.bwm2");
    let catalog = decode_compiled_model_catalog_v2(&fs::read(catalog_path)?)?;
    let scenes = canonical_visual_matrix_v2(&catalog, [WIDTH, HEIGHT])?;
    let live = scenes.first().ok_or("canonical visual matrix is empty")?;
    fs::write(
        output.join("live-resources.bwrd"),
        encode_render_resource_batch_v2(&live.resources)?,
    )?;
    fs::write(output.join("live-frame.bwrf"), encode_render_frame_v2(&live.frame)?)?;

    let mut records = Vec::with_capacity(scenes.len());
    for scene in &scenes {
        let mut record = SceneRecord {
            name: scene.name.clone(),
            purpose: scene.purpose.clone(),
            width: scene.frame.camera.viewport[0],
            height: scene.frame.camera.viewport[1],
            instances: scene.frame.instances.len(),
            particles: scene.frame.particles.len(),
            draw_calls: 0,
            culled: 0,
            rgba_bytes: 0,
            tolerance: scene.diff_policy.per_channel_tolerance,
            max_mismatched_pixels: scene.diff_policy.max_mismatched_pixels,
        };
        if !fixtures_only {
            let mut renderer = pollster::block_on(WgpuSceneRendererV2::new_offscreen(record.width, record.height))
                .map_err(|diagnostic| diagnostic.message)?;
            renderer.apply_resource_batch(&scene.resources)?;
            let artifact = renderer.render(&scene.frame)?;
            let expected = usize::try_from(record.width * record.height * 4)?;
            if artifact.rgba8.len() != expected {
                return Err(format!(
                    "{} readback was {} bytes, expected {expected}",
                    scene.name,
                    artifact.rgba8.len()
                )
                .into());
            }
            fs::write(output.join(format!("{}.rgba", scene.name)), &artifact.rgba8)?;
            record.draw_calls = artifact.diagnostics.draw_calls;
            record.culled = artifact.diagnostics.culled_instances;
            record.rgba_bytes = artifact.rgba8.len();
        }
        records.push(record);
    }
    fs::write(output.join("matrix.json"), matrix_json(&records, fixtures_only))?;
    println!(
        "renderer_visual_matrix=ok path={} scenes={} fixtures_only={} instances={} particles={}",
        output.display(),
        records.len(),
        fixtures_only,
        records.iter().map(|record| record.instances).sum::<usize>(),
        records.iter().map(|record| record.particles).sum::<usize>(),
    );
    Ok(())
}

struct SceneRecord {
    name: String,
    purpose: String,
    width: u32,
    height: u32,
    instances: usize,
    particles: usize,
    draw_calls: u32,
    culled: u32,
    rgba_bytes: usize,
    tolerance: u8,
    max_mismatched_pixels: u32,
}

fn matrix_json(records: &[SceneRecord], fixtures_only: bool) -> String {
    let mut output = format!(
        "{{\n  \"schema\": 1,\n  \"renderer\": \"blockwild-wgpu-r11\",\n  \"fixturesOnly\": {fixtures_only},\n  \"scenes\": [\n"
    );
    for (index, record) in records.iter().enumerate() {
        let comma = if index + 1 == records.len() { "" } else { "," };
        let _ = writeln!(
            output,
            "    {{\"name\":\"{}\",\"purpose\":\"{}\",\"width\":{},\"height\":{},\"instances\":{},\"particles\":{},\"drawCalls\":{},\"culled\":{},\"rgbaBytes\":{},\"policy\":{{\"perChannelTolerance\":{},\"maxMismatchedPixels\":{}}}}}{comma}",
            json_escape(&record.name),
            json_escape(&record.purpose),
            record.width,
            record.height,
            record.instances,
            record.particles,
            record.draw_calls,
            record.culled,
            record.rgba_bytes,
            record.tolerance,
            record.max_mismatched_pixels,
        );
    }
    output.push_str("  ]\n}\n");
    output
}

fn json_escape(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}
