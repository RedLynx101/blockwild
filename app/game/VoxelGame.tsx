"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import {
  BLOCKS,
  BlockId,
  PLACEABLE_BLOCKS,
  VoxelEngine,
  clearSavedWorld,
  readSavedWorld,
  readSettings,
  type GameMode,
  type GameSettings,
  type HudState,
} from "./engine";

type Overlay = "title" | "new" | "pause" | "inventory" | "help" | "settings" | "reset" | null;

const INITIAL_HUD: HudState = {
  health: 10,
  hunger: 10,
  hotbar: [...PLACEABLE_BLOCKS],
  selected: 0,
  counts: {},
  targetName: null,
  breakProgress: 0,
  day: 1,
  clock: "8:00 AM",
  biome: "Wildwood Meadow",
  coordinates: [0, 0, 0],
  debug: false,
  mode: "builder",
  weather: "clear",
};

function BlockIcon({ id, small = false }: { id: BlockId; small?: boolean }) {
  const definition = BLOCKS[id];
  return (
    <span
      className={`block-icon ${small ? "block-icon-small" : ""}`}
      style={{ "--block-color": definition.color } as CSSProperties}
      aria-hidden="true"
    />
  );
}

function PixelButton({
  children,
  className = "",
  disabled = false,
  onClick,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button type="button" className={`pixel-button ${className}`} disabled={disabled} onClick={onClick} title={title}>
      {children}
    </button>
  );
}

function StatPips({ kind, value }: { kind: "heart" | "hunger"; value: number }) {
  return (
    <div className={`stat-pips stat-${kind}`} aria-label={`${kind === "heart" ? "Health" : "Hunger"}: ${Math.ceil(value)} of 10`}>
      {Array.from({ length: 10 }, (_, index) => (
        <span key={index} className={index < Math.ceil(value) ? "filled" : "empty"}>
          {kind === "heart" ? "♥" : "◆"}
        </span>
      ))}
    </div>
  );
}

export default function VoxelGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<VoxelEngine | null>(null);
  const startedRef = useRef(false);
  const overlayRef = useRef<Overlay>("title");
  const toastTimerRef = useRef<number>(0);
  const lookPointerRef = useRef<{ id: number; x: number; y: number } | null>(null);

  const [overlay, setOverlayState] = useState<Overlay>("title");
  const [started, setStarted] = useState(false);
  const [hasSave, setHasSave] = useState(false);
  const [hud, setHud] = useState<HudState>(INITIAL_HUD);
  const [toast, setToast] = useState("Take only blocks. Leave only impossible architecture.");
  const [savedPulse, setSavedPulse] = useState(false);
  const [seed, setSeed] = useState("WILDERNESS");
  const [currentWorldSeed, setCurrentWorldSeed] = useState("WILDERNESS");
  const [mode, setMode] = useState<GameMode>("builder");
  const [settings, setSettingsState] = useState<GameSettings>(() => readSettings());
  const [settingsReturn, setSettingsReturn] = useState<"title" | "pause">("title");
  const [webglError, setWebglError] = useState(false);

  const setOverlay = useCallback((next: Overlay) => {
    overlayRef.current = next;
    setOverlayState(next);
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 4200);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const saved = readSavedWorld();
    window.queueMicrotask(() => {
      setHasSave(Boolean(saved));
      if (saved) {
        setSeed(saved.seed);
        setCurrentWorldSeed(saved.seed);
      }
    });

    let engine: VoxelEngine;
    try {
      engine = new VoxelEngine(canvas, {
        onHud: setHud,
        onToast: showToast,
        onLockChange: (locked) => {
          if (!locked && startedRef.current && overlayRef.current === null) setOverlay("pause");
        },
        onInventoryRequest: () => {
          if (!startedRef.current) return;
          setOverlay("inventory");
        },
        onDeath: () => undefined,
        onSave: () => {
          setHasSave(true);
          setSavedPulse(true);
          window.setTimeout(() => setSavedPulse(false), 1300);
        },
      }, settings);
    } catch {
      window.queueMicrotask(() => setWebglError(true));
      return;
    }
    engineRef.current = engine;
    return () => {
      window.clearTimeout(toastTimerRef.current);
      engine.dispose();
      engineRef.current = null;
    };
    // The engine owns its listeners for the lifetime of the canvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setOverlay, showToast]);

  const beginNewWorld = () => {
    const engine = engineRef.current;
    if (engine) setSeed(engine.randomSeed());
    setOverlay("new");
  };

  const createWorld = () => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.createWorld(seed, mode);
    setCurrentWorldSeed(engine.world.seedText);
    startedRef.current = true;
    setStarted(true);
    setHasSave(true);
    setOverlay(null);
    engine.activate();
    showToast("WASD move · Mouse look · Space jump · Hold left to harvest · Right click to build");
  };

  const continueWorld = () => {
    const engine = engineRef.current;
    const save = readSavedWorld();
    if (!engine || !save) {
      setHasSave(false);
      beginNewWorld();
      return;
    }
    engine.loadWorld(save);
    setCurrentWorldSeed(save.seed);
    startedRef.current = true;
    setStarted(true);
    setOverlay(null);
    engine.activate();
    showToast(`Welcome back to ${save.seed}.`);
  };

  const resume = () => {
    setOverlay(null);
    engineRef.current?.activate();
  };

  const saveAndQuit = () => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.saveNow();
    engine.quitToTitle();
    startedRef.current = false;
    setStarted(false);
    setHasSave(Boolean(readSavedWorld()));
    setOverlay("title");
  };

  const confirmReset = () => {
    clearSavedWorld();
    startedRef.current = false;
    setStarted(false);
    setHasSave(false);
    engineRef.current?.previewWorld("WILDERNESS");
    beginNewWorld();
  };

  const updateSettings = (change: Partial<GameSettings>) => {
    const next = { ...settings, ...change };
    setSettingsState(next);
    engineRef.current?.setSettings(change);
  };

  const openSettings = (returnTo: "title" | "pause") => {
    setSettingsReturn(returnTo);
    setOverlay("settings");
  };

  const closeInventory = () => resume();

  const handleLookDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    lookPointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };

  const handleLookMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointer = lookPointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    engineRef.current?.look(dx * 1.25, dy * 1.25);
  };

  const handleLookUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (lookPointerRef.current?.id === event.pointerId) lookPointerRef.current = null;
  };

  const handleVirtualKey = (event: ReactPointerEvent<HTMLButtonElement>, code: string, down: boolean) => {
    event.preventDefault();
    if (down) event.currentTarget.setPointerCapture(event.pointerId);
    engineRef.current?.setVirtualKey(code, down);
  };

  const selectedBlock = hud.hotbar[hud.selected] ?? BlockId.Grass;

  return (
    <main className="game-shell">
      <canvas ref={canvasRef} className="game-canvas" aria-label="Blockwild 3D game world" />
      <div className="sky-vignette" aria-hidden="true" />

      {started && overlay === null && (
        <div className="game-hud" aria-live="polite">
          <div className="world-readout">
            <strong>DAY {hud.day}</strong>
            <span>{hud.clock}</span>
            <span>{hud.biome}</span>
          </div>

          <div className="objective-card">
            <span className="objective-kicker">THE WILD CALLS</span>
            <strong>Find the golden waystone</strong>
            <span>Somewhere beyond the southeast ridge.</span>
          </div>

          {hud.debug && (
            <div className="debug-card">
              XYZ {hud.coordinates.join(" / ")}<br />
              {hud.mode.toUpperCase()} · {hud.weather.toUpperCase()}<br />
              Seed: {currentWorldSeed}
            </div>
          )}

          <div className="crosshair" aria-hidden="true"><span /><span /></div>
          {hud.breakProgress > 0 && (
            <div className="break-meter" aria-label={`Mining progress ${Math.round(hud.breakProgress * 100)} percent`}>
              <span style={{ width: `${hud.breakProgress * 100}%` }} />
            </div>
          )}

          <div className="bottom-hud">
            <div className="active-block-name">{BLOCKS[selectedBlock].name}</div>
            {hud.mode === "survival" && (
              <div className="survival-stats">
                <StatPips kind="heart" value={hud.health} />
                <StatPips kind="hunger" value={hud.hunger} />
              </div>
            )}
            <div className="hotbar" role="toolbar" aria-label="Block hotbar">
              {hud.hotbar.map((block, index) => {
                const count = hud.counts[block] ?? 0;
                return (
                  <button
                    type="button"
                    key={`${block}-${index}`}
                    className={`hotbar-slot ${hud.selected === index ? "selected" : ""}`}
                    aria-label={`Slot ${index + 1}: ${BLOCKS[block].name}${hud.mode === "survival" ? `, ${count} available` : ""}`}
                    onClick={() => engineRef.current?.selectSlot(index)}
                  >
                    <span className="slot-number">{index + 1}</span>
                    <BlockIcon id={block} />
                    <span className="slot-count">{hud.mode === "builder" ? "∞" : count || ""}</span>
                  </button>
                );
              })}
            </div>
            <div className="target-label">{hud.targetName ? `▣ ${hud.targetName}` : ""}</div>
          </div>
        </div>
      )}

      {toast && started && overlay === null && <div className="toast-message">{toast}</div>}
      {savedPulse && <div className="save-pulse">WORLD SAVED</div>}

      {started && overlay === null && (
        <div className="mobile-controls" aria-label="Touch game controls">
          <div className="touch-look-zone" onPointerDown={handleLookDown} onPointerMove={handleLookMove} onPointerUp={handleLookUp} onPointerCancel={handleLookUp} />
          <div className="move-pad">
            <button type="button" className="touch-key key-up" aria-label="Move forward" onPointerDown={(event) => handleVirtualKey(event, "KeyW", true)} onPointerUp={(event) => handleVirtualKey(event, "KeyW", false)} onPointerCancel={(event) => handleVirtualKey(event, "KeyW", false)}>▲</button>
            <button type="button" className="touch-key key-left" aria-label="Move left" onPointerDown={(event) => handleVirtualKey(event, "KeyA", true)} onPointerUp={(event) => handleVirtualKey(event, "KeyA", false)} onPointerCancel={(event) => handleVirtualKey(event, "KeyA", false)}>◀</button>
            <button type="button" className="touch-key key-down" aria-label="Move backward" onPointerDown={(event) => handleVirtualKey(event, "KeyS", true)} onPointerUp={(event) => handleVirtualKey(event, "KeyS", false)} onPointerCancel={(event) => handleVirtualKey(event, "KeyS", false)}>▼</button>
            <button type="button" className="touch-key key-right" aria-label="Move right" onPointerDown={(event) => handleVirtualKey(event, "KeyD", true)} onPointerUp={(event) => handleVirtualKey(event, "KeyD", false)} onPointerCancel={(event) => handleVirtualKey(event, "KeyD", false)}>▶</button>
          </div>
          <div className="action-pad">
            <button type="button" className="touch-action jump-action" aria-label="Jump" onPointerDown={(event) => { event.preventDefault(); engineRef.current?.jump(); }}>↑</button>
            <button
              type="button"
              className="touch-action mine-action"
              aria-label="Harvest block"
              onPointerDown={(event) => { event.preventDefault(); engineRef.current?.setMining(true); }}
              onPointerUp={() => engineRef.current?.setMining(false)}
              onPointerCancel={() => engineRef.current?.setMining(false)}
            >⛏</button>
            <button type="button" className="touch-action place-action" aria-label="Place block" onPointerDown={(event) => { event.preventDefault(); engineRef.current?.placeBlock(); }}>▣</button>
          </div>
          <button type="button" className="mobile-menu-button" aria-label="Pause game" onClick={() => { engineRef.current?.pause(); setOverlay("pause"); }}>Ⅱ</button>
        </div>
      )}

      {overlay === "title" && (
        <section className="menu-overlay title-overlay" aria-labelledby="game-title">
          <div className="title-mist" />
          <div className="title-content">
            <div className="logo-wrap">
              <h1 id="game-title" className="block-logo">BLOCKWILD</h1>
              <p className="logo-subtitle">A WORLD MADE ONE CUBE AT A TIME</p>
              <span className="splash-text">Now with 100% more corners!</span>
            </div>
            <div className="main-menu-buttons">
              <PixelButton className="primary-menu-button" disabled={!hasSave} onClick={continueWorld}>Continue World</PixelButton>
              <PixelButton onClick={beginNewWorld}>Create New World</PixelButton>
              <div className="menu-button-row">
                <PixelButton onClick={() => setOverlay("help")}>How to Play</PixelButton>
                <PixelButton onClick={() => openSettings("title")}>Settings</PixelButton>
              </div>
            </div>
            <div className="title-footer">
              <span>Original procedural textures · local worlds · no creepers were copied</span>
              <button type="button" className="sound-quick-toggle" onClick={() => updateSettings({ muted: !settings.muted })} aria-label={settings.muted ? "Turn sound on" : "Mute sound"}>
                {settings.muted ? "SOUND: OFF" : "SOUND: ON"}
              </button>
            </div>
          </div>
        </section>
      )}

      {overlay === "new" && (
        <section className="menu-overlay" aria-labelledby="new-world-title">
          <div className="pixel-panel world-setup-panel">
            <span className="panel-eyebrow">WORLD GENERATOR</span>
            <h2 id="new-world-title">Create a New World</h2>
            <label className="field-label" htmlFor="world-seed">World seed</label>
            <div className="seed-row">
              <input id="world-seed" className="pixel-input" value={seed} maxLength={32} onChange={(event) => setSeed(event.target.value.toUpperCase())} />
              <button type="button" className="seed-die" onClick={() => setSeed(engineRef.current?.randomSeed() ?? "WILDERNESS")} aria-label="Randomize seed">◆</button>
            </div>
            <fieldset className="mode-picker">
              <legend>Game mode</legend>
              <button type="button" className={mode === "builder" ? "active" : ""} onClick={() => setMode("builder")}>
                <strong>BUILDER</strong>
                <span>Infinite blocks. Fast harvesting. Pure construction.</span>
              </button>
              <button type="button" className={mode === "survival" ? "active" : ""} onClick={() => setMode("survival")}>
                <strong>SURVIVAL-LITE</strong>
                <span>Gather, craft, mind your hearts, and watch your hunger.</span>
              </button>
            </fieldset>
            <div className="panel-actions">
              <PixelButton className="secondary-button" onClick={() => setOverlay("title")}>Cancel</PixelButton>
              <PixelButton className="gold-button" onClick={createWorld}>Generate World</PixelButton>
            </div>
          </div>
        </section>
      )}

      {overlay === "pause" && (
        <section className="menu-overlay pause-overlay" aria-labelledby="pause-title">
          <div className="pixel-panel pause-panel">
            <span className="panel-eyebrow">DAY {hud.day} · {hud.clock}</span>
            <h2 id="pause-title">Game Paused</h2>
            <p className="panel-flavor">The mosslings will pretend not to move while you are looking.</p>
            <div className="stacked-menu-buttons">
              <PixelButton className="gold-button" onClick={resume}>Back to Game</PixelButton>
              <PixelButton onClick={() => setOverlay("inventory")}>Inventory & Crafting</PixelButton>
              <PixelButton onClick={() => openSettings("pause")}>Settings</PixelButton>
              <PixelButton onClick={() => setOverlay("help")}>How to Play</PixelButton>
              <PixelButton className="danger-button" onClick={() => setOverlay("reset")}>Regenerate World</PixelButton>
              <PixelButton className="secondary-button" onClick={saveAndQuit}>Save & Quit to Title</PixelButton>
            </div>
          </div>
        </section>
      )}

      {overlay === "inventory" && (
        <section className="menu-overlay inventory-overlay" aria-labelledby="inventory-title">
          <div className="pixel-panel inventory-panel">
            <header className="panel-header">
              <div>
                <span className="panel-eyebrow">{hud.mode === "builder" ? "BUILDER CATALOG" : "YOUR PACK"}</span>
                <h2 id="inventory-title">Inventory & Crafting</h2>
              </div>
              <button type="button" className="panel-close" onClick={closeInventory} aria-label="Close inventory">×</button>
            </header>
            <p className="inventory-hint">Choose a block to place it in hotbar slot {hud.selected + 1}. Press 1–9 or use the mouse wheel in-game.</p>
            <div className="inventory-layout">
              <div>
                <h3>BLOCKS</h3>
                <div className="inventory-grid">
                  {PLACEABLE_BLOCKS.map((block) => {
                    const count = hud.counts[block] ?? 0;
                    const available = hud.mode === "builder" || count > 0;
                    return (
                      <button type="button" key={block} className={`inventory-slot ${hud.hotbar[hud.selected] === block ? "equipped" : ""}`} disabled={!available} onClick={() => engineRef.current?.assignSelected(block)}>
                        <BlockIcon id={block} />
                        <span className="inventory-count">{hud.mode === "builder" ? "∞" : count}</span>
                        <span className="inventory-name">{BLOCKS[block].name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="crafting-column">
                <h3>FIELD RECIPES</h3>
                {[
                  { id: "planks" as const, name: "Planks ×4", cost: "1 Wildwood Log", icon: BlockId.Planks },
                  { id: "brick" as const, name: "Stone Brick ×4", cost: "2 Stone", icon: BlockId.Brick },
                  { id: "glass" as const, name: "Glass ×4", cost: "2 Sand", icon: BlockId.Glass },
                  { id: "glow" as const, name: "Glowstone ×2", cost: "1 Coal + 1 Glass", icon: BlockId.Glow },
                ].map((recipe) => (
                  <button type="button" key={recipe.id} className="recipe-card" onClick={() => engineRef.current?.craft(recipe.id)}>
                    <BlockIcon id={recipe.icon} small />
                    <span><strong>{recipe.name}</strong><small>{recipe.cost}</small></span>
                    <b>CRAFT</b>
                  </button>
                ))}
                <div className="ore-pouch">
                  <span>Coal</span><strong>{hud.counts[BlockId.Coal] ?? 0}</strong>
                  <span>Sunmetal</span><strong>{hud.counts[BlockId.Iron] ?? 0}</strong>
                  <span>Wildwood</span><strong>{hud.counts[BlockId.Log] ?? 0}</strong>
                </div>
              </div>
            </div>
            <div className="inventory-hotbar-preview">
              {hud.hotbar.map((block, index) => (
                <button type="button" key={`${block}-preview-${index}`} className={hud.selected === index ? "selected" : ""} onClick={() => engineRef.current?.selectSlot(index)} aria-label={`Select hotbar slot ${index + 1}`}>
                  <span>{index + 1}</span><BlockIcon id={block} small />
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {overlay === "help" && (
        <section className="menu-overlay" aria-labelledby="help-title">
          <div className="pixel-panel help-panel">
            <span className="panel-eyebrow">FIELD MANUAL</span>
            <h2 id="help-title">How to Roam the Wild</h2>
            <div className="control-grid">
              <div><kbd>W A S D</kbd><span><strong>Move</strong>Walk relative to where you look.</span></div>
              <div><kbd>MOUSE</kbd><span><strong>Look</strong>Click the world to capture the cursor.</span></div>
              <div><kbd>SPACE</kbd><span><strong>Jump</strong>Scale blocks and hop gaps.</span></div>
              <div><kbd>SHIFT</kbd><span><strong>Sprint</strong>Move faster; survival sprinting uses hunger.</span></div>
              <div><kbd>HOLD LMB</kbd><span><strong>Harvest</strong>Harder blocks take longer.</span></div>
              <div><kbd>RMB</kbd><span><strong>Build</strong>Place the selected block on a face.</span></div>
              <div><kbd>1–9 / WHEEL</kbd><span><strong>Select</strong>Choose a hotbar block.</span></div>
              <div><kbd>E</kbd><span><strong>Inventory</strong>Equip blocks and craft materials.</span></div>
              <div><kbd>MIDDLE</kbd><span><strong>Pick block</strong>Match the block under your crosshair.</span></div>
              <div><kbd>F3</kbd><span><strong>Debug</strong>Show coordinates, mode, seed, and weather.</span></div>
            </div>
            <p className="help-tip"><strong>First expedition:</strong> collect a log, uncover coal in a cliff, craft glowstone, then find the golden waystone across the southeast ridge.</p>
            <div className="panel-actions">
              <PixelButton className="gold-button" onClick={() => started ? resume() : setOverlay("title")}>{started ? "Back to Game" : "Back"}</PixelButton>
            </div>
          </div>
        </section>
      )}

      {overlay === "settings" && (
        <section className="menu-overlay" aria-labelledby="settings-title">
          <div className="pixel-panel settings-panel">
            <span className="panel-eyebrow">OPTIONS</span>
            <h2 id="settings-title">Settings</h2>
            <label className="setting-row">
              <span><strong>Master volume</strong><small>{settings.muted ? "Muted" : `${Math.round(settings.volume * 100)}%`}</small></span>
              <input type="range" min="0" max="1" step="0.05" value={settings.volume} onChange={(event) => updateSettings({ volume: Number(event.target.value), muted: false })} />
            </label>
            <label className="setting-row">
              <span><strong>Look sensitivity</strong><small>{Math.round((settings.sensitivity / 0.005) * 100)}%</small></span>
              <input type="range" min="0.0008" max="0.005" step="0.0001" value={settings.sensitivity} onChange={(event) => updateSettings({ sensitivity: Number(event.target.value) })} />
            </label>
            <label className="setting-row">
              <span><strong>Field of view</strong><small>{Math.round(settings.fov)}°</small></span>
              <input type="range" min="55" max="100" step="1" value={settings.fov} onChange={(event) => updateSettings({ fov: Number(event.target.value) })} />
            </label>
            <div className="toggle-setting">
              <span><strong>Sound effects & ambience</strong><small>Synthesized live in your browser.</small></span>
              <button type="button" className={settings.muted ? "" : "active"} onClick={() => updateSettings({ muted: !settings.muted })}>{settings.muted ? "OFF" : "ON"}</button>
            </div>
            <div className="toggle-setting">
              <span><strong>Weather</strong><small>Rain falls in the world, not on the menu.</small></span>
              <button type="button" className={settings.weather === "rain" ? "active" : ""} onClick={() => {
                const weather = settings.weather === "rain" ? "clear" : "rain";
                updateSettings({ weather });
                engineRef.current?.setWeather(weather);
              }}>{settings.weather === "rain" ? "RAIN" : "CLEAR"}</button>
            </div>
            <div className="panel-actions">
              <PixelButton className="gold-button" onClick={() => setOverlay(settingsReturn)}>Done</PixelButton>
            </div>
          </div>
        </section>
      )}

      {overlay === "reset" && (
        <section className="menu-overlay" aria-labelledby="reset-title">
          <div className="pixel-panel confirm-panel">
            <div className="warning-cube" aria-hidden="true">!</div>
            <h2 id="reset-title">Regenerate this world?</h2>
            <p>This permanently erases placed and harvested blocks, inventory, and your current position. The cube remembers nothing.</p>
            <div className="panel-actions">
              <PixelButton onClick={() => setOverlay("pause")}>Keep World</PixelButton>
              <PixelButton className="danger-button" onClick={confirmReset}>Erase & Regenerate</PixelButton>
            </div>
          </div>
        </section>
      )}

      {webglError && (
        <section className="webgl-fallback" role="alert" aria-labelledby="webgl-title">
          <div className="pixel-panel confirm-panel">
            <div className="warning-cube" aria-hidden="true">◇</div>
            <h2 id="webgl-title">The world could not render</h2>
            <p>Blockwild needs WebGL hardware acceleration. Try a current desktop browser and make sure graphics acceleration is enabled.</p>
          </div>
        </section>
      )}
    </main>
  );
}
