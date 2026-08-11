//! The only WebAssembly-facing Blockwild engine ABI.

use std::cell::RefCell;
use std::collections::BTreeMap;

use blockwild_engine::{Engine, EngineConfig};
use blockwild_protocol::{Envelope, MessageKind, PROTOCOL_VERSION, ProtocolError, ProtocolErrorCode, SCHEMA_VERSION};
#[cfg(feature = "renderer")]
use blockwild_render::{SceneFixture, smoke_offscreen};
use wasm_bindgen::prelude::*;

#[derive(Default)]
struct EngineStore {
    next_handle: u32,
    engines: BTreeMap<u32, Engine>,
}

impl EngineStore {
    fn insert(&mut self, engine: Engine) -> u32 {
        self.next_handle = self.next_handle.wrapping_add(1).max(1);
        while self.engines.contains_key(&self.next_handle) {
            self.next_handle = self.next_handle.wrapping_add(1).max(1);
        }
        let handle = self.next_handle;
        self.engines.insert(handle, engine);
        handle
    }
}

thread_local! {
    static ENGINES: RefCell<EngineStore> = RefCell::new(EngineStore::default());
}

#[wasm_bindgen]
#[must_use]
pub fn blockwild_protocol_version() -> u32 {
    PROTOCOL_VERSION as u32
}

#[wasm_bindgen]
#[must_use]
pub fn blockwild_schema_version() -> u32 {
    SCHEMA_VERSION as u32
}

#[wasm_bindgen]
#[must_use]
pub fn blockwild_engine_create(config_envelope: &[u8]) -> Vec<u8> {
    let request = match Envelope::decode(config_envelope) {
        Ok(value) => value,
        Err(error) => return error.into_envelope(0, 0, 0).encode(),
    };
    if request.header.kind != MessageKind::CapabilityHello {
        return ProtocolError::new(
            ProtocolErrorCode::InvalidPayload,
            request.header.kind as u32,
            "create expects CapabilityHello",
        )
        .into_envelope(
            request.header.request_id,
            request.header.epoch,
            request.header.ownership_token,
        )
        .encode();
    }
    let world_seed = String::from_utf8(request.payload).unwrap_or_else(|_| "blockwild-rust-shadow".into());
    let handle = ENGINES.with(|store| {
        store.borrow_mut().insert(Engine::new(EngineConfig {
            world_seed,
            ..EngineConfig::default()
        }))
    });
    let mut payload = Vec::with_capacity(12);
    payload.extend_from_slice(&handle.to_le_bytes());
    payload.extend_from_slice(&PROTOCOL_VERSION.to_le_bytes());
    payload.extend_from_slice(&SCHEMA_VERSION.to_le_bytes());
    payload.extend_from_slice(&0_u32.to_le_bytes()); // baseline transferable-buffer capability flags
    Envelope::new(
        MessageKind::CapabilityAck,
        request.header.request_id,
        request.header.epoch,
        request.header.ownership_token,
        payload,
    )
    .encode()
}

#[wasm_bindgen]
#[must_use]
pub fn blockwild_engine_ingest(handle: u32, batch: &[u8]) -> Vec<u8> {
    with_engine(handle, batch, |engine, request| {
        engine.ingest(batch)?;
        Ok(Envelope::new(
            MessageKind::CapabilityAck,
            request.header.request_id,
            request.header.epoch,
            request.header.ownership_token,
            Vec::new(),
        ))
    })
}

#[wasm_bindgen]
#[must_use]
pub fn blockwild_engine_step(handle: u32, monotonic_time_us: f64, budget_us: u32) -> Vec<u8> {
    let monotonic = if monotonic_time_us.is_finite() && monotonic_time_us >= 0.0 {
        monotonic_time_us.min(9_007_199_254_740_991.0) as u64
    } else {
        0
    };
    ENGINES.with(|store| {
        let mut store = store.borrow_mut();
        let Some(engine) = store.engines.get_mut(&handle) else {
            return invalid_handle(handle).encode();
        };
        match engine.step(monotonic, budget_us) {
            Ok(summary) => {
                let mut payload = Vec::with_capacity(32);
                payload.extend_from_slice(&summary.tick.to_le_bytes());
                payload.extend_from_slice(&summary.steps.to_le_bytes());
                payload.extend_from_slice(&summary.commands_applied.to_le_bytes());
                payload.extend_from_slice(summary.state_hash.as_bytes());
                Envelope::new(MessageKind::Events, 0, summary.tick as u32, u64::from(handle), payload).encode()
            }
            Err(error) => error.into_envelope(0, 0, u64::from(handle)).encode(),
        }
    })
}

#[wasm_bindgen]
#[must_use]
pub fn blockwild_engine_take_events(handle: u32) -> Vec<u8> {
    ENGINES.with(|store| {
        let mut store = store.borrow_mut();
        let Some(engine) = store.engines.get_mut(&handle) else {
            return invalid_handle(handle).encode();
        };
        let events = engine.take_events();
        let mut payload = Vec::new();
        payload.extend_from_slice(&(events.len() as u32).to_le_bytes());
        for event in events {
            let encoded = event.encode();
            payload.extend_from_slice(&(encoded.len() as u32).to_le_bytes());
            payload.extend_from_slice(&encoded);
        }
        Envelope::new(MessageKind::Events, 0, 0, u64::from(handle), payload).encode()
    })
}

#[wasm_bindgen]
#[must_use]
pub fn blockwild_engine_state_hash(handle: u32) -> Vec<u8> {
    ENGINES.with(|store| {
        let store = store.borrow();
        let Some(engine) = store.engines.get(&handle) else {
            return invalid_handle(handle).encode();
        };
        Envelope::new(
            MessageKind::StateHash,
            0,
            0,
            u64::from(handle),
            engine.state_hash().as_bytes().to_vec(),
        )
        .encode()
    })
}

#[wasm_bindgen]
#[must_use]
pub fn blockwild_engine_destroy(handle: u32) -> Vec<u8> {
    ENGINES.with(|store| {
        let mut store = store.borrow_mut();
        let Some(mut engine) = store.engines.remove(&handle) else {
            return invalid_handle(handle).encode();
        };
        engine.shutdown();
        Envelope::new(MessageKind::Shutdown, 0, 0, u64::from(handle), Vec::new()).encode()
    })
}

/// Canonical scene bytes consumed by both the Three.js oracle and `wgpu` smoke path.
#[cfg(feature = "renderer")]
#[wasm_bindgen]
#[must_use]
pub fn blockwild_render_smoke_fixture() -> Vec<u8> {
    SceneFixture::smoke().envelope().encode()
}

/// Run the real browser-WebGPU offscreen smoke path and return capability diagnostics.
#[cfg(feature = "renderer")]
#[wasm_bindgen]
pub async fn blockwild_render_smoke() -> String {
    let diagnostic = smoke_offscreen().await;
    format!(
        "{{\"status\":\"{:?}\",\"backend\":\"{}\",\"adapter\":\"{}\",\"deviceType\":\"{}\",\"driver\":\"{}\",\"fixtureHash\":\"{}\",\"message\":\"{}\",\"maxTextureDimension2d\":{},\"maxStorageBufferBindingSize\":{}}}",
        diagnostic.status,
        json_escape(&diagnostic.backend),
        json_escape(&diagnostic.adapter_name),
        json_escape(&diagnostic.device_type),
        json_escape(&diagnostic.driver),
        diagnostic.fixture_hash.to_hex(),
        json_escape(&diagnostic.message),
        diagnostic.max_texture_dimension_2d,
        diagnostic.max_storage_buffer_binding_size,
    )
}

#[cfg(feature = "renderer")]
fn json_escape(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for character in value.chars() {
        match character {
            '"' => escaped.push_str("\\\""),
            '\\' => escaped.push_str("\\\\"),
            '\n' => escaped.push_str("\\n"),
            '\r' => escaped.push_str("\\r"),
            '\t' => escaped.push_str("\\t"),
            character if character.is_control() => {
                use core::fmt::Write as _;
                write!(&mut escaped, "\\u{:04x}", character as u32).expect("writing to String cannot fail");
            }
            character => escaped.push(character),
        }
    }
    escaped
}

fn with_engine(
    handle: u32,
    request_bytes: &[u8],
    operation: impl FnOnce(&mut Engine, &Envelope) -> Result<Envelope, ProtocolError>,
) -> Vec<u8> {
    let request = match Envelope::decode(request_bytes) {
        Ok(value) => value,
        Err(error) => return error.into_envelope(0, 0, u64::from(handle)).encode(),
    };
    ENGINES.with(|store| {
        let mut store = store.borrow_mut();
        let Some(engine) = store.engines.get_mut(&handle) else {
            return invalid_handle(handle).encode();
        };
        match operation(engine, &request) {
            Ok(response) => response.encode(),
            Err(error) => error
                .into_envelope(
                    request.header.request_id,
                    request.header.epoch,
                    request.header.ownership_token,
                )
                .encode(),
        }
    })
}

fn invalid_handle(handle: u32) -> Envelope {
    ProtocolError::new(ProtocolErrorCode::InvalidHandle, handle, "unknown engine handle").into_envelope(
        0,
        0,
        u64::from(handle),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn facade_negotiates_steps_hashes_and_destroys() {
        let hello = Envelope::new(MessageKind::CapabilityHello, 7, 1, 99, b"test-world".to_vec()).encode();
        let ack = Envelope::decode(&blockwild_engine_create(&hello)).unwrap();
        assert_eq!(ack.header.kind, MessageKind::CapabilityAck);
        let handle = u32::from_le_bytes(ack.payload[..4].try_into().unwrap());
        let step = Envelope::decode(&blockwild_engine_step(handle, 1_000_000.0, 1_000)).unwrap();
        assert_eq!(step.header.kind, MessageKind::Events);
        let hash = Envelope::decode(&blockwild_engine_state_hash(handle)).unwrap();
        assert_eq!(hash.payload.len(), 16);
        let destroyed = Envelope::decode(&blockwild_engine_destroy(handle)).unwrap();
        assert_eq!(destroyed.header.kind, MessageKind::Shutdown);
        let missing = Envelope::decode(&blockwild_engine_state_hash(handle)).unwrap();
        assert_eq!(missing.header.kind, MessageKind::Error);
    }
}
