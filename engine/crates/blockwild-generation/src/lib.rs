//! Deterministic whole-chunk terrain generation for Blockwild.

mod adventure;
mod contract;
mod dragon;
mod features;
mod generator;
mod legendary;
mod noise;
mod roads;
mod service;
mod settlement;
mod settlement_layout;
mod underground;
mod wire;

pub use contract::{
    BiomeId, Block, ChunkPayloadV2, GENERATOR_VERSION, GenerateChunkRequestV2, GenerationError, GenerationOptions,
    GenerationProfile, MarkerRow, PROTOCOL_VERSION, ParityCertificate, REQUEST_SCHEMA_VERSION, RESULT_SCHEMA_VERSION,
};
pub use generator::{ColumnSample, TerrainGeneratorV18};
pub use service::{
    CancellationToken, GenerationDiagnostics, GenerationOutcome, GenerationService, GenerationServiceConfig,
    StaleReason, fixture_request,
};
pub use wire::{decode_request, decode_result, encode_request, encode_result};

/// Pure Wasm-facing whole-packet entry point. Platform adapters translate
/// errors into their existing engine envelope without exposing Rust layouts.
pub fn generate_packet_v2(bytes: &[u8]) -> Result<Vec<u8>, GenerationError> {
    let request = decode_request(bytes)?;
    let payload = TerrainGeneratorV18::from_request(&request).generate(&request, || false)?;
    encode_result(&payload)
}

/// Generator-v18 promotion certificate minted from the checked-in,
/// fail-closed TypeScript/Rust corpus. CI recomputes all 131 whole chunks,
/// including every named planner family and a 64-case signed-coordinate sweep.
#[must_use]
pub fn parity_certificate_json_v2() -> String {
    format!(
        "{{\"generatorVersion\":{GENERATOR_VERSION},\"generatorHash\":\"161eef7e34381d450067b7ebedbcb4e1\",\"contentHash\":\"cc59903be77dfe30109d15bfaf0e3022\",\"corpusHash\":\"11604d437bd0c32d30164d1a8093d8dc\",\"corpusCases\":131,\"byteEqual\":true}}"
    )
}

#[cfg(test)]
mod packet_tests {
    use super::*;

    #[test]
    fn wasm_packet_entry_point_is_deterministic_and_self_validating() {
        let request = fixture_request("packet", -31, 47, 1);
        let input = encode_request(&request).unwrap();
        let first = generate_packet_v2(&input).unwrap();
        let second = generate_packet_v2(&input).unwrap();
        assert_eq!(first, second);
        decode_result(&first).unwrap().validate(&request).unwrap();
    }

    #[test]
    fn shipped_certificate_identifies_the_fail_closed_promotion_corpus() {
        let certificate = parity_certificate_json_v2();
        assert!(certificate.contains("\"generatorVersion\":18"));
        assert!(certificate.contains("\"byteEqual\":true"));
        assert!(certificate.contains("\"corpusCases\":131"));
        assert!(certificate.contains("\"corpusHash\":\"11604d437bd0c32d30164d1a8093d8dc\""));
    }
}
