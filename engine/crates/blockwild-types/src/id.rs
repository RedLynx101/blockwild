use core::fmt;

use crate::hash::CanonicalHasher;

const PLAYER_ID_DERIVATION_DOMAIN_V1: &str = "blockwild.types.player-id.v1";
const LOCATION_ID_DERIVATION_DOMAIN_V1: &str = "blockwild.types.location-id.v1";

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

fn derive_scoped_id_v1(domain: &str, universe_key: &str, stable_key: &str) -> StableId {
    let mut hasher = CanonicalHasher::new(domain);
    hasher.write_str(universe_key);
    hasher.write_str(stable_key);
    let hash = hasher.finish();
    let mut packed = u64::from_le_bytes(hash.0[..8].try_into().expect("canonical hash low lane is eight bytes"));
    if packed == 0 {
        packed = 1;
    }
    StableId(packed)
}

/// Derives one non-zero, full-width player identity from stable authored keys.
///
/// The caller remains responsible for supplying canonical universe and player
/// keys. The byte contract is mirrored by the browser bootstrap boundary and
/// locked with cross-language golden vectors.
#[must_use]
pub fn derive_player_id_v1(universe_key: &str, player_key: &str) -> PlayerId {
    PlayerId(derive_scoped_id_v1(
        PLAYER_ID_DERIVATION_DOMAIN_V1,
        universe_key,
        player_key,
    ))
}

/// Derives one non-zero, full-width location identity from stable authored keys.
#[must_use]
pub fn derive_location_id_v1(universe_key: &str, location_key: &str) -> LocationId {
    LocationId(derive_scoped_id_v1(
        LOCATION_ID_DERIVATION_DOMAIN_V1,
        universe_key,
        location_key,
    ))
}

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

    #[test]
    fn scoped_player_and_location_ids_are_full_width_domain_separated_and_stable() {
        for line in include_str!("../fixtures/id-derivation-v1.txt").lines() {
            if line.starts_with('#') || line.is_empty() {
                continue;
            }
            let fields = line.split('|').collect::<Vec<_>>();
            assert_eq!(fields.len(), 5);
            assert_eq!(
                derive_player_id_v1(fields[0], fields[1]).packed(),
                fields[3].parse::<u64>().expect("fixture player id is u64")
            );
            assert_eq!(
                derive_location_id_v1(fields[0], fields[2]).packed(),
                fields[4].parse::<u64>().expect("fixture location id is u64")
            );
        }
        let player = derive_player_id_v1("blockwild:primary", "player:noah");
        let location = derive_location_id_v1("blockwild:primary", "surface:spawn");
        assert_ne!(player.packed(), 0);
        assert_ne!(location.packed(), 0);
        assert_ne!(player.packed(), location.packed());
        assert!(player.packed() > 9_007_199_254_740_991);
        assert!(location.packed() > 9_007_199_254_740_991);
        assert_eq!(player, derive_player_id_v1("blockwild:primary", "player:noah"));
        assert_eq!(location, derive_location_id_v1("blockwild:primary", "surface:spawn"));
    }
}
