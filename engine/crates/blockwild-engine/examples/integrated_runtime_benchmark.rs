use std::hint::black_box;
use std::time::Instant;

use blockwild_authority::{
    CellPositionV1, ReadOriginV1, ReadSizeV1, WORLD_AUTHORITY_SCHEMA_V1, WorldMutationBatchR4V1,
    WorldMutationCommandR4V1,
};
use blockwild_engine::{IntegratedRuntimeBatchV2, IntegratedRuntimeConfigV2, IntegratedRuntimeV2};
use blockwild_generation::{Block, fixture_request};
use blockwild_types::CanonicalHash;

fn main() {
    let seed = "blockwild-integrated-runtime-benchmark";
    let first_request = fixture_request(seed, -1, -1, 1);
    let mut config = IntegratedRuntimeConfigV2 {
        world_seed: seed.into(),
        content_hash: parse_hash(&first_request.content_hash),
        generator_hash: parse_hash(&first_request.generator_hash),
        ..IntegratedRuntimeConfigV2::default()
    };
    config.block_catalog.water_block_id = Block::WATER;
    let mut runtime = IntegratedRuntimeV2::new(config).expect("integrated runtime");

    let generation_started = Instant::now();
    let mut task_id = 1_u32;
    for chunk_x in -1..=1 {
        for chunk_z in -1..=1 {
            let request = fixture_request(seed, chunk_x, chunk_z, task_id);
            runtime
                .generate_and_install_chunk(&request)
                .expect("generated chunk install");
            task_id += 1;
        }
    }
    let generation_ms = generation_started.elapsed().as_secs_f64() * 1_000.0;

    let page_started = Instant::now();
    let mut page_hash = CanonicalHash::default();
    for offset in 0..500 {
        let page = runtime
            .capture_simulation_window(
                ReadOriginV1 {
                    x: -16 + offset % 3,
                    y: -16,
                    z: -16,
                },
                ReadSizeV1 { x: 32, y: 48, z: 32 },
            )
            .expect("simulation window");
        page_hash = page.snapshot_hash;
    }
    black_box(page_hash);
    let page_ms = page_started.elapsed().as_secs_f64() * 1_000.0;

    let hash_started = Instant::now();
    let mut state_hash = CanonicalHash::default();
    for _ in 0..20_000 {
        state_hash = runtime.state_hash();
    }
    black_box(state_hash);
    let state_hash_ms = hash_started.elapsed().as_secs_f64() * 1_000.0;

    let edit_started = Instant::now();
    let mut accepted = 0_u32;
    for index in 0..10_000 {
        let position = CellPositionV1 {
            x: index % 31 - 15,
            y: (index / 31) % 64 - 16,
            z: (index / (31 * 64)) % 31 - 15,
        };
        let world_identity = runtime.world().identity();
        let world_batch = WorldMutationBatchR4V1 {
            schema_version: WORLD_AUTHORITY_SCHEMA_V1,
            batch_id: format!("world-{index}"),
            authority_id: "benchmark-host".into(),
            address: world_identity.address,
            expected_revision: world_identity.revision,
            commands: vec![WorldMutationCommandR4V1::SetBlock {
                position,
                block_id: if index % 2 == 0 { 1 } else { 2 },
                facing: None,
            }],
        };
        let mut integrated = IntegratedRuntimeBatchV2::empty(format!("integrated-{index}"), runtime.identity());
        integrated.world.push(world_batch);
        accepted += u32::from(runtime.commit(integrated).accepted());
    }
    let edit_ms = edit_started.elapsed().as_secs_f64() * 1_000.0;

    let step_started = Instant::now();
    for index in 0..20_000_u64 {
        black_box(runtime.step(1_000_000 + index * 50_000, 1_000).expect("fixed step"));
    }
    let step_ms = step_started.elapsed().as_secs_f64() * 1_000.0;

    println!(
        "{{\"schemaVersion\":1,\"residentSections\":{},\"generationChunks\":9,\"generationMs\":{generation_ms:.3},\"readPages\":500,\"readPageCells\":49152,\"readPagesMs\":{page_ms:.3},\"stateHashes\":20000,\"stateHashesMs\":{state_hash_ms:.3},\"edits\":10000,\"acceptedEdits\":{accepted},\"editsMs\":{edit_ms:.3},\"steps\":20000,\"stepsMs\":{step_ms:.3},\"finalHash\":\"{}\"}}",
        runtime.world().resident_section_count(),
        runtime.state_hash().to_hex(),
    );
}

fn parse_hash(value: &str) -> CanonicalHash {
    assert_eq!(value.len(), 32, "fixture hash width");
    let mut bytes = [0_u8; 16];
    for (index, byte) in bytes.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&value[index * 2..index * 2 + 2], 16).expect("fixture hash byte");
    }
    CanonicalHash(bytes)
}
