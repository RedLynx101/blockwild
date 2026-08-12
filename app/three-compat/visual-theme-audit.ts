import * as THREE from "three";
import { createButterflyVisual } from "../game/butterflies";
import { BLOCKS, BLOCK_ITEM_ALIASES, BlockId, ITEMS, itemForBlock, type BlockDefinition } from "../game/data";
import { CUBIC_STORYBOOK_VISUAL_KINDS, FACETED_STORYBOOK_EXCEPTION_KINDS } from "../game/living-bestiary-models";
import { createMobVisual } from "../game/mob-models";
import { MOB_DEFS, type MobKind } from "../game/mobs";
import {
  BLOCKWILD_VISUAL_THEME,
  CREATURE_REFERENCE_MODELS,
  CREATURE_VISUAL_BUDGETS,
  CREATURE_VISUAL_EXCEPTIONS,
  blockVisualFamily,
  creatureBodyPlan,
  creatureVisualTier,
  type BlockVisualFamilyId,
  type CreatureBodyPlan,
  type CreatureVisualTier,
} from "../game/visual-theme";

export type VisualAuditIssue = Readonly<{
  code: string;
  message: string;
}>;

export type CreatureVisualAuditRow = Readonly<{
  kind: MobKind;
  name: string;
  family: string;
  bodyPlan: CreatureBodyPlan;
  referenceTier: "reference" | "exception" | "standard";
  style: string;
  tier: CreatureVisualTier;
  meshes: number;
  triangles: number;
  boxMeshes: number;
  transparentTriangles: number;
  emissiveTriangles: number;
  emissionCoverage: number;
  faceParts: number;
  jointParts: number;
  distalParts: number;
  animationParts: number;
  width: number;
  height: number;
  depth: number;
  terrainDelta: number | null;
  warnings: readonly VisualAuditIssue[];
  violations: readonly VisualAuditIssue[];
}>;

export type BlockPlacementEvidence = Readonly<{
  natural: number;
  structure: number;
  recipe: number;
}>;

export type BlockVisualAuditRow = Readonly<{
  id: BlockId;
  enumName: string;
  name: string;
  family: BlockVisualFamilyId;
  top: number;
  side: number;
  bottom: number;
  hasDirectionalFaces: boolean;
  layer: string;
  shape: string;
  solid: boolean;
  hardness: number;
  preferredTool: string;
  dropItem: number;
  hasAcquisitionRoute: boolean;
  placements: BlockPlacementEvidence;
  warnings: readonly VisualAuditIssue[];
  violations: readonly VisualAuditIssue[];
}>;

export type VisualThemeAudit = Readonly<{
  schema: 1;
  theme: typeof BLOCKWILD_VISUAL_THEME;
  generatedAt: string;
  creatures: readonly CreatureVisualAuditRow[];
  blocks: readonly BlockVisualAuditRow[];
  totals: Readonly<{
    creatures: number;
    creatureWarnings: number;
    creatureViolations: number;
    blocks: number;
    blockWarnings: number;
    blockViolations: number;
    blockFamilies: number;
  }>;
}>;

const CUBIC_KIND_SET = new Set<MobKind>(CUBIC_STORYBOOK_VISUAL_KINDS);
const FACETED_EXCEPTION_SET = new Set<MobKind>(FACETED_STORYBOOK_EXCEPTION_KINDS);
const REFERENCE_KIND_SET = new Set<MobKind>(CREATURE_REFERENCE_MODELS.map((entry) => entry.kind));
const FACE_PATTERN = /(?:^|-)(?:face|eye|brow|cheek|muzzle|snout|rostrum|beak|jaw|mouth|nose|nostril|melon|mask)(?:-|$)/u;
const JOINT_PATTERN = /(?:joint|knee|elbow|hock|ankle|wrist|shoulder|hip|scapula|pelvis)/u;
const DISTAL_PATTERN = /(?:foot|paw|hoof|toe|claw|talon|finger|fang|tooth|webbing|fin-tip|tail-tip)/u;

function geometryTriangles(geometry: THREE.BufferGeometry) {
  return geometry.index ? geometry.index.count / 3 : (geometry.getAttribute("position")?.count ?? 0) / 3;
}

function materialList(mesh: THREE.Mesh) {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function rounded(value: number, digits = 5) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

export function auditCreatureVisual(kind: MobKind, id = 970_000): CreatureVisualAuditRow {
  const definition = MOB_DEFS[kind];
  const model = definition.family === "butterfly"
    ? (() => {
      const butterfly = createButterflyVisual(kind as Parameters<typeof createButterflyVisual>[0], id);
      return { group: butterfly.group, visual: butterfly.group, parts: { legs: [], wings: [butterfly.leftWing, butterfly.rightWing], arms: [], head: [], body: [] } };
    })()
    : createMobVisual(kind, id);
  const bodyPlan = (model.visual.userData.bodyPlan as CreatureBodyPlan | undefined) ?? creatureBodyPlan(definition);
  const warnings: VisualAuditIssue[] = [];
  const violations: VisualAuditIssue[] = [];
  let meshes = 0;
  let triangles = 0;
  let boxMeshes = 0;
  let transparentTriangles = 0;
  let emissiveTriangles = 0;
  let faceParts = 0;
  let jointParts = 0;
  let distalParts = 0;
  let animationParts = 0;
  model.visual.traverse((object) => {
    if (!object.visible) return;
    if (FACE_PATTERN.test(object.name)) faceParts += 1;
    if (JOINT_PATTERN.test(object.name)) jointParts += 1;
    if (DISTAL_PATTERN.test(object.name)) distalParts += 1;
    if (object.userData.livingFloatAmplitude || object.userData.livingSpinRate || object.userData.livingShimmerAmplitude || /pivot$/u.test(object.name)) animationParts += 1;
    if (!(object instanceof THREE.Mesh)) return;
    const meshTriangles = geometryTriangles(object.geometry);
    meshes += 1;
    triangles += meshTriangles;
    if (object.geometry.type === "BoxGeometry") boxMeshes += 1;
    const materials = materialList(object);
    if (materials.some((material) => material.transparent && material.opacity < 1)) transparentTriangles += meshTriangles;
    if (materials.some((material) => material instanceof THREE.MeshStandardMaterial && (material.emissiveIntensity > 0 || material.emissive.getHex() !== 0))) emissiveTriangles += meshTriangles;
  });
  model.visual.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model.visual);
  const size = bounds.getSize(new THREE.Vector3());
  let terrainDelta: number | null = null;
  if (!definition.flying && !definition.aquatic && definition.movement !== "flying" && definition.movement !== "aquatic") {
    model.group.position.y = definition.footOffset - .5;
    model.group.updateMatrixWorld(true);
    terrainDelta = rounded(new THREE.Box3().setFromObject(model.visual).min.y, 7);
  }
  const tier = creatureVisualTier(definition);
  const budget = CREATURE_VISUAL_BUDGETS[tier];
  const emissionCoverage = triangles > 0 ? emissiveTriangles / triangles : 0;
  if (meshes < Math.max(8, Math.floor(budget.minimumParts * .5))) warnings.push({ code: "low-detail", message: `${meshes} visible meshes is below half of the ${tier} reference-part target.` });
  if (faceParts < 2 && bodyPlan !== "abstract" && definition.family !== "butterfly" && definition.family !== "sea-slug" && !(definition.family === "pollinator" && tier === "tiny") && !FACETED_EXCEPTION_SET.has(kind)) warnings.push({ code: "weak-face", message: "Fewer than two named face structures were found." });
  if (bodyPlan === "quadruped" && model.parts.legs.filter((part) => part.visible).length < 2) warnings.push({ code: "weak-load-path", message: "Fewer than two visible leg roots were registered." });
  if (emissionCoverage > BLOCKWILD_VISUAL_THEME.ordinaryEmissionCoverageMaximum && tier !== "legendary") warnings.push({ code: "broad-emission", message: `${Math.round(emissionCoverage * 100)}% of visible triangles emit light; ordinary assets should concentrate glow.` });
  if (meshes === 0 || triangles === 0) violations.push({ code: "empty-model", message: "The production model has no visible renderable geometry." });
  if (![size.x, size.y, size.z].every(Number.isFinite)) violations.push({ code: "invalid-bounds", message: "The production model has non-finite bounds." });
  if (terrainDelta !== null && Math.abs(terrainDelta) > .15) violations.push({ code: "ground-contact", message: `Ground contact misses the terrain plane by ${terrainDelta}.` });
  if (CUBIC_KIND_SET.has(kind) && boxMeshes !== meshes) violations.push({ code: "cubic-contract", message: `${meshes - boxMeshes} visible meshes violate the approved cubic runtime contract.` });
  if (FACETED_EXCEPTION_SET.has(kind) && !CREATURE_VISUAL_EXCEPTIONS[kind]) violations.push({ code: "missing-exception", message: "The faceted exception has no authored silhouette reason." });
  return {
    kind,
    name: definition.name,
    family: definition.family ?? "unclassified",
    bodyPlan,
    referenceTier: REFERENCE_KIND_SET.has(kind) ? "reference" : FACETED_EXCEPTION_SET.has(kind) ? "exception" : "standard",
    style: String(model.visual.userData.modelStyle ?? (boxMeshes === meshes ? "cubic-native" : "mixed-authored")),
    tier,
    meshes,
    triangles: Math.round(triangles),
    boxMeshes,
    transparentTriangles: Math.round(transparentTriangles),
    emissiveTriangles: Math.round(emissiveTriangles),
    emissionCoverage: rounded(emissionCoverage),
    faceParts,
    jointParts,
    distalParts,
    animationParts,
    width: rounded(size.x),
    height: rounded(size.y),
    depth: rounded(size.z),
    terrainDelta,
    warnings,
    violations,
  };
}

function blockHasAcquisitionRoute(id: BlockId, definition: BlockDefinition) {
  if (id === BlockId.Air || Boolean(definition.liquid) || definition.replaceable) return true;
  const enumName = String(BlockId[id] ?? "");
  if (/(?:Door.*Open|Door.*Upper|Bed(?:North|South|East|West)(?:Foot|Head))/u.test(enumName)) return true;
  if (BLOCK_ITEM_ALIASES[id] !== undefined) return true;
  return Object.values(ITEMS).some((item) => item.placeBlock === id || item.plantBlock === id);
}

export function auditBlockVisual(id: BlockId, placements: BlockPlacementEvidence = { natural: 0, structure: 0, recipe: 0 }): BlockVisualAuditRow {
  const definition = BLOCKS[id];
  if (!definition) throw new Error(`Unknown block ${id}`);
  const warnings: VisualAuditIssue[] = [];
  const violations: VisualAuditIssue[] = [];
  const enumName = String(BlockId[id] ?? id);
  const family = blockVisualFamily(id, definition);
  const cells = [definition.top, definition.side, definition.bottom];
  const dropItem = itemForBlock(id);
  const hasAcquisitionRoute = blockHasAcquisitionRoute(id, definition);
  if (definition.layer !== "none" && cells.some((tile) => !Number.isInteger(tile) || tile < 0 || tile >= 256)) violations.push({ code: "atlas-range", message: `Atlas cells ${cells.join("/")} must remain within the 16x16 atlas.` });
  if (definition.id !== id) violations.push({ code: "registry-key", message: `Registry key ${id} does not match definition id ${definition.id}.` });
  if (definition.solid && definition.hardness <= 0 && id !== BlockId.Bedrock) violations.push({ code: "solid-hardness", message: "A solid block must have positive hardness." });
  if (!hasAcquisitionRoute && placements.natural + placements.structure === 0) warnings.push({ code: "orphaned-block", message: "No inventory, natural-generation, or structure-placement route was found." });
  if (definition.layer === "emissive" && family.id === "terrain-and-geology") warnings.push({ code: "unframed-emission", message: "Emissive geology needs an explicitly framed ecological or magical source." });
  if (definition.shape === "cube" || !definition.shape) {
    if (definition.top === definition.side && definition.side === definition.bottom && /grass|log|soil|farmland/u.test(definition.name.toLowerCase())) warnings.push({ code: "weak-face-logic", message: "A directional natural material uses one atlas face in every direction." });
  }
  return {
    id,
    enumName,
    name: definition.name,
    family: family.id,
    top: definition.top,
    side: definition.side,
    bottom: definition.bottom,
    hasDirectionalFaces: definition.top !== definition.side || definition.side !== definition.bottom,
    layer: definition.layer,
    shape: definition.shape ?? "cube",
    solid: definition.solid,
    hardness: definition.hardness,
    preferredTool: definition.preferredTool,
    dropItem,
    hasAcquisitionRoute,
    placements,
    warnings,
    violations,
  };
}

export function auditVisualTheme(options: Readonly<{
  generatedAt?: string;
  placements?: Readonly<Partial<Record<BlockId, BlockPlacementEvidence>>>;
}> = {}): VisualThemeAudit {
  const creatures = (Object.keys(MOB_DEFS) as MobKind[]).sort().map((kind, index) => auditCreatureVisual(kind, 970_000 + index));
  const blocks = Object.keys(BLOCKS).map(Number).sort((a, b) => a - b).map((id) => auditBlockVisual(id as BlockId, options.placements?.[id as BlockId]));
  return {
    schema: 1,
    theme: BLOCKWILD_VISUAL_THEME,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    creatures,
    blocks,
    totals: {
      creatures: creatures.length,
      creatureWarnings: creatures.reduce((sum, row) => sum + row.warnings.length, 0),
      creatureViolations: creatures.reduce((sum, row) => sum + row.violations.length, 0),
      blocks: blocks.length,
      blockWarnings: blocks.reduce((sum, row) => sum + row.warnings.length, 0),
      blockViolations: blocks.reduce((sum, row) => sum + row.violations.length, 0),
      blockFamilies: new Set(blocks.map((row) => row.family)).size,
    },
  };
}
