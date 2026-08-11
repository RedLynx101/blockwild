use std::collections::BTreeSet;
use std::hint::black_box;
use std::time::Instant;

use blockwild_authority::{
    BlockCatalogV1, CellPositionV1, ReadOriginV1, ReadSizeV1, SectionInstallV1, WORLD_AUTHORITY_SCHEMA_V1,
    WORLD_SECTION_CELL_COUNT_V1, WorldAddressV1, WorldAuthorityStoreR4V1, WorldCellV1, WorldMutationBatchR4V1,
    WorldMutationCommandR4V1, WorldReadPageV1, WorldSectionAddressV1, run_authority_fixture_v1,
};

fn main() {
    let fixture = run_authority_fixture_v1().expect("fixture should run");
    print!("{}", fixture.lines());

    let address = WorldAddressV1::new("1", "benchmark").expect("valid address");
    let catalog = BlockCatalogV1 {
        directional_blocks: BTreeSet::from([20]),
        ..BlockCatalogV1::default()
    };
    let mut store = WorldAuthorityStoreR4V1::new(address.clone(), catalog).expect("store");
    for chunk_x in -2..=2 {
        for chunk_z in -2..=2 {
            for section_y in 0..12 {
                store
                    .install_section_for_replay(SectionInstallV1 {
                        address: WorldSectionAddressV1 {
                            world: address.clone(),
                            chunk_x,
                            chunk_z,
                            section_y,
                        },
                        cells: vec![WorldCellV1::default(); WORLD_SECTION_CELL_COUNT_V1],
                        source_revision: 1,
                        source_hash: "11111111111111111111111111111111".into(),
                    })
                    .expect("install");
            }
        }
    }
    let page_start = Instant::now();
    let mut page_digest = String::new();
    for offset in 0..500 {
        page_digest = WorldReadPageV1::capture(
            &store,
            ReadOriginV1 {
                x: -16 + offset % 3,
                y: -16,
                z: -16,
            },
            ReadSizeV1 { x: 32, y: 48, z: 32 },
        )
        .expect("page")
        .snapshot_hash;
    }
    let page_elapsed = page_start.elapsed();
    black_box(page_digest);

    let edit_start = Instant::now();
    for index in 0..10_000 {
        let position = CellPositionV1 {
            x: index % 31 - 15,
            y: (index / 31) % 64 - 16,
            z: (index / (31 * 64)) % 31 - 15,
        };
        let receipt = store.apply_mutation_batch(WorldMutationBatchR4V1 {
            schema_version: WORLD_AUTHORITY_SCHEMA_V1,
            batch_id: format!("bench-{index}"),
            authority_id: "benchmark".into(),
            address: address.clone(),
            expected_revision: store.revision(),
            commands: vec![WorldMutationCommandR4V1::SetBlock {
                position,
                block_id: if index % 2 == 0 { 1 } else { 2 },
                facing: None,
            }],
        });
        black_box(receipt);
    }
    let edit_elapsed = edit_start.elapsed();
    println!(
        "benchmark read_pages=500 cells_per_page={} elapsed_ms={} edits=10000 edit_elapsed_ms={} resident_sections={}",
        32 * 48 * 32,
        page_elapsed.as_millis(),
        edit_elapsed.as_millis(),
        store.resident_section_count()
    );
}
