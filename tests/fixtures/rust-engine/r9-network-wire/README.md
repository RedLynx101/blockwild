# BWN1 native differential vectors

`native-bwn1-vectors.json` is byte output from the public
`blockwild-network` Rust constructors and `encode_network_*_v1` functions.
The canonical set uses `canonical_network_fixture_v1`; the second set adds
multibyte UTF-8 labels, high opaque bytes, JavaScript-safe `u64` boundary
values, a keyframe, and little-endian negative X/Z coordinates inside the
opaque world-command payload.

`tests/rust-network-wire-v1.test.ts` independently authors the same values
through the TypeScript authority contract and requires exact frame hex. This
makes changes to header fields, tags, string byte lengths, normalization,
hashes, or record order fail loudly instead of merely round-tripping within
one implementation.
