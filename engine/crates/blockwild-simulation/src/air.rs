use std::collections::{BTreeSet, VecDeque};

use blockwild_types::{CanonicalHash, CanonicalHasher};

use crate::{AIR_ZONE_MAX_CELLS_V1, CellPos, ContractError, SimulationJobIdentityV1, write_identity};

pub const AIR_CELL_LOADED: u8 = 1 << 0;
pub const AIR_CELL_TRAVERSABLE_GAS: u8 = 1 << 1;
pub const AIR_CELL_SOLID: u8 = 1 << 2;
pub const AIR_CELL_SEALABLE: u8 = 1 << 3;
pub const AIR_CELL_VENT: u8 = 1 << 4;
pub const AIR_CELL_AIRLOCK_DOOR: u8 = 1 << 5;
pub const AIR_CELL_OPEN_AIRLOCK_DOOR: u8 = 1 << 6;

pub const AIR_LEAK_NEGATIVE_X: u8 = 1 << 0;
pub const AIR_LEAK_POSITIVE_X: u8 = 1 << 1;
pub const AIR_LEAK_NEGATIVE_Y: u8 = 1 << 2;
pub const AIR_LEAK_POSITIVE_Y: u8 = 1 << 3;
pub const AIR_LEAK_NEGATIVE_Z: u8 = 1 << 4;
pub const AIR_LEAK_POSITIVE_Z: u8 = 1 << 5;
pub const AIR_LEAK_UNKNOWN_BOUNDARY: u8 = 1 << 6;

const AIR_NEIGHBOR_ORDER: [([i32; 3], u8); 6] = [
    ([-1, 0, 0], AIR_LEAK_NEGATIVE_X),
    ([1, 0, 0], AIR_LEAK_POSITIVE_X),
    ([0, -1, 0], AIR_LEAK_NEGATIVE_Y),
    ([0, 1, 0], AIR_LEAK_POSITIVE_Y),
    ([0, 0, -1], AIR_LEAK_NEGATIVE_Z),
    ([0, 0, 1], AIR_LEAK_POSITIVE_Z),
];

#[derive(Clone, Debug, PartialEq)]
pub struct AirZoneTopologyJobV1 {
    pub identity: SimulationJobIdentityV1,
    pub topology_revision: u64,
    pub origin: CellPos,
    pub size: [u32; 3],
    pub cells: Vec<u8>,
    pub maximum_visited_cells: usize,
    pub input_hash: CanonicalHash,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct AirZoneSummaryV1 {
    pub zone_id: u32,
    pub cell_count: u32,
    pub leak_faces: u8,
    pub vent_count: u32,
    pub airlock_door_count: u32,
    pub sealed: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct AirZoneTopologyResultV1 {
    pub identity: SimulationJobIdentityV1,
    pub topology_revision: u64,
    pub zone_ids: Vec<u32>,
    pub zones: Vec<AirZoneSummaryV1>,
    pub visited_cells: usize,
    pub budget_exhausted: bool,
    pub result_hash: CanonicalHash,
}

impl AirZoneTopologyJobV1 {
    #[must_use]
    pub fn cell_count(&self) -> Option<usize> {
        usize::try_from(self.size[0])
            .ok()?
            .checked_mul(usize::try_from(self.size[1]).ok()?)?
            .checked_mul(usize::try_from(self.size[2]).ok()?)
    }

    #[must_use]
    pub fn index(&self, position: CellPos) -> Option<usize> {
        let x = u32::try_from(position.x.checked_sub(self.origin.x)?).ok()?;
        let y = u32::try_from(position.y.checked_sub(self.origin.y)?).ok()?;
        let z = u32::try_from(position.z.checked_sub(self.origin.z)?).ok()?;
        if x >= self.size[0] || y >= self.size[1] || z >= self.size[2] {
            return None;
        }
        usize::try_from(x + self.size[0] * (z + self.size[2] * y)).ok()
    }

    #[must_use]
    pub fn position(&self, index: usize) -> CellPos {
        let x_size = self.size[0] as usize;
        let z_size = self.size[2] as usize;
        let x = index % x_size;
        let yz = index / x_size;
        let z = yz % z_size;
        let y = yz / z_size;
        CellPos::new(
            self.origin.x + x as i32,
            self.origin.y + y as i32,
            self.origin.z + z as i32,
        )
    }

    pub fn validate(&self) -> Result<(), ContractError> {
        if self.size.iter().any(|size| *size == 0 || *size > 512) {
            return Err(ContractError::WindowTooLarge);
        }
        if self.topology_revision > 9_007_199_254_740_991 {
            return Err(ContractError::InvalidNumber);
        }
        let count = self.cell_count().ok_or(ContractError::WindowTooLarge)?;
        if count > AIR_ZONE_MAX_CELLS_V1 {
            return Err(ContractError::WindowTooLarge);
        }
        if self.cells.len() != count {
            return Err(ContractError::StreamLength);
        }
        if self.cells.iter().any(|flags| flags & !0x7f != 0) {
            return Err(ContractError::InvalidFlags);
        }
        if self.maximum_visited_cells == 0 || self.maximum_visited_cells > AIR_ZONE_MAX_CELLS_V1 {
            return Err(ContractError::InvalidBudget);
        }
        if hash_air_zone_input(self) != self.input_hash {
            return Err(ContractError::IdentityMismatch);
        }
        Ok(())
    }

    #[must_use]
    pub fn seal(mut self) -> Self {
        self.input_hash = hash_air_zone_input(&self);
        self
    }
}

#[must_use]
pub fn hash_air_zone_input(job: &AirZoneTopologyJobV1) -> CanonicalHash {
    let mut hasher = CanonicalHasher::new("blockwild-air-zone-topology-v1");
    hasher.write_u16(crate::SIMULATION_SCHEMA_V1);
    write_identity(&mut hasher, &job.identity);
    hasher.write_u64(job.topology_revision);
    hasher.write_i32(job.origin.x);
    hasher.write_i32(job.origin.y);
    hasher.write_i32(job.origin.z);
    for size in job.size {
        hasher.write_u32(size);
    }
    hasher.write_bytes(&job.cells);
    hasher.write_str("leak");
    hasher.write_u32(job.maximum_visited_cells as u32);
    hasher.finish()
}

fn traversable(flags: u8) -> bool {
    flags & AIR_CELL_LOADED != 0
        && flags & AIR_CELL_TRAVERSABLE_GAS != 0
        && flags & AIR_CELL_SOLID == 0
        && (flags & AIR_CELL_AIRLOCK_DOOR == 0 || flags & AIR_CELL_OPEN_AIRLOCK_DOOR != 0)
}

pub fn solve_air_zones(job: &AirZoneTopologyJobV1) -> Result<AirZoneTopologyResultV1, ContractError> {
    job.validate()?;
    let count = job.cells.len();
    let mut zone_ids = vec![0_u32; count];
    let mut discovered = vec![false; count];
    let mut zones = Vec::new();
    let mut visited = 0_usize;
    let mut next_zone_id = 1_u32;
    let mut budget_exhausted = false;

    for seed_index in 0..count {
        if discovered[seed_index] || !traversable(job.cells[seed_index]) {
            continue;
        }
        if visited >= job.maximum_visited_cells {
            budget_exhausted = true;
            break;
        }
        let mut queue = VecDeque::from([job.position(seed_index)]);
        discovered[seed_index] = true;
        let mut cell_count = 0_u32;
        let mut leak_faces = 0_u8;
        let mut vent_count = 0_u32;
        let mut airlocks = BTreeSet::<usize>::new();

        while let Some(position) = queue.pop_front() {
            if visited >= job.maximum_visited_cells {
                budget_exhausted = true;
                leak_faces |= AIR_LEAK_UNKNOWN_BOUNDARY;
                break;
            }
            let Some(index) = job.index(position) else { continue };
            zone_ids[index] = next_zone_id;
            visited += 1;
            cell_count += 1;
            let flags = job.cells[index];
            if flags & AIR_CELL_VENT != 0 {
                vent_count += 1;
            }
            if flags & AIR_CELL_AIRLOCK_DOOR != 0 {
                airlocks.insert(index);
            }

            for (offset, directional_leak) in AIR_NEIGHBOR_ORDER {
                let neighbor = position.offset(offset);
                let Some(neighbor_index) = job.index(neighbor) else {
                    leak_faces |= directional_leak | AIR_LEAK_UNKNOWN_BOUNDARY;
                    continue;
                };
                let neighbor_flags = job.cells[neighbor_index];
                if neighbor_flags & AIR_CELL_LOADED == 0 {
                    leak_faces |= directional_leak | AIR_LEAK_UNKNOWN_BOUNDARY;
                    continue;
                }
                if neighbor_flags & AIR_CELL_AIRLOCK_DOOR != 0 {
                    airlocks.insert(neighbor_index);
                }
                if traversable(neighbor_flags) {
                    if !discovered[neighbor_index] {
                        discovered[neighbor_index] = true;
                        queue.push_back(neighbor);
                    }
                } else if neighbor_flags & (AIR_CELL_SOLID | AIR_CELL_SEALABLE | AIR_CELL_AIRLOCK_DOOR) == 0 {
                    leak_faces |= directional_leak;
                }
            }
        }
        zones.push(AirZoneSummaryV1 {
            zone_id: next_zone_id,
            cell_count,
            leak_faces,
            vent_count,
            airlock_door_count: airlocks.len() as u32,
            sealed: leak_faces == 0,
        });
        next_zone_id = next_zone_id.saturating_add(1);
        if budget_exhausted {
            break;
        }
    }

    let mut hasher = CanonicalHasher::new("blockwild-air-zone-result-v1");
    hasher.write_u16(crate::SIMULATION_SCHEMA_V1);
    write_identity(&mut hasher, &job.identity);
    hasher.write_u64(job.topology_revision);
    let mut zone_bytes = Vec::with_capacity(zone_ids.len() * 4);
    for zone_id in &zone_ids {
        zone_bytes.extend_from_slice(&zone_id.to_le_bytes());
    }
    hasher.write_bytes(&zone_bytes);
    hasher.write_u32(zones.len() as u32);
    for zone in &zones {
        hasher.write_u32(zone.zone_id);
        hasher.write_u32(zone.cell_count);
        hasher.write_u16(u16::from(zone.leak_faces));
        hasher.write_u32(zone.vent_count);
        hasher.write_u32(zone.airlock_door_count);
        hasher.write_u16(u16::from(zone.sealed));
    }
    hasher.write_u32(visited as u32);
    hasher.write_u16(u16::from(budget_exhausted));
    Ok(AirZoneTopologyResultV1 {
        identity: job.identity.clone(),
        topology_revision: job.topology_revision,
        zone_ids,
        zones,
        visited_cells: visited,
        budget_exhausted,
        result_hash: hasher.finish(),
    })
}
