use crate::{AabbV1, CellPos, ContractError, Vec3, WorldReadWindowV1};

pub const COLLISION_MAX_OVERRIDES_V1: usize = 16_384;
pub const COLLISION_MAX_BOXES_PER_CELL_V1: usize = 8;

/// Renderer-free collision replacement for one loaded voxel.
///
/// An empty `boxes` vector marks a deliberately non-colliding cell, such as an
/// open fence gate. Bounds are local to the block center: a full cube is
/// `[-0.5, -0.5, -0.5]..[0.5, 0.5, 0.5]`.
#[derive(Clone, Debug, PartialEq)]
pub struct CollisionCellOverrideV1 {
    pub position: CellPos,
    pub boxes: Vec<AabbV1>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct CollisionShapeWindowV1 {
    pub world: WorldReadWindowV1,
    /// Strict cell order makes lookup and hashing independent of caller order.
    pub overrides: Vec<CollisionCellOverrideV1>,
}

impl CollisionShapeWindowV1 {
    pub fn validate(&self) -> Result<(), ContractError> {
        self.world.validate()?;
        if self.overrides.len() > COLLISION_MAX_OVERRIDES_V1 {
            return Err(ContractError::InvalidBudget);
        }
        let mut previous = None;
        for entry in &self.overrides {
            if previous.is_some_and(|position| position >= entry.position)
                || self.world.index(entry.position).is_none()
                || self.world.sample(entry.position).is_none_or(|sample| !sample.loaded)
                || entry.boxes.len() > COLLISION_MAX_BOXES_PER_CELL_V1
            {
                return Err(ContractError::InvalidFlags);
            }
            for bounds in &entry.boxes {
                let values = [
                    bounds.minimum.x,
                    bounds.minimum.y,
                    bounds.minimum.z,
                    bounds.maximum.x,
                    bounds.maximum.y,
                    bounds.maximum.z,
                ];
                if values.iter().any(|value| !value.is_finite())
                    || bounds.minimum.x >= bounds.maximum.x
                    || bounds.minimum.y >= bounds.maximum.y
                    || bounds.minimum.z >= bounds.maximum.z
                    || bounds.minimum.x < -0.5
                    || bounds.minimum.y < -0.5
                    || bounds.minimum.z < -0.5
                    || bounds.maximum.x > 0.5
                    || bounds.maximum.y > 1.0
                    || bounds.maximum.z > 0.5
                {
                    return Err(ContractError::InvalidNumber);
                }
            }
            previous = Some(entry.position);
        }
        Ok(())
    }

    fn override_for(&self, position: CellPos) -> Option<&CollisionCellOverrideV1> {
        self.overrides
            .binary_search_by_key(&position, |entry| entry.position)
            .ok()
            .and_then(|index| self.overrides.get(index))
    }
}

/// Exact slab used by the TypeScript legacy door collision path.
#[must_use]
pub fn legacy_door_override(position: CellPos, door_uses_x_axis: bool, open: bool) -> CollisionCellOverrideV1 {
    let plane_along_z = door_uses_x_axis != open;
    let (minimum_x, maximum_x) = if plane_along_z {
        if open { (-0.5, -0.34) } else { (-0.08, 0.08) }
    } else {
        (-0.48, 0.48)
    };
    let (minimum_z, maximum_z) = if plane_along_z {
        (-0.48, 0.48)
    } else if open {
        (-0.5, -0.34)
    } else {
        (-0.08, 0.08)
    };
    CollisionCellOverrideV1 {
        position,
        boxes: vec![AabbV1::new(
            Vec3::new(minimum_x, -0.5, minimum_z),
            Vec3::new(maximum_x, 0.5, maximum_z),
        )],
    }
}

/// Exact legacy gate slab. An open gate intentionally overrides the solid
/// block with no collision boxes.
#[must_use]
pub fn legacy_gate_override(position: CellPos, north_south: bool, open: bool) -> CollisionCellOverrideV1 {
    let boxes = if open {
        Vec::new()
    } else {
        let (minimum_x, maximum_x, minimum_z, maximum_z) = if north_south {
            (-0.48, 0.48, -0.1, 0.1)
        } else {
            (-0.1, 0.1, -0.48, 0.48)
        };
        vec![AabbV1::new(
            Vec3::new(minimum_x, -0.5, minimum_z),
            Vec3::new(maximum_x, 0.75, maximum_z),
        )]
    };
    CollisionCellOverrideV1 { position, boxes }
}

/// Partial-height block used for slabs, authored stair treads, and fences.
#[must_use]
pub fn legacy_height_override(position: CellPos, collision_height: f64) -> CollisionCellOverrideV1 {
    CollisionCellOverrideV1 {
        position,
        boxes: vec![AabbV1::new(
            Vec3::new(-0.5, -0.5, -0.5),
            Vec3::new(0.5, -0.5 + collision_height, 0.5),
        )],
    }
}

fn body_intersects_box(position: Vec3, radius: f64, height: f64, cell: CellPos, bounds: AabbV1) -> bool {
    let minimum_x = f64::from(cell.x) + bounds.minimum.x;
    let maximum_x = f64::from(cell.x) + bounds.maximum.x;
    let minimum_y = f64::from(cell.y) + bounds.minimum.y;
    let maximum_y = f64::from(cell.y) + bounds.maximum.y;
    let minimum_z = f64::from(cell.z) + bounds.minimum.z;
    let maximum_z = f64::from(cell.z) + bounds.maximum.z;
    position.x + radius > minimum_x
        && position.x - radius < maximum_x
        && position.y + height > minimum_y
        && position.y < maximum_y
        && position.z + radius > minimum_z
        && position.z - radius < maximum_z
}

/// Returns `(blocked, touched_unknown_boundary)` using a complete immutable
/// window. Missing or unloaded cells always fail closed before overrides.
#[must_use]
pub fn collides_body_shapes(window: &CollisionShapeWindowV1, position: Vec3, radius: f64, height: f64) -> (bool, bool) {
    let minimum_x = (position.x - radius + 0.5).floor() as i32;
    let maximum_x = (position.x + radius - 0.001 + 0.5).floor() as i32;
    let minimum_y = (position.y + 0.25).floor() as i32;
    let maximum_y = (position.y + height - 0.001 + 0.5).floor() as i32;
    let minimum_z = (position.z - radius + 0.5).floor() as i32;
    let maximum_z = (position.z + radius - 0.001 + 0.5).floor() as i32;
    let mut unknown = false;
    for y in minimum_y..=maximum_y {
        for z in minimum_z..=maximum_z {
            for x in minimum_x..=maximum_x {
                let cell = CellPos::new(x, y, z);
                let sample = window.world.sample(cell);
                if sample.is_none_or(|value| !value.loaded) {
                    unknown = true;
                    return (true, unknown);
                }
                if let Some(entry) = window.override_for(cell) {
                    if entry
                        .boxes
                        .iter()
                        .any(|bounds| body_intersects_box(position, radius, height, cell, *bounds))
                    {
                        return (true, unknown);
                    }
                } else if window.world.is_collision_solid(cell)
                    && body_intersects_box(
                        position,
                        radius,
                        height,
                        cell,
                        AabbV1::new(Vec3::new(-0.5, -0.5, -0.5), Vec3::new(0.5, 0.5, 0.5)),
                    )
                {
                    return (true, unknown);
                }
            }
        }
    }
    (false, unknown)
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct ShapedAxisSweepResultV1 {
    pub position: Vec3,
    pub blocked: bool,
    pub unknown_boundary: bool,
}

#[must_use]
pub fn sweep_body_axis_shapes(
    window: &CollisionShapeWindowV1,
    position: Vec3,
    radius: f64,
    height: f64,
    axis: usize,
    distance: f64,
    maximum_step: f64,
) -> ShapedAxisSweepResultV1 {
    let steps = ((distance.abs() / maximum_step.max(0.01)).ceil() as usize).max(1);
    let step = distance / steps as f64;
    let mut current = position;
    let mut unknown_boundary = false;
    for _ in 0..steps {
        let mut candidate = current;
        match axis {
            0 => candidate.x += step,
            1 => candidate.y += step,
            _ => candidate.z += step,
        }
        let (blocked, unknown) = collides_body_shapes(window, candidate, radius, height);
        unknown_boundary |= unknown;
        if blocked {
            return ShapedAxisSweepResultV1 {
                position: current,
                blocked: true,
                unknown_boundary,
            };
        }
        current = candidate;
    }
    ShapedAxisSweepResultV1 {
        position: current,
        blocked: false,
        unknown_boundary,
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct HorizontalStepResultV1 {
    pub position: Vec3,
    pub blocked: bool,
    pub stepped: bool,
    pub unknown_boundary: bool,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct HorizontalStepInputV1 {
    pub position: Vec3,
    pub radius: f64,
    pub height: f64,
    pub axis: usize,
    pub distance: f64,
    pub maximum_sweep_step: f64,
    pub step_height: f64,
}

/// Sweeps one horizontal axis and, when blocked, attempts a bounded stair
/// rise. Passing `step_height = 0` reproduces the legacy no-auto-step path.
#[must_use]
pub fn sweep_body_horizontal_with_step(
    window: &CollisionShapeWindowV1,
    input: HorizontalStepInputV1,
) -> HorizontalStepResultV1 {
    let direct = sweep_body_axis_shapes(
        window,
        input.position,
        input.radius,
        input.height,
        input.axis,
        input.distance,
        input.maximum_sweep_step,
    );
    if !direct.blocked || input.step_height <= 0.0 {
        return HorizontalStepResultV1 {
            position: direct.position,
            blocked: direct.blocked,
            stepped: false,
            unknown_boundary: direct.unknown_boundary,
        };
    }
    let rise = sweep_body_axis_shapes(
        window,
        input.position,
        input.radius,
        input.height,
        1,
        input.step_height,
        input.maximum_sweep_step,
    );
    if rise.blocked {
        return HorizontalStepResultV1 {
            position: direct.position,
            blocked: true,
            stepped: false,
            unknown_boundary: direct.unknown_boundary || rise.unknown_boundary,
        };
    }
    let horizontal = sweep_body_axis_shapes(
        window,
        rise.position,
        input.radius,
        input.height,
        input.axis,
        input.distance,
        input.maximum_sweep_step,
    );
    if horizontal.blocked {
        return HorizontalStepResultV1 {
            position: direct.position,
            blocked: true,
            stepped: false,
            unknown_boundary: direct.unknown_boundary || rise.unknown_boundary || horizontal.unknown_boundary,
        };
    }
    let settle = sweep_body_axis_shapes(
        window,
        horizontal.position,
        input.radius,
        input.height,
        1,
        -(input.step_height + input.maximum_sweep_step),
        input.maximum_sweep_step.min(0.04),
    );
    HorizontalStepResultV1 {
        position: settle.position,
        blocked: false,
        stepped: true,
        unknown_boundary: direct.unknown_boundary
            || rise.unknown_boundary
            || horizontal.unknown_boundary
            || settle.unknown_boundary,
    }
}
