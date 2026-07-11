import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DragonMagicPanel, ManaHud, SpellWheelPanel } from "../app/game/DragonMagicPanels.tsx";
import { MAGIC_ATTUNEMENT_QUEST_ID, TOMES, attuneMagicFromQuest, createMagicState, learnSpellFromTome, setFavoriteSpells } from "../app/game/magic.ts";
import { createSkillState, type SkillId, type SkillState } from "../app/game/skills.ts";

const outputDirectory = resolve("output/dragon-magic-ui-audit");
mkdirSync(outputDirectory, { recursive: true });

let magic = TOMES.reduce((state, tome, index) => learnSpellFromTome(state, tome.itemId, index + 1).state, createMagicState(145));
magic = attuneMagicFromQuest(magic, [MAGIC_ATTUNEMENT_QUEST_ID], 20).state;
magic = setFavoriteSpells(magic, TOMES.map((tome) => tome.spellId));
magic = { ...magic, mana: 96, selectedSpellId: "frost-lance" };

const levels: Readonly<Record<SkillId, number>> = {
  melee: 184,
  ranged: 92,
  mining: 247,
  crafting: 161,
  survival: 213,
  husbandry: 126,
  exploration: 301,
  magic: 175,
};
const baseSkills = createSkillState();
const skills: SkillState = {
  ...baseSkills,
  characterLevel: 86,
  perkPoints: 5,
  skills: Object.fromEntries(Object.entries(levels).map(([id, level]) => [id, { level, xp: Math.round((120 + level * 18) * 0.57) }])) as SkillState["skills"],
  unlockedPerkIds: ["magic-calm-channel", "exploration-trail-memory", "husbandry-gentle-presence"],
};

function document(title: string, content: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>html,body{margin:0;min-height:100%;background:#0c100f}body{display:grid;min-height:100vh;place-items:center;overflow:hidden}</style></head><body>${content}</body></html>`;
}

const callbacks = {
  onClose: () => undefined,
  onSelectSpell: () => undefined,
  onToggleFavorite: () => undefined,
  onUnlockPerk: () => undefined,
  onToggleAscendant: () => undefined,
};

writeFileSync(resolve(outputDirectory, "journal.html"), document("Spell Journal Audit", renderToStaticMarkup(createElement(DragonMagicPanel, { magic, skills, ...callbacks }))));
writeFileSync(resolve(outputDirectory, "skills.html"), document("Skills Audit", renderToStaticMarkup(createElement(DragonMagicPanel, { magic, skills, initialTab: "skills", ...callbacks }))));
writeFileSync(resolve(outputDirectory, "wheel.html"), document("Spell Wheel Audit", renderToStaticMarkup(createElement(SpellWheelPanel, { open: true, magic, onSelectSpell: () => undefined, onClose: () => undefined }))));
writeFileSync(resolve(outputDirectory, "mana.html"), document("Mana HUD Audit", renderToStaticMarkup(createElement(ManaHud, { magic, magicSkillLevel: skills.skills.magic.level }))));

console.log(outputDirectory);
