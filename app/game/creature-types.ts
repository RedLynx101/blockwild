/** Universal, append-only creature and effect identities. Save files store ids. */
export const CREATURE_TYPE_IDS = Object.freeze([
  "neutral", "wild", "verdant", "sky", "tide", "stone", "flame", "frost", "storm", "metal", "venom",
  "radiant", "umbral", "spirit", "arcane", "draconic", "confection", "echo", "dream", "hush", "mirror",
] as const);

export type CreatureTypeId = (typeof CREATURE_TYPE_IDS)[number];

export type CreatureTypeDefinition = Readonly<{
  id: CreatureTypeId;
  name: string;
  glyph: string;
  color: string;
  description: string;
  exotic?: boolean;
}>;

export const CREATURE_TYPES: Readonly<Record<CreatureTypeId, CreatureTypeDefinition>> = Object.freeze({
  neutral: { id: "neutral", name: "Neutral", glyph: "◇", color: "#d8d5c7", description: "Ordinary impacts, tools, and unaligned techniques." },
  wild: { id: "wild", name: "Wild", glyph: "爪", color: "#c99761", description: "Flesh, instinct, fur, predation, and herd vitality." },
  verdant: { id: "verdant", name: "Verdant", glyph: "❧", color: "#68bd67", description: "Plants, fungi, roots, pollen, and restorative growth." },
  sky: { id: "sky", name: "Sky", glyph: "⌁", color: "#8bcbe0", description: "Flight, wind, altitude, feathers, and pressure." },
  tide: { id: "tide", name: "Tide", glyph: "≈", color: "#4fa9d5", description: "Water, currents, rain, brine, and fluid motion." },
  stone: { id: "stone", name: "Stone", glyph: "⬟", color: "#9b8b73", description: "Earth, crystal, shell, fossils, and geological endurance." },
  flame: { id: "flame", name: "Flame", glyph: "♨", color: "#e56e43", description: "Fire, heat, combustion, kiln life, and ash." },
  frost: { id: "frost", name: "Frost", glyph: "✣", color: "#a9e5ef", description: "Cold, snow, ice, preservation, and winter adaptation." },
  storm: { id: "storm", name: "Storm", glyph: "ϟ", color: "#d9c958", description: "Lightning, thunder, charge, and violent weather." },
  metal: { id: "metal", name: "Metal", glyph: "⚙", color: "#9aa6aa", description: "Forged material, ore, mechanisms, armor, and golems." },
  venom: { id: "venom", name: "Venom", glyph: "⌇", color: "#a37ac7", description: "Poison, acid, irritant spores, and predatory chemistry." },
  radiant: { id: "radiant", name: "Radiant", glyph: "✺", color: "#f1d77b", description: "Sunlight, healing brilliance, clarity, and protection." },
  umbral: { id: "umbral", name: "Umbral", glyph: "◐", color: "#6b668e", description: "Darkness, concealment, decay, fear, and curses." },
  spirit: { id: "spirit", name: "Spirit", glyph: "♧", color: "#c6b8e8", description: "Souls, memory, ancestors, haunting, and animating presence." },
  arcane: { id: "arcane", name: "Arcane", glyph: "✦", color: "#ae86df", description: "Runes, alteration, enchantment, and structured magical law." },
  draconic: { id: "draconic", name: "Draconic", glyph: "♜", color: "#d38c64", description: "Dragon lineage, breath sovereignty, and ancient authority." },
  confection: { id: "confection", name: "Confection", glyph: "✿", color: "#ef91b9", description: "Living sweets, syrup bodies, crystallized flavor, and candy craft." },
  echo: { id: "echo", name: "Echo", glyph: ")))", color: "#80d2c3", description: "Sound, resonance, echolocation, music, and remembered calls." },
  dream: { id: "dream", name: "Dream", glyph: "☾", color: "#aaa0ef", description: "Illusion, sleep, emotion, imagination, and half-real stories." },
  hush: { id: "hush", name: "Hush", glyph: "∅", color: "#707583", description: "The suppressive absence native to the Hush Between Bells.", exotic: true },
  mirror: { id: "mirror", name: "Mirror", glyph: "◇◇", color: "#9bd7d8", description: "Reflection, reversal, copied light, and remembered surfaces.", exotic: true },
});

export type TypeChartEntry = Readonly<{
  strongAgainst: readonly CreatureTypeId[];
  resistedBy: readonly CreatureTypeId[];
}>;

const entry = (strongAgainst: readonly CreatureTypeId[], resistedBy: readonly CreatureTypeId[]): TypeChartEntry => Object.freeze({ strongAgainst: Object.freeze([...strongAgainst]), resistedBy: Object.freeze([...resistedBy]) });

/** Attacker-facing chart. Unlisted relationships are neutral. */
export const CREATURE_TYPE_CHART: Readonly<Record<CreatureTypeId, TypeChartEntry>> = Object.freeze({
  neutral: entry([], ["stone", "metal", "spirit"]),
  wild: entry(["dream", "arcane"], ["metal", "venom", "draconic"]),
  verdant: entry(["tide", "stone"], ["flame", "frost", "sky", "venom"]),
  sky: entry(["verdant", "wild"], ["storm", "stone", "frost"]),
  tide: entry(["flame", "stone", "metal"], ["verdant", "frost", "storm"]),
  stone: entry(["flame", "sky", "storm"], ["tide", "verdant", "metal"]),
  flame: entry(["verdant", "frost", "confection"], ["tide", "stone", "draconic"]),
  frost: entry(["sky", "verdant", "draconic"], ["flame", "metal", "tide"]),
  storm: entry(["tide", "sky", "metal"], ["stone", "verdant", "draconic"]),
  metal: entry(["stone", "frost", "confection"], ["flame", "tide", "storm", "arcane"]),
  venom: entry(["wild", "verdant", "confection"], ["stone", "metal", "spirit"]),
  radiant: entry(["umbral", "spirit", "venom"], ["metal", "dream", "arcane", "mirror"]),
  umbral: entry(["arcane", "dream", "spirit"], ["radiant", "flame", "confection"]),
  spirit: entry(["wild", "draconic", "metal"], ["radiant", "umbral", "echo", "hush"]),
  arcane: entry(["spirit", "metal", "draconic"], ["wild", "umbral", "dream", "mirror"]),
  draconic: entry(["wild", "sky", "arcane"], ["frost", "spirit", "draconic"]),
  confection: entry(["umbral", "spirit", "dream"], ["flame", "venom", "metal"]),
  echo: entry(["spirit", "dream", "sky", "hush"], ["stone", "tide", "metal"]),
  dream: entry(["wild", "draconic", "arcane"], ["radiant", "umbral", "echo", "hush"]),
  hush: entry(["echo", "spirit", "dream"], ["wild", "storm", "radiant"]),
  mirror: entry(["radiant", "arcane", "storm"], ["umbral", "echo", "stone"]),
});

export const EFFECTIVENESS_MULTIPLIERS = Object.freeze({
  "-3": 0.4, "-2": 0.6, "-1": 0.8, "0": 1, "1": 1.25, "2": 1.55, "3": 1.9,
} as const);

export type EffectivenessStep = -3 | -2 | -1 | 0 | 1 | 2 | 3;

export function clampEffectivenessStep(value: number): EffectivenessStep {
  return Math.max(-3, Math.min(3, Math.trunc(value))) as EffectivenessStep;
}

export type CreatureTypeSourceKind = "form" | "equipment" | "environment" | "status" | "move";
export type CreatureTypeSource = Readonly<{
  id: string;
  kind: CreatureTypeSourceKind;
  types?: readonly CreatureTypeId[];
  removeTypes?: readonly CreatureTypeId[];
  replace?: boolean;
  expiresAtSeconds?: number;
  label?: string;
}>;

const TYPE_SOURCE_PRIORITY: Readonly<Record<CreatureTypeSourceKind, number>> = Object.freeze({
  form: 1, equipment: 2, environment: 3, status: 4, move: 5,
});

export type ResolvedCreatureTypes = Readonly<{
  types: readonly CreatureTypeId[];
  sources: readonly Readonly<{ type: CreatureTypeId; sourceId: string; sourceKind: "natural" | CreatureTypeSourceKind; label: string }>[];
  revisionKey: string;
}>;

export function resolveCreatureTypes(
  naturalTypes: readonly CreatureTypeId[],
  dynamicSources: readonly CreatureTypeSource[] = [],
  nowSeconds = 0,
): ResolvedCreatureTypes {
  const types = new Set<CreatureTypeId>();
  const origins = new Map<CreatureTypeId, { sourceId: string; sourceKind: "natural" | CreatureTypeSourceKind; label: string }>();
  for (const type of naturalTypes) {
    types.add(type);
    origins.set(type, { sourceId: "natural", sourceKind: "natural", label: "Natural type" });
  }
  const sources = dynamicSources
    .filter((source) => source.expiresAtSeconds === undefined || source.expiresAtSeconds > nowSeconds)
    .slice()
    .sort((left, right) => TYPE_SOURCE_PRIORITY[left.kind] - TYPE_SOURCE_PRIORITY[right.kind] || left.id.localeCompare(right.id));
  for (const source of sources) {
    if (source.replace) {
      types.clear();
      origins.clear();
    }
    for (const removed of source.removeTypes ?? []) {
      types.delete(removed);
      origins.delete(removed);
    }
    for (const type of source.types ?? []) {
      types.add(type);
      origins.set(type, { sourceId: source.id, sourceKind: source.kind, label: source.label ?? source.id });
    }
  }
  const resolved = CREATURE_TYPE_IDS.filter((type) => types.has(type));
  return Object.freeze({
    types: Object.freeze(resolved),
    sources: Object.freeze(resolved.map((type) => Object.freeze({ type, ...(origins.get(type) ?? { sourceId: "unknown", sourceKind: "natural" as const, label: "Unknown" }) }))),
    revisionKey: resolved.map((type) => `${type}:${origins.get(type)?.sourceId ?? "unknown"}`).join("|"),
  });
}

export type EffectivenessResult = Readonly<{
  attackType: CreatureTypeId;
  steps: EffectivenessStep;
  multiplier: number;
  strongMatches: readonly CreatureTypeId[];
  resistedMatches: readonly CreatureTypeId[];
  label: "Deeply resisted" | "Resisted" | "Slightly resisted" | "Normal" | "Effective" | "Very effective" | "Overwhelming affinity";
}>;

const EFFECTIVENESS_LABELS: Readonly<Record<EffectivenessStep, EffectivenessResult["label"]>> = Object.freeze({
  [-3]: "Deeply resisted", [-2]: "Resisted", [-1]: "Slightly resisted", 0: "Normal", 1: "Effective", 2: "Very effective", 3: "Overwhelming affinity",
});

export function resolveTypeEffectiveness(
  attackType: CreatureTypeId,
  defenderTypes: readonly CreatureTypeId[],
  modifierSteps = 0,
): EffectivenessResult {
  const chart = CREATURE_TYPE_CHART[attackType];
  const uniqueDefenders = [...new Set(defenderTypes)];
  const strongMatches = uniqueDefenders.filter((type) => chart.strongAgainst.includes(type));
  const resistedMatches = uniqueDefenders.filter((type) => chart.resistedBy.includes(type));
  const steps = clampEffectivenessStep(strongMatches.length - resistedMatches.length + modifierSteps);
  return Object.freeze({
    attackType,
    steps,
    multiplier: EFFECTIVENESS_MULTIPLIERS[String(steps) as keyof typeof EFFECTIVENESS_MULTIPLIERS],
    strongMatches: Object.freeze(strongMatches),
    resistedMatches: Object.freeze(resistedMatches),
    label: EFFECTIVENESS_LABELS[steps],
  });
}

export type TypedEffectPacket = Readonly<{ type: CreatureTypeId; share: number; modifierSteps?: number }>;

export function resolveTypedPackets(
  rawAmount: number,
  packets: readonly TypedEffectPacket[],
  attackerTypes: readonly CreatureTypeId[],
  defenderTypes: readonly CreatureTypeId[],
) {
  const validPackets = packets.filter((packet) => Number.isFinite(packet.share) && packet.share > 0);
  const totalShare = validPackets.reduce((sum, packet) => sum + packet.share, 0) || 1;
  const results = validPackets.map((packet) => {
    const effectiveness = resolveTypeEffectiveness(packet.type, defenderTypes, packet.modifierSteps ?? 0);
    const affinity = attackerTypes.includes(packet.type) ? 1.1 : 1;
    const amount = Math.max(0, rawAmount) * (packet.share / totalShare) * affinity * effectiveness.multiplier;
    return Object.freeze({ packet, effectiveness, affinity, amount });
  });
  return Object.freeze({ amount: results.reduce((sum, result) => sum + result.amount, 0), packets: Object.freeze(results) });
}

export function validateCreatureTypeRegistry() {
  const errors: string[] = [];
  const ids = new Set(CREATURE_TYPE_IDS);
  if (ids.size !== CREATURE_TYPE_IDS.length) errors.push("Creature type ids must be unique.");
  for (const id of CREATURE_TYPE_IDS) {
    if (!CREATURE_TYPES[id] || CREATURE_TYPES[id].id !== id) errors.push(`Missing definition for ${id}.`);
    const chart = CREATURE_TYPE_CHART[id];
    if (!chart) { errors.push(`Missing chart row for ${id}.`); continue; }
    for (const target of [...chart.strongAgainst, ...chart.resistedBy]) if (!ids.has(target)) errors.push(`${id} references unknown type ${target}.`);
    for (const target of chart.strongAgainst) if (chart.resistedBy.includes(target)) errors.push(`${id} is both strong and resisted against ${target}.`);
    if (new Set(chart.strongAgainst).size !== chart.strongAgainst.length || new Set(chart.resistedBy).size !== chart.resistedBy.length) errors.push(`${id} chart row contains duplicates.`);
  }
  return Object.freeze(errors);
}
