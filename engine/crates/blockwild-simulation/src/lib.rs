//! Deterministic R5 simulation kernels for Blockwild.
//!
//! Every public job is coarse, bounded, and revision-bound. Unknown world
//! cells fail closed for collision and leak for atmosphere topology.

mod air;
mod collision;
mod contract;
pub mod fixture;
mod liquid;
mod navigation;
mod profile;
mod projectile;
mod swimming;

pub use air::*;
pub use collision::*;
pub use contract::*;
pub use liquid::*;
pub use navigation::*;
pub use profile::*;
pub use projectile::*;
pub use swimming::*;

#[cfg(test)]
mod tests;
