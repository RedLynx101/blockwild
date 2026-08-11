/* tslint:disable */
/* eslint-disable */

export function blockwild_engine_create(config_envelope: Uint8Array): Uint8Array;

export function blockwild_engine_destroy(handle: number): Uint8Array;

export function blockwild_engine_ingest(handle: number, batch: Uint8Array): Uint8Array;

export function blockwild_engine_state_hash(handle: number): Uint8Array;

export function blockwild_engine_step(handle: number, monotonic_time_us: number, budget_us: number): Uint8Array;

export function blockwild_engine_take_events(handle: number): Uint8Array;

export function blockwild_protocol_version(): number;

/**
 * Run the real browser-WebGPU offscreen smoke path and return capability diagnostics.
 */
export function blockwild_render_smoke(): Promise<string>;

/**
 * Canonical scene bytes consumed by both the Three.js oracle and `wgpu` smoke path.
 */
export function blockwild_render_smoke_fixture(): Uint8Array;

export function blockwild_schema_version(): number;

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
    readonly blockwild_render_smoke: () => number;
    readonly blockwild_render_smoke_fixture: (a: number) => void;
    readonly blockwild_schema_version: () => number;
    readonly __wasm_bindgen_func_elem_1247: (a: number, b: number, c: number, d: number) => void;
    readonly __wasm_bindgen_func_elem_315: (a: number, b: number, c: number, d: number) => void;
    readonly __wasm_bindgen_func_elem_315_2: (a: number, b: number, c: number, d: number) => void;
    readonly __wasm_bindgen_func_elem_315_3: (a: number, b: number, c: number, d: number) => void;
    readonly __wasm_bindgen_func_elem_1261: (a: number, b: number, c: number, d: number) => void;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export3: (a: number) => void;
    readonly __wbindgen_export4: (a: number, b: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export5: (a: number, b: number, c: number) => void;
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
