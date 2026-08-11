use std::collections::{BTreeMap, BTreeSet};

use blockwild_types::{CanonicalHash, CanonicalHasher};

use crate::{MetadataBlobInput, MetadataBlobStore, MetadataStoreErrorCode, canonical_metadata_hash};

pub const CONTENT_MANIFEST_SCHEMA_VERSION: u16 = 1;
pub const MAX_CONTENT_ENTRIES: usize = 32_768;
pub const MAX_CONTENT_DOMAINS: usize = 32;

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum ContentDomain {
    Item,
    CraftingRecipe,
    MachineRecipe,
    MachineProfile,
    AbilitySpell,
    CreatureProfile,
    CreatureTypeChart,
    QuestGuild,
    Economy,
    CardforgeCard,
    CardforgePack,
}

pub const ALL_CONTENT_DOMAINS: [ContentDomain; 11] = [
    ContentDomain::Item,
    ContentDomain::CraftingRecipe,
    ContentDomain::MachineRecipe,
    ContentDomain::MachineProfile,
    ContentDomain::AbilitySpell,
    ContentDomain::CreatureProfile,
    ContentDomain::CreatureTypeChart,
    ContentDomain::QuestGuild,
    ContentDomain::Economy,
    ContentDomain::CardforgeCard,
    ContentDomain::CardforgePack,
];

impl ContentDomain {
    #[must_use]
    pub const fn as_id(self) -> &'static str {
        match self {
            Self::Item => "item",
            Self::CraftingRecipe => "crafting-recipe",
            Self::MachineRecipe => "machine-recipe",
            Self::MachineProfile => "machine-profile",
            Self::AbilitySpell => "ability-spell",
            Self::CreatureProfile => "creature-profile",
            Self::CreatureTypeChart => "creature-type-chart",
            Self::QuestGuild => "quest-guild",
            Self::Economy => "economy",
            Self::CardforgeCard => "cardforge-card",
            Self::CardforgePack => "cardforge-pack",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContentArtifact {
    pub domain: ContentDomain,
    pub id: String,
    pub schema_id: String,
    pub schema_version: u16,
    pub content_version: u32,
    pub aliases: Vec<String>,
    pub canonical_bytes: Vec<u8>,
    pub unknown_extension_bytes: Vec<u8>,
}

impl ContentArtifact {
    fn metadata_input(&self) -> MetadataBlobInput {
        MetadataBlobInput {
            expected_hash: None,
            type_id: format!("blockwild.content.{}", self.domain.as_id()),
            schema_id: self.schema_id.clone(),
            schema_version: self.schema_version,
            content_version: self.content_version,
            aliases: self.aliases.clone(),
            bytes: self.canonical_bytes.clone(),
            unknown_extension_bytes: self.unknown_extension_bytes.clone(),
            future_sha256: None,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContentManifestEntry {
    pub domain: ContentDomain,
    pub id: String,
    pub blob_hash: CanonicalHash,
    pub byte_length: u32,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ContentDomainDigest {
    pub count: u32,
    pub hash: CanonicalHash,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProductionContentManifest {
    pub schema_version: u16,
    pub source_revision: String,
    pub domains: BTreeMap<ContentDomain, ContentDomainDigest>,
    pub entries: Vec<ContentManifestEntry>,
    pub manifest_hash: CanonicalHash,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProductionContentBundle {
    pub manifest: ProductionContentManifest,
    pub artifacts: Vec<ContentArtifact>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ContentBlockerCode {
    InvalidId,
    UnsupportedSchema,
    Capacity,
    DuplicateId,
    AliasConflict,
    MetadataRejected,
    MissingArtifact,
    UnexpectedArtifact,
    CountDrift,
    HashDrift,
    ManifestHashDrift,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContentBlocker {
    pub code: ContentBlockerCode,
    pub domain: Option<ContentDomain>,
    pub id: Option<String>,
    pub expected: Option<String>,
    pub actual: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContentInstallReport {
    pub manifest_hash: CanonicalHash,
    pub installed_entries: u32,
    pub installed_bytes: u64,
}

pub fn compile_content_bundle(
    source_revision: impl Into<String>,
    mut artifacts: Vec<ContentArtifact>,
) -> Result<ProductionContentBundle, Vec<ContentBlocker>> {
    let source_revision = source_revision.into();
    let mut blockers = validate_artifacts(&source_revision, &artifacts);
    if !blockers.is_empty() {
        return Err(blockers);
    }
    artifacts.sort_by(|left, right| (left.domain, &left.id).cmp(&(right.domain, &right.id)));
    let entries = artifacts
        .iter()
        .map(|artifact| {
            let input = artifact.metadata_input();
            ContentManifestEntry {
                domain: artifact.domain,
                id: artifact.id.clone(),
                blob_hash: canonical_metadata_hash(&input),
                byte_length: u32::try_from(artifact.canonical_bytes.len() + artifact.unknown_extension_bytes.len())
                    .expect("metadata bounds fit u32"),
            }
        })
        .collect::<Vec<_>>();
    let domains = compile_domains(&entries);
    if domains.len() > MAX_CONTENT_DOMAINS {
        blockers.push(ContentBlocker {
            code: ContentBlockerCode::Capacity,
            domain: None,
            id: None,
            expected: Some(MAX_CONTENT_DOMAINS.to_string()),
            actual: Some(domains.len().to_string()),
        });
        return Err(blockers);
    }
    let manifest_hash = canonical_manifest_hash(&source_revision, &domains);
    Ok(ProductionContentBundle {
        manifest: ProductionContentManifest {
            schema_version: CONTENT_MANIFEST_SCHEMA_VERSION,
            source_revision,
            domains,
            entries,
            manifest_hash,
        },
        artifacts,
    })
}

pub fn validate_content_bundle(bundle: &ProductionContentBundle) -> Vec<ContentBlocker> {
    let Ok(compiled) = compile_content_bundle(bundle.manifest.source_revision.clone(), bundle.artifacts.clone()) else {
        return compile_content_bundle(bundle.manifest.source_revision.clone(), bundle.artifacts.clone())
            .expect_err("same invalid input remains invalid");
    };
    let mut blockers = Vec::new();
    if bundle.manifest.schema_version != CONTENT_MANIFEST_SCHEMA_VERSION {
        blockers.push(ContentBlocker {
            code: ContentBlockerCode::UnsupportedSchema,
            domain: None,
            id: None,
            expected: Some(CONTENT_MANIFEST_SCHEMA_VERSION.to_string()),
            actual: Some(bundle.manifest.schema_version.to_string()),
        });
    }
    let mut declared_entries = BTreeMap::new();
    for entry in &bundle.manifest.entries {
        if declared_entries
            .insert((entry.domain, entry.id.as_str()), entry)
            .is_some()
        {
            blockers.push(blocker(
                ContentBlockerCode::DuplicateId,
                Some(entry.domain),
                Some(entry.id.clone()),
            ));
        }
    }
    let compiled_entries = compiled
        .manifest
        .entries
        .iter()
        .map(|entry| ((entry.domain, entry.id.as_str()), entry))
        .collect::<BTreeMap<_, _>>();
    let declared_ids = bundle
        .manifest
        .entries
        .iter()
        .map(|entry| (entry.domain, entry.id.as_str()))
        .collect::<BTreeSet<_>>();
    let compiled_ids = compiled
        .manifest
        .entries
        .iter()
        .map(|entry| (entry.domain, entry.id.as_str()))
        .collect::<BTreeSet<_>>();
    for (domain, id) in compiled_ids.difference(&declared_ids) {
        blockers.push(blocker(
            ContentBlockerCode::MissingArtifact,
            Some(*domain),
            Some((*id).to_owned()),
        ));
    }
    for (domain, id) in declared_ids.difference(&compiled_ids) {
        blockers.push(blocker(
            ContentBlockerCode::UnexpectedArtifact,
            Some(*domain),
            Some((*id).to_owned()),
        ));
    }
    for (key, actual) in &compiled_entries {
        let Some(expected) = declared_entries.get(key) else {
            continue;
        };
        if expected.blob_hash != actual.blob_hash || expected.byte_length != actual.byte_length {
            blockers.push(ContentBlocker {
                code: ContentBlockerCode::HashDrift,
                domain: Some(actual.domain),
                id: Some(actual.id.clone()),
                expected: Some(format!("{}:{}", expected.blob_hash.to_hex(), expected.byte_length)),
                actual: Some(format!("{}:{}", actual.blob_hash.to_hex(), actual.byte_length)),
            });
        }
    }
    for (domain, actual) in &compiled.manifest.domains {
        match bundle.manifest.domains.get(domain) {
            Some(expected) if expected.count != actual.count => blockers.push(ContentBlocker {
                code: ContentBlockerCode::CountDrift,
                domain: Some(*domain),
                id: None,
                expected: Some(expected.count.to_string()),
                actual: Some(actual.count.to_string()),
            }),
            Some(expected) if expected.hash != actual.hash => blockers.push(ContentBlocker {
                code: ContentBlockerCode::HashDrift,
                domain: Some(*domain),
                id: None,
                expected: Some(expected.hash.to_hex()),
                actual: Some(actual.hash.to_hex()),
            }),
            None => blockers.push(blocker(ContentBlockerCode::MissingArtifact, Some(*domain), None)),
            _ => {}
        }
    }
    let declared_manifest_hash = canonical_manifest_hash(&bundle.manifest.source_revision, &bundle.manifest.domains);
    if bundle.manifest.manifest_hash != declared_manifest_hash {
        blockers.push(ContentBlocker {
            code: ContentBlockerCode::ManifestHashDrift,
            domain: None,
            id: None,
            expected: Some(bundle.manifest.manifest_hash.to_hex()),
            actual: Some(declared_manifest_hash.to_hex()),
        });
    }
    if bundle.manifest.manifest_hash != compiled.manifest.manifest_hash
        && declared_manifest_hash == bundle.manifest.manifest_hash
    {
        blockers.push(ContentBlocker {
            code: ContentBlockerCode::ManifestHashDrift,
            domain: None,
            id: None,
            expected: Some(bundle.manifest.manifest_hash.to_hex()),
            actual: Some(compiled.manifest.manifest_hash.to_hex()),
        });
    }
    blockers
}

pub fn install_content_bundle(
    bundle: &ProductionContentBundle,
    store: &mut MetadataBlobStore,
) -> Result<ContentInstallReport, Vec<ContentBlocker>> {
    let blockers = validate_content_bundle(bundle);
    if !blockers.is_empty() {
        return Err(blockers);
    }
    let mut staged_store = store.clone();
    let mut installed_bytes = 0_u64;
    for artifact in &bundle.artifacts {
        let mut input = artifact.metadata_input();
        input.expected_hash = Some(canonical_metadata_hash(&input));
        installed_bytes +=
            u64::try_from(input.bytes.len() + input.unknown_extension_bytes.len()).expect("metadata bounds fit u64");
        if let Err(error) = staged_store.intern(input) {
            let code = match error.code {
                MetadataStoreErrorCode::Capacity => ContentBlockerCode::Capacity,
                _ => ContentBlockerCode::MetadataRejected,
            };
            return Err(vec![ContentBlocker {
                code,
                domain: Some(artifact.domain),
                id: Some(artifact.id.clone()),
                expected: error.expected,
                actual: error.actual,
            }]);
        }
    }
    *store = staged_store;
    Ok(ContentInstallReport {
        manifest_hash: bundle.manifest.manifest_hash,
        installed_entries: u32::try_from(bundle.artifacts.len()).expect("content bound fits u32"),
        installed_bytes,
    })
}

fn validate_artifacts(source_revision: &str, artifacts: &[ContentArtifact]) -> Vec<ContentBlocker> {
    let mut blockers = Vec::new();
    if source_revision.is_empty() || source_revision.len() > 160 || source_revision.chars().any(char::is_control) {
        blockers.push(blocker(
            ContentBlockerCode::InvalidId,
            None,
            Some(source_revision.to_owned()),
        ));
    }
    if artifacts.len() > MAX_CONTENT_ENTRIES {
        blockers.push(ContentBlocker {
            code: ContentBlockerCode::Capacity,
            domain: None,
            id: None,
            expected: Some(MAX_CONTENT_ENTRIES.to_string()),
            actual: Some(artifacts.len().to_string()),
        });
    }
    let mut ids = BTreeSet::new();
    let mut aliases = BTreeSet::new();
    for artifact in artifacts {
        if artifact.id.is_empty() || artifact.id.len() > 160 || artifact.id.chars().any(char::is_control) {
            blockers.push(blocker(
                ContentBlockerCode::InvalidId,
                Some(artifact.domain),
                Some(artifact.id.clone()),
            ));
        }
        if artifact.schema_version == 0 {
            blockers.push(blocker(
                ContentBlockerCode::UnsupportedSchema,
                Some(artifact.domain),
                Some(artifact.id.clone()),
            ));
        }
        if !ids.insert((artifact.domain, artifact.id.as_str())) {
            blockers.push(blocker(
                ContentBlockerCode::DuplicateId,
                Some(artifact.domain),
                Some(artifact.id.clone()),
            ));
        }
        for alias in &artifact.aliases {
            if !aliases.insert(alias.as_str()) {
                blockers.push(ContentBlocker {
                    code: ContentBlockerCode::AliasConflict,
                    domain: Some(artifact.domain),
                    id: Some(artifact.id.clone()),
                    expected: None,
                    actual: Some(alias.clone()),
                });
            }
        }
        let input = artifact.metadata_input();
        let mut probe = MetadataBlobStore::default();
        if probe.intern(input).is_err() {
            blockers.push(blocker(
                ContentBlockerCode::MetadataRejected,
                Some(artifact.domain),
                Some(artifact.id.clone()),
            ));
        }
    }
    blockers
}

fn compile_domains(entries: &[ContentManifestEntry]) -> BTreeMap<ContentDomain, ContentDomainDigest> {
    let mut grouped = BTreeMap::<ContentDomain, Vec<&ContentManifestEntry>>::new();
    for entry in entries {
        grouped.entry(entry.domain).or_default().push(entry);
    }
    ALL_CONTENT_DOMAINS
        .into_iter()
        .map(|domain| {
            let domain_entries = grouped.remove(&domain).unwrap_or_default();
            let mut hasher = CanonicalHasher::new("blockwild.gameplay.content-domain.v1");
            hasher.write_str(domain.as_id());
            hasher.write_u64(domain_entries.len() as u64);
            for entry in &domain_entries {
                hasher.write_str(&entry.id);
                hasher.write_bytes(entry.blob_hash.as_bytes());
                hasher.write_u32(entry.byte_length);
            }
            (
                domain,
                ContentDomainDigest {
                    count: u32::try_from(domain_entries.len()).expect("content bound fits u32"),
                    hash: hasher.finish(),
                },
            )
        })
        .collect()
}

fn canonical_manifest_hash(
    source_revision: &str,
    domains: &BTreeMap<ContentDomain, ContentDomainDigest>,
) -> CanonicalHash {
    let mut hasher = CanonicalHasher::new("blockwild.gameplay.content-manifest.v1");
    hasher.write_u16(CONTENT_MANIFEST_SCHEMA_VERSION);
    hasher.write_str(source_revision);
    hasher.write_u64(domains.len() as u64);
    for (domain, digest) in domains {
        hasher.write_str(domain.as_id());
        hasher.write_u32(digest.count);
        hasher.write_bytes(digest.hash.as_bytes());
    }
    hasher.finish()
}

fn blocker(code: ContentBlockerCode, domain: Option<ContentDomain>, id: Option<String>) -> ContentBlocker {
    ContentBlocker {
        code,
        domain,
        id,
        expected: None,
        actual: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn artifact(domain: ContentDomain, id: &str, bytes: &[u8]) -> ContentArtifact {
        ContentArtifact {
            domain,
            id: id.into(),
            schema_id: "catalog-entry".into(),
            schema_version: 1,
            content_version: 1,
            aliases: vec![format!("{}:{id}", domain.as_id())],
            canonical_bytes: bytes.to_vec(),
            unknown_extension_bytes: vec![0x80, 0xff],
        }
    }

    #[test]
    fn bundle_is_sorted_installed_and_exact() {
        let bundle = compile_content_bundle(
            "production-17",
            vec![
                artifact(ContentDomain::CardforgePack, "wildroads", b"{\"cards\":5}"),
                artifact(ContentDomain::Item, "capture-orb", b"{\"stack\":16}"),
            ],
        )
        .expect("valid bundle");
        assert_eq!(bundle.manifest.entries[0].domain, ContentDomain::Item);
        let mut store = MetadataBlobStore::default();
        let report = install_content_bundle(&bundle, &mut store).expect("install");
        assert_eq!(report.installed_entries, 2);
        assert_eq!(
            store
                .get_by_alias("cardforge-pack:wildroads")
                .expect("pack")
                .exact_bytes()
                .1,
            [0x80, 0xff]
        );
    }

    #[test]
    fn duplicate_and_declared_drift_are_machine_readable() {
        let duplicate = artifact(ContentDomain::Item, "orb", b"1");
        let blockers = compile_content_bundle("r1", vec![duplicate.clone(), duplicate]).expect_err("duplicate");
        assert_eq!(blockers[0].code, ContentBlockerCode::DuplicateId);

        let first = artifact(ContentDomain::Item, "first", b"1");
        let mut second = artifact(ContentDomain::Item, "second", b"2");
        second.aliases = first.aliases.clone();
        let alias_blockers = compile_content_bundle("r1", vec![first, second]).expect_err("alias conflict");
        assert!(
            alias_blockers
                .iter()
                .any(|blocker| blocker.code == ContentBlockerCode::AliasConflict)
        );

        let mut bundle = compile_content_bundle("r1", vec![artifact(ContentDomain::Item, "orb", b"1")]).expect("valid");
        bundle
            .manifest
            .domains
            .get_mut(&ContentDomain::Item)
            .expect("domain")
            .count += 1;
        bundle.manifest.manifest_hash = CanonicalHash([9; 16]);
        let drift = validate_content_bundle(&bundle);
        assert!(
            drift
                .iter()
                .any(|blocker| blocker.code == ContentBlockerCode::CountDrift)
        );
        assert!(
            drift
                .iter()
                .any(|blocker| blocker.code == ContentBlockerCode::ManifestHashDrift)
        );
    }

    #[test]
    fn manifest_matches_typescript_cross_language_vector() {
        let bundle = compile_content_bundle("r1", vec![artifact(ContentDomain::Item, "orb", b"1")]).expect("valid");
        assert_eq!(
            bundle.manifest.entries[0].blob_hash.to_hex(),
            "1220d8f79373932ac80423a764461ee7"
        );
        assert_eq!(
            bundle.manifest.domains[&ContentDomain::Item].hash.to_hex(),
            "cdec10a40337bcd4c81aaadc67c1b6f1"
        );
        assert_eq!(
            bundle.manifest.manifest_hash.to_hex(),
            "363aaa9354ce3efc30252027558e948f"
        );
    }
}
