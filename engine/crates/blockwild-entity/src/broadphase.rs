use std::collections::{BTreeMap, BTreeSet};
use std::error::Error;
use std::fmt;

use blockwild_types::EntityId;

use crate::Vec3;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct EntityBroadphaseEntry {
    pub id: EntityId,
    pub center: Vec3,
    pub radius: f32,
    pub half_height: f32,
}

impl EntityBroadphaseEntry {
    pub fn validate(self) -> Result<(), BroadphaseError> {
        if !self.center.is_finite() || !self.radius.is_finite() || !self.half_height.is_finite() {
            return Err(BroadphaseError::NonFinite);
        }
        if self.radius < 0.0 || self.half_height < 0.0 {
            return Err(BroadphaseError::NegativeExtent);
        }
        Ok(())
    }
}

#[derive(Clone, Debug)]
struct StoredEntry {
    entry: EntityBroadphaseEntry,
    xz_cells: Vec<[i32; 2]>,
    cells_3d: Vec<[i32; 3]>,
}

/// Deterministic entity broadphase with independent XZ and 3D indexes.
#[derive(Clone, Debug)]
pub struct EntityBroadphase {
    cell_size: f32,
    entries: BTreeMap<EntityId, StoredEntry>,
    xz: BTreeMap<[i32; 2], BTreeSet<EntityId>>,
    three_d: BTreeMap<[i32; 3], BTreeSet<EntityId>>,
}

impl EntityBroadphase {
    pub fn new(cell_size: f32) -> Result<Self, BroadphaseError> {
        if !cell_size.is_finite() || cell_size <= 0.0 {
            return Err(BroadphaseError::InvalidCellSize);
        }
        Ok(Self {
            cell_size,
            entries: BTreeMap::new(),
            xz: BTreeMap::new(),
            three_d: BTreeMap::new(),
        })
    }

    #[must_use]
    pub const fn cell_size(&self) -> f32 {
        self.cell_size
    }

    #[must_use]
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    pub fn clear(&mut self) {
        self.entries.clear();
        self.xz.clear();
        self.three_d.clear();
    }

    pub fn rebuild(&mut self, entries: impl IntoIterator<Item = EntityBroadphaseEntry>) -> Result<(), BroadphaseError> {
        self.clear();
        for entry in entries {
            self.upsert(entry)?;
        }
        Ok(())
    }

    pub fn upsert(&mut self, entry: EntityBroadphaseEntry) -> Result<(), BroadphaseError> {
        entry.validate()?;
        self.remove(entry.id);
        let xz_cells = xz_cells_for(self.cell_size, entry);
        let cells_3d = cells_3d_for(self.cell_size, entry);
        for cell in &xz_cells {
            self.xz.entry(*cell).or_default().insert(entry.id);
        }
        for cell in &cells_3d {
            self.three_d.entry(*cell).or_default().insert(entry.id);
        }
        self.entries.insert(
            entry.id,
            StoredEntry {
                entry,
                xz_cells,
                cells_3d,
            },
        );
        Ok(())
    }

    pub fn remove(&mut self, id: EntityId) -> bool {
        let Some(stored) = self.entries.remove(&id) else {
            return false;
        };
        for cell in stored.xz_cells {
            remove_from_cell(&mut self.xz, cell, id);
        }
        for cell in stored.cells_3d {
            remove_from_cell(&mut self.three_d, cell, id);
        }
        true
    }

    #[must_use]
    pub fn get(&self, id: EntityId) -> Option<EntityBroadphaseEntry> {
        self.entries.get(&id).map(|stored| stored.entry)
    }

    /// Exact XZ circle-overlap query including each candidate's radius.
    #[must_use]
    pub fn query_xz_overlap(&self, center: Vec3, radius: f32) -> Vec<EntityId> {
        if !center.is_finite() || !radius.is_finite() {
            return Vec::new();
        }
        let radius = radius.max(0.0);
        let minimum = [
            ((center.x - radius) / self.cell_size).floor() as i32,
            ((center.z - radius) / self.cell_size).floor() as i32,
        ];
        let maximum = [
            ((center.x + radius) / self.cell_size).floor() as i32,
            ((center.z + radius) / self.cell_size).floor() as i32,
        ];
        let mut candidates = BTreeSet::new();
        for x in minimum[0]..=maximum[0] {
            for z in minimum[1]..=maximum[1] {
                if let Some(ids) = self.xz.get(&[x, z]) {
                    candidates.extend(ids);
                }
            }
        }
        candidates
            .into_iter()
            .filter(|id| {
                let entry = self.entries[id].entry;
                let dx = entry.center.x - center.x;
                let dz = entry.center.z - center.z;
                let total = radius + entry.radius;
                dx.mul_add(dx, dz * dz) <= total * total
            })
            .collect()
    }

    /// Exact sphere-versus-vertical-capsule broadphase query in stable ID order.
    #[must_use]
    pub fn query_sphere(&self, center: Vec3, radius: f32) -> Vec<EntityId> {
        if !center.is_finite() || !radius.is_finite() {
            return Vec::new();
        }
        let radius = radius.max(0.0);
        let minimum = Vec3::new(center.x - radius, center.y - radius, center.z - radius);
        let maximum = Vec3::new(center.x + radius, center.y + radius, center.z + radius);
        self.query_3d_cells(minimum, maximum)
            .into_iter()
            .filter(|id| sphere_overlaps_vertical_capsule(center, radius, self.entries[id].entry))
            .collect()
    }

    /// Exact AABB query against entity cylinder bounds in stable ID order.
    #[must_use]
    pub fn query_aabb(&self, minimum: Vec3, maximum: Vec3) -> Vec<EntityId> {
        if !minimum.is_finite() || !maximum.is_finite() {
            return Vec::new();
        }
        let low = Vec3::new(
            minimum.x.min(maximum.x),
            minimum.y.min(maximum.y),
            minimum.z.min(maximum.z),
        );
        let high = Vec3::new(
            minimum.x.max(maximum.x),
            minimum.y.max(maximum.y),
            minimum.z.max(maximum.z),
        );
        self.query_3d_cells(low, high)
            .into_iter()
            .filter(|id| {
                let entry = self.entries[id].entry;
                entry.center.x + entry.radius >= low.x
                    && entry.center.x - entry.radius <= high.x
                    && entry.center.y + entry.half_height >= low.y
                    && entry.center.y - entry.half_height <= high.y
                    && entry.center.z + entry.radius >= low.z
                    && entry.center.z - entry.radius <= high.z
            })
            .collect()
    }

    fn query_3d_cells(&self, minimum: Vec3, maximum: Vec3) -> BTreeSet<EntityId> {
        let low = minimum.to_array().map(|value| (value / self.cell_size).floor() as i32);
        let high = maximum.to_array().map(|value| (value / self.cell_size).floor() as i32);
        let mut candidates = BTreeSet::new();
        for x in low[0]..=high[0] {
            for y in low[1]..=high[1] {
                for z in low[2]..=high[2] {
                    if let Some(ids) = self.three_d.get(&[x, y, z]) {
                        candidates.extend(ids);
                    }
                }
            }
        }
        candidates
    }
}

fn xz_cells_for(cell_size: f32, entry: EntityBroadphaseEntry) -> Vec<[i32; 2]> {
    let minimum = [
        ((entry.center.x - entry.radius) / cell_size).floor() as i32,
        ((entry.center.z - entry.radius) / cell_size).floor() as i32,
    ];
    let maximum = [
        ((entry.center.x + entry.radius) / cell_size).floor() as i32,
        ((entry.center.z + entry.radius) / cell_size).floor() as i32,
    ];
    let mut cells = Vec::new();
    for x in minimum[0]..=maximum[0] {
        for z in minimum[1]..=maximum[1] {
            cells.push([x, z]);
        }
    }
    cells
}

fn cells_3d_for(cell_size: f32, entry: EntityBroadphaseEntry) -> Vec<[i32; 3]> {
    let minimum = [
        ((entry.center.x - entry.radius) / cell_size).floor() as i32,
        ((entry.center.y - entry.half_height) / cell_size).floor() as i32,
        ((entry.center.z - entry.radius) / cell_size).floor() as i32,
    ];
    let maximum = [
        ((entry.center.x + entry.radius) / cell_size).floor() as i32,
        ((entry.center.y + entry.half_height) / cell_size).floor() as i32,
        ((entry.center.z + entry.radius) / cell_size).floor() as i32,
    ];
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

fn sphere_overlaps_vertical_capsule(center: Vec3, radius: f32, entry: EntityBroadphaseEntry) -> bool {
    let segment_min = entry.center.y - entry.half_height;
    let segment_max = entry.center.y + entry.half_height;
    let closest_y = center.y.clamp(segment_min, segment_max);
    let dx = center.x - entry.center.x;
    let dy = center.y - closest_y;
    let dz = center.z - entry.center.z;
    let total = radius + entry.radius;
    dx.mul_add(dx, dy.mul_add(dy, dz * dz)) <= total * total
}

fn remove_from_cell<const N: usize>(cells: &mut BTreeMap<[i32; N], BTreeSet<EntityId>>, cell: [i32; N], id: EntityId) {
    let remove_cell = if let Some(ids) = cells.get_mut(&cell) {
        ids.remove(&id);
        ids.is_empty()
    } else {
        false
    };
    if remove_cell {
        cells.remove(&cell);
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BroadphaseError {
    InvalidCellSize,
    NonFinite,
    NegativeExtent,
}

impl fmt::Display for BroadphaseError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidCellSize => formatter.write_str("broadphase cell size must be finite and positive"),
            Self::NonFinite => formatter.write_str("broadphase entry must be finite"),
            Self::NegativeExtent => formatter.write_str("broadphase entry extents cannot be negative"),
        }
    }
}

impl Error for BroadphaseError {}
