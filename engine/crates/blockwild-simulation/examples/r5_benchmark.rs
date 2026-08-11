use blockwild_simulation::fixture::{canonical_fixture, run_native_benchmark};

fn main() {
    let fixture = canonical_fixture();
    println!(
        "snapshot={} physics_input={} liquid_input={} path_input={} air_input={}",
        fixture.physics.window.snapshot_hash.to_hex(),
        fixture.physics.input_hash.to_hex(),
        fixture.liquid.input_hash.to_hex(),
        fixture.path.input_hash.to_hex(),
        fixture.air.input_hash.to_hex(),
    );
    let report = run_native_benchmark(2_000);
    println!(
        "iterations={} physics_us={} liquid_us={} path_us={} air_us={} digest={:016x}",
        report.iterations,
        report.physics_micros,
        report.liquid_micros,
        report.path_micros,
        report.air_micros,
        report.digest,
    );
}
