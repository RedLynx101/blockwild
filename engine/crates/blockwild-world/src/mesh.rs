use crate::catalog::{CanonicalLiquidV1, CanonicalShapeV1, CanonicalSpecialtyMaterialV1};
use crate::contract::{
    MeshPacketV1, SectionSnapshotV1, TERRAIN_FLUID_FALLING_V1, TERRAIN_HIDDEN_GEOMETRY_V1, TERRAIN_SECTION_SIZE_V1,
    TerrainIndexStreamV1, TerrainLightingDeltaV1, TerrainMeshContractError, TerrainMeshLayerSpanV1, TerrainMeshLayerV1,
    TerrainMeshStreamsV1, halo_biome_index_v1, halo_cell_index_v1,
};
use crate::lighting::{LightChannel, light_channel};
use crate::material::{
    ATLAS_GRID_V1, MAX_LIGHT_LEVEL, PACKED_VERTEX_COLOR_RANGE_V1, ResolvedTerrainMaterialV1, SectionEligibilityV1,
    TerrainMaterialRegistryV1, section_eligibility_v1,
};

const ATLAS_PAD_V1: f64 = 0.0008;

#[derive(Clone, Copy)]
struct Face {
    direction: [i32; 3],
    shade: f64,
    corners: [[f64; 3]; 4],
}

const FACES: [Face; 6] = [
    Face {
        direction: [1, 0, 0],
        shade: 0.82,
        corners: [[0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [0.5, -0.5, 0.5]],
    },
    Face {
        direction: [-1, 0, 0],
        shade: 0.7,
        corners: [
            [-0.5, -0.5, 0.5],
            [-0.5, 0.5, 0.5],
            [-0.5, 0.5, -0.5],
            [-0.5, -0.5, -0.5],
        ],
    },
    Face {
        direction: [0, 1, 0],
        shade: 1.0,
        corners: [[-0.5, 0.5, -0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5]],
    },
    Face {
        direction: [0, -1, 0],
        shade: 0.54,
        corners: [
            [-0.5, -0.5, 0.5],
            [-0.5, -0.5, -0.5],
            [0.5, -0.5, -0.5],
            [0.5, -0.5, 0.5],
        ],
    },
    Face {
        direction: [0, 0, 1],
        shade: 0.88,
        corners: [[0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, -0.5, 0.5]],
    },
    Face {
        direction: [0, 0, -1],
        shade: 0.76,
        corners: [
            [-0.5, -0.5, -0.5],
            [-0.5, 0.5, -0.5],
            [0.5, 0.5, -0.5],
            [0.5, -0.5, -0.5],
        ],
    },
];

#[derive(Clone, Debug, PartialEq)]
pub enum MeshSectionOutcomeV1 {
    Eligible(Box<MeshPacketV1>),
    Ineligible(crate::material::SectionIneligibilityV1),
}

pub fn mesh_opaque_section_v1(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    lighting_delta: Option<TerrainLightingDeltaV1>,
) -> Result<MeshSectionOutcomeV1, TerrainMeshContractError> {
    match section_eligibility_v1(snapshot, registry)? {
        SectionEligibilityV1::Ineligible(reason) => return Ok(MeshSectionOutcomeV1::Ineligible(reason)),
        SectionEligibilityV1::Eligible => {}
    }
    let mut buckets: [LayerBucket; 7] = core::array::from_fn(|_| LayerBucket::default());
    for local_x in 0..TERRAIN_SECTION_SIZE_V1 as i32 {
        for local_z in 0..TERRAIN_SECTION_SIZE_V1 as i32 {
            for local_y in 0..TERRAIN_SECTION_SIZE_V1 as i32 {
                let index = halo_cell_index_v1(local_x, local_y, local_z).expect("core coordinate has a halo index");
                let block_id = snapshot.streams.blocks[index];
                if block_id == 0 || snapshot.streams.hidden[index] & TERRAIN_HIDDEN_GEOMETRY_V1 != 0 {
                    continue;
                }
                let material =
                    render_material(registry, block_id).expect("section eligibility resolved every block material");
                emit_cell(
                    snapshot,
                    registry,
                    &mut buckets,
                    [local_x, local_y, local_z],
                    block_id,
                    material,
                    index,
                );
            }
        }
    }
    let mut streams = TerrainMeshStreamsV1::empty();
    let mut indices = Vec::<u32>::new();
    let mut layers = Vec::new();
    for layer in TerrainMeshLayerV1::ALL {
        let bucket = &buckets[layer as usize];
        if bucket.vertex_count() == 0 {
            continue;
        }
        let vertex_start = u32::try_from(streams.vertex_count()).expect("section vertex count fits u32");
        let index_start = u32::try_from(indices.len()).expect("section index count fits u32");
        streams.positions.extend_from_slice(&bucket.positions);
        streams.normals.extend_from_slice(&bucket.normals);
        streams.colors.extend_from_slice(&bucket.colors);
        streams.lights.extend_from_slice(&bucket.lights);
        streams.emissions.extend_from_slice(&bucket.emissions);
        streams.occlusions.extend_from_slice(&bucket.occlusions);
        streams.uvs.extend_from_slice(&bucket.uvs);
        indices.extend(bucket.indices.iter().map(|index| index + vertex_start));
        layers.push(TerrainMeshLayerSpanV1 {
            layer,
            vertex_start,
            vertex_count: u32::try_from(bucket.vertex_count()).expect("section layer vertex count fits u32"),
            index_start,
            index_count: u32::try_from(bucket.indices.len()).expect("section layer index count fits u32"),
        });
    }
    let vertex_count = streams.vertex_count();
    streams.indices = if vertex_count > u16::MAX as usize {
        TerrainIndexStreamV1::U32(indices)
    } else {
        TerrainIndexStreamV1::U16(
            indices
                .into_iter()
                .map(|value| u16::try_from(value).expect("u16 index selected only for a bounded vertex stream"))
                .collect(),
        )
    };
    Ok(MeshSectionOutcomeV1::Eligible(Box::new(MeshPacketV1::create(
        snapshot,
        layers,
        streams,
        lighting_delta,
    )?)))
}

#[derive(Default)]
struct LayerBucket {
    positions: Vec<f32>,
    normals: Vec<i8>,
    colors: Vec<u8>,
    lights: Vec<u8>,
    emissions: Vec<u8>,
    occlusions: Vec<u8>,
    uvs: Vec<u16>,
    indices: Vec<u32>,
}

impl LayerBucket {
    fn vertex_count(&self) -> usize {
        self.positions.len() / 3
    }
}

#[derive(Clone, Copy)]
struct RenderMaterial {
    side_tile: u16,
    top_tile: u16,
    bottom_tile: u16,
    layer: TerrainMeshLayerV1,
    shape: CanonicalShapeV1,
    solid: bool,
    liquid: CanonicalLiquidV1,
    waterlogged: bool,
    connects_fence: bool,
    packed_emission: u8,
    ambient_occlusion: bool,
    aquatic_profile: u8,
    vertical_group: u16,
    shape_variant: u16,
    selective_interior_faces: bool,
    tint_policy: u8,
}

fn render_material(registry: &TerrainMaterialRegistryV1, block_id: u16) -> Option<RenderMaterial> {
    match registry.resolved_material(block_id)? {
        ResolvedTerrainMaterialV1::Air => None,
        ResolvedTerrainMaterialV1::OpaqueFullCube(material) => Some(RenderMaterial {
            side_tile: material.side_tile,
            top_tile: material.top_tile,
            bottom_tile: material.bottom_tile,
            layer: TerrainMeshLayerV1::Opaque,
            shape: CanonicalShapeV1::Cube,
            solid: true,
            liquid: CanonicalLiquidV1::None,
            waterlogged: false,
            connects_fence: false,
            packed_emission: pack_unorm8(material.emissive_strength),
            ambient_occlusion: material.ambient_occlusion,
            aquatic_profile: 0,
            vertical_group: 0,
            shape_variant: 0,
            selective_interior_faces: false,
            tint_policy: 1,
        }),
        ResolvedTerrainMaterialV1::Specialty(material) => Some(render_specialty(material)),
    }
}

fn render_specialty(material: CanonicalSpecialtyMaterialV1) -> RenderMaterial {
    RenderMaterial {
        side_tile: material.side_tile,
        top_tile: material.top_tile,
        bottom_tile: material.bottom_tile,
        layer: material.layer,
        shape: material.shape,
        solid: material.solid,
        liquid: material.liquid,
        waterlogged: material.waterlogged,
        connects_fence: material.connects_fence,
        packed_emission: pack_unorm8(material.emissive_strength()),
        ambient_occlusion: material.ambient_occlusion,
        aquatic_profile: material.aquatic_profile,
        vertical_group: material.vertical_group,
        shape_variant: material.shape_variant,
        selective_interior_faces: material.selective_interior_faces,
        tint_policy: material.tint_policy,
    }
}

#[derive(Clone, Copy)]
enum VertexTint {
    Biome,
    Fixed([f64; 3]),
}

const fn material_tint(material: RenderMaterial) -> VertexTint {
    if material.tint_policy == 0 {
        VertexTint::Fixed([1.0; 3])
    } else {
        VertexTint::Biome
    }
}

#[allow(clippy::too_many_arguments)]
fn add_quad(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    bucket: &mut LayerBucket,
    corners: [[f64; 3]; 4],
    normal: [f64; 3],
    tile: u16,
    shade: f64,
    tint: VertexTint,
    emission: u8,
    ambient_occlusion: bool,
) {
    let base = u32::try_from(bucket.vertex_count()).expect("section layer vertex count fits u32");
    for local in corners {
        bucket.positions.extend([
            local[0] as f32,
            (f64::from(snapshot.address.section_y) * 16.0 + local[1]) as f32,
            local[2] as f32,
        ]);
        bucket.normals.extend(normal.map(pack_snorm8));
        let tint = match tint {
            VertexTint::Biome => biome_tint_for_vertex(snapshot, registry, local[0], local[2]),
            VertexTint::Fixed(tint) => tint,
        };
        bucket.colors.extend(tint.map(|channel| pack_color(channel * shade)));
        bucket.lights.extend(surface_light_at(snapshot, local, normal));
        bucket.emissions.push(emission);
        bucket.occlusions.push(if ambient_occlusion {
            pack_unorm8(surface_occlusion_at(snapshot, registry, local, normal))
        } else {
            u8::MAX
        });
    }
    bucket.uvs.extend(tile_uvs(tile));
    bucket
        .indices
        .extend([base, base + 1, base + 2, base, base + 2, base + 3]);
}

fn translated_corners(corners: [[f64; 3]; 4], cell: [i32; 3], top_offset: f64) -> [[f64; 3]; 4] {
    corners.map(|corner| {
        [
            f64::from(cell[0]) + corner[0],
            f64::from(cell[1]) + corner[1] + if corner[1] > 0.0 { top_offset } else { 0.0 },
            f64::from(cell[2]) + corner[2],
        ]
    })
}

fn material_at(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    cell: [i32; 3],
) -> Option<(u16, RenderMaterial)> {
    let index = halo_cell_index_v1(cell[0], cell[1], cell[2])?;
    let block_id = snapshot.streams.blocks[index];
    render_material(registry, block_id).map(|material| (block_id, material))
}

fn contains_water(material: RenderMaterial) -> bool {
    material.waterlogged || matches!(material.liquid, CanonicalLiquidV1::Water)
}

fn full_cube(material: RenderMaterial) -> bool {
    matches!(material.shape, CanonicalShapeV1::Cube)
}

fn face_visible(current_id: u16, current: RenderMaterial, neighbor: Option<(u16, RenderMaterial)>) -> bool {
    let Some((neighbor_id, neighbor)) = neighbor else {
        return true;
    };
    if contains_water(current) && contains_water(neighbor) {
        return false;
    }
    let medium_rank = |material: RenderMaterial| {
        if contains_water(material) {
            1
        } else if material.layer == TerrainMeshLayerV1::Glass {
            3
        } else if material.layer == TerrainMeshLayerV1::Transparent {
            2
        } else if material.layer == TerrainMeshLayerV1::TranslucentSolid {
            4
        } else {
            0
        }
    };
    let current_rank = if full_cube(current) { medium_rank(current) } else { 0 };
    let neighbor_rank = if full_cube(neighbor) { medium_rank(neighbor) } else { 0 };
    if current_rank > 0 && neighbor_rank > 0 {
        return if current_id == neighbor_id {
            false
        } else if current_rank != neighbor_rank {
            current_rank > neighbor_rank
        } else {
            current_id > neighbor_id
        };
    }
    let neighbor_occludes = full_cube(neighbor)
        && neighbor.solid
        && !matches!(
            neighbor.layer,
            TerrainMeshLayerV1::Transparent
                | TerrainMeshLayerV1::Glass
                | TerrainMeshLayerV1::TranslucentSolid
                | TerrainMeshLayerV1::Cutout
        );
    if matches!(
        current.layer,
        TerrainMeshLayerV1::Transparent | TerrainMeshLayerV1::TranslucentSolid
    ) || current.layer == TerrainMeshLayerV1::Cutout
        || (current.layer == TerrainMeshLayerV1::Emissive && !current.solid)
    {
        neighbor_id != current_id && !neighbor_occludes
    } else {
        !neighbor_occludes
    }
}

fn liquid_surface_inset(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    cell: [i32; 3],
    material: RenderMaterial,
) -> f64 {
    if !contains_water(material) {
        return 0.0;
    }
    if material_at(snapshot, registry, [cell[0], cell[1] + 1, cell[2]]).is_some_and(|(_, above)| contains_water(above))
    {
        return 0.0;
    }
    let index = halo_cell_index_v1(cell[0], cell[1], cell[2]).expect("liquid cell is in section halo");
    let falling = snapshot.streams.fluid_flags[index] & TERRAIN_FLUID_FALLING_V1 != 0;
    let level = if falling {
        0
    } else {
        snapshot.streams.fluid_level[index].min(7)
    };
    -(0.09 + f64::from(level) * 0.11).min(0.86)
}

#[allow(clippy::too_many_arguments)]
fn add_cuboid(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    bucket: &mut LayerBucket,
    bounds: [f64; 6],
    tiles: [u16; 3],
    tint: VertexTint,
    emission: u8,
) {
    add_cuboid_with_ambient_occlusion(snapshot, registry, bucket, bounds, tiles, tint, emission, false);
}

#[allow(clippy::too_many_arguments)]
fn add_cuboid_with_ambient_occlusion(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    bucket: &mut LayerBucket,
    bounds: [f64; 6],
    tiles: [u16; 3],
    tint: VertexTint,
    emission: u8,
    ambient_occlusion: bool,
) {
    let [x0, y0, z0, x1, y1, z1] = bounds;
    let faces = [
        (
            [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]],
            [1.0, 0.0, 0.0],
            tiles[0],
            0.82,
        ),
        (
            [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]],
            [-1.0, 0.0, 0.0],
            tiles[0],
            0.72,
        ),
        (
            [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]],
            [0.0, 1.0, 0.0],
            tiles[1],
            1.0,
        ),
        (
            [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]],
            [0.0, -1.0, 0.0],
            tiles[2],
            0.55,
        ),
        (
            [[x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1]],
            [0.0, 0.0, 1.0],
            tiles[0],
            0.9,
        ),
        (
            [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]],
            [0.0, 0.0, -1.0],
            tiles[0],
            0.76,
        ),
    ];
    for (corners, normal, tile, shade) in faces {
        add_quad(
            snapshot,
            registry,
            bucket,
            corners,
            normal,
            tile,
            shade,
            tint,
            emission,
            ambient_occlusion,
        );
    }
}

fn rotate_offset(x: f64, z: f64, facing: u8) -> [f64; 2] {
    match facing {
        1 => [-z, x],
        2 => [-x, -z],
        3 => [z, -x],
        _ => [x, z],
    }
}

#[allow(clippy::too_many_arguments)]
fn add_facing_cuboid(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    bucket: &mut LayerBucket,
    center: [f64; 2],
    facing: u8,
    bounds: [f64; 6],
    tiles: [u16; 3],
    tint: VertexTint,
    emission: u8,
) {
    add_facing_cuboid_with_ambient_occlusion(
        snapshot, registry, bucket, center, facing, bounds, tiles, tint, emission, false,
    );
}

#[allow(clippy::too_many_arguments)]
fn add_facing_cuboid_with_ambient_occlusion(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    bucket: &mut LayerBucket,
    center: [f64; 2],
    facing: u8,
    bounds: [f64; 6],
    tiles: [u16; 3],
    tint: VertexTint,
    emission: u8,
    ambient_occlusion: bool,
) {
    let first = rotate_offset(bounds[0] - center[0], bounds[2] - center[1], facing);
    let second = rotate_offset(bounds[3] - center[0], bounds[5] - center[1], facing);
    add_cuboid_with_ambient_occlusion(
        snapshot,
        registry,
        bucket,
        [
            center[0] + first[0].min(second[0]),
            bounds[1],
            center[1] + first[1].min(second[1]),
            center[0] + first[0].max(second[0]),
            bounds[4],
            center[1] + first[1].max(second[1]),
        ],
        tiles,
        tint,
        emission,
        ambient_occlusion,
    );
}

// Cross planes carry all of the same sampled vertex attributes as cuboids plus
// authored bounds/UV controls; grouping them would obscure parity at call sites.
#[allow(clippy::too_many_arguments)]
fn add_cross(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    bucket: &mut LayerBucket,
    center: [f64; 2],
    y0: f64,
    y1: f64,
    half: f64,
    tile: u16,
    tint: VertexTint,
    emission: u8,
    shade: f64,
) {
    let [x, z] = center;
    for (corners, normal, face_shade) in [
        (
            [
                [x - half, y0, z - half],
                [x - half, y1, z - half],
                [x + half, y1, z + half],
                [x + half, y0, z + half],
            ],
            [0.7, 0.0, -0.7],
            shade,
        ),
        (
            [
                [x + half, y0, z - half],
                [x + half, y1, z - half],
                [x - half, y1, z + half],
                [x - half, y0, z + half],
            ],
            [-0.7, 0.0, -0.7],
            shade * 0.92,
        ),
        (
            [
                [x - half, y0, z],
                [x - half, y1, z],
                [x + half, y1, z],
                [x + half, y0, z],
            ],
            [0.0, 0.0, -1.0],
            shade * 0.96,
        ),
        (
            [
                [x, y0, z - half],
                [x, y1, z - half],
                [x, y1, z + half],
                [x, y0, z + half],
            ],
            [-1.0, 0.0, 0.0],
            shade * 0.9,
        ),
    ] {
        add_quad(
            snapshot, registry, bucket, corners, normal, tile, face_shade, tint, emission, false,
        );
    }
}

fn emit_cell(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    buckets: &mut [LayerBucket; 7],
    cell: [i32; 3],
    block_id: u16,
    material: RenderMaterial,
    halo_index: usize,
) {
    if material.waterlogged {
        emit_implicit_water(snapshot, registry, buckets, cell, material);
    }
    let facing = snapshot.streams.facing[halo_index];
    if material.shape_variant == 1 {
        emit_furnace(snapshot, registry, buckets, cell, material, facing);
        return;
    }
    match material.shape {
        CanonicalShapeV1::Cube => emit_cube(snapshot, registry, buckets, cell, block_id, material),
        CanonicalShapeV1::Cross => emit_cross_cell(snapshot, registry, buckets, cell, material, false),
        CanonicalShapeV1::TallFlower => emit_tall_flower(snapshot, registry, buckets, cell, material),
        CanonicalShapeV1::Aquatic => emit_aquatic(snapshot, registry, buckets, cell, block_id, material),
        CanonicalShapeV1::Bush | CanonicalShapeV1::Fruit => emit_bush(snapshot, registry, buckets, cell, material),
        CanonicalShapeV1::Torch => emit_torch(snapshot, registry, buckets, cell, block_id, material),
        CanonicalShapeV1::Mooncap => emit_mooncap(snapshot, registry, buckets, cell, material),
        CanonicalShapeV1::Fence | CanonicalShapeV1::Gate => {
            emit_fence_or_gate(snapshot, registry, buckets, cell, block_id, material)
        }
        CanonicalShapeV1::Door => emit_door(snapshot, registry, buckets, cell, block_id, material),
        CanonicalShapeV1::Bed => emit_bed(snapshot, registry, buckets, cell, block_id, material),
        CanonicalShapeV1::Chest => emit_chest(snapshot, registry, buckets, cell, material, facing),
        CanonicalShapeV1::Exhibit => emit_exhibit(snapshot, registry, buckets, cell, block_id, material),
        CanonicalShapeV1::Aquarium => emit_aquarium(snapshot, registry, buckets, cell, block_id),
        _ => emit_authored_shape(snapshot, registry, buckets, cell, block_id, material, facing),
    }
}

fn emit_cube(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    buckets: &mut [LayerBucket; 7],
    cell: [i32; 3],
    block_id: u16,
    material: RenderMaterial,
) {
    let top_offset = liquid_surface_inset(snapshot, registry, cell, material);
    let seed = world_seed(snapshot);
    for face in FACES {
        let neighbor_cell = [
            cell[0] + face.direction[0],
            cell[1] + face.direction[1],
            cell[2] + face.direction[2],
        ];
        let neighbor = material_at(snapshot, registry, neighbor_cell);
        if matches!(material.liquid, CanonicalLiquidV1::Water)
            && face.direction[1] == 0
            && neighbor.is_some_and(|(_, value)| contains_water(value))
        {
            let neighbor_offset = neighbor
                .map(|(_, value)| liquid_surface_inset(snapshot, registry, neighbor_cell, value))
                .unwrap_or(0.0);
            if top_offset <= neighbor_offset + 1e-6 {
                continue;
            }
            let corners = face.corners.map(|corner| {
                [
                    f64::from(cell[0]) + corner[0],
                    f64::from(cell[1]) + 0.5 + if corner[1] > 0.0 { top_offset } else { neighbor_offset },
                    f64::from(cell[2]) + corner[2],
                ]
            });
            add_quad(
                snapshot,
                registry,
                &mut buckets[material.layer as usize],
                corners,
                face.direction.map(f64::from),
                material.side_tile,
                face.shade,
                material_tint(material),
                material.packed_emission,
                material.ambient_occlusion,
            );
            continue;
        }
        let internal_leaf = material.selective_interior_faces
            && neighbor.is_some_and(|(neighbor_id, _)| neighbor_id == block_id)
            && face.direction.iter().sum::<i32>() > 0
            && hash3(
                i64::from(snapshot.address.chunk_x) * 16 + i64::from(neighbor_cell[0]),
                i64::from(snapshot.address.section_y) * 16 + i64::from(neighbor_cell[1]),
                i64::from(snapshot.address.chunk_z) * 16 + i64::from(neighbor_cell[2]),
                seed ^ 0x37b4_1cd9,
            ) < 0.18;
        if !face_visible(block_id, material, neighbor) && !internal_leaf {
            continue;
        }
        let tile = if face.direction[1] > 0 {
            material.top_tile
        } else if face.direction[1] < 0 {
            material.bottom_tile
        } else {
            material.side_tile
        };
        add_quad(
            snapshot,
            registry,
            &mut buckets[material.layer as usize],
            translated_corners(face.corners, cell, top_offset),
            face.direction.map(f64::from),
            tile,
            face.shade,
            material_tint(material),
            material.packed_emission,
            material.ambient_occlusion,
        );
    }
}

fn emit_implicit_water(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    buckets: &mut [LayerBucket; 7],
    cell: [i32; 3],
    host: RenderMaterial,
) {
    let Some((water_id, water)) = registry.blocks.iter().enumerate().find_map(|(block_id, _)| {
        let block_id = u16::try_from(block_id).ok()?;
        let material = render_material(registry, block_id)?;
        (matches!(material.liquid, CanonicalLiquidV1::Water) && material.layer == TerrainMeshLayerV1::Water)
            .then_some((block_id, material))
    }) else {
        return;
    };
    let top_offset = liquid_surface_inset(snapshot, registry, cell, water);
    for face in FACES {
        let neighbor_cell = [
            cell[0] + face.direction[0],
            cell[1] + face.direction[1],
            cell[2] + face.direction[2],
        ];
        if !face_visible(water_id, water, material_at(snapshot, registry, neighbor_cell)) {
            continue;
        }
        add_quad(
            snapshot,
            registry,
            &mut buckets[TerrainMeshLayerV1::Water as usize],
            translated_corners(face.corners, cell, top_offset),
            face.direction.map(f64::from),
            water.side_tile,
            face.shade,
            material_tint(water),
            host.packed_emission,
            false,
        );
    }
}

fn emit_cross_cell(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    buckets: &mut [LayerBucket; 7],
    cell: [i32; 3],
    material: RenderMaterial,
    tall: bool,
) {
    let below = material_at(snapshot, registry, [cell[0], cell[1] - 1, cell[2]])
        .is_some_and(|(_, value)| material.vertical_group != 0 && value.vertical_group == material.vertical_group);
    let above = material_at(snapshot, registry, [cell[0], cell[1] + 1, cell[2]])
        .is_some_and(|(_, value)| material.vertical_group != 0 && value.vertical_group == material.vertical_group);
    let y = f64::from(cell[1]);
    if tall {
        add_cross(
            snapshot,
            registry,
            &mut buckets[material.layer as usize],
            [f64::from(cell[0]), f64::from(cell[2])],
            y - 0.5,
            y + 0.12,
            0.41,
            material.side_tile,
            material_tint(material),
            material.packed_emission,
            0.94,
        );
        add_cross(
            snapshot,
            registry,
            &mut buckets[material.layer as usize],
            [f64::from(cell[0]), f64::from(cell[2])],
            y - 0.08,
            y + 0.58,
            0.48,
            material.side_tile,
            VertexTint::Biome,
            material.packed_emission,
            1.0,
        );
    } else {
        add_cross(
            snapshot,
            registry,
            &mut buckets[material.layer as usize],
            [f64::from(cell[0]), f64::from(cell[2])],
            y - if below { 0.54 } else { 0.5 },
            y + if above { 0.54 } else { 0.5 },
            0.44,
            material.side_tile,
            VertexTint::Biome,
            material.packed_emission,
            1.0,
        );
    }
}

fn emit_tall_flower(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    buckets: &mut [LayerBucket; 7],
    cell: [i32; 3],
    material: RenderMaterial,
) {
    emit_cross_cell(snapshot, registry, buckets, cell, material, true);
}

fn emit_bush(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    buckets: &mut [LayerBucket; 7],
    cell: [i32; 3],
    material: RenderMaterial,
) {
    let fruit = matches!(material.shape, CanonicalShapeV1::Fruit);
    let half = if fruit { 0.24 } else { 0.48 };
    let y = f64::from(cell[1]);
    let y0 = y - if fruit { 0.17 } else { 0.5 };
    let y1 = y + if fruit { 0.44 } else { 0.48 };
    let x = f64::from(cell[0]);
    let z = f64::from(cell[2]);
    for (corners, normal, shade) in [
        (
            [
                [x - half, y0, z - half],
                [x - half, y1, z - half],
                [x + half, y1, z + half],
                [x + half, y0, z + half],
            ],
            [0.7, 0.0, -0.7],
            1.0,
        ),
        (
            [
                [x + half, y0, z - half],
                [x + half, y1, z - half],
                [x - half, y1, z + half],
                [x - half, y0, z + half],
            ],
            [-0.7, 0.0, -0.7],
            0.92,
        ),
    ] {
        add_quad(
            snapshot,
            registry,
            &mut buckets[material.layer as usize],
            corners,
            normal,
            material.side_tile,
            shade,
            VertexTint::Biome,
            material.packed_emission,
            false,
        );
    }
    if !fruit {
        add_quad(
            snapshot,
            registry,
            &mut buckets[material.layer as usize],
            [
                [x, y0, z - half],
                [x, y1, z - half],
                [x, y1, z + half],
                [x, y0, z + half],
            ],
            [-1.0, 0.0, 0.0],
            material.side_tile,
            0.96,
            VertexTint::Biome,
            material.packed_emission,
            false,
        );
    }
}

fn emit_mooncap(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    buckets: &mut [LayerBucket; 7],
    cell: [i32; 3],
    material: RenderMaterial,
) {
    let [x, y, z] = cell.map(f64::from);
    let bucket = &mut buckets[material.layer as usize];
    add_cuboid(
        snapshot,
        registry,
        bucket,
        [x - 0.22, y - 0.5, z - 0.22, x + 0.22, y + 0.18, z + 0.22],
        [material.bottom_tile; 3],
        VertexTint::Biome,
        material.packed_emission,
    );
    add_cuboid(
        snapshot,
        registry,
        bucket,
        [x - 0.5, y + 0.12, z - 0.5, x + 0.5, y + 0.5, z + 0.5],
        [material.side_tile, material.top_tile, material.bottom_tile],
        VertexTint::Biome,
        material.packed_emission,
    );
}

fn emit_aquatic(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    buckets: &mut [LayerBucket; 7],
    cell: [i32; 3],
    block_id: u16,
    material: RenderMaterial,
) {
    let below = material_at(snapshot, registry, [cell[0], cell[1] - 1, cell[2]])
        .is_some_and(|(_, value)| material.vertical_group != 0 && value.vertical_group == material.vertical_group);
    let above = material_at(snapshot, registry, [cell[0], cell[1] + 1, cell[2]])
        .is_some_and(|(_, value)| material.vertical_group != 0 && value.vertical_group == material.vertical_group);
    let overlap = match material.aquatic_profile {
        1 | 4 | 6 | 10 => 0.64,
        11 => 0.61,
        5 | 9 => 0.59,
        _ => 0.56,
    };
    let y = f64::from(cell[1]);
    let y0 = y - if below { overlap } else { 0.5 };
    let y1 = y + if above { overlap } else { 0.5 };
    let world_x = i64::from(snapshot.address.chunk_x) * 16 + i64::from(cell[0]);
    let world_z = i64::from(snapshot.address.chunk_z) * 16 + i64::from(cell[2]);
    let lean = (hash2(
        world_x,
        world_z,
        world_seed(snapshot) ^ u32::from(block_id).wrapping_mul(7919),
    ) - 0.5)
        * 0.15;
    let base = [f64::from(cell[0]), f64::from(cell[2])];
    let mut add = |half: f64, low: f64, high: f64, shade: f64, dx: f64, dz: f64, tile: u16| {
        add_cross(
            snapshot,
            registry,
            &mut buckets[material.layer as usize],
            [base[0] + dx, base[1] + dz],
            low,
            high,
            half,
            tile,
            VertexTint::Biome,
            material.packed_emission,
            shade,
        );
    };
    match material.aquatic_profile {
        6 => {
            add(0.38, y0, y1, 0.96, lean, -lean * 0.45, 253);
            add(0.2, y0, y1, 0.82, -lean * 0.55, lean * 0.8, 253);
        }
        1 => {
            add(0.46, y0, y1, 1.0, lean * 0.35, lean, material.side_tile);
            add(0.25, y0 + 0.12, y1, 0.86, -lean, lean * 0.25, material.side_tile);
        }
        2 => {
            add(0.44, y0, y1 - 0.08, 1.0, 0.0, 0.0, material.side_tile);
            add(0.26, y0 + 0.1, y1, 0.9, lean, -lean, material.side_tile);
        }
        3 => {
            add(0.37, y0, y1 - 0.12, 0.94, lean * 0.4, 0.0, material.side_tile);
            add(
                0.48,
                y0.max(y1 - 0.46),
                y1,
                1.04,
                -lean * 0.25,
                lean * 0.25,
                material.side_tile,
            );
        }
        7 => {
            add(0.2, y0, y1, 0.94, lean * 0.22, 0.0, 254);
            add(0.16, y0, y1, 0.84, -lean * 0.2, lean * 0.25, 254);
            if !above {
                add(0.48, y0.max(y1 - 0.78), y1, 1.04, lean * 0.15, -lean * 0.12, 255);
            }
        }
        4 => {
            add(0.32, y0, y1, 0.95, lean, lean * 0.4, material.side_tile);
            add(0.16, y0 + 0.04, y1 - 0.03, 0.8, -lean * 0.7, -lean, material.side_tile);
        }
        8 => {
            add(0.45, y0, y1 - 0.14, 0.9, 0.0, 0.0, material.side_tile);
            add(0.29, y0 + 0.18, y1, 1.02, lean, -lean, material.side_tile);
        }
        9 => {
            let top = if above { y1 } else { y + 0.34 };
            add(0.13, y0, top, 0.94, -0.21 + lean * 0.35, -0.12, material.side_tile);
            add(
                0.16,
                y0 + 0.02,
                top - 0.06,
                1.0,
                0.08,
                0.17 + lean * 0.2,
                material.side_tile,
            );
            add(
                0.11,
                y0 + 0.04,
                top - 0.14,
                0.84,
                0.24 - lean * 0.3,
                -0.18,
                material.side_tile,
            );
        }
        10 => {
            add(0.47, y0, y1, 1.0, lean * 0.25, lean * 0.5, material.side_tile);
            add(
                0.24,
                y0 + 0.08,
                y1 - 0.04,
                0.84,
                -lean * 0.65,
                -0.12,
                material.side_tile,
            );
            add(0.12, y0, y1, 0.76, 0.16, 0.18, material.side_tile);
        }
        11 => {
            add(0.18, y0, y1, 0.88, lean * 0.15, 0.0, material.side_tile);
            add(0.4, y0 + 0.08, y1 - 0.1, 1.0, lean, -0.08, material.side_tile);
            add(0.27, y0 + 0.2, y1, 0.9, -0.16, lean * 0.7, material.side_tile);
        }
        12 => {
            add(0.13, y0, y + 0.03, 0.82, 0.0, 0.0, material.side_tile);
            add(0.49, y - 0.08, y1, 1.0, lean * 0.35, 0.0, material.side_tile);
            add(0.31, y + 0.02, y1 - 0.03, 0.9, -0.09, lean * 0.25, material.side_tile);
        }
        _ => {
            add(0.28, y0, y1, 0.96, lean * 0.3, 0.0, material.side_tile);
            add(0.14, y0 + 0.06, y1 - 0.03, 0.84, -lean * 0.5, lean, material.side_tile);
        }
    }
}

fn emit_torch(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    buckets: &mut [LayerBucket; 7],
    cell: [i32; 3],
    _block_id: u16,
    material: RenderMaterial,
) {
    let [x, y, z] = cell.map(f64::from);
    let outward = match material.shape_variant {
        2 => Some([0.0, 0.0, -1.0]),
        3 => Some([0.0, 0.0, 1.0]),
        4 => Some([1.0, 0.0, 0.0]),
        5 => Some([-1.0, 0.0, 0.0]),
        _ => None,
    };
    let base = outward.map_or([x, y - 0.49, z], |o| [x - o[0] * 0.47, y - 0.18, z - o[2] * 0.47]);
    let tip = outward.map_or([x, y + 0.41, z], |o| {
        [base[0] + o[0] * 0.34, y + 0.48, base[2] + o[2] * 0.34]
    });
    let axis = normalize3([tip[0] - base[0], tip[1] - base[1], tip[2] - base[2]]);
    let width_a = outward.map_or([1.0, 0.0, 0.0], |o| normalize3([-o[2], 0.0, o[0]]));
    let width_b = normalize3(cross3(axis, width_a));
    for (width, shade) in [(width_a, 1.0), (width_b, 0.91)] {
        let half = width.map(|value| value * 0.22);
        let corners = [
            [base[0] - half[0], base[1] - half[1], base[2] - half[2]],
            [tip[0] - half[0], tip[1] - half[1], tip[2] - half[2]],
            [tip[0] + half[0], tip[1] + half[1], tip[2] + half[2]],
            [base[0] + half[0], base[1] + half[1], base[2] + half[2]],
        ];
        add_quad(
            snapshot,
            registry,
            &mut buckets[material.layer as usize],
            corners,
            normalize3(cross3(width, axis)),
            material.side_tile,
            shade,
            VertexTint::Fixed([1.0; 3]),
            material.packed_emission,
            false,
        );
    }
}

fn emit_fence_or_gate(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    buckets: &mut [LayerBucket; 7],
    cell: [i32; 3],
    _block_id: u16,
    material: RenderMaterial,
) {
    let [x, y, z] = cell.map(f64::from);
    let tiles = [material.side_tile; 3];
    let bucket = &mut buckets[material.layer as usize];
    let mut wood = |bounds| {
        add_cuboid(
            snapshot,
            registry,
            bucket,
            bounds,
            tiles,
            VertexTint::Biome,
            material.packed_emission,
        )
    };
    if matches!(material.shape, CanonicalShapeV1::Fence) {
        wood([x - 0.14, y - 0.5, z - 0.14, x + 0.14, y + 0.75, z + 0.14]);
        let connects = |dx, dz| {
            material_at(snapshot, registry, [cell[0] + dx, cell[1], cell[2] + dz])
                .is_some_and(|(_, m)| m.connects_fence || (m.solid && full_cube(m)))
        };
        if connects(1, 0) {
            for rail in [-0.06, 0.38] {
                wood([x + 0.08, y + rail - 0.1, z - 0.09, x + 0.5, y + rail + 0.1, z + 0.09]);
            }
        }
        if connects(-1, 0) {
            for rail in [-0.06, 0.38] {
                wood([x - 0.5, y + rail - 0.1, z - 0.09, x - 0.08, y + rail + 0.1, z + 0.09]);
            }
        }
        if connects(0, 1) {
            for rail in [-0.06, 0.38] {
                wood([x - 0.09, y + rail - 0.1, z + 0.08, x + 0.09, y + rail + 0.1, z + 0.5]);
            }
        }
        if connects(0, -1) {
            for rail in [-0.06, 0.38] {
                wood([x - 0.09, y + rail - 0.1, z - 0.5, x + 0.09, y + rail + 0.1, z - 0.08]);
            }
        }
        return;
    }
    let north_south = matches!(material.shape_variant, 10 | 12);
    let open = matches!(material.shape_variant, 12 | 13);
    if north_south {
        wood([x - 0.48, y - 0.5, z - 0.12, x - 0.34, y + 0.72, z + 0.12]);
        wood([x + 0.34, y - 0.5, z - 0.12, x + 0.48, y + 0.72, z + 0.12]);
        for rail in [-0.06, 0.36] {
            if open {
                wood([x - 0.46, y + rail - 0.09, z - 0.12, x - 0.34, y + rail + 0.09, z + 0.34]);
                wood([x + 0.34, y + rail - 0.09, z - 0.12, x + 0.46, y + rail + 0.09, z + 0.34]);
            } else {
                wood([x - 0.36, y + rail - 0.09, z - 0.08, x + 0.36, y + rail + 0.09, z + 0.08]);
            }
        }
    } else {
        wood([x - 0.12, y - 0.5, z - 0.48, x + 0.12, y + 0.72, z - 0.34]);
        wood([x - 0.12, y - 0.5, z + 0.34, x + 0.12, y + 0.72, z + 0.48]);
        for rail in [-0.06, 0.36] {
            if open {
                wood([x - 0.12, y + rail - 0.09, z - 0.46, x + 0.34, y + rail + 0.09, z - 0.34]);
                wood([x - 0.12, y + rail - 0.09, z + 0.34, x + 0.34, y + rail + 0.09, z + 0.46]);
            } else {
                wood([x - 0.08, y + rail - 0.09, z - 0.36, x + 0.08, y + rail + 0.09, z + 0.36]);
            }
        }
    }
}

fn emit_door(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    buckets: &mut [LayerBucket; 7],
    cell: [i32; 3],
    _block_id: u16,
    material: RenderMaterial,
) {
    let [x, y, z] = cell.map(f64::from);
    let open = matches!(material.shape_variant, 22 | 23 | 26 | 27 | 30 | 31 | 34 | 35);
    let x_axis = matches!(material.shape_variant, 24..=27 | 32..=35);
    let along_z = x_axis != open;
    let bucket = &mut buckets[material.layer as usize];
    if matches!(material.shape_variant, 28..=35) {
        let center_x = if along_z { x + if open { -0.42 } else { 0.0 } } else { x };
        let center_z = if along_z { z } else { z + if open { -0.42 } else { 0.0 } };
        let mut iron = |along0: f64, y0: f64, along1: f64, y1: f64, fitting: bool| {
            let tile = if fitting { 161 } else { 160 };
            let bounds = if along_z {
                [center_x - 0.07, y0, z + along0, center_x + 0.07, y1, z + along1]
            } else {
                [x + along0, y0, center_z - 0.07, x + along1, y1, center_z + 0.07]
            };
            add_cuboid(
                snapshot,
                registry,
                bucket,
                bounds,
                [tile; 3],
                VertexTint::Biome,
                material.packed_emission,
            );
        };
        for along in [-0.44_f64, -0.22, 0.0, 0.22, 0.44] {
            let half = if along.abs() > 0.4 { 0.045 } else { 0.025 };
            iron(along - half, y - 0.5, along + half, y + 0.5, false);
        }
        for rail_y in [y - 0.46, y + 0.38] {
            iron(-0.48, rail_y, 0.48, rail_y + 0.08, false);
        }
        iron(0.27, y - 0.06, 0.43, y + 0.1, true);
        return;
    }
    if along_z {
        let x0 = x + if open { -0.5 } else { -0.08 };
        let x1 = x + if open { -0.34 } else { 0.08 };
        for (corners, normal, tile, shade) in [
            (
                [
                    [x0, y - 0.5, z - 0.48],
                    [x0, y + 0.5, z - 0.48],
                    [x0, y + 0.5, z + 0.48],
                    [x0, y - 0.5, z + 0.48],
                ],
                [-1.0, 0.0, 0.0],
                material.side_tile,
                0.88,
            ),
            (
                [
                    [x1, y - 0.5, z + 0.48],
                    [x1, y + 0.5, z + 0.48],
                    [x1, y + 0.5, z - 0.48],
                    [x1, y - 0.5, z - 0.48],
                ],
                [1.0, 0.0, 0.0],
                material.side_tile,
                0.78,
            ),
            (
                [
                    [x0, y + 0.5, z - 0.48],
                    [x0, y + 0.5, z + 0.48],
                    [x1, y + 0.5, z + 0.48],
                    [x1, y + 0.5, z - 0.48],
                ],
                [0.0, 1.0, 0.0],
                62,
                0.94,
            ),
            (
                [
                    [x0, y - 0.5, z + 0.48],
                    [x0, y - 0.5, z - 0.48],
                    [x1, y - 0.5, z - 0.48],
                    [x1, y - 0.5, z + 0.48],
                ],
                [0.0, -1.0, 0.0],
                62,
                0.58,
            ),
            (
                [
                    [x1, y - 0.5, z + 0.48],
                    [x1, y + 0.5, z + 0.48],
                    [x0, y + 0.5, z + 0.48],
                    [x0, y - 0.5, z + 0.48],
                ],
                [0.0, 0.0, 1.0],
                62,
                0.84,
            ),
            (
                [
                    [x0, y - 0.5, z - 0.48],
                    [x0, y + 0.5, z - 0.48],
                    [x1, y + 0.5, z - 0.48],
                    [x1, y - 0.5, z - 0.48],
                ],
                [0.0, 0.0, -1.0],
                62,
                0.72,
            ),
        ] {
            add_quad(
                snapshot,
                registry,
                bucket,
                corners,
                normal,
                tile,
                shade,
                VertexTint::Biome,
                material.packed_emission,
                false,
            );
        }
    } else {
        let z0 = z + if open { -0.5 } else { -0.08 };
        let z1 = z + if open { -0.34 } else { 0.08 };
        for (corners, normal, tile, shade) in [
            (
                [
                    [x + 0.48, y - 0.5, z0],
                    [x + 0.48, y + 0.5, z0],
                    [x - 0.48, y + 0.5, z0],
                    [x - 0.48, y - 0.5, z0],
                ],
                [0.0, 0.0, -1.0],
                material.side_tile,
                0.9,
            ),
            (
                [
                    [x - 0.48, y - 0.5, z1],
                    [x - 0.48, y + 0.5, z1],
                    [x + 0.48, y + 0.5, z1],
                    [x + 0.48, y - 0.5, z1],
                ],
                [0.0, 0.0, 1.0],
                material.side_tile,
                0.8,
            ),
            (
                [
                    [x - 0.48, y + 0.5, z0],
                    [x - 0.48, y + 0.5, z1],
                    [x + 0.48, y + 0.5, z1],
                    [x + 0.48, y + 0.5, z0],
                ],
                [0.0, 1.0, 0.0],
                62,
                0.94,
            ),
            (
                [
                    [x - 0.48, y - 0.5, z1],
                    [x - 0.48, y - 0.5, z0],
                    [x + 0.48, y - 0.5, z0],
                    [x + 0.48, y - 0.5, z1],
                ],
                [0.0, -1.0, 0.0],
                62,
                0.58,
            ),
            (
                [
                    [x + 0.48, y - 0.5, z0],
                    [x + 0.48, y + 0.5, z0],
                    [x + 0.48, y + 0.5, z1],
                    [x + 0.48, y - 0.5, z1],
                ],
                [1.0, 0.0, 0.0],
                62,
                0.82,
            ),
            (
                [
                    [x - 0.48, y - 0.5, z1],
                    [x - 0.48, y + 0.5, z1],
                    [x - 0.48, y + 0.5, z0],
                    [x - 0.48, y - 0.5, z0],
                ],
                [-1.0, 0.0, 0.0],
                62,
                0.7,
            ),
        ] {
            add_quad(
                snapshot,
                registry,
                bucket,
                corners,
                normal,
                tile,
                shade,
                VertexTint::Biome,
                material.packed_emission,
                false,
            );
        }
    }
}

fn add_bed_cuboid(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    bucket: &mut LayerBucket,
    bounds: [f64; 6],
    tiles: [u16; 3],
    emission: u8,
) {
    let [x0, y0, z0, x1, y1, z1] = bounds;
    let [side, top, bottom] = tiles;
    for (corners, normal, tile, shade) in [
        (
            [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]],
            [1.0, 0.0, 0.0],
            side,
            0.82,
        ),
        (
            [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]],
            [-1.0, 0.0, 0.0],
            side,
            0.72,
        ),
        (
            [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]],
            [0.0, 1.0, 0.0],
            top,
            1.0,
        ),
        (
            [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]],
            [0.0, -1.0, 0.0],
            bottom,
            0.56,
        ),
        (
            [[x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1]],
            [0.0, 0.0, 1.0],
            side,
            0.88,
        ),
        (
            [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]],
            [0.0, 0.0, -1.0],
            side,
            0.76,
        ),
    ] {
        add_quad(
            snapshot,
            registry,
            bucket,
            corners,
            normal,
            tile,
            shade,
            VertexTint::Fixed([1.0; 3]),
            emission,
            false,
        );
    }
}

fn emit_bed(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    buckets: &mut [LayerBucket; 7],
    cell: [i32; 3],
    _block_id: u16,
    material: RenderMaterial,
) {
    let [x, y, z] = cell.map(f64::from);
    let bucket = &mut buckets[material.layer as usize];
    add_bed_cuboid(
        snapshot,
        registry,
        bucket,
        [x - 0.45, y - 0.5, z - 0.45, x + 0.45, y - 0.31, z + 0.45],
        [62, 11, 11],
        material.packed_emission,
    );
    add_bed_cuboid(
        snapshot,
        registry,
        bucket,
        [x - 0.46, y - 0.3, z - 0.46, x + 0.46, y + 0.04, z + 0.46],
        [63; 3],
        material.packed_emission,
    );
    let head = matches!(material.shape_variant, 41 | 43 | 45 | 47);
    if !head {
        return;
    }
    let direction = match material.shape_variant {
        40 | 41 => [0, -1],
        42 | 43 => [0, 1],
        44 | 45 => [1, 0],
        _ => [-1, 0],
    };
    let [dx, dz] = direction;
    let pillow_x0 = if dx > 0 {
        x + 0.08
    } else if dx < 0 {
        x - 0.39
    } else {
        x - 0.34
    };
    let pillow_x1 = if dx > 0 {
        x + 0.39
    } else if dx < 0 {
        x - 0.08
    } else {
        x + 0.34
    };
    let pillow_z0 = if dz > 0 {
        z + 0.08
    } else if dz < 0 {
        z - 0.39
    } else {
        z - 0.34
    };
    let pillow_z1 = if dz > 0 {
        z + 0.39
    } else if dz < 0 {
        z - 0.08
    } else {
        z + 0.34
    };
    add_quad(
        snapshot,
        registry,
        bucket,
        [
            [pillow_x0, y + 0.055, pillow_z0],
            [pillow_x0, y + 0.055, pillow_z1],
            [pillow_x1, y + 0.055, pillow_z1],
            [pillow_x1, y + 0.055, pillow_z0],
        ],
        [0.0, 1.0, 0.0],
        16,
        1.0,
        VertexTint::Fixed([1.0; 3]),
        material.packed_emission,
        false,
    );
    let bx0 = if dx > 0 {
        x + 0.39
    } else if dx < 0 {
        x - 0.49
    } else {
        x - 0.46
    };
    let bx1 = if dx > 0 {
        x + 0.49
    } else if dx < 0 {
        x - 0.39
    } else {
        x + 0.46
    };
    let bz0 = if dz > 0 {
        z + 0.39
    } else if dz < 0 {
        z - 0.49
    } else {
        z - 0.46
    };
    let bz1 = if dz > 0 {
        z + 0.49
    } else if dz < 0 {
        z - 0.39
    } else {
        z + 0.46
    };
    add_bed_cuboid(
        snapshot,
        registry,
        bucket,
        [bx0, y - 0.5, bz0, bx1, y + 0.31, bz1],
        [62, 62, 11],
        material.packed_emission,
    );
}

fn emit_chest(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    buckets: &mut [LayerBucket; 7],
    cell: [i32; 3],
    material: RenderMaterial,
    facing: u8,
) {
    let [x, y, z] = cell.map(f64::from);
    let right = rotate_offset(1.0, 0.0, facing);
    let same = |sign: f64| {
        let dx = (right[0] * sign) as i32;
        let dz = (right[1] * sign) as i32;
        let Some(index) = halo_cell_index_v1(cell[0] + dx, cell[1], cell[2] + dz) else {
            return false;
        };
        snapshot.streams.blocks[index] == 45 && snapshot.streams.facing[index] == facing
    };
    let left = same(-1.0);
    let right_join = same(1.0);
    let bucket = &mut buckets[material.layer as usize];
    let center = [x, z];
    add_facing_cuboid(
        snapshot,
        registry,
        bucket,
        center,
        facing,
        [
            x - if left { 0.5 } else { 0.44 },
            y - 0.5,
            z - 0.44,
            x + if right_join { 0.5 } else { 0.44 },
            y + 0.13,
            z + 0.44,
        ],
        [material.side_tile, material.top_tile, material.bottom_tile],
        VertexTint::Biome,
        material.packed_emission,
    );
    add_facing_cuboid(
        snapshot,
        registry,
        bucket,
        center,
        facing,
        [
            x - if left { 0.5 } else { 0.46 },
            y + 0.16,
            z - 0.46,
            x + if right_join { 0.5 } else { 0.46 },
            y + 0.37,
            z + 0.46,
        ],
        [material.side_tile, material.top_tile, material.bottom_tile],
        VertexTint::Biome,
        material.packed_emission,
    );
    add_facing_cuboid(
        snapshot,
        registry,
        bucket,
        center,
        facing,
        [x - 0.09, y + 0.03, z - 0.49, x + 0.09, y + 0.24, z - 0.425],
        [163; 3],
        VertexTint::Biome,
        material.packed_emission,
    );
}

fn emit_exhibit(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    buckets: &mut [LayerBucket; 7],
    cell: [i32; 3],
    block_id: u16,
    material: RenderMaterial,
) {
    for face in FACES {
        let neighbor = [
            cell[0] + face.direction[0],
            cell[1] + face.direction[1],
            cell[2] + face.direction[2],
        ];
        if material_at(snapshot, registry, neighbor).is_some_and(|(id, _)| id == block_id) {
            continue;
        }
        add_quad(
            snapshot,
            registry,
            &mut buckets[material.layer as usize],
            translated_corners(face.corners, cell, 0.0),
            face.direction.map(f64::from),
            material.top_tile,
            face.shade,
            VertexTint::Fixed([1.0; 3]),
            material.packed_emission,
            false,
        );
    }
}

fn emit_aquarium(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    buckets: &mut [LayerBucket; 7],
    cell: [i32; 3],
    block_id: u16,
) {
    let [x, y, z] = cell.map(f64::from);
    let same = |dx, dy, dz| {
        material_at(snapshot, registry, [cell[0] + dx, cell[1] + dy, cell[2] + dz])
            .is_some_and(|(id, _)| id == block_id)
    };
    for face in FACES {
        if same(face.direction[0], face.direction[1], face.direction[2]) {
            continue;
        }
        add_quad(
            snapshot,
            registry,
            &mut buckets[TerrainMeshLayerV1::Transparent as usize],
            translated_corners(face.corners, cell, 0.0),
            face.direction.map(f64::from),
            13,
            face.shade,
            VertexTint::Fixed([0.86, 1.0, 1.0]),
            0,
            false,
        );
    }
    let bounds = [
        if same(-1, 0, 0) { x - 0.5 } else { x - 0.43 },
        if same(0, -1, 0) { y - 0.5 } else { y - 0.38 },
        if same(0, 0, -1) { z - 0.5 } else { z - 0.43 },
        if same(1, 0, 0) { x + 0.5 } else { x + 0.43 },
        if same(0, 1, 0) { y + 0.5 } else { y + 0.43 },
        if same(0, 0, 1) { z + 0.5 } else { z + 0.43 },
    ];
    add_cuboid(
        snapshot,
        registry,
        &mut buckets[TerrainMeshLayerV1::Transparent as usize],
        bounds,
        [8; 3],
        VertexTint::Fixed([0.72, 0.9, 1.0]),
        0,
    );
    if !same(0, -1, 0) {
        add_cuboid(
            snapshot,
            registry,
            &mut buckets[TerrainMeshLayerV1::Opaque as usize],
            [x - 0.44, y - 0.43, z - 0.44, x + 0.44, y - 0.35, z + 0.44],
            [47; 3],
            VertexTint::Fixed([0.95, 0.92, 0.84]),
            0,
        );
        let roll = hash2(
            i64::from(snapshot.address.chunk_x) * 16 + i64::from(cell[0]),
            i64::from(snapshot.address.chunk_z) * 16 + i64::from(cell[2]),
            world_seed(snapshot) ^ 0x6ea1_25cf,
        );
        if roll > 0.66 {
            add_cuboid(
                snapshot,
                registry,
                &mut buckets[TerrainMeshLayerV1::Opaque as usize],
                [x - 0.22, y - 0.35, z + 0.1, x - 0.05, y - 0.22, z + 0.27],
                [35; 3],
                VertexTint::Biome,
                0,
            );
            add_cuboid(
                snapshot,
                registry,
                &mut buckets[TerrainMeshLayerV1::Opaque as usize],
                [x + 0.12, y - 0.35, z - 0.22, x + 0.29, y - 0.25, z - 0.05],
                [97; 3],
                VertexTint::Biome,
                0,
            );
        }
    }
}

fn emit_furnace(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    buckets: &mut [LayerBucket; 7],
    cell: [i32; 3],
    material: RenderMaterial,
    facing: u8,
) {
    let [x, y, z] = cell.map(f64::from);
    let bucket = &mut buckets[material.layer as usize];
    add_facing_cuboid_with_ambient_occlusion(
        snapshot,
        registry,
        bucket,
        [x, z],
        facing,
        [x - 0.5, y - 0.5, z - 0.5, x + 0.5, y + 0.5, z + 0.5],
        [material.bottom_tile, material.top_tile, material.bottom_tile],
        VertexTint::Biome,
        material.packed_emission,
        material.ambient_occlusion,
    );
    add_facing_cuboid_with_ambient_occlusion(
        snapshot,
        registry,
        bucket,
        [x, z],
        facing,
        [x - 0.43, y - 0.4, z - 0.506, x + 0.43, y + 0.4, z - 0.499],
        [material.side_tile; 3],
        VertexTint::Biome,
        material.packed_emission,
        material.ambient_occlusion,
    );
}

fn emit_authored_shape(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    buckets: &mut [LayerBucket; 7],
    cell: [i32; 3],
    _block_id: u16,
    material: RenderMaterial,
    facing: u8,
) {
    let [x, y, z] = cell.map(f64::from);
    let center = [x, z];
    let tiles = [material.side_tile, material.top_tile, material.bottom_tile];
    let tint = material_tint(material);
    let emission = material.packed_emission;
    match material.shape {
        CanonicalShapeV1::Table => {
            let bucket = &mut buckets[material.layer as usize];
            add_facing_cuboid(
                snapshot,
                registry,
                bucket,
                center,
                facing,
                [x - 0.48, y + 0.22, z - 0.42, x + 0.48, y + 0.42, z + 0.42],
                tiles,
                tint,
                emission,
            );
            for [dx, dz] in [[-0.4, -0.34], [0.28, -0.34], [-0.4, 0.22], [0.28, 0.22]] {
                add_facing_cuboid(
                    snapshot,
                    registry,
                    bucket,
                    center,
                    facing,
                    [x + dx, y - 0.5, z + dz, x + dx + 0.12, y + 0.23, z + dz + 0.12],
                    tiles,
                    tint,
                    emission,
                );
            }
        }
        CanonicalShapeV1::Stool => {
            let bucket = &mut buckets[material.layer as usize];
            add_cuboid(
                snapshot,
                registry,
                bucket,
                [x - 0.34, y - 0.03, z - 0.34, x + 0.34, y + 0.14, z + 0.34],
                tiles,
                tint,
                emission,
            );
            for [dx, dz] in [[-0.27, -0.27], [0.17, -0.27], [-0.27, 0.17], [0.17, 0.17]] {
                add_cuboid(
                    snapshot,
                    registry,
                    bucket,
                    [x + dx, y - 0.5, z + dz, x + dx + 0.1, y - 0.02, z + dz + 0.1],
                    tiles,
                    tint,
                    emission,
                );
            }
        }
        CanonicalShapeV1::Shelf => {
            let bucket = &mut buckets[material.layer as usize];
            for post_x in [x - 0.47, x + 0.35] {
                add_facing_cuboid(
                    snapshot,
                    registry,
                    bucket,
                    center,
                    facing,
                    [post_x, y - 0.5, z - 0.18, post_x + 0.12, y + 0.48, z + 0.18],
                    tiles,
                    tint,
                    emission,
                );
            }
            for shelf_y in [y - 0.42, y - 0.02, y + 0.38] {
                add_facing_cuboid(
                    snapshot,
                    registry,
                    bucket,
                    center,
                    facing,
                    [x - 0.47, shelf_y, z - 0.2, x + 0.47, shelf_y + 0.1, z + 0.2],
                    tiles,
                    tint,
                    emission,
                );
            }
        }
        CanonicalShapeV1::Barrel => {
            let bucket = &mut buckets[material.layer as usize];
            add_cuboid(
                snapshot,
                registry,
                bucket,
                [x - 0.4, y - 0.48, z - 0.4, x + 0.4, y + 0.46, z + 0.4],
                tiles,
                tint,
                emission,
            );
            for ring in [y - 0.32, y + 0.26] {
                add_cuboid(
                    snapshot,
                    registry,
                    bucket,
                    [x - 0.44, ring, z - 0.44, x + 0.44, ring + 0.08, z + 0.44],
                    [97; 3],
                    VertexTint::Fixed([0.82, 0.75, 0.6]),
                    emission,
                );
            }
        }
        CanonicalShapeV1::Chair => {
            let bucket = &mut buckets[material.layer as usize];
            let wood = [11; 3];
            add_facing_cuboid(
                snapshot,
                registry,
                bucket,
                center,
                facing,
                [x - 0.37, y - 0.08, z - 0.34, x + 0.37, y + 0.08, z + 0.34],
                wood,
                tint,
                emission,
            );
            for [dx, dz] in [[-0.32, -0.29], [0.22, -0.29], [-0.32, 0.19], [0.22, 0.19]] {
                add_facing_cuboid(
                    snapshot,
                    registry,
                    bucket,
                    center,
                    facing,
                    [x + dx, y - 0.5, z + dz, x + dx + 0.1, y - 0.07, z + dz + 0.1],
                    wood,
                    tint,
                    emission,
                );
            }
            add_facing_cuboid(
                snapshot,
                registry,
                bucket,
                center,
                facing,
                [x - 0.37, y + 0.08, z + 0.24, x + 0.37, y + 0.48, z + 0.36],
                wood,
                tint,
                emission,
            );
        }
        CanonicalShapeV1::Apiary => {
            let bucket = &mut buckets[material.layer as usize];
            add_facing_cuboid(
                snapshot,
                registry,
                bucket,
                center,
                facing,
                [x - 0.4, y - 0.46, z - 0.36, x + 0.4, y + 0.18, z + 0.36],
                tiles,
                tint,
                emission,
            );
            add_facing_cuboid(
                snapshot,
                registry,
                bucket,
                center,
                facing,
                [x - 0.46, y + 0.18, z - 0.42, x + 0.46, y + 0.36, z + 0.42],
                [material.top_tile, material.top_tile, material.side_tile],
                tint,
                emission,
            );
            add_facing_cuboid(
                snapshot,
                registry,
                bucket,
                center,
                facing,
                [x - 0.13, y - 0.06, z - 0.405, x + 0.13, y + 0.13, z - 0.355],
                [92; 3],
                VertexTint::Fixed([1.0; 3]),
                emission,
            );
        }
        CanonicalShapeV1::WildHive => {
            let bucket = &mut buckets[material.layer as usize];
            for bounds in [
                [x - 0.35, y - 0.46, z - 0.35, x + 0.35, y - 0.17, z + 0.35],
                [x - 0.45, y - 0.17, z - 0.42, x + 0.45, y + 0.16, z + 0.42],
                [x - 0.33, y + 0.16, z - 0.32, x + 0.33, y + 0.42, z + 0.32],
            ] {
                add_facing_cuboid(
                    snapshot, registry, bucket, center, facing, bounds, tiles, tint, emission,
                );
            }
            add_facing_cuboid(
                snapshot,
                registry,
                bucket,
                center,
                facing,
                [x - 0.11, y - 0.03, z - 0.455, x + 0.11, y + 0.13, z - 0.405],
                [94; 3],
                VertexTint::Fixed([0.55, 0.48, 0.4]),
                emission,
            );
        }
        CanonicalShapeV1::Cartography => {
            let bucket = &mut buckets[material.layer as usize];
            add_facing_cuboid(
                snapshot,
                registry,
                bucket,
                center,
                facing,
                [x - 0.5, y + 0.21, z - 0.5, x + 0.5, y + 0.45, z + 0.5],
                tiles,
                tint,
                emission,
            );
            for [dx, dz] in [[-0.42, -0.42], [0.28, -0.42], [-0.42, 0.28], [0.28, 0.28]] {
                add_facing_cuboid(
                    snapshot,
                    registry,
                    bucket,
                    center,
                    facing,
                    [x + dx, y - 0.5, z + dz, x + dx + 0.14, y + 0.22, z + dz + 0.14],
                    tiles,
                    tint,
                    emission,
                );
            }
        }
        CanonicalShapeV1::Distillery => {
            let bucket = &mut buckets[material.layer as usize];
            add_facing_cuboid(
                snapshot,
                registry,
                bucket,
                center,
                facing,
                [x - 0.42, y - 0.48, z - 0.4, x + 0.42, y + 0.3, z + 0.4],
                [91, 92, 11],
                tint,
                emission,
            );
            for ring in [y - 0.28, y + 0.12] {
                add_facing_cuboid(
                    snapshot,
                    registry,
                    bucket,
                    center,
                    facing,
                    [x - 0.45, ring, z - 0.43, x + 0.45, ring + 0.08, z + 0.43],
                    [97; 3],
                    VertexTint::Fixed([0.86, 0.74, 0.5]),
                    emission,
                );
            }
            add_facing_cuboid(
                snapshot,
                registry,
                bucket,
                center,
                facing,
                [x - 0.07, y - 0.03, z - 0.5, x + 0.07, y + 0.12, z - 0.39],
                [97; 3],
                VertexTint::Fixed([0.9, 0.75, 0.45]),
                emission,
            );
            add_facing_cuboid(
                snapshot,
                registry,
                bucket,
                center,
                facing,
                [x - 0.13, y + 0.3, z - 0.13, x + 0.13, y + 0.49, z + 0.13],
                [91, 92, 11],
                tint,
                emission,
            );
        }
        CanonicalShapeV1::DragonEgg => {
            let bucket = &mut buckets[material.layer as usize];
            let egg = [material.side_tile; 3];
            for bounds in [
                [x - 0.2, y - 0.5, z - 0.2, x + 0.2, y - 0.44, z + 0.2],
                [x - 0.3, y - 0.44, z - 0.3, x + 0.3, y - 0.2, z + 0.3],
                [x - 0.34, y - 0.2, z - 0.34, x + 0.34, y + 0.14, z + 0.34],
                [x - 0.27, y + 0.14, z - 0.27, x + 0.27, y + 0.34, z + 0.27],
                [x - 0.16, y + 0.34, z - 0.16, x + 0.16, y + 0.46, z + 0.16],
            ] {
                add_cuboid(
                    snapshot,
                    registry,
                    bucket,
                    bounds,
                    egg,
                    VertexTint::Fixed([1.0; 3]),
                    emission,
                );
            }
        }
        CanonicalShapeV1::Fireplace => emit_fireplace(snapshot, registry, buckets, [x, y, z], facing, emission),
        CanonicalShapeV1::Alchemy => emit_alchemy(snapshot, registry, buckets, [x, y, z], facing, emission),
        CanonicalShapeV1::Wayshrine => emit_wayshrine(snapshot, registry, buckets, [x, y, z], facing, emission),
        CanonicalShapeV1::Sugarworks => emit_sugarworks(snapshot, registry, buckets, [x, y, z], facing, emission),
        CanonicalShapeV1::LightningBugJar => emit_lightning_jar(snapshot, registry, buckets, [x, y, z], emission),
        CanonicalShapeV1::Incubator => emit_incubator(snapshot, registry, buckets, [x, y, z], facing, emission),
        CanonicalShapeV1::MorphLoom => emit_morph_loom(snapshot, registry, buckets, [x, y, z], emission),
        CanonicalShapeV1::GoldPile => emit_gold_pile(snapshot, registry, buckets, [x, y, z], emission),
        CanonicalShapeV1::ArchiveShelf => emit_archive_shelf(
            snapshot,
            registry,
            buckets,
            [x, y, z],
            material.shape_variant,
            facing,
            emission,
        ),
        CanonicalShapeV1::TomeDisplay => emit_tome_display(snapshot, registry, buckets, [x, y, z], facing, emission),
        CanonicalShapeV1::OrbRack => {
            emit_orb_rack(snapshot, registry, buckets, cell, [x, y, z], facing, material, emission)
        }
        CanonicalShapeV1::OrbHealer => {
            emit_orb_healer(snapshot, registry, buckets, [x, y, z], facing, material, emission)
        }
        _ => unreachable!("all non-generic catalog shapes have an authored emitter"),
    }
}

fn emit_fireplace(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    buckets: &mut [LayerBucket; 7],
    p: [f64; 3],
    facing: u8,
    emission: u8,
) {
    let [x, y, z] = p;
    let bucket = &mut buckets[TerrainMeshLayerV1::Opaque as usize];
    let center = [x, z];
    add_facing_cuboid(
        snapshot,
        registry,
        bucket,
        center,
        facing,
        [x - 0.48, y - 0.5, z - 0.38, x + 0.48, y - 0.34, z + 0.38],
        [12, 12, 3],
        VertexTint::Biome,
        emission,
    );
    for bounds in [
        [x - 0.48, y - 0.34, z - 0.34, x - 0.31, y + 0.34, z + 0.34],
        [x + 0.31, y - 0.34, z - 0.34, x + 0.48, y + 0.34, z + 0.34],
        [x - 0.5, y + 0.31, z - 0.4, x + 0.5, y + 0.48, z + 0.4],
    ] {
        add_facing_cuboid(
            snapshot,
            registry,
            bucket,
            center,
            facing,
            bounds,
            [12; 3],
            VertexTint::Biome,
            emission,
        );
    }
    add_facing_cuboid(
        snapshot,
        registry,
        bucket,
        center,
        facing,
        [x - 0.3, y - 0.31, z + 0.245, x + 0.3, y + 0.3, z + 0.35],
        [49; 3],
        VertexTint::Fixed([0.48, 0.43, 0.4]),
        emission,
    );
    for bar in [-0.25, -0.08, 0.09, 0.26] {
        add_facing_cuboid(
            snapshot,
            registry,
            bucket,
            center,
            facing,
            [x + bar - 0.025, y - 0.3, z - 0.23, x + bar + 0.025, y - 0.17, z + 0.24],
            [97; 3],
            VertexTint::Fixed([0.52, 0.49, 0.45]),
            emission,
        );
    }
    for [offset, lift] in [[-0.1, 0.0], [0.1, 0.025]] {
        add_facing_cuboid(
            snapshot,
            registry,
            bucket,
            center,
            facing,
            [
                x - 0.27,
                y - 0.25 + lift,
                z + offset - 0.05,
                x + 0.27,
                y - 0.15 + lift,
                z + offset + 0.05,
            ],
            [11; 3],
            VertexTint::Fixed([0.5, 0.32, 0.22]),
            emission,
        );
    }
}

fn emit_alchemy(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    buckets: &mut [LayerBucket; 7],
    p: [f64; 3],
    facing: u8,
    emission: u8,
) {
    let [x, y, z] = p;
    let center = [x, z];
    {
        let bucket = &mut buckets[TerrainMeshLayerV1::Cutout as usize];
        add_facing_cuboid(
            snapshot,
            registry,
            bucket,
            center,
            facing,
            [x - 0.42, y - 0.5, z - 0.42, x + 0.42, y - 0.36, z + 0.42],
            [98, 98, 3],
            VertexTint::Biome,
            emission,
        );
        add_facing_cuboid(
            snapshot,
            registry,
            bucket,
            center,
            facing,
            [x - 0.09, y - 0.36, z - 0.09, x + 0.09, y + 0.33, z + 0.09],
            [98; 3],
            VertexTint::Biome,
            emission,
        );
        add_facing_cuboid(
            snapshot,
            registry,
            bucket,
            center,
            facing,
            [x - 0.38, y + 0.18, z - 0.08, x + 0.38, y + 0.3, z + 0.08],
            [98; 3],
            VertexTint::Biome,
            emission,
        );
    }
    let bucket = &mut buckets[TerrainMeshLayerV1::Emissive as usize];
    for vial_x in [x - 0.29, x, x + 0.29] {
        add_facing_cuboid(
            snapshot,
            registry,
            bucket,
            center,
            facing,
            [vial_x - 0.09, y - 0.1, z - 0.11, vial_x + 0.09, y + 0.17, z + 0.11],
            [98; 3],
            VertexTint::Fixed([1.0; 3]),
            emission,
        );
    }
}

fn emit_wayshrine(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    buckets: &mut [LayerBucket; 7],
    p: [f64; 3],
    facing: u8,
    emission: u8,
) {
    let [x, y, z] = p;
    let center = [x, z];
    {
        let bucket = &mut buckets[TerrainMeshLayerV1::Opaque as usize];
        add_facing_cuboid(
            snapshot,
            registry,
            bucket,
            center,
            facing,
            [x - 0.46, y - 0.5, z - 0.46, x + 0.46, y - 0.28, z + 0.46],
            [97, 97, 3],
            VertexTint::Fixed([0.82, 0.9, 0.88]),
            emission,
        );
        add_facing_cuboid(
            snapshot,
            registry,
            bucket,
            center,
            facing,
            [x - 0.27, y - 0.28, z - 0.22, x + 0.27, y + 0.34, z + 0.22],
            [99; 3],
            VertexTint::Fixed([0.72, 0.82, 0.8]),
            emission,
        );
        add_facing_cuboid(
            snapshot,
            registry,
            bucket,
            center,
            facing,
            [x - 0.36, y + 0.34, z - 0.3, x + 0.36, y + 0.48, z + 0.3],
            [97, 99, 97],
            VertexTint::Fixed([0.86, 0.92, 0.9]),
            emission,
        );
    }
    add_facing_cuboid(
        snapshot,
        registry,
        &mut buckets[TerrainMeshLayerV1::Emissive as usize],
        center,
        facing,
        [x - 0.12, y - 0.04, z - 0.235, x + 0.12, y + 0.22, z - 0.205],
        [99; 3],
        VertexTint::Fixed([1.0; 3]),
        emission,
    );
}

fn emit_sugarworks(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    buckets: &mut [LayerBucket; 7],
    p: [f64; 3],
    facing: u8,
    emission: u8,
) {
    let [x, y, z] = p;
    let center = [x, z];
    {
        let bucket = &mut buckets[TerrainMeshLayerV1::Cutout as usize];
        add_facing_cuboid(
            snapshot,
            registry,
            bucket,
            center,
            facing,
            [x - 0.47, y - 0.5, z - 0.43, x + 0.47, y - 0.35, z + 0.43],
            [143, 143, 135],
            VertexTint::Biome,
            emission,
        );
        add_facing_cuboid(
            snapshot,
            registry,
            bucket,
            center,
            facing,
            [x - 0.4, y - 0.35, z - 0.36, x + 0.4, y + 0.18, z + 0.36],
            [143, 143, 135],
            VertexTint::Biome,
            emission,
        );
        add_facing_cuboid(
            snapshot,
            registry,
            bucket,
            center,
            facing,
            [x - 0.34, y + 0.18, z - 0.31, x + 0.34, y + 0.31, z + 0.31],
            [143; 3],
            VertexTint::Fixed([1.0; 3]),
            emission,
        );
        for post_x in [x - 0.24, x + 0.13] {
            add_facing_cuboid(
                snapshot,
                registry,
                bucket,
                center,
                facing,
                [post_x, y - 0.09, z - 0.5, post_x + 0.11, y + 0.39, z - 0.35],
                [143; 3],
                VertexTint::Fixed([1.0; 3]),
                emission,
            );
        }
    }
    add_facing_cuboid(
        snapshot,
        registry,
        &mut buckets[TerrainMeshLayerV1::Transparent as usize],
        center,
        facing,
        [x - 0.22, y + 0.29, z - 0.22, x + 0.22, y + 0.35, z + 0.22],
        [136; 3],
        VertexTint::Fixed([1.0; 3]),
        emission,
    );
    add_facing_cuboid(
        snapshot,
        registry,
        &mut buckets[TerrainMeshLayerV1::Emissive as usize],
        center,
        facing,
        [x + 0.24, y + 0.31, z - 0.08, x + 0.32, y + 0.48, z + 0.08],
        [143; 3],
        VertexTint::Fixed([1.0; 3]),
        emission,
    );
}

fn emit_lightning_jar(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    buckets: &mut [LayerBucket; 7],
    p: [f64; 3],
    emission: u8,
) {
    let [x, y, z] = p;
    {
        let bucket = &mut buckets[TerrainMeshLayerV1::Cutout as usize];
        add_cuboid(
            snapshot,
            registry,
            bucket,
            [x - 0.24, y - 0.5, z - 0.24, x + 0.24, y - 0.42, z + 0.24],
            [41; 3],
            VertexTint::Fixed([0.72, 0.58, 0.32]),
            emission,
        );
        add_cuboid(
            snapshot,
            registry,
            bucket,
            [x - 0.26, y + 0.08, z - 0.26, x + 0.26, y + 0.18, z + 0.26],
            [41; 3],
            VertexTint::Fixed([0.78, 0.56, 0.25]),
            emission,
        );
    }
    {
        let bucket = &mut buckets[TerrainMeshLayerV1::Transparent as usize];
        for pane_x in [x - 0.235, x + 0.205] {
            add_cuboid(
                snapshot,
                registry,
                bucket,
                [pane_x, y - 0.42, z - 0.22, pane_x + 0.03, y + 0.08, z + 0.22],
                [12; 3],
                VertexTint::Fixed([0.82, 1.0, 0.92]),
                emission,
            );
        }
        for pane_z in [z - 0.235, z + 0.205] {
            add_cuboid(
                snapshot,
                registry,
                bucket,
                [x - 0.22, y - 0.42, pane_z, x + 0.22, y + 0.08, pane_z + 0.03],
                [12; 3],
                VertexTint::Fixed([0.82, 1.0, 0.92]),
                emission,
            );
        }
    }
    let bucket = &mut buckets[TerrainMeshLayerV1::Emissive as usize];
    add_cuboid(
        snapshot,
        registry,
        bucket,
        [x - 0.07, y - 0.2, z - 0.04, x + 0.07, y - 0.05, z + 0.1],
        [13; 3],
        VertexTint::Fixed([0.84, 1.0, 0.32]),
        emission,
    );
    add_cuboid(
        snapshot,
        registry,
        bucket,
        [x - 0.18, y - 0.14, z - 0.02, x - 0.04, y - 0.11, z + 0.08],
        [13; 3],
        VertexTint::Fixed([0.72, 0.92, 0.44]),
        emission,
    );
    add_cuboid(
        snapshot,
        registry,
        bucket,
        [x + 0.04, y - 0.14, z - 0.02, x + 0.18, y - 0.11, z + 0.08],
        [13; 3],
        VertexTint::Fixed([0.72, 0.92, 0.44]),
        emission,
    );
}

fn emit_incubator(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    buckets: &mut [LayerBucket; 7],
    p: [f64; 3],
    facing: u8,
    emission: u8,
) {
    let [x, y, z] = p;
    let center = [x, z];
    {
        let bucket = &mut buckets[TerrainMeshLayerV1::Emissive as usize];
        add_facing_cuboid(
            snapshot,
            registry,
            bucket,
            center,
            facing,
            [x - 0.48, y - 0.5, z - 0.48, x + 0.48, y - 0.31, z + 0.48],
            [50, 51, 43],
            VertexTint::Fixed([1.0; 3]),
            emission,
        );
        for [dx, dz] in [[-0.43, -0.43], [0.31, -0.43], [-0.43, 0.31], [0.31, 0.31]] {
            add_facing_cuboid(
                snapshot,
                registry,
                bucket,
                center,
                facing,
                [x + dx, y - 0.31, z + dz, x + dx + 0.12, y + 0.37, z + dz + 0.12],
                [50, 50, 43],
                VertexTint::Fixed([1.0; 3]),
                emission,
            );
        }
        add_facing_cuboid(
            snapshot,
            registry,
            bucket,
            center,
            facing,
            [x - 0.16, y - 0.18, z - 0.16, x + 0.16, y + 0.15, z + 0.16],
            [51; 3],
            VertexTint::Fixed([1.0; 3]),
            emission,
        );
        add_facing_cuboid(
            snapshot,
            registry,
            bucket,
            center,
            facing,
            [x - 0.43, y + 0.34, z - 0.43, x + 0.43, y + 0.47, z + 0.43],
            [50, 51, 43],
            VertexTint::Fixed([1.0; 3]),
            emission,
        );
    }
    add_facing_cuboid(
        snapshot,
        registry,
        &mut buckets[TerrainMeshLayerV1::Transparent as usize],
        center,
        facing,
        [x - 0.34, y - 0.27, z - 0.34, x + 0.34, y + 0.3, z + 0.34],
        [13; 3],
        VertexTint::Fixed([1.0; 3]),
        emission,
    );
}

fn emit_morph_loom(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    buckets: &mut [LayerBucket; 7],
    p: [f64; 3],
    emission: u8,
) {
    let [x, y, z] = p;
    {
        let bucket = &mut buckets[TerrainMeshLayerV1::Opaque as usize];
        add_cuboid(
            snapshot,
            registry,
            bucket,
            [x - 0.47, y - 0.5, z - 0.43, x + 0.47, y - 0.33, z + 0.43],
            [210; 3],
            VertexTint::Fixed([0.82, 0.8, 0.78]),
            emission,
        );
        add_cuboid(
            snapshot,
            registry,
            bucket,
            [x - 0.37, y - 0.33, z - 0.32, x + 0.37, y - 0.21, z + 0.32],
            [127, 127, 11],
            VertexTint::Fixed([0.84, 0.76, 0.64]),
            emission,
        );
        for post_x in [x - 0.38, x + 0.28] {
            add_cuboid(
                snapshot,
                registry,
                bucket,
                [post_x, y - 0.27, z - 0.14, post_x + 0.1, y + 0.35, z + 0.14],
                [211, 211, 210],
                VertexTint::Fixed([0.9, 0.82, 0.65]),
                emission,
            );
        }
        add_cuboid(
            snapshot,
            registry,
            bucket,
            [x - 0.34, y + 0.27, z - 0.12, x + 0.34, y + 0.38, z + 0.12],
            [211, 211, 210],
            VertexTint::Fixed([0.92, 0.84, 0.66]),
            emission,
        );
        add_cuboid(
            snapshot,
            registry,
            bucket,
            [x - 0.18, y - 0.19, z - 0.18, x + 0.18, y - 0.13, z + 0.18],
            [211, 211, 210],
            VertexTint::Fixed([0.88, 0.78, 0.58]),
            emission,
        );
        for post_x in [x - 0.21, x + 0.15] {
            add_cuboid(
                snapshot,
                registry,
                bucket,
                [post_x, y - 0.13, z - 0.19, post_x + 0.06, y + 0.05, z + 0.19],
                [211, 211, 210],
                VertexTint::Fixed([0.88, 0.78, 0.58]),
                emission,
            );
        }
    }
    add_cuboid(
        snapshot,
        registry,
        &mut buckets[TerrainMeshLayerV1::Transparent as usize],
        [x - 0.26, y - 0.08, z - 0.23, x + 0.26, y + 0.27, z + 0.23],
        [13; 3],
        VertexTint::Fixed([0.7, 0.92, 0.9]),
        emission,
    );
    add_cuboid(
        snapshot,
        registry,
        &mut buckets[TerrainMeshLayerV1::Emissive as usize],
        [x - 0.055, y + 0.34, z - 0.055, x + 0.055, y + 0.48, z + 0.055],
        [51; 3],
        VertexTint::Fixed([0.7, 1.0, 0.98]),
        emission,
    );
}

fn emit_gold_pile(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    buckets: &mut [LayerBucket; 7],
    p: [f64; 3],
    emission: u8,
) {
    let [x, y, z] = p;
    let bucket = &mut buckets[TerrainMeshLayerV1::Cutout as usize];
    let ingots = [
        [-0.43, -0.34, -0.08, -0.12, 0.0],
        [-0.04, -0.38, 0.34, -0.16, 0.0],
        [0.12, 0.08, 0.43, 0.31, 0.0],
        [-0.35, 0.12, -0.02, 0.35, 0.0],
        [-0.16, -0.09, 0.2, 0.13, 1.0],
        [0.03, -0.27, 0.33, -0.07, 1.0],
    ];
    for (index, [x0, z0, x1, z1, level]) in ingots.into_iter().enumerate() {
        let bottom = y - 0.5 + level * 0.105;
        add_cuboid(
            snapshot,
            registry,
            bucket,
            [x + x0, bottom, z + z0, x + x1, bottom + 0.095, z + z1],
            [163; 3],
            if index % 2 == 1 {
                VertexTint::Fixed([1.0, 0.92, 0.62])
            } else {
                VertexTint::Fixed([1.0; 3])
            },
            emission,
        );
    }
    for (stack, [dx, dz, count]) in [
        [-0.29, -0.02, 3.0],
        [-0.1, 0.26, 5.0],
        [0.3, -0.04, 4.0],
        [0.23, 0.29, 2.0],
        [-0.38, -0.28, 2.0],
    ]
    .into_iter()
    .enumerate()
    {
        for coin in 0..count as usize {
            let offset = if (coin + stack) % 2 != 0 { 0.012 } else { -0.008 };
            let bottom = y - 0.5 + coin as f64 * 0.045;
            add_cuboid(
                snapshot,
                registry,
                bucket,
                [
                    x + dx - 0.075 + offset,
                    bottom,
                    z + dz - 0.075,
                    x + dx + 0.075 + offset,
                    bottom + 0.04,
                    z + dz + 0.075,
                ],
                [164, 164, 163],
                VertexTint::Fixed([1.0; 3]),
                emission,
            );
        }
    }
    let jewels = [
        [-0.2, -0.22, -0.22, 1.0, 0.45, 0.56],
        [0.07, -0.12, 0.03, 0.48, 1.0, 0.94],
        [0.3, -0.28, 0.2, 0.72, 0.58, 1.0],
    ];
    for (index, [dx, dy, dz, r, g, b]) in jewels.into_iter().enumerate() {
        add_cuboid(
            snapshot,
            registry,
            &mut buckets[TerrainMeshLayerV1::Emissive as usize],
            [
                x + dx - 0.055,
                y + dy - 0.055,
                z + dz - 0.055,
                x + dx + 0.055,
                y + dy + 0.055,
                z + dz + 0.055,
            ],
            [165; 3],
            VertexTint::Fixed([r, g, b]),
            emission,
        );
        if index == 1 {
            add_cuboid(
                snapshot,
                registry,
                &mut buckets[TerrainMeshLayerV1::Cutout as usize],
                [
                    x + dx - 0.09,
                    y + dy - 0.07,
                    z + dz - 0.09,
                    x + dx + 0.09,
                    y + dy - 0.045,
                    z + dz + 0.09,
                ],
                [163; 3],
                VertexTint::Fixed([1.0; 3]),
                emission,
            );
        }
    }
}

fn emit_archive_shelf(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    buckets: &mut [LayerBucket; 7],
    p: [f64; 3],
    shape_variant: u16,
    facing: u8,
    emission: u8,
) {
    let [x, y, z] = p;
    let center = [x, z];
    let bucket = &mut buckets[TerrainMeshLayerV1::Cutout as usize];
    for post_x in [x - 0.48, x + 0.36] {
        add_facing_cuboid(
            snapshot,
            registry,
            bucket,
            center,
            facing,
            [post_x, y - 0.5, z - 0.22, post_x + 0.12, y + 0.48, z + 0.22],
            [127, 127, 11],
            VertexTint::Biome,
            emission,
        );
    }
    for shelf_y in [y - 0.45, y - 0.03, y + 0.39] {
        add_facing_cuboid(
            snapshot,
            registry,
            bucket,
            center,
            facing,
            [x - 0.48, shelf_y, z - 0.24, x + 0.48, shelf_y + 0.1, z + 0.24],
            [127, 127, 11],
            VertexTint::Biome,
            emission,
        );
    }
    let count = match shape_variant {
        51..=56 => usize::from(shape_variant - 50),
        _ => 0,
    };
    for index in 0..count {
        let tier = index / 3;
        let book_x = x - 0.34 + (index % 3) as f64 * 0.27;
        let tile = [45, 48, 35][index % 3];
        let base = y - 0.34 + tier as f64 * 0.42;
        add_facing_cuboid(
            snapshot,
            registry,
            bucket,
            center,
            facing,
            [book_x, base, z - 0.27, book_x + 0.17, base + 0.29, z - 0.08],
            [tile; 3],
            VertexTint::Fixed([1.0; 3]),
            emission,
        );
    }
}

fn emit_tome_display(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    buckets: &mut [LayerBucket; 7],
    p: [f64; 3],
    facing: u8,
    emission: u8,
) {
    let [x, y, z] = p;
    let center = [x, z];
    let bucket = &mut buckets[TerrainMeshLayerV1::Cutout as usize];
    for (bounds, tiles) in [
        ([x - 0.4, y - 0.5, z - 0.35, x + 0.4, y - 0.37, z + 0.35], [11; 3]),
        (
            [x - 0.3, y - 0.37, z - 0.25, x + 0.3, y - 0.3, z + 0.25],
            [127, 127, 11],
        ),
        ([x - 0.1, y - 0.3, z - 0.1, x + 0.1, y + 0.08, z + 0.1], [127, 127, 11]),
        (
            [x - 0.35, y + 0.06, z - 0.26, x + 0.35, y + 0.16, z + 0.26],
            [127, 127, 11],
        ),
        (
            [x - 0.37, y + 0.14, z + 0.2, x + 0.37, y + 0.23, z + 0.29],
            [127, 127, 11],
        ),
    ] {
        add_facing_cuboid(
            snapshot,
            registry,
            bucket,
            center,
            facing,
            bounds,
            tiles,
            VertexTint::Biome,
            emission,
        );
    }
    for finial in [x - 0.34, x + 0.29] {
        add_facing_cuboid(
            snapshot,
            registry,
            bucket,
            center,
            facing,
            [finial, y + 0.21, z + 0.2, finial + 0.05, y + 0.31, z + 0.27],
            [163; 3],
            VertexTint::Fixed([0.9, 0.82, 0.58]),
            emission,
        );
    }
}

// Rack joins need the world cell identity in addition to the normal authored
// material tuple, keeping neighbor-dependent geometry explicit and deterministic.
#[allow(clippy::too_many_arguments)]
fn emit_orb_rack(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    buckets: &mut [LayerBucket; 7],
    cell: [i32; 3],
    p: [f64; 3],
    facing: u8,
    material: RenderMaterial,
    emission: u8,
) {
    let [x, y, z] = p;
    let center = [x, z];
    let right = rotate_offset(1.0, 0.0, facing);
    let same = |dx: i32, dy: i32, dz: i32| {
        let Some(index) = halo_cell_index_v1(cell[0] + dx, cell[1] + dy, cell[2] + dz) else {
            return false;
        };
        snapshot.streams.blocks[index] == 241 && snapshot.streams.facing[index] == facing
    };
    let left = same(-(right[0] as i32), 0, -(right[1] as i32));
    let right_join = same(right[0] as i32, 0, right[1] as i32);
    let below = same(0, -1, 0);
    let above = same(0, 1, 0);
    let x0 = x - if left { 0.5 } else { 0.43 };
    let x1 = x + if right_join { 0.5 } else { 0.43 };
    let tiles = [material.side_tile, material.top_tile, material.bottom_tile];
    let bucket = &mut buckets[material.layer as usize];
    if !below {
        add_facing_cuboid(
            snapshot,
            registry,
            bucket,
            center,
            facing,
            [x0, y - 0.48, z - 0.38, x1, y - 0.34, z + 0.38],
            tiles,
            VertexTint::Biome,
            emission,
        );
    }
    let post_bottom = if below { y - 0.5 } else { y - 0.34 };
    let post_top = if above { y + 0.5 } else { y + 0.42 };
    if !left {
        add_facing_cuboid(
            snapshot,
            registry,
            bucket,
            center,
            facing,
            [x - 0.43, post_bottom, z - 0.11, x - 0.34, post_top, z + 0.11],
            tiles,
            VertexTint::Biome,
            emission,
        );
    }
    if !right_join {
        add_facing_cuboid(
            snapshot,
            registry,
            bucket,
            center,
            facing,
            [x + 0.34, post_bottom, z - 0.11, x + 0.43, post_top, z + 0.11],
            tiles,
            VertexTint::Biome,
            emission,
        );
    }
    for rail in [y - 0.17, y + 0.18] {
        add_facing_cuboid(
            snapshot,
            registry,
            bucket,
            center,
            facing,
            [x0, rail - 0.045, z - 0.13, x1, rail + 0.045, z + 0.13],
            tiles,
            VertexTint::Biome,
            emission,
        );
    }
    if !above {
        add_facing_cuboid(
            snapshot,
            registry,
            bucket,
            center,
            facing,
            [x0, y + 0.38, z - 0.14, x1, y + 0.46, z + 0.14],
            tiles,
            VertexTint::Biome,
            emission,
        );
    }
    for socket_y in [y - 0.1, y + 0.25] {
        for socket_x in [x - 0.27, x - 0.09, x + 0.09, x + 0.27] {
            for bounds in [
                [
                    socket_x - 0.065,
                    socket_y - 0.025,
                    z - 0.11,
                    socket_x + 0.065,
                    socket_y + 0.01,
                    z + 0.11,
                ],
                [
                    socket_x - 0.075,
                    socket_y,
                    z - 0.12,
                    socket_x - 0.045,
                    socket_y + 0.055,
                    z + 0.12,
                ],
                [
                    socket_x + 0.045,
                    socket_y,
                    z - 0.12,
                    socket_x + 0.075,
                    socket_y + 0.055,
                    z + 0.12,
                ],
            ] {
                add_facing_cuboid(
                    snapshot,
                    registry,
                    bucket,
                    center,
                    facing,
                    bounds,
                    tiles,
                    VertexTint::Biome,
                    emission,
                );
            }
        }
    }
}

fn emit_orb_healer(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    buckets: &mut [LayerBucket; 7],
    p: [f64; 3],
    facing: u8,
    material: RenderMaterial,
    emission: u8,
) {
    let [x, y, z] = p;
    let center = [x, z];
    let tiles = [material.side_tile, material.top_tile, material.bottom_tile];
    let bucket = &mut buckets[material.layer as usize];
    add_facing_cuboid(
        snapshot,
        registry,
        bucket,
        center,
        facing,
        [x - 0.48, y - 0.48, z - 0.48, x + 0.48, y - 0.3, z + 0.48],
        tiles,
        VertexTint::Biome,
        emission,
    );
    add_facing_cuboid(
        snapshot,
        registry,
        bucket,
        center,
        facing,
        [x - 0.42, y - 0.3, z - 0.42, x + 0.42, y + 0.06, z + 0.42],
        tiles,
        VertexTint::Biome,
        emission,
    );
    add_facing_cuboid(
        snapshot,
        registry,
        bucket,
        center,
        facing,
        [x - 0.34, y + 0.06, z - 0.32, x + 0.34, y + 0.1, z + 0.32],
        tiles,
        VertexTint::Fixed([0.76, 0.9, 0.86]),
        emission,
    );
    for bounds in [
        [x - 0.46, y + 0.06, z - 0.46, x + 0.46, y + 0.2, z - 0.34],
        [x - 0.46, y + 0.06, z + 0.34, x + 0.46, y + 0.2, z + 0.46],
        [x - 0.46, y + 0.06, z - 0.34, x - 0.34, y + 0.2, z + 0.34],
        [x + 0.34, y + 0.06, z - 0.34, x + 0.46, y + 0.2, z + 0.34],
    ] {
        add_facing_cuboid(
            snapshot,
            registry,
            bucket,
            center,
            facing,
            bounds,
            tiles,
            VertexTint::Biome,
            emission,
        );
    }
    for [dx, dz] in [[-0.23, -0.22], [0.23, -0.22], [-0.23, 0.22], [0.23, 0.22]] {
        add_facing_cuboid(
            snapshot,
            registry,
            bucket,
            center,
            facing,
            [
                x + dx - 0.08,
                y + 0.085,
                z + dz - 0.08,
                x + dx + 0.08,
                y + 0.12,
                z + dz + 0.08,
            ],
            tiles,
            VertexTint::Fixed([0.58, 0.76, 0.71]),
            emission,
        );
    }
    for bounds in [
        [x - 0.3, y - 0.27, z - 0.485, x + 0.3, y - 0.21, z - 0.43],
        [x - 0.3, y - 0.05, z - 0.485, x + 0.3, y + 0.01, z - 0.43],
        [x - 0.3, y - 0.21, z - 0.485, x - 0.25, y - 0.05, z - 0.43],
        [x + 0.25, y - 0.21, z - 0.485, x + 0.3, y - 0.05, z - 0.43],
    ] {
        add_facing_cuboid(
            snapshot,
            registry,
            bucket,
            center,
            facing,
            bounds,
            tiles,
            VertexTint::Biome,
            emission,
        );
    }
}

fn world_seed(snapshot: &SectionSnapshotV1) -> u32 {
    snapshot
        .address
        .location_id
        .strip_prefix("seed:")
        .and_then(|value| value.parse().ok())
        .unwrap_or(0)
}

fn hash2(x: i64, z: i64, seed: u32) -> f64 {
    let mut n = (x as i32)
        .wrapping_mul(374_761_393)
        .wrapping_add((z as i32).wrapping_mul(668_265_263))
        .wrapping_add((seed as i32).wrapping_mul(1_442_695_041));
    n = (n ^ (n as u32 >> 13) as i32).wrapping_mul(1_274_126_177);
    f64::from((n ^ (n as u32 >> 16) as i32) as u32) / 4_294_967_295.0
}

fn hash3(x: i64, y: i64, z: i64, seed: u32) -> f64 {
    let mut n = (x as i32)
        .wrapping_mul(374_761_393)
        .wrapping_add((y as i32).wrapping_mul(1_103_515_245))
        .wrapping_add((z as i32).wrapping_mul(668_265_263))
        .wrapping_add((seed as i32).wrapping_mul(1_597_334_677));
    n = (n ^ (n as u32 >> 15) as i32).wrapping_mul(2_246_822_519_u32 as i32);
    f64::from((n ^ (n as u32 >> 13) as i32) as u32) / 4_294_967_295.0
}

fn normalize3(value: [f64; 3]) -> [f64; 3] {
    let length = (value[0] * value[0] + value[1] * value[1] + value[2] * value[2]).sqrt();
    if length <= f64::EPSILON {
        [0.0; 3]
    } else {
        value.map(|channel| channel / length)
    }
}
fn cross3(left: [f64; 3], right: [f64; 3]) -> [f64; 3] {
    [
        left[1] * right[2] - left[2] * right[1],
        left[2] * right[0] - left[0] * right[2],
        left[0] * right[1] - left[1] * right[0],
    ]
}
fn pack_snorm8(value: f64) -> i8 {
    js_round(value.clamp(-1.0, 1.0) * 127.0) as i8
}

fn biome_tint_for_vertex(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    local_x: f64,
    local_z: f64,
) -> [f64; 3] {
    let minimum_x = local_x.floor() as i32;
    let maximum_x = local_x.ceil() as i32;
    let minimum_z = local_z.floor() as i32;
    let maximum_z = local_z.ceil() as i32;
    let mut result = [0.0; 3];
    let mut samples = 0_u32;
    let mut seen = [(i32::MIN, i32::MIN); 4];
    // This order matches the TypeScript x-outer/z-inner loop; duplicates are
    // suppressed exactly as its Map does for integer-coordinate vertices.
    for sample_x in [minimum_x, maximum_x] {
        for sample_z in [minimum_z, maximum_z] {
            if seen[..samples as usize].contains(&(sample_x, sample_z)) {
                continue;
            }
            seen[samples as usize] = (sample_x, sample_z);
            let index = halo_biome_index_v1(sample_x, sample_z).expect("cube vertex tint lookup fits horizontal halo");
            let tint = registry
                .biome_tint(snapshot.streams.biomes[index])
                .expect("eligibility verified every biome ID");
            for channel in 0..3 {
                result[channel] += tint[channel];
            }
            samples += 1;
        }
    }
    if samples == 0 {
        return [1.0; 3];
    }
    for channel in &mut result {
        *channel /= f64::from(samples);
    }
    result
}

fn tile_uvs(tile: u16) -> [u16; 8] {
    let column = f64::from(tile % ATLAS_GRID_V1);
    let row = f64::from(tile / ATLAS_GRID_V1);
    let grid = f64::from(ATLAS_GRID_V1);
    let u0 = column / grid + ATLAS_PAD_V1;
    let v0 = 1.0 - (row + 1.0) / grid + ATLAS_PAD_V1;
    let u1 = (column + 1.0) / grid - ATLAS_PAD_V1;
    let v1 = 1.0 - row / grid - ATLAS_PAD_V1;
    [u0, v0, u0, v1, u1, v1, u1, v0].map(pack_unorm16)
}

fn surface_light_at(snapshot: &SectionSnapshotV1, local: [f64; 3], normal: [f64; 3]) -> [u8; 4] {
    let axis = if normal[0].abs() >= normal[1].abs() && normal[0].abs() >= normal[2].abs() {
        0
    } else if normal[1].abs() >= normal[2].abs() {
        1
    } else {
        2
    };
    let origin = [
        i64::from(snapshot.address.chunk_x) * 16,
        i64::from(snapshot.address.section_y) * 16,
        i64::from(snapshot.address.chunk_z) * 16,
    ];
    let world = [
        origin[0] as f64 + local[0],
        origin[1] as f64 + local[1],
        origin[2] as f64 + local[2],
    ];
    let fixed = js_round(world[axis] + normal[axis].signum() * 0.51);
    let coordinate_a = if axis == 0 { world[1] } else { world[0] };
    let coordinate_b = if axis == 2 { world[1] } else { world[2] };
    let minimum_a = coordinate_a.floor() as i64;
    let maximum_a = coordinate_a.ceil() as i64;
    let minimum_b = coordinate_b.floor() as i64;
    let maximum_b = coordinate_b.ceil() as i64;
    let mut totals = [0_u32; 4];
    let mut maxima = [0_u8; 4];
    for sample_index in 0..4 {
        let a = if sample_index & 1 != 0 { maximum_a } else { minimum_a };
        let b = if sample_index & 2 != 0 { maximum_b } else { minimum_b };
        let sample = [
            if axis == 0 { fixed } else { a },
            if axis == 1 {
                fixed
            } else if axis == 0 {
                a
            } else {
                b
            },
            if axis == 2 { fixed } else { b },
        ];
        let packed = packed_light_world(snapshot, origin, sample);
        accumulate_light(packed, &mut totals, &mut maxima);
    }
    if maxima.iter().all(|&value| value == 0) {
        let center = world.map(js_round);
        for direction in [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] {
            let sample = [
                center[0] + i64::from(direction[0]),
                center[1] + i64::from(direction[1]),
                center[2] + i64::from(direction[2]),
            ];
            let packed = packed_light_world(snapshot, origin, sample);
            for (index, channel) in [
                LightChannel::Sky,
                LightChannel::Red,
                LightChannel::Green,
                LightChannel::Blue,
            ]
            .into_iter()
            .enumerate()
            {
                maxima[index] = maxima[index].max(light_channel(packed, channel));
            }
        }
        return maxima.map(pack_light_level);
    }
    core::array::from_fn(|channel| {
        pack_light_level_f64(f64::from(totals[channel]) * 0.18 + f64::from(maxima[channel]) * 0.28)
    })
}

fn accumulate_light(packed: u16, totals: &mut [u32; 4], maxima: &mut [u8; 4]) {
    // Mesh stream order is sky/red/green/blue, intentionally not nibble order.
    for (index, channel) in [
        LightChannel::Sky,
        LightChannel::Red,
        LightChannel::Green,
        LightChannel::Blue,
    ]
    .into_iter()
    .enumerate()
    {
        let value = light_channel(packed, channel);
        totals[index] += u32::from(value);
        maxima[index] = maxima[index].max(value);
    }
}

fn surface_occlusion_at(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    local: [f64; 3],
    normal: [f64; 3],
) -> f64 {
    let axis = if normal[0].abs() >= normal[1].abs() && normal[0].abs() >= normal[2].abs() {
        0
    } else if normal[1].abs() >= normal[2].abs() {
        1
    } else {
        2
    };
    let inside_x = js_round(local[0] - normal[0] * 0.51) as i32;
    let inside_y = js_round(local[1] - normal[1] * 0.51) as i32;
    let inside_z = js_round(local[2] - normal[2] * 0.51) as i32;
    let outward_x = inside_x + if axis == 0 { normal[0].signum() as i32 } else { 0 };
    let outward_y = inside_y + if axis == 1 { normal[1].signum() as i32 } else { 0 };
    let outward_z = inside_z + if axis == 2 { normal[2].signum() as i32 } else { 0 };
    let coordinate_a = if axis == 0 { local[1] } else { local[0] };
    let coordinate_b = if axis == 2 { local[1] } else { local[2] };
    let center_a = if axis == 0 { inside_y } else { inside_x };
    let center_b = if axis == 2 { inside_y } else { inside_z };
    let sign_a = if coordinate_a >= f64::from(center_a) { 1 } else { -1 };
    let sign_b = if coordinate_b >= f64::from(center_b) { 1 } else { -1 };
    let ax = if axis == 0 { 0 } else { sign_a };
    let ay = if axis == 0 { sign_a } else { 0 };
    let by = if axis == 2 { sign_b } else { 0 };
    let bz = if axis == 2 { 0 } else { sign_b };
    let side_a = light_occludes(snapshot, registry, outward_x + ax, outward_y + ay, outward_z);
    let side_b = light_occludes(snapshot, registry, outward_x, outward_y + by, outward_z + bz);
    let corner = light_occludes(snapshot, registry, outward_x + ax, outward_y + ay + by, outward_z + bz);
    1.0 - if side_a { 0.15 } else { 0.0 }
        - if side_b { 0.15 } else { 0.0 }
        - if corner && !(side_a && side_b) { 0.12 } else { 0.0 }
}

fn light_occludes(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    local_x: i32,
    local_y: i32,
    local_z: i32,
) -> bool {
    let Some(index) = halo_cell_index_v1(local_x, local_y, local_z) else {
        return true;
    };
    registry
        .resolved_material(snapshot.streams.blocks[index])
        .is_none_or(|material| material.light_dampening() >= MAX_LIGHT_LEVEL)
}

fn packed_light_world(snapshot: &SectionSnapshotV1, origin: [i64; 3], world: [i64; 3]) -> u16 {
    let local = [world[0] - origin[0], world[1] - origin[1], world[2] - origin[2]];
    let (Ok(local_x), Ok(local_y), Ok(local_z)) = (
        i32::try_from(local[0]),
        i32::try_from(local[1]),
        i32::try_from(local[2]),
    ) else {
        return 0;
    };
    halo_cell_index_v1(local_x, local_y, local_z).map_or(0, |index| snapshot.streams.light[index])
}

fn js_round(value: f64) -> i64 {
    (value + 0.5).floor() as i64
}

fn pack_color(value: f64) -> u8 {
    js_round((value / PACKED_VERTEX_COLOR_RANGE_V1).clamp(0.0, 1.0) * 255.0) as u8
}

fn pack_unorm8(value: f64) -> u8 {
    js_round(value.clamp(0.0, 1.0) * 255.0) as u8
}

fn pack_unorm16(value: f64) -> u16 {
    js_round(value.clamp(0.0, 1.0) * 65_535.0) as u16
}

fn pack_light_level(value: u8) -> u8 {
    pack_light_level_f64(f64::from(value))
}

fn pack_light_level_f64(value: f64) -> u8 {
    pack_unorm8(value / f64::from(MAX_LIGHT_LEVEL))
}
