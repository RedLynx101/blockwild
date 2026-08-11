# Blockwild WebGPU renderer surface

This narrow Wasm adapter binds an `OffscreenCanvas` to the renderer-neutral
`blockwild-render` scene core. It accepts only extraction V2 resource/frame
wire pages and exposes no game-state or per-voxel callback.

The adapter owns surface configuration and recovery. Durable resource pages
are retained in bounded revision order so a lost WebGPU device can be rebuilt
without asking simulation to reconstruct presentation state. The browser
service keeps at most one submitted frame and one replaceable pending frame.

Adapter acquisition is explicit and bounded. The worker attempts the requested
power preference and reports a structured capability failure when WebGPU is
unavailable; it does not crash, silently create a software oracle, or mutate
scene state. Surface resize, device recovery, and resource replay preserve the
same revision rules as the native scene store.

Build it for `wasm32-unknown-unknown` with `wasm-bindgen` or the repository's
content-addressed renderer publishing script. Native renderer behavior remains
tested in `blockwild-render`; this crate is intentionally a browser-only edge.

The `/renderer-lab` route exercises this adapter directly. A successful lab is
necessary but not sufficient for primary-runtime promotion: live-game visual
parity and the normal-path Three.js retirement audit remain separate gates.
