use std::hint::black_box;
use std::time::Instant;

use blockwild_types::CanonicalHash;

use crate::{
    AgentCapabilityGrantV1, AgentCapabilityV1, AgentCommandKindV1, AgentLifecycleStatusV1, AgentWorkCommandSourceV1,
    AgentWorkCommandV1, NETWORK_MAX_COMMAND_BYTES_V1, NetworkAuthorityIdentityV1, NetworkAuthorityRevisionV1,
    NetworkCapabilityV1, NetworkCommandKindV1, NetworkCommandSourceV1, NetworkCommandV1, NetworkDeltaRecordKindV1,
    NetworkDeltaRecordV1, NetworkDeltaSourceV1, NetworkDeltaV1, NetworkError, NetworkHandshakeSourceV1,
    NetworkHandshakeV1, NetworkInterestChunkV1, NetworkInterestSetV1, NetworkPeerGrantV1, NetworkPeerKindV1,
    NetworkPeerRoleV1, NetworkReconnectCheckpointV1, NetworkReplayFixtureV1, NetworkReplayStepV1, WorldAddressV1,
    decode_network_command_v1, decode_network_delta_v1, encode_agent_work_command_v1, encode_network_command_v1,
    encode_network_delta_v1, run_network_replay_v1,
};

#[derive(Clone, Debug)]
pub struct NetworkCanonicalFixtureV1 {
    pub host_handshake: NetworkHandshakeV1,
    pub peer_handshake: NetworkHandshakeV1,
    pub interest: NetworkInterestSetV1,
    pub starting_identity: NetworkAuthorityIdentityV1,
    pub human_command: NetworkCommandV1,
    pub agent_command: NetworkCommandV1,
    pub agent_work: AgentWorkCommandV1,
    pub delta: NetworkDeltaV1,
    pub checkpoint: NetworkReconnectCheckpointV1,
    pub human_grant: NetworkPeerGrantV1,
    pub agent_grant: NetworkPeerGrantV1,
    pub agent_capability_grant: AgentCapabilityGrantV1,
    pub replay: NetworkReplayFixtureV1,
}

pub fn canonical_network_fixture_v1() -> Result<NetworkCanonicalFixtureV1, NetworkError> {
    let content_hash = CanonicalHash([0x11; 16]);
    let generator_hash = CanonicalHash([0x22; 16]);
    let host_handshake = NetworkHandshakeV1::new(NetworkHandshakeSourceV1 {
        session_id: "session-r9".into(),
        peer_id: "host-1".into(),
        peer_kind: NetworkPeerKindV1::Human,
        role: NetworkPeerRoleV1::Host,
        engine_version: "1.13.0-rust-r9".into(),
        content_hash,
        generator_hash,
        capabilities: vec![
            NetworkCapabilityV1::Chat,
            NetworkCapabilityV1::Observe,
            NetworkCapabilityV1::Interact,
            NetworkCapabilityV1::AgentWork,
        ],
        max_command_bytes: NETWORK_MAX_COMMAND_BYTES_V1 as u32,
    })?;
    let peer_handshake = NetworkHandshakeV1::new(NetworkHandshakeSourceV1 {
        session_id: "session-r9".into(),
        peer_id: "peer-1".into(),
        peer_kind: NetworkPeerKindV1::Human,
        role: NetworkPeerRoleV1::Guest,
        engine_version: "1.13.0-rust-r9".into(),
        content_hash,
        generator_hash,
        capabilities: vec![
            NetworkCapabilityV1::Interact,
            NetworkCapabilityV1::Observe,
            NetworkCapabilityV1::Chat,
        ],
        max_command_bytes: 131_072,
    })?;
    let address = WorldAddressV1 {
        universe_id: "blockwild".into(),
        location_id: "overworld".into(),
    };
    let starting_identity = NetworkAuthorityIdentityV1::new(
        address.clone(),
        NetworkAuthorityRevisionV1 {
            epoch: 7,
            world: 41,
            entities: 12,
            gameplay: 5,
            persistence: 3,
        },
    )?;
    let interest = NetworkInterestSetV1::new(
        9,
        vec![
            NetworkInterestChunkV1 {
                address: address.clone(),
                chunk_x: 1,
                chunk_z: -2,
            },
            NetworkInterestChunkV1 {
                address: address.clone(),
                chunk_x: 0,
                chunk_z: -2,
            },
        ],
        vec!["mob:emberjay:2".into(), "player:peer-1".into(), "mob:emberjay:2".into()],
    )?;
    let human_grant = NetworkPeerGrantV1 {
        session_id: "session-r9".into(),
        peer_id: "peer-1".into(),
        connection_id: "conn-human-1".into(),
        actor_id: "player:peer-1".into(),
        peer_kind: NetworkPeerKindV1::Human,
        role: NetworkPeerRoleV1::Guest,
        capabilities: vec![
            NetworkCapabilityV1::Observe,
            NetworkCapabilityV1::Chat,
            NetworkCapabilityV1::Interact,
        ],
        expires_at: 20_000,
        next_sequence: 0,
        interest: interest.clone(),
    };
    let agent_grant = NetworkPeerGrantV1 {
        session_id: "session-r9".into(),
        peer_id: "agent-peer-1".into(),
        connection_id: "conn-agent-1".into(),
        actor_id: "agent:field-drone-1".into(),
        peer_kind: NetworkPeerKindV1::Agent,
        role: NetworkPeerRoleV1::Guest,
        capabilities: vec![NetworkCapabilityV1::Observe, NetworkCapabilityV1::AgentWork],
        expires_at: 20_000,
        next_sequence: 0,
        interest: interest.clone(),
    };
    let human_command = NetworkCommandV1::new(NetworkCommandSourceV1 {
        session_id: "session-r9".into(),
        command_id: "cmd-human-1".into(),
        idempotency_key: "idem-human-1".into(),
        peer_id: "peer-1".into(),
        connection_id: "conn-human-1".into(),
        actor_id: "player:peer-1".into(),
        peer_kind: NetworkPeerKindV1::Human,
        kind: NetworkCommandKindV1::Gameplay,
        required_capability: NetworkCapabilityV1::Interact,
        sequence: 0,
        expected: starting_identity.clone(),
        expires_at: 10_000,
        lease_keys: vec!["block:blockwild@overworld/1,64,-2".into()],
        payload: vec![1, 2, 3, 5, 8],
    })?;
    let first_identity = NetworkAuthorityIdentityV1::new(
        address.clone(),
        NetworkAuthorityRevisionV1 {
            gameplay: 6,
            ..starting_identity.revision
        },
    )?;
    let agent_work = AgentWorkCommandV1::new(AgentWorkCommandSourceV1 {
        command_id: "cmd-agent-1".into(),
        agent_id: "agent:field-drone-1".into(),
        kind: AgentCommandKindV1::HarvestArea,
        expected_world_revision: first_identity.revision.world,
        issued_at: 1_100,
        expires_at: 10_100,
        work_units: 12,
        task_id: Some("task:harvest-1".into()),
        arguments: b"radius=8;resource=frostpine".to_vec(),
    })?;
    let agent_command = NetworkCommandV1::new(NetworkCommandSourceV1 {
        session_id: "session-r9".into(),
        command_id: "cmd-agent-1".into(),
        idempotency_key: "idem-agent-1".into(),
        peer_id: "agent-peer-1".into(),
        connection_id: "conn-agent-1".into(),
        actor_id: "agent:field-drone-1".into(),
        peer_kind: NetworkPeerKindV1::Agent,
        kind: NetworkCommandKindV1::Agent,
        required_capability: NetworkCapabilityV1::AgentWork,
        sequence: 0,
        expected: first_identity.clone(),
        expires_at: 10_100,
        lease_keys: vec!["chunk:blockwild@overworld/0,-2".into()],
        payload: encode_agent_work_command_v1(&agent_work)?,
    })?;
    let player_record = NetworkDeltaRecordV1::new(
        NetworkDeltaRecordKindV1::Player,
        "player:peer-1".into(),
        6,
        vec![20, 19, 18],
    )?;
    let world_record = NetworkDeltaRecordV1::new(
        NetworkDeltaRecordKindV1::World,
        "chunk:0,-2".into(),
        42,
        vec![0xaa, 0xbb, 0xcc, 0xdd],
    )?;
    let final_identity = NetworkAuthorityIdentityV1::new(
        address,
        NetworkAuthorityRevisionV1 {
            world: 42,
            gameplay: 6,
            ..starting_identity.revision
        },
    )?;
    let delta = NetworkDeltaV1::new(NetworkDeltaSourceV1 {
        session_id: "session-r9".into(),
        delta_id: "delta-1".into(),
        peer_id: "peer-1".into(),
        keyframe: false,
        sequence: 0,
        acknowledged_command_sequence: 0,
        from: starting_identity.clone(),
        to: first_identity.clone(),
        interest_hash: interest.interest_hash,
        records: vec![player_record.clone()],
    })?;
    let checkpoint = NetworkReconnectCheckpointV1::new(
        "session-r9".into(),
        "peer-1".into(),
        2,
        0,
        0,
        first_identity.clone(),
        interest.interest_hash,
    )?;
    let agent_capability_grant = AgentCapabilityGrantV1 {
        agent_id: "agent:field-drone-1".into(),
        peer_id: "agent-peer-1".into(),
        connection_id: "conn-agent-1".into(),
        status: AgentLifecycleStatusV1::Approved,
        requested: vec![
            AgentCapabilityV1::ObserveWorld,
            AgentCapabilityV1::MoveSelf,
            AgentCapabilityV1::Harvest,
        ],
        granted: vec![AgentCapabilityV1::ObserveWorld, AgentCapabilityV1::Harvest],
        expires_at: 20_000,
    };
    let replay = NetworkReplayFixtureV1 {
        session_id: "session-r9".into(),
        starting_identity: starting_identity.clone(),
        grants: vec![human_grant.clone(), agent_grant.clone()],
        steps: vec![
            NetworkReplayStepV1 {
                now: 1_000,
                command: human_command.clone(),
                authoritative_records: vec![player_record],
                next_revision: first_identity.revision,
            },
            NetworkReplayStepV1 {
                now: 1_100,
                command: agent_command.clone(),
                authoritative_records: vec![world_record],
                next_revision: final_identity.revision,
            },
        ],
    };
    Ok(NetworkCanonicalFixtureV1 {
        host_handshake,
        peer_handshake,
        interest,
        starting_identity,
        human_command,
        agent_command,
        agent_work,
        delta,
        checkpoint,
        human_grant,
        agent_grant,
        agent_capability_grant,
        replay,
    })
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NetworkBenchmarkResultV1 {
    pub iterations: u32,
    pub command_micros: u128,
    pub delta_micros: u128,
    pub replay_micros: u128,
    pub digest: CanonicalHash,
}

pub fn run_network_native_benchmark_v1(iterations: u32) -> Result<NetworkBenchmarkResultV1, NetworkError> {
    let fixture = canonical_network_fixture_v1()?;
    let encoded_command = encode_network_command_v1(&fixture.agent_command)?;
    let encoded_delta = encode_network_delta_v1(&fixture.delta)?;
    let command_start = Instant::now();
    let mut digest = fixture.agent_command.command_hash;
    for _ in 0..iterations {
        digest = black_box(decode_network_command_v1(black_box(&encoded_command))?).command_hash;
    }
    let command_micros = command_start.elapsed().as_micros();
    let delta_start = Instant::now();
    for _ in 0..iterations {
        digest = black_box(decode_network_delta_v1(black_box(&encoded_delta))?).delta_hash;
    }
    let delta_micros = delta_start.elapsed().as_micros();
    let replay_start = Instant::now();
    for _ in 0..iterations {
        digest = black_box(run_network_replay_v1(black_box(&fixture.replay))?).replay_hash;
    }
    let replay_micros = replay_start.elapsed().as_micros();
    Ok(NetworkBenchmarkResultV1 {
        iterations,
        command_micros,
        delta_micros,
        replay_micros,
        digest,
    })
}
