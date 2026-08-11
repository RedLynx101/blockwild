# Blockwild render core

`blockwild-render` is the renderer-owned, deterministic scene layer for the
hybrid Rust engine. It consumes coarse extraction V2 resource and frame pages;
it never reaches back into gameplay state, performs per-voxel callbacks, or
scrapes Three.js objects at runtime.

The crate provides:

- revision-checked resource and frame wire codecs;
- persistent geometry, material, instance, and animation pages;
- hierarchical authored-model transforms and deterministic animation;
- frustum culling, opaque batching, and stable transparent ordering;
- terrain atlas materials, water, ice, glass, emission, particles, weather,
  fog, caves, sky, and celestial presentation;
- an offscreen `wgpu` renderer, diagnostics, deterministic visual fixtures,
  and a native benchmark hook.

The build-time model compiler is the only compatibility seam allowed to read
the existing authored Three.js model factories. It emits a content-addressed
`BWM2` catalog that this crate decodes without depending on Three.js.

## Validation

Use the repository-level renderer scripts and Cargo gates:

```text
cargo fmt -p blockwild-render -- --check
cargo clippy -p blockwild-render --all-targets -- -D warnings
cargo test -p blockwild-render --all-targets
node --import tsx scripts/compile-render-model-catalog.ts --check
node --import tsx scripts/verify-rust-render-visuals.ts --skip-render
```

The deterministic visual matrix is deliberately a renderer fixture, not proof
that the primary game runtime has been promoted. Production promotion still
requires same-camera, same-state live-game captures against the separately
loaded Three compatibility oracle and must not happen while the normal runtime
still imports Three.js.
