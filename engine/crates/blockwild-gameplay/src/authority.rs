use std::collections::{BTreeMap, BTreeSet, VecDeque};

use blockwild_types::{CanonicalHash, CanonicalHasher};

use crate::{
    AcceptedReceipt, ActorGrant, AuthorityIdentity, CardforgeCommand, CardforgeState, CombatCommand, CombatState,
    ContainerKey, Domain, GameplayActor, GameplayBatch, GameplayCommand, GameplayEvent, GameplayReceipt,
    GameplayRevision, IDEMPOTENCY_WINDOW, InventoryCommand, InventoryState, MachineCommand, MachineStateSet,
    OpaquePayload, ProgressionState, Rejection, RejectionCode, ResourceDelta, Scope, StatDelta, WorldKey,
};

#[derive(Clone, Debug, PartialEq)]
pub struct GameplayState {
    pub world: WorldKey,
    pub revision: GameplayRevision,
    pub tick: u64,
    pub inventory: InventoryState,
    pub machines: MachineStateSet,
    pub combat: CombatState,
    pub progression: ProgressionState,
    pub cardforge: CardforgeState,
}

impl GameplayState {
    #[must_use]
    pub fn new(world: WorldKey, epoch: u32) -> Self {
        Self {
            world,
            revision: GameplayRevision {
                epoch,
                ..GameplayRevision::default()
            },
            tick: 0,
            inventory: InventoryState::default(),
            machines: MachineStateSet::default(),
            combat: CombatState::default(),
            progression: ProgressionState::default(),
            cardforge: CardforgeState::default(),
        }
    }

    #[must_use]
    pub fn state_hash(&self) -> CanonicalHash {
        let mut hasher = CanonicalHasher::new("blockwild.gameplay.state.v1");
        self.world.hash_into(&mut hasher);
        self.revision.hash_into(&mut hasher);
        hasher.write_u64(self.tick);
        self.inventory.hash_into(&mut hasher);
        self.machines.hash_into(&mut hasher);
        self.combat.hash_into(&mut hasher);
        self.progression.hash_into(&mut hasher);
        self.cardforge.hash_into(&mut hasher);
        hasher.finish()
    }

    #[must_use]
    pub fn identity(&self) -> AuthorityIdentity {
        AuthorityIdentity {
            world: self.world.clone(),
            revision: self.revision,
            state_hash: self.state_hash(),
        }
    }

    fn item_totals(&self) -> BTreeMap<(u32, CanonicalHash), i128> {
        let mut totals = self.inventory.resource_totals();
        for (key, count) in self.machines.item_resource_totals() {
            *totals.entry(key).or_default() += count;
        }
        totals
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReplayEntry {
    pub sequence: u64,
    pub actor_id: String,
    pub idempotency_key: String,
    pub command_hash: CanonicalHash,
    pub before_hash: CanonicalHash,
    pub after_hash: CanonicalHash,
    pub receipt_hash: CanonicalHash,
}

#[derive(Clone, Debug)]
struct IdempotencyEntry {
    command_hash: CanonicalHash,
    receipt: AcceptedReceipt,
}

#[derive(Clone, Debug)]
pub struct GameplayAuthority {
    pub state: GameplayState,
    grants: BTreeMap<String, ActorGrant>,
    idempotency: BTreeMap<(String, String), IdempotencyEntry>,
    idempotency_order: VecDeque<(String, String)>,
    replay: Vec<ReplayEntry>,
}

impl GameplayAuthority {
    #[must_use]
    pub fn new(state: GameplayState) -> Self {
        Self {
            state,
            grants: BTreeMap::new(),
            idempotency: BTreeMap::new(),
            idempotency_order: VecDeque::new(),
            replay: Vec::new(),
        }
    }

    pub fn grant_actor(&mut self, actor_id: impl Into<String>, grant: ActorGrant) -> Result<(), Rejection> {
        let actor_id = actor_id.into();
        crate::validate_id("actor grant", &actor_id)?;
        self.grants.insert(actor_id, grant);
        Ok(())
    }

    #[must_use]
    pub fn replay(&self) -> &[ReplayEntry] {
        &self.replay
    }

    #[must_use]
    pub fn replay_hash(&self) -> CanonicalHash {
        let mut hasher = CanonicalHasher::new("blockwild.gameplay.replay.v1");
        for entry in &self.replay {
            hasher.write_u64(entry.sequence);
            hasher.write_str(&entry.actor_id);
            hasher.write_str(&entry.idempotency_key);
            hasher.write_bytes(entry.command_hash.as_bytes());
            hasher.write_bytes(entry.before_hash.as_bytes());
            hasher.write_bytes(entry.after_hash.as_bytes());
            hasher.write_bytes(entry.receipt_hash.as_bytes());
        }
        hasher.finish()
    }

    pub fn apply_batch(&mut self, batch: &GameplayBatch) -> GameplayReceipt {
        let current_identity = self.state.identity();
        if let Err(rejection) = batch.validate_shape() {
            return rejected(batch, current_identity, rejection);
        }

        let idempotency_key = (batch.actor.actor_id.clone(), batch.idempotency_key.clone());
        if let Some(entry) = self.idempotency.get(&idempotency_key) {
            if entry.command_hash == batch.command_hash {
                return GameplayReceipt::Accepted(entry.receipt.clone());
            }
            return rejected(
                batch,
                current_identity,
                Rejection::new(
                    RejectionCode::Conflict,
                    "idempotency key was reused for different commands",
                ),
            );
        }

        if batch.identity.world != self.state.world {
            return rejected(
                batch,
                current_identity,
                Rejection::new(RejectionCode::WrongWorld, "batch targets another world"),
            );
        }
        if batch.identity.revision != self.state.revision || batch.identity.state_hash != current_identity.state_hash {
            return rejected(
                batch,
                current_identity,
                Rejection::new(RejectionCode::StaleRevision, "gameplay identity is stale"),
            );
        }
        let grant = match self.validate_actor(&batch.actor) {
            Ok(grant) => grant.clone(),
            Err(rejection) => return rejected(batch, current_identity, rejection),
        };

        let before = current_identity;
        let before_totals = self.state.item_totals();
        let mut staged = self.state.clone();
        let mut touched = BTreeSet::new();
        let mut resource_deltas = Vec::new();
        let mut stat_deltas = Vec::new();
        let mut events = Vec::new();

        for (index, command) in batch.commands.iter().enumerate() {
            if let Err(rejection) = authorize_command(&staged, &batch.actor, &grant, command) {
                return rejected(batch, before, rejection);
            }
            if let Err(rejection) = dispatch(
                &mut staged,
                &batch.actor,
                command,
                index,
                &batch.batch_id,
                &mut touched,
                &mut resource_deltas,
                &mut stat_deltas,
                &mut events,
            ) {
                return rejected(batch, before, rejection);
            }
        }

        if let Err(rejection) = validate_resource_conservation(&before_totals, &staged.item_totals(), &resource_deltas)
        {
            return rejected(batch, before, rejection);
        }
        if let Err(rejection) = events.iter().try_for_each(GameplayEvent::validate) {
            return rejected(batch, before, rejection);
        }

        staged.revision.sequence = staged.revision.sequence.wrapping_add(1);
        for domain in &touched {
            match domain {
                Domain::Inventory => {
                    staged.revision.inventory = staged.revision.inventory.wrapping_add(1);
                }
                Domain::Machines => {
                    staged.revision.machines = staged.revision.machines.wrapping_add(1);
                }
                Domain::Combat => {
                    staged.revision.combat = staged.revision.combat.wrapping_add(1);
                }
                Domain::Progression => {
                    staged.revision.progression = staged.revision.progression.wrapping_add(1);
                }
                Domain::Cardforge => {
                    staged.revision.cardforge = staged.revision.cardforge.wrapping_add(1);
                }
            }
        }
        let after = staged.identity();
        let receipt_hash = receipt_hash(
            &batch.batch_id,
            &before,
            &after,
            &touched,
            &resource_deltas,
            &stat_deltas,
            &events,
        );
        let receipt = AcceptedReceipt {
            batch_id: batch.batch_id.clone(),
            before: before.clone(),
            after: after.clone(),
            touched_domains: touched,
            resource_deltas,
            stat_deltas,
            events,
            receipt_hash,
        };
        self.state = staged;
        self.replay.push(ReplayEntry {
            sequence: after.revision.sequence,
            actor_id: batch.actor.actor_id.clone(),
            idempotency_key: batch.idempotency_key.clone(),
            command_hash: batch.command_hash,
            before_hash: before.state_hash,
            after_hash: after.state_hash,
            receipt_hash,
        });
        self.insert_idempotency(idempotency_key, batch.command_hash, receipt.clone());
        GameplayReceipt::Accepted(receipt)
    }

    fn validate_actor(&self, actor: &GameplayActor) -> Result<&ActorGrant, Rejection> {
        let grant = self
            .grants
            .get(&actor.actor_id)
            .ok_or_else(|| Rejection::new(RejectionCode::Unauthorized, "actor has no authority grant"))?;
        if grant.player_id != actor.player_id || grant.entity_id != actor.entity_id || grant.role != actor.role {
            return Err(Rejection::new(
                RejectionCode::Unauthorized,
                "actor identity does not match authority grant",
            ));
        }
        Ok(grant)
    }

    fn insert_idempotency(&mut self, key: (String, String), command_hash: CanonicalHash, receipt: AcceptedReceipt) {
        self.idempotency
            .insert(key.clone(), IdempotencyEntry { command_hash, receipt });
        self.idempotency_order.push_back(key);
        while self.idempotency_order.len() > IDEMPOTENCY_WINDOW {
            if let Some(expired) = self.idempotency_order.pop_front() {
                self.idempotency.remove(&expired);
            }
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn dispatch(
    state: &mut GameplayState,
    actor: &GameplayActor,
    command: &GameplayCommand,
    command_index: usize,
    batch_id: &str,
    touched: &mut BTreeSet<Domain>,
    resource_deltas: &mut Vec<ResourceDelta>,
    stat_deltas: &mut Vec<StatDelta>,
    events: &mut Vec<GameplayEvent>,
) -> Result<(), Rejection> {
    match command {
        GameplayCommand::Inventory(command) => {
            let deltas = match command {
                InventoryCommand::Transfer(command) => state.inventory.transfer(command)?,
                InventoryCommand::Craft(command) => state.inventory.craft(command)?,
                InventoryCommand::AdvanceFurnace(command) => state.inventory.advance_furnace(command)?,
            };
            resource_deltas.extend(deltas);
            touched.insert(Domain::Inventory);
            push_event(events, batch_id, command_index, &actor.actor_id, "inventory", None);
        }
        GameplayCommand::Machine(command) => {
            let deltas = state.machines.apply(command, state.tick)?;
            for delta in deltas {
                if delta.reason.starts_with("machine-claim:") && delta.amount > 0 {
                    let count = u32::try_from(delta.amount)
                        .map_err(|_| Rejection::new(RejectionCode::Capacity, "machine claim is too large"))?;
                    state
                        .inventory
                        .grant_owned_item(&actor.actor_id, delta.item_code, delta.metadata_hash, count)?;
                    touched.insert(Domain::Inventory);
                } else {
                    resource_deltas.push(delta);
                }
            }
            touched.insert(Domain::Machines);
            push_event(events, batch_id, command_index, &actor.actor_id, "machine", None);
        }
        GameplayCommand::Combat(command) => {
            let mutation = state.combat.apply(command)?;
            for (item_code, count, owner_id) in mutation.consumed_items {
                resource_deltas.push(state.inventory.consume_owned_item(
                    &owner_id,
                    item_code,
                    count,
                    "combat-consumable",
                )?);
                touched.insert(Domain::Inventory);
            }
            stat_deltas.extend(mutation.stat_deltas);
            for (kind, record) in mutation.event_kinds {
                push_event(events, batch_id, command_index, &actor.actor_id, &kind, Some(record));
            }
            touched.insert(Domain::Combat);
        }
        GameplayCommand::Progression(command) => {
            let mutation = state.progression.apply(command)?;
            stat_deltas.extend(mutation.stat_deltas);
            for (kind, record) in mutation.event_kinds {
                push_event(events, batch_id, command_index, &actor.actor_id, &kind, Some(record));
            }
            touched.insert(Domain::Progression);
        }
        GameplayCommand::Cardforge(command) => {
            let mutation = state.cardforge.apply(command)?;
            for (kind, record) in mutation.event_kinds {
                push_event(events, batch_id, command_index, &actor.actor_id, &kind, Some(record));
            }
            if !mutation.revealed.is_empty() {
                let mut payload = Vec::new();
                for printing in mutation.revealed {
                    payload.extend_from_slice(printing.card_id.as_bytes());
                    payload.push(0);
                }
                events.push(GameplayEvent {
                    event_id: format!("{batch_id}:{command_index}:pack-reveal"),
                    kind: "pack-reveal".into(),
                    actor_id: actor.actor_id.clone(),
                    record_id: None,
                    payload: OpaquePayload {
                        type_id: "blockwild.cardforge.reveal.v1".into(),
                        schema: 1,
                        bytes: payload,
                    },
                });
            }
            touched.insert(Domain::Cardforge);
        }
    }
    Ok(())
}

fn authorize_command(
    state: &GameplayState,
    actor: &GameplayActor,
    grant: &ActorGrant,
    command: &GameplayCommand,
) -> Result<(), Rejection> {
    if grant.scopes.contains(&Scope::System) {
        return Ok(());
    }
    match command {
        GameplayCommand::Inventory(command) => {
            if grant.scopes.contains(&Scope::InventoryAny) {
                return Ok(());
            }
            require_scope(grant, Scope::InventorySelf)?;
            let owns = |key: &ContainerKey| key.owner_id.as_deref() == Some(&actor.actor_id);
            let allowed = match command {
                InventoryCommand::Transfer(command) => owns(&command.from.container) && owns(&command.to.container),
                InventoryCommand::Craft(command) => owns(&command.source) && owns(&command.destination),
                InventoryCommand::AdvanceFurnace(command) => state
                    .inventory
                    .furnaces
                    .get(&command.furnace_id)
                    .is_some_and(|furnace| owns(&furnace.source) && owns(&furnace.destination)),
            };
            if !allowed {
                return Err(Rejection::new(
                    RejectionCode::Unauthorized,
                    "inventory command crosses actor custody",
                ));
            }
        }
        GameplayCommand::Machine(command) => {
            require_scope(grant, Scope::Machines)?;
            let owns_machine = |machine_id: &str| {
                state
                    .machines
                    .machines
                    .get(machine_id)
                    .is_some_and(|machine| machine.owner_id.as_deref() == Some(&actor.actor_id))
            };
            let allowed = match command {
                MachineCommand::Operate { machine_id, .. }
                | MachineCommand::Advance { machine_id, .. }
                | MachineCommand::GrantLease { machine_id, .. } => owns_machine(machine_id),
                MachineCommand::Transfer { from, to, .. } => {
                    owns_machine(&from.machine_id) && owns_machine(&to.machine_id)
                }
                MachineCommand::PowerTransfer { machine_id, .. } => owns_machine(machine_id),
            };
            if !allowed {
                return Err(Rejection::new(
                    RejectionCode::Unauthorized,
                    "machine command crosses actor ownership",
                ));
            }
        }
        GameplayCommand::Combat(command) => {
            if grant.scopes.contains(&Scope::CombatAny) {
                return Ok(());
            }
            require_scope(grant, Scope::CombatSelf)?;
            let source = match command {
                CombatCommand::UseAbility { source_id, .. }
                | CombatCommand::Capture { source_id, .. }
                | CombatCommand::Pacify { source_id, .. }
                | CombatCommand::Care { source_id, .. }
                | CombatCommand::Summon { source_id, .. } => Some(source_id.as_str()),
                CombatCommand::ResolveProjectile { projectile_id, .. } => state
                    .combat
                    .projectiles
                    .get(projectile_id)
                    .map(|projectile| projectile.source_id.as_str()),
                CombatCommand::Advance { .. } => None,
            };
            if source != Some(actor.actor_id.as_str()) {
                return Err(Rejection::new(
                    RejectionCode::Unauthorized,
                    "combat source does not belong to actor",
                ));
            }
        }
        GameplayCommand::Progression(command) => {
            if grant.scopes.contains(&Scope::ProgressionAny) {
                return Ok(());
            }
            require_scope(grant, Scope::ProgressionSelf)?;
            if command.owner_id != actor.actor_id {
                return Err(Rejection::new(
                    RejectionCode::Unauthorized,
                    "progression record belongs to another actor",
                ));
            }
        }
        GameplayCommand::Cardforge(command) => {
            if grant.scopes.contains(&Scope::CardforgeAny) {
                return Ok(());
            }
            require_scope(grant, Scope::CardforgeSelf)?;
            let allowed = match command {
                CardforgeCommand::OpenPack { owner_id, .. }
                | CardforgeCommand::MoveCard { owner_id, .. }
                | CardforgeCommand::ArchiveDuplicate { owner_id, .. }
                | CardforgeCommand::BuildDeck { owner_id, .. }
                | CardforgeCommand::MatchAction { owner_id, .. }
                | CardforgeCommand::ClaimReward { owner_id, .. } => owner_id == &actor.actor_id,
                CardforgeCommand::StartMatch { player_one, .. } => player_one == &actor.actor_id,
            };
            if !allowed {
                return Err(Rejection::new(
                    RejectionCode::Unauthorized,
                    "Cardforge command belongs to another actor",
                ));
            }
        }
    }
    Ok(())
}

fn require_scope(grant: &ActorGrant, scope: Scope) -> Result<(), Rejection> {
    if grant.scopes.contains(&scope) {
        Ok(())
    } else {
        Err(Rejection::new(
            RejectionCode::Unauthorized,
            "actor grant lacks required gameplay scope",
        ))
    }
}

fn validate_resource_conservation(
    before: &BTreeMap<(u32, CanonicalHash), i128>,
    after: &BTreeMap<(u32, CanonicalHash), i128>,
    deltas: &[ResourceDelta],
) -> Result<(), Rejection> {
    let mut expected = BTreeMap::<(u32, CanonicalHash), i128>::new();
    for delta in deltas {
        *expected.entry((delta.item_code, delta.metadata_hash)).or_default() += i128::from(delta.amount);
    }
    let keys: BTreeSet<_> = before
        .keys()
        .chain(after.keys())
        .chain(expected.keys())
        .copied()
        .collect();
    for key in keys {
        let actual = after.get(&key).copied().unwrap_or(0) - before.get(&key).copied().unwrap_or(0);
        if actual != expected.get(&key).copied().unwrap_or(0) {
            return Err(Rejection::new(
                RejectionCode::Conflict,
                "resource conservation audit failed",
            ));
        }
    }
    Ok(())
}

fn push_event(
    events: &mut Vec<GameplayEvent>,
    batch_id: &str,
    index: usize,
    actor_id: &str,
    kind: &str,
    record_id: Option<String>,
) {
    events.push(GameplayEvent {
        event_id: format!("{batch_id}:{index}:{kind}"),
        kind: kind.into(),
        actor_id: actor_id.into(),
        record_id,
        payload: OpaquePayload {
            type_id: "blockwild.gameplay.event.v1".into(),
            schema: 1,
            bytes: Vec::new(),
        },
    });
}

#[allow(clippy::too_many_arguments)]
fn receipt_hash(
    batch_id: &str,
    before: &AuthorityIdentity,
    after: &AuthorityIdentity,
    touched: &BTreeSet<Domain>,
    resources: &[ResourceDelta],
    stats: &[StatDelta],
    events: &[GameplayEvent],
) -> CanonicalHash {
    let mut hasher = CanonicalHasher::new("blockwild.gameplay.receipt.v1");
    hasher.write_str(batch_id);
    hasher.write_bytes(before.state_hash.as_bytes());
    hasher.write_bytes(after.state_hash.as_bytes());
    for domain in touched {
        hasher.write_u16(*domain as u16);
    }
    for delta in resources {
        hasher.write_u32(delta.item_code);
        hasher.write_bytes(delta.metadata_hash.as_bytes());
        hasher.write_u64(delta.amount as u64);
        hasher.write_str(&delta.reason);
    }
    for delta in stats {
        hasher.write_str(&delta.record_id);
        hasher.write_str(&delta.stat_id);
        hasher.write_u64(delta.amount as u64);
    }
    for event in events {
        hasher.write_str(&event.event_id);
        hasher.write_str(&event.kind);
        hasher.write_str(&event.actor_id);
        match &event.record_id {
            Some(record_id) => {
                hasher.write_u16(1);
                hasher.write_str(record_id);
            }
            None => hasher.write_u16(0),
        }
        event.payload.hash_into(&mut hasher);
    }
    hasher.finish()
}

fn rejected(batch: &GameplayBatch, identity: AuthorityIdentity, rejection: Rejection) -> GameplayReceipt {
    GameplayReceipt::Rejected {
        batch_id: batch.batch_id.clone(),
        identity,
        rejection,
    }
}
