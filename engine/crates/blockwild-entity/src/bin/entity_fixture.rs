#[cfg(not(target_arch = "wasm32"))]
fn main() {
    let result = blockwild_entity::run_entity_fixture(100)
        .and_then(|fixture| blockwild_entity::benchmark_entity_workload(100, 10).map(|benchmark| (fixture, benchmark)));
    match result {
        Ok((fixture, benchmark)) => println!(
            "{} iterations={} elapsed_ns={} workload_hash={}",
            fixture.canonical_summary(),
            benchmark.workload.iterations,
            benchmark.elapsed_nanoseconds,
            benchmark.workload.checksum.to_hex(),
        ),
        Err(error) => {
            eprintln!("entity fixture failed: {error}");
            std::process::exit(1);
        }
    }
}

#[cfg(target_arch = "wasm32")]
fn main() {
    let _ = blockwild_entity::run_entity_workload(100, 10);
}
