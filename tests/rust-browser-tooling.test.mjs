import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  contentAddressForFiles,
  describeArtifactFiles,
  summarizeSamples,
  validatePublishedArtifacts,
} from "../scripts/rust-engine-common.mjs";
import {
  parseTransferSizes,
  selectBrowserArtifact,
} from "../scripts/benchmark-rust-browser.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    const canonicalTemp = path.resolve(os.tmpdir());
    const canonicalDirectory = path.resolve(directory);
    assert.ok(canonicalDirectory.startsWith(`${canonicalTemp}${path.sep}`));
    rmSync(canonicalDirectory, { recursive: true, force: true });
  }
});

function temporaryDirectory(label) {
  const directory = mkdtempSync(path.join(os.tmpdir(), `blockwild-${label}-`));
  temporaryDirectories.push(directory);
  return directory;
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createPublishedFixture() {
  const root = temporaryDirectory("rust-artifacts");
  const staging = path.join(root, "staging");
  mkdirSync(staging);
  writeFileSync(path.join(staging, "engine.js"), "export default async () => {}; export const heartbeat = () => 1;\n");
  writeFileSync(path.join(staging, "engine_bg.wasm"), Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));
  const files = describeArtifactFiles(staging);
  const hash = contentAddressForFiles(files);
  const directory = path.join(root, hash);
  renameSync(staging, directory);
  writeJson(path.join(directory, "manifest.json"), {
    schema: 1,
    artifactHash: hash,
    variant: "compatibility",
    files,
  });
  writeJson(path.join(root, "manifest.json"), {
    schema: 1,
    defaultVariant: "compatibility",
    artifacts: {
      compatibility: {
        hash,
        directory: hash,
        manifest: `${hash}/manifest.json`,
      },
    },
  });
  return { root, hash, directory };
}

test("content addresses are stable regardless of manifest ordering", () => {
  const files = [
    { path: "engine.js", sha256: "a".repeat(64), bytes: 12 },
    { path: "engine_bg.wasm", sha256: "b".repeat(64), bytes: 8 },
  ];
  assert.equal(contentAddressForFiles(files), contentAddressForFiles([...files].reverse()));
});

test("artifact validator accepts a complete content-addressed package", () => {
  const fixture = createPublishedFixture();
  const verification = validatePublishedArtifacts(fixture.root);
  assert.equal(verification.index.defaultVariant, "compatibility");
  assert.equal(verification.artifacts[0].hash, fixture.hash);
  assert.deepEqual(verification.artifacts[0].files.map((file) => file.role).sort(), ["glue", "wasm"]);
  const selected = selectBrowserArtifact(verification, null);
  assert.equal(selected.variant, "compatibility");
  assert.equal(selected.wasm.path, "engine_bg.wasm");
});

test("artifact validator rejects checksum drift", () => {
  const fixture = createPublishedFixture();
  writeFileSync(path.join(fixture.directory, "engine_bg.wasm"), Buffer.from([1, 2, 3]));
  assert.throws(
    () => validatePublishedArtifacts(fixture.root),
    /checksum or size mismatch/,
  );
});

test("artifact validator rejects stale files and unreferenced directories", () => {
  const fixture = createPublishedFixture();
  writeFileSync(path.join(fixture.directory, "stale.tmp"), "stale");
  assert.throws(() => validatePublishedArtifacts(fixture.root), /stale unmanifested file/);
  rmSync(path.join(fixture.directory, "stale.tmp"));
  mkdirSync(path.join(fixture.root, "f".repeat(64)));
  assert.throws(() => validatePublishedArtifacts(fixture.root), /Stale unreferenced/);
});

test("browser benchmark inputs and summaries are deterministic", () => {
  assert.deepEqual(parseTransferSizes("4194304,65536,1048576,65536"), [65536, 1048576, 4194304]);
  assert.deepEqual(summarizeSamples([4, 1, 3, 2]), {
    count: 4,
    averageMilliseconds: 2.5,
    p50Milliseconds: 2,
    p95Milliseconds: 4,
    p99Milliseconds: 4,
    minimumMilliseconds: 1,
    maximumMilliseconds: 4,
  });
});

test("build fails clearly without an engine workspace and does not install tools", () => {
  const fixtureRoot = temporaryDirectory("rust-missing-workspace");
  mkdirSync(path.join(fixtureRoot, "docs"));
  writeJson(path.join(fixtureRoot, "package.json"), { name: "fixture" });
  const result = spawnSync(process.execPath, [
    path.join(repositoryRoot, "scripts", "build-rust-engine.mjs"),
    "--repo-root",
    fixtureRoot,
  ], {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true,
    timeout: 10_000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /No Rust workspace was found/);
});
