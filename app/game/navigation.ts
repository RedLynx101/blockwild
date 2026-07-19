import type { MapMarker, MapPlayerMarker, WorldPoint } from "./map-system.ts";

export const COMPASS_FIELD_OF_VIEW_RADIANS = Math.PI * 0.92;
export const DEFAULT_COMPASS_POI_RADIUS = 224;
export const NEAR_DESTINATION_CUE_RADIUS = 40;

export type NavigationTargetKind = "poi" | "wayshrine" | "bed" | "manual" | "player" | "quest";
export type NavigationTarget = Readonly<{
  id: string;
  name: string;
  kind: NavigationTargetKind;
  position: WorldPoint;
  tracked: boolean;
  glyph: string;
}>;

export type CompassEntry = Readonly<{
  id: string;
  label: string;
  kind: "cardinal" | NavigationTargetKind;
  offsetPercent: number;
  distance: number | null;
  tracked: boolean;
  glyph: string;
  edge?: "left" | "right" | null;
}>;

export type DestinationCue = Readonly<{
  id: string;
  name: string;
  distance: number;
  side: "left" | "center" | "right";
  offsetPercent: number;
  glyph: string;
}>;

/** The compass names only a natural POI that is almost exactly under its center notch. */
export function centeredPoiCompassEntry(entries: readonly CompassEntry[], tolerancePercent = 2.5) {
  const tolerance = clamp(finite(tolerancePercent, 2.5), 0.5, 12);
  return entries
    .filter((entry) => entry.kind === "poi" && Math.abs(entry.offsetPercent - 50) <= tolerance)
    .sort((left, right) => Math.abs(left.offsetPercent - 50) - Math.abs(right.offsetPercent - 50)
      || (left.distance ?? Infinity) - (right.distance ?? Infinity))[0] ?? null;
}

const finite = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

export function normalizeCompassRadians(value: number) {
  const full = Math.PI * 2;
  return ((finite(value) % full) + full) % full;
}

export function signedCompassDelta(targetBearing: number, currentBearing: number) {
  const full = Math.PI * 2;
  return ((normalizeCompassRadians(targetBearing) - normalizeCompassRadians(currentBearing) + Math.PI) % full + full) % full - Math.PI;
}

/** Engine yaw decreases on a clockwise mouse turn; compass bearings increase clockwise. */
export function engineYawToCompassBearing(engineYaw: number) {
  return normalizeCompassRadians(-finite(engineYaw));
}

/** CSS rotation is clockwise-positive, so the map arrow uses the negated engine yaw. */
export function engineYawToMapRotation(engineYaw: number) {
  return -finite(engineYaw);
}

export const COMPASS_ROSE = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
] as const;

export function compassDirection(engineYaw: number) {
  const bearing = engineYawToCompassBearing(engineYaw);
  const index = Math.round(bearing / (Math.PI * 2) * COMPASS_ROSE.length) % COMPASS_ROSE.length;
  return COMPASS_ROSE[index];
}

/** North is -Z and east is +X, matching Blockwild movement and map axes. */
export function compassBearingToPoint(origin: Pick<WorldPoint, "x" | "z">, target: Pick<WorldPoint, "x" | "z">) {
  return normalizeCompassRadians(Math.atan2(finite(target.x) - finite(origin.x), -(finite(target.z) - finite(origin.z))));
}

export function horizontalNavigationDistance(origin: Pick<WorldPoint, "x" | "z">, target: Pick<WorldPoint, "x" | "z">) {
  return Math.hypot(finite(target.x) - finite(origin.x), finite(target.z) - finite(origin.z));
}

function markerTarget(marker: MapMarker, trackedId: string | null): NavigationTarget {
  const kind: NavigationTargetKind = marker.kind === "natural-poi" ? "poi"
    : marker.kind === "bed-spawn" ? "bed"
      : marker.kind === "wayshrine" ? "wayshrine"
        : "manual";
  const glyph = kind === "poi" ? "◆" : kind === "wayshrine" ? "♜" : kind === "bed" ? "⌂" : "✦";
  return { id: marker.id, name: marker.name, kind, position: marker.position, tracked: trackedId === marker.id, glyph };
}

function playerTarget(player: MapPlayerMarker, trackedId: string | null): NavigationTarget {
  const id = `player:${player.id}`;
  return { id, name: player.name, kind: "player", position: player.position, tracked: trackedId === id, glyph: "●" };
}

export function navigationTargets(
  markers: readonly MapMarker[],
  players: readonly MapPlayerMarker[],
  trackedId: string | null,
) {
  return [...markers.map((marker) => markerTarget(marker, trackedId)), ...players.map((player) => playerTarget(player, trackedId))];
}

const MAJOR_CARDINALS = [
  { label: "N", bearing: 0 },
  { label: "NE", bearing: Math.PI / 4 },
  { label: "E", bearing: Math.PI / 2 },
  { label: "SE", bearing: Math.PI * 3 / 4 },
  { label: "S", bearing: Math.PI },
  { label: "SW", bearing: Math.PI * 5 / 4 },
  { label: "W", bearing: Math.PI * 3 / 2 },
  { label: "NW", bearing: Math.PI * 7 / 4 },
] as const;

export function compassEntries(
  engineYaw: number,
  origin: WorldPoint,
  targets: readonly NavigationTarget[],
  options: Readonly<{ poiRadius?: number; trackAtAnyDistance?: boolean; fieldOfViewRadians?: number }> = {},
): CompassEntry[] {
  const currentBearing = engineYawToCompassBearing(engineYaw);
  const field = clamp(finite(options.fieldOfViewRadians, COMPASS_FIELD_OF_VIEW_RADIANS), Math.PI / 3, Math.PI * 1.8);
  const halfField = field / 2;
  const radius = Math.max(16, finite(options.poiRadius, DEFAULT_COMPASS_POI_RADIUS));
  const entries: CompassEntry[] = [];
  for (const cardinal of MAJOR_CARDINALS) {
    const delta = signedCompassDelta(cardinal.bearing, currentBearing);
    if (Math.abs(delta) > halfField) continue;
    entries.push({
      id: `cardinal:${cardinal.label}`,
      label: cardinal.label,
      kind: "cardinal",
      offsetPercent: 50 + delta / halfField * 50,
      distance: null,
      tracked: false,
      glyph: cardinal.label,
      edge: null,
    });
  }
  for (const target of targets) {
    const distance = horizontalNavigationDistance(origin, target.position);
    if (!target.tracked && distance > radius) continue;
    const delta = signedCompassDelta(compassBearingToPoint(origin, target.position), currentBearing);
    const outsideField = Math.abs(delta) > halfField;
    if (outsideField && !target.tracked) continue;
    const edge = outsideField ? delta < 0 ? "left" as const : "right" as const : null;
    entries.push({
      id: target.id,
      label: target.name,
      kind: target.kind,
      offsetPercent: edge === "left" ? 6 : edge === "right" ? 94 : 50 + delta / halfField * 50,
      distance,
      tracked: target.tracked,
      glyph: target.glyph,
      edge,
    });
  }
  return entries.sort((left, right) => Number(left.kind !== "cardinal") - Number(right.kind !== "cardinal") || left.offsetPercent - right.offsetPercent);
}

/** A short-range through-wall cue for the one destination the player chose. */
export function destinationCue(
  engineYaw: number,
  origin: WorldPoint,
  targets: readonly NavigationTarget[],
  maximumDistance = NEAR_DESTINATION_CUE_RADIUS,
): DestinationCue | null {
  const target = targets.find((entry) => entry.tracked);
  if (!target) return null;
  const distance = horizontalNavigationDistance(origin, target.position);
  if (distance > Math.max(1, finite(maximumDistance, NEAR_DESTINATION_CUE_RADIUS))) return null;
  const delta = signedCompassDelta(compassBearingToPoint(origin, target.position), engineYawToCompassBearing(engineYaw));
  const offsetPercent = clamp(50 + delta / (Math.PI / 2) * 42, 8, 92);
  return {
    id: target.id,
    name: target.name,
    distance,
    side: Math.abs(delta) <= Math.PI / 10 ? "center" : delta < 0 ? "left" : "right",
    offsetPercent,
    glyph: target.glyph,
  };
}
