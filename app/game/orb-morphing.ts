import { Item, type InventorySlot, type ItemCode } from "./data";
import { captureOrbFromInventorySlot, captureOrbInventorySlot, decodeCaptureOrb, encodeCaptureOrb, type CaptureOrb } from "./capture-orbs";
import type { CreatureMetadata } from "./creature-cage";
import { MOB_DEFS, type MobKind } from "./mobs";

export const ORB_MORPH_SCHEMA = 1 as const;
export const ORB_MORPH_RESOURCE_CAP = 64;

export type OrbMorphRecipeId = "worker-to-hive-queen";
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
  id: "worker-to-hive-queen",
  name: "Crown a Hive Queen",
  inputKind: "honeybee",
  outputKind: "hive-queen",
  complexity: 1,
  baseDurationSeconds: 42,
  baseCosts: Object.freeze([
    { item: Item.RoyalJelly, count: 1 },
    { item: Item.CrystalShard, count: 1 },
  ]),
  note: "Royal Jelly guides the colony instinct; a Star Crystal stabilizes the exact creature record inside the orb.",
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
  royalJelly: number;
  starCrystals: number;
  activeJob: OrbMorphJob | null;
  completedMorphs: number;
}>;

export type OrbMorphStartReason = "ok" | "busy" | "output-occupied" | "missing-orb" | "wrong-creature" | "deployed" | "missing-resources";

export const createOrbMorphLoom = (): OrbMorphLoomState => ({
  schema: ORB_MORPH_SCHEMA,
  selectedRecipeId: "worker-to-hive-queen",
  inputOrb: null,
  outputOrb: null,
  royalJelly: 0,
  starCrystals: 0,
  activeJob: null,
  completedMorphs: 0,
});

const cloneOrb = (orb: CaptureOrb | null | undefined): CaptureOrb | null => orb ? decodeCaptureOrb(encodeCaptureOrb(orb)) : null;

export function normalizeOrbMorphLoom(value: unknown): OrbMorphLoomState {
  if (!value || typeof value !== "object") return createOrbMorphLoom();
  const raw = value as Partial<OrbMorphLoomState>;
  const selectedRecipeId = ORB_MORPH_RECIPES.some((recipe) => recipe.id === raw.selectedRecipeId)
    ? raw.selectedRecipeId as OrbMorphRecipeId
    : "worker-to-hive-queen";
  const job = raw.activeJob && typeof raw.activeJob === "object" && raw.activeJob.recipeId === selectedRecipeId
    ? {
      recipeId: selectedRecipeId,
      progressSeconds: Math.max(0, Number(raw.activeJob.progressSeconds) || 0),
      durationSeconds: Math.max(1, Number(raw.activeJob.durationSeconds) || morphDurationSeconds(selectedRecipeId)),
      startedAt: Math.max(0, Number(raw.activeJob.startedAt) || 0),
    }
    : null;
  return {
    schema: ORB_MORPH_SCHEMA,
    selectedRecipeId,
    inputOrb: cloneOrb(raw.inputOrb),
    outputOrb: cloneOrb(raw.outputOrb),
    royalJelly: Math.max(0, Math.min(ORB_MORPH_RESOURCE_CAP, Math.floor(Number(raw.royalJelly) || 0))),
    starCrystals: Math.max(0, Math.min(ORB_MORPH_RESOURCE_CAP, Math.floor(Number(raw.starCrystals) || 0))),
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
  if (item === Item.RoyalJelly) {
    const moved = Math.min(amount, ORB_MORPH_RESOURCE_CAP - state.royalJelly);
    return { state: { ...state, royalJelly: state.royalJelly + moved }, moved } as const;
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
  if (item === Item.RoyalJelly) {
    const moved = Math.min(amount, state.royalJelly);
    return { state: { ...state, royalJelly: state.royalJelly - moved }, moved } as const;
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
  if (costs.some((cost) => cost.item === Item.RoyalJelly ? normalized.royalJelly < cost.count : normalized.starCrystals < cost.count)) {
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

function morphWorkerIntoQueen(orb: CaptureOrb): CaptureOrb {
  const worker = orb.creature!;
  const queenDefinition = MOB_DEFS["hive-queen"];
  const oldBee = worker.custom.apiaryBee && typeof worker.custom.apiaryBee === "object"
    ? worker.custom.apiaryBee as Record<string, unknown>
    : {};
  const creature: CreatureMetadata = {
    ...JSON.parse(JSON.stringify(worker)) as CreatureMetadata,
    kind: "hive-queen",
    health: queenDefinition.health,
    maxHealth: queenDefinition.health,
    ageTicks: Math.max(24_000, worker.ageTicks),
    baby: false,
    temperament: queenDefinition.temperament,
    hostile: false,
    name: /^honeybee$/iu.test(worker.name ?? "") ? "Hive Queen" : worker.name,
    custom: {
      ...worker.custom,
      apiaryBee: {
        ...oldBee,
        id: typeof oldBee.id === "string" ? oldBee.id : worker.entityId,
        role: "queen",
        alive: true,
        home: false,
        outbound: false,
        carryingNectar: 0,
        lastReturnDay: Number(oldBee.lastReturnDay) || 0,
        disconnectedDay: null,
        geneticSeed: Number(oldBee.geneticSeed) || worker.geneticSeed,
        angry: false,
        tamed: worker.tamed,
        ownerId: worker.ownerId,
      },
      morphedBy: "waykeeper-chrysalis-loom",
      morphRecipeId: "worker-to-hive-queen",
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
  const royalJellyCost = costs.find((cost) => cost.item === Item.RoyalJelly)?.count ?? 0;
  const starCrystalCost = costs.find((cost) => cost.item === Item.CrystalShard)?.count ?? 0;
  return {
    state: {
      ...normalized,
      inputOrb: null,
      outputOrb: morphWorkerIntoQueen(normalized.inputOrb),
      royalJelly: normalized.royalJelly - royalJellyCost,
      starCrystals: normalized.starCrystals - starCrystalCost,
      activeJob: null,
      completedMorphs: normalized.completedMorphs + 1,
    },
    completed: true,
  } as const;
}
