import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { validateRendererHardwareEvidenceR11 } from "../scripts/verify-rust-renderer-hardware-r11.mjs";

function passingEvidence() {
  const frame = { visibleInstances: 1003, culledInstances: 69, drawCalls: 361, transparentDrawCalls: 161, deviceLost: false };
  return {
    browser: { secureContext: true, webGpu: true, offscreenCanvas: true },
    adapter: { available: true, isFallbackAdapter: false },
    artifact: { hash: "a".repeat(64), loadedHash: "a".repeat(64), manifestBackend: "wgpu-webgpu" },
    renderer: {
      initialResources: { applied: 8 }, initialFrame: frame,
      resize: { width: 800, height: 450 }, resizedFrame: frame,
      recovery: { recovered: true, requiresResourceReplay: true }, replayedResources: { applied: 8 }, recoveredFrame: frame,
    },
    fullscreen: { attempted: true, supported: true, granted: true },
    diagnostics: { consoleErrors: [], pageErrors: [], logErrors: [] },
    cleanup: { rendererReleased: true, edgeStopped: true, serverClosed: true, profileRemoved: true },
  };
}

test("hardware evidence passes only the browser renderer gate and never authorizes promotion", () => {
  const gate = validateRendererHardwareEvidenceR11(passingEvidence());
  assert.equal(gate.pass, true);
  assert.equal(gate.promotionAuthorized, false);
  assert.match(gate.promotionBlocker, /full-game parity/u);
});

test("hardware evidence fails closed for fallback adapters, skipped draws, missing replay, or dirty diagnostics", () => {
  for (const mutate of [
    evidence => { evidence.adapter.isFallbackAdapter = true; },
    evidence => { evidence.renderer.initialFrame.skipped = "surface-timeout"; },
    evidence => { evidence.renderer.recovery.requiresResourceReplay = false; },
    evidence => { evidence.diagnostics.consoleErrors.push("validation error"); },
    evidence => { evidence.cleanup.rendererReleased = false; },
    evidence => { evidence.cleanup.profileRemoved = false; },
  ]) {
    const evidence = passingEvidence(); mutate(evidence);
    assert.equal(validateRendererHardwareEvidenceR11(evidence).pass, false);
  }
});

test("tracked verifier owns Edge flags, published artifacts, fullscreen, recovery, evidence, and cleanup", async () => {
  const source = await readFile(new URL("../scripts/verify-rust-renderer-hardware-r11.mjs", import.meta.url), "utf8");
  for (const contract of [
    "--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--force-high-performance-gpu", "--use-angle=d3d11",
    "/renderer/manifest.json", "liveResourceFixture", "liveFrameFixture", "isFallbackAdapter",
    "Page.captureScreenshot", "requestFullscreen", "surface.recover()", "requiresResourceReplay",
    "published-live-frame-derived-through-extraction-v2", "createRenderFrameV2", "viewport: [800, 450]",
    "taskkill", "serverClosed", "profileRemoved", "promotionAuthorized: false",
  ]) assert.ok(source.includes(contract), `verifier omitted ${contract}`);
});
