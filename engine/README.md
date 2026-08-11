# Blockwild Rust engine

This workspace is the migration-safe native and WebAssembly foundation for
Blockwild. It intentionally starts with a small dependency graph:

```text
blockwild-types <- blockwild-protocol <- blockwild-engine <- blockwild-wasm
       ^                    ^                  ^
       +---------------- blockwild-render ----+---- blockwild-tools
```

The TypeScript game remains authoritative during R0 and R1. These crates are a
shadow implementation and differential-test target until a later phase earns a
specific authority promotion.

## Reproducible commands

From this directory:

```powershell
cargo fmt --all --check
cargo check --workspace --all-targets
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
cargo check --workspace --target wasm32-unknown-unknown
cargo run -p blockwild-tools -- replay-self-test
cargo run -p blockwild-tools -- benchmark 10000
cargo run -p blockwild-tools -- render-smoke --output target/blockwild-smoke.ppm
```

`render-smoke` is capability-sensitive. A machine without a usable adapter
must return structured diagnostics rather than panic. The authoritative crates
never depend on GPU availability.

The default `blockwild-wasm` artifact contains only the authoritative facade.
Build it with `--features renderer` to produce the separate browser-renderer
laboratory artifact containing the async `blockwild_render_smoke()` WebGPU
probe and canonical scene fixture export. This prevents the R0 engine heartbeat
from paying the renderer's download cost.

## Protocol contract

Every browser/worker message uses a 32-byte, little-endian `BWEP` envelope:

| Offset | Width | Field |
| ---: | ---: | --- |
| 0 | 4 | magic (`BWEP`) |
| 4 | 2 | protocol version |
| 6 | 2 | payload schema version |
| 8 | 2 | message kind |
| 10 | 2 | flags |
| 12 | 4 | request id |
| 16 | 4 | epoch |
| 20 | 4 | payload length |
| 24 | 8 | ownership token |

Unknown required flags, invalid lengths, and unsupported versions fail as
structured protocol errors. No JavaScript object graph crosses the engine ABI.
