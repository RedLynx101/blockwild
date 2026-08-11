#![forbid(unsafe_code)]

#[cfg(target_arch = "wasm32")]
mod web;

#[cfg(target_arch = "wasm32")]
pub use web::*;

#[cfg(not(target_arch = "wasm32"))]
/// Native marker used by workspace checks. The actual native renderer lives in
/// `blockwild-render`; this crate only owns the browser surface boundary.
pub const BLOCKWILD_RENDER_WEB_TARGET: &str = "wasm32-unknown-unknown";
