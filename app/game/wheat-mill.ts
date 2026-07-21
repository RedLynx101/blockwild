import { Item, type InventorySlot } from "./data";

export const WHEAT_MILL_SCHEMA = 1 as const;
export const WHEAT_MILL_CYCLE_SECONDS = 6;
export const WHEAT_MILL_STACK_CAP = 64;

/** One passive, fuel-free grinding cycle. */
export const WHEAT_MILL_PROCESS = Object.freeze({
  id: "wheat-mill-flour",
  name: "Mill Flour",
  input: Object.freeze({ item: Item.Wheat, count: 1 }),
  output: Object.freeze({ item: Item.Flour, count: 1 }),
  batchSeconds: WHEAT_MILL_CYCLE_SECONDS,
});

export type WheatMillState = Readonly<{
  schema: typeof WHEAT_MILL_SCHEMA;
  input: InventorySlot | null;
  output: InventorySlot | null;
  progressSeconds: number;
}>;

const finite = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

const cloneSlot = (slot: InventorySlot | null): InventorySlot | null => slot ? {
  ...slot,
  ...(slot.metadata ? { metadata: structuredClone(slot.metadata) } : {}),
} : null;

function normalizeSlot(value: unknown, item: number): InventorySlot | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<InventorySlot>;
  if (candidate.item !== item) return null;
  const count = clamp(Math.trunc(finite(candidate.count)), 0, WHEAT_MILL_STACK_CAP);
  if (count <= 0) return null;
  return cloneSlot({
    item,
    count,
    ...(Number.isFinite(candidate.durability) ? { durability: Number(candidate.durability) } : {}),
    ...(candidate.metadata && typeof candidate.metadata === "object" ? { metadata: candidate.metadata } : {}),
  });
}

export function createWheatMill(): WheatMillState {
  return { schema: WHEAT_MILL_SCHEMA, input: null, output: null, progressSeconds: 0 };
}

export function normalizeWheatMill(value: unknown): WheatMillState {
  if (!value || typeof value !== "object") return createWheatMill();
  const candidate = value as Partial<WheatMillState>;
  const input = normalizeSlot(candidate.input, Item.Wheat);
  const output = normalizeSlot(candidate.output, Item.Flour);
  const canPreserveProgress = Boolean(input) && (!output || output.count < WHEAT_MILL_STACK_CAP);
  return {
    schema: WHEAT_MILL_SCHEMA,
    input,
    output,
    progressSeconds: canPreserveProgress
      ? clamp(finite(candidate.progressSeconds), 0, WHEAT_MILL_CYCLE_SECONDS)
      : 0,
  };
}

export function insertWheatMillInput(state: WheatMillState, offered: InventorySlot | null) {
  const normalized = normalizeWheatMill(state);
  if (!offered || offered.item !== Item.Wheat || offered.count <= 0) {
    return { state: normalized, accepted: 0, remainder: cloneSlot(offered) } as const;
  }
  const room = WHEAT_MILL_STACK_CAP - (normalized.input?.count ?? 0);
  const accepted = Math.min(room, Math.max(0, Math.trunc(offered.count)));
  if (accepted <= 0) return { state: normalized, accepted: 0, remainder: cloneSlot(offered) } as const;
  const remaining = offered.count - accepted;
  return {
    state: {
      ...normalized,
      input: { item: Item.Wheat, count: (normalized.input?.count ?? 0) + accepted },
    },
    accepted,
    remainder: remaining > 0 ? cloneSlot({ ...offered, count: remaining }) : null,
  } as const;
}

/**
 * Advances the passive mill. Each completed cycle consumes exactly one Wheat
 * and produces exactly one Flour; blocked output never destroys input.
 */
export function stepWheatMill(state: WheatMillState, deltaSeconds: number): WheatMillState {
  const normalized = normalizeWheatMill(state);
  if (!normalized.input || (normalized.output && normalized.output.item !== Item.Flour)
    || (normalized.output?.count ?? 0) >= WHEAT_MILL_STACK_CAP) return normalized;

  const elapsed = normalized.progressSeconds + clamp(finite(deltaSeconds), 0, 86_400);
  const availableCycles = Math.floor(elapsed / WHEAT_MILL_CYCLE_SECONDS);
  if (availableCycles <= 0) return { ...normalized, progressSeconds: elapsed };

  const outputRoom = WHEAT_MILL_STACK_CAP - (normalized.output?.count ?? 0);
  const completed = Math.min(availableCycles, normalized.input.count, outputRoom);
  if (completed <= 0) return normalized;

  const inputRemaining = normalized.input.count - completed;
  const outputCount = (normalized.output?.count ?? 0) + completed;
  const canContinue = inputRemaining > 0 && outputCount < WHEAT_MILL_STACK_CAP;
  return {
    ...normalized,
    input: inputRemaining > 0 ? { ...normalized.input, count: inputRemaining } : null,
    output: { item: Item.Flour, count: outputCount },
    progressSeconds: canContinue ? elapsed - completed * WHEAT_MILL_CYCLE_SECONDS : 0,
  };
}

export function collectWheatMillOutput(state: WheatMillState, requested = WHEAT_MILL_STACK_CAP) {
  const normalized = normalizeWheatMill(state);
  if (!normalized.output) return { state: normalized, collected: null } as const;
  const count = clamp(Math.trunc(finite(requested, 1)), 1, normalized.output.count);
  const remaining = normalized.output.count - count;
  return {
    state: { ...normalized, output: remaining > 0 ? { ...normalized.output, count: remaining } : null },
    collected: { item: Item.Flour, count },
  } as const;
}

export function breakWheatMill(state: WheatMillState) {
  const normalized = normalizeWheatMill(state);
  return {
    state: createWheatMill(),
    drops: [cloneSlot(normalized.input), cloneSlot(normalized.output)].filter((slot): slot is InventorySlot => slot !== null),
  } as const;
}
