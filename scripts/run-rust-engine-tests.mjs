import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const testsDirectory = resolve(repositoryRoot, "tests");
const rustTests = readdirSync(testsDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && (
    /^rust-.+\.test\.(?:mjs|ts)$/.test(entry.name)
    || /^renderer-.+\.test\.(?:mjs|ts)$/.test(entry.name)
  ))
  .map((entry) => `tests/${entry.name}`)
  .sort((left, right) => left.localeCompare(right, "en"));

if (rustTests.length === 0) {
  throw new Error("No Rust engine or renderer tests were discovered under tests/.");
}

console.log(`Running ${rustTests.length} Rust engine and renderer test files.`);
const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", ...rustTests],
  {
    cwd: repositoryRoot,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  },
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
