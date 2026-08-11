use super::*;

const HASH: &str = "0123456789abcdef0123456789abcdef";

fn material(tile: u16, emitted_light: u16, dampening: u8) -> OpaqueCubeMaterialV1 {
    OpaqueCubeMaterialV1 {
        side_tile: tile,
        top_tile: tile + 1,
        bottom_tile: tile + 2,
        emitted_light,
        emissive_strength: if emitted_light == 0 { 0.0 } else { 1.0 },
        light_dampening: dampening,
        ambient_occlusion: true,
    }
}

fn registry() -> TerrainMaterialRegistryV1 {
    TerrainMaterialRegistryV1 {
        content_hash: HASH.into(),
        blocks: vec![
            Some(TerrainMaterialV1::Air),
            Some(TerrainMaterialV1::OpaqueFullCube(material(1, 0, 15))),
            Some(TerrainMaterialV1::OpaqueFullCube(material(
                4,
                pack_voxel_light(0, 15, 4, 1),
                15,
            ))),
            Some(TerrainMaterialV1::Specialty),
        ],
        biome_tints: vec![Some([1.0, 1.0, 1.0]), Some([1.1, 0.55, 0.0])],
    }
}

fn catalog_registry() -> TerrainMaterialRegistryV1 {
    let mut value = registry();
    value.blocks.resize(601, None);
    for block_id in crate::catalog::specialty_catalog_ids_v1() {
        value.blocks[block_id as usize] = Some(TerrainMaterialV1::Specialty);
    }
    value
}

fn data_driven_registry() -> TerrainMaterialRegistryV1 {
    let mut value = catalog_registry();
    for (block_id, entry) in value.blocks.iter_mut().enumerate() {
        *entry = match *entry {
            None => None,
            Some(TerrainMaterialV1::Air) => Some(TerrainMaterialV1::Air),
            Some(TerrainMaterialV1::OpaqueFullCube(material)) => {
                Some(TerrainMaterialV1::DataDriven(CanonicalSpecialtyMaterialV1 {
                    side_tile: material.side_tile,
                    top_tile: material.top_tile,
                    bottom_tile: material.bottom_tile,
                    layer: TerrainMeshLayerV1::Opaque,
                    shape: CanonicalShapeV1::Cube,
                    solid: true,
                    liquid: CanonicalLiquidV1::None,
                    waterlogged: false,
                    connects_fence: false,
                    light_dampening: material.light_dampening,
                    emitted_light: material.emitted_light,
                    emissive_strength_bits: material.emissive_strength.to_bits(),
                    aquatic_profile: 0,
                    vertical_group: 0,
                    shape_variant: 0,
                    geometry_revision: 1,
                    tint_policy: 1,
                    ambient_occlusion: material.ambient_occlusion,
                    selective_interior_faces: false,
                    directionally_placed: false,
                    joins_same_horizontal: false,
                    joins_same_vertical: false,
                }))
            }
            Some(TerrainMaterialV1::Specialty) => {
                crate::catalog::canonical_specialty_material_v1(block_id as u16).map(TerrainMaterialV1::DataDriven)
            }
            Some(TerrainMaterialV1::DataDriven(material)) => Some(TerrainMaterialV1::DataDriven(material)),
        };
    }
    value
}

fn snapshot_with_revision(revision: TerrainSectionRevisionV1) -> SectionSnapshotV1 {
    SectionSnapshotV1::create(
        HASH.into(),
        TerrainSectionAddressV1 {
            universe_id: "1".into(),
            location_id: "overworld".into(),
            chunk_x: -12,
            chunk_z: 8,
            section_y: -2,
        },
        revision,
        TerrainSectionSnapshotStreamsV1::empty(),
    )
    .unwrap()
}

fn snapshot() -> SectionSnapshotV1 {
    snapshot_with_revision(TerrainSectionRevisionV1 {
        section: 4,
        halo: 5,
        lighting: 6,
    })
}

fn typescript_contract_fixture() -> SectionSnapshotV1 {
    let mut streams = TerrainSectionSnapshotStreamsV1::empty();
    streams.blocks[halo_cell_index_v1(0, 0, 0).unwrap()] = 7;
    streams.light[halo_cell_index_v1(0, 0, 0).unwrap()] = 0xf123;
    streams.facing[halo_cell_index_v1(0, 0, 0).unwrap()] = 3;
    streams.hidden[halo_cell_index_v1(-1, 0, 0).unwrap()] = 2;
    streams.fluid_level[halo_cell_index_v1(15, 0, 15).unwrap()] = 6;
    streams.fluid_flags[halo_cell_index_v1(15, 0, 15).unwrap()] = 5;
    streams.biomes[halo_biome_index_v1(0, 0).unwrap()] = 11;
    SectionSnapshotV1::create(
        HASH.into(),
        TerrainSectionAddressV1 {
            universe_id: "1".into(),
            location_id: "overworld".into(),
            chunk_x: -12,
            chunk_z: 8,
            section_y: 3,
        },
        TerrainSectionRevisionV1 {
            section: 1,
            halo: 2,
            lighting: 3,
        },
        streams,
    )
    .unwrap()
}

fn set_block(snapshot: &mut SectionSnapshotV1, x: i32, y: i32, z: i32, block: u16) {
    let index = halo_cell_index_v1(x, y, z).unwrap();
    snapshot.streams.blocks[index] = block;
    snapshot.snapshot_hash = hash_section_snapshot_v1(snapshot);
}

fn mesh(snapshot: &SectionSnapshotV1) -> Box<MeshPacketV1> {
    match mesh_opaque_section_v1(snapshot, &registry(), None).unwrap() {
        MeshSectionOutcomeV1::Eligible(packet) => packet,
        MeshSectionOutcomeV1::Ineligible(reason) => panic!("unexpected ineligibility: {reason:?}"),
    }
}

fn mesh_with(snapshot: &SectionSnapshotV1, registry: &TerrainMaterialRegistryV1) -> Box<MeshPacketV1> {
    match mesh_opaque_section_v1(snapshot, registry, None).unwrap() {
        MeshSectionOutcomeV1::Eligible(packet) => packet,
        MeshSectionOutcomeV1::Ineligible(reason) => panic!("unexpected ineligibility: {reason:?}"),
    }
}

fn light(snapshot: &SectionSnapshotV1, budget: u32) -> SectionLightingResultV1 {
    let LightingSectionOutcomeV1::Eligible(mut task) =
        begin_section_lighting_v1(snapshot, &registry(), vec![0; 256]).unwrap()
    else {
        panic!("fixture must be lighting-eligible");
    };
    while !task.step(budget).complete {}
    task.finish().unwrap()
}

#[test]
fn snapshot_contract_covers_negative_addresses_halos_and_all_streams() {
    let mut value = snapshot();
    assert_eq!(halo_cell_index_v1(-1, -1, -1), Some(0));
    assert_eq!(halo_cell_index_v1(16, 16, 16), Some(18_usize.pow(3) - 1));
    assert_eq!(halo_cell_index_v1(0, 0, 0), Some(1 + 18 * (1 + 18)));
    assert_eq!(halo_biome_index_v1(-1, -1), Some(0));
    assert_eq!(halo_biome_index_v1(16, 16), Some(18_usize.pow(2) - 1));
    assert_eq!(halo_cell_index_v1(17, 0, 0), None);
    assert_eq!(value.address.key(), "1/overworld/-12/8/-2");
    assert_eq!(value.revision.key(), "4:5:6");
    value.validate(true).unwrap();

    let original_hash = value.snapshot_hash.clone();
    value.streams.fluid_flags[halo_cell_index_v1(1, 1, 1).unwrap()] = TERRAIN_FLUID_WATERLOGGED_V1;
    assert_ne!(hash_section_snapshot_v1(&value), original_hash);
    assert!(value.issues(true).iter().any(|issue| issue.contains("snapshotHash")));
}

#[test]
fn snapshot_hash_matches_typescript_differential_fixture() {
    let value = typescript_contract_fixture();
    // Generated by the TypeScript `createSectionSnapshotV1` fixture in
    // tests/rust-terrain-mesh-contract.test.ts.
    assert_eq!(value.snapshot_hash, "5824cba3e45d987c0000000000000000");
}

#[test]
fn mesh_packet_hash_matches_typescript_differential_fixture() {
    let source = typescript_contract_fixture();
    let packet = MeshPacketV1::create(
        &source,
        vec![TerrainMeshLayerSpanV1 {
            layer: TerrainMeshLayerV1::Opaque,
            vertex_start: 0,
            vertex_count: 3,
            index_start: 0,
            index_count: 3,
        }],
        TerrainMeshStreamsV1 {
            positions: vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0],
            normals: vec![0, 0, 127, 0, 0, 127, 0, 0, 127],
            colors: vec![255; 9],
            lights: vec![128; 12],
            emissions: vec![0; 3],
            occlusions: vec![255; 3],
            uvs: vec![0, 0, u16::MAX, 0, 0, u16::MAX],
            indices: TerrainIndexStreamV1::U16(vec![0, 1, 2]),
        },
        Some(TerrainLightingDeltaV1 {
            changed_cell_indices: vec![0, 4_095],
            packed_light: vec![0x000f, 0xf000],
        }),
    )
    .unwrap();
    assert_eq!(packet.packet_hash, "c516a267b6777cfa005f462791076b42");
}

#[test]
fn validation_is_strict_for_schema_utf16_bounds_lengths_facing_and_hash() {
    let mut value = snapshot();
    value.schema_version = 2;
    value.content_hash = "ABC".into();
    value.address.location_id = "🌿".repeat(65);
    value.dimensions.halo = 2;
    value.streams.blocks.pop();
    value.streams.facing[0] = 4;
    let issues = value.issues(true).join(" ");
    for expected in [
        "schemaVersion",
        "contentHash",
        "locationId",
        "dimensions",
        "streams.blocks",
        "facing",
    ] {
        assert!(issues.contains(expected), "missing {expected}: {issues}");
    }
}

#[test]
fn whole_section_eligibility_rejects_unknown_specialty_invalid_fluid_and_content_drift() {
    for (block, level, flags) in [(3_u16, 0_u8, 0_u8), (1, 2, TERRAIN_FLUID_PRESENT_V1)] {
        let mut value = snapshot();
        let index = halo_cell_index_v1(0, 0, 0).unwrap();
        value.streams.blocks[index] = block;
        value.streams.fluid_level[index] = level;
        value.streams.fluid_flags[index] = flags;
        value.snapshot_hash = hash_section_snapshot_v1(&value);
        assert!(
            !opaque_section_eligibility_v1(&value, &registry())
                .unwrap()
                .is_eligible()
        );
        assert!(matches!(
            mesh_opaque_section_v1(&value, &registry(), None).unwrap(),
            MeshSectionOutcomeV1::Ineligible(_)
        ));
    }
    let mut hidden = snapshot();
    set_block(&mut hidden, 0, 0, 0, 1);
    let index = halo_cell_index_v1(0, 0, 0).unwrap();
    hidden.streams.hidden[index] = TERRAIN_HIDDEN_GEOMETRY_V1;
    hidden.streams.hidden[halo_cell_index_v1(-1, 0, 0).unwrap()] = TERRAIN_HIDDEN_UNKNOWN_HALO_V1;
    hidden.snapshot_hash = hash_section_snapshot_v1(&hidden);
    assert!(section_eligibility_v1(&hidden, &registry()).unwrap().is_eligible());
    assert_eq!(mesh(&hidden).streams.vertex_count(), 0);

    let mut changed_registry = registry();
    changed_registry.content_hash = "ffffffffffffffffffffffffffffffff".into();
    assert_eq!(
        opaque_section_eligibility_v1(&snapshot(), &changed_registry).unwrap(),
        SectionEligibilityV1::Ineligible(SectionIneligibilityV1::ContentHashMismatch)
    );
}

#[test]
fn opaque_mesh_hides_internal_faces_and_uses_halo_for_seams() {
    let mut single = snapshot();
    set_block(&mut single, 0, 0, 0, 1);
    let packet = mesh(&single);
    assert_eq!(packet.layers.len(), 1);
    assert_eq!(packet.layers[0].layer, TerrainMeshLayerV1::Opaque);
    assert_eq!(packet.streams.vertex_count(), 24);
    assert_eq!(packet.streams.indices.len(), 36);

    let mut adjacent = single.clone();
    set_block(&mut adjacent, 1, 0, 0, 1);
    let adjacent_packet = mesh(&adjacent);
    assert_eq!(adjacent_packet.streams.vertex_count(), 40);
    assert_eq!(adjacent_packet.streams.indices.len(), 60);

    let mut seam = single;
    set_block(&mut seam, -1, 0, 0, 1);
    let seam_packet = mesh(&seam);
    assert_eq!(seam_packet.streams.vertex_count(), 20);
    assert_eq!(seam_packet.streams.indices.len(), 30);
    assert_eq!(seam_packet.address.chunk_x, -12);
}

#[test]
fn data_driven_glass_halo_does_not_occlude_adjacent_cutout_geometry() {
    let mut value = snapshot();
    set_block(&mut value, 0, 0, 0, 6);
    set_block(&mut value, -1, 0, 0, 12);

    let packet = mesh_with(&value, &data_driven_registry());
    assert_eq!(packet.layers.len(), 1);
    assert_eq!(packet.layers[0].layer, TerrainMeshLayerV1::Cutout);
    assert_eq!(packet.streams.vertex_count(), 24);
    assert_eq!(packet.streams.indices.len(), 36);
}

#[test]
fn data_driven_furnace_variant_preserves_cube_ambient_occlusion() {
    let mut value = snapshot();
    set_block(&mut value, 0, 0, 0, 31);
    set_block(&mut value, 1, 0, 0, 1);

    let packet = mesh_with(&value, &data_driven_registry());
    assert!(packet.streams.occlusions.iter().any(|&value| value < u8::MAX));
}

#[test]
fn frozen_bwr1_catalog_owns_every_current_specialty_id_without_partial_fallback() {
    let registry = catalog_registry();
    let ids = crate::catalog::specialty_catalog_ids_v1().collect::<Vec<_>>();
    assert_eq!(ids.len(), 218);
    assert!(ids.windows(2).all(|pair| pair[0] < pair[1]));
    for block_id in ids {
        let mut value = snapshot();
        value.address.location_id = "seed:4276993775".into();
        set_block(&mut value, 8, 8, 8, block_id);
        let packet = mesh_with(&value, &registry);
        packet.validate_matches_snapshot(&value).unwrap();
        assert!(
            packet.streams.vertex_count() > 0,
            "catalog block {block_id} emitted no visible geometry"
        );
    }
}

#[test]
fn bwr2_round_trip_is_data_driven_and_byte_identical_to_the_bwr1_rollback_catalog() {
    let legacy = catalog_registry();
    let production = data_driven_registry();
    let encoded = encode_material_registry_v2(&production).unwrap();
    assert_eq!(&encoded[..4], b"BWR2");
    let decoded = decode_material_registry_v1(&encoded).unwrap();
    assert_eq!(decoded, production);
    assert!(
        decoded
            .blocks
            .iter()
            .flatten()
            .all(|material| { matches!(material, TerrainMaterialV1::Air | TerrainMaterialV1::DataDriven(_)) })
    );

    for block_id in crate::catalog::specialty_catalog_ids_v1() {
        let mut value = snapshot();
        value.address.location_id = "seed:4276993775".into();
        set_block(&mut value, 8, 8, 8, block_id);
        let legacy_packet = mesh_with(&value, &legacy);
        let production_packet = mesh_with(&value, &decoded);
        assert_eq!(production_packet, legacy_packet, "BWR2 block {block_id} drifted");
    }
}

#[test]
fn bwr2_rejects_future_geometry_revisions_and_never_guesses_missing_ids() {
    let mut registry = data_driven_registry();
    let Some(TerrainMaterialV1::DataDriven(mut material)) = registry.blocks[6] else {
        panic!("fixture block must be data driven");
    };
    material.geometry_revision = 2;
    registry.blocks[6] = Some(TerrainMaterialV1::DataDriven(material));
    assert!(encode_material_registry_v2(&registry).is_err());

    let mut source = snapshot();
    set_block(&mut source, 0, 0, 0, 601);
    assert!(matches!(
        mesh_opaque_section_v1(&source, &data_driven_registry(), None).unwrap(),
        MeshSectionOutcomeV1::Ineligible(SectionIneligibilityV1::UnsupportedBlock { block_id: 601, .. })
    ));
}

#[test]
fn specialty_gallery_uses_every_render_layer_in_canonical_order() {
    let registry = catalog_registry();
    let mut value = snapshot();
    for (x, block_id) in [(0, 1), (2, 6), (4, 13), (6, 41), (8, 7), (10, 37), (12, 12)] {
        set_block(&mut value, x, 8, 8, block_id);
    }
    let water = halo_cell_index_v1(8, 8, 8).unwrap();
    value.streams.fluid_flags[water] = TERRAIN_FLUID_PRESENT_V1 | TERRAIN_FLUID_SOURCE_V1;
    value.snapshot_hash = hash_section_snapshot_v1(&value);
    let packet = mesh_with(&value, &registry);
    assert_eq!(
        packet.layers.iter().map(|span| span.layer).collect::<Vec<_>>(),
        TerrainMeshLayerV1::ALL
    );
    assert!(
        packet
            .layers
            .iter()
            .all(|span| span.vertex_count > 0 && span.index_count > 0)
    );
}

#[test]
fn fluids_waterlogging_and_hidden_state_preserve_whole_section_ownership() {
    let registry = catalog_registry();
    let mut source = snapshot();
    set_block(&mut source, 2, 8, 2, 7);
    let source_index = halo_cell_index_v1(2, 8, 2).unwrap();
    source.streams.fluid_flags[source_index] = TERRAIN_FLUID_PRESENT_V1 | TERRAIN_FLUID_SOURCE_V1;
    source.snapshot_hash = hash_section_snapshot_v1(&source);
    let source_mesh = mesh_with(&source, &registry);

    let mut flowing = source.clone();
    flowing.streams.fluid_level[source_index] = 7;
    flowing.streams.fluid_flags[source_index] = TERRAIN_FLUID_PRESENT_V1;
    flowing.snapshot_hash = hash_section_snapshot_v1(&flowing);
    let flowing_mesh = mesh_with(&flowing, &registry);
    let maximum_y = |packet: &MeshPacketV1| {
        packet
            .streams
            .positions
            .chunks_exact(3)
            .map(|position| position[1])
            .fold(f32::NEG_INFINITY, f32::max)
    };
    assert!(maximum_y(&source_mesh) > maximum_y(&flowing_mesh));

    let mut waterlogged = snapshot();
    set_block(&mut waterlogged, 8, 8, 8, 110);
    let index = halo_cell_index_v1(8, 8, 8).unwrap();
    waterlogged.streams.fluid_flags[index] =
        TERRAIN_FLUID_PRESENT_V1 | TERRAIN_FLUID_SOURCE_V1 | TERRAIN_FLUID_WATERLOGGED_V1;
    waterlogged.snapshot_hash = hash_section_snapshot_v1(&waterlogged);
    let packet = mesh_with(&waterlogged, &registry);
    assert_eq!(
        packet.layers.iter().map(|span| span.layer).collect::<Vec<_>>(),
        vec![TerrainMeshLayerV1::Emissive, TerrainMeshLayerV1::Water]
    );

    waterlogged.streams.hidden[index] = TERRAIN_HIDDEN_GEOMETRY_V1;
    waterlogged.snapshot_hash = hash_section_snapshot_v1(&waterlogged);
    let hidden = mesh_with(&waterlogged, &registry);
    assert_eq!(hidden.streams.vertex_count(), 0);
}

#[test]
fn specialty_emission_and_dampening_participate_in_resumable_lighting() {
    let registry = catalog_registry();
    let mut value = snapshot();
    set_block(&mut value, 8, 8, 8, 13);
    let LightingSectionOutcomeV1::Eligible(mut fine) =
        begin_section_lighting_v1(&value, &registry, vec![0; 256]).unwrap()
    else {
        panic!("catalog lighting must be eligible");
    };
    while !fine.step(1).complete {}
    let fine = fine.finish().unwrap();
    let LightingSectionOutcomeV1::Eligible(mut coarse) =
        begin_section_lighting_v1(&value, &registry, vec![0; 256]).unwrap()
    else {
        panic!("catalog lighting must be eligible");
    };
    while !coarse.step(u32::MAX).complete {}
    let coarse = coarse.finish().unwrap();
    assert_eq!(fine, coarse);
    let source = halo_cell_index_v1(8, 8, 8).unwrap();
    let neighbor = halo_cell_index_v1(9, 8, 8).unwrap();
    assert_eq!(fine.light[source], 4037);
    assert_eq!(light_channel(fine.light[neighbor], LightChannel::Red), 14);
    assert_eq!(light_channel(fine.light[neighbor], LightChannel::Green), 11);
}

#[test]
fn packed_mesh_attributes_are_normalized_and_match_current_face_order() {
    let mut value = snapshot();
    value.streams.light.fill(0xffff);
    set_block(&mut value, 0, 0, 0, 1);
    let packet = mesh(&value);
    packet.validate_matches_snapshot(&value).unwrap();
    assert!(
        packet
            .streams
            .normals
            .iter()
            .all(|value| [-127, 0, 127].contains(value))
    );
    assert!(
        packet.streams.colors.contains(&232),
        "top-face white packs relative to the 1.1 headroom"
    );
    assert!(packet.streams.occlusions.contains(&255));
    assert!(packet.streams.lights.iter().all(|&value| value == 255));
    assert!(packet.streams.uvs.iter().all(|&value| value > 0 && value < u16::MAX));
    assert_eq!(
        &packet.streams.normals[..12],
        &[127, 0, 0, 127, 0, 0, 127, 0, 0, 127, 0, 0]
    );
    assert_eq!(&packet.streams.positions[..3], &[0.5, -32.5, -0.5]);
    assert_eq!(packet.streams.indices.get(0), Some(0));
    assert_eq!(packet.streams.indices.get(5), Some(3));
}

#[test]
fn lighting_is_resumable_deterministic_and_matches_channel_attenuation() {
    let mut value = snapshot();
    set_block(&mut value, 8, 8, 8, 2);
    let one_operation = light(&value, 1);
    let coarse = light(&value, 50_000);
    assert_eq!(one_operation, coarse);
    let source = halo_cell_index_v1(8, 8, 8).unwrap();
    let neighbor = halo_cell_index_v1(9, 8, 8).unwrap();
    let two_away = halo_cell_index_v1(10, 8, 8).unwrap();
    assert_eq!(light_channel(coarse.light[source], LightChannel::Red), 15);
    assert_eq!(light_channel(coarse.light[neighbor], LightChannel::Red), 14);
    assert_eq!(light_channel(coarse.light[two_away], LightChannel::Red), 13);
    assert_eq!(light_channel(coarse.light[neighbor], LightChannel::Green), 3);
    assert!(
        coarse
            .delta
            .changed_cell_indices
            .windows(2)
            .all(|pair| pair[0] < pair[1])
    );
}

#[test]
fn direct_sky_preserves_level_and_opaque_destination_blocks_light() {
    let mut value = snapshot();
    set_block(&mut value, 8, 8, 8, 1);
    let LightingSectionOutcomeV1::Eligible(mut task) =
        begin_section_lighting_v1(&value, &registry(), vec![15; 256]).unwrap()
    else {
        panic!("fixture must be eligible");
    };
    while !task.step(257).complete {}
    let result = task.finish().unwrap();
    assert_eq!(
        light_channel(result.light[halo_cell_index_v1(2, 15, 2).unwrap()], LightChannel::Sky),
        15
    );
    assert_eq!(
        light_channel(result.light[halo_cell_index_v1(2, 0, 2).unwrap()], LightChannel::Sky),
        15
    );
    assert_eq!(
        light_channel(result.light[halo_cell_index_v1(8, 8, 8).unwrap()], LightChannel::Sky),
        0
    );
}

#[test]
fn lighting_rebuild_removes_a_deleted_source_and_reports_zero_delta_values() {
    let mut with_source = snapshot();
    set_block(&mut with_source, 8, 8, 8, 2);
    let lit = light(&with_source, 4_096);
    let mut removed = snapshot_with_revision(TerrainSectionRevisionV1 {
        section: 5,
        halo: 5,
        lighting: 7,
    });
    removed.streams.light = lit.light;
    removed.snapshot_hash = hash_section_snapshot_v1(&removed);
    let rebuilt = light(&removed, 4_096);
    assert!(
        rebuilt
            .light
            .iter()
            .enumerate()
            .filter(|(index, _)| {
                let x = *index % 18;
                let yz = *index / 18;
                let z = yz % 18;
                let y = yz / 18;
                (1..=16).contains(&x) && (1..=16).contains(&y) && (1..=16).contains(&z)
            })
            .all(|(_, &packed)| packed == 0)
    );
    assert!(rebuilt.delta.packed_light.iter().all(|&packed| packed == 0));
    assert!(!rebuilt.delta.changed_cell_indices.is_empty());
}

#[test]
fn revision_and_source_identity_reject_stale_mesh_and_light_results() {
    let mut value = snapshot();
    set_block(&mut value, 1, 1, 1, 1);
    let packet = mesh(&value);
    let lighting = light(&value, 20_000);
    let mut newer = value.clone();
    newer.revision.lighting += 1;
    newer.snapshot_hash = hash_section_snapshot_v1(&newer);
    assert!(!packet.matches_snapshot(&newer));
    assert!(!lighting.matches_snapshot(&newer));
    assert!(packet.validate_matches_snapshot(&newer).is_err());
    assert!(lighting.validate_matches_snapshot(&newer).is_err());
}

#[test]
fn index_policy_requires_u32_above_65535_vertices() {
    let value = snapshot();
    let vertex_count = u16::MAX as usize + 1;
    let streams = TerrainMeshStreamsV1 {
        positions: vec![0.0; vertex_count * 3],
        normals: vec![0; vertex_count * 3],
        colors: vec![0; vertex_count * 3],
        lights: vec![0; vertex_count * 4],
        emissions: vec![0; vertex_count],
        occlusions: vec![255; vertex_count],
        uvs: vec![0; vertex_count * 2],
        indices: TerrainIndexStreamV1::U32(vec![0, 1, 2]),
    };
    let packet = MeshPacketV1::create(
        &value,
        vec![TerrainMeshLayerSpanV1 {
            layer: TerrainMeshLayerV1::Opaque,
            vertex_start: 0,
            vertex_count: vertex_count as u32,
            index_start: 0,
            index_count: 3,
        }],
        streams,
        None,
    )
    .unwrap();
    let mut invalid = packet.clone();
    invalid.streams.indices = TerrainIndexStreamV1::U16(vec![0, 1, 2]);
    invalid.packet_hash = hash_mesh_packet_v1(&invalid);
    assert!(invalid.issues(true).iter().any(|issue| issue.contains("Uint32Array")));
}

#[test]
fn binary_codecs_round_trip_and_reject_trailing_or_truncated_payloads() {
    let mut value = snapshot();
    set_block(&mut value, 2, 3, 4, 1);
    let snapshot_bytes = encode_section_snapshot_v1(&value);
    assert_eq!(decode_section_snapshot_v1(&snapshot_bytes).unwrap(), value);
    assert!(decode_section_snapshot_v1(&snapshot_bytes[..snapshot_bytes.len() - 1]).is_err());
    let mut trailing = snapshot_bytes;
    trailing.push(0);
    assert!(decode_section_snapshot_v1(&trailing).is_err());

    let registry_bytes = encode_material_registry_v1(&registry());
    assert_eq!(decode_material_registry_v1(&registry_bytes).unwrap(), registry());
    let packet = mesh(&value);
    let packet_bytes = encode_mesh_packet_v1(&packet);
    assert_eq!(decode_mesh_packet_v1(&packet_bytes).unwrap(), *packet);
    let lighting = light(&value, 20_000);
    let lighting_bytes = encode_lighting_result_v1(&lighting);
    assert_eq!(decode_lighting_result_v1(&lighting_bytes).unwrap(), lighting);
}

#[test]
fn layer_order_and_light_delta_validation_are_canonical() {
    let mut value = snapshot();
    set_block(&mut value, 0, 0, 0, 1);
    let packet = mesh(&value);
    let mut bad_layer = (*packet).clone();
    bad_layer.layers.push(TerrainMeshLayerSpanV1 {
        layer: TerrainMeshLayerV1::Opaque,
        vertex_start: bad_layer.layers[0].vertex_count,
        vertex_count: 1,
        index_start: bad_layer.layers[0].index_count,
        index_count: 3,
    });
    assert!(
        bad_layer
            .issues(false)
            .iter()
            .any(|issue| issue.contains("canonical order"))
    );

    let mut bad_delta = (*packet).clone();
    bad_delta.lighting_delta = Some(TerrainLightingDeltaV1 {
        changed_cell_indices: vec![4, 4],
        packed_light: vec![1, 2],
    });
    assert!(
        bad_delta
            .issues(false)
            .iter()
            .any(|issue| issue.contains("sorted, unique"))
    );
}
