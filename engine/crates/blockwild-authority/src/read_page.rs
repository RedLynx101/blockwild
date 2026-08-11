use std::collections::BTreeSet;
use std::sync::Arc;

use blockwild_types::CanonicalHasher;

use crate::canonical::{write_identity, write_section_revision};
use crate::{
    AddressedSectionRevisionV1, AuthorityError, AuthorityResult, CellPositionV1, LiquidMetadataV1,
    WORLD_AIR_BLOCK_ID_V1, WORLD_AUTHORITY_SCHEMA_V1, WORLD_BEDROCK_BLOCK_ID_V1, WORLD_MAX_Y_V1, WORLD_MIN_Y_V1,
    WORLD_READ_WINDOW_MAX_CELLS_V1, WORLD_UNLOADED_BLOCK_ID_V1, WorldAddressV1, WorldAuthorityIdentityV1,
    WorldBoundaryKindV1, WorldCellReadV1, WorldCellV1, WorldSectionAddressV1, WorldSectionRevisionV1,
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ReadOriginV1 {
    pub x: i32,
    pub y: i32,
    pub z: i32,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ReadSizeV1 {
    pub x: u16,
    pub y: u16,
    pub z: u16,
}

impl ReadSizeV1 {
    pub fn cell_count(self) -> AuthorityResult<usize> {
        if self.x == 0 || self.y == 0 || self.z == 0 || self.x > 256 || self.y > 256 || self.z > 256 {
            return Err(AuthorityError::new(
                "read-size",
                "read page dimensions must each be in 1..256",
            ));
        }
        let count = usize::from(self.x)
            .checked_mul(usize::from(self.y))
            .and_then(|value| value.checked_mul(usize::from(self.z)))
            .ok_or_else(|| AuthorityError::new("read-size", "read page cell count overflowed"))?;
        if count > WORLD_READ_WINDOW_MAX_CELLS_V1 {
            return Err(AuthorityError::new(
                "window-too-large",
                format!("read page exceeds {WORLD_READ_WINDOW_MAX_CELLS_V1} cells"),
            ));
        }
        Ok(count)
    }
}

pub trait WorldReadSourceV1 {
    fn address(&self) -> &WorldAddressV1;
    fn identity(&self) -> WorldAuthorityIdentityV1;
    fn read_authoritative_cell(&self, position: CellPositionV1) -> WorldCellReadV1;
    fn section_cells(&self, address: &WorldSectionAddressV1) -> Option<&[WorldCellV1]>;
    fn section_revision(&self, address: &WorldSectionAddressV1) -> Option<WorldSectionRevisionV1>;
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorldReadPageStreamsV1 {
    pub loaded_mask: Arc<[u8]>,
    pub boundary: Arc<[u8]>,
    pub blocks: Arc<[u16]>,
    pub facing: Arc<[u8]>,
    pub liquid_kind: Arc<[u8]>,
    pub liquid_level: Arc<[u8]>,
    pub flags: Arc<[u8]>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorldReadPageV1 {
    pub schema_version: u16,
    pub address: WorldAddressV1,
    pub origin: ReadOriginV1,
    pub size: ReadSizeV1,
    pub identity: WorldAuthorityIdentityV1,
    pub section_revisions: Arc<[AddressedSectionRevisionV1]>,
    pub streams: WorldReadPageStreamsV1,
    pub snapshot_hash: String,
}

impl WorldReadPageV1 {
    pub fn capture(source: &impl WorldReadSourceV1, origin: ReadOriginV1, size: ReadSizeV1) -> AuthorityResult<Self> {
        let cell_count = size.cell_count()?;
        let _ = origin
            .x
            .checked_add(i32::from(size.x) - 1)
            .and_then(|_| origin.y.checked_add(i32::from(size.y) - 1))
            .and_then(|_| origin.z.checked_add(i32::from(size.z) - 1))
            .ok_or_else(|| AuthorityError::new("read-origin", "read page coordinates overflow i32"))?;

        let mut loaded_mask = vec![0_u8; cell_count];
        let mut boundary = vec![0_u8; cell_count];
        let mut blocks = vec![WORLD_UNLOADED_BLOCK_ID_V1; cell_count];
        let mut facing = vec![0_u8; cell_count];
        let mut liquid_kind = vec![0_u8; cell_count];
        let mut liquid_level = vec![0_u8; cell_count];
        let mut flags = vec![0_u8; cell_count];
        let mut resident_sections = BTreeSet::<WorldSectionAddressV1>::new();
        let row_width = usize::from(size.x);
        for local_y in 0..i32::from(size.y) {
            let world_y = origin.y + local_y;
            for local_z in 0..i32::from(size.z) {
                let row_start =
                    usize::try_from(local_y).expect("non-negative local y") * usize::from(size.z) * row_width
                        + usize::try_from(local_z).expect("non-negative local z") * row_width;
                let row_end = row_start + row_width;
                if world_y > WORLD_MAX_Y_V1 {
                    loaded_mask[row_start..row_end].fill(1);
                    boundary[row_start..row_end].fill(WorldBoundaryKindV1::AirAboveWorld as u8);
                    blocks[row_start..row_end].fill(WORLD_AIR_BLOCK_ID_V1);
                    continue;
                }
                if world_y < WORLD_MIN_Y_V1 {
                    loaded_mask[row_start..row_end].fill(1);
                    boundary[row_start..row_end].fill(WorldBoundaryKindV1::BedrockBelowWorld as u8);
                    blocks[row_start..row_end].fill(WORLD_BEDROCK_BLOCK_ID_V1);
                    continue;
                }

                let mut local_x = 0_i32;
                while local_x < i32::from(size.x) {
                    let position = CellPositionV1 {
                        x: origin.x + local_x,
                        y: world_y,
                        z: origin.z + local_z,
                    };
                    let section_address = position.section_address(source.address());
                    let run_length = (16 - position.local_x()).min(
                        usize::try_from(i32::from(size.x) - local_x).expect("remaining row length is non-negative"),
                    );
                    if let Some(section) = source.section_cells(&section_address) {
                        resident_sections.insert(section_address);
                        let section_start = position.section_index();
                        let output_start = row_start + usize::try_from(local_x).expect("non-negative local x");
                        for offset in 0..run_length {
                            let cell = section[section_start + offset];
                            let output_index = output_start + offset;
                            loaded_mask[output_index] = 1;
                            blocks[output_index] = cell.block_id;
                            facing[output_index] = cell.facing;
                            liquid_kind[output_index] = cell.liquid.kind as u8;
                            liquid_level[output_index] = cell.liquid.level;
                            flags[output_index] = cell.liquid.flags();
                        }
                    }
                    local_x += i32::try_from(run_length).expect("section run length fits i32");
                }
            }
        }

        let mut section_revisions = resident_sections
            .into_iter()
            .filter_map(|address| {
                source
                    .section_revision(&address)
                    .map(|revision| AddressedSectionRevisionV1 { address, revision })
            })
            .collect::<Vec<_>>();
        section_revisions.sort_by(|left, right| left.address.key().cmp(&right.address.key()));

        let mut page = Self {
            schema_version: WORLD_AUTHORITY_SCHEMA_V1,
            address: source.address().clone(),
            origin,
            size,
            identity: source.identity(),
            section_revisions: section_revisions.into(),
            streams: WorldReadPageStreamsV1 {
                loaded_mask: loaded_mask.into(),
                boundary: boundary.into(),
                blocks: blocks.into(),
                facing: facing.into(),
                liquid_kind: liquid_kind.into(),
                liquid_level: liquid_level.into(),
                flags: flags.into(),
            },
            snapshot_hash: String::new(),
        };
        page.validate_structure()?;
        page.snapshot_hash = hash_world_read_page_v1(&page);
        Ok(page)
    }

    pub fn validate(&self) -> AuthorityResult<()> {
        self.validate_structure()?;
        let expected = hash_world_read_page_v1(self);
        if expected != self.snapshot_hash {
            return Err(AuthorityError::new("snapshot-hash", "read page snapshot hash mismatch"));
        }
        Ok(())
    }

    fn validate_structure(&self) -> AuthorityResult<()> {
        if self.schema_version != WORLD_AUTHORITY_SCHEMA_V1 {
            return Err(AuthorityError::new(
                "schema-mismatch",
                "read page schema is incompatible",
            ));
        }
        let count = self.size.cell_count()?;
        for (name, length) in [
            ("loadedMask", self.streams.loaded_mask.len()),
            ("boundary", self.streams.boundary.len()),
            ("blocks", self.streams.blocks.len()),
            ("facing", self.streams.facing.len()),
            ("liquidKind", self.streams.liquid_kind.len()),
            ("liquidLevel", self.streams.liquid_level.len()),
            ("flags", self.streams.flags.len()),
        ] {
            if length != count {
                return Err(AuthorityError::new(
                    "stream-length",
                    format!("{name} must contain {count} cells"),
                ));
            }
        }
        for index in 0..count {
            if self.streams.loaded_mask[index] > 1
                || self.streams.boundary[index] > WorldBoundaryKindV1::BedrockBelowWorld as u8
                || self.streams.facing[index] > 3
            {
                return Err(AuthorityError::new(
                    "stream-value",
                    "read page contains an invalid stream value",
                ));
            }
            LiquidMetadataV1::from_streams(
                self.streams.liquid_kind[index],
                self.streams.liquid_level[index],
                self.streams.flags[index],
            )?;
            if self.streams.loaded_mask[index] == 0 {
                if self.streams.boundary[index] != 0 || self.streams.blocks[index] != WORLD_UNLOADED_BLOCK_ID_V1 {
                    return Err(AuthorityError::new(
                        "unloaded-cell",
                        "unloaded read cells require the unloaded sentinel and no boundary",
                    ));
                }
            } else if self.streams.blocks[index] == WORLD_UNLOADED_BLOCK_ID_V1 {
                return Err(AuthorityError::new(
                    "loaded-cell",
                    "loaded read cells cannot use unloaded sentinel",
                ));
            }
        }
        let mut prior = None;
        for section in self.section_revisions.iter() {
            let key = section.address.key();
            if prior.as_ref().is_some_and(|value: &String| value >= &key) {
                return Err(AuthorityError::new(
                    "section-order",
                    "read page section revisions must be canonical and unique",
                ));
            }
            prior = Some(key);
        }
        Ok(())
    }

    pub fn index(&self, position: CellPositionV1) -> AuthorityResult<usize> {
        let local_x = i64::from(position.x) - i64::from(self.origin.x);
        let local_y = i64::from(position.y) - i64::from(self.origin.y);
        let local_z = i64::from(position.z) - i64::from(self.origin.z);
        if local_x < 0
            || local_x >= i64::from(self.size.x)
            || local_y < 0
            || local_y >= i64::from(self.size.y)
            || local_z < 0
            || local_z >= i64::from(self.size.z)
        {
            return Err(AuthorityError::new(
                "read-bounds",
                "cell lies outside immutable read page",
            ));
        }
        Ok(local_x as usize
            + local_z as usize * usize::from(self.size.x)
            + local_y as usize * usize::from(self.size.x) * usize::from(self.size.z))
    }

    pub fn read(&self, position: CellPositionV1) -> AuthorityResult<WorldCellReadV1> {
        let index = self.index(position)?;
        if self.streams.loaded_mask[index] == 0 {
            return Ok(WorldCellReadV1::Unloaded { position });
        }
        let boundary = match self.streams.boundary[index] {
            0 => WorldBoundaryKindV1::None,
            1 => WorldBoundaryKindV1::AirAboveWorld,
            2 => WorldBoundaryKindV1::BedrockBelowWorld,
            _ => return Err(AuthorityError::new("boundary", "unknown boundary kind")),
        };
        Ok(WorldCellReadV1::Loaded {
            position,
            boundary,
            cell: WorldCellV1 {
                block_id: self.streams.blocks[index],
                facing: self.streams.facing[index],
                liquid: LiquidMetadataV1::from_streams(
                    self.streams.liquid_kind[index],
                    self.streams.liquid_level[index],
                    self.streams.flags[index],
                )?,
            },
        })
    }
}

#[must_use]
pub fn hash_world_read_page_v1(page: &WorldReadPageV1) -> String {
    let mut hasher = CanonicalHasher::new("blockwild-world-read-window-v1");
    hasher.write_u16(page.schema_version);
    hasher.write_str(&page.address.key());
    hasher.write_i32(page.origin.x);
    hasher.write_i32(page.origin.y);
    hasher.write_i32(page.origin.z);
    hasher.write_u32(u32::from(page.size.x));
    hasher.write_u32(u32::from(page.size.y));
    hasher.write_u32(u32::from(page.size.z));
    write_identity(&mut hasher, &page.identity);
    hasher.write_u32(page.section_revisions.len() as u32);
    for section in page.section_revisions.iter() {
        write_section_revision(&mut hasher, section);
    }
    hasher.write_bytes(&page.streams.loaded_mask);
    hasher.write_bytes(&page.streams.boundary);
    hasher.write_bytes(&page.streams.facing);
    hasher.write_bytes(&page.streams.liquid_kind);
    hasher.write_bytes(&page.streams.liquid_level);
    hasher.write_bytes(&page.streams.flags);
    hasher.write_u32(page.streams.blocks.len() as u32);
    for block in page.streams.blocks.iter() {
        hasher.write_u16(*block);
    }
    hasher.finish().to_hex()
}

#[must_use]
pub fn vertical_boundary_cell(position: CellPositionV1) -> Option<WorldCellReadV1> {
    if position.y > WORLD_MAX_Y_V1 {
        return Some(WorldCellReadV1::Loaded {
            position,
            boundary: WorldBoundaryKindV1::AirAboveWorld,
            cell: WorldCellV1 {
                block_id: WORLD_AIR_BLOCK_ID_V1,
                facing: 0,
                liquid: LiquidMetadataV1::default(),
            },
        });
    }
    if position.y < WORLD_MIN_Y_V1 {
        return Some(WorldCellReadV1::Loaded {
            position,
            boundary: WorldBoundaryKindV1::BedrockBelowWorld,
            cell: WorldCellV1 {
                block_id: WORLD_BEDROCK_BLOCK_ID_V1,
                facing: 0,
                liquid: LiquidMetadataV1::default(),
            },
        });
    }
    None
}
