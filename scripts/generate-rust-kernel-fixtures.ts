import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildRustKernelFixture } from "../app/game/rust-kernel-shadow.ts";

const defaultTarget = resolve("tests/fixtures/rust-engine/r1-kernel-fixture.json");
const check = process.argv.includes("--check");
const explicitTarget = process.argv.find((argument, index) => index > 1 && argument !== "--check");
const target = resolve(explicitTarget ?? defaultTarget);
const serialized = `${JSON.stringify(buildRustKernelFixture(), null, 2)}\n`;

if (check) {
  const existing = readFileSync(target, "utf8");
  if (existing !== serialized) throw new Error(`Rust kernel fixture is stale: ${target}`);
  process.stdout.write(`rust-kernel-fixture=ok path=${target}\n`);
} else {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, serialized, "utf8");
  process.stdout.write(`rust-kernel-fixture=written path=${target}\n`);
}
