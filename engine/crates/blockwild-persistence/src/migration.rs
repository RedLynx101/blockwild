use crate::{PERSISTENCE_SCHEMA_V1, PersistenceError, payload_hash, validate_label};
use blockwild_types::{CanonicalHash, CanonicalHasher};

pub const LEGACY_BACKUP_CHUNK_BYTES_V1: usize = 4 * 1024 * 1024;

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

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LegacyBackupChunkV1 {
    pub offset: u64,
    pub bytes: Vec<u8>,
    pub chunk_hash: CanonicalHash,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LegacyBackupPlanV1 {
    pub backup_id: String,
    pub source_key: String,
    pub source_hash: CanonicalHash,
    pub total_bytes: u64,
    pub chunks: Vec<LegacyBackupChunkV1>,
}

impl LegacyBackupPlanV1 {
    pub fn new(
        backup_id: impl Into<String>,
        source_key: impl Into<String>,
        source_payload: &[u8],
    ) -> Result<Self, PersistenceError> {
        if source_payload.is_empty() {
            return Err(PersistenceError::new(
                "legacy-backup",
                "legacy backup source cannot be empty",
            ));
        }
        let backup_id = backup_id.into();
        let source_key = source_key.into();
        validate_label(&backup_id, 180, "backup_id")?;
        validate_label(&source_key, 256, "source_key")?;
        let chunks = source_payload
            .chunks(LEGACY_BACKUP_CHUNK_BYTES_V1)
            .enumerate()
            .map(|(index, bytes)| LegacyBackupChunkV1 {
                offset: index.saturating_mul(LEGACY_BACKUP_CHUNK_BYTES_V1) as u64,
                bytes: bytes.to_vec(),
                chunk_hash: payload_hash(bytes),
            })
            .collect();
        let value = Self {
            backup_id,
            source_key,
            source_hash: payload_hash(source_payload),
            total_bytes: source_payload.len() as u64,
            chunks,
        };
        value.verify()?;
        Ok(value)
    }

    pub fn verify(&self) -> Result<(), PersistenceError> {
        validate_label(&self.backup_id, 180, "backup_id")?;
        validate_label(&self.source_key, 256, "source_key")?;
        let mut expected_offset = 0_u64;
        for (index, chunk) in self.chunks.iter().enumerate() {
            if chunk.bytes.is_empty()
                || chunk.bytes.len() > LEGACY_BACKUP_CHUNK_BYTES_V1
                || chunk.offset != expected_offset
                || chunk.chunk_hash != payload_hash(&chunk.bytes)
            {
                return Err(PersistenceError::new(
                    "legacy-backup",
                    "legacy backup chunks are corrupt or non-contiguous",
                ));
            }
            if index + 1 != self.chunks.len() && chunk.bytes.len() != LEGACY_BACKUP_CHUNK_BYTES_V1 {
                return Err(PersistenceError::new(
                    "legacy-backup",
                    "non-final legacy backup chunk is not canonical size",
                ));
            }
            expected_offset = expected_offset.saturating_add(chunk.bytes.len() as u64);
        }
        if expected_offset != self.total_bytes || self.chunks.is_empty() {
            return Err(PersistenceError::new(
                "legacy-backup",
                "legacy backup byte total is incomplete",
            ));
        }
        let mut joined = Vec::with_capacity(self.total_bytes as usize);
        for chunk in &self.chunks {
            joined.extend_from_slice(&chunk.bytes);
        }
        if payload_hash(&joined) != self.source_hash {
            return Err(PersistenceError::new(
                "legacy-backup",
                "legacy backup source hash mismatch",
            ));
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LegacyMigrationProgressV1 {
    pub bundle: LegacyMigrationBundle,
    pub backup: LegacyBackupPlanV1,
    accepted_backup_chunks: Vec<bool>,
    pub checkpoint_committed: bool,
    pub semantic_readback_verified: bool,
}

impl LegacyMigrationProgressV1 {
    pub fn new(bundle: LegacyMigrationBundle, backup: LegacyBackupPlanV1) -> Result<Self, PersistenceError> {
        bundle.validate()?;
        backup.verify()?;
        if bundle.source_key != backup.source_key || bundle.source_hash != backup.source_hash {
            return Err(PersistenceError::new(
                "migration-backup",
                "migration fingerprint and raw legacy backup disagree",
            ));
        }
        Ok(Self {
            accepted_backup_chunks: vec![false; backup.chunks.len()],
            bundle,
            backup,
            checkpoint_committed: false,
            semantic_readback_verified: false,
        })
    }

    pub fn accept_backup_chunk(&mut self, offset: u64, durable_hash: CanonicalHash) -> Result<(), PersistenceError> {
        if durable_hash == CanonicalHash::default() {
            return Err(PersistenceError::new(
                "migration-backup",
                "legacy backup chunk lacks a durable receipt",
            ));
        }
        let index = self
            .backup
            .chunks
            .iter()
            .position(|chunk| chunk.offset == offset)
            .ok_or_else(|| PersistenceError::new("migration-backup", "legacy backup receipt offset is unknown"))?;
        self.accepted_backup_chunks[index] = true;
        Ok(())
    }

    pub fn accept_checkpoint(
        &mut self,
        checkpoint_hash: CanonicalHash,
        expected_hash: CanonicalHash,
    ) -> Result<(), PersistenceError> {
        if checkpoint_hash == CanonicalHash::default() || checkpoint_hash != expected_hash {
            return Err(PersistenceError::new(
                "migration-checkpoint",
                "migration checkpoint receipt is invalid",
            ));
        }
        self.checkpoint_committed = true;
        Ok(())
    }

    pub fn accept_semantic_readback(&mut self, normalized_hash: CanonicalHash) -> Result<(), PersistenceError> {
        if normalized_hash != self.bundle.normalized_hash {
            return Err(PersistenceError::new(
                "migration-readback",
                "migration semantic readback hash mismatch",
            ));
        }
        self.semantic_readback_verified = true;
        Ok(())
    }

    #[must_use]
    pub fn complete(&self) -> bool {
        self.checkpoint_committed
            && self.semantic_readback_verified
            && self.accepted_backup_chunks.iter().all(|accepted| *accepted)
    }
}

#[cfg(test)]
mod backup_tests {
    use super::*;

    #[test]
    fn migration_never_completes_without_raw_backup_checkpoint_and_readback() {
        let source = vec![1, 2, 3];
        let normalized = vec![4, 5, 6];
        let bundle = LegacyMigrationBundle::new(
            "legacy",
            LegacySourceFormat::BlockwildWorldV2,
            "world",
            &source,
            &normalized,
        )
        .unwrap();
        let backup = LegacyBackupPlanV1::new("backup", "legacy", &source).unwrap();
        let mut progress = LegacyMigrationProgressV1::new(bundle.clone(), backup).unwrap();
        assert!(!progress.complete());
        progress
            .accept_checkpoint(CanonicalHash([9; 16]), CanonicalHash([9; 16]))
            .unwrap();
        progress.accept_semantic_readback(bundle.normalized_hash).unwrap();
        assert!(!progress.complete());
        progress.accept_backup_chunk(0, CanonicalHash([8; 16])).unwrap();
        assert!(progress.complete());
    }
}
