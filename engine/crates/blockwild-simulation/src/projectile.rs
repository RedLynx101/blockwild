use crate::Vec3;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct AabbV1 {
    pub minimum: Vec3,
    pub maximum: Vec3,
}

impl AabbV1 {
    #[must_use]
    pub fn new(first: Vec3, second: Vec3) -> Self {
        Self {
            minimum: Vec3::new(first.x.min(second.x), first.y.min(second.y), first.z.min(second.z)),
            maximum: Vec3::new(first.x.max(second.x), first.y.max(second.y), first.z.max(second.z)),
        }
    }

    #[must_use]
    pub fn expanded(self, amount: Vec3) -> Self {
        Self {
            minimum: Vec3::new(
                self.minimum.x - amount.x,
                self.minimum.y - amount.y,
                self.minimum.z - amount.z,
            ),
            maximum: Vec3::new(
                self.maximum.x + amount.x,
                self.maximum.y + amount.y,
                self.maximum.z + amount.z,
            ),
        }
    }

    #[must_use]
    pub fn center(self) -> Vec3 {
        (self.minimum + self.maximum) * 0.5
    }

    #[must_use]
    pub fn half_extents(self) -> Vec3 {
        (self.maximum - self.minimum) * 0.5
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SweepHitV1 {
    /// Normalized time in the closed interval 0..=1.
    pub time: f64,
    pub point: Vec3,
    pub normal: Vec3,
}

/// Sweeps a point through a static AABB without temporal subdivision.
#[must_use]
pub fn sweep_point_aabb(origin: Vec3, displacement: Vec3, bounds: AabbV1) -> Option<SweepHitV1> {
    let origins = [origin.x, origin.y, origin.z];
    let deltas = [displacement.x, displacement.y, displacement.z];
    let minimum = [bounds.minimum.x, bounds.minimum.y, bounds.minimum.z];
    let maximum = [bounds.maximum.x, bounds.maximum.y, bounds.maximum.z];
    let mut entry = 0.0_f64;
    let mut exit = 1.0_f64;
    let mut entry_axis = 0_usize;
    let mut entry_sign = 0.0_f64;
    for axis in 0..3 {
        if deltas[axis].abs() <= f64::EPSILON {
            if origins[axis] < minimum[axis] || origins[axis] > maximum[axis] {
                return None;
            }
            continue;
        }
        let inverse = deltas[axis].recip();
        let first = (minimum[axis] - origins[axis]) * inverse;
        let second = (maximum[axis] - origins[axis]) * inverse;
        let near = first.min(second);
        let far = first.max(second);
        if near > entry {
            entry = near;
            entry_axis = axis;
            entry_sign = if deltas[axis] > 0.0 { -1.0 } else { 1.0 };
        }
        exit = exit.min(far);
        if exit < entry {
            return None;
        }
    }
    if !(0.0..=1.0).contains(&entry) {
        return None;
    }
    let mut normal = Vec3::default();
    match entry_axis {
        0 => normal.x = entry_sign,
        1 => normal.y = entry_sign,
        _ => normal.z = entry_sign,
    }
    Some(SweepHitV1 {
        time: entry,
        point: origin + displacement * entry,
        normal,
    })
}

/// Sweeps one axis-aligned box through another using a Minkowski expansion.
#[must_use]
pub fn sweep_aabb(moving: AabbV1, displacement: Vec3, target: AabbV1) -> Option<SweepHitV1> {
    sweep_point_aabb(moving.center(), displacement, target.expanded(moving.half_extents()))
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ProjectileSweepV1 {
    pub projectile_id: u64,
    pub origin: Vec3,
    pub displacement: Vec3,
    pub radius: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SweepTargetV1 {
    pub target_id: u64,
    pub bounds: AabbV1,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ProjectileHitV1 {
    pub projectile_id: u64,
    pub target_id: u64,
    pub hit: SweepHitV1,
}

/// Stable batch sweep. Projectile and target input order cannot affect output.
#[must_use]
pub fn sweep_projectile_batch(projectiles: &[ProjectileSweepV1], targets: &[SweepTargetV1]) -> Vec<ProjectileHitV1> {
    let mut projectiles = projectiles.to_vec();
    projectiles.sort_by_key(|projectile| projectile.projectile_id);
    let mut targets = targets.to_vec();
    targets.sort_by_key(|target| target.target_id);
    let mut hits = Vec::new();
    for projectile in projectiles {
        if !projectile.radius.is_finite() || projectile.radius < 0.0 {
            continue;
        }
        let radius = Vec3::new(projectile.radius, projectile.radius, projectile.radius);
        let best = targets
            .iter()
            .filter_map(|target| {
                sweep_point_aabb(
                    projectile.origin,
                    projectile.displacement,
                    target.bounds.expanded(radius),
                )
                .map(|hit| (target.target_id, hit))
            })
            .min_by(|left, right| left.1.time.total_cmp(&right.1.time).then_with(|| left.0.cmp(&right.0)));
        if let Some((target_id, hit)) = best {
            hits.push(ProjectileHitV1 {
                projectile_id: projectile.projectile_id,
                target_id,
                hit,
            });
        }
    }
    hits
}
