import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
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

test("the public README uses the curated Field Archive gallery", async () => {
  const galleryRoot = "docs/assets/screenshots/2026-08-01-field-archive";
  const assets = [
    "2026-08-01-title-screen.png",
    "2026-08-01-frostpine-foraging.png",
    "2026-08-01-dynamic-timber-felling.png",
    "2026-08-01-survival-workstations.png",
    "2026-08-01-deepstone-cavern.png",
    "2026-08-01-known-roads-map.png",
    "2026-08-01-living-bestiary.png",
    "2026-08-01-skills-and-perks.png",
    "2026-08-01-cardforge-binder.png",
  ];
  const [readme, provenance] = await Promise.all([
    source("README.md"),
    source(`${galleryRoot}/README.md`),
  ]);

  for (const asset of assets) {
    const relativePath = `${galleryRoot}/${asset}`;
    assert.match(readme, new RegExp(relativePath.replaceAll(".", "\\.")));
    assert.match(provenance, new RegExp(asset.replaceAll(".", "\\.")));
    const assetStat = await stat(path.join(root, relativePath));
    assert.ok(assetStat.size > 100_000, `${asset} should contain a production screenshot`);
  }

  assert.match(readme, /In-game gallery/);
  assert.match(provenance, /v1\.12\.0 Field Archive/);
  assert.match(provenance, /2026-08-01/);
});
