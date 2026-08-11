fn main() {
    let iterations = std::env::args()
        .nth(1)
        .and_then(|value| value.parse::<u32>().ok())
        .unwrap_or(100);
    let started = std::time::Instant::now();
    let mut report = blockwild_gameplay::run_reference_fixture();
    for _ in 1..iterations {
        report = blockwild_gameplay::run_reference_fixture();
    }
    let elapsed = started.elapsed();
    println!("iterations={iterations}");
    println!("accepted_batches={}", report.accepted_batches);
    println!("final_revision={}", report.final_revision);
    println!("state_hash={}", report.state_hash.to_hex());
    println!("replay_hash={}", report.replay_hash.to_hex());
    println!("elapsed_us={}", elapsed.as_micros());
}
