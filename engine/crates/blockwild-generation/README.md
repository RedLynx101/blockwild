# blockwild-generation

Renderer- and browser-neutral terrain authority for Blockwild generator v18.

The crate owns the deterministic whole-chunk operation behind
`GenerateChunkRequestV2`: canonical request/result hashing, normalized generation
profiles, climate and biome sampling, surface and subsurface material generation,
caves and sealed aquifers, rivers and oceans, ores, bounded flora/structure/POI
metadata, edit application, final metadata extraction, cancellation, stale-result
rejection, and a bounded content-addressed cache.

## Authority rule

The browser bridge fails closed unless the artifact's embedded certificate
matches the browser generator/content identity and the checked-in 131-case
promotion manifest. That manifest covers every current dungeon, mythic POI,
dragon/sea-dragon lair stage, legendary site, settlement culture, guild/road/
ferry/waypost marker family, ocean and cave case, negative-coordinate sweep,
disabled structures, and edited-save regeneration. Every block, heightmap,
biome column, light stream, sparse index, and canonical marker row is exact.
The certified worker is authoritative; the synchronous TypeScript generator is
only the emergency fallback if artifact loading or certification fails. The
worker never constructs `ChunkWorld` or imports Three.js.

## Validation

```text
cargo fmt --all -- --check
cargo check -p blockwild-generation --all-targets
cargo clippy -p blockwild-generation --all-targets -- -D warnings
cargo test -p blockwild-generation
cargo run -p blockwild-generation --release --bin blockwild-generation-fixture -- 10000
npm.cmd exec --yes tsx -- --test tests/rust-terrain-generation-promotion-corpus.test.ts
npm.cmd exec --yes tsx -- --test tests/rust-terrain-generation-wasm-parity.test.ts
npm.cmd exec --yes tsx -- scripts/verify-rust-generation-r3-browser.ts
```

The fixture exercises cold and warm cache paths over deterministic positive and
negative seed/chunk coordinates and prints a replay hash suitable for CI trend
tracking. Its bounded `--packet-benchmark` mode consumes the same length-framed
request corpus used by the browser verifier, emits exact result packets, and
reports cold plus warm p50/p95/p99 timings without process-startup noise.
