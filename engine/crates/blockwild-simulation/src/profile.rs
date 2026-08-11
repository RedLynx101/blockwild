use crate::Vec3;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct GravityProfileV1 {
    /// Downward acceleration in blocks per second squared.
    pub gravity: f64,
    pub terminal_velocity: f64,
    pub air_drag: f64,
    pub ground_acceleration: f64,
    pub air_acceleration: f64,
    pub jump_velocity: f64,
    pub maximum_sweep_step: f64,
}

impl Default for GravityProfileV1 {
    fn default() -> Self {
        Self {
            gravity: 22.0,
            terminal_velocity: 52.0,
            air_drag: 0.0,
            ground_acceleration: 18.0,
            air_acceleration: 7.0,
            jump_velocity: 8.15,
            maximum_sweep_step: 0.14,
        }
    }
}

impl GravityProfileV1 {
    #[must_use]
    pub fn scaled(surface_gravity_ratio: f64) -> Self {
        let ratio = surface_gravity_ratio.clamp(0.0, 8.0);
        let base = Self::default();
        Self {
            gravity: base.gravity * ratio,
            terminal_velocity: base.terminal_velocity * ratio.max(0.05).sqrt(),
            jump_velocity: if ratio <= f64::EPSILON {
                base.jump_velocity
            } else {
                base.jump_velocity / ratio.max(0.2).sqrt()
            },
            ..base
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MountModeV1 {
    Ground,
    Aquatic,
    Flying,
    ZeroGravity,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MountProfileV1 {
    pub mode: MountModeV1,
    pub body_radius: f64,
    pub body_height: f64,
    pub mass: f64,
    pub cruise_speed: f64,
    pub sprint_speed: f64,
    pub acceleration: f64,
    pub vertical_speed: f64,
    pub drag: f64,
    pub gravity_scale: f64,
}

impl MountProfileV1 {
    #[must_use]
    pub const fn ground(radius: f64, height: f64, mass: f64) -> Self {
        Self {
            mode: MountModeV1::Ground,
            body_radius: radius,
            body_height: height,
            mass,
            cruise_speed: 7.2,
            sprint_speed: 11.4,
            acceleration: 10.0,
            vertical_speed: 0.0,
            drag: 5.0,
            gravity_scale: 1.0,
        }
    }

    #[must_use]
    pub const fn aquatic(radius: f64, height: f64, mass: f64) -> Self {
        Self {
            mode: MountModeV1::Aquatic,
            body_radius: radius,
            body_height: height,
            mass,
            cruise_speed: 8.0,
            sprint_speed: 13.0,
            acceleration: 7.0,
            vertical_speed: 5.5,
            drag: 2.4,
            gravity_scale: 0.0,
        }
    }

    #[must_use]
    pub const fn flying(radius: f64, height: f64, mass: f64) -> Self {
        Self {
            mode: MountModeV1::Flying,
            body_radius: radius,
            body_height: height,
            mass,
            cruise_speed: 12.0,
            sprint_speed: 19.0,
            acceleration: 6.5,
            vertical_speed: 7.5,
            drag: 1.8,
            gravity_scale: 0.16,
        }
    }

    #[must_use]
    pub const fn zero_gravity(radius: f64, height: f64, mass: f64) -> Self {
        Self {
            mode: MountModeV1::ZeroGravity,
            body_radius: radius,
            body_height: height,
            mass,
            cruise_speed: 5.0,
            sprint_speed: 8.0,
            acceleration: 4.0,
            vertical_speed: 5.0,
            drag: 0.35,
            gravity_scale: 0.0,
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct MountControlV1 {
    pub forward: f64,
    pub strafe: f64,
    pub vertical: f64,
    pub yaw: f64,
    pub sprinting: bool,
}

/// Deterministic velocity target shared by creature mounts and vehicles.
#[must_use]
pub fn step_mount_velocity(
    velocity: Vec3,
    control: MountControlV1,
    profile: MountProfileV1,
    gravity: GravityProfileV1,
    delta_seconds: f64,
) -> Vec3 {
    let dt = delta_seconds.clamp(0.0, 0.1);
    let forward = control.forward.clamp(-1.0, 1.0);
    let strafe = control.strafe.clamp(-1.0, 1.0);
    let magnitude = (forward * forward + strafe * strafe).sqrt().max(1.0);
    let forward = forward / magnitude;
    let strafe = strafe / magnitude;
    let speed = if control.sprinting {
        profile.sprint_speed
    } else {
        profile.cruise_speed
    };
    let (sin, cos) = control.yaw.sin_cos();
    let target_x = (-sin * forward + cos * strafe) * speed;
    let target_z = (-cos * forward - sin * strafe) * speed;
    let blend = (profile.acceleration * dt).min(1.0);
    let mut next = Vec3::new(
        velocity.x + (target_x - velocity.x) * blend,
        velocity.y,
        velocity.z + (target_z - velocity.z) * blend,
    );
    if matches!(
        profile.mode,
        MountModeV1::Aquatic | MountModeV1::Flying | MountModeV1::ZeroGravity
    ) {
        let target_y = control.vertical.clamp(-1.0, 1.0) * profile.vertical_speed;
        next.y += (target_y - next.y) * blend;
    } else {
        next.y = (next.y - gravity.gravity * profile.gravity_scale * dt).max(-gravity.terminal_velocity);
    }
    if forward.abs() + strafe.abs() <= f64::EPSILON && control.vertical.abs() <= f64::EPSILON {
        let drag = (-profile.drag * dt).exp();
        next.x *= drag;
        next.z *= drag;
        if !matches!(profile.mode, MountModeV1::Ground) {
            next.y *= drag;
        }
    }
    next
}
