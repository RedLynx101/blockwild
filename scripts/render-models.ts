import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as THREE from "three";
import { createButterflyVisual } from "../app/game/butterflies.ts";
import { INSPECTOR_MODEL_SPECS, assertModelSpec, type ModelBox, type ModelSpec } from "../app/game/model-specs.ts";
import { createMobVisual, createSkeletonArrowVisual } from "../app/game/mob-models.ts";
import { BUTTERFLY_ORDER, CORE_MOB_ORDER, MOB_DEFS, type ButterflyKind, type CoreMobKind, type DragonKind } from "../app/game/mobs.ts";
import { BlockPlayerModel, type PlayerAnimation } from "../app/game/player-model.ts";

export type ViewName = "iso" | "front" | "side";
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
export type InspectionMetadata = {
  source: "model-specs" | "BlockPlayerModel" | "MobVisual" | "ButterflySystem";
  pose?: "standing" | "crouching" | "running" | "mining";
  variant?: ButterflyKind;
  mob?: CoreMobKind;
};
export type InspectionModelSpec = ModelSpec & { inspection?: InspectionMetadata };
export type InspectionManifest = {
  version: 1;
  renderer: "blockwild-model-inspector";
  views: ViewName[];
  columns: number;
  specs: Array<{
    id: string;
    label: string;
    category: ModelSpec["category"];
    source: InspectionMetadata["source"];
    pose?: InspectionMetadata["pose"];
    variant?: ButterflyKind;
    boxCount: number;
    groundY: number;
    lowestY: number;
    groundDelta: number;
    contact: "exact" | "floating" | "penetrating" | "reference";
  }>;
  outputs: Array<{ view: ViewName; format: "svg" | "png"; file: string }>;
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

function materialAppearance(material: THREE.Material | THREE.Material[]) {
  const resolved = (Array.isArray(material) ? material[0] : material) as THREE.Material & {
    color?: THREE.Color;
    emissive?: THREE.Color;
    emissiveIntensity?: number;
  };
  const color = resolved.color?.getHex() ?? 0x9aa1a6;
  const emissive = resolved.type === "MeshBasicMaterial"
    || Boolean(resolved.emissive && resolved.emissive.getHex() !== 0 && (resolved.emissiveIntensity ?? 1) > 0);
  return { color, emissive };
}

function semanticPart(mesh: THREE.Mesh, root: THREE.Object3D) {
  if (typeof mesh.userData.inspectorPart === "string") return mesh.userData.inspectorPart;
  let current: THREE.Object3D | null = mesh.parent;
  while (current && current !== root) {
    if (typeof current.userData.playerPart === "string") return current.userData.playerPart;
    current = current.parent;
  }
  return mesh.name || "body";
}

/** Converts the actual posed Three.js hierarchy into renderer-independent boxes. */
export function objectToInspectionSpec(
  root: THREE.Object3D,
  descriptor: Pick<InspectionModelSpec, "id" | "label" | "category" | "front" | "groundY" | "inspection">,
) {
  root.updateWorldMatrix(true, true);
  const inverseRoot = root.matrixWorld.clone().invert();
  const boxes: ModelBox[] = [];
  const usedIds = new Set<string>();
  root.traverse((object) => {
    let visible = object.visible;
    for (let ancestor = object.parent; visible && ancestor && ancestor !== root; ancestor = ancestor.parent) visible = ancestor.visible;
    if (!(object instanceof THREE.Mesh) || !visible || !(object.geometry instanceof THREE.BufferGeometry)) return;
    object.geometry.computeBoundingBox();
    const geometryBounds = object.geometry.boundingBox;
    if (!geometryBounds || geometryBounds.isEmpty()) return;
    const localMatrix = new THREE.Matrix4().multiplyMatrices(inverseRoot, object.matrixWorld);
    const center = geometryBounds.getCenter(new THREE.Vector3()).applyMatrix4(localMatrix);
    const geometrySize = geometryBounds.getSize(new THREE.Vector3());
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    localMatrix.decompose(position, quaternion, scale);
    const rotation = new THREE.Euler().setFromQuaternion(quaternion, "XYZ");
    const appearance = materialAppearance(object.material);
    const baseId = (object.name || `${semanticPart(object, root)}-${boxes.length + 1}`).replace(/[^A-Za-z0-9_-]+/gu, "-").replace(/^-|-$/gu, "") || `box-${boxes.length + 1}`;
    let id = baseId;
    for (let suffix = 2; usedIds.has(id); suffix += 1) id = `${baseId}-${suffix}`;
    usedIds.add(id);
    boxes.push({
      id,
      part: semanticPart(object, root),
      label: boxes.some((box) => box.part === semanticPart(object, root)) ? undefined : semanticPart(object, root),
      size: [Math.abs(geometrySize.x * scale.x), Math.abs(geometrySize.y * scale.y), Math.abs(geometrySize.z * scale.z)],
      position: [center.x, center.y, center.z],
      rotation: [rotation.x, rotation.y, rotation.z],
      color: appearance.color,
      ...(appearance.emissive ? { emissive: true } : {}),
    });
  });
  if (!boxes.length) throw new Error(`Object '${descriptor.id}' did not contain renderable box meshes.`);
  const provisional: InspectionModelSpec = { ...descriptor, boxes };
  const minimums = boxes.map((modelBox) => Math.min(...boxVertices(modelBox).vertices.map((vertex) => vertex.y)));
  const lowest = Math.min(...minimums);
  provisional.groundContactBoxIds = descriptor.groundY === undefined
    ? undefined
    : boxes.filter((_, index) => Math.abs(minimums[index] - lowest) < 0.0001).map((modelBox) => modelBox.id);
  return assertModelSpec(provisional) as InspectionModelSpec;
}

export function createPlayerInspectionSpecs() {
  const poses: Array<{ id: string; label: string; animation: PlayerAnimation; phase: number; pose: NonNullable<InspectionMetadata["pose"]> }> = [
    { id: "player-standing", label: "Player · Standing", animation: "idle", phase: 0.08, pose: "standing" },
    { id: "player-crouching", label: "Player · Crouching", animation: "crouch", phase: 0.25, pose: "crouching" },
    { id: "player-running", label: "Player · Running", animation: "run", phase: 0.125, pose: "running" },
    { id: "player-mining", label: "Player · Mining", animation: "mine", phase: 0.25, pose: "mining" },
  ];
  return poses.map(({ id, label, animation, phase, pose }) => {
    const player = new BlockPlayerModel({
      playerName: "Inspector",
      mode: "remote",
      colors: { skin: "#c98f6b", shirt: "#3f7fba", trousers: "#293554" },
      castShadow: false,
      receiveShadow: false,
    });
    player.setAnimation(animation, phase);
    const spec = objectToInspectionSpec(player.group, {
      id,
      label,
      category: "player",
      front: "-z",
      groundY: 0,
      inspection: { source: "BlockPlayerModel", pose },
    });
    player.dispose();
    return spec;
  });
}

export function createButterflyInspectionSpec(kind: ButterflyKind): InspectionModelSpec {
  const definition = MOB_DEFS[kind];
  const flightY = 0.62;
  const flap = 0.58;
  const butterfly = createButterflyVisual(kind, `inspector-${kind}`);
  const inspectionRoot = new THREE.Group();
  inspectionRoot.name = `butterfly-${kind}-inspection-root`;
  inspectionRoot.add(butterfly.group);
  butterfly.group.position.y = flightY;
  butterfly.leftWing.rotation.z = flap;
  butterfly.rightWing.rotation.z = -flap;
  const spec = objectToInspectionSpec(inspectionRoot, {
    id: `butterfly-${kind}`,
    label: `Butterfly · ${definition.name}`,
    category: "mob",
    front: "-z",
    inspection: { source: "ButterflySystem", variant: kind },
  });
  disposeObject(inspectionRoot);
  return spec;
}

function disposeObject(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
  });
  for (const material of materials) material.dispose();
}

/** Captures a visible Skeleton projectile in the same box renderer as creatures. */
export function createSkeletonArrowInspectionSpec(): InspectionModelSpec {
  const arrow = createSkeletonArrowVisual();
  const spec = objectToInspectionSpec(arrow, {
    id: "skeleton-arrow",
    label: "Skeleton Arrow",
    category: "utility",
    front: "-z",
    inspection: { source: "MobVisual" },
  });
  disposeObject(arrow);
  return spec;
}

/** Captures every canonical non-butterfly production creature model. */
export function createMobInspectionSpecs(): InspectionModelSpec[] {
  // Dragon sex is encoded by mob-id parity. Keep the portrait ids stable so
  // inserting an unrelated creature earlier in CORE_MOB_ORDER cannot silently
  // flip every public dragon portrait between its male and female geometry.
  const stableDragonPortraitIds: Readonly<Record<DragonKind, number>> = {
    "fire-dragon": -62,
    "ice-dragon": -63,
    "steel-dragon": -64,
    "sea-dragon": -65,
  };
  return CORE_MOB_ORDER.map((kind, index) => {
    const model = createMobVisual(kind, stableDragonPortraitIds[kind as DragonKind] ?? -(index + 1));
    const airborne = kind === "glowmoth" || MOB_DEFS[kind].flying || MOB_DEFS[kind].aquatic;
    // The old inspector shifted every visual until its lowest vertex touched
    // the ground. That produced attractive sheets while hiding bad runtime
    // foot offsets. This wrapper instead reproduces the actual engine spawn:
    // block centers are Y=0 and their top surface is Y=0.5.
    const runtime = new THREE.Group();
    runtime.name = `${kind}-runtime-ground-audit`;
    runtime.add(model.group);
    if (!airborne) model.group.position.y = MOB_DEFS[kind].footOffset - 0.5;
    runtime.updateMatrixWorld(true);
    const spec = objectToInspectionSpec(runtime, {
      id: kind,
      label: MOB_DEFS[kind].name,
      category: "mob",
      front: "-z",
      groundY: airborne ? undefined : 0,
      inspection: { source: "MobVisual", mob: kind },
    });
    disposeObject(runtime);
    return spec;
  });
}

export function buildInspectionSpecs(): InspectionModelSpec[] {
  // Ridgeback and Zombie are legacy standalone specs. The catalog substitutes
  // production captures so all eight creatures are sourced from gameplay code.
  const base = INSPECTOR_MODEL_SPECS
    .filter((spec) => spec.id !== "ridgeback" && spec.id !== "zombie")
    .map((spec) => ({ ...spec, inspection: { source: "model-specs" as const } }));
  return [...base, createSkeletonArrowInspectionSpec(), ...createMobInspectionSpecs(), ...createPlayerInspectionSpecs(), ...BUTTERFLY_ORDER.map(createButterflyInspectionSpec)];
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function parseArguments() {
  const args = process.argv.slice(2);
  let out = path.resolve("output/model-inspection");
  let columns = 4;
  let views: ViewName[] = ["iso", "front", "side"];
  let requestedIds: string[] | null = null;
  let creaturesOnly = false;
  let portraits: string | null = null;
  let portraitOnly = false;
  let portraitPng = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--out" && args[index + 1]) out = path.resolve(args[++index]);
    else if (argument === "--columns" && args[index + 1]) columns = Math.max(1, Math.min(8, Number(args[++index]) || 4));
    else if ((argument === "--views" || argument === "--view") && args[index + 1]) {
      const candidates = args[++index].split(",").filter((candidate): candidate is ViewName => ["iso", "front", "side"].includes(candidate));
      if (candidates.length) views = [...new Set(candidates)];
    } else if ((argument === "--ids" || argument === "--spec") && args[index + 1]) requestedIds = args[++index].split(",").filter(Boolean);
    else if (argument === "--creatures") creaturesOnly = true;
    else if (argument === "--portraits" && args[index + 1]) portraits = path.resolve(args[++index]);
    else if (argument === "--portrait-only") portraitOnly = true;
    else if (argument === "--portrait-png") portraitPng = true;
    else if (argument === "--help") {
      process.stdout.write("Render Blockwild model inspection sheets, creature portraits, and a JSON manifest.\n\n  node --import tsx scripts/render-models.ts [--out DIR] [--views iso,front,side] [--ids ridgeback,player-running] [--creatures] [--columns 4] [--portraits DIR] [--portrait-only] [--portrait-png]\n");
      process.exit(0);
    }
  }
  const availableSpecs = buildInspectionSpecs();
  const specs = requestedIds
    ? availableSpecs.filter((spec) => requestedIds.includes(spec.id))
    : creaturesOnly
      ? availableSpecs.filter((spec) => spec.category === "mob")
      : availableSpecs;
  if (!specs.length) throw new Error(`No model specs matched: ${requestedIds?.join(", ") ?? "(none)"}`);
  if (portraitOnly && !portraits) throw new Error("--portrait-only requires --portraits DIR.");
  return { out, columns, views, specs, portraits, portraitOnly, portraitPng };
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

export function modelBounds(spec: ModelSpec) {
  const points = spec.boxes.flatMap((modelBox) => boxVertices(modelBox).vertices);
  const bounds = new THREE.Box3().setFromPoints(points);
  return { bounds, centerY: (bounds.min.y + bounds.max.y) / 2 };
}

export function inspectGrounding(spec: ModelSpec) {
  const { bounds } = modelBounds(spec);
  const groundY = spec.groundY ?? 0;
  const lowestY = bounds.min.y;
  const groundDelta = lowestY - groundY;
  const contact = spec.groundY === undefined
    ? "reference" as const
    : Math.abs(groundDelta) < 0.0001
      ? "exact" as const
      : groundDelta > 0
        ? "floating" as const
        : "penetrating" as const;
  return { groundY, lowestY, groundDelta, contact };
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
  const horizontalSpan = Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z);
  const tinyModel = horizontalSpan < 0.55 && bounds.max.y - bounds.min.y < 0.35;
  const gridRadius = tinyModel ? Math.max(0.34, horizontalSpan * 1.35) : Math.max(1.1, horizontalSpan * 0.82);
  const groundThickness = Math.max(tinyModel ? 0.025 : 0.07, (bounds.max.y - bounds.min.y) * 0.035);
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
  const clipId = `model-clip-${spec.id}-${view}-${tileX}-${tileY}`.replace(/[^A-Za-z0-9_-]+/gu, "-");
  const output: string[] = [
    `<g data-model-id="${escapeXml(spec.id)}" data-ground-y="${groundY.toFixed(4)}" data-lowest-y="${lowestY.toFixed(4)}">`,
    `<rect x="${tileX + 7}" y="${tileY + 7}" width="${TILE_WIDTH - 14}" height="${TILE_HEIGHT - 14}" rx="13" fill="#161a1f" stroke="#39424c" stroke-width="2"/>`,
    `<defs><clipPath id="${clipId}"><rect x="${tileX + 10}" y="${tileY + 84}" width="${TILE_WIDTH - 20}" height="${TILE_HEIGHT - 143}" rx="7"/></clipPath></defs>`,
    `<text x="${tileX + 25}" y="${tileY + 36}" fill="#f3eee0" font-size="20" font-weight="800">${escapeXml(spec.label)}</text>`,
    `<text x="${tileX + 25}" y="${tileY + 57}" fill="#93a0ad" font-size="11" font-weight="700" letter-spacing="1.2">${spec.category.toUpperCase()} · ${view === "iso" ? "ORTHOGRAPHIC ISOMETRIC" : `${view.toUpperCase()} ORTHOGRAPHIC`}</text>`,
    `<text x="${tileX + 25}" y="${tileY + 77}" fill="${groundStatusColor}" font-size="10" font-weight="800" letter-spacing="0.45">${groundStatus}</text>`,
    `<g clip-path="url(#${clipId})">`,
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

  const axisLength = Math.max(tinyModel ? 0.22 : 0.72, gridRadius * 0.72);
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
  const frontBadgeX = THREE.MathUtils.clamp(frontPoint.x - 7, tileX + 18, tileX + TILE_WIDTH - 90);
  const frontBadgeY = THREE.MathUtils.clamp(frontPoint.y - 22, tileY + 92, tileY + TILE_HEIGHT - 78);
  output.push(`<rect x="${frontBadgeX.toFixed(2)}" y="${frontBadgeY.toFixed(2)}" width="72" height="18" rx="4" fill="#181714" stroke="#8a7437"/>`);
  output.push(`<text x="${(frontBadgeX + 5).toFixed(2)}" y="${(frontBadgeY + 13).toFixed(2)}" fill="#ffe07b" font-size="10" font-weight="900">FRONT -Z</text>`);
  output.push(`</g>`);
  const partSummary = parts.join(" · ");
  const clippedPartSummary = partSummary.length > 58 ? `${partSummary.slice(0, 57)}…` : partSummary;
  output.push(`<text x="${tileX + 25}" y="${tileY + TILE_HEIGHT - 42}" fill="#aab3bc" font-size="10">${escapeXml(clippedPartSummary)}</text>`);
  output.push(`<text x="${tileX + TILE_WIDTH - 25}" y="${tileY + TILE_HEIGHT - 22}" text-anchor="end" fill="#65717c" font-size="10">${escapeXml(spec.id)}</text>`, `</g>`);
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

const PORTRAIT_WIDTH = 640;
const PORTRAIT_HEIGHT = 420;

function portraitProjection(targetY: number): Projection {
  const target = new THREE.Vector3(0, targetY, 0);
  // The model front is local -Z. A positive-X offset exposes just enough side
  // plane to read as a dimensional specimen without losing its face.
  const camera = new THREE.Vector3(4.2, targetY + 1.75, -7.4);
  const forward = target.clone().sub(camera).normalize();
  const right = forward.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
  const up = right.clone().cross(forward).normalize();
  return { camera, target, right, up, forward };
}

/** Renders a clean, transparent, front-three-quarter portrait from a model spec. */
export function renderModelPortrait(spec: ModelSpec) {
  assertModelSpec(spec);
  const { bounds, centerY } = modelBounds(spec);
  const projection = portraitProjection(centerY);
  const faces = modelFaces(spec, projection);
  const rawPoints = spec.boxes.flatMap((modelBox) => boxVertices(modelBox).vertices).map((point) => rawProject(point, projection));
  const minX = Math.min(...rawPoints.map((point) => point.x));
  const maxX = Math.max(...rawPoints.map((point) => point.x));
  const minY = Math.min(...rawPoints.map((point) => point.y));
  const maxY = Math.max(...rawPoints.map((point) => point.y));
  const horizontalSpan = Math.max(0.08, maxX - minX);
  const verticalSpan = Math.max(0.08, maxY - minY);
  const draw = { x: 48, y: 24, width: PORTRAIT_WIDTH - 96, height: PORTRAIT_HEIGHT - 70 };
  const scale = Math.min(draw.width / horizontalSpan, draw.height / verticalSpan);
  const offsetX = draw.x + draw.width / 2 - ((minX + maxX) / 2) * scale;
  const offsetY = draw.y + draw.height / 2 - ((minY + maxY) / 2) * scale;
  const project = (point: THREE.Vector3) => {
    const projected = rawProject(point, projection);
    return { x: offsetX + projected.x * scale, y: offsetY + projected.y * scale };
  };
  const groundCenter = project(new THREE.Vector3((bounds.min.x + bounds.max.x) / 2, spec.groundY ?? bounds.min.y, (bounds.min.z + bounds.max.z) / 2));
  const modelWidth = Math.min(PORTRAIT_WIDTH * 0.7, horizontalSpan * scale * 0.72);
  const polygons = faces.map((face) => {
    const points = face.points.map(project).map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
    return `<polygon points="${points}" fill="${face.color}" stroke="${face.emissive ? "#ffe59a" : "#1c211e"}" stroke-opacity="${face.emissive ? ".74" : ".68"}" stroke-width="1.35" stroke-linejoin="round" vector-effect="non-scaling-stroke"${face.emissive ? " filter=\"url(#portrait-glow)\"" : ""}/>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${PORTRAIT_WIDTH}" height="${PORTRAIT_HEIGHT}" viewBox="0 0 ${PORTRAIT_WIDTH} ${PORTRAIT_HEIGHT}" role="img" aria-labelledby="portrait-title">
  <title id="portrait-title">${escapeXml(spec.label)} front three-quarter model portrait</title>
  <defs>
    <filter id="portrait-glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="portrait-shadow" x="-40%" y="-80%" width="180%" height="260%"><feGaussianBlur stdDeviation="8"/></filter>
  </defs>
${spec.groundY === undefined ? "" : `  <ellipse cx="${groundCenter.x.toFixed(2)}" cy="${Math.min(PORTRAIT_HEIGHT - 20, groundCenter.y + 10).toFixed(2)}" rx="${Math.max(34, modelWidth).toFixed(2)}" ry="13" fill="#0c120f" opacity=".32" filter="url(#portrait-shadow)"/>\n`}
  <g>${polygons}</g>
</svg>`;
}

function renderPortraitSheet(specs: readonly InspectionModelSpec[], rendered: ReadonlyMap<string, string>, requestedColumns = 4) {
  const columns = Math.min(Math.max(1, requestedColumns), specs.length);
  const tileWidth = 360;
  const tileHeight = 310;
  const headerHeight = 100;
  const rows = Math.ceil(specs.length / columns);
  const width = columns * tileWidth;
  const height = headerHeight + rows * tileHeight;
  const tiles = specs.map((spec, index) => {
    const x = (index % columns) * tileWidth;
    const y = headerHeight + Math.floor(index / columns) * tileHeight;
    const portrait = rendered.get(spec.id) ?? "";
    const data = Buffer.from(portrait, "utf8").toString("base64");
    const mobKey = (spec.inspection?.mob ?? spec.inspection?.variant ?? spec.id.replace(/^butterfly-/, "")) as keyof typeof MOB_DEFS;
    const definition = spec.category === "mob" && mobKey in MOB_DEFS ? MOB_DEFS[mobKey] : undefined;
    const rawFooter = definition ? `${definition.temperament.toUpperCase()} · ${definition.active.toUpperCase()}` : spec.category.toUpperCase();
    const footerLabel = rawFooter.length > 42 ? `${rawFooter.slice(0, 41)}…` : rawFooter;
    return `<g transform="translate(${x} ${y})">
      <rect x="8" y="8" width="${tileWidth - 16}" height="${tileHeight - 16}" rx="18" fill="#171d1a" stroke="#39473e" stroke-width="2"/>
      <image href="data:image/svg+xml;base64,${data}" x="18" y="16" width="${tileWidth - 36}" height="${tileHeight - 82}" preserveAspectRatio="xMidYMid meet"/>
      <text x="24" y="${tileHeight - 42}" fill="#f2ebd7" font-family="ui-sans-serif, system-ui, sans-serif" font-size="20" font-weight="800">${escapeXml(spec.label.replace(/^Butterfly · /, ""))}</text>
      <text x="24" y="${tileHeight - 21}" fill="#95a99b" font-family="ui-sans-serif, system-ui, sans-serif" font-size="10" font-weight="700" letter-spacing="1.4">${escapeXml(footerLabel)}</text>
    </g>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#0c100e"/>
  <text x="28" y="43" fill="#e5bd68" font-family="ui-sans-serif, system-ui, sans-serif" font-size="26" font-weight="900" letter-spacing="1.8">BLOCKWILD FIELD GUIDE · V1.3.5</text>
  <text x="28" y="70" fill="#99a79e" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13">Production creature models · front three-quarter portraits · ${specs.length} specimens</text>
  ${tiles}
</svg>`;
}

export async function renderModelPortraits(options: { out: string; columns?: number; specs: InspectionModelSpec[]; png?: boolean }) {
  const { out, specs, columns = 4, png = false } = options;
  await mkdir(out, { recursive: true });
  const files: string[] = [];
  const rendered = new Map<string, string>();
  for (const spec of specs) {
    const svg = renderModelPortrait(spec);
    rendered.set(spec.id, svg);
    const svgPath = path.join(out, `${spec.id}.svg`);
    await writeFile(svgPath, svg, "utf8");
    files.push(svgPath);
    if (png) {
      const pngPath = path.join(out, `${spec.id}.png`);
      if (await writePng(svg, pngPath)) files.push(pngPath);
    }
  }
  const sheet = renderPortraitSheet(specs, rendered, columns);
  const sheetPath = path.join(out, "blockwild-creatures.svg");
  await writeFile(sheetPath, sheet, "utf8");
  files.push(sheetPath);
  if (png) {
    const pngPath = path.join(out, "blockwild-creatures.png");
    if (await writePng(sheet, pngPath)) files.push(pngPath);
  }
  return { status: "rendered" as const, specs: specs.map((spec) => spec.id), files, sheetPath };
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

export async function renderModelInspection(options: { out: string; columns: number; views: ViewName[]; specs: InspectionModelSpec[] }) {
  const { out, columns, views, specs } = options;
  await mkdir(out, { recursive: true });
  const files: string[] = [];
  const outputs: InspectionManifest["outputs"] = [];
  for (const view of views) {
    const svg = renderContactSheet(specs, columns, view);
    const svgPath = path.join(out, `blockwild-models-${view}.svg`);
    const pngPath = path.join(out, `blockwild-models-${view}.png`);
    await writeFile(svgPath, svg, "utf8");
    files.push(svgPath);
    outputs.push({ view, format: "svg", file: path.basename(svgPath) });
    if (await writePng(svg, pngPath)) {
      files.push(pngPath);
      outputs.push({ view, format: "png", file: path.basename(pngPath) });
    }
  }
  const manifest: InspectionManifest = {
    version: 1,
    renderer: "blockwild-model-inspector",
    views,
    columns: Math.min(columns, specs.length),
    specs: specs.map((spec) => {
      const grounding = inspectGrounding(spec);
      return {
        id: spec.id,
        label: spec.label,
        category: spec.category,
        source: spec.inspection?.source ?? "model-specs",
        ...(spec.inspection?.pose ? { pose: spec.inspection.pose } : {}),
        ...(spec.inspection?.variant ? { variant: spec.inspection.variant } : {}),
        boxCount: spec.boxes.length,
        ...grounding,
      };
    }),
    outputs,
  };
  const manifestPath = path.join(out, "blockwild-model-manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  files.push(manifestPath);
  return { status: "rendered" as const, specs: specs.map((spec) => spec.id), files, manifestPath, manifest };
}

async function main() {
  const options = parseArguments();
  const inspection = options.portraitOnly ? null : await renderModelInspection(options);
  const portraits = options.portraits
    ? await renderModelPortraits({ out: options.portraits, columns: options.columns, specs: options.specs, png: options.portraitPng })
    : null;
  process.stdout.write(`${JSON.stringify({
    status: "rendered",
    specs: options.specs.map((spec) => spec.id),
    ...(inspection ? { files: inspection.files, manifest: inspection.manifestPath } : {}),
    ...(portraits ? { portraitFiles: portraits.files, portraitSheet: portraits.sheetPath } : {}),
  }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
