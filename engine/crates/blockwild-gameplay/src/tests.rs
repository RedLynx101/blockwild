use std::collections::{BTreeMap, BTreeSet};

use blockwild_types::{CanonicalHash, EntityId, PlayerId};

use super::*;
use crate::fixture::{reference_actor, reference_authority};

fn batch(authority: &GameplayAuthority, suffix: &str, commands: Vec<GameplayCommand>) -> GameplayBatch {
    GameplayBatch::new(
        format!("batch-{suffix}"),
        format!("key-{suffix}"),
        reference_actor(),
        authority.state.identity(),
        commands,
    )
}

fn accepted(receipt: GameplayReceipt) -> AcceptedReceipt {
    match receipt {
        GameplayReceipt::Accepted(receipt) => receipt,
        GameplayReceipt::Rejected { rejection, .. } => panic!("unexpected rejection: {rejection:?}"),
    }
}

fn rejection(receipt: GameplayReceipt) -> Rejection {
    match receipt {
        GameplayReceipt::Rejected { rejection, .. } => rejection,
        GameplayReceipt::Accepted(receipt) => panic!("unexpected acceptance: {receipt:?}"),
    }
}

#[test]
fn reference_fixture_is_deterministic_and_complete() {
    let first = run_reference_fixture();
    let second = run_reference_fixture();
    assert_eq!(first, second);
    assert_eq!(first.accepted_batches, 5);
    assert_eq!(first.final_revision, 5);
    assert_ne!(first.state_hash, CanonicalHash::default());
    assert_ne!(first.replay_hash, CanonicalHash::default());
}

#[test]
fn transfer_conserves_metadata_sensitive_resources_for_many_counts() {
    for count in 1..=10 {
        let mut state = InventoryState::default();
        state
            .register_item(ItemDefinition {
                code: 1,
                content_id: "item".into(),
                max_stack: 64,
                tags: BTreeSet::new(),
            })
            .unwrap();
        let left_key = ContainerKey {
            kind: ContainerKind::Player,
            id: "left".into(),
            owner_id: Some("owner".into()),
        };
        let right_key = ContainerKey {
            kind: ContainerKind::Player,
            id: "right".into(),
            owner_id: Some("owner".into()),
        };
        let mut left = Container::new(left_key.clone(), 1);
        left.slots[0] = Some(ItemStack::simple(1, 10));
        state.insert_container(left).unwrap();
        state.insert_container(Container::new(right_key.clone(), 1)).unwrap();
        let before = state.resource_totals();
        state
            .transfer(&TransferCommand {
                from: SlotRef {
                    container: left_key,
                    slot: 0,
                    expected_container_revision: Some(0),
                },
                to: SlotRef {
                    container: right_key,
                    slot: 0,
                    expected_container_revision: Some(0),
                },
                count,
                expected: Some(ExpectedStack {
                    item_code: 1,
                    metadata_hash: CanonicalHash::default(),
                    minimum_count: count,
                }),
            })
            .unwrap();
        assert_eq!(before, state.resource_totals());
    }
}

#[test]
fn equipment_rejects_items_without_required_tag() {
    let mut state = InventoryState::default();
    state
        .register_item(ItemDefinition {
            code: 1,
            content_id: "stone".into(),
            max_stack: 64,
            tags: BTreeSet::new(),
        })
        .unwrap();
    let source_key = ContainerKey::player("owner");
    let equipment_key = ContainerKey {
        kind: ContainerKind::Equipment,
        id: "equipment".into(),
        owner_id: Some("owner".into()),
    };
    let mut source = Container::new(source_key.clone(), 1);
    source.slots[0] = Some(ItemStack::simple(1, 1));
    state.insert_container(source).unwrap();
    let mut equipment = Container::new(equipment_key.clone(), 1);
    equipment.equipment_tags[0] = Some("helmet".into());
    state.insert_container(equipment).unwrap();
    let error = state
        .transfer(&TransferCommand {
            from: SlotRef {
                container: source_key,
                slot: 0,
                expected_container_revision: None,
            },
            to: SlotRef {
                container: equipment_key,
                slot: 0,
                expected_container_revision: None,
            },
            count: 1,
            expected: None,
        })
        .unwrap_err();
    assert_eq!(error.code, RejectionCode::RulesRejected);
}

#[test]
fn exact_idempotent_retry_returns_original_receipt_without_second_mutation() {
    let mut authority = reference_authority();
    let command = GameplayCommand::Inventory(InventoryCommand::Transfer(TransferCommand {
        from: SlotRef {
            container: ContainerKey::player("player-1"),
            slot: 0,
            expected_container_revision: Some(0),
        },
        to: SlotRef {
            container: ContainerKey::player("player-1"),
            slot: 5,
            expected_container_revision: Some(0),
        },
        count: 1,
        expected: None,
    }));
    let request = batch(&authority, "retry", vec![command]);
    let first = accepted(authority.apply_batch(&request));
    let second = accepted(authority.apply_batch(&request));
    assert_eq!(first, second);
    assert_eq!(authority.state.revision.sequence, 1);
    assert_eq!(authority.replay().len(), 1);
}

#[test]
fn idempotency_key_cannot_be_reused_for_other_commands() {
    let mut authority = reference_authority();
    let first = batch(
        &authority,
        "collision",
        vec![GameplayCommand::Inventory(InventoryCommand::Transfer(
            TransferCommand {
                from: SlotRef {
                    container: ContainerKey::player("player-1"),
                    slot: 0,
                    expected_container_revision: Some(0),
                },
                to: SlotRef {
                    container: ContainerKey::player("player-1"),
                    slot: 5,
                    expected_container_revision: Some(0),
                },
                count: 1,
                expected: None,
            },
        ))],
    );
    accepted(authority.apply_batch(&first));
    let mut second = GameplayBatch::new(
        "other",
        "key-collision",
        reference_actor(),
        authority.state.identity(),
        vec![GameplayCommand::Inventory(InventoryCommand::Transfer(
            TransferCommand {
                from: SlotRef {
                    container: ContainerKey::player("player-1"),
                    slot: 0,
                    expected_container_revision: Some(1),
                },
                to: SlotRef {
                    container: ContainerKey::player("player-1"),
                    slot: 6,
                    expected_container_revision: Some(1),
                },
                count: 2,
                expected: None,
            },
        ))],
    );
    second.idempotency_key = first.idempotency_key.clone();
    assert_eq!(rejection(authority.apply_batch(&second)).code, RejectionCode::Conflict);
}

#[test]
fn stale_identity_rejects_without_mutation() {
    let mut authority = reference_authority();
    let stale = authority.state.identity();
    let first = batch(
        &authority,
        "first",
        vec![GameplayCommand::Inventory(InventoryCommand::Transfer(
            TransferCommand {
                from: SlotRef {
                    container: ContainerKey::player("player-1"),
                    slot: 0,
                    expected_container_revision: Some(0),
                },
                to: SlotRef {
                    container: ContainerKey::player("player-1"),
                    slot: 5,
                    expected_container_revision: Some(0),
                },
                count: 1,
                expected: None,
            },
        ))],
    );
    accepted(authority.apply_batch(&first));
    let before = authority.state.state_hash();
    let second = GameplayBatch::new(
        "stale",
        "stale",
        reference_actor(),
        stale,
        vec![GameplayCommand::Inventory(InventoryCommand::Transfer(
            TransferCommand {
                from: SlotRef {
                    container: ContainerKey::player("player-1"),
                    slot: 0,
                    expected_container_revision: None,
                },
                to: SlotRef {
                    container: ContainerKey::player("player-1"),
                    slot: 6,
                    expected_container_revision: None,
                },
                count: 1,
                expected: None,
            },
        ))],
    );
    assert_eq!(
        rejection(authority.apply_batch(&second)).code,
        RejectionCode::StaleRevision
    );
    assert_eq!(authority.state.state_hash(), before);
}

#[test]
fn tampered_command_hash_is_rejected() {
    let mut authority = reference_authority();
    let mut request = batch(
        &authority,
        "tampered",
        vec![GameplayCommand::Progression(ProgressionCommand {
            action: ProgressionAction::FastTravel,
            owner_id: "player-1".into(),
            record_id: "player-1".into(),
            expected_record_revision: 0,
            option_id: "waystone".into(),
            quantity: 1,
            currency_id: None,
            payload: None,
        })],
    );
    request.command_hash = CanonicalHash([7; 16]);
    assert_eq!(
        rejection(authority.apply_batch(&request)).code,
        RejectionCode::InvalidCommand
    );
}

#[test]
fn oversized_batch_and_payload_are_rejected() {
    let mut authority = reference_authority();
    let template = GameplayCommand::Progression(ProgressionCommand {
        action: ProgressionAction::FastTravel,
        owner_id: "player-1".into(),
        record_id: "player-1".into(),
        expected_record_revision: 0,
        option_id: "waystone".into(),
        quantity: 1,
        currency_id: None,
        payload: None,
    });
    let too_many = batch(&authority, "many", vec![template; MAX_COMMANDS_PER_BATCH + 1]);
    assert_eq!(
        rejection(authority.apply_batch(&too_many)).code,
        RejectionCode::Capacity
    );
    let oversized = batch(
        &authority,
        "payload",
        vec![GameplayCommand::Combat(CombatCommand::Pacify {
            source_id: "player-1".into(),
            creature_id: "creature-1".into(),
            expected_creature_revision: 0,
            method: PacifyMethod::Outmaneuver,
            evidence: OpaquePayload {
                type_id: "evidence".into(),
                schema: 1,
                bytes: vec![0; MAX_PAYLOAD_BYTES + 1],
            },
            tick: 100,
        })],
    );
    assert_eq!(
        rejection(authority.apply_batch(&oversized)).code,
        RejectionCode::Capacity
    );
}

#[test]
fn failed_second_command_rolls_back_first_command_and_revisions() {
    let mut authority = reference_authority();
    let before = authority.state.clone();
    let request = batch(
        &authority,
        "rollback",
        vec![
            GameplayCommand::Inventory(InventoryCommand::Transfer(TransferCommand {
                from: SlotRef {
                    container: ContainerKey::player("player-1"),
                    slot: 0,
                    expected_container_revision: Some(0),
                },
                to: SlotRef {
                    container: ContainerKey::player("player-1"),
                    slot: 5,
                    expected_container_revision: Some(0),
                },
                count: 1,
                expected: None,
            })),
            GameplayCommand::Inventory(InventoryCommand::Transfer(TransferCommand {
                from: SlotRef {
                    container: ContainerKey::player("player-1"),
                    slot: 9,
                    expected_container_revision: None,
                },
                to: SlotRef {
                    container: ContainerKey::player("player-1"),
                    slot: 6,
                    expected_container_revision: None,
                },
                count: 999,
                expected: None,
            })),
        ],
    );
    assert_eq!(
        rejection(authority.apply_batch(&request)).code,
        RejectionCode::InsufficientResource
    );
    assert_eq!(authority.state, before);
    assert!(authority.replay().is_empty());
}

#[test]
fn actor_grant_and_self_scope_are_enforced() {
    let mut authority = reference_authority();
    let guest = GameplayActor {
        actor_id: "guest".into(),
        player_id: Some(PlayerId::new(2, 1)),
        entity_id: Some(EntityId::new(2, 1)),
        role: ActorRole::Guest,
    };
    authority
        .grant_actor(
            "guest",
            ActorGrant {
                player_id: guest.player_id,
                entity_id: guest.entity_id,
                role: ActorRole::Guest,
                scopes: BTreeSet::from([Scope::InventorySelf]),
            },
        )
        .unwrap();
    let request = GameplayBatch::new(
        "guest-batch",
        "guest-key",
        guest,
        authority.state.identity(),
        vec![GameplayCommand::Inventory(InventoryCommand::Transfer(
            TransferCommand {
                from: SlotRef {
                    container: ContainerKey::player("player-1"),
                    slot: 0,
                    expected_container_revision: Some(0),
                },
                to: SlotRef {
                    container: ContainerKey::player("player-1"),
                    slot: 5,
                    expected_container_revision: Some(0),
                },
                count: 1,
                expected: None,
            },
        ))],
    );
    assert_eq!(
        rejection(authority.apply_batch(&request)).code,
        RejectionCode::Unauthorized
    );
}

#[test]
fn hosting_the_authority_does_not_grant_gameplay_admin_privileges() {
    let mut authority = reference_authority();
    let foreign_key = ContainerKey::player("other-player");
    authority
        .state
        .inventory
        .insert_container(Container::new(foreign_key.clone(), 2))
        .unwrap();
    let request = batch(
        &authority,
        "host-is-not-admin",
        vec![GameplayCommand::Inventory(InventoryCommand::Transfer(
            TransferCommand {
                from: SlotRef {
                    container: ContainerKey::player("player-1"),
                    slot: 0,
                    expected_container_revision: Some(0),
                },
                to: SlotRef {
                    container: foreign_key,
                    slot: 0,
                    expected_container_revision: Some(0),
                },
                count: 1,
                expected: None,
            },
        ))],
    );
    assert_eq!(
        rejection(authority.apply_batch(&request)).code,
        RejectionCode::Unauthorized
    );
}

#[test]
fn capture_is_custody_then_care_bond_not_instant_friendship() {
    let mut authority = reference_authority();
    let capture = batch(
        &authority,
        "capture",
        vec![GameplayCommand::Combat(CombatCommand::Capture {
            source_id: "player-1".into(),
            creature_id: "creature-1".into(),
            expected_creature_revision: 0,
            orb_item_code: 3,
            tick: 10,
        })],
    );
    accepted(authority.apply_batch(&capture));
    let creature = &authority.state.combat.creatures["creature-1"];
    assert_eq!(creature.readiness, CaptureReadiness::Captured);
    assert!(creature.owner_id.is_none());
    let care = batch(
        &authority,
        "care",
        vec![GameplayCommand::Combat(CombatCommand::Care {
            source_id: "player-1".into(),
            creature_id: "creature-1".into(),
            expected_creature_revision: 1,
            care_item_code: 4,
            amount: 20,
            tick: 20,
        })],
    );
    accepted(authority.apply_batch(&care));
    let creature = &authority.state.combat.creatures["creature-1"];
    assert_eq!(creature.readiness, CaptureReadiness::Bonded);
    assert_eq!(creature.owner_id.as_deref(), Some("player-1"));
}

#[test]
fn non_damage_pacification_has_cooldown_and_visible_progress() {
    let mut authority = reference_authority();
    for index in 0_u64..3 {
        let expected = index;
        let request = batch(
            &authority,
            &format!("pacify-{index}"),
            vec![GameplayCommand::Combat(CombatCommand::Pacify {
                source_id: "player-1".into(),
                creature_id: "creature-1".into(),
                expected_creature_revision: expected,
                method: PacifyMethod::Outmaneuver,
                evidence: OpaquePayload {
                    type_id: "outmaneuver-window".into(),
                    schema: 1,
                    bytes: vec![u8::try_from(index).unwrap()],
                },
                tick: 100 + index,
            })],
        );
        accepted(authority.apply_batch(&request));
    }
    assert_eq!(
        authority.state.combat.creatures["creature-1"].readiness,
        CaptureReadiness::CalmByOutmaneuver
    );
}

#[test]
fn pack_rng_and_replay_are_deterministic() {
    let mut first = reference_authority();
    let mut second = reference_authority();
    let command = GameplayCommand::Cardforge(CardforgeCommand::OpenPack {
        record_id: "pack-record-1".into(),
        owner_id: "player-1".into(),
        expected_revision: 0,
    });
    let first_request = batch(&first, "pack", vec![command.clone()]);
    let second_request = batch(&second, "pack", vec![command]);
    let first_receipt = accepted(first.apply_batch(&first_request));
    let second_receipt = accepted(second.apply_batch(&second_request));
    assert_eq!(first_receipt, second_receipt);
    assert_eq!(first.state, second.state);
    assert_eq!(first.replay_hash(), second.replay_hash());
}

#[test]
fn deck_legality_checks_custody_and_copy_limits() {
    let mut state = CardforgeState::default();
    let printing = PrintingKey {
        card_id: "card".into(),
        variant_id: "base".into(),
        finish_id: "normal".into(),
    };
    state
        .register_card(CardDefinition {
            printing: printing.clone(),
            rarity: CardRarity::Common,
            class_ids: BTreeSet::new(),
            type_ids: BTreeSet::new(),
            deck_cost: 1,
            power: 1,
            health: 1,
            rules: None,
        })
        .unwrap();
    state.custody.insert(
        "owner".into(),
        CardCustody {
            owner_id: "owner".into(),
            revision: 0,
            case: BTreeMap::from([(printing.clone(), 4)]),
            archive: BTreeMap::new(),
            rewards_claimed: BTreeSet::new(),
        },
    );
    state.deck_rules.insert(
        "rules".into(),
        DeckRules {
            min_cards: 1,
            max_cards: 10,
            max_copies: 2,
            max_cost: 10,
            allowed_classes: BTreeSet::new(),
            banned_cards: BTreeSet::new(),
        },
    );
    let error = state
        .apply(&CardforgeCommand::BuildDeck {
            deck_id: "deck".into(),
            owner_id: "owner".into(),
            rules_id: "rules".into(),
            cards: BTreeMap::from([(printing, 3)]),
            expected_revision: None,
        })
        .unwrap_err();
    assert_eq!(error.code, RejectionCode::RulesRejected);
}

#[test]
fn machine_transfer_is_atomic_and_conservative() {
    let resource = ResourceKey {
        kind: ResourceKind::Item,
        content_id: "ore".into(),
        item_code: Some(1),
        metadata_hash: CanonicalHash::default(),
    };
    let mut machines = MachineStateSet::default();
    for (id, amount) in [("source", 10), ("destination", 0)] {
        machines
            .insert_machine(MachineState {
                machine_id: id.into(),
                owner_id: Some("owner".into()),
                kind: MachineKind::Logistics,
                revision: 0,
                active: true,
                recipe_id: None,
                progress_ticks: 0,
                last_tick: 0,
                ports: BTreeMap::from([(
                    "main".into(),
                    MachinePort {
                        port_id: "main".into(),
                        mode: PortMode::Bidirectional,
                        accepted: BTreeSet::from([ResourceKind::Item]),
                        capacity: 64,
                        resources: if amount == 0 {
                            BTreeMap::new()
                        } else {
                            BTreeMap::from([(resource.clone(), amount)])
                        },
                    },
                )]),
                lease: None,
                settings: None,
            })
            .unwrap();
    }
    let before = machines.item_resource_totals();
    machines
        .apply(
            &MachineCommand::Transfer {
                from: ResourceEndpoint {
                    machine_id: "source".into(),
                    port_id: "main".into(),
                },
                to: ResourceEndpoint {
                    machine_id: "destination".into(),
                    port_id: "main".into(),
                },
                resource,
                amount: 6,
                expected_from_revision: 0,
                expected_to_revision: 0,
            },
            0,
        )
        .unwrap();
    assert_eq!(before, machines.item_resource_totals());
}

#[test]
fn activity_lease_bounds_dormant_machine_cycles_without_backlog() {
    let ore = ResourceKey {
        kind: ResourceKind::Item,
        content_id: "ore".into(),
        item_code: Some(1),
        metadata_hash: CanonicalHash::default(),
    };
    let ingot = ResourceKey {
        kind: ResourceKind::Item,
        content_id: "ingot".into(),
        item_code: Some(2),
        metadata_hash: CanonicalHash::default(),
    };
    let mut machines = MachineStateSet::default();
    machines
        .register_recipe(MachineRecipe {
            recipe_id: "smelt".into(),
            duration_ticks: 10,
            inputs: BTreeMap::from([(ore.clone(), 1)]),
            outputs: BTreeMap::from([(ingot.clone(), 1)]),
        })
        .unwrap();
    machines
        .insert_machine(MachineState {
            machine_id: "furnace".into(),
            owner_id: Some("owner".into()),
            kind: MachineKind::Furnace,
            revision: 0,
            active: true,
            recipe_id: Some("smelt".into()),
            progress_ticks: 0,
            last_tick: 0,
            ports: BTreeMap::from([
                (
                    "input".into(),
                    MachinePort {
                        port_id: "input".into(),
                        mode: PortMode::Input,
                        accepted: BTreeSet::from([ResourceKind::Item]),
                        capacity: 100,
                        resources: BTreeMap::from([(ore.clone(), 100)]),
                    },
                ),
                (
                    "output".into(),
                    MachinePort {
                        port_id: "output".into(),
                        mode: PortMode::Output,
                        accepted: BTreeSet::from([ResourceKind::Item]),
                        capacity: 100,
                        resources: BTreeMap::new(),
                    },
                ),
            ]),
            lease: Some(ActivityLease {
                lease_id: "lease".into(),
                owner_id: "owner".into(),
                start_tick: 0,
                end_tick: 100,
                max_cycles: 3,
            }),
            settings: None,
        })
        .unwrap();
    machines
        .apply(
            &MachineCommand::Advance {
                machine_id: "furnace".into(),
                expected_revision: 0,
                to_tick: 100,
            },
            100,
        )
        .unwrap();
    let machine = &machines.machines["furnace"];
    assert_eq!(machine.ports["input"].resources[&ore], 97);
    assert_eq!(machine.ports["output"].resources[&ingot], 3);
    assert_eq!(machine.progress_ticks, 0);
}

#[test]
fn furnace_advances_analytically_and_conserves_declared_recipe_delta() {
    let mut inventory = InventoryState::default();
    for (code, id) in [(1, "ore"), (2, "ingot"), (3, "fuel")] {
        inventory
            .register_item(ItemDefinition {
                code,
                content_id: id.into(),
                max_stack: 64,
                tags: BTreeSet::new(),
            })
            .unwrap();
    }
    let source_key = ContainerKey {
        kind: ContainerKind::Machine,
        id: "furnace-input".into(),
        owner_id: Some("owner".into()),
    };
    let destination_key = ContainerKey {
        kind: ContainerKind::Machine,
        id: "furnace-output".into(),
        owner_id: Some("owner".into()),
    };
    let mut source = Container::new(source_key.clone(), 4);
    source.slots[0] = Some(ItemStack::simple(1, 10));
    source.slots[1] = Some(ItemStack::simple(3, 10));
    inventory.insert_container(source).unwrap();
    inventory
        .insert_container(Container::new(destination_key.clone(), 4))
        .unwrap();
    inventory
        .register_recipe(Recipe {
            recipe_id: "smelt".into(),
            station_tag: Some("furnace".into()),
            inputs: vec![Ingredient {
                item_code: 1,
                metadata_hash: None,
                count: 1,
            }],
            outputs: vec![ItemStack::simple(2, 1)],
            ticks: 5,
        })
        .unwrap();
    inventory.furnaces.insert(
        "furnace".into(),
        FurnaceState {
            furnace_id: "furnace".into(),
            revision: 0,
            recipe_id: "smelt".into(),
            source: source_key,
            destination: destination_key.clone(),
            progress_ticks: 0,
            fuel_ticks: 20,
            last_tick: 0,
            active: true,
        },
    );
    let deltas = inventory
        .advance_furnace(&FurnaceAdvanceCommand {
            furnace_id: "furnace".into(),
            expected_revision: 0,
            to_tick: 10,
            fuel_item: None,
            fuel_ticks_per_item: 0,
        })
        .unwrap();
    assert_eq!(deltas.iter().map(|delta| delta.amount).sum::<i64>(), 0);
    assert_eq!(
        inventory.containers[&destination_key].slots[0].as_ref().unwrap().count,
        2
    );
}

#[test]
fn projectile_magic_applies_damage_status_and_cooldown_deterministically() {
    let mut combat = CombatState::default();
    combat
        .register_ability(AbilitySpec {
            ability_id: "frost-bolt".into(),
            damage_kind: DamageKind::Frost,
            base_damage: 20,
            range_milli: 5_000,
            cooldown_ticks: 20,
            stamina_cost: 0,
            mana_cost: 5,
            projectile_speed_milli: Some(500),
            status: Some(StatusTemplate {
                status_id: "chilled".into(),
                magnitude: 250,
                duration_ticks: 50,
                max_stacks: 3,
            }),
        })
        .unwrap();
    for (id, x) in [("mage", 0), ("target", 1_000)] {
        combat.combatants.insert(
            id.into(),
            CombatantState {
                record_id: id.into(),
                owner_id: None,
                revision: 0,
                position: FixedVec3 {
                    x_milli: x,
                    y_milli: 0,
                    z_milli: 0,
                },
                health: 100,
                max_health: 100,
                stamina: 100,
                mana: 100,
                armor: 0,
                resist_per_mille: BTreeMap::new(),
                statuses: BTreeMap::new(),
                cooldown_until: BTreeMap::new(),
                alive: true,
            },
        );
    }
    combat
        .apply(&CombatCommand::UseAbility {
            source_id: "mage".into(),
            expected_source_revision: 0,
            target_id: "target".into(),
            expected_target_revision: 0,
            ability_id: "frost-bolt".into(),
            projectile_id: Some("bolt-1".into()),
            aim: FixedVec3 {
                x_milli: 500,
                y_milli: 0,
                z_milli: 0,
            },
            tick: 1,
        })
        .unwrap();
    combat
        .apply(&CombatCommand::ResolveProjectile {
            projectile_id: "bolt-1".into(),
            expected_revision: 0,
            target_id: Some("target".into()),
            impact: FixedVec3 {
                x_milli: 1_000,
                y_milli: 0,
                z_milli: 0,
            },
            tick: 2,
        })
        .unwrap();
    assert_eq!(combat.combatants["target"].health, 80);
    assert_eq!(combat.combatants["target"].statuses["chilled"].stacks, 1);
    assert_eq!(combat.combatants["mage"].mana, 95);
    assert_eq!(combat.combatants["mage"].cooldown_until["frost-bolt"], 21);
}

#[test]
fn malformed_identifiers_and_wrong_world_are_rejected() {
    let mut authority = reference_authority();
    let mut malformed = batch(
        &authority,
        "ok",
        vec![GameplayCommand::Progression(ProgressionCommand {
            action: ProgressionAction::FastTravel,
            owner_id: "player-1".into(),
            record_id: "player-1".into(),
            expected_record_revision: 0,
            option_id: "waystone".into(),
            quantity: 1,
            currency_id: None,
            payload: None,
        })],
    );
    malformed.batch_id = "bad\nname".into();
    assert_eq!(
        rejection(authority.apply_batch(&malformed)).code,
        RejectionCode::InvalidCommand
    );
    let mut wrong = batch(
        &authority,
        "wrong",
        vec![GameplayCommand::Progression(ProgressionCommand {
            action: ProgressionAction::FastTravel,
            owner_id: "player-1".into(),
            record_id: "player-1".into(),
            expected_record_revision: 0,
            option_id: "waystone".into(),
            quantity: 1,
            currency_id: None,
            payload: None,
        })],
    );
    wrong.identity.world.location = "other".into();
    assert_eq!(rejection(authority.apply_batch(&wrong)).code, RejectionCode::WrongWorld);
}
