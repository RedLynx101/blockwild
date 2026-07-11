"use client";

import type { ReactNode } from "react";
import { DRAGON_DAYS_PER_STAGE, DRAGON_TICKS_PER_DAY, dragonCargoSlots, type DragonCommand, type DragonStage, type DragonState } from "./dragons";

export type DragonPanelProps = Readonly<{
  dragon: DragonState;
  displayName: string;
  portrait?: ReactNode;
  onClose: () => void;
  onCommand: (command: DragonCommand) => void;
  onToggleShoulder: () => void;
  onHarvestScales: () => void;
  onOpenCargo: () => void;
}>;

const COMMANDS: readonly Readonly<{ id: DragonCommand; label: string; detail: string }>[] = [
  { id: "follow", label: "Follow", detail: "Fly in formation and return if separated." },
  { id: "stay", label: "Stay", detail: "Hold this ground and defend nearby allies." },
  { id: "guard-lair", label: "Guard", detail: "Patrol the bonded home and its eggs." },
  { id: "wander", label: "Roam", detail: "Explore nearby airspace without leaving home." },
];

const DRAGON_STAGE_ROMAN: Readonly<Record<DragonStage, string>> = {
  1: "I",
  2: "II",
  3: "III",
  4: "IV",
  5: "V",
};

function titleCase(value: string) {
  return value.split("-").map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(" ");
}

export function DragonPanel({ dragon, displayName, portrait, onClose, onCommand, onToggleShoulder, onHarvestScales, onOpenCargo }: DragonPanelProps) {
  const ageDays = dragon.ageTicks / DRAGON_TICKS_PER_DAY;
  const stageStart = (dragon.stage - 1) * DRAGON_DAYS_PER_STAGE;
  const stageProgress = dragon.stage === 5 ? 1 : Math.max(0, Math.min(1, (ageDays - stageStart) / DRAGON_DAYS_PER_STAGE));
  const chestCount = dragon.equipment.chests.filter(Boolean).length;
  const armored = Object.values(dragon.equipment.armor).filter(Boolean).length;
  return (
    <section className={`dragon-care-shell dragon-care-${dragon.type}`} aria-labelledby="dragon-care-title">
      <style>{DRAGON_PANEL_CSS}</style>
      <div className="dragon-care-panel">
        <header>
          <div><span>{dragon.type.toUpperCase()} DRAGON · STAGE {dragon.stage}</span><h2 id="dragon-care-title">{displayName}</h2><p>{titleCase(dragon.sex)} · {Math.floor(ageDays)} days old · {dragon.tamed ? "Bonded companion" : "Wild guardian"}</p></div>
          <button type="button" onClick={onClose} aria-label="Close dragon care">×</button>
        </header>
        <div className="dragon-care-grid">
          <aside>
            <div className="dragon-care-portrait">{portrait ?? <span aria-hidden="true">◆</span>}<i aria-label={`Stage ${dragon.stage}`}>{DRAGON_STAGE_ROMAN[dragon.stage]}</i></div>
            <div className="dragon-care-health"><span><b>VITALITY</b><em>{Math.ceil(dragon.health)} / {dragon.maxHealth}</em></span><i><b style={{ width: `${Math.max(0, Math.min(100, dragon.health / Math.max(1, dragon.maxHealth) * 100))}%` }} /></i></div>
            <div className="dragon-care-growth"><span><b>AGE TIER</b><em>{dragon.stage === 5 ? "Elder growth" : `${Math.round(stageProgress * 100)}% to Stage ${dragon.stage + 1}`}</em></span><i><b style={{ width: `${stageProgress * 100}%` }} /></i></div>
            <p className="dragon-care-note">Stage 1 dragons can perch on a keeper. Stage 3 and older dragons can carry a saddle, two panniers, armor, and a rider.</p>
          </aside>
          <main>
            <section className="dragon-care-section"><div className="dragon-care-heading"><span>ORDERS</span><small>{dragon.command.replace("-", " ").toUpperCase()}</small></div><div className="dragon-care-commands">{COMMANDS.map((command) => <button type="button" key={command.id} className={dragon.command === command.id ? "active" : ""} onClick={() => onCommand(command.id)} disabled={!dragon.tamed}><b>{command.label}</b><small>{command.detail}</small></button>)}</div></section>
            <section className="dragon-care-section"><div className="dragon-care-heading"><span>FIELD GEAR</span><small>{dragon.stage >= 3 ? "FLIGHT READY" : "HATCHLING FIT"}</small></div><div className="dragon-care-equipment"><div><i>♢</i><span><b>SADDLE</b><small>{dragon.equipment.saddle ? "Dragonflight rig fitted" : "Empty"}</small></span></div><div><i>▣</i><span><b>PANNIERS</b><small>{chestCount}/2 fitted · {dragonCargoSlots(dragon)} slots</small></span></div><div><i>⬟</i><span><b>ARMOR</b><small>{armored}/4 plates fitted</small></span></div></div></section>
            <section className="dragon-care-section dragon-care-reserve"><div><span>SCALE RESERVE</span><strong>{dragon.scaleReserve}</strong><small>One recoverable scale grows roughly every three world days after Stage 1.</small></div><button type="button" onClick={onHarvestScales} disabled={!dragon.tamed || dragon.scaleReserve <= 0}>Collect scales</button></section>
            <div className="dragon-care-actions"><button type="button" onClick={onToggleShoulder} disabled={!dragon.tamed || dragon.stage !== 1}>{dragon.onShoulder ? "Set down from shoulder" : "Carry on shoulder"}</button><button type="button" onClick={onOpenCargo} disabled={!dragon.tamed || chestCount === 0}>Open panniers</button></div>
          </main>
        </div>
        <footer><span><kbd>Z</kbd> MELEE</span><span><kbd>X</kbd> BREATH</span><span><kbd>C</kbd> RANGED</span><span><kbd>SPACE</kbd> ASCEND</span><span><kbd>SHIFT</kbd> DESCEND</span><span><kbd>F</kbd> DISMOUNT</span></footer>
      </div>
    </section>
  );
}

const DRAGON_PANEL_CSS = `
.dragon-care-shell{position:fixed;inset:0;z-index:44;display:grid;place-items:center;padding:clamp(12px,3vw,36px);background:radial-gradient(circle at 50% 18%,rgba(68,47,67,.78),rgba(7,9,10,.94));color:#f4ead8;font-family:var(--font-pixel,monospace)}
.dragon-care-panel{width:min(1080px,96vw);max-height:92vh;overflow:auto;border:3px solid #87644e;outline:1px solid #d5b37c;background:linear-gradient(145deg,rgba(30,25,27,.98),rgba(13,17,19,.99));box-shadow:0 24px 80px #000,0 0 54px color-mix(in srgb,var(--dragon-glow,#d65f3c) 24%,transparent)}
.dragon-care-fire{--dragon-glow:#ef6840;--dragon-soft:#6f3028}.dragon-care-ice{--dragon-glow:#78d9f3;--dragon-soft:#294d66}.dragon-care-steel{--dragon-glow:#b5c8cc;--dragon-soft:#46545c}
.dragon-care-panel>header{display:flex;justify-content:space-between;gap:20px;padding:20px 24px;border-bottom:2px solid #725747;background:linear-gradient(90deg,color-mix(in srgb,var(--dragon-soft) 74%,#171419),#171719)}
.dragon-care-panel header span,.dragon-care-heading span,.dragon-care-reserve span{color:var(--dragon-glow);letter-spacing:.16em;font-size:12px}.dragon-care-panel h2{margin:4px 0 2px;font:700 clamp(28px,5vw,54px)/.95 Georgia,serif;text-shadow:3px 3px #000}.dragon-care-panel header p{margin:7px 0 0;color:#bfb5a7}.dragon-care-panel header>button{align-self:flex-start;width:42px;height:42px;border:1px solid #9b7b62;background:#2c2525;color:#fff;font-size:29px;cursor:pointer}
.dragon-care-grid{display:grid;grid-template-columns:minmax(250px,.82fr) minmax(400px,1.75fr);gap:0}.dragon-care-grid>aside{padding:22px;border-right:2px solid #5e4a3f;background:linear-gradient(#201a1e,#151719)}.dragon-care-grid>main{padding:22px;display:grid;gap:16px}
.dragon-care-portrait{position:relative;display:grid;place-items:center;min-height:270px;overflow:hidden;border:2px solid #846754;background:radial-gradient(circle,var(--dragon-soft),#101315 68%)}.dragon-care-portrait>span{font-size:112px;color:var(--dragon-glow);filter:drop-shadow(0 0 24px var(--dragon-glow));transform:rotate(18deg)}.dragon-care-portrait>i{position:absolute;right:12px;bottom:9px;color:#fff8;letter-spacing:.3em}.dragon-care-portrait canvas,.dragon-care-portrait img,.dragon-care-portrait>div{width:100%!important;height:100%!important;min-height:270px;object-fit:contain}.dragon-care-portrait>img{transform:scale(1.18);transform-origin:center}
.dragon-care-health,.dragon-care-growth{margin-top:15px}.dragon-care-health>span,.dragon-care-growth>span{display:flex;justify-content:space-between;gap:8px;font-size:11px}.dragon-care-health em,.dragon-care-growth em{font-style:normal;color:#c9c0b5}.dragon-care-health>i,.dragon-care-growth>i{display:block;height:10px;margin-top:5px;border:1px solid #776252;background:#0b0d0e}.dragon-care-health>i b,.dragon-care-growth>i b{display:block;height:100%;background:linear-gradient(90deg,var(--dragon-soft),var(--dragon-glow))}.dragon-care-note{font:13px/1.55 Georgia,serif;color:#baaFA4}
.dragon-care-section{border:1px solid #665248;background:#18191a;padding:14px}.dragon-care-heading{display:flex;justify-content:space-between;margin-bottom:10px}.dragon-care-heading small{color:#a79a8f}.dragon-care-commands{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.dragon-care-commands button{padding:10px;text-align:left;border:1px solid #534944;background:#242223;color:#dfd4c5;cursor:pointer}.dragon-care-commands button.active{border-color:var(--dragon-glow);box-shadow:inset 4px 0 var(--dragon-glow)}.dragon-care-commands b,.dragon-care-commands small{display:block}.dragon-care-commands small{margin-top:3px;color:#999088;line-height:1.3}.dragon-care-commands button:disabled{opacity:.42}
.dragon-care-equipment{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.dragon-care-equipment>div{display:flex;align-items:center;gap:9px;padding:10px;background:#212223;border:1px solid #514944}.dragon-care-equipment i{font-size:25px;color:var(--dragon-glow)}.dragon-care-equipment b,.dragon-care-equipment small{display:block}.dragon-care-equipment small{color:#a79d91;margin-top:3px}
.dragon-care-reserve{display:flex;align-items:center;justify-content:space-between;gap:16px}.dragon-care-reserve strong{display:inline-block;margin:0 12px;font-size:24px;color:#fff}.dragon-care-reserve small{display:block;margin-top:5px;color:#aaa095}.dragon-care-reserve button,.dragon-care-actions button{padding:11px 14px;border:1px solid #b28b69;background:linear-gradient(#59483e,#352f2c);color:#fff;cursor:pointer}.dragon-care-reserve button:disabled,.dragon-care-actions button:disabled{opacity:.36;cursor:not-allowed}.dragon-care-actions{display:flex;gap:10px;justify-content:flex-end}
.dragon-care-panel>footer{display:flex;flex-wrap:wrap;justify-content:center;gap:10px 18px;padding:12px;border-top:2px solid #5e4a3f;background:#101314;color:#bcb0a2;font-size:11px}.dragon-care-panel kbd{padding:3px 6px;border:1px solid #786253;background:#272425;color:var(--dragon-glow)}
@media(max-width:760px){.dragon-care-grid{grid-template-columns:1fr}.dragon-care-grid>aside{border-right:0;border-bottom:2px solid #5e4a3f}.dragon-care-portrait{min-height:190px}.dragon-care-equipment{grid-template-columns:1fr}.dragon-care-commands{grid-template-columns:1fr}.dragon-care-actions{flex-direction:column}}
`;
