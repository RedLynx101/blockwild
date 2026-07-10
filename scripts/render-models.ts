import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as THREE from "three";
import { INSPECTOR_MODEL_SPECS, assertModelSpec, type ModelBox, type ModelSpec } from "../app/game/model-specs.ts";

type ViewName = "iso" | "front" | "side";
type Point2 = { x: number; y: number };
type Projection = {
  camera: THREE.Vector3;
  target: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  forward: THREE.Vector3;
};
type Face = {
  points: THREE.Vector3[];
  normal: THREE.Vector3;
  depth: number;
  color: string;
  emissive: boolean;
};

const TILE_WIDTH = 440;
const TILE_HEIGHT = 430;
const HEADER_HEIGHT = 104;
const FACE_INDICES = [
  [0, 3, 2, 1], // -Z, declared model front
  [4, 5, 6, 7], // +Z
  [0, 4, 7, 3], // -X
  [1, 2, 6, 5], // +X
  [0, 1, 5, 4], // -Y
  [3, 7, 6, 2], // +Y
] as const;
const FACE_NORMALS = [
  new THREE.Vector3(0, 0, -1),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 1, 0),
] as const;
const LIGHT = new THREE.Vector3(-0.45, 0.9, -0.65).normalize();

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function parseArguments() {
  const args = process.argv.slice(2);
  let out = "/workspace/model-inspection";
  let columns = 4;
  let views: ViewName[] = ["iso", "front", "side"];
  let requestedIds: string[] | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--out" && args[index + 1]) out = path.resolve(args[++index]);
    else if (argument === "--columns" && args[index + 1]) columns = Math.max(1, Math.min(8, Number(args[++index]) || 4));
    else if ((argument === "--views" || argument === "--view") && args[index + 1]) {
      const candidates = args[++index].split(",").filter((candidate): candidate is ViewName => ["iso", "front", "side"].includes(candidate));
      if (candidates.length) views = [...new Set(candidates)];
    } else if ((argument === "--ids" || argument === "--spec") && args[index + 1]) requestedIds = args[++index].split(",").filter(Boolean);
    else if (argument === "--help") {
      process.stdout.write("Render Blockwild model inspection sheets.\n\n  node --import tsx scripts/render-models.ts [--out DIR] [--views iso,front,side] [--ids zombie,held-pickaxe] [--columns 4]\n");
      process.exit(0);
    }
  }
  const specs = requestedIds ? INSPECTOR_MODEL_SPECS.filter((spec) => requestedIds.includes(spec.id)) : [...INSPECTOR_MODEL_SPECS];
  if (!specs.length) throw new Error(`No model specs matched: ${requestedIds?.join(", ") ?? "(none)"}`);
  return { out, columns, views, specs };
}

function projectionFor(view: ViewName, targetY: number): Projection {
  const target = new THREE.Vector3(0, targetY, 0);
  const camera = view === "front"
    ? new THREE.Vector3(0.35, targetY + 0.45, -6)
    : view === "side"
      ? new THREE.Vector3(6, targetY + 0.65, -0.35)
      : new THREE.Vector3(4.5, targetY + 3.4, -5.5);
  const forward = target.clone().sub(camera).normalize();
  const right = forward.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
  const up = right.clone().cross(forward).normalize();
  return { camera, target, right, up, forward };
}

function boxVertices(modelBox: ModelBox) {
  const [sx, sy, sz] = modelBox.size.map((value) => value / 2);
  const vertices = [
    new THREE.Vector3(-sx, -sy, -sz), new THREE.Vector3(sx, -sy, -sz),
    new THREE.Vector3(sx, sy, -sz), new THREE.Vector3(-sx, sy, -sz),
    new THREE.Vector3(-sx, -sy, sz), new THREE.Vector3(sx, -sy, sz),
    new THREE.Vector3(sx, sy, sz), new THREE.Vector3(-sx, sy, sz),
  ];
  const [rx, ry, rz] = modelBox.rotation ?? [0, 0, 0];
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, "XYZ"));
  const position = new THREE.Vector3(...modelBox.position);
  for (const vertex of vertices) vertex.applyQuaternion(quaternion).add(position);
  return { vertices, quaternion };
}

function resolveColor(value: string | number) {
  const color = new THREE.Color(value);
  return `#${color.getHexString()}`;
}

function shadeColor(value: string, amount: number, emissive: boolean) {
  const color = new THREE.Color(value);
  if (emissive) color.lerp(new THREE.Color("#fff4bc"), 0.14);
  else color.multiplyScalar(THREE.MathUtils.clamp(amount, 0.38, 1.08));
  return `#${color.getHexString()}`;
}

function modelFaces(spec: ModelSpec, projection: Projection) {
  const faces: Face[] = [];
  for (const modelBox of spec.boxes) {
    const { vertices, quaternion } = boxVertices(modelBox);
    for (let index = 0; index < FACE_INDICES.length; index += 1) {
      const points = FACE_INDICES[index].map((vertexIndex) => vertices[vertexIndex]);
      const normal = FACE_NORMALS[index].clone().applyQuaternion(quaternion).normalize();
      const center = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / points.length);
      if (normal.dot(projection.camera.clone().sub(center)) <= 0.0001) continue;
      const depth = center.clone().sub(projection.camera).dot(projection.forward);
      const illumination = 0.55 + Math.max(0, normal.dot(LIGHT)) * 0.45;
      faces.push({ points, normal, depth, color: shadeColor(resolveColor(modelBox.color), illumination, Boolean(modelBox.emissive)), emissive: Boolean(modelBox.emissive) });
    }
  }
  return faces.sort((left, right) => right.depth - left.depth);
}

function rawProject(point: THREE.Vector3, projection: Projection): Point2 {
  const relative = point.clone().sub(projection.target);
  return { x: relative.dot(projection.right), y: -relative.dot(projection.up) };
}

function modelBounds(spec: ModelSpec) {
  const points = spec.boxes.flatMap((modelBox) => boxVertices(modelBox).vertices);
  const bounds = new THREE.Box3().setFromPoints(points);
  return { bounds, centerY: (bounds.min.y + bounds.max.y) / 2 };
}

function arrowMarker(id: string, color: string) {
  return `<marker id="${id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${color}"/></marker>`;
}

function renderTile(spec: ModelSpec, view: ViewName, tileX: number, tileY: number) {
  assertModelSpec(spec);
  const { bounds, centerY } = modelBounds(spec);
  const projection = projectionFor(view, centerY);
  const faces = modelFaces(spec, projection);
  const groundY = spec.groundY ?? 0;
  const lowestY = bounds.min.y;
  const groundDelta = lowestY - groundY;
  const exactGroundContact = Math.abs(groundDelta) < 0.0001;
  const gridRadius = Math.max(1.1, Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) * 0.82);
  const groundThickness = Math.max(0.07, (bounds.max.y - bounds.min.y) * 0.035);
  const fitPoints = spec.boxes.flatMap((modelBox) => boxVertices(modelBox).vertices);
  for (const y of [groundY - groundThickness, groundY]) {
    for (const x of [-gridRadius, gridRadius]) for (const z of [-gridRadius, gridRadius]) fitPoints.push(new THREE.Vector3(x, y, z));
  }
  fitPoints.push(new THREE.Vector3(0, bounds.max.y + 0.18, 0));
  const raw = fitPoints.map((point) => rawProject(point, projection));
  const minX = Math.min(...raw.map((point) => point.x));
  const maxX = Math.max(...raw.map((point) => point.x));
  const minY = Math.min(...raw.map((point) => point.y));
  const maxY = Math.max(...raw.map((point) => point.y));
  const draw = { x: tileX + 26, y: tileY + 91, width: TILE_WIDTH - 52, height: TILE_HEIGHT - 150 };
  const scale = Math.min(draw.width / Math.max(0.2, maxX - minX), draw.height / Math.max(0.2, maxY - minY));
  const offsetX = draw.x + draw.width / 2 - ((minX + maxX) / 2) * scale;
  const offsetY = draw.y + draw.height / 2 - ((minY + maxY) / 2) * scale;
  const project = (point: THREE.Vector3): Point2 => {
    const projected = rawProject(point, projection);
    return { x: offsetX + projected.x * scale, y: offsetY + projected.y * scale };
  };
  const line = (from: THREE.Vector3, to: THREE.Vector3, color: string, width = 1, marker = "", opacity = 1) => {
    const a = project(from);
    const b = project(to);
    return `<line x1="${a.x.toFixed(2)}" y1="${a.y.toFixed(2)}" x2="${b.x.toFixed(2)}" y2="${b.y.toFixed(2)}" stroke="${color}" stroke-width="${width}" opacity="${opacity}" ${marker ? `marker-end="url(#${marker})"` : ""}/>`;
  };
  const partLabels = new Map<string, string>();
  for (const modelBox of spec.boxes) {
    const previous = partLabels.get(modelBox.part);
    if (!previous || modelBox.label) partLabels.set(modelBox.part, modelBox.label ?? modelBox.part);
  }
  const parts = [...partLabels.values()];
  const groundStatus = spec.groundY === undefined
    ? `REFERENCE GROUND Y=${groundY.toFixed(2)}`
    : exactGroundContact
      ? `GROUND Y=${groundY.toFixed(2)} · LOWEST Y=${lowestY.toFixed(3)} · CONTACT EXACT`
      : groundDelta > 0
        ? `GROUND Y=${groundY.toFixed(2)} · FLOATING +${groundDelta.toFixed(3)}`
        : `GROUND Y=${groundY.toFixed(2)} · PENETRATION ${groundDelta.toFixed(3)}`;
  const groundStatusColor = spec.groundY === undefined ? "#91a098" : exactGroundContact ? "#8ee6a3" : "#ff837a";
  const output: string[] = [
    `<g data-model-id="${escapeXml(spec.id)}" data-ground-y="${groundY.toFixed(4)}" data-lowest-y="${lowestY.toFixed(4)}">`,
    `<rect x="${tileX + 7}" y="${tileY + 7}" width="${TILE_WIDTH - 14}" height="${TILE_HEIGHT - 14}" rx="13" fill="#161a1f" stroke="#39424c" stroke-width="2"/>`,
    `<text x="${tileX + 25}" y="${tileY + 36}" fill="#f3eee0" font-size="20" font-weight="800">${escapeXml(spec.label)}</text>`,
    `<text x="${tileX + 25}" y="${tileY + 57}" fill="#93a0ad" font-size="11" font-weight="700" letter-spacing="1.2">${spec.category.toUpperCase()} · ${view === "iso" ? "ORTHOGRAPHIC ISOMETRIC" : `${view.toUpperCase()} ORTHOGRAPHIC`}</text>`,
    `<text x="${tileX + 25}" y="${tileY + 77}" fill="${groundStatusColor}" font-size="10" font-weight="800" letter-spacing="0.45">${groundStatus}</text>`,
  ];

  const groundTop = [
    new THREE.Vector3(-gridRadius, groundY, -gridRadius),
    new THREE.Vector3(gridRadius, groundY, -gridRadius),
    new THREE.Vector3(gridRadius, groundY, gridRadius),
    new THREE.Vector3(-gridRadius, groundY, gridRadius),
  ];
  const groundBottom = groundTop.map((point) => point.clone().setY(groundY - groundThickness));
  const groundPolygon = (points: THREE.Vector3[], fill: string, stroke: string, width: number, opacity = 1) => {
    const projected = points.map(project).map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
    return `<polygon points="${projected}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" opacity="${opacity}" stroke-linejoin="round"/>`;
  };
  // A shallow terrain slab keeps the floor readable even in front/side views,
  // where an infinitely thin plane would nearly collapse to a single line.
  for (let edge = 0; edge < 4; edge += 1) {
    const next = (edge + 1) % 4;
    output.push(groundPolygon([groundTop[edge], groundTop[next], groundBottom[next], groundBottom[edge]], "#1b241f", "#617267", 1.1));
  }
  output.push(groundPolygon(groundTop, "#243128", "#7c9182", 1.5));

  const divisions = 8;
  for (let index = 0; index <= divisions; index += 1) {
    const value = -gridRadius + (gridRadius * 2 * index) / divisions;
    const major = index === divisions / 2;
    output.push(line(new THREE.Vector3(value, groundY + 0.001, -gridRadius), new THREE.Vector3(value, groundY + 0.001, gridRadius), major ? "#8fa294" : "#45564b", major ? 1.5 : 0.85, "", major ? 0.9 : 0.78));
    output.push(line(new THREE.Vector3(-gridRadius, groundY + 0.001, value), new THREE.Vector3(gridRadius, groundY + 0.001, value), major ? "#8fa294" : "#45564b", major ? 1.5 : 0.85, "", major ? 0.9 : 0.78));
  }

  for (const face of faces) {
    const points = face.points.map(project).map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
    output.push(`<polygon points="${points}" fill="${face.color}" stroke="${face.emissive ? "#ffd66c" : "#20252a"}" stroke-width="1.25" stroke-linejoin="round"/>`);
  }

  for (const contactId of spec.groundContactBoxIds ?? []) {
    const contactBox = spec.boxes.find((modelBox) => modelBox.id === contactId);
    if (!contactBox) continue;
    const vertices = boxVertices(contactBox).vertices;
    const contactMinY = Math.min(...vertices.map((vertex) => vertex.y));
    const lowestVertices = vertices.filter((vertex) => Math.abs(vertex.y - contactMinY) < 0.0001);
    const center = lowestVertices.reduce((sum, vertex) => sum.add(vertex), new THREE.Vector3()).multiplyScalar(1 / lowestVertices.length);
    const point = project(new THREE.Vector3(center.x, groundY + 0.004, center.z));
    output.push(`<circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="4.2" fill="#dfffe2" fill-opacity="0.38" stroke="#a7ffb6" stroke-width="2"/>`);
  }

  const groundBadgePoint = project(new THREE.Vector3(-gridRadius * 0.92, groundY + 0.008, gridRadius * 0.88));
  const groundBadgeX = THREE.MathUtils.clamp(groundBadgePoint.x - 4, tileX + 18, tileX + TILE_WIDTH - 110);
  const groundBadgeY = THREE.MathUtils.clamp(groundBadgePoint.y - 17, tileY + 92, tileY + TILE_HEIGHT - 67);
  output.push(`<rect x="${groundBadgeX.toFixed(2)}" y="${groundBadgeY.toFixed(2)}" width="92" height="17" rx="4" fill="#142019" fill-opacity="0.94" stroke="#789782"/>`);
  output.push(`<text x="${(groundBadgeX + 6).toFixed(2)}" y="${(groundBadgeY + 12).toFixed(2)}" fill="#bce7c6" font-size="9" font-weight="900">GROUND Y=${groundY.toFixed(2)}</text>`);

  const axisLength = Math.max(0.72, gridRadius * 0.72);
  const origin = new THREE.Vector3(0, groundY, 0);
  const xEnd = new THREE.Vector3(axisLength, groundY, 0);
  const yEnd = new THREE.Vector3(0, groundY + axisLength, 0);
  const zEnd = new THREE.Vector3(0, groundY, axisLength);
  const frontEnd = new THREE.Vector3(0, groundY + 0.035, -axisLength * 1.28);
  output.push(line(origin, xEnd, "#f05c55", 2.4, "arrow-red"));
  output.push(line(origin, yEnd, "#5ed47a", 2.4, "arrow-green"));
  output.push(line(origin, zEnd, "#5d9df4", 2.4, "arrow-blue"));
  output.push(line(origin, frontEnd, "#ffd55f", 3.6, "arrow-front"));
  for (const [end, label, color] of [[xEnd, "X+", "#ff7770"], [yEnd, "Y+", "#72e58b"], [zEnd, "Z+", "#77afff"]] as Array<[THREE.Vector3, string, string]>) {
    const point = project(end);
    output.push(`<text x="${point.x + 6}" y="${point.y - 5}" fill="${color}" font-size="11" font-weight="900">${label}</text>`);
  }
  const frontPoint = project(frontEnd);
  output.push(`<rect x="${frontPoint.x - 7}" y="${frontPoint.y - 22}" width="72" height="18" rx="4" fill="#181714" stroke="#8a7437"/>`);
  output.push(`<text x="${frontPoint.x - 2}" y="${frontPoint.y - 9}" fill="#ffe07b" font-size="10" font-weight="900">FRONT -Z</text>`);
  output.push(`<text x="${tileX + 25}" y="${tileY + TILE_HEIGHT - 30}" fill="#aab3bc" font-size="10">${escapeXml(parts.join(" · ").slice(0, 74))}</text>`);
  output.push(`<text x="${tileX + TILE_WIDTH - 25}" y="${tileY + TILE_HEIGHT - 30}" text-anchor="end" fill="#65717c" font-size="10">${escapeXml(spec.id)}</text>`, `</g>`);
  return output.join("");
}

function renderContactSheet(specs: readonly ModelSpec[], columns: number, view: ViewName) {
  const resolvedColumns = Math.min(columns, specs.length);
  const rows = Math.ceil(specs.length / resolvedColumns);
  const width = resolvedColumns * TILE_WIDTH;
  const height = HEADER_HEIGHT + rows * TILE_HEIGHT;
  const compactHeader = width < 900;
  const tiles = specs.map((spec, index) => renderTile(spec, view, (index % resolvedColumns) * TILE_WIDTH, HEADER_HEIGHT + Math.floor(index / resolvedColumns) * TILE_HEIGHT)).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    ${arrowMarker("arrow-red", "#f05c55")}
    ${arrowMarker("arrow-green", "#5ed47a")}
    ${arrowMarker("arrow-blue", "#5d9df4")}
    ${arrowMarker("arrow-front", "#ffd55f")}
  </defs>
  <rect width="100%" height="100%" fill="#0c0f12"/>
  <text x="28" y="${compactHeader ? 36 : 42}" fill="#f4d36a" font-size="${compactHeader ? 21 : 26}" font-weight="900" letter-spacing="1.2">BLOCKWILD MODEL ${compactHeader ? "INSPECTOR" : "ORIENTATION"}</text>
  <text x="28" y="${compactHeader ? 61 : 69}" fill="#aeb7bf" font-size="${compactHeader ? 11 : 13}">${compactHeader ? `${view === "iso" ? "ISOMETRIC" : view.toUpperCase()} · GROUND + CONTACT INSPECTION` : `Shared production specs · ${view === "iso" ? "orthographic isometric inspection" : `${view} orthographic inspection`} · broad character/tool face is local -Z`}</text>
  <text x="${compactHeader ? 28 : width - 28}" y="${compactHeader ? 84 : 42}" text-anchor="${compactHeader ? "start" : "end"}" fill="#62707b" font-size="${compactHeader ? 10 : 12}">X red · Y green · Z blue · FRONT gold</text>
  ${tiles}
</svg>`;
}

async function writePng(svg: string, destination: string) {
  try {
    const sharp = (await import("sharp")).default;
    await sharp(Buffer.from(svg)).png().toFile(destination);
    return true;
  } catch (error) {
    process.stderr.write(`PNG rendering unavailable (${error instanceof Error ? error.message : String(error)}). SVG output is still valid.\n`);
    return false;
  }
}

async function main() {
  const { out, columns, views, specs } = parseArguments();
  await mkdir(out, { recursive: true });
  const files: string[] = [];
  for (const view of views) {
    const svg = renderContactSheet(specs, columns, view);
    const svgPath = path.join(out, `blockwild-models-${view}.svg`);
    const pngPath = path.join(out, `blockwild-models-${view}.png`);
    await writeFile(svgPath, svg, "utf8");
    files.push(svgPath);
    if (await writePng(svg, pngPath)) files.push(pngPath);
  }
  process.stdout.write(`${JSON.stringify({ status: "rendered", specs: specs.map((spec) => spec.id), files }, null, 2)}\n`);
}

await main();
