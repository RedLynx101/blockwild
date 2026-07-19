import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import * as THREE from "three";
import {
  buildLivingBestiarySheet,
  type ShowcaseCamera,
} from "./render-living-bestiary-showcase";
import {
  CUBIC_STORYBOOK_VISUAL_KINDS,
  type LivingBestiaryVisualKind,
} from "../app/game/living-bestiary-models";

const REVIEW_KINDS = Object.freeze([
  "hearthback-badger",
  "wreckwhistle-porpoise",
  "ilyr-virebloom",
  "kharza",
  "sugarwake-sovereign",
  "asterjaw",
  "glasswake-stag",
] as const satisfies readonly LivingBestiaryVisualKind[]);

const VIEWS = Object.freeze([
  {
    id: "front-three-quarter",
    label: "Front three-quarter",
    camera: { position: new THREE.Vector3(5.4, 3.7, -7.2), target: new THREE.Vector3(0, 1, 0) },
  },
  {
    id: "front",
    label: "True front",
    camera: { position: new THREE.Vector3(0, 2.75, -8), target: new THREE.Vector3(0, 1, 0) },
  },
  {
    id: "side",
    label: "True side",
    camera: { position: new THREE.Vector3(8, 2.75, 0), target: new THREE.Vector3(0, 1, 0) },
  },
] as const satisfies readonly { id: string; label: string; camera: ShowcaseCamera }[]);

function valueAfter(argv: readonly string[], flag: string) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

export async function renderCubicCreatureReview(options: Readonly<{
  outDir: string;
  phase: "before" | "after";
  kinds?: readonly LivingBestiaryVisualKind[];
}>) {
  await mkdir(options.outDir, { recursive: true });
  const kinds = options.kinds ?? REVIEW_KINDS;
  const isFullRoster = kinds === CUBIC_STORYBOOK_VISUAL_KINDS;
  const outputs: Array<{ view: string; svg: string; png: string }> = [];
  for (const view of VIEWS) {
    const rendered = buildLivingBestiarySheet({
      kinds,
      phase: options.phase,
      columns: isFullRoster ? 5 : 4,
      tileWidth: 440,
      tileHeight: 390,
      camera: view.camera,
      title: `${isFullRoster ? "Unified Cubic Roster" : "Seven-Creature Runtime Review"} - ${view.label}`,
      subtitle: "Exact production BufferGeometry, deterministic pose, materials and hierarchy preserved.",
    });
    const svg = path.join(options.outDir, `${view.id}.svg`);
    const png = path.join(options.outDir, `${view.id}.png`);
    await writeFile(svg, rendered.svg, "utf8");
    await sharp(Buffer.from(rendered.svg)).png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(png);
    outputs.push({ view: view.id, svg, png });
  }
  await writeFile(path.join(options.outDir, "manifest.json"), `${JSON.stringify({
    schema: 1,
    generatedBy: "scripts/render-living-bestiary-cubic-review.ts",
    phase: options.phase,
    creatures: kinds,
    views: VIEWS.map((view) => ({ id: view.id, position: view.camera.position.toArray(), target: view.camera.target.toArray() })),
    outputs,
  }, null, 2)}\n`, "utf8");
  return outputs;
}

async function main() {
  const argv = process.argv.slice(2);
  const phase = valueAfter(argv, "--phase") ?? "after";
  if (phase !== "before" && phase !== "after") throw new Error(`--phase must be before or after; received ${phase}`);
  const outDir = path.resolve(valueAfter(argv, "--out") ?? `output/living-bestiary-cubic-seven/${phase}`);
  const kinds = argv.includes("--all-cubic") ? CUBIC_STORYBOOK_VISUAL_KINDS : REVIEW_KINDS;
  process.stdout.write(`${JSON.stringify(await renderCubicCreatureReview({ outDir, phase, kinds }), null, 2)}\n`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) await main();
