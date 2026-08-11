use std::collections::{BTreeMap, BTreeSet};

use crate::StableId;

/// Axis-aligned bounds in world block units.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Aabb {
    pub min: [f64; 3],
    pub max: [f64; 3],
}

impl Aabb {
    #[must_use]
    pub fn new(a: [f64; 3], b: [f64; 3]) -> Self {
        Self {
            min: [a[0].min(b[0]), a[1].min(b[1]), a[2].min(b[2])],
            max: [a[0].max(b[0]), a[1].max(b[1]), a[2].max(b[2])],
        }
    }

    #[must_use]
    pub fn overlaps(self, other: Self) -> bool {
        (0..3).all(|axis| self.min[axis] <= other.max[axis] && self.max[axis] >= other.min[axis])
    }

    #[must_use]
    pub fn ray_entry(self, ray: Ray) -> Option<f64> {
        let mut near = 0.0_f64;
        let mut far = ray.max_distance;
        for axis in 0..3 {
            let direction = ray.direction[axis];
            if direction.abs() <= f64::EPSILON {
                if ray.origin[axis] < self.min[axis] || ray.origin[axis] > self.max[axis] {
                    return None;
                }
                continue;
            }
            let inverse = direction.recip();
            let first = (self.min[axis] - ray.origin[axis]) * inverse;
            let second = (self.max[axis] - ray.origin[axis]) * inverse;
            near = near.max(first.min(second));
            far = far.min(first.max(second));
            if far < near {
                return None;
            }
        }
        Some(near)
    }
}

/// Finite ray used by ordered batch queries.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Ray {
    pub origin: [f64; 3],
    pub direction: [f64; 3],
    pub max_distance: f64,
}

/// One deterministic spatial entry.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SpatialEntry {
    pub id: StableId,
    pub bounds: Aabb,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct AabbBatchQuery {
    pub query_id: u32,
    pub bounds: Aabb,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AabbBatchResult {
    pub query_id: u32,
    pub ids: Vec<StableId>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RayBatchQuery {
    pub query_id: u32,
    pub ray: Ray,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RayBatchResult {
    pub query_id: u32,
    pub hits: Vec<(StableId, f64)>,
}

/// Deterministic broadphase grid. Query output never depends on hash-map order.
#[derive(Clone, Debug)]
pub struct SpatialIndex {
    cell_size: f64,
    entries: BTreeMap<StableId, Aabb>,
    cells: BTreeMap<[i32; 3], BTreeSet<StableId>>,
}

impl SpatialIndex {
    #[must_use]
    pub fn new(cell_size: f64) -> Self {
        assert!(
            cell_size.is_finite() && cell_size > 0.0,
            "spatial cell size must be finite and positive"
        );
        Self {
            cell_size,
            entries: BTreeMap::new(),
            cells: BTreeMap::new(),
        }
    }

    pub fn upsert(&mut self, entry: SpatialEntry) {
        self.remove(entry.id);
        for cell in self.cells_for(entry.bounds) {
            self.cells.entry(cell).or_default().insert(entry.id);
        }
        self.entries.insert(entry.id, entry.bounds);
    }

    pub fn remove(&mut self, id: StableId) -> bool {
        let Some(bounds) = self.entries.remove(&id) else {
            return false;
        };
        for cell in self.cells_for(bounds) {
            if let Some(ids) = self.cells.get_mut(&cell) {
                ids.remove(&id);
                if ids.is_empty() {
                    self.cells.remove(&cell);
                }
            }
        }
        true
    }

    #[must_use]
    pub fn query_aabb_batch(&self, queries: &[AabbBatchQuery]) -> Vec<AabbBatchResult> {
        let mut ordered = queries.to_vec();
        ordered.sort_by_key(|query| query.query_id);
        ordered
            .into_iter()
            .map(|query| {
                let mut candidates = BTreeSet::new();
                for cell in self.cells_for(query.bounds) {
                    if let Some(ids) = self.cells.get(&cell) {
                        candidates.extend(ids);
                    }
                }
                let ids = candidates
                    .into_iter()
                    .filter(|id| self.entries.get(id).is_some_and(|bounds| bounds.overlaps(query.bounds)))
                    .collect();
                AabbBatchResult {
                    query_id: query.query_id,
                    ids,
                }
            })
            .collect()
    }

    #[must_use]
    pub fn query_ray_batch(&self, queries: &[RayBatchQuery]) -> Vec<RayBatchResult> {
        let mut ordered = queries.to_vec();
        ordered.sort_by_key(|query| query.query_id);
        ordered
            .into_iter()
            .map(|query| {
                let sweep = Aabb::new(
                    query.ray.origin,
                    [
                        query.ray.origin[0] + query.ray.direction[0] * query.ray.max_distance,
                        query.ray.origin[1] + query.ray.direction[1] * query.ray.max_distance,
                        query.ray.origin[2] + query.ray.direction[2] * query.ray.max_distance,
                    ],
                );
                let candidate_ids = self.query_aabb_batch(&[AabbBatchQuery {
                    query_id: 0,
                    bounds: sweep,
                }])[0]
                    .ids
                    .clone();
                let mut hits: Vec<_> = candidate_ids
                    .into_iter()
                    .filter_map(|id| self.entries[&id].ray_entry(query.ray).map(|distance| (id, distance)))
                    .collect();
                hits.sort_by(|left, right| left.1.total_cmp(&right.1).then_with(|| left.0.cmp(&right.0)));
                RayBatchResult {
                    query_id: query.query_id,
                    hits,
                }
            })
            .collect()
    }

    fn cells_for(&self, bounds: Aabb) -> Vec<[i32; 3]> {
        let minimum = bounds.min.map(|value| (value / self.cell_size).floor() as i32);
        let maximum = bounds.max.map(|value| (value / self.cell_size).floor() as i32);
        let mut cells = Vec::new();
        for x in minimum[0]..=maximum[0] {
            for y in minimum[1]..=maximum[1] {
                for z in minimum[2]..=maximum[2] {
                    cells.push([x, y, z]);
                }
            }
        }
        cells
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn batches_sort_queries_and_results_independent_of_insertion_order() {
        let near = SpatialEntry {
            id: StableId::new(7, 1),
            bounds: Aabb::new([2.0, 0.0, 0.0], [3.0, 1.0, 1.0]),
        };
        let far = SpatialEntry {
            id: StableId::new(2, 1),
            bounds: Aabb::new([6.0, 0.0, 0.0], [7.0, 1.0, 1.0]),
        };
        let mut first = SpatialIndex::new(4.0);
        first.upsert(far);
        first.upsert(near);
        let mut second = SpatialIndex::new(4.0);
        second.upsert(near);
        second.upsert(far);
        let queries = [
            RayBatchQuery {
                query_id: 9,
                ray: Ray {
                    origin: [0.0, 0.5, 0.5],
                    direction: [1.0, 0.0, 0.0],
                    max_distance: 10.0,
                },
            },
            RayBatchQuery {
                query_id: 3,
                ray: Ray {
                    origin: [0.0, 0.5, 0.5],
                    direction: [1.0, 0.0, 0.0],
                    max_distance: 4.0,
                },
            },
        ];
        let expected = first.query_ray_batch(&queries);
        assert_eq!(expected, second.query_ray_batch(&queries));
        assert_eq!(expected[0].query_id, 3);
        assert_eq!(
            expected[1].hits.iter().map(|hit| hit.0).collect::<Vec<_>>(),
            vec![near.id, far.id]
        );
    }
}
