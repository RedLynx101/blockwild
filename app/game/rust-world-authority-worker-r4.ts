import {
  assertRustWorldAuthorityResponseR4V1,
  rustWorldAuthorityResponseTransferListR4V1,
  type RustWorldAuthorityRequestR4V1,
  type RustWorldAuthorityResponseR4V1,
  type RustWorldAuthorityTransportR4V1,
} from "./rust-world-authority-bridge-r4";

type WorkerMessageEvent<T> = Readonly<{ data: T }>;

export interface RustWorldAuthorityWorkerPortR4V1 {
  postMessage(message: RustWorldAuthorityRequestR4V1, transfer?: readonly ArrayBuffer[]): void;
  addEventListener(type: "message", listener: (event: WorkerMessageEvent<RustWorldAuthorityResponseR4V1>) => void): void;
  removeEventListener(type: "message", listener: (event: WorkerMessageEvent<RustWorldAuthorityResponseR4V1>) => void): void;
  terminate?(): void;
}

export interface RustWorldAuthorityKernelPortR4V1 {
  handle(request: RustWorldAuthorityRequestR4V1): RustWorldAuthorityResponseR4V1 | Promise<RustWorldAuthorityResponseR4V1>;
  dispose?(): void | Promise<void>;
}

export class RustWorldAuthorityWorkerTransportR4V1 implements RustWorldAuthorityTransportR4V1 {
  private readonly pending = new Map<number, Readonly<{
    resolve(response: RustWorldAuthorityResponseR4V1): void;
    reject(error: Error): void;
    timeout: ReturnType<typeof setTimeout>;
  }>>();
  private disposed = false;
  private readonly receive = (event: WorkerMessageEvent<RustWorldAuthorityResponseR4V1>) => {
    const response = event.data;
    const pending = this.pending.get(response?.requestId);
    if (!pending) return;
    this.pending.delete(response.requestId);
    clearTimeout(pending.timeout);
    try {
      assertRustWorldAuthorityResponseR4V1(response, response.requestId);
      pending.resolve(response);
    } catch (error) {
      pending.reject(error instanceof Error ? error : new Error(String(error)));
    }
  };

  private readonly failWorker = (event: unknown) => {
    const candidate = event as { message?: unknown };
    const error = new Error(typeof candidate?.message === "string" ? candidate.message : "Rust world authority worker crashed");
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
    this.options.onFatal?.(error);
  };

  constructor(
    private readonly worker: RustWorldAuthorityWorkerPortR4V1,
    private readonly options: Readonly<{ timeoutMs?: number; observeWorkerErrors?: boolean; onFatal?: (error: Error) => void }> = {},
  ) {
    worker.addEventListener("message", this.receive);
    if (options.observeWorkerErrors) {
      const target = worker as unknown as {
        addEventListener(type: "error" | "messageerror", listener: (event: unknown) => void): void;
      };
      target.addEventListener("error", this.failWorker);
      target.addEventListener("messageerror", this.failWorker);
    }
  }

  request(message: RustWorldAuthorityRequestR4V1, transfer: readonly ArrayBuffer[] = []) {
    if (this.disposed) return Promise.reject(new Error("Rust world authority worker transport is disposed"));
    if (this.pending.has(message.requestId)) return Promise.reject(new Error(`duplicate authority request ${message.requestId}`));
    return new Promise<RustWorldAuthorityResponseR4V1>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!this.pending.delete(message.requestId)) return;
        const error = new Error(`Rust world authority request ${message.requestId} timed out`);
        reject(error);
        this.options.onFatal?.(error);
      }, this.options.timeoutMs ?? 15_000);
      this.pending.set(message.requestId, { resolve, reject, timeout });
      try {
        this.worker.postMessage(message, transfer);
      } catch (error) {
        this.pending.delete(message.requestId);
        clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.worker.removeEventListener("message", this.receive);
    if (this.options.observeWorkerErrors) {
      const target = this.worker as unknown as {
        removeEventListener(type: "error" | "messageerror", listener: (event: unknown) => void): void;
      };
      target.removeEventListener("error", this.failWorker);
      target.removeEventListener("messageerror", this.failWorker);
    }
    this.worker.terminate?.();
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Rust world authority worker transport disposed"));
    }
    this.pending.clear();
  }
}

export function installRustWorldAuthorityWorkerHandlerR4V1(
  scope: Readonly<{
    addEventListener(type: "message", listener: (event: WorkerMessageEvent<RustWorldAuthorityRequestR4V1>) => void): void;
    postMessage(message: RustWorldAuthorityResponseR4V1, transfer?: readonly ArrayBuffer[]): void;
  }>,
  kernel: RustWorldAuthorityKernelPortR4V1,
) {
  let tail = Promise.resolve();
  scope.addEventListener("message", (event) => {
    const request = event.data;
    tail = tail.then(async () => {
      let response: RustWorldAuthorityResponseR4V1;
      try {
        response = await kernel.handle(request);
        assertRustWorldAuthorityResponseR4V1(response, request.requestId);
      } catch (error) {
        response = {
          type: "authority-error-r4-v1",
          protocolVersion: 1,
          worldProtocolVersion: 1,
          schemaVersion: 1,
          requestId: Number.isSafeInteger(request?.requestId) ? request.requestId : 0,
          code: "kernel-error",
          message: error instanceof Error ? error.message : String(error),
        };
      }
      scope.postMessage(response, rustWorldAuthorityResponseTransferListR4V1(response));
      if (request.type === "authority-dispose-r4-v1") await kernel.dispose?.();
    });
  });
}
