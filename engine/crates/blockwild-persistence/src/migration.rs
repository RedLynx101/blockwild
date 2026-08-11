use crate::{PERSISTENCE_SCHEMA_V1, PersistenceError, payload_hash, validate_label};
use blockwild_types::{CanonicalHash, CanonicalHasher};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum LegacySourceFormat {
    BlockwildWorldV2 = 0,
    BlockwildWorldExportV1 = 1,
}

impl LegacySourceFormat {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::BlockwildWorldV2 => "blockwild-world-v2",
            Self::BlockwildWorldExportV1 => "blockwild-world-export-v1",
        }
    }

    pub fn from_tag(tag: u8) -> Result<Self, PersistenceError> {
        match tag {
            0 => Ok(Self::BlockwildWorldV2),
            1 => Ok(Self::BlockwildWorldExportV1),
            _ => Err(PersistenceError::new("source-format", "unknown legacy source format")),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LegacyMigrationBundle {
    pub schema_version: u16,
    pub source_key: String,
    pub source_format: LegacySourceFormat,
    pub world_id: String,
    pub normalized_payload: Vec<u8>,
    pub source_hash: CanonicalHash,
    pub normalized_hash: CanonicalHash,
    pub migration_hash: CanonicalHash,
}

impl LegacyMigrationBundle {
    pub fn new(
        source_key: impl Into<String>,
        source_format: LegacySourceFormat,
        world_id: impl Into<String>,
        source_payload: &[u8],
        normalized_payload: &[u8],
    ) -> Result<Self, PersistenceError> {
        let source_key = source_key.into();
        let world_id = world_id.into();
        validate_label(&source_key, 256, "source_key")?;
        validate_label(&world_id, 180, "world_id")?;
        let source_hash = payload_hash(source_payload);
        let normalized_hash = payload_hash(normalized_payload);
        let mut hasher = CanonicalHasher::new("blockwild-persistence-migration-v1");
        hasher.write_u16(PERSISTENCE_SCHEMA_V1);
        hasher.write_str(&source_key);
        hasher.write_str(source_format.as_str());
        hasher.write_str(&world_id);
        hasher.write_str(&source_hash.to_hex());
        hasher.write_str(&normalized_hash.to_hex());
        Ok(Self {
            schema_version: PERSISTENCE_SCHEMA_V1,
            source_key,
            source_format,
            world_id,
            normalized_payload: normalized_payload.to_vec(),
            source_hash,
            normalized_hash,
            migration_hash: hasher.finish(),
        })
    }

    pub fn validate(&self) -> Result<(), PersistenceError> {
        if self.schema_version != PERSISTENCE_SCHEMA_V1 {
            return Err(PersistenceError::new("schema", "unsupported migration bundle schema"));
        }
        validate_label(&self.source_key, 256, "source_key")?;
        validate_label(&self.world_id, 180, "world_id")?;
        if payload_hash(&self.normalized_payload) != self.normalized_hash {
            return Err(PersistenceError::new(
                "corrupt",
                "normalized migration payload hash mismatch",
            ));
        }
        let mut hasher = CanonicalHasher::new("blockwild-persistence-migration-v1");
        hasher.write_u16(self.schema_version);
        hasher.write_str(&self.source_key);
        hasher.write_str(self.source_format.as_str());
        hasher.write_str(&self.world_id);
        hasher.write_str(&self.source_hash.to_hex());
        hasher.write_str(&self.normalized_hash.to_hex());
        if hasher.finish() != self.migration_hash {
            return Err(PersistenceError::new(
                "corrupt",
                "migration bundle fingerprint mismatch",
            ));
        }
        Ok(())
    }
}
