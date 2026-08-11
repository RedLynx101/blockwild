//! Canonical native fixtures and allocation-inclusive micro-benchmark hooks.

use blockwild_types::CanonicalHash;

use crate::*;

#[derive(Clone, Debug)]
pub struct CanonicalSimulationFixture {
    pub physics: PhysicsStepInputV1,
    pub liquid: LiquidFrontierStepV1,
    pub path: PathJobV1,
    pub air: AirZoneTopologyJobV1,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct NativeBenchmarkReport {
    pub iterations: u32,
    pub physics_micros: u128,
    pub liquid_micros: u128,
    pub path_micros: u128,
    pub air_micros: u128,
    pub digest: u64,
}

#[must_use]
pub fn canonical_fixture() -> CanonicalSimulationFixture {
    let address = WorldAddressV1 {
        universe_id: "7".into(),
        location_id: "blockwild".into(),
    };
    let identity = WorldIdentityV1 {
        address: address.clone(),
        revision: WorldRevisionV1 {
            epoch: 2,
            mutation: 41,
            residency: 9,
        },
        state_hash: CanonicalHash([0x31; 16]),
    };
    let size = [12, 6, 12];
    let count = size.iter().map(|value| *value as usize).product();
    let mut window = WorldReadWindowV1 {
        address,
        origin: CellPos::new(-2, -1, -2),
        size,
        identity: identity.clone(),
        loaded_mask: vec![1; count],
        boundary: vec![0; count],
        blocks: vec![0; count],
        facing: vec![0; count],
        liquid_kind: vec![0; count],
        liquid_level: vec![0; count],
        flags: vec![0; count],
        snapshot_hash: CanonicalHash::default(),
    };
    for z in -2..10 {
        for x in -2..10 {
            let floor = window.index(CellPos::new(x, 0, z)).expect("fixture floor in range");
            window.blocks[floor] = 1;
        }
    }
    for z in 3..=5 {
        for x in 3..=5 {
            let water = window.index(CellPos::new(x, 1, z)).expect("fixture water in range");
            window.liquid_kind[water] = LiquidKindV1::Water as u8;
            window.liquid_level[water] = 0;
            window.flags[water] = WORLD_CELL_LIQUID_SOURCE;
        }
    }
    let wall = window.index(CellPos::new(2, 1, 1)).expect("fixture wall in range");
    window.blocks[wall] = 2;
    window.snapshot_hash = crate::contract::hash_world_window(&window);
    let job_identity = SimulationJobIdentityV1 {
        job_id: "r5-canonical".into(),
        sequence: 17,
        world: identity,
        source_snapshot_hash: window.snapshot_hash,
    };

    let physics = PhysicsStepInputV1 {
        identity: job_identity.clone(),
        fixed_delta_micros: 16_667,
        window: window.clone(),
        body: PhysicsBodyV1 {
            handle: "player:fixture".into(),
            position: Vec3::new(0.0, 0.51, 1.0),
            velocity: Vec3::default(),
            radius: 0.3,
            height: 1.8,
            mass: 1.15,
            grounded: true,
            crouching: false,
            fall_distance: 0.0,
            oxygen_seconds: 12.0,
            drowning_accumulator: 0.0,
            swim_entry_momentum_speed: 0.0,
            swim_surface_breach_ready: true,
            swim_surface_breach_seconds: 0.0,
            swim_stroke_cooldown_seconds: 0.0,
            swim_surface_bob_active: false,
        },
        controls: PhysicsControlsV1 {
            flags: 0,
            forward: 1.0,
            strafe: 0.0,
            yaw: 0.0,
            desired_speed: 5.2,
        },
        gravity: GravityProfileV1::default(),
        swimming: PhysicsSwimProfileV1::default(),
        external_impulses: Vec::new(),
        input_hash: CanonicalHash::default(),
    }
    .seal();

    let liquid = LiquidFrontierStepV1 {
        identity: job_identity.clone(),
        window,
        frontier: vec![CellPos::new(3, 1, 3)],
        operation_budget: 64,
        spread: LiquidSpreadV1::default(),
        input_hash: CanonicalHash::default(),
    }
    .seal();

    let path_size = [8, 4, 8];
    let path_count = path_size.iter().map(|value| *value as usize).product();
    let mut occupancy = PathOccupancyWindowV1 {
        origin: CellPos::new(0, 0, 0),
        size: path_size,
        cells: vec![PATH_CELL_LOADED | PATH_CELL_PASSABLE; path_count],
        snapshot_hash: CanonicalHash::default(),
    };
    for z in 0..8 {
        for x in 0..8 {
            let index = occupancy.index(CellPos::new(x, 1, z)).expect("path fixture in range");
            occupancy.cells[index] |= PATH_CELL_SUPPORT;
        }
    }
    for y in 1..=2 {
        let index = occupancy.index(CellPos::new(3, y, 3)).expect("path obstacle in range");
        occupancy.cells[index] &= !PATH_CELL_PASSABLE;
    }
    let path = PathJobV1 {
        identity: job_identity.clone(),
        occupancy,
        start: Vec3::new(1.0, 1.0, 1.0),
        goal: Vec3::new(6.0, 1.0, 6.0),
        maximum_distance: 96.0,
        maximum_nodes: 4_096,
        body_radius: 0.3,
        body_height: 1.8,
        input_hash: CanonicalHash::default(),
    }
    .seal();

    let air_size = [5, 5, 5];
    let air_count = air_size.iter().map(|value| *value as usize).product();
    let mut air = AirZoneTopologyJobV1 {
        identity: job_identity,
        topology_revision: 4,
        origin: CellPos::new(0, 0, 0),
        size: air_size,
        cells: vec![AIR_CELL_LOADED | AIR_CELL_SOLID | AIR_CELL_SEALABLE; air_count],
        maximum_visited_cells: 4_096,
        input_hash: CanonicalHash::default(),
    };
    for y in 1..4 {
        for z in 1..4 {
            for x in 1..4 {
                let index = air.index(CellPos::new(x, y, z)).expect("air fixture in range");
                air.cells[index] = AIR_CELL_LOADED | AIR_CELL_TRAVERSABLE_GAS;
            }
        }
    }
    let vent = air.index(CellPos::new(2, 2, 2)).expect("vent in range");
    air.cells[vent] |= AIR_CELL_VENT;
    air = air.seal();

    CanonicalSimulationFixture {
        physics,
        liquid,
        path,
        air,
    }
}

#[cfg(not(target_arch = "wasm32"))]
#[must_use]
pub fn run_native_benchmark(iterations: u32) -> NativeBenchmarkReport {
    use std::{hint::black_box, time::Instant};
    let fixture = canonical_fixture();
    let iterations = iterations.max(1);
    let mut digest = 0_u64;

    let started = Instant::now();
    for index in 0..iterations {
        let result = black_box(step_physics(black_box(&fixture.physics)).expect("canonical physics fixture"));
        digest = digest.rotate_left(5)
            ^ u64::from_le_bytes(result.result_hash.0[..8].try_into().expect("eight hash bytes"))
            ^ u64::from(index);
    }
    let physics_micros = started.elapsed().as_micros();

    let started = Instant::now();
    for index in 0..iterations {
        let result = black_box(step_liquid_frontier(black_box(&fixture.liquid)).expect("canonical liquid fixture"));
        digest = digest.rotate_left(7)
            ^ u64::from_le_bytes(result.result_hash.0[..8].try_into().expect("eight hash bytes"))
            ^ u64::from(index);
    }
    let liquid_micros = started.elapsed().as_micros();

    let started = Instant::now();
    for index in 0..iterations {
        let result = black_box(find_path(black_box(&fixture.path)).expect("canonical path fixture"));
        digest = digest.rotate_left(11)
            ^ u64::from_le_bytes(result.result_hash.0[..8].try_into().expect("eight hash bytes"))
            ^ u64::from(index);
    }
    let path_micros = started.elapsed().as_micros();

    let started = Instant::now();
    for index in 0..iterations {
        let result = black_box(solve_air_zones(black_box(&fixture.air)).expect("canonical air fixture"));
        digest = digest.rotate_left(13)
            ^ u64::from_le_bytes(result.result_hash.0[..8].try_into().expect("eight hash bytes"))
            ^ u64::from(index);
    }
    NativeBenchmarkReport {
        iterations,
        physics_micros,
        liquid_micros,
        path_micros,
        air_micros: started.elapsed().as_micros(),
        digest,
    }
}
