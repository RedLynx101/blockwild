import { Item, type InventorySlot, type ItemCode } from "./data";
import { captureOrbFromInventorySlot, captureOrbInventorySlot, decodeCaptureOrb, encodeCaptureOrb, type CaptureOrb } from "./capture-orbs";
import type { CreatureMetadata } from "./creature-cage";
import { MOB_DEFS, type MobKind } from "./mobs";

export const ORB_MORPH_SCHEMA = 2 as const;
export const ORB_MORPH_RESOURCE_CAP = 64;

export type OrbMorphRecipeId = "mossling-to-moonbrawn";
export type OrbMorphCost = Readonly<{ item: ItemCode; count: number }>;
export type OrbMorphRecipe = Readonly<{
  id: OrbMorphRecipeId;
  name: string;
  inputKind: MobKind;
  outputKind: MobKind;
  complexity: number;
  baseDurationSeconds: number;
  baseCosts: readonly OrbMorphCost[];
  note: string;
}>;

export const ORB_MORPH_RECIPES: readonly OrbMorphRecipe[] = Object.freeze([{
  id: "mossling-to-moonbrawn",
  name: "Root a Moonbrawn Mossling",
  inputKind: "mossling",
  outputKind: "moonbrawn-mossling",
  complexity: 1,
  baseDurationSeconds: 48,
  baseCosts: Object.freeze([
    { item: Item.Berry, count: 4 },
    { item: Item.CrystalShard, count: 1 },
  ]),
  note: "Moonberries feed a denser root-heart while one Star Crystal teaches the new growth to keep its exact creature record.",
}]);

export type OrbMorphJob = Readonly<{
  recipeId: OrbMorphRecipeId;
  progressSeconds: number;
  durationSeconds: number;
  startedAt: number;
}>;

export type OrbMorphLoomState = Readonly<{
  schema: typeof ORB_MORPH_SCHEMA;
  selectedRecipeId: OrbMorphRecipeId;
  inputOrb: CaptureOrb | null;
  outputOrb: CaptureOrb | null;
  moonberries: number;
  starCrystals: number;
  /** v1.8.2 Looms may still contain jelly. It remains recoverable but is never consumed by the new pattern. */
  legacyRoyalJelly: number;
  activeJob: OrbMorphJob | null;
  completedMorphs: number;
}>;

export type OrbMorphStartReason = "ok" | "busy" | "output-occupied" | "missing-orb" | "wrong-creature" | "deployed" | "missing-resources";

export const createOrbMorphLoom = (): OrbMorphLoomState => ({
  schema: ORB_MORPH_SCHEMA,
  selectedRecipeId: "mossling-to-moonbrawn",
  inputOrb: null,
  outputOrb: null,
  moonberries: 0,
  starCrystals: 0,
  legacyRoyalJelly: 0,
  activeJob: null,
  completedMorphs: 0,
});

const cloneOrb = (orb: CaptureOrb | null | undefined): CaptureOrb | null => orb ? decodeCaptureOrb(encodeCaptureOrb(orb)) : null;
const boundedResource = (value: unknown) => Math.max(0, Math.min(ORB_MORPH_RESOURCE_CAP, Math.floor(Number(value) || 0)));

/**
 * v1.8.2 stored the retired bee-crowning pattern and Royal Jelly in the Loom.
 * Migration cancels that job without consuming anything, preserves both orbs,
 * and exposes the old jelly through a recovery-only slot in the current UI.
 */
export function normalizeOrbMorphLoom(value: unknown): OrbMorphLoomState {
  if (!value || typeof value !== "object") return createOrbMorphLoom();
  const raw = value as Record<string, unknown>;
  const selectedRecipeId: OrbMorphRecipeId = "mossling-to-moonbrawn";
  const rawJob = raw.activeJob && typeof raw.activeJob === "object" ? raw.activeJob as Record<string, unknown> : null;
  const job = rawJob?.recipeId === selectedRecipeId
    ? {
      recipeId: selectedRecipeId,
      progressSeconds: Math.max(0, Number(rawJob.progressSeconds) || 0),
      durationSeconds: Math.max(1, Number(rawJob.durationSeconds) || morphDurationSeconds(selectedRecipeId)),
      startedAt: Math.max(0, Number(rawJob.startedAt) || 0),
    }
    : null;
  return {
    schema: ORB_MORPH_SCHEMA,
    selectedRecipeId,
    inputOrb: cloneOrb(raw.inputOrb as CaptureOrb | null | undefined),
    outputOrb: cloneOrb(raw.outputOrb as CaptureOrb | null | undefined),
    moonberries: boundedResource(raw.moonberries),
    starCrystals: boundedResource(raw.starCrystals),
    legacyRoyalJelly: boundedResource(raw.legacyRoyalJelly) + boundedResource(raw.royalJelly),
    activeJob: job,
    completedMorphs: Math.max(0, Math.floor(Number(raw.completedMorphs) || 0)),
  };
}

export function orbMorphRecipe(recipeId: OrbMorphRecipeId) {
  return ORB_MORPH_RECIPES.find((recipe) => recipe.id === recipeId) ?? ORB_MORPH_RECIPES[0];
}

/** Costs and time scale from recipe complexity, leaving room for multi-step future morphs. */
export function orbMorphCosts(recipeId: OrbMorphRecipeId, amount = 1): readonly OrbMorphCost[] {
  const recipe = orbMorphRecipe(recipeId);
  const scale = Math.max(1, Math.floor(amount)) * Math.max(1, recipe.complexity);
  return recipe.baseCosts.map((cost) => ({ ...cost, count: cost.count * scale }));
}

export function morphDurationSeconds(recipeId: OrbMorphRecipeId, amount = 1) {
  const recipe = orbMorphRecipe(recipeId);
  return recipe.baseDurationSeconds * Math.max(1, recipe.complexity) * Math.max(1, Math.floor(amount));
}

export function orbMorphInputSlot(state: OrbMorphLoomState): InventorySlot | null {
  return state.inputOrb ? captureOrbInventorySlot(state.inputOrb) : null;
}

export function orbMorphOutputSlot(state: OrbMorphLoomState): InventorySlot | null {
  return state.outputOrb ? captureOrbInventorySlot(state.outputOrb) : null;
}

export function setOrbMorphInput(state: OrbMorphLoomState, slot: InventorySlot | null): OrbMorphLoomState | null {
  if (state.activeJob) return null;
  if (slot === null) return { ...state, inputOrb: null };
  const orb = captureOrbFromInventorySlot(slot);
  if (!orb?.creature || orb.creature.kind !== orbMorphRecipe(state.selectedRecipeId).inputKind || orb.attunement?.activeEntityId) return null;
  return { ...state, inputOrb: orb };
}

export function addOrbMorphResource(state: OrbMorphLoomState, item: ItemCode, count: number) {
  if (state.activeJob) return { state, moved: 0 } as const;
  const amount = Math.max(0, Math.floor(count));
  if (item === Item.Berry) {
    const moved = Math.min(amount, ORB_MORPH_RESOURCE_CAP - state.moonberries);
    return { state: { ...state, moonberries: state.moonberries + moved }, moved } as const;
  }
  if (item === Item.CrystalShard) {
    const moved = Math.min(amount, ORB_MORPH_RESOURCE_CAP - state.starCrystals);
    return { state: { ...state, starCrystals: state.starCrystals + moved }, moved } as const;
  }
  return { state, moved: 0 } as const;
}

export function removeOrbMorphResource(state: OrbMorphLoomState, item: ItemCode, count: number) {
  if (state.activeJob) return { state, moved: 0 } as const;
  const amount = Math.max(0, Math.floor(count));
  if (item === Item.Berry) {
    const moved = Math.min(amount, state.moonberries);
    return { state: { ...state, moonberries: state.moonberries - moved }, moved } as const;
  }
  if (item === Item.CrystalShard) {
    const moved = Math.min(amount, state.starCrystals);
    return { state: { ...state, starCrystals: state.starCrystals - moved }, moved } as const;
  }
  return { state, moved: 0 } as const;
}

export function startOrbMorph(state: OrbMorphLoomState, now = Date.now()): Readonly<{ state: OrbMorphLoomState; started: boolean; reason: OrbMorphStartReason }> {
  const normalized = normalizeOrbMorphLoom(state);
  if (normalized.activeJob) return { state: normalized, started: false, reason: "busy" };
  if (normalized.outputOrb) return { state: normalized, started: false, reason: "output-occupied" };
  if (!normalized.inputOrb?.creature) return { state: normalized, started: false, reason: "missing-orb" };
  const recipe = orbMorphRecipe(normalized.selectedRecipeId);
  if (normalized.inputOrb.creature.kind !== recipe.inputKind) return { state: normalized, started: false, reason: "wrong-creature" };
  if (normalized.inputOrb.attunement?.activeEntityId) return { state: normalized, started: false, reason: "deployed" };
  const costs = orbMorphCosts(recipe.id);
  if (costs.some((cost) => cost.item === Item.Berry ? normalized.moonberries < cost.count : normalized.starCrystals < cost.count)) {
    return { state: normalized, started: false, reason: "missing-resources" };
  }
  return {
    state: {
      ...normalized,
      activeJob: { recipeId: recipe.id, progressSeconds: 0, durationSeconds: morphDurationSeconds(recipe.id), startedAt: Math.max(0, now) },
    },
    started: true,
    reason: "ok",
  };
}

export function cancelOrbMorph(state: OrbMorphLoomState): Readonly<{ state: OrbMorphLoomState; cancelled: boolean }> {
  const normalized = normalizeOrbMorphLoom(state);
  return normalized.activeJob
    ? { state: { ...normalized, activeJob: null }, cancelled: true }
    : { state: normalized, cancelled: false };
}

function morphMosslingIntoMoonbrawn(orb: CaptureOrb): CaptureOrb {
  const mossling = orb.creature!;
  const definition = MOB_DEFS["moonbrawn-mossling"];
  const healthRatio = mossling.maxHealth > 0 ? mossling.health / mossling.maxHealth : 1;
  const creature: CreatureMetadata = {
    ...JSON.parse(JSON.stringify(mossling)) as CreatureMetadata,
    kind: "moonbrawn-mossling",
    health: Math.max(1, Math.min(definition.health, definition.health * healthRatio)),
    maxHealth: definition.health,
    temperament: definition.temperament,
    hostile: false,
    name: /^mossling$/iu.test(mossling.name ?? "") ? definition.name : mossling.name,
    custom: {
      ...mossling.custom,
      morphedBy: "waykeeper-chrysalis-loom",
      morphRecipeId: "mossling-to-moonbrawn",
    },
  };
  return { ...orb, capturedAt: Date.now(), creature };
}

export function stepOrbMorph(state: OrbMorphLoomState, deltaSeconds: number) {
  const normalized = normalizeOrbMorphLoom(state);
  if (!normalized.activeJob || !normalized.inputOrb) return { state: normalized, completed: false } as const;
  const progressSeconds = Math.min(normalized.activeJob.durationSeconds,
    normalized.activeJob.progressSeconds + Math.max(0, Math.min(3600, deltaSeconds)));
  if (progressSeconds < normalized.activeJob.durationSeconds) {
    return { state: { ...normalized, activeJob: { ...normalized.activeJob, progressSeconds } }, completed: false } as const;
  }
  const costs = orbMorphCosts(normalized.activeJob.recipeId);
  const moonberryCost = costs.find((cost) => cost.item === Item.Berry)?.count ?? 0;
  const starCrystalCost = costs.find((cost) => cost.item === Item.CrystalShard)?.count ?? 0;
  return {
    state: {
      ...normalized,
      inputOrb: null,
      outputOrb: morphMosslingIntoMoonbrawn(normalized.inputOrb),
      moonberries: normalized.moonberries - moonberryCost,
      starCrystals: normalized.starCrystals - starCrystalCost,
      activeJob: null,
      completedMorphs: normalized.completedMorphs + 1,
    },
    completed: true,
  } as const;
}
