//! Deterministic entity, ecology, and creature render-extraction authority.
//!
//! This crate is deliberately renderer and platform neutral. Browser handles,
//! Three.js objects, WebGPU resources, audio nodes, and persistence APIs stay in
//! adapters. The types here are suitable for native tools and Wasm authority.

mod authority;
mod broadphase;
mod components;
mod ecology;
mod fixture;
mod jobs;
mod model;
mod movement;
mod schedule;
mod snapshot;

pub use authority::*;
pub use broadphase::*;
pub use components::*;
pub use ecology::*;
pub use fixture::*;
pub use jobs::*;
pub use model::*;
pub use movement::*;
pub use schedule::*;
pub use snapshot::*;

#[cfg(test)]
mod tests;
