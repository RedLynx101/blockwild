//! Coarse BWRQ/BWRS facade for one integrated native authority per Worker.
//!
//! The browser never calls this module per voxel or per entity. Every export
//! accepts one complete, checksummed runtime envelope and returns one awaited
//! response envelope. Unsupported domain codecs reject explicitly; they are
//! never interpreted as successful no-ops.

use std::cell::RefCell;
use std::collections::{BTreeMap, BTreeSet, VecDeque};

use blockwild_authority::BlockCatalogV1;
use blockwild_engine::{
    IntegratedRuntimeBatchV2, IntegratedRuntimeConfigV2, IntegratedRuntimeError, IntegratedRuntimeIdentityV2,
    IntegratedRuntimeReceiptV2, IntegratedRuntimeV2, decode_entity_command_batch_v1, decode_gameplay_actor_grant_v1,
    decode_gameplay_batch_v1, decode_network_agent_grant_v1, decode_network_command_release_v1,
    decode_network_delta_build_request_v1, decode_network_peer_grant_v1, decode_network_peer_release_v1,
    decode_network_reconnect_request_v1, decode_network_replication_record_v1, decode_runtime_persistence_dispatch_v1,
    decode_runtime_player_binding_v1, encode_entity_event_batch_v1, encode_gameplay_receipt_v1,
    encode_runtime_persistence_dispatch_receipt_v1,
};
use blockwild_network::{InterestSelectionStatsV1, encode_network_checkpoint_v1, encode_network_delta_v1};
use blockwild_persistence::{PersistenceDispatchOutcomeV1, PersistenceDispatchStatusV1, PersistenceRetryDirectiveV1};
use blockwild_runtime_wire::{
    ENTITY_COMMAND_TYPE_V1, ENTITY_RECEIPT_TYPE_V1, GAMEPLAY_ACTOR_GRANT_RECEIPT_TYPE_V1, GAMEPLAY_ACTOR_GRANT_TYPE_V1,
    GAMEPLAY_COMMAND_TYPE_V1, GAMEPLAY_RECEIPT_TYPE_V1, NETWORK_AGENT_GRANT_TYPE_V1,
    NETWORK_COMMAND_RELEASE_RECEIPT_TYPE_V1, NETWORK_COMMAND_RELEASE_TYPE_V1, NETWORK_DELTA_BUILD_RESPONSE_TYPE_V1,
    NETWORK_DELTA_BUILD_TYPE_V1, NETWORK_GRANT_RECEIPT_TYPE_V1, NETWORK_PEER_GRANT_TYPE_V1,
    NETWORK_PEER_RELEASE_RECEIPT_TYPE_V1, NETWORK_PEER_RELEASE_TYPE_V1, NETWORK_RECONNECT_RESPONSE_TYPE_V1,
    NETWORK_RECONNECT_TYPE_V1, NETWORK_REPLICATION_RECEIPT_TYPE_V1, NETWORK_REPLICATION_REMOVE_TYPE_V1,
    NETWORK_REPLICATION_UPSERT_TYPE_V1, NETWORK_REQUEST_TYPE_V1, NETWORK_RESPONSE_TYPE_V1,
    PERSISTENCE_COMPATIBILITY_HYDRATION_CHUNK_TYPE_V1, PERSISTENCE_DISPATCH_RECEIPT_TYPE_V1,
    PERSISTENCE_DISPATCH_TYPE_V1, PERSISTENCE_REQUEST_TYPE_V1, RUNTIME_BULK_MAX_PENDING_V1,
    RUNTIME_BULK_MAX_QUEUED_BYTES_V1, RuntimeBulkEncodedV1, RuntimeBulkRequestV1, RuntimeBulkResponseV1,
    RuntimeBulkSaveStageStateV1, RuntimeBulkStateV1, RuntimeCommandBatchV1, RuntimeCommandReceiptV1, RuntimeConfigV1,
    RuntimeDomainOperationV1, RuntimeDomainV1, RuntimeExtractionV1, RuntimeIdentityV1, RuntimeRequestV1,
    RuntimeResponseV1, RuntimeRevisionV1, SIMULATION_PLAYER_BIND_RECEIPT_TYPE_V1, SIMULATION_PLAYER_BIND_TYPE_V1,
    WireHash, decode_bulk_request_v1, decode_request_v1, encode_bulk_response_v1, encode_response_v1,
    extraction_checksum_v1, wire_checksum_v1,
};
use blockwild_types::CanonicalHash;
use wasm_bindgen::prelude::*;

const WORKER_EPOCH: u32 = 1;
const WASM_ARTIFACT_ATTESTATION_PLACEHOLDER: &str = "loader-attested";
const MAX_COMMAND_RECEIPTS: usize = 4_096;
const CAPABILITIES: [&str; 9] = [
    "awaited-receipts-v1",
    "bounded-extraction-v1-pending-live-domain-views",
    "bulk-platform-v1",
    "entity-command-v1",
    "fixed-step-input-v1-pending-live-cutover",
    "gameplay-command-v1",
    "integrated-runtime-v1",
    "native-save-hydration-v1-pending-r6-r7-records",
    "network-authority-v1",
];

#[derive(Clone)]
struct CachedCommandReceiptV1 {
    command_hash: WireHash,
    receipt: RuntimeCommandReceiptV1,
}

#[derive(Default)]
struct IntegratedRuntimeStoreV2 {
    next_handle: u32,
    runtimes: BTreeMap<u32, IntegratedRuntimeV2>,
    bulk_attachments: BTreeMap<(u32, u64), Vec<u8>>,
    command_receipts: BTreeMap<(u32, String, String), CachedCommandReceiptV1>,
    command_receipt_order: VecDeque<(u32, String, String)>,
}

impl IntegratedRuntimeStoreV2 {
    fn insert(&mut self, runtime: IntegratedRuntimeV2) -> u32 {
        self.next_handle = self.next_handle.wrapping_add(1).max(1);
        while self.runtimes.contains_key(&self.next_handle) {
            self.next_handle = self.next_handle.wrapping_add(1).max(1);
        }
        let handle = self.next_handle;
        self.runtimes.insert(handle, runtime);
        handle
    }
}

thread_local! {
    static INTEGRATED_RUNTIMES: RefCell<IntegratedRuntimeStoreV2> = RefCell::new(IntegratedRuntimeStoreV2::default());
}

/// Creates the sole integrated runtime for this Worker generation. Restore
/// remains fail-closed until R8's checkpoint codec is attached to this facade.
#[wasm_bindgen]
#[must_use]
pub fn blockwild_runtime_create_v2(request_bytes: &[u8]) -> Vec<u8> {
    let Ok(request) = decode_request_v1(request_bytes) else {
        return Vec::new();
    };
    match request {
        RuntimeRequestV1::Create {
            request_id,
            client_epoch,
            config,
        } => match create_runtime(config) {
            Ok(runtime) => {
                let identity = wire_identity(&runtime.identity());
                let handle = INTEGRATED_RUNTIMES.with(|store| store.borrow_mut().insert(runtime));
                encode(RuntimeResponseV1::Ready {
                    request_id,
                    client_epoch,
                    worker_epoch: WORKER_EPOCH,
                    runtime_handle: handle,
                    identity,
                    // Rust cannot self-prove the manifest hash that selected
                    // its bytes. The content-addressed loader replaces this
                    // placeholder before the browser service verifies it.
                    artifact_hash: WASM_ARTIFACT_ATTESTATION_PLACEHOLDER.into(),
                    instance_id: format!("integrated-runtime:{WORKER_EPOCH}:{handle}"),
                    capabilities: capabilities(),
                })
            }
            Err((code, message)) => encode_error(request_id, client_epoch, code, message, None),
        },
        RuntimeRequestV1::Restore {
            request_id,
            client_epoch,
            ..
        } => encode_error(
            request_id,
            client_epoch,
            "restore-unavailable",
            "integrated checkpoint restore is unavailable until the R8 checkpoint codec is attached",
            None,
        ),
        request => encode_error(
            request.request_id(),
            request.client_epoch(),
            "wrong-operation",
            "integrated runtime creation accepts only create or restore requests",
            None,
        ),
    }
}

/// Applies one reliable command envelope and returns one deterministic receipt.
/// Unknown domain payloads reject rather than being silently discarded.
#[wasm_bindgen]
#[must_use]
pub fn blockwild_runtime_command_v2(handle: u32, request_bytes: &[u8]) -> Vec<u8> {
    let Ok(request) = decode_request_v1(request_bytes) else {
        return Vec::new();
    };
    let RuntimeRequestV1::Command {
        request_id,
        client_epoch,
        batch,
    } = request
    else {
        return encode_error(
            request.request_id(),
            request.client_epoch(),
            "wrong-operation",
            "command export requires a runtime command request",
            None,
        );
    };
    INTEGRATED_RUNTIMES.with(|store| {
        let mut store = store.borrow_mut();
        let Some(runtime) = store.runtimes.get(&handle) else {
            return encode_error(
                request_id,
                client_epoch,
                "invalid-handle",
                "unknown integrated runtime handle",
                None,
            );
        };
        let current = wire_identity(&runtime.identity());
        let cache_key = (handle, batch.actor_id.clone(), batch.idempotency_key.clone());
        if let Some(cached) = store.command_receipts.get(&cache_key) {
            let receipt = if cached.command_hash == batch.command_hash {
                cached.receipt.clone()
            } else {
                rejected_command_receipt(
                    &batch,
                    "idempotency-conflict",
                    "idempotency key was reused for different command bytes",
                    current,
                )
            };
            return encode(RuntimeResponseV1::CommandReceipt {
                request_id,
                client_epoch,
                worker_epoch: WORKER_EPOCH,
                receipt,
            });
        }
        let receipt = if batch.expected != current {
            rejected_command_receipt(
                &batch,
                "stale-runtime",
                "command was authored against an obsolete integrated authority identity",
                current,
            )
        } else {
            match dispatch_command(runtime, &batch) {
                Ok((next, domain_receipts)) => {
                    let before = current;
                    let after = wire_identity(&next.identity());
                    let receipt_hash = accepted_receipt_hash(batch.command_hash, &before, &after, &domain_receipts);
                    store.runtimes.insert(handle, next);
                    RuntimeCommandReceiptV1::Accepted {
                        command_id: batch.command_id.clone(),
                        idempotency_key: batch.idempotency_key.clone(),
                        command_hash: batch.command_hash,
                        before,
                        after,
                        domain_receipts,
                        receipt_hash,
                    }
                }
                Err((code, message)) => rejected_command_receipt(&batch, code, message, current),
            }
        };
        store.command_receipts.insert(
            cache_key.clone(),
            CachedCommandReceiptV1 {
                command_hash: batch.command_hash,
                receipt: receipt.clone(),
            },
        );
        store.command_receipt_order.push_back(cache_key);
        while store.command_receipt_order.len() > MAX_COMMAND_RECEIPTS {
            if let Some(expired) = store.command_receipt_order.pop_front() {
                store.command_receipts.remove(&expired);
            }
        }
        encode(RuntimeResponseV1::CommandReceipt {
            request_id,
            client_epoch,
            worker_epoch: WORKER_EPOCH,
            receipt,
        })
    })
}

/// Advances bounded fixed steps after atomically accepting the complete,
/// strictly sequenced input batch into Rust-owned authority.
#[wasm_bindgen]
#[must_use]
pub fn blockwild_runtime_step_v2(handle: u32, request_bytes: &[u8]) -> Vec<u8> {
    let Ok(request) = decode_request_v1(request_bytes) else {
        return Vec::new();
    };
    let RuntimeRequestV1::Step {
        request_id,
        client_epoch,
        expected,
        monotonic_time_us,
        budget_us,
        inputs,
    } = request
    else {
        return encode_error(
            request.request_id(),
            request.client_epoch(),
            "wrong-operation",
            "step export requires a fixed-step request",
            None,
        );
    };
    INTEGRATED_RUNTIMES.with(|store| {
        let mut store = store.borrow_mut();
        let Some(runtime) = store.runtimes.get(&handle) else {
            return encode_error(
                request_id,
                client_epoch,
                "invalid-handle",
                "unknown integrated runtime handle",
                None,
            );
        };
        let current = wire_identity(&runtime.identity());
        if expected != current {
            return encode_error(
                request_id,
                client_epoch,
                "stale-runtime",
                "step references obsolete authority",
                Some(current),
            );
        }
        let mut candidate = runtime.clone();
        if let Err(error) = candidate.accept_inputs(&inputs) {
            return encode_error(request_id, client_epoch, &error.code, &error.message, Some(current));
        }
        match candidate.step(monotonic_time_us, budget_us) {
            Ok(summary) => {
                let identity = wire_identity(&candidate.identity());
                store.runtimes.insert(handle, candidate);
                encode(RuntimeResponseV1::StepResult {
                    request_id,
                    client_epoch,
                    worker_epoch: WORKER_EPOCH,
                    identity,
                    fixed_steps: u16::try_from(summary.fixed_steps).expect("fixed steps are capped at eight"),
                    inputs_applied: u16::try_from(summary.inputs_applied).expect("input frames are bounded"),
                    commands_processed: u16::try_from(summary.processed_batches)
                        .expect("processed batches are bounded"),
                    commands_accepted: u16::try_from(summary.accepted_batches).expect("accepted batches are bounded"),
                    replay_hash: wire_hash(summary.replay_hash),
                })
            }
            Err(error) => encode_error(request_id, client_epoch, &error.code, &error.message, Some(current)),
        }
    })
}

/// Returns one bounded renderer-neutral extraction. Entity/model identity,
/// transforms, health, protection, input/HUD state, and diagnostics are copied
/// once per coarse extraction rather than queried per object.
#[wasm_bindgen]
#[must_use]
pub fn blockwild_runtime_extract_v2(handle: u32, request_bytes: &[u8]) -> Vec<u8> {
    let Ok(request) = decode_request_v1(request_bytes) else {
        return Vec::new();
    };
    let RuntimeRequestV1::Extract {
        request_id,
        client_epoch,
        expected,
        after_revision,
        max_bytes,
    } = request
    else {
        return encode_error(
            request.request_id(),
            request.client_epoch(),
            "wrong-operation",
            "extract export requires an extraction request",
            None,
        );
    };
    INTEGRATED_RUNTIMES.with(|store| {
        let store = store.borrow();
        let Some(runtime) = store.runtimes.get(&handle) else {
            return encode_error(
                request_id,
                client_epoch,
                "invalid-handle",
                "unknown integrated runtime handle",
                None,
            );
        };
        let identity = wire_identity(&runtime.identity());
        if expected != identity {
            return encode_error(
                request_id,
                client_epoch,
                "stale-runtime",
                "extraction references obsolete authority",
                Some(identity),
            );
        }
        let extraction_revision = runtime_extraction_revision(runtime);
        let (render, hud, audio, platform_requests, diagnostics) = if extraction_revision > after_revision {
            (
                encode_render_extraction(runtime),
                encode_hud_extraction(runtime),
                encode_audio_extraction(),
                encode_platform_extraction(runtime),
                encode_diagnostics(runtime),
            )
        } else {
            (Vec::new(), Vec::new(), Vec::new(), Vec::new(), Vec::new())
        };
        let total_bytes = render
            .len()
            .saturating_add(hud.len())
            .saturating_add(audio.len())
            .saturating_add(platform_requests.len())
            .saturating_add(diagnostics.len());
        if total_bytes > max_bytes as usize {
            return encode_error(
                request_id,
                client_epoch,
                "extraction-capacity",
                "extraction exceeds the requested byte budget",
                Some(identity),
            );
        }
        let mut extraction = RuntimeExtractionV1 {
            identity,
            extraction_revision,
            render,
            hud,
            audio,
            platform_requests,
            diagnostics,
            extraction_hash: WireHash::default(),
        };
        extraction.extraction_hash = match extraction_checksum_v1(&extraction) {
            Ok(hash) => hash,
            Err(error) => {
                return encode_error(
                    request_id,
                    client_epoch,
                    error.code,
                    error.message,
                    Some(extraction.identity),
                );
            }
        };
        encode(RuntimeResponseV1::Extraction {
            request_id,
            client_epoch,
            worker_epoch: WORKER_EPOCH,
            extraction,
        })
    })
}

/// Checkpoint export is an explicit hard gate; no synthetic checkpoint is
/// returned before the R8 canonical save codec is attached.
#[wasm_bindgen]
#[must_use]
pub fn blockwild_runtime_export_save_v2(handle: u32, request_bytes: &[u8]) -> Vec<u8> {
    let Ok(request) = decode_request_v1(request_bytes) else {
        return Vec::new();
    };
    let current = INTEGRATED_RUNTIMES.with(|store| {
        store
            .borrow()
            .runtimes
            .get(&handle)
            .map(|runtime| wire_identity(&runtime.identity()))
    });
    let (request_id, client_epoch) = (request.request_id(), request.client_epoch());
    if current.is_none() {
        return encode_error(
            request_id,
            client_epoch,
            "invalid-handle",
            "unknown integrated runtime handle",
            None,
        );
    }
    encode_error(
        request_id,
        client_epoch,
        "checkpoint-unavailable",
        "integrated checkpoint export is unavailable until the R8 canonical save codec is attached",
        current,
    )
}

/// Lower-priority detached platform lane. Rust owns request identity,
/// backpressure, retry policy, durable receipt validation, and dispatcher
/// revisions. TypeScript only executes one complete opaque BWPR and returns
/// its exact BWPA under the Rust-issued transfer token.
#[wasm_bindgen]
#[must_use]
pub fn blockwild_runtime_bulk_v2(handle: u32, control_bytes: &[u8], attachment_bytes: &[u8]) -> Vec<u8> {
    let Ok(request) = decode_bulk_request_v1(control_bytes, attachment_bytes) else {
        return Vec::new();
    };
    INTEGRATED_RUNTIMES.with(|store| {
        let mut store = store.borrow_mut();
        let response = match store.runtimes.get_mut(&handle) {
            None => RuntimeBulkResponseV1::Error {
                request_id: request.request_id(),
                client_epoch: request.client_epoch(),
                worker_epoch: WORKER_EPOCH,
                code: "invalid-handle".into(),
                message: "unknown integrated runtime handle".into(),
                current: None,
            },
            Some(runtime) => {
                let current = RuntimeBulkStateV1::from(&wire_identity(&runtime.identity()));
                let expected = request.expected();
                if expected != &current {
                    RuntimeBulkResponseV1::Error {
                        request_id: request.request_id(),
                        client_epoch: request.client_epoch(),
                        worker_epoch: WORKER_EPOCH,
                        code: "stale-runtime".into(),
                        message: "bulk platform request references obsolete authority".into(),
                        current: Some(current),
                    }
                } else {
                    match request {
                        RuntimeBulkRequestV1::Poll {
                            request_id,
                            client_epoch,
                            max_bytes,
                            ..
                        } => match runtime.poll_persistence_platform(max_bytes as usize) {
                            Ok(Some(packet)) => RuntimeBulkResponseV1::PlatformRequest {
                                request_id,
                                client_epoch,
                                worker_epoch: WORKER_EPOCH,
                                current: RuntimeBulkStateV1::from(&wire_identity(&runtime.identity())),
                                transfer_token: packet.transfer_token,
                                type_id: PERSISTENCE_REQUEST_TYPE_V1.into(),
                                payload: packet.bytes,
                            },
                            Ok(None) => RuntimeBulkResponseV1::Empty {
                                request_id,
                                client_epoch,
                                worker_epoch: WORKER_EPOCH,
                                current,
                            },
                            Err(error) => RuntimeBulkResponseV1::Error {
                                request_id,
                                client_epoch,
                                worker_epoch: WORKER_EPOCH,
                                code: error.code,
                                message: error.message,
                                current: Some(RuntimeBulkStateV1::from(&wire_identity(&runtime.identity()))),
                            },
                        },
                        RuntimeBulkRequestV1::Complete {
                            request_id,
                            client_epoch,
                            transfer_token,
                            payload,
                            ..
                        } => match runtime.complete_persistence_platform(transfer_token, &payload) {
                            Ok(outcome) => RuntimeBulkResponseV1::Completed {
                                request_id,
                                client_epoch,
                                worker_epoch: WORKER_EPOCH,
                                current: RuntimeBulkStateV1::from(&wire_identity(&runtime.identity())),
                                transfer_token,
                                result_hash: persistence_outcome_hash(&outcome),
                            },
                            Err(error) => RuntimeBulkResponseV1::Error {
                                request_id,
                                client_epoch,
                                worker_epoch: WORKER_EPOCH,
                                code: error.code,
                                message: error.message,
                                current: Some(RuntimeBulkStateV1::from(&wire_identity(&runtime.identity()))),
                            },
                        },
                        RuntimeBulkRequestV1::StageSaveChunk {
                            request_id,
                            client_epoch,
                            stage_id,
                            chunk_index,
                            chunk_count,
                            total_bytes,
                            payload,
                            ..
                        } => match runtime.stage_compatibility_save_chunk(
                            &stage_id,
                            chunk_index,
                            chunk_count,
                            total_bytes,
                            &payload,
                        ) {
                            Ok(progress) => RuntimeBulkResponseV1::SaveProgress {
                                request_id,
                                client_epoch,
                                worker_epoch: WORKER_EPOCH,
                                current: RuntimeBulkStateV1::from(&wire_identity(&runtime.identity())),
                                stage_id: progress.stage_id,
                                state: RuntimeBulkSaveStageStateV1::Staged,
                                received_chunks: progress.received_chunks,
                                chunk_count: progress.chunk_count,
                                received_bytes: progress.received_bytes,
                                set_hash: WireHash(progress.set_hash.0),
                                manifest_hash: WireHash(progress.manifest_hash.0),
                                dispatcher_request_id: progress.dispatcher_request_id.unwrap_or_default(),
                                remaining_dirty_records: progress.remaining_dirty_records,
                            },
                            Err(error) => bulk_runtime_error(request_id, client_epoch, error, runtime),
                        },
                        RuntimeBulkRequestV1::FinalizeSave {
                            request_id,
                            client_epoch,
                            stage_id,
                            created_at,
                            ..
                        } => match runtime.finalize_compatibility_save(&stage_id, created_at) {
                            Ok(progress) => RuntimeBulkResponseV1::SaveProgress {
                                request_id,
                                client_epoch,
                                worker_epoch: WORKER_EPOCH,
                                current: RuntimeBulkStateV1::from(&wire_identity(&runtime.identity())),
                                stage_id: progress.stage_id,
                                state: RuntimeBulkSaveStageStateV1::Finalized,
                                received_chunks: progress.received_chunks,
                                chunk_count: progress.chunk_count,
                                received_bytes: progress.received_bytes,
                                set_hash: WireHash(progress.set_hash.0),
                                manifest_hash: WireHash(progress.manifest_hash.0),
                                dispatcher_request_id: progress.dispatcher_request_id.unwrap_or_default(),
                                remaining_dirty_records: progress.remaining_dirty_records,
                            },
                            Err(error) => bulk_runtime_error(request_id, client_epoch, error, runtime),
                        },
                        RuntimeBulkRequestV1::HydrateRecovery {
                            request_id,
                            client_epoch,
                            recovery_id,
                            ..
                        } => match runtime.hydrate_recovery(&recovery_id) {
                            Ok(summary) => RuntimeBulkResponseV1::Hydration {
                                request_id,
                                client_epoch,
                                worker_epoch: WORKER_EPOCH,
                                current: RuntimeBulkStateV1::from(&wire_identity(&runtime.identity())),
                                recovery_id: summary.recovery_id,
                                native_domains: summary.native_domains,
                                chunk_count: summary.chunk_count,
                                total_bytes: summary.total_bytes,
                                compatibility_hash: WireHash(summary.compatibility_hash.0),
                            },
                            Err(error) => bulk_runtime_error(request_id, client_epoch, error, runtime),
                        },
                        RuntimeBulkRequestV1::ReadHydratedCompatibility {
                            request_id,
                            client_epoch,
                            recovery_id,
                            chunk_index,
                            ..
                        } => match runtime.read_hydrated_compatibility_chunk(&recovery_id, chunk_index) {
                            Ok(chunk) => RuntimeBulkResponseV1::Data {
                                request_id,
                                client_epoch,
                                worker_epoch: WORKER_EPOCH,
                                current: RuntimeBulkStateV1::from(&wire_identity(&runtime.identity())),
                                transfer_token: chunk.transfer_token,
                                type_id: PERSISTENCE_COMPATIBILITY_HYDRATION_CHUNK_TYPE_V1.into(),
                                chunk_index: chunk.chunk_index,
                                chunk_count: chunk.chunk_count,
                                payload: chunk.bytes,
                            },
                            Err(error) => bulk_runtime_error(request_id, client_epoch, error, runtime),
                        },
                        RuntimeBulkRequestV1::CancelSaveStage {
                            request_id,
                            client_epoch,
                            stage_id,
                            ..
                        } => match runtime.cancel_compatibility_save_stage(&stage_id) {
                            Ok(progress) => RuntimeBulkResponseV1::SaveProgress {
                                request_id,
                                client_epoch,
                                worker_epoch: WORKER_EPOCH,
                                current: RuntimeBulkStateV1::from(&wire_identity(&runtime.identity())),
                                stage_id: progress.stage_id,
                                state: RuntimeBulkSaveStageStateV1::Cancelled,
                                received_chunks: progress.received_chunks,
                                chunk_count: progress.chunk_count,
                                received_bytes: progress.received_bytes,
                                set_hash: WireHash::default(),
                                manifest_hash: WireHash::default(),
                                dispatcher_request_id: 0,
                                remaining_dirty_records: 0,
                            },
                            Err(error) => bulk_runtime_error(request_id, client_epoch, error, runtime),
                        },
                    }
                }
            }
        };
        encode_bulk_control(handle, response, &mut store.bulk_attachments)
    })
}

/// Moves one Rust-owned platform attachment out of Wasm exactly once.
#[wasm_bindgen]
#[must_use]
pub fn blockwild_runtime_bulk_take_attachment_v2(handle: u32, transfer_token: f64) -> Vec<u8> {
    if !transfer_token.is_finite()
        || !(1.0..=9_007_199_254_740_991.0).contains(&transfer_token)
        || transfer_token.fract() != 0.0
    {
        return Vec::new();
    }
    let transfer_token = transfer_token as u64;
    INTEGRATED_RUNTIMES.with(|store| {
        store
            .borrow_mut()
            .bulk_attachments
            .remove(&(handle, transfer_token))
            .unwrap_or_default()
    })
}

/// Destroys the generational handle. A stale expected identity is rejected and
/// leaves the authority alive for an explicit synchronized retry.
#[wasm_bindgen]
#[must_use]
pub fn blockwild_runtime_destroy_v2(handle: u32, request_bytes: &[u8]) -> Vec<u8> {
    let Ok(request) = decode_request_v1(request_bytes) else {
        return Vec::new();
    };
    let RuntimeRequestV1::Shutdown {
        request_id,
        client_epoch,
        expected,
    } = request
    else {
        return encode_error(
            request.request_id(),
            request.client_epoch(),
            "wrong-operation",
            "destroy export requires a shutdown request",
            None,
        );
    };
    INTEGRATED_RUNTIMES.with(|store| {
        let mut store = store.borrow_mut();
        let Some(current) = store
            .runtimes
            .get(&handle)
            .map(|runtime| wire_identity(&runtime.identity()))
        else {
            return encode_error(
                request_id,
                client_epoch,
                "invalid-handle",
                "unknown integrated runtime handle",
                None,
            );
        };
        if expected.as_ref().is_some_and(|identity| identity != &current) {
            return encode_error(
                request_id,
                client_epoch,
                "stale-runtime",
                "shutdown references obsolete authority",
                Some(current),
            );
        }
        let mut runtime = store.runtimes.remove(&handle).expect("runtime handle was checked");
        store
            .bulk_attachments
            .retain(|(runtime_handle, _), _| *runtime_handle != handle);
        store
            .command_receipts
            .retain(|(runtime_handle, _, _), _| *runtime_handle != handle);
        store
            .command_receipt_order
            .retain(|(runtime_handle, _, _)| *runtime_handle != handle);
        runtime.shutdown();
        encode(RuntimeResponseV1::Shutdown {
            request_id,
            client_epoch,
            worker_epoch: WORKER_EPOCH,
        })
    })
}

fn create_runtime(config: RuntimeConfigV1) -> Result<IntegratedRuntimeV2, (String, String)> {
    let content_hash = canonical_hash(config.content_hash);
    let generator_hash = canonical_hash(config.generator_hash);
    let runtime = IntegratedRuntimeV2::new(IntegratedRuntimeConfigV2 {
        world_seed: config.world_seed,
        universe_id: config.universe_id,
        location_id: config.location_id,
        session_id: config.session_id,
        content_hash,
        generator_hash,
        block_catalog: BlockCatalogV1 {
            directional_blocks: config.directional_block_ids.into_iter().collect::<BTreeSet<_>>(),
            waterlogged_blocks: config.waterlogged_block_ids.into_iter().collect::<BTreeSet<_>>(),
            water_block_id: config.water_block_id,
        },
    })
    .map_err(|error| (error.code, error.message))?;
    Ok(runtime)
}

fn dispatch_command(
    runtime: &IntegratedRuntimeV2,
    batch: &RuntimeCommandBatchV1,
) -> Result<(IntegratedRuntimeV2, Vec<RuntimeDomainOperationV1>), (String, String)> {
    let mut candidate = runtime.clone();
    let mut receipts = Vec::with_capacity(batch.operations.len());
    for (index, operation) in batch.operations.iter().enumerate() {
        if operation.schema != 1 {
            return Err((
                "unsupported-domain-schema".into(),
                format!(
                    "{}:{} schema {} is not registered",
                    domain_name(operation.domain),
                    operation.type_id,
                    operation.schema
                ),
            ));
        }
        let response = match (operation.domain, operation.type_id.as_str()) {
            (RuntimeDomainV1::Simulation, SIMULATION_PLAYER_BIND_TYPE_V1) => {
                let binding = decode_runtime_player_binding_v1(&operation.payload)
                    .map_err(|error| (error.code.into(), error.message))?;
                candidate
                    .bind_player(binding)
                    .map_err(|error| (error.code, error.message))?;
                domain_operation(
                    RuntimeDomainV1::Simulation,
                    SIMULATION_PLAYER_BIND_RECEIPT_TYPE_V1,
                    domain_ack(*b"BWB5", operation, &candidate),
                )
            }
            (RuntimeDomainV1::Entities, ENTITY_COMMAND_TYPE_V1) => {
                let command = decode_entity_command_batch_v1(&operation.payload)
                    .map_err(|error| (error.code.into(), error.message))?;
                let mut root = IntegratedRuntimeBatchV2::empty(
                    format!("{}:entity:{index}", batch.command_id),
                    candidate.identity(),
                );
                root.entities.push(command);
                match candidate.commit(root) {
                    IntegratedRuntimeReceiptV2::Accepted(receipt) => {
                        let event = receipt.entities.first().ok_or_else(|| {
                            (
                                "entity-receipt".into(),
                                "entity command returned no native receipt".into(),
                            )
                        })?;
                        domain_operation(
                            RuntimeDomainV1::Entities,
                            ENTITY_RECEIPT_TYPE_V1,
                            encode_entity_event_batch_v1(event).map_err(|error| (error.code.into(), error.message))?,
                        )
                    }
                    IntegratedRuntimeReceiptV2::Rejected(rejection) => {
                        return Err((rejection.code, rejection.message));
                    }
                }
            }
            (RuntimeDomainV1::Gameplay, GAMEPLAY_ACTOR_GRANT_TYPE_V1) => {
                let (actor_id, grant) = decode_gameplay_actor_grant_v1(&operation.payload)
                    .map_err(|error| (error.code.into(), error.message))?;
                candidate
                    .grant_gameplay_actor(actor_id, grant)
                    .map_err(|error| (error.code, error.message))?;
                domain_operation(
                    RuntimeDomainV1::Gameplay,
                    GAMEPLAY_ACTOR_GRANT_RECEIPT_TYPE_V1,
                    domain_ack(*b"BWK7", operation, &candidate),
                )
            }
            (RuntimeDomainV1::Gameplay, GAMEPLAY_COMMAND_TYPE_V1) => {
                let command =
                    decode_gameplay_batch_v1(&operation.payload).map_err(|error| (error.code.into(), error.message))?;
                let mut root = IntegratedRuntimeBatchV2::empty(
                    format!("{}:gameplay:{index}", batch.command_id),
                    candidate.identity(),
                );
                root.gameplay.push(command);
                match candidate.commit(root) {
                    IntegratedRuntimeReceiptV2::Accepted(receipt) => {
                        let gameplay = receipt.gameplay.first().ok_or_else(|| {
                            (
                                "gameplay-receipt".into(),
                                "gameplay command returned no native receipt".into(),
                            )
                        })?;
                        domain_operation(
                            RuntimeDomainV1::Gameplay,
                            GAMEPLAY_RECEIPT_TYPE_V1,
                            encode_gameplay_receipt_v1(gameplay).map_err(|error| (error.code.into(), error.message))?,
                        )
                    }
                    IntegratedRuntimeReceiptV2::Rejected(rejection) => {
                        return Err((rejection.code, rejection.message));
                    }
                }
            }
            (RuntimeDomainV1::Persistence, PERSISTENCE_DISPATCH_TYPE_V1) => {
                let command = decode_runtime_persistence_dispatch_v1(&operation.payload)
                    .map_err(|error| (error.code.into(), error.message))?;
                let receipt = candidate
                    .dispatch_persistence(command)
                    .map_err(|error| (error.code, error.message))?;
                domain_operation(
                    RuntimeDomainV1::Persistence,
                    PERSISTENCE_DISPATCH_RECEIPT_TYPE_V1,
                    encode_runtime_persistence_dispatch_receipt_v1(&receipt)
                        .map_err(|error| (error.code.into(), error.message))?,
                )
            }
            (RuntimeDomainV1::Network, NETWORK_PEER_GRANT_TYPE_V1) => {
                let grant = decode_network_peer_grant_v1(&operation.payload)
                    .map_err(|error| (error.code.into(), error.message))?;
                candidate
                    .upsert_network_peer_grant(grant)
                    .map_err(|error| (error.code, error.message))?;
                domain_operation(
                    RuntimeDomainV1::Network,
                    NETWORK_GRANT_RECEIPT_TYPE_V1,
                    domain_ack(*b"BWP9", operation, &candidate),
                )
            }
            (RuntimeDomainV1::Network, NETWORK_AGENT_GRANT_TYPE_V1) => {
                let grant = decode_network_agent_grant_v1(&operation.payload)
                    .map_err(|error| (error.code.into(), error.message))?;
                candidate
                    .upsert_network_agent_grant(grant)
                    .map_err(|error| (error.code, error.message))?;
                domain_operation(
                    RuntimeDomainV1::Network,
                    NETWORK_GRANT_RECEIPT_TYPE_V1,
                    domain_ack(*b"BWJ9", operation, &candidate),
                )
            }
            (RuntimeDomainV1::Network, NETWORK_REPLICATION_UPSERT_TYPE_V1) => {
                let value = decode_network_replication_record_v1(&operation.payload)
                    .map_err(|error| (error.code.into(), error.message))?;
                candidate
                    .upsert_network_replication_record(value)
                    .map_err(|error| (error.code, error.message))?;
                domain_operation(
                    RuntimeDomainV1::Network,
                    NETWORK_REPLICATION_RECEIPT_TYPE_V1,
                    domain_ack(*b"BWI9", operation, &candidate),
                )
            }
            (RuntimeDomainV1::Network, NETWORK_REPLICATION_REMOVE_TYPE_V1) => {
                let value = decode_network_replication_record_v1(&operation.payload)
                    .map_err(|error| (error.code.into(), error.message))?;
                if !candidate.remove_network_replication_record(&value.record) {
                    return Err((
                        "network-record-missing".into(),
                        "replication record is not registered".into(),
                    ));
                }
                domain_operation(
                    RuntimeDomainV1::Network,
                    NETWORK_REPLICATION_RECEIPT_TYPE_V1,
                    domain_ack(*b"BWR9", operation, &candidate),
                )
            }
            (RuntimeDomainV1::Network, NETWORK_DELTA_BUILD_TYPE_V1) => {
                let value = decode_network_delta_build_request_v1(&operation.payload)
                    .map_err(|error| (error.code.into(), error.message))?;
                let (delta, stats) = candidate
                    .build_network_delta(value.source, &value.interest)
                    .map_err(|error| (error.code, error.message))?;
                let packet =
                    encode_network_delta_v1(&delta).map_err(|error| ("network-delta".into(), error.to_string()))?;
                domain_operation(
                    RuntimeDomainV1::Network,
                    NETWORK_DELTA_BUILD_RESPONSE_TYPE_V1,
                    encode_delta_build_response(&packet, &stats),
                )
            }
            (RuntimeDomainV1::Network, NETWORK_RECONNECT_TYPE_V1) => {
                let value = decode_network_reconnect_request_v1(&operation.payload)
                    .map_err(|error| (error.code.into(), error.message))?;
                let checkpoint = candidate
                    .network_reconnect_checkpoint(&value.session_id, &value.peer_id, value.connection_generation)
                    .map_err(|error| (error.code, error.message))?;
                let packet = checkpoint
                    .as_ref()
                    .map(encode_network_checkpoint_v1)
                    .transpose()
                    .map_err(|error| ("network-reconnect".into(), error.to_string()))?;
                domain_operation(
                    RuntimeDomainV1::Network,
                    NETWORK_RECONNECT_RESPONSE_TYPE_V1,
                    encode_reconnect_response(packet.as_deref()),
                )
            }
            (RuntimeDomainV1::Network, NETWORK_PEER_RELEASE_TYPE_V1) => {
                let peer_id = decode_network_peer_release_v1(&operation.payload)
                    .map_err(|error| (error.code.into(), error.message))?;
                candidate
                    .release_network_peer(&peer_id)
                    .map_err(|error| (error.code, error.message))?;
                domain_operation(
                    RuntimeDomainV1::Network,
                    NETWORK_PEER_RELEASE_RECEIPT_TYPE_V1,
                    domain_ack(*b"BWL9", operation, &candidate),
                )
            }
            (RuntimeDomainV1::Network, NETWORK_COMMAND_RELEASE_TYPE_V1) => {
                let command_id = decode_network_command_release_v1(&operation.payload)
                    .map_err(|error| (error.code.into(), error.message))?;
                candidate
                    .release_network_command(&command_id)
                    .map_err(|error| (error.code, error.message))?;
                domain_operation(
                    RuntimeDomainV1::Network,
                    NETWORK_COMMAND_RELEASE_RECEIPT_TYPE_V1,
                    domain_ack(*b"BWM9", operation, &candidate),
                )
            }
            (RuntimeDomainV1::Network, NETWORK_REQUEST_TYPE_V1) => {
                let payload = candidate
                    .process_network_browser_packet(&operation.payload)
                    .map_err(|error| (error.code, error.message))?;
                domain_operation(RuntimeDomainV1::Network, NETWORK_RESPONSE_TYPE_V1, payload)
            }
            _ => {
                return Err((
                    "unsupported-domain-codec".into(),
                    format!(
                        "{}:{} schema {} is not registered in the integrated runtime",
                        domain_name(operation.domain),
                        operation.type_id,
                        operation.schema,
                    ),
                ));
            }
        };
        receipts.push(response);
    }
    Ok((candidate, receipts))
}

fn domain_operation(domain: RuntimeDomainV1, type_id: &str, payload: Vec<u8>) -> RuntimeDomainOperationV1 {
    let payload_hash = WireHash(wire_checksum_v1(&payload));
    RuntimeDomainOperationV1 {
        domain,
        type_id: type_id.into(),
        schema: 1,
        payload,
        payload_hash,
    }
}

fn domain_ack(magic: [u8; 4], operation: &RuntimeDomainOperationV1, runtime: &IntegratedRuntimeV2) -> Vec<u8> {
    let mut payload = Vec::with_capacity(38);
    payload.extend_from_slice(&magic);
    payload.extend_from_slice(&1_u16.to_le_bytes());
    payload.extend_from_slice(&operation.payload_hash.0);
    payload.extend_from_slice(runtime.state_hash().as_bytes());
    payload
}

fn encode_delta_build_response(packet: &[u8], stats: &InterestSelectionStatsV1) -> Vec<u8> {
    let mut payload = Vec::with_capacity(22 + packet.len());
    payload.extend_from_slice(b"BWH9");
    payload.extend_from_slice(&1_u16.to_le_bytes());
    payload.extend_from_slice(&(stats.scope_probes as u32).to_le_bytes());
    payload.extend_from_slice(&(stats.candidate_records as u32).to_le_bytes());
    payload.extend_from_slice(&(stats.emitted_records as u32).to_le_bytes());
    payload.extend_from_slice(&(packet.len() as u32).to_le_bytes());
    payload.extend_from_slice(packet);
    payload
}

fn encode_reconnect_response(packet: Option<&[u8]>) -> Vec<u8> {
    let mut payload = Vec::with_capacity(11 + packet.map_or(0, <[u8]>::len));
    payload.extend_from_slice(b"BWC9");
    payload.extend_from_slice(&1_u16.to_le_bytes());
    payload.push(u8::from(packet.is_some()));
    if let Some(packet) = packet {
        payload.extend_from_slice(&(packet.len() as u32).to_le_bytes());
        payload.extend_from_slice(packet);
    }
    payload
}

fn accepted_receipt_hash(
    command_hash: WireHash,
    before: &RuntimeIdentityV1,
    after: &RuntimeIdentityV1,
    receipts: &[RuntimeDomainOperationV1],
) -> WireHash {
    let mut payload = Vec::with_capacity(48 + receipts.len() * 16);
    payload.extend_from_slice(&command_hash.0);
    payload.extend_from_slice(&before.state_hash.0);
    payload.extend_from_slice(&after.state_hash.0);
    for receipt in receipts {
        payload.extend_from_slice(&receipt.payload_hash.0);
    }
    WireHash(wire_checksum_v1(&payload))
}

fn rejected_command_receipt(
    batch: &RuntimeCommandBatchV1,
    code: impl Into<String>,
    message: impl Into<String>,
    current: RuntimeIdentityV1,
) -> RuntimeCommandReceiptV1 {
    let code = code.into();
    let message = message.into();
    let mut payload = Vec::with_capacity(32 + code.len() + message.len());
    payload.extend_from_slice(&batch.command_hash.0);
    payload.extend_from_slice(&current.state_hash.0);
    payload.extend_from_slice(code.as_bytes());
    payload.extend_from_slice(message.as_bytes());
    RuntimeCommandReceiptV1::Rejected {
        command_id: batch.command_id.clone(),
        idempotency_key: batch.idempotency_key.clone(),
        command_hash: batch.command_hash,
        code,
        message,
        current,
        receipt_hash: WireHash(wire_checksum_v1(&payload)),
    }
}

fn canonical_hash(hash: WireHash) -> CanonicalHash {
    CanonicalHash(hash.0)
}

fn wire_hash(hash: CanonicalHash) -> WireHash {
    WireHash(hash.0)
}

fn persistence_outcome_hash(outcome: &PersistenceDispatchOutcomeV1) -> WireHash {
    let mut bytes = Vec::with_capacity(128 + outcome.payload.len() + outcome.code.len() + outcome.message.len());
    bytes.extend_from_slice(b"BWDO");
    bytes.extend_from_slice(&1_u16.to_le_bytes());
    bytes.extend_from_slice(&outcome.transfer_token.to_le_bytes());
    bytes.extend_from_slice(&outcome.request_id.to_le_bytes());
    bytes.push(match outcome.status {
        PersistenceDispatchStatusV1::Accepted => 1,
        PersistenceDispatchStatusV1::Empty => 2,
        PersistenceDispatchStatusV1::Rejected => 3,
    });
    bytes.extend_from_slice(
        &outcome
            .operation
            .map_or(0_u16, |operation| operation as u16)
            .to_le_bytes(),
    );
    bytes.extend_from_slice(&outcome.persistence_revision.to_le_bytes());
    bytes.extend_from_slice(&outcome.storage_revision.to_le_bytes());
    bytes.extend_from_slice(outcome.durable_hash.as_bytes());
    bytes.push(u8::from(outcome.next_cursor.is_some()));
    if let Some(cursor) = outcome.next_cursor {
        bytes.extend_from_slice(&cursor.to_le_bytes());
    }
    bytes.push(match outcome.retry {
        PersistenceRetryDirectiveV1::None => 0,
        PersistenceRetryDirectiveV1::RetryAfterBackoff { .. } => 1,
        PersistenceRetryDirectiveV1::RecoverBeforeRetry => 2,
        PersistenceRetryDirectiveV1::CompactBeforeRetry => 3,
        PersistenceRetryDirectiveV1::ParentFallback => 4,
        PersistenceRetryDirectiveV1::Stop => 5,
    });
    if let PersistenceRetryDirectiveV1::RetryAfterBackoff { delay_milliseconds } = outcome.retry {
        bytes.extend_from_slice(&delay_milliseconds.to_le_bytes());
    }
    if let Some(receipt) = &outcome.durable_commit {
        bytes.push(1);
        bytes.extend_from_slice(&receipt.request_id.to_le_bytes());
        bytes.extend_from_slice(&(receipt.transaction_id.len() as u32).to_le_bytes());
        bytes.extend_from_slice(receipt.transaction_id.as_bytes());
        bytes.extend_from_slice(&receipt.journal_sequence.to_le_bytes());
        bytes.extend_from_slice(receipt.durable_hash.as_bytes());
        bytes.extend_from_slice(receipt.checkpoint_hash.as_bytes());
    } else {
        bytes.push(0);
    }
    for value in [&outcome.payload, outcome.code.as_bytes(), outcome.message.as_bytes()] {
        bytes.extend_from_slice(&(value.len() as u32).to_le_bytes());
        bytes.extend_from_slice(value);
    }
    WireHash(wire_checksum_v1(&bytes))
}

fn wire_identity(identity: &IntegratedRuntimeIdentityV2) -> RuntimeIdentityV1 {
    RuntimeIdentityV1 {
        universe_id: identity.universe_id.clone(),
        location_id: identity.location_id.clone(),
        revision: RuntimeRevisionV1 {
            epoch: identity.revision.epoch,
            world: identity.revision.world,
            entities: identity.revision.entities,
            gameplay: identity.revision.gameplay,
            persistence: identity.revision.persistence,
            network: identity.revision.network,
            simulation: identity.revision.simulation,
        },
        tick: identity.tick,
        state_hash: wire_hash(identity.state_hash),
    }
}

fn encode_diagnostics(runtime: &IntegratedRuntimeV2) -> Vec<u8> {
    let revision = runtime.revision();
    let mut output = Vec::with_capacity(4 + 9 * 8 + 16);
    output.extend_from_slice(b"BWRX");
    output.extend_from_slice(&runtime.tick().to_le_bytes());
    for value in [
        revision.epoch,
        revision.world,
        revision.entities,
        revision.gameplay,
        revision.persistence,
        revision.network,
        revision.simulation,
    ] {
        output.extend_from_slice(&value.to_le_bytes());
    }
    output.extend_from_slice(runtime.state_hash().as_bytes());
    output
}

fn runtime_extraction_revision(runtime: &IntegratedRuntimeV2) -> u64 {
    let revision = runtime.revision();
    [
        runtime.tick(),
        revision.epoch,
        revision.world,
        revision.entities,
        revision.gameplay,
        revision.persistence,
        revision.network,
        revision.simulation,
    ]
    .into_iter()
    .fold(0_u64, u64::saturating_add)
}

fn encode_render_extraction(runtime: &IntegratedRuntimeV2) -> Vec<u8> {
    let entities = runtime.entities();
    let mut output = Vec::with_capacity(16 + entities.len().saturating_mul(160));
    output.extend_from_slice(b"BWR6");
    output.extend_from_slice(&1_u16.to_le_bytes());
    output.extend_from_slice(&runtime_extraction_revision(runtime).to_le_bytes());
    output.extend_from_slice(&(entities.len() as u32).to_le_bytes());
    for (id, entity) in entities.hot() {
        write_render_entity(
            &mut output,
            id.packed(),
            0,
            entity.tier as u16,
            entity.protection.bits(),
            &entity.record,
        );
    }
    for (id, entity) in entities.cold() {
        write_render_entity(
            &mut output,
            id.packed(),
            1,
            blockwild_entity::SimulationTier::Dormant as u16,
            entity.protection.bits(),
            &entity.record,
        );
    }
    output
}

fn write_render_entity(
    output: &mut Vec<u8>,
    entity_id: u64,
    residency: u8,
    simulation_tier: u16,
    protection: u64,
    record: &blockwild_entity::EntityCompatibilityRecord,
) {
    output.extend_from_slice(&entity_id.to_le_bytes());
    output.push(residency);
    output.push(record.class as u8);
    output.extend_from_slice(&simulation_tier.to_le_bytes());
    output.extend_from_slice(&protection.to_le_bytes());
    write_extraction_string(output, &record.external_entity_id);
    write_extraction_string(output, &record.specimen_id);
    write_extraction_string(output, &record.kind_key);
    write_extraction_optional_string(output, record.variant_key.as_deref());
    write_extraction_optional_string(output, record.name.as_deref());
    write_extraction_string(
        output,
        record
            .custom
            .get("modelKey")
            .or_else(|| record.custom.get("model"))
            .map_or(record.kind_key.as_str(), String::as_str),
    );
    for value in [
        record.position.x,
        record.position.y,
        record.position.z,
        record.yaw,
        record.velocity.x,
        record.velocity.y,
        record.velocity.z,
        record.health,
        record.maximum_health,
    ] {
        output.extend_from_slice(&value.to_le_bytes());
    }
    output.push(u8::from(record.tamed));
}

fn encode_hud_extraction(runtime: &IntegratedRuntimeV2) -> Vec<u8> {
    let identity = runtime.identity();
    let mut output = Vec::with_capacity(128);
    output.extend_from_slice(b"BWH7");
    output.extend_from_slice(&1_u16.to_le_bytes());
    output.extend_from_slice(&identity.tick.to_le_bytes());
    output.extend_from_slice(identity.state_hash.as_bytes());
    for value in [
        identity.revision.epoch,
        identity.revision.world,
        identity.revision.entities,
        identity.revision.gameplay,
        identity.revision.persistence,
        identity.revision.network,
        identity.revision.simulation,
    ] {
        output.extend_from_slice(&value.to_le_bytes());
    }
    if let Some(input) = runtime.last_applied_input() {
        output.push(1);
        output.extend_from_slice(&input.sequence.to_le_bytes());
        output.extend_from_slice(&input.target_tick.to_le_bytes());
        output.extend_from_slice(&input.move_x.to_le_bytes());
        output.extend_from_slice(&input.move_z.to_le_bytes());
        output.extend_from_slice(&input.look_yaw.to_le_bytes());
        output.extend_from_slice(&input.look_pitch.to_le_bytes());
        output.extend_from_slice(&input.buttons.to_le_bytes());
        output.push(input.selected_slot);
        output.push(input.flags);
    } else {
        output.push(0);
    }
    output
}

fn encode_audio_extraction() -> Vec<u8> {
    let mut output = Vec::with_capacity(10);
    output.extend_from_slice(b"BWAU");
    output.extend_from_slice(&1_u16.to_le_bytes());
    output.extend_from_slice(&0_u32.to_le_bytes());
    output
}

fn encode_platform_extraction(runtime: &IntegratedRuntimeV2) -> Vec<u8> {
    let diagnostics = runtime.persistence_dispatcher().diagnostics();
    let pending = diagnostics.queued.saturating_add(diagnostics.in_flight);
    if pending == 0 {
        return Vec::new();
    }
    let mut output = Vec::with_capacity(42);
    output.extend_from_slice(b"BWPQ");
    output.extend_from_slice(&1_u16.to_le_bytes());
    output.extend_from_slice(
        &u32::try_from(pending)
            .expect("persistence dispatcher pending count is bounded")
            .to_le_bytes(),
    );
    output.extend_from_slice(&(diagnostics.queued_bytes as u64).to_le_bytes());
    output.extend_from_slice(&diagnostics.persistence_revision.to_le_bytes());
    output.extend_from_slice(diagnostics.state_hash.as_bytes());
    output
}

fn write_extraction_string(output: &mut Vec<u8>, value: &str) {
    let length = u32::try_from(value.len()).expect("validated entity string fits u32");
    output.extend_from_slice(&length.to_le_bytes());
    output.extend_from_slice(value.as_bytes());
}

fn write_extraction_optional_string(output: &mut Vec<u8>, value: Option<&str>) {
    output.push(u8::from(value.is_some()));
    if let Some(value) = value {
        write_extraction_string(output, value);
    }
}

fn capabilities() -> Vec<String> {
    CAPABILITIES.iter().map(|value| (*value).to_owned()).collect()
}

fn domain_name(domain: blockwild_runtime_wire::RuntimeDomainV1) -> &'static str {
    match domain {
        blockwild_runtime_wire::RuntimeDomainV1::World => "world",
        blockwild_runtime_wire::RuntimeDomainV1::Simulation => "simulation",
        blockwild_runtime_wire::RuntimeDomainV1::Entities => "entities",
        blockwild_runtime_wire::RuntimeDomainV1::Gameplay => "gameplay",
        blockwild_runtime_wire::RuntimeDomainV1::Persistence => "persistence",
        blockwild_runtime_wire::RuntimeDomainV1::Network => "network",
    }
}

fn encode_error(
    request_id: u32,
    client_epoch: u32,
    code: impl Into<String>,
    message: impl Into<String>,
    current: Option<RuntimeIdentityV1>,
) -> Vec<u8> {
    encode(RuntimeResponseV1::Error {
        request_id,
        client_epoch,
        worker_epoch: WORKER_EPOCH,
        code: code.into(),
        message: message.into(),
        current,
    })
}

fn bulk_runtime_error(
    request_id: u32,
    client_epoch: u32,
    error: IntegratedRuntimeError,
    runtime: &IntegratedRuntimeV2,
) -> RuntimeBulkResponseV1 {
    RuntimeBulkResponseV1::Error {
        request_id,
        client_epoch,
        worker_epoch: WORKER_EPOCH,
        code: error.code,
        message: error.message,
        current: Some(RuntimeBulkStateV1::from(&wire_identity(&runtime.identity()))),
    }
}

fn encode(response: RuntimeResponseV1) -> Vec<u8> {
    encode_response_v1(&response).unwrap_or_default()
}

fn encode_bulk_control(
    handle: u32,
    response: RuntimeBulkResponseV1,
    attachments: &mut BTreeMap<(u32, u64), Vec<u8>>,
) -> Vec<u8> {
    let attachment_metadata = match &response {
        RuntimeBulkResponseV1::PlatformRequest {
            request_id,
            client_epoch,
            worker_epoch,
            current,
            transfer_token,
            ..
        }
        | RuntimeBulkResponseV1::Data {
            request_id,
            client_epoch,
            worker_epoch,
            current,
            transfer_token,
            ..
        } => Some((
            *request_id,
            *client_epoch,
            *worker_epoch,
            current.clone(),
            *transfer_token,
        )),
        _ => None,
    };
    let Ok(RuntimeBulkEncodedV1 { control, attachment }) = encode_bulk_response_v1(&response) else {
        return Vec::new();
    };
    if let Some((request_id, client_epoch, worker_epoch, current, token)) = attachment_metadata
        && !attachment.is_empty()
    {
        let pending = attachments
            .keys()
            .filter(|(runtime_handle, _)| *runtime_handle == handle)
            .count();
        let queued_bytes = attachments
            .iter()
            .filter(|((runtime_handle, _), _)| *runtime_handle == handle)
            .fold(0_usize, |total, (_, bytes)| total.saturating_add(bytes.len()));
        let rejection = if attachments.contains_key(&(handle, token)) {
            Some((
                "bulk-attachment-collision",
                "Rust reused a live bulk platform transfer token",
            ))
        } else if pending >= RUNTIME_BULK_MAX_PENDING_V1
            || queued_bytes.saturating_add(attachment.len()) > RUNTIME_BULK_MAX_QUEUED_BYTES_V1
        {
            Some((
                "bulk-attachment-capacity",
                "Rust bulk platform attachment storage is full",
            ))
        } else {
            None
        };
        if let Some((code, message)) = rejection {
            return encode_bulk_response_v1(&RuntimeBulkResponseV1::Error {
                request_id,
                client_epoch,
                worker_epoch,
                code: code.into(),
                message: message.into(),
                current: Some(current),
            })
            .map_or_else(|_| Vec::new(), |encoded| encoded.control);
        }
        attachments.insert((handle, token), attachment);
    }
    control
}

#[cfg(test)]
mod tests {
    use blockwild_engine::{
        RuntimePersistenceDispatchWireV1, RuntimePlayerBindingWireV1, encode_entity_command_batch_v1,
        encode_runtime_persistence_dispatch_v1, encode_runtime_player_binding_v1,
    };
    use blockwild_entity::{
        ENTITY_COMMAND_SCHEMA, EntityClass, EntityCommand, EntityCommandBatch, EntityCompatibilityRecord,
        EntityResidency, Vec3 as EntityVec3,
    };
    use blockwild_runtime_wire::{
        RuntimeBulkRequestV1, RuntimeBulkResponseV1, RuntimeBulkStateV1, RuntimeInputFrameV1, RuntimeRequestV1,
        RuntimeRevisionV1, decode_bulk_response_v1, decode_response_v1, encode_bulk_request_v1, encode_request_v1,
        seal_runtime_command_batch_v1,
    };

    use super::*;

    fn create_request(request_id: u32) -> RuntimeRequestV1 {
        RuntimeRequestV1::Create {
            request_id,
            client_epoch: 1,
            config: RuntimeConfigV1 {
                world_seed: "wasm-integrated".into(),
                universe_id: "1".into(),
                location_id: "surface".into(),
                session_id: "test".into(),
                content_hash: WireHash([1; 16]),
                generator_hash: WireHash([2; 16]),
                water_block_id: 7,
                directional_block_ids: vec![],
                waterlogged_block_ids: vec![],
            },
        }
    }

    #[test]
    fn create_extract_and_destroy_use_one_live_generational_handle() {
        let request = create_request(1);
        let response = decode_response_v1(&blockwild_runtime_create_v2(&encode_request_v1(&request).unwrap())).unwrap();
        let RuntimeResponseV1::Ready {
            runtime_handle,
            identity,
            capabilities,
            ..
        } = response
        else {
            panic!("expected ready")
        };
        let has_capability = |expected: &str| capabilities.iter().any(|capability| capability == expected);
        assert!(has_capability("fixed-step-input-v1-pending-live-cutover"));
        assert!(has_capability("bounded-extraction-v1-pending-live-domain-views"));
        assert!(!has_capability("fixed-step-input-v1"));
        assert!(!has_capability("bounded-extraction-v1"));
        assert!(has_capability("bulk-platform-v1"));
        let extract = RuntimeRequestV1::Extract {
            request_id: 2,
            client_epoch: 1,
            expected: identity.clone(),
            after_revision: 0,
            max_bytes: 1_024,
        };
        let extracted = decode_response_v1(&blockwild_runtime_extract_v2(
            runtime_handle,
            &encode_request_v1(&extract).unwrap(),
        ))
        .unwrap();
        assert!(matches!(extracted, RuntimeResponseV1::Extraction { .. }));
        let shutdown = RuntimeRequestV1::Shutdown {
            request_id: 3,
            client_epoch: 1,
            expected: Some(identity),
        };
        let stopped = decode_response_v1(&blockwild_runtime_destroy_v2(
            runtime_handle,
            &encode_request_v1(&shutdown).unwrap(),
        ))
        .unwrap();
        assert!(matches!(stopped, RuntimeResponseV1::Shutdown { .. }));
        let missing = decode_response_v1(&blockwild_runtime_destroy_v2(
            runtime_handle,
            &encode_request_v1(&shutdown).unwrap(),
        ))
        .unwrap();
        assert!(matches!(missing, RuntimeResponseV1::Error { .. }));
    }

    #[test]
    fn nonempty_input_is_accepted_once_and_applied_at_its_target_tick() {
        let response = decode_response_v1(&blockwild_runtime_create_v2(
            &encode_request_v1(&create_request(21)).unwrap(),
        ))
        .unwrap();
        let RuntimeResponseV1::Ready {
            runtime_handle,
            identity,
            ..
        } = response
        else {
            panic!("expected ready")
        };
        let mut record = EntityCompatibilityRecord::new("player:wasm", "player:wasm", "player");
        record.class = EntityClass::Player;
        record.position = EntityVec3::new(8.0, 64.0, 8.0);
        record.health = 20.0;
        record.maximum_health = 20.0;
        let entity_payload = encode_entity_command_batch_v1(&EntityCommandBatch {
            schema: ENTITY_COMMAND_SCHEMA,
            sequence: 1,
            expected_revision: 0,
            tick: 0,
            commands: vec![EntityCommand::Spawn {
                record,
                residency: EntityResidency::Hot,
            }],
        })
        .unwrap();
        let binding_payload = encode_runtime_player_binding_v1(&RuntimePlayerBindingWireV1 {
            external_entity_id: "player:wasm".into(),
            radius: 0.35,
            standing_height: 1.8,
            crouching_height: 1.35,
            mass: 80.0,
            walk_speed: 4.3,
            sprint_speed: 6.2,
            creative_flight_speed: 8.0,
            maximum_oxygen_seconds: 15.0,
        })
        .unwrap();
        let batch = seal_runtime_command_batch_v1(RuntimeCommandBatchV1 {
            command_id: "wasm-player-install".into(),
            idempotency_key: "wasm-player-install".into(),
            actor_id: "platform:player".into(),
            expected: identity,
            operations: vec![
                domain_operation(RuntimeDomainV1::Entities, ENTITY_COMMAND_TYPE_V1, entity_payload),
                domain_operation(
                    RuntimeDomainV1::Simulation,
                    SIMULATION_PLAYER_BIND_TYPE_V1,
                    binding_payload,
                ),
            ],
            command_hash: WireHash::default(),
        })
        .unwrap();
        let installed = decode_response_v1(&blockwild_runtime_command_v2(
            runtime_handle,
            &encode_request_v1(&RuntimeRequestV1::Command {
                request_id: 22,
                client_epoch: 1,
                batch,
            })
            .unwrap(),
        ))
        .unwrap();
        let RuntimeResponseV1::CommandReceipt {
            receipt: RuntimeCommandReceiptV1::Accepted { after: identity, .. },
            ..
        } = installed
        else {
            panic!("expected player installation receipt")
        };
        let step = RuntimeRequestV1::Step {
            request_id: 23,
            client_epoch: 1,
            expected: identity.clone(),
            monotonic_time_us: 1_000_000,
            budget_us: 8_000,
            inputs: vec![RuntimeInputFrameV1 {
                sequence: 1,
                target_tick: identity.tick + 1,
                move_x: 1_000,
                ..RuntimeInputFrameV1::default()
            }],
        };
        let queued = decode_response_v1(&blockwild_runtime_step_v2(
            runtime_handle,
            &encode_request_v1(&step).unwrap(),
        ))
        .unwrap();
        let RuntimeResponseV1::StepResult {
            identity: queued_identity,
            inputs_applied: 0,
            ..
        } = queued
        else {
            panic!("expected queued input step")
        };
        assert_ne!(queued_identity.state_hash, identity.state_hash);
        let apply = RuntimeRequestV1::Step {
            request_id: 24,
            client_epoch: 1,
            expected: queued_identity,
            monotonic_time_us: 1_050_000,
            budget_us: 8_000,
            inputs: vec![],
        };
        let applied = decode_response_v1(&blockwild_runtime_step_v2(
            runtime_handle,
            &encode_request_v1(&apply).unwrap(),
        ))
        .unwrap();
        assert!(
            matches!(
                &applied,
                RuntimeResponseV1::StepResult {
                    inputs_applied: 1,
                    fixed_steps: 1,
                    ..
                }
            ),
            "unexpected step response: {applied:?}"
        );
    }

    #[test]
    fn bulk_dispatcher_polls_and_completes_one_exact_platform_request() {
        let response = decode_response_v1(&blockwild_runtime_create_v2(
            &encode_request_v1(&create_request(11)).unwrap(),
        ))
        .unwrap();
        let RuntimeResponseV1::Ready {
            runtime_handle,
            identity,
            ..
        } = response
        else {
            panic!("expected ready")
        };
        let dispatch_payload = encode_runtime_persistence_dispatch_v1(&RuntimePersistenceDispatchWireV1::Estimate {
            world_id: "world:wasm".into(),
        })
        .unwrap();
        let batch = seal_runtime_command_batch_v1(RuntimeCommandBatchV1 {
            command_id: "persistence-estimate".into(),
            idempotency_key: "persistence-estimate".into(),
            actor_id: "platform:persistence".into(),
            expected: identity,
            operations: vec![domain_operation(
                RuntimeDomainV1::Persistence,
                PERSISTENCE_DISPATCH_TYPE_V1,
                dispatch_payload,
            )],
            command_hash: WireHash::default(),
        })
        .unwrap();
        let dispatched = decode_response_v1(&blockwild_runtime_command_v2(
            runtime_handle,
            &encode_request_v1(&RuntimeRequestV1::Command {
                request_id: 12,
                client_epoch: 1,
                batch,
            })
            .unwrap(),
        ))
        .unwrap();
        let RuntimeResponseV1::CommandReceipt {
            receipt: RuntimeCommandReceiptV1::Accepted { after: identity, .. },
            ..
        } = dispatched
        else {
            panic!("expected persistence dispatch receipt")
        };
        let poll = RuntimeBulkRequestV1::Poll {
            request_id: 12,
            client_epoch: 1,
            expected: RuntimeBulkStateV1::from(&identity),
            max_bytes: 8 * 1024 * 1024,
        };
        let encoded = encode_bulk_request_v1(&poll).unwrap();
        let control = blockwild_runtime_bulk_v2(runtime_handle, &encoded.control, &encoded.attachment);
        let transfer_token = u64::from_le_bytes(control[144..152].try_into().unwrap());
        let attachment = blockwild_runtime_bulk_take_attachment_v2(runtime_handle, transfer_token as f64);
        let platform = decode_bulk_response_v1(&control, &attachment).unwrap();
        let RuntimeBulkResponseV1::PlatformRequest { current, payload, .. } = platform else {
            panic!("expected dispatcher BWPR")
        };
        let request = blockwild_persistence::decode_persistence_platform_request_v1(&payload).unwrap();
        assert_eq!(
            request.operation,
            blockwild_persistence::PersistencePlatformOperationV1::Estimate
        );
        let response = blockwild_persistence::encode_persistence_platform_response_v1(
            &blockwild_persistence::PersistencePlatformResponseV1 {
                request_id: request.request_id,
                operation: request.operation,
                code: blockwild_persistence::PersistencePlatformResultCodeV1::Accepted,
                storage_revision: 7,
                durable_hash: CanonicalHash([9; 16]),
                next_cursor: None,
                payload: vec![],
                message: "estimated".into(),
            },
        )
        .unwrap();
        let complete = RuntimeBulkRequestV1::Complete {
            request_id: 13,
            client_epoch: 1,
            expected: current,
            transfer_token,
            type_id: blockwild_runtime_wire::PERSISTENCE_RESPONSE_TYPE_V1.into(),
            payload: response,
        };
        let encoded = encode_bulk_request_v1(&complete).unwrap();
        let control = blockwild_runtime_bulk_v2(runtime_handle, &encoded.control, &encoded.attachment);
        assert!(matches!(
            decode_bulk_response_v1(&control, &[]).unwrap(),
            RuntimeBulkResponseV1::Completed { transfer_token: completed, .. } if completed == transfer_token
        ));
    }

    #[test]
    fn bulk_save_stage_is_idempotent_conflict_safe_and_stale_closed() {
        let response = decode_response_v1(&blockwild_runtime_create_v2(
            &encode_request_v1(&create_request(71)).unwrap(),
        ))
        .unwrap();
        let RuntimeResponseV1::Ready {
            runtime_handle,
            identity,
            capabilities,
            ..
        } = response
        else {
            panic!("expected ready")
        };
        assert!(
            capabilities
                .iter()
                .any(|value| value == "native-save-hydration-v1-pending-r6-r7-records")
        );
        assert!(!capabilities.iter().any(|value| value == "native-save-hydration-v1"));

        let stage = |request_id, expected, payload: Vec<u8>| RuntimeBulkRequestV1::StageSaveChunk {
            request_id,
            client_epoch: 1,
            expected,
            stage_id: "sävë-一-🌿".into(),
            chunk_index: 0,
            chunk_count: 1,
            total_bytes: 4,
            payload,
        };
        let call = |request: RuntimeBulkRequestV1| {
            let encoded = encode_bulk_request_v1(&request).unwrap();
            let control = blockwild_runtime_bulk_v2(runtime_handle, &encoded.control, &encoded.attachment);
            decode_bulk_response_v1(&control, &[]).unwrap()
        };
        let original = RuntimeBulkStateV1::from(&identity);
        let staged = call(stage(72, original.clone(), vec![0, 0x80, 0xff, 0x7f]));
        let RuntimeBulkResponseV1::SaveProgress {
            current,
            state: RuntimeBulkSaveStageStateV1::Staged,
            received_chunks: 1,
            ..
        } = staged
        else {
            panic!("expected staged receipt")
        };
        assert_ne!(current.state_hash, original.state_hash);

        let duplicate = call(stage(73, current.clone(), vec![0, 0x80, 0xff, 0x7f]));
        assert!(matches!(
            duplicate,
            RuntimeBulkResponseV1::SaveProgress { current: duplicate_current, .. }
                if duplicate_current == current
        ));
        let conflict = call(stage(74, current.clone(), vec![0, 0x80, 0xfe, 0x7f]));
        assert!(matches!(
            conflict,
            RuntimeBulkResponseV1::Error { code, current: Some(error_current), .. }
                if code == "save-stage-conflict" && error_current == current
        ));
        let stale = call(RuntimeBulkRequestV1::FinalizeSave {
            request_id: 75,
            client_epoch: 1,
            expected: original,
            stage_id: "sävë-一-🌿".into(),
            created_at: 9,
        });
        assert!(matches!(
            stale,
            RuntimeBulkResponseV1::Error { code, .. } if code == "stale-runtime"
        ));
        let cancelled = call(RuntimeBulkRequestV1::CancelSaveStage {
            request_id: 76,
            client_epoch: 1,
            expected: current,
            stage_id: "sävë-一-🌿".into(),
        });
        let RuntimeBulkResponseV1::SaveProgress {
            current,
            state: RuntimeBulkSaveStageStateV1::Cancelled,
            ..
        } = cancelled
        else {
            panic!("expected cancellation receipt")
        };
        let unavailable = call(RuntimeBulkRequestV1::HydrateRecovery {
            request_id: 77,
            client_epoch: 1,
            expected: current,
            recovery_id: "missing".into(),
        });
        assert!(matches!(
            unavailable,
            RuntimeBulkResponseV1::Error { code, .. } if code == "recovery-incomplete"
        ));
    }

    #[test]
    fn bulk_attachment_store_rejects_live_token_reuse_and_unconsumed_backlog() {
        let handle = 44;
        let current = RuntimeBulkStateV1 {
            revision: RuntimeRevisionV1::default(),
            tick: 1,
            state_hash: WireHash([1; 16]),
        };
        let platform_response = |request_id, transfer_token| RuntimeBulkResponseV1::PlatformRequest {
            request_id,
            client_epoch: 1,
            worker_epoch: WORKER_EPOCH,
            current: current.clone(),
            transfer_token,
            type_id: blockwild_runtime_wire::PERSISTENCE_REQUEST_TYPE_V1.into(),
            payload: vec![0x80, 0xff],
        };
        let mut attachments = BTreeMap::new();
        attachments.insert((handle, 1), vec![1]);

        let duplicate = encode_bulk_control(handle, platform_response(31, 1), &mut attachments);
        assert!(matches!(
            decode_bulk_response_v1(&duplicate, &[]).unwrap(),
            RuntimeBulkResponseV1::Error { code, .. } if code == "bulk-attachment-collision"
        ));
        assert_eq!(attachments.get(&(handle, 1)).map(Vec::as_slice), Some([1].as_slice()));

        attachments.insert((handle, 2), vec![2]);
        let over_capacity = encode_bulk_control(handle, platform_response(32, 3), &mut attachments);
        assert!(matches!(
            decode_bulk_response_v1(&over_capacity, &[]).unwrap(),
            RuntimeBulkResponseV1::Error { code, .. } if code == "bulk-attachment-capacity"
        ));
        assert_eq!(attachments.len(), RUNTIME_BULK_MAX_PENDING_V1);

        let mut hydrated = BTreeMap::new();
        let data = RuntimeBulkResponseV1::Data {
            request_id: 33,
            client_epoch: 1,
            worker_epoch: WORKER_EPOCH,
            current,
            transfer_token: 44,
            type_id: PERSISTENCE_COMPATIBILITY_HYDRATION_CHUNK_TYPE_V1.into(),
            chunk_index: 0,
            chunk_count: 1,
            payload: vec![0x80, 0xff],
        };
        let control = encode_bulk_control(handle, data, &mut hydrated);
        assert_eq!(hydrated.remove(&(handle, 44)), Some(vec![0x80, 0xff]));
        assert!(matches!(
            decode_bulk_response_v1(&control, &[0x80, 0xff]).unwrap(),
            RuntimeBulkResponseV1::Data { transfer_token: 44, .. }
        ));
    }
}
