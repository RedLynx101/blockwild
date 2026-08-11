use std::collections::{BTreeMap, VecDeque};

use blockwild_types::{CanonicalHash, CanonicalHasher};

use crate::{
    NETWORK_AUTHORITY_SCHEMA_V1, NETWORK_MAX_IDEMPOTENCY_RECEIPTS_V1, NETWORK_MAX_SAFE_INTEGER_V1,
    NetworkAuthorityIdentityV1, NetworkCapabilityV1, NetworkCommandKindV1, NetworkCommandV1, NetworkError,
    NetworkErrorCode, NetworkInterestSetV1, NetworkPeerKindV1, NetworkPeerRoleV1, normalize_capabilities,
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NetworkPeerGrantV1 {
    pub session_id: String,
    pub peer_id: String,
    pub connection_id: String,
    pub actor_id: String,
    pub peer_kind: NetworkPeerKindV1,
    pub role: NetworkPeerRoleV1,
    pub capabilities: Vec<NetworkCapabilityV1>,
    pub expires_at: u64,
    pub next_sequence: u64,
    pub interest: NetworkInterestSetV1,
}

impl NetworkPeerGrantV1 {
    pub fn validate(&self) -> Result<(), NetworkError> {
        for value in [&self.session_id, &self.peer_id, &self.connection_id, &self.actor_id] {
            if value.is_empty() || value.encode_utf16().count() > 180 {
                return Err(NetworkError::new(
                    NetworkErrorCode::InvalidLabel,
                    "peer grant contains an invalid identity label",
                ));
            }
        }
        if self.expires_at > NETWORK_MAX_SAFE_INTEGER_V1 || self.next_sequence > NETWORK_MAX_SAFE_INTEGER_V1 {
            return Err(NetworkError::new(
                NetworkErrorCode::InvalidInteger,
                "peer grant integer exceeds safe range",
            ));
        }
        if normalize_capabilities(&self.capabilities) != self.capabilities {
            return Err(NetworkError::new(
                NetworkErrorCode::InvalidEnum,
                "peer grant capabilities are not canonical",
            ));
        }
        self.interest.validate()
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum NetworkReceiptStatusV1 {
    Accepted,
    Rejected,
}

impl NetworkReceiptStatusV1 {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Accepted => "accepted",
            Self::Rejected => "rejected",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum NetworkReceiptCodeV1 {
    UnknownPeer,
    ConnectionMismatch,
    PeerKindMismatch,
    SessionExpired,
    CommandExpired,
    Sequence,
    StaleRevision,
    CapabilityDenied,
    LeaseConflict,
    InterestDenied,
    Invalid,
}

impl NetworkReceiptCodeV1 {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::UnknownPeer => "unknown-peer",
            Self::ConnectionMismatch => "connection-mismatch",
            Self::PeerKindMismatch => "peer-kind-mismatch",
            Self::SessionExpired => "session-expired",
            Self::CommandExpired => "command-expired",
            Self::Sequence => "sequence",
            Self::StaleRevision => "stale-revision",
            Self::CapabilityDenied => "capability-denied",
            Self::LeaseConflict => "lease-conflict",
            Self::InterestDenied => "interest-denied",
            Self::Invalid => "invalid",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NetworkCommandReceiptV1 {
    pub schema_version: u16,
    pub status: NetworkReceiptStatusV1,
    pub command_id: String,
    pub idempotency_key: String,
    pub peer_id: String,
    pub code: Option<NetworkReceiptCodeV1>,
    pub message: String,
    pub identity: NetworkAuthorityIdentityV1,
    pub receipt_hash: CanonicalHash,
}

impl NetworkCommandReceiptV1 {
    #[must_use]
    pub const fn accepted(&self) -> bool {
        matches!(self.status, NetworkReceiptStatusV1::Accepted)
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct CachedReceipt {
    command_hash: CanonicalHash,
    receipt: NetworkCommandReceiptV1,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActiveNetworkLeaseV1 {
    pub command_id: String,
    pub peer_id: String,
    pub expires_at: u64,
}

/// One fail-closed path for human and agent commands.
#[derive(Clone, Debug)]
pub struct NetworkAuthorityV1 {
    session_id: String,
    grants: BTreeMap<String, NetworkPeerGrantV1>,
    receipts: BTreeMap<String, CachedReceipt>,
    receipt_order: VecDeque<String>,
    leases: BTreeMap<String, ActiveNetworkLeaseV1>,
}

impl NetworkAuthorityV1 {
    pub fn new(session_id: String) -> Result<Self, NetworkError> {
        if session_id.is_empty() || session_id.encode_utf16().count() > 180 {
            return Err(NetworkError::new(
                NetworkErrorCode::InvalidLabel,
                "authority session id is invalid",
            ));
        }
        Ok(Self {
            session_id,
            grants: BTreeMap::new(),
            receipts: BTreeMap::new(),
            receipt_order: VecDeque::new(),
            leases: BTreeMap::new(),
        })
    }

    #[must_use]
    pub fn session_id(&self) -> &str {
        &self.session_id
    }

    pub fn upsert_grant(&mut self, mut grant: NetworkPeerGrantV1) -> Result<NetworkPeerGrantV1, NetworkError> {
        grant.validate()?;
        if grant.session_id != self.session_id {
            return Err(NetworkError::new(
                NetworkErrorCode::InvalidLabel,
                "peer grant belongs to another session",
            ));
        }
        grant.capabilities = normalize_capabilities(&grant.capabilities);
        self.grants.insert(grant.peer_id.clone(), grant.clone());
        Ok(grant)
    }

    #[must_use]
    pub fn grant(&self, peer_id: &str) -> Option<&NetworkPeerGrantV1> {
        self.grants.get(peer_id)
    }

    #[must_use]
    pub fn grant_count(&self) -> usize {
        self.grants.len()
    }

    #[must_use]
    pub fn receipt_count(&self) -> usize {
        self.receipts.len()
    }

    #[must_use]
    pub fn active_lease_count(&self) -> usize {
        self.leases.len()
    }

    #[must_use]
    pub fn authority_fingerprint(&self) -> CanonicalHash {
        let mut hasher = CanonicalHasher::new("blockwild-network-authority-runtime-v1");
        hasher.write_str(&self.session_id);
        hasher.write_u32(self.grants.len() as u32);
        for (peer_id, grant) in &self.grants {
            hasher.write_str(peer_id);
            hasher.write_str(&grant.connection_id);
            hasher.write_str(&grant.actor_id);
            hasher.write_str(grant.peer_kind.as_str());
            hasher.write_u64(grant.expires_at);
            hasher.write_u64(grant.next_sequence);
            hasher.write_str(&grant.interest.interest_hash.to_hex());
        }
        hasher.write_u32(self.receipt_order.len() as u32);
        for key in &self.receipt_order {
            if let Some(receipt) = self.receipts.get(key) {
                hasher.write_str(key);
                hasher.write_bytes(receipt.command_hash.as_bytes());
                hasher.write_bytes(receipt.receipt.receipt_hash.as_bytes());
            }
        }
        hasher.write_u32(self.leases.len() as u32);
        for (key, lease) in &self.leases {
            hasher.write_str(key);
            hasher.write_str(&lease.command_id);
            hasher.write_str(&lease.peer_id);
            hasher.write_u64(lease.expires_at);
        }
        hasher.finish()
    }

    pub fn authorize(
        &mut self,
        command: &NetworkCommandV1,
        current: &NetworkAuthorityIdentityV1,
        now: u64,
    ) -> Result<NetworkCommandReceiptV1, NetworkError> {
        command.validate()?;
        current.validate()?;
        if now > NETWORK_MAX_SAFE_INTEGER_V1 {
            return Err(NetworkError::new(
                NetworkErrorCode::InvalidInteger,
                "authority clock exceeds safe range",
            ));
        }
        if let Some(cached) = self.receipts.get(&command.idempotency_key) {
            if cached.command_hash == command.command_hash {
                return Ok(cached.receipt.clone());
            }
            return Ok(self.make_receipt(
                command,
                current,
                NetworkReceiptStatusV1::Rejected,
                Some(NetworkReceiptCodeV1::Invalid),
                "Idempotency key was already used by a different command.",
            ));
        }
        if command.session_id != self.session_id {
            return Ok(self.cache_rejection(
                command,
                current,
                NetworkReceiptCodeV1::Invalid,
                "Command belongs to another session.",
            ));
        }
        let Some(grant) = self.grants.get(&command.peer_id).cloned() else {
            return Ok(self.cache_rejection(
                command,
                current,
                NetworkReceiptCodeV1::UnknownPeer,
                "Peer has no active host grant.",
            ));
        };
        if grant.connection_id != command.connection_id || grant.actor_id != command.actor_id {
            return Ok(self.cache_rejection(
                command,
                current,
                NetworkReceiptCodeV1::ConnectionMismatch,
                "Command is not bound to the granted connection and actor.",
            ));
        }
        if grant.peer_kind != command.peer_kind {
            return Ok(self.cache_rejection(
                command,
                current,
                NetworkReceiptCodeV1::PeerKindMismatch,
                "Command peer kind does not match the host grant.",
            ));
        }
        if grant.expires_at < now {
            return Ok(self.cache_rejection(
                command,
                current,
                NetworkReceiptCodeV1::SessionExpired,
                "Peer grant expired.",
            ));
        }
        if command.expires_at < now {
            return Ok(self.cache_rejection(
                command,
                current,
                NetworkReceiptCodeV1::CommandExpired,
                "Command expired before host validation.",
            ));
        }
        if command.sequence != grant.next_sequence {
            return Ok(self.cache_rejection(
                command,
                current,
                NetworkReceiptCodeV1::Sequence,
                "Command sequence does not match the host grant.",
            ));
        }
        if command.expected != *current {
            return Ok(self.cache_rejection(
                command,
                current,
                NetworkReceiptCodeV1::StaleRevision,
                "Command was created from stale authoritative state.",
            ));
        }
        if !grant.capabilities.contains(&command.required_capability) {
            return Ok(self.cache_rejection(
                command,
                current,
                NetworkReceiptCodeV1::CapabilityDenied,
                "Host did not grant the required capability.",
            ));
        }
        if !grant.interest.includes_location(&command.expected.address)
            && !matches!(
                command.kind,
                NetworkCommandKindV1::Interest | NetworkCommandKindV1::Reconnect | NetworkCommandKindV1::Chat
            )
        {
            return Ok(self.cache_rejection(
                command,
                current,
                NetworkReceiptCodeV1::InterestDenied,
                "Command targets a location outside host-authorized interest.",
            ));
        }
        self.release_expired_leases(now);
        if command.lease_keys.iter().any(|key| {
            self.leases
                .get(key)
                .is_some_and(|lease| lease.command_id != command.command_id)
        }) {
            return Ok(self.cache_rejection(
                command,
                current,
                NetworkReceiptCodeV1::LeaseConflict,
                "A command resource is leased by another command.",
            ));
        }
        let next_sequence = grant
            .next_sequence
            .checked_add(1)
            .ok_or_else(|| NetworkError::new(NetworkErrorCode::InvalidInteger, "peer sequence overflow"))?;
        if next_sequence > NETWORK_MAX_SAFE_INTEGER_V1 {
            return Err(NetworkError::new(
                NetworkErrorCode::InvalidInteger,
                "peer sequence exceeds safe range",
            ));
        }
        for key in &command.lease_keys {
            self.leases.insert(
                key.clone(),
                ActiveNetworkLeaseV1 {
                    command_id: command.command_id.clone(),
                    peer_id: command.peer_id.clone(),
                    expires_at: command.expires_at,
                },
            );
        }
        self.grants
            .insert(command.peer_id.clone(), NetworkPeerGrantV1 { next_sequence, ..grant });
        Ok(self.cache_receipt(
            self.make_receipt(command, current, NetworkReceiptStatusV1::Accepted, None, ""),
            command.command_hash,
        ))
    }

    pub fn release_command(&mut self, command_id: &str) {
        self.leases.retain(|_, lease| lease.command_id != command_id);
    }

    pub fn release_peer(&mut self, peer_id: &str) {
        self.leases.retain(|_, lease| lease.peer_id != peer_id);
        self.grants.remove(peer_id);
    }

    pub fn release_expired_leases(&mut self, now: u64) {
        self.leases.retain(|_, lease| lease.expires_at >= now);
    }

    fn cache_rejection(
        &mut self,
        command: &NetworkCommandV1,
        current: &NetworkAuthorityIdentityV1,
        code: NetworkReceiptCodeV1,
        message: &str,
    ) -> NetworkCommandReceiptV1 {
        let receipt = self.make_receipt(command, current, NetworkReceiptStatusV1::Rejected, Some(code), message);
        self.cache_receipt(receipt, command.command_hash)
    }

    fn make_receipt(
        &self,
        command: &NetworkCommandV1,
        current: &NetworkAuthorityIdentityV1,
        status: NetworkReceiptStatusV1,
        code: Option<NetworkReceiptCodeV1>,
        message: &str,
    ) -> NetworkCommandReceiptV1 {
        let mut hasher = CanonicalHasher::new("blockwild-network-receipt-v1");
        hasher.write_str(status.as_str());
        hasher.write_str(&command.command_id);
        hasher.write_str(&command.idempotency_key);
        hasher.write_str(&command.peer_id);
        hasher.write_str(&current.state_hash.to_hex());
        if let Some(code) = code {
            hasher.write_str(code.as_str());
            hasher.write_str(message);
        }
        NetworkCommandReceiptV1 {
            schema_version: NETWORK_AUTHORITY_SCHEMA_V1,
            status,
            command_id: command.command_id.clone(),
            idempotency_key: command.idempotency_key.clone(),
            peer_id: command.peer_id.clone(),
            code,
            message: message.to_owned(),
            identity: current.clone(),
            receipt_hash: hasher.finish(),
        }
    }

    fn cache_receipt(
        &mut self,
        receipt: NetworkCommandReceiptV1,
        command_hash: CanonicalHash,
    ) -> NetworkCommandReceiptV1 {
        let key = receipt.idempotency_key.clone();
        self.receipts.insert(
            key.clone(),
            CachedReceipt {
                command_hash,
                receipt: receipt.clone(),
            },
        );
        self.receipt_order.push_back(key);
        while self.receipt_order.len() > NETWORK_MAX_IDEMPOTENCY_RECEIPTS_V1 {
            if let Some(expired) = self.receipt_order.pop_front() {
                self.receipts.remove(&expired);
            }
        }
        receipt
    }
}
