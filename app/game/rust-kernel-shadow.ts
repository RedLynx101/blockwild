/**
 * TypeScript oracle for the R1 Rust deterministic-kernel migration.
 *
 * This module intentionally contains no Worker or Wasm calls. Callers submit
 * whole coordinate/hash/spatial/replay batches and compare the returned plain
 * data with one coarse Rust result. Keeping the oracle independent of the Rust
 * loader makes divergences reproducible in Node, browsers, and native CI.
 */

export const RUST_KERNEL_FIXTURE_SCHEMA_VERSION = 1;
export const RUST_KERNEL_FIXTURE_NAME = "blockwild-r1-determinism";
export const RUST_KERNEL_CHUNK_SIZE = 16;
export const RUST_KERNEL_MIN_Y = -64;
export const RUST_KERNEL_MAX_Y = 127;
export const RUST_KERNEL_WORLD_HEIGHT = RUST_KERNEL_MAX_Y - RUST_KERNEL_MIN_Y + 1;

const U32_MAX = 0xffff_ffff;
const BIGINT_ZERO = BigInt(0);
const BIGINT_ONE = BigInt(1);
const BIGINT_EIGHT = BigInt(8);
const BIGINT_32 = BigInt(32);
const BIGINT_64 = BigInt(64);
const BIGINT_255 = BigInt(255);
const U64_MASK = BigInt("0xffffffffffffffff");
const FNV1A_32_OFFSET = 2_166_136_261;
const FNV1A_32_PRIME = 16_777_619;
const FNV1A_64_OFFSET = BigInt("14695981039346656037");
const FNV1A_64_PRIME = BigInt("1099511628211");
const FNV1A_64_HIGH_PRIME = FNV1A_64_PRIME ^ BigInt(0x13b);
const CANONICAL_HASH_BYTES = 16;
const ENGINE_VERSION = 1;
const PROTOCOL_VERSION = 1;
const SCHEMA_VERSION = 1;
const REPLAY_MESSAGE_KIND = 30;
const ENVELOPE_HEADER_BYTES = 32;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8");

export type KernelStableId = Readonly<{ index: number; generation: number }>;
export type KernelAabb = Readonly<{ min: readonly [number, number, number]; max: readonly [number, number, number] }>;
export type KernelSpatialEntry = Readonly<{ id: KernelStableId; bounds: KernelAabb }>;
export type KernelAabbQuery = Readonly<{ queryId: number; bounds: KernelAabb }>;
export type KernelRay = Readonly<{
  origin: readonly [number, number, number];
  direction: readonly [number, number, number];
  maxDistance: number;
}>;
export type KernelRayQuery = Readonly<{ queryId: number; ray: KernelRay }>;
export type KernelSpatialBatch = Readonly<{
  cellSize: number;
  entries: readonly KernelSpatialEntry[];
  aabbQueries: readonly KernelAabbQuery[];
  rayQueries: readonly KernelRayQuery[];
}>;

export type KernelReplayFrameInput = Readonly<{
  tick: number | bigint;
  commandBatch: Uint8Array;
  platformResults: Uint8Array;
}>;

export type KernelReplayInput = Readonly<{
  worldSeed: string;
  contentHash?: Uint8Array;
  generatorHash?: Uint8Array;
  frames: readonly KernelReplayFrameInput[];
}>;

function requireI32(value: number, name: string) {
  if (!Number.isInteger(value) || value < -0x8000_0000 || value > 0x7fff_ffff) {
    throw new RangeError(`${name} must be a signed 32-bit integer`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function requireU32(value: number, name: string) {
  if (!Number.isInteger(value) || value < 0 || value > U32_MAX) {
    throw new RangeError(`${name} must be an unsigned 32-bit integer`);
  }
  return value;
}

function requireFinite(value: number, name: string) {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
  return Object.is(value, -0) ? 0 : value;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string) {
  if (!/^(?:[0-9a-f]{2})+$/iu.test(hex)) throw new TypeError("hash must be an even-length hexadecimal string");
  return Uint8Array.from(hex.match(/.{2}/gu) ?? [], (pair) => Number.parseInt(pair, 16));
}

function writeU16(bytes: number[], value: number) {
  const checked = requireU32(value, "u16");
  if (checked > 0xffff) throw new RangeError("u16 is outside 0..65535");
  bytes.push(checked & 0xff, checked >>> 8);
}

function writeU32(bytes: number[], value: number) {
  const checked = requireU32(value, "u32");
  bytes.push(checked & 0xff, checked >>> 8 & 0xff, checked >>> 16 & 0xff, checked >>> 24 & 0xff);
}

function writeU64(bytes: number[], value: number | bigint) {
  const checked = BigInt(value);
  if (checked < BIGINT_ZERO || checked > U64_MASK) throw new RangeError("u64 is outside its canonical range");
  for (let shift = BIGINT_ZERO; shift < BIGINT_64; shift += BIGINT_EIGHT) bytes.push(Number(checked >> shift & BIGINT_255));
}

function writeSized(bytes: number[], value: Uint8Array) {
  writeU32(bytes, value.byteLength);
  bytes.push(...value);
}

function cloneHash(value: Uint8Array | undefined) {
  const hash = value ? Uint8Array.from(value) : new Uint8Array(CANONICAL_HASH_BYTES);
  if (hash.byteLength !== CANONICAL_HASH_BYTES) throw new RangeError("canonical hashes must contain exactly 16 bytes");
  return hash;
}

/** Match Rust's wrapping u64 arithmetic without relying on Number precision. */
export class TypeScriptCanonicalHasher {
  private low = FNV1A_64_OFFSET;
  private high = FNV1A_64_OFFSET ^ BigInt("0xa0761d6478bd642f");

  constructor(domain?: string) {
    if (domain !== undefined) this.writeString(domain);
  }

  private writeRaw(bytes: Uint8Array) {
    for (const byte of bytes) {
      const value = BigInt(byte);
      this.low = (this.low ^ value) * FNV1A_64_PRIME & U64_MASK;
      this.high = (this.high ^ (value << BIGINT_ONE | BIGINT_ONE)) * FNV1A_64_HIGH_PRIME & U64_MASK;
    }
    return this;
  }

  writeBytes(bytes: Uint8Array) {
    this.writeU64(bytes.byteLength);
    for (const byte of bytes) {
      const value = BigInt(byte);
      this.low = (this.low ^ value) * FNV1A_64_PRIME & U64_MASK;
      this.high = (this.high ^ (value << BIGINT_ONE)) * FNV1A_64_HIGH_PRIME & U64_MASK;
    }
    return this;
  }

  writeString(value: string) {
    return this.writeBytes(textEncoder.encode(value));
  }

  writeU16(value: number) {
    const bytes: number[] = [];
    writeU16(bytes, value);
    return this.writeRaw(Uint8Array.from(bytes));
  }

  writeU32(value: number) {
    const bytes: number[] = [];
    writeU32(bytes, value);
    return this.writeRaw(Uint8Array.from(bytes));
  }

  writeI32(value: number) {
    const checked = requireI32(value, "i32");
    return this.writeU32(checked >>> 0);
  }

  writeU64(value: number | bigint) {
    const bytes: number[] = [];
    writeU64(bytes, value);
    return this.writeRaw(Uint8Array.from(bytes));
  }

  finish() {
    const bytes: number[] = [];
    writeU64(bytes, this.low);
    writeU64(bytes, this.high);
    return Uint8Array.from(bytes);
  }

  finishHex() {
    return bytesToHex(this.finish());
  }
}

/** Split a signed world coordinate with the same Euclidean semantics as Rust. */
export function splitRustKernelCoordinate(value: number) {
  const coordinate = requireI32(value, "coordinate");
  const chunk = Math.floor(coordinate / RUST_KERNEL_CHUNK_SIZE);
  return { chunk, local: coordinate - chunk * RUST_KERNEL_CHUNK_SIZE };
}

export function rustKernelBlockIndex(localX: number, y: number, localZ: number) {
  const x = requireI32(localX, "localX");
  const vertical = requireI32(y, "y");
  const z = requireI32(localZ, "localZ");
  if (x < 0 || x >= RUST_KERNEL_CHUNK_SIZE) throw new RangeError(`localX ${x} is outside the chunk`);
  if (z < 0 || z >= RUST_KERNEL_CHUNK_SIZE) throw new RangeError(`localZ ${z} is outside the chunk`);
  if (vertical < RUST_KERNEL_MIN_Y || vertical > RUST_KERNEL_MAX_Y) throw new RangeError(`y ${vertical} is outside the world`);
  return x + z * RUST_KERNEL_CHUNK_SIZE + (vertical - RUST_KERNEL_MIN_Y) * RUST_KERNEL_CHUNK_SIZE ** 2;
}

export function rustKernelBlockPositionFromIndex(index: number) {
  const blockCount = RUST_KERNEL_WORLD_HEIGHT * RUST_KERNEL_CHUNK_SIZE ** 2;
  if (!Number.isInteger(index) || index < 0 || index >= blockCount) throw new RangeError(`block index ${index} is outside the chunk column`);
  const layerSize = RUST_KERNEL_CHUNK_SIZE ** 2;
  const horizontal = index % layerSize;
  return {
    x: horizontal % RUST_KERNEL_CHUNK_SIZE,
    y: RUST_KERNEL_MIN_Y + Math.floor(index / layerSize),
    z: Math.floor(horizontal / RUST_KERNEL_CHUNK_SIZE),
  };
}

/** FNV-1a over explicit JavaScript UTF-16 code units, including lone surrogates. */
export function rustKernelFnv1aUtf16Units(units: readonly number[]) {
  let value = FNV1A_32_OFFSET;
  for (const unit of units) {
    if (!Number.isInteger(unit) || unit < 0 || unit > 0xffff) throw new RangeError("UTF-16 units must be integers in 0..65535");
    value ^= unit;
    value = Math.imul(value, FNV1A_32_PRIME);
  }
  return value >>> 0;
}

export function rustKernelFnv1aUtf16(value: string) {
  const units = Array.from({ length: value.length }, (_, index) => value.charCodeAt(index));
  return rustKernelFnv1aUtf16Units(units);
}

function rotateLeftU32(value: number, bits: number) {
  return (value << bits | value >>> 32 - bits) >>> 0;
}

export function rustKernelSeedStream(seed: string, stream: string) {
  let value = rustKernelFnv1aUtf16(seed) ^ rotateLeftU32(rustKernelFnv1aUtf16(stream), 13);
  value = Math.imul(value, 0x9e37_79b1) >>> 0;
  return value === 0 ? 0x6d2b_79f5 : value;
}

export function rustKernelXorshift32(state: number) {
  let value = requireU32(state, "state") | 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  const result = value >>> 0;
  return result === 0 ? 0x6d2b_79f5 : result;
}

export function rustKernelHash2Bits(x: number, z: number, seed: number) {
  let value = Math.imul(requireI32(x, "x"), 374_761_393)
    + Math.imul(requireI32(z, "z"), 668_265_263)
    + Math.imul(requireU32(seed, "seed"), 1_442_695_041);
  value = Math.imul(value ^ value >>> 13, 1_274_126_177);
  return (value ^ value >>> 16) >>> 0;
}

export function rustKernelHash2(x: number, z: number, seed: number) {
  return rustKernelHash2Bits(x, z, seed) / U32_MAX;
}

export function rustKernelHash3Bits(x: number, y: number, z: number, seed: number) {
  let value = Math.imul(requireI32(x, "x"), 374_761_393)
    + Math.imul(requireI32(y, "y"), 1_103_515_245)
    + Math.imul(requireI32(z, "z"), 668_265_263)
    + Math.imul(requireU32(seed, "seed"), 1_597_334_677);
  value = Math.imul(value ^ value >>> 15, 2_246_822_519);
  return (value ^ value >>> 13) >>> 0;
}

export function rustKernelHash3(x: number, y: number, z: number, seed: number) {
  return rustKernelHash3Bits(x, y, z, seed) / U32_MAX;
}

export function packRustKernelStableId(id: KernelStableId) {
  const index = BigInt(requireU32(id.index, "stable ID index"));
  const generation = BigInt(requireU32(id.generation, "stable ID generation"));
  return generation << BIGINT_32 | index;
}

export function rustKernelStableIdHex(id: KernelStableId) {
  return packRustKernelStableId(id).toString(16).padStart(16, "0");
}

function normalizeAabb(bounds: KernelAabb): KernelAabb {
  const first = bounds.min.map((value, index) => requireFinite(value, `bounds.min[${index}]`)) as [number, number, number];
  const second = bounds.max.map((value, index) => requireFinite(value, `bounds.max[${index}]`)) as [number, number, number];
  return {
    min: [Math.min(first[0], second[0]), Math.min(first[1], second[1]), Math.min(first[2], second[2])],
    max: [Math.max(first[0], second[0]), Math.max(first[1], second[1]), Math.max(first[2], second[2])],
  };
}

function aabbOverlaps(left: KernelAabb, right: KernelAabb) {
  return left.min.every((minimum, axis) => minimum <= right.max[axis] && left.max[axis] >= right.min[axis]);
}

function rayEntry(bounds: KernelAabb, ray: KernelRay) {
  let near = 0;
  let far = requireFinite(ray.maxDistance, "ray.maxDistance");
  for (let axis = 0; axis < 3; axis += 1) {
    const origin = requireFinite(ray.origin[axis], `ray.origin[${axis}]`);
    const direction = requireFinite(ray.direction[axis], `ray.direction[${axis}]`);
    if (Math.abs(direction) <= Number.EPSILON) {
      if (origin < bounds.min[axis] || origin > bounds.max[axis]) return null;
      continue;
    }
    const inverse = 1 / direction;
    const first = (bounds.min[axis] - origin) * inverse;
    const second = (bounds.max[axis] - origin) * inverse;
    near = Math.max(near, Math.min(first, second));
    far = Math.min(far, Math.max(first, second));
    if (far < near) return null;
  }
  return Object.is(near, -0) ? 0 : near;
}

/**
 * Brute-force semantic oracle for a whole Rust spatial batch. The production
 * implementations may use grids/BVHs, but output ordering is canonical.
 */
export function evaluateRustKernelSpatialBatch(batch: KernelSpatialBatch) {
  if (!Number.isFinite(batch.cellSize) || batch.cellSize <= 0) throw new RangeError("cellSize must be finite and positive");
  const entries = batch.entries.map((entry) => ({
    id: entry.id,
    idHex: rustKernelStableIdHex(entry.id),
    packed: packRustKernelStableId(entry.id),
    bounds: normalizeAabb(entry.bounds),
  }));
  const aabb = [...batch.aabbQueries]
    .sort((left, right) => requireU32(left.queryId, "queryId") - requireU32(right.queryId, "queryId"))
    .map((query) => {
      const bounds = normalizeAabb(query.bounds);
      return {
        queryId: query.queryId,
        ids: entries.filter((entry) => aabbOverlaps(entry.bounds, bounds)).sort((left, right) => left.packed < right.packed ? -1 : left.packed > right.packed ? 1 : 0).map((entry) => entry.idHex),
      };
    });
  const ray = [...batch.rayQueries]
    .sort((left, right) => requireU32(left.queryId, "queryId") - requireU32(right.queryId, "queryId"))
    .map((query) => {
      const hits = entries.flatMap((entry) => {
        const distance = rayEntry(entry.bounds, query.ray);
        return distance === null ? [] : [{ id: entry.idHex, packed: entry.packed, distance }];
      });
      hits.sort((left, right) => left.distance - right.distance || (left.packed < right.packed ? -1 : left.packed > right.packed ? 1 : 0));
      return { queryId: query.queryId, hits: hits.map(({ id, distance }) => ({ id, distance })) };
    });
  return { aabb, ray };
}

function domainHash(name: string, bytes: Uint8Array) {
  return new TypeScriptCanonicalHasher(name).writeBytes(bytes).finish();
}

function engineStateHash(input: Readonly<{
  worldSeed: string;
  contentHash: Uint8Array;
  generatorHash: Uint8Array;
  tick: bigint;
  rngState: number;
  domains: ReadonlyMap<string, Uint8Array>;
}>) {
  const root = new TypeScriptCanonicalHasher("blockwild-authority-root-v1");
  root.writeU32(ENGINE_VERSION);
  root.writeU16(PROTOCOL_VERSION);
  root.writeString(input.worldSeed);
  root.writeBytes(input.contentHash);
  root.writeBytes(input.generatorHash);
  root.writeU64(input.tick);
  root.writeU32(input.rngState);
  const domains = [...input.domains].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  root.writeU64(domains.length);
  for (const [name, bytes] of domains) {
    root.writeString(name);
    root.writeBytes(domainHash(name, bytes));
  }
  root.writeU64(0);
  return root.finish();
}

function commandDomainKey(command: Uint8Array) {
  const decoded = textDecoder.decode(command);
  return `command:${rustKernelFnv1aUtf16(decoded).toString(16).padStart(8, "0")}`;
}

export function buildRustKernelReplay(input: KernelReplayInput) {
  const contentHash = cloneHash(input.contentHash);
  const generatorHash = cloneHash(input.generatorHash);
  const rngState = rustKernelSeedStream(input.worldSeed, "engine");
  const domains = new Map<string, Uint8Array>();
  const startingHash = engineStateHash({ worldSeed: input.worldSeed, contentHash, generatorHash, tick: BIGINT_ZERO, rngState, domains });
  const frames = input.frames.map((frame) => {
    const tick = BigInt(frame.tick);
    if (tick < BIGINT_ZERO || tick > U64_MASK) throw new RangeError("replay ticks must fit u64");
    domains.set(commandDomainKey(frame.commandBatch), Uint8Array.from(frame.commandBatch));
    if (frame.platformResults.byteLength > 0) domains.set("platform", Uint8Array.from(frame.platformResults));
    const expectedHash = engineStateHash({ worldSeed: input.worldSeed, contentHash, generatorHash, tick, rngState, domains });
    return {
      tick,
      commandBatch: Uint8Array.from(frame.commandBatch),
      platformResults: Uint8Array.from(frame.platformResults),
      expectedHash,
    };
  });
  const canonical = new TypeScriptCanonicalHasher("blockwild-replay-v1");
  canonical.writeU32(ENGINE_VERSION);
  canonical.writeU16(PROTOCOL_VERSION);
  canonical.writeBytes(contentHash);
  canonical.writeBytes(generatorHash);
  canonical.writeString(input.worldSeed);
  canonical.writeBytes(startingHash);
  canonical.writeU64(frames.length);
  for (const frame of frames) {
    canonical.writeU64(frame.tick);
    canonical.writeBytes(frame.commandBatch);
    canonical.writeBytes(frame.platformResults);
    canonical.writeBytes(frame.expectedHash);
  }

  const payload: number[] = [];
  writeU32(payload, ENGINE_VERSION);
  writeU16(payload, PROTOCOL_VERSION);
  payload.push(...contentHash, ...generatorHash);
  writeSized(payload, textEncoder.encode(input.worldSeed));
  payload.push(...startingHash);
  writeU32(payload, frames.length);
  for (const frame of frames) {
    writeU64(payload, frame.tick);
    writeSized(payload, frame.commandBatch);
    writeSized(payload, frame.platformResults);
    payload.push(...frame.expectedHash);
  }
  const envelope: number[] = [...textEncoder.encode("BWEP")];
  writeU16(envelope, PROTOCOL_VERSION);
  writeU16(envelope, SCHEMA_VERSION);
  writeU16(envelope, REPLAY_MESSAGE_KIND);
  writeU16(envelope, 0);
  writeU32(envelope, 0);
  writeU32(envelope, 0);
  writeU32(envelope, payload.length);
  writeU64(envelope, 0);
  if (envelope.length !== ENVELOPE_HEADER_BYTES) throw new Error("invalid replay envelope header length");
  envelope.push(...payload);

  return {
    header: {
      engineVersion: ENGINE_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      contentHash: bytesToHex(contentHash),
      generatorHash: bytesToHex(generatorHash),
      worldSeed: input.worldSeed,
      startingHash: bytesToHex(startingHash),
    },
    frames: frames.map((frame) => ({
      tick: frame.tick.toString(),
      commandBatchHex: bytesToHex(frame.commandBatch),
      platformResultsHex: bytesToHex(frame.platformResults),
      expectedHash: bytesToHex(frame.expectedHash),
    })),
    canonicalHash: canonical.finishHex(),
    encodedHex: bytesToHex(Uint8Array.from(envelope)),
  };
}

export const RUST_KERNEL_COORDINATE_CORPUS = Object.freeze([
  { label: "i32-min", value: -0x8000_0000 },
  { label: "far-negative", value: -1_000_001 },
  { label: "negative-boundary-below", value: -17 },
  { label: "negative-boundary", value: -16 },
  { label: "negative-one", value: -1 },
  { label: "negative-zero", value: 0, negativeZero: true },
  { label: "zero", value: 0 },
  { label: "positive-boundary-below", value: 15 },
  { label: "positive-boundary", value: 16 },
  { label: "positive-boundary-above", value: 17 },
  { label: "far-positive", value: 1_000_001 },
  { label: "i32-max", value: 0x7fff_ffff },
] as const);

export const RUST_KERNEL_SEED_CORPUS = Object.freeze([
  { label: "empty", utf16Units: [] },
  { label: "ascii", utf16Units: [66, 108, 111, 99, 107, 119, 105, 108, 100] },
  { label: "versioned", utf16Units: [119, 111, 114, 108, 100, 45, 98, 101, 108, 111, 119, 45, 118, 49, 53] },
  { label: "emoji-pair", utf16Units: [65, 0xd83c, 0xdf3f, 66] },
  { label: "combining", utf16Units: [0x65, 0x0301] },
  { label: "precomposed", utf16Units: [0x00e9] },
  { label: "lone-high-surrogate", utf16Units: [0xd83c] },
  { label: "lone-low-surrogate", utf16Units: [0xdf3f] },
  { label: "embedded-null", utf16Units: [65, 0, 66] },
] as const);

export const RUST_KERNEL_HASH_CORPUS = Object.freeze([
  { label: "zero", x: 0, y: 0, z: 0, seed: 0 },
  { label: "negative-world", x: -17, y: RUST_KERNEL_MIN_Y, z: 33, seed: 3_449_464_762 },
  { label: "chunk-negative-edge", x: -16, y: -1, z: -16, seed: 3_687_954_586 },
  { label: "chunk-positive-edge", x: 16, y: 0, z: 16, seed: 3_687_954_586 },
  { label: "upper-world", x: 2_048, y: RUST_KERNEL_MAX_Y, z: -2_048, seed: U32_MAX },
  { label: "i32-extremes", x: 0x7fff_ffff, y: 127, z: -0x8000_0000, seed: 3_687_954_586 },
] as const);

function vector3(x: number, y: number, z: number): readonly [number, number, number] {
  return [x, y, z];
}

export const RUST_KERNEL_SPATIAL_CORPUS: KernelSpatialBatch = Object.freeze({
  cellSize: 8,
  entries: [
    { id: { index: 7, generation: 1 }, bounds: { min: vector3(8, 0, 0), max: vector3(9, 1, 1) } },
    { id: { index: 3, generation: 2 }, bounds: { min: vector3(16.5, 2, 0.5), max: vector3(15.5, -2, -0.5) } },
    { id: { index: 2, generation: 1 }, bounds: { min: vector3(0, 0, 0), max: vector3(1, 2, 1) } },
    { id: { index: 1, generation: 1 }, bounds: { min: vector3(-8, -1, -8), max: vector3(-7, 1, -7) } },
    { id: { index: U32_MAX, generation: 0 }, bounds: { min: vector3(2, 0, -0.25), max: vector3(3, 1, 0.25) } },
  ],
  aabbQueries: [
    { queryId: 9, bounds: { min: vector3(16.5, -4, -1), max: vector3(16.5, 4, 1) } },
    { queryId: 3, bounds: { min: vector3(-7, -1, -7), max: vector3(0, 0, 0) } },
    { queryId: 1, bounds: { min: vector3(100, 100, 100), max: vector3(101, 101, 101) } },
  ],
  rayQueries: [
    { queryId: 8, ray: { origin: vector3(20, 0.5, 0), direction: vector3(-1, 0, 0), maxDistance: 32 } },
    { queryId: 2, ray: { origin: vector3(-12, 0, -7.5), direction: vector3(1, 0, 0), maxDistance: 8 } },
    { queryId: 5, ray: { origin: vector3(0, 3, 0), direction: vector3(0, 1, 0), maxDistance: 10 } },
  ],
});

export function buildRustKernelFixture() {
  const replay = buildRustKernelReplay({
    worldSeed: "rust-r1-golden",
    frames: [
      { tick: 1, commandBatch: textEncoder.encode("move:north"), platformResults: new Uint8Array(0) },
      { tick: 2, commandBatch: textEncoder.encode("place:stone"), platformResults: textEncoder.encode("save:ok") },
    ],
  });
  return {
    schemaVersion: RUST_KERNEL_FIXTURE_SCHEMA_VERSION,
    name: RUST_KERNEL_FIXTURE_NAME,
    contracts: {
      coordinateType: "i32",
      seedEncoding: "explicit-utf16-code-units",
      stableIdEncoding: "generation:u32|index:u32",
      batchBoundary: {
        callsPerEvaluation: 2,
        aabbQueries: RUST_KERNEL_SPATIAL_CORPUS.aabbQueries.length,
        rayQueries: RUST_KERNEL_SPATIAL_CORPUS.rayQueries.length,
        policy: "one-coarse-call-per-query-kind",
      },
    },
    coordinates: RUST_KERNEL_COORDINATE_CORPUS.map((entry) => {
      const value = "negativeZero" in entry && entry.negativeZero ? -0 : entry.value;
      return { ...entry, result: splitRustKernelCoordinate(value) };
    }),
    blockIndexes: [
      { localX: 0, y: RUST_KERNEL_MIN_Y, localZ: 0 },
      { localX: 15, y: RUST_KERNEL_MIN_Y, localZ: 15 },
      { localX: 0, y: RUST_KERNEL_MIN_Y + 1, localZ: 0 },
      { localX: 7, y: 0, localZ: 11 },
      { localX: 15, y: RUST_KERNEL_MAX_Y, localZ: 15 },
    ].map((input) => {
      const index = rustKernelBlockIndex(input.localX, input.y, input.localZ);
      return { ...input, index, roundTrip: rustKernelBlockPositionFromIndex(index) };
    }),
    seeds: RUST_KERNEL_SEED_CORPUS.map((entry) => ({ ...entry, hash: rustKernelFnv1aUtf16Units(entry.utf16Units) })),
    terrainHashes: RUST_KERNEL_HASH_CORPUS.map((entry) => ({
      ...entry,
      hash2Bits: rustKernelHash2Bits(entry.x, entry.z, entry.seed),
      hash3Bits: rustKernelHash3Bits(entry.x, entry.y, entry.z, entry.seed),
    })),
    stableIds: [
      { index: 0, generation: 0 },
      { index: 1, generation: 0 },
      { index: 0, generation: 1 },
      { index: 0x1234_5678, generation: 0x90ab_cdef },
      { index: U32_MAX, generation: U32_MAX },
    ].map((id) => ({ ...id, packedHex: rustKernelStableIdHex(id) })),
    spatial: {
      input: RUST_KERNEL_SPATIAL_CORPUS,
      output: evaluateRustKernelSpatialBatch(RUST_KERNEL_SPATIAL_CORPUS),
    },
    replay,
  };
}

export function replayBytesFromFixture(fixture: ReturnType<typeof buildRustKernelFixture>) {
  return hexToBytes(fixture.replay.encodedHex);
}
