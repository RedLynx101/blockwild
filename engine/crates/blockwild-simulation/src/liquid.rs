use std::collections::{BTreeSet, VecDeque};

use blockwild_types::{CanonicalHash, CanonicalHasher};

use crate::{
    CellPos, ContractError, LIQUID_FRONTIER_MAX_CELLS_V1, LiquidKindV1, SimulationJobIdentityV1,
    WORLD_CELL_LIQUID_FALLING, WORLD_CELL_LIQUID_SOURCE, WORLD_CELL_WATERLOGGED, WorldReadWindowV1, write_identity,
};

pub const LIQUID_CELL_SOURCE: u8 = 1 << 0;
pub const LIQUID_CELL_FALLING: u8 = 1 << 1;
pub const LIQUID_CELL_RENEWABLE: u8 = 1 << 2;
pub const LIQUID_CELL_WATERLOGGED: u8 = 1 << 3;

pub const LIQUID_CARDINAL_ORDER_V1: [[i32; 3]; 4] = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
pub const LIQUID_NEIGHBOR_ORDER_V1: [[i32; 3]; 6] =
    [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]];

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct LiquidCellV1 {
    pub kind: LiquidKindV1,
    pub level: u8,
    pub source: bool,
    pub falling: bool,
    pub waterlogged: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct LiquidSpreadV1 {
    pub water: u8,
    pub lava: u8,
    pub honey: u8,
    pub syrup: u8,
}

impl Default for LiquidSpreadV1 {
    fn default() -> Self {
        Self {
            water: 7,
            lava: 3,
            honey: 2,
            syrup: 4,
        }
    }
}

impl LiquidSpreadV1 {
    #[must_use]
    pub const fn for_kind(self, kind: LiquidKindV1) -> u8 {
        match kind {
            LiquidKindV1::Water => self.water,
            LiquidKindV1::Lava => self.lava,
            LiquidKindV1::Honey => self.honey,
            LiquidKindV1::Syrup => self.syrup,
            LiquidKindV1::None => 0,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct LiquidFrontierStepV1 {
    pub identity: SimulationJobIdentityV1,
    pub window: WorldReadWindowV1,
    pub frontier: Vec<CellPos>,
    pub operation_budget: usize,
    pub spread: LiquidSpreadV1,
    pub input_hash: CanonicalHash,
}

#[derive(Clone, Debug, PartialEq)]
pub struct LiquidChangeV1 {
    pub position: CellPos,
    pub previous: Option<LiquidCellV1>,
    pub next: Option<LiquidCellV1>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct LiquidFrontierResultV1 {
    pub identity: SimulationJobIdentityV1,
    pub changes: Vec<LiquidChangeV1>,
    pub remaining_frontier: Vec<CellPos>,
    pub operations: usize,
    pub result_hash: CanonicalHash,
}

impl LiquidFrontierStepV1 {
    pub fn validate(&self) -> Result<(), ContractError> {
        self.window.validate()?;
        if self.identity.world != self.window.identity
            || self.identity.source_snapshot_hash != self.window.snapshot_hash
        {
            return Err(ContractError::IdentityMismatch);
        }
        if self.frontier.len() > LIQUID_FRONTIER_MAX_CELLS_V1
            || self.operation_budget == 0
            || self.operation_budget > LIQUID_FRONTIER_MAX_CELLS_V1
        {
            return Err(ContractError::InvalidBudget);
        }
        if hash_liquid_frontier_input(self) != self.input_hash {
            return Err(ContractError::IdentityMismatch);
        }
        Ok(())
    }

    #[must_use]
    pub fn seal(mut self) -> Self {
        self.input_hash = hash_liquid_frontier_input(&self);
        self
    }
}

fn positions_bytes(positions: &[CellPos]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(positions.len() * 12);
    for position in positions {
        bytes.extend_from_slice(&position.x.to_le_bytes());
        bytes.extend_from_slice(&position.y.to_le_bytes());
        bytes.extend_from_slice(&position.z.to_le_bytes());
    }
    bytes
}

#[must_use]
pub fn hash_liquid_frontier_input(input: &LiquidFrontierStepV1) -> CanonicalHash {
    let mut hasher = CanonicalHasher::new("blockwild-liquid-frontier-input-v1");
    hasher.write_u16(crate::SIMULATION_SCHEMA_V1);
    write_identity(&mut hasher, &input.identity);
    hasher.write_str(&input.window.snapshot_hash.to_hex());
    hasher.write_bytes(&positions_bytes(&input.frontier));
    hasher.write_u32(input.operation_budget as u32);
    hasher.write_u16(u16::from(input.spread.water));
    hasher.write_u16(u16::from(input.spread.lava));
    hasher.write_u16(u16::from(input.spread.honey));
    hasher.write_u16(u16::from(input.spread.syrup));
    hasher.finish()
}

struct LiquidWorld<'a> {
    window: &'a WorldReadWindowV1,
    kinds: Vec<u8>,
    levels: Vec<u8>,
    flags: Vec<u8>,
    spread: LiquidSpreadV1,
    queue: VecDeque<CellPos>,
    queued: BTreeSet<CellPos>,
}

impl<'a> LiquidWorld<'a> {
    fn new(job: &'a LiquidFrontierStepV1) -> Self {
        let mut queue = VecDeque::new();
        let mut queued = BTreeSet::new();
        for position in &job.frontier {
            if job.window.sample(*position).is_some_and(|cell| cell.loaded) && queued.insert(*position) {
                queue.push_back(*position);
            }
        }
        Self {
            window: &job.window,
            kinds: job.window.liquid_kind.clone(),
            levels: job.window.liquid_level.clone(),
            flags: job.window.flags.clone(),
            spread: job.spread,
            queue,
            queued,
        }
    }

    fn loaded(&self, position: CellPos) -> bool {
        self.window.sample(position).is_some_and(|cell| cell.loaded)
    }

    fn cell(&self, position: CellPos) -> Option<LiquidCellV1> {
        let index = self.window.index(position)?;
        if self.window.loaded_mask[index] == 0 {
            return None;
        }
        let kind = LiquidKindV1::from_wire(self.kinds[index])?;
        if kind == LiquidKindV1::None {
            return None;
        }
        Some(LiquidCellV1 {
            kind,
            level: self.levels[index],
            source: self.flags[index] & WORLD_CELL_LIQUID_SOURCE != 0,
            falling: self.flags[index] & WORLD_CELL_LIQUID_FALLING != 0,
            waterlogged: self.flags[index] & WORLD_CELL_WATERLOGGED != 0,
        })
    }

    fn is_solid(&self, position: CellPos) -> bool {
        if !self.loaded(position) {
            return true;
        }
        let Some(index) = self.window.index(position) else {
            return true;
        };
        self.window.blocks[index] != 0 && self.kinds[index] == LiquidKindV1::None as u8
    }

    fn can_occupy(&self, position: CellPos, kind: LiquidKindV1) -> bool {
        if !self.loaded(position) || self.is_solid(position) {
            return false;
        }
        self.cell(position).is_none_or(|existing| existing.kind == kind)
    }

    fn enqueue(&mut self, position: CellPos) {
        if self.loaded(position) && self.queued.insert(position) {
            self.queue.push_back(position);
        }
    }

    fn enqueue_neighborhood(&mut self, position: CellPos) {
        self.enqueue(position);
        for offset in LIQUID_NEIGHBOR_ORDER_V1 {
            self.enqueue(position.offset(offset));
        }
    }

    fn max_spread(&self, kind: LiquidKindV1) -> u8 {
        self.spread.for_kind(kind).clamp(1, 15)
    }

    fn has_source_support(&self, position: CellPos) -> bool {
        let below = position.offset([0, -1, 0]);
        self.is_solid(below)
            || self
                .cell(below)
                .is_some_and(|liquid| liquid.kind == LiquidKindV1::Water && liquid.source)
    }

    fn can_become_water_source(&self, position: CellPos) -> bool {
        if !self.has_source_support(position) {
            return false;
        }
        LIQUID_CARDINAL_ORDER_V1
            .iter()
            .filter(|offset| {
                self.cell(position.offset(**offset)).is_some_and(|neighbor| {
                    neighbor.kind == LiquidKindV1::Water && neighbor.source && !neighbor.falling
                })
            })
            .count()
            >= 2
    }

    fn derive_flow(&self, position: CellPos, kind: LiquidKindV1) -> Option<LiquidCellV1> {
        if kind == LiquidKindV1::Water && self.can_become_water_source(position) {
            return Some(LiquidCellV1 {
                kind,
                level: 0,
                source: true,
                falling: false,
                waterlogged: false,
            });
        }
        let maximum = self.max_spread(kind);
        if let Some(above) = self.cell(position.offset([0, 1, 0])).filter(|above| above.kind == kind) {
            return Some(LiquidCellV1 {
                kind,
                level: above.level.max(1).min(maximum),
                source: false,
                falling: true,
                waterlogged: false,
            });
        }
        let best = LIQUID_CARDINAL_ORDER_V1
            .iter()
            .filter_map(|offset| {
                self.cell(position.offset(*offset))
                    .filter(|neighbor| neighbor.kind == kind)
                    .map(|neighbor| {
                        if neighbor.source {
                            1
                        } else {
                            neighbor.level.saturating_add(1)
                        }
                    })
            })
            .min()?;
        (best <= maximum).then_some(LiquidCellV1 {
            kind,
            level: best,
            source: false,
            falling: false,
            waterlogged: false,
        })
    }

    fn write(&mut self, position: CellPos, next: Option<LiquidCellV1>, changes: &mut Vec<LiquidChangeV1>) -> bool {
        let previous = self.cell(position);
        let next = next.map(|mut cell| {
            if cell.source {
                cell.level = 0;
                cell.falling = false;
            } else {
                cell.level = cell.level.max(1).min(self.max_spread(cell.kind));
            }
            cell
        });
        if previous == next {
            return false;
        }
        let Some(index) = self.window.index(position) else {
            return false;
        };
        match next {
            Some(cell) => {
                self.kinds[index] = cell.kind as u8;
                self.levels[index] = cell.level;
                self.flags[index] &= !(WORLD_CELL_LIQUID_SOURCE | WORLD_CELL_LIQUID_FALLING | WORLD_CELL_WATERLOGGED);
                if cell.source {
                    self.flags[index] |= WORLD_CELL_LIQUID_SOURCE;
                }
                if cell.falling {
                    self.flags[index] |= WORLD_CELL_LIQUID_FALLING;
                }
                if cell.waterlogged {
                    self.flags[index] |= WORLD_CELL_WATERLOGGED;
                }
            }
            None => {
                self.kinds[index] = LiquidKindV1::None as u8;
                self.levels[index] = 0;
                self.flags[index] &= !(WORLD_CELL_LIQUID_SOURCE | WORLD_CELL_LIQUID_FALLING | WORLD_CELL_WATERLOGGED);
            }
        }
        changes.push(LiquidChangeV1 {
            position,
            previous,
            next,
        });
        self.enqueue_neighborhood(position);
        true
    }

    fn flow_into(&mut self, position: CellPos, proposed: LiquidCellV1, changes: &mut Vec<LiquidChangeV1>) -> bool {
        if !self.can_occupy(position, proposed.kind) {
            return false;
        }
        let existing = self.cell(position);
        if existing.is_some_and(|cell| cell.source) {
            return false;
        }
        let proposed = if proposed.kind == LiquidKindV1::Water && self.can_become_water_source(position) {
            LiquidCellV1 {
                kind: LiquidKindV1::Water,
                level: 0,
                source: true,
                falling: false,
                waterlogged: false,
            }
        } else {
            proposed
        };
        if let Some(existing) = existing.filter(|existing| existing.kind == proposed.kind) {
            let existing_strength = if existing.source { -1 } else { i16::from(existing.level) };
            let proposed_strength = if proposed.source { -1 } else { i16::from(proposed.level) };
            if existing_strength <= proposed_strength {
                return false;
            }
        }
        self.write(position, Some(proposed), changes)
    }

    fn update_cell(&mut self, position: CellPos, changes: &mut Vec<LiquidChangeV1>) {
        let Some(mut cell) = self.cell(position) else {
            return;
        };
        if !cell.source {
            let Some(derived) = self.derive_flow(position, cell.kind) else {
                self.write(position, None, changes);
                return;
            };
            if cell != derived {
                self.write(position, Some(derived), changes);
                cell = derived;
            }
        }
        let maximum = self.max_spread(cell.kind);
        let below = position.offset([0, -1, 0]);
        let can_continue_downward = self.can_occupy(below, cell.kind);
        self.flow_into(
            below,
            LiquidCellV1 {
                kind: cell.kind,
                level: cell.level.max(1).min(maximum),
                source: false,
                falling: true,
                waterlogged: false,
            },
            changes,
        );
        if !cell.source && can_continue_downward {
            return;
        }
        let next_level = if cell.source { 1 } else { cell.level.saturating_add(1) };
        if next_level > maximum {
            return;
        }
        for offset in LIQUID_CARDINAL_ORDER_V1 {
            self.flow_into(
                position.offset(offset),
                LiquidCellV1 {
                    kind: cell.kind,
                    level: next_level,
                    source: false,
                    falling: false,
                    waterlogged: false,
                },
                changes,
            );
        }
    }
}

pub fn step_liquid_frontier(job: &LiquidFrontierStepV1) -> Result<LiquidFrontierResultV1, ContractError> {
    job.validate()?;
    let mut world = LiquidWorld::new(job);
    let initial = world.queue.len().min(job.operation_budget);
    let occupied_at_start: Vec<bool> = world
        .queue
        .iter()
        .take(initial)
        .map(|position| world.cell(*position).is_some())
        .collect();
    let mut changes = Vec::new();
    for occupied in occupied_at_start {
        let Some(position) = world.queue.pop_front() else { break };
        world.queued.remove(&position);
        if occupied && world.loaded(position) {
            world.update_cell(position, &mut changes);
        } else if world.cell(position).is_some() {
            world.enqueue(position);
        }
    }
    let remaining_frontier: Vec<_> = world.queue.into_iter().collect();
    let mut hasher = CanonicalHasher::new("blockwild-liquid-frontier-result-v1");
    hasher.write_u16(crate::SIMULATION_SCHEMA_V1);
    write_identity(&mut hasher, &job.identity);
    hasher.write_u32(initial as u32);
    hasher.write_bytes(&positions_bytes(
        &changes.iter().map(|change| change.position).collect::<Vec<_>>(),
    ));
    hasher.write_bytes(
        &changes
            .iter()
            .map(|change| change.previous.map_or(0, |cell| cell.kind as u8))
            .collect::<Vec<_>>(),
    );
    hasher.write_bytes(
        &changes
            .iter()
            .map(|change| change.previous.map_or(0, |cell| cell.level))
            .collect::<Vec<_>>(),
    );
    hasher.write_bytes(
        &changes
            .iter()
            .map(|change| liquid_wire_flags(change.previous))
            .collect::<Vec<_>>(),
    );
    hasher.write_bytes(
        &changes
            .iter()
            .map(|change| change.next.map_or(0, |cell| cell.kind as u8))
            .collect::<Vec<_>>(),
    );
    hasher.write_bytes(
        &changes
            .iter()
            .map(|change| change.next.map_or(0, |cell| cell.level))
            .collect::<Vec<_>>(),
    );
    hasher.write_bytes(
        &changes
            .iter()
            .map(|change| liquid_wire_flags(change.next))
            .collect::<Vec<_>>(),
    );
    hasher.write_bytes(&positions_bytes(&remaining_frontier));
    Ok(LiquidFrontierResultV1 {
        identity: job.identity.clone(),
        changes,
        remaining_frontier,
        operations: initial,
        result_hash: hasher.finish(),
    })
}

fn liquid_wire_flags(cell: Option<LiquidCellV1>) -> u8 {
    let Some(cell) = cell else { return 0 };
    let mut flags = 0_u8;
    if cell.source {
        flags |= LIQUID_CELL_SOURCE;
    }
    if cell.falling {
        flags |= LIQUID_CELL_FALLING;
    }
    if cell.kind.renewable() {
        flags |= LIQUID_CELL_RENEWABLE;
    }
    if cell.waterlogged {
        flags |= LIQUID_CELL_WATERLOGGED;
    }
    flags
}
