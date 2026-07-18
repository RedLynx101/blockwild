import { MOB_ORDER, type MobKind } from "./mobs";

export const LIVING_BESTIARY_SCHEMA_VERSION = 2 as const;

export type BestiaryResearchNode = Readonly<{
  id: string;
  title: string;
  progress: number;
  goal: number;
  unlockedAt: number | null;
}>;

export type BestiaryFormRecord = Readonly<{
  id: string;
  firstRecordedAt: number;
  sightings: number;
  category: "shiny" | "prime" | "regional" | "seasonal" | "story" | "legendary" | "summoned";
}>;

export type BestiaryAppendRecord = Readonly<{
  id: string;
  title: string;
  text: string;
  recordedAt: number;
  sourceId: string | null;
}>;

export type LivingBestiaryEntryV2 = {
  schemaVersion: typeof LIVING_BESTIARY_SCHEMA_VERSION;
  seen: boolean;
  kills: number;
  captures: number;
  tames: number;
  breeds: number;
  secretUnlocked: boolean;
  milestones: Readonly<Record<string, number>>;
  firstSeenAt: number | null;
  lastObservedAt: number | null;
  firstCapturedAt: number | null;
  research: Readonly<Record<string, BestiaryResearchNode>>;
  forms: Readonly<Record<string, BestiaryFormRecord>>;
  specimenIds: readonly string[];
  summonOrigins: readonly string[];
  guildLinks: readonly string[];
  /** Arbitrary append-only record sections keep complex creatures extensible. */
  sections: Readonly<Record<string, readonly BestiaryAppendRecord[]>>;
};

export type LegacyBestiaryEntry = Readonly<Partial<LivingBestiaryEntryV2 & {
  caught: boolean;
  caughtCount: number;
}>>;

const finiteCount = (value: unknown) => Number.isFinite(value) ? Math.max(0, Math.floor(Number(value))) : 0;
const boundedTextList = (value: unknown, maximum = 512) => Array.isArray(value)
  ? [...new Set(value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0 && entry.length <= 128))].slice(0, maximum)
  : [];

export function normalizeLivingBestiaryEntry(value?: LegacyBestiaryEntry | null): LivingBestiaryEntryV2 {
  const captures = Math.max(finiteCount(value?.captures), finiteCount(value?.caughtCount), value?.caught ? 1 : 0);
  return {
    schemaVersion: LIVING_BESTIARY_SCHEMA_VERSION,
    seen: Boolean(value?.seen),
    kills: finiteCount(value?.kills),
    captures,
    tames: finiteCount(value?.tames),
    breeds: finiteCount(value?.breeds),
    secretUnlocked: Boolean(value?.secretUnlocked),
    milestones: Object.freeze({ ...(value?.milestones ?? {}) }),
    firstSeenAt: Number.isFinite(value?.firstSeenAt) ? Number(value?.firstSeenAt) : null,
    lastObservedAt: Number.isFinite(value?.lastObservedAt) ? Number(value?.lastObservedAt) : null,
    firstCapturedAt: Number.isFinite(value?.firstCapturedAt) ? Number(value?.firstCapturedAt) : null,
    research: Object.freeze({ ...(value?.research ?? {}) }),
    forms: Object.freeze({ ...(value?.forms ?? {}) }),
    specimenIds: Object.freeze(boundedTextList(value?.specimenIds)),
    summonOrigins: Object.freeze(boundedTextList(value?.summonOrigins)),
    guildLinks: Object.freeze(boundedTextList(value?.guildLinks)),
    sections: Object.freeze(Object.fromEntries(Object.entries(value?.sections ?? {}).map(([section, records]) => [section, Object.freeze([...(records ?? [])])]))),
  };
}

export function createLivingBestiary(source?: Partial<Record<MobKind, LegacyBestiaryEntry>>) {
  return Object.fromEntries(MOB_ORDER.map((kind) => [kind, normalizeLivingBestiaryEntry(source?.[kind])])) as Record<MobKind, LivingBestiaryEntryV2>;
}

export function appendBestiaryRecord(entry: LivingBestiaryEntryV2, section: string, record: BestiaryAppendRecord) {
  const key = section.trim().toLocaleLowerCase().replace(/[^a-z0-9-]+/gu, "-").slice(0, 64) || "notes";
  const existing = entry.sections[key] ?? [];
  if (existing.some((candidate) => candidate.id === record.id)) return entry;
  return normalizeLivingBestiaryEntry({ ...entry, sections: { ...entry.sections, [key]: [...existing, Object.freeze({ ...record })] } });
}

export function advanceBestiaryResearch(entry: LivingBestiaryEntryV2, node: Omit<BestiaryResearchNode, "progress" | "unlockedAt">, delta: number, now: number) {
  const existing = entry.research[node.id];
  const progress = Math.min(node.goal, Math.max(existing?.progress ?? 0, 0) + Math.max(0, delta));
  const next: BestiaryResearchNode = Object.freeze({ ...node, progress, unlockedAt: progress >= node.goal ? existing?.unlockedAt ?? now : null });
  return normalizeLivingBestiaryEntry({ ...entry, research: { ...entry.research, [node.id]: next } });
}

export function recordBestiaryForm(entry: LivingBestiaryEntryV2, form: Omit<BestiaryFormRecord, "sightings">) {
  const existing = entry.forms[form.id];
  return normalizeLivingBestiaryEntry({
    ...entry,
    forms: { ...entry.forms, [form.id]: Object.freeze({ ...form, firstRecordedAt: existing?.firstRecordedAt ?? form.firstRecordedAt, sightings: (existing?.sightings ?? 0) + 1 }) },
  });
}

export function observeBestiaryEntry(entry: LivingBestiaryEntryV2, now: number) {
  entry.seen = true;
  entry.firstSeenAt ??= now;
  entry.lastObservedAt = Math.max(entry.lastObservedAt ?? 0, now);
  return entry;
}

export function recordSpeciesCapture(entry: LivingBestiaryEntryV2, now: number, specimenId?: string | null) {
  observeBestiaryEntry(entry, now);
  entry.captures += 1;
  entry.firstCapturedAt ??= now;
  if (specimenId && !entry.specimenIds.includes(specimenId)) entry.specimenIds = Object.freeze([...entry.specimenIds, specimenId].slice(-512));
  return entry;
}
