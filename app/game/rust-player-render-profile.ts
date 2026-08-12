import {
  decodeRenderEntityModelCatalogR10,
  findRenderEntityCompiledModelR10,
  type RenderEntityCompiledModelCatalogR10,
  type RenderEntityCompiledModelR10,
  type RenderEntityModelCatalogManifestR10,
} from "./rust-render-entity-catalog-r10.ts";

export const PLAYER_RENDER_PROFILE_SCHEMA_V1 = 1 as const;
export const PLAYER_RENDER_PROFILE_SCHEMA_ID_V1 = "player-render-profile" as const;
export const PLAYER_RENDER_PROFILE_ID_V1 = "player:standing" as const;
export const PLAYER_RENDER_MODEL_ID_V1 = "player-standing" as const;
export const PLAYER_RENDER_MODEL_POSE_V1 = "standing" as const;
export const PLAYER_RENDER_CATALOG_REVISION_V1 = 1 as const;

export type PlayerRenderProfileV1 = Readonly<{
  schema: 1;
  role: "player";
  catalog: Readonly<{
    schema: 2;
    format: "blockwild-compiled-model-catalog-v2";
    revision: number;
    sha256: string;
    canonicalHash: string;
    byteLength: number;
    modelCount: number;
    nodeCount: number;
    source: string;
  }>;
  model: Readonly<{
    id: "player-standing";
    label: string;
    pose: "standing";
    category: number;
    groundY: number;
    nodeCount: number;
  }>;
}>;

export type PublishedRenderModelCatalogManifestV1 = Readonly<{
  schema: 2;
  format: "blockwild-compiled-model-catalog-v2";
  current: string;
  artifact: string;
  sha256: string;
  catalogHash: string;
  byteLength: number;
  modelCount: number;
  nodeCount: number;
  source: string;
}>;

export type AttestedPlayerRenderProfileV1 = Readonly<{
  profile: PlayerRenderProfileV1;
  catalog: RenderEntityCompiledModelCatalogR10;
  model: RenderEntityCompiledModelR10;
}>;

/**
 * The production player binding is deliberately content-addressed. The
 * tracked BWM2 catalog test derives this complete object again from the bytes,
 * so changing or rebuilding the catalog cannot silently leave a stale pin.
 */
export const BLOCKWILD_PLAYER_RENDER_PROFILE_V1: PlayerRenderProfileV1 = Object.freeze({
  schema: PLAYER_RENDER_PROFILE_SCHEMA_V1,
  role: "player",
  catalog: Object.freeze({
    schema: 2,
    format: "blockwild-compiled-model-catalog-v2",
    revision: PLAYER_RENDER_CATALOG_REVISION_V1,
    sha256: "12c522f880e94c1ae527de701ae3e710fee13701d66fbb0a4ad24895557011b4",
    canonicalHash: "52fd4aebb0c457f3c83af79af6b83c93",
    byteLength: 785_824,
    modelCount: 252,
    nodeCount: 13_121,
    source: "renderer-neutral model specs and offline production captures",
  }),
  model: Object.freeze({
    id: PLAYER_RENDER_MODEL_ID_V1,
    label: "Player · Standing",
    pose: PLAYER_RENDER_MODEL_POSE_V1,
    category: 2,
    groundY: 0,
    nodeCount: 25,
  }),
});

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new TypeError(message);
}

function exactInteger(value: unknown, minimum: number, maximum: number, label: string) {
  invariant(typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum,
    `${label} is invalid`);
  return value;
}

function exactString(value: unknown, label: string) {
  invariant(typeof value === "string" && value.length > 0 && !/\p{Cc}/u.test(value), `${label} is invalid`);
  return value;
}

function lowercaseHex(value: unknown, length: number, label: string) {
  invariant(typeof value === "string" && value.length === length && /^[0-9a-f]+$/u.test(value), `${label} is invalid`);
  return value;
}

export function parsePublishedRenderModelCatalogManifestV1(value: unknown): PublishedRenderModelCatalogManifestV1 {
  invariant(typeof value === "object" && value !== null && !Array.isArray(value), "renderer model manifest is not an object");
  const manifest = value as Record<string, unknown>;
  invariant(manifest.schema === 2, "renderer model manifest schema is unsupported");
  invariant(manifest.format === "blockwild-compiled-model-catalog-v2", "renderer model manifest format is unsupported");
  const current = lowercaseHex(manifest.current, 64, "renderer model manifest current hash");
  const sha256 = lowercaseHex(manifest.sha256, 64, "renderer model manifest SHA-256");
  invariant(current === sha256, "renderer model manifest current and SHA-256 disagree");
  const artifact = exactString(manifest.artifact, "renderer model manifest artifact");
  invariant(artifact === `/${current}/models.bwm2`, "renderer model manifest artifact is not content-addressed by current");
  return Object.freeze({
    schema: 2,
    format: "blockwild-compiled-model-catalog-v2",
    current,
    artifact,
    sha256,
    catalogHash: lowercaseHex(manifest.catalogHash, 32, "renderer model manifest canonical hash"),
    byteLength: exactInteger(manifest.byteLength, 1, 64 * 1_048_576, "renderer model manifest byte length"),
    modelCount: exactInteger(manifest.modelCount, 1, 4_096, "renderer model manifest model count"),
    nodeCount: exactInteger(manifest.nodeCount, 1, 0xffff_ffff, "renderer model manifest node count"),
    source: exactString(manifest.source, "renderer model manifest source"),
  });
}

function profileFromAttestedCatalog(
  manifest: PublishedRenderModelCatalogManifestV1,
  catalog: RenderEntityCompiledModelCatalogR10,
  model: RenderEntityCompiledModelR10,
): PlayerRenderProfileV1 {
  invariant(model.modelId === PLAYER_RENDER_MODEL_ID_V1, "attested player model id is invalid");
  invariant(model.groundY !== null, "attested player model has no ground plane");
  return Object.freeze({
    schema: PLAYER_RENDER_PROFILE_SCHEMA_V1,
    role: "player",
    catalog: Object.freeze({
      schema: manifest.schema,
      format: manifest.format,
      revision: Number(catalog.revision),
      sha256: catalog.contentSha256,
      canonicalHash: catalog.catalogHashHex,
      byteLength: catalog.byteLength,
      modelCount: catalog.models.length,
      nodeCount: catalog.nodeCount,
      source: manifest.source,
    }),
    model: Object.freeze({
      id: PLAYER_RENDER_MODEL_ID_V1,
      label: model.label,
      pose: PLAYER_RENDER_MODEL_POSE_V1,
      category: model.category,
      groundY: model.groundY,
      nodeCount: model.nodes.length,
    }),
  });
}

function canonicalProfileText(profile: PlayerRenderProfileV1) {
  return JSON.stringify(profile);
}

/** Verifies the published manifest, SHA-256, canonical BWM2 hash and exact player model before returning a binding. */
export async function attestPlayerRenderProfileV1(
  manifestValue: unknown,
  catalogBytes: Uint8Array,
  expected: PlayerRenderProfileV1 = BLOCKWILD_PLAYER_RENDER_PROFILE_V1,
): Promise<AttestedPlayerRenderProfileV1> {
  const manifest = parsePublishedRenderModelCatalogManifestV1(manifestValue);
  invariant(expected.catalog.revision === PLAYER_RENDER_CATALOG_REVISION_V1,
    "player render profile catalog revision is unsupported");
  const decoderManifest: RenderEntityModelCatalogManifestR10 = {
    schema: manifest.schema,
    format: manifest.format,
    revision: BigInt(expected.catalog.revision),
    current: manifest.current,
    sha256: manifest.sha256,
    catalogHash: manifest.catalogHash,
    byteLength: manifest.byteLength,
    modelCount: manifest.modelCount,
    nodeCount: manifest.nodeCount,
  };
  const catalog = await decodeRenderEntityModelCatalogR10(catalogBytes, decoderManifest);
  const model = findRenderEntityCompiledModelR10(catalog, PLAYER_RENDER_MODEL_ID_V1);
  invariant(model !== null, "published BWM2 catalog has no player-standing model");
  const profile = profileFromAttestedCatalog(manifest, catalog, model);
  invariant(canonicalProfileText(profile) === canonicalProfileText(expected),
    "published BWM2 player identity does not match the production player render profile");
  return Object.freeze({ profile, catalog, model });
}

/** Fetches only the content-addressed artifact named by the trusted manifest, then performs full attestation. */
export async function loadAttestedPlayerRenderProfileV1(input: Readonly<{
  manifestUrl?: string;
  fetch?: typeof globalThis.fetch;
  expected?: PlayerRenderProfileV1;
}> = {}): Promise<AttestedPlayerRenderProfileV1> {
  const fetchImplementation = input.fetch ?? globalThis.fetch;
  invariant(typeof fetchImplementation === "function", "fetch is unavailable for player render attestation");
  const manifestUrl = input.manifestUrl ?? "/renderer/manifest.json";
  const manifestResponse = await fetchImplementation(manifestUrl, { cache: "no-store" });
  invariant(manifestResponse.ok, `player render manifest request failed with ${manifestResponse.status}`);
  const manifestValue: unknown = await manifestResponse.json();
  const manifest = parsePublishedRenderModelCatalogManifestV1(manifestValue);
  const resolvedManifestUrl = new URL(manifestResponse.url || manifestUrl, globalThis.location?.href ?? "http://localhost/");
  // The catalog manifest defines its artifact from the renderer publication
  // root. Resolve that content-addressed suffix beside the manifest rather
  // than treating the leading slash as the application's origin root.
  const artifactUrl = new URL(manifest.artifact.slice(1), new URL("./", resolvedManifestUrl)).toString();
  const artifactResponse = await fetchImplementation(artifactUrl, { cache: "force-cache" });
  invariant(artifactResponse.ok, `player render catalog request failed with ${artifactResponse.status}`);
  return attestPlayerRenderProfileV1(manifest, new Uint8Array(await artifactResponse.arrayBuffer()), input.expected);
}
