export type TerrainSectionGeometry = Readonly<{
  positions: Float32Array;
  normals: Int8Array;
  colors: Uint8Array;
  lights: Uint8Array;
  emissions: Uint8Array;
  occlusions: Uint8Array;
  uvs: Uint16Array;
  indices: Uint16Array | Uint32Array;
}>;

export type TerrainMergedGeometry = Omit<TerrainSectionGeometry, "indices"> & Readonly<{ indices: Uint32Array }>;

export function mergeTerrainGeometry(parts: readonly TerrainSectionGeometry[]): TerrainMergedGeometry | null {
  if (!parts.length) return null;
  const vertices = parts.reduce((total, part) => total + part.positions.length / 3, 0);
  const indexCount = parts.reduce((total, part) => total + part.indices.length, 0);
  const merged: TerrainMergedGeometry = {
    positions: new Float32Array(vertices * 3),
    normals: new Int8Array(vertices * 3),
    colors: new Uint8Array(vertices * 3),
    lights: new Uint8Array(vertices * 4),
    emissions: new Uint8Array(vertices),
    occlusions: new Uint8Array(vertices),
    uvs: new Uint16Array(vertices * 2),
    indices: new Uint32Array(indexCount),
  };
  let vertexOffset = 0;
  let indexOffset = 0;
  for (const part of parts) {
    const verticesInPart = part.positions.length / 3;
    merged.positions.set(part.positions, vertexOffset * 3);
    merged.normals.set(part.normals, vertexOffset * 3);
    merged.colors.set(part.colors, vertexOffset * 3);
    merged.lights.set(part.lights, vertexOffset * 4);
    merged.emissions.set(part.emissions, vertexOffset);
    merged.occlusions.set(part.occlusions, vertexOffset);
    merged.uvs.set(part.uvs, vertexOffset * 2);
    for (let index = 0; index < part.indices.length; index += 1) {
      merged.indices[indexOffset + index] = part.indices[index] + vertexOffset;
    }
    vertexOffset += verticesInPart;
    indexOffset += part.indices.length;
  }
  return merged;
}

type TerrainWorkerResponse = Readonly<{ type: "ready"; protocol: number }>
  | Readonly<{ type: "result"; id: number; geometry: TerrainMergedGeometry | null }>
  | Readonly<{ type: "task-error"; id: number; message: string }>;
type TerrainWorkerCallback = Readonly<{
  complete: (geometry: TerrainMergedGeometry | null) => void;
  fail: () => void;
}>;

export class TerrainBufferPipeline {
  private worker: Worker | null = null;
  private nextId = 1;
  private callbacks = new Map<number, TerrainWorkerCallback>();
  submitted = 0;
  completed = 0;
  failed = 0;
  transferBytes = 0;
  ready = false;
  restarts = 0;
  lastError: string | null = null;

  constructor() {
    if (typeof document === "undefined" || typeof Worker === "undefined") return;
    this.startWorker();
  }

  private startWorker() {
    try {
      this.worker = new Worker(new URL("./terrain-buffer-worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (event: MessageEvent<TerrainWorkerResponse>) => {
        if (event.data.type === "ready") {
          if (event.data.protocol !== 1) {
            this.lastError = `Terrain buffer worker protocol ${event.data.protocol} is incompatible with 1`;
            this.failWorker();
          } else this.ready = true;
          return;
        }
        if (event.data.type === "task-error") {
          this.lastError = event.data.message;
          const callback = this.callbacks.get(event.data.id);
          this.callbacks.delete(event.data.id);
          if (callback) { this.failed += 1; callback.fail(); }
          return;
        }
        const callback = this.callbacks.get(event.data.id);
        if (!callback) return;
        this.callbacks.delete(event.data.id);
        this.completed += 1;
        callback.complete(event.data.geometry);
      };
      this.worker.onerror = (event) => {
        this.lastError = event.message || "Terrain buffer worker failed without an error message";
        this.failWorker();
      };
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.worker = null;
    }
  }

  private failWorker() {
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    this.failed += callbacks.length;
    for (const callback of callbacks) callback.fail();
    if (this.restarts < 1) {
      this.restarts += 1;
      this.startWorker();
    }
  }

  get supported() { return Boolean(this.worker && this.ready); }

  submit(
    parts: readonly TerrainSectionGeometry[],
    complete: (geometry: TerrainMergedGeometry | null) => void,
    fail: () => void = () => {},
  ) {
    this.submitted += 1;
    if (!this.worker || !this.ready) {
      this.completed += 1;
      complete(mergeTerrainGeometry(parts));
      return;
    }
    const id = this.nextId++;
    this.callbacks.set(id, { complete, fail });
    const transfer: ArrayBuffer[] = [];
    for (const part of parts) for (const array of Object.values(part)) {
      this.transferBytes += array.byteLength;
      transfer.push(array.buffer as ArrayBuffer);
    }
    try {
      this.worker.postMessage({ id, parts }, transfer);
    } catch {
      this.worker.terminate();
      this.worker = null;
      const callbacks = [...this.callbacks.values()];
      this.callbacks.clear();
      this.failed += callbacks.length;
      for (const callback of callbacks) callback.fail();
    }
  }

  diagnostics() {
    return {
      supported: this.supported,
      submitted: this.submitted,
      completed: this.completed,
      failed: this.failed,
      pending: this.callbacks.size,
      transferBytes: this.transferBytes,
      ready: this.ready,
      restarts: this.restarts,
      lastError: this.lastError,
    } as const;
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.callbacks.clear();
  }
}
