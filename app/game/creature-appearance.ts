import type { MobKind } from "./mobs";
import type { CreatureProgressionV2, CreatureRarityForm } from "./creature-progression";

/** Compact renderer contract: species code consumes one shape instead of branching on capture history. */
export type CreatureAppearance = Readonly<{
  kind: MobKind;
  sizeScale: number;
  hueShift: number;
  markingMask: number;
  markingIntensity: number;
  accentVariant: number;
  aptitudeIds: readonly string[];
  shiny: boolean;
  rarityForm: CreatureRarityForm;
  shimmer: "none" | "shiny" | "legendary";
}>;

export function creatureAppearance(kind: MobKind, progression: CreatureProgressionV2): CreatureAppearance {
  const phenotype = progression.phenotype;
  return Object.freeze({
    kind,
    sizeScale: Math.max(0.88, Math.min(1.12, phenotype.sizeScale)),
    hueShift: Math.max(-0.14, Math.min(0.14, phenotype.hueShift)),
    markingMask: Math.max(0, Math.min(15, Math.floor(phenotype.markingMask))),
    markingIntensity: Math.max(0, Math.min(1, phenotype.markingIntensity)),
    accentVariant: Math.max(0, Math.min(15, Math.floor(phenotype.accentVariant))),
    aptitudeIds: Object.freeze([...progression.aptitudes]),
    shiny: progression.shiny,
    rarityForm: progression.rarityForm,
    shimmer: progression.rarityForm === "legendary" ? "legendary" : progression.shiny ? "shiny" : "none",
  });
}

export function applyAppearanceHue(hex: number, appearance: CreatureAppearance, accent = false) {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  const shift = appearance.hueShift + (appearance.shiny ? (accent ? 0.16 : 0.08) : 0);
  const mix = Math.max(-0.22, Math.min(0.22, shift));
  const target = appearance.shiny ? (accent ? [245, 229, 164] : [191, 226, 232]) : mix >= 0 ? [182, 220, 194] : [190, 184, 220];
  const amount = Math.abs(mix);
  return ((Math.round(r + (target[0] - r) * amount) & 0xff) << 16)
    | ((Math.round(g + (target[1] - g) * amount) & 0xff) << 8)
    | (Math.round(b + (target[2] - b) * amount) & 0xff);
}
