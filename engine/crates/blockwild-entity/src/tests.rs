use std::collections::{BTreeMap, BTreeSet};

use blockwild_types::{EntityId, LocationId};

use crate::*;

fn record(id: u32) -> EntityCompatibilityRecord {
    let mut record = EntityCompatibilityRecord::new(format!("entity-{id}"), format!("specimen-{id}"), "test-creature");
    record.location_id = LocationId::new(1, 1);
    record.position = Vec3::new(id as f32, 1.0, -(id as f32));
    record.maximum_health = 12.0;
    record.health = 9.0;
    record
}

fn assert_close(left: f32, right: f32) {
    assert!((left - right).abs() <= 1.0e-5, "{left} != {right}");
}

#[test]
fn compatibility_hash_is_map_order_independent_and_field_sensitive() {
    let mut first = record(1);
    first.equipment.insert("saddle".to_owned(), "reed-saddle".to_owned());
    first.equipment.insert("pack".to_owned(), "woven-pack".to_owned());
    first.research.insert("care".to_owned(), 2);
    let mut second = record(1);
    second.equipment.insert("pack".to_owned(), "woven-pack".to_owned());
    second.equipment.insert("saddle".to_owned(), "reed-saddle".to_owned());
    second.research.insert("care".to_owned(), 2);
    assert_eq!(first.canonical_hash(), second.canonical_hash());
    second.variant_key = Some("silver".to_owned());
    assert_ne!(first.canonical_hash(), second.canonical_hash());
}

#[test]
fn generation_reuse_invalidates_old_handles() {
    let mut authority = EntityAuthority::default();
    let old = authority.spawn(record(1), EntityResidency::Hot, 0).expect("spawn");
    authority.remove(old).expect("remove");
    let new = authority.spawn(record(2), EntityResidency::Hot, 1).expect("reuse");
    assert_eq!(old.0.index(), new.0.index());
    assert_ne!(old.0.generation(), new.0.generation());
    assert!(!authority.contains(old));
    assert!(authority.contains(new));
}

#[test]
fn allocator_survives_repeated_sparse_reuse() {
    let mut authority = EntityAuthority::default();
    for round in 0..20 {
        let ids: Vec<_> = (0..80)
            .map(|index| {
                authority
                    .spawn(record(round * 100 + index), EntityResidency::Hot, round as u64)
                    .expect("spawn")
            })
            .collect();
        for id in ids.into_iter().step_by(2) {
            authority.remove(id).expect("remove");
        }
    }
    let mut packed: Vec<_> = authority.hot().keys().map(|id| id.packed()).collect();
    packed.sort_unstable();
    packed.dedup();
    assert_eq!(packed.len(), authority.len());
}

#[test]
fn import_preserves_generational_identity_and_compatibility_fields() {
    let mut authority = EntityAuthority::default();
    let id = EntityId::new(42, 9);
    let mut imported = record(7);
    imported.variant_key = Some("prime".to_owned());
    imported.owner_id = Some("keeper".to_owned());
    imported.bond_points = 330;
    imported.bond_tier = "partnered".to_owned();
    imported
        .equipment
        .insert("saddle".to_owned(), "dragon-saddle".to_owned());
    imported.research.insert("ecology".to_owned(), 4);
    authority
        .insert_with_id(id, imported.clone(), EntityResidency::Cold, 800)
        .expect("import");
    assert_eq!(authority.cold()[&id].record, imported);
    assert_eq!(id.packed(), EntityId::new(42, 9).packed());
}

#[test]
fn revisioned_command_batch_is_atomic() {
    let mut authority = EntityAuthority::default();
    let missing = EntityId::new(88, 1);
    let bad = EntityCommandBatch {
        schema: ENTITY_COMMAND_SCHEMA,
        sequence: 1,
        expected_revision: 0,
        tick: 10,
        commands: vec![
            EntityCommand::Spawn {
                record: record(1),
                residency: EntityResidency::Hot,
            },
            EntityCommand::UpdateMotion {
                id: missing,
                position: Vec3::ZERO,
                yaw: 0.0,
                velocity: Vec3::ZERO,
            },
        ],
    };
    assert!(authority.apply_batch(&bad).is_err());
    assert!(authority.is_empty());
    assert_eq!(authority.revision(), 0);

    let good = EntityCommandBatch {
        commands: vec![EntityCommand::Spawn {
            record: record(1),
            residency: EntityResidency::Hot,
        }],
        ..bad
    };
    let events = authority.apply_batch(&good).expect("valid batch");
    assert_eq!(events.previous_revision, 0);
    assert_eq!(events.revision, 1);
    assert_eq!(events.events[0].command_index, 0);
    assert_eq!(authority.len(), 1);
}

#[test]
fn stale_revision_and_sequence_are_rejected() {
    let mut authority = EntityAuthority::default();
    let batch = EntityCommandBatch {
        schema: ENTITY_COMMAND_SCHEMA,
        sequence: 7,
        expected_revision: 0,
        tick: 0,
        commands: Vec::new(),
    };
    authority.apply_batch(&batch).expect("first batch");
    assert!(matches!(
        authority.apply_batch(&batch),
        Err(EntityError::StaleRevision { .. })
    ));
    let stale_sequence = EntityCommandBatch {
        expected_revision: 1,
        ..batch
    };
    assert!(matches!(
        authority.apply_batch(&stale_sequence),
        Err(EntityError::StaleSequence { .. })
    ));
}

#[test]
fn hibernate_and_wake_preserve_exact_record() {
    let mut authority = EntityAuthority::default();
    let mut source = record(1);
    source.custom.insert("dragon-stage".to_owned(), "3".to_owned());
    let id = authority
        .spawn(source.clone(), EntityResidency::Hot, 10)
        .expect("spawn");
    authority.hibernate(id, 20).expect("hibernate");
    assert_eq!(authority.cold()[&id].record, source);
    assert_eq!(authority.cold()[&id].summary.slept_at_tick, 20);
    authority.wake(id, SimulationTier::Hero, 30).expect("wake");
    assert_eq!(authority.hot()[&id].record, source);
    assert_eq!(authority.hot()[&id].tier, SimulationTier::Hero);
}

#[test]
fn broadphase_is_insertion_order_independent_at_cell_edges() {
    let entries = [
        EntityBroadphaseEntry {
            id: EntityId::new(7, 1),
            center: Vec3::new(7.9, 0.0, 0.0),
            radius: 0.4,
            half_height: 0.7,
        },
        EntityBroadphaseEntry {
            id: EntityId::new(2, 1),
            center: Vec3::new(8.3, 0.0, 0.0),
            radius: 0.4,
            half_height: 0.7,
        },
    ];
    let mut first = EntityBroadphase::new(8.0).expect("index");
    first.rebuild(entries).expect("rebuild");
    let mut second = EntityBroadphase::new(8.0).expect("index");
    second.rebuild(entries.into_iter().rev()).expect("rebuild");
    let expected = vec![EntityId::new(2, 1), EntityId::new(7, 1)];
    assert_eq!(first.query_xz_overlap(Vec3::new(8.1, 0.0, 0.0), 0.05), expected);
    assert_eq!(second.query_xz_overlap(Vec3::new(8.1, 0.0, 0.0), 0.05), expected);
}

#[test]
fn broadphase_3d_queries_respect_height() {
    let id = EntityId::new(1, 1);
    let mut index = EntityBroadphase::new(4.0).expect("index");
    index
        .upsert(EntityBroadphaseEntry {
            id,
            center: Vec3::new(0.0, 10.0, 0.0),
            radius: 0.5,
            half_height: 1.0,
        })
        .expect("entry");
    assert_eq!(index.query_xz_overlap(Vec3::ZERO, 0.1), vec![id]);
    assert!(index.query_sphere(Vec3::ZERO, 1.0).is_empty());
    assert_eq!(index.query_sphere(Vec3::new(0.0, 8.6, 0.0), 0.5), vec![id]);
}

#[test]
fn broadphase_matches_brute_force_for_deterministic_corpus() {
    let mut index = EntityBroadphase::new(5.0).expect("index");
    let entries: Vec<_> = (1..=200)
        .map(|raw| {
            let x = ((raw * 37) % 113) as f32 - 56.0;
            let z = ((raw * 71) % 127) as f32 - 63.0;
            EntityBroadphaseEntry {
                id: EntityId::new(raw, 1),
                center: Vec3::new(x, 0.0, z),
                radius: 0.2 + (raw % 5) as f32 * 0.13,
                half_height: 0.7,
            }
        })
        .collect();
    index.rebuild(entries.iter().copied()).expect("rebuild");
    for query in 0..40 {
        let center = Vec3::new(query as f32 * 2.3 - 40.0, 0.0, query as f32 * -1.7 + 32.0);
        let radius = 3.0 + (query % 7) as f32;
        let expected: Vec<_> = entries
            .iter()
            .filter(|entry| {
                let dx = entry.center.x - center.x;
                let dz = entry.center.z - center.z;
                dx.mul_add(dx, dz * dz) <= (radius + entry.radius).powi(2)
            })
            .map(|entry| entry.id)
            .collect();
        assert_eq!(index.query_xz_overlap(center, radius), expected);
    }
}

#[test]
fn scheduler_staggers_and_orders_due_work() {
    let mut scheduler = EntityScheduler::default();
    for raw in [9, 2, 7, 1] {
        scheduler.upsert(EntityId::new(raw, 1), SimulationTier::Nearby, 100);
    }
    scheduler.upsert(EntityId::new(3, 1), SimulationTier::Dormant, 100);
    let due = scheduler.due(101, 3);
    assert_eq!(due, vec![EntityId::new(2, 1), EntityId::new(1, 1), EntityId::new(7, 1)]);
    for id in due {
        assert!(scheduler.complete(id, 101));
        assert_eq!(scheduler.state(id).expect("state").next_due_tick, 103);
    }
}

#[test]
fn inverse_mass_separation_conserves_total_penetration() {
    let share = split_separation(1.5, 1.0, 3.0);
    assert_close(share.first, 1.125);
    assert_close(share.second, 0.375);
    assert_close(share.first + share.second, 1.5);
    assert!(
        creature_body_mass(BodyMassProfile {
            size: CreatureSizeClass::Large,
            radius: 0.9,
            height: 2.1,
        }) > creature_body_mass(BodyMassProfile {
            size: CreatureSizeClass::Small,
            radius: 0.2,
            height: 0.4,
        })
    );
}

#[test]
fn coincident_separation_is_stable_and_finite() {
    let body = CircleBody {
        x: 2.0,
        z: 2.0,
        radius: 0.5,
    };
    let first = separate_circles(body, body, 0.06, 17).expect("overlap");
    let second = separate_circles(body, body, 0.06, 17).expect("overlap");
    assert_eq!(first, second);
    assert!(first.dx.is_finite() && first.dz.is_finite());
    assert_close(first.dx.hypot(first.dz), first.overlap);
}

#[test]
fn separation_batch_is_pairwise_and_order_independent() {
    let first = EntityId::new(1, 1);
    let second = EntityId::new(2, 1);
    let third = EntityId::new(3, 1);
    let bodies = BTreeMap::from([
        (
            third,
            (
                CircleBody {
                    x: 0.7,
                    z: 0.0,
                    radius: 0.5,
                },
                2.0,
            ),
        ),
        (
            first,
            (
                CircleBody {
                    x: 0.0,
                    z: 0.0,
                    radius: 0.5,
                },
                1.0,
            ),
        ),
        (
            second,
            (
                CircleBody {
                    x: 0.35,
                    z: 0.0,
                    radius: 0.5,
                },
                1.0,
            ),
        ),
    ]);
    let corrections = resolve_separation_batch(&bodies, 0.0);
    assert_eq!(corrections.len(), 3);
    assert!(corrections.values().all(|value| value.is_finite()));
}

#[test]
fn social_motion_and_sensing_are_stably_ordered() {
    let members = [
        SocialMember {
            id: EntityId::new(9, 1),
            position: Vec3::new(2.0, 0.0, 0.0),
            velocity: Vec3::new(1.0, 0.0, 0.0),
        },
        SocialMember {
            id: EntityId::new(2, 1),
            position: Vec3::new(0.0, 0.0, 0.0),
            velocity: Vec3::new(0.0, 0.0, 1.0),
        },
        SocialMember {
            id: EntityId::new(5, 1),
            position: Vec3::new(1.0, 0.0, 1.0),
            velocity: Vec3::new(-1.0, 0.0, 0.0),
        },
    ];
    let first = plan_social_motion(&members, SocialMode::Herd);
    let second = plan_social_motion(&members.into_iter().rev().collect::<Vec<_>>(), SocialMode::Herd);
    assert_eq!(first, second);
    assert!(first.windows(2).all(|pair| pair[0].id < pair[1].id));

    let targets = [
        SenseTarget {
            id: EntityId::new(8, 1),
            position: Vec3::new(1.0, 0.0, 0.0),
            detectable: true,
            priority: 0,
        },
        SenseTarget {
            id: EntityId::new(3, 1),
            position: Vec3::new(2.0, 0.0, 0.0),
            detectable: true,
            priority: 4,
        },
        SenseTarget {
            id: EntityId::new(1, 1),
            position: Vec3::new(0.5, 0.0, 0.0),
            detectable: false,
            priority: 9,
        },
    ];
    let hits = sense_targets(Vec3::ZERO, 3.0, &targets, 2);
    assert_eq!(
        hits.iter().map(|hit| hit.id).collect::<Vec<_>>(),
        vec![EntityId::new(3, 1), EntityId::new(8, 1)]
    );
}

#[test]
fn follower_formation_does_not_depend_on_input_order() {
    let members = [
        FollowerMember {
            id: EntityId::new(8, 1),
            radius: 0.8,
        },
        FollowerMember {
            id: EntityId::new(1, 1),
            radius: 0.3,
        },
        FollowerMember {
            id: EntityId::new(4, 1),
            radius: 0.5,
        },
    ];
    let first = plan_follower_formation(Vec3::new(4.0, 0.0, -3.0), 0.7, &members);
    let second = plan_follower_formation(
        Vec3::new(4.0, 0.0, -3.0),
        0.7,
        &members.into_iter().rev().collect::<Vec<_>>(),
    );
    assert_eq!(first, second);
    assert!(first.iter().all(|target| target.arrival_radius >= 0.42));
}

#[test]
fn protection_lifecycle_matches_lead_fence_and_natural_rules() {
    let active = range_lifecycle(RangeLifecycleInput {
        protection: ProtectionState::default(),
        distance: 10.0,
        simulation_radius: 32.0,
        out_of_range_seconds: 20.0,
        elapsed_seconds: 1.0,
    });
    assert_eq!(active.action, RangeAction::Active);
    let natural = range_lifecycle(RangeLifecycleInput {
        distance: 80.0,
        simulation_radius: 32.0,
        out_of_range_seconds: 44.5,
        elapsed_seconds: 0.5,
        ..RangeLifecycleInput {
            protection: ProtectionState::default(),
            distance: 0.0,
            simulation_radius: 0.0,
            out_of_range_seconds: 0.0,
            elapsed_seconds: 0.0,
        }
    });
    assert_eq!(natural.action, RangeAction::Despawn);
    let protected = range_lifecycle(RangeLifecycleInput {
        protection: ProtectionState::from_bits(ProtectionState::EVER_LED),
        distance: 80.0,
        simulation_radius: 32.0,
        out_of_range_seconds: 100.0,
        elapsed_seconds: 10.0,
    });
    assert_eq!(protected.action, RangeAction::Sleep);
    assert_close(protected.out_of_range_seconds, 0.0);
}

#[test]
fn population_budgets_and_spawn_admission_honor_ceilings() {
    let budgets = natural_pool_budgets(false, 1.0);
    assert_close(budgets[&NaturalPool::SurfaceAnimal].target, 12.0);
    assert_close(global_natural_cost_ceiling(false, 1.0, 4), 184.0);
    let mut snapshot = PopulationSnapshot::default();
    snapshot.add(NaturalPool::SurfaceAnimal, 16.0, 16);
    let candidates = [SpawnCandidate {
        candidate_id: 1,
        kind_key: "woolhorn".to_owned(),
        pool: NaturalPool::SurfaceAnimal,
        center: Vec3::ZERO,
        creature_cost: 1.0,
        requested_count: 4,
        eligibility_roll: 0.1,
        spawn_probability: 1.0,
        priority: 1,
    }];
    assert!(admit_spawns(&candidates, &snapshot, &budgets, 92.0, 4).is_empty());

    let admissions = admit_spawns(&candidates, &PopulationSnapshot::default(), &budgets, 2.0, 4);
    assert_eq!(admissions[0].count, 2);
    assert_close(admissions[0].admitted_cost, 2.0);
}

#[test]
fn ecology_pressure_recovers_over_days() {
    let sector = EcologySector::default().record_kill("woolhorn", 2.0, 0);
    assert!(sector.species_spawn_multiplier("woolhorn", 0) < 1.0);
    let recovered = sector.species_spawn_multiplier("woolhorn", TICKS_PER_DAY * 3);
    assert_close(recovered, 1.0);
    assert_eq!(ecology_sector_key(-1, -65), [-1, -2]);
}

fn enclosure_ring() -> BTreeSet<EnclosureCell> {
    let mut barriers = BTreeSet::new();
    for coordinate in -2..=2 {
        barriers.insert(EnclosureCell { x: coordinate, z: -2 });
        barriers.insert(EnclosureCell { x: coordinate, z: 2 });
        barriers.insert(EnclosureCell { x: -2, z: coordinate });
        barriers.insert(EnclosureCell { x: 2, z: coordinate });
    }
    barriers
}

#[test]
fn crafted_enclosure_requires_a_closed_bounded_ring() {
    let barriers = enclosure_ring();
    let closed = scan_crafted_enclosure(EnclosureCell { x: 0, z: 0 }, &barriers, EnclosureOptions::default());
    assert!(closed.enclosed);
    assert_eq!(closed.interior.len(), 9);
    let mut open = barriers;
    open.remove(&EnclosureCell { x: 0, z: 2 });
    let open_scan = scan_crafted_enclosure(EnclosureCell { x: 0, z: 0 }, &open, EnclosureOptions::default());
    assert!(!open_scan.enclosed);
}

#[test]
fn breeding_pair_selection_is_stable_and_species_safe() {
    let candidates = [
        BreedingCandidate {
            id: EntityId::new(8, 1),
            kind_key: "woolhorn".to_owned(),
            sex: CreatureSex::Male,
            position: Vec3::new(1.0, 0.0, 0.0),
            adult: true,
            bonded: true,
            well_fed: true,
            cooldown_until_tick: 0,
        },
        BreedingCandidate {
            id: EntityId::new(2, 1),
            kind_key: "woolhorn".to_owned(),
            sex: CreatureSex::Female,
            position: Vec3::ZERO,
            adult: true,
            bonded: true,
            well_fed: true,
            cooldown_until_tick: 0,
        },
        BreedingCandidate {
            id: EntityId::new(3, 1),
            kind_key: "petalfox".to_owned(),
            sex: CreatureSex::Female,
            position: Vec3::ZERO,
            adult: true,
            bonded: true,
            well_fed: true,
            cooldown_until_tick: 0,
        },
    ];
    let first = plan_breeding_pairs(&candidates, 1_000, 4.0);
    let second = plan_breeding_pairs(&candidates.into_iter().rev().collect::<Vec<_>>(), 1_000, 4.0);
    assert_eq!(first, second);
    assert_eq!(first.len(), 1);
    assert_eq!(first[0].kind_key, "woolhorn");
}

#[test]
fn dormant_ecology_is_bounded_and_never_kills_protected_population() {
    let summary = DormantPopulationSummary {
        last_updated_tick: 0,
        population_by_kind: BTreeMap::from([("petalfox".to_owned(), 10)]),
        protected_by_kind: BTreeMap::from([("petalfox".to_owned(), 4)]),
        births: 0,
        deaths: 0,
    };
    let policy = DormantAdvancePolicy {
        carrying_capacity: 12,
        births_per_thousand_per_day: 200,
        deaths_per_thousand_per_day: 500,
        maximum_days_per_advance: 2,
    };
    let advanced = advance_dormant_population(&summary, TICKS_PER_DAY * 100, policy);
    assert_eq!(advanced.last_updated_tick, TICKS_PER_DAY * 2);
    assert!(advanced.population_by_kind["petalfox"] >= 4);
    assert!(advanced.population_by_kind["petalfox"] <= 12);
}

#[test]
fn model_graph_validates_connected_authored_parts_and_hashes_stably() {
    let graph = fixture_model_graph();
    graph.validate().expect("fixture graph");
    assert_eq!(graph.canonical_hash(), fixture_model_graph().canonical_hash());
    let mut broken = graph;
    broken.nodes[1].parent = Some(4);
    assert!(matches!(broken.validate(), Err(ModelError::InvalidParent(1))));
}

#[test]
fn model_registry_rejects_duplicates_and_bad_animation() {
    let mut registry = ModelRegistry::default();
    registry.insert(fixture_model_graph()).expect("first");
    assert!(matches!(
        registry.insert(fixture_model_graph()),
        Err(ModelError::DuplicateModel(_))
    ));
    let mut bad = fixture_model_graph();
    bad.key = "bad-animation".to_owned();
    bad.animations[0].channels[0].keyframes[1].time_millis = 0;
    assert_eq!(bad.validate(), Err(ModelError::InvalidAnimation));
}

#[test]
fn render_admission_is_bounded_stable_and_keeps_critical_heroes() {
    let candidates: Vec<_> = (1..=100)
        .map(|raw| RenderCandidate {
            id: EntityId::new(raw, 1),
            distance: raw as f32,
            projected_size: 1.0 / raw as f32,
            in_frustum: raw % 3 != 0,
            critical: raw == 100,
            important: raw % 17 == 0,
            engaged: raw % 23 == 0,
        })
        .collect();
    let mut controller = RenderAdmissionController::default();
    let diagnostics = controller.evaluate(
        &candidates,
        RenderPressure {
            average_frame_milliseconds: 42.0,
            draw_calls: 800,
            low_resource_mode: true,
        },
        2_000,
    );
    assert_eq!(diagnostics.hero_budget, 4);
    assert_eq!(controller.tier_for(EntityId::new(100, 1)), RenderTier::Hero);
    let heroes = candidates
        .iter()
        .filter(|candidate| controller.tier_for(candidate.id) == RenderTier::Hero)
        .count();
    assert!(heroes >= 1);
    assert!(
        heroes <= 6,
        "critical heroes may exceed the normal budget, but not this corpus"
    );
}

#[test]
fn render_extraction_preserves_tiers_models_and_stable_id_order() {
    let mut registry = ModelRegistry::default();
    registry.insert(fixture_model_graph()).expect("model");
    let input = |raw, tier| RenderEntityInput {
        id: EntityId::new(raw, 1),
        kind_key: "fixture".to_owned(),
        model_key: "fixture:block-creature".to_owned(),
        transform: Transform {
            translation: Vec3::new(raw as f32, 0.0, 0.0),
            ..Transform::IDENTITY
        },
        tier,
        pose: PoseParameters::default(),
        primary_color: ColorRgba8::WHITE,
        accent_color: ColorRgba8::WHITE,
        visible: true,
    };
    let frame = extract_render_frame(
        12,
        &[
            input(8, RenderTier::Silhouette),
            input(1, RenderTier::Hero),
            input(4, RenderTier::Articulated),
            input(2, RenderTier::Hidden),
        ],
        &registry,
    )
    .expect("extract");
    assert_eq!(frame.heroes[0].id, EntityId::new(1, 1));
    assert_eq!(frame.articulated[0].id, EntityId::new(4, 1));
    assert_eq!(frame.articulated[0].node_indices, vec![0, 1, 2, 3, 4, 5]);
    assert_eq!(frame.silhouettes[0].id, EntityId::new(8, 1));
    assert_eq!(frame.hidden_count, 1);
}

#[test]
fn canonical_entity_fixture_is_repeatable_at_one_hundred_creatures() {
    let first = run_entity_fixture(100).expect("fixture");
    let second = run_entity_fixture(100).expect("fixture");
    assert_eq!(first, second);
    assert_eq!(first.hot_count, 88);
    assert_eq!(first.cold_count, 12);
    assert_eq!(first.entity_count, 100);
    assert_eq!(
        first.hero_count + first.articulated_count + first.silhouette_count + first.hidden_count,
        100
    );
    assert_eq!(
        first.canonical_summary(),
        include_str!("../fixtures/entity-100-v1.txt").trim()
    );
}

#[test]
fn native_workload_hook_returns_a_stable_checksum() {
    let first = run_entity_workload(32, 3).expect("workload");
    let second = run_entity_workload(32, 3).expect("workload");
    assert_eq!(first, second);
    assert_ne!(first.checksum.to_hex(), "00000000000000000000000000000000");
}
