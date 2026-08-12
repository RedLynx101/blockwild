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

## Texture and material contract

Legacy Extraction V2 resources retain byte-identical `BWRD` encoding. The
additive resource flag carries explicit sampler and atlas metadata plus a
material-to-texture binding only when those records are present. The renderer
therefore accepts shipped legacy terrain pages while new producers can declare
color space, mag/min filtering, disabled mipmaps, U/V wrapping, atlas
grid/tile size, pixel origin, tile-edge inset, geometry-global versus
material-tile UVs, and frame-authoritative water scrolling without a schema
fork. Texture bindings carry exact `f32` opacity, so authored Three values are
not rounded through the legacy 8-bit base-color alpha.

`material_contract.rs` freezes the current Three terrain behavior: sRGB,
nearest filtering, clamp-to-edge, no mipmaps, `0.32` cutout, `0.20` emissive
cutout, `0.86` depth-writing ice, `0.76` water/transparent, and `0.42` glass.
The production atlas is 256 x 256 pixels with a 16 x 16 tile grid. Texture
records own their RGBA allocation and the scene store rejects dangling
material bindings transactionally.

## Validation

Use the repository-level renderer scripts and Cargo gates:

```text
cargo fmt -p blockwild-render -- --check
cargo clippy -p blockwild-render --all-targets -- -D warnings
cargo test -p blockwild-render --all-targets
node --import tsx scripts/compile-render-model-catalog.ts --check
node --import tsx scripts/verify-rust-render-material-codec-r11.ts
node --import tsx scripts/verify-rust-render-visuals.ts --skip-render
```

The deterministic visual matrix is deliberately a renderer fixture, not proof
that the primary game runtime has been promoted. Production promotion still
requires same-camera, same-state live-game captures against the separately
loaded Three compatibility oracle and must not happen while the normal runtime
still imports Three.js.
