use std::collections::{BTreeMap, BTreeSet, VecDeque};

use blockwild_types::{EntityId, hash3_bits};

use crate::Vec3;

pub const ECOLOGY_SECTOR_SIZE: i32 = 64;
pub const TICKS_PER_DAY: u64 = 24_000;

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct ProtectionState(u64);

impl ProtectionState {
    pub const TAMED: u64 = 1 << 0;
    pub const OWNED: u64 = 1 << 1;
    pub const EVER_LED: u64 = 1 << 2;
    pub const CRAFTED_ENCLOSURE: u64 = 1 << 3;
    pub const NAMED: u64 = 1 << 4;
    pub const PERSISTENT_POI: u64 = 1 << 5;
    pub const LEGENDARY: u64 = 1 << 6;
    pub const GROUNDED_SUMMON: u64 = 1 << 7;
    pub const FACTION_RESIDENT: u64 = 1 << 8;
    pub const FOLLOWING: u64 = 1 << 9;

    #[must_use]
    pub const fn from_bits(bits: u64) -> Self {
        Self(bits)
    }

    #[must_use]
    pub const fn bits(self) -> u64 {
        self.0
    }

    #[must_use]
    pub const fn contains(self, flag: u64) -> bool {
        self.0 & flag != 0
    }

    pub fn insert(&mut self, flag: u64) {
        self.0 |= flag;
    }

    pub fn remove(&mut self, flag: u64) {
        self.0 &= !flag;
    }

    #[must_use]
    pub const fn is_protected(self) -> bool {
        self.0 != 0
    }
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
#[repr(u8)]
pub enum NaturalPool {
    SurfaceAnimal = 0,
    Ambient = 1,
    WaterAnimal = 2,
    WaterAmbient = 3,
    CaveWater = 4,
    Underground = 5,
    Monster = 6,
}

pub const NATURAL_POOLS: [NaturalPool; 7] = [
    NaturalPool::SurfaceAnimal,
    NaturalPool::Ambient,
    NaturalPool::WaterAnimal,
    NaturalPool::WaterAmbient,
    NaturalPool::CaveWater,
    NaturalPool::Underground,
    NaturalPool::Monster,
];

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct PoolBudget {
    pub target: f32,
    pub ceiling: f32,
}

fn desktop_budget(pool: NaturalPool) -> PoolBudget {
    match pool {
        NaturalPool::SurfaceAnimal => PoolBudget {
            target: 12.0,
            ceiling: 17.0,
        },
        NaturalPool::Ambient => PoolBudget {
            target: 10.0,
            ceiling: 14.0,
        },
        NaturalPool::WaterAnimal => PoolBudget {
            target: 8.0,
            ceiling: 12.0,
        },
        NaturalPool::WaterAmbient => PoolBudget {
            target: 20.0,
            ceiling: 30.0,
        },
        NaturalPool::CaveWater | NaturalPool::Underground => PoolBudget {
            target: 8.0,
            ceiling: 12.0,
        },
        NaturalPool::Monster => PoolBudget {
            target: 7.0,
            ceiling: 11.0,
        },
    }
}

fn round_quarter(value: f32) -> f32 {
    (value * 4.0).round() / 4.0
}

/// Current Blockwild local population budgets, with the same touch-device shape.
#[must_use]
pub fn natural_pool_budgets(touch: bool, density: f32) -> BTreeMap<NaturalPool, PoolBudget> {
    let scale = if density.is_finite() { density.max(0.0) } else { 1.0 } * if touch { 0.65 } else { 1.0 };
    NATURAL_POOLS
        .into_iter()
        .map(|pool| {
            let base = desktop_budget(pool);
            let budget = if scale <= 0.0 {
                PoolBudget::default()
            } else {
                PoolBudget {
                    target: round_quarter(base.target * scale).max(0.25),
                    ceiling: round_quarter(base.ceiling * scale).max(0.25),
                }
            };
            (pool, budget)
        })
        .collect()
}

#[must_use]
pub fn global_natural_cost_ceiling(touch: bool, density: f32, player_count: u8) -> f32 {
    let players = player_count.clamp(1, 4);
    let base = if touch { 58.0 } else { 92.0 };
    round_quarter(base * density.max(0.0) * f32::from(players).sqrt())
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct PopulationCell {
    pub cost: f32,
    pub count: u32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PopulationSnapshot {
    pub total_cost: f32,
    pub total_count: u32,
    pub by_pool: BTreeMap<NaturalPool, PopulationCell>,
}

impl Default for PopulationSnapshot {
    fn default() -> Self {
        Self {
            total_cost: 0.0,
            total_count: 0,
            by_pool: NATURAL_POOLS
                .into_iter()
                .map(|pool| (pool, PopulationCell::default()))
                .collect(),
        }
    }
}

impl PopulationSnapshot {
    pub fn add(&mut self, pool: NaturalPool, cost: f32, count: u32) {
        if !cost.is_finite() || cost <= 0.0 || count == 0 {
            return;
        }
        let cell = self.by_pool.entry(pool).or_default();
        cell.cost = round_quarter(cell.cost + cost);
        cell.count = cell.count.saturating_add(count);
        self.total_cost = round_quarter(self.total_cost + cost);
        self.total_count = self.total_count.saturating_add(count);
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct SpawnCandidate {
    pub candidate_id: u64,
    pub kind_key: String,
    pub pool: NaturalPool,
    pub center: Vec3,
    pub creature_cost: f32,
    pub requested_count: u16,
    pub eligibility_roll: f32,
    pub spawn_probability: f32,
    pub priority: i16,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SpawnAdmission {
    pub candidate_id: u64,
    pub kind_key: String,
    pub pool: NaturalPool,
    pub center: Vec3,
    pub count: u16,
    pub admitted_cost: f32,
}

/// Deterministically admits deficient-pool candidates under local and global cost ceilings.
#[must_use]
pub fn admit_spawns(
    candidates: &[SpawnCandidate],
    snapshot: &PopulationSnapshot,
    budgets: &BTreeMap<NaturalPool, PoolBudget>,
    global_ceiling: f32,
    max_admissions: usize,
) -> Vec<SpawnAdmission> {
    let mut working = snapshot.clone();
    let mut ordered: Vec<_> = candidates
        .iter()
        .filter(|candidate| {
            candidate.creature_cost.is_finite()
                && candidate.creature_cost > 0.0
                && candidate.requested_count > 0
                && candidate.eligibility_roll.is_finite()
                && candidate.eligibility_roll >= 0.0
                && candidate.eligibility_roll <= candidate.spawn_probability.clamp(0.0, 1.0)
        })
        .cloned()
        .collect();
    ordered.sort_by(|left, right| {
        let left_deficit = deficit_ratio(left.pool, &working, budgets);
        let right_deficit = deficit_ratio(right.pool, &working, budgets);
        right_deficit
            .total_cmp(&left_deficit)
            .then_with(|| right.priority.cmp(&left.priority))
            .then_with(|| left.candidate_id.cmp(&right.candidate_id))
    });

    let mut admissions = Vec::new();
    for candidate in ordered {
        if admissions.len() >= max_admissions {
            break;
        }
        let budget = budgets.get(&candidate.pool).copied().unwrap_or_default();
        let current = working.by_pool.get(&candidate.pool).copied().unwrap_or_default().cost;
        if current >= budget.target || current >= budget.ceiling || working.total_cost >= global_ceiling {
            continue;
        }
        let pool_capacity = spawn_count_capacity(budget.ceiling - current, candidate.creature_cost);
        let global_capacity = spawn_count_capacity(global_ceiling - working.total_cost, candidate.creature_cost);
        let count = u32::from(candidate.requested_count)
            .min(pool_capacity)
            .min(global_capacity) as u16;
        if count == 0 {
            continue;
        }
        let cost = round_quarter(candidate.creature_cost * f32::from(count));
        working.add(candidate.pool, cost, u32::from(count));
        admissions.push(SpawnAdmission {
            candidate_id: candidate.candidate_id,
            kind_key: candidate.kind_key,
            pool: candidate.pool,
            center: candidate.center,
            count,
            admitted_cost: cost,
        });
    }
    admissions
}

fn deficit_ratio(pool: NaturalPool, snapshot: &PopulationSnapshot, budgets: &BTreeMap<NaturalPool, PoolBudget>) -> f32 {
    let budget = budgets.get(&pool).copied().unwrap_or_default();
    if budget.target <= 0.0 {
        return 0.0;
    }
    let current = snapshot.by_pool.get(&pool).copied().unwrap_or_default().cost;
    ((budget.target - current) / budget.target).max(0.0)
}

#[must_use]
pub fn spawn_count_capacity(cost_budget: f32, creature_cost: f32) -> u32 {
    if cost_budget <= 0.0 || creature_cost <= 0.0 || !cost_budget.is_finite() || !creature_cost.is_finite() {
        return 0;
    }
    ((cost_budget + 1.0e-6) / creature_cost).floor().max(0.0) as u32
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RangeLifecycleInput {
    pub protection: ProtectionState,
    pub distance: f32,
    pub simulation_radius: f32,
    pub out_of_range_seconds: f32,
    pub elapsed_seconds: f32,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RangeAction {
    Active,
    Linger,
    Sleep,
    Despawn,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RangeLifecycleDecision {
    pub action: RangeAction,
    pub out_of_range_seconds: f32,
}

#[must_use]
pub fn range_lifecycle(input: RangeLifecycleInput) -> RangeLifecycleDecision {
    if input.protection.contains(ProtectionState::FOLLOWING) || input.distance <= input.simulation_radius {
        return RangeLifecycleDecision {
            action: RangeAction::Active,
            out_of_range_seconds: 0.0,
        };
    }
    if input.protection.is_protected() {
        return RangeLifecycleDecision {
            action: if input.distance > input.simulation_radius + 24.0 {
                RangeAction::Sleep
            } else {
                RangeAction::Linger
            },
            out_of_range_seconds: 0.0,
        };
    }
    let elapsed = input.out_of_range_seconds.max(0.0) + input.elapsed_seconds.max(0.0);
    RangeLifecycleDecision {
        action: if elapsed >= 45.0 {
            RangeAction::Despawn
        } else {
            RangeAction::Linger
        },
        out_of_range_seconds: elapsed,
    }
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct EcologySector {
    pub last_updated_tick: u64,
    /// Quarter-cost units keep normalization deterministic and float-free.
    pub recent_kills_quarters: BTreeMap<String, u32>,
}

impl EcologySector {
    #[must_use]
    pub fn normalized(&self, current_tick: u64) -> Self {
        let elapsed_ticks = current_tick.saturating_sub(self.last_updated_tick);
        let decay_quarters = elapsed_ticks.saturating_mul(4) / TICKS_PER_DAY;
        let recent_kills_quarters = self
            .recent_kills_quarters
            .iter()
            .filter_map(|(kind, pressure)| {
                let next = pressure.saturating_sub(u32::try_from(decay_quarters).unwrap_or(u32::MAX));
                (next > 0).then_some((kind.clone(), next))
            })
            .collect();
        Self {
            last_updated_tick: current_tick.max(self.last_updated_tick),
            recent_kills_quarters,
        }
    }

    #[must_use]
    pub fn record_kill(&self, kind_key: &str, creature_cost: f32, current_tick: u64) -> Self {
        let mut next = self.normalized(current_tick);
        let pressure = (creature_cost.max(0.5) * 2.0).round().max(1.0) as u32;
        let entry = next.recent_kills_quarters.entry(kind_key.to_owned()).or_default();
        *entry = entry.saturating_add(pressure);
        next
    }

    #[must_use]
    pub fn species_spawn_multiplier(&self, kind_key: &str, current_tick: u64) -> f32 {
        let pressure = self
            .normalized(current_tick)
            .recent_kills_quarters
            .get(kind_key)
            .copied()
            .unwrap_or_default() as f32
            / 4.0;
        (1.0 / pressure.mul_add(1.5, 1.0)).max(0.12)
    }
}

#[must_use]
pub const fn ecology_sector_key(x: i32, z: i32) -> [i32; 2] {
    [x.div_euclid(ECOLOGY_SECTOR_SIZE), z.div_euclid(ECOLOGY_SECTOR_SIZE)]
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct EnclosureCell {
    pub x: i32,
    pub z: i32,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct EnclosureOptions {
    pub max_radius: i32,
    pub max_visited: usize,
    pub minimum_barrier_cells: usize,
}

impl Default for EnclosureOptions {
    fn default() -> Self {
        Self {
            max_radius: 18,
            max_visited: 1_024,
            minimum_barrier_cells: 8,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EnclosureScan {
    pub enclosed: bool,
    pub interior: Vec<EnclosureCell>,
    pub barrier_count: usize,
}

/// Bounded crafted-fence flood fill. Closed gates belong in `barriers`; open gates do not.
#[must_use]
pub fn scan_crafted_enclosure(
    start: EnclosureCell,
    barriers: &BTreeSet<EnclosureCell>,
    options: EnclosureOptions,
) -> EnclosureScan {
    let max_radius = options.max_radius.max(3);
    let max_visited = options.max_visited.max(32);
    let minimum_barriers = options.minimum_barrier_cells.max(4);
    if barriers.contains(&start) {
        return EnclosureScan {
            enclosed: false,
            interior: Vec::new(),
            barrier_count: 0,
        };
    }
    let steps = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let mut queue = VecDeque::from([start]);
    let mut visited = BTreeSet::from([start]);
    let mut touched = BTreeSet::new();
    while let Some(cell) = queue.pop_front() {
        if visited.len() > max_visited {
            return enclosure_scan(false, visited, touched.len());
        }
        for [dx, dz] in steps {
            let next = EnclosureCell {
                x: cell.x + dx,
                z: cell.z + dz,
            };
            if barriers.contains(&next) {
                touched.insert(next);
                continue;
            }
            if (next.x - start.x).abs() >= max_radius || (next.z - start.z).abs() >= max_radius {
                return enclosure_scan(false, visited, touched.len());
            }
            if visited.insert(next) {
                queue.push_back(next);
            }
        }
    }
    enclosure_scan(touched.len() >= minimum_barriers, visited, touched.len())
}

fn enclosure_scan(enclosed: bool, visited: BTreeSet<EnclosureCell>, barrier_count: usize) -> EnclosureScan {
    EnclosureScan {
        enclosed,
        interior: visited.into_iter().collect(),
        barrier_count,
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CreatureSex {
    Unknown,
    Female,
    Male,
}

#[derive(Clone, Debug, PartialEq)]
pub struct BreedingCandidate {
    pub id: EntityId,
    pub kind_key: String,
    pub sex: CreatureSex,
    pub position: Vec3,
    pub adult: bool,
    pub bonded: bool,
    pub well_fed: bool,
    pub cooldown_until_tick: u64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct BreedingPlan {
    pub left: EntityId,
    pub right: EntityId,
    pub kind_key: String,
    pub offspring_seed: u32,
    pub position: Vec3,
}

#[must_use]
pub fn plan_breeding_pairs(candidates: &[BreedingCandidate], tick: u64, maximum_distance: f32) -> Vec<BreedingPlan> {
    let maximum_distance_squared = maximum_distance.max(0.0).powi(2);
    let mut ordered: Vec<_> = candidates
        .iter()
        .filter(|candidate| {
            candidate.adult
                && candidate.bonded
                && candidate.well_fed
                && candidate.cooldown_until_tick <= tick
                && candidate.sex != CreatureSex::Unknown
                && candidate.position.is_finite()
        })
        .collect();
    ordered.sort_by(|left, right| left.kind_key.cmp(&right.kind_key).then_with(|| left.id.cmp(&right.id)));
    let mut paired = BTreeSet::new();
    let mut plans = Vec::new();
    for left in &ordered {
        if paired.contains(&left.id) {
            continue;
        }
        let partner = ordered
            .iter()
            .filter(|right| {
                !paired.contains(&right.id)
                    && right.id != left.id
                    && right.kind_key == left.kind_key
                    && right.sex != left.sex
                    && (right.position - left.position).length_squared() <= maximum_distance_squared
            })
            .min_by(|first, second| {
                let first_distance = (first.position - left.position).length_squared();
                let second_distance = (second.position - left.position).length_squared();
                first_distance
                    .total_cmp(&second_distance)
                    .then_with(|| first.id.cmp(&second.id))
            });
        let Some(right) = partner else {
            continue;
        };
        paired.insert(left.id);
        paired.insert(right.id);
        let x = left.id.0.index() as i32 ^ right.id.0.index() as i32;
        let y = (tick as u32) as i32;
        let z = left.id.0.generation() as i32 ^ right.id.0.generation() as i32;
        plans.push(BreedingPlan {
            left: left.id,
            right: right.id,
            kind_key: left.kind_key.clone(),
            offspring_seed: hash3_bits(x, y, z, 0x4252_4544),
            position: (left.position + right.position) * 0.5,
        });
    }
    plans
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct DormantPopulationSummary {
    pub last_updated_tick: u64,
    pub population_by_kind: BTreeMap<String, u32>,
    pub protected_by_kind: BTreeMap<String, u32>,
    pub births: u64,
    pub deaths: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct DormantAdvancePolicy {
    pub carrying_capacity: u32,
    pub births_per_thousand_per_day: u16,
    pub deaths_per_thousand_per_day: u16,
    pub maximum_days_per_advance: u16,
}

/// Bounded analytical ecology update; it never replays every missed simulation tick.
#[must_use]
pub fn advance_dormant_population(
    summary: &DormantPopulationSummary,
    tick: u64,
    policy: DormantAdvancePolicy,
) -> DormantPopulationSummary {
    let elapsed_days = tick.saturating_sub(summary.last_updated_tick) / TICKS_PER_DAY;
    let days = elapsed_days.min(u64::from(policy.maximum_days_per_advance));
    if days == 0 {
        return summary.clone();
    }
    let mut next = summary.clone();
    for (kind_index, (kind, population)) in summary.population_by_kind.iter().enumerate() {
        let protected = summary
            .protected_by_kind
            .get(kind)
            .copied()
            .unwrap_or_default()
            .min(*population);
        let vulnerable = population.saturating_sub(protected);
        let deaths_numerator = u64::from(vulnerable)
            .saturating_mul(u64::from(policy.deaths_per_thousand_per_day))
            .saturating_mul(days);
        let deaths = stochastic_round(deaths_numerator, 1_000, kind_index as u32, tick);
        let survivors = population.saturating_sub(deaths.min(u64::from(vulnerable)) as u32);
        let remaining_capacity = policy.carrying_capacity.saturating_sub(survivors);
        let births_numerator = u64::from(survivors)
            .saturating_mul(u64::from(policy.births_per_thousand_per_day))
            .saturating_mul(days);
        let births = stochastic_round(births_numerator, 1_000, kind_index as u32 ^ 0xB17, tick)
            .min(u64::from(remaining_capacity)) as u32;
        next.population_by_kind
            .insert(kind.clone(), survivors.saturating_add(births));
        next.births = next.births.saturating_add(u64::from(births));
        next.deaths = next
            .deaths
            .saturating_add(u64::from(population.saturating_sub(survivors)));
    }
    next.last_updated_tick = summary
        .last_updated_tick
        .saturating_add(days.saturating_mul(TICKS_PER_DAY));
    next
}

fn stochastic_round(numerator: u64, denominator: u64, salt: u32, tick: u64) -> u64 {
    let whole = numerator / denominator;
    let remainder = numerator % denominator;
    if remainder == 0 {
        return whole;
    }
    let roll = u64::from(hash3_bits(salt as i32, tick as i32, (tick >> 32) as i32, 0x4543_4F4C)) % denominator;
    whole + u64::from(roll < remainder)
}
