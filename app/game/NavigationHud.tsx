"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  centeredPoiCompassEntry,
  compassDirection,
  compassEntries,
  destinationCue,
  navigationTargets,
  horizontalNavigationDistance,
} from "./navigation";
import {
  mapChunksInViewport,
  mapTerrainPalette,
  mapViewportProjection,
  projectMapWorldPoint,
  type MapKnowledge,
  type MapMarker,
  type MapPlayerMarker,
  type MapViewportBounds,
  type WorldPoint,
} from "./map-system";
import type { StatusEffectView } from "./status-effects";

export type NavigationHudProps = Readonly<{
  headingRadians: number;
  position: WorldPoint;
  markers: readonly MapMarker[];
  players: readonly MapPlayerMarker[];
  trackedId: string | null;
  trackAtAnyDistance?: boolean;
  onTrack: (targetId: string | null) => void;
}>;

export function NavigationHud({
  headingRadians,
  position,
  markers,
  players,
  trackedId,
  trackAtAnyDistance = false,
  onTrack,
}: NavigationHudProps) {
  const targets = useMemo(() => navigationTargets(markers, players, trackedId), [markers, players, trackedId]);
  const entries = useMemo(() => compassEntries(headingRadians, position, targets, { trackAtAnyDistance }), [headingRadians, position, targets, trackAtAnyDistance]);
  const cue = useMemo(() => destinationCue(headingRadians, position, targets), [headingRadians, position, targets]);
  const focusedPoi = useMemo(() => centeredPoiCompassEntry(entries), [entries]);
  const focusedPoiId = focusedPoi?.id ?? null;
  const focusedPoiLabel = focusedPoi?.label ?? null;
  const [focusLabel, setFocusLabel] = useState<string | null>(focusedPoi?.label ?? null);
  const [focusVisible, setFocusVisible] = useState(Boolean(focusedPoi));
  const direction = compassDirection(headingRadians);

  useEffect(() => {
    let clearTimer = 0;
    let updateFrame = 0;
    if (focusedPoiLabel) {
      updateFrame = window.requestAnimationFrame(() => {
        setFocusLabel(focusedPoiLabel);
        setFocusVisible(true);
      });
    } else {
      updateFrame = window.requestAnimationFrame(() => setFocusVisible(false));
      clearTimer = window.setTimeout(() => setFocusLabel(null), 260);
    }
    return () => {
      if (updateFrame) window.cancelAnimationFrame(updateFrame);
      if (clearTimer) window.clearTimeout(clearTimer);
    };
  }, [focusedPoiId, focusedPoiLabel]);

  return (
    <>
      <nav className="world-compass" aria-label={`Facing ${direction}; nearby places and players`}>
        <div className={`world-compass-focus${focusVisible ? " visible" : ""}`} aria-live="polite">{focusLabel ?? ""}</div>
        <div className="world-compass-rail">
          <i className="world-compass-center" aria-hidden="true" />
          {entries.map((entry) => {
            const style = { "--compass-offset": `${entry.offsetPercent}%` } as CSSProperties;
            if (entry.kind === "cardinal") return (
              <span className={`world-compass-cardinal cardinal-${entry.label.toLowerCase()}`} style={style} key={entry.id} aria-hidden="true">
                {entry.label}
              </span>
            );
            return (
              <button
                className={`world-compass-target target-${entry.kind}${entry.tracked ? " tracked" : ""}${entry.edge ? ` edge-${entry.edge}` : ""}`}
                style={style}
                key={entry.id}
                type="button"
                title={`${entry.label} · ${Math.round(entry.distance ?? 0)} blocks${entry.tracked ? " · tracked" : ""}`}
                aria-label={`${entry.tracked ? "Stop tracking" : "Track"} ${entry.label}, ${Math.round(entry.distance ?? 0)} blocks away`}
                aria-pressed={entry.tracked}
                onClick={() => onTrack(entry.tracked ? null : entry.id)}
              >
                {entry.edge ? <i aria-hidden="true">{entry.edge === "left" ? "‹" : "›"}</i> : null}
                <b aria-hidden="true">{entry.glyph}</b>
                {entry.tracked ? <small>{entry.label}{entry.edge ? ` · ${Math.round(entry.distance ?? 0)}m` : ""}</small> : null}
              </button>
            );
          })}
        </div>
      </nav>
      {cue ? (
        <div
          className={`world-destination-cue side-${cue.side}`}
          style={{ "--destination-offset": `${cue.offsetPercent}%` } as CSSProperties}
          role="status"
          aria-label={`${cue.name}, ${Math.round(cue.distance)} blocks away`}
        >
          <span aria-hidden="true">{cue.side === "left" ? "‹" : cue.side === "right" ? "›" : "⌄"}</span>
          <b aria-hidden="true">{cue.glyph}</b>
          <strong>{cue.name}</strong>
          <small>{Math.round(cue.distance)}m</small>
        </div>
      ) : null}
    </>
  );
}

const MINIMAP_RADIUS_CHUNKS = 5.5;
const MINIMAP_INSET_PIXELS = 10;

function minimapBoundsForChunk(chunkX: number, chunkZ: number): MapViewportBounds {
  const centerX = chunkX + 0.5;
  const centerZ = chunkZ + 0.5;
  return {
    minX: centerX - MINIMAP_RADIUS_CHUNKS,
    maxX: centerX + MINIMAP_RADIUS_CHUNKS,
    minZ: centerZ - MINIMAP_RADIUS_CHUNKS,
    maxZ: centerZ + MINIMAP_RADIUS_CHUNKS,
  };
}

function minimapMarkerColor(kind: MapMarker["kind"]) {
  return kind === "wayshrine" ? "#7de2e6" : kind === "bed-spawn" ? "#e7a0b2" : kind === "manual" ? "#ffd36d" : "#e9f3bd";
}

export type MinimapHudProps = Readonly<{
  knowledge: MapKnowledge;
  headingRadians: number;
  position: WorldPoint;
  players: readonly MapPlayerMarker[];
  trackedId: string | null;
}>;

/** A north-up, bounded local chart. Terrain repaints only when map knowledge or the current chunk changes. */
export function MinimapHud({ knowledge, headingRadians, position, players, trackedId }: MinimapHudProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shellRef = useRef<HTMLElement>(null);
  const [viewport, setViewport] = useState({ width: 176, height: 176 });
  const currentChunkX = Math.floor(position.x / 16);
  const currentChunkZ = Math.floor(position.z / 16);
  const bounds = useMemo(
    () => minimapBoundsForChunk(currentChunkX, currentChunkZ),
    [currentChunkX, currentChunkZ],
  );
  const explored = useMemo(
    () => mapChunksInViewport(knowledge.exploredChunks, bounds, 0.05),
    [bounds, knowledge.exploredChunks],
  );
  const targets = useMemo(
    () => navigationTargets(knowledge.markers, players, trackedId),
    [knowledge.markers, players, trackedId],
  );
  const tracked = targets.find((target) => target.tracked) ?? null;
  const playerPoint = projectMapWorldPoint(position, bounds, viewport.width, viewport.height);
  const rawTrackedPoint = tracked ? projectMapWorldPoint(tracked.position, bounds, viewport.width, viewport.height) : null;
  const trackedOutside = rawTrackedPoint !== null && (
    rawTrackedPoint.x < MINIMAP_INSET_PIXELS || rawTrackedPoint.x > viewport.width - MINIMAP_INSET_PIXELS
    || rawTrackedPoint.y < MINIMAP_INSET_PIXELS || rawTrackedPoint.y > viewport.height - MINIMAP_INSET_PIXELS
  );
  const trackedPoint = rawTrackedPoint ? {
    x: Math.max(MINIMAP_INSET_PIXELS, Math.min(viewport.width - MINIMAP_INSET_PIXELS, rawTrackedPoint.x)),
    y: Math.max(MINIMAP_INSET_PIXELS, Math.min(viewport.height - MINIMAP_INSET_PIXELS, rawTrackedPoint.y)),
  } : null;

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const update = () => {
      const width = Math.max(1, Math.round(shell.clientWidth));
      const height = Math.max(1, Math.round(shell.clientHeight));
      setViewport((current) => current.width === width && current.height === height ? current : { width, height });
    };
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = viewport.width;
    const height = viewport.height;
    const pixelRatio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = Math.max(1, Math.round(width * pixelRatio));
    canvas.height = Math.max(1, Math.round(height * pixelRatio));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#17201c";
    context.fillRect(0, 0, width, height);
    const projection = mapViewportProjection(bounds, width, height);
    const cellSize = projection.scale;
    const halfCell = cellSize / 2;
    for (const chunk of explored) {
      const palette = mapTerrainPalette(knowledge.terrainByChunk[chunk.key]);
      const x = projection.offsetX + (chunk.x - bounds.minX) * cellSize;
      const y = projection.offsetY + (chunk.z - bounds.minZ) * cellSize;
      context.fillStyle = palette.fill;
      context.fillRect(x, y, cellSize + 0.35, cellSize + 0.35);
      const surface = palette.water ? null : knowledge.surfaceByChunk[chunk.key];
      if (surface) for (let index = 0; index < 4; index += 1) {
        context.fillStyle = surface[index];
        context.fillRect(x + index % 2 * halfCell, y + Math.floor(index / 2) * halfCell, halfCell + 0.35, halfCell + 0.35);
      }
      context.strokeStyle = palette.stroke;
      context.lineWidth = 0.55;
      context.strokeRect(x, y, cellSize, cellSize);
    }
    for (const marker of knowledge.markers) {
      const point = projectMapWorldPoint(marker.position, bounds, width, height);
      if (point.x < 4 || point.y < 4 || point.x > width - 4 || point.y > height - 4) continue;
      context.fillStyle = minimapMarkerColor(marker.kind);
      context.fillRect(Math.round(point.x) - 2, Math.round(point.y) - 2, 5, 5);
    }
    for (const player of players) {
      const point = projectMapWorldPoint(player.position, bounds, width, height);
      if (point.x < 4 || point.y < 4 || point.x > width - 4 || point.y > height - 4) continue;
      context.fillStyle = player.color && /^#[0-9a-f]{6}$/iu.test(player.color) ? player.color : "#9dd9ff";
      context.fillRect(Math.round(point.x) - 2, Math.round(point.y) - 2, 5, 5);
    }
  }, [bounds, explored, knowledge.markers, knowledge.revision, knowledge.surfaceByChunk, knowledge.terrainByChunk, players, viewport]);

  return (
    <aside
      ref={shellRef}
      className="world-minimap"
      aria-label={`Minimap centered on chunk ${currentChunkX}, ${currentChunkZ}${tracked ? `; tracking ${tracked.name}` : ""}`}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
      <span className="world-minimap-north" aria-hidden="true">N</span>
      <span
        className="world-minimap-player"
        style={{ left: `${playerPoint.x}px`, top: `${playerPoint.y}px`, transform: `translate(-50%, -50%) rotate(${-headingRadians}rad)` }}
        aria-hidden="true"
      >▲</span>
      {tracked && trackedPoint ? (
        <span
          className={`world-minimap-target${trackedOutside ? " outside" : ""}`}
          style={{ left: `${trackedPoint.x}px`, top: `${trackedPoint.y}px` }}
          title={`${tracked.name} · ${Math.round(horizontalNavigationDistance(position, tracked.position))} blocks`}
        >
          <b aria-hidden="true">{tracked.glyph}</b>
          <small>{Math.round(horizontalNavigationDistance(position, tracked.position))}m</small>
        </span>
      ) : null}
      <strong aria-hidden="true">LOCAL MAP</strong>
    </aside>
  );
}

const STATUS_GLYPHS: Readonly<Record<StatusEffectView["kind"], string>> = {
  poison: "✣",
  burning: "♨",
  regeneration: "+",
  ward: "◇",
  speed: "»",
  slow: "≋",
  "water-breathing": "≈",
  luck: "✦",
  bartering: "¤",
  vulnerability: "!",
  custom: "•",
};

export function StatusEffectsHud({ effects }: Readonly<{ effects: readonly StatusEffectView[] }>) {
  if (!effects.length) return null;
  return (
    <aside className="status-effects-hud" aria-label="Active effects">
      {effects.map((effect) => (
        <div className={effect.harmful ? "harmful" : "beneficial"} key={effect.id} title={effect.description}>
          <span aria-hidden="true">{STATUS_GLYPHS[effect.kind]}</span>
          <strong>{effect.name}</strong>
          {effect.remainingSeconds === null ? <small>PASSIVE</small> : <small>{Math.max(1, Math.ceil(effect.remainingSeconds))}s</small>}
        </div>
      ))}
    </aside>
  );
}
