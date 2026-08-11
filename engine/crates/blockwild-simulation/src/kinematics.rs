use crate::Vec3;

pub const LEGACY_CREATIVE_CRUISE_SPEED_V1: f64 = 9.5;
pub const LEGACY_CREATIVE_SPRINT_SPEED_V1: f64 = 15.5;
pub const LEGACY_CREATIVE_ASCEND_SPEED_V1: f64 = 8.0;
pub const LEGACY_CREATIVE_SPRINT_ASCEND_SPEED_V1: f64 = 12.0;
pub const LEGACY_SAILBOAT_MAX_SPEED_V1: f64 = 6.2;

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct CreativeFlightControlV1 {
    pub forward: f64,
    pub strafe: f64,
    pub yaw: f64,
    pub ascend: bool,
    pub descend: bool,
    pub sprinting: bool,
    pub movement_multiplier: f64,
}

/// Exact renderer-free port of the legacy Creative-flight velocity controller.
#[must_use]
pub fn step_creative_flight_velocity(velocity: Vec3, control: CreativeFlightControlV1, delta_seconds: f64) -> Vec3 {
    let dt = delta_seconds.clamp(0.0, 0.1);
    let forward = control.forward.clamp(-1.0, 1.0);
    let strafe = control.strafe.clamp(-1.0, 1.0);
    let moving = forward.abs() + strafe.abs() > f64::EPSILON;
    let length = (forward * forward + strafe * strafe).sqrt().max(1.0);
    let forward = forward / length;
    let strafe = strafe / length;
    let (sin, cos) = control.yaw.sin_cos();
    let multiplier = if control.movement_multiplier.is_finite() {
        control.movement_multiplier.max(0.0)
    } else {
        1.0
    };
    let speed = if control.sprinting {
        LEGACY_CREATIVE_SPRINT_SPEED_V1
    } else {
        LEGACY_CREATIVE_CRUISE_SPEED_V1
    } * multiplier;
    let desired_x = (-sin * forward + cos * strafe) * speed;
    let desired_z = (-cos * forward - sin * strafe) * speed;
    let blend = (16.0 * dt).min(1.0);
    let mut next = Vec3::new(
        velocity.x + (desired_x - velocity.x) * blend,
        velocity.y,
        velocity.z + (desired_z - velocity.z) * blend,
    );
    if !moving {
        let drag = (1.0 - 10.0 * dt).max(0.0);
        next.x *= drag;
        next.z *= drag;
    }
    let vertical = i8::from(control.ascend) - i8::from(control.descend);
    let vertical_speed = if control.sprinting {
        LEGACY_CREATIVE_SPRINT_ASCEND_SPEED_V1
    } else {
        LEGACY_CREATIVE_ASCEND_SPEED_V1
    };
    let target_y = f64::from(vertical) * vertical_speed;
    next.y += (target_y - next.y) * (18.0 * dt).min(1.0);
    if vertical == 0 {
        next.y *= (1.0 - 12.0 * dt).max(0.0);
    }
    next
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct KnockbackInputV1 {
    pub velocity: Vec3,
    pub player_position: Vec3,
    pub origin: Vec3,
    pub yaw: f64,
    pub strength: f64,
    pub swimming: bool,
    pub grounded: bool,
    pub restrained: bool,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct KnockbackResultV1 {
    pub velocity: Vec3,
    pub grounded: bool,
    pub applied_speed: f64,
}

/// Exact legacy player-impact rule, including the grounded 3.8-block/s hit hop
/// and the smaller water impulse. `restrained` covers seats and mounted states.
#[must_use]
pub fn apply_legacy_player_knockback(input: KnockbackInputV1) -> KnockbackResultV1 {
    if input.restrained || !input.strength.is_finite() {
        return KnockbackResultV1 {
            velocity: input.velocity,
            grounded: input.grounded,
            applied_speed: 0.0,
        };
    }
    let mut x = input.player_position.x - input.origin.x;
    let mut z = input.player_position.z - input.origin.z;
    let distance = (x * x + z * z).sqrt();
    if distance <= 0.000_01 {
        x = -input.yaw.sin();
        z = -input.yaw.cos();
    } else {
        x /= distance;
        z /= distance;
    }
    let speed =
        (input.strength * if input.swimming { 1.2 } else { 2.0 }).clamp(0.0, if input.swimming { 5.5 } else { 9.2 });
    let mut velocity = Vec3::new(
        input.velocity.x + x * speed,
        input.velocity.y,
        input.velocity.z + z * speed,
    );
    let horizontal = (velocity.x * velocity.x + velocity.z * velocity.z).sqrt();
    let cap = if input.swimming { 5.7 } else { 9.5 };
    if horizontal > cap {
        velocity.x = velocity.x / horizontal * cap;
        velocity.z = velocity.z / horizontal * cap;
    }
    let mut grounded = input.grounded;
    if input.swimming {
        velocity.y = velocity.y.max(1.5);
    } else if grounded {
        velocity.y = velocity.y.max(3.8);
        grounded = false;
    }
    KnockbackResultV1 {
        velocity,
        grounded,
        applied_speed: speed,
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct SailboatKinematicsV1 {
    pub position: Vec3,
    pub yaw: f64,
    pub velocity: f64,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct SailboatControlV1 {
    pub forward: f64,
    pub turn: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SailboatWaterSamplesV1 {
    pub center: bool,
    pub bow: bool,
    pub stern: bool,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SailboatCandidateV1 {
    pub state: SailboatKinematicsV1,
    pub center: Vec3,
    pub bow: Vec3,
    pub stern: Vec3,
}

#[must_use]
pub fn sailboat_candidate(
    current: SailboatKinematicsV1,
    control: SailboatControlV1,
    delta_seconds: f64,
) -> SailboatCandidateV1 {
    let dt = delta_seconds.clamp(0.0, 0.1);
    let throttle = control.forward.clamp(-1.0, 1.0);
    let steer = -control.turn.clamp(-1.0, 1.0);
    let target_speed = if throttle >= 0.0 {
        throttle * LEGACY_SAILBOAT_MAX_SPEED_V1
    } else {
        throttle * LEGACY_SAILBOAT_MAX_SPEED_V1 * 0.38
    };
    let velocity = current.velocity
        + (target_speed - current.velocity) * (1.0 - (-dt * if throttle != 0.0 { 2.7 } else { 1.55 }).exp());
    let authority = 0.38 + (velocity.abs() / LEGACY_SAILBOAT_MAX_SPEED_V1).min(1.0) * 0.92;
    let yaw = (current.yaw + steer * authority * dt * if velocity < 0.0 { -1.0 } else { 1.0 }).sin_cos();
    let wrapped_yaw = yaw.0.atan2(yaw.1);
    let next_x = current.position.x - wrapped_yaw.sin() * velocity * dt;
    let next_z = current.position.z - wrapped_yaw.cos() * velocity * dt;
    let center = Vec3::new(next_x, current.position.y, next_z);
    let bow = Vec3::new(
        next_x - wrapped_yaw.sin() * 1.15,
        current.position.y,
        next_z - wrapped_yaw.cos() * 1.15,
    );
    let stern = Vec3::new(
        next_x + wrapped_yaw.sin() * 0.92,
        current.position.y,
        next_z + wrapped_yaw.cos() * 0.92,
    );
    SailboatCandidateV1 {
        state: SailboatKinematicsV1 {
            position: center,
            yaw: wrapped_yaw,
            velocity,
        },
        center,
        bow,
        stern,
    }
}

/// Completes one coarse boat job after the caller has sampled all three water
/// points from one immutable world window.
#[must_use]
pub fn commit_sailboat_candidate(
    current: SailboatKinematicsV1,
    candidate: SailboatCandidateV1,
    water: SailboatWaterSamplesV1,
) -> SailboatKinematicsV1 {
    if water.center && water.bow && water.stern {
        candidate.state
    } else {
        SailboatKinematicsV1 {
            yaw: candidate.state.yaw,
            velocity: (candidate.state.velocity * -0.12).min(0.0),
            ..current
        }
    }
}

#[must_use]
pub fn sailboat_seat_offset(index: usize, yaw: f64) -> Vec3 {
    let index = index.min(1);
    let local_x = if index == 0 { -0.34 } else { 0.34 };
    let local_z = if index == 0 { 0.18 } else { 0.22 };
    let (sin, cos) = yaw.sin_cos();
    Vec3::new(local_x * cos + local_z * sin, 0.55, -local_x * sin + local_z * cos)
}
