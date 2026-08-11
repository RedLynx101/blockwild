use std::collections::{BTreeMap, BTreeSet};

use blockwild_types::{CanonicalHash, CanonicalHasher, seed_stream};

use crate::{OpaquePayload, Rejection, RejectionCode, validate_id};

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum CardRarity {
    Common,
    Uncommon,
    Rare,
    Epic,
    Legendary,
}

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct PrintingKey {
    pub card_id: String,
    pub variant_id: String,
    pub finish_id: String,
}

impl PrintingKey {
    fn validate(&self) -> Result<(), Rejection> {
        validate_id("card", &self.card_id)?;
        validate_id("card variant", &self.variant_id)?;
        validate_id("card finish", &self.finish_id)
    }

    fn hash_into(&self, hasher: &mut CanonicalHasher) {
        hasher.write_str(&self.card_id);
        hasher.write_str(&self.variant_id);
        hasher.write_str(&self.finish_id);
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CardDefinition {
    pub printing: PrintingKey,
    pub rarity: CardRarity,
    pub class_ids: BTreeSet<String>,
    pub type_ids: BTreeSet<String>,
    pub deck_cost: u16,
    pub power: u16,
    pub health: u16,
    pub rules: Option<OpaquePayload>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WeightedCard {
    pub printing: PrintingKey,
    pub weight: u32,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PackSlot {
    pub candidates: Vec<WeightedCard>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PackDefinition {
    pub pack_id: String,
    pub slots: Vec<PackSlot>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PackRecord {
    pub record_id: String,
    pub owner_id: String,
    pub pack_id: String,
    pub seed: String,
    pub revision: u64,
    pub opened: bool,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct CardCustody {
    pub owner_id: String,
    pub revision: u64,
    pub case: BTreeMap<PrintingKey, u32>,
    pub archive: BTreeMap<PrintingKey, u32>,
    pub rewards_claimed: BTreeSet<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DeckRules {
    pub min_cards: u16,
    pub max_cards: u16,
    pub max_copies: u16,
    pub max_cost: u32,
    pub allowed_classes: BTreeSet<String>,
    pub banned_cards: BTreeSet<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DeckRecord {
    pub deck_id: String,
    pub owner_id: String,
    pub rules_id: String,
    pub revision: u64,
    pub cards: BTreeMap<PrintingKey, u16>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BattlePlayer {
    pub owner_id: String,
    pub deck_id: String,
    pub health: u16,
    pub resource: u16,
    pub hand: Vec<PrintingKey>,
    pub draw_pile: Vec<PrintingKey>,
    pub board: Vec<PrintingKey>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BattleState {
    pub match_id: String,
    pub revision: u64,
    pub sequence: u32,
    pub active_player: u8,
    pub players: [BattlePlayer; 2],
    pub winner: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum BattleAction {
    Draw,
    Play { hand_index: u16 },
    AttackPlayer { board_index: u16 },
    EndTurn,
    Concede,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CardforgeCommand {
    OpenPack {
        record_id: String,
        owner_id: String,
        expected_revision: u64,
    },
    MoveCard {
        owner_id: String,
        printing: PrintingKey,
        count: u32,
        to_archive: bool,
        expected_custody_revision: u64,
    },
    ArchiveDuplicate {
        owner_id: String,
        printing: PrintingKey,
        keep: u32,
        expected_custody_revision: u64,
    },
    BuildDeck {
        deck_id: String,
        owner_id: String,
        rules_id: String,
        cards: BTreeMap<PrintingKey, u16>,
        expected_revision: Option<u64>,
    },
    StartMatch {
        match_id: String,
        player_one: String,
        deck_one: String,
        player_two: String,
        deck_two: String,
    },
    MatchAction {
        match_id: String,
        owner_id: String,
        expected_revision: u64,
        action: BattleAction,
    },
    ClaimReward {
        owner_id: String,
        reward_id: String,
        expected_custody_revision: u64,
    },
}

impl CardforgeCommand {
    pub(crate) fn hash_into(&self, hasher: &mut CanonicalHasher) {
        match self {
            Self::OpenPack {
                record_id,
                owner_id,
                expected_revision,
            } => {
                hasher.write_u16(0);
                hasher.write_str(record_id);
                hasher.write_str(owner_id);
                hasher.write_u64(*expected_revision);
            }
            Self::MoveCard {
                owner_id,
                printing,
                count,
                to_archive,
                expected_custody_revision,
            } => {
                hasher.write_u16(1);
                hasher.write_str(owner_id);
                printing.hash_into(hasher);
                hasher.write_u32(*count);
                hasher.write_u16(u16::from(*to_archive));
                hasher.write_u64(*expected_custody_revision);
            }
            Self::ArchiveDuplicate {
                owner_id,
                printing,
                keep,
                expected_custody_revision,
            } => {
                hasher.write_u16(2);
                hasher.write_str(owner_id);
                printing.hash_into(hasher);
                hasher.write_u32(*keep);
                hasher.write_u64(*expected_custody_revision);
            }
            Self::BuildDeck {
                deck_id,
                owner_id,
                rules_id,
                cards,
                expected_revision,
            } => {
                hasher.write_u16(3);
                hasher.write_str(deck_id);
                hasher.write_str(owner_id);
                hasher.write_str(rules_id);
                match expected_revision {
                    Some(value) => {
                        hasher.write_u16(1);
                        hasher.write_u64(*value);
                    }
                    None => hasher.write_u16(0),
                }
                for (printing, count) in cards {
                    printing.hash_into(hasher);
                    hasher.write_u16(*count);
                }
            }
            Self::StartMatch {
                match_id,
                player_one,
                deck_one,
                player_two,
                deck_two,
            } => {
                hasher.write_u16(4);
                hasher.write_str(match_id);
                hasher.write_str(player_one);
                hasher.write_str(deck_one);
                hasher.write_str(player_two);
                hasher.write_str(deck_two);
            }
            Self::MatchAction {
                match_id,
                owner_id,
                expected_revision,
                action,
            } => {
                hasher.write_u16(5);
                hasher.write_str(match_id);
                hasher.write_str(owner_id);
                hasher.write_u64(*expected_revision);
                match action {
                    BattleAction::Draw => hasher.write_u16(0),
                    BattleAction::Play { hand_index } => {
                        hasher.write_u16(1);
                        hasher.write_u16(*hand_index);
                    }
                    BattleAction::AttackPlayer { board_index } => {
                        hasher.write_u16(2);
                        hasher.write_u16(*board_index);
                    }
                    BattleAction::EndTurn => hasher.write_u16(3),
                    BattleAction::Concede => hasher.write_u16(4),
                }
            }
            Self::ClaimReward {
                owner_id,
                reward_id,
                expected_custody_revision,
            } => {
                hasher.write_u16(6);
                hasher.write_str(owner_id);
                hasher.write_str(reward_id);
                hasher.write_u64(*expected_custody_revision);
            }
        }
    }
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct CardforgeState {
    pub cards: BTreeMap<PrintingKey, CardDefinition>,
    pub packs: BTreeMap<String, PackDefinition>,
    pub pack_records: BTreeMap<String, PackRecord>,
    pub custody: BTreeMap<String, CardCustody>,
    pub deck_rules: BTreeMap<String, DeckRules>,
    pub decks: BTreeMap<String, DeckRecord>,
    pub battles: BTreeMap<String, BattleState>,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct CardforgeMutation {
    pub revealed: Vec<PrintingKey>,
    pub event_kinds: Vec<(String, String)>,
}

impl CardforgeState {
    pub fn register_card(&mut self, card: CardDefinition) -> Result<(), Rejection> {
        card.printing.validate()?;
        if card.deck_cost == 0 || card.health == 0 {
            return Err(Rejection::new(RejectionCode::InvalidCommand, "card stats are invalid"));
        }
        if let Some(rules) = &card.rules {
            rules.validate()?;
        }
        if self.cards.insert(card.printing.clone(), card).is_some() {
            return Err(Rejection::new(RejectionCode::Conflict, "duplicate card printing"));
        }
        Ok(())
    }

    pub fn register_pack(&mut self, pack: PackDefinition) -> Result<(), Rejection> {
        validate_id("pack", &pack.pack_id)?;
        if pack.slots.is_empty() || pack.slots.len() > 32 {
            return Err(Rejection::new(RejectionCode::Capacity, "pack slot count is invalid"));
        }
        for slot in &pack.slots {
            if slot.candidates.is_empty()
                || slot
                    .candidates
                    .iter()
                    .any(|candidate| candidate.weight == 0 || !self.cards.contains_key(&candidate.printing))
            {
                return Err(Rejection::new(
                    RejectionCode::InvalidCommand,
                    "pack has an invalid candidate",
                ));
            }
        }
        if self.packs.insert(pack.pack_id.clone(), pack).is_some() {
            return Err(Rejection::new(RejectionCode::Conflict, "duplicate pack"));
        }
        Ok(())
    }

    pub fn apply(&mut self, command: &CardforgeCommand) -> Result<CardforgeMutation, Rejection> {
        match command {
            CardforgeCommand::OpenPack {
                record_id,
                owner_id,
                expected_revision,
            } => self.open_pack(record_id, owner_id, *expected_revision),
            CardforgeCommand::MoveCard {
                owner_id,
                printing,
                count,
                to_archive,
                expected_custody_revision,
            } => self.move_card(owner_id, printing, *count, *to_archive, *expected_custody_revision),
            CardforgeCommand::ArchiveDuplicate {
                owner_id,
                printing,
                keep,
                expected_custody_revision,
            } => self.archive_duplicate(owner_id, printing, *keep, *expected_custody_revision),
            CardforgeCommand::BuildDeck {
                deck_id,
                owner_id,
                rules_id,
                cards,
                expected_revision,
            } => self.build_deck(deck_id, owner_id, rules_id, cards, *expected_revision),
            CardforgeCommand::StartMatch {
                match_id,
                player_one,
                deck_one,
                player_two,
                deck_two,
            } => self.start_match(match_id, player_one, deck_one, player_two, deck_two),
            CardforgeCommand::MatchAction {
                match_id,
                owner_id,
                expected_revision,
                action,
            } => self.match_action(match_id, owner_id, *expected_revision, action),
            CardforgeCommand::ClaimReward {
                owner_id,
                reward_id,
                expected_custody_revision,
            } => self.claim_reward(owner_id, reward_id, *expected_custody_revision),
        }
    }

    fn open_pack(
        &mut self,
        record_id: &str,
        owner_id: &str,
        expected_revision: u64,
    ) -> Result<CardforgeMutation, Rejection> {
        let record = self
            .pack_records
            .get(record_id)
            .cloned()
            .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "pack record does not exist"))?;
        if record.owner_id != owner_id {
            return Err(Rejection::new(
                RejectionCode::Unauthorized,
                "pack belongs to another player",
            ));
        }
        check_revision(record.revision, expected_revision, "pack")?;
        if record.opened {
            return Err(Rejection::new(RejectionCode::Conflict, "pack is already opened"));
        }
        let pack = self
            .packs
            .get(&record.pack_id)
            .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "pack definition is missing"))?;
        let mut rng = DeterministicRng::new(seed_stream(&record.seed, record_id));
        let mut revealed = Vec::with_capacity(pack.slots.len());
        for slot in &pack.slots {
            revealed.push(weighted_choice(slot, &mut rng)?.clone());
        }
        let custody = self.custody.entry(owner_id.to_owned()).or_insert_with(|| CardCustody {
            owner_id: owner_id.into(),
            ..CardCustody::default()
        });
        for printing in &revealed {
            *custody.case.entry(printing.clone()).or_default() = custody
                .case
                .get(printing)
                .copied()
                .unwrap_or(0)
                .checked_add(1)
                .ok_or_else(|| Rejection::new(RejectionCode::Capacity, "card custody overflow"))?;
        }
        custody.revision = custody.revision.wrapping_add(1);
        let record = self.pack_records.get_mut(record_id).expect("validated pack");
        record.opened = true;
        record.revision = record.revision.wrapping_add(1);
        Ok(CardforgeMutation {
            revealed,
            event_kinds: vec![("pack-opened".into(), record_id.into())],
        })
    }

    fn move_card(
        &mut self,
        owner_id: &str,
        printing: &PrintingKey,
        count: u32,
        to_archive: bool,
        expected_revision: u64,
    ) -> Result<CardforgeMutation, Rejection> {
        printing.validate()?;
        if count == 0 {
            return Err(Rejection::new(RejectionCode::InvalidCommand, "card move count is zero"));
        }
        let custody = self
            .custody
            .get_mut(owner_id)
            .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "card custody does not exist"))?;
        check_revision(custody.revision, expected_revision, "card custody")?;
        let (source, destination) = if to_archive {
            (&mut custody.case, &mut custody.archive)
        } else {
            (&mut custody.archive, &mut custody.case)
        };
        move_count(source, destination, printing, count)?;
        custody.revision = custody.revision.wrapping_add(1);
        Ok(CardforgeMutation {
            event_kinds: vec![("card-moved".into(), printing.card_id.clone())],
            ..CardforgeMutation::default()
        })
    }

    fn archive_duplicate(
        &mut self,
        owner_id: &str,
        printing: &PrintingKey,
        keep: u32,
        expected_revision: u64,
    ) -> Result<CardforgeMutation, Rejection> {
        let custody = self
            .custody
            .get_mut(owner_id)
            .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "card custody does not exist"))?;
        check_revision(custody.revision, expected_revision, "card custody")?;
        let count = custody.case.get(printing).copied().unwrap_or(0);
        if count <= keep {
            return Err(Rejection::new(
                RejectionCode::Conflict,
                "no duplicates above keep threshold",
            ));
        }
        move_count(&mut custody.case, &mut custody.archive, printing, count - keep)?;
        custody.revision = custody.revision.wrapping_add(1);
        Ok(CardforgeMutation {
            event_kinds: vec![("duplicates-archived".into(), printing.card_id.clone())],
            ..CardforgeMutation::default()
        })
    }

    fn build_deck(
        &mut self,
        deck_id: &str,
        owner_id: &str,
        rules_id: &str,
        cards: &BTreeMap<PrintingKey, u16>,
        expected_revision: Option<u64>,
    ) -> Result<CardforgeMutation, Rejection> {
        validate_id("deck", deck_id)?;
        validate_id("deck rules", rules_id)?;
        let rules = self
            .deck_rules
            .get(rules_id)
            .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "deck rules do not exist"))?;
        let custody = self
            .custody
            .get(owner_id)
            .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "card custody does not exist"))?;
        validate_deck(cards, rules, &self.cards, custody)?;
        match self.decks.get(deck_id) {
            Some(deck) => {
                if deck.owner_id != owner_id {
                    return Err(Rejection::new(
                        RejectionCode::Unauthorized,
                        "deck belongs to another player",
                    ));
                }
                check_revision(
                    deck.revision,
                    expected_revision.ok_or_else(|| {
                        Rejection::new(RejectionCode::StaleRevision, "existing deck requires expected revision")
                    })?,
                    "deck",
                )?;
            }
            None if expected_revision.is_some() => {
                return Err(Rejection::new(
                    RejectionCode::StaleRevision,
                    "new deck cannot have an expected revision",
                ));
            }
            None => {}
        }
        let revision = self.decks.get(deck_id).map_or(0, |deck| deck.revision.wrapping_add(1));
        self.decks.insert(
            deck_id.into(),
            DeckRecord {
                deck_id: deck_id.into(),
                owner_id: owner_id.into(),
                rules_id: rules_id.into(),
                revision,
                cards: cards.clone(),
            },
        );
        Ok(CardforgeMutation {
            event_kinds: vec![("deck-built".into(), deck_id.into())],
            ..CardforgeMutation::default()
        })
    }

    fn start_match(
        &mut self,
        match_id: &str,
        player_one: &str,
        deck_one: &str,
        player_two: &str,
        deck_two: &str,
    ) -> Result<CardforgeMutation, Rejection> {
        validate_id("match", match_id)?;
        if player_one == player_two || self.battles.contains_key(match_id) {
            return Err(Rejection::new(
                RejectionCode::Conflict,
                "match participants or id conflict",
            ));
        }
        let first = self
            .decks
            .get(deck_one)
            .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "first deck does not exist"))?;
        let second = self
            .decks
            .get(deck_two)
            .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "second deck does not exist"))?;
        if first.owner_id != player_one || second.owner_id != player_two {
            return Err(Rejection::new(
                RejectionCode::Unauthorized,
                "match deck ownership mismatch",
            ));
        }
        let mut rng = DeterministicRng::new(seed_stream(match_id, "cardforge-match"));
        let mut first_pile = expand_deck(first);
        let mut second_pile = expand_deck(second);
        shuffle(&mut first_pile, &mut rng);
        shuffle(&mut second_pile, &mut rng);
        let first_player = initial_battle_player(player_one, deck_one, first_pile);
        let second_player = initial_battle_player(player_two, deck_two, second_pile);
        self.battles.insert(
            match_id.into(),
            BattleState {
                match_id: match_id.into(),
                revision: 0,
                sequence: 0,
                active_player: 0,
                players: [first_player, second_player],
                winner: None,
            },
        );
        Ok(CardforgeMutation {
            event_kinds: vec![("match-started".into(), match_id.into())],
            ..CardforgeMutation::default()
        })
    }

    fn match_action(
        &mut self,
        match_id: &str,
        owner_id: &str,
        expected_revision: u64,
        action: &BattleAction,
    ) -> Result<CardforgeMutation, Rejection> {
        let battle = self
            .battles
            .get_mut(match_id)
            .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "match does not exist"))?;
        check_revision(battle.revision, expected_revision, "match")?;
        if battle.winner.is_some() {
            return Err(Rejection::new(RejectionCode::Conflict, "match is finished"));
        }
        let actor_index = battle
            .players
            .iter()
            .position(|player| player.owner_id == owner_id)
            .ok_or_else(|| Rejection::new(RejectionCode::Unauthorized, "actor is not a match participant"))?;
        if actor_index != usize::from(battle.active_player) && !matches!(action, BattleAction::Concede) {
            return Err(Rejection::new(
                RejectionCode::RulesRejected,
                "it is not this player's turn",
            ));
        }
        match action {
            BattleAction::Draw => draw(&mut battle.players[actor_index])?,
            BattleAction::Play { hand_index } => {
                let index = usize::from(*hand_index);
                let card = battle.players[actor_index]
                    .hand
                    .get(index)
                    .cloned()
                    .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "hand index is invalid"))?;
                let definition = self.cards.get(&card).expect("deck legality guarantees card definition");
                if battle.players[actor_index].resource < definition.deck_cost {
                    return Err(Rejection::new(
                        RejectionCode::InsufficientResource,
                        "not enough battle resource",
                    ));
                }
                battle.players[actor_index].resource -= definition.deck_cost;
                battle.players[actor_index].hand.remove(index);
                battle.players[actor_index].board.push(card);
            }
            BattleAction::AttackPlayer { board_index } => {
                let card = battle.players[actor_index]
                    .board
                    .get(usize::from(*board_index))
                    .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "board index is invalid"))?;
                let damage = self.cards.get(card).expect("card definition exists").power;
                let opponent = 1 - actor_index;
                battle.players[opponent].health = battle.players[opponent].health.saturating_sub(damage);
                if battle.players[opponent].health == 0 {
                    battle.winner = Some(owner_id.into());
                }
            }
            BattleAction::EndTurn => {
                battle.active_player = u8::try_from(1 - actor_index).expect("player index fits");
                let active = &mut battle.players[usize::from(battle.active_player)];
                active.resource = active.resource.saturating_add(1).min(10);
                draw(active)?;
            }
            BattleAction::Concede => battle.winner = Some(battle.players[1 - actor_index].owner_id.clone()),
        }
        battle.sequence = battle.sequence.wrapping_add(1);
        battle.revision = battle.revision.wrapping_add(1);
        Ok(CardforgeMutation {
            event_kinds: vec![("match-action".into(), match_id.into())],
            ..CardforgeMutation::default()
        })
    }

    fn claim_reward(
        &mut self,
        owner_id: &str,
        reward_id: &str,
        expected_revision: u64,
    ) -> Result<CardforgeMutation, Rejection> {
        validate_id("reward", reward_id)?;
        let custody = self
            .custody
            .get_mut(owner_id)
            .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "card custody does not exist"))?;
        check_revision(custody.revision, expected_revision, "card custody")?;
        if !custody.rewards_claimed.insert(reward_id.into()) {
            return Err(Rejection::new(RejectionCode::Conflict, "reward is already claimed"));
        }
        custody.revision = custody.revision.wrapping_add(1);
        Ok(CardforgeMutation {
            event_kinds: vec![("reward-claimed".into(), reward_id.into())],
            ..CardforgeMutation::default()
        })
    }

    pub(crate) fn hash_into(&self, hasher: &mut CanonicalHasher) {
        hasher.write_u64(self.cards.len() as u64);
        for card in self.cards.values() {
            card.printing.hash_into(hasher);
            hasher.write_u16(card.rarity as u16);
            for class_id in &card.class_ids {
                hasher.write_str(class_id);
            }
            for type_id in &card.type_ids {
                hasher.write_str(type_id);
            }
            hasher.write_u16(card.deck_cost);
            hasher.write_u16(card.power);
            hasher.write_u16(card.health);
            match &card.rules {
                Some(rules) => {
                    hasher.write_u16(1);
                    rules.hash_into(hasher);
                }
                None => hasher.write_u16(0),
            }
        }
        hasher.write_u64(self.packs.len() as u64);
        for pack in self.packs.values() {
            hasher.write_str(&pack.pack_id);
            for slot in &pack.slots {
                for candidate in &slot.candidates {
                    candidate.printing.hash_into(hasher);
                    hasher.write_u32(candidate.weight);
                }
            }
        }
        hasher.write_u64(self.deck_rules.len() as u64);
        for rules in self.deck_rules.values() {
            hasher.write_u16(rules.min_cards);
            hasher.write_u16(rules.max_cards);
            hasher.write_u16(rules.max_copies);
            hasher.write_u32(rules.max_cost);
            for class_id in &rules.allowed_classes {
                hasher.write_str(class_id);
            }
            for card_id in &rules.banned_cards {
                hasher.write_str(card_id);
            }
        }
        hasher.write_u64(self.pack_records.len() as u64);
        for record in self.pack_records.values() {
            hasher.write_str(&record.record_id);
            hasher.write_str(&record.owner_id);
            hasher.write_str(&record.pack_id);
            hasher.write_str(&record.seed);
            hasher.write_u64(record.revision);
            hasher.write_u16(u16::from(record.opened));
        }
        hasher.write_u64(self.custody.len() as u64);
        for custody in self.custody.values() {
            hasher.write_str(&custody.owner_id);
            hasher.write_u64(custody.revision);
            for (printing, count) in &custody.case {
                printing.hash_into(hasher);
                hasher.write_u32(*count);
            }
            for (printing, count) in &custody.archive {
                printing.hash_into(hasher);
                hasher.write_u32(*count);
            }
            for reward in &custody.rewards_claimed {
                hasher.write_str(reward);
            }
        }
        hasher.write_u64(self.decks.len() as u64);
        for deck in self.decks.values() {
            hasher.write_str(&deck.deck_id);
            hasher.write_str(&deck.owner_id);
            hasher.write_str(&deck.rules_id);
            hasher.write_u64(deck.revision);
            for (printing, count) in &deck.cards {
                printing.hash_into(hasher);
                hasher.write_u16(*count);
            }
        }
        hasher.write_u64(self.battles.len() as u64);
        for battle in self.battles.values() {
            hasher.write_str(&battle.match_id);
            hasher.write_u64(battle.revision);
            hasher.write_u32(battle.sequence);
            hasher.write_u16(u16::from(battle.active_player));
            for player in &battle.players {
                hasher.write_str(&player.owner_id);
                hasher.write_str(&player.deck_id);
                hasher.write_u16(player.health);
                hasher.write_u16(player.resource);
                for card in &player.hand {
                    card.hash_into(hasher);
                }
                for card in &player.draw_pile {
                    card.hash_into(hasher);
                }
                for card in &player.board {
                    card.hash_into(hasher);
                }
            }
            match &battle.winner {
                Some(winner) => {
                    hasher.write_u16(1);
                    hasher.write_str(winner);
                }
                None => hasher.write_u16(0),
            }
        }
    }
}

#[derive(Clone, Copy, Debug)]
struct DeterministicRng(u32);
impl DeterministicRng {
    fn new(seed: u32) -> Self {
        Self(if seed == 0 { 0x6d2b_79f5 } else { seed })
    }
    fn next(&mut self) -> u32 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.0 = x;
        x
    }
}

fn weighted_choice<'a>(slot: &'a PackSlot, rng: &mut DeterministicRng) -> Result<&'a PrintingKey, Rejection> {
    let total: u64 = slot
        .candidates
        .iter()
        .map(|candidate| u64::from(candidate.weight))
        .sum();
    if total == 0 {
        return Err(Rejection::new(
            RejectionCode::InvalidCommand,
            "pack slot has zero weight",
        ));
    }
    let mut roll = u64::from(rng.next()) % total;
    for candidate in &slot.candidates {
        if roll < u64::from(candidate.weight) {
            return Ok(&candidate.printing);
        }
        roll -= u64::from(candidate.weight);
    }
    unreachable!("weighted choice exhausts total")
}

fn move_count(
    from: &mut BTreeMap<PrintingKey, u32>,
    to: &mut BTreeMap<PrintingKey, u32>,
    key: &PrintingKey,
    count: u32,
) -> Result<(), Rejection> {
    let available = from.get(key).copied().unwrap_or(0);
    if available < count {
        return Err(Rejection::new(
            RejectionCode::InsufficientResource,
            "card custody count is too small",
        ));
    }
    let destination = to
        .get(key)
        .copied()
        .unwrap_or(0)
        .checked_add(count)
        .ok_or_else(|| Rejection::new(RejectionCode::Capacity, "card custody count overflow"))?;
    if available == count {
        from.remove(key);
    } else {
        from.insert(key.clone(), available - count);
    }
    to.insert(key.clone(), destination);
    Ok(())
}

fn validate_deck(
    cards: &BTreeMap<PrintingKey, u16>,
    rules: &DeckRules,
    definitions: &BTreeMap<PrintingKey, CardDefinition>,
    custody: &CardCustody,
) -> Result<(), Rejection> {
    let count: u32 = cards.values().copied().map(u32::from).sum();
    if count < u32::from(rules.min_cards) || count > u32::from(rules.max_cards) {
        return Err(Rejection::new(RejectionCode::RulesRejected, "deck size is illegal"));
    }
    let mut cost = 0_u32;
    let mut names = BTreeMap::<&str, u32>::new();
    for (printing, copies) in cards {
        if *copies == 0 || u32::from(*copies) > custody.case.get(printing).copied().unwrap_or(0) {
            return Err(Rejection::new(
                RejectionCode::InsufficientResource,
                "deck exceeds owned card custody",
            ));
        }
        let definition = definitions
            .get(printing)
            .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "deck references unknown card"))?;
        if rules.banned_cards.contains(&printing.card_id)
            || (!rules.allowed_classes.is_empty() && definition.class_ids.is_disjoint(&rules.allowed_classes))
        {
            return Err(Rejection::new(
                RejectionCode::RulesRejected,
                "deck contains disallowed card",
            ));
        }
        *names.entry(&printing.card_id).or_default() += u32::from(*copies);
        cost = cost
            .checked_add(u32::from(definition.deck_cost) * u32::from(*copies))
            .ok_or_else(|| Rejection::new(RejectionCode::Capacity, "deck cost overflow"))?;
    }
    if names.values().any(|copies| *copies > u32::from(rules.max_copies)) || cost > rules.max_cost {
        return Err(Rejection::new(
            RejectionCode::RulesRejected,
            "deck copy or cost limit exceeded",
        ));
    }
    Ok(())
}

fn expand_deck(deck: &DeckRecord) -> Vec<PrintingKey> {
    deck.cards
        .iter()
        .flat_map(|(printing, count)| std::iter::repeat_n(printing.clone(), usize::from(*count)))
        .collect()
}
fn shuffle(cards: &mut [PrintingKey], rng: &mut DeterministicRng) {
    for index in (1..cards.len()).rev() {
        cards.swap(
            index,
            usize::try_from(u64::from(rng.next()) % u64::try_from(index + 1).unwrap_or(u64::MAX)).unwrap_or(0),
        );
    }
}
fn initial_battle_player(owner_id: &str, deck_id: &str, mut pile: Vec<PrintingKey>) -> BattlePlayer {
    let hand_count = pile.len().min(5);
    let hand = pile.drain(..hand_count).collect();
    BattlePlayer {
        owner_id: owner_id.into(),
        deck_id: deck_id.into(),
        health: 20,
        resource: 1,
        hand,
        draw_pile: pile,
        board: Vec::new(),
    }
}
fn draw(player: &mut BattlePlayer) -> Result<(), Rejection> {
    if player.hand.len() >= 10 {
        return Err(Rejection::new(RejectionCode::Capacity, "battle hand is full"));
    }
    if player.draw_pile.is_empty() {
        player.health = player.health.saturating_sub(1);
    } else {
        player.hand.push(player.draw_pile.remove(0));
    }
    Ok(())
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

#[must_use]
pub fn custody_hash(custody: &CardCustody) -> CanonicalHash {
    let mut hasher = CanonicalHasher::new("blockwild.cardforge.custody.v1");
    hasher.write_str(&custody.owner_id);
    hasher.write_u64(custody.revision);
    for (printing, count) in &custody.case {
        printing.hash_into(&mut hasher);
        hasher.write_u32(*count);
    }
    hasher.finish()
}
