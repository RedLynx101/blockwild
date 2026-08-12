import { TypeScriptCanonicalHasher } from "./rust-kernel-shadow";

const PLAYER_ID_DERIVATION_DOMAIN_V1 = "blockwild.types.player-id.v1";
const LOCATION_ID_DERIVATION_DOMAIN_V1 = "blockwild.types.location-id.v1";
const MAX_STABLE_KEY_BYTES_V1 = 1_024;
const textEncoder = new TextEncoder();

export class RustIntegratedIdentityDerivationErrorV1 extends Error {
  readonly name = "RustIntegratedIdentityDerivationErrorV1";

  constructor(readonly code: "identity-key", message: string) {
    super(message);
  }
}

function canonicalKey(value: string, label: string) {
  if (typeof value !== "string"
    || value.length === 0
    || textEncoder.encode(value).byteLength > MAX_STABLE_KEY_BYTES_V1
    || /[\u0000-\u001f\u007f-\u009f]/u.test(value)
    || /[\ud800-\udfff]/u.test(value)) {
    throw new RustIntegratedIdentityDerivationErrorV1(
      "identity-key",
      `${label} must contain 1..${MAX_STABLE_KEY_BYTES_V1} well-formed, visible UTF-8 bytes`,
    );
  }
  return value;
}

function derivePackedIdV1(domain: string, universeKey: string, stableKey: string) {
  const digest = new TypeScriptCanonicalHasher(domain)
    .writeString(canonicalKey(universeKey, "universe key"))
    .writeString(canonicalKey(stableKey, "stable key"))
    .finish();
  const packed = new DataView(digest.buffer, digest.byteOffset, digest.byteLength).getBigUint64(0, true);
  return packed === BigInt(0) ? BigInt(1) : packed;
}

/** Exact browser mirror of `blockwild_types::derive_player_id_v1`. */
export function deriveRustIntegratedPlayerIdV1(universeKey: string, playerKey: string) {
  return derivePackedIdV1(PLAYER_ID_DERIVATION_DOMAIN_V1, universeKey, playerKey);
}

/** Exact browser mirror of `blockwild_types::derive_location_id_v1`. */
export function deriveRustIntegratedLocationIdV1(universeKey: string, locationKey: string) {
  return derivePackedIdV1(LOCATION_ID_DERIVATION_DOMAIN_V1, universeKey, locationKey);
}
