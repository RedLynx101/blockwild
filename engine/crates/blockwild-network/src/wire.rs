use blockwild_types::CanonicalHash;

use crate::{
    NETWORK_AUTHORITY_PROTOCOL_V1, NETWORK_AUTHORITY_SCHEMA_V1, NETWORK_MAX_COMMAND_BYTES_V1,
    NETWORK_MAX_DELTA_BYTES_V1, NETWORK_MAX_DELTA_RECORDS_V1, NETWORK_MAX_LEASE_KEYS_V1, NetworkAuthorityIdentityV1,
    NetworkAuthorityRevisionV1, NetworkCapabilityV1, NetworkCommandKindV1, NetworkCommandSourceV1, NetworkCommandV1,
    NetworkDeltaRecordKindV1, NetworkDeltaRecordV1, NetworkDeltaSourceV1, NetworkDeltaV1, NetworkError,
    NetworkErrorCode, NetworkHandshakeSourceV1, NetworkHandshakeV1, NetworkPeerKindV1, NetworkPeerRoleV1,
    NetworkReconnectCheckpointV1, WorldAddressV1,
};

pub const NETWORK_WIRE_MAGIC_V1: [u8; 4] = *b"BWN1";
pub const NETWORK_WIRE_HEADER_BYTES_V1: usize = 16;
pub const NETWORK_MAX_HANDSHAKE_WIRE_BYTES_V1: usize = 16 * 1024;
pub const NETWORK_MAX_COMMAND_WIRE_BYTES_V1: usize = NETWORK_MAX_COMMAND_BYTES_V1 + 1024 * 1024;
pub const NETWORK_MAX_DELTA_WIRE_BYTES_V1: usize = NETWORK_MAX_DELTA_BYTES_V1 + 8 * 1024 * 1024;
pub const NETWORK_MAX_CHECKPOINT_WIRE_BYTES_V1: usize = 16 * 1024;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u16)]
pub enum NetworkWireKindV1 {
    Handshake = 1,
    Command = 2,
    Delta = 3,
    Keyframe = 4,
    ReconnectCheckpoint = 5,
}

impl NetworkWireKindV1 {
    fn from_wire(value: u16) -> Result<Self, NetworkError> {
        match value {
            1 => Ok(Self::Handshake),
            2 => Ok(Self::Command),
            3 => Ok(Self::Delta),
            4 => Ok(Self::Keyframe),
            5 => Ok(Self::ReconnectCheckpoint),
            _ => Err(NetworkError::new(
                NetworkErrorCode::WireType,
                "unknown R9 network wire type",
            )),
        }
    }

    const fn maximum_wire_bytes(self) -> usize {
        match self {
            Self::Handshake => NETWORK_MAX_HANDSHAKE_WIRE_BYTES_V1,
            Self::Command => NETWORK_MAX_COMMAND_WIRE_BYTES_V1,
            Self::Delta | Self::Keyframe => NETWORK_MAX_DELTA_WIRE_BYTES_V1,
            Self::ReconnectCheckpoint => NETWORK_MAX_CHECKPOINT_WIRE_BYTES_V1,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct NetworkWireHeaderV1 {
    kind: NetworkWireKindV1,
    payload_len: u32,
}

struct Writer {
    bytes: Vec<u8>,
}

impl Writer {
    fn new() -> Self {
        Self { bytes: Vec::new() }
    }

    fn u8(&mut self, value: u8) {
        self.bytes.push(value);
    }
    fn u16(&mut self, value: u16) {
        self.bytes.extend_from_slice(&value.to_le_bytes());
    }
    fn u32(&mut self, value: u32) {
        self.bytes.extend_from_slice(&value.to_le_bytes());
    }
    fn u64(&mut self, value: u64) {
        self.bytes.extend_from_slice(&value.to_le_bytes());
    }
    fn hash(&mut self, value: CanonicalHash) {
        self.bytes.extend_from_slice(value.as_bytes());
    }

    fn string(&mut self, value: &str) {
        self.u16(value.len() as u16);
        self.bytes.extend_from_slice(value.as_bytes());
    }

    fn blob(&mut self, value: &[u8]) {
        self.u32(value.len() as u32);
        self.bytes.extend_from_slice(value);
    }
}

struct Reader<'a> {
    bytes: &'a [u8],
    cursor: usize,
}

impl<'a> Reader<'a> {
    const fn new(bytes: &'a [u8]) -> Self {
        Self { bytes, cursor: 0 }
    }

    fn take(&mut self, length: usize) -> Result<&'a [u8], NetworkError> {
        let end = self
            .cursor
            .checked_add(length)
            .ok_or_else(|| NetworkError::new(NetworkErrorCode::Truncated, "network payload cursor overflow"))?;
        let value = self
            .bytes
            .get(self.cursor..end)
            .ok_or_else(|| NetworkError::new(NetworkErrorCode::Truncated, "network payload is truncated"))?;
        self.cursor = end;
        Ok(value)
    }

    fn u8(&mut self) -> Result<u8, NetworkError> {
        Ok(self.take(1)?[0])
    }
    fn u16(&mut self) -> Result<u16, NetworkError> {
        Ok(u16::from_le_bytes(self.take(2)?.try_into().expect("fixed slice")))
    }
    fn u32(&mut self) -> Result<u32, NetworkError> {
        Ok(u32::from_le_bytes(self.take(4)?.try_into().expect("fixed slice")))
    }
    fn u64(&mut self) -> Result<u64, NetworkError> {
        Ok(u64::from_le_bytes(self.take(8)?.try_into().expect("fixed slice")))
    }
    fn hash(&mut self) -> Result<CanonicalHash, NetworkError> {
        Ok(CanonicalHash(self.take(16)?.try_into().expect("fixed slice")))
    }

    fn string(&mut self, maximum_bytes: usize) -> Result<String, NetworkError> {
        let length = usize::from(self.u16()?);
        if length > maximum_bytes {
            return Err(NetworkError::new(
                NetworkErrorCode::InvalidLabel,
                "wire label exceeds field budget",
            ));
        }
        String::from_utf8(self.take(length)?.to_vec())
            .map_err(|_| NetworkError::new(NetworkErrorCode::InvalidLabel, "wire label is not UTF-8"))
    }

    fn blob(&mut self, maximum_bytes: usize) -> Result<Vec<u8>, NetworkError> {
        let length = self.u32()? as usize;
        if length > maximum_bytes {
            return Err(NetworkError::new(
                NetworkErrorCode::Budget,
                "wire blob exceeds field budget",
            ));
        }
        Ok(self.take(length)?.to_vec())
    }

    fn finish(self) -> Result<(), NetworkError> {
        if self.cursor == self.bytes.len() {
            Ok(())
        } else {
            Err(NetworkError::new(
                NetworkErrorCode::TrailingBytes,
                "network payload contains trailing bytes",
            ))
        }
    }
}

fn frame(kind: NetworkWireKindV1, payload: Vec<u8>) -> Result<Vec<u8>, NetworkError> {
    let total = NETWORK_WIRE_HEADER_BYTES_V1
        .checked_add(payload.len())
        .ok_or_else(|| NetworkError::new(NetworkErrorCode::Budget, "wire frame length overflow"))?;
    if total > kind.maximum_wire_bytes() {
        return Err(NetworkError::new(
            NetworkErrorCode::Budget,
            "wire frame exceeds message budget",
        ));
    }
    let mut output = Vec::with_capacity(total);
    output.extend_from_slice(&NETWORK_WIRE_MAGIC_V1);
    output.extend_from_slice(&NETWORK_AUTHORITY_SCHEMA_V1.to_le_bytes());
    output.extend_from_slice(&NETWORK_AUTHORITY_PROTOCOL_V1.to_le_bytes());
    output.extend_from_slice(&(kind as u16).to_le_bytes());
    output.extend_from_slice(&0_u16.to_le_bytes());
    output.extend_from_slice(&(payload.len() as u32).to_le_bytes());
    output.extend_from_slice(&payload);
    Ok(output)
}

fn parse_frame(bytes: &[u8], expected: NetworkWireKindV1) -> Result<(NetworkWireHeaderV1, &[u8]), NetworkError> {
    if bytes.len() < NETWORK_WIRE_HEADER_BYTES_V1 {
        return Err(NetworkError::new(
            NetworkErrorCode::Truncated,
            "network wire header is truncated",
        ));
    }
    if bytes[..4] != NETWORK_WIRE_MAGIC_V1 {
        return Err(NetworkError::new(
            NetworkErrorCode::WireMagic,
            "network wire magic is not BWN1",
        ));
    }
    let schema = u16::from_le_bytes(bytes[4..6].try_into().expect("fixed slice"));
    let protocol = u16::from_le_bytes(bytes[6..8].try_into().expect("fixed slice"));
    if schema != NETWORK_AUTHORITY_SCHEMA_V1 {
        return Err(NetworkError::new(
            NetworkErrorCode::SchemaMismatch,
            "network wire schema is unsupported",
        ));
    }
    if protocol != NETWORK_AUTHORITY_PROTOCOL_V1 {
        return Err(NetworkError::new(
            NetworkErrorCode::ProtocolMismatch,
            "network wire protocol is unsupported",
        ));
    }
    let kind = NetworkWireKindV1::from_wire(u16::from_le_bytes(bytes[8..10].try_into().expect("fixed slice")))?;
    if kind != expected {
        return Err(NetworkError::new(
            NetworkErrorCode::WireType,
            "network wire message type mismatch",
        ));
    }
    if u16::from_le_bytes(bytes[10..12].try_into().expect("fixed slice")) != 0 {
        return Err(NetworkError::new(
            NetworkErrorCode::ProtocolMismatch,
            "network wire flags are unsupported",
        ));
    }
    if bytes.len() > kind.maximum_wire_bytes() {
        return Err(NetworkError::new(
            NetworkErrorCode::Budget,
            "network wire frame exceeds message budget",
        ));
    }
    let payload_len = u32::from_le_bytes(bytes[12..16].try_into().expect("fixed slice"));
    let expected_len = NETWORK_WIRE_HEADER_BYTES_V1
        .checked_add(payload_len as usize)
        .ok_or_else(|| NetworkError::new(NetworkErrorCode::Budget, "network wire length overflow"))?;
    if expected_len != bytes.len() {
        return Err(NetworkError::new(
            NetworkErrorCode::Truncated,
            "network wire payload length mismatch",
        ));
    }
    Ok((
        NetworkWireHeaderV1 { kind, payload_len },
        &bytes[NETWORK_WIRE_HEADER_BYTES_V1..],
    ))
}

fn write_identity(writer: &mut Writer, identity: &NetworkAuthorityIdentityV1) {
    writer.string(&identity.address.universe_id);
    writer.string(&identity.address.location_id);
    writer.u64(identity.revision.epoch);
    writer.u64(identity.revision.world);
    writer.u64(identity.revision.entities);
    writer.u64(identity.revision.gameplay);
    writer.u64(identity.revision.persistence);
    writer.hash(identity.state_hash);
}

fn read_identity(reader: &mut Reader<'_>) -> Result<NetworkAuthorityIdentityV1, NetworkError> {
    let address = WorldAddressV1 {
        universe_id: reader.string(64 * 4)?,
        location_id: reader.string(128 * 4)?,
    };
    let revision = NetworkAuthorityRevisionV1 {
        epoch: reader.u64()?,
        world: reader.u64()?,
        entities: reader.u64()?,
        gameplay: reader.u64()?,
        persistence: reader.u64()?,
    };
    let supplied_hash = reader.hash()?;
    let identity = NetworkAuthorityIdentityV1::new(address, revision)?;
    if identity.state_hash != supplied_hash {
        return Err(NetworkError::new(
            NetworkErrorCode::IdentityHash,
            "wire identity hash mismatch",
        ));
    }
    Ok(identity)
}

pub fn encode_network_handshake_v1(value: &NetworkHandshakeV1) -> Result<Vec<u8>, NetworkError> {
    value.validate()?;
    let mut writer = Writer::new();
    writer.string(&value.session_id);
    writer.string(&value.peer_id);
    writer.u8(value.peer_kind as u8);
    writer.u8(value.role as u8);
    writer.string(&value.engine_version);
    writer.hash(value.content_hash);
    writer.hash(value.generator_hash);
    writer.u8(value.capabilities.len() as u8);
    for capability in &value.capabilities {
        writer.u8(*capability as u8);
    }
    writer.u32(value.max_command_bytes);
    writer.hash(value.handshake_hash);
    frame(NetworkWireKindV1::Handshake, writer.bytes)
}

pub fn decode_network_handshake_v1(bytes: &[u8]) -> Result<NetworkHandshakeV1, NetworkError> {
    let (_, payload) = parse_frame(bytes, NetworkWireKindV1::Handshake)?;
    let mut reader = Reader::new(payload);
    let session_id = reader.string(720)?;
    let peer_id = reader.string(720)?;
    let peer_kind = match reader.u8()? {
        0 => NetworkPeerKindV1::Human,
        1 => NetworkPeerKindV1::Agent,
        _ => return Err(NetworkError::new(NetworkErrorCode::InvalidEnum, "invalid peer kind")),
    };
    let role = match reader.u8()? {
        0 => NetworkPeerRoleV1::Host,
        1 => NetworkPeerRoleV1::Guest,
        _ => return Err(NetworkError::new(NetworkErrorCode::InvalidEnum, "invalid peer role")),
    };
    let engine_version = reader.string(256)?;
    let content_hash = reader.hash()?;
    let generator_hash = reader.hash()?;
    let capability_count = usize::from(reader.u8()?);
    if capability_count > 10 {
        return Err(NetworkError::new(
            NetworkErrorCode::Budget,
            "too many handshake capabilities",
        ));
    }
    let mut capabilities = Vec::with_capacity(capability_count);
    for _ in 0..capability_count {
        capabilities.push(
            NetworkCapabilityV1::from_wire(reader.u8()?)
                .ok_or_else(|| NetworkError::new(NetworkErrorCode::InvalidEnum, "invalid network capability"))?,
        );
    }
    let max_command_bytes = reader.u32()?;
    let supplied_hash = reader.hash()?;
    reader.finish()?;
    let value = NetworkHandshakeV1::new(NetworkHandshakeSourceV1 {
        session_id,
        peer_id,
        peer_kind,
        role,
        engine_version,
        content_hash,
        generator_hash,
        capabilities,
        max_command_bytes,
    })?;
    if value.handshake_hash != supplied_hash {
        return Err(NetworkError::new(
            NetworkErrorCode::HashMismatch,
            "wire handshake hash mismatch",
        ));
    }
    Ok(value)
}

pub fn encode_network_command_v1(value: &NetworkCommandV1) -> Result<Vec<u8>, NetworkError> {
    value.validate()?;
    let mut writer = Writer::new();
    writer.string(&value.session_id);
    writer.string(&value.command_id);
    writer.string(&value.idempotency_key);
    writer.string(&value.peer_id);
    writer.string(&value.connection_id);
    writer.string(&value.actor_id);
    writer.u8(value.peer_kind as u8);
    writer.u8(value.kind as u8);
    writer.u8(value.required_capability as u8);
    writer.u64(value.sequence);
    write_identity(&mut writer, &value.expected);
    writer.u64(value.expires_at);
    writer.u16(value.lease_keys.len() as u16);
    for key in &value.lease_keys {
        writer.string(key);
    }
    writer.blob(&value.payload);
    writer.hash(value.command_hash);
    frame(NetworkWireKindV1::Command, writer.bytes)
}

pub fn decode_network_command_v1(bytes: &[u8]) -> Result<NetworkCommandV1, NetworkError> {
    let (_, payload) = parse_frame(bytes, NetworkWireKindV1::Command)?;
    let mut reader = Reader::new(payload);
    let session_id = reader.string(720)?;
    let command_id = reader.string(720)?;
    let idempotency_key = reader.string(1024)?;
    let peer_id = reader.string(720)?;
    let connection_id = reader.string(720)?;
    let actor_id = reader.string(720)?;
    let peer_kind = match reader.u8()? {
        0 => NetworkPeerKindV1::Human,
        1 => NetworkPeerKindV1::Agent,
        _ => return Err(NetworkError::new(NetworkErrorCode::InvalidEnum, "invalid peer kind")),
    };
    let kind = NetworkCommandKindV1::from_wire(reader.u8()?)
        .ok_or_else(|| NetworkError::new(NetworkErrorCode::InvalidEnum, "invalid command kind"))?;
    let required_capability = NetworkCapabilityV1::from_wire(reader.u8()?)
        .ok_or_else(|| NetworkError::new(NetworkErrorCode::InvalidEnum, "invalid required capability"))?;
    let sequence = reader.u64()?;
    let expected = read_identity(&mut reader)?;
    let expires_at = reader.u64()?;
    let lease_count = usize::from(reader.u16()?);
    if lease_count > NETWORK_MAX_LEASE_KEYS_V1 {
        return Err(NetworkError::new(
            NetworkErrorCode::LeaseSize,
            "wire command has too many lease keys",
        ));
    }
    let mut lease_keys = Vec::with_capacity(lease_count);
    for _ in 0..lease_count {
        lease_keys.push(reader.string(1024)?);
    }
    let command_payload = reader.blob(NETWORK_MAX_COMMAND_BYTES_V1)?;
    let supplied_hash = reader.hash()?;
    reader.finish()?;
    let command = NetworkCommandV1::new(NetworkCommandSourceV1 {
        session_id,
        command_id,
        idempotency_key,
        peer_id,
        connection_id,
        actor_id,
        peer_kind,
        kind,
        required_capability,
        sequence,
        expected,
        expires_at,
        lease_keys,
        payload: command_payload,
    })?;
    if command.command_hash != supplied_hash {
        return Err(NetworkError::new(
            NetworkErrorCode::HashMismatch,
            "wire command hash mismatch",
        ));
    }
    Ok(command)
}

pub fn encode_network_delta_v1(value: &NetworkDeltaV1) -> Result<Vec<u8>, NetworkError> {
    value.validate()?;
    let mut writer = Writer::new();
    writer.string(&value.session_id);
    writer.string(&value.delta_id);
    writer.string(&value.peer_id);
    writer.u64(value.sequence);
    writer.u64(value.acknowledged_command_sequence);
    write_identity(&mut writer, &value.from);
    write_identity(&mut writer, &value.to);
    writer.hash(value.interest_hash);
    writer.u32(value.records.len() as u32);
    for record in &value.records {
        writer.u8(record.kind as u8);
        writer.string(&record.record_id);
        writer.u64(record.revision);
        writer.blob(&record.payload);
        writer.hash(record.payload_hash);
    }
    writer.u32(value.byte_length);
    writer.hash(value.delta_hash);
    frame(
        if value.keyframe {
            NetworkWireKindV1::Keyframe
        } else {
            NetworkWireKindV1::Delta
        },
        writer.bytes,
    )
}

pub fn decode_network_delta_v1(bytes: &[u8]) -> Result<NetworkDeltaV1, NetworkError> {
    if bytes.len() < 10 {
        return Err(NetworkError::new(
            NetworkErrorCode::Truncated,
            "network delta frame is truncated",
        ));
    }
    let kind = NetworkWireKindV1::from_wire(u16::from_le_bytes(bytes[8..10].try_into().expect("checked slice")))?;
    if !matches!(kind, NetworkWireKindV1::Delta | NetworkWireKindV1::Keyframe) {
        return Err(NetworkError::new(
            NetworkErrorCode::WireType,
            "expected delta or keyframe",
        ));
    }
    let (_, payload) = parse_frame(bytes, kind)?;
    let mut reader = Reader::new(payload);
    let session_id = reader.string(720)?;
    let delta_id = reader.string(720)?;
    let peer_id = reader.string(720)?;
    let sequence = reader.u64()?;
    let acknowledged_command_sequence = reader.u64()?;
    let from = read_identity(&mut reader)?;
    let to = read_identity(&mut reader)?;
    let interest_hash = reader.hash()?;
    let record_count = reader.u32()? as usize;
    if record_count > NETWORK_MAX_DELTA_RECORDS_V1 {
        return Err(NetworkError::new(
            NetworkErrorCode::DeltaRecordCount,
            "wire delta record budget exceeded",
        ));
    }
    let mut records = Vec::with_capacity(record_count);
    let mut running_bytes = 0_usize;
    for _ in 0..record_count {
        let record_kind = NetworkDeltaRecordKindV1::from_wire(reader.u8()?)
            .ok_or_else(|| NetworkError::new(NetworkErrorCode::InvalidEnum, "invalid delta record kind"))?;
        let record_id = reader.string(1024)?;
        let revision = reader.u64()?;
        let record_payload = reader.blob(NETWORK_MAX_DELTA_BYTES_V1)?;
        running_bytes = running_bytes
            .checked_add(record_payload.len())
            .ok_or_else(|| NetworkError::new(NetworkErrorCode::DeltaSize, "wire delta byte length overflow"))?;
        if running_bytes > NETWORK_MAX_DELTA_BYTES_V1 {
            return Err(NetworkError::new(
                NetworkErrorCode::DeltaSize,
                "wire delta byte budget exceeded",
            ));
        }
        let supplied_record_hash = reader.hash()?;
        let record = NetworkDeltaRecordV1::new(record_kind, record_id, revision, record_payload)?;
        if record.payload_hash != supplied_record_hash {
            return Err(NetworkError::new(
                NetworkErrorCode::HashMismatch,
                "wire delta record hash mismatch",
            ));
        }
        records.push(record);
    }
    let supplied_byte_length = reader.u32()?;
    let supplied_delta_hash = reader.hash()?;
    reader.finish()?;
    let delta = NetworkDeltaV1::new(NetworkDeltaSourceV1 {
        session_id,
        delta_id,
        peer_id,
        keyframe: kind == NetworkWireKindV1::Keyframe,
        sequence,
        acknowledged_command_sequence,
        from,
        to,
        interest_hash,
        records,
    })?;
    if delta.byte_length != supplied_byte_length || delta.delta_hash != supplied_delta_hash {
        return Err(NetworkError::new(
            NetworkErrorCode::HashMismatch,
            "wire delta size or hash mismatch",
        ));
    }
    Ok(delta)
}

pub fn encode_network_checkpoint_v1(value: &NetworkReconnectCheckpointV1) -> Result<Vec<u8>, NetworkError> {
    value.validate()?;
    let mut writer = Writer::new();
    writer.string(&value.session_id);
    writer.string(&value.peer_id);
    writer.u64(value.connection_generation);
    writer.u64(value.acknowledged_command_sequence);
    writer.u64(value.acknowledged_delta_sequence);
    write_identity(&mut writer, &value.identity);
    writer.hash(value.interest_hash);
    writer.hash(value.checkpoint_hash);
    frame(NetworkWireKindV1::ReconnectCheckpoint, writer.bytes)
}

pub fn decode_network_checkpoint_v1(bytes: &[u8]) -> Result<NetworkReconnectCheckpointV1, NetworkError> {
    let (_, payload) = parse_frame(bytes, NetworkWireKindV1::ReconnectCheckpoint)?;
    let mut reader = Reader::new(payload);
    let session_id = reader.string(720)?;
    let peer_id = reader.string(720)?;
    let connection_generation = reader.u64()?;
    let acknowledged_command_sequence = reader.u64()?;
    let acknowledged_delta_sequence = reader.u64()?;
    let identity = read_identity(&mut reader)?;
    let interest_hash = reader.hash()?;
    let supplied_hash = reader.hash()?;
    reader.finish()?;
    let checkpoint = NetworkReconnectCheckpointV1::new(
        session_id,
        peer_id,
        connection_generation,
        acknowledged_command_sequence,
        acknowledged_delta_sequence,
        identity,
        interest_hash,
    )?;
    if checkpoint.checkpoint_hash != supplied_hash {
        return Err(NetworkError::new(
            NetworkErrorCode::HashMismatch,
            "wire checkpoint hash mismatch",
        ));
    }
    Ok(checkpoint)
}
