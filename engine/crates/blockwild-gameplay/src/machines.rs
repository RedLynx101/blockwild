use std::collections::{BTreeMap, BTreeSet};

use blockwild_types::{CanonicalHash, CanonicalHasher};

use crate::{OpaquePayload, Rejection, RejectionCode, ResourceDelta, validate_id, write_option_str};

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum ResourceKind {
    Item,
    Liquid,
    Gas,
    Energy,
    Heat,
}

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct ResourceKey {
    pub kind: ResourceKind,
    pub content_id: String,
    pub item_code: Option<u32>,
    pub metadata_hash: CanonicalHash,
}

impl ResourceKey {
    pub fn validate(&self) -> Result<(), Rejection> {
        validate_id("resource", &self.content_id)?;
        if self.kind == ResourceKind::Item && self.item_code.is_none() {
            return Err(Rejection::new(
                RejectionCode::InvalidCommand,
                "item resources require an item code",
            ));
        }
        if self.kind != ResourceKind::Item && self.item_code.is_some() {
            return Err(Rejection::new(
                RejectionCode::InvalidCommand,
                "non-item resources cannot carry an item code",
            ));
        }
        Ok(())
    }

    pub(crate) fn hash_into(&self, hasher: &mut CanonicalHasher) {
        hasher.write_u16(self.kind as u16);
        hasher.write_str(&self.content_id);
        match self.item_code {
            Some(code) => {
                hasher.write_u16(1);
                hasher.write_u32(code);
            }
            None => hasher.write_u16(0),
        }
        hasher.write_bytes(self.metadata_hash.as_bytes());
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MachineKind {
    Furnace,
    Farm,
    Waygrid,
    Aquarium,
    Apiary,
    Generator,
    Battery,
    Logistics,
    Anchor,
    Custom,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PortMode {
    Input,
    Output,
    Bidirectional,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MachinePort {
    pub port_id: String,
    pub mode: PortMode,
    pub accepted: BTreeSet<ResourceKind>,
    pub capacity: u64,
    pub resources: BTreeMap<ResourceKey, u64>,
}

impl MachinePort {
    #[must_use]
    pub fn amount(&self) -> u64 {
        self.resources.values().copied().sum()
    }

    fn can_receive(&self, resource: &ResourceKey, amount: u64) -> bool {
        self.mode != PortMode::Output
            && self.accepted.contains(&resource.kind)
            && self
                .amount()
                .checked_add(amount)
                .is_some_and(|total| total <= self.capacity)
    }

    fn can_send(&self, resource: &ResourceKey, amount: u64) -> bool {
        self.mode != PortMode::Input && self.resources.get(resource).copied().unwrap_or(0) >= amount
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MachineRecipe {
    pub recipe_id: String,
    pub duration_ticks: u32,
    pub inputs: BTreeMap<ResourceKey, u64>,
    pub outputs: BTreeMap<ResourceKey, u64>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActivityLease {
    pub lease_id: String,
    pub owner_id: String,
    pub start_tick: u64,
    pub end_tick: u64,
    pub max_cycles: u32,
}

impl ActivityLease {
    pub fn validate(&self) -> Result<(), Rejection> {
        validate_id("lease", &self.lease_id)?;
        validate_id("lease owner", &self.owner_id)?;
        if self.end_tick <= self.start_tick || self.max_cycles == 0 {
            return Err(Rejection::new(RejectionCode::InvalidCommand, "activity lease is empty"));
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MachineState {
    pub machine_id: String,
    pub owner_id: Option<String>,
    pub kind: MachineKind,
    pub revision: u64,
    pub active: bool,
    pub recipe_id: Option<String>,
    pub progress_ticks: u64,
    pub last_tick: u64,
    pub ports: BTreeMap<String, MachinePort>,
    pub lease: Option<ActivityLease>,
    pub settings: Option<OpaquePayload>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PowerNetwork {
    pub network_id: String,
    pub revision: u64,
    pub stored: u64,
    pub capacity: u64,
    pub members: BTreeSet<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResourceEndpoint {
    pub machine_id: String,
    pub port_id: String,
}

impl ResourceEndpoint {
    fn hash_into(&self, hasher: &mut CanonicalHasher) {
        hasher.write_str(&self.machine_id);
        hasher.write_str(&self.port_id);
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MachineOperation {
    Configure {
        settings: OpaquePayload,
    },
    Activate,
    Deactivate,
    ClaimOutput {
        port_id: String,
        resource: ResourceKey,
        amount: u64,
    },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MachineCommand {
    Operate {
        machine_id: String,
        expected_revision: u64,
        operation: MachineOperation,
    },
    Transfer {
        from: ResourceEndpoint,
        to: ResourceEndpoint,
        resource: ResourceKey,
        amount: u64,
        expected_from_revision: u64,
        expected_to_revision: u64,
    },
    Advance {
        machine_id: String,
        expected_revision: u64,
        to_tick: u64,
    },
    GrantLease {
        machine_id: String,
        expected_revision: u64,
        lease: ActivityLease,
    },
    PowerTransfer {
        network_id: String,
        expected_revision: u64,
        machine_id: String,
        amount: i64,
    },
}

impl MachineCommand {
    pub(crate) fn hash_into(&self, hasher: &mut CanonicalHasher) {
        match self {
            Self::Operate {
                machine_id,
                expected_revision,
                operation,
            } => {
                hasher.write_u16(0);
                hasher.write_str(machine_id);
                hasher.write_u64(*expected_revision);
                match operation {
                    MachineOperation::Configure { settings } => {
                        hasher.write_u16(0);
                        settings.hash_into(hasher);
                    }
                    MachineOperation::Activate => hasher.write_u16(1),
                    MachineOperation::Deactivate => hasher.write_u16(2),
                    MachineOperation::ClaimOutput {
                        port_id,
                        resource,
                        amount,
                    } => {
                        hasher.write_u16(3);
                        hasher.write_str(port_id);
                        resource.hash_into(hasher);
                        hasher.write_u64(*amount);
                    }
                }
            }
            Self::Transfer {
                from,
                to,
                resource,
                amount,
                expected_from_revision,
                expected_to_revision,
            } => {
                hasher.write_u16(1);
                from.hash_into(hasher);
                to.hash_into(hasher);
                resource.hash_into(hasher);
                hasher.write_u64(*amount);
                hasher.write_u64(*expected_from_revision);
                hasher.write_u64(*expected_to_revision);
            }
            Self::Advance {
                machine_id,
                expected_revision,
                to_tick,
            } => {
                hasher.write_u16(2);
                hasher.write_str(machine_id);
                hasher.write_u64(*expected_revision);
                hasher.write_u64(*to_tick);
            }
            Self::GrantLease {
                machine_id,
                expected_revision,
                lease,
            } => {
                hasher.write_u16(3);
                hasher.write_str(machine_id);
                hasher.write_u64(*expected_revision);
                hasher.write_str(&lease.lease_id);
                hasher.write_str(&lease.owner_id);
                hasher.write_u64(lease.start_tick);
                hasher.write_u64(lease.end_tick);
                hasher.write_u32(lease.max_cycles);
            }
            Self::PowerTransfer {
                network_id,
                expected_revision,
                machine_id,
                amount,
            } => {
                hasher.write_u16(4);
                hasher.write_str(network_id);
                hasher.write_u64(*expected_revision);
                hasher.write_str(machine_id);
                hasher.write_u64(*amount as u64);
            }
        }
    }
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct MachineStateSet {
    pub machines: BTreeMap<String, MachineState>,
    pub recipes: BTreeMap<String, MachineRecipe>,
    pub power_networks: BTreeMap<String, PowerNetwork>,
}

impl MachineStateSet {
    pub fn register_recipe(&mut self, recipe: MachineRecipe) -> Result<(), Rejection> {
        validate_id("machine recipe", &recipe.recipe_id)?;
        if recipe.duration_ticks == 0 || recipe.outputs.is_empty() {
            return Err(Rejection::new(
                RejectionCode::InvalidCommand,
                "machine recipe is incomplete",
            ));
        }
        for (resource, amount) in recipe.inputs.iter().chain(&recipe.outputs) {
            resource.validate()?;
            if *amount == 0 {
                return Err(Rejection::new(
                    RejectionCode::InvalidCommand,
                    "machine recipe amount is zero",
                ));
            }
        }
        if self.recipes.insert(recipe.recipe_id.clone(), recipe).is_some() {
            return Err(Rejection::new(RejectionCode::Conflict, "duplicate machine recipe"));
        }
        Ok(())
    }

    pub fn insert_machine(&mut self, machine: MachineState) -> Result<(), Rejection> {
        validate_id("machine", &machine.machine_id)?;
        if let Some(settings) = &machine.settings {
            settings.validate()?;
        }
        for port in machine.ports.values() {
            validate_id("machine port", &port.port_id)?;
            if port.capacity == 0 || port.amount() > port.capacity {
                return Err(Rejection::new(RejectionCode::Capacity, "machine port exceeds capacity"));
            }
            for resource in port.resources.keys() {
                resource.validate()?;
            }
        }
        if self.machines.insert(machine.machine_id.clone(), machine).is_some() {
            return Err(Rejection::new(RejectionCode::Conflict, "duplicate machine"));
        }
        Ok(())
    }

    pub fn apply(&mut self, command: &MachineCommand, tick: u64) -> Result<Vec<ResourceDelta>, Rejection> {
        match command {
            MachineCommand::Operate {
                machine_id,
                expected_revision,
                operation,
            } => self.operate(machine_id, *expected_revision, operation),
            MachineCommand::Transfer {
                from,
                to,
                resource,
                amount,
                expected_from_revision,
                expected_to_revision,
            } => self.transfer(
                from,
                to,
                resource,
                *amount,
                *expected_from_revision,
                *expected_to_revision,
            ),
            MachineCommand::Advance {
                machine_id,
                expected_revision,
                to_tick,
            } => self.advance(machine_id, *expected_revision, *to_tick, tick),
            MachineCommand::GrantLease {
                machine_id,
                expected_revision,
                lease,
            } => {
                lease.validate()?;
                let machine = self.machine_mut(machine_id, *expected_revision)?;
                if lease.start_tick < tick {
                    return Err(Rejection::new(
                        RejectionCode::InvalidCommand,
                        "lease begins before authority tick",
                    ));
                }
                machine.lease = Some(lease.clone());
                machine.revision = machine.revision.wrapping_add(1);
                Ok(Vec::new())
            }
            MachineCommand::PowerTransfer {
                network_id,
                expected_revision,
                machine_id,
                amount,
            } => self.power_transfer(network_id, *expected_revision, machine_id, *amount),
        }
    }

    fn operate(
        &mut self,
        machine_id: &str,
        expected_revision: u64,
        operation: &MachineOperation,
    ) -> Result<Vec<ResourceDelta>, Rejection> {
        let machine = self.machine_mut(machine_id, expected_revision)?;
        let mut deltas = Vec::new();
        match operation {
            MachineOperation::Configure { settings } => {
                settings.validate()?;
                machine.settings = Some(settings.clone());
            }
            MachineOperation::Activate => machine.active = true,
            MachineOperation::Deactivate => machine.active = false,
            MachineOperation::ClaimOutput {
                port_id,
                resource,
                amount,
            } => {
                if *amount == 0 {
                    return Err(Rejection::new(RejectionCode::InvalidCommand, "claim amount is zero"));
                }
                let port = machine
                    .ports
                    .get_mut(port_id)
                    .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "machine port does not exist"))?;
                if !port.can_send(resource, *amount) {
                    return Err(Rejection::new(
                        RejectionCode::InsufficientResource,
                        "machine output is unavailable",
                    ));
                }
                decrement_resource(&mut port.resources, resource, *amount);
                if let Some(item_code) = resource.item_code {
                    let amount_i64 = i64::try_from(*amount)
                        .map_err(|_| Rejection::new(RejectionCode::Capacity, "claimed amount is too large"))?;
                    deltas.push(ResourceDelta {
                        item_code,
                        metadata_hash: resource.metadata_hash,
                        amount: amount_i64,
                        reason: format!("machine-claim:{machine_id}"),
                    });
                }
            }
        }
        machine.revision = machine.revision.wrapping_add(1);
        Ok(deltas)
    }

    fn transfer(
        &mut self,
        from: &ResourceEndpoint,
        to: &ResourceEndpoint,
        resource: &ResourceKey,
        amount: u64,
        expected_from: u64,
        expected_to: u64,
    ) -> Result<Vec<ResourceDelta>, Rejection> {
        resource.validate()?;
        if amount == 0 || from == to {
            return Err(Rejection::new(
                RejectionCode::InvalidCommand,
                "resource transfer is empty or self-referential",
            ));
        }
        let source = self
            .machines
            .get(&from.machine_id)
            .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "source machine does not exist"))?;
        if source.revision != expected_from {
            return Err(Rejection::new(
                RejectionCode::StaleRevision,
                "source machine revision is stale",
            ));
        }
        let source_port = source
            .ports
            .get(&from.port_id)
            .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "source port does not exist"))?;
        if !source_port.can_send(resource, amount) {
            return Err(Rejection::new(
                RejectionCode::InsufficientResource,
                "source port cannot send resource",
            ));
        }
        let destination = self
            .machines
            .get(&to.machine_id)
            .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "destination machine does not exist"))?;
        if destination.revision != expected_to {
            return Err(Rejection::new(
                RejectionCode::StaleRevision,
                "destination machine revision is stale",
            ));
        }
        let destination_port = destination
            .ports
            .get(&to.port_id)
            .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "destination port does not exist"))?;
        if !destination_port.can_receive(resource, amount) {
            return Err(Rejection::new(
                RejectionCode::Capacity,
                "destination port cannot receive resource",
            ));
        }
        {
            let source = self.machines.get_mut(&from.machine_id).expect("validated source");
            decrement_resource(
                &mut source.ports.get_mut(&from.port_id).expect("validated port").resources,
                resource,
                amount,
            );
            source.revision = source.revision.wrapping_add(1);
        }
        {
            let destination = self.machines.get_mut(&to.machine_id).expect("validated destination");
            *destination
                .ports
                .get_mut(&to.port_id)
                .expect("validated port")
                .resources
                .entry(resource.clone())
                .or_default() += amount;
            destination.revision = destination.revision.wrapping_add(1);
        }
        Ok(Vec::new())
    }

    fn advance(
        &mut self,
        machine_id: &str,
        expected_revision: u64,
        to_tick: u64,
        authority_tick: u64,
    ) -> Result<Vec<ResourceDelta>, Rejection> {
        let snapshot = self
            .machines
            .get(machine_id)
            .cloned()
            .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "machine does not exist"))?;
        if snapshot.revision != expected_revision {
            return Err(Rejection::new(
                RejectionCode::StaleRevision,
                "machine revision is stale",
            ));
        }
        if to_tick < snapshot.last_tick || to_tick > authority_tick {
            return Err(Rejection::new(
                RejectionCode::InvalidCommand,
                "machine advance tick is invalid",
            ));
        }
        if !snapshot.active {
            return Err(Rejection::new(RejectionCode::RulesRejected, "machine is inactive"));
        }
        let recipe_id = snapshot
            .recipe_id
            .as_ref()
            .ok_or_else(|| Rejection::new(RejectionCode::RulesRejected, "machine has no selected recipe"))?;
        let recipe = self
            .recipes
            .get(recipe_id)
            .cloned()
            .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "machine recipe does not exist"))?;
        let elapsed = to_tick - snapshot.last_tick;
        let candidate_cycles = (snapshot.progress_ticks + elapsed) / u64::from(recipe.duration_ticks);
        let lease_cycles = snapshot
            .lease
            .as_ref()
            .filter(|lease| snapshot.last_tick >= lease.start_tick && to_tick <= lease.end_tick)
            .map_or(candidate_cycles, |lease| u64::from(lease.max_cycles));
        let cycles = candidate_cycles.min(lease_cycles);
        let mut staged = snapshot.clone();
        let mut deltas = Vec::new();
        if cycles > 0 {
            for (resource, per_cycle) in &recipe.inputs {
                let amount = per_cycle
                    .checked_mul(cycles)
                    .ok_or_else(|| Rejection::new(RejectionCode::Capacity, "machine input overflow"))?;
                consume_from_ports(&mut staged, resource, amount)?;
                if let Some(code) = resource.item_code {
                    deltas.push(ResourceDelta {
                        item_code: code,
                        metadata_hash: resource.metadata_hash,
                        amount: -i64::try_from(amount)
                            .map_err(|_| Rejection::new(RejectionCode::Capacity, "machine delta overflow"))?,
                        reason: format!("machine:{recipe_id}"),
                    });
                }
            }
            for (resource, per_cycle) in &recipe.outputs {
                let amount = per_cycle
                    .checked_mul(cycles)
                    .ok_or_else(|| Rejection::new(RejectionCode::Capacity, "machine output overflow"))?;
                produce_to_ports(&mut staged, resource, amount)?;
                if let Some(code) = resource.item_code {
                    deltas.push(ResourceDelta {
                        item_code: code,
                        metadata_hash: resource.metadata_hash,
                        amount: i64::try_from(amount)
                            .map_err(|_| Rejection::new(RejectionCode::Capacity, "machine delta overflow"))?,
                        reason: format!("machine:{recipe_id}"),
                    });
                }
            }
        }
        // A bounded dormant lease intentionally drops work beyond its cycle cap;
        // it must not accumulate an unbounded backlog to execute on wake-up.
        staged.progress_ticks = (snapshot.progress_ticks + elapsed) % u64::from(recipe.duration_ticks);
        staged.last_tick = to_tick;
        staged.revision = staged.revision.wrapping_add(1);
        self.machines.insert(machine_id.to_owned(), staged);
        Ok(deltas)
    }

    fn power_transfer(
        &mut self,
        network_id: &str,
        expected_revision: u64,
        machine_id: &str,
        amount: i64,
    ) -> Result<Vec<ResourceDelta>, Rejection> {
        let network = self
            .power_networks
            .get_mut(network_id)
            .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "power network does not exist"))?;
        if network.revision != expected_revision {
            return Err(Rejection::new(
                RejectionCode::StaleRevision,
                "power network revision is stale",
            ));
        }
        if !network.members.contains(machine_id) || amount == 0 {
            return Err(Rejection::new(
                RejectionCode::Unauthorized,
                "machine is not connected to power network",
            ));
        }
        if amount > 0 {
            let amount = u64::try_from(amount).expect("positive i64 fits u64");
            if network.stored < amount {
                return Err(Rejection::new(
                    RejectionCode::InsufficientResource,
                    "power network lacks energy",
                ));
            }
            network.stored -= amount;
        } else {
            let amount = amount.unsigned_abs();
            if network
                .stored
                .checked_add(amount)
                .is_none_or(|total| total > network.capacity)
            {
                return Err(Rejection::new(RejectionCode::Capacity, "power network is full"));
            }
            network.stored += amount;
        }
        network.revision = network.revision.wrapping_add(1);
        Ok(Vec::new())
    }

    fn machine_mut(&mut self, machine_id: &str, expected_revision: u64) -> Result<&mut MachineState, Rejection> {
        let machine = self
            .machines
            .get_mut(machine_id)
            .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "machine does not exist"))?;
        if machine.revision != expected_revision {
            return Err(Rejection::new(
                RejectionCode::StaleRevision,
                "machine revision is stale",
            ));
        }
        Ok(machine)
    }

    pub(crate) fn hash_into(&self, hasher: &mut CanonicalHasher) {
        hasher.write_u64(self.recipes.len() as u64);
        for recipe in self.recipes.values() {
            hasher.write_str(&recipe.recipe_id);
            hasher.write_u32(recipe.duration_ticks);
            for (resource, amount) in &recipe.inputs {
                resource.hash_into(hasher);
                hasher.write_u64(*amount);
            }
            for (resource, amount) in &recipe.outputs {
                resource.hash_into(hasher);
                hasher.write_u64(*amount);
            }
        }
        hasher.write_u64(self.machines.len() as u64);
        for machine in self.machines.values() {
            hasher.write_str(&machine.machine_id);
            write_option_str(hasher, machine.owner_id.as_deref());
            hasher.write_u16(machine.kind as u16);
            hasher.write_u64(machine.revision);
            hasher.write_u16(u16::from(machine.active));
            write_option_str(hasher, machine.recipe_id.as_deref());
            hasher.write_u64(machine.progress_ticks);
            hasher.write_u64(machine.last_tick);
            hasher.write_u64(machine.ports.len() as u64);
            for port in machine.ports.values() {
                hasher.write_str(&port.port_id);
                hasher.write_u16(port.mode as u16);
                hasher.write_u64(port.capacity);
                hasher.write_u64(port.resources.len() as u64);
                for (resource, amount) in &port.resources {
                    resource.hash_into(hasher);
                    hasher.write_u64(*amount);
                }
            }
            match &machine.lease {
                Some(lease) => {
                    hasher.write_u16(1);
                    hasher.write_str(&lease.lease_id);
                    hasher.write_str(&lease.owner_id);
                    hasher.write_u64(lease.start_tick);
                    hasher.write_u64(lease.end_tick);
                    hasher.write_u32(lease.max_cycles);
                }
                None => hasher.write_u16(0),
            }
            match &machine.settings {
                Some(settings) => {
                    hasher.write_u16(1);
                    settings.hash_into(hasher);
                }
                None => hasher.write_u16(0),
            }
        }
        hasher.write_u64(self.power_networks.len() as u64);
        for network in self.power_networks.values() {
            hasher.write_str(&network.network_id);
            hasher.write_u64(network.revision);
            hasher.write_u64(network.stored);
            hasher.write_u64(network.capacity);
            for member in &network.members {
                hasher.write_str(member);
            }
        }
    }

    pub(crate) fn item_resource_totals(&self) -> BTreeMap<(u32, CanonicalHash), i128> {
        let mut totals = BTreeMap::new();
        for (resource, amount) in self
            .machines
            .values()
            .flat_map(|machine| machine.ports.values())
            .flat_map(|port| &port.resources)
        {
            if let Some(item_code) = resource.item_code {
                *totals.entry((item_code, resource.metadata_hash)).or_default() += i128::from(*amount);
            }
        }
        totals
    }
}

fn decrement_resource(resources: &mut BTreeMap<ResourceKey, u64>, key: &ResourceKey, amount: u64) {
    let current = resources.get_mut(key).expect("validated resource");
    *current -= amount;
    if *current == 0 {
        resources.remove(key);
    }
}

fn consume_from_ports(machine: &mut MachineState, resource: &ResourceKey, mut amount: u64) -> Result<(), Rejection> {
    let available: u64 = machine
        .ports
        .values()
        .filter(|port| port.mode != PortMode::Output)
        .map(|port| port.resources.get(resource).copied().unwrap_or(0))
        .sum();
    if available < amount {
        return Err(Rejection::new(
            RejectionCode::InsufficientResource,
            "machine lacks recipe inputs",
        ));
    }
    for port in machine.ports.values_mut().filter(|port| port.mode != PortMode::Output) {
        let take = port.resources.get(resource).copied().unwrap_or(0).min(amount);
        if take > 0 {
            decrement_resource(&mut port.resources, resource, take);
            amount -= take;
        }
        if amount == 0 {
            break;
        }
    }
    Ok(())
}

fn produce_to_ports(machine: &mut MachineState, resource: &ResourceKey, mut amount: u64) -> Result<(), Rejection> {
    let capacity: u64 = machine
        .ports
        .values()
        .filter(|port| port.mode != PortMode::Input && port.accepted.contains(&resource.kind))
        .map(|port| port.capacity - port.amount())
        .sum();
    if capacity < amount {
        return Err(Rejection::new(RejectionCode::Capacity, "machine output ports are full"));
    }
    for port in machine
        .ports
        .values_mut()
        .filter(|port| port.mode != PortMode::Input && port.accepted.contains(&resource.kind))
    {
        let moved = amount.min(port.capacity - port.amount());
        *port.resources.entry(resource.clone()).or_default() += moved;
        amount -= moved;
        if amount == 0 {
            break;
        }
    }
    Ok(())
}
