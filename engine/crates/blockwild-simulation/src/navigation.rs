use std::{
    cmp::Ordering,
    collections::{BTreeMap, BTreeSet, BinaryHeap},
};

use blockwild_types::{CanonicalHash, CanonicalHasher};

use crate::{
    CellPos, ContractError, PATH_MAX_NODES_V1, PATH_WINDOW_MAX_CELLS_V1, SimulationJobIdentityV1, Vec3, write_f64,
    write_identity, write_vec3,
};

pub const PATH_CELL_LOADED: u8 = 1 << 0;
pub const PATH_CELL_PASSABLE: u8 = 1 << 1;
pub const PATH_CELL_SUPPORT: u8 = 1 << 2;
pub const PATH_CELL_LIQUID: u8 = 1 << 3;
pub const PATH_CELL_DOOR_OR_GATE: u8 = 1 << 4;

pub const PATH_NEIGHBOR_ORDER_V1: [[i32; 2]; 4] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
pub const PATH_ELEVATION_ORDER_V1: [i32; 3] = [0, 1, -1];

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum PathTransitionV1 {
    Walk = 0,
    Step = 1,
    Jump = 2,
    Swim = 3,
    Door = 4,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum PathResultCodeV1 {
    Found = 0,
    Unloaded = 1,
    TooFar = 2,
    Blocked = 3,
    BudgetExhausted = 4,
    Stale = 5,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PathOccupancyWindowV1 {
    pub origin: CellPos,
    pub size: [u32; 3],
    pub cells: Vec<u8>,
    pub snapshot_hash: CanonicalHash,
}

impl PathOccupancyWindowV1 {
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
    pub fn flags(&self, position: CellPos) -> u8 {
        self.index(position)
            .and_then(|index| self.cells.get(index))
            .copied()
            .unwrap_or(0)
    }

    fn validate(&self) -> Result<(), ContractError> {
        if self.size.iter().any(|size| *size == 0 || *size > 512) {
            return Err(ContractError::WindowTooLarge);
        }
        let count = self.cell_count().ok_or(ContractError::WindowTooLarge)?;
        if count > PATH_WINDOW_MAX_CELLS_V1 {
            return Err(ContractError::WindowTooLarge);
        }
        if self.cells.len() != count {
            return Err(ContractError::StreamLength);
        }
        if self.cells.iter().any(|flags| flags & !0x1f != 0) {
            return Err(ContractError::InvalidFlags);
        }
        if hash_path_occupancy(self) != self.snapshot_hash {
            return Err(ContractError::IdentityMismatch);
        }
        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct PathJobV1 {
    pub identity: SimulationJobIdentityV1,
    pub occupancy: PathOccupancyWindowV1,
    pub start: Vec3,
    pub goal: Vec3,
    pub maximum_distance: f64,
    pub maximum_nodes: usize,
    pub body_radius: f64,
    pub body_height: f64,
    pub input_hash: CanonicalHash,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PathJobResultV1 {
    pub identity: SimulationJobIdentityV1,
    pub code: PathResultCodeV1,
    pub cells: Vec<CellPos>,
    pub transitions: Vec<PathTransitionV1>,
    pub visited: usize,
    pub nearest: Vec3,
    pub result_hash: CanonicalHash,
}

impl PathJobV1 {
    pub fn validate(&self) -> Result<(), ContractError> {
        self.occupancy.validate()?;
        if self.maximum_nodes == 0 || self.maximum_nodes > PATH_MAX_NODES_V1 {
            return Err(ContractError::InvalidBudget);
        }
        if !self.maximum_distance.is_finite()
            || self.maximum_distance < 0.0
            || self.maximum_distance > 4_096.0
            || !self.body_radius.is_finite()
            || self.body_radius <= 0.0
            || self.body_radius > 64.0
            || !self.body_height.is_finite()
            || self.body_height <= 0.0
            || self.body_height > 128.0
            || [
                self.start.x,
                self.start.y,
                self.start.z,
                self.goal.x,
                self.goal.y,
                self.goal.z,
            ]
            .iter()
            .any(|value| !value.is_finite())
        {
            return Err(ContractError::InvalidNumber);
        }
        if hash_path_input(self) != self.input_hash {
            return Err(ContractError::IdentityMismatch);
        }
        Ok(())
    }

    #[must_use]
    pub fn seal(mut self) -> Self {
        self.occupancy.snapshot_hash = hash_path_occupancy(&self.occupancy);
        self.input_hash = hash_path_input(&self);
        self
    }
}

#[must_use]
pub fn hash_path_occupancy(window: &PathOccupancyWindowV1) -> CanonicalHash {
    let mut hasher = CanonicalHasher::new("blockwild-path-occupancy-v1");
    hasher.write_i32(window.origin.x);
    hasher.write_i32(window.origin.y);
    hasher.write_i32(window.origin.z);
    for size in window.size {
        hasher.write_u32(size);
    }
    hasher.write_bytes(&window.cells);
    hasher.finish()
}

#[must_use]
pub fn hash_path_input(job: &PathJobV1) -> CanonicalHash {
    let mut hasher = CanonicalHasher::new("blockwild-path-job-v1");
    hasher.write_u16(crate::SIMULATION_SCHEMA_V1);
    write_identity(&mut hasher, &job.identity);
    hasher.write_str(&job.occupancy.snapshot_hash.to_hex());
    write_vec3(&mut hasher, job.start);
    write_vec3(&mut hasher, job.goal);
    write_f64(&mut hasher, job.maximum_distance);
    hasher.write_u32(job.maximum_nodes as u32);
    write_f64(&mut hasher, job.body_radius);
    write_f64(&mut hasher, job.body_height);
    hasher.finish()
}

fn path_cells_bytes(cells: &[CellPos]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(cells.len() * 12);
    for cell in cells {
        bytes.extend_from_slice(&cell.x.to_le_bytes());
        bytes.extend_from_slice(&cell.y.to_le_bytes());
        bytes.extend_from_slice(&cell.z.to_le_bytes());
    }
    bytes
}

#[derive(Clone, Copy, Debug)]
struct OpenNode {
    position: CellPos,
    score: f64,
    ordinal: u64,
}

impl PartialEq for OpenNode {
    fn eq(&self, other: &Self) -> bool {
        self.score.to_bits() == other.score.to_bits() && self.ordinal == other.ordinal
    }
}
impl Eq for OpenNode {}
impl PartialOrd for OpenNode {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}
impl Ord for OpenNode {
    fn cmp(&self, other: &Self) -> Ordering {
        other
            .score
            .total_cmp(&self.score)
            .then_with(|| other.ordinal.cmp(&self.ordinal))
    }
}

fn canonical_cell(value: Vec3) -> CellPos {
    CellPos::new(
        (value.x + 0.5).floor() as i32,
        (value.y + 0.5).floor() as i32,
        (value.z + 0.5).floor() as i32,
    )
}

fn heuristic(position: CellPos, goal: CellPos) -> f64 {
    f64::from((goal.x - position.x).abs() + (goal.z - position.z).abs()) + f64::from((goal.y - position.y).abs()) * 1.25
}

fn walkable(window: &PathOccupancyWindowV1, position: CellPos) -> bool {
    let feet = window.flags(position);
    let head = window.flags(position.offset([0, 1, 0]));
    feet & PATH_CELL_LOADED != 0
        && head & PATH_CELL_LOADED != 0
        && feet & PATH_CELL_PASSABLE != 0
        && head & PATH_CELL_PASSABLE != 0
        && (feet & PATH_CELL_SUPPORT != 0 || feet & PATH_CELL_LIQUID != 0)
}

pub fn find_path(job: &PathJobV1) -> Result<PathJobResultV1, ContractError> {
    job.validate()?;
    let start = canonical_cell(job.start);
    let goal = canonical_cell(job.goal);
    if Vec3::new(
        f64::from(goal.x - start.x),
        f64::from(goal.y - start.y),
        f64::from(goal.z - start.z),
    )
    .length()
        > job.maximum_distance
    {
        return Ok(path_result(
            job,
            PathResultCodeV1::TooFar,
            Vec::new(),
            Vec::new(),
            0,
            start,
        ));
    }
    if job.occupancy.flags(start) & PATH_CELL_LOADED == 0 || job.occupancy.flags(goal) & PATH_CELL_LOADED == 0 {
        return Ok(path_result(
            job,
            PathResultCodeV1::Unloaded,
            Vec::new(),
            Vec::new(),
            0,
            start,
        ));
    }
    if start == goal {
        return Ok(path_result(
            job,
            PathResultCodeV1::Found,
            vec![goal],
            vec![PathTransitionV1::Walk],
            1,
            goal,
        ));
    }

    let mut next_ordinal = 1_u64;
    let mut open = BinaryHeap::from([OpenNode {
        position: start,
        score: heuristic(start, goal),
        ordinal: 0,
    }]);
    let mut came_from = BTreeMap::<CellPos, (CellPos, PathTransitionV1)>::new();
    let mut costs = BTreeMap::<CellPos, f64>::from([(start, 0.0)]);
    let mut closed = BTreeSet::<CellPos>::new();
    let mut nearest = start;
    let mut nearest_distance = heuristic(start, goal);

    while closed.len() < job.maximum_nodes {
        let Some(current) = open.pop() else { break };
        if !closed.insert(current.position) {
            continue;
        }
        let distance = heuristic(current.position, goal);
        if distance < nearest_distance {
            nearest = current.position;
            nearest_distance = distance;
        }
        if current.position.x == goal.x && current.position.z == goal.z && (current.position.y - goal.y).abs() <= 1 {
            let mut cells = Vec::new();
            let mut transitions = Vec::new();
            let mut cursor = current.position;
            while cursor != start {
                let Some((previous, transition)) = came_from.get(&cursor).copied() else {
                    break;
                };
                cells.push(cursor);
                transitions.push(transition);
                cursor = previous;
            }
            cells.reverse();
            transitions.reverse();
            return Ok(path_result(
                job,
                PathResultCodeV1::Found,
                cells,
                transitions,
                closed.len(),
                current.position,
            ));
        }
        for [dx, dz] in PATH_NEIGHBOR_ORDER_V1 {
            let mut selected = None;
            for dy in PATH_ELEVATION_ORDER_V1 {
                let candidate = current.position.offset([dx, dy, dz]);
                if !walkable(&job.occupancy, candidate) {
                    continue;
                }
                let flags = job.occupancy.flags(candidate);
                let door = flags & PATH_CELL_DOOR_OR_GATE != 0;
                let transition = if door {
                    PathTransitionV1::Door
                } else if flags & PATH_CELL_LIQUID != 0 {
                    PathTransitionV1::Swim
                } else if dy > 0 {
                    PathTransitionV1::Jump
                } else if dy < 0 {
                    PathTransitionV1::Step
                } else {
                    PathTransitionV1::Walk
                };
                selected = Some((
                    candidate,
                    transition,
                    1.0 + f64::from(dy.abs()) * 0.35 + if door { 0.15 } else { 0.0 },
                ));
                break;
            }
            let Some((candidate, transition, step_cost)) = selected else {
                continue;
            };
            let next_cost = costs[&current.position] + step_cost;
            if costs.get(&candidate).is_some_and(|known| next_cost >= *known) {
                continue;
            }
            costs.insert(candidate, next_cost);
            came_from.insert(candidate, (current.position, transition));
            open.push(OpenNode {
                position: candidate,
                score: next_cost + heuristic(candidate, goal),
                ordinal: next_ordinal,
            });
            next_ordinal = next_ordinal.saturating_add(1);
        }
    }
    let code = if open.is_empty() {
        PathResultCodeV1::Blocked
    } else {
        PathResultCodeV1::BudgetExhausted
    };
    Ok(path_result(job, code, Vec::new(), Vec::new(), closed.len(), nearest))
}

fn path_result(
    job: &PathJobV1,
    code: PathResultCodeV1,
    cells: Vec<CellPos>,
    transitions: Vec<PathTransitionV1>,
    visited: usize,
    nearest: CellPos,
) -> PathJobResultV1 {
    let mut hasher = CanonicalHasher::new("blockwild-path-result-v1");
    hasher.write_u16(crate::SIMULATION_SCHEMA_V1);
    write_identity(&mut hasher, &job.identity);
    hasher.write_u16(code as u16);
    hasher.write_bytes(&path_cells_bytes(&cells));
    hasher.write_bytes(
        &transitions
            .iter()
            .map(|transition| *transition as u8)
            .collect::<Vec<_>>(),
    );
    hasher.write_u32(visited as u32);
    write_vec3(
        &mut hasher,
        Vec3::new(f64::from(nearest.x), f64::from(nearest.y), f64::from(nearest.z)),
    );
    PathJobResultV1 {
        identity: job.identity.clone(),
        code,
        cells,
        transitions,
        visited,
        nearest: Vec3::new(f64::from(nearest.x), f64::from(nearest.y), f64::from(nearest.z)),
        result_hash: hasher.finish(),
    }
}
