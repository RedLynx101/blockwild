#!/usr/bin/env node

import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");
const PLAN = path.join(ROOT, "docs", "HYBRID_RUST_ENGINE_MIGRATION_MASTER_PLAN.md");
const LEDGER = path.join(ROOT, "docs", "RUST_ENGINE_AUTHORITY_LEDGER.md");
const IMPLEMENTATION_LOG = path.join(ROOT, "docs", "HYBRID_RUST_MIGRATION_IMPLEMENTATION_LOG.md");

const args = new Set(process.argv.slice(2));
const strict = args.has("--strict");
const outputIndex = process.argv.indexOf("--out");
const outputPath = outputIndex >= 0 && process.argv[outputIndex + 1]
  ? path.resolve(ROOT, process.argv[outputIndex + 1])
  : null;

async function text(file) {
  return readFile(file, "utf8");
}

async function filesBelow(root) {
  const found = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) found.push(...await filesBelow(absolute));
    else if (entry.isFile()) found.push(absolute);
  }
  return found;
}

function relative(file) {
  return path.relative(ROOT, file).replaceAll(path.sep, "/");
}

function ledgerRows(markdown) {
  const rows = [];
  for (const line of markdown.split(/\r?\n/u)) {
    if (!line.startsWith("| ") || line.includes("---") || line.includes("Domain |")) continue;
    const columns = line.split("|").slice(1, -1).map((value) => value.trim());
    if (columns.length < 7) continue;
    rows.push({
      domain: columns[0],
      typescriptOwner: columns[1],
      rustTarget: columns[2],
      mode: columns[3].replaceAll("`", ""),
      evidence: columns[4],
      boundary: columns[5],
      rollback: columns[6],
    });
  }
  return rows;
}

function isMigratedMode(mode) {
  return mode === "rust-authoritative" || mode === "retired-typescript";
}

async function audit() {
  const [plan, ledger, log, packageJson, facade, voxelGame, legacyEngine, legacyWorld, wasm, performance, rustTestRunner] = await Promise.all([
    text(PLAN),
    text(LEDGER),
    text(IMPLEMENTATION_LOG),
    text(path.join(ROOT, "package.json")),
    text(path.join(ROOT, "app", "game", "engine-facade.ts")),
    text(path.join(ROOT, "app", "game", "VoxelGame.tsx")),
    text(path.join(ROOT, "app", "game", "engine.ts")),
    text(path.join(ROOT, "app", "game", "world.ts")),
    text(path.join(ROOT, "engine", "crates", "blockwild-wasm", "src", "lib.rs")),
    text(path.join(ROOT, "app", "game", "performance.ts")),
    text(path.join(ROOT, "scripts", "run-rust-engine-tests.mjs")),
  ]);
  const packageData = JSON.parse(packageJson);
  const rows = ledgerRows(ledger);
  const migratableRows = rows.filter((row) => row.rustTarget !== "none; remains TypeScript" && row.rollback !== "not migrated");
  const pendingAuthority = migratableRows.filter((row) => !isMigratedMode(row.mode));
  const uncheckedPlanItems = [...plan.matchAll(/^- \[ \] (.+)$/gmu)].map((match) => match[1]);
  const openLogGates = (() => {
    const marker = "## Open completion gates";
    const start = log.indexOf(marker);
    if (start < 0) return ["implementation log has no Open completion gates section"];
    const remainder = log.slice(start + marker.length);
    const nextHeading = remainder.search(/^## /mu);
    const section = nextHeading >= 0 ? remainder.slice(0, nextHeading) : remainder;
    return [...section.matchAll(/^- (.+)$/gmu)].map((match) => match[1]);
  })();

  const sourceFiles = (await filesBelow(path.join(ROOT, "app")))
    .filter((file) => /\.(?:ts|tsx|js|jsx)$/u.test(file));
  const allowedThreePrefixes = [
    "app/three-compat/",
    "app/engine-lab/",
    "app/renderer-lab/",
  ];
  const normalPathThreeImports = [];
  for (const file of sourceFiles) {
    const source = await text(file);
    if (!/(?:from\s+["']three["']|import\s*\(["']three["']\))/u.test(source)) continue;
    const name = relative(file);
    if (!allowedThreePrefixes.some((prefix) => name.startsWith(prefix))) normalPathThreeImports.push(name);
  }

  const legacyAuthoritySymbols = [
    ["VoxelEngine.moveWithCollisions", /\n\s*moveWithCollisions\s*\(/u.test(legacyEngine)],
    ["VoxelEngine.collidesAt", /\n\s*collidesAt\s*\(/u.test(legacyEngine)],
    ["ChunkWorld.sampleColumn", /\n\s*sampleColumn\s*\(/u.test(legacyWorld)],
    ["ChunkWorld.generateChunk", /\n\s*generateChunk\s*\(/u.test(legacyWorld)],
    ["ChunkWorld.setBlock", /\n\s*setBlock\s*\(/u.test(legacyWorld)],
  ].filter(([, present]) => present).map(([symbol]) => symbol);

  const requiredWasmExports = [
    "blockwild_runtime_create_v2",
    "blockwild_runtime_command_v2",
    "blockwild_runtime_step_v2",
    "blockwild_runtime_extract_v2",
    "blockwild_runtime_export_save_v2",
    "blockwild_runtime_destroy_v2",
  ];
  const missingWasmExports = requiredWasmExports.filter((name) => !wasm.includes(`fn ${name}`));
  const declaredEngineDefault = /Public engine default:\s*([^\r\n]+)/u.exec(ledger)?.[1]?.trim() ?? null;
  const declaredRendererDefault = /Public renderer default:\s*([^\r\n]+)/u.exec(ledger)?.[1]?.trim() ?? null;
  const facadeStillDormant = facade.includes("intentionally not wired into VoxelGame yet");
  const facadeImportedByVoxelGame = /from\s+["']\.\/engine-facade["']/u.test(voxelGame)
    || /import\s*\(["']\.\/engine-facade["']\)/u.test(voxelGame);
  const runtimeEngineDefault = /engineSelection\s*\?\?\s*["']([^"']+)["']/u.exec(facade)?.[1] ?? null;
  const runtimeRendererDefault = /rendererSelection\s*\?\?\s*["']([^"']+)["']/u.exec(facade)?.[1] ?? null;
  const basicRenderProductionOff = performance.includes("BASIC_RENDER_DISTANCE_ENABLED")
    && performance.includes("NEXT_PUBLIC_BLOCKWILD_BASIC_RENDER_DISTANCE");
  const strictScriptPresent = typeof packageData.scripts?.["audit:rust-migration"] === "string"
    && packageData.scripts["audit:rust-migration"].includes("--strict");
  const rustTestDiscoveryPresent = typeof packageData.scripts?.["test:rust-engine"] === "string"
    && packageData.scripts["test:rust-engine"].includes("run-rust-engine-tests.mjs")
    && rustTestRunner.includes("/^rust-.+\\.test\\.(?:mjs|ts)$/");

  const artifactSelector = JSON.parse(await text(path.join(ROOT, "public", "engine", "manifest.json")));
  const defaultArtifact = artifactSelector.artifacts?.[artifactSelector.defaultVariant];
  let artifactValid = false;
  let artifactReason = "default artifact is absent";
  if (defaultArtifact?.manifest) {
    const manifestPath = path.join(ROOT, "public", "engine", ...defaultArtifact.manifest.split("/"));
    try {
      const manifest = JSON.parse(await text(manifestPath));
      const wasmEntry = manifest.files?.find((entry) => entry.role === "wasm");
      if (wasmEntry) {
        const wasmPath = path.join(path.dirname(manifestPath), wasmEntry.path);
        const info = await stat(wasmPath);
        artifactValid = info.isFile() && info.size === wasmEntry.bytes;
        artifactReason = artifactValid ? "content-addressed default artifact is present" : "default artifact size does not match its manifest";
      }
    } catch (error) {
      artifactReason = error instanceof Error ? error.message : String(error);
    }
  }

  const blockers = [];
  if (uncheckedPlanItems.length) blockers.push(`${uncheckedPlanItems.length} master-plan definition-of-done items remain unchecked`);
  if (pendingAuthority.length) blockers.push(`${pendingAuthority.length} migratable authority rows are not Rust-authoritative or retired`);
  if (openLogGates.length) blockers.push(`${openLogGates.length} implementation-log completion gates remain open`);
  if (normalPathThreeImports.length) blockers.push(`${normalPathThreeImports.length} normal-path app modules still import Three.js`);
  if (legacyAuthoritySymbols.length) blockers.push(`${legacyAuthoritySymbols.length} known TypeScript authority implementations remain`);
  if (missingWasmExports.length) blockers.push(`${missingWasmExports.length} integrated runtime Wasm exports are missing`);
  if (declaredEngineDefault?.toLowerCase() !== "rust") blockers.push(`ledger engine default is ${declaredEngineDefault ?? "unset"}`);
  if (declaredRendererDefault?.toLowerCase() !== "wgpu") blockers.push(`ledger renderer default is ${declaredRendererDefault ?? "unset"}`);
  if (facadeStillDormant || !facadeImportedByVoxelGame) blockers.push("EngineFacade is not wired into VoxelGame");
  if (runtimeEngineDefault !== "rust") blockers.push(`runtime engine default is ${runtimeEngineDefault ?? "unset"}`);
  if (runtimeRendererDefault !== "wgpu") blockers.push(`runtime renderer default is ${runtimeRendererDefault ?? "unset"}`);
  if (!basicRenderProductionOff) blockers.push("Basic Render Distance production-off gate is not detectable");
  if (!strictScriptPresent) blockers.push("package.json does not expose the strict migration audit as a release gate");
  if (!rustTestDiscoveryPresent) blockers.push("the standard Rust gate does not discover every rust-*.test.ts/mjs file");
  if (!artifactValid) blockers.push(`default Wasm artifact is invalid: ${artifactReason}`);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    commit: process.env.GITHUB_SHA ?? null,
    complete: blockers.length === 0,
    blockers,
    counts: {
      planUnchecked: uncheckedPlanItems.length,
      authorityPending: pendingAuthority.length,
      openLogGates: openLogGates.length,
      normalPathThreeImports: normalPathThreeImports.length,
      legacyAuthoritySymbols: legacyAuthoritySymbols.length,
      missingWasmExports: missingWasmExports.length,
    },
    defaults: { engine: declaredEngineDefault, renderer: declaredRendererDefault },
    checks: {
      basicRenderProductionOff,
      facadeWired: !facadeStillDormant && facadeImportedByVoxelGame,
      runtimeEngineDefault,
      runtimeRendererDefault,
      strictScriptPresent,
      rustTestDiscoveryPresent,
      artifactValid,
      artifactReason,
    },
    pendingAuthority: pendingAuthority.map(({ domain, mode, rustTarget }) => ({ domain, mode, rustTarget })),
    uncheckedPlanItems,
    openLogGates,
    normalPathThreeImports,
    legacyAuthoritySymbols,
    missingWasmExports,
  };
}

const report = await audit();
const rendered = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) await writeFile(outputPath, rendered, "utf8");
process.stdout.write(rendered);
if (strict && !report.complete) process.exitCode = 1;
