//! Small versioned binary contracts for workers, replays, and render extraction.

use core::fmt;

use blockwild_types::{CanonicalHash, CanonicalHasher};

pub const ENVELOPE_MAGIC: [u8; 4] = *b"BWEP";
pub const ENVELOPE_HEADER_LEN: usize = 32;
pub const PROTOCOL_VERSION: u16 = 1;
pub const SCHEMA_VERSION: u16 = 1;
pub const SUPPORTED_FLAGS: u16 = 0;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u16)]
pub enum MessageKind {
    CapabilityHello = 1,
    CapabilityAck = 2,
    Heartbeat = 3,
    Shutdown = 4,
    BufferRelease = 5,
    CommandBatch = 10,
    Step = 11,
    Events = 12,
    StateHash = 13,
    RenderScene = 20,
    Replay = 30,
    Error = 0x7ffe,
    Panic = 0x7fff,
}

impl TryFrom<u16> for MessageKind {
    type Error = ProtocolError;

    fn try_from(value: u16) -> Result<Self, ProtocolError> {
        match value {
            1 => Ok(Self::CapabilityHello),
            2 => Ok(Self::CapabilityAck),
            3 => Ok(Self::Heartbeat),
            4 => Ok(Self::Shutdown),
            5 => Ok(Self::BufferRelease),
            10 => Ok(Self::CommandBatch),
            11 => Ok(Self::Step),
            12 => Ok(Self::Events),
            13 => Ok(Self::StateHash),
            20 => Ok(Self::RenderScene),
            30 => Ok(Self::Replay),
            0x7ffe => Ok(Self::Error),
            0x7fff => Ok(Self::Panic),
            _ => Err(ProtocolError::new(
                ProtocolErrorCode::UnknownMessageKind,
                u32::from(value),
                "unknown message kind",
            )),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct EnvelopeHeader {
    pub protocol_version: u16,
    pub schema_version: u16,
    pub kind: MessageKind,
    pub flags: u16,
    pub request_id: u32,
    pub epoch: u32,
    pub payload_len: u32,
    pub ownership_token: u64,
}

impl EnvelopeHeader {
    #[must_use]
    pub fn new(kind: MessageKind, request_id: u32, epoch: u32, ownership_token: u64, payload_len: usize) -> Self {
        Self {
            protocol_version: PROTOCOL_VERSION,
            schema_version: SCHEMA_VERSION,
            kind,
            flags: 0,
            request_id,
            epoch,
            payload_len: u32::try_from(payload_len).expect("protocol payload exceeds u32 length"),
            ownership_token,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Envelope {
    pub header: EnvelopeHeader,
    pub payload: Vec<u8>,
}

impl Envelope {
    #[must_use]
    pub fn new(kind: MessageKind, request_id: u32, epoch: u32, ownership_token: u64, payload: Vec<u8>) -> Self {
        Self {
            header: EnvelopeHeader::new(kind, request_id, epoch, ownership_token, payload.len()),
            payload,
        }
    }

    #[must_use]
    pub fn encode(&self) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(ENVELOPE_HEADER_LEN + self.payload.len());
        bytes.extend_from_slice(&ENVELOPE_MAGIC);
        bytes.extend_from_slice(&self.header.protocol_version.to_le_bytes());
        bytes.extend_from_slice(&self.header.schema_version.to_le_bytes());
        bytes.extend_from_slice(&(self.header.kind as u16).to_le_bytes());
        bytes.extend_from_slice(&self.header.flags.to_le_bytes());
        bytes.extend_from_slice(&self.header.request_id.to_le_bytes());
        bytes.extend_from_slice(&self.header.epoch.to_le_bytes());
        bytes.extend_from_slice(&self.header.payload_len.to_le_bytes());
        bytes.extend_from_slice(&self.header.ownership_token.to_le_bytes());
        bytes.extend_from_slice(&self.payload);
        bytes
    }

    pub fn decode(bytes: &[u8]) -> Result<Self, ProtocolError> {
        if bytes.len() < ENVELOPE_HEADER_LEN {
            return Err(ProtocolError::new(
                ProtocolErrorCode::Truncated,
                bytes.len() as u32,
                "envelope header truncated",
            ));
        }
        if bytes[..4] != ENVELOPE_MAGIC {
            return Err(ProtocolError::new(
                ProtocolErrorCode::BadMagic,
                0,
                "envelope magic is not BWEP",
            ));
        }
        let protocol_version = read_u16(bytes, 4);
        if protocol_version != PROTOCOL_VERSION {
            return Err(ProtocolError::new(
                ProtocolErrorCode::UnsupportedProtocol,
                u32::from(protocol_version),
                "unsupported protocol version",
            ));
        }
        let schema_version = read_u16(bytes, 6);
        if schema_version != SCHEMA_VERSION {
            return Err(ProtocolError::new(
                ProtocolErrorCode::UnsupportedSchema,
                u32::from(schema_version),
                "unsupported schema version",
            ));
        }
        let flags = read_u16(bytes, 10);
        if flags & !SUPPORTED_FLAGS != 0 {
            return Err(ProtocolError::new(
                ProtocolErrorCode::UnsupportedFlags,
                u32::from(flags),
                "unsupported required flags",
            ));
        }
        let payload_len = read_u32(bytes, 20);
        let expected_len = ENVELOPE_HEADER_LEN.checked_add(payload_len as usize).ok_or_else(|| {
            ProtocolError::new(
                ProtocolErrorCode::LengthMismatch,
                payload_len,
                "payload length overflow",
            )
        })?;
        if bytes.len() != expected_len {
            return Err(ProtocolError::new(
                ProtocolErrorCode::LengthMismatch,
                bytes.len() as u32,
                "envelope length mismatch",
            ));
        }
        Ok(Self {
            header: EnvelopeHeader {
                protocol_version,
                schema_version,
                kind: MessageKind::try_from(read_u16(bytes, 8))?,
                flags,
                request_id: read_u32(bytes, 12),
                epoch: read_u32(bytes, 16),
                payload_len,
                ownership_token: read_u64(bytes, 24),
            },
            payload: bytes[ENVELOPE_HEADER_LEN..].to_vec(),
        })
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u16)]
pub enum ProtocolErrorCode {
    Truncated = 1,
    BadMagic = 2,
    UnsupportedProtocol = 3,
    UnsupportedSchema = 4,
    UnsupportedFlags = 5,
    UnknownMessageKind = 6,
    LengthMismatch = 7,
    InvalidPayload = 8,
    InvalidHandle = 9,
    EngineStopped = 10,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProtocolError {
    pub code: ProtocolErrorCode,
    pub detail: u32,
    pub message: String,
}

impl ProtocolError {
    #[must_use]
    pub fn new(code: ProtocolErrorCode, detail: u32, message: impl Into<String>) -> Self {
        Self {
            code,
            detail,
            message: message.into(),
        }
    }

    #[must_use]
    pub fn into_envelope(self, request_id: u32, epoch: u32, ownership_token: u64) -> Envelope {
        let mut payload = Vec::with_capacity(6 + self.message.len());
        payload.extend_from_slice(&(self.code as u16).to_le_bytes());
        payload.extend_from_slice(&self.detail.to_le_bytes());
        payload.extend_from_slice(self.message.as_bytes());
        Envelope::new(MessageKind::Error, request_id, epoch, ownership_token, payload)
    }
}

impl fmt::Display for ProtocolError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "protocol error {:?} ({}): {}",
            self.code, self.detail, self.message
        )
    }
}

impl std::error::Error for ProtocolError {}

/// Version tuple and hashes needed to reproduce one deterministic run.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReplayHeader {
    pub engine_version: u32,
    pub protocol_version: u16,
    pub content_hash: CanonicalHash,
    pub generator_hash: CanonicalHash,
    pub world_seed: String,
    pub starting_hash: CanonicalHash,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReplayFrame {
    pub tick: u64,
    pub command_batch: Vec<u8>,
    pub platform_results: Vec<u8>,
    pub expected_hash: CanonicalHash,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReplayLog {
    pub header: ReplayHeader,
    pub frames: Vec<ReplayFrame>,
}

impl ReplayLog {
    #[must_use]
    pub fn canonical_hash(&self) -> CanonicalHash {
        let mut hasher = CanonicalHasher::new("blockwild-replay-v1");
        hasher.write_u32(self.header.engine_version);
        hasher.write_u16(self.header.protocol_version);
        hasher.write_bytes(self.header.content_hash.as_bytes());
        hasher.write_bytes(self.header.generator_hash.as_bytes());
        hasher.write_str(&self.header.world_seed);
        hasher.write_bytes(self.header.starting_hash.as_bytes());
        hasher.write_u64(self.frames.len() as u64);
        for frame in &self.frames {
            hasher.write_u64(frame.tick);
            hasher.write_bytes(&frame.command_batch);
            hasher.write_bytes(&frame.platform_results);
            hasher.write_bytes(frame.expected_hash.as_bytes());
        }
        hasher.finish()
    }

    #[must_use]
    pub fn encode(&self) -> Vec<u8> {
        let mut payload = Vec::new();
        payload.extend_from_slice(&self.header.engine_version.to_le_bytes());
        payload.extend_from_slice(&self.header.protocol_version.to_le_bytes());
        payload.extend_from_slice(self.header.content_hash.as_bytes());
        payload.extend_from_slice(self.header.generator_hash.as_bytes());
        write_sized(&mut payload, self.header.world_seed.as_bytes());
        payload.extend_from_slice(self.header.starting_hash.as_bytes());
        payload.extend_from_slice(&(self.frames.len() as u32).to_le_bytes());
        for frame in &self.frames {
            payload.extend_from_slice(&frame.tick.to_le_bytes());
            write_sized(&mut payload, &frame.command_batch);
            write_sized(&mut payload, &frame.platform_results);
            payload.extend_from_slice(frame.expected_hash.as_bytes());
        }
        Envelope::new(MessageKind::Replay, 0, 0, 0, payload).encode()
    }

    pub fn decode(bytes: &[u8]) -> Result<Self, ProtocolError> {
        let envelope = Envelope::decode(bytes)?;
        if envelope.header.kind != MessageKind::Replay {
            return Err(ProtocolError::new(
                ProtocolErrorCode::InvalidPayload,
                envelope.header.kind as u32,
                "expected replay envelope",
            ));
        }
        let mut reader = Reader::new(&envelope.payload);
        let engine_version = reader.u32()?;
        let protocol_version = reader.u16()?;
        let content_hash = CanonicalHash(reader.array_16()?);
        let generator_hash = CanonicalHash(reader.array_16()?);
        let world_seed = String::from_utf8(reader.sized()?.to_vec())
            .map_err(|_| ProtocolError::new(ProtocolErrorCode::InvalidPayload, 0, "world seed is not UTF-8"))?;
        let starting_hash = CanonicalHash(reader.array_16()?);
        let frame_count = reader.u32()?;
        let mut frames = Vec::with_capacity(frame_count as usize);
        for _ in 0..frame_count {
            frames.push(ReplayFrame {
                tick: reader.u64()?,
                command_batch: reader.sized()?.to_vec(),
                platform_results: reader.sized()?.to_vec(),
                expected_hash: CanonicalHash(reader.array_16()?),
            });
        }
        reader.finish()?;
        Ok(Self {
            header: ReplayHeader {
                engine_version,
                protocol_version,
                content_hash,
                generator_hash,
                world_seed,
                starting_hash,
            },
            frames,
        })
    }
}

fn write_sized(output: &mut Vec<u8>, bytes: &[u8]) {
    output.extend_from_slice(&(bytes.len() as u32).to_le_bytes());
    output.extend_from_slice(bytes);
}

fn read_u16(bytes: &[u8], offset: usize) -> u16 {
    u16::from_le_bytes([bytes[offset], bytes[offset + 1]])
}

fn read_u32(bytes: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes(bytes[offset..offset + 4].try_into().expect("fixed checked slice"))
}

fn read_u64(bytes: &[u8], offset: usize) -> u64 {
    u64::from_le_bytes(bytes[offset..offset + 8].try_into().expect("fixed checked slice"))
}

struct Reader<'a> {
    bytes: &'a [u8],
    cursor: usize,
}

impl<'a> Reader<'a> {
    const fn new(bytes: &'a [u8]) -> Self {
        Self { bytes, cursor: 0 }
    }

    fn take(&mut self, length: usize) -> Result<&'a [u8], ProtocolError> {
        let end = self.cursor.checked_add(length).ok_or_else(|| {
            ProtocolError::new(
                ProtocolErrorCode::InvalidPayload,
                length as u32,
                "payload cursor overflow",
            )
        })?;
        let value = self.bytes.get(self.cursor..end).ok_or_else(|| {
            ProtocolError::new(
                ProtocolErrorCode::Truncated,
                self.cursor as u32,
                "replay payload truncated",
            )
        })?;
        self.cursor = end;
        Ok(value)
    }

    fn u16(&mut self) -> Result<u16, ProtocolError> {
        Ok(u16::from_le_bytes(self.take(2)?.try_into().expect("fixed slice")))
    }

    fn u32(&mut self) -> Result<u32, ProtocolError> {
        Ok(u32::from_le_bytes(self.take(4)?.try_into().expect("fixed slice")))
    }

    fn u64(&mut self) -> Result<u64, ProtocolError> {
        Ok(u64::from_le_bytes(self.take(8)?.try_into().expect("fixed slice")))
    }

    fn array_16(&mut self) -> Result<[u8; 16], ProtocolError> {
        Ok(self.take(16)?.try_into().expect("fixed slice"))
    }

    fn sized(&mut self) -> Result<&'a [u8], ProtocolError> {
        let length = self.u32()? as usize;
        self.take(length)
    }

    fn finish(self) -> Result<(), ProtocolError> {
        if self.cursor == self.bytes.len() {
            Ok(())
        } else {
            Err(ProtocolError::new(
                ProtocolErrorCode::LengthMismatch,
                self.cursor as u32,
                "trailing replay payload",
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn envelope_has_exact_stable_layout() {
        let encoded = Envelope::new(
            MessageKind::Heartbeat,
            0x1122_3344,
            0x5566_7788,
            0x0102_0304_0506_0708,
            vec![9, 10],
        )
        .encode();
        assert_eq!(encoded.len(), 34);
        assert_eq!(&encoded[..4], b"BWEP");
        assert_eq!(&encoded[12..16], &0x1122_3344_u32.to_le_bytes());
        assert_eq!(&encoded[16..20], &0x5566_7788_u32.to_le_bytes());
        assert_eq!(&encoded[24..32], &0x0102_0304_0506_0708_u64.to_le_bytes());
        assert_eq!(Envelope::decode(&encoded).unwrap().payload, [9, 10]);
    }

    #[test]
    fn envelope_rejects_trailing_and_unknown_required_data() {
        let mut encoded = Envelope::new(MessageKind::Heartbeat, 1, 2, 3, vec![]).encode();
        encoded.push(0);
        assert_eq!(
            Envelope::decode(&encoded).unwrap_err().code,
            ProtocolErrorCode::LengthMismatch
        );
        let mut flags = Envelope::new(MessageKind::Heartbeat, 1, 2, 3, vec![]).encode();
        flags[10] = 1;
        assert_eq!(
            Envelope::decode(&flags).unwrap_err().code,
            ProtocolErrorCode::UnsupportedFlags
        );
    }

    #[test]
    fn replay_round_trip_preserves_hash() {
        let log = ReplayLog {
            header: ReplayHeader {
                engine_version: 1,
                protocol_version: PROTOCOL_VERSION,
                content_hash: CanonicalHash([1; 16]),
                generator_hash: CanonicalHash([2; 16]),
                world_seed: "A🌿B".into(),
                starting_hash: CanonicalHash([3; 16]),
            },
            frames: vec![ReplayFrame {
                tick: 4,
                command_batch: vec![5, 6],
                platform_results: vec![7],
                expected_hash: CanonicalHash([8; 16]),
            }],
        };
        let decoded = ReplayLog::decode(&log.encode()).unwrap();
        assert_eq!(decoded, log);
        assert_eq!(decoded.canonical_hash(), log.canonical_hash());
    }
}
