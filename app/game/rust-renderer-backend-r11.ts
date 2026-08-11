import type { RenderFrameV2, RenderResourceBatchV2 } from "./rust-render-extraction-v2.ts";
import { RustRendererServiceR11, supportsRustRendererWorkerR11, type RustRendererArtifactR11 } from "./rust-renderer-service-r11.ts";

export type RendererBackendR11 = Readonly<{
  kind: "rust-webgpu";
  resources(batch: RenderResourceBatchV2 | Uint8Array): void;
  frame(frame: RenderFrameV2 | Uint8Array): boolean;
  resize(width: number, height: number): void;
  requestRecovery(reason?: string): void;
  dispose(): void;
  diagnostics(): ReturnType<RustRendererServiceR11["snapshot"]>;
}>;

export type RustRendererCapabilityR11 =
  | Readonly<{ supported: true }>
  | Readonly<{ supported: false; reason: "worker-unavailable" | "offscreen-canvas-unavailable" | "webgpu-unavailable" }>;

export function detectRustRendererCapabilityR11(canvas: Pick<HTMLCanvasElement, "transferControlToOffscreen">): RustRendererCapabilityR11 {
  if (typeof Worker === "undefined") return Object.freeze({ supported: false, reason: "worker-unavailable" });
  if (typeof canvas.transferControlToOffscreen !== "function") return Object.freeze({ supported: false, reason: "offscreen-canvas-unavailable" });
  if (typeof navigator === "undefined" || !("gpu" in navigator)) return Object.freeze({ supported: false, reason: "webgpu-unavailable" });
  return Object.freeze({ supported: true });
}

/**
 * Explicit feature-gated production backend. The caller extracts renderer V2
 * DTOs directly from authoritative stores; this adapter never walks Three
 * objects and never reads individual voxels.
 */
export function createRustRendererBackendR11(options: Readonly<{
  canvas: HTMLCanvasElement;
  artifact: RustRendererArtifactR11;
  epoch: bigint;
  width: number;
  height: number;
  service?: RustRendererServiceR11;
}>): RendererBackendR11 | null {
  if (!detectRustRendererCapabilityR11(options.canvas).supported || !supportsRustRendererWorkerR11(options.canvas)) return null;
  const service = options.service ?? new RustRendererServiceR11();
  service.start(options.canvas.transferControlToOffscreen(), options.artifact, options.epoch, options.width, options.height);
  return Object.freeze({
    kind: "rust-webgpu" as const,
    resources: (batch: RenderResourceBatchV2 | Uint8Array) => service.applyResources(batch),
    frame: (frame: RenderFrameV2 | Uint8Array) => service.present(frame),
    resize: (width: number, height: number) => service.resize(width, height),
    requestRecovery: (reason?: string) => service.requestRecovery(reason),
    dispose: () => service.stop(),
    diagnostics: () => service.snapshot(),
  });
}
