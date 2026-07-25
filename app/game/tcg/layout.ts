import { CREATURE_TYPES } from "../creature-types";
import { TCG_CATALOG, TCG_SETS } from "./catalog";
import type { TcgCardDefinition, TcgCatalog, TcgPrinting } from "./types";

export const TCG_CARD_LAYOUT_VERSION = 2;
export const TCG_CARD_WIDTH = 744;
export const TCG_CARD_HEIGHT = 1_040;

export type TcgCardLayout = Readonly<{
  version: 2;
  width: number;
  height: number;
  title: Readonly<{ text: string; x: number; y: number; width: number; fontSize: number }>;
  cost: Readonly<{ text: string; x: number; y: number }>;
  illustration: Readonly<{ key: string; x: number; y: number; width: number; height: number }>;
  typeLine: Readonly<{ text: string; x: number; y: number; width: number; fontSize: number }>;
  rules: Readonly<{ lines: readonly string[]; x: number; y: number; width: number; fontSize: number; lineHeight: number }>;
  flavor: Readonly<{ lines: readonly string[]; x: number; y: number; width: number; fontSize: number; lineHeight: number }>;
  stats: Readonly<{ power?: number; guard?: number }>;
  footer: Readonly<{ set: string; collectorNumber: string; rarity: string; printing: string }>;
  overflow: readonly string[];
}>;

const escapeXml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll("\"", "&quot;")
  .replaceAll("'", "&apos;");

function wrapText(value: string, charactersPerLine: number, maximumLines: number) {
  const words = value.trim().split(/\s+/u).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= charactersPerLine || !current) current = candidate;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return Object.freeze({
    lines: Object.freeze(lines.slice(0, maximumLines)),
    overflow: lines.length > maximumLines,
  });
}

function boundedFont(value: string, maximum: number, sizes: readonly [number, number, number]) {
  if (value.length <= maximum * 0.72) return sizes[0];
  if (value.length <= maximum) return sizes[1];
  return sizes[2];
}

export function cardRulesText(definition: TcgCardDefinition) {
  const keywords = definition.keywords.map((keyword) => keyword[0].toUpperCase() + keyword.slice(1)).join(" • ");
  const abilities = definition.abilities.map((ability) => ability.text).join(" ");
  return [keywords, abilities].filter(Boolean).join("\n");
}

export function layoutTcgCard(definition: TcgCardDefinition, printing: TcgPrinting): TcgCardLayout {
  const overflow: string[] = [];
  const titleFont = boundedFont(definition.name, 30, [42, 36, 31]);
  if (definition.name.length > 42) overflow.push("title");
  const typeNames = [definition.primaryType, ...definition.secondaryTypes]
    .map((type) => type ? CREATURE_TYPES[type]?.name ?? type : "")
    .filter(Boolean);
  const typeText = [definition.class, ...typeNames, ...definition.traits.slice(0, 2)]
    .map((value) => value.replaceAll("-", " "))
    .join(" • ");
  const rulesRaw = cardRulesText(definition);
  const rulesFont = boundedFont(rulesRaw, 180, [30, 27, 24]);
  const rules = wrapText(rulesRaw, rulesFont >= 30 ? 38 : rulesFont >= 27 ? 43 : 48, 7);
  if (rules.overflow) overflow.push("rules");
  const flavorRaw = definition.flavorText ?? "";
  const flavorFont = boundedFont(flavorRaw, 280, [21, 17, 14]);
  const flavor = wrapText(flavorRaw, flavorFont >= 21 ? 54 : flavorFont >= 17 ? 68 : 88, 5);
  const fullArt = printing.variant === "full-art";
  if (flavor.overflow) overflow.push("flavor");
  return Object.freeze({
    version: 2,
    width: TCG_CARD_WIDTH,
    height: TCG_CARD_HEIGHT,
    title: Object.freeze({ text: definition.name, x: 52, y: 70, width: 570, fontSize: titleFont }),
    cost: Object.freeze({ text: String(definition.cost), x: 680, y: 72 }),
    illustration: fullArt
      ? Object.freeze({ key: printing.illustrationKey, x: 0, y: 0, width: TCG_CARD_WIDTH, height: TCG_CARD_HEIGHT })
      : Object.freeze({ key: printing.illustrationKey, x: 44, y: 112, width: 656, height: 390 }),
    typeLine: Object.freeze({ text: typeText, x: 52, y: 548, width: 640, fontSize: 22 }),
    rules: Object.freeze({ lines: rules.lines, x: 62, y: 610, width: 620, fontSize: rulesFont, lineHeight: Math.round(rulesFont * 1.28) }),
    flavor: Object.freeze({ lines: flavor.lines, x: 62, y: 858, width: 620, fontSize: flavorFont, lineHeight: Math.round(flavorFont * 1.22) }),
    stats: Object.freeze({
      ...(definition.power !== undefined ? { power: definition.power } : {}),
      ...(definition.guard !== undefined ? { guard: definition.guard } : {}),
    }),
    footer: Object.freeze({
      set: TCG_SETS[printing.setId].name,
      collectorNumber: printing.collectorNumber,
      rarity: definition.rarity,
      printing: `${printing.variant} • ${printing.finish}`,
    }),
    overflow: Object.freeze(overflow),
  });
}

export function validateTcgCardLayout(definition: TcgCardDefinition, printing: TcgPrinting) {
  const layout = layoutTcgCard(definition, printing);
  return Object.freeze({ valid: layout.overflow.length === 0, overflow: layout.overflow, layout });
}

function lineSvg(lines: readonly string[], x: number, y: number, fontSize: number, lineHeight: number, className: string) {
  return lines.map((line, index) => `<text class="${className}" x="${x}" y="${y + index * lineHeight}" font-size="${fontSize}">${escapeXml(line)}</text>`).join("");
}

export function renderTcgCardSvg(definition: TcgCardDefinition, printing: TcgPrinting) {
  const layout = layoutTcgCard(definition, printing);
  const fullArt = printing.variant === "full-art";
  const typeColor = definition.primaryType ? CREATURE_TYPES[definition.primaryType]?.color ?? "#c9b987" : "#c9b987";
  const frame = fullArt ? "#e7c876"
    : printing.variant === "boss-signature" ? "#d9b454"
      : printing.variant === "showcase" ? "#86b8bf"
      : definition.rarity === "legendary" ? "#c99b3d"
        : definition.rarity === "epic" ? "#8c65a8"
          : definition.rarity === "rare" ? "#4f83a9"
            : definition.rarity === "uncommon" ? "#5e8d65" : "#746c5d";
  const illustration = printing.illustrationKey.startsWith("/")
    ? `<image href="${escapeXml(printing.illustrationKey)}" x="${layout.illustration.x}" y="${layout.illustration.y}" width="${layout.illustration.width}" height="${layout.illustration.height}" preserveAspectRatio="${fullArt ? "xMidYMid slice" : "xMidYMid meet"}"${fullArt ? ' clip-path="url(#full-art-clip)"' : ""}/>`
    : `<rect x="${layout.illustration.x}" y="${layout.illustration.y}" width="${layout.illustration.width}" height="${layout.illustration.height}" fill="${typeColor}" opacity=".4"/><text x="372" y="320" text-anchor="middle" font-size="32">${escapeXml(definition.name)}</text>`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-labelledby="title desc" data-treatment="${fullArt ? "full-art" : "windowed"}">`,
    `<title id="title">${escapeXml(definition.name)}</title>`,
    `<desc id="desc">${escapeXml(cardRulesText(definition))}</desc>`,
    fullArt ? `<defs><clipPath id="full-art-clip"><rect width="${layout.width}" height="${layout.height}" rx="38"/></clipPath><linearGradient id="full-art-shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#07100d" stop-opacity=".48"/><stop offset=".28" stop-color="#07100d" stop-opacity=".02"/><stop offset=".55" stop-color="#07100d" stop-opacity=".08"/><stop offset="1" stop-color="#07100d" stop-opacity=".9"/></linearGradient></defs>` : "",
    `<rect width="100%" height="100%" rx="38" fill="#171813"/>`,
    fullArt ? illustration : "",
    fullArt ? `<rect width="100%" height="100%" rx="38" fill="url(#full-art-shade)"/><rect x="28" y="28" width="688" height="88" rx="18" fill="#07100d" opacity=".7"/><rect x="34" y="522" width="676" height="426" rx="18" fill="#07100d" opacity=".64"/>` : "",
    `<rect x="18" y="18" width="708" height="1004" rx="28" fill="${fullArt ? "none" : "#ede1bd"}" stroke="${frame}" stroke-width="18"/>`,
    `<text x="${layout.title.x}" y="${layout.title.y}" font-family="serif" font-weight="700" font-size="${layout.title.fontSize}"${fullArt ? ' fill="#fff7df" stroke="#07100d" stroke-width="1.5" paint-order="stroke"' : ""}>${escapeXml(layout.title.text)}</text>`,
    `<circle cx="${layout.cost.x}" cy="${layout.cost.y - 16}" r="35" fill="${typeColor}" stroke="#20231e" stroke-width="4"/>`,
    `<text x="${layout.cost.x}" y="${layout.cost.y}" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="36">${layout.cost.text}</text>`,
    fullArt ? "" : illustration,
    fullArt ? "" : `<rect x="44" y="112" width="656" height="390" fill="none" stroke="${frame}" stroke-width="6"/>`,
    `<text x="${layout.typeLine.x}" y="${layout.typeLine.y}" font-family="sans-serif" font-weight="700" font-size="${layout.typeLine.fontSize}"${fullArt ? ' fill="#fff7df"' : ""}>${escapeXml(layout.typeLine.text)}</text>`,
    fullArt ? `<g fill="#fff9e7">${lineSvg(layout.rules.lines, layout.rules.x, layout.rules.y, layout.rules.fontSize, layout.rules.lineHeight, "rules")}</g>` : lineSvg(layout.rules.lines, layout.rules.x, layout.rules.y, layout.rules.fontSize, layout.rules.lineHeight, "rules"),
    fullArt ? `<g fill="#fff9e7">${lineSvg(layout.flavor.lines, layout.flavor.x, layout.flavor.y, layout.flavor.fontSize, layout.flavor.lineHeight, "flavor")}</g>` : lineSvg(layout.flavor.lines, layout.flavor.x, layout.flavor.y, layout.flavor.fontSize, layout.flavor.lineHeight, "flavor"),
    definition.power !== undefined ? `<circle cx="72" cy="980" r="42" fill="#ad5c45"/><text x="72" y="993" text-anchor="middle" font-size="38" font-weight="800">${definition.power}</text>` : "",
    definition.guard !== undefined ? `<circle cx="672" cy="980" r="42" fill="#567890"/><text x="672" y="993" text-anchor="middle" font-size="38" font-weight="800">${definition.guard}</text>` : "",
    `<text x="372" y="1010" text-anchor="middle" font-family="sans-serif" font-size="16"${fullArt ? ' fill="#fff7df"' : ""}>${escapeXml(`${layout.footer.set} • ${layout.footer.collectorNumber} • ${layout.footer.rarity} • ${layout.footer.printing}`)}</text>`,
    "</svg>",
  ].join("");
}

export function auditTcgLayouts(catalog: TcgCatalog = TCG_CATALOG) {
  const failures = catalog.printingOrder.flatMap((printingId) => {
    const printing = catalog.printings[printingId];
    const definition = catalog.definitions[printing.cardDefinitionId];
    const result = validateTcgCardLayout(definition, printing);
    return result.valid ? [] : [{ printingId, definitionId: definition.id, overflow: result.overflow }];
  });
  return Object.freeze({
    valid: failures.length === 0,
    failures: Object.freeze(failures),
    checked: catalog.printingOrder.length,
    layoutVersion: TCG_CARD_LAYOUT_VERSION,
  });
}
