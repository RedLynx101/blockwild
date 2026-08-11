use crate::{
    AirZoneTopologyJobV1, AirZoneTopologyResultV1, CollisionShapeWindowV1, ContractError, CreativeFlightControlV1,
    GasEqualizationJobV1, GasEqualizationResultV1, HorizontalStepInputV1, HorizontalStepResultV1, KnockbackInputV1,
    KnockbackResultV1, LiquidFrontierResultV1, LiquidFrontierStepV1, MountControlV1, MountProfileV1, PathJobResultV1,
    PathJobV1, PhysicsStepInputV1, PhysicsStepResultV1, SailboatControlV1, SailboatKinematicsV1,
    SailboatWaterSamplesV1, Vec3, apply_legacy_player_knockback, commit_sailboat_candidate, equalize_gas_fixed,
    find_path, sailboat_candidate, solve_air_zones, step_creative_flight_velocity, step_liquid_frontier,
    step_mount_velocity, step_physics, sweep_body_horizontal_with_step,
};

pub const SIMULATION_MAX_BATCH_JOBS_V1: usize = 4_096;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CreativeFlightJobV1 {
    pub body_id: u64,
    pub velocity: Vec3,
    pub control: CreativeFlightControlV1,
    pub delta_seconds: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CreativeFlightResultV1 {
    pub body_id: u64,
    pub velocity: Vec3,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct KnockbackJobV1 {
    pub body_id: u64,
    pub input: KnockbackInputV1,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct KnockbackBatchResultV1 {
    pub body_id: u64,
    pub result: KnockbackResultV1,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MountVelocityJobV1 {
    pub mount_id: u64,
    pub velocity: Vec3,
    pub control: MountControlV1,
    pub profile: MountProfileV1,
    pub gravity: crate::GravityProfileV1,
    pub delta_seconds: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MountVelocityResultV1 {
    pub mount_id: u64,
    pub velocity: Vec3,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SailboatJobV1 {
    pub boat_id: u64,
    pub current: SailboatKinematicsV1,
    pub control: SailboatControlV1,
    pub delta_seconds: f64,
    pub water: SailboatWaterSamplesV1,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SailboatResultV1 {
    pub boat_id: u64,
    pub state: SailboatKinematicsV1,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct HorizontalStepJobV1 {
    pub body_id: u64,
    pub input: HorizontalStepInputV1,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct HorizontalStepBatchResultV1 {
    pub body_id: u64,
    pub result: HorizontalStepResultV1,
}

fn validate_batch_size(length: usize) -> Result<(), ContractError> {
    if length > SIMULATION_MAX_BATCH_JOBS_V1 {
        Err(ContractError::InvalidBudget)
    } else {
        Ok(())
    }
}

fn duplicate_identity<T>(jobs: &[T], identity: impl Fn(&T) -> (&str, u32)) -> bool {
    jobs.windows(2).any(|pair| identity(&pair[0]) == identity(&pair[1]))
}

fn duplicate_id<T>(jobs: &[T], id: impl Fn(&T) -> u64) -> bool {
    jobs.windows(2).any(|pair| id(&pair[0]) == id(&pair[1]))
}

fn finite_vec3(value: Vec3) -> bool {
    value.x.is_finite() && value.y.is_finite() && value.z.is_finite()
}

pub fn step_creative_flight_batch(jobs: &[CreativeFlightJobV1]) -> Result<Vec<CreativeFlightResultV1>, ContractError> {
    validate_batch_size(jobs.len())?;
    let mut ordered = jobs.to_vec();
    ordered.sort_by_key(|job| job.body_id);
    if duplicate_id(&ordered, |job| job.body_id) {
        return Err(ContractError::InvalidFlags);
    }
    if ordered.iter().any(|job| {
        !finite_vec3(job.velocity)
            || !job.control.forward.is_finite()
            || !job.control.strafe.is_finite()
            || !job.control.yaw.is_finite()
            || !job.control.movement_multiplier.is_finite()
            || job.control.forward.abs() > 1.0
            || job.control.strafe.abs() > 1.0
            || job.control.movement_multiplier < 0.0
            || !job.delta_seconds.is_finite()
            || !(0.0..=0.1).contains(&job.delta_seconds)
    }) {
        return Err(ContractError::InvalidNumber);
    }
    Ok(ordered
        .into_iter()
        .map(|job| CreativeFlightResultV1 {
            body_id: job.body_id,
            velocity: step_creative_flight_velocity(job.velocity, job.control, job.delta_seconds),
        })
        .collect())
}

pub fn apply_knockback_batch(jobs: &[KnockbackJobV1]) -> Result<Vec<KnockbackBatchResultV1>, ContractError> {
    validate_batch_size(jobs.len())?;
    let mut ordered = jobs.to_vec();
    ordered.sort_by_key(|job| job.body_id);
    if duplicate_id(&ordered, |job| job.body_id) {
        return Err(ContractError::InvalidFlags);
    }
    if ordered.iter().any(|job| {
        !finite_vec3(job.input.velocity)
            || !finite_vec3(job.input.player_position)
            || !finite_vec3(job.input.origin)
            || !job.input.yaw.is_finite()
            || !job.input.strength.is_finite()
            || job.input.strength < 0.0
    }) {
        return Err(ContractError::InvalidNumber);
    }
    Ok(ordered
        .into_iter()
        .map(|job| KnockbackBatchResultV1 {
            body_id: job.body_id,
            result: apply_legacy_player_knockback(job.input),
        })
        .collect())
}

pub fn step_mount_velocity_batch(jobs: &[MountVelocityJobV1]) -> Result<Vec<MountVelocityResultV1>, ContractError> {
    validate_batch_size(jobs.len())?;
    let mut ordered = jobs.to_vec();
    ordered.sort_by_key(|job| job.mount_id);
    if duplicate_id(&ordered, |job| job.mount_id) {
        return Err(ContractError::InvalidFlags);
    }
    if ordered.iter().any(|job| {
        !finite_vec3(job.velocity)
            || [
                job.control.forward,
                job.control.strafe,
                job.control.vertical,
                job.control.yaw,
                job.profile.body_radius,
                job.profile.body_height,
                job.profile.mass,
                job.profile.cruise_speed,
                job.profile.sprint_speed,
                job.profile.acceleration,
                job.profile.vertical_speed,
                job.profile.drag,
                job.profile.gravity_scale,
                job.gravity.gravity,
                job.gravity.terminal_velocity,
                job.gravity.air_drag,
                job.gravity.ground_acceleration,
                job.gravity.air_acceleration,
                job.gravity.jump_velocity,
                job.gravity.maximum_sweep_step,
                job.delta_seconds,
            ]
            .iter()
            .any(|value| !value.is_finite())
            || job.control.forward.abs() > 1.0
            || job.control.strafe.abs() > 1.0
            || job.control.vertical.abs() > 1.0
            || job.profile.body_radius <= 0.0
            || job.profile.body_height <= 0.0
            || job.profile.mass <= 0.0
            || job.profile.cruise_speed < 0.0
            || job.profile.sprint_speed < 0.0
            || job.profile.acceleration < 0.0
            || job.profile.vertical_speed < 0.0
            || job.profile.drag < 0.0
            || job.profile.gravity_scale < 0.0
            || job.gravity.gravity < 0.0
            || job.gravity.gravity > crate::PHYSICS_MAX_ACCELERATION_V1
            || job.gravity.terminal_velocity < 0.0
            || job.gravity.terminal_velocity > crate::PHYSICS_MAX_ABS_VELOCITY_V1
            || job.gravity.air_drag < 0.0
            || job.gravity.air_drag > crate::PHYSICS_MAX_ACCELERATION_V1
            || job.gravity.ground_acceleration < 0.0
            || job.gravity.ground_acceleration > crate::PHYSICS_MAX_ACCELERATION_V1
            || job.gravity.air_acceleration < 0.0
            || job.gravity.air_acceleration > crate::PHYSICS_MAX_ACCELERATION_V1
            || job.gravity.jump_velocity < 0.0
            || job.gravity.jump_velocity > crate::PHYSICS_MAX_ABS_VELOCITY_V1
            || !(0.01..=1.0).contains(&job.gravity.maximum_sweep_step)
            || !(0.0..=0.1).contains(&job.delta_seconds)
    }) {
        return Err(ContractError::InvalidNumber);
    }
    Ok(ordered
        .into_iter()
        .map(|job| MountVelocityResultV1 {
            mount_id: job.mount_id,
            velocity: step_mount_velocity(job.velocity, job.control, job.profile, job.gravity, job.delta_seconds),
        })
        .collect())
}

pub fn step_sailboat_batch(jobs: &[SailboatJobV1]) -> Result<Vec<SailboatResultV1>, ContractError> {
    validate_batch_size(jobs.len())?;
    let mut ordered = jobs.to_vec();
    ordered.sort_by_key(|job| job.boat_id);
    if duplicate_id(&ordered, |job| job.boat_id) {
        return Err(ContractError::InvalidFlags);
    }
    if ordered.iter().any(|job| {
        !finite_vec3(job.current.position)
            || !job.current.yaw.is_finite()
            || !job.current.velocity.is_finite()
            || !job.control.forward.is_finite()
            || !job.control.turn.is_finite()
            || job.control.forward.abs() > 1.0
            || job.control.turn.abs() > 1.0
            || !job.delta_seconds.is_finite()
            || !(0.0..=0.1).contains(&job.delta_seconds)
    }) {
        return Err(ContractError::InvalidNumber);
    }
    Ok(ordered
        .into_iter()
        .map(|job| {
            let candidate = sailboat_candidate(job.current, job.control, job.delta_seconds);
            SailboatResultV1 {
                boat_id: job.boat_id,
                state: commit_sailboat_candidate(job.current, candidate, job.water),
            }
        })
        .collect())
}

pub fn sweep_horizontal_step_batch(
    window: &CollisionShapeWindowV1,
    jobs: &[HorizontalStepJobV1],
) -> Result<Vec<HorizontalStepBatchResultV1>, ContractError> {
    window.validate()?;
    validate_batch_size(jobs.len())?;
    let mut ordered = jobs.to_vec();
    ordered.sort_by_key(|job| job.body_id);
    if duplicate_id(&ordered, |job| job.body_id) {
        return Err(ContractError::InvalidFlags);
    }
    if ordered.iter().any(|job| {
        !finite_vec3(job.input.position)
            || !job.input.radius.is_finite()
            || !job.input.height.is_finite()
            || !job.input.distance.is_finite()
            || !job.input.maximum_sweep_step.is_finite()
            || !job.input.step_height.is_finite()
            || job.input.radius <= 0.0
            || job.input.height <= 0.0
            || job.input.axis > 2
            || !(0.01..=1.0).contains(&job.input.maximum_sweep_step)
            || !(0.0..=2.0).contains(&job.input.step_height)
    }) {
        return Err(ContractError::InvalidNumber);
    }
    Ok(ordered
        .into_iter()
        .map(|job| HorizontalStepBatchResultV1 {
            body_id: job.body_id,
            result: sweep_body_horizontal_with_step(window, job.input),
        })
        .collect())
}

pub fn step_physics_batch(inputs: &[PhysicsStepInputV1]) -> Result<Vec<PhysicsStepResultV1>, ContractError> {
    validate_batch_size(inputs.len())?;
    let mut ordered = inputs.to_vec();
    ordered.sort_by(|left, right| {
        left.identity
            .sequence
            .cmp(&right.identity.sequence)
            .then_with(|| left.identity.job_id.cmp(&right.identity.job_id))
    });
    if duplicate_identity(&ordered, |input| (&input.identity.job_id, input.identity.sequence)) {
        return Err(ContractError::InvalidFlags);
    }
    ordered.iter().map(step_physics).collect()
}

pub fn step_liquid_frontier_batch(
    inputs: &[LiquidFrontierStepV1],
) -> Result<Vec<LiquidFrontierResultV1>, ContractError> {
    validate_batch_size(inputs.len())?;
    let mut ordered = inputs.to_vec();
    ordered.sort_by(|left, right| {
        left.identity
            .sequence
            .cmp(&right.identity.sequence)
            .then_with(|| left.identity.job_id.cmp(&right.identity.job_id))
    });
    if duplicate_identity(&ordered, |input| (&input.identity.job_id, input.identity.sequence)) {
        return Err(ContractError::InvalidFlags);
    }
    ordered.iter().map(step_liquid_frontier).collect()
}

pub fn find_path_batch(inputs: &[PathJobV1]) -> Result<Vec<PathJobResultV1>, ContractError> {
    validate_batch_size(inputs.len())?;
    let mut ordered = inputs.to_vec();
    ordered.sort_by(|left, right| {
        left.identity
            .sequence
            .cmp(&right.identity.sequence)
            .then_with(|| left.identity.job_id.cmp(&right.identity.job_id))
    });
    if duplicate_identity(&ordered, |input| (&input.identity.job_id, input.identity.sequence)) {
        return Err(ContractError::InvalidFlags);
    }
    ordered.iter().map(find_path).collect()
}

pub fn solve_air_zones_batch(inputs: &[AirZoneTopologyJobV1]) -> Result<Vec<AirZoneTopologyResultV1>, ContractError> {
    validate_batch_size(inputs.len())?;
    let mut ordered = inputs.to_vec();
    ordered.sort_by(|left, right| {
        left.identity
            .sequence
            .cmp(&right.identity.sequence)
            .then_with(|| left.identity.job_id.cmp(&right.identity.job_id))
    });
    if duplicate_identity(&ordered, |input| (&input.identity.job_id, input.identity.sequence)) {
        return Err(ContractError::InvalidFlags);
    }
    ordered.iter().map(solve_air_zones).collect()
}

pub fn equalize_gas_fixed_batch(
    inputs: &[GasEqualizationJobV1],
) -> Result<Vec<GasEqualizationResultV1>, ContractError> {
    validate_batch_size(inputs.len())?;
    let mut ordered = inputs.to_vec();
    ordered.sort_by(|left, right| {
        left.identity
            .sequence
            .cmp(&right.identity.sequence)
            .then_with(|| left.identity.job_id.cmp(&right.identity.job_id))
    });
    if duplicate_identity(&ordered, |input| (&input.identity.job_id, input.identity.sequence)) {
        return Err(ContractError::InvalidFlags);
    }
    ordered.iter().map(equalize_gas_fixed).collect()
}
