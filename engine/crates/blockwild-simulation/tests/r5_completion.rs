use blockwild_simulation::*;
use blockwild_types::CanonicalHash;

fn test_window(origin: CellPos, size: [u32; 3]) -> WorldReadWindowV1 {
    let address = WorldAddressV1 {
        universe_id: "test".into(),
        location_id: "r5".into(),
    };
    let identity = WorldIdentityV1 {
        address: address.clone(),
        revision: WorldRevisionV1 {
            epoch: 3,
            mutation: 11,
            residency: 5,
        },
        state_hash: CanonicalHash([0x52; 16]),
    };
    let count = size.iter().map(|value| *value as usize).product();
    WorldReadWindowV1 {
        address,
        origin,
        size,
        identity,
        loaded_mask: vec![1; count],
        boundary: vec![0; count],
        blocks: vec![0; count],
        facing: vec![0; count],
        liquid_kind: vec![0; count],
        liquid_level: vec![0; count],
        flags: vec![0; count],
        snapshot_hash: CanonicalHash::default(),
    }
}

fn set_block(window: &mut WorldReadWindowV1, position: CellPos, block: u16) {
    let index = window.index(position).expect("fixture cell");
    window.blocks[index] = block;
}

fn identity_for(window: &WorldReadWindowV1, job_id: &str, sequence: u32) -> SimulationJobIdentityV1 {
    SimulationJobIdentityV1 {
        job_id: job_id.into(),
        sequence,
        world: window.identity.clone(),
        source_snapshot_hash: window.snapshot_hash,
    }
}

#[test]
fn sealed_windows_reject_tampering_and_residency_changes_are_stale() {
    let mut window = test_window(CellPos::new(-2, -1, -2), [4, 4, 4]).seal();
    assert!(window.validate().is_ok());
    let identity = identity_for(&window, "stale", 1);
    window.blocks[0] = 9;
    assert_eq!(window.validate(), Err(ContractError::IdentityMismatch));

    let mut current = identity.world.clone();
    current.revision.residency += 1;
    assert_eq!(
        classify_simulation_freshness(&identity, &current, identity.source_snapshot_hash),
        SimulationFreshnessV1::StaleResidency
    );
    assert_eq!(
        classify_simulation_freshness(&identity, &identity.world, CanonicalHash([0x99; 16])),
        SimulationFreshnessV1::StaleSnapshot
    );
}

#[test]
fn door_shapes_match_legacy_slabs_and_unknown_cells_fail_closed() {
    let mut world = test_window(CellPos::new(-3, -1, -3), [8, 5, 8]);
    for z in -3..5 {
        for x in -3..5 {
            set_block(&mut world, CellPos::new(x, 0, z), 1);
        }
    }
    set_block(&mut world, CellPos::new(1, 1, 0), 7);
    world = world.seal();
    let closed = CollisionShapeWindowV1 {
        world: world.clone(),
        overrides: vec![legacy_door_override(CellPos::new(1, 1, 0), true, false)],
    };
    let open = CollisionShapeWindowV1 {
        world,
        overrides: vec![legacy_door_override(CellPos::new(1, 1, 0), true, true)],
    };
    closed.validate().expect("closed door fixture");
    open.validate().expect("open door fixture");
    assert!(collides_body_shapes(&closed, Vec3::new(0.95, 0.51, 0.0), 0.3, 1.8).0);
    assert!(!collides_body_shapes(&open, Vec3::new(0.95, 0.51, 0.0), 0.3, 1.8).0);
    assert!(collides_body_shapes(&open, Vec3::new(-3.45, 0.51, 0.0), 0.3, 1.8).0);
}

#[test]
fn partial_tread_has_a_bounded_deterministic_step_path() {
    let mut world = test_window(CellPos::new(-3, -1, -3), [8, 5, 8]);
    for z in -3..5 {
        for x in -3..5 {
            set_block(&mut world, CellPos::new(x, 0, z), 1);
        }
    }
    set_block(&mut world, CellPos::new(1, 1, 0), 9);
    world = world.seal();
    let shapes = CollisionShapeWindowV1 {
        world,
        overrides: vec![legacy_height_override(CellPos::new(1, 1, 0), 0.5)],
    };
    let input = HorizontalStepInputV1 {
        position: Vec3::new(0.0, 0.51, 0.0),
        radius: 0.3,
        height: 1.8,
        axis: 0,
        distance: 1.0,
        maximum_sweep_step: 0.14,
        step_height: 0.55,
    };
    let blocked = sweep_body_horizontal_with_step(
        &shapes,
        HorizontalStepInputV1 {
            step_height: 0.0,
            ..input
        },
    );
    let stepped = sweep_body_horizontal_with_step(&shapes, input);
    assert!(blocked.blocked);
    assert!(stepped.stepped && !stepped.blocked);
    assert!(stepped.position.x > 0.99 && stepped.position.y > 0.9);
    assert_eq!(stepped, sweep_body_horizontal_with_step(&shapes, input));
}

#[test]
fn creative_flight_and_hit_hop_preserve_legacy_controller_values() {
    let control = CreativeFlightControlV1 {
        forward: 1.0,
        strafe: 0.0,
        yaw: 0.0,
        ascend: true,
        descend: false,
        sprinting: true,
        movement_multiplier: 1.0,
    };
    let next = step_creative_flight_velocity(Vec3::default(), control, 1.0 / 60.0);
    assert!((next.z + 4.133_333_333_333_334).abs() < 1e-12);
    assert!((next.y - 3.6).abs() < 1e-12);

    let hit = apply_legacy_player_knockback(KnockbackInputV1 {
        velocity: Vec3::default(),
        player_position: Vec3::new(2.0, 1.0, 0.0),
        origin: Vec3::default(),
        yaw: 0.0,
        strength: 2.0,
        swimming: false,
        grounded: true,
        restrained: false,
    });
    assert_eq!(hit.applied_speed, 4.0);
    assert_eq!(hit.velocity, Vec3::new(4.0, 3.8, 0.0));
    assert!(!hit.grounded);

    let water_hit = apply_legacy_player_knockback(KnockbackInputV1 {
        swimming: true,
        grounded: false,
        ..KnockbackInputV1 {
            velocity: Vec3::default(),
            player_position: Vec3::new(2.0, 1.0, 0.0),
            origin: Vec3::default(),
            yaw: 0.0,
            strength: 2.0,
            swimming: false,
            grounded: true,
            restrained: false,
        }
    });
    assert_eq!(water_hit.velocity, Vec3::new(2.4, 1.5, 0.0));
}

#[test]
fn sailboat_candidate_matches_legacy_water_commit_and_dry_rejection() {
    let current = SailboatKinematicsV1 {
        position: Vec3::new(-16.25, 32.5, 0.0),
        yaw: 0.0,
        velocity: 0.0,
    };
    let candidate = sailboat_candidate(
        current,
        SailboatControlV1 {
            forward: 1.0,
            turn: 0.5,
        },
        0.05,
    );
    let water = commit_sailboat_candidate(
        current,
        candidate,
        SailboatWaterSamplesV1 {
            center: true,
            bow: true,
            stern: true,
        },
    );
    assert_ne!(water.position, current.position);
    let dry = commit_sailboat_candidate(
        current,
        candidate,
        SailboatWaterSamplesV1 {
            center: true,
            bow: false,
            stern: true,
        },
    );
    assert_eq!(dry.position, current.position);
    assert!(dry.velocity <= 0.0);
    assert_eq!(sailboat_seat_offset(0, 0.0), Vec3::new(-0.34, 0.55, 0.18));
}

#[test]
fn voxel_dda_is_stable_across_negative_chunk_coordinates() {
    let mut world = test_window(CellPos::new(-18, -1, -2), [8, 5, 5]);
    set_block(&mut world, CellPos::new(-16, 1, 0), 4);
    world = world.seal();
    let query = VoxelRaycastQueryV1 {
        query_id: 9,
        origin: Vec3::new(-17.4, 1.0, 0.0),
        direction: Vec3::new(1.0, 0.0, 0.0),
        maximum_distance: 8.0,
        maximum_visited_cells: 64,
        hit_liquids: false,
    };
    let result = raycast_voxels(&world, query).expect("valid DDA");
    let hit = result.hit.expect("chunk-edge wall");
    assert_eq!(hit.cell, CellPos::new(-16, 1, 0));
    assert_eq!(hit.kind, VoxelRayHitKindV1::Solid);
    assert_eq!(hit.normal, Vec3::new(-1.0, 0.0, 0.0));
    let reversed =
        raycast_voxel_batch(&world, &[VoxelRaycastQueryV1 { query_id: 10, ..query }, query]).expect("stable batch");
    assert_eq!(reversed[0].query_id, 9);
}

#[test]
fn projectile_contacts_are_continuous_and_target_wins_a_tie() {
    let mut world = test_window(CellPos::new(-4, -1, -2), [10, 5, 5]);
    set_block(&mut world, CellPos::new(2, 1, 0), 4);
    world = world.seal();
    let projectile = ProjectileSweepV1 {
        projectile_id: 7,
        origin: Vec3::new(0.0, 1.0, 0.0),
        displacement: Vec3::new(4.0, 0.0, 0.0),
        radius: 0.1,
    };
    let contacts = sweep_projectile_contacts_batch(
        &world,
        &[projectile],
        &[SweepTargetV1 {
            target_id: 3,
            bounds: AabbV1::new(Vec3::new(1.4, 0.5, -0.4), Vec3::new(2.0, 1.5, 0.4)),
        }],
    )
    .expect("projectile batch");
    assert_eq!(contacts.len(), 1);
    assert_eq!(contacts[0].kind, ProjectileContactKindV1::Target);
    assert_eq!(contacts[0].target_id, Some(3));
}

#[test]
fn broadphase_is_bounded_order_independent_and_layered() {
    let entities = [
        BroadphaseEntityV1 {
            entity_id: 8,
            bounds: AabbV1::new(Vec3::new(0.0, 0.0, 0.0), Vec3::new(1.0, 1.0, 1.0)),
            layer_mask: 1,
        },
        BroadphaseEntityV1 {
            entity_id: 2,
            bounds: AabbV1::new(Vec3::new(0.5, 0.0, 0.5), Vec3::new(1.5, 1.0, 1.5)),
            layer_mask: 3,
        },
        BroadphaseEntityV1 {
            entity_id: 5,
            bounds: AabbV1::new(Vec3::new(40.0, 0.0, 40.0), Vec3::new(41.0, 1.0, 41.0)),
            layer_mask: 1,
        },
    ];
    let query = BroadphaseQueryV1 {
        query_id: 4,
        bounds: AabbV1::new(Vec3::new(-1.0, -1.0, -1.0), Vec3::new(2.0, 2.0, 2.0)),
        layer_mask: 1,
        maximum_results: 8,
    };
    let result = run_broadphase_batch(4.0, &entities, &[query]).expect("broadphase");
    assert_eq!(result[0].entity_ids, vec![2, 8]);
    let reversed: Vec<_> = entities.into_iter().rev().collect();
    assert_eq!(
        result,
        run_broadphase_batch(4.0, &reversed, &[query]).expect("reordered")
    );
}

#[test]
fn fixed_point_gas_conserves_components_and_tracks_vacuum_loss() {
    let fixture = blockwild_simulation::fixture::canonical_fixture();
    let identity = fixture.air.identity.clone();
    let initial = GasMixtureV1 {
        oxygen: 210_000_000,
        nitrogen: 780_000_000,
        carbon_dioxide: 10_000_000,
        toxic: 0,
    };
    let job = GasEqualizationJobV1 {
        identity,
        topology_revision: 9,
        fixed_delta_micros: 100_000,
        maximum_connections: 2,
        zones: vec![
            AirZoneGasStateV1 {
                zone_id: 1,
                volume_units: 1_000,
                mixture: initial,
            },
            AirZoneGasStateV1 {
                zone_id: 2,
                volume_units: 1_000,
                mixture: GasMixtureV1::default(),
            },
        ],
        connections: vec![
            AirConnectionV1 {
                connection_id: 1,
                from_zone: 1,
                to_zone: Some(2),
                kind: AirConnectionKindV1::Airlock,
                conductance_ppm: 1_000_000,
                enabled: true,
            },
            AirConnectionV1 {
                connection_id: 2,
                from_zone: 2,
                to_zone: None,
                kind: AirConnectionKindV1::Leak,
                conductance_ppm: 100_000,
                enabled: true,
            },
        ],
        input_hash: CanonicalHash::default(),
    }
    .seal();
    let result = equalize_gas_fixed(&job).expect("fixed gas job");
    let remaining = result.zones.iter().map(|zone| zone.mixture.total()).sum::<u64>();
    assert_eq!(remaining + result.leaked.total(), initial.total());
    assert!(!result.transfers.is_empty());
    assert_eq!(result, equalize_gas_fixed(&job).expect("repeat fixed gas job"));
}

#[test]
fn coarse_batches_sort_jobs_and_reject_duplicate_identity() {
    let fixture = blockwild_simulation::fixture::canonical_fixture();
    let mut later = fixture.physics.clone();
    later.identity.job_id = "later".into();
    later.identity.sequence = 20;
    later = later.seal();
    let mut earlier = fixture.physics;
    earlier.identity.job_id = "earlier".into();
    earlier.identity.sequence = 2;
    earlier = earlier.seal();
    let results = step_physics_batch(&[later.clone(), earlier.clone()]).expect("coarse physics batch");
    assert_eq!(results[0].identity.job_id, "earlier");
    assert_eq!(results[1].identity.job_id, "later");
    assert_eq!(
        step_physics_batch(&[earlier.clone(), earlier]),
        Err(ContractError::InvalidFlags)
    );

    let flight = CreativeFlightJobV1 {
        body_id: 9,
        velocity: Vec3::default(),
        control: CreativeFlightControlV1 {
            forward: 1.0,
            strafe: 0.0,
            yaw: 0.0,
            ascend: true,
            descend: false,
            sprinting: false,
            movement_multiplier: 1.0,
        },
        delta_seconds: 1.0 / 60.0,
    };
    let mut first_flight = flight;
    first_flight.body_id = 1;
    assert_eq!(
        step_creative_flight_batch(&[flight, first_flight])
            .expect("flight batch")
            .iter()
            .map(|result| result.body_id)
            .collect::<Vec<_>>(),
        vec![1, 9]
    );
}

#[test]
fn hostile_numeric_and_work_sizes_fail_before_unbounded_iteration() {
    let fixture = blockwild_simulation::fixture::canonical_fixture();
    let mut physics = fixture.physics.clone();
    physics.body.velocity.x = PHYSICS_MAX_ABS_VELOCITY_V1 + 1.0;
    physics = physics.seal();
    assert_eq!(step_physics(&physics), Err(ContractError::InvalidNumber));

    assert_eq!(
        sweep_projectile_contacts_batch(
            &fixture.physics.window,
            &[ProjectileSweepV1 {
                projectile_id: 1,
                origin: Vec3::default(),
                displacement: Vec3::new(4_096.0, 4_096.0, 4_096.0),
                radius: 0.2,
            }],
            &[],
        ),
        Err(ContractError::InvalidBudget)
    );
    let malformed_target = SweepTargetV1 {
        target_id: 2,
        bounds: AabbV1 {
            minimum: Vec3::new(2.0, 0.0, 0.0),
            maximum: Vec3::new(1.0, 1.0, 1.0),
        },
    };
    assert_eq!(
        sweep_projectile_contacts_batch(
            &fixture.physics.window,
            &[ProjectileSweepV1 {
                projectile_id: 1,
                origin: Vec3::default(),
                displacement: Vec3::new(1.0, 0.0, 0.0),
                radius: 0.2,
            }],
            &[malformed_target],
        ),
        Err(ContractError::InvalidFlags)
    );
    assert_eq!(
        raycast_voxels(
            &fixture.physics.window,
            VoxelRaycastQueryV1 {
                query_id: 1,
                origin: Vec3::new(PHYSICS_MAX_ABS_POSITION_V1 + 1.0, 0.0, 0.0),
                direction: Vec3::new(1.0, 0.0, 0.0),
                maximum_distance: 1.0,
                maximum_visited_cells: 1,
                hit_liquids: false,
            },
        ),
        Err(ContractError::InvalidNumber)
    );
    assert_eq!(
        run_broadphase_batch(
            1.0,
            &[],
            &[BroadphaseQueryV1 {
                query_id: 1,
                bounds: AabbV1::new(
                    Vec3::new(-1_000.0, -1_000.0, -1_000.0),
                    Vec3::new(1_000.0, 1_000.0, 1_000.0)
                ),
                layer_mask: 1,
                maximum_results: 1,
            }],
        ),
        Err(ContractError::InvalidBudget)
    );
}
