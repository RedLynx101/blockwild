import assert from "node:assert/strict";
import test from "node:test";
import {
  EngineFacade,
  resolveEngineSelection,
  resolveRendererSelection,
  type EngineBackend,
  type EngineStepResult,
} from "../app/game/engine-facade.ts";

class StubBackend implements EngineBackend {
  starts = 0;
  ingests = 0;
  steps = 0;
  shutdowns = 0;

  constructor(
    readonly name: "typescript" | "rust",
    private readonly hash: string,
    private readonly startError?: Error,
  ) {}

  async start() { this.starts += 1; if (this.startError) throw this.startError; }
  async ingest() { this.ingests += 1; }
  async step(): Promise<EngineStepResult> {
    this.steps += 1;
    return { events: new Uint8Array([this.name === "typescript" ? 1 : 2]), stateHash: this.hash };
  }
  async shutdown() { this.shutdowns += 1; }
  diagnostics() { return { starts: this.starts, steps: this.steps }; }
}

test("facade defaults to TypeScript authority without touching Rust", async () => {
  const typescript = new StubBackend("typescript", "same");
  const rust = new StubBackend("rust", "same");
  const facade = new EngineFacade({ typescript, rust });
  const result = await facade.step({ monotonicTimeUs: 1_000, budgetUs: 2_000 });
  assert.deepEqual([...result.events], [1]);
  assert.equal(typescript.starts, 1);
  assert.equal(rust.starts, 0);
  assert.equal(facade.diagnostics().engine.authorityMode, "typescript-authoritative");
  await facade.shutdown();
});

test("missing Rust shadow falls back without preventing TypeScript play", async () => {
  const typescript = new StubBackend("typescript", "ts");
  const rust = new StubBackend("rust", "rust", new Error("artifact missing"));
  const facade = new EngineFacade({ typescript, rust, engineSelection: "rust-shadow" });
  const result = await facade.step({ monotonicTimeUs: 1, budgetUs: 1 });
  assert.equal(result.stateHash, "ts");
  assert.equal(facade.diagnostics().engine.effective, "typescript");
  assert.match(facade.diagnostics().rustStartError ?? "", /artifact missing/);
  await facade.shutdown();
});

test("shadow mode returns TypeScript output and records bounded hash divergence", async () => {
  const facade = new EngineFacade({
    typescript: new StubBackend("typescript", "ts-hash"),
    rust: new StubBackend("rust", "rust-hash"),
    engineSelection: "rust-shadow",
    maximumDivergences: 2,
  });
  const result = await facade.step({ monotonicTimeUs: 1, budgetUs: 1 });
  assert.equal(result.stateHash, "ts-hash");
  assert.equal(facade.diagnostics().divergences.length, 1);
  assert.equal(facade.diagnostics().divergences[0].type, "state-hash");
  await facade.shutdown();
});

test("engine and renderer selectors resolve independently", () => {
  const engine = resolveEngineSelection("rust", { rustAvailable: true, allowRustShadow: true, allowRustAuthority: false });
  const renderer = resolveRendererSelection("wgpu-shadow", { webGpuAvailable: true, allowWgpuShadow: true, allowWgpuPrimary: false });
  assert.equal(engine.effective, "typescript", "R0 cannot accidentally promote Rust authority");
  assert.equal(renderer.effective, "wgpu-shadow", "renderer experimentation does not depend on engine authority");
});
