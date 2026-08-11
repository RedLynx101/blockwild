use crate::contract::{
    MeshPacketV1, SectionSnapshotV1, TERRAIN_SECTION_SIZE_V1, TerrainIndexStreamV1, TerrainLightingDeltaV1,
    TerrainMeshContractError, TerrainMeshLayerSpanV1, TerrainMeshLayerV1, TerrainMeshStreamsV1, halo_biome_index_v1,
    halo_cell_index_v1,
};
use crate::lighting::{LightChannel, light_channel};
use crate::material::{
    ATLAS_GRID_V1, MAX_LIGHT_LEVEL, OpaqueCubeMaterialV1, PACKED_VERTEX_COLOR_RANGE_V1, SectionEligibilityV1,
    TerrainMaterialRegistryV1, TerrainMaterialV1, opaque_section_eligibility_v1,
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
    match opaque_section_eligibility_v1(snapshot, registry)? {
        SectionEligibilityV1::Ineligible(reason) => return Ok(MeshSectionOutcomeV1::Ineligible(reason)),
        SectionEligibilityV1::Eligible => {}
    }
    let mut streams = TerrainMeshStreamsV1::empty();
    let mut indices = Vec::<u32>::new();
    for local_x in 0..TERRAIN_SECTION_SIZE_V1 as i32 {
        for local_z in 0..TERRAIN_SECTION_SIZE_V1 as i32 {
            for local_y in 0..TERRAIN_SECTION_SIZE_V1 as i32 {
                let index = halo_cell_index_v1(local_x, local_y, local_z).expect("core coordinate has a halo index");
                let block_id = snapshot.streams.blocks[index];
                let Some(TerrainMaterialV1::OpaqueFullCube(material)) = registry.material(block_id) else {
                    continue;
                };
                for face in FACES {
                    let neighbor_index = halo_cell_index_v1(
                        local_x + face.direction[0],
                        local_y + face.direction[1],
                        local_z + face.direction[2],
                    )
                    .expect("one-cell face lookup is inside the halo");
                    if matches!(
                        registry.material(snapshot.streams.blocks[neighbor_index]),
                        Some(TerrainMaterialV1::OpaqueFullCube(_))
                    ) {
                        continue;
                    }
                    emit_face(
                        snapshot,
                        registry,
                        material,
                        face,
                        [local_x, local_y, local_z],
                        &mut streams,
                        &mut indices,
                    );
                }
            }
        }
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
    let layers = if vertex_count == 0 {
        Vec::new()
    } else {
        vec![TerrainMeshLayerSpanV1 {
            layer: TerrainMeshLayerV1::Opaque,
            vertex_start: 0,
            vertex_count: u32::try_from(vertex_count).expect("section vertex count fits u32"),
            index_start: 0,
            index_count: u32::try_from(streams.indices.len()).expect("section index count fits u32"),
        }]
    };
    Ok(MeshSectionOutcomeV1::Eligible(Box::new(MeshPacketV1::create(
        snapshot,
        layers,
        streams,
        lighting_delta,
    )?)))
}

fn emit_face(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    material: OpaqueCubeMaterialV1,
    face: Face,
    cell: [i32; 3],
    streams: &mut TerrainMeshStreamsV1,
    indices: &mut Vec<u32>,
) {
    let base = u32::try_from(streams.vertex_count()).expect("section vertex count fits u32");
    let tile = if face.direction[1] > 0 {
        material.top_tile
    } else if face.direction[1] < 0 {
        material.bottom_tile
    } else {
        material.side_tile
    };
    for corner in face.corners {
        let local = [
            f64::from(cell[0]) + corner[0],
            f64::from(cell[1]) + corner[1],
            f64::from(cell[2]) + corner[2],
        ];
        let world_y = f64::from(snapshot.address.section_y) * 16.0 + local[1];
        streams
            .positions
            .extend([local[0] as f32, world_y as f32, local[2] as f32]);
        streams.normals.extend(face.direction.map(|value| (value * 127) as i8));
        let tint = biome_tint_for_vertex(snapshot, registry, local[0], local[2]);
        streams
            .colors
            .extend(tint.map(|channel| pack_color(channel * face.shade)));
        streams.lights.extend(surface_light_at(snapshot, local, face.direction));
        streams.emissions.push(pack_unorm8(material.emissive_strength));
        let occlusion = if material.ambient_occlusion {
            surface_occlusion_at(snapshot, registry, local, face.direction)
        } else {
            1.0
        };
        streams.occlusions.push(pack_unorm8(occlusion));
    }
    streams.uvs.extend(tile_uvs(tile));
    indices.extend([base, base + 1, base + 2, base, base + 2, base + 3]);
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

fn surface_light_at(snapshot: &SectionSnapshotV1, local: [f64; 3], normal: [i32; 3]) -> [u8; 4] {
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
    let fixed = js_round(world[axis] + f64::from(normal[axis].signum()) * 0.51);
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
    normal: [i32; 3],
) -> f64 {
    let axis = if normal[0].abs() >= normal[1].abs() && normal[0].abs() >= normal[2].abs() {
        0
    } else if normal[1].abs() >= normal[2].abs() {
        1
    } else {
        2
    };
    let inside_x = js_round(local[0] - f64::from(normal[0]) * 0.51) as i32;
    let inside_y = js_round(local[1] - f64::from(normal[1]) * 0.51) as i32;
    let inside_z = js_round(local[2] - f64::from(normal[2]) * 0.51) as i32;
    let outward_x = inside_x + if axis == 0 { normal[0].signum() } else { 0 };
    let outward_y = inside_y + if axis == 1 { normal[1].signum() } else { 0 };
    let outward_z = inside_z + if axis == 2 { normal[2].signum() } else { 0 };
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
    match registry.material(snapshot.streams.blocks[index]) {
        Some(TerrainMaterialV1::OpaqueFullCube(material)) => material.light_dampening >= MAX_LIGHT_LEVEL,
        Some(TerrainMaterialV1::Air | TerrainMaterialV1::Specialty) | None => false,
    }
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
