import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("the package and repository expose a coherent MIT identity", async () => {
  const [license, packageSource, readme] = await Promise.all([
    source("LICENSE"),
    source("package.json"),
    source("README.md"),
  ]);
  const packageJson = JSON.parse(packageSource);

  assert.match(license, /^MIT License/m);
  assert.match(license, /Copyright \(c\) 2026 Noah Hicks/);
  assert.match(license, /Permission is hereby granted, free of charge/);
  assert.equal(packageJson.license, "MIT");
  assert.equal(packageJson.homepage, "https://blockwild.app");
  assert.equal(packageJson.repository?.url, "git+https://github.com/RedLynx101/blockwild.git");
  assert.match(readme, /MIT License/);
  assert.doesNotMatch(readme, /not currently open source/i);
});

test("GitHub automation covers quality, release builds, security, and dependency drift", async () => {
  const [ci, codeql, dependencyReview, dependabot] = await Promise.all([
    source(".github/workflows/ci.yml"),
    source(".github/workflows/codeql.yml"),
    source(".github/workflows/dependency-review.yml"),
    source(".github/dependabot.yml"),
  ]);

  assert.match(ci, /npm test/);
  assert.match(ci, /npm run build:vercel/);
  assert.match(ci, /npx tsc --noEmit/);
  assert.match(ci, /npm run lint/);
  assert.match(ci, /git diff --exit-code/);
  assert.match(ci, /actions\/checkout@v7/);
  assert.match(ci, /actions\/setup-node@v7/);
  assert.match(codeql, /github\/codeql-action\/analyze@v4/);
  assert.match(dependencyReview, /actions\/dependency-review-action@v5/);
  assert.match(dependabot, /package-ecosystem: npm/);
  assert.match(dependabot, /package-ecosystem: github-actions/);
});
