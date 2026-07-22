import type { StructureMarker } from "./structures";

export type TerrainGenerationRequest = Readonly<{
  namespace: string;
  seedText: string;
  generationOptions: Readonly<Record<string, unknown>>;
  key: string;
  cx: number;
  cz: number;
  edits: readonly (readonly [number, number])[];
}>;

export type TerrainGenerationResult = Readonly<{
  namespace: string;
  key: string;
  cx: number;
  cz: number;
  blocks: Uint16Array;
  heightmap: Int16Array;
  biomes: Uint8Array;
  sectionBlockCounts: Uint16Array;
  skyTops: Int16Array;
  light: Uint16Array;
  lightIndices: readonly number[];
  leafIndices: readonly number[];
  /** Worker-side generation effects that cannot be reconstructed from voxels. */
  structureMarkers: readonly (readonly [string, StructureMarker])[];
}>;

type WorkerResponse = Readonly<{ id: number; result: TerrainGenerationResult }>;
type WorkerCallback = Readonly<{
  complete: (result: TerrainGenerationResult) => void;
  fail: () => void;
}>;
type Slot = { worker: Worker; busy: boolean; currentId: number | null };

/** Two workers keep a player-priority lane available without oversubscribing CPUs. */
export class TerrainGenerationPipeline {
  private slots: Slot[] = [];
  private nextId = 1;
  private callbacks = new Map<number, WorkerCallback>();
  submitted = 0;
  completed = 0;
  failed = 0;
  stale = 0;
  transferBytes = 0;

  constructor(workerCount = 2) {
    if (typeof document === "undefined" || typeof Worker === "undefined") return;
    for (let index = 0; index < workerCount; index += 1) this.addWorker();
  }

  private addWorker() {
    try {
      const slot: Slot = {
        worker: new Worker(new URL("./terrain-generation-worker.ts", import.meta.url), { type: "module" }),
        busy: false,
        currentId: null,
      };
      slot.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        slot.busy = false;
        slot.currentId = null;
        const callback = this.callbacks.get(event.data.id);
        if (!callback) {
          this.stale += 1;
          return;
        }
        this.callbacks.delete(event.data.id);
        this.completed += 1;
        const result = event.data.result;
        this.transferBytes += result.blocks.byteLength + result.heightmap.byteLength + result.biomes.byteLength
          + result.sectionBlockCounts.byteLength + result.skyTops.byteLength + result.light.byteLength
          + JSON.stringify(result.structureMarkers).length * 2;
        callback.complete(result);
      };
      slot.worker.onerror = () => {
        const failedId = slot.currentId;
        slot.busy = false;
        slot.currentId = null;
        slot.worker.terminate();
        this.slots = this.slots.filter((candidate) => candidate !== slot);
        if (failedId === null) return;
        const callback = this.callbacks.get(failedId);
        this.callbacks.delete(failedId);
        if (!callback) return;
        this.failed += 1;
        callback.fail();
      };
      this.slots.push(slot);
    } catch {
      // Browser/CSP fallback remains the existing resumable main-thread path.
    }
  }

  get supported() { return this.slots.length > 0; }
  get availableSlots() { return this.slots.filter((slot) => !slot.busy).length; }

  submit(
    request: TerrainGenerationRequest,
    complete: (result: TerrainGenerationResult) => void,
    fail: () => void = () => {},
  ) {
    const slot = this.slots.find((candidate) => !candidate.busy);
    if (!slot) return false;
    const id = this.nextId++;
    slot.busy = true;
    slot.currentId = id;
    this.callbacks.set(id, { complete, fail });
    this.submitted += 1;
    try {
      slot.worker.postMessage({ id, request });
    } catch {
      slot.busy = false;
      slot.currentId = null;
      slot.worker.terminate();
      this.slots = this.slots.filter((candidate) => candidate !== slot);
      this.callbacks.delete(id);
      this.failed += 1;
      return false;
    }
    return true;
  }

  diagnostics() {
    return {
      supported: this.supported,
      workers: this.slots.length,
      busy: this.slots.filter((slot) => slot.busy).length,
      submitted: this.submitted,
      completed: this.completed,
      failed: this.failed,
      stale: this.stale,
      transferBytes: this.transferBytes,
    } as const;
  }

  dispose() {
    for (const slot of this.slots) slot.worker.terminate();
    this.slots = [];
    this.callbacks.clear();
  }
}
