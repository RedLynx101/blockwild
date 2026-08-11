import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}

async function playwrightModule() {
  for (const candidate of [
    "playwright",
    path.join(os.homedir(), ".codex", "skills", "develop-web-game", "scripts", "node_modules", "playwright", "index.mjs"),
  ]) {
    try { return await import(candidate.startsWith("playwright") ? candidate : pathToFileURL(candidate).href); }
    catch { /* try the next installed runtime */ }
  }
  throw new Error("A local Playwright runtime is required for the R4 browser audit");
}

function browserExecutable() {
  const candidates = [
    process.env.BLOCKWILD_BROWSER_EXECUTABLE,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(process.env.LOCALAPPDATA ?? "", "Google", "Chrome", "Application", "chrome.exe"),
  ].filter(Boolean);
  return candidates.find((candidate) => {
    try { return process.getBuiltinModule("fs").statSync(candidate).isFile(); } catch { return false; }
  });
}

async function main() {
  const url = argument("--url", "http://127.0.0.1:3104/?rust-world-authority=shadow&rust-world-authority-r4-audit=1");
  const expectedMode = argument("--mode", "shadow");
  const output = path.resolve(argument("--output", `work/hybrid-rust-migration/r4-browser-${expectedMode}.json`));
  const screenshot = path.resolve(argument("--screenshot", `work/hybrid-rust-migration/r4-browser-${expectedMode}.png`));
  const startupScreenshot = screenshot.replace(/\.png$/u, ".startup.png");
  const profile = argument("--profile", "bounded");
  const quiet = process.argv.includes("--quiet");
  const bootstrapTimeout = Number(argument("--bootstrap-timeout", "90000"));
  const manifest = JSON.parse(await readFile(path.resolve("public/engine/manifest.json"), "utf8"));
  const artifactHash = manifest.artifacts[manifest.defaultVariant].hash;
  const playwright = await playwrightModule();
  const consoleErrors = [];
  const pageErrors = [];
  const artifactRequests = [];
  const browser = await playwright.chromium.launch({
    headless: true,
    executablePath: browserExecutable(),
    args: ["--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    if (profile === "bounded") {
      await page.addInitScript(() => {
        localStorage.setItem("blockwild-settings-v2", JSON.stringify({
          renderDistance: 2,
          simulationDistance: 2,
          basicRenderDistance: 2,
          rememberedBasicRenderDistance: 2,
          resourceMode: "cpu",
        }));
      });
    } else if (profile !== "normal") {
      throw new Error(`Unknown browser audit profile ${profile}`);
    }
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const location = message.location();
      consoleErrors.push(`${message.text()}${location.url ? ` @ ${location.url}` : ""}`);
    });
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    page.on("response", (response) => {
      if (/\/engine\/(?:manifest\.json|[a-f0-9]{64}\/(?:manifest\.json|engine(?:_bg)?\.(?:js|wasm)))/u.test(response.url())) {
        artifactRequests.push({ url: response.url(), status: response.status() });
      }
    });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
    try {
      await page.waitForFunction(() => Boolean(window.blockwildRustWorldAuthorityR4), null, { timeout: bootstrapTimeout });
    } catch (error) {
      throw new Error(`R4 browser harness did not start: ${error instanceof Error ? error.message : String(error)}; console=${JSON.stringify(consoleErrors)}; page=${JSON.stringify(pageErrors)}`);
    }
    const mode = await page.evaluate(() => window.blockwildRustWorldAuthorityR4.mode);
    if (mode !== expectedMode) throw new Error(`Expected Rust world-authority mode ${expectedMode}, received ${mode}`);
    await mkdir(path.dirname(screenshot), { recursive: true });
    await page.screenshot({ path: startupScreenshot, fullPage: false });
    const initialFrame = await page.evaluate(() => JSON.parse(window.render_game_to_text?.() ?? "{}"));
    if (initialFrame.state === "title") {
      await page.getByRole("button", { name: /Create New World/u }).click();
      await page.locator("#world-name").fill(`R4 ${expectedMode} audit`);
      await page.locator("#world-seed").fill("R4AUTHORITY");
      await page.getByRole("button", { name: /CREATIVE/u }).first().click();
      await page.getByRole("button", { name: /Generate World/u }).click();
      await page.waitForFunction(() => {
        const frame = JSON.parse(window.render_game_to_text?.() ?? "{}");
        return frame.state && frame.state !== "title";
      }, null, { timeout: 90_000 });
    }
    const lifecycle = await page.evaluate(() => window.blockwildRustWorldAuthorityR4.exerciseLifecycle());
    const warm = await page.evaluate((position) => window.blockwildRustWorldAuthorityR4.exerciseWarmBenchmark(position), lifecycle.auditPosition);
    await page.waitForTimeout(250);
    const beforeCrash = await page.evaluate(() => window.blockwildRustWorldAuthorityR4.diagnostics());
    const crashRecovery = await page.evaluate(() => window.blockwildRustWorldAuthorityR4.simulateCrash());
    const finalDiagnostics = await page.evaluate(() => window.blockwildRustWorldAuthorityR4.diagnostics());
    await page.evaluate(({ selectedMode, auditPosition }) => {
      const label = document.createElement("div");
      label.id = "r4-authority-audit-label";
      label.textContent = `R4 ${selectedMode.toUpperCase()} · 12 sections + auxiliary · edited block/marker @ ${auditPosition.x},${auditPosition.y},${auditPosition.z}`;
      Object.assign(label.style, {
        position: "fixed", left: "28px", top: "110px", zIndex: "2147483647",
        padding: "10px 14px", color: "#fff", background: "rgba(8,18,24,.9)",
        border: "2px solid #9ee7c5", font: "bold 14px monospace", pointerEvents: "none",
      });
      document.body.append(label);
    }, { selectedMode: expectedMode, auditPosition: lifecycle.auditPosition });
    await page.waitForTimeout(1_000);
    const semanticFrame = await page.evaluate(() => window.render_game_to_text?.() ?? null);
    await page.screenshot({ path: screenshot, fullPage: false });
    const assertions = {
      contentAddressedArtifactLoaded: lifecycle.artifactHash === artifactHash
        && artifactRequests.some((entry) => entry.url.includes(artifactHash) && entry.status === 200),
      createImportInstall: lifecycle.saveRoundTrip === true && lifecycle.all12Sections === true,
      all12SectionsAndAuxiliary: lifecycle.all12Sections === true && lifecycle.auxiliaryAccepted === true,
      markerAndPoiContinuity: lifecycle.markerContinuity === true && lifecycle.markersExpected > 0,
      loadedAirTriState: lifecycle.loadedAirTriState === true,
      atomicMultiEditRollback: lifecycle.atomicRollback === true && lifecycle.rejectionCode === "vertical-boundary",
      immediatePlayerVisibleEdit: lifecycle.immediateVisible === true && lifecycle.mutationReceiptMilliseconds < 2_000,
      synchronousShadowPresentation: expectedMode !== "shadow"
        || lifecycle.synchronousPresentationVisible === true,
      staleRevisionRejected: lifecycle.staleRejected === true,
      saveAndExtensionRoundTrip: lifecycle.saveRoundTrip === true && lifecycle.saveBytes > 0 && lifecycle.extensionBytes > 0,
      memoryCacheRoundTrip: lifecycle.cacheRoundTrip === true,
      boundedSectionMarshalling: lifecycle.installMetrics.sectionsTransferred > 0
        && lifecycle.installMetrics.reinstallSectionBatches <= 1
        && lifecycle.installMetrics.sectionsTransferred
          <= (lifecycle.installMetrics.uniqueSectionChunks + lifecycle.installMetrics.reinstallSectionBatches) * 12
        && lifecycle.installMetrics.copiedBytes > 0,
      residencyAndCancellation: lifecycle.residencyQueued > 0 && lifecycle.residencyCancelled === 1,
      locationSwitch: lifecycle.locationSwitch === true,
      crashFallbackAndRestart: crashRecovery.restarted === true && crashRecovery.fallbackObserved === true
        && crashRecovery.recoveredAuthority === true && finalDiagnostics.state === "ready",
      zeroPerVoxelMessages: lifecycle.zeroPerVoxelMessages === true,
      noParityMismatch: finalDiagnostics.shadowMismatches === 0,
      noUnexpectedBrowserErrors: consoleErrors.every((message) => message.includes("ERR_NETWORK_ACCESS_DENIED"))
        && pageErrors.length === 0,
      inWorldAuditFrame: semanticFrame && JSON.parse(semanticFrame).state !== "title",
    };
    const warmPerformance = {
      thresholds: {
        presentationMilliseconds: 16.7,
        receiptP95Milliseconds: 50,
        eventLoopP95Milliseconds: 16.7,
        maximumAuxiliaryPatchBytes: 64 * 1024,
      },
      settled: warm.settled === true,
      presentationReady: warm.presentation.synchronousVisible === true
        && warm.presentation.synchronousMilliseconds < 16.7,
      receiptReady: warm.latency.p95Milliseconds < 50,
      eventLoopReady: warm.eventLoop.p95Milliseconds < 16.7,
      zeroFullAuxiliaryCopies: warm.fullAuxiliaryBytes === 0,
      boundedIncrementalPatch: warm.auxiliaryPatchRequests > 0
        && warm.auxiliaryPatchBytes > 0
        && warm.auxiliaryPatchBytes <= 64 * 1024,
    };
    warmPerformance.promotionReady = warmPerformance.settled
      && warmPerformance.presentationReady && warmPerformance.receiptReady
      && warmPerformance.eventLoopReady && warmPerformance.zeroFullAuxiliaryCopies
      && warmPerformance.boundedIncrementalPatch;
    const evidence = {
      schema: 1,
      phase: "R4",
      generatedAt: new Date().toISOString(),
      url,
      mode,
      profile,
      artifactHash,
      artifactRequests,
      lifecycle,
      warm,
      warmPerformance,
      beforeCrash,
      crashRecovery,
      finalDiagnostics,
      semanticFrame: semanticFrame ? JSON.parse(semanticFrame) : null,
      screenshot,
      startupScreenshot,
      consoleErrors,
      restrictedNetworkConsoleErrors: consoleErrors.filter((message) => message.includes("ERR_NETWORK_ACCESS_DENIED")),
      pageErrors,
      assertions,
      authority: {
        browserWorker: "rust-wasm",
        mutationCommit: expectedMode === "shadow"
          ? "typescript-authoritative-rust-shadow"
          : "rust-accepted-presentation-projection-with-synchronous-gameplay-receipt-gate",
        productionPlayerEditAuthority: false,
        productionGate: "R7 must await the Rust mutation receipt, or use an explicit pending-command protocol, before caller-side inventory/progression commits",
        rollback: "explicit runtime fallback to retained TypeScript presentation image",
        perVoxelBoundaryCalls: 0,
      },
    };
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify(quiet ? {
      mode, profile, artifactHash, assertions, warmPerformance,
      warm: {
        settled: warm.settled,
        latency: warm.latency,
        pageLatency: warm.pageLatency,
        eventLoop: warm.eventLoop,
        presentation: warm.presentation,
        fullAuxiliaryBytes: warm.fullAuxiliaryBytes,
        auxiliaryPatchBytes: warm.auxiliaryPatchBytes,
        auxiliaryPatchRequests: warm.auxiliaryPatchRequests,
        lightSectionsPatched: warm.lightSectionsPatched,
      },
      consoleErrors, pageErrors, screenshot,
    } : evidence, null, 2)}\n`);
    if (Object.values(assertions).some((value) => !value)) {
      throw new Error(`R4 browser assertions failed: ${JSON.stringify(assertions)}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(`Rust R4 browser audit failed: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
