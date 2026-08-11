use crate::{
    Checkpoint, LegacyMigrationBundle, LegacySourceFormat, Mutation, MutationInput, PERSISTENCE_SCHEMA_V1,
    PersistenceError, RecordAddress, RecordDescriptor, RecordKind, Transaction,
};
use blockwild_types::{CanonicalHash, CanonicalHasher};

const MAGIC: [u8; 4] = *b"BWPS";
const HEADER_BYTES: usize = 4 + 2 + 2 + 4 + 16;
const KIND_TRANSACTION: u16 = 1;
const KIND_CHECKPOINT: u16 = 2;
const KIND_MIGRATION: u16 = 3;
const MAX_WIRE_BYTES: usize = 128 * 1024 * 1024;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PersistenceWireRecord {
    Transaction(Transaction),
    Checkpoint(Checkpoint),
    Migration(LegacyMigrationBundle),
}

#[must_use]
pub fn encode_transaction(transaction: &Transaction) -> Vec<u8> {
    let mut payload = Writer::default();
    payload.string(&transaction.transaction_id);
    payload.string(&transaction.world_id);
    payload.string(&transaction.checkpoint_id);
    payload.u64(transaction.expected_journal_sequence);
    payload.u64(transaction.next_journal_sequence);
    payload.u32(transaction.mutations.len() as u32);
    for mutation in &transaction.mutations {
        match mutation {
            Mutation::Put {
                address,
                expected_record_revision,
                next_record_revision,
                payload: bytes,
                ..
            } => {
                payload.u8(1);
                payload.address(address);
                payload.u8(u8::from(expected_record_revision.is_some()));
                if let Some(expected) = expected_record_revision {
                    payload.u64(*expected);
                }
                payload.u64(*next_record_revision);
                payload.bytes(bytes);
            }
            Mutation::Delete {
                address,
                expected_record_revision,
                next_record_revision,
            } => {
                payload.u8(2);
                payload.address(address);
                payload.u64(*expected_record_revision);
                payload.u64(*next_record_revision);
            }
        }
    }
    payload.hash(transaction.transaction_hash);
    wrap(KIND_TRANSACTION, payload.finish())
}

#[must_use]
pub fn encode_checkpoint(checkpoint: &Checkpoint) -> Vec<u8> {
    let mut payload = Writer::default();
    payload.string(&checkpoint.checkpoint_id);
    payload.u8(u8::from(checkpoint.parent_checkpoint_id.is_some()));
    if let Some(parent) = &checkpoint.parent_checkpoint_id {
        payload.string(parent);
    }
    payload.string(&checkpoint.world_id);
    payload.u64(checkpoint.journal_sequence);
    payload.hash(checkpoint.generator_hash);
    payload.hash(checkpoint.content_hash);
    payload.u64(checkpoint.created_at);
    payload.u32(checkpoint.records.len() as u32);
    for record in &checkpoint.records {
        payload.address(&record.address);
        payload.u64(record.revision);
        payload.u32(record.byte_length);
        payload.hash(record.payload_hash);
    }
    payload.hash(checkpoint.checkpoint_hash);
    wrap(KIND_CHECKPOINT, payload.finish())
}

#[must_use]
pub fn encode_migration(bundle: &LegacyMigrationBundle) -> Vec<u8> {
    let mut payload = Writer::default();
    payload.string(&bundle.source_key);
    payload.u8(bundle.source_format as u8);
    payload.string(&bundle.world_id);
    payload.bytes(&bundle.normalized_payload);
    payload.hash(bundle.source_hash);
    payload.hash(bundle.normalized_hash);
    payload.hash(bundle.migration_hash);
    wrap(KIND_MIGRATION, payload.finish())
}

pub fn decode_record(bytes: &[u8]) -> Result<PersistenceWireRecord, PersistenceError> {
    if bytes.len() < HEADER_BYTES || bytes.len() > MAX_WIRE_BYTES {
        return Err(PersistenceError::new(
            "wire-size",
            "persistence wire record is outside its V1 bounds",
        ));
    }
    if bytes[..4] != MAGIC {
        return Err(PersistenceError::new("wire-magic", "persistence wire magic mismatch"));
    }
    let schema = u16::from_le_bytes(bytes[4..6].try_into().expect("fixed slice"));
    if schema != PERSISTENCE_SCHEMA_V1 {
        return Err(PersistenceError::new("schema", "unsupported persistence wire schema"));
    }
    let kind = u16::from_le_bytes(bytes[6..8].try_into().expect("fixed slice"));
    let length = u32::from_le_bytes(bytes[8..12].try_into().expect("fixed slice")) as usize;
    if length != bytes.len() - HEADER_BYTES {
        return Err(PersistenceError::new(
            "wire-length",
            "persistence wire payload length mismatch",
        ));
    }
    let expected_hash = CanonicalHash(bytes[12..28].try_into().expect("fixed slice"));
    let payload = &bytes[HEADER_BYTES..];
    if wire_hash(payload) != expected_hash {
        return Err(PersistenceError::new(
            "wire-checksum",
            "persistence wire checksum mismatch",
        ));
    }
    let mut reader = Reader::new(payload);
    let record = match kind {
        KIND_TRANSACTION => PersistenceWireRecord::Transaction(decode_transaction_payload(&mut reader)?),
        KIND_CHECKPOINT => PersistenceWireRecord::Checkpoint(decode_checkpoint_payload(&mut reader)?),
        KIND_MIGRATION => PersistenceWireRecord::Migration(decode_migration_payload(&mut reader)?),
        _ => {
            return Err(PersistenceError::new(
                "wire-kind",
                "unknown persistence wire record kind",
            ));
        }
    };
    reader.finish()?;
    Ok(record)
}

fn decode_transaction_payload(reader: &mut Reader<'_>) -> Result<Transaction, PersistenceError> {
    let transaction_id = reader.string()?;
    let world_id = reader.string()?;
    let checkpoint_id = reader.string()?;
    let expected = reader.u64()?;
    let next = reader.u64()?;
    let count = reader.u32()? as usize;
    if count == 0 || count > crate::MAX_MUTATIONS_V1 {
        return Err(PersistenceError::new(
            "mutation-count",
            "wire transaction mutation count is invalid",
        ));
    }
    let mut mutations = Vec::with_capacity(count);
    for _ in 0..count {
        let tag = reader.u8()?;
        let address = reader.address()?;
        match tag {
            1 => {
                let expected_record_revision = if reader.u8()? == 0 { None } else { Some(reader.u64()?) };
                let next_record_revision = reader.u64()?;
                let payload = reader.bytes(crate::MAX_RECORD_BYTES_V1)?;
                mutations.push(MutationInput::Put {
                    address,
                    expected_record_revision,
                    next_record_revision,
                    payload,
                });
            }
            2 => mutations.push(MutationInput::Delete {
                address,
                expected_record_revision: reader.u64()?,
                next_record_revision: reader.u64()?,
            }),
            _ => return Err(PersistenceError::new("wire-mutation", "unknown journal mutation tag")),
        }
    }
    let expected_hash = reader.hash()?;
    let transaction = Transaction::new(transaction_id, world_id, checkpoint_id, expected, next, mutations)?;
    if transaction.transaction_hash != expected_hash {
        return Err(PersistenceError::new(
            "corrupt",
            "wire transaction canonical hash mismatch",
        ));
    }
    Ok(transaction)
}

fn decode_checkpoint_payload(reader: &mut Reader<'_>) -> Result<Checkpoint, PersistenceError> {
    let checkpoint_id = reader.string()?;
    let parent_checkpoint_id = if reader.u8()? == 0 {
        None
    } else {
        Some(reader.string()?)
    };
    let world_id = reader.string()?;
    let journal_sequence = reader.u64()?;
    let generator_hash = reader.hash()?;
    let content_hash = reader.hash()?;
    let created_at = reader.u64()?;
    let count = reader.u32()? as usize;
    if count > crate::MAX_RECORDS_PER_CHECKPOINT_V1 {
        return Err(PersistenceError::new(
            "checkpoint-size",
            "wire checkpoint record count is invalid",
        ));
    }
    let mut records = Vec::with_capacity(count);
    for _ in 0..count {
        records.push(RecordDescriptor {
            address: reader.address()?,
            revision: reader.u64()?,
            byte_length: reader.u32()?,
            payload_hash: reader.hash()?,
        });
    }
    let expected_hash = reader.hash()?;
    let checkpoint = Checkpoint::new(
        checkpoint_id,
        parent_checkpoint_id,
        world_id,
        journal_sequence,
        generator_hash,
        content_hash,
        created_at,
        records,
    )?;
    if checkpoint.checkpoint_hash != expected_hash {
        return Err(PersistenceError::new(
            "corrupt",
            "wire checkpoint canonical hash mismatch",
        ));
    }
    Ok(checkpoint)
}

fn decode_migration_payload(reader: &mut Reader<'_>) -> Result<LegacyMigrationBundle, PersistenceError> {
    let bundle = LegacyMigrationBundle {
        schema_version: PERSISTENCE_SCHEMA_V1,
        source_key: reader.string()?,
        source_format: LegacySourceFormat::from_tag(reader.u8()?)?,
        world_id: reader.string()?,
        normalized_payload: reader.bytes(crate::MAX_TRANSACTION_BYTES_V1)?,
        source_hash: reader.hash()?,
        normalized_hash: reader.hash()?,
        migration_hash: reader.hash()?,
    };
    bundle.validate()?;
    Ok(bundle)
}

fn wrap(kind: u16, payload: Vec<u8>) -> Vec<u8> {
    let mut output = Vec::with_capacity(HEADER_BYTES + payload.len());
    output.extend_from_slice(&MAGIC);
    output.extend_from_slice(&PERSISTENCE_SCHEMA_V1.to_le_bytes());
    output.extend_from_slice(&kind.to_le_bytes());
    output.extend_from_slice(&(payload.len() as u32).to_le_bytes());
    output.extend_from_slice(wire_hash(&payload).as_bytes());
    output.extend_from_slice(&payload);
    output
}

fn wire_hash(payload: &[u8]) -> CanonicalHash {
    let mut hasher = CanonicalHasher::new("blockwild-persistence-wire-v1");
    hasher.write_bytes(payload);
    hasher.finish()
}

#[derive(Default)]
struct Writer {
    bytes: Vec<u8>,
}

impl Writer {
    fn u8(&mut self, value: u8) {
        self.bytes.push(value);
    }
    fn u32(&mut self, value: u32) {
        self.bytes.extend_from_slice(&value.to_le_bytes());
    }
    fn u64(&mut self, value: u64) {
        self.bytes.extend_from_slice(&value.to_le_bytes());
    }
    fn string(&mut self, value: &str) {
        self.bytes(value.as_bytes());
    }
    fn bytes(&mut self, value: &[u8]) {
        self.u32(value.len() as u32);
        self.bytes.extend_from_slice(value);
    }
    fn hash(&mut self, value: CanonicalHash) {
        self.bytes.extend_from_slice(value.as_bytes());
    }
    fn address(&mut self, value: &RecordAddress) {
        self.string(&value.universe_id);
        self.string(&value.location_id);
        self.u8(value.kind as u8);
        self.string(&value.record_id);
    }
    fn finish(self) -> Vec<u8> {
        self.bytes
    }
}

struct Reader<'a> {
    bytes: &'a [u8],
    offset: usize,
}

impl<'a> Reader<'a> {
    const fn new(bytes: &'a [u8]) -> Self {
        Self { bytes, offset: 0 }
    }
    fn take(&mut self, length: usize) -> Result<&'a [u8], PersistenceError> {
        let end = self
            .offset
            .checked_add(length)
            .ok_or_else(|| PersistenceError::new("wire-overflow", "wire offset overflow"))?;
        let value = self
            .bytes
            .get(self.offset..end)
            .ok_or_else(|| PersistenceError::new("wire-truncated", "persistence wire payload is truncated"))?;
        self.offset = end;
        Ok(value)
    }
    fn u8(&mut self) -> Result<u8, PersistenceError> {
        Ok(self.take(1)?[0])
    }
    fn u32(&mut self) -> Result<u32, PersistenceError> {
        Ok(u32::from_le_bytes(self.take(4)?.try_into().expect("fixed slice")))
    }
    fn u64(&mut self) -> Result<u64, PersistenceError> {
        Ok(u64::from_le_bytes(self.take(8)?.try_into().expect("fixed slice")))
    }
    fn bytes(&mut self, maximum: usize) -> Result<Vec<u8>, PersistenceError> {
        let length = self.u32()? as usize;
        if length > maximum {
            return Err(PersistenceError::new(
                "wire-size",
                "length-prefixed field exceeds its budget",
            ));
        }
        Ok(self.take(length)?.to_vec())
    }
    fn string(&mut self) -> Result<String, PersistenceError> {
        String::from_utf8(self.bytes(4096)?)
            .map_err(|_| PersistenceError::new("wire-utf8", "wire string is not valid UTF-8"))
    }
    fn hash(&mut self) -> Result<CanonicalHash, PersistenceError> {
        Ok(CanonicalHash(self.take(16)?.try_into().expect("fixed slice")))
    }
    fn address(&mut self) -> Result<RecordAddress, PersistenceError> {
        RecordAddress::new(
            self.string()?,
            self.string()?,
            RecordKind::from_tag(self.u8()?)?,
            self.string()?,
        )
    }
    fn finish(&self) -> Result<(), PersistenceError> {
        if self.offset != self.bytes.len() {
            return Err(PersistenceError::new(
                "wire-trailing",
                "persistence wire record contains trailing bytes",
            ));
        }
        Ok(())
    }
}
