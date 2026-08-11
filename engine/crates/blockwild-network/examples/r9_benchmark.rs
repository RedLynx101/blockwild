use blockwild_network::{canonical_network_fixture_v1, run_network_native_benchmark_v1, run_network_replay_v1};

fn main() {
    let fixture = canonical_network_fixture_v1().expect("canonical R9 fixture");
    let replay = run_network_replay_v1(&fixture.replay).expect("canonical R9 replay");
    let result = run_network_native_benchmark_v1(2_000).expect("R9 native benchmark");
    println!(
        "handshake={} interest={} human_command={} agent_command={} delta={} checkpoint={} final_state={} replay={}",
        fixture.host_handshake.handshake_hash.to_hex(),
        fixture.interest.interest_hash.to_hex(),
        fixture.human_command.command_hash.to_hex(),
        fixture.agent_command.command_hash.to_hex(),
        fixture.delta.delta_hash.to_hex(),
        fixture.checkpoint.checkpoint_hash.to_hex(),
        replay.final_state_hash.to_hex(),
        replay.replay_hash.to_hex(),
    );
    println!(
        "iterations={} command_us={} delta_us={} replay_us={} digest={}",
        result.iterations,
        result.command_micros,
        result.delta_micros,
        result.replay_micros,
        result.digest.to_hex(),
    );
}
