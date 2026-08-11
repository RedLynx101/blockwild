import {
  assertRustGameplayAuthorityRequestR7,
  assertRustGameplayAuthorityResponseR7,
  rustGameplayResponseTransferListR7,
  type RustGameplayAuthorityKernelR7,
  type RustGameplayAuthorityRequestR7,
  type RustGameplayAuthorityResponseR7,
  type RustGameplayAuthorityTransportR7,
} from "./rust-gameplay-contract-r7";

export interface RustGameplayWorkerPortR7 {
  postMessage(message: RustGameplayAuthorityRequestR7, transfer?: readonly ArrayBuffer[]): void;
  addEventListener(type: "message", listener: (event: Readonly<{ data: RustGameplayAuthorityResponseR7 }>) => void): void;
  addEventListener(type: "error" | "messageerror", listener: (event: unknown) => void): void;
  removeEventListener(type: "message", listener: (event: Readonly<{ data: RustGameplayAuthorityResponseR7 }>) => void): void;
  removeEventListener(type: "error" | "messageerror", listener: (event: unknown) => void): void;
  terminate?(): void;
}

type Pending = Readonly<{
  request: RustGameplayAuthorityRequestR7;
  resolve: (response: RustGameplayAuthorityResponseR7) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}>;

function validationCopy(request: RustGameplayAuthorityRequestR7): RustGameplayAuthorityRequestR7 {
  if (request.type === "gameplay-initialize-r7-v1") return { ...request, bytes: request.bytes.slice(0) };
  if (request.type === "gameplay-replace-snapshot-r7-v1") return { ...request, expected: { ...request.expected, revision: { ...request.expected.revision } }, bytes: request.bytes.slice(0) };
  if (request.type === "gameplay-apply-r7-v1") {
    return {
      ...request,
      batch: {
        ...request.batch,
        actor: { ...request.batch.actor },
        expected: { ...request.batch.expected, revision: { ...request.batch.expected.revision } },
        commands: request.batch.commands.map((command) => ({ ...command, payload: Uint8Array.from(command.payload) })),
      },
    };
  }
  if (request.type === "gameplay-view-r7-v1") return { ...request, query: { ...request.query, domains: [...request.query.domains], owners: [...request.query.owners], recordIds: [...request.query.recordIds] } };
  if (request.type === "gameplay-export-snapshot-r7-v1") return { ...request, expected: { ...request.expected, revision: { ...request.expected.revision } } };
  return request;
}

/** Fail-closed request/response transport. Unknown and stale replies are never accepted. */
export class RustGameplayWorkerTransportR7 implements RustGameplayAuthorityTransportR7 {
  private readonly pending = new Map<number, Pending>();
  private disposed = false;

  private readonly receive = (event: Readonly<{ data: RustGameplayAuthorityResponseR7 }>) => {
    const response = event.data;
    const requestId = typeof response?.requestId === "number" ? response.requestId : -1;
    const pending = this.pending.get(requestId);
    if (!pending || response.runtimeEpoch !== pending.request.runtimeEpoch) {
      this.options.onStaleResult?.(response);
      return;
    }
    this.pending.delete(requestId);
    clearTimeout(pending.timeout);
    try { pending.resolve(assertRustGameplayAuthorityResponseR7(response, pending.request)); }
    catch (error) { pending.reject(error instanceof Error ? error : new Error(String(error))); }
  };

  private readonly fail = (event: unknown) => {
    const message = (event as { message?: unknown })?.message;
    const error = new Error(typeof message === "string" ? message : "R7 gameplay worker crashed");
    for (const pending of this.pending.values()) { clearTimeout(pending.timeout); pending.reject(error); }
    this.pending.clear();
    this.options.onFatal?.(error);
  };

  constructor(
    private readonly worker: RustGameplayWorkerPortR7,
    private readonly options: Readonly<{
      timeoutMs?: number;
      onFatal?: (error: Error) => void;
      onStaleResult?: (response: RustGameplayAuthorityResponseR7) => void;
    }> = {},
  ) {
    worker.addEventListener("message", this.receive);
    worker.addEventListener("error", this.fail);
    worker.addEventListener("messageerror", this.fail);
  }

  request(request: RustGameplayAuthorityRequestR7, transfer: readonly ArrayBuffer[] = []) {
    if (this.disposed) return Promise.reject(new Error("R7 gameplay worker transport is disposed"));
    try { assertRustGameplayAuthorityRequestR7(request); } catch (error) { return Promise.reject(error); }
    if (this.pending.has(request.requestId)) return Promise.reject(new Error(`duplicate R7 gameplay request ${request.requestId}`));
    return new Promise<RustGameplayAuthorityResponseR7>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!this.pending.delete(request.requestId)) return;
        const error = new Error(`R7 gameplay request ${request.requestId} timed out`);
        reject(error);
        this.options.onFatal?.(error);
      }, this.options.timeoutMs ?? 15_000);
      this.pending.set(request.requestId, { request: validationCopy(request), resolve, reject, timeout });
      try { this.worker.postMessage(request, transfer); }
      catch (error) {
        this.pending.delete(request.requestId);
        clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.worker.removeEventListener("message", this.receive);
    this.worker.removeEventListener("error", this.fail);
    this.worker.removeEventListener("messageerror", this.fail);
    this.worker.terminate?.();
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("R7 gameplay worker transport disposed"));
    }
    this.pending.clear();
  }
}

/** Install a serialized worker-side dispatcher around the Rust/Wasm kernel. */
export function installRustGameplayWorkerHandlerR7(
  scope: Readonly<{
    addEventListener(type: "message", listener: (event: Readonly<{ data: RustGameplayAuthorityRequestR7 }>) => void): void;
    postMessage(message: RustGameplayAuthorityResponseR7, transfer?: readonly ArrayBuffer[]): void;
  }>,
  kernel: RustGameplayAuthorityKernelR7,
) {
  let tail = Promise.resolve();
  scope.addEventListener("message", (event) => {
    tail = tail.then(async () => {
      const incoming = event.data;
      let response: RustGameplayAuthorityResponseR7;
      try {
        const request = assertRustGameplayAuthorityRequestR7(incoming);
        response = assertRustGameplayAuthorityResponseR7(await kernel.handle(request), request);
      } catch (error) {
        response = {
          protocolVersion: 1,
          schemaVersion: 1,
          requestId: Number.isSafeInteger(incoming?.requestId) ? incoming.requestId : 0,
          runtimeEpoch: Number.isSafeInteger(incoming?.runtimeEpoch) ? incoming.runtimeEpoch : 0,
          type: "gameplay-error-r7-v1",
          code: "kernel-error",
          message: error instanceof Error ? error.message : String(error),
          retriable: false,
        };
      }
      scope.postMessage(response, rustGameplayResponseTransferListR7(response));
      if (incoming.type === "gameplay-dispose-r7-v1") await kernel.dispose?.();
    }).catch(() => { /* The next request remains isolated from a prior rejected task. */ });
  });
}
