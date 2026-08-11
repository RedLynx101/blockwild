# blockwild-network

Deterministic, platform-independent multiplayer and agent authority for
Blockwild's R9 engine migration.

The crate owns canonical compatibility negotiation, bounded binary payloads,
host grants, expected-revision authorization, idempotency, leases, interest
selection, delta/keyframe validation, reconnect checkpoints, desync evidence,
agent observations, and bounded task execution. WebRTC signaling, data-channel
selection, voice, TTS, and media playback remain browser/platform concerns.

Every command—human or agent—passes through `NetworkAuthorityV1::authorize`.
Callers must decode and validate a complete wire value before invoking
authority; failed decoding and rejected commands do not alter authoritative
grants, sequences, leases, receipts, or replicated state.

## Native verification

From `engine/` after adding the crate to the workspace:

```text
cargo fmt --all -- --check
cargo check -p blockwild-network --all-targets
cargo clippy -p blockwild-network --all-targets -- -D warnings
cargo test -p blockwild-network
cargo run -p blockwild-network --example r9_benchmark --release
```

The benchmark is a deterministic native fixture hook, not a browser/network
latency claim.
