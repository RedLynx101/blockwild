import type { SummonedCreatureKind } from "./mobs";

export type SummonRoleEvent = "destination-reached" | "meaningful-action-resolved" | "full-quiet-measure" | "still-water-rescue";

export type SummonContractDefinition = Readonly<{
  kind: SummonedCreatureKind;
  spellId: string;
  realm: string;
  durationSeconds: number;
  anchorEvent: SummonRoleEvent;
  concordanceRequired: number;
  habitat: string;
  groundedDisposition: string;
}>;

export const SUMMON_CONTRACTS: Readonly<Record<SummonedCreatureKind, SummonContractDefinition>> = Object.freeze({
  asterjaw: { kind: "asterjaw", spellId: "call-asterjaw", realm: "The Unwalked Meridian", durationSeconds: 75, anchorEvent: "destination-reached", concordanceRequired: 3, habitat: "A visible waypost and an open route", groundedDisposition: "Curious and restless; remains nearby but refuses ownership." },
  "vellum-warden": { kind: "vellum-warden", spellId: "fold-vellum-warden", realm: "The Palimpsest Expanse", durationSeconds: 90, anchorEvent: "meaningful-action-resolved", concordanceRequired: 3, habitat: "Displayed tomes, lecterns, and quiet archive space", groundedDisposition: "Defensive historian; requests a library through rearranged notes." },
  "choir-of-one": { kind: "choir-of-one", spellId: "invoke-choir-of-one", realm: "The Hush Between Bells", durationSeconds: 55, anchorEvent: "full-quiet-measure", concordanceRequired: 3, habitat: "A quiet chamber with timed lights", groundedDisposition: "Cautious and non-malicious; loud spaces cause alarm." },
  "glasswake-stag": { kind: "glasswake-stag", spellId: "open-glasswake", realm: "The Sea Behind Mirrors", durationSeconds: 65, anchorEvent: "still-water-rescue", concordanceRequired: 3, habitat: "Still water and an unobstructed reflected sky", groundedDisposition: "Gentle but free; returns to reflective water before accepting capture." },
});

export type SummonContractRecord = Readonly<{
  lineageId: string;
  phenotypeSeed: number;
  concordance: number;
  observations: readonly SummonRoleEvent[];
  anchorWindowUntil: number;
  groundedEntityId: string | null;
  groundingHistory: readonly string[];
}>;

export type SummonContractState = Readonly<{
  schema: 1;
  ownerId: string;
  records: Readonly<Partial<Record<SummonedCreatureKind, SummonContractRecord>>>;
  revision: number;
}>;

export type SummonManifestation = Readonly<{
  kind: SummonedCreatureKind;
  lineageId: string;
  phenotypeSeed: number;
  echo: boolean;
  expiresAt: number;
  capturable: false;
  lootEligible: false;
  breedable: false;
}>;

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}

function createRecord(ownerId: string, kind: SummonedCreatureKind): SummonContractRecord {
  const phenotypeSeed = hashText(`${ownerId}|${kind}|worldpin-lineage`);
  return Object.freeze({
    lineageId: `summon-lineage:${ownerId}:${kind}:${phenotypeSeed.toString(36)}`,
    phenotypeSeed, concordance: 0, observations: Object.freeze([]), anchorWindowUntil: 0,
    groundedEntityId: null, groundingHistory: Object.freeze([]),
  });
}

export function createSummonContractState(ownerId: string): SummonContractState {
  return Object.freeze({ schema: 1, ownerId: ownerId || "local", records: Object.freeze({}), revision: 0 });
}

export function normalizeSummonContractState(value: unknown, ownerId: string): SummonContractState {
  const raw = value && typeof value === "object" ? value as Partial<SummonContractState> : {};
  const records: Partial<Record<SummonedCreatureKind, SummonContractRecord>> = {};
  for (const kind of Object.keys(SUMMON_CONTRACTS) as SummonedCreatureKind[]) {
    const input = raw.records?.[kind];
    if (!input) continue;
    const fallback = createRecord(ownerId, kind);
    records[kind] = Object.freeze({
      lineageId: typeof input.lineageId === "string" ? input.lineageId.slice(0, 160) : fallback.lineageId,
      phenotypeSeed: Number(input.phenotypeSeed) >>> 0 || fallback.phenotypeSeed,
      concordance: Math.max(0, Math.min(100, Number(input.concordance) || 0)),
      observations: Object.freeze([...(input.observations ?? [])].filter((event): event is SummonRoleEvent => ["destination-reached", "meaningful-action-resolved", "full-quiet-measure", "still-water-rescue"].includes(event)).slice(-32)),
      anchorWindowUntil: Math.max(0, Number(input.anchorWindowUntil) || 0),
      groundedEntityId: typeof input.groundedEntityId === "string" ? input.groundedEntityId.slice(0, 160) : null,
      groundingHistory: Object.freeze([...(input.groundingHistory ?? [])].filter((entry): entry is string => typeof entry === "string").slice(-16)),
    });
  }
  return Object.freeze({ schema: 1, ownerId: ownerId || raw.ownerId || "local", records: Object.freeze(records), revision: Math.max(0, Math.floor(Number(raw.revision) || 0)) });
}

export function manifestSummon(state: SummonContractState, kind: SummonedCreatureKind, now: number) {
  const record = state.records[kind] ?? createRecord(state.ownerId, kind);
  const next = state.records[kind] ? state : Object.freeze({ ...state, records: Object.freeze({ ...state.records, [kind]: record }), revision: state.revision + 1 });
  return Object.freeze({
    state: next,
    manifestation: Object.freeze({ kind, lineageId: record.lineageId, phenotypeSeed: record.phenotypeSeed, echo: Boolean(record.groundedEntityId), expiresAt: Math.max(0, now) + SUMMON_CONTRACTS[kind].durationSeconds, capturable: false, lootEligible: false, breedable: false }) as SummonManifestation,
  });
}

export function observeSummonRole(state: SummonContractState, kind: SummonedCreatureKind, event: SummonRoleEvent, now: number) {
  const definition = SUMMON_CONTRACTS[kind];
  const record = state.records[kind] ?? createRecord(state.ownerId, kind);
  const observations = Object.freeze([...record.observations, event].slice(-32));
  const concordance = Math.min(100, record.concordance + (event === definition.anchorEvent ? 1 : .25));
  const anchorWindowUntil = event === definition.anchorEvent && concordance >= definition.concordanceRequired ? Math.max(record.anchorWindowUntil, now + 12) : record.anchorWindowUntil;
  const nextRecord = Object.freeze({ ...record, concordance, observations, anchorWindowUntil });
  return Object.freeze({ ...state, records: Object.freeze({ ...state.records, [kind]: nextRecord }), revision: state.revision + 1 });
}

export function groundSummon(state: SummonContractState, kind: SummonedCreatureKind, lineageId: string, permanentEntityId: string, now: number, echo: boolean) {
  const record = state.records[kind];
  if (!record || record.lineageId !== lineageId) return { ok: false as const, state, reason: "lineage-mismatch" as const };
  if (echo || record.groundedEntityId) return { ok: false as const, state, reason: "existing-grounded-individual" as const };
  if (record.concordance < SUMMON_CONTRACTS[kind].concordanceRequired) return { ok: false as const, state, reason: "concordance-incomplete" as const };
  if (record.anchorWindowUntil < now) return { ok: false as const, state, reason: "anchor-window-closed" as const };
  const grounded = Object.freeze({ ...record, groundedEntityId: permanentEntityId, anchorWindowUntil: 0, groundingHistory: Object.freeze([...record.groundingHistory, `${permanentEntityId}@${Math.floor(now)}`].slice(-16)) });
  return { ok: true as const, state: Object.freeze({ ...state, records: Object.freeze({ ...state.records, [kind]: grounded }), revision: state.revision + 1 }), reason: null };
}

/**
 * A grounded lineage is never made vacant again. Loss and resurrection are
 * history events on the same identity, while transfer atomically replaces the
 * custody reference. This prevents recasting an echo and grounding a duplicate
 * after the original is stored, moved between players, downed, or missing.
 */
export function transferGroundedSummonReference(state: SummonContractState, kind: SummonedCreatureKind, entityId: string, nextEntityId: string) {
  const record = state.records[kind];
  if (!record || record.groundedEntityId !== entityId || !nextEntityId.trim()) return state;
  const custodyId = nextEntityId.trim().slice(0, 160);
  const next = Object.freeze({ ...record, groundedEntityId: custodyId, groundingHistory: Object.freeze([...record.groundingHistory, `transferred:${entityId}->${custodyId}`].slice(-16)) });
  return Object.freeze({ ...state, records: Object.freeze({ ...state.records, [kind]: next }), revision: state.revision + 1 });
}

export function recordGroundedSummonLifeEvent(state: SummonContractState, kind: SummonedCreatureKind, entityId: string, reason: "lost" | "ritual-resurrection") {
  const record = state.records[kind];
  if (!record || record.groundedEntityId !== entityId) return state;
  const next = Object.freeze({ ...record, groundingHistory: Object.freeze([...record.groundingHistory, `${reason}:${entityId}`].slice(-16)) });
  return Object.freeze({ ...state, records: Object.freeze({ ...state.records, [kind]: next }), revision: state.revision + 1 });
}
