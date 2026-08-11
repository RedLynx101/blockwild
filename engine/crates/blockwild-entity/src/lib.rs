//! Deterministic entity, ecology, and creature render-extraction authority.
//!
//! This crate is deliberately renderer and platform neutral. Browser handles,
//! Three.js objects, WebGPU resources, audio nodes, and persistence APIs stay in
//! adapters. The types here are suitable for native tools and Wasm authority.

mod authority;
mod broadphase;
mod ecology;
mod fixture;
mod model;
mod movement;
mod schedule;

pub use authority::*;
pub use broadphase::*;
pub use ecology::*;
pub use fixture::*;
pub use model::*;
pub use movement::*;
pub use schedule::*;

#[cfg(test)]
mod tests;
