import { legacyTerrainGeneratorHashV2 } from "./terrain-generation-contract";
import { currentRustWorldBlockCatalogR4V1 } from "./rust-world-authority-runtime-r4";
import type { RustWorldRuntimeHostConfigV1 } from "./rust-world-runtime-host";
import { GENERATOR_VERSION } from "./world";

const WORLD_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,47}$/u;
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/u;
const LOCATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/u;

export type RustWorldRuntimeLiveConfigInputV1 = Readonly<{
  worldId: string;
  worldSeed: string;
  sessionId: string;
  locationId?: string;
}>;

export function createRustWorldRuntimeSessionIdV1(randomUuid?: () => string) {
  const uuid = randomUuid?.() ?? globalThis.crypto?.randomUUID?.();
  if (!uuid) throw new Error("Secure random UUID generation is unavailable for the Rust runtime session");
  const sessionId = `runtime:${uuid}`;
  if (!SESSION_ID_PATTERN.test(sessionId)) throw new Error("Rust runtime session ID is invalid");
  return sessionId;
}

/**
 * Derives the immutable native identity from the browser catalog record. A
 * duplicated world may share a seed, but it never shares its universe ID.
 */
export function createRustWorldRuntimeLiveConfigV1(
  input: RustWorldRuntimeLiveConfigInputV1,
): RustWorldRuntimeHostConfigV1 {
  if (!WORLD_ID_PATTERN.test(input.worldId)) throw new Error("Rust runtime world ID is not a canonical browser world ID");
  if (!input.worldSeed || input.worldSeed.length > 512) throw new Error("Rust runtime world seed must contain 1..512 UTF-16 code units");
  if (!SESSION_ID_PATTERN.test(input.sessionId)) throw new Error("Rust runtime session ID is invalid");
  const locationId = input.locationId ?? "overworld";
  if (!LOCATION_ID_PATTERN.test(locationId)) throw new Error("Rust runtime location ID is invalid");
  const catalog = currentRustWorldBlockCatalogR4V1();
  return Object.freeze({
    worldSeed: input.worldSeed,
    universeId: `world:${input.worldId}`,
    locationId,
    sessionId: input.sessionId,
    generatorHash: legacyTerrainGeneratorHashV2(`g${GENERATOR_VERSION}`),
    waterBlockId: catalog.waterBlockId,
    directionalBlockIds: catalog.directionalBlocks,
    waterloggedBlockIds: catalog.waterloggedBlocks,
  });
}
