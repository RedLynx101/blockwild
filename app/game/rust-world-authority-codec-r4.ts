import {
  createWorldReadWindowV1,
  type WorldAddressV1,
  type WorldAuthorityIdentityV1,
  type WorldSectionAddressV1,
} from "./world-authority-contract";
import {
  RUST_WORLD_AUTHORITY_BRIDGE_PROTOCOL_R4_V1,
  type RustChunkAuxiliaryPatchR4V1,
  type RustChunkAuxiliaryInstallR4V1,
  type RustImmediateEditEventR4V1,
  type RustLiquidMetadataR4V1,
  type RustWorldAuthorityRequestR4V1,
  type RustWorldAuthorityResponseR4V1,
} from "./rust-world-authority-bridge-r4";

const REQUEST_MAGIC = [0x42, 0x57, 0x51, 0x34] as const; // BWQ4
const RESPONSE_MAGIC = [0x42, 0x57, 0x41, 0x34] as const; // BWA4
const MAX_WIRE_BYTES = 32 * 1024 * 1024;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

const OPERATIONS = Object.freeze({
  "authority-init-r4-v1": 0,
  "authority-install-sections-r4-v1": 1,
  "authority-import-save-r4-v1": 2,
  "authority-residency-intents-r4-v1": 3,
  "authority-mutate-r4-v1": 4,
  "authority-read-page-r4-v1": 5,
  "authority-evict-sections-r4-v1": 6,
  "authority-switch-location-r4-v1": 7,
  "authority-export-save-r4-v1": 8,
  "authority-dispose-r4-v1": 9,
  "authority-patch-auxiliary-r4-v1": 10,
} as const);

export type RustWorldAuthorityDecodedResponseR4V1 = Readonly<{
  response: RustWorldAuthorityResponseR4V1;
  handle?: number;
}>;

function requireSafeInteger(value: number, minimum: number, maximum: number, label: string) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new RangeError(`${label} is outside ${minimum}..${maximum}`);
  return value;
}

function asBytes(value: Uint8Array | ArrayBuffer) {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

class Writer {
  private readonly bytes: number[] = [];

  constructor(request: RustWorldAuthorityRequestR4V1) {
    this.raw(Uint8Array.from(REQUEST_MAGIC));
    this.u16(RUST_WORLD_AUTHORITY_BRIDGE_PROTOCOL_R4_V1);
    this.u8(OPERATIONS[request.type]);
    this.u8(0);
    this.u32(request.requestId);
  }

  finish() {
    if (this.bytes.length > MAX_WIRE_BYTES) throw new RangeError("Rust world authority request exceeds 32 MiB");
    return Uint8Array.from(this.bytes);
  }

  u8(value: number) { this.bytes.push(requireSafeInteger(value, 0, 0xff, "u8")); }
  u16(value: number) {
    const normalized = requireSafeInteger(value, 0, 0xffff, "u16");
    this.bytes.push(normalized & 0xff, (normalized >>> 8) & 0xff);
  }
  i16(value: number) { this.u16(requireSafeInteger(value, -0x8000, 0x7fff, "i16") & 0xffff); }
  u32(value: number) {
    const normalized = requireSafeInteger(value, 0, 0xffff_ffff, "u32");
    this.bytes.push(normalized & 0xff, (normalized >>> 8) & 0xff, (normalized >>> 16) & 0xff, (normalized >>> 24) & 0xff);
  }
  i32(value: number) { this.u32(requireSafeInteger(value, -0x8000_0000, 0x7fff_ffff, "i32") >>> 0); }
  u64(value: number) {
    let remaining = BigInt(requireSafeInteger(value, 0, Number.MAX_SAFE_INTEGER, "u64"));
    for (let index = 0; index < 8; index += 1) {
      this.bytes.push(Number(remaining & BigInt(0xff)));
      remaining >>= BigInt(8);
    }
  }
  raw(value: Uint8Array) { for (const byte of value) this.bytes.push(byte); }
  string(value: string) {
    const encoded = textEncoder.encode(value);
    this.u16(encoded.length);
    this.raw(encoded);
  }
  largeString(value: string) {
    const encoded = textEncoder.encode(value);
    this.u32(encoded.length);
    this.raw(encoded);
  }
  bytesValue(value: Uint8Array) { this.u32(value.byteLength); this.raw(value); }
  address(value: WorldAddressV1) { this.string(value.universeId); this.string(value.locationId); }
  sectionAddress(value: WorldSectionAddressV1) {
    this.address(value);
    this.i32(value.chunkX);
    this.i32(value.chunkZ);
    this.i16(value.sectionY);
  }
  identity(value: WorldAuthorityIdentityV1) {
    this.address(value.address);
    this.u64(value.revision.epoch);
    this.u64(value.revision.mutation);
    this.u64(value.revision.residency);
    this.string(value.stateHash);
  }
  position(value: Readonly<{ x: number; y: number; z: number }>) {
    this.i32(value.x); this.i32(value.y); this.i32(value.z);
  }
  u16Array(value: Uint16Array | Int16Array) {
    for (const item of value) this.u16(item & 0xffff);
  }
  sortedU16Set(values: readonly number[]) {
    const sorted = [...new Set(values)].sort((left, right) => left - right);
    this.u16(sorted.length);
    for (const value of sorted) this.u16(value);
  }
  auxiliary(value: RustChunkAuxiliaryInstallR4V1) {
    this.address(value.address);
    this.i32(value.address.chunkX);
    this.i32(value.address.chunkZ);
    this.u64(value.sourceRevision);
    this.string(value.sourceHash);
    this.u16Array(value.heightmap);
    this.raw(value.biomes);
    this.u16Array(value.sectionBlockCounts);
    this.u16Array(value.skyTops);
    this.u16Array(value.light);
    this.u32(value.lightIndices.length);
    for (const index of value.lightIndices) this.u32(index);
    this.u32(value.leafIndices.length);
    for (const index of value.leafIndices) this.u32(index);
    const markers = [...value.markers].sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0);
    this.u32(markers.length);
    for (const marker of markers) { this.string(marker.key); this.largeString(marker.canonicalJson); }
  }
  auxiliaryPatch(value: RustChunkAuxiliaryPatchR4V1) {
    this.address(value.address); this.i32(value.address.chunkX); this.i32(value.address.chunkZ);
    this.u64(value.expectedSourceRevision); this.string(value.expectedSourceHash);
    this.u64(value.sourceRevision); this.string(value.sourceHash);
    const lightSections = [...value.lightSections].sort((left, right) => left.sectionY - right.sectionY);
    this.u16(lightSections.length);
    for (const section of lightSections) {
      if (section.light.length !== 4_096) throw new RangeError("R4 auxiliary light patch must contain exactly 4096 cells");
      this.i16(section.sectionY); this.u16Array(section.light);
    }
    const sectionCounts = [...value.sectionBlockCounts].sort((left, right) => left.index - right.index);
    this.u16(sectionCounts.length);
    for (const entry of sectionCounts) { this.u16(entry.index); this.u16(entry.value); }
    const skyTops = [...value.skyTops].sort((left, right) => left.index - right.index);
    this.u16(skyTops.length);
    for (const entry of skyTops) { this.u16(entry.index); this.i16(entry.value); }
    for (const indices of [value.lightIndices, value.leafIndices]) {
      this.u8(indices ? 1 : 0);
      if (indices) { this.u32(indices.length); for (const index of indices) this.u32(index); }
    }
    this.u8(value.markers ? 1 : 0);
    if (value.markers) {
      const markers = [...value.markers].sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0);
      this.u32(markers.length);
      for (const marker of markers) { this.string(marker.key); this.largeString(marker.canonicalJson); }
    }
  }
}

class Reader {
  private offset = 0;
  readonly operation: number;
  readonly status: number;
  readonly requestId: number;

  constructor(private readonly bytes: Uint8Array) {
    for (const byte of RESPONSE_MAGIC) if (this.u8() !== byte) throw new TypeError("Rust world authority response has invalid magic");
    if (this.u16() !== RUST_WORLD_AUTHORITY_BRIDGE_PROTOCOL_R4_V1) throw new TypeError("Rust world authority response has incompatible wire version");
    this.operation = this.u8();
    this.status = this.u8();
    this.requestId = this.u32();
  }

  finish() { if (this.offset !== this.bytes.byteLength) throw new TypeError("Rust world authority response has trailing bytes"); }
  private take(length: number) {
    const end = this.offset + length;
    if (!Number.isSafeInteger(end) || end > this.bytes.byteLength) throw new TypeError("Rust world authority response is truncated");
    const value = this.bytes.subarray(this.offset, end);
    this.offset = end;
    return value;
  }
  u8() { return this.take(1)[0]; }
  u16() { const value = this.take(2); return value[0] | (value[1] << 8); }
  i16() { const value = this.u16(); return value & 0x8000 ? value - 0x1_0000 : value; }
  u32() { const value = this.take(4); return new DataView(value.buffer, value.byteOffset, 4).getUint32(0, true); }
  i32() { const value = this.take(4); return new DataView(value.buffer, value.byteOffset, 4).getInt32(0, true); }
  u64() {
    const value = this.take(8);
    const parsed = new DataView(value.buffer, value.byteOffset, 8).getBigUint64(0, true);
    if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("Rust world authority response exceeds JavaScript safe integer range");
    return Number(parsed);
  }
  string() { return textDecoder.decode(this.take(this.u16())); }
  bytesValue() { return Uint8Array.from(this.take(this.u32())); }
  u16Array() {
    const length = this.u32();
    const output = new Uint16Array(length);
    for (let index = 0; index < length; index += 1) output[index] = this.u16();
    return output;
  }
  address(): WorldAddressV1 { return Object.freeze({ universeId: this.string(), locationId: this.string() }); }
  sectionAddress(): WorldSectionAddressV1 {
    return Object.freeze({ ...this.address(), chunkX: this.i32(), chunkZ: this.i32(), sectionY: this.i16() });
  }
  identity(): WorldAuthorityIdentityV1 {
    return Object.freeze({
      address: this.address(),
      revision: Object.freeze({ epoch: this.u64(), mutation: this.u64(), residency: this.u64() }),
      stateHash: this.string(),
    });
  }
  position() { return Object.freeze({ x: this.i32(), y: this.i32(), z: this.i32() }); }
  liquid(): RustLiquidMetadataR4V1 {
    const kind = this.u8();
    const level = this.u8();
    const flags = this.u8();
    return Object.freeze({ kind, level, flags });
  }
}

export function encodeRustWorldAuthorityRequestR4V1(request: RustWorldAuthorityRequestR4V1) {
  const writer = new Writer(request);
  switch (request.type) {
    case "authority-init-r4-v1": {
      writer.address(request.address);
      const catalog = request.catalog ?? { waterBlockId: 7, directionalBlocks: [], waterloggedBlocks: [] };
      writer.u16(catalog.waterBlockId);
      writer.sortedU16Set(catalog.directionalBlocks);
      writer.sortedU16Set(catalog.waterloggedBlocks);
      break;
    }
    case "authority-install-sections-r4-v1": {
      writer.identity(request.identity);
      writer.u16(request.sections.length);
      for (const section of request.sections) {
        if (section.blocks.length !== 4_096 || section.facing.length !== 4_096 || section.liquidKind.length !== 4_096
          || section.liquidLevel.length !== 4_096 || section.flags.length !== 4_096) {
          throw new RangeError("R4 section install streams must contain exactly 4096 cells");
        }
        writer.sectionAddress(section.address);
        writer.u64(section.sourceRevision);
        writer.string(section.sourceHash);
        writer.u16Array(section.blocks);
        writer.raw(section.facing);
        writer.raw(section.liquidKind);
        writer.raw(section.liquidLevel);
        writer.raw(section.flags);
      }
      const auxiliary = request.auxiliary ?? [];
      writer.u16(auxiliary.length);
      for (const chunk of auxiliary) writer.auxiliary(chunk);
      break;
    }
    case "authority-import-save-r4-v1":
      writer.identity(request.identity);
      writer.address(request.save.address);
      writer.u64(request.save.revision.epoch);
      writer.u64(request.save.revision.mutation);
      writer.u64(request.save.revision.residency);
      writer.u32(request.save.edits.length);
      for (const chunk of request.save.edits) {
        writer.i32(chunk.chunkX); writer.i32(chunk.chunkZ); writer.u32(chunk.entries.length);
        for (const [index, blockId] of chunk.entries) { writer.u32(index); writer.u16(blockId); }
      }
      writer.u32(request.save.facings.length);
      for (const facing of request.save.facings) { writer.position(facing); writer.u8(facing.facing); }
      writer.string(request.save.checksum);
      writer.bytesValue(request.save.rustExtension ?? new Uint8Array());
      break;
    case "authority-residency-intents-r4-v1": {
      writer.identity(request.identity);
      writer.u32(request.intents.length);
      const classes = ["occupied-support", "player-edited", "immediate-opaque", "immediate-translucent", "movement-forward", "visible-mid", "background"] as const;
      const purposes = ["generate", "cache-read", "light", "mesh", "retain"] as const;
      for (const intent of request.intents) {
        writer.u64(intent.requestId); writer.sectionAddress(intent.address);
        writer.u8(classes.indexOf(intent.class)); writer.u8(purposes.indexOf(intent.purpose));
        writer.u32(intent.distanceSquared); writer.u16(intent.directionPenalty); writer.u64(intent.sequence);
      }
      writer.u32(request.cancelledRequestIds.length);
      for (const id of request.cancelledRequestIds) writer.u64(id);
      break;
    }
    case "authority-mutate-r4-v1":
      writer.identity(request.expectedIdentity);
      writer.string(request.batchId); writer.string(request.authorityId); writer.address(request.address);
      writer.u32(request.commands.length);
      for (const command of request.commands) {
        writer.u8(command.kind === "set-block" ? 0 : command.kind === "set-facing" ? 1 : 2);
        writer.position(command);
        if (command.kind === "set-block") { writer.u16(command.blockId); writer.u8(command.facing ?? 0xff); }
        else if (command.kind === "set-facing") writer.u8(command.facing);
        else { writer.u8(command.liquid.kind); writer.u8(command.liquid.level); writer.u8(command.liquid.flags); }
      }
      break;
    case "authority-read-page-r4-v1":
      writer.identity(request.identity); writer.position(request.origin);
      writer.u16(request.size.x); writer.u16(request.size.y); writer.u16(request.size.z);
      break;
    case "authority-evict-sections-r4-v1":
      writer.identity(request.identity); writer.u16(request.sections.length);
      for (const section of request.sections) writer.sectionAddress(section);
      break;
    case "authority-switch-location-r4-v1":
      writer.identity(request.identity); writer.address(request.address);
      break;
    case "authority-export-save-r4-v1":
      writer.identity(request.identity);
      break;
    case "authority-dispose-r4-v1":
      writer.u8(request.identity ? 1 : 0);
      if (request.identity) writer.identity(request.identity);
      break;
    case "authority-patch-auxiliary-r4-v1":
      writer.identity(request.identity); writer.u16(request.patches.length);
      for (const patch of request.patches) writer.auxiliaryPatch(patch);
      break;
  }
  return writer.finish();
}

function base(requestId: number) {
  return { protocolVersion: 1, worldProtocolVersion: 1, schemaVersion: 1, requestId } as const;
}

function decodeImmediateEvent(reader: Reader): RustImmediateEditEventR4V1 | undefined {
  if (reader.u8() === 0) return undefined;
  const sequence = reader.u64();
  const address = reader.address();
  const batchId = reader.string();
  const identity = reader.identity();
  const changes = Array.from({ length: reader.u32() }, () => {
    const position = reader.position();
    const previousBlockId = reader.u16();
    const previousFacing = reader.u8();
    const previousLiquid = reader.liquid();
    const blockId = reader.u16();
    const facing = reader.u8();
    const liquid = reader.liquid();
    return Object.freeze({ ...position, previousBlockId, blockId, previousFacing, facing, previousLiquid, liquid });
  });
  const dirtySectionKeys = Array.from({ length: reader.u32() }, () => reader.string());
  return Object.freeze({ sequence, address, batchId, identity, changes: Object.freeze(changes), dirtySectionKeys: Object.freeze(dirtySectionKeys) });
}

export function decodeRustWorldAuthorityResponseR4V1(
  request: RustWorldAuthorityRequestR4V1,
  value: Uint8Array | ArrayBuffer,
): RustWorldAuthorityDecodedResponseR4V1 {
  const reader = new Reader(asBytes(value));
  if (reader.operation !== OPERATIONS[request.type] || reader.requestId !== request.requestId) {
    throw new TypeError("Rust world authority response operation or request id mismatch");
  }
  if (reader.status !== 0) {
    const code = reader.string();
    const message = reader.string();
    reader.finish();
    return { response: { ...base(request.requestId), type: "authority-error-r4-v1", code, message } };
  }
  let handle: number | undefined;
  let response: RustWorldAuthorityResponseR4V1;
  switch (request.type) {
    case "authority-init-r4-v1":
      handle = reader.u32();
      response = { ...base(request.requestId), type: "authority-ready-r4-v1", identity: reader.identity() };
      break;
    case "authority-install-sections-r4-v1":
      response = {
        ...base(request.requestId), type: "authority-sections-installed-r4-v1", identity: reader.identity(),
        accepted: reader.u32(), stale: reader.u32(), auxiliaryAccepted: reader.u32(), markerRows: reader.u32(),
      };
      break;
    case "authority-import-save-r4-v1":
      response = { ...base(request.requestId), type: "authority-save-imported-r4-v1", identity: reader.identity(), edits: reader.u32() };
      break;
    case "authority-residency-intents-r4-v1":
      response = { ...base(request.requestId), type: "authority-residency-accepted-r4-v1", identity: reader.identity(), queued: reader.u32(), cancelled: reader.u32() };
      break;
    case "authority-mutate-r4-v1": {
      const identity = reader.identity();
      const status = reader.u8() === 0 ? "accepted" : "rejected";
      const mutated = reader.u8() !== 0;
      const rejectionCode = reader.string();
      const message = reader.string();
      const immediateEvent = decodeImmediateEvent(reader);
      response = {
        ...base(request.requestId), type: "authority-mutation-result-r4-v1", identity, status, mutated,
        ...(rejectionCode ? { rejectionCode } : {}), ...(message ? { message } : {}), ...(immediateEvent ? { immediateEvent } : {}),
      };
      break;
    }
    case "authority-read-page-r4-v1": {
      const identity = reader.identity();
      const address = reader.address();
      const origin = reader.position();
      const size = Object.freeze({ x: reader.u16(), y: reader.u16(), z: reader.u16() });
      const sectionRevisions = Array.from({ length: reader.u32() }, () => Object.freeze({
        address: reader.sectionAddress(), blocks: reader.u64(), metadata: reader.u64(), halo: reader.u64(),
      }));
      const snapshotHash = reader.string();
      const page = createWorldReadWindowV1({
        address, origin, size, identity, sectionRevisions,
        streams: {
          loadedMask: reader.bytesValue(), boundary: reader.bytesValue(), blocks: reader.u16Array(),
          facing: reader.bytesValue(), liquidKind: reader.bytesValue(), liquidLevel: reader.bytesValue(), flags: reader.bytesValue(),
        },
      });
      if (page.snapshotHash !== snapshotHash) throw new TypeError("Rust read page snapshot hash does not match the canonical browser contract");
      response = { ...base(request.requestId), type: "authority-read-page-result-r4-v1", identity, page };
      break;
    }
    case "authority-evict-sections-r4-v1":
      response = { ...base(request.requestId), type: "authority-sections-evicted-r4-v1", identity: reader.identity(), evicted: reader.u32() };
      break;
    case "authority-switch-location-r4-v1":
      response = { ...base(request.requestId), type: "authority-location-switched-r4-v1", identity: reader.identity() };
      break;
    case "authority-export-save-r4-v1":
      response = { ...base(request.requestId), type: "authority-save-result-r4-v1", identity: reader.identity(), compatibilityJson: reader.bytesValue(), rustExtension: reader.bytesValue() };
      break;
    case "authority-dispose-r4-v1":
      response = { ...base(request.requestId), type: "authority-disposed-r4-v1" };
      break;
    case "authority-patch-auxiliary-r4-v1":
      response = {
        ...base(request.requestId), type: "authority-auxiliary-patched-r4-v1", identity: reader.identity(),
        accepted: reader.u32(), lightSections: reader.u32(), lightCells: reader.u32(),
      };
      break;
  }
  reader.finish();
  return Object.freeze({ response: Object.freeze(response), ...(handle === undefined ? {} : { handle }) });
}
