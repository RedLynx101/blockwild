"use client";

import {
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import Image from "next/image";
import {
  parseChunkKey,
  type CartographySession,
  type FastTravelChannel,
  type FastTravelMode,
  type MapKnowledge,
  type MapMarker,
  type MapMarkerKind,
  type WorldPoint,
} from "./map-system";
import {
  questAvailability,
  type QuestAvailability,
  type QuestBook,
  type QuestDefinition,
  type QuestKind,
  type QuestObjective,
} from "./quests";
import { hasBlueprint, type BlueprintState } from "./blueprints";
import type {
  AlchemyRecipe,
  AlchemyStandState,
  DistilleryRecipe,
  DistilleryState,
  RecipeIngredient,
  ResourceInventory,
} from "./alchemy";
import {
  bankBalanceWholeGold,
  COMMERCE_CATALOG,
  compareGold,
  quoteMerchantTrade,
  STOCKS,
  STOCK_SYMBOLS,
  stockPortfolioValueGold,
  type BankAccountState,
  type CommerceItem,
  type GoldAmount,
  type GoldWalletState,
  type MerchantStack,
  type MerchantState,
  type MerchantTradeDirection,
  type StockMarketState,
  type StockSymbol,
} from "./economy";
import { FACTIONS, factionStanding, type FactionId, type FactionStanding } from "./factions";
import {
  findRoleWaypoint,
  type ResidentProfession,
  type SettlementResident,
  type SettlementState,
} from "./settlements";

type PanelHeaderProps = Readonly<{
  eyebrow: string;
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  titleId: string;
  onClose?: () => void;
}>;

function PanelHeader({ eyebrow, title, subtitle, meta, titleId, onClose }: PanelHeaderProps) {
  return (
    <header className="hearthroads-panel-header mc-window-header">
      <div className="hearthroads-panel-heading">
        <span className="panel-eyebrow">{eyebrow}</span>
        <h2 id={titleId}>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {meta ? <div className="hearthroads-header-meta">{meta}</div> : null}
      {onClose ? (
        <button className="panel-close" type="button" onClick={onClose} aria-label={`Close ${title}`}>
          ×
        </button>
      ) : null}
    </header>
  );
}

function PanelShell({
  className,
  labelledBy,
  children,
}: Readonly<{ className: string; labelledBy: string; children: ReactNode }>) {
  return (
    <section
      className={`hearthroads-panel mc-window ${className}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      {children}
    </section>
  );
}

function formatCount(value: number | string) {
  try {
    return BigInt(value).toLocaleString("en-US");
  } catch {
    return String(value);
  }
}

function prettyId(value: string) {
  return value
    .replace(/[-_]+/gu, " ")
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function positiveInteger(value: string | number, fallback = 1) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : fallback;
}

const MARKER_META: Readonly<Record<MapMarkerKind, Readonly<{ icon: string; label: string }>>> = {
  "natural-poi": { icon: "◆", label: "Discovered place" },
  manual: { icon: "✦", label: "Personal marker" },
  "bed-spawn": { icon: "⌂", label: "Bed spawn" },
  wayshrine: { icon: "♜", label: "Wayshrine" },
};

const SEMANTIC_MARKER_ICONS: Readonly<Record<string, string>> = {
  poi: "◆",
  town: "⌂",
  pin: "✦",
  bed: "⌂",
  wayshrine: "♜",
};

function markerGlyph(marker: MapMarker) {
  if (!marker.icon) return MARKER_META[marker.kind].icon;
  return SEMANTIC_MARKER_ICONS[marker.icon] ?? (marker.icon.length <= 2 ? marker.icon : MARKER_META[marker.kind].icon);
}

type MapBounds = Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>;

function mapBounds(state: MapKnowledge, currentPosition: WorldPoint): MapBounds {
  const explored = state.exploredChunks.map(parseChunkKey).filter((entry) => entry !== null);
  const markerChunks = state.markers.map((marker) => ({
    x: Math.floor(marker.position.x / 16),
    z: Math.floor(marker.position.z / 16),
  }));
  const current = { x: Math.floor(currentPosition.x / 16), z: Math.floor(currentPosition.z / 16) };
  const points = [...explored, ...markerChunks, current];
  const xs = points.map((point) => point.x);
  const zs = points.map((point) => point.z);
  return {
    minX: Math.min(...xs) - 1,
    maxX: Math.max(...xs) + 1,
    minZ: Math.min(...zs) - 1,
    maxZ: Math.max(...zs) + 1,
  };
}

function mapPointStyle(position: Pick<WorldPoint, "x" | "z">, bounds: MapBounds): CSSProperties {
  const chunkX = position.x / 16;
  const chunkZ = position.z / 16;
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxZ - bounds.minZ);
  return {
    left: `${clamp((chunkX - bounds.minX) / width, 0, 1) * 100}%`,
    top: `${clamp((chunkZ - bounds.minZ) / height, 0, 1) * 100}%`,
  };
}

function channelMessage(channel: FastTravelChannel | null, remainingSeconds: number) {
  if (!channel) return "Choose a discovered destination to prepare a journey.";
  if (channel.status === "completed") return "The road is ready. Arriving now…";
  if (channel.status === "cancelled") {
    return channel.cancelledReason === "damaged"
      ? "Travel cancelled because you were hurt."
      : "Travel cancelled because you moved.";
  }
  return `Hold still and stay safe for ${Math.max(0, remainingSeconds).toFixed(1)} seconds.`;
}

export type MapPanelProps = Readonly<{
  knowledge: MapKnowledge;
  currentPosition: WorldPoint;
  selectedMarkerId: string | null;
  onSelectMarker: (markerId: string) => void;
  onAddManualMarker: (name: string, position: WorldPoint) => void;
  onRemoveManualMarker: (markerId: string) => void;
  onRenameMarker: (markerId: string, name: string) => void;
  onBeginFastTravel: (marker: MapMarker, mode: FastTravelMode) => void;
  onCancelFastTravel?: () => void;
  fastTravelChannel?: FastTravelChannel | null;
  fastTravelElapsedSeconds?: number;
  currentWayshrineId?: string | null;
  cartographySession?: CartographySession | null;
  onShareCartography?: () => void;
  onClose?: () => void;
}>;

export function MapPanel({
  knowledge,
  currentPosition,
  selectedMarkerId,
  onSelectMarker,
  onAddManualMarker,
  onRemoveManualMarker,
  onRenameMarker,
  onBeginFastTravel,
  onCancelFastTravel,
  fastTravelChannel = null,
  fastTravelElapsedSeconds = 0,
  currentWayshrineId = null,
  cartographySession = null,
  onShareCartography,
  onClose,
}: MapPanelProps) {
  const titleId = useId();
  const manualMarkerInputId = useId();
  const renameInputId = useId();
  const [markerName, setMarkerName] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const bounds = useMemo(() => mapBounds(knowledge, currentPosition), [knowledge, currentPosition]);
  const selected = knowledge.markers.find((marker) => marker.id === selectedMarkerId) ?? null;
  const explored = knowledge.exploredChunks.map(parseChunkKey).filter((entry) => entry !== null);
  const viewWidth = Math.max(1, bounds.maxX - bounds.minX + 1);
  const viewHeight = Math.max(1, bounds.maxZ - bounds.minZ + 1);
  const remainingChannelSeconds = fastTravelChannel
    ? fastTravelChannel.durationSeconds - fastTravelElapsedSeconds
    : 0;
  const channelProgress = fastTravelChannel
    ? fastTravelChannel.status === "completed"
      ? 1
      : clamp(fastTravelElapsedSeconds / fastTravelChannel.durationSeconds, 0, 1)
    : 0;
  const isChanneling = fastTravelChannel?.status === "channeling";
  const destinationIsChargeEligible = selected !== null && selected.kind !== "manual";
  const destinationIsShrineEligible = selected?.kind === "wayshrine"
    && currentWayshrineId !== null
    && currentWayshrineId !== selected.id;

  const submitManualMarker = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanName = markerName.trim();
    if (!cleanName) return;
    onAddManualMarker(cleanName, currentPosition);
    setMarkerName("");
  };

  const submitRename = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanName = renameValue.trim();
    if (!selected || !cleanName) return;
    onRenameMarker(selected.id, cleanName);
    setRenameValue("");
  };

  return (
    <PanelShell className="hearthroads-map-panel" labelledBy={titleId}>
      <PanelHeader
        eyebrow="Field map · M"
        title="Known Roads"
        subtitle="The parchment grows as new chunks reach your horizon."
        titleId={titleId}
        onClose={onClose}
        meta={(
          <div className="hearthroads-travel-purse" aria-label={`${knowledge.fastTravelCharges} banked fast travel charges`}>
            <span aria-hidden="true">✧</span>
            <strong>{knowledge.fastTravelCharges}</strong>
            <small>banked journeys</small>
          </div>
        )}
      />

      <div className="hearthroads-map-layout">
        <div className="hearthroads-map-workspace">
          <div className="hearthroads-map-canvas" aria-label={`Map with ${knowledge.exploredChunks.length} explored chunks`}>
            <svg
              className="hearthroads-map-terrain"
              viewBox={`0 0 ${viewWidth} ${viewHeight}`}
              preserveAspectRatio="none"
              role="img"
              aria-label="Explored world chunks"
            >
              <title>Explored world chunks</title>
              {explored.map((chunk) => (
                <rect
                  className="hearthroads-map-chunk"
                  key={`${chunk.x},${chunk.z}`}
                  x={chunk.x - bounds.minX}
                  y={chunk.z - bounds.minZ}
                  width="1"
                  height="1"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
            <span
              className="hearthroads-player-pin"
              style={mapPointStyle(currentPosition, bounds)}
              aria-label="Your current position"
              title="You are here"
            >
              <i aria-hidden="true">▲</i>
            </span>
            {knowledge.markers.map((marker) => (
              <button
                className={`hearthroads-map-pin marker-${marker.kind}${selected?.id === marker.id ? " selected" : ""}`}
                key={marker.id}
                type="button"
                style={mapPointStyle(marker.position, bounds)}
                onClick={() => onSelectMarker(marker.id)}
                aria-label={`${MARKER_META[marker.kind].label}: ${marker.name}`}
                aria-pressed={selected?.id === marker.id}
                title={marker.name}
              >
                <span aria-hidden="true">{markerGlyph(marker)}</span>
              </button>
            ))}
            {knowledge.exploredChunks.length === 0 ? (
              <p className="hearthroads-map-empty">Step beyond camp and the first lines will find the page.</p>
            ) : null}
          </div>
          <div className="hearthroads-map-legend" aria-label="Map legend">
            {Object.entries(MARKER_META).map(([kind, entry]) => (
              <span key={kind}><i aria-hidden="true">{entry.icon}</i>{entry.label}</span>
            ))}
          </div>
        </div>

        <aside className="hearthroads-map-inspector" aria-label="Selected map location">
          {selected ? (
            <>
              <div className="hearthroads-location-heading">
                <span className={`hearthroads-location-sigil marker-${selected.kind}`} aria-hidden="true">
                  {markerGlyph(selected)}
                </span>
                <div>
                  <small>{MARKER_META[selected.kind].label}</small>
                  <h3>{selected.name}</h3>
                </div>
              </div>
              <dl className="hearthroads-location-facts">
                <div><dt>East / west</dt><dd>{Math.round(selected.position.x)}</dd></div>
                <div><dt>North / south</dt><dd>{Math.round(selected.position.z)}</dd></div>
                <div><dt>Elevation</dt><dd>{Math.round(selected.position.y)}</dd></div>
              </dl>

              {selected.kind === "wayshrine" ? (
                <form className="hearthroads-inline-form" onSubmit={submitRename}>
                  <label htmlFor={renameInputId}>Rename this wayshrine</label>
                  <div>
                    <input
                      className="pixel-input"
                      id={renameInputId}
                      value={renameValue}
                      onChange={(event) => setRenameValue(event.target.value)}
                      placeholder={selected.name}
                      maxLength={48}
                    />
                    <button className="pixel-button secondary-button" type="submit" disabled={!renameValue.trim()}>
                      Rename
                    </button>
                  </div>
                </form>
              ) : null}

              <div className="hearthroads-travel-actions">
                <button
                  className="pixel-button gold-button"
                  type="button"
                  disabled={!destinationIsChargeEligible || knowledge.fastTravelCharges < 1 || Boolean(isChanneling)}
                  onClick={() => onBeginFastTravel(selected, "map-charge")}
                >
                  Travel · 1 charge
                </button>
                {destinationIsShrineEligible ? (
                  <button
                    className="pixel-button secondary-button"
                    type="button"
                    disabled={Boolean(isChanneling)}
                    onClick={() => onBeginFastTravel(selected, "wayshrine-network")}
                  >
                    Wayshrine path · Free
                  </button>
                ) : null}
                {selected.kind === "manual" ? (
                  <button
                    className="hearthroads-text-button danger-button"
                    type="button"
                    onClick={() => onRemoveManualMarker(selected.id)}
                  >
                    Remove personal marker
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <div className="hearthroads-selection-empty">
              <span aria-hidden="true">⌁</span>
              <h3>Choose a mark</h3>
              <p>Select a place on the parchment to inspect it or prepare a journey.</p>
            </div>
          )}

          <div className="hearthroads-channel" data-status={fastTravelChannel?.status ?? "idle"} aria-live="polite">
            <div className="hearthroads-channel-copy">
              <strong>{isChanneling ? "Finding the road" : "Fast travel"}</strong>
              <span>{channelMessage(fastTravelChannel, remainingChannelSeconds)}</span>
            </div>
            <span className="hearthroads-progress-track" aria-hidden="true">
              <i style={{ width: `${channelProgress * 100}%` }} />
            </span>
            {isChanneling && onCancelFastTravel ? (
              <button type="button" onClick={onCancelFastTravel}>Cancel journey</button>
            ) : null}
          </div>

          <form className="hearthroads-manual-marker" onSubmit={submitManualMarker}>
            <label htmlFor={manualMarkerInputId}>Mark where you stand</label>
            <div>
              <input
                className="pixel-input"
                id={manualMarkerInputId}
                value={markerName}
                onChange={(event) => setMarkerName(event.target.value)}
                placeholder="Camp, bridge, old oak…"
                maxLength={48}
              />
              <button className="pixel-button secondary-button" type="submit" disabled={!markerName.trim()}>
                Add
              </button>
            </div>
          </form>

          {cartographySession ? (
            <section className="hearthroads-cartography-share" aria-labelledby={`${titleId}-cartography`}>
              <div>
                <small id={`${titleId}-cartography`}>Cartography table</small>
                <strong>{cartographySession.participants.length} / 2 seats filled</strong>
              </div>
              <p>Two seated players can safely merge explored chunks and discovered places. Beds and travel charges stay private.</p>
              <button
                className="pixel-button secondary-button"
                type="button"
                disabled={cartographySession.participants.length !== 2 || !onShareCartography}
                onClick={onShareCartography}
              >
                Share both maps
              </button>
            </section>
          ) : null}
        </aside>
      </div>
    </PanelShell>
  );
}

function objectiveTarget(objective: QuestObjective) {
  if (objective.kind === "survive-day") return objective.targetDay;
  if (objective.kind === "discover-town") return 1;
  return objective.count;
}

function statusLabel(status: QuestAvailability) {
  if (status === "ready") return "Ready to turn in";
  if (status === "available") return "Available";
  if (status === "active") return "In progress";
  return status[0].toUpperCase() + status.slice(1);
}

function questFailureReason(book: QuestBook, questId: string) {
  return book.failed.find((entry) => entry.questId === questId)?.reason ?? null;
}

function rewardSummary(definition: QuestDefinition) {
  const rewards: string[] = [];
  if (definition.rewards.gold > 0) rewards.push(`${formatCount(definition.rewards.gold)} gold`);
  for (const item of definition.rewards.items) rewards.push(`${item.count} × ${prettyId(item.itemId)}`);
  for (const blueprint of definition.rewards.blueprints) rewards.push(`Blueprint: ${prettyId(blueprint)}`);
  for (const [faction, amount] of Object.entries(definition.rewards.factionAlignment)) {
    rewards.push(`${amount >= 0 ? "+" : ""}${amount} ${prettyId(faction)} alignment`);
  }
  return rewards;
}

export type QuestPanelProps = Readonly<{
  book: QuestBook;
  definitions: readonly QuestDefinition[];
  selectedQuestId?: string | null;
  onSelectQuest?: (questId: string) => void;
  activeTab?: QuestKind;
  onTabChange?: (tab: QuestKind) => void;
  onAccept: (questId: string) => void;
  onPin: (questId: string | null) => void;
  onAbandon: (questId: string) => void;
  onTurnIn: (questId: string) => void;
  onClose?: () => void;
}>;

export function QuestPanel({
  book,
  definitions,
  selectedQuestId,
  onSelectQuest,
  activeTab,
  onTabChange,
  onAccept,
  onPin,
  onAbandon,
  onTurnIn,
  onClose,
}: QuestPanelProps) {
  const titleId = useId();
  const [localTab, setLocalTab] = useState<QuestKind>("main");
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);
  const tab = activeTab ?? localTab;
  const visibleDefinitions = definitions.filter((definition) => definition.kind === tab);
  const fallbackSelected = visibleDefinitions.find((definition) => book.active.some((active) => active.questId === definition.id))
    ?? visibleDefinitions[0]
    ?? null;
  const selectedId = selectedQuestId === undefined ? localSelectedId : selectedQuestId;
  const selected = visibleDefinitions.find((definition) => definition.id === selectedId) ?? fallbackSelected;
  const active = selected ? book.active.find((entry) => entry.questId === selected.id) ?? null : null;
  const availability = selected ? questAvailability(book, selected) : null;
  const rewards = selected ? rewardSummary(selected) : [];

  const selectTab = (nextTab: QuestKind) => {
    setLocalTab(nextTab);
    onTabChange?.(nextTab);
    setLocalSelectedId(null);
  };

  const selectQuest = (questId: string) => {
    setLocalSelectedId(questId);
    onSelectQuest?.(questId);
  };

  return (
    <PanelShell className="hearthroads-quest-panel" labelledBy={titleId}>
      <PanelHeader
        eyebrow="Wayfarer journal"
        title="Quests"
        subtitle="Main roads branch; side roads can be left behind."
        titleId={titleId}
        onClose={onClose}
        meta={<span className="hearthroads-quest-count">{book.active.length} active</span>}
      />

      <nav className="hearthroads-journal-tabs inventory-tabs" aria-label="Quest categories">
        {(["main", "side"] as const).map((kind) => (
          <button
            className={tab === kind ? "active" : ""}
            key={kind}
            type="button"
            onClick={() => selectTab(kind)}
            aria-current={tab === kind ? "page" : undefined}
          >
            {kind === "main" ? "Main story" : "Side quests"}
          </button>
        ))}
      </nav>

      <div className="hearthroads-journal-layout">
        <div className="hearthroads-quest-list" role="list" aria-label={`${tab} quests`}>
          {visibleDefinitions.map((definition) => {
            const status = questAvailability(book, definition);
            const isPinned = book.pinnedQuestId === definition.id;
            return (
              <button
                className={`hearthroads-quest-row status-${status}${selected?.id === definition.id ? " selected" : ""}`}
                key={definition.id}
                type="button"
                onClick={() => selectQuest(definition.id)}
                aria-pressed={selected?.id === definition.id}
              >
                <span className="hearthroads-quest-knot" aria-hidden="true">{isPinned ? "✦" : status === "completed" ? "✓" : "◇"}</span>
                <span>
                  <strong>{definition.name}</strong>
                  <small>{statusLabel(status)}</small>
                </span>
              </button>
            );
          })}
          {visibleDefinitions.length === 0 ? (
            <div className="hearthroads-list-empty">
              <strong>No {tab === "main" ? "story chapters" : "side quests"} yet</strong>
              <span>New paths will appear as you meet people and explore.</span>
            </div>
          ) : null}
        </div>

        <article className="hearthroads-quest-detail" aria-live="polite">
          {selected && availability ? (
            <>
              <header>
                <span className={`hearthroads-status-ribbon status-${availability}`}>{statusLabel(availability)}</span>
                <h3>{selected.name}</h3>
                <p>{selected.summary}</p>
              </header>

              <section className="hearthroads-objectives" aria-labelledby={`${titleId}-objectives`}>
                <h4 id={`${titleId}-objectives`}>What remains</h4>
                <ol>
                  {selected.objectives.map((objective) => {
                    const progress = active?.objectiveProgress[objective.id] ?? (availability === "completed" ? objectiveTarget(objective) : 0);
                    const target = objectiveTarget(objective);
                    const complete = progress >= target;
                    return (
                      <li className={complete ? "complete" : ""} key={objective.id}>
                        <span aria-hidden="true">{complete ? "✓" : "○"}</span>
                        <div>
                          <strong>{objective.label}</strong>
                          <small>{Math.min(progress, target)} / {target}</small>
                          <span className="hearthroads-progress-track" aria-hidden="true">
                            <i style={{ width: `${clamp(progress / Math.max(1, target), 0, 1) * 100}%` }} />
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>

              {availability === "locked" ? (
                <section className="hearthroads-prerequisites">
                  <h4>Earlier roads</h4>
                  <p>
                    {selected.prerequisites?.allOf?.length
                      ? `Complete ${selected.prerequisites.allOf.map((id) => definitions.find((entry) => entry.id === id)?.name ?? prettyId(id)).join(", ")}.`
                      : "Keep following the story to reveal this branch."}
                  </p>
                </section>
              ) : null}

              {availability === "failed" ? (
                <p className="hearthroads-quest-failure">{questFailureReason(book, selected.id) ?? "This road has closed."}</p>
              ) : null}

              <section className="hearthroads-quest-rewards" aria-labelledby={`${titleId}-rewards`}>
                <h4 id={`${titleId}-rewards`}>Reward</h4>
                {rewards.length ? (
                  <ul>{rewards.map((reward) => <li key={reward}>{reward}</li>)}</ul>
                ) : <p>The next road opens.</p>}
              </section>

              <footer className="hearthroads-quest-actions">
                {availability === "available" || (availability === "abandoned" && selected.kind === "side") ? (
                  <button className="pixel-button gold-button" type="button" onClick={() => onAccept(selected.id)}>
                    Accept quest
                  </button>
                ) : null}
                {active ? (
                  <button
                    className="pixel-button secondary-button"
                    type="button"
                    aria-pressed={book.pinnedQuestId === selected.id}
                    onClick={() => onPin(book.pinnedQuestId === selected.id ? null : selected.id)}
                  >
                    {book.pinnedQuestId === selected.id ? "Unpin quest" : "Pin to journey"}
                  </button>
                ) : null}
                {availability === "ready" ? (
                  <button className="pixel-button gold-button" type="button" onClick={() => onTurnIn(selected.id)}>
                    {selected.giver ? "Hand in to quest giver" : "Claim reward"}
                  </button>
                ) : null}
                {active && selected.kind === "side" && selected.abandonable !== false ? (
                  <button className="hearthroads-text-button danger-button" type="button" onClick={() => onAbandon(selected.id)}>
                    Abandon side quest
                  </button>
                ) : null}
              </footer>
            </>
          ) : (
            <div className="hearthroads-selection-empty">
              <span aria-hidden="true">⌁</span>
              <h3>No road selected</h3>
            </div>
          )}
        </article>
      </div>
    </PanelShell>
  );
}

export type HearthroadsStationKind = "alchemy" | "distillery";
type StationRecipe = AlchemyRecipe | DistilleryRecipe;
type StationState = AlchemyStandState | DistilleryState;

function stationDuration(recipe: StationRecipe) {
  return "brewSeconds" in recipe ? recipe.brewSeconds : recipe.fermentSeconds;
}

function ingredientStatus(ingredient: RecipeIngredient, inventory: ResourceInventory) {
  const available = inventory[ingredient.item] ?? 0;
  return {
    available,
    ready: ingredient.consume === false ? available > 0 : available >= ingredient.count,
  };
}

export type StationPanelProps = Readonly<{
  kind: HearthroadsStationKind;
  state: StationState;
  recipes: readonly StationRecipe[];
  inventory: ResourceInventory;
  blueprints?: BlueprintState;
  lockReasonByRecipeId?: Readonly<Record<string, string>>;
  onSelectRecipe: (recipeId: string) => void;
  onStartBatch: (recipeId: string) => void;
  onCollectOutput: () => void;
  onClose?: () => void;
}>;

export function StationPanel({
  kind,
  state,
  recipes,
  inventory,
  blueprints,
  lockReasonByRecipeId = {},
  onSelectRecipe,
  onStartBatch,
  onCollectOutput,
  onClose,
}: StationPanelProps) {
  const titleId = useId();
  const selected = recipes.find((recipe) => recipe.id === state.selectedRecipeId) ?? recipes[0] ?? null;
  const activeRecipe = state.activeBatch
    ? recipes.find((recipe) => recipe.id === state.activeBatch?.recipeId) ?? null
    : null;
  const progress = state.activeBatch
    ? clamp(state.activeBatch.progressSeconds / Math.max(1, state.activeBatch.durationSeconds), 0, 1)
    : 0;
  const selectedLocked = Boolean(selected?.blueprintId)
    && (blueprints ? !hasBlueprint(blueprints, selected?.blueprintId ?? "") : Boolean(lockReasonByRecipeId[selected?.id ?? ""]));
  const ingredientsReady = selected?.inputs.every((ingredient) => ingredientStatus(ingredient, inventory).ready) ?? false;
  const stationName = kind === "alchemy" ? "Alchemy Stand" : "Distillery";

  return (
    <PanelShell className={`hearthroads-station-panel station-${kind}`} labelledBy={titleId}>
      <PanelHeader
        eyebrow={kind === "alchemy" ? "Bottles & remedies" : "Slow craft · barrel batch"}
        title={stationName}
        subtitle={kind === "alchemy" ? "Choose a draught, gather the ingredients, and let it settle." : "Set a recipe, load a batch, and give it time to become itself."}
        titleId={titleId}
        onClose={onClose}
        meta={state.activeBatch ? <span className="hearthroads-batch-status">Batch working</span> : <span className="hearthroads-batch-status idle">Ready</span>}
      />

      <div className="hearthroads-station-layout">
        <nav className="hearthroads-recipe-ledger" aria-label={`${stationName} recipes`}>
          {recipes.map((recipe) => {
            const locked = Boolean(recipe.blueprintId)
              && (blueprints ? !hasBlueprint(blueprints, recipe.blueprintId ?? "") : Boolean(lockReasonByRecipeId[recipe.id]));
            return (
              <button
                className={`hearthroads-station-recipe${selected?.id === recipe.id ? " selected" : ""}${locked ? " locked" : ""}`}
                key={recipe.id}
                type="button"
                onClick={() => onSelectRecipe(recipe.id)}
                aria-pressed={selected?.id === recipe.id}
              >
                <span className="hearthroads-recipe-vial" aria-hidden="true">{locked ? "⌑" : kind === "alchemy" ? "⚗" : "◉"}</span>
                <span>
                  <strong>{recipe.name}</strong>
                  <small>{locked ? "Blueprint needed" : `${stationDuration(recipe)} sec · ${recipe.output.count} made`}</small>
                </span>
              </button>
            );
          })}
        </nav>

        <article className="hearthroads-station-workspace" aria-live="polite">
          {selected ? (
            <>
              <header>
                <span>{kind === "alchemy" ? "Selected formula" : "Selected batch"}</span>
                <h3>{selected.name}</h3>
                <p>{selected.description}</p>
              </header>

              {selectedLocked ? (
                <div className="hearthroads-blueprint-lock" role="status">
                  <span aria-hidden="true">⌑</span>
                  <div>
                    <strong>Recipe not learned</strong>
                    <p>{lockReasonByRecipeId[selected.id] ?? `Read the ${prettyId(selected.blueprintId ?? "required blueprint")} blueprint first.`}</p>
                  </div>
                </div>
              ) : null}

              <section className="hearthroads-ingredient-board" aria-labelledby={`${titleId}-ingredients`}>
                <h4 id={`${titleId}-ingredients`}>Ingredients</h4>
                <ul>
                  {selected.inputs.map((ingredient) => {
                    const status = ingredientStatus(ingredient, inventory);
                    return (
                      <li className={status.ready ? "ready" : "missing"} key={ingredient.item}>
                        <span className="hearthroads-ingredient-icon" aria-hidden="true">{status.ready ? "✓" : "·"}</span>
                        <span><strong>{prettyId(ingredient.item)}</strong><small>{ingredient.consume === false ? "nearby source" : `${status.available} / ${ingredient.count}`}</small></span>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <div className="hearthroads-station-flow" aria-label={`Produces ${selected.output.count} ${prettyId(selected.output.item)}`}>
                <span>{selected.inputs.length} inputs</span>
                <i aria-hidden="true">→</i>
                <strong>{selected.output.count} × {prettyId(selected.output.item)}</strong>
              </div>

              <button
                className="pixel-button gold-button"
                type="button"
                disabled={selectedLocked || !ingredientsReady || Boolean(state.activeBatch) || Boolean(state.output)}
                onClick={() => onStartBatch(selected.id)}
              >
                {kind === "alchemy" ? "Brew formula" : "Begin fermentation"}
              </button>
            </>
          ) : <p>No recipes are available at this station yet.</p>}
        </article>

        <aside className="hearthroads-station-output" aria-label="Batch and output">
          <div className="hearthroads-station-apparatus" data-active={Boolean(state.activeBatch)} aria-hidden="true">
            <span>{kind === "alchemy" ? "⚗" : "◉"}</span>
            <i />
          </div>
          <div className="hearthroads-batch-readout">
            <small>{state.activeBatch ? "Current batch" : "Batch cradle"}</small>
            <strong>{activeRecipe?.name ?? "Empty"}</strong>
            <span className="hearthroads-progress-track" aria-hidden="true"><i style={{ width: `${progress * 100}%` }} /></span>
            <span>{state.activeBatch ? `${Math.ceil(state.activeBatch.durationSeconds - state.activeBatch.progressSeconds)} sec remaining` : "Ready for ingredients"}</span>
          </div>
          <div className={`hearthroads-output-slot${state.output ? " filled" : ""}`}>
            <small>Finished output</small>
            {state.output ? (
              <strong>{state.output.count} × {prettyId(state.output.item)}</strong>
            ) : <span>Nothing bottled yet</span>}
          </div>
          <button
            className="pixel-button secondary-button"
            type="button"
            disabled={!state.output}
            onClick={onCollectOutput}
          >
            Collect output
          </button>
        </aside>
      </div>
    </PanelShell>
  );
}

export type SentientDialogueChoice = Readonly<{
  id: string;
  label: string;
  description?: string;
  badge?: string;
  disabled?: boolean;
  tone?: "warm" | "plain" | "warning";
}>;

export type SentientDialoguePanelProps = Readonly<{
  character: Readonly<{
    id: string;
    name: string;
    factionId: Exclude<FactionId, "player">;
    factionName?: string;
    profession: string;
    portraitUrl?: string | null;
    alignment: number;
    standing?: FactionStanding;
  }>;
  greeting: string;
  body?: string;
  choices: readonly SentientDialogueChoice[];
  onChoose: (choiceId: string) => void;
  onClose?: () => void;
}>;

export function SentientDialoguePanel({ character, greeting, body, choices, onChoose, onClose }: SentientDialoguePanelProps) {
  const titleId = useId();
  const standing = character.standing ?? factionStanding(character.alignment);
  const factionName = character.factionName ?? FACTIONS[character.factionId].name;
  const alignmentPercent = clamp((character.alignment + 100) / 200, 0, 1) * 100;

  return (
    <PanelShell className="hearthroads-dialogue-panel" labelledBy={titleId}>
      <PanelHeader
        eyebrow={`${factionName} · ${prettyId(character.profession)}`}
        title={character.name}
        subtitle={`${prettyId(standing)} standing`}
        titleId={titleId}
        onClose={onClose}
      />
      <div className="hearthroads-dialogue-layout">
        <figure className="hearthroads-dialogue-portrait">
          {character.portraitUrl ? <Image src={character.portraitUrl} width={360} height={360} unoptimized alt={`${character.name}, ${character.profession}`} /> : (
            <span aria-hidden="true">{character.name.slice(0, 1).toUpperCase()}</span>
          )}
          <figcaption>
            <span>{standing}</span>
            <span className="hearthroads-alignment-track" aria-label={`Alignment ${character.alignment}`}>
              <i style={{ width: `${alignmentPercent}%` }} />
            </span>
          </figcaption>
        </figure>
        <div className="hearthroads-dialogue-copy" aria-live="polite">
          <blockquote>“{greeting}”</blockquote>
          {body ? <p>{body}</p> : null}
        </div>
        <nav className="hearthroads-dialogue-choices" aria-label={`Talk to ${character.name}`}>
          {choices.map((choice) => (
            <button
              className={`hearthroads-dialogue-choice tone-${choice.tone ?? "plain"}`}
              key={choice.id}
              type="button"
              disabled={choice.disabled}
              onClick={() => onChoose(choice.id)}
            >
              <span><strong>{choice.label}</strong>{choice.description ? <small>{choice.description}</small> : null}</span>
              {choice.badge ? <b>{choice.badge}</b> : <i aria-hidden="true">›</i>}
            </button>
          ))}
          {choices.length === 0 ? <p>They have nothing more to say just now.</p> : null}
        </nav>
      </div>
    </PanelShell>
  );
}

function fallbackCommerceItem(itemKey: string): CommerceItem {
  return { key: itemKey, name: prettyId(itemKey), category: "misc", baseValue: 1, stackLimit: 64 };
}

function stackCount(stacks: readonly MerchantStack[], itemKey: string) {
  return stacks.filter((stack) => stack.itemKey === itemKey).reduce((total, stack) => total + stack.count, 0);
}

export type TradePanelProps = Readonly<{
  merchant: MerchantState;
  playerGold: GoldAmount;
  playerInventory: readonly MerchantStack[];
  catalog?: Readonly<Record<string, CommerceItem>>;
  direction?: MerchantTradeDirection;
  onDirectionChange?: (direction: MerchantTradeDirection) => void;
  selectedItemKey?: string | null;
  onSelectItem?: (itemKey: string) => void;
  quantity?: number;
  onQuantityChange?: (quantity: number) => void;
  onTrade: (itemKey: string, quantity: number, direction: MerchantTradeDirection) => void;
  merchantName?: string;
  onClose?: () => void;
}>;

export function TradePanel({
  merchant,
  playerGold,
  playerInventory,
  catalog = {},
  direction,
  onDirectionChange,
  selectedItemKey,
  onSelectItem,
  quantity,
  onQuantityChange,
  onTrade,
  merchantName = "Local merchant",
  onClose,
}: TradePanelProps) {
  const titleId = useId();
  const quantityId = useId();
  const [localDirection, setLocalDirection] = useState<MerchantTradeDirection>("player-buys");
  const [localItemKey, setLocalItemKey] = useState<string | null>(null);
  const [localQuantity, setLocalQuantity] = useState(1);
  const activeDirection = direction ?? localDirection;
  const sourceStacks = activeDirection === "player-buys" ? merchant.inventory : playerInventory;
  const uniqueStacks = useMemo(() => {
    const counts = new Map<string, number>();
    for (const stack of sourceStacks) counts.set(stack.itemKey, (counts.get(stack.itemKey) ?? 0) + stack.count);
    return [...counts].map(([itemKey, count]) => ({ itemKey, count }));
  }, [sourceStacks]);
  const activeItemKey = selectedItemKey === undefined ? localItemKey : selectedItemKey;
  const selectedStack = uniqueStacks.find((stack) => stack.itemKey === activeItemKey) ?? uniqueStacks[0] ?? null;
  const itemCatalog = { ...COMMERCE_CATALOG, ...merchant.customCatalog, ...catalog };
  const selectedItem = selectedStack ? itemCatalog[selectedStack.itemKey] ?? fallbackCommerceItem(selectedStack.itemKey) : null;
  const activeQuantity = quantity ?? localQuantity;
  const quote = selectedItem ? quoteMerchantTrade(merchant, selectedItem, activeQuantity, activeDirection) : { unitPrice: 0, total: "0" };
  const playerHasItems = selectedStack ? stackCount(playerInventory, selectedStack.itemKey) >= activeQuantity : false;
  const merchantHasItems = selectedStack ? stackCount(merchant.inventory, selectedStack.itemKey) >= activeQuantity : false;
  const canAfford = activeDirection === "player-buys"
    ? compareGold(playerGold, quote.total) >= 0 && merchantHasItems
    : compareGold(merchant.gold, quote.total) >= 0 && playerHasItems;

  const changeDirection = (next: MerchantTradeDirection) => {
    setLocalDirection(next);
    onDirectionChange?.(next);
    setLocalItemKey(null);
  };

  const selectItem = (itemKey: string) => {
    setLocalItemKey(itemKey);
    onSelectItem?.(itemKey);
  };

  const changeQuantity = (next: number) => {
    const safe = positiveInteger(next);
    setLocalQuantity(safe);
    onQuantityChange?.(safe);
  };

  const submitTrade = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedStack && canAfford) onTrade(selectedStack.itemKey, activeQuantity, activeDirection);
  };

  return (
    <PanelShell className="hearthroads-trade-panel" labelledBy={titleId}>
      <PanelHeader
        eyebrow={`${FACTIONS[merchant.factionId].name} market · ${prettyId(merchant.profession)}`}
        title={`Trade with ${merchantName}`}
        subtitle="Buy what they carry, or offer anything from your pack. Demand changes the price."
        titleId={titleId}
        onClose={onClose}
        meta={(
          <div className="hearthroads-purse-pair">
            <span>You <strong>{formatCount(playerGold)}</strong></span>
            <span>Merchant <strong>{formatCount(merchant.gold)}</strong></span>
          </div>
        )}
      />
      <div className="hearthroads-trade-tabs inventory-tabs" role="tablist" aria-label="Trade direction">
        <button className={activeDirection === "player-buys" ? "active" : ""} type="button" role="tab" aria-selected={activeDirection === "player-buys"} onClick={() => changeDirection("player-buys")}>Buy</button>
        <button className={activeDirection === "player-sells" ? "active" : ""} type="button" role="tab" aria-selected={activeDirection === "player-sells"} onClick={() => changeDirection("player-sells")}>Sell</button>
      </div>
      <div className="hearthroads-trade-layout">
        <div className="hearthroads-trade-inventory" role="list" aria-label={activeDirection === "player-buys" ? "Merchant inventory" : "Your sellable inventory"}>
          {uniqueStacks.map((stack) => {
            const item = itemCatalog[stack.itemKey] ?? fallbackCommerceItem(stack.itemKey);
            const preview = quoteMerchantTrade(merchant, item, 1, activeDirection);
            return (
              <button
                className={`hearthroads-trade-row${selectedStack?.itemKey === stack.itemKey ? " selected" : ""}`}
                key={stack.itemKey}
                type="button"
                onClick={() => selectItem(stack.itemKey)}
                aria-pressed={selectedStack?.itemKey === stack.itemKey}
              >
                <span className="hearthroads-item-stamp" aria-hidden="true">{item.name.slice(0, 1)}</span>
                <span><strong>{item.name}</strong><small>{prettyId(item.category)} · {stack.count} available</small></span>
                <b>{preview.unitPrice}g</b>
              </button>
            );
          })}
          {uniqueStacks.length === 0 ? <p className="hearthroads-list-empty">Nothing is available on this side of the counter.</p> : null}
        </div>
        <form className="hearthroads-trade-counter" onSubmit={submitTrade}>
          {selectedItem && selectedStack ? (
            <>
              <div className="hearthroads-trade-focus">
                <span className="hearthroads-item-stamp large" aria-hidden="true">{selectedItem.name.slice(0, 1)}</span>
                <div><small>{prettyId(selectedItem.category)}</small><h3>{selectedItem.name}</h3></div>
              </div>
              <dl className="hearthroads-price-breakdown">
                <div><dt>Unit price</dt><dd>{quote.unitPrice} gold</dd></div>
                <div><dt>{activeDirection === "player-buys" ? "In their stock" : "In your pack"}</dt><dd>{selectedStack.count}</dd></div>
              </dl>
              <label htmlFor={quantityId}>Quantity</label>
              <input
                className="pixel-input"
                id={quantityId}
                type="number"
                inputMode="numeric"
                min={1}
                max={Math.max(1, selectedStack.count)}
                value={activeQuantity}
                onChange={(event) => changeQuantity(Number(event.target.value))}
              />
              <div className="hearthroads-trade-total" aria-live="polite">
                <span>Total</span><strong>{formatCount(quote.total)} gold</strong>
              </div>
              {!canAfford ? (
                <p className="hearthroads-trade-warning">
                  {activeDirection === "player-buys" ? "You need more gold or the merchant is short on stock." : "The merchant cannot cover that offer or you are short on items."}
                </p>
              ) : null}
              <button className="pixel-button gold-button" type="submit" disabled={!canAfford}>
                {activeDirection === "player-buys" ? "Buy from merchant" : "Sell to merchant"}
              </button>
            </>
          ) : <p>Choose an item to set it on the counter.</p>}
        </form>
      </div>
    </PanelShell>
  );
}

export type HobbitBankPanelProps = Readonly<{
  account: BankAccountState;
  wallet: GoldWalletState;
  market: StockMarketState;
  worldDay: number;
  transferAmount?: string;
  onTransferAmountChange?: (amount: string) => void;
  onDeposit: (amount: GoldAmount) => void;
  onWithdraw: (amount: GoldAmount) => void;
  selectedStock?: StockSymbol;
  onSelectStock?: (symbol: StockSymbol) => void;
  stockAmount?: string;
  onStockAmountChange?: (amount: string) => void;
  onBuyStock: (symbol: StockSymbol, shares: GoldAmount) => void;
  onSellStock: (symbol: StockSymbol, shares: GoldAmount) => void;
  bankerName?: string;
  onClose?: () => void;
}>;

export function HobbitBankPanel({
  account,
  wallet,
  market,
  worldDay,
  transferAmount,
  onTransferAmountChange,
  onDeposit,
  onWithdraw,
  selectedStock,
  onSelectStock,
  stockAmount,
  onStockAmountChange,
  onBuyStock,
  onSellStock,
  bankerName = "the town banker",
  onClose,
}: HobbitBankPanelProps) {
  const titleId = useId();
  const transferId = useId();
  const stockAmountId = useId();
  const [localTransfer, setLocalTransfer] = useState("1");
  const [localStockAmount, setLocalStockAmount] = useState("1");
  const [localStock, setLocalStock] = useState<StockSymbol>(STOCK_SYMBOLS[0]);
  const activeTransfer = transferAmount ?? localTransfer;
  const activeStockAmount = stockAmount ?? localStockAmount;
  const activeStock = selectedStock ?? localStock;
  const transferGold = String(positiveInteger(activeTransfer));
  const shareCount = String(positiveInteger(activeStockAmount));
  const quote = market.quotes[activeStock];
  const bankBalance = bankBalanceWholeGold(account);
  const portfolioValue = stockPortfolioValueGold(market);
  const purchaseTotal = (BigInt(quote.priceGold) * BigInt(shareCount)).toString();
  const canDeposit = compareGold(wallet.balance, transferGold) >= 0;
  const canWithdraw = compareGold(bankBalance, transferGold) >= 0;
  const canBuy = compareGold(wallet.balance, purchaseTotal) >= 0;
  const canSell = compareGold(market.holdings[activeStock], shareCount) >= 0;

  const changeTransfer = (value: string) => {
    setLocalTransfer(value);
    onTransferAmountChange?.(value);
  };
  const changeStockAmount = (value: string) => {
    setLocalStockAmount(value);
    onStockAmountChange?.(value);
  };
  const changeStock = (symbol: StockSymbol) => {
    setLocalStock(symbol);
    onSelectStock?.(symbol);
  };

  return (
    <PanelShell className="hearthroads-bank-panel" labelledBy={titleId}>
      <PanelHeader
        eyebrow="Hobbit freehold bank"
        title="Gold & Ventures"
        subtitle={`${bankerName} keeps exact ledgers. Deposits earn 5% each world day.`}
        titleId={titleId}
        onClose={onClose}
        meta={<span className="hearthroads-bank-day">Market day {worldDay}</span>}
      />
      <div className="hearthroads-bank-layout">
        <section className="hearthroads-bank-ledger" aria-labelledby={`${titleId}-ledger`}>
          <h3 id={`${titleId}-ledger`}>Deposit ledger</h3>
          <div className="hearthroads-bank-balances">
            <div><small>Gold wallet</small><strong>{formatCount(wallet.balance)}</strong></div>
            <div><small>Bank deposit</small><strong>{formatCount(bankBalance)}</strong></div>
          </div>
          <p className="hearthroads-interest-note"><span aria-hidden="true">↗</span><strong>5% daily compound interest</strong><small>Last posted on day {account.lastInterestDay}. No deposit cap or withdrawal fee.</small></p>
          <div className="hearthroads-bank-transfer">
            <label htmlFor={transferId}>Whole gold</label>
            <input className="pixel-input" id={transferId} type="number" inputMode="numeric" min={1} value={activeTransfer} onChange={(event) => changeTransfer(event.target.value)} />
            <div>
              <button className="pixel-button gold-button" type="button" disabled={!canDeposit} onClick={() => onDeposit(transferGold)}>Deposit</button>
              <button className="pixel-button secondary-button" type="button" disabled={!canWithdraw} onClick={() => onWithdraw(transferGold)}>Withdraw</button>
            </div>
          </div>
        </section>

        <section className="hearthroads-stock-board" aria-labelledby={`${titleId}-stocks`}>
          <header><div><span>Freehold exchange</span><h3 id={`${titleId}-stocks`}>Local ventures</h3></div><p>Portfolio <strong>{formatCount(portfolioValue)}g</strong></p></header>
          <div className="hearthroads-stock-tape" role="list" aria-label="Stock quotes">
            {STOCK_SYMBOLS.map((symbol) => {
              const stock = STOCKS[symbol];
              const stockQuote = market.quotes[symbol];
              const change = stockQuote.lastChangeBasisPoints / 100;
              return (
                <button className={`hearthroads-stock-row${activeStock === symbol ? " selected" : ""}`} key={symbol} type="button" onClick={() => changeStock(symbol)} aria-pressed={activeStock === symbol}>
                  <b>{symbol}</b>
                  <span><strong>{stock.name}</strong><small>{stockQuote.splitCount ? `${stockQuote.splitCount} splits` : "No splits"}</small></span>
                  <span><strong>{stockQuote.priceGold}g</strong><small className={change >= 0 ? "gain" : "loss"}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</small></span>
                </button>
              );
            })}
          </div>
          <div className="hearthroads-stock-order">
            <div><small>{activeStock}</small><h4>{STOCKS[activeStock].name}</h4><p>{STOCKS[activeStock].description}</p></div>
            <dl><div><dt>Share price</dt><dd>{quote.priceGold}g</dd></div><div><dt>You hold</dt><dd>{formatCount(market.holdings[activeStock])}</dd></div></dl>
            <label htmlFor={stockAmountId}>Shares</label>
            <input className="pixel-input" id={stockAmountId} type="number" inputMode="numeric" min={1} value={activeStockAmount} onChange={(event) => changeStockAmount(event.target.value)} />
            <p className="hearthroads-order-total">Order value <strong>{formatCount(purchaseTotal)}g</strong></p>
            <div>
              <button className="pixel-button gold-button" type="button" disabled={!canBuy} onClick={() => onBuyStock(activeStock, shareCount)}>Buy shares</button>
              <button className="pixel-button secondary-button" type="button" disabled={!canSell} onClick={() => onSellStock(activeStock, shareCount)}>Sell shares</button>
            </div>
          </div>
        </section>
      </div>
    </PanelShell>
  );
}

function ownerLabel(factionId: FactionId) {
  return FACTIONS[factionId].name;
}

function livingByProfession(settlement: SettlementState) {
  const roles = new Map<ResidentProfession, SettlementResident[]>();
  for (const resident of settlement.residents) {
    if (!resident.alive) continue;
    const residents = roles.get(resident.profession) ?? [];
    roles.set(resident.profession, [...residents, resident]);
  }
  return [...roles.entries()].sort(([left], [right]) => left.localeCompare(right));
}

export type SettlementPanelProps = Readonly<{
  settlement: SettlementState;
  settlementName?: string;
  alignment: number;
  selectedProfession?: ResidentProfession | null;
  onSelectProfession?: (profession: ResidentProfession) => void;
  onSetRoleWaypoint: (profession: ResidentProfession) => void;
  onSelectResident?: (residentId: string) => void;
  onHireResident?: (residentId: string) => void;
  onOpenSettlementMap?: () => void;
  onClose?: () => void;
}>;

export function SettlementPanel({
  settlement,
  settlementName,
  alignment,
  selectedProfession,
  onSelectProfession,
  onSetRoleWaypoint,
  onSelectResident,
  onHireResident,
  onOpenSettlementMap,
  onClose,
}: SettlementPanelProps) {
  const titleId = useId();
  const [localProfession, setLocalProfession] = useState<ResidentProfession | null>(null);
  const roles = useMemo(() => livingByProfession(settlement), [settlement]);
  const activeProfession = selectedProfession === undefined ? localProfession : selectedProfession;
  const selectedRole = roles.find(([profession]) => profession === activeProfession) ?? roles[0] ?? null;
  const livingPopulation = settlement.residents.filter((resident) => resident.alive).length;
  const mayor = settlement.residents.find((resident) => resident.alive && resident.profession === "mayor") ?? null;
  const waypoint = selectedRole ? findRoleWaypoint(settlement, selectedRole[0]) : null;
  const standing = factionStanding(alignment);

  const selectRole = (profession: ResidentProfession) => {
    setLocalProfession(profession);
    onSelectProfession?.(profession);
  };

  return (
    <PanelShell className="hearthroads-settlement-panel" labelledBy={titleId}>
      <PanelHeader
        eyebrow={`${prettyId(settlement.size)} · ${prettyId(settlement.biome)}`}
        title={settlementName ?? prettyId(settlement.id)}
        subtitle={`A ${ownerLabel(settlement.ownerFactionId).toLowerCase()} settlement with working homes, gates, and daily routines.`}
        titleId={titleId}
        onClose={onClose}
        meta={<span className={`hearthroads-standing standing-${standing}`}>{standing} · {alignment >= 0 ? "+" : ""}{alignment}</span>}
      />

      <div className="hearthroads-settlement-summary">
        <div><small>Owner</small><strong>{ownerLabel(settlement.ownerFactionId)}</strong></div>
        <div><small>Mayor</small><strong>{mayor?.name ?? "Election at 8:00"}</strong></div>
        <div><small>Population</small><strong>{livingPopulation} / {settlement.layout.populationSoftCap}</strong></div>
        <div><small>Food reserve</small><strong>{settlement.foodReserve}</strong></div>
      </div>

      <div className="hearthroads-settlement-layout">
        <nav className="hearthroads-role-list" aria-label="Settlement roles">
          <header><span>People to find</span><small>{roles.length} active roles</small></header>
          {roles.map(([profession, residents]) => (
            <button className={selectedRole?.[0] === profession ? "selected" : ""} key={profession} type="button" onClick={() => selectRole(profession)} aria-pressed={selectedRole?.[0] === profession}>
              <span className="hearthroads-role-sigil" aria-hidden="true">{profession.slice(0, 1).toUpperCase()}</span>
              <span><strong>{prettyId(profession)}</strong><small>{residents.length} {residents.length === 1 ? "resident" : "residents"}</small></span>
              <i aria-hidden="true">›</i>
            </button>
          ))}
        </nav>

        <section className="hearthroads-role-detail" aria-live="polite">
          {selectedRole ? (
            <>
              <header><span>Town role</span><h3>{prettyId(selectedRole[0])}</h3><p>{waypoint ? `Nearest: ${waypoint.name}` : "No one currently fills this role."}</p></header>
              <ul className="hearthroads-resident-list">
                {selectedRole[1].map((resident) => (
                  <li key={resident.id}>
                    <button type="button" disabled={!onSelectResident} onClick={() => onSelectResident?.(resident.id)}>
                      <span className="hearthroads-resident-avatar" aria-hidden="true">{resident.name.slice(0, 1)}</span>
                      <span><strong>{resident.name}</strong><small>{resident.equipment.weapon ? `Carries ${prettyId(resident.equipment.weapon)}` : resident.equipment.tool ? `Uses ${prettyId(resident.equipment.tool)}` : "Unarmed"}</small></span>
                      <span className="hearthroads-health-readout">{resident.health}/{resident.maxHealth}</span>
                    </button>
                    {onHireResident && !resident.hiredByPlayerId && resident.profession !== "mayor" ? <button className="hearthroads-hire-resident" type="button" onClick={() => onHireResident(resident.id)}>Hire · {resident.profession === "warrior" ? 180 : 110}g</button> : null}
                  </li>
                ))}
              </ul>
              <footer>
                <button className="pixel-button gold-button" type="button" disabled={!waypoint} onClick={() => onSetRoleWaypoint(selectedRole[0])}>Set role waypoint</button>
                {onOpenSettlementMap ? <button className="pixel-button secondary-button" type="button" onClick={onOpenSettlementMap}>Open on map</button> : null}
              </footer>
            </>
          ) : <div className="hearthroads-selection-empty"><h3>The streets are quiet</h3><p>No living residents are registered here.</p></div>}
        </section>

        <aside className="hearthroads-town-plan" aria-label="Settlement plan">
          <span>Town plan</span>
          <div className="hearthroads-town-plan-map" aria-hidden="true">
            {settlement.layout.buildings.map((building) => {
              const radius = Math.max(1, settlement.layout.radiusBlocks);
              const x = clamp((building.position.x - settlement.layout.center.x + radius) / (radius * 2), 0, 1) * 100;
              const y = clamp((building.position.z - settlement.layout.center.z + radius) / (radius * 2), 0, 1) * 100;
              return <i className={`building-${building.role}`} key={building.id} style={{ left: `${x}%`, top: `${y}%` }} title={prettyId(building.role)} />;
            })}
            {settlement.layout.gates.map((gate) => {
              const radius = Math.max(1, settlement.layout.radiusBlocks);
              const x = clamp((gate.position.x - settlement.layout.center.x + radius) / (radius * 2), 0, 1) * 100;
              const y = clamp((gate.position.z - settlement.layout.center.z + radius) / (radius * 2), 0, 1) * 100;
              return <b key={gate.id} style={{ left: `${x}%`, top: `${y}%` }} />;
            })}
          </div>
          <div className="hearthroads-town-plan-legend"><span><i />Building</span><span><b />Gate</span></div>
          <p>Waypoints follow the living resident, even when beds, doors, or paths change.</p>
        </aside>
      </div>
    </PanelShell>
  );
}
