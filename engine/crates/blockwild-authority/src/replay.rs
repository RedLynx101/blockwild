use std::collections::BTreeSet;

use blockwild_types::CanonicalHasher;

use crate::{
    AuthorityResult, BlockCatalogV1, CellPositionV1, LiquidMetadataV1, ReadOriginV1, ReadSizeV1, SectionInstallV1,
    WORLD_AIR_BLOCK_ID_V1, WORLD_AUTHORITY_SCHEMA_V1, WORLD_SECTION_CELL_COUNT_V1, WorldAddressV1,
    WorldAuthorityStoreR4V1, WorldCellV1, WorldMutationBatchR4V1, WorldMutationCommandR4V1, WorldMutationReceiptR4V1,
    WorldReadPageV1, WorldSectionAddressV1,
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuthorityFixtureReportV1 {
    pub initial_identity_hash: String,
    pub initial_page_hash: String,
    pub mutation_identity_hash: String,
    pub mutation_delta_hash: String,
    pub mutated_page_hash: String,
    pub save_compatibility_checksum: String,
    pub save_extension_checksum: String,
    pub replay_hash: String,
}

impl AuthorityFixtureReportV1 {
    #[must_use]
    pub fn lines(&self) -> String {
        format!(
            "initial_identity_hash={}\ninitial_page_hash={}\nmutation_identity_hash={}\nmutation_delta_hash={}\nmutated_page_hash={}\nsave_compatibility_checksum={}\nsave_extension_checksum={}\nreplay_hash={}\n",
            self.initial_identity_hash,
            self.initial_page_hash,
            self.mutation_identity_hash,
            self.mutation_delta_hash,
            self.mutated_page_hash,
            self.save_compatibility_checksum,
            self.save_extension_checksum,
            self.replay_hash
        )
    }
}

pub fn run_authority_fixture_v1() -> AuthorityResult<AuthorityFixtureReportV1> {
    let address = WorldAddressV1::new("1", "overworld")?;
    let catalog = BlockCatalogV1 {
        directional_blocks: BTreeSet::from([20_u16]),
        waterlogged_blocks: BTreeSet::from([52_u16]),
        water_block_id: 7,
    };
    let mut authority = WorldAuthorityStoreR4V1::new(address.clone(), catalog)?;
    let section = WorldSectionAddressV1 {
        world: address.clone(),
        chunk_x: -1,
        chunk_z: -1,
        section_y: 4,
    };
    let mut cells = vec![WorldCellV1::default(); WORLD_SECTION_CELL_COUNT_V1];
    let bedrock = CellPositionV1 { x: -1, y: 0, z: -1 };
    cells[bedrock.section_index()] = WorldCellV1 {
        block_id: 14,
        ..WorldCellV1::default()
    };
    authority.install_section_for_replay(SectionInstallV1 {
        address: section,
        cells,
        source_revision: 7,
        source_hash: "11111111111111111111111111111111".into(),
    })?;

    let initial_identity_hash = authority.identity().state_hash;
    let initial_page = WorldReadPageV1::capture(
        &authority,
        ReadOriginV1 { x: -1, y: -1, z: -1 },
        ReadSizeV1 { x: 2, y: 3, z: 2 },
    )?;
    let initial_page_hash = initial_page.snapshot_hash;
    let receipt = authority.apply_mutation_batch(WorldMutationBatchR4V1 {
        schema_version: WORLD_AUTHORITY_SCHEMA_V1,
        batch_id: "r4-fixture-edit".into(),
        authority_id: "fixture-host".into(),
        address,
        expected_revision: authority.revision(),
        commands: vec![
            WorldMutationCommandR4V1::SetBlock {
                position: CellPositionV1 { x: -1, y: 0, z: -1 },
                block_id: 20,
                facing: Some(3),
            },
            WorldMutationCommandR4V1::SetLiquid {
                position: CellPositionV1 { x: -1, y: 0, z: -1 },
                liquid: LiquidMetadataV1 {
                    kind: crate::WorldLiquidKindV1::Water,
                    level: 8,
                    source: true,
                    falling: false,
                    contains_water: true,
                    waterlogged: true,
                },
            },
            WorldMutationCommandR4V1::SetBlock {
                position: CellPositionV1 { x: -2, y: 0, z: -1 },
                block_id: WORLD_AIR_BLOCK_ID_V1,
                facing: None,
            },
        ],
    });
    let (mutation_identity_hash, mutation_delta_hash) = match receipt {
        WorldMutationReceiptR4V1::Accepted {
            after,
            delta: Some(delta),
            ..
        } => (after.state_hash, delta.checksum),
        other => panic!("fixture mutation must be accepted: {other:?}"),
    };
    let mutated_page_hash = WorldReadPageV1::capture(
        &authority,
        ReadOriginV1 { x: -1, y: -1, z: -1 },
        ReadSizeV1 { x: 2, y: 3, z: 2 },
    )?
    .snapshot_hash;
    let save = authority.export_compatibility_save();
    let mut hasher = CanonicalHasher::new("blockwild-authority-r4-fixture-v1");
    for value in [
        &initial_identity_hash,
        &initial_page_hash,
        &mutation_identity_hash,
        &mutation_delta_hash,
        &mutated_page_hash,
        &save.compatibility_checksum,
        &save.extension_checksum,
    ] {
        hasher.write_str(value);
    }
    Ok(AuthorityFixtureReportV1 {
        initial_identity_hash,
        initial_page_hash,
        mutation_identity_hash,
        mutation_delta_hash,
        mutated_page_hash,
        save_compatibility_checksum: save.compatibility_checksum,
        save_extension_checksum: save.extension_checksum,
        replay_hash: hasher.finish().to_hex(),
    })
}
