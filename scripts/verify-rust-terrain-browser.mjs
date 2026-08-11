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
    try {
      return await import(candidate.startsWith("playwright") ? candidate : pathToFileURL(candidate).href);
    } catch { /* try the next installed runtime */ }
  }
  throw new Error("A local Playwright runtime is required for the R2 browser audit");
}

function browserExecutable() {
  const candidates = [
    process.env.BLOCKWILD_BROWSER_EXECUTABLE,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(process.env.LOCALAPPDATA ?? "", "Google", "Chrome", "Application", "chrome.exe"),
  ].filter(Boolean);
  return candidates.find((candidate) => {
    try { return Boolean(candidate && requireStat(candidate)); } catch { return false; }
  });
}

function requireStat(candidate) {
  // `process.getBuiltinModule` keeps this script ESM-only without a global require.
  return process.getBuiltinModule("fs").statSync(candidate).isFile();
}

async function main() {
  const url = argument("--url", "http://127.0.0.1:3103/?placement-audit=1&rust-terrain-r2-audit=1");
  const expectedMode = argument("--mode", "shadow");
  const output = path.resolve(argument("--output", "work/hybrid-rust-migration/r2-browser-shadow.json"));
  const screenshot = path.resolve(argument("--screenshot", "work/hybrid-rust-migration/r2-browser-shadow.png"));
  const manifest = JSON.parse(await readFile(path.resolve("public/engine/manifest.json"), "utf8"));
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
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("response", (response) => {
      if (/\/engine\/(?:manifest\.json|[a-f0-9]{64}\/(?:manifest\.json|engine(?:_bg)?\.(?:js|wasm)))/u.test(response.url())) {
        artifactRequests.push({ url: response.url(), status: response.status() });
      }
    });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForFunction(() => Boolean(window.blockwildRustTerrainR2), null, { timeout: 90_000 });
    const mode = await page.evaluate(() => window.blockwildRustTerrainR2.mode);
    if (mode !== expectedMode) throw new Error(`Expected Rust terrain mode ${expectedMode}, received ${mode}`);
    const gallery = await page.evaluate(() => window.blockwildRustTerrainR2.buildGallery());
    const postGallery = await page.evaluate(() => window.blockwildRustTerrainR2.diagnostics());
    await page.evaluate(() => window.set_game_key?.("KeyS", true));
    await page.waitForTimeout(1_500);
    await page.evaluate(() => window.set_game_key?.("KeyS", false));
    await page.waitForTimeout(500);
    await mkdir(path.dirname(screenshot), { recursive: true });
    await page.screenshot({ path: screenshot, fullPage: false });
    const immediateEdit = await page.evaluate(() => window.blockwildRustTerrainR2.exerciseImmediateEdit());
    const postEdit = await page.evaluate(() => window.blockwildRustTerrainR2.diagnostics());
    const crashRecovery = await page.evaluate(() => window.blockwildRustTerrainR2.exerciseCrashRecovery());
    const finalDiagnostics = await page.evaluate(() => window.blockwildRustTerrainR2.diagnostics());
    const semanticFrame = await page.evaluate(() => window.render_game_to_text?.() ?? null);
    const artifactHash = manifest.artifacts[manifest.defaultVariant].hash;
    const result = {
      schema: 1,
      url,
      mode,
      artifactHash,
      artifactRequests,
      gallery,
      postGallery,
      immediateEdit,
      postEdit,
      crashRecovery,
      finalDiagnostics,
      semanticFrame: semanticFrame ? JSON.parse(semanticFrame) : null,
      screenshot,
      consoleErrors,
      pageErrors,
      assertions: {
        allShapeFamilies: gallery.shapeFamilies === 37,
        artifactLoaded: artifactRequests.some((entry) => entry.url.includes(artifactHash) && entry.status === 200),
        exactBeforeRecovery: postEdit.exactMatches > 0 && postEdit.parityMismatches === 0
          && postEdit.fallback === 0 && postEdit.installFailures === 0,
        promotedWhenEnabled: mode !== "promote" || (postGallery.promoted > 0 && postGallery.promoted === postGallery.exactMatches),
        immediateEditVisible: immediateEdit.immediateVisible === true && immediateEdit.revisionAfter > immediateEdit.revisionBefore,
        crashRecovered: crashRecovery.crashed === true
          && finalDiagnostics.backend?.workerRestarts === beforeRecoveryRestarts(crashRecovery)
          && finalDiagnostics.backend.pending === 0 && finalDiagnostics.parityMismatches === 0
          && crashRecovery.recovered.exactMatches > crashRecovery.afterCrash.exactMatches,
      },
    };
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (Object.values(result.assertions).some((value) => !value)) {
      throw new Error(`R2 browser assertions failed: ${JSON.stringify(result.assertions)}`);
    }
  } finally {
    await browser.close();
  }
}

function beforeRecoveryRestarts(crashRecovery) {
  return (crashRecovery.before.backend?.workerRestarts ?? 0) + 1;
}

main().catch((error) => {
  process.stderr.write(`Rust terrain browser audit failed: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
