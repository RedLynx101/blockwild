use std::collections::BTreeMap;

use blockwild_types::{CanonicalHash, CanonicalHasher, EntityId};

use crate::{
    AdmissionDiagnostics, AnimationChannel, AnimationClip, AnimationKeyframe, AnimationProperty, AuthoredLodPolicy,
    ColorRgba8, EntityAuthority, EntityBroadphase, EntityBroadphaseEntry, EntityCompatibilityRecord, EntityResidency,
    EntityScheduler, JointSemantic, ModelGraph, ModelMaterial, ModelNode, ModelPrimitive, ModelRegistry, NaturalPool,
    PopulationSnapshot, PoseParameters, RenderAdmissionController, RenderCandidate, RenderEntityInput, RenderPressure,
    SimulationTier, SpawnCandidate, Transform, Vec3, admit_spawns, extract_render_frame, global_natural_cost_ceiling,
    natural_pool_budgets,
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EntityFixtureReport {
    pub entity_count: u32,
    pub hot_count: u32,
    pub cold_count: u32,
    pub broadphase_hits: u32,
    pub due_count: u32,
    pub spawn_admissions: u32,
    pub hero_count: u32,
    pub articulated_count: u32,
    pub silhouette_count: u32,
    pub hidden_count: u32,
    pub state_hash: CanonicalHash,
}

impl EntityFixtureReport {
    #[must_use]
    pub fn canonical_summary(&self) -> String {
        format!(
            "entities={} hot={} cold={} hits={} due={} admitted={} hero={} articulated={} silhouette={} hidden={} fixture_hash={}",
            self.entity_count,
            self.hot_count,
            self.cold_count,
            self.broadphase_hits,
            self.due_count,
            self.spawn_admissions,
            self.hero_count,
            self.articulated_count,
            self.silhouette_count,
            self.hidden_count,
            self.state_hash.to_hex(),
        )
    }
}

/// Canonical block-built creature graph used by native/Wasm fixture runners.
#[must_use]
pub fn fixture_model_graph() -> ModelGraph {
    let primary = ModelMaterial {
        key: "primary".to_owned(),
        base_color: ColorRgba8 {
            red: 70,
            green: 122,
            blue: 82,
            alpha: 255,
        },
        emissive_color: ColorRgba8 {
            red: 0,
            green: 0,
            blue: 0,
            alpha: 255,
        },
        emissive_strength_milli: 0,
        roughness: 210,
        metallic: 0,
        transparent: false,
        double_sided: false,
    };
    let accent = ModelMaterial {
        key: "accent".to_owned(),
        base_color: ColorRgba8 {
            red: 239,
            green: 211,
            blue: 112,
            alpha: 255,
        },
        emissive_color: ColorRgba8 {
            red: 255,
            green: 220,
            blue: 120,
            alpha: 255,
        },
        emissive_strength_milli: 240,
        roughness: 168,
        metallic: 18,
        transparent: false,
        double_sided: false,
    };
    let node =
        |id: &str, semantic: JointSemantic, parent: Option<u16>, translation: Vec3, size: Vec3, material: u16| {
            ModelNode {
                id: id.to_owned(),
                semantic,
                parent,
                transform: Transform {
                    translation,
                    ..Transform::IDENTITY
                },
                primitive: Some(ModelPrimitive::Cuboid { size }),
                material: Some(material),
                visible: true,
                cast_shadow: true,
                receive_shadow: true,
            }
        };
    ModelGraph {
        schema: 1,
        key: "fixture:block-creature".to_owned(),
        revision: 1,
        label: "Block Creature Fixture".to_owned(),
        front_negative_z: true,
        ground_y: 0.0,
        materials: vec![primary, accent],
        nodes: vec![
            node(
                "body",
                JointSemantic::Root,
                None,
                Vec3::new(0.0, 0.8, 0.0),
                Vec3::new(1.2, 0.8, 1.8),
                0,
            ),
            node(
                "head",
                JointSemantic::Head,
                Some(0),
                Vec3::new(0.0, 0.35, -1.05),
                Vec3::new(0.72, 0.68, 0.66),
                1,
            ),
            node(
                "left-leg",
                JointSemantic::Leg,
                Some(0),
                Vec3::new(-0.38, -0.57, -0.38),
                Vec3::new(0.28, 0.72, 0.32),
                0,
            ),
            node(
                "right-leg",
                JointSemantic::Leg,
                Some(0),
                Vec3::new(0.38, -0.57, -0.38),
                Vec3::new(0.28, 0.72, 0.32),
                0,
            ),
            node(
                "left-hind-leg",
                JointSemantic::Leg,
                Some(0),
                Vec3::new(-0.38, -0.57, 0.48),
                Vec3::new(0.28, 0.72, 0.32),
                0,
            ),
            node(
                "right-hind-leg",
                JointSemantic::Leg,
                Some(0),
                Vec3::new(0.38, -0.57, 0.48),
                Vec3::new(0.28, 0.72, 0.32),
                0,
            ),
        ],
        animations: vec![AnimationClip {
            key: "walk".to_owned(),
            duration_millis: 800,
            looping: true,
            channels: vec![AnimationChannel {
                node: 2,
                property: AnimationProperty::Rotation,
                keyframes: vec![
                    AnimationKeyframe {
                        time_millis: 0,
                        value: [0.34, 0.0, 0.0, 0.0],
                    },
                    AnimationKeyframe {
                        time_millis: 400,
                        value: [-0.34, 0.0, 0.0, 0.0],
                    },
                    AnimationKeyframe {
                        time_millis: 800,
                        value: [0.34, 0.0, 0.0, 0.0],
                    },
                ],
            }],
        }],
        lod: AuthoredLodPolicy {
            articulated_nodes: vec![0, 1, 2, 3, 4, 5],
            silhouette_size: Vec3::new(1.2, 1.55, 1.8),
            silhouette_center_y: 0.78,
            primary_material: 0,
            accent_material: Some(1),
        },
    }
}

/// Runs the same deterministic 100-creature-style corpus in native tools and Wasm.
pub fn run_entity_fixture(entity_count: u32) -> Result<EntityFixtureReport, String> {
    let mut authority = EntityAuthority::default();
    let mut broadphase = EntityBroadphase::new(8.0).map_err(|error| error.to_string())?;
    let mut scheduler = EntityScheduler::default();
    let mut render_candidates = Vec::with_capacity(entity_count as usize);
    let mut render_inputs = Vec::with_capacity(entity_count as usize);
    for index in 0..entity_count {
        let mut record = EntityCompatibilityRecord::new(
            format!("mob-{index}"),
            format!("specimen-{index}"),
            if index % 5 == 0 { "shoal-fish" } else { "fixture-grazer" },
        );
        record.position = Vec3::new(
            (index % 20) as f32 * 1.7,
            (index % 3) as f32 * 0.2,
            (index / 20) as f32 * 2.1,
        );
        record.velocity = Vec3::new((index % 7) as f32 * 0.01, 0.0, (index % 11) as f32 * -0.008);
        record.maximum_health = 10.0;
        record.health = 10.0;
        record.natural_spawned = true;
        if index % 17 == 0 {
            record.ever_led = true;
            record.owner_id = Some("fixture-keeper".to_owned());
            record.bond_points = 150;
            record.bond_tier = "trusted".to_owned();
            record.equipment.insert("saddle".to_owned(), "dragon-saddle".to_owned());
            record.research.insert("observations".to_owned(), 3);
        }
        let residency = if index % 9 == 0 {
            EntityResidency::Cold
        } else {
            EntityResidency::Hot
        };
        let id = authority
            .spawn(record.clone(), residency, 1_200)
            .map_err(|error| error.to_string())?;
        if residency == EntityResidency::Hot {
            broadphase
                .upsert(EntityBroadphaseEntry {
                    id,
                    center: record.position,
                    radius: 0.46,
                    half_height: 0.72,
                })
                .map_err(|error| error.to_string())?;
            let tier = if index < 12 {
                SimulationTier::Hero
            } else if index < 70 {
                SimulationTier::Nearby
            } else {
                SimulationTier::Coarse
            };
            scheduler.upsert(id, tier, 1_200);
        }
        let distance = record.position.x.hypot(record.position.z);
        render_candidates.push(RenderCandidate {
            id,
            distance,
            projected_size: (1.0 / (1.0 + distance * 0.05)).clamp(0.0, 1.0),
            in_frustum: index % 4 != 0,
            critical: index == 0,
            important: index % 17 == 0,
            engaged: index % 23 == 0,
        });
        render_inputs.push((id, record.kind_key, record.position));
    }
    let broadphase_hits = broadphase.query_xz_overlap(Vec3::new(12.0, 0.0, 5.0), 10.0).len() as u32;
    let due_count = scheduler.due(1_210, usize::MAX).len() as u32;

    let budgets = natural_pool_budgets(false, 1.0);
    let snapshot = PopulationSnapshot::default();
    let spawn_candidates: Vec<_> = (0..8)
        .map(|index| SpawnCandidate {
            candidate_id: index,
            kind_key: format!("candidate-{index}"),
            pool: if index % 2 == 0 {
                NaturalPool::SurfaceAnimal
            } else {
                NaturalPool::Ambient
            },
            center: Vec3::new(index as f32 * 2.0, 0.0, 0.0),
            creature_cost: if index % 2 == 0 { 1.0 } else { 0.5 },
            requested_count: 3,
            eligibility_roll: index as f32 / 16.0,
            spawn_probability: 0.75,
            priority: 8 - index as i16,
        })
        .collect();
    let spawn_admissions = admit_spawns(
        &spawn_candidates,
        &snapshot,
        &budgets,
        global_natural_cost_ceiling(false, 1.0, 1),
        8,
    )
    .len() as u32;

    let mut controller = RenderAdmissionController::default();
    let diagnostics: AdmissionDiagnostics = controller.evaluate(
        &render_candidates,
        RenderPressure {
            average_frame_milliseconds: 18.0,
            draw_calls: 280,
            low_resource_mode: false,
        },
        5_000,
    );
    let mut registry = ModelRegistry::default();
    registry
        .insert(fixture_model_graph())
        .map_err(|error| error.to_string())?;
    let extracted_inputs: Vec<_> = render_inputs
        .into_iter()
        .map(|(id, kind_key, position)| RenderEntityInput {
            id,
            kind_key,
            model_key: "fixture:block-creature".to_owned(),
            transform: Transform {
                translation: position,
                ..Transform::IDENTITY
            },
            tier: controller.tier_for(id),
            pose: PoseParameters {
                age_seconds: 12.0,
                gait_phase: id.0.index() as f32 * 0.17,
                ..PoseParameters::default()
            },
            primary_color: ColorRgba8 {
                red: 70,
                green: 122,
                blue: 82,
                alpha: 255,
            },
            accent_color: ColorRgba8 {
                red: 239,
                green: 211,
                blue: 112,
                alpha: 255,
            },
            visible: true,
        })
        .collect();
    let frame = extract_render_frame(5_000, &extracted_inputs, &registry).map_err(|error| error.to_string())?;

    let mut hasher = CanonicalHasher::new("blockwild.entity.fixture.v1");
    hasher.write_bytes(authority.canonical_hash().as_bytes());
    hasher.write_u32(broadphase_hits);
    hasher.write_u32(due_count);
    hasher.write_u32(spawn_admissions);
    for (tier, count) in diagnostics.tier_counts {
        hasher.write_u16(tier as u16);
        hasher.write_u32(count as u32);
    }
    let state_hash = hasher.finish();
    Ok(EntityFixtureReport {
        entity_count,
        hot_count: authority.hot().len() as u32,
        cold_count: authority.cold().len() as u32,
        broadphase_hits,
        due_count,
        spawn_admissions,
        hero_count: frame.heroes.len() as u32,
        articulated_count: frame.articulated.len() as u32,
        silhouette_count: frame.silhouettes.len() as u32,
        hidden_count: frame.hidden_count,
        state_hash,
    })
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct EntityWorkloadReport {
    pub entity_count: u32,
    pub iterations: u32,
    pub checksum: CanonicalHash,
}

/// Allocation-bounded workload hook. External benchmark runners own timing policy.
pub fn run_entity_workload(entity_count: u32, iterations: u32) -> Result<EntityWorkloadReport, String> {
    let mut hasher = CanonicalHasher::new("blockwild.entity.workload.v1");
    for iteration in 0..iterations {
        let report = run_entity_fixture(entity_count)?;
        hasher.write_u32(iteration);
        hasher.write_bytes(report.state_hash.as_bytes());
    }
    Ok(EntityWorkloadReport {
        entity_count,
        iterations,
        checksum: hasher.finish(),
    })
}

#[cfg(not(target_arch = "wasm32"))]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct NativeEntityBenchmark {
    pub workload: EntityWorkloadReport,
    pub elapsed_nanoseconds: u128,
}

#[cfg(not(target_arch = "wasm32"))]
pub fn benchmark_entity_workload(entity_count: u32, iterations: u32) -> Result<NativeEntityBenchmark, String> {
    let started = std::time::Instant::now();
    let workload = run_entity_workload(entity_count, iterations)?;
    Ok(NativeEntityBenchmark {
        workload,
        elapsed_nanoseconds: started.elapsed().as_nanos(),
    })
}

#[must_use]
pub fn fixture_compatibility_payload() -> BTreeMap<String, String> {
    BTreeMap::from([
        ("variant".to_owned(), "frost-bloom".to_owned()),
        ("bond".to_owned(), "trusted".to_owned()),
        ("equipment".to_owned(), "saddle".to_owned()),
        ("research".to_owned(), "ecology:3".to_owned()),
    ])
}

#[must_use]
pub fn fixture_entity_id(index: u32) -> EntityId {
    EntityId::new(index.max(1), 1)
}
