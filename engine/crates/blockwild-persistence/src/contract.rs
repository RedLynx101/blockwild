use blockwild_types::{CanonicalHash, CanonicalHasher};
use core::fmt;

pub const PERSISTENCE_SCHEMA_V1: u16 = 1;
pub const PERSISTENCE_PROTOCOL_V1: u16 = 1;
pub const MAX_MUTATIONS_V1: usize = 4_096;
pub const MAX_RECORD_BYTES_V1: usize = 64 * 1024 * 1024;
pub const MAX_TRANSACTION_BYTES_V1: usize = 96 * 1024 * 1024;
pub const MAX_RECORDS_PER_CHECKPOINT_V1: usize = 1_000_000;

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[repr(u8)]
pub enum RecordKind {
    LocationManifest = 0,
    ChunkEdits = 1,
    Entity = 2,
    ActorDigest = 3,
    Machine = 4,
    Player = 5,
    MapKnowledge = 6,
    Cardforge = 7,
    Quest = 8,
    SettingsReference = 9,
}

impl RecordKind {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::LocationManifest => "location-manifest",
            Self::ChunkEdits => "chunk-edits",
            Self::Entity => "entity",
            Self::ActorDigest => "actor-digest",
            Self::Machine => "machine",
            Self::Player => "player",
            Self::MapKnowledge => "map-knowledge",
            Self::Cardforge => "cardforge",
            Self::Quest => "quest",
            Self::SettingsReference => "settings-reference",
        }
    }

    pub fn from_tag(tag: u8) -> Result<Self, PersistenceError> {
        match tag {
            0 => Ok(Self::LocationManifest),
            1 => Ok(Self::ChunkEdits),
            2 => Ok(Self::Entity),
            3 => Ok(Self::ActorDigest),
            4 => Ok(Self::Machine),
            5 => Ok(Self::Player),
            6 => Ok(Self::MapKnowledge),
            7 => Ok(Self::Cardforge),
            8 => Ok(Self::Quest),
            9 => Ok(Self::SettingsReference),
            _ => Err(PersistenceError::new("record-kind", "unknown persistence record kind")),
        }
    }
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub struct RecordAddress {
    pub universe_id: String,
    pub location_id: String,
    pub kind: RecordKind,
    pub record_id: String,
}

impl RecordAddress {
    pub fn new(
        universe_id: impl Into<String>,
        location_id: impl Into<String>,
        kind: RecordKind,
        record_id: impl Into<String>,
    ) -> Result<Self, PersistenceError> {
        let value = Self {
            universe_id: universe_id.into(),
            location_id: location_id.into(),
            kind,
            record_id: record_id.into(),
        };
        validate_label(&value.universe_id, 64, "address.universe_id")?;
        validate_label(&value.location_id, 128, "address.location_id")?;
        validate_label(&value.record_id, 256, "address.record_id")?;
        Ok(value)
    }

    #[must_use]
    pub fn canonical_key(&self) -> String {
        format!(
            "{}@{}/{}/{}",
            encode_uri_component(&self.universe_id),
            encode_uri_component(&self.location_id),
            self.kind.as_str(),
            encode_uri_component(&self.record_id)
        )
    }

    pub(crate) fn write_hash(&self, hasher: &mut CanonicalHasher) {
        hasher.write_str(&self.universe_id);
        hasher.write_str(&self.location_id);
        hasher.write_str(self.kind.as_str());
        hasher.write_str(&self.record_id);
    }
}

impl Ord for RecordAddress {
    fn cmp(&self, other: &Self) -> core::cmp::Ordering {
        self.canonical_key().cmp(&other.canonical_key())
    }
}

impl PartialOrd for RecordAddress {
    fn partial_cmp(&self, other: &Self) -> Option<core::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RecordRevision {
    pub epoch: u64,
    pub sequence: u64,
    pub record: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RecordDescriptor {
    pub address: RecordAddress,
    pub revision: u64,
    pub byte_length: u32,
    pub payload_hash: CanonicalHash,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PersistenceError {
    pub code: &'static str,
    pub message: String,
}

impl PersistenceError {
    #[must_use]
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

impl fmt::Display for PersistenceError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for PersistenceError {}

pub(crate) fn validate_label(value: &str, maximum_utf16: usize, name: &str) -> Result<(), PersistenceError> {
    let length = value.encode_utf16().count();
    if length == 0 || length > maximum_utf16 {
        return Err(PersistenceError::new(
            "invalid-label",
            format!("{name} must contain 1..={maximum_utf16} UTF-16 code units"),
        ));
    }
    Ok(())
}

pub(crate) fn payload_hash(payload: &[u8]) -> CanonicalHash {
    let mut hasher = CanonicalHasher::new("blockwild-persistence-record-v1");
    hasher.write_bytes(payload);
    hasher.finish()
}

#[must_use]
pub fn encode_uri_component(value: &str) -> String {
    let mut result = String::with_capacity(value.len());
    for byte in value.as_bytes() {
        let unescaped = byte.is_ascii_alphanumeric()
            || matches!(byte, b'-' | b'_' | b'.' | b'!' | b'~' | b'*' | b'\'' | b'(' | b')');
        if unescaped {
            result.push(char::from(*byte));
        } else {
            use core::fmt::Write as _;
            write!(&mut result, "%{byte:02X}").expect("writing to String cannot fail");
        }
    }
    result
}
