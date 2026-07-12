"use client";

import { useMemo, type CSSProperties } from "react";
import {
  compassDirection,
  compassEntries,
  destinationCue,
  navigationTargets,
} from "./navigation";
import type { MapMarker, MapPlayerMarker, WorldPoint } from "./map-system";
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
  const direction = compassDirection(headingRadians);

  return (
    <>
      <nav className="world-compass" aria-label={`Facing ${direction}; nearby places and players`}>
        <div className="world-compass-readout"><strong>{direction}</strong><span>WAYFINDER</span></div>
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
                className={`world-compass-target target-${entry.kind}${entry.tracked ? " tracked" : ""}`}
                style={style}
                key={entry.id}
                type="button"
                title={`${entry.label} · ${Math.round(entry.distance ?? 0)} blocks${entry.tracked ? " · tracked" : ""}`}
                aria-label={`${entry.tracked ? "Stop tracking" : "Track"} ${entry.label}, ${Math.round(entry.distance ?? 0)} blocks away`}
                aria-pressed={entry.tracked}
                onClick={() => onTrack(entry.tracked ? null : entry.id)}
              >
                <b aria-hidden="true">{entry.glyph}</b>
                {entry.tracked ? <small>{entry.label}</small> : null}
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
