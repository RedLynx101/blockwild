import { useId } from "react";
import {
  GOLEM_RECIPES,
  normalizeGolemForgeState,
  type GolemForgeState,
  type GolemType,
} from "./v1-cultures";

export type GolemForgeInventory = Readonly<Record<string, number>>;

export type GolemForgePanelView = Readonly<{
  selectedType: GolemType;
  recipe: (typeof GOLEM_RECIPES)[GolemType];
  blueprintUnlocked: boolean;
  missingResources: readonly Readonly<{ id: string; required: number; available: number }>[];
  missingMana: number;
  activeType: GolemType | null;
  progress: number;
  secondsRemaining: number;
  canStart: boolean;
  completedCount: number;
}>;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}

export function golemResourceName(id: string) {
  return id
    .split("-")
    .map((word) => word ? `${word[0].toUpperCase()}${word.slice(1)}` : word)
    .join(" ");
}

export function golemForgePanelView(
  state: GolemForgeState,
  selectedType: GolemType,
  inventory: GolemForgeInventory,
): GolemForgePanelView {
  const safe = normalizeGolemForgeState(state);
  const recipe = GOLEM_RECIPES[selectedType];
  const missingResources = Object.entries(recipe.resources)
    .map(([id, required]) => ({ id, required, available: Math.max(0, Math.floor(inventory[id] ?? 0)) }))
    .filter((resource) => resource.available < resource.required);
  const activeRecipe = safe.job ? GOLEM_RECIPES[safe.job.golemType] : null;
  const progress = safe.job && activeRecipe
    ? clamp(safe.job.progressSeconds / Math.max(1, activeRecipe.seconds), 0, 1)
    : 0;
  return {
    selectedType,
    recipe,
    blueprintUnlocked: safe.unlockedBlueprintIds.includes(recipe.blueprintId),
    missingResources,
    missingMana: Math.max(0, recipe.manaCost - safe.storedMana),
    activeType: safe.job?.golemType ?? null,
    progress,
    secondsRemaining: safe.job && activeRecipe ? Math.max(0, Math.ceil(activeRecipe.seconds - safe.job.progressSeconds)) : 0,
    canStart: !safe.job
      && safe.completed.length === 0
      && safe.unlockedBlueprintIds.includes(recipe.blueprintId)
      && safe.storedMana >= recipe.manaCost
      && missingResources.length === 0,
    completedCount: safe.completed.length,
  };
}

export type GolemForgePanelProps = Readonly<{
  state: GolemForgeState;
  inventory: GolemForgeInventory;
  selectedType: GolemType;
  availablePlayerMana: number;
  onSelectType: (type: GolemType) => void;
  onChargeMana: (amount: number) => void;
  onStart: (type: GolemType) => void;
  onClaim: (index: number) => void;
  onClose?: () => void;
}>;

const GOLEM_TYPE_ORDER = Object.freeze(Object.keys(GOLEM_RECIPES) as GolemType[]);

const GOLEM_DESCRIPTIONS: Readonly<Record<GolemType, string>> = Object.freeze({
  "copper-scout": "A nimble utility automaton for scouting roads and carrying a modest load.",
  "stone-bulwark": "A patient stone-and-brass defender built to hold a gate or protect its keeper.",
  "aetherforged-sentinel": "A towering guardian whose aether core projects heavy arcane force.",
  "deepgear-courser": "A piston-legged brass mount built for steep hold roads and long overland journeys.",
});

const GOLEM_GLYPHS: Readonly<Record<GolemType, string>> = Object.freeze({
  "copper-scout": "C",
  "stone-bulwark": "B",
  "aetherforged-sentinel": "A",
  "deepgear-courser": "D",
});

export function GolemForgePanel({
  state,
  inventory,
  selectedType,
  availablePlayerMana,
  onSelectType,
  onChargeMana,
  onStart,
  onClaim,
  onClose,
}: GolemForgePanelProps) {
  const safe = normalizeGolemForgeState(state);
  const titleId = useId();
  const view = golemForgePanelView(safe, selectedType, inventory);
  const activeRecipe = view.activeType ? GOLEM_RECIPES[view.activeType] : null;
  const playerMana = Math.max(0, Math.floor(availablePlayerMana));
  const chargeAmount = Math.min(playerMana, Math.max(0, view.missingMana));
  const displayedMana = safe.job ? safe.job.manaCommitted : safe.storedMana;

  return (
    <section className="golem-forge-panel" aria-labelledby={titleId} data-golem-forge>
      <header className="golem-forge-header">
        <div>
          <span className="golem-forge-eyebrow">Deepgear craft - mana and mechanism</span>
          <h2 id={titleId}>Golem Forge</h2>
          <p>Learn a blueprint, commit the parts, then feed the cradle enough mana to wake its core.</p>
        </div>
        <div className="golem-forge-header-status">
          <span>{safe.job ? "Forge working" : safe.completed.length ? "Automaton ready" : "Cradle idle"}</span>
          {onClose ? <button type="button" onClick={onClose} aria-label="Close Golem Forge">x</button> : null}
        </div>
      </header>

      <div className="golem-forge-layout">
        <nav className="golem-forge-blueprints" aria-label="Golem blueprints">
          <h3>Blueprint ledger</h3>
          {GOLEM_TYPE_ORDER.map((type) => {
            const recipe = GOLEM_RECIPES[type];
            const unlocked = safe.unlockedBlueprintIds.includes(recipe.blueprintId);
            return (
              <button
                key={type}
                type="button"
                className={`golem-forge-blueprint${type === selectedType ? " selected" : ""}${unlocked ? "" : " locked"}`}
                aria-pressed={type === selectedType}
                onClick={() => onSelectType(type)}
              >
                <span className="golem-forge-blueprint-glyph" aria-hidden="true">{unlocked ? GOLEM_GLYPHS[type] : "L"}</span>
                <span>
                  <strong>{recipe.name}</strong>
                  <small>{unlocked ? `${recipe.manaCost} mana - ${recipe.seconds} sec` : "Blueprint required"}</small>
                </span>
              </button>
            );
          })}
        </nav>

        <article className="golem-forge-workbench" aria-live="polite">
          <div className="golem-forge-selection-heading">
            <div>
              <span>Selected construction</span>
              <h3>{view.recipe.name}</h3>
            </div>
            <span className={`golem-forge-plan-stamp${view.blueprintUnlocked ? " learned" : ""}`}>
              {view.blueprintUnlocked ? "Plan learned" : "Plan locked"}
            </span>
          </div>
          <p>{GOLEM_DESCRIPTIONS[selectedType]}</p>

          {!view.blueprintUnlocked ? (
            <div className="golem-forge-lock-note" role="status">
              <span aria-hidden="true">L</span>
              <div><strong>Blueprint not learned</strong><small>Read the {view.recipe.name} blueprint before committing materials.</small></div>
            </div>
          ) : null}

          <section className="golem-forge-resource-board" aria-labelledby={`${titleId}-materials`}>
            <h4 id={`${titleId}-materials`}>Assembly parts</h4>
            <ul>
              {Object.entries(view.recipe.resources).map(([id, required]) => {
                const available = Math.max(0, Math.floor(inventory[id] ?? 0));
                const ready = available >= required;
                return (
                  <li key={id} className={ready ? "ready" : "missing"}>
                    <span aria-hidden="true">{ready ? "OK" : "--"}</span>
                    <div><strong>{golemResourceName(id)}</strong><small>{available} / {required}</small></div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="golem-forge-mana-bank" aria-label="Mana bank">
            <div>
              <span>{safe.job ? "Mana committed" : "Forge reserve"}</span>
              <strong>{displayedMana} / {view.recipe.manaCost} mana</strong>
              <small>{playerMana} mana available to commit</small>
            </div>
            <div className="golem-forge-mana-actions">
              <button type="button" disabled={playerMana < 1 || safe.job !== null} onClick={() => onChargeMana(Math.min(25, playerMana))}>Commit 25</button>
              <button type="button" disabled={chargeAmount < 1 || safe.job !== null} onClick={() => onChargeMana(chargeAmount)}>Fill reserve</button>
            </div>
          </section>

          <button
            className="golem-forge-start"
            type="button"
            disabled={!view.canStart}
            onClick={() => onStart(selectedType)}
          >
            {safe.job ? "Cradle occupied" : safe.completed.length ? "Claim finished automaton" : "Begin construction"}
          </button>
        </article>

        <aside className="golem-forge-cradle" aria-label="Construction cradle and finished automatons">
          <div className={`golem-forge-machine${safe.job ? " working" : ""}`} aria-hidden="true">
            <i className="golem-forge-gantry" />
            <i className="golem-forge-core" />
            <span>{activeRecipe ? GOLEM_GLYPHS[activeRecipe.type] : safe.completed.length ? GOLEM_GLYPHS[safe.completed[0]] : "-"}</span>
          </div>
          <div className="golem-forge-progress-copy">
            <small>{safe.job ? "Current assembly" : "Forge cradle"}</small>
            <strong>{activeRecipe?.name ?? (safe.completed.length ? "Assembly complete" : "Empty")}</strong>
            <span className="golem-forge-progress" aria-label={`${Math.round(view.progress * 100)} percent complete`}>
              <i style={{ width: `${view.progress * 100}%` }} />
            </span>
            <span>{safe.job ? `${view.secondsRemaining} sec remaining` : safe.completed.length ? "Core stable - ready to claim" : "Awaiting a learned plan"}</span>
          </div>
          <div className="golem-forge-output-list">
            <h4>Finished automatons</h4>
            {safe.completed.length ? safe.completed.map((type, index) => (
              <button key={`${type}-${index}`} type="button" onClick={() => onClaim(index)}>
                <span aria-hidden="true">{GOLEM_GLYPHS[type]}</span>
                <span><strong>{GOLEM_RECIPES[type].name}</strong><small>Claim into a bound capture orb</small></span>
              </button>
            )) : <p>No finished golems waiting.</p>}
          </div>
        </aside>
      </div>
    </section>
  );
}
