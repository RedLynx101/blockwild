import {
  assertGeneratedChunkMatchesRequestV2,
  createGeneratedChunkV2,
  decodeTerrainGenerationMarkerTableV2,
  stableTerrainGenerationJsonV2,
  type GeneratedChunkV2,
  type GenerateChunkRequestV2,
  type TerrainGenerationMarkerEntry,
} from "./terrain-generation-contract";
import {
  RustEngineLoader,
  type RustEngineBytes,
  type RustEngineLoaderOptions,
  type RustEngineWasmExports,
} from "./rust-engine-loader";

const REQUEST_MAGIC = [0x42, 0x57, 0x47, 0x32] as const;
const RESULT_MAGIC = [0x42, 0x57, 0x52, 0x32] as const;
/** Exact whole-chunk cases in the checked-in fail-closed R3 promotion corpus. */
export const TERRAIN_GENERATION_PARITY_MINIMUM_CASES_V2 = 131;

export type TerrainGenerationParityCertificateV2 = Readonly<{
  generatorVersion: 18;
  generatorHash: string;
  contentHash: string;
  corpusHash: string;
  corpusCases: number;
  byteEqual: boolean;
}>;

type RustGenerationWasmExports = RustEngineWasmExports & Readonly<{
  blockwild_generate_chunk_v2(request: Uint8Array): RustEngineBytes;
  blockwild_generation_parity_certificate_v2(): RustEngineBytes;
}>;

function bytes(value: RustEngineBytes) {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

function hasGenerationExports(exports: RustEngineWasmExports): exports is RustGenerationWasmExports {
  const candidate = exports as Partial<RustGenerationWasmExports>;
  return typeof candidate.blockwild_generate_chunk_v2 === "function"
    && typeof candidate.blockwild_generation_parity_certificate_v2 === "function";
}

function validHash(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{32}$/.test(value);
}

export function parseTerrainGenerationParityCertificateV2(value: RustEngineBytes): TerrainGenerationParityCertificateV2 {
  const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes(value))) as Partial<TerrainGenerationParityCertificateV2>;
  if (parsed.generatorVersion !== 18
    || !validHash(parsed.generatorHash)
    || !validHash(parsed.contentHash)
    || !validHash(parsed.corpusHash)
    || !Number.isInteger(parsed.corpusCases)
    || Number(parsed.corpusCases) < 0
    || typeof parsed.byteEqual !== "boolean") {
    throw new Error("Rust terrain parity certificate is malformed");
  }
  return parsed as TerrainGenerationParityCertificateV2;
}

export function terrainGenerationCertificatePromotesV2(
  certificate: TerrainGenerationParityCertificateV2,
  request: GenerateChunkRequestV2,
) {
  return certificate.byteEqual
    && certificate.corpusCases >= TERRAIN_GENERATION_PARITY_MINIMUM_CASES_V2
    && certificate.generatorHash === request.generatorHash
    && certificate.contentHash === request.contentHash;
}

class WireWriter {
  private chunks: Uint8Array[] = [];
  private length = 0;

  constructor(magic: readonly number[]) { this.raw(new Uint8Array(magic)); }

  private raw(value: Uint8Array) { this.chunks.push(value); this.length += value.byteLength; }
  u16(value: number) { const bytes = new Uint8Array(2); new DataView(bytes.buffer).setUint16(0, value, true); this.raw(bytes); }
  u32(value: number) { const bytes = new Uint8Array(4); new DataView(bytes.buffer).setUint32(0, value >>> 0, true); this.raw(bytes); }
  i32(value: number) { const bytes = new Uint8Array(4); new DataView(bytes.buffer).setInt32(0, value, true); this.raw(bytes); }
  string(value: string) { const encoded = new TextEncoder().encode(value); this.u32(encoded.byteLength); this.raw(encoded); }
  finish() { const result = new Uint8Array(this.length); let offset = 0; for (const chunk of this.chunks) { result.set(chunk, offset); offset += chunk.byteLength; } return result; }
}

class WireReader {
  private readonly view: DataView;
  private offset = 4;

  constructor(private readonly value: Uint8Array, magic: readonly number[]) {
    this.view = new DataView(value.buffer, value.byteOffset, value.byteLength);
    if (value.byteLength < 4 || magic.some((byte, index) => value[index] !== byte)) throw new Error("Rust terrain packet has invalid magic");
  }

  private take(length: number) {
    const end = this.offset + length;
    if (!Number.isSafeInteger(end) || end > this.value.byteLength) throw new Error("Rust terrain packet is truncated");
    const result = this.value.subarray(this.offset, end);
    this.offset = end;
    return result;
  }

  u16() { const offset = this.offset; this.take(2); return this.view.getUint16(offset, true); }
  i16() { const offset = this.offset; this.take(2); return this.view.getInt16(offset, true); }
  u32() { const offset = this.offset; this.take(4); return this.view.getUint32(offset, true); }
  i32() { const offset = this.offset; this.take(4); return this.view.getInt32(offset, true); }
  count(maximum: number) { const value = this.u32(); if (value > maximum) throw new Error("Rust terrain collection exceeds wire bound"); return value; }
  string() { return new TextDecoder("utf-8", { fatal: true }).decode(this.take(this.count(1 << 20))); }
  u8Array(maximum: number) { return Uint8Array.from(this.take(this.count(maximum))); }
  u16Array(maximum: number) { const result = new Uint16Array(this.count(maximum)); for (let index = 0; index < result.length; index += 1) result[index] = this.u16(); return result; }
  i16Array(maximum: number) { const result = new Int16Array(this.count(maximum)); for (let index = 0; index < result.length; index += 1) result[index] = this.i16(); return result; }
  u32Array(maximum: number) { const result = new Uint32Array(this.count(maximum)); for (let index = 0; index < result.length; index += 1) result[index] = this.u32(); return result; }
  done() { if (this.offset !== this.value.byteLength) throw new Error("Rust terrain packet contains trailing bytes"); }
}

export function encodeRustTerrainGenerationRequestV2(request: GenerateChunkRequestV2) {
  const writer = new WireWriter(REQUEST_MAGIC);
  writer.u16(request.protocolVersion);
  writer.u16(request.schemaVersion);
  writer.u32(request.epoch);
  writer.u32(request.taskId);
  writer.u32(request.revision);
  for (const value of [
    request.namespace,
    request.contentHash,
    request.generatorHash,
    request.seedText,
    stableTerrainGenerationJsonV2(request.generationOptions),
    request.key,
  ]) writer.string(value);
  writer.i32(request.cx);
  writer.i32(request.cz);
  writer.u32(request.edits.length / 2);
  for (let index = 0; index < request.edits.length; index += 2) {
    writer.u32(request.edits[index]);
    writer.u16(request.edits[index + 1]);
  }
  writer.string(request.requestHash);
  return writer.finish();
}

export function decodeRustTerrainGenerationResultV2(value: RustEngineBytes, request: GenerateChunkRequestV2) {
  const reader = new WireReader(bytes(value), RESULT_MAGIC);
  const protocolVersion = reader.u16();
  const schemaVersion = reader.u16();
  const epoch = reader.u32();
  const taskId = reader.u32();
  const revision = reader.u32();
  const namespace = reader.string();
  const contentHash = reader.string();
  const generatorHash = reader.string();
  const requestHash = reader.string();
  const key = reader.string();
  const cx = reader.i32();
  const cz = reader.i32();
  const blocks = reader.u16Array(49_152);
  const heightmap = reader.i16Array(256);
  const biomes = reader.u8Array(256);
  const sectionBlockCounts = reader.u16Array(12);
  const skyTops = reader.i16Array(256);
  const light = reader.u16Array(49_152);
  const lightIndices = reader.u32Array(49_152);
  const leafIndices = reader.u32Array(49_152);
  const markerCount = reader.count(16_384);
  const structureMarkers: TerrainGenerationMarkerEntry[] = [];
  for (let index = 0; index < markerCount; index += 1) {
    const markerKey = reader.string();
    const row = JSON.parse(reader.string()) as TerrainGenerationMarkerEntry;
    if (row[0] !== markerKey) throw new Error("Rust terrain marker key disagrees with canonical row");
    structureMarkers.push(row);
  }
  const rustChunkHash = reader.string();
  reader.done();
  for (const [field, actual, expected] of [
    ["protocolVersion", protocolVersion, request.protocolVersion],
    ["schemaVersion", schemaVersion, request.schemaVersion],
    ["epoch", epoch, request.epoch], ["taskId", taskId, request.taskId], ["revision", revision, request.revision],
    ["namespace", namespace, request.namespace], ["contentHash", contentHash, request.contentHash],
    ["generatorHash", generatorHash, request.generatorHash], ["requestHash", requestHash, request.requestHash],
    ["key", key, request.key], ["cx", cx, request.cx], ["cz", cz, request.cz],
  ] as const) if (actual !== expected) throw new Error(`Rust terrain ${field} mismatch`);
  const chunk = createGeneratedChunkV2(request, {
    key, cx, cz, blocks, heightmap, biomes, sectionBlockCounts, skyTops, light, lightIndices, leafIndices, structureMarkers,
  });
  if (chunk.chunkHash !== rustChunkHash) throw new Error("Rust terrain chunk hash does not match browser canonical hash");
  assertGeneratedChunkMatchesRequestV2(chunk, request);
  return chunk;
}

export class RustTerrainGenerationBridgeV2 {
  private readonly loader: RustEngineLoader;
  private exports: RustGenerationWasmExports | null = null;
  private certificate: TerrainGenerationParityCertificateV2 | null = null;
  private loadPromise: Promise<void> | null = null;

  constructor(options: RustEngineLoaderOptions = {}) { this.loader = new RustEngineLoader(options); }

  initialize() {
    this.loadPromise ??= this.loader.load().then((loaded) => {
      if (!hasGenerationExports(loaded.exports)) throw new Error("Rust engine artifact does not contain terrain generation exports");
      this.exports = loaded.exports;
      this.certificate = parseTerrainGenerationParityCertificateV2(loaded.exports.blockwild_generation_parity_certificate_v2());
    });
    return this.loadPromise;
  }

  async generate(request: GenerateChunkRequestV2): Promise<GeneratedChunkV2> {
    await this.initialize();
    if (!this.exports || !this.certificate) throw new Error("Rust terrain generation bridge is not initialized");
    if (!terrainGenerationCertificatePromotesV2(this.certificate, request)) {
      throw new Error("Rust terrain generation is shadow-only until generator v18 byte parity is certified");
    }
    return decodeRustTerrainGenerationResultV2(this.exports.blockwild_generate_chunk_v2(encodeRustTerrainGenerationRequestV2(request)), request);
  }

  diagnostics() {
    return { loader: this.loader.diagnostics(), certificate: this.certificate, authoritative: Boolean(this.certificate?.byteEqual) } as const;
  }
}

/** Test/debug helper: canonical marker rows without importing `world.ts`. */
export function markerRowsV2(chunk: GeneratedChunkV2) {
  return decodeTerrainGenerationMarkerTableV2(chunk.markerTable);
}
