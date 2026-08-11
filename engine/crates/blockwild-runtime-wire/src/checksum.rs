//! Raw-byte checksum shared exactly with the TypeScript BWRQ/BWRS codec.

pub const WIRE_CHECKSUM_DOMAIN_V1: &[u8] = b"blockwild.integrated.wire.checksum.v1";

const FNV64_OFFSET: u64 = 14_695_981_039_346_656_037;
const FNV64_PRIME: u64 = 1_099_511_628_211;
const FNV64_HIGH_PRIME: u64 = FNV64_PRIME ^ 0x13b;
const HIGH_OFFSET_XOR: u64 = 0xa076_1d64_78bd_642f;

fn update(lanes: (u64, u64), byte: u8) -> (u64, u64) {
    (
        (lanes.0 ^ u64::from(byte)).wrapping_mul(FNV64_PRIME),
        (lanes.1 ^ ((u64::from(byte) << 1) | 1)).wrapping_mul(FNV64_HIGH_PRIME),
    )
}

/// Computes the exact 128-bit little-endian checksum used by BWRQ/BWRS V1.
///
/// This intentionally does not call Blockwild's canonical state/replay hash.
/// A protocol-owned checksum has a frozen raw-byte domain and can evolve
/// independently from authoritative state hashing. Cross-language fixtures
/// prove the exact definition for UTF-8 and bytes above `0x7f`.
#[must_use]
pub fn wire_checksum_v1(bytes: &[u8]) -> [u8; 16] {
    let mut lanes = (FNV64_OFFSET, FNV64_OFFSET ^ HIGH_OFFSET_XOR);
    for byte in WIRE_CHECKSUM_DOMAIN_V1 {
        lanes = update(lanes, *byte);
    }
    lanes = update(lanes, 0);
    for byte in (bytes.len() as u64).to_le_bytes() {
        lanes = update(lanes, byte);
    }
    for byte in bytes {
        lanes = update(lanes, *byte);
    }
    let mut output = [0_u8; 16];
    output[..8].copy_from_slice(&lanes.0.to_le_bytes());
    output[8..].copy_from_slice(&lanes.1.to_le_bytes());
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hex(bytes: [u8; 16]) -> String {
        bytes.iter().map(|byte| format!("{byte:02x}")).collect()
    }

    #[test]
    fn matches_high_byte_and_utf8_typescript_vectors() {
        assert_eq!(
            hex(wire_checksum_v1(&[0x00, 0x7f, 0x80, 0xff, 0xf0, 0x9f, 0x8c, 0xbf])),
            "18007f90bc156d363883ac4694dd592e"
        );
        assert_eq!(hex(wire_checksum_v1(&[0x80, 0xff])), "ef264763ac90023338b59f1e51918657");
    }
}
