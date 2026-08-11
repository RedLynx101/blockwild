use std::collections::{BTreeMap, BTreeSet};

use blockwild_types::{CanonicalHasher, fnv1a_utf16};

use crate::{OpaquePayload, Rejection, RejectionCode, StatDelta, validate_id, write_option_str};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SkillState {
    pub rank: u32,
    pub xp: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PlayerProgression {
    pub player_id: String,
    pub revision: u64,
    pub level: u32,
    pub perk_points: u32,
    pub skills: BTreeMap<String, SkillState>,
    pub unlocked_perks: BTreeSet<String>,
    pub research_flags: BTreeSet<String>,
    pub fast_travel_charges: u32,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PerkDefinition {
    pub perk_id: String,
    pub skill_id: String,
    pub required_rank: u32,
    pub cost: u32,
    pub prerequisites: BTreeSet<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct QuestRecord {
    pub record_id: String,
    pub owner_id: String,
    pub quest_id: String,
    pub revision: u64,
    pub stage: u16,
    pub completed: bool,
    pub choices: Vec<String>,
    pub flags: BTreeSet<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct QuestChoiceDefinition {
    pub quest_id: String,
    pub stage: u16,
    pub option_id: String,
    pub next_stage: u16,
    pub required_flags: BTreeSet<String>,
    pub granted_flags: BTreeSet<String>,
    pub complete: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AlignmentRecord {
    pub record_id: String,
    pub owner_id: String,
    pub content_id: String,
    pub revision: u64,
    pub standing: i32,
    pub rank: u16,
    pub flags: BTreeSet<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Wallet {
    pub owner_id: String,
    pub revision: u64,
    pub balances: BTreeMap<String, u64>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketListing {
    pub listing_id: String,
    pub seller_id: String,
    pub content_id: String,
    pub currency_id: String,
    pub unit_price: u64,
    pub available: u32,
    pub revision: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SettlementRecord {
    pub settlement_id: String,
    pub faction_id: String,
    pub revision: u64,
    pub prosperity: u32,
    pub safety: u32,
    pub population: u32,
    pub upgrades: BTreeSet<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DragonRecord {
    pub dragon_id: String,
    pub owner_id: String,
    pub species_id: String,
    pub variant_id: String,
    pub revision: u64,
    pub level: u32,
    pub xp: u64,
    pub bond: u32,
    pub unlocked_moves: BTreeSet<String>,
    pub equipment_ids: Vec<String>,
    pub research_flags: BTreeSet<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LegendaryEncounter {
    pub encounter_id: String,
    pub creature_id: String,
    pub revision: u64,
    pub phase: u16,
    pub resolved: bool,
    pub eligible_players: BTreeSet<String>,
    pub flags: BTreeSet<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ProgressionAction {
    UnlockPerk,
    QuestChoice,
    FactionChoice,
    GuildAction,
    Trade,
    FastTravel,
    DialogueChoice,
    DragonTraining,
    SettlementAction,
    LegendaryAction,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProgressionCommand {
    pub action: ProgressionAction,
    pub owner_id: String,
    pub record_id: String,
    pub expected_record_revision: u64,
    pub option_id: String,
    pub quantity: u32,
    pub currency_id: Option<String>,
    pub payload: Option<OpaquePayload>,
}

impl ProgressionCommand {
    pub(crate) fn hash_into(&self, hasher: &mut CanonicalHasher) {
        hasher.write_u16(self.action as u16);
        hasher.write_str(&self.owner_id);
        hasher.write_str(&self.record_id);
        hasher.write_u64(self.expected_record_revision);
        hasher.write_str(&self.option_id);
        hasher.write_u32(self.quantity);
        write_option_str(hasher, self.currency_id.as_deref());
        match &self.payload {
            Some(payload) => {
                hasher.write_u16(1);
                payload.hash_into(hasher);
            }
            None => hasher.write_u16(0),
        }
    }
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct ProgressionState {
    pub players: BTreeMap<String, PlayerProgression>,
    pub perks: BTreeMap<String, PerkDefinition>,
    pub quests: BTreeMap<String, QuestRecord>,
    pub quest_choices: BTreeMap<(String, u16, String), QuestChoiceDefinition>,
    pub factions: BTreeMap<String, AlignmentRecord>,
    pub guilds: BTreeMap<String, AlignmentRecord>,
    pub wallets: BTreeMap<String, Wallet>,
    pub listings: BTreeMap<String, MarketListing>,
    pub settlements: BTreeMap<String, SettlementRecord>,
    pub dragons: BTreeMap<String, DragonRecord>,
    pub legendary: BTreeMap<String, LegendaryEncounter>,
    pub dialogue_history: BTreeMap<String, Vec<String>>,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct ProgressionMutation {
    pub stat_deltas: Vec<StatDelta>,
    pub event_kinds: Vec<(String, String)>,
}

impl ProgressionState {
    pub fn apply(&mut self, command: &ProgressionCommand) -> Result<ProgressionMutation, Rejection> {
        validate_id("progression owner", &command.owner_id)?;
        validate_id("progression record", &command.record_id)?;
        validate_id("progression option", &command.option_id)?;
        if let Some(currency) = &command.currency_id {
            validate_id("currency", currency)?;
        }
        if let Some(payload) = &command.payload {
            payload.validate()?;
        }
        match command.action {
            ProgressionAction::UnlockPerk => self.unlock_perk(command),
            ProgressionAction::QuestChoice => self.quest_choice(command),
            ProgressionAction::FactionChoice => self.alignment_action(command, false),
            ProgressionAction::GuildAction => self.alignment_action(command, true),
            ProgressionAction::Trade => self.trade(command),
            ProgressionAction::FastTravel => self.fast_travel(command),
            ProgressionAction::DialogueChoice => self.dialogue(command),
            ProgressionAction::DragonTraining => self.train_dragon(command),
            ProgressionAction::SettlementAction => self.settlement(command),
            ProgressionAction::LegendaryAction => self.legendary(command),
        }
    }

    fn unlock_perk(&mut self, command: &ProgressionCommand) -> Result<ProgressionMutation, Rejection> {
        let perk = self
            .perks
            .get(&command.option_id)
            .cloned()
            .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "perk does not exist"))?;
        let player = self
            .players
            .get_mut(&command.owner_id)
            .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "player progression does not exist"))?;
        check_revision(player.revision, command.expected_record_revision, "player progression")?;
        if player.unlocked_perks.contains(&perk.perk_id) {
            return Err(Rejection::new(RejectionCode::Conflict, "perk is already unlocked"));
        }
        if player.perk_points < perk.cost
            || player.skills.get(&perk.skill_id).map_or(0, |skill| skill.rank) < perk.required_rank
            || !perk.prerequisites.is_subset(&player.unlocked_perks)
        {
            return Err(Rejection::new(
                RejectionCode::RulesRejected,
                "perk requirements are not met",
            ));
        }
        player.perk_points -= perk.cost;
        player.unlocked_perks.insert(perk.perk_id.clone());
        player.revision = player.revision.wrapping_add(1);
        Ok(ProgressionMutation {
            stat_deltas: vec![StatDelta {
                record_id: command.owner_id.clone(),
                stat_id: "perk-points".into(),
                amount: -i64::from(perk.cost),
            }],
            event_kinds: vec![("perk-unlocked".into(), perk.perk_id)],
        })
    }

    fn quest_choice(&mut self, command: &ProgressionCommand) -> Result<ProgressionMutation, Rejection> {
        let quest = self
            .quests
            .get_mut(&command.record_id)
            .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "quest record does not exist"))?;
        check_owner_revision(&quest.owner_id, quest.revision, command, "quest")?;
        if quest.completed {
            return Err(Rejection::new(RejectionCode::Conflict, "quest is already complete"));
        }
        let definition = self
            .quest_choices
            .get(&(quest.quest_id.clone(), quest.stage, command.option_id.clone()))
            .ok_or_else(|| Rejection::new(RejectionCode::RulesRejected, "quest choice is unavailable"))?;
        if !definition.required_flags.is_subset(&quest.flags) {
            return Err(Rejection::new(
                RejectionCode::RulesRejected,
                "quest choice requirements are not met",
            ));
        }
        quest.stage = definition.next_stage;
        quest.completed = definition.complete;
        quest.flags.extend(definition.granted_flags.iter().cloned());
        quest.choices.push(command.option_id.clone());
        quest.revision = quest.revision.wrapping_add(1);
        Ok(ProgressionMutation {
            event_kinds: vec![("quest-choice".into(), command.record_id.clone())],
            ..ProgressionMutation::default()
        })
    }

    fn alignment_action(
        &mut self,
        command: &ProgressionCommand,
        guild: bool,
    ) -> Result<ProgressionMutation, Rejection> {
        let records = if guild { &mut self.guilds } else { &mut self.factions };
        let record = records
            .get_mut(&command.record_id)
            .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "alignment record does not exist"))?;
        check_owner_revision(&record.owner_id, record.revision, command, "alignment")?;
        let magnitude = i32::try_from(command.quantity.min(1_000)).unwrap_or(1_000);
        let positive = !command.option_id.starts_with("oppose:");
        record.standing = record
            .standing
            .saturating_add(if positive { magnitude } else { -magnitude })
            .clamp(-10_000, 10_000);
        record.rank = standing_rank(record.standing);
        record.flags.insert(command.option_id.clone());
        record.revision = record.revision.wrapping_add(1);
        Ok(ProgressionMutation {
            stat_deltas: vec![StatDelta {
                record_id: command.record_id.clone(),
                stat_id: "standing".into(),
                amount: i64::from(if positive { magnitude } else { -magnitude }),
            }],
            event_kinds: vec![(
                if guild { "guild-action" } else { "faction-choice" }.into(),
                command.record_id.clone(),
            )],
        })
    }

    fn trade(&mut self, command: &ProgressionCommand) -> Result<ProgressionMutation, Rejection> {
        let listing = self
            .listings
            .get(&command.record_id)
            .cloned()
            .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "market listing does not exist"))?;
        check_revision(listing.revision, command.expected_record_revision, "market listing")?;
        if command.quantity == 0 || command.quantity > listing.available {
            return Err(Rejection::new(
                RejectionCode::InsufficientResource,
                "listing quantity is unavailable",
            ));
        }
        if command.currency_id.as_deref() != Some(&listing.currency_id) {
            return Err(Rejection::new(
                RejectionCode::RulesRejected,
                "trade currency does not match listing",
            ));
        }
        let total = listing
            .unit_price
            .checked_mul(u64::from(command.quantity))
            .ok_or_else(|| Rejection::new(RejectionCode::Capacity, "trade total overflow"))?;
        if listing.seller_id == command.owner_id {
            return Err(Rejection::new(
                RejectionCode::RulesRejected,
                "seller cannot buy own listing",
            ));
        }
        let buyer_balance = self
            .wallets
            .get(&command.owner_id)
            .and_then(|wallet| wallet.balances.get(&listing.currency_id))
            .copied()
            .unwrap_or(0);
        if buyer_balance < total {
            return Err(Rejection::new(
                RejectionCode::InsufficientResource,
                "wallet lacks trade currency",
            ));
        }
        let buyer = self.wallets.get_mut(&command.owner_id).expect("validated buyer wallet");
        *buyer.balances.get_mut(&listing.currency_id).expect("validated balance") -= total;
        buyer.revision = buyer.revision.wrapping_add(1);
        let seller = self
            .wallets
            .get_mut(&listing.seller_id)
            .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "seller wallet does not exist"))?;
        *seller.balances.entry(listing.currency_id.clone()).or_default() = seller
            .balances
            .get(&listing.currency_id)
            .copied()
            .unwrap_or(0)
            .checked_add(total)
            .ok_or_else(|| Rejection::new(RejectionCode::Capacity, "seller balance overflow"))?;
        seller.revision = seller.revision.wrapping_add(1);
        let listing_mut = self.listings.get_mut(&command.record_id).expect("validated listing");
        listing_mut.available -= command.quantity;
        listing_mut.revision = listing_mut.revision.wrapping_add(1);
        Ok(ProgressionMutation {
            stat_deltas: vec![StatDelta {
                record_id: command.owner_id.clone(),
                stat_id: format!("currency:{}", listing.currency_id),
                amount: -i64::try_from(total)
                    .map_err(|_| Rejection::new(RejectionCode::Capacity, "trade delta overflow"))?,
            }],
            event_kinds: vec![("trade".into(), listing.content_id)],
        })
    }

    fn fast_travel(&mut self, command: &ProgressionCommand) -> Result<ProgressionMutation, Rejection> {
        let player = self
            .players
            .get_mut(&command.owner_id)
            .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "player progression does not exist"))?;
        check_revision(player.revision, command.expected_record_revision, "player progression")?;
        let cost = command.quantity.max(1);
        if player.fast_travel_charges < cost {
            return Err(Rejection::new(
                RejectionCode::InsufficientResource,
                "not enough fast travel charges",
            ));
        }
        player.fast_travel_charges -= cost;
        player.revision = player.revision.wrapping_add(1);
        Ok(ProgressionMutation {
            stat_deltas: vec![StatDelta {
                record_id: command.owner_id.clone(),
                stat_id: "fast-travel-charges".into(),
                amount: -i64::from(cost),
            }],
            event_kinds: vec![("fast-travel".into(), command.option_id.clone())],
        })
    }

    fn dialogue(&mut self, command: &ProgressionCommand) -> Result<ProgressionMutation, Rejection> {
        let history = self.dialogue_history.entry(command.record_id.clone()).or_default();
        let revision = u64::try_from(history.len()).unwrap_or(u64::MAX);
        check_revision(revision, command.expected_record_revision, "dialogue")?;
        if history.len() >= 4_096 {
            return Err(Rejection::new(RejectionCode::Capacity, "dialogue history is full"));
        }
        history.push(command.option_id.clone());
        Ok(ProgressionMutation {
            event_kinds: vec![("dialogue-choice".into(), command.record_id.clone())],
            ..ProgressionMutation::default()
        })
    }

    fn train_dragon(&mut self, command: &ProgressionCommand) -> Result<ProgressionMutation, Rejection> {
        let dragon = self
            .dragons
            .get_mut(&command.record_id)
            .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "dragon record does not exist"))?;
        check_owner_revision(&dragon.owner_id, dragon.revision, command, "dragon")?;
        let gained = u64::from(command.quantity.max(1));
        dragon.xp = dragon.xp.saturating_add(gained);
        let old_level = dragon.level;
        dragon.level = level_for_xp(dragon.xp);
        dragon.bond = dragon.bond.saturating_add(command.quantity / 2).min(1_000);
        if command.option_id.starts_with("move:") && dragon.level > old_level {
            dragon
                .unlocked_moves
                .insert(command.option_id.trim_start_matches("move:").to_owned());
        }
        dragon.revision = dragon.revision.wrapping_add(1);
        Ok(ProgressionMutation {
            stat_deltas: vec![StatDelta {
                record_id: command.record_id.clone(),
                stat_id: "xp".into(),
                amount: i64::try_from(gained).unwrap_or(i64::MAX),
            }],
            event_kinds: vec![("dragon-trained".into(), command.record_id.clone())],
        })
    }

    fn settlement(&mut self, command: &ProgressionCommand) -> Result<ProgressionMutation, Rejection> {
        let settlement = self
            .settlements
            .get_mut(&command.record_id)
            .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "settlement does not exist"))?;
        check_revision(settlement.revision, command.expected_record_revision, "settlement")?;
        let amount = command.quantity.min(10_000);
        match command.option_id.as_str() {
            "prosperity" => settlement.prosperity = settlement.prosperity.saturating_add(amount),
            "safety" => settlement.safety = settlement.safety.saturating_add(amount),
            "population" => settlement.population = settlement.population.saturating_add(amount),
            upgrade if upgrade.starts_with("upgrade:") => {
                settlement
                    .upgrades
                    .insert(upgrade.trim_start_matches("upgrade:").to_owned());
            }
            _ => {
                return Err(Rejection::new(
                    RejectionCode::RulesRejected,
                    "unknown settlement action",
                ));
            }
        }
        settlement.revision = settlement.revision.wrapping_add(1);
        Ok(ProgressionMutation {
            event_kinds: vec![("settlement-action".into(), command.record_id.clone())],
            ..ProgressionMutation::default()
        })
    }

    fn legendary(&mut self, command: &ProgressionCommand) -> Result<ProgressionMutation, Rejection> {
        let encounter = self
            .legendary
            .get_mut(&command.record_id)
            .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "legendary encounter does not exist"))?;
        check_revision(
            encounter.revision,
            command.expected_record_revision,
            "legendary encounter",
        )?;
        if !encounter.eligible_players.contains(&command.owner_id) {
            return Err(Rejection::new(
                RejectionCode::Unauthorized,
                "player is not eligible for encounter",
            ));
        }
        if encounter.resolved {
            return Err(Rejection::new(
                RejectionCode::Conflict,
                "legendary encounter is already resolved",
            ));
        }
        encounter.flags.insert(command.option_id.clone());
        encounter.phase = encounter.phase.saturating_add(1);
        encounter.resolved = command.option_id == "resolve";
        encounter.revision = encounter.revision.wrapping_add(1);
        Ok(ProgressionMutation {
            event_kinds: vec![("legendary-action".into(), command.record_id.clone())],
            ..ProgressionMutation::default()
        })
    }

    pub(crate) fn hash_into(&self, hasher: &mut CanonicalHasher) {
        hasher.write_u64(self.perks.len() as u64);
        for perk in self.perks.values() {
            hasher.write_str(&perk.perk_id);
            hasher.write_str(&perk.skill_id);
            hasher.write_u32(perk.required_rank);
            hasher.write_u32(perk.cost);
            for prerequisite in &perk.prerequisites {
                hasher.write_str(prerequisite);
            }
        }
        hasher.write_u64(self.quest_choices.len() as u64);
        for definition in self.quest_choices.values() {
            hasher.write_str(&definition.quest_id);
            hasher.write_u16(definition.stage);
            hasher.write_str(&definition.option_id);
            hasher.write_u16(definition.next_stage);
            for flag in &definition.required_flags {
                hasher.write_str(flag);
            }
            for flag in &definition.granted_flags {
                hasher.write_str(flag);
            }
            hasher.write_u16(u16::from(definition.complete));
        }
        hasher.write_u64(self.players.len() as u64);
        for player in self.players.values() {
            hasher.write_str(&player.player_id);
            hasher.write_u64(player.revision);
            hasher.write_u32(player.level);
            hasher.write_u32(player.perk_points);
            for (id, skill) in &player.skills {
                hasher.write_str(id);
                hasher.write_u32(skill.rank);
                hasher.write_u64(skill.xp);
            }
            for perk in &player.unlocked_perks {
                hasher.write_str(perk);
            }
            for flag in &player.research_flags {
                hasher.write_str(flag);
            }
            hasher.write_u32(player.fast_travel_charges);
        }
        hash_quests(&self.quests, hasher);
        hash_alignments(&self.factions, hasher);
        hash_alignments(&self.guilds, hasher);
        hasher.write_u64(self.wallets.len() as u64);
        for wallet in self.wallets.values() {
            hasher.write_str(&wallet.owner_id);
            hasher.write_u64(wallet.revision);
            for (currency, balance) in &wallet.balances {
                hasher.write_str(currency);
                hasher.write_u64(*balance);
            }
        }
        hasher.write_u64(self.listings.len() as u64);
        for listing in self.listings.values() {
            hasher.write_str(&listing.listing_id);
            hasher.write_str(&listing.seller_id);
            hasher.write_str(&listing.content_id);
            hasher.write_str(&listing.currency_id);
            hasher.write_u64(listing.unit_price);
            hasher.write_u32(listing.available);
            hasher.write_u64(listing.revision);
        }
        hasher.write_u64(self.settlements.len() as u64);
        for settlement in self.settlements.values() {
            hasher.write_str(&settlement.settlement_id);
            hasher.write_str(&settlement.faction_id);
            hasher.write_u64(settlement.revision);
            hasher.write_u32(settlement.prosperity);
            hasher.write_u32(settlement.safety);
            hasher.write_u32(settlement.population);
            for upgrade in &settlement.upgrades {
                hasher.write_str(upgrade);
            }
        }
        hasher.write_u64(self.dragons.len() as u64);
        for dragon in self.dragons.values() {
            hasher.write_str(&dragon.dragon_id);
            hasher.write_str(&dragon.owner_id);
            hasher.write_str(&dragon.species_id);
            hasher.write_str(&dragon.variant_id);
            hasher.write_u64(dragon.revision);
            hasher.write_u32(dragon.level);
            hasher.write_u64(dragon.xp);
            hasher.write_u32(dragon.bond);
            for move_id in &dragon.unlocked_moves {
                hasher.write_str(move_id);
            }
            for equipment in &dragon.equipment_ids {
                hasher.write_str(equipment);
            }
            for flag in &dragon.research_flags {
                hasher.write_str(flag);
            }
        }
        hasher.write_u64(self.legendary.len() as u64);
        for encounter in self.legendary.values() {
            hasher.write_str(&encounter.encounter_id);
            hasher.write_str(&encounter.creature_id);
            hasher.write_u64(encounter.revision);
            hasher.write_u16(encounter.phase);
            hasher.write_u16(u16::from(encounter.resolved));
            for player in &encounter.eligible_players {
                hasher.write_str(player);
            }
            for flag in &encounter.flags {
                hasher.write_str(flag);
            }
        }
        hasher.write_u64(self.dialogue_history.len() as u64);
        for (record, choices) in &self.dialogue_history {
            hasher.write_str(record);
            for choice in choices {
                hasher.write_str(choice);
            }
        }
    }
}

fn check_revision(actual: u64, expected: u64, record: &str) -> Result<(), Rejection> {
    if actual != expected {
        return Err(Rejection::new(
            RejectionCode::StaleRevision,
            format!("{record} revision is stale"),
        ));
    }
    Ok(())
}

fn check_owner_revision(
    owner_id: &str,
    revision: u64,
    command: &ProgressionCommand,
    record: &str,
) -> Result<(), Rejection> {
    if owner_id != command.owner_id {
        return Err(Rejection::new(
            RejectionCode::Unauthorized,
            format!("{record} belongs to another player"),
        ));
    }
    check_revision(revision, command.expected_record_revision, record)
}

fn standing_rank(standing: i32) -> u16 {
    if standing <= 0 {
        0
    } else {
        u16::try_from(standing / 1_000).unwrap_or(u16::MAX).min(10)
    }
}

fn level_for_xp(xp: u64) -> u32 {
    let mut level = 1_u32;
    while u64::from(level).saturating_mul(u64::from(level)).saturating_mul(100) <= xp && level < 1_000 {
        level += 1;
    }
    level
}

fn hash_quests(records: &BTreeMap<String, QuestRecord>, hasher: &mut CanonicalHasher) {
    hasher.write_u64(records.len() as u64);
    for quest in records.values() {
        hasher.write_str(&quest.record_id);
        hasher.write_str(&quest.owner_id);
        hasher.write_str(&quest.quest_id);
        hasher.write_u64(quest.revision);
        hasher.write_u16(quest.stage);
        hasher.write_u16(u16::from(quest.completed));
        for choice in &quest.choices {
            hasher.write_str(choice);
        }
        for flag in &quest.flags {
            hasher.write_str(flag);
        }
    }
}

fn hash_alignments(records: &BTreeMap<String, AlignmentRecord>, hasher: &mut CanonicalHasher) {
    hasher.write_u64(records.len() as u64);
    for record in records.values() {
        hasher.write_str(&record.record_id);
        hasher.write_str(&record.owner_id);
        hasher.write_str(&record.content_id);
        hasher.write_u64(record.revision);
        hasher.write_u32(record.standing as u32);
        hasher.write_u16(record.rank);
        for flag in &record.flags {
            hasher.write_str(flag);
        }
    }
}

#[must_use]
pub fn deterministic_progression_reward_seed(world_seed: &str, record_id: &str, revision: u64) -> u32 {
    fnv1a_utf16(world_seed) ^ fnv1a_utf16(record_id).rotate_left(11) ^ (revision as u32).wrapping_mul(0x9e37_79b1)
}
