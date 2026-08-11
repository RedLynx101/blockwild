use std::collections::{BTreeMap, BTreeSet};

use crate::{AabbV1, ContractError};

pub const BROADPHASE_MAX_ENTITIES_V1: usize = 65_536;
pub const BROADPHASE_MAX_QUERIES_V1: usize = 8_192;
pub const BROADPHASE_MAX_CELL_REFERENCES_V1: usize = 512 * 1024;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct BroadphaseEntityV1 {
    pub entity_id: u64,
    pub bounds: AabbV1,
    pub layer_mask: u32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct BroadphaseQueryV1 {
    pub query_id: u64,
    pub bounds: AabbV1,
    pub layer_mask: u32,
    pub maximum_results: usize,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BroadphaseQueryResultV1 {
    pub query_id: u64,
    pub entity_ids: Vec<u64>,
    pub truncated: bool,
}

fn validate_bounds(bounds: AabbV1) -> bool {
    let values = [
        bounds.minimum.x,
        bounds.minimum.y,
        bounds.minimum.z,
        bounds.maximum.x,
        bounds.maximum.y,
        bounds.maximum.z,
    ];
    values.iter().all(|value| value.is_finite())
        && bounds.minimum.x <= bounds.maximum.x
        && bounds.minimum.y <= bounds.maximum.y
        && bounds.minimum.z <= bounds.maximum.z
}

fn overlaps(left: AabbV1, right: AabbV1) -> bool {
    left.maximum.x >= right.minimum.x
        && left.minimum.x <= right.maximum.x
        && left.maximum.y >= right.minimum.y
        && left.minimum.y <= right.maximum.y
        && left.maximum.z >= right.minimum.z
        && left.minimum.z <= right.maximum.z
}

fn cell_range(bounds: AabbV1, cell_size: f64) -> ([i32; 3], [i32; 3]) {
    (
        [
            (bounds.minimum.x / cell_size).floor() as i32,
            (bounds.minimum.y / cell_size).floor() as i32,
            (bounds.minimum.z / cell_size).floor() as i32,
        ],
        [
            (bounds.maximum.x / cell_size).floor() as i32,
            (bounds.maximum.y / cell_size).floor() as i32,
            (bounds.maximum.z / cell_size).floor() as i32,
        ],
    )
}

/// Packed, deterministic broadphase. Both entity and query insertion order are
/// discarded; every returned candidate list is ascending by stable entity ID.
pub fn run_broadphase_batch(
    cell_size: f64,
    entities: &[BroadphaseEntityV1],
    queries: &[BroadphaseQueryV1],
) -> Result<Vec<BroadphaseQueryResultV1>, ContractError> {
    if !cell_size.is_finite() || !(0.25..=256.0).contains(&cell_size) {
        return Err(ContractError::InvalidNumber);
    }
    if entities.len() > BROADPHASE_MAX_ENTITIES_V1 || queries.len() > BROADPHASE_MAX_QUERIES_V1 {
        return Err(ContractError::InvalidBudget);
    }
    let mut ordered_entities = entities.to_vec();
    ordered_entities.sort_by_key(|entity| entity.entity_id);
    if ordered_entities
        .windows(2)
        .any(|pair| pair[0].entity_id == pair[1].entity_id)
        || ordered_entities
            .iter()
            .any(|entity| !validate_bounds(entity.bounds) || entity.layer_mask == 0)
    {
        return Err(ContractError::InvalidFlags);
    }
    let by_id: BTreeMap<_, _> = ordered_entities
        .iter()
        .map(|entity| (entity.entity_id, *entity))
        .collect();
    let mut cells = BTreeMap::<(i32, i32, i32), Vec<u64>>::new();
    let mut cell_references = 0_usize;
    for entity in &ordered_entities {
        let (minimum, maximum) = cell_range(entity.bounds, cell_size);
        for y in minimum[1]..=maximum[1] {
            for z in minimum[2]..=maximum[2] {
                for x in minimum[0]..=maximum[0] {
                    cell_references += 1;
                    if cell_references > BROADPHASE_MAX_CELL_REFERENCES_V1 {
                        return Err(ContractError::InvalidBudget);
                    }
                    cells.entry((x, y, z)).or_default().push(entity.entity_id);
                }
            }
        }
    }
    let mut ordered_queries = queries.to_vec();
    ordered_queries.sort_by_key(|query| query.query_id);
    if ordered_queries
        .windows(2)
        .any(|pair| pair[0].query_id == pair[1].query_id)
        || ordered_queries.iter().any(|query| {
            !validate_bounds(query.bounds)
                || query.layer_mask == 0
                || query.maximum_results == 0
                || query.maximum_results > BROADPHASE_MAX_ENTITIES_V1
        })
    {
        return Err(ContractError::InvalidFlags);
    }
    let mut output = Vec::with_capacity(ordered_queries.len());
    for query in ordered_queries {
        let (minimum, maximum) = cell_range(query.bounds, cell_size);
        let span_x = i64::from(maximum[0]) - i64::from(minimum[0]) + 1;
        let span_y = i64::from(maximum[1]) - i64::from(minimum[1]) + 1;
        let span_z = i64::from(maximum[2]) - i64::from(minimum[2]) + 1;
        let query_cells = span_x
            .checked_mul(span_y)
            .and_then(|value| value.checked_mul(span_z))
            .and_then(|value| usize::try_from(value).ok())
            .ok_or(ContractError::InvalidBudget)?;
        if query_cells > BROADPHASE_MAX_CELL_REFERENCES_V1 {
            return Err(ContractError::InvalidBudget);
        }
        let mut candidates = BTreeSet::new();
        for y in minimum[1]..=maximum[1] {
            for z in minimum[2]..=maximum[2] {
                for x in minimum[0]..=maximum[0] {
                    if let Some(entries) = cells.get(&(x, y, z)) {
                        candidates.extend(entries);
                    }
                }
            }
        }
        let mut entity_ids: Vec<_> = candidates
            .into_iter()
            .filter(|entity_id| {
                by_id.get(entity_id).is_some_and(|entity| {
                    entity.layer_mask & query.layer_mask != 0 && overlaps(entity.bounds, query.bounds)
                })
            })
            .collect();
        let truncated = entity_ids.len() > query.maximum_results;
        entity_ids.truncate(query.maximum_results);
        output.push(BroadphaseQueryResultV1 {
            query_id: query.query_id,
            entity_ids,
            truncated,
        });
    }
    Ok(output)
}
