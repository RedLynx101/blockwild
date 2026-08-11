//! Deterministic R2 section snapshots, opaque terrain meshing, and voxel light.
//!
//! The crate is renderer- and platform-neutral. It owns an entire eligible
//! section result or explicitly declines it so the TypeScript oracle remains
//! authoritative for specialty shapes and material layers during migration.

mod catalog;
mod contract;
mod lighting;
mod material;
mod mesh;
mod wire;

pub use catalog::{CanonicalLiquidV1, CanonicalShapeV1, CanonicalSpecialtyMaterialV1};
pub use contract::*;
pub use lighting::*;
pub use material::*;
pub use mesh::*;
pub use wire::*;

#[cfg(test)]
mod tests;
