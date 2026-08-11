use std::collections::{BTreeMap, BTreeSet};

use blockwild_types::CanonicalHasher;

use crate::{OpaquePayload, Rejection, RejectionCode, StatDelta, validate_id, write_option_str};

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct FixedVec3 {
    pub x_milli: i32,
    pub y_milli: i32,
    pub z_milli: i32,
}

impl FixedVec3 {
    fn hash_into(self, hasher: &mut CanonicalHasher) {
        hasher.write_i32(self.x_milli);
        hasher.write_i32(self.y_milli);
        hasher.write_i32(self.z_milli);
    }

    #[must_use]
    pub fn distance_squared(self, other: Self) -> u64 {
        let dx = i64::from(self.x_milli) - i64::from(other.x_milli);
        let dy = i64::from(self.y_milli) - i64::from(other.y_milli);
        let dz = i64::from(self.z_milli) - i64::from(other.z_milli);
        u64::try_from(
            dx.saturating_mul(dx)
                .saturating_add(dy.saturating_mul(dy))
                .saturating_add(dz.saturating_mul(dz)),
        )
        .unwrap_or(u64::MAX)
    }
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum DamageKind {
    Physical,
    Fire,
    Frost,
    Tide,
    Storm,
    Verdant,
    Arcane,
    True,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Disposition {
    Passive,
    Neutral,
    Aggressive,
    Legendary,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CaptureReadiness {
    Wild,
    SubduedByHealth,
    CalmByOutmaneuver,
    CalmByCare,
    Captured,
    Bonded,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StatusInstance {
    pub status_id: String,
    pub source_id: String,
    pub magnitude: i32,
    pub expires_tick: u64,
    pub stacks: u16,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CombatantState {
    pub record_id: String,
    pub owner_id: Option<String>,
    pub revision: u64,
    pub position: FixedVec3,
    pub health: u32,
    pub max_health: u32,
    pub stamina: u32,
    pub mana: u32,
    pub armor: u32,
    pub resist_per_mille: BTreeMap<DamageKind, u16>,
    pub statuses: BTreeMap<String, StatusInstance>,
    pub cooldown_until: BTreeMap<String, u64>,
    pub alive: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AbilitySpec {
    pub ability_id: String,
    pub damage_kind: DamageKind,
    pub base_damage: u32,
    pub range_milli: u32,
    pub cooldown_ticks: u32,
    pub stamina_cost: u32,
    pub mana_cost: u32,
    pub projectile_speed_milli: Option<u32>,
    pub status: Option<StatusTemplate>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StatusTemplate {
    pub status_id: String,
    pub magnitude: i32,
    pub duration_ticks: u32,
    pub max_stacks: u16,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProjectileState {
    pub projectile_id: String,
    pub source_id: String,
    pub target_id: Option<String>,
    pub ability_id: String,
    pub position: FixedVec3,
    pub velocity: FixedVec3,
    pub spawned_tick: u64,
    pub expires_tick: u64,
    pub revision: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CreatureCompatibilityRecord {
    pub record_id: String,
    pub creature_content_id: String,
    pub variant_id: String,
    pub disposition: Disposition,
    pub readiness: CaptureReadiness,
    pub captured_by: Option<String>,
    pub owner_id: Option<String>,
    pub bond: u32,
    pub care: u32,
    pub equipment_ids: Vec<String>,
    pub research_flags: BTreeSet<String>,
    pub pacification_score: u32,
    pub last_aggression_tick: u64,
    pub revision: u64,
}

impl CreatureCompatibilityRecord {
    #[must_use]
    pub fn is_capture_ready(&self, combatant: &CombatantState) -> bool {
        self.readiness != CaptureReadiness::Wild
            || self.disposition == Disposition::Passive
            || u64::from(combatant.health) * 1_000 <= u64::from(combatant.max_health) * 400
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SummonState {
    pub summon_id: String,
    pub content_id: String,
    pub owner_id: String,
    pub spawned_tick: u64,
    pub expires_tick: Option<u64>,
    pub grounded: bool,
    pub revision: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PacifyMethod {
    Outmaneuver,
    LureAndCare,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CombatCommand {
    UseAbility {
        source_id: String,
        expected_source_revision: u64,
        target_id: String,
        expected_target_revision: u64,
        ability_id: String,
        projectile_id: Option<String>,
        aim: FixedVec3,
        tick: u64,
    },
    ResolveProjectile {
        projectile_id: String,
        expected_revision: u64,
        target_id: Option<String>,
        impact: FixedVec3,
        tick: u64,
    },
    Capture {
        source_id: String,
        creature_id: String,
        expected_creature_revision: u64,
        orb_item_code: u32,
        tick: u64,
    },
    Pacify {
        source_id: String,
        creature_id: String,
        expected_creature_revision: u64,
        method: PacifyMethod,
        evidence: OpaquePayload,
        tick: u64,
    },
    Care {
        source_id: String,
        creature_id: String,
        expected_creature_revision: u64,
        care_item_code: u32,
        amount: u16,
        tick: u64,
    },
    Summon {
        source_id: String,
        summon_id: String,
        content_id: String,
        duration_ticks: Option<u32>,
        grounding_item_code: Option<u32>,
        tick: u64,
    },
    Advance {
        to_tick: u64,
    },
}

impl CombatCommand {
    pub(crate) fn hash_into(&self, hasher: &mut CanonicalHasher) {
        match self {
            Self::UseAbility {
                source_id,
                expected_source_revision,
                target_id,
                expected_target_revision,
                ability_id,
                projectile_id,
                aim,
                tick,
            } => {
                hasher.write_u16(0);
                hasher.write_str(source_id);
                hasher.write_u64(*expected_source_revision);
                hasher.write_str(target_id);
                hasher.write_u64(*expected_target_revision);
                hasher.write_str(ability_id);
                write_option_str(hasher, projectile_id.as_deref());
                aim.hash_into(hasher);
                hasher.write_u64(*tick);
            }
            Self::ResolveProjectile {
                projectile_id,
                expected_revision,
                target_id,
                impact,
                tick,
            } => {
                hasher.write_u16(1);
                hasher.write_str(projectile_id);
                hasher.write_u64(*expected_revision);
                write_option_str(hasher, target_id.as_deref());
                impact.hash_into(hasher);
                hasher.write_u64(*tick);
            }
            Self::Capture {
                source_id,
                creature_id,
                expected_creature_revision,
                orb_item_code,
                tick,
            } => {
                hasher.write_u16(2);
                hasher.write_str(source_id);
                hasher.write_str(creature_id);
                hasher.write_u64(*expected_creature_revision);
                hasher.write_u32(*orb_item_code);
                hasher.write_u64(*tick);
            }
            Self::Pacify {
                source_id,
                creature_id,
                expected_creature_revision,
                method,
                evidence,
                tick,
            } => {
                hasher.write_u16(3);
                hasher.write_str(source_id);
                hasher.write_str(creature_id);
                hasher.write_u64(*expected_creature_revision);
                hasher.write_u16(*method as u16);
                evidence.hash_into(hasher);
                hasher.write_u64(*tick);
            }
            Self::Care {
                source_id,
                creature_id,
                expected_creature_revision,
                care_item_code,
                amount,
                tick,
            } => {
                hasher.write_u16(4);
                hasher.write_str(source_id);
                hasher.write_str(creature_id);
                hasher.write_u64(*expected_creature_revision);
                hasher.write_u32(*care_item_code);
                hasher.write_u16(*amount);
                hasher.write_u64(*tick);
            }
            Self::Summon {
                source_id,
                summon_id,
                content_id,
                duration_ticks,
                grounding_item_code,
                tick,
            } => {
                hasher.write_u16(5);
                hasher.write_str(source_id);
                hasher.write_str(summon_id);
                hasher.write_str(content_id);
                match duration_ticks {
                    Some(value) => {
                        hasher.write_u16(1);
                        hasher.write_u32(*value);
                    }
                    None => hasher.write_u16(0),
                }
                match grounding_item_code {
                    Some(value) => {
                        hasher.write_u16(1);
                        hasher.write_u32(*value);
                    }
                    None => hasher.write_u16(0),
                }
                hasher.write_u64(*tick);
            }
            Self::Advance { to_tick } => {
                hasher.write_u16(6);
                hasher.write_u64(*to_tick);
            }
        }
    }
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct CombatState {
    pub combatants: BTreeMap<String, CombatantState>,
    pub abilities: BTreeMap<String, AbilitySpec>,
    pub projectiles: BTreeMap<String, ProjectileState>,
    pub creatures: BTreeMap<String, CreatureCompatibilityRecord>,
    pub summons: BTreeMap<String, SummonState>,
    pub tick: u64,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct CombatMutation {
    pub stat_deltas: Vec<StatDelta>,
    pub consumed_items: Vec<(u32, u32, String)>,
    pub event_kinds: Vec<(String, String)>,
}

impl CombatState {
    pub fn register_ability(&mut self, ability: AbilitySpec) -> Result<(), Rejection> {
        validate_id("ability", &ability.ability_id)?;
        if ability.range_milli == 0 || ability.cooldown_ticks == 0 {
            return Err(Rejection::new(
                RejectionCode::InvalidCommand,
                "ability has invalid range or cooldown",
            ));
        }
        if let Some(status) = &ability.status {
            validate_id("status", &status.status_id)?;
            if status.duration_ticks == 0 || status.max_stacks == 0 {
                return Err(Rejection::new(
                    RejectionCode::InvalidCommand,
                    "status template is invalid",
                ));
            }
        }
        if self.abilities.insert(ability.ability_id.clone(), ability).is_some() {
            return Err(Rejection::new(RejectionCode::Conflict, "duplicate ability"));
        }
        Ok(())
    }

    pub fn apply(&mut self, command: &CombatCommand) -> Result<CombatMutation, Rejection> {
        match command {
            CombatCommand::UseAbility {
                source_id,
                expected_source_revision,
                target_id,
                expected_target_revision,
                ability_id,
                projectile_id,
                aim,
                tick,
            } => self.use_ability(
                source_id,
                *expected_source_revision,
                target_id,
                *expected_target_revision,
                ability_id,
                projectile_id.as_deref(),
                *aim,
                *tick,
            ),
            CombatCommand::ResolveProjectile {
                projectile_id,
                expected_revision,
                target_id,
                impact,
                tick,
            } => self.resolve_projectile(projectile_id, *expected_revision, target_id.as_deref(), *impact, *tick),
            CombatCommand::Capture {
                source_id,
                creature_id,
                expected_creature_revision,
                orb_item_code,
                tick,
            } => self.capture(
                source_id,
                creature_id,
                *expected_creature_revision,
                *orb_item_code,
                *tick,
            ),
            CombatCommand::Pacify {
                source_id,
                creature_id,
                expected_creature_revision,
                method,
                evidence,
                tick,
            } => self.pacify(
                source_id,
                creature_id,
                *expected_creature_revision,
                *method,
                evidence,
                *tick,
            ),
            CombatCommand::Care {
                source_id,
                creature_id,
                expected_creature_revision,
                care_item_code,
                amount,
                tick,
            } => self.care(
                source_id,
                creature_id,
                *expected_creature_revision,
                *care_item_code,
                *amount,
                *tick,
            ),
            CombatCommand::Summon {
                source_id,
                summon_id,
                content_id,
                duration_ticks,
                grounding_item_code,
                tick,
            } => self.summon(
                source_id,
                summon_id,
                content_id,
                *duration_ticks,
                *grounding_item_code,
                *tick,
            ),
            CombatCommand::Advance { to_tick } => self.advance(*to_tick),
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn use_ability(
        &mut self,
        source_id: &str,
        source_revision: u64,
        target_id: &str,
        target_revision: u64,
        ability_id: &str,
        projectile_id: Option<&str>,
        aim: FixedVec3,
        tick: u64,
    ) -> Result<CombatMutation, Rejection> {
        if tick < self.tick {
            return Err(Rejection::new(
                RejectionCode::InvalidCommand,
                "combat tick moved backward",
            ));
        }
        let ability = self
            .abilities
            .get(ability_id)
            .cloned()
            .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "ability does not exist"))?;
        let source = self
            .combatants
            .get(source_id)
            .cloned()
            .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "source combatant does not exist"))?;
        let target = self
            .combatants
            .get(target_id)
            .cloned()
            .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "target combatant does not exist"))?;
        check_combatant(&source, source_revision)?;
        check_combatant(&target, target_revision)?;
        if source.cooldown_until.get(ability_id).copied().unwrap_or(0) > tick {
            return Err(Rejection::new(RejectionCode::Cooldown, "ability is on cooldown"));
        }
        if source.stamina < ability.stamina_cost || source.mana < ability.mana_cost {
            return Err(Rejection::new(
                RejectionCode::InsufficientResource,
                "combatant lacks stamina or mana",
            ));
        }
        let range_sq = u64::from(ability.range_milli).saturating_mul(u64::from(ability.range_milli));
        if source.position.distance_squared(target.position) > range_sq {
            return Err(Rejection::new(
                RejectionCode::InvalidTarget,
                "target is outside ability range",
            ));
        }
        {
            let source = self.combatants.get_mut(source_id).expect("validated source");
            source.stamina -= ability.stamina_cost;
            source.mana -= ability.mana_cost;
            source
                .cooldown_until
                .insert(ability_id.to_owned(), tick + u64::from(ability.cooldown_ticks));
            source.revision = source.revision.wrapping_add(1);
        }
        if ability.projectile_speed_milli.is_some() {
            let projectile_id = projectile_id.ok_or_else(|| {
                Rejection::new(
                    RejectionCode::InvalidCommand,
                    "projectile ability requires a projectile id",
                )
            })?;
            validate_id("projectile", projectile_id)?;
            if self.projectiles.contains_key(projectile_id) {
                return Err(Rejection::new(RejectionCode::Conflict, "projectile id already exists"));
            }
            self.projectiles.insert(
                projectile_id.to_owned(),
                ProjectileState {
                    projectile_id: projectile_id.to_owned(),
                    source_id: source_id.to_owned(),
                    target_id: Some(target_id.to_owned()),
                    ability_id: ability_id.to_owned(),
                    position: source.position,
                    velocity: aim,
                    spawned_tick: tick,
                    expires_tick: tick + 200,
                    revision: 0,
                },
            );
            return Ok(CombatMutation {
                event_kinds: vec![("projectile-spawned".into(), projectile_id.into())],
                ..CombatMutation::default()
            });
        }
        self.apply_damage(source_id, target_id, &ability, tick)
    }

    fn resolve_projectile(
        &mut self,
        projectile_id: &str,
        expected_revision: u64,
        target_id: Option<&str>,
        impact: FixedVec3,
        tick: u64,
    ) -> Result<CombatMutation, Rejection> {
        let projectile = self
            .projectiles
            .get(projectile_id)
            .cloned()
            .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "projectile does not exist"))?;
        if projectile.revision != expected_revision {
            return Err(Rejection::new(
                RejectionCode::StaleRevision,
                "projectile revision is stale",
            ));
        }
        if tick < projectile.spawned_tick || tick > projectile.expires_tick {
            return Err(Rejection::new(
                RejectionCode::InvalidCommand,
                "projectile impact tick is invalid",
            ));
        }
        self.projectiles.remove(projectile_id);
        let Some(target_id) = target_id else {
            return Ok(CombatMutation {
                event_kinds: vec![("projectile-expired".into(), projectile_id.into())],
                ..CombatMutation::default()
            });
        };
        let target = self
            .combatants
            .get(target_id)
            .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "projectile target does not exist"))?;
        if target.position.distance_squared(impact) > 2_250_000 {
            return Err(Rejection::new(
                RejectionCode::InvalidTarget,
                "projectile impact missed target bounds",
            ));
        }
        let ability = self
            .abilities
            .get(&projectile.ability_id)
            .cloned()
            .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "projectile ability is missing"))?;
        self.apply_damage(&projectile.source_id, target_id, &ability, tick)
    }

    fn apply_damage(
        &mut self,
        source_id: &str,
        target_id: &str,
        ability: &AbilitySpec,
        tick: u64,
    ) -> Result<CombatMutation, Rejection> {
        let target = self.combatants.get_mut(target_id).expect("validated target");
        let resist = u32::from(
            target
                .resist_per_mille
                .get(&ability.damage_kind)
                .copied()
                .unwrap_or(0)
                .min(900),
        );
        let mitigated = if ability.damage_kind == DamageKind::True {
            ability.base_damage
        } else {
            ability
                .base_damage
                .saturating_sub(target.armor)
                .saturating_mul(1_000 - resist)
                / 1_000
        };
        let damage = mitigated.max(u32::from(ability.base_damage > 0));
        target.health = target.health.saturating_sub(damage);
        target.alive = target.health > 0;
        target.revision = target.revision.wrapping_add(1);
        if let Some(template) = &ability.status {
            let status = target
                .statuses
                .entry(template.status_id.clone())
                .or_insert(StatusInstance {
                    status_id: template.status_id.clone(),
                    source_id: source_id.to_owned(),
                    magnitude: template.magnitude,
                    expires_tick: tick + u64::from(template.duration_ticks),
                    stacks: 0,
                });
            status.stacks = status.stacks.saturating_add(1).min(template.max_stacks);
            status.expires_tick = tick + u64::from(template.duration_ticks);
            status.magnitude = template.magnitude;
        }
        if let Some(creature) = self.creatures.get_mut(target_id) {
            creature.last_aggression_tick = tick;
            if u64::from(target.health) * 1_000 <= u64::from(target.max_health) * 400
                && creature.readiness == CaptureReadiness::Wild
            {
                creature.readiness = CaptureReadiness::SubduedByHealth;
                creature.revision = creature.revision.wrapping_add(1);
            }
        }
        Ok(CombatMutation {
            stat_deltas: vec![StatDelta {
                record_id: target_id.to_owned(),
                stat_id: "health".into(),
                amount: -i64::from(damage),
            }],
            event_kinds: vec![("damage".into(), target_id.into())],
            ..CombatMutation::default()
        })
    }

    fn capture(
        &mut self,
        source_id: &str,
        creature_id: &str,
        expected_revision: u64,
        orb_item_code: u32,
        tick: u64,
    ) -> Result<CombatMutation, Rejection> {
        if orb_item_code == 0 {
            return Err(Rejection::new(
                RejectionCode::InvalidCommand,
                "capture orb item is invalid",
            ));
        }
        let combatant = self
            .combatants
            .get(creature_id)
            .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "capture target has no combatant"))?;
        let creature = self
            .creatures
            .get_mut(creature_id)
            .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "capture target is not a creature"))?;
        if creature.revision != expected_revision {
            return Err(Rejection::new(
                RejectionCode::StaleRevision,
                "creature revision is stale",
            ));
        }
        if creature.disposition == Disposition::Legendary {
            return Err(Rejection::new(
                RejectionCode::RulesRejected,
                "legendary encounter must be resolved before capture",
            ));
        }
        if !creature.is_capture_ready(combatant) {
            return Err(Rejection::new(
                RejectionCode::RulesRejected,
                "creature is not visibly capture-ready",
            ));
        }
        if matches!(
            creature.readiness,
            CaptureReadiness::Captured | CaptureReadiness::Bonded
        ) {
            return Err(Rejection::new(RejectionCode::Conflict, "creature is already captured"));
        }
        creature.readiness = CaptureReadiness::Captured;
        creature.captured_by = Some(source_id.to_owned());
        creature.revision = creature.revision.wrapping_add(1);
        creature.last_aggression_tick = tick;
        Ok(CombatMutation {
            consumed_items: vec![(orb_item_code, 1, source_id.into())],
            event_kinds: vec![("creature-captured".into(), creature_id.into())],
            ..CombatMutation::default()
        })
    }

    fn pacify(
        &mut self,
        source_id: &str,
        creature_id: &str,
        expected_revision: u64,
        method: PacifyMethod,
        evidence: &OpaquePayload,
        tick: u64,
    ) -> Result<CombatMutation, Rejection> {
        evidence.validate()?;
        let creature = self
            .creatures
            .get_mut(creature_id)
            .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "pacification target is not a creature"))?;
        if creature.revision != expected_revision {
            return Err(Rejection::new(
                RejectionCode::StaleRevision,
                "creature revision is stale",
            ));
        }
        if creature.readiness != CaptureReadiness::Wild {
            return Err(Rejection::new(
                RejectionCode::Conflict,
                "creature is already calm or captured",
            ));
        }
        if tick < creature.last_aggression_tick.saturating_add(40) {
            return Err(Rejection::new(
                RejectionCode::Cooldown,
                "creature has not disengaged long enough",
            ));
        }
        let threshold = match method {
            PacifyMethod::Outmaneuver => 3,
            PacifyMethod::LureAndCare => 2,
        };
        creature.pacification_score = creature.pacification_score.saturating_add(1);
        if creature.pacification_score >= threshold {
            creature.readiness = match method {
                PacifyMethod::Outmaneuver => CaptureReadiness::CalmByOutmaneuver,
                PacifyMethod::LureAndCare => CaptureReadiness::CalmByCare,
            };
        }
        creature.revision = creature.revision.wrapping_add(1);
        Ok(CombatMutation {
            event_kinds: vec![
                ("pacification-progress".into(), creature_id.into()),
                ("pacifier".into(), source_id.into()),
            ],
            ..CombatMutation::default()
        })
    }

    fn care(
        &mut self,
        source_id: &str,
        creature_id: &str,
        expected_revision: u64,
        care_item_code: u32,
        amount: u16,
        _tick: u64,
    ) -> Result<CombatMutation, Rejection> {
        if care_item_code == 0 || amount == 0 {
            return Err(Rejection::new(RejectionCode::InvalidCommand, "care input is empty"));
        }
        let creature = self
            .creatures
            .get_mut(creature_id)
            .ok_or_else(|| Rejection::new(RejectionCode::InvalidTarget, "care target is not a creature"))?;
        if creature.revision != expected_revision {
            return Err(Rejection::new(
                RejectionCode::StaleRevision,
                "creature revision is stale",
            ));
        }
        if creature.captured_by.as_deref() != Some(source_id) {
            return Err(Rejection::new(
                RejectionCode::Unauthorized,
                "only the creature custodian can provide bonding care",
            ));
        }
        if creature.readiness != CaptureReadiness::Captured && creature.readiness != CaptureReadiness::Bonded {
            return Err(Rejection::new(
                RejectionCode::RulesRejected,
                "creature must be captured before bonding care",
            ));
        }
        creature.care = creature.care.saturating_add(u32::from(amount) * 10);
        creature.bond = creature.bond.saturating_add(u32::from(amount) * 5).min(1_000);
        if creature.care >= 100 && creature.bond >= 100 {
            creature.readiness = CaptureReadiness::Bonded;
            creature.owner_id = Some(source_id.to_owned());
        }
        creature.revision = creature.revision.wrapping_add(1);
        Ok(CombatMutation {
            consumed_items: vec![(care_item_code, u32::from(amount), source_id.into())],
            stat_deltas: vec![StatDelta {
                record_id: creature_id.into(),
                stat_id: "bond".into(),
                amount: i64::from(amount) * 5,
            }],
            event_kinds: vec![("creature-care".into(), creature_id.into())],
        })
    }

    fn summon(
        &mut self,
        source_id: &str,
        summon_id: &str,
        content_id: &str,
        duration_ticks: Option<u32>,
        grounding_item_code: Option<u32>,
        tick: u64,
    ) -> Result<CombatMutation, Rejection> {
        validate_id("summon", summon_id)?;
        validate_id("summon content", content_id)?;
        if self.summons.contains_key(summon_id) {
            return Err(Rejection::new(RejectionCode::Conflict, "summon id already exists"));
        }
        let grounded = grounding_item_code.is_some();
        let expires_tick = if grounded {
            None
        } else {
            Some(
                tick + u64::from(duration_ticks.filter(|value| *value > 0).ok_or_else(|| {
                    Rejection::new(RejectionCode::InvalidCommand, "temporary summon needs a duration")
                })?),
            )
        };
        self.summons.insert(
            summon_id.into(),
            SummonState {
                summon_id: summon_id.into(),
                content_id: content_id.into(),
                owner_id: source_id.into(),
                spawned_tick: tick,
                expires_tick,
                grounded,
                revision: 0,
            },
        );
        let consumed_items = grounding_item_code
            .into_iter()
            .map(|code| (code, 1, source_id.into()))
            .collect();
        Ok(CombatMutation {
            consumed_items,
            event_kinds: vec![("summon-created".into(), summon_id.into())],
            ..CombatMutation::default()
        })
    }

    fn advance(&mut self, to_tick: u64) -> Result<CombatMutation, Rejection> {
        if to_tick < self.tick {
            return Err(Rejection::new(
                RejectionCode::InvalidCommand,
                "combat tick moved backward",
            ));
        }
        self.tick = to_tick;
        for combatant in self.combatants.values_mut() {
            combatant.statuses.retain(|_, status| status.expires_tick > to_tick);
        }
        self.projectiles
            .retain(|_, projectile| projectile.expires_tick > to_tick);
        self.summons
            .retain(|_, summon| summon.expires_tick.is_none_or(|expires| expires > to_tick));
        Ok(CombatMutation::default())
    }

    pub(crate) fn hash_into(&self, hasher: &mut CanonicalHasher) {
        hasher.write_u64(self.abilities.len() as u64);
        for ability in self.abilities.values() {
            hasher.write_str(&ability.ability_id);
            hasher.write_u16(ability.damage_kind as u16);
            hasher.write_u32(ability.base_damage);
            hasher.write_u32(ability.range_milli);
            hasher.write_u32(ability.cooldown_ticks);
            hasher.write_u32(ability.stamina_cost);
            hasher.write_u32(ability.mana_cost);
            match ability.projectile_speed_milli {
                Some(speed) => {
                    hasher.write_u16(1);
                    hasher.write_u32(speed);
                }
                None => hasher.write_u16(0),
            }
            match &ability.status {
                Some(status) => {
                    hasher.write_u16(1);
                    hasher.write_str(&status.status_id);
                    hasher.write_i32(status.magnitude);
                    hasher.write_u32(status.duration_ticks);
                    hasher.write_u16(status.max_stacks);
                }
                None => hasher.write_u16(0),
            }
        }
        hasher.write_u64(self.tick);
        hasher.write_u64(self.combatants.len() as u64);
        for combatant in self.combatants.values() {
            hasher.write_str(&combatant.record_id);
            write_option_str(hasher, combatant.owner_id.as_deref());
            hasher.write_u64(combatant.revision);
            combatant.position.hash_into(hasher);
            hasher.write_u32(combatant.health);
            hasher.write_u32(combatant.max_health);
            hasher.write_u32(combatant.stamina);
            hasher.write_u32(combatant.mana);
            hasher.write_u32(combatant.armor);
            hasher.write_u16(u16::from(combatant.alive));
            for (kind, value) in &combatant.resist_per_mille {
                hasher.write_u16(*kind as u16);
                hasher.write_u16(*value);
            }
            for status in combatant.statuses.values() {
                hasher.write_str(&status.status_id);
                hasher.write_str(&status.source_id);
                hasher.write_i32(status.magnitude);
                hasher.write_u64(status.expires_tick);
                hasher.write_u16(status.stacks);
            }
        }
        hasher.write_u64(self.creatures.len() as u64);
        for creature in self.creatures.values() {
            hasher.write_str(&creature.record_id);
            hasher.write_str(&creature.creature_content_id);
            hasher.write_str(&creature.variant_id);
            hasher.write_u16(creature.disposition as u16);
            hasher.write_u16(creature.readiness as u16);
            write_option_str(hasher, creature.captured_by.as_deref());
            write_option_str(hasher, creature.owner_id.as_deref());
            hasher.write_u32(creature.bond);
            hasher.write_u32(creature.care);
            for item in &creature.equipment_ids {
                hasher.write_str(item);
            }
            for flag in &creature.research_flags {
                hasher.write_str(flag);
            }
            hasher.write_u32(creature.pacification_score);
            hasher.write_u64(creature.last_aggression_tick);
            hasher.write_u64(creature.revision);
        }
        hasher.write_u64(self.projectiles.len() as u64);
        for projectile in self.projectiles.values() {
            hasher.write_str(&projectile.projectile_id);
            hasher.write_str(&projectile.source_id);
            write_option_str(hasher, projectile.target_id.as_deref());
            hasher.write_str(&projectile.ability_id);
            projectile.position.hash_into(hasher);
            projectile.velocity.hash_into(hasher);
            hasher.write_u64(projectile.spawned_tick);
            hasher.write_u64(projectile.expires_tick);
            hasher.write_u64(projectile.revision);
        }
        hasher.write_u64(self.summons.len() as u64);
        for summon in self.summons.values() {
            hasher.write_str(&summon.summon_id);
            hasher.write_str(&summon.content_id);
            hasher.write_str(&summon.owner_id);
            hasher.write_u64(summon.spawned_tick);
            match summon.expires_tick {
                Some(value) => {
                    hasher.write_u16(1);
                    hasher.write_u64(value);
                }
                None => hasher.write_u16(0),
            }
            hasher.write_u16(u16::from(summon.grounded));
            hasher.write_u64(summon.revision);
        }
    }
}

fn check_combatant(combatant: &CombatantState, expected_revision: u64) -> Result<(), Rejection> {
    if combatant.revision != expected_revision {
        return Err(Rejection::new(
            RejectionCode::StaleRevision,
            "combatant revision is stale",
        ));
    }
    if !combatant.alive {
        return Err(Rejection::new(RejectionCode::InvalidTarget, "combatant is not alive"));
    }
    Ok(())
}
