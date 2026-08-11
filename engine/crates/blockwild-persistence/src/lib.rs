//! Deterministic, renderer-independent Blockwild save authority.
//!
//! Rust owns schemas, record addressing, journal validation, checkpoint
//! compaction, migration fingerprints, recovery decisions, and portable wire
//! bytes. Browser TypeScript remains a narrow IndexedDB transaction adapter.

mod checkpoint;
mod contract;
mod journal;
mod migration;
mod repair;
mod wire;

pub use checkpoint::*;
pub use contract::*;
pub use journal::*;
pub use migration::*;
pub use repair::*;
pub use wire::*;

#[cfg(test)]
mod tests;
