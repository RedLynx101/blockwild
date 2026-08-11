use blockwild_types::CanonicalHash;

use crate::*;

#[test]
fn handshake_negotiation_is_exact_and_rejects_mixed_versions() {
    let fixture = canonical_network_fixture_v1().unwrap();
    assert_eq!(
        fixture.host_handshake.capabilities,
        vec![
            NetworkCapabilityV1::Observe,
            NetworkCapabilityV1::Chat,
            NetworkCapabilityV1::Interact,
            NetworkCapabilityV1::AgentWork,
        ]
    );
    let compatible = negotiate_network_handshake_v1(&fixture.host_handshake, &fixture.peer_handshake);
    assert!(compatible.decision.compatible);
    assert_eq!(
        compatible.decision.capabilities,
        vec![
            NetworkCapabilityV1::Observe,
            NetworkCapabilityV1::Chat,
            NetworkCapabilityV1::Interact,
        ]
    );
    assert_eq!(compatible.decision.max_command_bytes, 131_072);

    let mut mixed_engine = fixture.peer_handshake.clone();
    mixed_engine.engine_version = "1.12.0-legacy".into();
    let rejected = negotiate_network_handshake_v1(&fixture.host_handshake, &mixed_engine);
    assert!(!rejected.decision.compatible);
    assert_eq!(rejected.decision.code, HandshakeDecisionCodeV1::EngineMismatch);
    assert!(rejected.decision.capabilities.is_empty());
}

#[test]
fn all_canonical_wire_values_round_trip() {
    let fixture = canonical_network_fixture_v1().unwrap();
    let handshake = encode_network_handshake_v1(&fixture.host_handshake).unwrap();
    assert_eq!(decode_network_handshake_v1(&handshake).unwrap(), fixture.host_handshake);
    let command = encode_network_command_v1(&fixture.agent_command).unwrap();
    assert_eq!(decode_network_command_v1(&command).unwrap(), fixture.agent_command);
    let delta = encode_network_delta_v1(&fixture.delta).unwrap();
    assert_eq!(decode_network_delta_v1(&delta).unwrap(), fixture.delta);
    let checkpoint = encode_network_checkpoint_v1(&fixture.checkpoint).unwrap();
    assert_eq!(decode_network_checkpoint_v1(&checkpoint).unwrap(), fixture.checkpoint);
    let work = encode_agent_work_command_v1(&fixture.agent_work).unwrap();
    assert_eq!(decode_agent_work_command_v1(&work).unwrap(), fixture.agent_work);
}

#[test]
fn wire_rejects_truncation_trailing_data_versions_and_malicious_sizes() {
    let fixture = canonical_network_fixture_v1().unwrap();
    let encoded = encode_network_command_v1(&fixture.human_command).unwrap();
    assert_eq!(
        decode_network_command_v1(&encoded[..encoded.len() - 1])
            .unwrap_err()
            .code,
        NetworkErrorCode::Truncated
    );
    let mut trailing = encoded.clone();
    trailing.push(0);
    assert_eq!(
        decode_network_command_v1(&trailing).unwrap_err().code,
        NetworkErrorCode::Truncated
    );
    let mut schema = encoded.clone();
    schema[4] = 2;
    assert_eq!(
        decode_network_command_v1(&schema).unwrap_err().code,
        NetworkErrorCode::SchemaMismatch
    );
    let mut oversized = encoded;
    oversized[12..16].copy_from_slice(&u32::MAX.to_le_bytes());
    assert_eq!(
        decode_network_command_v1(&oversized).unwrap_err().code,
        NetworkErrorCode::Truncated
    );
}

#[test]
fn malformed_and_tampered_packets_never_mutate_authority() {
    let fixture = canonical_network_fixture_v1().unwrap();
    let mut authority = NetworkAuthorityV1::new("session-r9".into()).unwrap();
    authority.upsert_grant(fixture.human_grant.clone()).unwrap();
    let baseline = authority.authority_fingerprint();

    let mut invalid = fixture.human_command.clone();
    invalid.payload.push(0xff);
    assert_eq!(
        authority
            .authorize(&invalid, &fixture.starting_identity, 1_000)
            .unwrap_err()
            .code,
        NetworkErrorCode::HashMismatch
    );
    assert_eq!(authority.authority_fingerprint(), baseline);

    let wire = encode_network_command_v1(&fixture.human_command).unwrap();
    for index in (0..wire.len()).step_by((wire.len() / 64).max(1)) {
        let mut damaged = wire.clone();
        damaged[index] ^= 0x80;
        let _ = decode_network_command_v1(&damaged);
        assert_eq!(authority.authority_fingerprint(), baseline);
    }
}

#[test]
fn authority_enforces_revision_sequence_capability_and_idempotency() {
    let fixture = canonical_network_fixture_v1().unwrap();
    let mut authority = NetworkAuthorityV1::new("session-r9".into()).unwrap();
    authority.upsert_grant(fixture.human_grant.clone()).unwrap();
    let accepted = authority
        .authorize(&fixture.human_command, &fixture.starting_identity, 1_000)
        .unwrap();
    assert!(accepted.accepted());
    assert_eq!(authority.grant("peer-1").unwrap().next_sequence, 1);
    let duplicate = authority
        .authorize(&fixture.human_command, &fixture.starting_identity, 1_001)
        .unwrap();
    assert_eq!(duplicate, accepted);
    assert_eq!(authority.grant("peer-1").unwrap().next_sequence, 1);

    let reordered = command_from(
        &fixture.human_command,
        "cmd-order",
        "idem-order",
        3,
        fixture.starting_identity.clone(),
        Vec::new(),
    );
    let receipt = authority
        .authorize(&reordered, &fixture.starting_identity, 1_002)
        .unwrap();
    assert_eq!(receipt.code, Some(NetworkReceiptCodeV1::Sequence));

    let stale = command_from(
        &fixture.human_command,
        "cmd-stale",
        "idem-stale",
        1,
        NetworkAuthorityIdentityV1::new(
            fixture.starting_identity.address.clone(),
            NetworkAuthorityRevisionV1::default(),
        )
        .unwrap(),
        Vec::new(),
    );
    let receipt = authority.authorize(&stale, &fixture.starting_identity, 1_003).unwrap();
    assert_eq!(receipt.code, Some(NetworkReceiptCodeV1::StaleRevision));

    let denied = NetworkCommandV1::new(NetworkCommandSourceV1 {
        command_id: "cmd-denied".into(),
        idempotency_key: "idem-denied".into(),
        sequence: 1,
        required_capability: NetworkCapabilityV1::Combat,
        lease_keys: Vec::new(),
        expected: fixture.starting_identity.clone(),
        payload: Vec::new(),
        session_id: fixture.human_command.session_id.clone(),
        peer_id: fixture.human_command.peer_id.clone(),
        connection_id: fixture.human_command.connection_id.clone(),
        actor_id: fixture.human_command.actor_id.clone(),
        peer_kind: fixture.human_command.peer_kind,
        kind: fixture.human_command.kind,
        expires_at: fixture.human_command.expires_at,
    })
    .unwrap();
    let receipt = authority.authorize(&denied, &fixture.starting_identity, 1_004).unwrap();
    assert_eq!(receipt.code, Some(NetworkReceiptCodeV1::CapabilityDenied));
}

#[test]
fn leases_are_exclusive_expire_and_release_deterministically() {
    let fixture = canonical_network_fixture_v1().unwrap();
    let mut authority = NetworkAuthorityV1::new("session-r9".into()).unwrap();
    authority.upsert_grant(fixture.human_grant.clone()).unwrap();
    assert!(
        authority
            .authorize(&fixture.human_command, &fixture.starting_identity, 1_000)
            .unwrap()
            .accepted()
    );
    assert_eq!(authority.active_lease_count(), 1);

    let mut second_grant = fixture.agent_grant.clone();
    second_grant.capabilities.push(NetworkCapabilityV1::Interact);
    second_grant.capabilities.sort();
    authority.upsert_grant(second_grant).unwrap();
    let competing = NetworkCommandV1::new(NetworkCommandSourceV1 {
        session_id: "session-r9".into(),
        command_id: "cmd-compete".into(),
        idempotency_key: "idem-compete".into(),
        peer_id: "agent-peer-1".into(),
        connection_id: "conn-agent-1".into(),
        actor_id: "agent:field-drone-1".into(),
        peer_kind: NetworkPeerKindV1::Agent,
        kind: NetworkCommandKindV1::Gameplay,
        required_capability: NetworkCapabilityV1::Interact,
        sequence: 0,
        expected: fixture.starting_identity.clone(),
        expires_at: 11_000,
        lease_keys: fixture.human_command.lease_keys.clone(),
        payload: vec![],
    })
    .unwrap();
    let blocked = authority
        .authorize(&competing, &fixture.starting_identity, 1_001)
        .unwrap();
    assert_eq!(blocked.code, Some(NetworkReceiptCodeV1::LeaseConflict));
    authority.release_command(&fixture.human_command.command_id);
    assert_eq!(authority.active_lease_count(), 0);
}

#[test]
fn sequence_overflow_is_atomic() {
    let fixture = canonical_network_fixture_v1().unwrap();
    let mut authority = NetworkAuthorityV1::new("session-r9".into()).unwrap();
    let mut grant = fixture.human_grant.clone();
    grant.next_sequence = NETWORK_MAX_SAFE_INTEGER_V1;
    authority.upsert_grant(grant).unwrap();
    let command = command_from(
        &fixture.human_command,
        "cmd-last-sequence",
        "idem-last-sequence",
        NETWORK_MAX_SAFE_INTEGER_V1,
        fixture.starting_identity.clone(),
        vec!["atomic:lease".into()],
    );
    let before = authority.authority_fingerprint();
    assert_eq!(
        authority
            .authorize(&command, &fixture.starting_identity, 1_000)
            .unwrap_err()
            .code,
        NetworkErrorCode::InvalidInteger,
    );
    assert_eq!(authority.authority_fingerprint(), before);
    assert_eq!(authority.active_lease_count(), 0);
}

#[test]
fn interest_index_touches_only_relevant_scopes() {
    let fixture = canonical_network_fixture_v1().unwrap();
    let mut index = InterestIndexV1::default();
    let relevant = NetworkDeltaRecordV1::new(NetworkDeltaRecordKindV1::World, "near".into(), 1, vec![1]).unwrap();
    index
        .upsert(ScopedDeltaRecordV1 {
            scope: ReplicationScopeV1::Chunk(fixture.interest.chunks[0].clone()),
            record: relevant.clone(),
        })
        .unwrap();
    let global = NetworkDeltaRecordV1::new(NetworkDeltaRecordKindV1::Gameplay, "global".into(), 1, vec![2]).unwrap();
    let location = NetworkDeltaRecordV1::new(NetworkDeltaRecordKindV1::World, "location".into(), 1, vec![3]).unwrap();
    let entity =
        NetworkDeltaRecordV1::new(NetworkDeltaRecordKindV1::Entity, "mob:emberjay:2".into(), 1, vec![4]).unwrap();
    index
        .upsert(ScopedDeltaRecordV1 {
            scope: ReplicationScopeV1::Global,
            record: global.clone(),
        })
        .unwrap();
    index
        .upsert(ScopedDeltaRecordV1 {
            scope: ReplicationScopeV1::Location(fixture.interest.chunks[0].address.clone()),
            record: location.clone(),
        })
        .unwrap();
    index
        .upsert(ScopedDeltaRecordV1 {
            scope: ReplicationScopeV1::Entity("mob:emberjay:2".into()),
            record: entity.clone(),
        })
        .unwrap();
    for number in 0..200 {
        let address = WorldAddressV1 {
            universe_id: "blockwild".into(),
            location_id: format!("moon-{number}"),
        };
        index
            .upsert(ScopedDeltaRecordV1 {
                scope: ReplicationScopeV1::Location(address),
                record: NetworkDeltaRecordV1::new(
                    NetworkDeltaRecordKindV1::World,
                    format!("far-{number}"),
                    1,
                    vec![number as u8],
                )
                .unwrap(),
            })
            .unwrap();
    }
    let (selected, stats) = index.select(&fixture.interest);
    assert_eq!(selected, vec![entity, global, location, relevant]);
    assert_eq!(stats.candidate_records, 4);
    assert!(stats.scope_probes <= 6);
    assert_eq!(index.record_count(), 204);
}

#[test]
fn delta_receiver_detects_loss_reorder_duplicates_and_stale_from() {
    let fixture = canonical_network_fixture_v1().unwrap();
    let state = ReplicatedStateV1::new(fixture.starting_identity.clone());
    let mut receiver = DeltaReceiverV1::new(
        "session-r9".into(),
        "peer-1".into(),
        1,
        fixture.interest.clone(),
        0,
        0,
        state,
    )
    .unwrap();
    let mut ahead = fixture.delta.clone();
    ahead.sequence = 1;
    ahead = NetworkDeltaV1::new(NetworkDeltaSourceV1 {
        session_id: ahead.session_id,
        delta_id: "delta-ahead".into(),
        peer_id: ahead.peer_id,
        keyframe: ahead.keyframe,
        sequence: 1,
        acknowledged_command_sequence: ahead.acknowledged_command_sequence,
        from: ahead.from,
        to: ahead.to,
        interest_hash: ahead.interest_hash,
        records: ahead.records,
    })
    .unwrap();
    let before = receiver.state().canonical_state_hash();
    assert_eq!(receiver.apply(&ahead).unwrap().code, DeltaApplyCodeV1::SequenceGap);
    assert_eq!(receiver.state().canonical_state_hash(), before);
    assert_eq!(receiver.apply(&fixture.delta).unwrap().code, DeltaApplyCodeV1::Applied);
    let applied = receiver.state().canonical_state_hash();
    assert_eq!(
        receiver.apply(&fixture.delta).unwrap().code,
        DeltaApplyCodeV1::Duplicate
    );
    assert_eq!(receiver.state().canonical_state_hash(), applied);
}

#[test]
fn keyframe_recovers_after_loss_without_accepting_wrong_interest() {
    let fixture = canonical_network_fixture_v1().unwrap();
    let mut receiver = DeltaReceiverV1::new(
        "session-r9".into(),
        "peer-1".into(),
        1,
        fixture.interest.clone(),
        0,
        0,
        ReplicatedStateV1::new(fixture.starting_identity.clone()),
    )
    .unwrap();
    let keyframe = NetworkDeltaV1::new(NetworkDeltaSourceV1 {
        session_id: "session-r9".into(),
        delta_id: "keyframe-0".into(),
        peer_id: "peer-1".into(),
        keyframe: true,
        sequence: 0,
        acknowledged_command_sequence: 0,
        from: NetworkAuthorityIdentityV1::new(
            WorldAddressV1 {
                universe_id: "blockwild".into(),
                location_id: "old".into(),
            },
            NetworkAuthorityRevisionV1::default(),
        )
        .unwrap(),
        to: fixture.delta.to.clone(),
        interest_hash: fixture.interest.interest_hash,
        records: fixture.delta.records.clone(),
    })
    .unwrap();
    assert_eq!(receiver.apply(&keyframe).unwrap().code, DeltaApplyCodeV1::Applied);
    assert_eq!(receiver.state().record_count(), 1);
}

#[test]
fn reconnect_checkpoint_produces_specific_desync_evidence() {
    let fixture = canonical_network_fixture_v1().unwrap();
    let changed = NetworkAuthorityIdentityV1::new(
        fixture.checkpoint.identity.address.clone(),
        NetworkAuthorityRevisionV1 {
            entities: fixture.checkpoint.identity.revision.entities + 1,
            ..fixture.checkpoint.identity.revision
        },
    )
    .unwrap();
    let diagnostic = diagnose_network_desync_v1(&fixture.checkpoint, &changed).unwrap();
    assert_eq!(diagnostic.first_divergent_subsystem, DivergentSubsystemV1::Entities);
    assert_eq!(
        diagnostic.replay_sequence,
        fixture.checkpoint.acknowledged_command_sequence
    );
    assert!(diagnose_network_desync_v1(&fixture.checkpoint, &fixture.checkpoint.identity).is_none());
    let receiver = DeltaReceiverV1::from_checkpoint(
        &fixture.checkpoint,
        fixture.interest.clone(),
        ReplicatedStateV1::new(fixture.checkpoint.identity.clone()),
    )
    .unwrap();
    assert_eq!(
        receiver.reconnect_checkpoint().unwrap().acknowledged_delta_sequence,
        fixture.checkpoint.acknowledged_delta_sequence,
    );
}

#[test]
fn agents_use_network_authority_then_bounded_fifo_work() {
    let fixture = canonical_network_fixture_v1().unwrap();
    let current = fixture.agent_command.expected.clone();
    let mut network = NetworkAuthorityV1::new("session-r9".into()).unwrap();
    network.upsert_grant(fixture.agent_grant.clone()).unwrap();
    let mut agents = AgentWorkAuthorityV1::default();
    agents.upsert_grant(fixture.agent_capability_grant.clone()).unwrap();
    let decision = agents
        .authorize(
            &mut network,
            &fixture.agent_command,
            &fixture.agent_work,
            &current,
            1_100,
        )
        .unwrap();
    assert_eq!(decision.code, AgentAuthorityCodeV1::Accepted);
    let receipt = decision.receipt.unwrap();
    let mut queue = AgentWorkQueueV1::default();
    queue
        .enqueue(fixture.agent_work.clone(), &fixture.agent_command, &receipt)
        .unwrap();
    queue
        .enqueue(fixture.agent_work.clone(), &fixture.agent_command, &receipt)
        .unwrap();
    assert_eq!(queue.len(), 1);
    assert_eq!(queue.queued_units(), 12);
    assert!(queue.tick(5, 1_101).is_empty());
    assert_eq!(queue.queued_units(), 7);
    assert_eq!(queue.tick(7, 1_102), vec!["cmd-agent-1"]);
    assert!(queue.is_empty());
}

#[test]
fn agent_observation_is_canonical_bounded_and_sorted() {
    let fixture = canonical_network_fixture_v1().unwrap();
    let observation = AgentObservationV1::new(
        4,
        1_000,
        2_000,
        fixture.starting_identity.clone(),
        "+X east, +Y up, +Z south; milliblocks".into(),
        "agent:field-drone-1".into(),
        "Field Drone".into(),
        [1_000, 64_000, -2_000],
        [10, 0, -5],
        1_570,
        0,
        vec![AgentCapabilityV1::Harvest, AgentCapabilityV1::ObserveWorld],
        vec![
            AgentNearbyRecordV1 {
                entity_id: "mob:z".into(),
                kind: 2,
                position_milliblocks: [2_000, 64_000, -2_000],
                distance_milliblocks: 1_000,
                interactable: true,
                state: "calm".into(),
            },
            AgentNearbyRecordV1 {
                entity_id: "mob:a".into(),
                kind: 2,
                position_milliblocks: [0, 64_000, -2_000],
                distance_milliblocks: 1_000,
                interactable: false,
                state: "hostile".into(),
            },
        ],
        vec!["task:z".into(), "task:a".into()],
        b"biome=frostpine".to_vec(),
    )
    .unwrap();
    observation.validate().unwrap();
    assert_eq!(
        observation.capabilities,
        vec![AgentCapabilityV1::ObserveWorld, AgentCapabilityV1::Harvest]
    );
    assert_eq!(observation.nearby[0].entity_id, "mob:a");
    assert_eq!(observation.task_ids, vec!["task:a", "task:z"]);
}

#[test]
fn oversized_agent_observation_fails_before_authority() {
    let fixture = canonical_network_fixture_v1().unwrap();
    let result = AgentObservationV1::new(
        1,
        1_000,
        2_000,
        fixture.starting_identity,
        "milliblocks".into(),
        "agent:field-drone-1".into(),
        "Field Drone".into(),
        [0; 3],
        [0; 3],
        0,
        0,
        vec![],
        vec![],
        vec![],
        vec![0; AGENT_MAX_OBSERVATION_BYTES_V1],
    );
    assert_eq!(result.unwrap_err().code, NetworkErrorCode::Budget);
}

#[test]
fn host_replay_reproduces_final_hash_and_reordering_fails_closed() {
    let fixture = canonical_network_fixture_v1().unwrap();
    let first = run_network_replay_v1(&fixture.replay).unwrap();
    let second = run_network_replay_v1(&fixture.replay).unwrap();
    assert_eq!(first, second);
    assert_eq!(first.receipts.len(), 2);
    assert!(first.receipts.iter().all(NetworkCommandReceiptV1::accepted));
    assert_ne!(first.final_state_hash, fixture.starting_identity.state_hash);

    let mut reordered = fixture.replay.clone();
    reordered.steps.swap(0, 1);
    assert!(run_network_replay_v1(&reordered).is_err());
}

#[test]
fn hostile_wire_fuzz_never_panics_or_yields_unvalidated_commands() {
    let fixture = canonical_network_fixture_v1().unwrap();
    let seed = encode_network_command_v1(&fixture.human_command).unwrap();
    let mut state = 0x9e37_79b9_u32;
    for length in 0..512_usize {
        let mut bytes = seed[..length.min(seed.len())].to_vec();
        for byte in &mut bytes {
            state ^= state << 13;
            state ^= state >> 17;
            state ^= state << 5;
            *byte ^= state as u8;
        }
        if let Ok(command) = decode_network_command_v1(&bytes) {
            command.validate().unwrap();
        }
    }
}

#[test]
fn receipt_cache_is_strictly_bounded() {
    let fixture = canonical_network_fixture_v1().unwrap();
    let mut authority = NetworkAuthorityV1::new("session-r9".into()).unwrap();
    let mut grant = fixture.human_grant.clone();
    grant.interest = fixture.interest.clone();
    authority.upsert_grant(grant).unwrap();
    for sequence in 0..(NETWORK_MAX_IDEMPOTENCY_RECEIPTS_V1 + 32) {
        let command = command_from(
            &fixture.human_command,
            &format!("cmd-cache-{sequence}"),
            &format!("idem-cache-{sequence}"),
            sequence as u64,
            fixture.starting_identity.clone(),
            Vec::new(),
        );
        assert!(
            authority
                .authorize(&command, &fixture.starting_identity, 1_000)
                .unwrap()
                .accepted()
        );
        authority.release_command(&command.command_id);
    }
    assert_eq!(authority.receipt_count(), NETWORK_MAX_IDEMPOTENCY_RECEIPTS_V1);
}

#[test]
fn canonical_fixture_and_native_hook_are_stable() {
    let fixture = canonical_network_fixture_v1().unwrap();
    let replay = run_network_replay_v1(&fixture.replay).unwrap();
    assert_eq!(
        fixture.starting_identity.state_hash.to_hex(),
        "58fe8921315fa69bc83a57243b37de36"
    );
    assert_eq!(
        fixture.host_handshake.handshake_hash.to_hex(),
        "49933fb3af588f00c8aa230cc62ccda1"
    );
    assert_eq!(
        fixture.interest.interest_hash.to_hex(),
        "60c7ca0475dfd0c7903e97801b161b26"
    );
    assert_eq!(
        fixture.human_command.command_hash.to_hex(),
        "3c138c46b6083b0400566e319bfd728f"
    );
    assert_eq!(fixture.delta.delta_hash.to_hex(), "64bc7697c9401c7aa06ad421ec1fdbac");
    assert_eq!(
        fixture.checkpoint.checkpoint_hash.to_hex(),
        "24aef6ec54505dfb6068cd6b96893934"
    );
    assert_ne!(fixture.human_command.command_hash, fixture.agent_command.command_hash);
    assert_ne!(replay.replay_hash, CanonicalHash::default());
    let first = run_network_native_benchmark_v1(2).unwrap();
    let second = run_network_native_benchmark_v1(2).unwrap();
    assert_eq!(first.digest, second.digest);
}

fn command_from(
    base: &NetworkCommandV1,
    command_id: &str,
    idempotency_key: &str,
    sequence: u64,
    expected: NetworkAuthorityIdentityV1,
    lease_keys: Vec<String>,
) -> NetworkCommandV1 {
    NetworkCommandV1::new(NetworkCommandSourceV1 {
        session_id: base.session_id.clone(),
        command_id: command_id.into(),
        idempotency_key: idempotency_key.into(),
        peer_id: base.peer_id.clone(),
        connection_id: base.connection_id.clone(),
        actor_id: base.actor_id.clone(),
        peer_kind: base.peer_kind,
        kind: base.kind,
        required_capability: base.required_capability,
        sequence,
        expected,
        expires_at: base.expires_at,
        lease_keys,
        payload: base.payload.clone(),
    })
    .unwrap()
}
