//! Dense, deterministic renderer acceptance scenes built from Blockwild's
//! compiled production model catalog. These are not gameplay authority: they
//! are immutable extraction fixtures used by native GPU tests, browser labs,
//! image diffs, and performance comparisons.

use crate::scene_renderer::unit_box_geometry_v2;
use crate::{
    CompiledModelCatalogV2, RENDER_ANIMATION_BOB_V2, RENDER_ANIMATION_FLAP_V2, RENDER_ANIMATION_PULSE_V2,
    RENDER_ANIMATION_SPIN_V2, RENDER_ANIMATION_SWAY_V2, RenderBlendModeV2, RenderCameraV2, RenderEnvironmentV2,
    RenderExtractionError, RenderFrameInputV2, RenderFrameV2, RenderInstanceDomainV2, RenderInstanceV2,
    RenderMaterialV2, RenderParticleV2, RenderResourceBatchV2, RenderResourceId, RenderResourceOperationV2,
    RenderShadingModelV2, RenderTransformV2, VisualDiffPolicy, instantiate_compiled_model_v2,
};

const FIXTURE_EPOCH: u64 = 11;
const FIXTURE_REVISION: u64 = 1;

#[derive(Clone, Debug, PartialEq)]
pub struct CanonicalVisualSceneV2 {
    pub name: String,
    pub purpose: String,
    pub resources: RenderResourceBatchV2,
    pub frame: RenderFrameV2,
    pub diff_policy: VisualDiffPolicy,
}

#[derive(Clone, Copy)]
struct Palette {
    grass: RenderResourceId,
    dirt: RenderResourceId,
    stone: RenderResourceId,
    wood: RenderResourceId,
    leaves: RenderResourceId,
    water: RenderResourceId,
    ice: RenderResourceId,
    glass: RenderResourceId,
    metal: RenderResourceId,
    glow: RenderResourceId,
    fire: RenderResourceId,
    dark: RenderResourceId,
    snow: RenderResourceId,
    sand: RenderResourceId,
    particle: RenderResourceId,
    sky: RenderResourceId,
}

struct SceneBuilder<'a> {
    catalog: &'a CompiledModelCatalogV2,
    operations: Vec<RenderResourceOperationV2>,
    instances: Vec<RenderInstanceV2>,
    particles: Vec<RenderParticleV2>,
    next_resource: u64,
    next_stable: u64,
    box_geometry: RenderResourceId,
    palette: Palette,
}

impl<'a> SceneBuilder<'a> {
    fn new(catalog: &'a CompiledModelCatalogV2) -> Result<Self, RenderExtractionError> {
        let box_geometry = RenderResourceId(1);
        let mut value = Self {
            catalog,
            operations: vec![RenderResourceOperationV2::UpsertGeometry(unit_box_geometry_v2(
                box_geometry,
                1,
            ))],
            instances: Vec::new(),
            particles: Vec::new(),
            next_resource: 100,
            next_stable: 1,
            box_geometry,
            palette: Palette {
                grass: RenderResourceId(0),
                dirt: RenderResourceId(0),
                stone: RenderResourceId(0),
                wood: RenderResourceId(0),
                leaves: RenderResourceId(0),
                water: RenderResourceId(0),
                ice: RenderResourceId(0),
                glass: RenderResourceId(0),
                metal: RenderResourceId(0),
                glow: RenderResourceId(0),
                fire: RenderResourceId(0),
                dark: RenderResourceId(0),
                snow: RenderResourceId(0),
                sand: RenderResourceId(0),
                particle: RenderResourceId(0),
                sky: RenderResourceId(0),
            },
        };
        value.palette = Palette {
            grass: value.material(
                [65, 119, 62, 255],
                [0; 3],
                0.0,
                RenderBlendModeV2::Opaque,
                RenderShadingModelV2::BlockLambert,
                Some(3),
            ),
            dirt: value.material(
                [108, 78, 52, 255],
                [0; 3],
                0.0,
                RenderBlendModeV2::Opaque,
                RenderShadingModelV2::BlockLambert,
                Some(7),
            ),
            stone: value.material(
                [91, 98, 91, 255],
                [0; 3],
                0.0,
                RenderBlendModeV2::Opaque,
                RenderShadingModelV2::Standard,
                Some(12),
            ),
            wood: value.material(
                [91, 57, 36, 255],
                [0; 3],
                0.0,
                RenderBlendModeV2::Opaque,
                RenderShadingModelV2::BlockLambert,
                Some(19),
            ),
            leaves: value.material(
                [31, 91, 58, 232],
                [0; 3],
                0.0,
                RenderBlendModeV2::AlphaClip,
                RenderShadingModelV2::BlockLambert,
                Some(23),
            ),
            water: value.material(
                [38, 118, 178, 154],
                [18, 54, 84],
                0.14,
                RenderBlendModeV2::Water,
                RenderShadingModelV2::Standard,
                Some(31),
            ),
            ice: value.material(
                [155, 222, 241, 184],
                [22, 68, 83],
                0.08,
                RenderBlendModeV2::AlphaBlend,
                RenderShadingModelV2::Standard,
                Some(37),
            ),
            glass: value.material(
                [149, 227, 216, 48],
                [22, 72, 65],
                0.05,
                RenderBlendModeV2::AlphaBlend,
                RenderShadingModelV2::Standard,
                Some(41),
            ),
            metal: value.material(
                [112, 123, 126, 255],
                [0; 3],
                0.0,
                RenderBlendModeV2::Opaque,
                RenderShadingModelV2::Standard,
                Some(47),
            ),
            glow: value.material(
                [105, 239, 196, 240],
                [91, 255, 207],
                1.35,
                RenderBlendModeV2::Additive,
                RenderShadingModelV2::Unlit,
                Some(53),
            ),
            fire: value.material(
                [248, 151, 43, 235],
                [255, 96, 20],
                1.65,
                RenderBlendModeV2::Additive,
                RenderShadingModelV2::Unlit,
                Some(59),
            ),
            dark: value.material(
                [35, 42, 42, 255],
                [0; 3],
                0.0,
                RenderBlendModeV2::Opaque,
                RenderShadingModelV2::Standard,
                Some(61),
            ),
            snow: value.material(
                [211, 229, 226, 255],
                [0; 3],
                0.0,
                RenderBlendModeV2::Opaque,
                RenderShadingModelV2::Standard,
                Some(67),
            ),
            sand: value.material(
                [188, 158, 103, 255],
                [0; 3],
                0.0,
                RenderBlendModeV2::Opaque,
                RenderShadingModelV2::BlockLambert,
                Some(71),
            ),
            particle: value.material(
                [221, 244, 245, 205],
                [88, 182, 186],
                0.32,
                RenderBlendModeV2::AlphaBlend,
                RenderShadingModelV2::Particle,
                None,
            ),
            sky: value.material(
                [40, 58, 89, 255],
                [34, 52, 91],
                0.12,
                RenderBlendModeV2::Opaque,
                RenderShadingModelV2::Sky,
                None,
            ),
        };
        Ok(value)
    }

    fn material(
        &mut self,
        color: [u8; 4],
        emissive: [u8; 3],
        emissive_strength: f32,
        blend: RenderBlendModeV2,
        shading: RenderShadingModelV2,
        atlas_tile: Option<u16>,
    ) -> RenderResourceId {
        let id = RenderResourceId(self.next_resource);
        self.next_resource += 1;
        self.operations
            .push(RenderResourceOperationV2::UpsertMaterial(RenderMaterialV2 {
                id,
                revision: 1,
                shading,
                blend,
                base_color_rgba8: color,
                emissive_rgb8: emissive,
                emissive_strength,
                roughness: if shading == RenderShadingModelV2::Standard {
                    0.56
                } else {
                    0.86
                },
                metalness: if shading == RenderShadingModelV2::Standard && color[0] < 140 {
                    0.28
                } else {
                    0.0
                },
                alpha_cutoff: if blend == RenderBlendModeV2::AlphaClip {
                    0.42
                } else {
                    0.0
                },
                atlas_tile,
                double_sided: !matches!(blend, RenderBlendModeV2::Opaque),
                depth_write: !matches!(
                    blend,
                    RenderBlendModeV2::AlphaBlend | RenderBlendModeV2::Additive | RenderBlendModeV2::Water
                ),
            }));
        id
    }

    fn cuboid(
        &mut self,
        domain: RenderInstanceDomainV2,
        material: RenderResourceId,
        translation: [f32; 3],
        scale: [f32; 3],
        sort_key: i32,
        animation_flags: u32,
    ) -> u64 {
        let stable_id = self.next_stable;
        self.next_stable += 1;
        self.instances.push(RenderInstanceV2 {
            stable_id,
            domain,
            geometry: self.box_geometry,
            material,
            parent: None,
            transform: RenderTransformV2 {
                translation,
                rotation: [0.0, 0.0, 0.0, 1.0],
                scale,
            },
            tint_rgba8: [255; 4],
            visibility_mask: u32::MAX,
            sort_key,
            animation_flags,
        });
        stable_id
    }

    fn model(
        &mut self,
        model_id: &str,
        position: [f32; 3],
        scale: f32,
        extra_animation: u32,
    ) -> Result<(), RenderExtractionError> {
        self.model_as(model_id, position, scale, extra_animation, None)
    }

    fn model_as(
        &mut self,
        model_id: &str,
        position: [f32; 3],
        scale: f32,
        extra_animation: u32,
        domain: Option<RenderInstanceDomainV2>,
    ) -> Result<(), RenderExtractionError> {
        let model = self
            .catalog
            .model(model_id)
            .ok_or(RenderExtractionError::MissingReference("canonical visual model"))?;
        let base_resource = self.next_resource;
        let base_stable = self.next_stable.saturating_add(10_000);
        let mut bundle =
            instantiate_compiled_model_v2(model, FIXTURE_EPOCH, FIXTURE_REVISION, base_resource, base_stable)?;
        for instance in &mut bundle.instances {
            if let Some(domain) = domain {
                instance.domain = domain;
            }
            if instance.parent.is_none() {
                for (axis, translation) in instance.transform.translation.iter_mut().enumerate() {
                    *translation = position[axis] + *translation * scale;
                    instance.transform.scale[axis] *= scale;
                }
                instance.animation_flags |= extra_animation;
            }
        }
        self.next_resource = bundle
            .resources
            .operations
            .iter()
            .map(operation_resource_id)
            .max()
            .unwrap_or(base_resource)
            .saturating_add(1);
        self.next_stable = bundle
            .instances
            .iter()
            .map(|instance| instance.stable_id)
            .max()
            .unwrap_or(base_stable)
            .saturating_add(10_000);
        self.operations.extend(bundle.resources.operations);
        self.instances.extend(bundle.instances);
        Ok(())
    }

    fn particle_cloud(&mut self, count: u32, origin: [f32; 3], spread: [f32; 3], color: [u8; 4], velocity: [f32; 3]) {
        for index in 0..count {
            let x = hash_unit(index.wrapping_mul(17).wrapping_add(3)) * 2.0 - 1.0;
            let y = hash_unit(index.wrapping_mul(29).wrapping_add(5)) * 2.0 - 1.0;
            let z = hash_unit(index.wrapping_mul(43).wrapping_add(7)) * 2.0 - 1.0;
            let stable_id = self.next_stable;
            self.next_stable += 1;
            self.particles.push(RenderParticleV2 {
                stable_id,
                material: self.palette.particle,
                position: [
                    origin[0] + x * spread[0],
                    origin[1] + y * spread[1],
                    origin[2] + z * spread[2],
                ],
                velocity,
                size: 0.025 + hash_unit(index.wrapping_mul(61)) * 0.055,
                rotation: hash_unit(index.wrapping_mul(73)) * std::f32::consts::TAU,
                color_rgba8: color,
                age_seconds: hash_unit(index.wrapping_mul(83)) * 1.8,
                lifetime_seconds: 2.4,
            });
        }
    }

    fn finish(
        self,
        name: &str,
        purpose: &str,
        camera: RenderCameraV2,
        environment: RenderEnvironmentV2,
        animation_time_micros: u64,
    ) -> Result<CanonicalVisualSceneV2, RenderExtractionError> {
        let resources = RenderResourceBatchV2::create(FIXTURE_EPOCH, FIXTURE_REVISION, self.operations)?;
        let frame = RenderFrameV2::create(RenderFrameInputV2 {
            epoch: FIXTURE_EPOCH,
            frame_sequence: 1,
            simulation_tick: 1,
            animation_time_micros,
            resource_revision: FIXTURE_REVISION,
            camera,
            environment,
            instances: self.instances,
            particles: self.particles,
        })?;
        Ok(CanonicalVisualSceneV2 {
            name: name.into(),
            purpose: purpose.into(),
            resources,
            frame,
            diff_policy: VisualDiffPolicy {
                per_channel_tolerance: 3,
                max_mismatched_pixels: camera.viewport[0]
                    .saturating_mul(camera.viewport[1])
                    .saturating_div(500),
                ignored_rects: Vec::new(),
            },
        })
    }
}

fn operation_resource_id(operation: &RenderResourceOperationV2) -> u64 {
    match operation {
        RenderResourceOperationV2::UpsertMaterial(value) => value.id.0,
        RenderResourceOperationV2::UpsertGeometry(value) => value.id.0,
        RenderResourceOperationV2::RemoveMaterial(value) | RenderResourceOperationV2::RemoveGeometry(value) => value.0,
    }
}

fn hash_unit(value: u32) -> f32 {
    let mixed = value.wrapping_mul(747_796_405).wrapping_add(2_891_336_453);
    let mixed = ((mixed >> ((mixed >> 28) + 4)) ^ mixed).wrapping_mul(277_803_737);
    f32::from(((mixed >> 22) ^ mixed) as u16) / f32::from(u16::MAX)
}

fn camera(viewport: [u32; 2], position: [f32; 3], pitch: f32) -> RenderCameraV2 {
    let half = pitch * 0.5;
    RenderCameraV2 {
        position,
        orientation: [half.sin(), 0.0, 0.0, half.cos()],
        vertical_fov_radians: 0.83,
        near: 0.05,
        far: 180.0,
        viewport,
    }
}

fn day_environment() -> RenderEnvironmentV2 {
    RenderEnvironmentV2 {
        clear_rgba8: [87, 142, 181, 255],
        ambient_rgb8: [174, 194, 188],
        ambient_intensity: 0.68,
        sun_direction: [-0.35, -0.82, -0.25],
        sun_rgb8: [255, 238, 192],
        sun_intensity: 0.92,
        fog_rgb8: [112, 157, 174],
        fog_near: 24.0,
        fog_far: 90.0,
        underwater: 0.0,
        cave_occlusion: 0.0,
    }
}

fn add_overworld_terrain(builder: &mut SceneBuilder<'_>, snow: bool) {
    for x in -9_i32..=9 {
        for z in -12_i32..=3 {
            let river = x.abs() <= 2 && z < 1;
            let ridge = ((x * 13 + z * 7).unsigned_abs() % 5) as f32 * 0.07;
            let top = if river { -1.25 } else { -0.58 + ridge };
            let ground = if snow {
                builder.palette.snow
            } else if river {
                builder.palette.sand
            } else {
                builder.palette.grass
            };
            builder.cuboid(
                RenderInstanceDomainV2::Terrain,
                builder.palette.dirt,
                [x as f32, top - 0.55, z as f32],
                [0.99, 1.1, 0.99],
                -20,
                0,
            );
            builder.cuboid(
                RenderInstanceDomainV2::Terrain,
                ground,
                [x as f32, top, z as f32],
                [0.99, 0.18, 0.99],
                -19,
                0,
            );
            if river {
                builder.cuboid(
                    RenderInstanceDomainV2::Terrain,
                    builder.palette.water,
                    [x as f32, -0.88, z as f32],
                    [1.0, 0.12, 1.0],
                    80,
                    0,
                );
            }
        }
    }
    for (x, z, height) in [(-7.0, -7.0, 3.2), (6.0, -8.0, 3.8), (-6.0, -1.0, 2.9), (7.0, -2.0, 3.4)] {
        builder.cuboid(
            RenderInstanceDomainV2::Prop,
            builder.palette.wood,
            [x, height * 0.42 - 0.45, z],
            [0.55, height, 0.55],
            2,
            0,
        );
        for (dx, dy, dz) in [(0.0, 0.0, 0.0), (-0.85, -0.2, 0.1), (0.8, -0.1, -0.1), (0.0, 0.55, 0.0)] {
            builder.cuboid(
                RenderInstanceDomainV2::Prop,
                builder.palette.leaves,
                [x + dx, height + dy - 0.45, z + dz],
                [1.75, 1.15, 1.55],
                3,
                RENDER_ANIMATION_SWAY_V2,
            );
        }
    }
}

fn add_crystal_cluster(builder: &mut SceneBuilder<'_>, center: [f32; 3], material: RenderResourceId) {
    for (index, offset) in [
        (-0.52, 0.0, 0.18),
        (0.0, 0.0, 0.0),
        (0.48, 0.0, -0.22),
        (0.18, 0.0, 0.45),
    ]
    .into_iter()
    .enumerate()
    {
        let height = 0.75 + index as f32 * 0.22;
        builder.cuboid(
            RenderInstanceDomainV2::Prop,
            material,
            [center[0] + offset.0, center[1] + height * 0.5, center[2] + offset.2],
            [0.18, height, 0.18],
            25,
            RENDER_ANIMATION_PULSE_V2,
        );
    }
}

fn overworld_scene(
    catalog: &CompiledModelCatalogV2,
    viewport: [u32; 2],
) -> Result<CanonicalVisualSceneV2, RenderExtractionError> {
    let mut builder = SceneBuilder::new(catalog)?;
    add_overworld_terrain(&mut builder, false);
    // A frozen upstream shelf shares the river grid exactly, exercising the
    // same water/ice seam that is visually sensitive in the live world.
    for z in -11_i32..=-8 {
        for x in -2_i32..=2 {
            builder.cuboid(
                RenderInstanceDomainV2::Terrain,
                builder.palette.ice,
                [x as f32, -0.79, z as f32],
                [1.0, 0.16, 1.0],
                82,
                0,
            );
        }
    }
    for (x, z) in [(-3.2, -1.2), (3.2, -2.0), (-3.2, -4.6), (3.2, -5.4), (-3.2, -7.4)] {
        for segment in 0..3 {
            builder.cuboid(
                RenderInstanceDomainV2::Prop,
                builder.palette.leaves,
                [x, -0.22 + segment as f32 * 0.38, z],
                [0.12, 0.52, 0.12],
                3,
                RENDER_ANIMATION_SWAY_V2,
            );
        }
    }
    builder.model("player-running", [-0.8, -0.38, 0.2], 0.72, RENDER_ANIMATION_BOB_V2)?;
    builder.model("asterjaw", [3.7, -0.42, -2.0], 1.05, RENDER_ANIMATION_BOB_V2)?;
    builder.model("hearthback-badger", [-4.4, -0.48, -3.4], 1.15, RENDER_ANIMATION_BOB_V2)?;
    builder.model(
        "canopy-lark",
        [0.7, 3.7, -4.2],
        1.05,
        RENDER_ANIMATION_BOB_V2 | RENDER_ANIMATION_FLAP_V2,
    )?;
    builder.model(
        "butterfly-azure-skippers",
        [-2.3, 1.2, -0.4],
        1.4,
        RENDER_ANIMATION_BOB_V2 | RENDER_ANIMATION_FLAP_V2,
    )?;
    let glow = builder.palette.glow;
    add_crystal_cluster(&mut builder, [5.5, -0.5, 0.5], glow);
    builder.particle_cloud(
        72,
        [0.0, 2.4, -3.0],
        [8.5, 2.6, 6.0],
        [201, 242, 238, 178],
        [0.0, -0.22, 0.0],
    );
    builder.finish(
        "overworld-day",
        "Dense streamed terrain, flora, river transparency, current creatures, player rig, weather particles, and emission.",
        camera(viewport, [0.0, 4.2, 12.6], -0.25),
        day_environment(),
        850_000,
    )
}

fn night_scene(
    catalog: &CompiledModelCatalogV2,
    viewport: [u32; 2],
) -> Result<CanonicalVisualSceneV2, RenderExtractionError> {
    let mut builder = SceneBuilder::new(catalog)?;
    add_overworld_terrain(&mut builder, false);
    builder.cuboid(
        RenderInstanceDomainV2::Effect,
        builder.palette.sky,
        [-7.2, 6.8, -18.0],
        [2.8, 2.8, 0.25],
        -100,
        RENDER_ANIMATION_SPIN_V2,
    );
    builder.cuboid(
        RenderInstanceDomainV2::Effect,
        builder.palette.glow,
        [-7.2, 6.8, -17.6],
        [1.35, 1.35, 0.28],
        -99,
        RENDER_ANIMATION_PULSE_V2,
    );
    builder.model(
        "fire-dragon",
        [3.1, 2.0, -4.4],
        0.66,
        RENDER_ANIMATION_BOB_V2 | RENDER_ANIMATION_FLAP_V2,
    )?;
    builder.model(
        "lightning-bug",
        [-2.7, 1.05, -0.7],
        1.35,
        RENDER_ANIMATION_BOB_V2 | RENDER_ANIMATION_FLAP_V2 | RENDER_ANIMATION_PULSE_V2,
    )?;
    builder.model("emberbrush-fox", [-4.5, -0.42, -3.0], 1.1, RENDER_ANIMATION_BOB_V2)?;
    for x in -2_i32..=2 {
        builder.cuboid(
            RenderInstanceDomainV2::Effect,
            builder.palette.fire,
            [x as f32 * 0.16, -0.12 + x.unsigned_abs() as f32 * 0.04, 0.8],
            [0.12, 0.65, 0.12],
            100,
            RENDER_ANIMATION_SWAY_V2 | RENDER_ANIMATION_PULSE_V2,
        );
    }
    builder.particle_cloud(
        150,
        [0.0, 2.8, -2.5],
        [9.0, 4.5, 7.5],
        [164, 194, 231, 165],
        [0.14, -1.4, 0.0],
    );
    let mut environment = day_environment();
    environment.clear_rgba8 = [10, 19, 34, 255];
    environment.ambient_rgb8 = [77, 91, 119];
    environment.ambient_intensity = 0.31;
    environment.sun_rgb8 = [130, 156, 210];
    environment.sun_intensity = 0.26;
    environment.fog_rgb8 = [24, 38, 55];
    environment.fog_near = 16.0;
    environment.fog_far = 54.0;
    builder.finish(
        "night-weather",
        "Night sky, celestial body, fire, emissive fauna, flying dragon, rain, and transparent ordering.",
        camera(viewport, [0.0, 4.4, 12.8], -0.24),
        environment,
        1_350_000,
    )
}

fn cave_scene(
    catalog: &CompiledModelCatalogV2,
    viewport: [u32; 2],
) -> Result<CanonicalVisualSceneV2, RenderExtractionError> {
    let mut builder = SceneBuilder::new(catalog)?;
    for x in -9_i32..=9 {
        for z in -12_i32..=3 {
            let floor = -0.72 + ((x * 5 + z * 11).unsigned_abs() % 3) as f32 * 0.08;
            builder.cuboid(
                RenderInstanceDomainV2::Terrain,
                builder.palette.stone,
                [x as f32, floor, z as f32],
                [0.98, 0.44, 0.98],
                -20,
                0,
            );
            if x.abs() >= 7 || z <= -10 {
                builder.cuboid(
                    RenderInstanceDomainV2::Terrain,
                    builder.palette.dark,
                    [x as f32, 2.0, z as f32],
                    [0.98, 5.3, 0.98],
                    -18,
                    0,
                );
            }
            if (x + z).rem_euclid(4) == 0 {
                builder.cuboid(
                    RenderInstanceDomainV2::Terrain,
                    builder.palette.dark,
                    [x as f32, 5.7, z as f32],
                    [0.98, 0.45, 0.98],
                    -17,
                    0,
                );
            }
        }
    }
    let glow = builder.palette.glow;
    let fire = builder.palette.fire;
    add_crystal_cluster(&mut builder, [-5.8, -0.45, -2.2], glow);
    add_crystal_cluster(&mut builder, [5.3, -0.45, -5.2], fire);
    for x in -3_i32..=3 {
        for z in -9_i32..=-7 {
            builder.cuboid(
                RenderInstanceDomainV2::Terrain,
                builder.palette.water,
                [x as f32, -0.38, z as f32],
                [1.0, 0.15, 1.0],
                75,
                0,
            );
        }
    }
    builder.model("cragglass-basilisk", [3.7, -0.38, -2.0], 0.94, RENDER_ANIMATION_BOB_V2)?;
    builder.model(
        "deepgear-courser-golem",
        [-3.5, -0.32, -1.2],
        0.82,
        RENDER_ANIMATION_BOB_V2,
    )?;
    builder.model("copper-mole", [0.0, -0.42, -4.0], 1.1, RENDER_ANIMATION_BOB_V2)?;
    builder.model(
        "boglantern-mossling",
        [-5.0, -0.36, -6.1],
        1.25,
        RENDER_ANIMATION_BOB_V2 | RENDER_ANIMATION_PULSE_V2,
    )?;
    builder.model(
        "lanternshell",
        [3.2, -0.36, -6.8],
        1.45,
        RENDER_ANIMATION_BOB_V2 | RENDER_ANIMATION_PULSE_V2,
    )?;
    builder.model(
        "embercarapace-beetle",
        [5.2, -0.35, -6.2],
        0.8,
        RENDER_ANIMATION_BOB_V2 | RENDER_ANIMATION_FLAP_V2,
    )?;
    builder.model_as(
        "creature-healing-station",
        [-1.8, -0.42, 1.1],
        0.7,
        RENDER_ANIMATION_PULSE_V2,
        Some(RenderInstanceDomainV2::Machine),
    )?;
    builder.model_as(
        "capture-orb-rack",
        [1.7, -0.42, 1.0],
        0.72,
        0,
        Some(RenderInstanceDomainV2::Machine),
    )?;
    builder.particle_cloud(
        90,
        [0.0, 1.8, -3.0],
        [7.0, 2.6, 6.0],
        [95, 237, 197, 190],
        [0.0, 0.05, 0.0],
    );
    let environment = RenderEnvironmentV2 {
        clear_rgba8: [6, 13, 16, 255],
        ambient_rgb8: [83, 118, 108],
        ambient_intensity: 0.46,
        sun_direction: [-0.4, -0.8, -0.3],
        sun_rgb8: [146, 204, 181],
        sun_intensity: 0.30,
        fog_rgb8: [18, 38, 39],
        fog_near: 11.0,
        fog_far: 44.0,
        underwater: 0.0,
        cave_occlusion: 0.52,
    };
    builder.finish(
        "living-cave",
        "Cave topology, darkness contrast, bioluminescent ecology, machinery, golem and hostile creature silhouettes.",
        camera(viewport, [0.0, 3.2, 11.8], -0.18),
        environment,
        1_020_000,
    )
}

fn underwater_scene(
    catalog: &CompiledModelCatalogV2,
    viewport: [u32; 2],
) -> Result<CanonicalVisualSceneV2, RenderExtractionError> {
    let mut builder = SceneBuilder::new(catalog)?;
    for x in -9_i32..=9 {
        for z in -12_i32..=3 {
            let material = if z < -7 {
                builder.palette.stone
            } else {
                builder.palette.sand
            };
            builder.cuboid(
                RenderInstanceDomainV2::Terrain,
                material,
                [x as f32, -1.1, z as f32],
                [0.98, 0.48, 0.98],
                -20,
                0,
            );
            if z <= -8 && (x + z).rem_euclid(3) == 0 {
                builder.cuboid(
                    RenderInstanceDomainV2::Terrain,
                    builder.palette.ice,
                    [x as f32, 2.9, z as f32],
                    [0.98, 0.32, 0.98],
                    70,
                    0,
                );
            }
        }
    }
    for x in -9..=9 {
        builder.cuboid(
            RenderInstanceDomainV2::Terrain,
            builder.palette.water,
            [x as f32, 3.65, -4.8],
            [1.0, 0.08, 15.0],
            90,
            0,
        );
    }
    for x in [-6.0, -3.8, 4.2, 6.3] {
        for segment in 0..4 {
            builder.cuboid(
                RenderInstanceDomainV2::Prop,
                builder.palette.leaves,
                [x, -0.45 + segment as f32 * 0.65, -2.5 - x.abs() * 0.35],
                [0.28, 0.82, 0.22],
                3,
                RENDER_ANIMATION_SWAY_V2,
            );
        }
    }
    // A readable near-field boundary: continuous ice meets the same water
    // plane with no overlap gap, while descending blue-ice columns show depth.
    for x in -8_i32..=-4 {
        for z in -1_i32..=2 {
            let depth = 0.85 + (x + 8) as f32 * 0.22;
            builder.cuboid(
                RenderInstanceDomainV2::Terrain,
                builder.palette.ice,
                [x as f32, 2.95 - depth * 0.5, z as f32],
                [0.99, depth, 0.99],
                72,
                0,
            );
        }
    }
    builder.model(
        "sea-dragon",
        [2.8, 0.8, -4.1],
        0.58,
        RENDER_ANIMATION_BOB_V2 | RENDER_ANIMATION_FLAP_V2,
    )?;
    builder.model(
        "wreckwhistle-porpoise",
        [-3.4, 0.7, -2.0],
        0.94,
        RENDER_ANIMATION_BOB_V2,
    )?;
    builder.model("blue-mackerel", [0.2, 1.9, -1.7], 1.15, RENDER_ANIMATION_BOB_V2)?;
    builder.model("reefglide-terrapin", [4.7, -0.25, 0.0], 1.05, RENDER_ANIMATION_BOB_V2)?;
    builder.model(
        "lanternray",
        [-5.2, 1.45, -4.8],
        1.1,
        RENDER_ANIMATION_BOB_V2 | RENDER_ANIMATION_FLAP_V2 | RENDER_ANIMATION_PULSE_V2,
    )?;
    builder.model(
        "kelpwarden-sea-slug",
        [-1.7, -0.55, -3.8],
        1.35,
        RENDER_ANIMATION_SWAY_V2 | RENDER_ANIMATION_PULSE_V2,
    )?;
    let glow = builder.palette.glow;
    add_crystal_cluster(&mut builder, [-5.2, -0.75, -5.5], glow);
    builder.particle_cloud(
        140,
        [0.0, 1.4, -2.5],
        [8.5, 3.0, 7.0],
        [184, 240, 246, 130],
        [0.0, 0.22, 0.0],
    );
    let environment = RenderEnvironmentV2 {
        clear_rgba8: [8, 42, 64, 255],
        ambient_rgb8: [93, 154, 168],
        ambient_intensity: 0.64,
        sun_direction: [-0.28, -0.93, -0.2],
        sun_rgb8: [174, 227, 226],
        sun_intensity: 0.66,
        fog_rgb8: [18, 68, 83],
        fog_near: 5.5,
        fog_far: 32.0,
        underwater: 0.76,
        cave_occlusion: 0.05,
    };
    builder.finish("underwater-ice", "Underwater fog, ice-water adjacency, kelp continuity, bubbles, aquatic creatures, caustic and glass-like materials.", camera(viewport, [0.0, 2.9, 11.2], -0.11), environment, 1_750_000)
}

fn settlement_scene(
    catalog: &CompiledModelCatalogV2,
    viewport: [u32; 2],
) -> Result<CanonicalVisualSceneV2, RenderExtractionError> {
    let mut builder = SceneBuilder::new(catalog)?;
    for x in -10_i32..=10 {
        for z in -11_i32..=3 {
            let road = x.abs() <= 2;
            builder.cuboid(
                RenderInstanceDomainV2::Terrain,
                if road {
                    builder.palette.stone
                } else {
                    builder.palette.grass
                },
                [x as f32, -0.62, z as f32],
                [0.98, 0.25, 0.98],
                -20,
                0,
            );
        }
    }
    for x in [-7.0, 6.5] {
        builder.cuboid(
            RenderInstanceDomainV2::Prop,
            builder.palette.wood,
            [x, 1.1, -4.0],
            [4.0, 3.4, 3.3],
            0,
            0,
        );
        builder.cuboid(
            RenderInstanceDomainV2::Prop,
            builder.palette.dark,
            [x, 3.05, -4.0],
            [4.6, 0.65, 3.8],
            1,
            0,
        );
        builder.cuboid(
            RenderInstanceDomainV2::Prop,
            builder.palette.glass,
            [x, 1.4, -2.3],
            [1.0, 0.9, 0.12],
            70,
            0,
        );
        builder.cuboid(
            RenderInstanceDomainV2::Prop,
            builder.palette.dark,
            [x, 0.55, -2.28],
            [1.1, 2.2, 0.18],
            2,
            0,
        );
    }
    for (x, z) in [(-5.2, 1.8), (-3.8, 1.8), (3.8, 1.8), (5.2, 1.8)] {
        builder.cuboid(
            RenderInstanceDomainV2::Prop,
            builder.palette.wood,
            [x, 0.15, z],
            [1.25, 0.7, 0.8],
            3,
            0,
        );
        builder.cuboid(
            RenderInstanceDomainV2::Prop,
            if x < 0.0 {
                builder.palette.fire
            } else {
                builder.palette.leaves
            },
            [x, 1.25, z],
            [1.55, 0.16, 1.05],
            4,
            RENDER_ANIMATION_SWAY_V2,
        );
        for dx in [-0.52, 0.52] {
            builder.cuboid(
                RenderInstanceDomainV2::Prop,
                builder.palette.wood,
                [x + dx, 0.72, z],
                [0.12, 1.45, 0.12],
                3,
                0,
            );
        }
    }
    for x in [-9.0, -5.0, 5.0, 9.0] {
        builder.cuboid(
            RenderInstanceDomainV2::Prop,
            builder.palette.wood,
            [x, 0.05, -0.4],
            [0.16, 1.4, 0.16],
            2,
            0,
        );
        builder.cuboid(
            RenderInstanceDomainV2::Effect,
            builder.palette.glow,
            [x, 0.95, -0.4],
            [0.34, 0.42, 0.34],
            60,
            RENDER_ANIMATION_PULSE_V2,
        );
    }
    builder.model("player-mining", [-0.8, -0.45, 0.4], 0.9, RENDER_ANIMATION_SWAY_V2)?;
    builder.model("dwarf-gearwright", [2.6, -0.45, -0.2], 1.0, RENDER_ANIMATION_BOB_V2)?;
    builder.model("dwarf-gatewarden", [-5.0, -0.45, -1.0], 0.9, RENDER_ANIMATION_BOB_V2)?;
    builder.model("hobbit-merchant", [4.7, -0.45, 1.2], 0.92, RENDER_ANIMATION_BOB_V2)?;
    builder.model("wood-elf-potioner", [-4.6, -0.45, 1.25], 0.92, RENDER_ANIMATION_BOB_V2)?;
    builder.model("wildwood-chest", [-4.2, -0.42, -0.2], 1.0, 0)?;
    builder.model("wildwood-chest", [5.3, -0.42, 0.0], 0.8, 0)?;
    builder.model("wildwood-apiary", [4.5, -0.42, 0.5], 0.98, RENDER_ANIMATION_PULSE_V2)?;
    builder.model_as(
        "creature-healing-station",
        [-3.2, -0.42, -3.0],
        0.9,
        RENDER_ANIMATION_PULSE_V2,
        Some(RenderInstanceDomainV2::Machine),
    )?;
    builder.model_as(
        "capture-orb-rack",
        [3.3, -0.42, -3.0],
        0.9,
        0,
        Some(RenderInstanceDomainV2::Machine),
    )?;
    builder.model("held-pickaxe", [0.9, 0.35, 0.0], 0.75, RENDER_ANIMATION_SWAY_V2)?;
    // Native damage feedback: a stable overlay page sits just above the
    // affected face, while debris is a separate bounded particle stream.
    builder.cuboid(
        RenderInstanceDomainV2::Terrain,
        builder.palette.stone,
        [-2.0, -0.08, 1.55],
        [1.0, 1.0, 1.0],
        2,
        0,
    );
    for (translation, scale) in [
        ([-2.0, 0.14, 2.056], [0.08, 0.56, 0.018]),
        ([-2.18, 0.25, 2.057], [0.34, 0.07, 0.018]),
        ([-1.82, -0.03, 2.058], [0.33, 0.07, 0.018]),
        ([-2.27, -0.12, 2.059], [0.07, 0.34, 0.018]),
        ([-1.73, 0.07, 2.060], [0.07, 0.30, 0.018]),
    ] {
        builder.cuboid(
            RenderInstanceDomainV2::Effect,
            builder.palette.dark,
            translation,
            scale,
            90,
            0,
        );
    }
    builder.particle_cloud(
        36,
        [-2.0, 0.15, 2.18],
        [0.52, 0.48, 0.24],
        [104, 112, 103, 210],
        [0.0, -0.06, 0.04],
    );
    builder.particle_cloud(
        48,
        [4.5, 1.2, 0.5],
        [1.6, 1.1, 1.6],
        [242, 204, 82, 180],
        [0.0, 0.04, 0.0],
    );
    builder.finish("settlement-machinery", "Settlement density, architecture, glass, current player and NPC rigs, held tools, storage, block-damage overlays and powered utility models.", camera(viewport, [0.0, 4.0, 12.5], -0.23), day_environment(), 1_180_000)
}

fn specimen_scene(
    catalog: &CompiledModelCatalogV2,
    viewport: [u32; 2],
) -> Result<CanonicalVisualSceneV2, RenderExtractionError> {
    let mut builder = SceneBuilder::new(catalog)?;
    builder.cuboid(
        RenderInstanceDomainV2::Terrain,
        builder.palette.dark,
        [0.0, -0.95, -2.0],
        [18.0, 0.5, 12.0],
        -20,
        0,
    );
    for (index, x) in [-5.4_f32, -1.8, 1.8, 5.4].into_iter().enumerate() {
        builder.cuboid(
            RenderInstanceDomainV2::Prop,
            builder.palette.metal,
            [x, -0.45, -2.0],
            [2.8, 0.55, 2.8],
            -5,
            0,
        );
        builder.cuboid(
            RenderInstanceDomainV2::Prop,
            if index % 2 == 0 {
                builder.palette.glow
            } else {
                builder.palette.fire
            },
            [x, -0.1, -2.0],
            [2.45, 0.07, 2.45],
            60,
            RENDER_ANIMATION_PULSE_V2,
        );
    }
    builder.model("hearthback-badger", [-5.4, -0.05, -2.0], 1.0, RENDER_ANIMATION_BOB_V2)?;
    builder.model(
        "wreckwhistle-porpoise",
        [-1.8, 0.3, -2.0],
        0.95,
        RENDER_ANIMATION_BOB_V2,
    )?;
    builder.model("asterjaw", [1.8, 0.0, -2.0], 0.9, RENDER_ANIMATION_BOB_V2)?;
    builder.model(
        "sugarwake-sovereign",
        [5.4, -0.05, -2.0],
        0.88,
        RENDER_ANIMATION_BOB_V2 | RENDER_ANIMATION_PULSE_V2,
    )?;
    for x in [-5.4_f32, -1.8, 1.8, 5.4] {
        builder.cuboid(
            RenderInstanceDomainV2::Effect,
            builder.palette.glass,
            [x, 1.8, -2.0],
            [3.0, 4.0, 3.0],
            95,
            0,
        );
    }
    let mut environment = day_environment();
    environment.clear_rgba8 = [10, 17, 16, 255];
    environment.ambient_intensity = 0.48;
    environment.fog_near = 28.0;
    environment.fog_far = 75.0;
    builder.finish("bestiary-cardforge", "Production Bestiary and Cardforge specimen lineup with current authored models, glass, emission and silhouette separation.", camera(viewport, [0.0, 3.25, 12.7], -0.15), environment, 920_000)
}

fn celestial_scene(
    catalog: &CompiledModelCatalogV2,
    viewport: [u32; 2],
) -> Result<CanonicalVisualSceneV2, RenderExtractionError> {
    let mut builder = SceneBuilder::new(catalog)?;
    for (index, (position, scale, material)) in [
        ([-6.2, 5.0, -12.8], 2.2, builder.palette.sky),
        ([1.0, 6.3, -12.6], 1.4, builder.palette.glow),
        ([6.4, 3.5, -12.5], 1.0, builder.palette.ice),
    ]
    .into_iter()
    .enumerate()
    {
        builder.cuboid(
            RenderInstanceDomainV2::Effect,
            material,
            position,
            [scale; 3],
            -90 + index as i32,
            RENDER_ANIMATION_SPIN_V2 | RENDER_ANIMATION_PULSE_V2,
        );
    }
    builder.model(
        "gold-dragon",
        [1.7, 1.5, -3.5],
        0.46,
        RENDER_ANIMATION_BOB_V2 | RENDER_ANIMATION_FLAP_V2,
    )?;
    builder.model(
        "steel-dragon",
        [-3.8, 0.7, -4.5],
        0.4,
        RENDER_ANIMATION_BOB_V2 | RENDER_ANIMATION_FLAP_V2,
    )?;
    builder.model(
        "anemoi-gryphon",
        [-0.7, 3.7, -6.4],
        0.52,
        RENDER_ANIMATION_BOB_V2 | RENDER_ANIMATION_FLAP_V2,
    )?;
    builder.model_as(
        "arrow-projectile",
        [0.2, 1.8, 0.4],
        1.0,
        RENDER_ANIMATION_SPIN_V2,
        Some(RenderInstanceDomainV2::Projectile),
    )?;
    builder.model(
        "waykeeper-capture-orb",
        [4.2, 0.6, 0.2],
        1.05,
        RENDER_ANIMATION_BOB_V2 | RENDER_ANIMATION_SPIN_V2,
    )?;
    builder.model_as(
        "sailboat",
        [-0.8, -0.15, -1.0],
        0.72,
        RENDER_ANIMATION_BOB_V2 | RENDER_ANIMATION_SWAY_V2,
        Some(RenderInstanceDomainV2::Vehicle),
    )?;
    builder.particle_cloud(
        220,
        [0.0, 3.2, -4.0],
        [10.0, 6.0, 8.0],
        [235, 227, 178, 190],
        [0.0, 0.0, -0.04],
    );
    let environment = RenderEnvironmentV2 {
        clear_rgba8: [5, 8, 20, 255],
        ambient_rgb8: [68, 75, 111],
        ambient_intensity: 0.36,
        sun_direction: [-0.22, -0.81, -0.54],
        sun_rgb8: [190, 202, 255],
        sun_intensity: 0.34,
        fog_rgb8: [9, 14, 31],
        fog_near: 36.0,
        fog_far: 110.0,
        underwater: 0.0,
        cave_occlusion: 0.0,
    };
    builder.finish("celestial-effects", "Sky and celestial shading, flying dragons, projectile and item domains, particles, animation and additive emission.", camera(viewport, [0.0, 3.3, 11.8], -0.12), environment, 2_100_000)
}

/// The tracked R11 acceptance matrix. Every scene uses current production model
/// data, stable extraction ordering, and at least one non-trivial material or
/// animation path.
pub fn canonical_visual_matrix_v2(
    catalog: &CompiledModelCatalogV2,
    viewport: [u32; 2],
) -> Result<Vec<CanonicalVisualSceneV2>, RenderExtractionError> {
    catalog.validate()?;
    Ok(vec![
        overworld_scene(catalog, viewport)?,
        night_scene(catalog, viewport)?,
        cave_scene(catalog, viewport)?,
        underwater_scene(catalog, viewport)?,
        settlement_scene(catalog, viewport)?,
        specimen_scene(catalog, viewport)?,
        celestial_scene(catalog, viewport)?,
    ])
}

/// The dense live-canvas fixture is deliberately the overworld scene, not the
/// old four-cube smoke. It exercises real catalog models and the common terrain
/// and transparent paths on every browser lab frame.
pub fn canonical_live_canvas_scene_v2(
    catalog: &CompiledModelCatalogV2,
    viewport: [u32; 2],
) -> Result<CanonicalVisualSceneV2, RenderExtractionError> {
    catalog.validate()?;
    overworld_scene(catalog, viewport)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{decode_compiled_model_catalog_v2, encode_render_frame_v2, encode_render_resource_batch_v2};

    fn catalog() -> CompiledModelCatalogV2 {
        decode_compiled_model_catalog_v2(include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../public/renderer/12c522f880e94c1ae527de701ae3e710fee13701d66fbb0a4ad24895557011b4/models.bwm2"
        )))
        .expect("published production model catalog")
    }

    #[test]
    fn matrix_is_dense_and_covers_every_runtime_domain() {
        let scenes = canonical_visual_matrix_v2(&catalog(), [640, 360]).unwrap();
        assert_eq!(scenes.len(), 7);
        let domains = scenes
            .iter()
            .flat_map(|scene| scene.frame.instances.iter().map(|instance| instance.domain as u8))
            .collect::<std::collections::BTreeSet<_>>();
        for domain in [
            RenderInstanceDomainV2::Terrain,
            RenderInstanceDomainV2::Creature,
            RenderInstanceDomainV2::Player,
            RenderInstanceDomainV2::Item,
            RenderInstanceDomainV2::Prop,
            RenderInstanceDomainV2::Machine,
            RenderInstanceDomainV2::Projectile,
            RenderInstanceDomainV2::Vehicle,
            RenderInstanceDomainV2::Effect,
        ] {
            assert!(domains.contains(&(domain as u8)), "missing {domain:?}");
        }
        let counts = scenes
            .iter()
            .map(|scene| scene.frame.instances.len())
            .collect::<Vec<_>>();
        assert!(counts.iter().sum::<usize>() > 4_000, "matrix counts: {counts:?}");
        assert!(
            counts.iter().filter(|count| **count > 500).count() >= 4,
            "matrix counts: {counts:?}"
        );
        assert!(counts.iter().all(|count| *count > 80), "matrix counts: {counts:?}");
        assert!(scenes.iter().any(|scene| scene.frame.particles.len() >= 200));
    }

    #[test]
    fn matrix_wire_is_stable_and_bounded() {
        let first = canonical_visual_matrix_v2(&catalog(), [640, 360]).unwrap();
        let second = canonical_visual_matrix_v2(&catalog(), [640, 360]).unwrap();
        for (left, right) in first.iter().zip(&second) {
            assert_eq!(left.resources.batch_hash, right.resources.batch_hash);
            assert_eq!(left.frame.frame_hash, right.frame.frame_hash);
            assert_eq!(
                encode_render_resource_batch_v2(&left.resources).unwrap(),
                encode_render_resource_batch_v2(&right.resources).unwrap()
            );
            assert_eq!(
                encode_render_frame_v2(&left.frame).unwrap(),
                encode_render_frame_v2(&right.frame).unwrap()
            );
        }
    }
}
