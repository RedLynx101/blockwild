/// Offset basis used by Blockwild's existing TypeScript FNV-1a seed function.
pub const FNV1A_32_OFFSET: u32 = 2_166_136_261;
/// Prime used by Blockwild's existing TypeScript FNV-1a seed function.
pub const FNV1A_32_PRIME: u32 = 16_777_619;

const FNV1A_64_OFFSET: u64 = 14_695_981_039_346_656_037;
const FNV1A_64_PRIME: u64 = 1_099_511_628_211;

/// Hash a Rust string exactly as JavaScript iterates `charCodeAt`: UTF-16 code units.
#[must_use]
pub fn fnv1a_utf16(text: &str) -> u32 {
    fnv1a_utf16_units(&text.encode_utf16().collect::<Vec<_>>())
}

/// Hash explicit UTF-16 code units, including lone surrogates representable by JavaScript.
#[must_use]
pub fn fnv1a_utf16_units(units: &[u16]) -> u32 {
    units.iter().copied().fold(FNV1A_32_OFFSET, |hash, unit| {
        (hash ^ u32::from(unit)).wrapping_mul(FNV1A_32_PRIME)
    })
}

/// Derive a non-zero xorshift32 stream from an authored seed and stream name.
#[must_use]
pub fn seed_stream(seed: &str, stream: &str) -> u32 {
    let mut value = fnv1a_utf16(seed);
    value ^= fnv1a_utf16(stream).rotate_left(13);
    value = value.wrapping_mul(0x9e37_79b1);
    if value == 0 { 0x6d2b_79f5 } else { value }
}

/// Integer numerator of the current TypeScript `hash2` terrain primitive.
#[must_use]
pub const fn hash2_bits(x: i32, z: i32, seed: u32) -> u32 {
    let mut value = (x as u32)
        .wrapping_mul(374_761_393)
        .wrapping_add((z as u32).wrapping_mul(668_265_263))
        .wrapping_add(seed.wrapping_mul(1_442_695_041));
    value = (value ^ (value >> 13)).wrapping_mul(1_274_126_177);
    value ^ (value >> 16)
}

/// Normalized current TypeScript `hash2` terrain primitive.
#[must_use]
pub fn hash2(x: i32, z: i32, seed: u32) -> f64 {
    f64::from(hash2_bits(x, z, seed)) / f64::from(u32::MAX)
}

/// Integer numerator of the current TypeScript `hash3` terrain primitive.
#[must_use]
pub const fn hash3_bits(x: i32, y: i32, z: i32, seed: u32) -> u32 {
    let mut value = (x as u32)
        .wrapping_mul(374_761_393)
        .wrapping_add((y as u32).wrapping_mul(1_103_515_245))
        .wrapping_add((z as u32).wrapping_mul(668_265_263))
        .wrapping_add(seed.wrapping_mul(1_597_334_677));
    value = (value ^ (value >> 15)).wrapping_mul(2_246_822_519);
    value ^ (value >> 13)
}

/// Normalized current TypeScript `hash3` terrain primitive.
#[must_use]
pub fn hash3(x: i32, y: i32, z: i32, seed: u32) -> f64 {
    f64::from(hash3_bits(x, y, z, seed)) / f64::from(u32::MAX)
}

/// Stable, non-cryptographic 128-bit digest used by differential replays.
#[derive(Clone, Copy, Debug, Default, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct CanonicalHash(pub [u8; 16]);

impl CanonicalHash {
    #[must_use]
    pub const fn as_bytes(&self) -> &[u8; 16] {
        &self.0
    }

    #[must_use]
    pub fn to_hex(self) -> String {
        let mut output = String::with_capacity(32);
        for byte in self.0 {
            use core::fmt::Write as _;
            write!(&mut output, "{byte:02x}").expect("writing to String cannot fail");
        }
        output
    }
}

/// Incremental canonical hasher with two domain-separated FNV-1a lanes.
#[derive(Clone, Debug)]
pub struct CanonicalHasher {
    low: u64,
    high: u64,
}

impl Default for CanonicalHasher {
    fn default() -> Self {
        Self {
            low: FNV1A_64_OFFSET,
            high: FNV1A_64_OFFSET ^ 0xa076_1d64_78bd_642f,
        }
    }
}

impl CanonicalHasher {
    #[must_use]
    pub fn new(domain: &str) -> Self {
        let mut hasher = Self::default();
        hasher.write_str(domain);
        hasher
    }

    pub fn write_bytes(&mut self, bytes: &[u8]) {
        self.write_u64(bytes.len() as u64);
        for &byte in bytes {
            self.low = (self.low ^ u64::from(byte)).wrapping_mul(FNV1A_64_PRIME);
            self.high = (self.high ^ u64::from(byte).rotate_left(1)).wrapping_mul(FNV1A_64_PRIME ^ 0x13b);
        }
    }

    pub fn write_str(&mut self, value: &str) {
        self.write_bytes(value.as_bytes());
    }

    pub fn write_u16(&mut self, value: u16) {
        self.write_bytes_raw(&value.to_le_bytes());
    }

    pub fn write_u32(&mut self, value: u32) {
        self.write_bytes_raw(&value.to_le_bytes());
    }

    pub fn write_i32(&mut self, value: i32) {
        self.write_bytes_raw(&value.to_le_bytes());
    }

    pub fn write_u64(&mut self, value: u64) {
        self.write_bytes_raw(&value.to_le_bytes());
    }

    fn write_bytes_raw(&mut self, bytes: &[u8]) {
        for &byte in bytes {
            self.low = (self.low ^ u64::from(byte)).wrapping_mul(FNV1A_64_PRIME);
            self.high = (self.high ^ (u64::from(byte) << 1 | 1)).wrapping_mul(FNV1A_64_PRIME ^ 0x13b);
        }
    }

    #[must_use]
    pub fn finish(&self) -> CanonicalHash {
        let mut bytes = [0_u8; 16];
        bytes[..8].copy_from_slice(&self.low.to_le_bytes());
        bytes[8..].copy_from_slice(&self.high.to_le_bytes());
        CanonicalHash(bytes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fnv_matches_javascript_utf16_vectors() {
        assert_eq!(fnv1a_utf16(""), 2_166_136_261);
        assert_eq!(fnv1a_utf16("Blockwild"), 3_449_464_762);
        assert_eq!(fnv1a_utf16("world-below-v15"), 3_687_954_586);
        assert_eq!(fnv1a_utf16("A🌿B"), 3_408_612_333);
        assert_eq!(fnv1a_utf16_units(&[0xd83c]), 948_053_755);
        assert_eq!(fnv1a_utf16_units(&[0xdf3f]), 964_521_870);
    }

    #[test]
    fn canonical_hash_is_order_sensitive_and_stable() {
        let mut first = CanonicalHasher::new("player");
        first.write_u32(7);
        first.write_str("north");
        let mut second = CanonicalHasher::new("player");
        second.write_u32(7);
        second.write_str("north");
        let mut reversed = CanonicalHasher::new("player");
        reversed.write_str("north");
        reversed.write_u32(7);
        assert_eq!(first.finish(), second.finish());
        assert_ne!(first.finish(), reversed.finish());
    }

    #[test]
    fn terrain_hashes_match_typescript_imul_vectors() {
        assert_eq!(hash2_bits(0, 0, 0), 0);
        assert_eq!(hash2_bits(-17, 33, 3_449_464_762), 12_922_865);
        assert_eq!(hash2_bits(i32::MAX, i32::MIN, 3_687_954_586), 413_212_002);
        assert_eq!(hash3_bits(0, 0, 0, 0), 0);
        assert_eq!(hash3_bits(-17, -64, 33, 3_449_464_762), 2_300_723_848);
        assert_eq!(hash3_bits(i32::MAX, 127, i32::MIN, 3_687_954_586), 1_837_433_641);
    }
}
