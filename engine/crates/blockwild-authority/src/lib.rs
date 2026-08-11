//! Blockwild's deterministic R4 authoritative world store.
//!
//! This crate is intentionally browser- and renderer-independent. Browser
//! workers exchange bounded batches and immutable pages with it; no runtime
//! system should issue synchronous per-voxel Wasm calls.

mod cache;
mod canonical;
mod codec;
mod contract;
mod read_page;
mod replay;
mod residency;
mod store;

pub use cache::*;
pub use codec::*;
pub use contract::*;
pub use read_page::*;
pub use replay::*;
pub use residency::*;
pub use store::*;

#[cfg(test)]
mod tests;
