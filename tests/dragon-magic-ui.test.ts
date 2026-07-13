import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { DragonPanel } from "../app/game/DragonPanel.tsx";
import { DragonMagicPanel, ManaHud, SpellWheelPanel } from "../app/game/DragonMagicPanels.tsx";
import { createDragonState } from "../app/game/dragons.ts";
import { MAGIC_ATTUNEMENT_QUEST_ID, TOMES, attuneMagicFromQuest, createMagicState, learnSpellFromTome, setFavoriteSpells } from "../app/game/magic.ts";
import { MAX_SKILL_LEVEL, SKILL_IDS, createSkillState, type SkillState } from "../app/game/skills.ts";

function learnedMagic() {
  const learned = TOMES.slice(0, 4).reduce((state, tome, index) => learnSpellFromTome(state, tome.itemId, index + 1).state, createMagicState());
  return attuneMagicFromQuest(learned, [MAGIC_ATTUNEMENT_QUEST_ID], 20).state;
}

test("the spell journal SSR surface explains learning, attunement, favorites, casting, and cues", () => {
  const html = renderToString(createElement(DragonMagicPanel, {
    magic: learnedMagic(),
    skills: createSkillState(),
    onSelectSpell: () => undefined,
    onToggleFavorite: () => undefined,
    onClose: () => undefined,
  }));
  assert.match(html, /Spell Journal/u);
  assert.match(html, /DRAGONHEART ARCANUM/u);
  assert.match(html, /Flame Jet/u);
  assert.match(html, /Equip(?:ped)? to Q/u);
  assert.match(html, /REUSABLE TOME SOURCES/u);
  assert.match(html, /spiral embers to cone/u);
  assert.match(html, /aria-label="Search spell journal"/u);
  assert.match(html, /data-blockwild-dragon-magic/u);
});

test("the skill tab renders exact scaling, perk branches, and locked Ascendant controls", () => {
  const html = renderToString(createElement(DragonMagicPanel, {
    magic: createMagicState(),
    skills: createSkillState(),
    initialTab: "skills",
  }));
  assert.match(html, /Skills &amp; Perks/u);
  assert.match(html, /Each point adds exactly 1%/u);
  assert.match(html, /Magic 0/u);
  assert.match(html, /Calm Channel/u);
  assert.match(html, /Infinite Wellspring/u);
  assert.match(html, /Magic 1000 required/u);
});

test("the controlled radial wheel grows with favorites and exposes the selected working", () => {
  let magic = learnedMagic();
  magic = setFavoriteSpells(magic, ["flame-jet", "frost-lance", "steel-spear", "healing-light"]);
  const html = renderToString(createElement(SpellWheelPanel, {
    open: true,
    magic,
    onSelectSpell: () => undefined,
    onClose: () => undefined,
  }));
  assert.equal((html.match(/role="menuitemradio"/gu) ?? []).length, 4);
  assert.match(html, /Flame Jet/u);
  assert.match(html, /Frost Lance/u);
  assert.match(html, /4 \/ 10 favorites/u);
  assert.match(html, /Release Q/u);
  assert.equal(renderToString(createElement(SpellWheelPanel, { open: false, magic, onSelectSpell: () => undefined, onClose: () => undefined })), "");
});

test("the empty spell wheel collapses into one quiet hold-to-close prompt", () => {
  const html = renderToString(createElement(SpellWheelPanel, {
    open: true,
    magic: createMagicState(),
    onSelectSpell: () => undefined,
    onClose: () => undefined,
  }));
  assert.match(html, /data-empty="true"/u);
  assert.match(html, /No favorite spells/u);
  assert.match(html, /Release Q to return/u);
  assert.doesNotMatch(html, /role="menuitemradio"/u);
  assert.doesNotMatch(html, /class="dragon-magic-wheelCenter"/u);
});

test("merchant trade labels opt out of the global carved-button text shadow", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.hearthroads-trade-counter\s*>\s*\.gold-button\s*\{[^}]*text-shadow:\s*none;/u);
});

test("the mana HUD is present after attunement and disappears at Magic mastery", () => {
  const magic = learnedMagic();
  const visible = renderToString(createElement(ManaHud, { magic, magicSkillLevel: 999 }));
  assert.match(visible, /MANA/u);
  assert.match(visible, /aria-label="100 of 100 mana"/u);
  assert.equal(renderToString(createElement(ManaHud, { magic, magicSkillLevel: 1_000 })), "");

  const masteredSkills: SkillState = {
    ...createSkillState(),
    skills: Object.fromEntries(SKILL_IDS.map((skillId) => [skillId, { level: MAX_SKILL_LEVEL, xp: 0 }])) as SkillState["skills"],
  };
  const panel = renderToString(createElement(DragonMagicPanel, { magic, skills: masteredSkills, initialTab: "skills" }));
  assert.match(panel, /11\.00×/u);
});

test("dragon care portraits show the live lifecycle stage as a Roman numeral", () => {
  const dragon = createDragonState("steel", { ageDays: 112, sex: "female", tamed: true, dragonId: "anvilwing" });
  const html = renderToString(createElement(DragonPanel, {
    dragon,
    displayName: "Anvilwing",
    onClose: () => undefined,
    onCommand: () => undefined,
    onToggleShoulder: () => undefined,
    onHarvestScales: () => undefined,
    onOpenCargo: () => undefined,
  }));
  assert.match(html, /STEEL.*DRAGON.*STAGE.*5<\/span>/u);
  assert.match(html, /aria-label="Stage 5">V<\/i>/u);
  assert.doesNotMatch(html, /aria-label="Stage 5">III<\/i>/u);
});

test("Sea Dragon care uses its own brine-and-aether presentation", () => {
  const dragon = createDragonState("sea", { ageDays: 64, sex: "male", tamed: true, dragonId: "tidewake" });
  const html = renderToString(createElement(DragonPanel, {
    dragon,
    displayName: "Tidewake",
    onClose: () => undefined,
    onCommand: () => undefined,
    onToggleShoulder: () => undefined,
    onHarvestScales: () => undefined,
    onOpenCargo: () => undefined,
  }));
  assert.match(html, /dragon-care-sea/u);
  assert.match(html, /SEA.*DRAGON.*STAGE.*3/u);
  assert.match(html, /--dragon-glow:#69eee5/u);
});
