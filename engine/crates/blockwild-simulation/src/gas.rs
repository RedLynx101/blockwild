use std::collections::BTreeMap;

use blockwild_types::{CanonicalHash, CanonicalHasher};

use crate::{ContractError, SIMULATION_MAX_FIXED_DELTA_MICROS_V1, SimulationJobIdentityV1, write_identity};

/// Gas quantity is stored in deterministic micro-units. Pressure is an
/// authority-relative integer derived as quantity per volume; no floating
/// arithmetic enters atmosphere state or its hash.
pub const GAS_PRESSURE_SCALE_V1: u64 = 1_000_000;
pub const GAS_CONDUCTANCE_SCALE_V1: u64 = 1_000_000;
pub const GAS_MAX_ZONES_V1: usize = 65_536;
pub const GAS_MAX_CONNECTIONS_V1: usize = 131_072;

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct GasMixtureV1 {
    pub oxygen: u64,
    pub nitrogen: u64,
    pub carbon_dioxide: u64,
    pub toxic: u64,
}

impl GasMixtureV1 {
    #[must_use]
    pub fn total(self) -> u64 {
        self.oxygen
            .saturating_add(self.nitrogen)
            .saturating_add(self.carbon_dioxide)
            .saturating_add(self.toxic)
    }

    fn checked_total(self) -> Option<u64> {
        self.oxygen
            .checked_add(self.nitrogen)?
            .checked_add(self.carbon_dioxide)?
            .checked_add(self.toxic)
    }

    fn checked_add(self, other: Self) -> Option<Self> {
        Some(Self {
            oxygen: self.oxygen.checked_add(other.oxygen)?,
            nitrogen: self.nitrogen.checked_add(other.nitrogen)?,
            carbon_dioxide: self.carbon_dioxide.checked_add(other.carbon_dioxide)?,
            toxic: self.toxic.checked_add(other.toxic)?,
        })
    }

    fn checked_sub(self, other: Self) -> Option<Self> {
        Some(Self {
            oxygen: self.oxygen.checked_sub(other.oxygen)?,
            nitrogen: self.nitrogen.checked_sub(other.nitrogen)?,
            carbon_dioxide: self.carbon_dioxide.checked_sub(other.carbon_dioxide)?,
            toxic: self.toxic.checked_sub(other.toxic)?,
        })
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct AirZoneGasStateV1 {
    pub zone_id: u32,
    pub volume_units: u64,
    pub mixture: GasMixtureV1,
}

impl AirZoneGasStateV1 {
    #[must_use]
    pub fn pressure_fixed(self) -> u64 {
        if self.volume_units == 0 {
            return u64::MAX;
        }
        let pressure =
            u128::from(self.mixture.total()) * u128::from(GAS_PRESSURE_SCALE_V1) / u128::from(self.volume_units);
        pressure.min(u128::from(u64::MAX)) as u64
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AirConnectionKindV1 {
    Vent,
    Airlock,
    Leak,
    Pump,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct AirConnectionV1 {
    pub connection_id: u64,
    pub from_zone: u32,
    /// `None` is vacuum/outside and is only valid for a leak.
    pub to_zone: Option<u32>,
    pub kind: AirConnectionKindV1,
    pub conductance_ppm: u32,
    pub enabled: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct GasEqualizationJobV1 {
    pub identity: SimulationJobIdentityV1,
    pub topology_revision: u64,
    pub fixed_delta_micros: u32,
    pub maximum_connections: usize,
    pub zones: Vec<AirZoneGasStateV1>,
    pub connections: Vec<AirConnectionV1>,
    pub input_hash: CanonicalHash,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct GasTransferV1 {
    pub connection_id: u64,
    pub from_zone: u32,
    pub to_zone: Option<u32>,
    pub mixture: GasMixtureV1,
}

#[derive(Clone, Debug, PartialEq)]
pub struct GasEqualizationResultV1 {
    pub identity: SimulationJobIdentityV1,
    pub topology_revision: u64,
    pub zones: Vec<AirZoneGasStateV1>,
    pub transfers: Vec<GasTransferV1>,
    pub leaked: GasMixtureV1,
    pub visited_connections: usize,
    pub budget_exhausted: bool,
    pub result_hash: CanonicalHash,
}

fn write_mixture(hasher: &mut CanonicalHasher, mixture: GasMixtureV1) {
    hasher.write_u64(mixture.oxygen);
    hasher.write_u64(mixture.nitrogen);
    hasher.write_u64(mixture.carbon_dioxide);
    hasher.write_u64(mixture.toxic);
}

#[must_use]
pub fn hash_gas_equalization_input(job: &GasEqualizationJobV1) -> CanonicalHash {
    let mut hasher = CanonicalHasher::new("blockwild-gas-equalization-input-v1");
    hasher.write_u16(crate::SIMULATION_SCHEMA_V1);
    write_identity(&mut hasher, &job.identity);
    hasher.write_u64(job.topology_revision);
    hasher.write_u32(job.fixed_delta_micros);
    hasher.write_u32(job.maximum_connections as u32);
    hasher.write_u32(job.zones.len() as u32);
    for zone in &job.zones {
        hasher.write_u32(zone.zone_id);
        hasher.write_u64(zone.volume_units);
        write_mixture(&mut hasher, zone.mixture);
    }
    hasher.write_u32(job.connections.len() as u32);
    for connection in &job.connections {
        hasher.write_u64(connection.connection_id);
        hasher.write_u32(connection.from_zone);
        hasher.write_u32(connection.to_zone.unwrap_or(0));
        hasher.write_u16(match connection.kind {
            AirConnectionKindV1::Vent => 0,
            AirConnectionKindV1::Airlock => 1,
            AirConnectionKindV1::Leak => 2,
            AirConnectionKindV1::Pump => 3,
        });
        hasher.write_u32(connection.conductance_ppm);
        hasher.write_u16(u16::from(connection.enabled));
    }
    hasher.finish()
}

impl GasEqualizationJobV1 {
    #[must_use]
    pub fn seal(mut self) -> Self {
        self.input_hash = hash_gas_equalization_input(&self);
        self
    }

    pub fn validate(&self) -> Result<(), ContractError> {
        if self.fixed_delta_micros == 0 || self.fixed_delta_micros > SIMULATION_MAX_FIXED_DELTA_MICROS_V1 {
            return Err(ContractError::InvalidDelta);
        }
        if self.zones.is_empty()
            || self.zones.len() > GAS_MAX_ZONES_V1
            || self.connections.len() > GAS_MAX_CONNECTIONS_V1
            || self.maximum_connections == 0
            || self.maximum_connections > GAS_MAX_CONNECTIONS_V1
        {
            return Err(ContractError::InvalidBudget);
        }
        if self.zones.windows(2).any(|pair| pair[0].zone_id >= pair[1].zone_id)
            || self
                .zones
                .iter()
                .any(|zone| zone.zone_id == 0 || zone.volume_units == 0 || zone.mixture.checked_total().is_none())
            || self
                .connections
                .windows(2)
                .any(|pair| pair[0].connection_id >= pair[1].connection_id)
        {
            return Err(ContractError::InvalidFlags);
        }
        let zone_ids: BTreeMap<_, _> = self
            .zones
            .iter()
            .enumerate()
            .map(|(index, zone)| (zone.zone_id, index))
            .collect();
        if self.connections.iter().any(|connection| {
            connection.connection_id == 0
                || connection.from_zone == 0
                || !zone_ids.contains_key(&connection.from_zone)
                || connection.to_zone.is_some_and(|zone| !zone_ids.contains_key(&zone))
                || connection.to_zone == Some(connection.from_zone)
                || connection.conductance_ppm == 0
                || u64::from(connection.conductance_ppm) > GAS_CONDUCTANCE_SCALE_V1
                || (connection.to_zone.is_none() && connection.kind != AirConnectionKindV1::Leak)
                || (connection.to_zone.is_some() && connection.kind == AirConnectionKindV1::Leak)
        }) {
            return Err(ContractError::InvalidFlags);
        }
        if hash_gas_equalization_input(self) != self.input_hash {
            return Err(ContractError::IdentityMismatch);
        }
        Ok(())
    }
}

fn proportional_take(mixture: GasMixtureV1, amount: u64) -> GasMixtureV1 {
    let total = mixture.total();
    if amount == 0 || total == 0 {
        return GasMixtureV1::default();
    }
    if amount >= total {
        return mixture;
    }
    let share = |component: u64| -> u64 { (u128::from(component) * u128::from(amount) / u128::from(total)) as u64 };
    let mut taken = GasMixtureV1 {
        oxygen: share(mixture.oxygen),
        nitrogen: share(mixture.nitrogen),
        carbon_dioxide: share(mixture.carbon_dioxide),
        toxic: share(mixture.toxic),
    };
    let mut remainder = amount - taken.total();
    for (taken_component, available) in [
        (&mut taken.oxygen, mixture.oxygen),
        (&mut taken.nitrogen, mixture.nitrogen),
        (&mut taken.carbon_dioxide, mixture.carbon_dioxide),
        (&mut taken.toxic, mixture.toxic),
    ] {
        let room = available - *taken_component;
        let add = room.min(remainder);
        *taken_component += add;
        remainder -= add;
        if remainder == 0 {
            break;
        }
    }
    taken
}

fn transfer_amount(
    donor: AirZoneGasStateV1,
    receiver_pressure: u64,
    connection: AirConnectionV1,
    fixed_delta_micros: u32,
) -> u64 {
    let donor_total = donor.mixture.total();
    let donor_pressure = donor.pressure_fixed();
    if donor_total == 0 {
        return 0;
    }
    let pressure_factor = if connection.kind == AirConnectionKindV1::Pump {
        donor_pressure.max(1)
    } else {
        donor_pressure.saturating_sub(receiver_pressure)
    };
    if pressure_factor == 0 {
        return 0;
    }
    let numerator = u128::from(donor_total)
        * u128::from(connection.conductance_ppm)
        * u128::from(fixed_delta_micros)
        * u128::from(pressure_factor);
    let denominator = u128::from(GAS_CONDUCTANCE_SCALE_V1) * 1_000_000_u128 * u128::from(donor_pressure.max(1));
    (numerator / denominator).min(u128::from(donor_total)) as u64
}

pub fn equalize_gas_fixed(job: &GasEqualizationJobV1) -> Result<GasEqualizationResultV1, ContractError> {
    job.validate()?;
    let mut zones = job.zones.clone();
    let indexes: BTreeMap<_, _> = zones
        .iter()
        .enumerate()
        .map(|(index, zone)| (zone.zone_id, index))
        .collect();
    let visited_connections = job.connections.len().min(job.maximum_connections);
    let budget_exhausted = job.connections.len() > visited_connections;
    let mut transfers = Vec::new();
    let mut leaked = GasMixtureV1::default();
    for connection in job.connections.iter().take(visited_connections).copied() {
        if !connection.enabled {
            continue;
        }
        let from_index = indexes[&connection.from_zone];
        let mut donor_index = from_index;
        let mut receiver_index = connection.to_zone.map(|zone| indexes[&zone]);
        if connection.kind != AirConnectionKindV1::Pump
            && let Some(to_index) = receiver_index
            && zones[to_index].pressure_fixed() > zones[from_index].pressure_fixed()
        {
            donor_index = to_index;
            receiver_index = Some(from_index);
        }
        let receiver_pressure = receiver_index.map_or(0, |index| zones[index].pressure_fixed());
        let amount = transfer_amount(
            zones[donor_index],
            receiver_pressure,
            connection,
            job.fixed_delta_micros,
        );
        if amount == 0 {
            continue;
        }
        let mixture = proportional_take(zones[donor_index].mixture, amount);
        zones[donor_index].mixture = zones[donor_index]
            .mixture
            .checked_sub(mixture)
            .ok_or(ContractError::InvalidNumber)?;
        let (from_zone, to_zone) = if let Some(receiver_index) = receiver_index {
            zones[receiver_index].mixture = zones[receiver_index]
                .mixture
                .checked_add(mixture)
                .ok_or(ContractError::InvalidNumber)?;
            (zones[donor_index].zone_id, Some(zones[receiver_index].zone_id))
        } else {
            leaked = leaked.checked_add(mixture).ok_or(ContractError::InvalidNumber)?;
            (zones[donor_index].zone_id, None)
        };
        transfers.push(GasTransferV1 {
            connection_id: connection.connection_id,
            from_zone,
            to_zone,
            mixture,
        });
    }
    let mut hasher = CanonicalHasher::new("blockwild-gas-equalization-result-v1");
    hasher.write_u16(crate::SIMULATION_SCHEMA_V1);
    write_identity(&mut hasher, &job.identity);
    hasher.write_u64(job.topology_revision);
    hasher.write_u32(zones.len() as u32);
    for zone in &zones {
        hasher.write_u32(zone.zone_id);
        hasher.write_u64(zone.volume_units);
        write_mixture(&mut hasher, zone.mixture);
    }
    hasher.write_u32(transfers.len() as u32);
    for transfer in &transfers {
        hasher.write_u64(transfer.connection_id);
        hasher.write_u32(transfer.from_zone);
        hasher.write_u32(transfer.to_zone.unwrap_or(0));
        write_mixture(&mut hasher, transfer.mixture);
    }
    write_mixture(&mut hasher, leaked);
    hasher.write_u32(visited_connections as u32);
    hasher.write_u16(u16::from(budget_exhausted));
    Ok(GasEqualizationResultV1 {
        identity: job.identity.clone(),
        topology_revision: job.topology_revision,
        zones,
        transfers,
        leaked,
        visited_connections,
        budget_exhausted,
        result_hash: hasher.finish(),
    })
}
