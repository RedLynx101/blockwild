/* tslint:disable */
/* eslint-disable */

export function blockwild_engine_create(config_envelope: Uint8Array): Uint8Array;

export function blockwild_engine_destroy(handle: number): Uint8Array;

export function blockwild_engine_ingest(handle: number, batch: Uint8Array): Uint8Array;

export function blockwild_engine_state_hash(handle: number): Uint8Array;

export function blockwild_engine_step(handle: number, monotonic_time_us: number, budget_us: number): Uint8Array;

export function blockwild_engine_take_events(handle: number): Uint8Array;

export function blockwild_protocol_version(): number;

export function blockwild_schema_version(): number;

/**
 * Create one long-lived R4 authority. The request includes the complete
 * directional/waterlogging catalog required to preserve mutation semantics.
 */
export function blockwild_world_authority_create_r4(request_bytes: Uint8Array): Uint8Array;

/**
 * Destroy a live R4 authority. Destruction is identity-bound so an obsolete
 * worker cannot tear down a replacement authority that reused a request path.
 */
export function blockwild_world_authority_destroy_r4(handle: number, request_bytes: Uint8Array): Uint8Array;

/**
 * Execute a bounded R4 authority request against a live handle.
 */
export function blockwild_world_authority_request_r4(handle: number, request_bytes: Uint8Array): Uint8Array;

/**
 * Rebuild packed sky/R/G/B light for one complete section. `direct_sky_above`
 * is exactly 256 nibble levels in x + 16*z order. The result uses the same
 * `BWL1`/`BWI1`/`BWE1` coarse-payload convention as meshing.
 */
export function blockwild_world_light_section_v1(snapshot_bytes: Uint8Array, registry_bytes: Uint8Array, direct_sky_above: Uint8Array): Uint8Array;

/**
 * Validate and mesh one complete R2 section. The returned payload begins with
 * `BWM1` on success, `BWI1` when the whole section must fall back to the
 * TypeScript oracle, or `BWE1` on malformed input. This is intentionally one
 * coarse call per section, never one call per voxel.
 */
export function blockwild_world_mesh_section_v1(snapshot_bytes: Uint8Array, registry_bytes: Uint8Array): Uint8Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly blockwild_engine_create: (a: number, b: number, c: number) => void;
    readonly blockwild_engine_destroy: (a: number, b: number) => void;
    readonly blockwild_engine_ingest: (a: number, b: number, c: number, d: number) => void;
    readonly blockwild_engine_state_hash: (a: number, b: number) => void;
    readonly blockwild_engine_step: (a: number, b: number, c: number, d: number) => void;
    readonly blockwild_engine_take_events: (a: number, b: number) => void;
    readonly blockwild_protocol_version: () => number;
    readonly blockwild_world_authority_create_r4: (a: number, b: number, c: number) => void;
    readonly blockwild_world_authority_destroy_r4: (a: number, b: number, c: number, d: number) => void;
    readonly blockwild_world_authority_request_r4: (a: number, b: number, c: number, d: number) => void;
    readonly blockwild_world_light_section_v1: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly blockwild_world_mesh_section_v1: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly blockwild_schema_version: () => number;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
