"use client";

import type { AquariumHudState } from "./engine";

export type AquariumPanelProps = Readonly<{
  state: AquariumHudState;
  onInsertSelected: () => void;
  onRemoveResident: (residentId: string) => void;
  onClose: () => void;
}>;

const panelStyle = {
  width: "min(760px, calc(100vw - 28px))",
  maxHeight: "min(720px, calc(100vh - 34px))",
  overflow: "auto",
  padding: "18px",
  border: "2px solid rgba(159, 224, 223, .62)",
  borderRadius: "18px",
  color: "#eafaf3",
  background: "linear-gradient(155deg, rgba(9, 37, 43, .97), rgba(11, 24, 34, .98) 62%, rgba(29, 49, 42, .97))",
  boxShadow: "0 20px 70px rgba(0, 0, 0, .55), inset 0 1px rgba(220, 255, 246, .12)",
} as const;

const buttonStyle = {
  minHeight: "42px",
  padding: "8px 13px",
  border: "1px solid rgba(173, 231, 211, .5)",
  borderRadius: "10px",
  color: "#effff8",
  background: "linear-gradient(#39746d, #28534f)",
  cursor: "pointer",
  font: "inherit",
} as const;

export function AquariumPanel({ state, onInsertSelected, onRemoveResident, onClose }: AquariumPanelProps) {
  const selectedReady = Boolean(state.canMutate && state.selectedOrb?.eligible && state.residents.length < state.capacity);
  return (
    <section aria-label="Connected aquarium" style={panelStyle}>
      <header style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ color: "#8ddbd2", fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase" }}>Living waters</div>
          <h2 style={{ margin: "5px 0 4px", color: "#f4fff6", fontSize: 28 }}>Connected Aquarium</h2>
          <p style={{ margin: 0, color: "#b9d7d0", lineHeight: 1.5 }}>
            {state.blocks} glass {state.blocks === 1 ? "cell" : "cells"} · {state.residents.length}/{state.capacity} residents
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close aquarium" style={{ ...buttonStyle, minWidth: 42 }}>×</button>
      </header>

      {!state.canMutate && (
        <p role="status" style={{ margin: "14px 0 0", padding: "10px 12px", borderLeft: "3px solid #e5b875", color: "#f5dfb8", background: "rgba(107, 68, 31, .35)" }}>
          Aquarium residents are host-authoritative in multiplayer. You can inspect this habitat, but the host moves creatures.
        </p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "center", gap: 12, margin: "18px 0", padding: 14, borderRadius: 13, background: "rgba(125, 203, 191, .09)" }}>
        <div>
          <strong style={{ display: "block", color: "#eafff8" }}>
            {state.selectedOrb?.creatureName ?? (state.selectedOrb ? "Empty Capture Orb" : "Select a Capture Orb")}
          </strong>
          <small style={{ display: "block", marginTop: 4, color: "#a8c9c2", lineHeight: 1.4 }}>
            {state.selectedOrb?.reason ?? "Choose a filled orb from your hotbar to add a small fish or sea slug."}
          </small>
        </div>
        <button type="button" disabled={!selectedReady} onClick={onInsertSelected} style={{ ...buttonStyle, opacity: selectedReady ? 1 : .42, cursor: selectedReady ? "pointer" : "not-allowed" }}>
          Add resident
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 10 }}>
        {state.residents.map((resident) => (
          <article key={resident.id} style={{ display: "grid", gridTemplateColumns: "44px 1fr", gap: 10, padding: 12, border: "1px solid rgba(151, 216, 210, .22)", borderRadius: 12, background: "rgba(4, 18, 24, .5)" }}>
            <div aria-hidden="true" style={{ display: "grid", placeItems: "center", width: 44, height: 44, borderRadius: 12, color: resident.crawler ? "#f4b6dc" : "#9fe4f0", background: resident.crawler ? "rgba(160, 74, 130, .22)" : "rgba(50, 142, 164, .22)", fontSize: 22 }}>
              {resident.crawler ? "◡" : "◇"}
            </div>
            <div style={{ minWidth: 0 }}>
              <strong style={{ display: "block", overflow: "hidden", color: "#f2fff6", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{resident.name}</strong>
              <small style={{ display: "block", margin: "3px 0 8px", color: "#9ebbb7" }}>
                {resident.baby ? "Young · " : ""}{resident.tamed ? "Tamed · " : "Wild · "}{resident.health}/{resident.maxHealth} health
              </small>
              <button type="button" disabled={!state.canMutate} onClick={() => onRemoveResident(resident.id)} style={{ ...buttonStyle, minHeight: 32, padding: "5px 9px", opacity: state.canMutate ? 1 : .42 }}>
                Return to orb
              </button>
            </div>
          </article>
        ))}
        {!state.residents.length && (
          <div style={{ gridColumn: "1 / -1", padding: "28px 16px", border: "1px dashed rgba(151, 216, 210, .28)", borderRadius: 12, color: "#9ebbb7", textAlign: "center" }}>
            Pebbles, water flora, and plenty of room for a first tiny resident.
          </div>
        )}
      </div>
    </section>
  );
}
