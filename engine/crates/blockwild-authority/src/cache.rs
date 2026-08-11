use blockwild_types::CanonicalHasher;

use crate::canonical::{hash_canonical_json, json_string};
use crate::{
    AuthorityError, AuthorityResult, JS_MAX_SAFE_INTEGER_V1, WORLD_AUTHORITY_SCHEMA_V1, WORLD_CODEC_MAX_BYTES_V1,
    WorldAuthorityIdentityV1, WorldChunkAddressV1, WorldSectionRevisionV1, validate_hash,
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorldChunkCacheIdentityV1 {
    pub address: WorldChunkAddressV1,
    pub generator_version: u32,
    pub generator_hash: String,
    pub content_hash: String,
    pub options_hash: String,
    pub edit_halo_hash: String,
}

impl WorldChunkCacheIdentityV1 {
    pub fn validate(&self) -> AuthorityResult<()> {
        self.address.world.validate()?;
        validate_hash(&self.generator_hash, "generatorHash")?;
        validate_hash(&self.content_hash, "contentHash")?;
        validate_hash(&self.options_hash, "optionsHash")?;
        validate_hash(&self.edit_halo_hash, "editHaloHash")
    }

    pub fn key(&self) -> AuthorityResult<String> {
        self.validate()?;
        let canonical = format!(
            "{{\"address\":{{\"chunkX\":{},\"chunkZ\":{},\"locationId\":{},\"universeId\":{}}},\"contentHash\":{},\"editHaloHash\":{},\"generatorHash\":{},\"generatorVersion\":{},\"optionsHash\":{}}}",
            self.address.chunk_x,
            self.address.chunk_z,
            json_string(&self.address.world.location_id),
            json_string(&self.address.world.universe_id),
            json_string(&self.content_hash),
            json_string(&self.edit_halo_hash),
            json_string(&self.generator_hash),
            self.generator_version,
            json_string(&self.options_hash)
        );
        let digest = hash_canonical_json("blockwild-world-cache-key-v1", &canonical);
        Ok(format!(
            "world-cache-v1|{}|g{}|{}",
            self.address.key(),
            self.generator_version,
            digest
        ))
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorldChunkCacheEnvelopeV1 {
    pub schema_version: u16,
    pub identity: WorldChunkCacheIdentityV1,
    pub key: String,
    pub revision: u64,
    pub checksum: String,
    pub payload: Vec<u8>,
}

impl WorldChunkCacheEnvelopeV1 {
    pub fn create(identity: WorldChunkCacheIdentityV1, revision: u64, payload: Vec<u8>) -> AuthorityResult<Self> {
        if revision > JS_MAX_SAFE_INTEGER_V1 {
            return Err(AuthorityError::new(
                "cache-revision",
                "cache revision exceeds JS safe integer range",
            ));
        }
        if payload.len() > WORLD_CODEC_MAX_BYTES_V1 {
            return Err(AuthorityError::new(
                "cache-size",
                "cache payload exceeds bounded maximum",
            ));
        }
        let key = identity.key()?;
        let mut hasher = CanonicalHasher::new("blockwild-world-cache-envelope-v1");
        hasher.write_str(&key);
        hasher.write_u64(revision);
        hasher.write_bytes(&payload);
        Ok(Self {
            schema_version: WORLD_AUTHORITY_SCHEMA_V1,
            identity,
            key,
            revision,
            checksum: hasher.finish().to_hex(),
            payload,
        })
    }

    pub fn validate(&self) -> AuthorityResult<()> {
        if self.schema_version != WORLD_AUTHORITY_SCHEMA_V1 {
            return Err(AuthorityError::new(
                "schema-mismatch",
                "world cache schema is incompatible",
            ));
        }
        let rebuilt = Self::create(self.identity.clone(), self.revision, self.payload.clone())?;
        if rebuilt.key != self.key {
            return Err(AuthorityError::new("cache-key", "cache identity does not match key"));
        }
        if rebuilt.checksum != self.checksum {
            return Err(AuthorityError::new("cache-checksum", "cache payload checksum mismatch"));
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CacheInstallBindingV1 {
    pub authority: WorldAuthorityIdentityV1,
    pub section_revision: WorldSectionRevisionV1,
    pub cache_key: String,
    pub cache_revision: u64,
}

impl CacheInstallBindingV1 {
    #[must_use]
    pub fn is_current(
        &self,
        current_authority: &WorldAuthorityIdentityV1,
        current_section: WorldSectionRevisionV1,
        envelope: &WorldChunkCacheEnvelopeV1,
    ) -> bool {
        self.authority == *current_authority
            && self.section_revision == current_section
            && self.cache_key == envelope.key
            && self.cache_revision == envelope.revision
            && envelope.validate().is_ok()
    }
}
