import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Buffer } from "node:buffer";
import { CARDFORGE_FEATURED_FULL_ART_MOBS, creatureCardArtTheme, type CreatureCardArtTheme } from "../app/game/tcg/creature-art.ts";
import { MOB_DEFS } from "../app/game/mobs.ts";
import { createMobInspectionSpecs, renderModelPortrait } from "./render-models.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "public", "cardforge", "full-art-canonical");

const PALETTES: Readonly<Record<CreatureCardArtTheme, readonly [string, string, string, string]>> = Object.freeze({
  field: ["#759b87", "#b7c9a4", "#4f6f4b", "#2c4431"],
  forest: ["#385f4b", "#78906a", "#263d2d", "#15251c"],
  aquatic: ["#174b61", "#28758a", "#163a4c", "#09242f"],
  cavern: ["#39443f", "#667267", "#242c29", "#111715"],
  frost: ["#9cb9c0", "#d8e1d8", "#718d94", "#394f58"],
  desert: ["#d3a052", "#f0c97d", "#9b6236", "#573825"],
  volcanic: ["#4a3932", "#8f4933", "#302925", "#171817"],
  sugar: ["#bb7b8f", "#e9bbc0", "#7c6a9b", "#473957"],
  settlement: ["#6e7567", "#a19a7e", "#4b4e43", "#272c27"],
  sky: ["#6f9fae", "#b9cfcb", "#516f78", "#2d4852"],
});

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function scene(theme: CreatureCardArtTheme, palette: readonly [string, string, string, string]) {
  const [sky, light, mid, dark] = palette;
  if (theme === "aquatic") return `
    <rect width="768" height="1152" fill="${dark}"/><rect x="0" y="0" width="768" height="720" fill="${sky}"/>
    <path d="M0 120H768M0 252H768M0 406H768" stroke="${light}" stroke-opacity=".18" stroke-width="8"/>
    <path d="M0 776L124 704L258 750L390 674L530 736L650 662L768 706V1152H0Z" fill="${mid}"/>
    <g fill="${light}" opacity=".46"><circle cx="94" cy="212" r="14"/><circle cx="128" cy="164" r="7"/><circle cx="650" cy="284" r="17"/><circle cx="686" cy="236" r="8"/></g>
    <g fill="${sky}" stroke="${light}" stroke-width="7"><path d="M80 1020V730h38v290M132 1020V654h32v366M634 1020V704h36v316M586 1020V778h30v242"/></g>`;
  if (theme === "cavern") return `
    <rect width="768" height="1152" fill="${dark}"/><path d="M0 0h768v240L684 194l-72 98-84-54-98 62-94-78-104 68-82-96-150 52Z" fill="${mid}"/>
    <path d="M0 852l96-86 112 42 92-104 118 78 96-94 104 82 150-54v436H0Z" fill="${mid}"/>
    <g fill="${light}" opacity=".7"><path d="M84 862l34-126 34 126Z"/><path d="M616 826l28-112 32 112Z"/><rect x="343" y="126" width="22" height="96" transform="rotate(35 354 174)"/></g>`;
  if (theme === "volcanic") return `
    <rect width="768" height="1152" fill="${dark}"/><rect y="0" width="768" height="640" fill="${sky}"/>
    <path d="M0 720L142 590L250 682L402 500L526 674L642 566L768 698V1152H0Z" fill="${mid}"/>
    <path d="M310 1152l58-310 70-142 42 184 98 268Z" fill="#d86a34" opacity=".75"/><g fill="${light}" opacity=".5"><rect x="104" y="178" width="34" height="34"/><rect x="612" y="250" width="22" height="22"/></g>`;
  if (theme === "frost") return `
    <rect width="768" height="1152" fill="${sky}"/><rect y="0" width="768" height="350" fill="${light}"/>
    <path d="M0 760L120 540L224 650L346 408L468 630L592 494L768 714V1152H0Z" fill="${mid}"/>
    <path d="M190 584l34 66 44-122 78-120 44 126 52 96-96-222Z" fill="#edf2e8" opacity=".82"/><g fill="#f4f5e9" opacity=".72"><rect x="92" y="126" width="12" height="12"/><rect x="652" y="188" width="16" height="16"/><rect x="518" y="82" width="9" height="9"/></g>`;
  if (theme === "desert") return `
    <rect width="768" height="1152" fill="${sky}"/><rect y="0" width="768" height="420" fill="${light}"/>
    <circle cx="622" cy="166" r="72" fill="#f7dc8b"/><path d="M0 690Q186 522 382 684T768 636V1152H0Z" fill="${mid}"/>
    <path d="M0 862Q202 704 414 842T768 790V1152H0Z" fill="${dark}" opacity=".55"/><g fill="${dark}"><rect x="88" y="612" width="28" height="180"/><rect x="48" y="650" width="68" height="24"/><rect x="116" y="692" width="52" height="22"/></g>`;
  if (theme === "sugar") return `
    <rect width="768" height="1152" fill="${dark}"/><rect y="0" width="768" height="570" fill="${light}"/>
    <path d="M0 744L118 624L226 700L338 552L462 704L584 596L768 720V1152H0Z" fill="${sky}"/>
    <g fill="${mid}" stroke="#f2d8bd" stroke-width="8"><rect x="72" y="494" width="62" height="248"/><rect x="618" y="438" width="56" height="286"/><rect x="604" y="420" width="84" height="34"/><rect x="58" y="474" width="90" height="34"/></g><g fill="#f4d890"><circle cx="210" cy="198" r="28"/><circle cx="548" cy="242" r="22"/></g>`;
  if (theme === "settlement") return `
    <rect width="768" height="1152" fill="${dark}"/><rect y="0" width="768" height="520" fill="${sky}"/>
    <path d="M0 802V586h116V492h94v310h108V556h132v246h116V462h122v340h80v350H0Z" fill="${mid}"/>
    <g fill="${light}"><rect x="148" y="558" width="24" height="34"/><rect x="362" y="620" width="28" height="38"/><rect x="614" y="530" width="24" height="34"/></g><path d="M0 840H768" stroke="#d2ad61" stroke-width="16" opacity=".55"/>`;
  if (theme === "sky") return `
    <rect width="768" height="1152" fill="${sky}"/><rect y="0" width="768" height="720" fill="${light}" opacity=".56"/>
    <g fill="#e7eee1" opacity=".8"><rect x="74" y="250" width="204" height="54"/><rect x="122" y="220" width="112" height="48"/><rect x="482" y="392" width="220" height="52"/><rect x="532" y="354" width="116" height="48"/></g>
    <path d="M0 904L142 720L280 824L420 662L558 798L672 708L768 812V1152H0Z" fill="${mid}"/>`;
  const forest = theme === "forest";
  return `
    <rect width="768" height="1152" fill="${sky}"/><rect y="0" width="768" height="520" fill="${light}" opacity=".64"/>
    <circle cx="618" cy="160" r="58" fill="#f2dda0" opacity=".78"/><path d="M0 720L132 642L258 704L382 612L510 696L644 626L768 690V1152H0Z" fill="${mid}"/>
    <path d="M0 856L150 786L286 842L444 758L588 830L768 752V1152H0Z" fill="${dark}" opacity=".58"/>
    ${forest ? `<g fill="${dark}"><rect x="62" y="332" width="44" height="478"/><rect x="654" y="286" width="50" height="524"/></g><g fill="${mid}"><rect x="18" y="258" width="150" height="126"/><rect x="598" y="212" width="160" height="132"/></g>` : `<g fill="${light}" opacity=".55"><rect x="92" y="626" width="14" height="42"/><rect x="642" y="588" width="16" height="50"/><rect x="188" y="660" width="10" height="32"/></g>`}`;
}

function fullArtSvg(kind: (typeof CARDFORGE_FEATURED_FULL_ART_MOBS)[number], portrait: string) {
  const definition = MOB_DEFS[kind];
  const theme = creatureCardArtTheme(definition);
  const palette = PALETTES[theme];
  const portraitData = Buffer.from(portrait, "utf8").toString("base64");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1152" viewBox="0 0 768 1152" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(definition.name)} canonical Cardforge Full Art</title>
  <desc id="desc">The exact Blockwild production model staged in its ${theme} field-guide habitat.</desc>
  <defs><filter id="subject-shadow" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="18" stdDeviation="12" flood-color="#050907" flood-opacity=".72"/></filter><pattern id="paper" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M0 31H32M31 0V32" stroke="#fff" stroke-opacity=".035"/></pattern></defs>
${scene(theme, palette)}
  <rect width="768" height="1152" fill="url(#paper)"/>
  <path d="M30 38H738M30 1114H738" stroke="#f0d58b" stroke-opacity=".48" stroke-width="3"/>
  <image href="data:image/svg+xml;base64,${portraitData}" x="34" y="214" width="700" height="520" preserveAspectRatio="xMidYMid meet" filter="url(#subject-shadow)"/>
  <rect x="0" y="760" width="768" height="392" fill="${palette[3]}" opacity=".58"/>
  <g opacity=".22" fill="#f8e6ad"><rect x="42" y="806" width="162" height="8"/><rect x="42" y="834" width="266" height="5"/><rect x="42" y="854" width="214" height="5"/></g>
</svg>`;
}

async function main() {
  await mkdir(output, { recursive: true });
  const specs = new Map(createMobInspectionSpecs().map((spec) => [spec.id, spec]));
  for (const kind of CARDFORGE_FEATURED_FULL_ART_MOBS) {
    const spec = specs.get(kind);
    if (!spec) throw new Error(`No canonical inspection spec for ${kind}`);
    await writeFile(path.join(output, `${kind}.svg`), fullArtSvg(kind, renderModelPortrait(spec)), "utf8");
  }
  await writeFile(path.join(output, "manifest.json"), `${JSON.stringify({
    schema: 1,
    renderer: "canonical-production-model",
    source: "app/game/mob-models.ts",
    count: CARDFORGE_FEATURED_FULL_ART_MOBS.length,
    kinds: CARDFORGE_FEATURED_FULL_ART_MOBS,
  }, null, 2)}\n`, "utf8");
  process.stdout.write(`Rendered ${CARDFORGE_FEATURED_FULL_ART_MOBS.length} canonical Cardforge scenes.\n`);
}

await main();
