"use client";

import { useId, useMemo, useState, type CSSProperties } from "react";
import {
  MAX_FAVORITE_SPELLS,
  SPELLS,
  shouldShowManaBar,
  spellWheelSlots,
  type MagicState,
  type SpellAcquisitionSource,
  type SpellDefinition,
  type SpellId,
  type SpellSchool,
} from "./magic";
import {
  ASCENDANT_TRAITS,
  MAX_SKILL_LEVEL,
  PERKS,
  SKILLS,
  ascendantTraitEnabled,
  skillMultiplier,
  skillXpForNextRank,
  type SkillId,
  type SkillState,
} from "./skills";
import type { StatusEffectView } from "./status-effects";

export type DragonMagicTab = "spells" | "skills";

export type DragonMagicPanelProps = Readonly<{
  magic: MagicState;
  skills: SkillState;
  activeEffects?: readonly StatusEffectView[];
  initialTab?: DragonMagicTab;
  onClose?: () => void;
  onSelectSpell?: (spellId: SpellId) => void;
  onToggleFavorite?: (spellId: SpellId) => void;
  onUnlockPerk?: (perkId: string) => void;
  onToggleAscendant?: (enabled: boolean, skillId: SkillId) => void;
}>;

export type SpellWheelPanelProps = Readonly<{
  open: boolean;
  magic: MagicState;
  onSelectSpell: (spellId: SpellId) => void;
  onClose: () => void;
}>;

export type ManaHudProps = Readonly<{
  magic: MagicState;
  magicSkillLevel: number;
}>;

const SCHOOL_PRESENTATION: Readonly<Record<SpellSchool, Readonly<{ glyph: string; label: string; accent: string }>>> = {
  destruction: { glyph: "△", label: "Destruction", accent: "#e98762" },
  restoration: { glyph: "+", label: "Restoration", accent: "#efcc7a" },
  alteration: { glyph: "◇", label: "Alteration", accent: "#a99ae2" },
  conjuration: { glyph: "↟", label: "Conjuration", accent: "#91aab7" },
  utility: { glyph: "◎", label: "Utility", accent: "#71c6b6" },
};

const DRAGON_MAGIC_STYLES = `
.dragon-magic-root{--dm-ink:#181918;--dm-iron:#262927;--dm-iron-2:#333733;--dm-paper:#eee5ca;--dm-paper-deep:#d8cba7;--dm-gold:#d8aa50;--dm-muted:#a8aa9e;position:relative;color:var(--dm-paper);font-family:var(--font-pixel,ui-monospace,"Cascadia Mono",monospace)}
.dragon-magic-root *{box-sizing:border-box}
.dragon-magic-shell{position:relative;width:min(1080px,calc(100vw - 32px));height:min(760px,calc(100vh - 32px));margin:auto;overflow:hidden;border:1px solid #6d705f;background:linear-gradient(112deg,rgba(22,24,22,.98),rgba(37,40,36,.98));box-shadow:0 22px 80px #000b,inset 0 0 0 3px #1119;animation:dragon-magic-rise .24s cubic-bezier(.2,.8,.2,1)}
.dragon-magic-shell:before{content:"";position:absolute;inset:0;pointer-events:none;opacity:.18;background-image:linear-gradient(90deg,transparent 49%,#e7c77814 50%,transparent 51%),linear-gradient(#fff0 92%,#fff1);background-size:31px 100%,100% 5px}
.dragon-magic-header{position:relative;display:grid;grid-template-columns:1fr auto auto;gap:20px;align-items:center;padding:20px 24px 16px;border-bottom:1px solid #6c6f5d;background:#171917e8}
.dragon-magic-eyebrow{display:block;margin-bottom:5px;color:var(--dm-gold);font-size:11px;letter-spacing:.18em;text-transform:uppercase}
.dragon-magic-header h2{margin:0;font:700 clamp(25px,3vw,42px)/1 Georgia,serif;letter-spacing:-.025em}
.dragon-magic-status{display:flex;align-items:center;gap:10px;padding-left:18px;border-left:1px solid #56594d;color:#c7c8bb;font-size:12px}
.dragon-magic-status i{width:9px;height:9px;border-radius:50%;background:#746c5c;box-shadow:0 0 0 4px #ffffff0c}
.dragon-magic-status[data-attuned="true"] i{background:#dfb35b;box-shadow:0 0 16px #e1b457aa}
.dragon-magic-close{width:40px;height:40px;border:1px solid #686b60;background:#2e312e;color:#eee5ca;font-size:22px;cursor:pointer}.dragon-magic-close:hover{border-color:var(--dm-gold);color:#fff}
.dragon-magic-tabs{position:relative;display:flex;gap:4px;padding:10px 24px 0;background:#202320}
.dragon-magic-tabs button{min-width:130px;padding:11px 18px;border:0;border-bottom:2px solid transparent;background:transparent;color:#aeb0a6;font:inherit;font-size:12px;letter-spacing:.08em;text-transform:uppercase;cursor:pointer}
.dragon-magic-tabs button[aria-selected="true"]{border-color:var(--dm-gold);color:#fff2c6;background:#ffffff08}
.dragon-magic-body{position:relative;height:calc(100% - 126px);min-height:0}
.dragon-magic-journal{display:grid;grid-template-columns:340px minmax(0,1fr);height:100%;min-height:0}
.dragon-magic-index{display:flex;min-height:0;flex-direction:column;border-right:1px solid #5b5d52;background:#202320c9}
.dragon-magic-tools{display:grid;grid-template-columns:1fr 132px;gap:8px;padding:14px;border-bottom:1px solid #505348}
.dragon-magic-tools input,.dragon-magic-tools select{min-width:0;height:38px;border:1px solid #5e6256;background:#151715;color:#e8e1ce;padding:0 10px;font:inherit;font-size:11px;outline:none}
.dragon-magic-tools input:focus,.dragon-magic-tools select:focus{border-color:var(--dm-gold)}
.dragon-magic-list{overflow:auto;padding:6px 0 24px;scrollbar-color:#777965 #1b1d1b}
.dragon-magic-spellRow{--spell-accent:#d8aa50;display:grid;width:100%;grid-template-columns:38px 1fr auto;gap:11px;align-items:center;padding:12px 15px;border:0;border-left:3px solid transparent;border-bottom:1px solid #ffffff0a;background:transparent;color:#d9d8ce;text-align:left;cursor:pointer;transition:background .14s ease,border-color .14s ease,transform .14s ease}
.dragon-magic-spellRow:hover,.dragon-magic-spellRow:focus-visible{background:#ffffff0b;transform:translateX(2px);outline:0}.dragon-magic-spellRow[data-active="true"]{border-left-color:var(--spell-accent);background:#ffffff0e;color:#fff}
.dragon-magic-spellGlyph{display:grid;width:36px;height:36px;place-items:center;border:1px solid color-mix(in srgb,var(--spell-accent),#333 58%);color:var(--spell-accent);background:#1117;font-size:17px;transform:rotate(45deg)}
.dragon-magic-spellGlyph span{transform:rotate(-45deg)}
.dragon-magic-spellRow strong,.dragon-magic-spellRow small{display:block}.dragon-magic-spellRow strong{font:600 14px/1.2 Georgia,serif}.dragon-magic-spellRow small{margin-top:4px;color:#9fa197;font-size:10px;text-transform:uppercase;letter-spacing:.07em}
.dragon-magic-favorite{color:var(--dm-gold);font-size:15px}.dragon-magic-unknown{filter:saturate(.25);opacity:.65}
.dragon-magic-detail{min-width:0;overflow:auto;padding:clamp(22px,4vw,48px);background:radial-gradient(circle at 82% 8%,var(--spell-wash,#d8aa5017),transparent 36%)}
.dragon-magic-detailTop{display:flex;gap:18px;align-items:flex-start}.dragon-magic-sigil{display:grid;flex:0 0 68px;height:68px;place-items:center;border:1px solid var(--spell-accent);color:var(--spell-accent);font-size:30px;box-shadow:inset 0 0 28px var(--spell-wash);animation:dragon-magic-breathe 3.2s ease-in-out infinite}
.dragon-magic-titleBlock{min-width:0}.dragon-magic-school{color:var(--spell-accent);font-size:10px;letter-spacing:.16em;text-transform:uppercase}.dragon-magic-titleBlock h3{margin:5px 0 7px;font:700 clamp(27px,4vw,48px)/1 Georgia,serif}.dragon-magic-titleBlock p{max-width:650px;margin:0;color:#c8c8bd;line-height:1.55;font-size:13px}
.dragon-magic-actions{display:flex;flex-wrap:wrap;gap:8px;margin:22px 0}.dragon-magic-actions button,.dragon-magic-perk button,.dragon-magic-ascendant button{padding:10px 14px;border:1px solid #6a6d60;background:#343833;color:#ece5d2;font:inherit;font-size:11px;cursor:pointer}.dragon-magic-actions button:first-child{border-color:#bf964a;background:#7f6029;color:#fff1c1}.dragon-magic-actions button:disabled,.dragon-magic-perk button:disabled{cursor:not-allowed;opacity:.45}
.dragon-magic-statline{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-block:1px solid #55584d;margin:4px 0 24px}.dragon-magic-statline div{padding:14px 12px;border-right:1px solid #55584d}.dragon-magic-statline div:last-child{border:0}.dragon-magic-statline small,.dragon-magic-fact small{display:block;color:#999c91;font-size:9px;letter-spacing:.12em;text-transform:uppercase}.dragon-magic-statline strong{display:block;margin-top:5px;font-size:13px;color:#f0e7ce}
.dragon-magic-facts{display:grid;grid-template-columns:1fr 1fr;gap:24px}.dragon-magic-fact{padding-top:13px;border-top:1px solid #55584d}.dragon-magic-fact p{margin:7px 0 0;color:#c4c5ba;font-size:12px;line-height:1.55}.dragon-magic-source{margin:8px 0 0;padding-left:17px;color:#c4c5ba;font-size:11px;line-height:1.5}
.dragon-magic-locked{display:grid;height:100%;align-content:center;max-width:560px}.dragon-magic-locked span{color:var(--dm-gold);font-size:10px;letter-spacing:.17em}.dragon-magic-locked h3{margin:9px 0;font:700 38px/1 Georgia,serif}.dragon-magic-locked p{color:#b8baaf;line-height:1.6}
.dragon-magic-skills{display:grid;grid-template-columns:370px minmax(0,1fr);height:100%;min-height:0}.dragon-magic-skillIndex{overflow:auto;border-right:1px solid #56594e;background:#202320c9;padding:16px}.dragon-magic-character{padding:4px 4px 16px;border-bottom:1px solid #55584d;margin-bottom:8px}.dragon-magic-character strong{font:700 26px Georgia,serif}.dragon-magic-character span{float:right;color:var(--dm-gold);font-size:11px}
.dragon-magic-skillRow{--skill-accent:#d8aa50;display:grid;width:100%;grid-template-columns:1fr auto;gap:6px;padding:12px 8px;border:0;border-bottom:1px solid #ffffff0a;background:transparent;color:#d8d8ce;text-align:left;cursor:pointer}.dragon-magic-skillRow:hover,.dragon-magic-skillRow[data-active="true"]{background:#ffffff0b}.dragon-magic-skillRow strong{font-size:12px}.dragon-magic-skillRow b{color:var(--skill-accent);font-size:12px}.dragon-magic-skillTrack{grid-column:1/-1;height:4px;background:#101210;overflow:hidden}.dragon-magic-skillTrack i{display:block;height:100%;background:var(--skill-accent)}.dragon-magic-skillRow small{grid-column:1/-1;color:#94978c;font-size:9px}
.dragon-magic-skillDetail{overflow:auto;padding:clamp(22px,4vw,44px)}.dragon-magic-skillDetail h3{margin:5px 0;font:700 clamp(30px,4vw,48px)/1 Georgia,serif}.dragon-magic-skillLead{max-width:680px;color:#bfc1b6;line-height:1.6;font-size:13px}.dragon-magic-multiplier{display:inline-flex;gap:10px;align-items:baseline;margin:16px 0 24px;padding:12px 0;border-block:1px solid #56594e;color:#aaa}.dragon-magic-multiplier strong{font:700 25px Georgia,serif;color:var(--skill-accent)}
.dragon-magic-perkTree{display:grid;gap:2px}.dragon-magic-perk{display:grid;grid-template-columns:1fr auto;gap:8px;padding:15px 0;border-top:1px solid #53564b}.dragon-magic-perk strong{display:block;color:#eee5ce}.dragon-magic-perk p{margin:5px 0 0;color:#aeb1a5;font-size:11px;line-height:1.45}.dragon-magic-perk button{align-self:center}.dragon-magic-perk[data-unlocked="true"] button{border-color:#8b9e79;color:#dcebc9}
.dragon-magic-ascendant{margin-top:22px;padding:18px;border:1px solid #6b6656;background:#d8aa500a}.dragon-magic-ascendant h4{margin:0 0 5px;font:700 19px Georgia,serif}.dragon-magic-ascendant p{margin:0 0 12px;color:#afb1a6;font-size:11px;line-height:1.5}
.dragon-magic-effects{margin:18px 0 4px;padding-top:14px;border-top:1px solid #55584d}.dragon-magic-effects>strong{display:block;margin-bottom:8px;color:var(--dm-gold);font-size:10px;letter-spacing:.13em;text-transform:uppercase}.dragon-magic-effects>div{display:grid;grid-template-columns:1fr auto;gap:3px 8px;padding:8px 6px;border-left:2px solid #769b74;background:#ffffff08;margin-bottom:5px}.dragon-magic-effects>div.harmful{border-color:#b8675d}.dragon-magic-effects b{font-size:10px}.dragon-magic-effects small{color:#9fa298;font-size:8px}.dragon-magic-effects p{grid-column:1/-1;margin:0;color:#b8baaf;font-size:9px;line-height:1.35}.dragon-magic-effects-empty{color:#8f9288;font-size:9px;line-height:1.45}
.dragon-magic-wheelOverlay{position:fixed;z-index:120;inset:0;display:grid;place-items:center;background:radial-gradient(circle,#161b1bc7 0 17%,#090b0be8 60%);backdrop-filter:blur(5px);animation:dragon-magic-fade .14s ease-out}.dragon-magic-wheel{position:relative;width:min(640px,92vmin);aspect-ratio:1;border-radius:50%;border:1px solid #8c8368;background:radial-gradient(circle,#242925 0 22%,#151816ed 23% 52%,#2c302c 52.5% 53%,transparent 53.5%);box-shadow:0 0 0 10px #0005,0 24px 90px #000;animation:dragon-magic-wheel-bloom .2s cubic-bezier(.2,.85,.2,1)}
.dragon-magic-wheel:before,.dragon-magic-wheel:after{content:"";position:absolute;inset:9%;border:1px dashed #d8aa5044;border-radius:50%;animation:dragon-magic-spin 40s linear infinite}.dragon-magic-wheel:after{inset:27%;animation-direction:reverse;animation-duration:26s}
.dragon-magic-wheelSlot{--spell-accent:#d8aa50;position:absolute;z-index:2;left:var(--wheel-left);top:var(--wheel-top);width:clamp(78px,16vmin,112px);min-height:64px;transform:translate(-50%,-50%);border:1px solid #666b60;background:#242824f2;color:#d8d9cf;padding:8px;cursor:pointer;transition:transform .12s ease,border-color .12s ease,background .12s ease}.dragon-magic-wheelSlot:hover,.dragon-magic-wheelSlot:focus-visible,.dragon-magic-wheelSlot[data-selected="true"]{transform:translate(-50%,-50%) scale(1.08);border-color:var(--spell-accent);background:#353a34;outline:0}.dragon-magic-wheelSlot b{display:block;color:var(--spell-accent);font-size:18px}.dragon-magic-wheelSlot span{display:block;margin-top:4px;font:600 clamp(9px,1.6vmin,12px)/1.2 Georgia,serif}
.dragon-magic-wheelCenter{position:absolute;z-index:2;inset:34%;display:grid;place-items:center;text-align:center;align-content:center;pointer-events:none}.dragon-magic-wheelCenter kbd{display:grid;width:37px;height:37px;place-items:center;border:1px solid #aa9c70;background:#111;color:#f4d98d;box-shadow:inset 0 -3px #000;font:700 15px inherit}.dragon-magic-wheelCenter strong{margin-top:10px;font:700 clamp(15px,2.6vmin,23px) Georgia,serif}.dragon-magic-wheelCenter small{margin-top:5px;color:#9fa298;font-size:9px;letter-spacing:.08em;text-transform:uppercase}
.dragon-magic-wheelEmpty{position:absolute;inset:20%;display:grid;place-items:center;text-align:center;color:#bbbdb2}.dragon-magic-wheelDismiss{position:absolute;right:18px;top:18px;z-index:3;border:1px solid #65685e;background:#222622;color:#e9e2cf;padding:8px 10px;cursor:pointer}
.dragon-magic-manaHud{--mana-fill:0%;position:fixed;left:50%;bottom:78px;z-index:45;width:min(340px,62vw);transform:translateX(-50%);filter:drop-shadow(0 3px 4px #000a)}.dragon-magic-manaHud div{height:9px;border:1px solid #90a7b0;background:#0d1417;padding:1px}.dragon-magic-manaHud i{display:block;width:var(--mana-fill);height:100%;background:linear-gradient(90deg,#517f9d,#90d9e9);box-shadow:0 0 9px #78cde2}.dragon-magic-manaHud small{display:block;margin-top:3px;text-align:center;color:#cfecf3;font-size:9px;text-shadow:0 1px 3px #000}
@keyframes dragon-magic-rise{from{opacity:0;transform:translateY(10px) scale(.988)}to{opacity:1;transform:none}}@keyframes dragon-magic-fade{from{opacity:0}to{opacity:1}}@keyframes dragon-magic-wheel-bloom{from{transform:scale(.82) rotate(-3deg);opacity:.2}to{transform:none;opacity:1}}@keyframes dragon-magic-breathe{50%{box-shadow:inset 0 0 34px var(--spell-wash),0 0 18px var(--spell-wash)}}@keyframes dragon-magic-spin{to{transform:rotate(360deg)}}
@media(max-width:760px){.dragon-magic-shell{width:100vw;height:100dvh;border:0}.dragon-magic-header{grid-template-columns:minmax(0,1fr) auto;padding:15px 16px}.dragon-magic-header>div:first-child{min-width:0}.dragon-magic-status{grid-row:2;grid-column:1/-1;padding:8px 0 0;border:0}.dragon-magic-tabs{padding-left:12px}.dragon-magic-body{height:calc(100% - 142px)}.dragon-magic-journal,.dragon-magic-skills{grid-template-columns:1fr;grid-template-rows:minmax(210px,34%) minmax(0,1fr)}.dragon-magic-index,.dragon-magic-skillIndex{min-height:0;max-height:none;border-right:0;border-bottom:1px solid #5b5d52}.dragon-magic-detail,.dragon-magic-skillDetail{min-height:0;padding:20px}.dragon-magic-facts{grid-template-columns:1fr}.dragon-magic-statline{grid-template-columns:repeat(3,1fr)}.dragon-magic-wheelSlot span{display:none}}
@media(prefers-reduced-motion:reduce){.dragon-magic-root *{animation:none!important;transition:none!important}}
`;

export function DragonMagicStyles() {
  return <style data-blockwild-dragon-magic>{DRAGON_MAGIC_STYLES}</style>;
}

function spellStyle(spell: SpellDefinition) {
  const accent = SCHOOL_PRESENTATION[spell.school].accent;
  return {
    "--spell-accent": accent,
    "--spell-wash": `${accent}22`,
  } as CSSProperties;
}

function sourceLabel(source: SpellAcquisitionSource) {
  if (source.kind === "faction") return `${source.detail} · ${source.rarity}`;
  if (source.kind === "loot") return `${source.table.replaceAll("-", " ")} loot · ${source.rarity}`;
  if (source.kind === "quest") return `${source.branch === "main" ? "Main" : "Side"} quest · ${source.questId.replaceAll("-", " ")}`;
  return `${source.dragonType} dragon lair · tier ${source.minimumTier}+`;
}

function effectLabel(spell: SpellDefinition) {
  return spell.effects.map((effect) => {
    if (effect.kind === "damage") return `${effect.amount} ${effect.damageType} damage${effect.status ? ` + ${effect.status}` : ""}`;
    if (effect.kind === "heal") return `${effect.amount} health restored`;
    if (effect.kind === "shield") return `${effect.amount} ward for ${effect.durationSeconds}s`;
    if (effect.kind === "teleport") return `${effect.distance} block safe fold`;
    if (effect.kind === "summoned-projectile") return `${effect.summon.replaceAll("-", " ")} conjured`;
    return `Reveal within ${effect.radius} blocks`;
  }).join(" · ");
}

function SpellJournal({
  magic,
  onSelectSpell,
  onToggleFavorite,
}: Pick<DragonMagicPanelProps, "magic" | "onSelectSpell" | "onToggleFavorite">) {
  const [query, setQuery] = useState("");
  const [school, setSchool] = useState<SpellSchool | "all">("all");
  const [previewSpellId, setPreviewSpellId] = useState<SpellId>(magic.selectedSpellId ?? magic.learnedSpellIds[0] ?? SPELLS[0].id);
  const preview = SPELLS.find((spell) => spell.id === previewSpellId) ?? SPELLS[0];
  const visibleSpells = useMemo(() => SPELLS.filter((spell) => {
    if (school !== "all" && spell.school !== school) return false;
    const discovered = Boolean(magic.journal[spell.id] || magic.learnedSpellIds.includes(spell.id));
    const label = discovered ? `${spell.name} ${spell.school}` : `unknown ${spell.school}`;
    return label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  }), [magic.journal, magic.learnedSpellIds, query, school]);
  const learned = magic.learnedSpellIds.includes(preview.id);
  const discovered = Boolean(magic.journal[preview.id] || learned);
  const favorite = magic.favoriteSpellIds.includes(preview.id);
  const favoriteFull = magic.favoriteSpellIds.length >= MAX_FAVORITE_SPELLS;
  return (
    <div className="dragon-magic-journal">
      <aside className="dragon-magic-index" aria-label="Spell journal entries">
        <div className="dragon-magic-tools">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search known spells" aria-label="Search spell journal" />
          <select value={school} onChange={(event) => setSchool(event.target.value as SpellSchool | "all")} aria-label="Filter spell school">
            <option value="all">All schools</option>
            {Object.entries(SCHOOL_PRESENTATION).map(([id, presentation]) => <option key={id} value={id}>{presentation.label}</option>)}
          </select>
        </div>
        <div className="dragon-magic-list">
          {visibleSpells.map((spell) => {
            const entryDiscovered = Boolean(magic.journal[spell.id] || magic.learnedSpellIds.includes(spell.id));
            const presentation = SCHOOL_PRESENTATION[spell.school];
            return (
              <button
                type="button"
                className={`dragon-magic-spellRow${entryDiscovered ? "" : " dragon-magic-unknown"}`}
                data-active={preview.id === spell.id}
                key={spell.id}
                style={spellStyle(spell)}
                onClick={() => setPreviewSpellId(spell.id)}
              >
                <span className="dragon-magic-spellGlyph" aria-hidden="true"><span>{entryDiscovered ? presentation.glyph : "?"}</span></span>
                <span><strong>{entryDiscovered ? spell.name : "Uncatalogued Working"}</strong><small>{entryDiscovered ? presentation.label : "Seek a tome or reliable account"}</small></span>
                {magic.favoriteSpellIds.includes(spell.id) ? <span className="dragon-magic-favorite" title="On spell wheel">★</span> : null}
              </button>
            );
          })}
        </div>
      </aside>
      <article className="dragon-magic-detail" style={spellStyle(preview)}>
        {discovered ? (
          <>
            <div className="dragon-magic-detailTop">
              <div className="dragon-magic-sigil" aria-hidden="true">{SCHOOL_PRESENTATION[preview.school].glyph}</div>
              <div className="dragon-magic-titleBlock"><span className="dragon-magic-school">{SCHOOL_PRESENTATION[preview.school].label} · {learned ? "Learned" : "Recorded"}</span><h3>{preview.name}</h3><p>{preview.description}</p></div>
            </div>
            <div className="dragon-magic-actions">
              <button type="button" disabled={!learned} onClick={() => onSelectSpell?.(preview.id)}>{magic.selectedSpellId === preview.id ? "Equipped to Q" : "Equip to Q"}</button>
              <button type="button" disabled={!learned || (!favorite && favoriteFull)} onClick={() => onToggleFavorite?.(preview.id)}>{favorite ? "Remove from wheel" : `Favorite (${magic.favoriteSpellIds.length}/${MAX_FAVORITE_SPELLS})`}</button>
            </div>
            <div className="dragon-magic-statline">
              <div><small>Mana</small><strong>{preview.manaCost}</strong></div>
              <div><small>Recovery</small><strong>{preview.cooldownSeconds.toFixed(2)}s</strong></div>
              <div><small>Delivery</small><strong>{preview.targeting}</strong></div>
            </div>
            <div className="dragon-magic-facts">
              <section className="dragon-magic-fact"><small>FIELD NOTES</small><p>{preview.journalNote}</p></section>
              <section className="dragon-magic-fact"><small>EFFECT PLAN</small><p>{effectLabel(preview)}</p></section>
              <section className="dragon-magic-fact"><small>CAST PERFORMANCE</small><p>{preview.animation.castPose.replaceAll("-", " ")} · {preview.animation.particleCue.replaceAll("-", " ")} · {preview.projectile.trail.replaceAll("-", " ")}</p></section>
              <section className="dragon-magic-fact"><small>REUSABLE TOME SOURCES</small><ul className="dragon-magic-source">{preview.sources.map((source, index) => <li key={`${preview.id}-${index}`}>{sourceLabel(source)}</li>)}</ul></section>
            </div>
          </>
        ) : (
          <div className="dragon-magic-locked"><span>NO RELIABLE ARCANE RECORD</span><h3>Uncatalogued Working</h3><p>Find the spell’s physical tome or witness trustworthy magic to reveal this page. Reading a tome teaches the spell without consuming the book, even before attunement.</p></div>
        )}
      </article>
    </div>
  );
}

function SkillJournal({ skills, activeEffects = [], onUnlockPerk, onToggleAscendant }: Pick<DragonMagicPanelProps, "skills" | "activeEffects" | "onUnlockPerk" | "onToggleAscendant">) {
  const [selectedSkillId, setSelectedSkillId] = useState<SkillId>("magic");
  const definition = SKILLS.find((skill) => skill.id === selectedSkillId) ?? SKILLS[0];
  const progress = skills.skills[selectedSkillId];
  const ascendant = ASCENDANT_TRAITS[selectedSkillId];
  const ascendantEnabled = ascendantTraitEnabled(skills, selectedSkillId);
  const needed = skillXpForNextRank(progress.level);
  const selectedPerks = PERKS.filter((perk) => perk.skillId === selectedSkillId);
  const masteryCount = SKILLS.filter((skill) => skills.skills[skill.id].level >= MAX_SKILL_LEVEL).length;
  const enabledTraits = SKILLS.flatMap((skill) => ascendantTraitEnabled(skills, skill.id) ? [ASCENDANT_TRAITS[skill.id]] : []);
  return (
    <div className="dragon-magic-skills">
      <aside className="dragon-magic-skillIndex" aria-label="Character skills">
        <div className="dragon-magic-character"><strong>Level {skills.characterLevel.toLocaleString()}</strong><span>{skills.perkPoints} perk {skills.perkPoints === 1 ? "point" : "points"}</span></div>
        {SKILLS.map((skill) => {
          const entry = skills.skills[skill.id];
          const next = skillXpForNextRank(entry.level);
          const fraction = entry.level >= MAX_SKILL_LEVEL ? 100 : next > 0 ? entry.xp / next * 100 : 0;
          return (
            <button type="button" className="dragon-magic-skillRow" data-active={skill.id === selectedSkillId} style={{ "--skill-accent": skill.accent } as CSSProperties} onClick={() => setSelectedSkillId(skill.id)} key={skill.id}>
              <strong>{skill.name}</strong><b>{entry.level}</b><span className="dragon-magic-skillTrack"><i style={{ width: `${Math.min(100, fraction)}%` }} /></span><small>{entry.level >= MAX_SKILL_LEVEL ? "MASTERED" : `${Math.floor(entry.xp).toLocaleString()} / ${next.toLocaleString()} XP`}</small>
            </button>
          );
        })}
        <section className="dragon-magic-effects" aria-label="Passives and active effects">
          <strong>Passives &amp; Effects</strong>
          {enabledTraits.map((trait) => <div key={`trait:${trait.skillId}`}><b>{trait.name}</b><small>PASSIVE</small><p>{trait.description}</p></div>)}
          {activeEffects.map((effect) => <div className={effect.harmful ? "harmful" : ""} key={`effect:${effect.id}`}><b>{effect.name}</b><small>{effect.remainingSeconds === null ? "PASSIVE" : `${Math.max(1, Math.ceil(effect.remainingSeconds))}s`}</small><p>{effect.description}</p></div>)}
          {!enabledTraits.length && !activeEffects.length ? <p className="dragon-magic-effects-empty">Timed food, potion, spell, poison, fire, equipment, and mastered-trait effects appear here and on the compact world HUD.</p> : null}
        </section>
      </aside>
      <article className="dragon-magic-skillDetail" style={{ "--skill-accent": definition.accent } as CSSProperties}>
        <span className="dragon-magic-eyebrow">{definition.practice}</span><h3>{`${definition.name} ${progress.level}`}</h3><p className="dragon-magic-skillLead">{definition.description} Each point adds exactly 1% to this skill’s base output; perks remain separate, explicit modifiers.</p>
        <div className="dragon-magic-multiplier"><strong>{`${skillMultiplier(progress.level).toFixed(2)}×`}</strong><span>base effectiveness · {progress.level >= MAX_SKILL_LEVEL ? "mastered" : `${Math.ceil(Math.max(0, needed - progress.xp)).toLocaleString()} XP to next rank`}</span></div>
        <span className="dragon-magic-eyebrow">PERK BRANCH · EXTENSIBLE</span>
        <div className="dragon-magic-perkTree">
          {selectedPerks.map((perk) => {
            const unlocked = skills.unlockedPerkIds.includes(perk.id);
            const prerequisitesMet = perk.prerequisites.every((id) => skills.unlockedPerkIds.includes(id));
            const canUnlock = !unlocked && progress.level >= perk.requiredLevel && prerequisitesMet && skills.perkPoints >= perk.cost;
            return <section className="dragon-magic-perk" data-unlocked={unlocked} key={perk.id}><div><strong>{perk.name} · Rank {perk.requiredLevel}</strong><p>{perk.description}{perk.prerequisites.length ? ` Requires ${perk.prerequisites.map((id) => PERKS.find((entry) => entry.id === id)?.name ?? id).join(", ")}.` : ""}</p></div><button type="button" disabled={!canUnlock} onClick={() => onUnlockPerk?.(perk.id)}>{unlocked ? "Learned" : `${perk.cost} point${perk.cost === 1 ? "" : "s"}`}</button></section>;
          })}
        </div>
        <section className="dragon-magic-ascendant"><h4>{ascendant.name} · {masteryCount}/{SKILLS.length} disciplines mastered</h4><p>{ascendant.description} Each discipline unlocks its own Ascendant trait at rank 1000; no unrelated mastery is required.</p><button type="button" disabled={progress.level < MAX_SKILL_LEVEL} onClick={() => onToggleAscendant?.(!ascendantEnabled, selectedSkillId)}>{ascendantEnabled ? `Disable ${ascendant.name}` : progress.level >= MAX_SKILL_LEVEL ? `Enable ${ascendant.name}` : `${definition.name} 1000 required`}</button></section>
      </article>
    </div>
  );
}

export function DragonMagicPanel({
  magic,
  skills,
  activeEffects,
  initialTab = "spells",
  onClose,
  onSelectSpell,
  onToggleFavorite,
  onUnlockPerk,
  onToggleAscendant,
}: DragonMagicPanelProps) {
  const titleId = useId();
  const [tab, setTab] = useState<DragonMagicTab>(initialTab);
  const magicLevel = skills.skills.magic.level;
  return (
    <section className="dragon-magic-root dragon-magic-shell" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <DragonMagicStyles />
      <header className="dragon-magic-header">
        <div><span className="dragon-magic-eyebrow">DRAGONHEART ARCANUM · REUSABLE FIELD CODEX</span><h2 id={titleId}>{tab === "spells" ? "Spell Journal" : "Skills & Perks"}</h2></div>
        <div className="dragon-magic-status" data-attuned={magic.attuned}><i aria-hidden="true" /><span>{magic.attuned ? `${magicLevel >= MAX_SKILL_LEVEL ? "Mastered magic" : `${Math.floor(magic.mana)} / ${Math.floor(magic.maxMana)} mana`} · Q casts` : "Learn now · attune through the Dragonwake Accord"}</span></div>
        {onClose ? <button className="dragon-magic-close" type="button" onClick={onClose} aria-label="Close magic journal">×</button> : null}
      </header>
      <nav className="dragon-magic-tabs" role="tablist" aria-label="Character journal sections"><button type="button" role="tab" aria-selected={tab === "spells"} onClick={() => setTab("spells")}>Spells</button><button type="button" role="tab" aria-selected={tab === "skills"} onClick={() => setTab("skills")}>Skills</button></nav>
      <div className="dragon-magic-body">{tab === "spells" ? <SpellJournal magic={magic} onSelectSpell={onSelectSpell} onToggleFavorite={onToggleFavorite} /> : <SkillJournal skills={skills} activeEffects={activeEffects} onUnlockPerk={onUnlockPerk} onToggleAscendant={onToggleAscendant} />}</div>
    </section>
  );
}

export function SpellWheelPanel({ open, magic, onSelectSpell, onClose }: SpellWheelPanelProps) {
  if (!open) return null;
  const slots = spellWheelSlots(magic);
  const selected = SPELLS.find((spell) => spell.id === magic.selectedSpellId) ?? (slots[0] ? SPELLS.find((spell) => spell.id === slots[0].spellId) : null);
  return (
    <section className="dragon-magic-root dragon-magic-wheelOverlay" role="dialog" aria-modal="true" aria-label="Favorite spell wheel" onPointerDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <DragonMagicStyles />
      <div className="dragon-magic-wheel">
        <button type="button" className="dragon-magic-wheelDismiss" onClick={onClose}>Release Q</button>
        {slots.length ? slots.map((slot) => {
          const spell = SPELLS.find((entry) => entry.id === slot.spellId)!;
          const presentation = SCHOOL_PRESENTATION[spell.school];
          const style = { "--wheel-left": `${50 + slot.x * 40}%`, "--wheel-top": `${50 + slot.y * 40}%`, "--spell-accent": presentation.accent } as CSSProperties;
          return <button type="button" role="menuitemradio" aria-checked={slot.selected} className="dragon-magic-wheelSlot" data-selected={slot.selected} style={style} key={slot.spellId} onPointerEnter={() => onSelectSpell(slot.spellId)} onFocus={() => onSelectSpell(slot.spellId)} onClick={() => { onSelectSpell(slot.spellId); onClose(); }}><b aria-hidden="true">{presentation.glyph}</b><span>{spell.name}</span></button>;
        }) : <div className="dragon-magic-wheelEmpty"><p>No favorites yet.<br />Open the Spell Journal and place up to ten learned spells on this wheel.</p></div>}
        <div className="dragon-magic-wheelCenter"><kbd>Q</kbd><strong>{selected?.name ?? "Spell Wheel"}</strong><small aria-label={`${slots.length} of ${MAX_FAVORITE_SPELLS} favorites`}>{`${slots.length} / ${MAX_FAVORITE_SPELLS} favorites · release to close`}</small></div>
      </div>
    </section>
  );
}

export function ManaHud({ magic, magicSkillLevel }: ManaHudProps) {
  if (!shouldShowManaBar(magic, magicSkillLevel)) return null;
  const fraction = magic.maxMana > 0 ? Math.max(0, Math.min(100, magic.mana / magic.maxMana * 100)) : 0;
  return <div className="dragon-magic-root dragon-magic-manaHud" style={{ "--mana-fill": `${fraction}%` } as CSSProperties} aria-label={`${Math.floor(magic.mana)} of ${Math.floor(magic.maxMana)} mana`}><DragonMagicStyles /><div><i /></div><small>{Math.floor(magic.mana)} / {Math.floor(magic.maxMana)} MANA</small></div>;
}
