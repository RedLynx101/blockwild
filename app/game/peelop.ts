export type PeelopCommand = "wander" | "follow" | "sit" | "stay";
export type PeelopFood = "banana" | "berry" | "apple" | "wheat";

export type PeelopState = {
  schema: 1;
  tamed: boolean;
  ownerId: string | null;
  name: string | null;
  command: PeelopCommand;
  health: number;
  maxHealth: 7;
  hunger: number;
  ageTicks: number;
  baby: boolean;
  loveCooldownTicks: number;
  geneticSeed: number;
};

export function createPeelopState(geneticSeed: number, baby = false): PeelopState {
  return {
    schema: 1, tamed: false, ownerId: null, name: null, command: "wander",
    health: 7, maxHealth: 7, hunger: 20, ageTicks: baby ? 0 : 24_000,
    baby, loveCooldownTicks: 0, geneticSeed: geneticSeed >>> 0,
  };
}

export function tryTamePeelop(state: PeelopState, ownerId: string, food: PeelopFood, roll: number): { state: PeelopState; tamed: boolean } {
  if (state.tamed) return { state: { ...state }, tamed: state.ownerId === ownerId };
  // Their namesake food is the reliable choice; common forage still works in a pinch.
  const chance = food === "banana" ? 0.86 : food === "apple" ? 0.64 : food === "berry" ? 0.4 : 0.2;
  if (roll >= chance) return { state: { ...state, hunger: Math.min(20, state.hunger + 2) }, tamed: false };
  return { state: { ...state, tamed: true, ownerId, command: "follow", hunger: 20 }, tamed: true };
}

export function feedPeelop(state: PeelopState, food: PeelopFood) {
  const nutrition = food === "banana" ? 7 : food === "apple" ? 5 : food === "berry" ? 3 : 2;
  const healing = food === "banana" ? 4 : food === "apple" ? 3 : food === "berry" ? 2 : 1;
  return { ...state, hunger: Math.min(20, state.hunger + nutrition), health: Math.min(state.maxHealth, state.health + healing) };
}

export function renamePeelop(state: PeelopState, name: string) {
  const cleaned = name.trim().replace(/\s+/gu, " ").slice(0, 24);
  return { ...state, name: cleaned || null };
}

export function commandPeelop(state: PeelopState, ownerId: string, command: PeelopCommand) {
  if (!state.tamed || state.ownerId !== ownerId) return state;
  return { ...state, command };
}

export function tickPeelop(state: PeelopState, ticks: number) {
  const elapsed = Math.max(0, Math.floor(ticks));
  const ageTicks = state.ageTicks + elapsed;
  return {
    ...state,
    ageTicks,
    baby: ageTicks < 24_000,
    loveCooldownTicks: Math.max(0, state.loveCooldownTicks - elapsed),
    hunger: Math.max(0, state.hunger - elapsed / 12_000),
  };
}

export function canBreedPeelops(left: PeelopState, right: PeelopState) {
  return left.tamed && right.tamed && !left.baby && !right.baby
    && left.health >= 5 && right.health >= 5 && left.hunger >= 14 && right.hunger >= 14
    && left.loveCooldownTicks <= 0 && right.loveCooldownTicks <= 0;
}

function mixSeed(left: number, right: number) {
  let value = (left ^ ((right << 13) | (right >>> 19)) ^ 0x9e3779b9) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad) >>> 0;
  return (value ^ (value >>> 15)) >>> 0;
}

export function breedPeelops(left: PeelopState, right: PeelopState, ownerId = left.ownerId ?? right.ownerId) {
  if (!canBreedPeelops(left, right)) return null;
  const child = createPeelopState(mixSeed(left.geneticSeed, right.geneticSeed), true);
  child.tamed = Boolean(ownerId);
  child.ownerId = ownerId;
  child.command = ownerId ? "follow" : "wander";
  return {
    child,
    left: { ...left, loveCooldownTicks: 12_000, hunger: left.hunger - 4 },
    right: { ...right, loveCooldownTicks: 12_000, hunger: right.hunger - 4 },
  };
}

export function serializePeelop(state: PeelopState) {
  return JSON.stringify(state);
}

export function deserializePeelop(value: string): PeelopState | null {
  try {
    const parsed = JSON.parse(value) as Partial<PeelopState>;
    if (parsed.schema !== 1 || typeof parsed.geneticSeed !== "number" || typeof parsed.tamed !== "boolean") return null;
    if (typeof parsed.health !== "number" || typeof parsed.ageTicks !== "number") return null;
    if (!(["wander", "follow", "sit", "stay"] as const).includes(parsed.command as PeelopCommand)) return null;
    return {
      ...createPeelopState(parsed.geneticSeed),
      ...parsed,
      maxHealth: 7,
      health: Math.max(0, Math.min(7, parsed.health)),
      hunger: Math.max(0, Math.min(20, parsed.hunger ?? 20)),
    } as PeelopState;
  } catch {
    return null;
  }
}
