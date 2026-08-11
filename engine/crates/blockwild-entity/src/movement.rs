use std::collections::BTreeMap;

use blockwild_types::EntityId;

const TAU: f32 = core::f32::consts::TAU;

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Vec3 {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

impl Vec3 {
    pub const ZERO: Self = Self { x: 0.0, y: 0.0, z: 0.0 };

    #[must_use]
    pub const fn new(x: f32, y: f32, z: f32) -> Self {
        Self { x, y, z }
    }

    #[must_use]
    pub const fn to_array(self) -> [f32; 3] {
        [self.x, self.y, self.z]
    }

    #[must_use]
    pub fn is_finite(self) -> bool {
        self.x.is_finite() && self.y.is_finite() && self.z.is_finite()
    }

    #[must_use]
    pub fn length_squared(self) -> f32 {
        self.x.mul_add(self.x, self.y.mul_add(self.y, self.z * self.z))
    }

    #[must_use]
    pub fn length(self) -> f32 {
        self.length_squared().sqrt()
    }

    #[must_use]
    pub fn normalized_or_zero(self) -> Self {
        let length = self.length();
        if length <= 1.0e-6 {
            Self::ZERO
        } else {
            self * length.recip()
        }
    }
}

impl core::ops::Add for Vec3 {
    type Output = Self;

    fn add(self, rhs: Self) -> Self::Output {
        Self::new(self.x + rhs.x, self.y + rhs.y, self.z + rhs.z)
    }
}

impl core::ops::Sub for Vec3 {
    type Output = Self;

    fn sub(self, rhs: Self) -> Self::Output {
        Self::new(self.x - rhs.x, self.y - rhs.y, self.z - rhs.z)
    }
}

impl core::ops::Mul<f32> for Vec3 {
    type Output = Self;

    fn mul(self, rhs: f32) -> Self::Output {
        Self::new(self.x * rhs, self.y * rhs, self.z * rhs)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CreatureSizeClass {
    Small,
    Medium,
    Large,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct BodyMassProfile {
    pub size: CreatureSizeClass,
    pub radius: f32,
    pub height: f32,
}

/// Gameplay mass used for overlap sharing and pushback, matching the TypeScript oracle.
#[must_use]
pub fn creature_body_mass(profile: BodyMassProfile) -> f32 {
    let class_mass: f32 = match profile.size {
        CreatureSizeClass::Large => 2.35,
        CreatureSizeClass::Medium => 1.0,
        CreatureSizeClass::Small => 0.4,
    };
    let footprint = profile.radius.max(0.16);
    let bulk = ((footprint / 0.5).powi(2) * profile.height.max(0.45)).clamp(0.35, 5.5);
    (class_mass * bulk.powf(0.32)).clamp(0.24, 8.0)
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CircleBody {
    pub x: f32,
    pub z: f32,
    pub radius: f32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CircleSeparation {
    pub dx: f32,
    pub dz: f32,
    pub overlap: f32,
}

/// Smallest horizontal correction that moves `mover` out of `obstacle`.
#[must_use]
pub fn separate_circles(
    mover: CircleBody,
    obstacle: CircleBody,
    padding: f32,
    stable_seed: u32,
) -> Option<CircleSeparation> {
    let dx = mover.x - obstacle.x;
    let dz = mover.z - obstacle.z;
    let distance = dx.hypot(dz);
    let minimum_distance = mover.radius.max(0.0) + obstacle.radius.max(0.0) + padding.max(0.0);
    let overlap = minimum_distance - distance;
    if overlap <= 0.0 {
        return None;
    }
    if distance > 0.000_01 {
        return Some(CircleSeparation {
            dx: dx / distance * overlap,
            dz: dz / distance * overlap,
            overlap,
        });
    }
    let angle = ((stable_seed as f64 * 0.618_033_988_75) % 1.0) as f32 * TAU;
    Some(CircleSeparation {
        dx: angle.cos() * overlap,
        dz: angle.sin() * overlap,
        overlap,
    })
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SeparationShare {
    pub first: f32,
    pub second: f32,
}

/// Split penetration inversely by mass so the smaller body yields farther.
#[must_use]
pub fn split_separation(overlap: f32, first_mass: f32, second_mass: f32) -> SeparationShare {
    let penetration = overlap.max(0.0);
    let first = first_mass.max(0.05);
    let second = second_mass.max(0.05);
    let total = first + second;
    SeparationShare {
        first: penetration * second / total,
        second: penetration * first / total,
    }
}

#[must_use]
pub fn knockback_speed(strength: f32, mass: f32) -> f32 {
    (strength.max(0.0) / mass.max(0.2).sqrt()).clamp(0.0, 6.2)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SocialMode {
    Herd,
    Shoal,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SocialMember {
    pub id: EntityId,
    pub position: Vec3,
    pub velocity: Vec3,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SocialMotion {
    pub id: EntityId,
    pub direction: Vec3,
    pub speed_scale: f32,
}

/// Bounded, deterministic cohesion/separation/alignment for herds and shoals.
#[must_use]
pub fn plan_social_motion(members: &[SocialMember], mode: SocialMode) -> Vec<SocialMotion> {
    let mut ordered = members.to_vec();
    ordered.sort_by_key(|member| member.id);
    let (separation_radius, cohesion_weight, separation_weight, alignment_weight) = match mode {
        SocialMode::Herd => (2.4, 0.16, 1.15, 0.1),
        SocialMode::Shoal => (1.18, 0.21, 1.02, 0.28),
    };
    ordered
        .iter()
        .map(|member| {
            let mut neighbors: Vec<_> = ordered
                .iter()
                .filter(|candidate| candidate.id != member.id)
                .map(|candidate| {
                    let dx = candidate.position.x - member.position.x;
                    let dz = candidate.position.z - member.position.z;
                    (dx.hypot(dz), candidate)
                })
                .collect();
            neighbors.sort_by(|left, right| left.0.total_cmp(&right.0).then_with(|| left.1.id.cmp(&right.1.id)));
            neighbors.truncate(8);
            if neighbors.is_empty() {
                return SocialMotion {
                    id: member.id,
                    direction: member.velocity,
                    speed_scale: 0.86,
                };
            }
            let mut center = Vec3::ZERO;
            let mut alignment = Vec3::ZERO;
            let mut separation = Vec3::ZERO;
            for (distance, candidate) in &neighbors {
                center = center + candidate.position;
                alignment = alignment + candidate.velocity;
                if *distance < separation_radius && *distance > 0.000_1 {
                    let strength = (separation_radius - *distance) / separation_radius;
                    separation.x += (member.position.x - candidate.position.x) / *distance * strength;
                    separation.z += (member.position.z - candidate.position.z) / *distance * strength;
                }
            }
            let inverse = (neighbors.len() as f32).recip();
            let x = (center.x * inverse - member.position.x) * cohesion_weight
                + separation.x * separation_weight
                + alignment.x * inverse * alignment_weight;
            let z = (center.z * inverse - member.position.z) * cohesion_weight
                + separation.z * separation_weight
                + alignment.z * inverse * alignment_weight;
            let length = x.hypot(z).max(1.0);
            SocialMotion {
                id: member.id,
                direction: Vec3::new(x / length, 0.0, z / length),
                speed_scale: (0.82 + length * 0.16).min(1.3),
            }
        })
        .collect()
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SenseTarget {
    pub id: EntityId,
    pub position: Vec3,
    pub detectable: bool,
    pub priority: i16,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SenseHit {
    pub id: EntityId,
    pub distance_squared: f32,
    pub priority: i16,
}

/// Pure bounded sensing. Results are priority-first, then distance, then ID.
#[must_use]
pub fn sense_targets(origin: Vec3, radius: f32, targets: &[SenseTarget], limit: usize) -> Vec<SenseHit> {
    let radius_squared = radius.max(0.0).powi(2);
    let mut hits: Vec<_> = targets
        .iter()
        .filter(|target| target.detectable)
        .filter_map(|target| {
            let distance_squared = (target.position - origin).length_squared();
            (distance_squared <= radius_squared).then_some(SenseHit {
                id: target.id,
                distance_squared,
                priority: target.priority,
            })
        })
        .collect();
    hits.sort_by(|left, right| {
        right
            .priority
            .cmp(&left.priority)
            .then_with(|| left.distance_squared.total_cmp(&right.distance_squared))
            .then_with(|| left.id.cmp(&right.id))
    });
    hits.truncate(limit);
    hits
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FollowerMember {
    pub id: EntityId,
    pub radius: f32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FollowerTarget {
    pub id: EntityId,
    pub index: u16,
    pub position: Vec3,
    pub trailing_distance: f32,
    pub lateral_offset: f32,
    pub arrival_radius: f32,
}

/// Stable paired fan formation matching current Blockwild follower semantics.
#[must_use]
pub fn plan_follower_formation(leader: Vec3, heading: f32, members: &[FollowerMember]) -> Vec<FollowerTarget> {
    let mut ordered = members.to_vec();
    ordered.sort_by_key(|member| member.id);
    let largest_radius = ordered
        .iter()
        .map(|member| member.radius.max(0.1))
        .fold(0.4_f32, f32::max);
    let group_spread = ((ordered.len().saturating_sub(1)) as f32 * 0.045).clamp(0.0, 0.34);
    let first_trailing_distance = 2.8 + group_spread + (largest_radius - 0.4).max(0.0) * 0.35;
    let lateral_spacing = (largest_radius * 2.0 + 0.46).max(1.25) + group_spread * 0.5;
    let forward_x = heading.cos();
    let forward_z = heading.sin();
    let side_x = -forward_z;
    let side_z = forward_x;
    ordered
        .into_iter()
        .enumerate()
        .map(|(index, member)| {
            let row = index / 2;
            let side = if index % 2 == 0 { -1.0 } else { 1.0 };
            let lateral_offset = side * (0.75 + row as f32 * 0.58) * lateral_spacing;
            let trailing_distance = first_trailing_distance + row as f32 * (0.72 + largest_radius * 0.18);
            FollowerTarget {
                id: member.id,
                index: index as u16,
                position: Vec3::new(
                    leader.x - forward_x * trailing_distance + side_x * lateral_offset,
                    leader.y,
                    leader.z - forward_z * trailing_distance + side_z * lateral_offset,
                ),
                trailing_distance,
                lateral_offset,
                arrival_radius: (0.34 + member.radius.max(0.1) * 0.28).clamp(0.42, 0.78),
            }
        })
        .collect()
}

/// Apply pairwise overlap correction once per unordered entity pair.
#[must_use]
pub fn resolve_separation_batch(
    bodies: &BTreeMap<EntityId, (CircleBody, f32)>,
    padding: f32,
) -> BTreeMap<EntityId, Vec3> {
    let mut corrections = BTreeMap::<EntityId, Vec3>::new();
    let ids: Vec<_> = bodies.keys().copied().collect();
    for (left_index, left_id) in ids.iter().copied().enumerate() {
        for right_id in ids.iter().copied().skip(left_index + 1) {
            let (left_body, left_mass) = bodies[&left_id];
            let (right_body, right_mass) = bodies[&right_id];
            let Some(separation) =
                separate_circles(left_body, right_body, padding, left_id.0.index() ^ right_id.0.index())
            else {
                continue;
            };
            let share = split_separation(separation.overlap, left_mass, right_mass);
            let direction = Vec3::new(separation.dx, 0.0, separation.dz).normalized_or_zero();
            let left = corrections.entry(left_id).or_default();
            *left = *left + direction * share.first;
            let right = corrections.entry(right_id).or_default();
            *right = *right - direction * share.second;
        }
    }
    corrections
}
