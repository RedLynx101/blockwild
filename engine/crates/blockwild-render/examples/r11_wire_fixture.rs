use std::env;
use std::fs;
use std::path::PathBuf;

use blockwild_render::{canonical_integrated_scene_v2, encode_render_frame_v2, encode_render_resource_batch_v2};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let output = env::args_os()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("tests/fixtures/rust-engine/r11-renderer"));
    fs::create_dir_all(&output)?;
    let (resources, frame) = canonical_integrated_scene_v2(640, 360)?;
    let resource_bytes = encode_render_resource_batch_v2(&resources)?;
    let frame_bytes = encode_render_frame_v2(&frame)?;
    fs::write(output.join("canonical-resources.bwrd"), &resource_bytes)?;
    fs::write(output.join("canonical-frame.bwrf"), &frame_bytes)?;
    println!(
        "renderer_wire_fixture path={} resources={} frame={} resource_hash={:?} frame_hash={:?}",
        output.display(),
        resource_bytes.len(),
        frame_bytes.len(),
        resources.batch_hash,
        frame.frame_hash,
    );
    Ok(())
}
