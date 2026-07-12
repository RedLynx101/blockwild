"use client";

import {
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  createMapViewState,
  mapTerrainPalette,
  mapViewportBounds,
  normalizeMapViewState,
  panMapView,
  parseChunkKey,
  stepMapZoom,
  type CartographySession,
  type FastTravelChannel,
  type FastTravelMode,
  type MapKnowledge,
  type MapMarker,
  type MapMarkerKind,
  type MapPlayerMarker,
  type MapViewState,
  type WorldPoint,
} from "./map-system";
import { engineYawToMapRotation } from "./navigation";
import {
  questAvailability,
  questSourceCanOffer,
  questSourceCanTurnIn,
  questTurnInRoute,
  type QuestAvailability,
  type QuestBook,
  type QuestDefinition,
  type QuestKind,
  type QuestObjective,
  type QuestSource,
  type QuestTurnInRoute,
} from "./quests";
import { hasBlueprint, type BlueprintState } from "./blueprints";
import {
  ingredientAvailableCount,
  type AlchemyRecipe,
  type AlchemyStandState,
  type DistilleryRecipe,
  type DistilleryState,
  type RecipeIngredient,
  type ResourceInventory,
} from "./alchemy";
import type { SugarworksRecipe, SugarworksState } from "./candyworks";
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
  isMayorProfession,
  isWarriorProfession,
  RESIDENT_PROFESSIONS,
  settlementEnvironmentOf,
  type ResidentProfession,
  type SettlementResident,
  type SettlementState,
} from "./settlements";

type AtlantianProfession = Extract<ResidentProfession, `atlantian-${string}`>;
type SugarcourtProfession = Extract<ResidentProfession, `sugarcourt-${string}`>;

export type SentientRolePresentation = Readonly<{
  label: string;
  glyph: string;
  description: string;
  portraitUrl: string;
}>;

export const ATLANTIAN_ROLE_PRESENTATION = {
  "atlantian-tidewarden": {
    label: "Tidewarden",
    glyph: "◉",
    description: "Keeps the tidemoot's memory, settles disputes, and listens for changes in the deep currents.",
    portraitUrl: "/creatures/atlantian-tidewarden.svg",
  },
  "atlantian-kelpkeeper": {
    label: "Kelpkeeper",
    glyph: "≋",
    description: "Tends kelp gardens, shellfruit beds, and the living nurseries that feed the settlement.",
    portraitUrl: "/creatures/atlantian-kelpkeeper.svg",
  },
  "atlantian-coralwright": {
    label: "Coralwright",
    glyph: "✥",
    description: "Shapes reefglass, living coral, tools, and the open structures of an underwater home.",
    portraitUrl: "/creatures/atlantian-coralwright.svg",
  },
  "atlantian-pearlbroker": {
    label: "Pearlbroker",
    glyph: "●",
    description: "Trades pearls and rare ocean goods while keeping the tidemoot's exchange in balance.",
    portraitUrl: "/creatures/atlantian-pearlbroker.svg",
  },
  "atlantian-glowmender": {
    label: "Glowmender",
    glyph: "✦",
    description: "Uses luminous salves and patient craft to tend wounds, nests, and dimming reef life.",
    portraitUrl: "/creatures/atlantian-glowmender.svg",
  },
  "atlantian-trident-guard": {
    label: "Trident Guard",
    glyph: "Ψ",
    description: "Patrols open current lanes and turns deepwater predators away from the tidemoot.",
    portraitUrl: "/creatures/atlantian-trident-guard.svg",
  },
} as const satisfies Readonly<Record<AtlantianProfession, SentientRolePresentation>>;

export const SUGARCOURT_ROLE_PRESENTATION = {
  "sugarcourt-crown-confectioner": {
    label: "Crown Confectioner",
    glyph: "♔",
    description: "Keeps the borough's measure, hears disputes, and authorizes contracts and trusted hires.",
    portraitUrl: "/creatures/sugarcourt-crown-confectioner.svg",
  },
  "sugarcourt-gumdrop-gardener": {
    label: "Gumdrop Gardener",
    glyph: "✿",
    description: "Tends peppermint rows, cocoa puffs, gumdrop bushes, and the flowers that flavor every batch.",
    portraitUrl: "/creatures/sugarcourt-gumdrop-gardener.svg",
  },
  "sugarcourt-sugarboiler": {
    label: "Sugarboiler",
    glyph: "♨",
    description: "Runs the Sugarworks kettles and bottles the Concord's carefully measured tonics.",
    portraitUrl: "/creatures/sugarcourt-sugarboiler.svg",
  },
  "sugarcourt-candysmith": {
    label: "Candysmith",
    glyph: "◇",
    description: "Tempers candy alloy into hard walls, bright weapons, and flexible Sugarplate armor.",
    portraitUrl: "/creatures/sugarcourt-candysmith.svg",
  },
  "sugarcourt-sweetbroker": {
    label: "Sweetbroker",
    glyph: "¤",
    description: "Balances local stock, general trade, and the borough's rule that every bargain be measured fairly.",
    portraitUrl: "/creatures/sugarcourt-sweetbroker.svg",
  },
  "sugarcourt-kennelkeeper": {
    label: "Kennelkeeper",
    glyph: "●",
    description: "Cares for sworn Taffy Hounds and Praline Cats, and sells unaligned companions in safe Capture Orbs.",
    portraitUrl: "/creatures/sugarcourt-kennelkeeper.svg",
  },
  "sugarcourt-brittle-guard": {
    label: "Brittle Guard",
    glyph: "†",
    description: "Patrols candywall gates with a Peppermint Pike and defends every resident and sworn companion inside.",
    portraitUrl: "/creatures/sugarcourt-brittle-guard.svg",
  },
} as const satisfies Readonly<Record<SugarcourtProfession, SentientRolePresentation>>;

const HOBBIT_PORTRAIT_ROLES: Readonly<Partial<Record<ResidentProfession, string>>> = {
  mayor: "mayor",
  warrior: "hammer-guard",
  farmer: "farmer",
  miner: "miner",
  banker: "banker",
  brewer: "merchant",
  alchemist: "merchant",
  blacksmith: "merchant",
  general: "merchant",
};

const GOBLIN_PORTRAIT_ROLES: Readonly<Partial<Record<ResidentProfession, string>>> = {
  mayor: "chieftain",
  warrior: "spear-guard",
  farmer: "worker",
  miner: "miner",
  banker: "worker",
  brewer: "alchemist",
  alchemist: "alchemist",
  blacksmith: "worker",
  general: "worker",
};

export function isResidentProfession(value: unknown): value is ResidentProfession {
  return typeof value === "string" && (RESIDENT_PROFESSIONS as readonly string[]).includes(value);
}

export function sentientPortraitPath(factionId: Exclude<FactionId, "player">, profession: ResidentProfession) {
  if (factionId === "atlantians") {
    const aquaticRole = profession.startsWith("atlantian-") ? profession as AtlantianProfession : "atlantian-tidewarden";
    return ATLANTIAN_ROLE_PRESENTATION[aquaticRole]?.portraitUrl ?? ATLANTIAN_ROLE_PRESENTATION["atlantian-tidewarden"].portraitUrl;
  }
  if (factionId === "sugarcourt") {
    const sugarcourtRole = profession.startsWith("sugarcourt-") ? profession as SugarcourtProfession : "sugarcourt-sweetbroker";
    return SUGARCOURT_ROLE_PRESENTATION[sugarcourtRole]?.portraitUrl ?? SUGARCOURT_ROLE_PRESENTATION["sugarcourt-sweetbroker"].portraitUrl;
  }
  if (factionId === "wood-elves") {
    const role = profession.startsWith("wood-elf-") ? profession : "wood-elf-moonbroker";
    return `/creatures/${role}.svg`;
  }
  if (factionId === "dwarves") {
    const role = profession.startsWith("dwarf-") ? profession : "dwarf-provisioner";
    return `/creatures/${role}.svg`;
  }
  const roles = factionId === "hobbits" ? HOBBIT_PORTRAIT_ROLES : GOBLIN_PORTRAIT_ROLES;
  const fallback = factionId === "hobbits" ? "merchant" : "worker";
  return `/creatures/${factionId === "hobbits" ? "hobbit" : "goblin"}-${roles[profession] ?? fallback}.svg`;
}

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

function rolePresentation(profession: ResidentProfession) {
  if (profession.startsWith("atlantian-")) {
    return ATLANTIAN_ROLE_PRESENTATION[profession as AtlantianProfession];
  }
  if (profession.startsWith("sugarcourt-")) {
    return SUGARCOURT_ROLE_PRESENTATION[profession as SugarcourtProfession];
  }
  return {
    label: prettyId(profession),
    glyph: profession.slice(0, 1).toUpperCase(),
    description: "A working resident whose routine, equipment, and waypoint follow their role in the settlement.",
    portraitUrl: "",
  } satisfies SentientRolePresentation;
}

function PortraitAsset({
  src,
  alt,
  fallback,
  compact = false,
}: Readonly<{ src?: string | null; alt: string; fallback: string; compact?: boolean }>) {
  const [failed, setFailed] = useState(false);
  const size = compact ? 72 : 360;
  return (
    <span className={`hearthroads-portrait-asset${compact ? " compact" : ""}`} data-portrait-state={!src || failed ? "fallback" : "model"}>
      <span className="hearthroads-portrait-fallback" aria-hidden="true">{fallback}</span>
      {src && !failed ? (
        // Local creature portraits are generated SVGs; a native image preserves
        // their exact silhouette and gives the panel a reliable error fallback.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} width={size} height={size} alt={alt} loading={compact ? "lazy" : "eager"} decoding="async" onError={() => setFailed(true)} />
      ) : null}
    </span>
  );
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
    left: `${((chunkX - bounds.minX) / width) * 100}%`,
    top: `${((chunkZ - bounds.minZ) / height) * 100}%`,
  };
}

function safeMapMarkerColor(color: string | undefined) {
  return typeof color === "string" && /^#[0-9a-f]{6}$/iu.test(color) ? color : "#5a78a0";
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
  currentHeadingRadians?: number;
  otherPlayers?: readonly MapPlayerMarker[];
  viewState?: MapViewState;
  onViewStateChange?: (state: MapViewState) => void;
  minimumZoom?: number;
  alwaysShowPoiLabels?: boolean;
  trackedTargetId?: string | null;
  onTrackTarget?: (targetId: string | null) => void;
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
  currentHeadingRadians = 0,
  otherPlayers = [],
  viewState: controlledViewState,
  onViewStateChange,
  minimumZoom = 1,
  alwaysShowPoiLabels = false,
  trackedTargetId = null,
  onTrackTarget,
  onClose,
}: MapPanelProps) {
  const titleId = useId();
  const manualMarkerInputId = useId();
  const renameInputId = useId();
  const [markerName, setMarkerName] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [hoveredChunk, setHoveredChunk] = useState<Readonly<{ key: string; biome: string }> | null>(null);
  const [detailedTerrain, setDetailedTerrain] = useState(true);
  const [localViewState, setLocalViewState] = useState(createMapViewState);
  const [dragState, setDragState] = useState<Readonly<{
    pointerId: number;
    clientX: number;
    clientY: number;
    view: MapViewState;
  }> | null>(null);
  const baseBounds = useMemo(() => mapBounds(knowledge, currentPosition), [knowledge, currentPosition]);
  const zoomLimits = { minimum: minimumZoom } as const;
  const activeViewState = normalizeMapViewState(controlledViewState ?? localViewState, zoomLimits);
  const bounds = mapViewportBounds(baseBounds, activeViewState, zoomLimits);
  const selected = knowledge.markers.find((marker) => marker.id === selectedMarkerId) ?? null;
  const explored = knowledge.exploredChunks.map(parseChunkKey).filter((entry) => entry !== null);
  const viewWidth = Math.max(1, bounds.maxX - bounds.minX);
  const viewHeight = Math.max(1, bounds.maxZ - bounds.minZ);
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

  const updateViewState = (next: MapViewState) => {
    const normalized = normalizeMapViewState(next, zoomLimits);
    if (!controlledViewState) setLocalViewState(normalized);
    onViewStateChange?.(normalized);
  };

  const panStepX = Math.max(0.5, (bounds.maxX - bounds.minX) * 0.22);
  const panStepZ = Math.max(0.5, (bounds.maxZ - bounds.minZ) * 0.22);

  const handleMapPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({ pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, view: activeViewState });
  };

  const handleMapPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const initialBounds = mapViewportBounds(baseBounds, dragState.view, zoomLimits);
    const deltaX = -(event.clientX - dragState.clientX) / rect.width * (initialBounds.maxX - initialBounds.minX);
    const deltaZ = -(event.clientY - dragState.clientY) / rect.height * (initialBounds.maxZ - initialBounds.minZ);
    updateViewState(panMapView(dragState.view, deltaX, deltaZ, zoomLimits));
  };

  const finishMapDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragState?.pointerId === event.pointerId) setDragState(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleMapWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    updateViewState(stepMapZoom(activeViewState, event.deltaY < 0 ? 1 : -1, zoomLimits));
  };

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
          <div
            className={`hearthroads-map-canvas${dragState ? " dragging" : ""}`}
            aria-label={`Map with ${knowledge.exploredChunks.length} explored chunks at ${activeViewState.zoom.toFixed(1)} times zoom`}
            onPointerDown={handleMapPointerDown}
            onPointerMove={handleMapPointerMove}
            onPointerUp={finishMapDrag}
            onPointerCancel={finishMapDrag}
            onWheel={handleMapWheel}
          >
            <button
              type="button"
              className={`hearthroads-map-detail-toggle${detailedTerrain ? " active" : ""}`}
              aria-pressed={detailedTerrain}
              onClick={() => setDetailedTerrain((current) => !current)}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <b>Detailed terrain</b><small>{detailedTerrain ? "ON" : "OFF"}</small>
            </button>
            <div className="hearthroads-map-controls" aria-label="Map view controls" onPointerDown={(event) => event.stopPropagation()}>
              <button type="button" onClick={() => updateViewState(panMapView(activeViewState, 0, -panStepZ, zoomLimits))} aria-label="Pan map north">↑</button>
              <button type="button" onClick={() => updateViewState(panMapView(activeViewState, -panStepX, 0, zoomLimits))} aria-label="Pan map west">←</button>
              <button type="button" onClick={() => updateViewState(createMapViewState())} aria-label="Show the whole explored map">◉</button>
              <button type="button" onClick={() => updateViewState(panMapView(activeViewState, panStepX, 0, zoomLimits))} aria-label="Pan map east">→</button>
              <button type="button" onClick={() => updateViewState(panMapView(activeViewState, 0, panStepZ, zoomLimits))} aria-label="Pan map south">↓</button>
              <button type="button" onClick={() => updateViewState(stepMapZoom(activeViewState, -1, zoomLimits))} disabled={activeViewState.zoom <= minimumZoom} aria-label="Zoom map out">−</button>
              <output aria-label="Current map zoom">{activeViewState.zoom.toFixed(1)}×</output>
              <button type="button" onClick={() => updateViewState(stepMapZoom(activeViewState, 1, zoomLimits))} disabled={activeViewState.zoom >= 12} aria-label="Zoom map in">+</button>
            </div>
            <svg
              className="hearthroads-map-terrain"
              viewBox={`0 0 ${viewWidth} ${viewHeight}`}
              preserveAspectRatio="none"
              role="img"
              aria-label="Explored world chunks"
            >
              <title>Explored world chunks</title>
              {explored.map((chunk) => {
                const key = `${chunk.x},${chunk.z}`;
                const palette = mapTerrainPalette(knowledge.terrainByChunk?.[key]);
                const surface = detailedTerrain ? knowledge.surfaceByChunk?.[key] : null;
                return (
                  <g
                    key={key}
                    className="hearthroads-map-chunk-group"
                    onMouseEnter={() => setHoveredChunk({ key, biome: palette.label })}
                    onMouseLeave={() => setHoveredChunk((current) => current?.key === key ? null : current)}
                    aria-label={`${key}: ${palette.label}`}
                  >
                    <title>{`${palette.label} · chunk ${key}`}</title>
                    <rect
                      className={`hearthroads-map-chunk${palette.water ? " water" : " land"}`}
                      x={chunk.x - bounds.minX}
                      y={chunk.z - bounds.minZ}
                      width="1"
                      height="1"
                      fill={palette.fill}
                      stroke={palette.stroke}
                      vectorEffect="non-scaling-stroke"
                    />
                    {surface?.map((color, index) => (
                      <rect
                        className="hearthroads-map-surface-cell"
                        key={`${key}:surface:${index}`}
                        x={chunk.x - bounds.minX + index % 2 * 0.5}
                        y={chunk.z - bounds.minZ + Math.floor(index / 2) * 0.5}
                        width="0.5"
                        height="0.5"
                        fill={color}
                      />
                    ))}
                  </g>
                );
              })}
            </svg>
            <span
              className="hearthroads-player-pin"
              style={mapPointStyle(currentPosition, bounds)}
              aria-label="Your current position"
              title="You are here"
            >
              <i aria-hidden="true" style={{ transform: `rotate(${engineYawToMapRotation(currentHeadingRadians)}rad)` }}>▲</i>
            </span>
            {otherPlayers.map((player) => (
              <button
                type="button"
                className={`hearthroads-other-player-pin${trackedTargetId === `player:${player.id}` ? " tracked" : ""}`}
                key={player.id}
                style={{
                  ...mapPointStyle(player.position, bounds),
                  "--map-player-color": safeMapMarkerColor(player.color),
                } as CSSProperties}
                aria-label={`${player.name} at ${Math.round(player.position.x)}, ${Math.round(player.position.z)}`}
                title={player.name}
                onClick={() => onTrackTarget?.(trackedTargetId === `player:${player.id}` ? null : `player:${player.id}`)}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <i aria-hidden="true" style={{ transform: `rotate(${engineYawToMapRotation(player.headingRadians ?? 0)}rad)` }}>▲</i>
                <small>{player.name}</small>
              </button>
            ))}
            {knowledge.markers.map((marker) => (
              <button
                className={`hearthroads-map-pin marker-${marker.kind}${selected?.id === marker.id ? " selected" : ""}${trackedTargetId === marker.id ? " tracked" : ""}`}
                key={marker.id}
                type="button"
                style={mapPointStyle(marker.position, bounds)}
                onClick={() => onSelectMarker(marker.id)}
                onPointerDown={(event) => event.stopPropagation()}
                aria-label={`${MARKER_META[marker.kind].label}: ${marker.name}`}
                aria-pressed={selected?.id === marker.id}
                title={marker.name}
              >
                <span aria-hidden="true">{markerGlyph(marker)}</span>
                {(alwaysShowPoiLabels || activeViewState.zoom >= 2.6 || trackedTargetId === marker.id) && marker.kind !== "manual" ? <small>{marker.name}</small> : null}
              </button>
            ))}
            {hoveredChunk ? <output className="hearthroads-map-hover-label">{hoveredChunk.biome}<small>Chunk {hoveredChunk.key}</small></output> : null}
            {knowledge.exploredChunks.length === 0 ? (
              <p className="hearthroads-map-empty">Step beyond camp and the first lines will find the page.</p>
            ) : null}
          </div>
          <div className="hearthroads-map-legend" aria-label="Map legend">
            <span><i aria-hidden="true">▲</i>Players and heading</span>
            <span><i aria-hidden="true">≈</i>Water and sea</span>
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
                {onTrackTarget ? (
                  <button
                    className="pixel-button secondary-button"
                    type="button"
                    aria-pressed={trackedTargetId === selected.id}
                    onClick={() => onTrackTarget(trackedTargetId === selected.id ? null : selected.id)}
                  >
                    {trackedTargetId === selected.id ? "Stop tracking" : "Track on compass"}
                  </button>
                ) : null}
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
  source?: QuestSource | null;
  onTrackTurnIn?: (questId: string, route: QuestTurnInRoute) => void;
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
  source = null,
  onTrackTurnIn,
  onClose,
}: QuestPanelProps) {
  const titleId = useId();
  const [localTab, setLocalTab] = useState<QuestKind>("main");
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);
  const tab = activeTab ?? localTab;
  const visibleDefinitions = definitions.filter((definition) => {
    if (definition.kind !== tab) return false;
    const availability = questAvailability(book, definition);
    if (["active", "ready", "completed", "failed"].includes(availability)) return true;
    return questSourceCanOffer(definition, source);
  });
  const fallbackSelected = visibleDefinitions.find((definition) => book.active.some((active) => active.questId === definition.id))
    ?? visibleDefinitions[0]
    ?? null;
  const selectedId = selectedQuestId === undefined ? localSelectedId : selectedQuestId;
  const selected = visibleDefinitions.find((definition) => definition.id === selectedId) ?? fallbackSelected;
  const active = selected ? book.active.find((entry) => entry.questId === selected.id) ?? null : null;
  const availability = selected ? questAvailability(book, selected) : null;
  const turnInRoute = selected ? questTurnInRoute(book, selected) : null;
  const canTurnInHere = selected ? questSourceCanTurnIn(book, selected, source) : false;
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
            const isPinned = book.pinnedQuestIds.includes(definition.id);
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
                {selected.giver ? (
                  <small className="hearthroads-quest-source">
                    {selected.giver.scope === "faction-mayor"
                      ? `Faction work · offered and rewarded by any ${prettyId(selected.giver.factionId ?? "faction")} mayor`
                      : active?.giverEntityId
                        ? `Personal commission · return to the resident who entrusted it to you`
                        : `Personal commission · speak directly with ${prettyId(selected.giver.role ?? "the quest giver")}`}
                  </small>
                ) : null}
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
                {(availability === "available" || (availability === "abandoned" && selected.kind === "side")) && questSourceCanOffer(selected, source) ? (
                  <button className="pixel-button gold-button" type="button" onClick={() => onAccept(selected.id)}>
                    Accept quest
                  </button>
                ) : null}
                {active ? (
                  <button
                    className="pixel-button secondary-button"
                    type="button"
                    aria-pressed={book.pinnedQuestIds.includes(selected.id)}
                    disabled={!book.pinnedQuestIds.includes(selected.id) && book.pinnedQuestIds.length >= 3}
                    onClick={() => onPin(selected.id)}
                  >
                    {book.pinnedQuestIds.includes(selected.id) ? "Unpin quest" : book.pinnedQuestIds.length >= 3 ? "Journey board full" : "Pin to journey"}
                  </button>
                ) : null}
                {availability === "ready" && canTurnInHere ? (
                  <button className="pixel-button gold-button" type="button" onClick={() => onTurnIn(selected.id)}>
                    {turnInRoute?.kind === "faction-mayor" ? "Report to this mayor" : selected.giver ? "Hand in to quest giver" : "Claim reward"}
                  </button>
                ) : null}
                {availability === "ready" && !canTurnInHere && turnInRoute && turnInRoute.kind !== "menu" && onTrackTurnIn ? (
                  <button className="pixel-button gold-button" type="button" onClick={() => onTrackTurnIn(selected.id, turnInRoute)}>
                    {turnInRoute.kind === "individual" ? "Track quest giver" : `Track nearest ${prettyId(turnInRoute.factionId)} mayor`}
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

export type HearthroadsStationKind = "alchemy" | "distillery" | "sugarworks";
type StationRecipe = AlchemyRecipe | DistilleryRecipe | SugarworksRecipe;
type StationState = AlchemyStandState | DistilleryState | SugarworksState;

function stationDuration(recipe: StationRecipe) {
  return "brewSeconds" in recipe ? recipe.brewSeconds : "fermentSeconds" in recipe ? recipe.fermentSeconds : recipe.batchSeconds;
}

function ingredientStatus(ingredient: RecipeIngredient, inventory: ResourceInventory) {
  const available = ingredientAvailableCount(ingredient, inventory);
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
  const stationName = kind === "alchemy" ? "Alchemy Stand" : kind === "distillery" ? "Distillery" : "Sugarworks";
  const stationEyebrow = kind === "alchemy" ? "Bottles & remedies" : kind === "distillery" ? "Slow craft · barrel batch" : "Sugarcourt craft · kettle batch";
  const stationSubtitle = kind === "alchemy" ? "Choose a draught, gather the ingredients, and let it settle."
    : kind === "distillery" ? "Set a recipe, load a batch, and give it time to become itself."
      : "Measure a candywork pattern, heat the kettle, and cool one clean batch at a time.";

  return (
    <PanelShell className={`hearthroads-station-panel station-${kind}`} labelledBy={titleId}>
      <PanelHeader
        eyebrow={stationEyebrow}
        title={stationName}
        subtitle={stationSubtitle}
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
                <span className="hearthroads-recipe-vial" aria-hidden="true">{locked ? "⌑" : kind === "alchemy" ? "⚗" : kind === "distillery" ? "◉" : "♨"}</span>
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
                <span>{kind === "alchemy" ? "Selected formula" : kind === "distillery" ? "Selected batch" : "Selected candywork"}</span>
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
                {kind === "alchemy" ? "Brew formula" : kind === "distillery" ? "Begin fermentation" : "Heat Sugarworks batch"}
              </button>
            </>
          ) : <p>No recipes are available at this station yet.</p>}
        </article>

        <aside className="hearthroads-station-output" aria-label="Batch and output">
          <div className="hearthroads-station-apparatus" data-active={Boolean(state.activeBatch)} aria-hidden="true">
            <span>{kind === "alchemy" ? "⚗" : kind === "distillery" ? "◉" : "♨"}</span>
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
  const profession = isResidentProfession(character.profession) ? character.profession : "general";
  const role = rolePresentation(profession);

  return (
    <PanelShell className={`hearthroads-dialogue-panel faction-${character.factionId}`} labelledBy={titleId}>
      <PanelHeader
        eyebrow={`${factionName} · ${role.label}`}
        title={character.name}
        subtitle={`${prettyId(standing)} standing${character.factionId === "atlantians" ? " · underwater citizen" : character.factionId === "sugarcourt" ? " · Bonbon Borough resident" : ""}`}
        titleId={titleId}
        onClose={onClose}
      />
      <div className="hearthroads-dialogue-layout">
        <figure className="hearthroads-dialogue-portrait">
          <PortraitAsset
            key={character.portraitUrl ?? character.id}
            src={character.portraitUrl}
            alt={`${character.name}, ${role.label}`}
            fallback={character.factionId === "atlantians" || character.factionId === "sugarcourt" ? role.glyph : character.name.slice(0, 1).toUpperCase()}
          />
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
          {character.factionId === "atlantians" || character.factionId === "sugarcourt" ? <p className="hearthroads-role-note"><b>{role.label}</b>{role.description}</p> : null}
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
    <PanelShell className={`hearthroads-trade-panel faction-${merchant.factionId}`} labelledBy={titleId}>
      <PanelHeader
        eyebrow={`${FACTIONS[merchant.factionId].name} market · ${prettyId(merchant.profession)}`}
        title={`Trade with ${merchantName}`}
        subtitle={merchant.factionId === "atlantians"
          ? "Trade through the open current: kelp, reefglass, coralwork, medicines, and pearls move with local demand."
          : merchant.factionId === "sugarcourt"
            ? "Trade across the cooling counter: crops, candywork, companion orbs, formulas, arms, and armor move by careful measure."
            : "Buy what they carry, or offer anything from your pack. Demand changes the price."}
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
  const aquatic = settlementEnvironmentOf(settlement) === "underwater";
  const sugarcourt = settlement.ownerFactionId === "sugarcourt" || settlement.cultureRace === "confectkin";
  const mayor = settlement.residents.find((resident) => resident.alive && isMayorProfession(resident.profession)) ?? null;
  const waypoint = selectedRole ? findRoleWaypoint(settlement, selectedRole[0]) : null;
  const standing = factionStanding(alignment);
  const selectedRolePresentation = selectedRole ? rolePresentation(selectedRole[0]) : null;

  const selectRole = (profession: ResidentProfession) => {
    setLocalProfession(profession);
    onSelectProfession?.(profession);
  };

  return (
    <PanelShell className={`hearthroads-settlement-panel faction-${settlement.ownerFactionId}${aquatic ? " aquatic-settlement" : ""}`} labelledBy={titleId}>
      <PanelHeader
        eyebrow={`${prettyId(settlement.size)} · ${prettyId(settlement.biome)} · ${aquatic ? "underwater · open currents" : "surface roads"}`}
        title={settlementName ?? prettyId(settlement.id)}
        subtitle={aquatic
          ? "An unwalled Lumen Tidemoot shaped around reef homes, glow-lit current lanes, shared nests, and water-breathing residents."
          : sugarcourt
            ? "A Bonbon Borough gathered behind hard-candy walls, with warm Sugarworks kettles, companion yards, gardens, and measured daily routines."
            : `A ${ownerLabel(settlement.ownerFactionId).toLowerCase()} settlement with working homes, gates, and daily routines.`}
        titleId={titleId}
        onClose={onClose}
        meta={<span className={`hearthroads-standing standing-${standing}`}>{standing} · {alignment >= 0 ? "+" : ""}{alignment}</span>}
      />

      <div className="hearthroads-settlement-summary">
        <div><small>Owner</small><strong>{ownerLabel(settlement.ownerFactionId)}</strong></div>
        <div><small>{aquatic ? "Tidewarden" : sugarcourt ? "Crown Confectioner" : "Mayor"}</small><strong>{mayor?.name ?? "Election at 8:00"}</strong></div>
        <div><small>Population</small><strong>{livingPopulation} / {settlement.layout.populationSoftCap}</strong></div>
        <div><small>{aquatic ? "Kelp reserve" : "Food reserve"}</small><strong>{settlement.foodReserve}</strong></div>
      </div>

      <div className="hearthroads-settlement-layout">
        <nav className="hearthroads-role-list" aria-label="Settlement roles">
          <header><span>{aquatic ? "Currents to follow" : "People to find"}</span><small>{roles.length} active roles</small></header>
          {roles.map(([profession, residents]) => {
            const role = rolePresentation(profession);
            return (
              <button className={selectedRole?.[0] === profession ? "selected" : ""} key={profession} type="button" onClick={() => selectRole(profession)} aria-pressed={selectedRole?.[0] === profession}>
                <span className="hearthroads-role-sigil" aria-hidden="true">{role.glyph}</span>
                <span><strong>{role.label}</strong><small>{residents.length} {residents.length === 1 ? "resident" : "residents"}</small></span>
                <i aria-hidden="true">›</i>
              </button>
            );
          })}
        </nav>

        <section className="hearthroads-role-detail" aria-live="polite">
          {selectedRole ? (
            <>
              <header>
                <span>{aquatic ? "Tidemoot role" : "Town role"}</span>
                <h3>{selectedRolePresentation?.label ?? prettyId(selectedRole[0])}</h3>
                <p>{selectedRolePresentation?.description}</p>
                <p>{waypoint ? `Nearest: ${waypoint.name}` : "No one currently fills this role."}</p>
              </header>
              <ul className="hearthroads-resident-list">
                {selectedRole[1].map((resident) => (
                  <li key={resident.id}>
                    <button type="button" disabled={!onSelectResident} onClick={() => onSelectResident?.(resident.id)} title={`Track ${resident.name} on the map and compass`} aria-label={`Track ${resident.name}; direct conversation still requires meeting them in the world`}>
                      {resident.factionId !== "player" ? (
                        <PortraitAsset
                          key={`${resident.id}-${resident.profession}`}
                          src={sentientPortraitPath(resident.factionId, resident.profession)}
                          alt=""
                          fallback={rolePresentation(resident.profession).glyph}
                          compact
                        />
                      ) : <span className="hearthroads-resident-avatar" aria-hidden="true">{resident.name.slice(0, 1)}</span>}
                      <span><strong>{resident.name}</strong><small>{resident.equipment.weapon ? `Carries ${prettyId(resident.equipment.weapon)}` : resident.equipment.tool ? `Uses ${prettyId(resident.equipment.tool)}` : "Unarmed"}</small></span>
                      <span className="hearthroads-health-readout">TRACK · {resident.health}/{resident.maxHealth}</span>
                    </button>
                    {onHireResident && !resident.hiredByPlayerId && !isMayorProfession(resident.profession) ? <button className="hearthroads-hire-resident" type="button" onClick={() => onHireResident(resident.id)}>Hire · {isWarriorProfession(resident.profession) ? 180 : 110}g</button> : null}
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

        <aside className="hearthroads-town-plan" aria-label={aquatic ? "Underwater tidemoot plan" : "Settlement plan"}>
          <span>{aquatic ? "Tidemoot plan" : "Town plan"}</span>
          <div className="hearthroads-town-plan-map" aria-hidden="true">
            {settlement.layout.buildings.map((building) => {
              const radius = Math.max(1, settlement.layout.radiusBlocks);
              const x = clamp((building.position.x - settlement.layout.center.x + radius) / (radius * 2), 0, 1) * 100;
              const y = clamp((building.position.z - settlement.layout.center.z + radius) / (radius * 2), 0, 1) * 100;
              return <i className={`building-${building.role}`} key={building.id} style={{ left: `${x}%`, top: `${y}%` }} title={prettyId(building.role)} />;
            })}
            {(aquatic ? settlement.layout.approaches ?? [] : settlement.layout.gates).map((gate) => {
              const radius = Math.max(1, settlement.layout.radiusBlocks);
              const x = clamp((gate.position.x - settlement.layout.center.x + radius) / (radius * 2), 0, 1) * 100;
              const y = clamp((gate.position.z - settlement.layout.center.z + radius) / (radius * 2), 0, 1) * 100;
              return <b key={gate.id} style={{ left: `${x}%`, top: `${y}%` }} />;
            })}
          </div>
          <div className="hearthroads-town-plan-legend"><span><i />{aquatic ? "Reef home" : "Building"}</span><span><b />{aquatic ? "Open current" : "Gate"}</span></div>
          <p>{aquatic
            ? "No wall closes the water. Glowstone lanes, reef arches, and vertical current layers orient swimmers without blocking sea life."
            : sugarcourt
              ? "Boiled Sugarbrick walls ring every borough. Taffy Hounds watch the gates while Praline Cats keep close to homes and market counters."
              : "Waypoints follow the living resident, even when beds, doors, or paths change."}</p>
        </aside>
      </div>
    </PanelShell>
  );
}
