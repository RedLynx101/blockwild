use blockwild_types::{CanonicalHash, CanonicalHasher};

pub const SIMULATION_PROTOCOL_V1: u16 = 1;
pub const SIMULATION_SCHEMA_V1: u16 = 1;
pub const SIMULATION_MAX_FIXED_DELTA_MICROS_V1: u32 = 100_000;
pub const SIMULATION_MAX_EXTERNAL_IMPULSES_V1: usize = 64;
pub const LIQUID_FRONTIER_MAX_CELLS_V1: usize = 16_384;
pub const PATH_WINDOW_MAX_CELLS_V1: usize = 128 * 1024;
pub const PATH_MAX_NODES_V1: usize = 65_536;
pub const AIR_ZONE_MAX_CELLS_V1: usize = 256 * 1024;
pub const WORLD_AIR_BLOCK_ID_V1: u16 = 0;
pub const WORLD_UNLOADED_BLOCK_ID_V1: u16 = u16::MAX;

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Vec3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl Vec3 {
    #[must_use]
    pub const fn new(x: f64, y: f64, z: f64) -> Self {
        Self { x, y, z }
    }

    #[must_use]
    pub fn length(self) -> f64 {
        self.length_squared().sqrt()
    }

    #[must_use]
    pub const fn length_squared(self) -> f64 {
        self.x * self.x + self.y * self.y + self.z * self.z
    }
}

impl core::ops::Add for Vec3 {
    type Output = Self;
    fn add(self, rhs: Self) -> Self::Output {
        Self::new(self.x + rhs.x, self.y + rhs.y, self.z + rhs.z)
    }
}

impl core::ops::Sub for Vec3 {
    type Output = Self;
    fn sub(self, rhs: Self) -> Self::Output {
        Self::new(self.x - rhs.x, self.y - rhs.y, self.z - rhs.z)
    }
}

impl core::ops::Mul<f64> for Vec3 {
    type Output = Self;
    fn mul(self, rhs: f64) -> Self::Output {
        Self::new(self.x * rhs, self.y * rhs, self.z * rhs)
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct CellPos {
    pub x: i32,
    pub y: i32,
    pub z: i32,
}

impl CellPos {
    #[must_use]
    pub const fn new(x: i32, y: i32, z: i32) -> Self {
        Self { x, y, z }
    }

    #[must_use]
    pub const fn offset(self, offset: [i32; 3]) -> Self {
        Self::new(self.x + offset[0], self.y + offset[1], self.z + offset[2])
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorldAddressV1 {
    pub universe_id: String,
    pub location_id: String,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct WorldRevisionV1 {
    pub epoch: u64,
    pub mutation: u64,
    pub residency: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorldIdentityV1 {
    pub address: WorldAddressV1,
    pub revision: WorldRevisionV1,
    pub state_hash: CanonicalHash,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SimulationJobIdentityV1 {
    pub job_id: String,
    pub sequence: u32,
    pub world: WorldIdentityV1,
    pub source_snapshot_hash: CanonicalHash,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum BoundaryKindV1 {
    None = 0,
    AirAboveWorld = 1,
    BedrockBelowWorld = 2,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
#[repr(u8)]
pub enum LiquidKindV1 {
    #[default]
    None = 0,
    Water = 1,
    Lava = 2,
    Honey = 3,
    Syrup = 4,
}

impl LiquidKindV1 {
    #[must_use]
    pub const fn from_wire(value: u8) -> Option<Self> {
        match value {
            0 => Some(Self::None),
            1 => Some(Self::Water),
            2 => Some(Self::Lava),
            3 => Some(Self::Honey),
            4 => Some(Self::Syrup),
            _ => None,
        }
    }

    #[must_use]
    pub const fn renewable(self) -> bool {
        matches!(self, Self::Water)
    }
}

pub const WORLD_CELL_CONTAINS_WATER: u8 = 1 << 0;
pub const WORLD_CELL_LIQUID_SOURCE: u8 = 1 << 1;
pub const WORLD_CELL_LIQUID_FALLING: u8 = 1 << 2;
pub const WORLD_CELL_WATERLOGGED: u8 = 1 << 3;

#[derive(Clone, Debug, PartialEq)]
pub struct WorldReadWindowV1 {
    pub address: WorldAddressV1,
    pub origin: CellPos,
    pub size: [u32; 3],
    pub identity: WorldIdentityV1,
    pub loaded_mask: Vec<u8>,
    pub boundary: Vec<u8>,
    pub blocks: Vec<u16>,
    pub facing: Vec<u8>,
    pub liquid_kind: Vec<u8>,
    pub liquid_level: Vec<u8>,
    pub flags: Vec<u8>,
    pub snapshot_hash: CanonicalHash,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct CellSampleV1 {
    pub loaded: bool,
    pub boundary: u8,
    pub block: u16,
    pub facing: u8,
    pub liquid_kind: LiquidKindV1,
    pub liquid_level: u8,
    pub flags: u8,
}

impl WorldReadWindowV1 {
    #[must_use]
    pub fn cell_count(&self) -> Option<usize> {
        usize::try_from(self.size[0])
            .ok()?
            .checked_mul(usize::try_from(self.size[1]).ok()?)?
            .checked_mul(usize::try_from(self.size[2]).ok()?)
    }

    /// V1 stream order is x-fastest, then z, then y.
    #[must_use]
    pub fn index(&self, position: CellPos) -> Option<usize> {
        let x = position.x.checked_sub(self.origin.x)?;
        let y = position.y.checked_sub(self.origin.y)?;
        let z = position.z.checked_sub(self.origin.z)?;
        let x = u32::try_from(x).ok()?;
        let y = u32::try_from(y).ok()?;
        let z = u32::try_from(z).ok()?;
        if x >= self.size[0] || y >= self.size[1] || z >= self.size[2] {
            return None;
        }
        usize::try_from(x + self.size[0] * (z + self.size[2] * y)).ok()
    }

    #[must_use]
    pub fn sample(&self, position: CellPos) -> Option<CellSampleV1> {
        let index = self.index(position)?;
        let liquid_kind = LiquidKindV1::from_wire(*self.liquid_kind.get(index)?)?;
        Some(CellSampleV1 {
            loaded: *self.loaded_mask.get(index)? != 0,
            boundary: *self.boundary.get(index)?,
            block: *self.blocks.get(index)?,
            facing: *self.facing.get(index)?,
            liquid_kind,
            liquid_level: *self.liquid_level.get(index)?,
            flags: *self.flags.get(index)?,
        })
    }

    #[must_use]
    pub fn is_collision_solid(&self, position: CellPos) -> bool {
        let Some(cell) = self.sample(position) else {
            return true;
        };
        if !cell.loaded || cell.block == WORLD_UNLOADED_BLOCK_ID_V1 {
            return true;
        }
        cell.boundary == BoundaryKindV1::BedrockBelowWorld as u8
            || (cell.block != WORLD_AIR_BLOCK_ID_V1 && cell.liquid_kind == LiquidKindV1::None)
    }

    pub fn validate(&self) -> Result<(), ContractError> {
        if self.size.iter().any(|size| *size == 0 || *size > 512) {
            return Err(ContractError::WindowTooLarge);
        }
        let count = self.cell_count().ok_or(ContractError::WindowTooLarge)?;
        if count > PATH_WINDOW_MAX_CELLS_V1 {
            return Err(ContractError::WindowTooLarge);
        }
        for length in [
            self.loaded_mask.len(),
            self.boundary.len(),
            self.blocks.len(),
            self.facing.len(),
            self.liquid_kind.len(),
            self.liquid_level.len(),
            self.flags.len(),
        ] {
            if length != count {
                return Err(ContractError::StreamLength);
            }
        }
        if self
            .liquid_kind
            .iter()
            .any(|value| LiquidKindV1::from_wire(*value).is_none())
        {
            return Err(ContractError::InvalidLiquidKind);
        }
        if self.liquid_level.iter().any(|level| *level > 8) {
            return Err(ContractError::InvalidLiquidLevel);
        }
        if self.flags.iter().any(|flags| flags & !0x0f != 0) {
            return Err(ContractError::InvalidFlags);
        }
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ContractError {
    InvalidDelta,
    InvalidBudget,
    InvalidFlags,
    InvalidLiquidKind,
    InvalidLiquidLevel,
    InvalidNumber,
    IdentityMismatch,
    StreamLength,
    WindowTooLarge,
}

impl core::fmt::Display for ContractError {
    fn fmt(&self, formatter: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(formatter, "{self:?}")
    }
}

impl std::error::Error for ContractError {}

#[must_use]
pub fn identity_is_current(result: &SimulationJobIdentityV1, current: &WorldIdentityV1) -> bool {
    result.world == *current
}

pub(crate) fn write_identity(hasher: &mut CanonicalHasher, identity: &SimulationJobIdentityV1) {
    hasher.write_str(&identity.job_id);
    hasher.write_u32(identity.sequence);
    hasher.write_str(&identity.world.address.universe_id);
    hasher.write_str(&identity.world.address.location_id);
    hasher.write_u64(identity.world.revision.epoch);
    hasher.write_u64(identity.world.revision.mutation);
    hasher.write_u64(identity.world.revision.residency);
    hasher.write_str(&identity.world.state_hash.to_hex());
    hasher.write_str(&identity.source_snapshot_hash.to_hex());
}

pub(crate) fn write_f64(hasher: &mut CanonicalHasher, value: f64) {
    hasher.write_bytes(&value.to_le_bytes());
}

pub(crate) fn write_vec3(hasher: &mut CanonicalHasher, value: Vec3) {
    write_f64(hasher, value.x);
    write_f64(hasher, value.y);
    write_f64(hasher, value.z);
}

pub(crate) fn hash_world_window(window: &WorldReadWindowV1) -> CanonicalHash {
    let mut hasher = CanonicalHasher::new("blockwild-simulation-world-window-v1");
    hasher.write_str(&window.address.universe_id);
    hasher.write_str(&window.address.location_id);
    hasher.write_i32(window.origin.x);
    hasher.write_i32(window.origin.y);
    hasher.write_i32(window.origin.z);
    for value in window.size {
        hasher.write_u32(value);
    }
    hasher.write_bytes(&window.loaded_mask);
    hasher.write_bytes(&window.boundary);
    for block in &window.blocks {
        hasher.write_u16(*block);
    }
    hasher.write_bytes(&window.facing);
    hasher.write_bytes(&window.liquid_kind);
    hasher.write_bytes(&window.liquid_level);
    hasher.write_bytes(&window.flags);
    hasher.finish()
}
