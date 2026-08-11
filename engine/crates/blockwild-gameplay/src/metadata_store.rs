use std::collections::{BTreeMap, BTreeSet};

use blockwild_types::{CanonicalHash, CanonicalHasher};

use crate::contract::validate_id;

pub const METADATA_STORE_SCHEMA_VERSION: u16 = 1;
pub const MAX_METADATA_BLOBS: usize = 131_072;
pub const MAX_METADATA_BLOB_BYTES: usize = 256 * 1024;
pub const MAX_METADATA_EXTENSION_BYTES: usize = 64 * 1024;
pub const MAX_METADATA_ALIASES: usize = 16;
pub const MAX_METADATA_STORE_BYTES: usize = 64 * 1024 * 1024;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MetadataStoreErrorCode {
    InvalidDescriptor,
    Capacity,
    HashMismatch,
    HashCollision,
    AliasConflict,
    RefCountOverflow,
    NotFound,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MetadataStoreError {
    pub code: MetadataStoreErrorCode,
    pub field: &'static str,
    pub hash: Option<CanonicalHash>,
    pub expected: Option<String>,
    pub actual: Option<String>,
}

impl MetadataStoreError {
    fn new(code: MetadataStoreErrorCode, field: &'static str) -> Self {
        Self {
            code,
            field,
            hash: None,
            expected: None,
            actual: None,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MetadataBlobInput {
    pub expected_hash: Option<CanonicalHash>,
    pub type_id: String,
    pub schema_id: String,
    pub schema_version: u16,
    pub content_version: u32,
    pub aliases: Vec<String>,
    pub bytes: Vec<u8>,
    /// Bytes introduced by a newer writer are opaque and must survive exact readback.
    pub unknown_extension_bytes: Vec<u8>,
    /// Reserved for a future cryptographic identity. It is preserved but not verified in V1.
    pub future_sha256: Option<[u8; 32]>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MetadataBlob {
    pub hash: CanonicalHash,
    pub type_id: String,
    pub schema_id: String,
    pub schema_version: u16,
    pub content_version: u32,
    pub aliases: Vec<String>,
    pub byte_length: u32,
    pub ref_count: u32,
    pub bytes: Vec<u8>,
    pub unknown_extension_bytes: Vec<u8>,
    pub future_sha256: Option<[u8; 32]>,
}

impl MetadataBlob {
    #[must_use]
    pub fn exact_bytes(&self) -> (&[u8], &[u8]) {
        (&self.bytes, &self.unknown_extension_bytes)
    }
}

#[derive(Clone, Debug, Default)]
pub struct MetadataBlobStore {
    blobs: BTreeMap<CanonicalHash, MetadataBlob>,
    aliases: BTreeMap<String, CanonicalHash>,
    total_bytes: usize,
}

impl MetadataBlobStore {
    #[must_use]
    pub fn len(&self) -> usize {
        self.blobs.len()
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.blobs.is_empty()
    }

    #[must_use]
    pub fn total_bytes(&self) -> usize {
        self.total_bytes
    }

    pub fn intern(&mut self, mut input: MetadataBlobInput) -> Result<CanonicalHash, MetadataStoreError> {
        normalize_and_validate(&mut input)?;
        let hash = canonical_metadata_hash(&input);
        if let Some(expected) = input.expected_hash
            && expected != hash
        {
            return Err(MetadataStoreError {
                code: MetadataStoreErrorCode::HashMismatch,
                field: "expected_hash",
                hash: Some(hash),
                expected: Some(expected.to_hex()),
                actual: Some(hash.to_hex()),
            });
        }

        if let Some(existing) = self.blobs.get_mut(&hash) {
            if !same_blob(existing, &input) {
                return Err(MetadataStoreError {
                    code: MetadataStoreErrorCode::HashCollision,
                    field: "hash",
                    hash: Some(hash),
                    expected: None,
                    actual: None,
                });
            }
            existing.ref_count = existing
                .ref_count
                .checked_add(1)
                .ok_or_else(|| MetadataStoreError::new(MetadataStoreErrorCode::RefCountOverflow, "ref_count"))?;
            return Ok(hash);
        }

        if self.blobs.len() >= MAX_METADATA_BLOBS {
            return Err(MetadataStoreError::new(MetadataStoreErrorCode::Capacity, "blob_count"));
        }
        let added_bytes = input.bytes.len() + input.unknown_extension_bytes.len();
        let next_total = self
            .total_bytes
            .checked_add(added_bytes)
            .ok_or_else(|| MetadataStoreError::new(MetadataStoreErrorCode::Capacity, "total_bytes"))?;
        if next_total > MAX_METADATA_STORE_BYTES {
            return Err(MetadataStoreError::new(MetadataStoreErrorCode::Capacity, "total_bytes"));
        }
        for alias in &input.aliases {
            if let Some(other) = self.aliases.get(alias) {
                return Err(MetadataStoreError {
                    code: MetadataStoreErrorCode::AliasConflict,
                    field: "alias",
                    hash: Some(*other),
                    expected: None,
                    actual: Some(alias.clone()),
                });
            }
        }

        for alias in &input.aliases {
            self.aliases.insert(alias.clone(), hash);
        }
        self.total_bytes = next_total;
        self.blobs.insert(
            hash,
            MetadataBlob {
                hash,
                type_id: input.type_id,
                schema_id: input.schema_id,
                schema_version: input.schema_version,
                content_version: input.content_version,
                aliases: input.aliases,
                byte_length: u32::try_from(added_bytes).expect("metadata limits fit u32"),
                ref_count: 1,
                bytes: input.bytes,
                unknown_extension_bytes: input.unknown_extension_bytes,
                future_sha256: input.future_sha256,
            },
        );
        Ok(hash)
    }

    #[must_use]
    pub fn get(&self, hash: CanonicalHash) -> Option<&MetadataBlob> {
        self.blobs.get(&hash)
    }

    #[must_use]
    pub fn get_by_alias(&self, alias: &str) -> Option<&MetadataBlob> {
        self.aliases.get(alias).and_then(|hash| self.blobs.get(hash))
    }

    pub fn release(&mut self, hash: CanonicalHash) -> Result<(), MetadataStoreError> {
        let Some(blob) = self.blobs.get_mut(&hash) else {
            return Err(MetadataStoreError {
                code: MetadataStoreErrorCode::NotFound,
                field: "hash",
                hash: Some(hash),
                expected: None,
                actual: None,
            });
        };
        if blob.ref_count > 1 {
            blob.ref_count -= 1;
            return Ok(());
        }
        let removed = self.blobs.remove(&hash).expect("blob was present");
        for alias in &removed.aliases {
            self.aliases.remove(alias);
        }
        self.total_bytes -= removed.byte_length as usize;
        Ok(())
    }
}

#[must_use]
pub fn canonical_metadata_hash(input: &MetadataBlobInput) -> CanonicalHash {
    let mut hasher = CanonicalHasher::new("blockwild.gameplay.metadata-blob.v1");
    hasher.write_u16(METADATA_STORE_SCHEMA_VERSION);
    hasher.write_str(&input.type_id);
    hasher.write_str(&input.schema_id);
    hasher.write_u16(input.schema_version);
    hasher.write_u32(input.content_version);
    hasher.write_u64(input.aliases.len() as u64);
    for alias in &input.aliases {
        hasher.write_str(alias);
    }
    hasher.write_bytes(&input.bytes);
    hasher.write_bytes(&input.unknown_extension_bytes);
    match input.future_sha256 {
        Some(digest) => {
            hasher.write_u16(1);
            hasher.write_bytes(&digest);
        }
        None => hasher.write_u16(0),
    }
    hasher.finish()
}

fn normalize_and_validate(input: &mut MetadataBlobInput) -> Result<(), MetadataStoreError> {
    if validate_id("metadata type", &input.type_id).is_err() {
        return Err(MetadataStoreError::new(
            MetadataStoreErrorCode::InvalidDescriptor,
            "type_id",
        ));
    }
    if validate_id("metadata schema", &input.schema_id).is_err() {
        return Err(MetadataStoreError::new(
            MetadataStoreErrorCode::InvalidDescriptor,
            "schema_id",
        ));
    }
    if input.schema_version == 0 {
        return Err(MetadataStoreError::new(
            MetadataStoreErrorCode::InvalidDescriptor,
            "schema_version",
        ));
    }
    if input.bytes.len() > MAX_METADATA_BLOB_BYTES {
        return Err(MetadataStoreError::new(MetadataStoreErrorCode::Capacity, "bytes"));
    }
    if input.unknown_extension_bytes.len() > MAX_METADATA_EXTENSION_BYTES {
        return Err(MetadataStoreError::new(
            MetadataStoreErrorCode::Capacity,
            "unknown_extension_bytes",
        ));
    }
    if input.aliases.len() > MAX_METADATA_ALIASES {
        return Err(MetadataStoreError::new(MetadataStoreErrorCode::Capacity, "aliases"));
    }
    let unique = input.aliases.iter().collect::<BTreeSet<_>>();
    if unique.len() != input.aliases.len()
        || input
            .aliases
            .iter()
            .any(|alias| validate_id("metadata alias", alias).is_err())
    {
        return Err(MetadataStoreError::new(
            MetadataStoreErrorCode::InvalidDescriptor,
            "aliases",
        ));
    }
    input.aliases.sort();
    Ok(())
}

fn same_blob(existing: &MetadataBlob, input: &MetadataBlobInput) -> bool {
    existing.type_id == input.type_id
        && existing.schema_id == input.schema_id
        && existing.schema_version == input.schema_version
        && existing.content_version == input.content_version
        && existing.aliases == input.aliases
        && existing.bytes == input.bytes
        && existing.unknown_extension_bytes == input.unknown_extension_bytes
        && existing.future_sha256 == input.future_sha256
}

#[cfg(test)]
mod tests {
    use super::*;

    fn specimen() -> MetadataBlobInput {
        MetadataBlobInput {
            expected_hash: None,
            type_id: "blockwild.item.instance".into(),
            schema_id: "item-instance".into(),
            schema_version: 3,
            content_version: 9,
            aliases: vec!["cage:Otter".into(), "item:603".into()],
            bytes: "{\"name\":\"Mizu 水\",\"durability\":17}".as_bytes().to_vec(),
            unknown_extension_bytes: vec![0, 0x80, 0xff, 7],
            future_sha256: None,
        }
    }

    #[test]
    fn exact_bytes_aliases_and_extensions_round_trip() {
        let mut store = MetadataBlobStore::default();
        let hash = store.intern(specimen()).expect("valid blob");
        let blob = store.get_by_alias("item:603").expect("alias lookup");
        assert_eq!(blob.hash, hash);
        assert_eq!(blob.exact_bytes().1, [0, 0x80, 0xff, 7]);
        assert!(
            std::str::from_utf8(blob.exact_bytes().0)
                .expect("utf8")
                .contains("Mizu")
        );
    }

    #[test]
    fn duplicate_is_refcounted_and_hash_drift_fails_closed() {
        let mut store = MetadataBlobStore::default();
        let hash = store.intern(specimen()).expect("first");
        let mut duplicate = specimen();
        duplicate.expected_hash = Some(hash);
        assert_eq!(store.intern(duplicate).expect("duplicate"), hash);
        assert_eq!(store.get(hash).expect("stored").ref_count, 2);

        let mut tampered = specimen();
        tampered.expected_hash = Some(hash);
        tampered.bytes.push(9);
        assert_eq!(
            store.intern(tampered).expect_err("must reject").code,
            MetadataStoreErrorCode::HashMismatch
        );
    }

    #[test]
    fn canonical_hash_cross_language_vector_is_stable() {
        let mut input = specimen();
        input.aliases.sort();
        assert_eq!(
            canonical_metadata_hash(&input).to_hex(),
            "4043e014523dbc4bc88411c1c1826182"
        );
    }
}
