//! Deterministic primitive types shared by every Blockwild engine target.

mod coords;
mod hash;
mod id;
mod spatial;

pub use coords::{
    BlockIndexError, BlockPos, CHUNK_SIZE, ChunkPos, LocalBlockPos, MAX_Y, MIN_Y, SECTION_HEIGHT, WORLD_HEIGHT,
    WorldAddress, block_index, block_position_from_index, split_coordinate,
};
pub use hash::{
    CanonicalHash, CanonicalHasher, FNV1A_32_OFFSET, FNV1A_32_PRIME, fnv1a_utf16, fnv1a_utf16_units, hash2, hash2_bits,
    hash3, hash3_bits, seed_stream,
};
pub use id::{
    BlockId, ChunkId, ContentRevision, CreatureId, EntityId, ItemId, LocationId, MachineId, MobKindId, NetworkId,
    PlayerId, QuestId, RecipeId, SectionId, StableId, UniverseId,
};
pub use spatial::{
    Aabb, AabbBatchQuery, AabbBatchResult, Ray, RayBatchQuery, RayBatchResult, SpatialEntry, SpatialIndex,
};
