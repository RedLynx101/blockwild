use core::fmt;

/// Packed index/generation identity. Zero is reserved for "none" at ABI boundaries.
#[derive(Clone, Copy, Default, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct StableId(u64);

impl StableId {
    #[must_use]
    pub const fn new(index: u32, generation: u32) -> Self {
        Self((generation as u64) << 32 | index as u64)
    }

    #[must_use]
    pub const fn index(self) -> u32 {
        self.0 as u32
    }

    #[must_use]
    pub const fn generation(self) -> u32 {
        (self.0 >> 32) as u32
    }

    #[must_use]
    pub const fn packed(self) -> u64 {
        self.0
    }

    #[must_use]
    pub const fn is_none(self) -> bool {
        self.0 == 0
    }
}

impl fmt::Debug for StableId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}@{}", self.index(), self.generation())
    }
}

macro_rules! typed_ids {
    ($($name:ident),+ $(,)?) => {$ (
        #[derive(Clone, Copy, Debug, Default, Eq, Hash, Ord, PartialEq, PartialOrd)]
        pub struct $name(pub StableId);

        impl $name {
            #[must_use]
            pub const fn new(index: u32, generation: u32) -> Self {
                Self(StableId::new(index, generation))
            }

            #[must_use]
            pub const fn packed(self) -> u64 {
                self.0.packed()
            }
        }
    )+ };
}

typed_ids!(
    UniverseId,
    LocationId,
    ChunkId,
    SectionId,
    EntityId,
    PlayerId,
    CreatureId,
    NetworkId,
    MachineId,
    ItemId,
    BlockId,
    MobKindId,
    RecipeId,
    QuestId,
    ContentRevision,
);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stable_ids_preserve_index_and_generation() {
        let id = EntityId::new(0x1234_5678, 0x90ab_cdef);
        assert_eq!(id.0.index(), 0x1234_5678);
        assert_eq!(id.0.generation(), 0x90ab_cdef);
        assert_eq!(id.packed(), 0x90ab_cdef_1234_5678);
    }
}
