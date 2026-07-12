export const STATUS_EFFECTS_SCHEMA = 1 as const;
export const MAX_ACTIVE_STATUS_EFFECTS = 32;

export type StatusEffectKind =
  | "poison"
  | "burning"
  | "regeneration"
  | "ward"
  | "speed"
  | "slow"
  | "water-breathing"
  | "luck"
  | "bartering"
  | "vulnerability"
  | "custom";

export type EffectSourceKind = "potion" | "spell" | "trait" | "food" | "equipment" | "environment";
export type StatusStackRule = "replace" | "extend" | "strongest";

export type StatusEffect = Readonly<{
  id: string;
  kind: StatusEffectKind;
  name: string;
  description: string;
  source: Readonly<{ kind: EffectSourceKind; id: string }>;
  magnitude: number;
  harmful: boolean;
  startedAt: number;
  expiresAt: number | null;
  tickEverySeconds: number | null;
  nextTickAt: number | null;
  stackRule: StatusStackRule;
}>;

export type PassiveTrait = Readonly<{
  id: string;
  name: string;
  description: string;
  source: Readonly<{ kind: Extract<EffectSourceKind, "trait" | "equipment" | "food">; id: string }>;
  enabled: boolean;
}>;

export type StatusEffectState = Readonly<{
  schema: typeof STATUS_EFFECTS_SCHEMA;
  revision: number;
  effects: readonly StatusEffect[];
}>;

export type StatusEffectView = Readonly<{
  id: string;
  kind: StatusEffectKind;
  name: string;
  description: string;
  harmful: boolean;
  remainingSeconds: number | null;
  magnitude: number;
}>;

const finite = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const cleanText = (value: unknown, fallback: string, maximum: number) => {
  const cleaned = typeof value === "string" ? value.trim().replace(/\s+/gu, " ").slice(0, maximum) : "";
  return cleaned || fallback;
};

const STATUS_KINDS = new Set<StatusEffectKind>([
  "poison", "burning", "regeneration", "ward", "speed", "slow", "water-breathing", "luck", "bartering", "vulnerability", "custom",
]);
const SOURCE_KINDS = new Set<EffectSourceKind>(["potion", "spell", "trait", "food", "equipment", "environment"]);
const STACK_RULES = new Set<StatusStackRule>(["replace", "extend", "strongest"]);

export function createStatusEffectState(): StatusEffectState {
  return { schema: STATUS_EFFECTS_SCHEMA, revision: 0, effects: [] };
}

function normalizeEffect(value: unknown): StatusEffect | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<StatusEffect>;
  const id = cleanText(input.id, "", 96).replace(/[^a-zA-Z0-9:_-]+/gu, "-");
  if (!id) return null;
  const kind = STATUS_KINDS.has(input.kind as StatusEffectKind) ? input.kind as StatusEffectKind : "custom";
  const sourceInput = input.source && typeof input.source === "object" ? input.source : { kind: "environment", id: "unknown" };
  const sourceKind = SOURCE_KINDS.has(sourceInput.kind as EffectSourceKind) ? sourceInput.kind as EffectSourceKind : "environment";
  const startedAt = Math.max(0, finite(input.startedAt));
  const expiresAt = input.expiresAt === null ? null : Math.max(startedAt, finite(input.expiresAt, startedAt));
  const tickEverySeconds = input.tickEverySeconds === null || input.tickEverySeconds === undefined
    ? null
    : clamp(finite(input.tickEverySeconds), 0.1, 3_600);
  const nextTickAt = tickEverySeconds === null
    ? null
    : Math.max(startedAt, finite(input.nextTickAt, startedAt + tickEverySeconds));
  return {
    id,
    kind,
    name: cleanText(input.name, kind.replaceAll("-", " "), 48),
    description: cleanText(input.description, "A temporary effect is active.", 180),
    source: { kind: sourceKind, id: cleanText(sourceInput.id, "unknown", 96) },
    magnitude: clamp(finite(input.magnitude, 1), 0, 1_000_000),
    harmful: input.harmful === true,
    startedAt,
    expiresAt,
    tickEverySeconds,
    nextTickAt,
    stackRule: STACK_RULES.has(input.stackRule as StatusStackRule) ? input.stackRule as StatusStackRule : "replace",
  };
}

export function normalizeStatusEffectState(value: unknown): StatusEffectState {
  if (!value || typeof value !== "object") return createStatusEffectState();
  const input = value as Partial<StatusEffectState>;
  const byId = new Map<string, StatusEffect>();
  for (const raw of Array.isArray(input.effects) ? input.effects.slice(0, MAX_ACTIVE_STATUS_EFFECTS * 2) : []) {
    const effect = normalizeEffect(raw);
    if (effect) byId.set(effect.id, effect);
  }
  return {
    schema: STATUS_EFFECTS_SCHEMA,
    revision: Math.max(0, Math.trunc(finite(input.revision))),
    effects: [...byId.values()].sort((left, right) => left.id.localeCompare(right.id)).slice(0, MAX_ACTIVE_STATUS_EFFECTS),
  };
}

export function applyStatusEffect(state: StatusEffectState, rawEffect: StatusEffect) {
  const normalized = normalizeStatusEffectState(state);
  const effect = normalizeEffect(rawEffect);
  if (!effect) return normalized;
  const previous = normalized.effects.find((entry) => entry.id === effect.id);
  let next = effect;
  if (previous && effect.stackRule === "extend") {
    const duration = effect.expiresAt === null ? null : Math.max(0, effect.expiresAt - effect.startedAt);
    next = { ...effect, expiresAt: duration === null || previous.expiresAt === null ? null : previous.expiresAt + duration };
  } else if (previous && effect.stackRule === "strongest" && previous.magnitude > effect.magnitude) {
    next = { ...previous, expiresAt: previous.expiresAt === null || effect.expiresAt === null ? null : Math.max(previous.expiresAt, effect.expiresAt) };
  }
  const effects = [...normalized.effects.filter((entry) => entry.id !== next.id), next]
    .sort((left, right) => left.id.localeCompare(right.id))
    .slice(0, MAX_ACTIVE_STATUS_EFFECTS);
  return { ...normalized, revision: normalized.revision + 1, effects };
}

export function removeStatusEffect(state: StatusEffectState, effectId: string) {
  const normalized = normalizeStatusEffectState(state);
  const effects = normalized.effects.filter((effect) => effect.id !== effectId);
  return effects.length === normalized.effects.length ? normalized : { ...normalized, revision: normalized.revision + 1, effects };
}

/** Advances bounded periodic effects and returns aggregate health deltas for the engine to own. */
export function advanceStatusEffects(state: StatusEffectState, nowSeconds: number) {
  const normalized = normalizeStatusEffectState(state);
  const now = Math.max(0, finite(nowSeconds));
  let damage = 0;
  let healing = 0;
  let changed = false;
  const effects: StatusEffect[] = [];
  for (const effect of normalized.effects) {
    if (effect.expiresAt !== null && effect.expiresAt <= now) {
      changed = true;
      continue;
    }
    if (effect.tickEverySeconds === null || effect.nextTickAt === null || effect.nextTickAt > now) {
      effects.push(effect);
      continue;
    }
    const tickCount = Math.min(32, Math.floor((now - effect.nextTickAt) / effect.tickEverySeconds) + 1);
    const amount = effect.magnitude * tickCount;
    if (effect.kind === "poison" || effect.kind === "burning") damage += amount;
    if (effect.kind === "regeneration") healing += amount;
    effects.push({ ...effect, nextTickAt: effect.nextTickAt + tickCount * effect.tickEverySeconds });
    changed = true;
  }
  return {
    state: changed ? { ...normalized, revision: normalized.revision + 1, effects } : normalized,
    damage,
    healing,
  };
}

const BUFF_PRESENTATION: Readonly<Record<string, Omit<StatusEffectView, "id" | "remainingSeconds">>> = Object.freeze({
  tidebreath: { kind: "water-breathing", name: "Tidebreath", description: "Breathing remains steady beneath water.", harmful: false, magnitude: 1 },
  "peppermint-rush": { kind: "speed", name: "Peppermint Rush", description: "Movement is quickened by sharp sugarcraft.", harmful: false, magnitude: 1 },
  gloamstep: { kind: "speed", name: "Gloamstep", description: "Movement is quieter and quicker in shadow.", harmful: false, magnitude: 1 },
  "marshmallow-ward": { kind: "ward", name: "Marshmallow Ward", description: "A soft sugar ward reduces incoming damage.", harmful: false, magnitude: 1 },
  "arcane-ward": { kind: "ward", name: "Arcane Ward", description: "Spellwork cushions incoming damage.", harmful: false, magnitude: 1 },
  "dragon-burning": { kind: "burning", name: "Dragonfire", description: "Dragonfire continues to burn.", harmful: true, magnitude: 1 },
  "venom-poison": { kind: "poison", name: "Venom", description: "A sting or deep-water bite is steadily draining health.", harmful: true, magnitude: 1 },
  "dragon-scalded": { kind: "vulnerability", name: "Scalded", description: "Steam has left armor and skin vulnerable.", harmful: true, magnitude: 1 },
  "dragon-slowed": { kind: "slow", name: "Rimebound", description: "Dragon frost slows movement.", harmful: true, magnitude: 1 },
});

/** Adapts the engine's existing absolute-expiry buff record into one HUD contract. */
export function statusEffectViewsFromBuffs(buffExpiresAt: Readonly<Record<string, number>>, nowSeconds: number): StatusEffectView[] {
  const now = Math.max(0, finite(nowSeconds));
  return Object.entries(buffExpiresAt)
    .flatMap(([id, expiresAt]) => {
      const remainingSeconds = finite(expiresAt) - now;
      if (remainingSeconds <= 0) return [];
      const presentation = BUFF_PRESENTATION[id] ?? {
        kind: "custom" as const,
        name: id.replaceAll("-", " ").replace(/\b\w/gu, (letter) => letter.toUpperCase()),
        description: "A temporary effect is active.",
        harmful: false,
        magnitude: 1,
      };
      return [{ id, ...presentation, remainingSeconds }];
    })
    .sort((left, right) => Number(right.harmful) - Number(left.harmful) || left.remainingSeconds - right.remainingSeconds)
    .slice(0, 8);
}
