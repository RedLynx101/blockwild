//! Deterministic, platform-neutral authority for Blockwild's bounded gameplay domains.
//!
//! The crate deliberately owns validation and state transitions, while presentation,
//! networking, persistence, and content authoring remain adapters around it.

mod authority;
mod cardforge;
mod combat;
mod content_manifest;
mod contract;
mod fixture;
mod inventory;
mod machines;
mod metadata_store;
mod progression;
mod snapshot;

pub use authority::{GameplayAuthority, GameplayState, ReplayEntry};
pub use cardforge::*;
pub use combat::*;
pub use content_manifest::*;
pub use contract::*;
pub use fixture::{FixtureReport, run_reference_fixture};
pub use inventory::*;
pub use machines::*;
pub use metadata_store::*;
pub use progression::*;
pub use snapshot::*;

#[cfg(test)]
mod tests;
