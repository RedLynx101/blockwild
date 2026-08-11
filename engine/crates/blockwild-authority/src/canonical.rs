use blockwild_types::CanonicalHasher;

use crate::{
    AddressedSectionRevisionV1, CellPositionV1, LiquidMetadataV1, WorldAddressV1, WorldAuthorityIdentityV1,
    WorldAuthorityRevisionV1, WorldCellV1,
};

pub(crate) fn json_string(value: &str) -> String {
    let mut output = String::with_capacity(value.len() + 2);
    output.push('"');
    for character in value.chars() {
        match character {
            '"' => output.push_str("\\\""),
            '\\' => output.push_str("\\\\"),
            '\u{08}' => output.push_str("\\b"),
            '\u{0c}' => output.push_str("\\f"),
            '\n' => output.push_str("\\n"),
            '\r' => output.push_str("\\r"),
            '\t' => output.push_str("\\t"),
            value if value <= '\u{1f}' => {
                use core::fmt::Write as _;
                write!(&mut output, "\\u{:04x}", u32::from(value)).expect("writing to String cannot fail");
            }
            value => output.push(value),
        }
    }
    output.push('"');
    output
}

pub(crate) fn address_json(address: &WorldAddressV1) -> String {
    format!(
        "{{\"locationId\":{},\"universeId\":{}}}",
        json_string(&address.location_id),
        json_string(&address.universe_id)
    )
}

pub(crate) fn revision_json(revision: WorldAuthorityRevisionV1) -> String {
    format!(
        "{{\"epoch\":{},\"mutation\":{},\"residency\":{}}}",
        revision.epoch, revision.mutation, revision.residency
    )
}

pub(crate) fn identity_hash(address: &WorldAddressV1, revision: WorldAuthorityRevisionV1) -> String {
    let canonical = format!(
        "{{\"address\":{},\"revision\":{}}}",
        address_json(address),
        revision_json(revision)
    );
    hash_canonical_json("blockwild-world-authority-identity-v1", &canonical)
}

pub(crate) fn hash_canonical_json(domain: &str, canonical: &str) -> String {
    let mut hasher = CanonicalHasher::new(domain);
    hasher.write_str(canonical);
    hasher.finish().to_hex()
}

pub(crate) fn write_identity(hasher: &mut CanonicalHasher, identity: &WorldAuthorityIdentityV1) {
    hasher.write_str(&identity.state_hash);
}

pub(crate) fn write_section_revision(hasher: &mut CanonicalHasher, section: &AddressedSectionRevisionV1) {
    hasher.write_str(&section.address.key());
    hasher.write_u32(section.revision.blocks as u32);
    hasher.write_u32(section.revision.metadata as u32);
    hasher.write_u32(section.revision.halo as u32);
}

pub(crate) fn cell_json(position: CellPositionV1, cell: WorldCellV1, previous: WorldCellV1) -> String {
    format!(
        "{{\"blockId\":{},\"facing\":{},\"previousBlockId\":{},\"previousFacing\":{},\"x\":{},\"y\":{},\"z\":{}}}",
        cell.block_id, cell.facing, previous.block_id, previous.facing, position.x, position.y, position.z
    )
}

pub(crate) fn liquid_json(liquid: LiquidMetadataV1) -> String {
    format!(
        "{{\"containsWater\":{},\"falling\":{},\"kind\":{},\"level\":{},\"source\":{},\"waterlogged\":{}}}",
        liquid.contains_water, liquid.falling, liquid.kind as u8, liquid.level, liquid.source, liquid.waterlogged
    )
}
