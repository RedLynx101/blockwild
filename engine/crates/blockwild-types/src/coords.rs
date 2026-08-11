use core::fmt;

/// Width and depth of a Blockwild chunk in blocks.
pub const CHUNK_SIZE: i32 = 16;
/// Inclusive bottom of the current overworld profile.
pub const MIN_Y: i32 = -64;
/// Inclusive top of the current overworld profile.
pub const MAX_Y: i32 = 127;
/// Number of vertical blocks in a chunk column.
pub const WORLD_HEIGHT: i32 = MAX_Y - MIN_Y + 1;
/// Height of a renderer/simulation section.
pub const SECTION_HEIGHT: i32 = 16;

/// Exact integer block coordinate in a location.
#[derive(Clone, Copy, Debug, Default, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct BlockPos {
    pub x: i32,
    pub y: i32,
    pub z: i32,
}

/// Horizontal chunk coordinate in a location.
#[derive(Clone, Copy, Debug, Default, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct ChunkPos {
    pub x: i32,
    pub z: i32,
}

/// Validated block coordinate within one chunk column.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct LocalBlockPos {
    pub x: u8,
    pub y: i32,
    pub z: u8,
}

/// Location-aware address that remains valid when planets and orbit shards are added.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct WorldAddress {
    pub universe: crate::UniverseId,
    pub location: crate::LocationId,
    pub chunk: ChunkPos,
    pub section_y: i16,
    pub local_index: u16,
}

/// Invalid coordinate supplied to canonical block indexing.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BlockIndexError {
    LocalX(i32),
    Y(i32),
    LocalZ(i32),
    Index(usize),
}

impl fmt::Display for BlockIndexError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::LocalX(value) => write!(formatter, "local x {value} is outside 0..{CHUNK_SIZE}"),
            Self::Y(value) => write!(formatter, "y {value} is outside {MIN_Y}..={MAX_Y}"),
            Self::LocalZ(value) => write!(formatter, "local z {value} is outside 0..{CHUNK_SIZE}"),
            Self::Index(value) => write!(formatter, "block index {value} is outside the chunk column"),
        }
    }
}

impl std::error::Error for BlockIndexError {}

/// Split a world block coordinate using Euclidean division, including negatives.
#[must_use]
pub const fn split_coordinate(value: i32) -> (i32, u8) {
    let chunk = value.div_euclid(CHUNK_SIZE);
    let local = value.rem_euclid(CHUNK_SIZE) as u8;
    (chunk, local)
}

/// Match the TypeScript chunk layout: x + z*16 + (y-MIN_Y)*256.
pub fn block_index(local_x: i32, y: i32, local_z: i32) -> Result<usize, BlockIndexError> {
    if !(0..CHUNK_SIZE).contains(&local_x) {
        return Err(BlockIndexError::LocalX(local_x));
    }
    if !(MIN_Y..=MAX_Y).contains(&y) {
        return Err(BlockIndexError::Y(y));
    }
    if !(0..CHUNK_SIZE).contains(&local_z) {
        return Err(BlockIndexError::LocalZ(local_z));
    }
    let layer = usize::try_from(y - MIN_Y).expect("validated y offset is non-negative");
    Ok(usize::try_from(local_x).expect("validated local x is non-negative")
        + usize::try_from(local_z).expect("validated local z is non-negative") * CHUNK_SIZE as usize
        + layer * (CHUNK_SIZE * CHUNK_SIZE) as usize)
}

/// Inverse of [`block_index`].
pub fn block_position_from_index(index: usize) -> Result<LocalBlockPos, BlockIndexError> {
    let layer_size = (CHUNK_SIZE * CHUNK_SIZE) as usize;
    let block_count = layer_size * WORLD_HEIGHT as usize;
    if index >= block_count {
        return Err(BlockIndexError::Index(index));
    }
    let layer = index / layer_size;
    let horizontal = index % layer_size;
    Ok(LocalBlockPos {
        x: (horizontal % CHUNK_SIZE as usize) as u8,
        y: MIN_Y + layer as i32,
        z: (horizontal / CHUNK_SIZE as usize) as u8,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn negative_coordinates_use_euclidean_chunks() {
        assert_eq!(split_coordinate(-1), (-1, 15));
        assert_eq!(split_coordinate(-16), (-1, 0));
        assert_eq!(split_coordinate(-17), (-2, 15));
        assert_eq!(split_coordinate(16), (1, 0));
    }

    #[test]
    fn block_index_matches_typescript_layout_and_round_trips() {
        let vectors = [
            (0, MIN_Y, 0, 0),
            (15, MIN_Y, 15, 255),
            (0, MIN_Y + 1, 0, 256),
            (15, MAX_Y, 15, WORLD_HEIGHT as usize * 256 - 1),
        ];
        for (x, y, z, expected) in vectors {
            let index = block_index(x, y, z).unwrap();
            assert_eq!(index, expected);
            assert_eq!(
                block_position_from_index(index).unwrap(),
                LocalBlockPos {
                    x: x as u8,
                    y,
                    z: z as u8
                }
            );
        }
    }
}
