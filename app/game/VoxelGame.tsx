"use client";

/* eslint-disable react-hooks/refs -- engine access occurs only inside event callbacks produced by render helpers. */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  CREATIVE_BLOCKS,
  ITEMS,
  MOB_DEFS,
  MOB_ORDER,
  RECIPES,
  VoxelEngine,
  clearSavedWorld,
  readSavedWorld,
  readSettings,
  type GameMode,
  type GameSettings,
  type HudState,
  type InventorySlot,
  type ItemCode,
  type MobKind,
  type OverlayKind,
} from "./engine";

type Overlay = "title" | "new" | "pause" | "inventory" | "crafting" | "furnace" | "chest" | "bestiary" | "help" | "settings" | "reset" | null;

const blankSlots = (count: number) => Array.from({ length: count }, () => null as InventorySlot | null);

const INITIAL_HUD: HudState = {
  health: 10,
  hunger: 10,
  xp: 0,
  level: 0,
  inventory: blankSlots(36),
  cursor: null,
  craftGrid: blankSlots(9),
  craftOutput: null,
  craftingSize: 2,
  activeFurnace: null,
  activeChest: null,
  activeChestTitle: "Wildwood Chest",
  equipment: { head: null, chest: null, legs: null, feet: null },
  armor: 0,
  bestiary: Object.fromEntries(MOB_ORDER.map((kind) => [kind, { seen: false, kills: 0 }])) as HudState["bestiary"],
  selected: 0,
  targetName: null,
  targetMob: null,
  breakProgress: 0,
  day: 1,
  clock: "8:00 AM",
  biome: "Flower Meadow",
  depth: "Surface",
  coordinates: [0, 0, 0],
  debug: false,
  mode: "survival",
  weather: "clear",
  loadedChunks: 9,
  queuedChunks: 0,
  fullscreen: false,
};

function ItemIcon({ item, small = false }: { item: ItemCode; small?: boolean }) {
  const definition = ITEMS[item];
  const isTool = Boolean(definition?.toolKind);
  return (
    <span
      className={`item-icon ${small ? "item-icon-small" : ""} ${isTool ? `tool-icon tool-${definition.toolKind}` : "block-item-icon"}`}
      style={{ "--item-color": definition?.color ?? "#777" } as CSSProperties}
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
        <span key={index} className={index < Math.ceil(value) ? "filled" : "empty"}>{kind === "heart" ? "♥" : "◆"}</span>
      ))}
    </div>
  );
}

function ArmorPips({ value }: { value: number }) {
  return (
    <div className="stat-pips stat-armor" aria-label={`Armor: ${value} points`}>
      {Array.from({ length: 10 }, (_, index) => <span key={index} className={index < Math.ceil(value / 1.2) ? "filled" : "empty"}>⬟</span>)}
    </div>
  );
}

function SlotContents({ slot }: { slot: InventorySlot | null }) {
  if (!slot) return null;
  const definition = ITEMS[slot.item];
  const maxDurability = definition?.maxDurability;
  const durability = slot.durability ?? maxDurability;
  return (
    <>
      <ItemIcon item={slot.item} />
      {slot.count > 1 && <span className="item-count">{slot.count}</span>}
      {maxDurability && durability !== undefined && (
        <span className="durability-track"><span style={{ width: `${Math.max(0, durability / maxDurability) * 100}%` }} /></span>
      )}
    </>
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
  const [toast, setToast] = useState("There is always another horizon. Usually with teeth.");
  const [savedPulse, setSavedPulse] = useState(false);
  const [seed, setSeed] = useState("WILDERNESS");
  const [currentWorldSeed, setCurrentWorldSeed] = useState("WILDERNESS");
  const [mode, setMode] = useState<GameMode>("survival");
  const [settings, setSettingsState] = useState<GameSettings>(() => readSettings());
  const [settingsReturn, setSettingsReturn] = useState<"title" | "pause">("title");
  const [webglError, setWebglError] = useState(false);
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
  const [inventoryTab, setInventoryTab] = useState<"inventory" | "recipes" | "creative">("inventory");
  const [selectedBestiary, setSelectedBestiary] = useState<MobKind>("mossling");

  const setOverlay = useCallback((next: Overlay) => {
    overlayRef.current = next;
    setOverlayState(next);
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 4300);
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
        onOverlayRequest: (kind: OverlayKind) => {
          if (!startedRef.current) return;
          setInventoryTab(kind === "inventory" ? "inventory" : "recipes");
          setOverlay(kind);
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

  useEffect(() => {
    const handleMenuKeys = (event: KeyboardEvent) => {
      const current = overlayRef.current;
      const engine = engineRef.current;
      if (event.code === "KeyE" && ["inventory", "crafting", "furnace", "chest"].includes(current ?? "")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        engine?.closeContainer();
        setOverlay(null);
        engine?.activate();
        return;
      }
      if (event.code !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      if (current !== null) {
        if (["inventory", "crafting", "furnace", "chest"].includes(current)) engine?.closeContainer();
        if (startedRef.current) {
          if (current === "pause") { setOverlay(null); engine?.activate(); }
          else if (current === "settings" || current === "help" || current === "reset" || current === "bestiary") setOverlay("pause");
          else { setOverlay(null); engine?.activate(); }
        } else if (current !== "title") setOverlay("title");
      } else if (startedRef.current) {
        engine?.pause();
        setOverlay("pause");
      }
    };
    window.addEventListener("keydown", handleMenuKeys, true);
    return () => window.removeEventListener("keydown", handleMenuKeys, true);
  }, [setOverlay]);

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
    showToast("WASD move · Space jump/swim · Shift sprint · Left harvest/attack · Right use/build · E inventory · Esc menu");
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
    showToast(`Welcome back to ${save.seed}. The horizon kept going without you.`);
  };

  const resume = () => {
    engineRef.current?.closeContainer();
    setOverlay(null);
    engineRef.current?.activate();
  };

  const saveAndQuit = () => {
    const engine = engineRef.current;
    if (!engine) return;
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

  const trackCursor = (event: ReactPointerEvent<HTMLElement>) => setCursorPosition({ x: event.clientX, y: event.clientY });

  const slotAction = (index: number, button: "left" | "right", shift = false) => engineRef.current?.inventoryClick(index, button, shift);
  const slotContext = (event: ReactMouseEvent, action: () => void) => { event.preventDefault(); action(); };

  const renderSlot = (
    slot: InventorySlot | null,
    key: string,
    onLeft: (shift: boolean) => void,
    onRight: () => void,
    className = "",
    label?: string,
  ) => (
    <button
      type="button"
      key={key}
      className={`mc-slot ${className}`}
      title={slot ? `${ITEMS[slot.item]?.name ?? "Item"}${slot.durability !== undefined ? ` · ${slot.durability} durability` : ""}` : label}
      aria-label={slot ? `${ITEMS[slot.item]?.name ?? "Item"}, ${slot.count}` : label ?? "Empty slot"}
      onClick={(event) => {
        if (event.detail >= 2) engineRef.current?.collectMatching(slot?.item ?? hud.cursor?.item);
        else onLeft(event.shiftKey);
      }}
      onContextMenu={(event) => slotContext(event, onRight)}
    >
      <SlotContents slot={slot} />
    </button>
  );

  const renderPlayerInventory = () => (
    <div className="player-inventory-section">
      <span className="grid-label">INVENTORY</span>
      <div className="mc-grid main-inventory-grid">
        {hud.inventory.slice(9, 36).map((slot, offset) => renderSlot(slot, `main-${offset}`, (shift) => slotAction(offset + 9, "left", shift), () => slotAction(offset + 9, "right")))}
      </div>
      <div className="mc-grid inventory-hotbar-grid">
        {hud.inventory.slice(0, 9).map((slot, index) => renderSlot(slot, `inv-hot-${index}`, (shift) => slotAction(index, "left", shift), () => slotAction(index, "right"), hud.selected === index ? "selected" : ""))}
      </div>
    </div>
  );

  const recipeAvailable = (recipeId: string) => {
    const recipe = RECIPES.find((candidate) => candidate.id === recipeId);
    if (!recipe) return false;
    if (recipe.table && hud.craftingSize < 3) return false;
    return true;
  };

  const renderRecipeBook = (includeTable: boolean) => (
    <aside className="recipe-book">
      <div className="recipe-book-title"><span>▤</span><strong>RECIPE BOOK</strong></div>
      <div className="recipe-scroll">
        {RECIPES.filter((recipe) => includeTable || !recipe.table).map((recipe) => (
          <button type="button" key={recipe.id} className="recipe-entry" disabled={!recipeAvailable(recipe.id)} onClick={() => engineRef.current?.autoCraft(recipe.id)}>
            <ItemIcon item={recipe.output.item} small />
            <span><strong>{recipe.name}</strong><small>{recipe.output.count > 1 ? `Makes ${recipe.output.count}` : recipe.table ? "Crafting table" : "Hand craftable"}</small></span>
            <b>+</b>
          </button>
        ))}
      </div>
      <p>Click a known recipe to craft directly when you have the ingredients. Or arrange the grid yourself, cube scholar.</p>
    </aside>
  );

  const renderCraftingArea = (size: 2 | 3) => {
    const positions = size === 2 ? [0, 1, 3, 4] : Array.from({ length: 9 }, (_, index) => index);
    return (
      <div className="crafting-workspace">
        <div className={`mc-grid craft-grid craft-${size}`}>
          {positions.map((position) => renderSlot(hud.craftGrid[position], `craft-${position}`, (shift) => engineRef.current?.craftSlotClick(position, "left", shift), () => engineRef.current?.craftSlotClick(position, "right")))}
        </div>
        <div className="craft-arrow"><span>▶</span></div>
        {renderSlot(hud.craftOutput, "craft-output", (shift) => engineRef.current?.craftOutputClick(shift), () => undefined, "craft-output-slot", "Crafting output")}
      </div>
    );
  };

  const selectedSlot = hud.inventory[hud.selected];
  const selectedName = selectedSlot ? ITEMS[selectedSlot.item]?.name ?? "Unknown Item" : "Empty Hand";
  const xpNeeded = 12 + hud.level * 6;
  const bestiaryDefinition = MOB_DEFS[selectedBestiary];
  const bestiaryProgress = hud.bestiary[selectedBestiary];

  return (
    <main className="game-shell">
      <canvas ref={canvasRef} className="game-canvas" aria-label="Blockwild endless 3D game world" />
      <div className="sky-vignette" aria-hidden="true" />

      {started && overlay === null && (
        <div className="game-hud" aria-live="polite">
          <div className="world-readout expanded-readout">
            <strong>DAY {hud.day}</strong>
            <span>{hud.clock}</span>
            <span>{hud.biome}</span>
            <span className="depth-readout">{hud.depth}</span>
          </div>
          <div className="objective-card">
            <span className="objective-kicker">THE FIRST LONG NIGHT</span>
            <strong>Wood → table → pickaxe → shelter</strong>
            <span>Then dig. The rarest crystals wait below Y −24. The hungriest things do too.</span>
          </div>
          <button type="button" className="hud-fullscreen-button" onClick={() => engineRef.current?.toggleFullscreen()} aria-label={hud.fullscreen ? "Exit fullscreen" : "Enter fullscreen"}>{hud.fullscreen ? "⊡" : "□"}</button>

          {hud.debug && (
            <div className="debug-card">
              XYZ {hud.coordinates.join(" / ")}<br />
              {hud.mode.toUpperCase()} · {hud.weather.toUpperCase()} · {hud.depth.toUpperCase()}<br />
              Seed: {currentWorldSeed}<br />
              Chunks: {hud.loadedChunks} loaded · {hud.queuedChunks} queued
            </div>
          )}

          <div className="crosshair" aria-hidden="true"><span /><span /></div>
          {hud.breakProgress > 0 && (
            <div className="break-meter" aria-label={`Mining progress ${Math.round(hud.breakProgress * 100)} percent`}><span style={{ width: `${hud.breakProgress * 100}%` }} /></div>
          )}
          {hud.targetMob && (
            <div className="mob-target-card">
              <strong>{hud.targetMob.name}</strong>
              <span><i style={{ width: `${Math.max(0, hud.targetMob.health / hud.targetMob.maxHealth) * 100}%` }} /></span>
              <small>{Math.max(0, hud.targetMob.health)} / {hud.targetMob.maxHealth}</small>
            </div>
          )}

          <div className="bottom-hud">
            <div className="active-block-name">{selectedName}</div>
            {hud.mode === "survival" && (
              <div className="survival-stats">
                <StatPips kind="heart" value={hud.health} />
                <StatPips kind="hunger" value={hud.hunger} />
                {hud.armor > 0 && <ArmorPips value={hud.armor} />}
              </div>
            )}
            <div className="xp-bar" aria-label={`Level ${hud.level}, ${hud.xp} of ${xpNeeded} experience`}><span style={{ width: `${Math.min(100, hud.xp / xpNeeded * 100)}%` }} /><b>{hud.level || ""}</b></div>
            <div className="hotbar" role="toolbar" aria-label="Item hotbar">
              {hud.inventory.slice(0, 9).map((slot, index) => (
                <button type="button" key={`hotbar-${index}`} className={`hotbar-slot ${hud.selected === index ? "selected" : ""}`} aria-label={`Slot ${index + 1}: ${slot ? ITEMS[slot.item]?.name : "empty"}`} onClick={() => engineRef.current?.selectSlot(index)}>
                  <span className="slot-number">{index + 1}</span>
                  <SlotContents slot={slot} />
                </button>
              ))}
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
            <button type="button" className="touch-action jump-action" aria-label="Jump or swim" onPointerDown={(event) => { event.preventDefault(); engineRef.current?.jump(); }}>↑</button>
            <button type="button" className="touch-action mine-action" aria-label="Harvest or attack" onPointerDown={(event) => { event.preventDefault(); engineRef.current?.setMining(true); }} onPointerUp={() => engineRef.current?.setMining(false)} onPointerCancel={() => engineRef.current?.setMining(false)}>⚒</button>
            <button type="button" className="touch-action place-action" aria-label="Use or place" onPointerDown={(event) => { event.preventDefault(); engineRef.current?.useSelected(); }}>▣</button>
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
              <p className="logo-subtitle">ENDLESS HORIZONS · SEVENTEEN BIOMES · A VERY DEEP DOWN</p>
              <span className="splash-text">Now actually endless!</span>
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
              <span>Endless streamed terrain · original procedural textures · local persistent worlds</span>
              <button type="button" className="sound-quick-toggle" onClick={() => updateSettings({ muted: !settings.muted })} aria-label={settings.muted ? "Turn sound on" : "Mute sound"}>{settings.muted ? "SOUND: OFF" : "SOUND: ON"}</button>
            </div>
          </div>
        </section>
      )}

      {overlay === "new" && (
        <section className="menu-overlay" aria-labelledby="new-world-title">
          <div className="pixel-panel world-setup-panel expanded-setup-panel">
            <span className="panel-eyebrow">ENDLESS WORLD GENERATOR</span>
            <h2 id="new-world-title">Create a New World</h2>
            <p className="setup-intro">Every seed grows continents, oceans, rivers, mountains, seventeen surface biomes, cave networks, ruins, cabins, and a worldheart sixty-four blocks below zero.</p>
            <label className="field-label" htmlFor="world-seed">World seed</label>
            <div className="seed-row">
              <input id="world-seed" className="pixel-input" value={seed} maxLength={32} onChange={(event) => setSeed(event.target.value.toUpperCase())} />
              <button type="button" className="seed-die" onClick={() => setSeed(engineRef.current?.randomSeed() ?? "WILDERNESS")} aria-label="Randomize seed">◆</button>
            </div>
            <fieldset className="mode-picker">
              <legend>Game mode</legend>
              <button type="button" className={mode === "survival" ? "active" : ""} onClick={() => setMode("survival")}>
                <strong>SURVIVAL</strong>
                <span>Stack inventory, tools, durability, hunger, crafting tables, furnaces, hostile nights, mob loot, XP, and irresponsible spelunking.</span>
              </button>
              <button type="button" className={mode === "builder" ? "active" : ""} onClick={() => setMode("builder")}>
                <strong>BUILDER</strong>
                <span>Fast harvesting, infinite placement, creative catalog, no hunger, and fewer consequences for architectural hubris.</span>
              </button>
            </fieldset>
            <div className="world-feature-strip">
              <span><b>∞</b> STREAMED WORLD</span><span><b>17</b> BIOMES</span><span><b>7</b> MOB SPECIES</span><span><b>192</b> BLOCKS TALL</span>
            </div>
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
            <span className="panel-eyebrow">{hud.biome} · DAY {hud.day} · {hud.clock}</span>
            <h2 id="pause-title">Game Paused</h2>
            <p className="panel-flavor">Loaded {hud.loadedChunks} chunks around you. The rest of infinity is waiting politely offscreen.</p>
            <div className="stacked-menu-buttons">
              <PixelButton className="gold-button" onClick={() => { setOverlay(null); engineRef.current?.activate(); }}>Back to Game</PixelButton>
              <PixelButton onClick={() => engineRef.current?.openOverlay("inventory")}>Inventory & Crafting</PixelButton>
              <PixelButton onClick={() => engineRef.current?.openOverlay("bestiary")}>Bestiary</PixelButton>
              <PixelButton onClick={() => engineRef.current?.toggleFullscreen()}>{hud.fullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}</PixelButton>
              <PixelButton onClick={() => openSettings("pause")}>Settings</PixelButton>
              <PixelButton onClick={() => setOverlay("help")}>Field Manual</PixelButton>
              <PixelButton className="danger-button" onClick={() => setOverlay("reset")}>Delete & Regenerate World</PixelButton>
              <PixelButton className="secondary-button" onClick={saveAndQuit}>Save & Quit to Title</PixelButton>
            </div>
          </div>
        </section>
      )}

      {(overlay === "inventory" || overlay === "crafting") && (
        <section className="menu-overlay inventory-overlay" aria-labelledby="inventory-title" onPointerMove={trackCursor}>
          <div className="mc-window inventory-window">
            <header className="mc-window-header">
              <div><span className="panel-eyebrow">{overlay === "crafting" ? "CRAFTING TABLE · 3×3" : hud.mode === "builder" ? "BUILDER INVENTORY" : "PACK · 2×2 CRAFTING"}</span><h2 id="inventory-title">{overlay === "crafting" ? "Crafting Table" : "Inventory"}</h2></div>
              <button type="button" className="panel-close" onClick={resume} aria-label="Close inventory">×</button>
            </header>
            <div className="inventory-tabs">
              <button type="button" className={inventoryTab === "inventory" ? "active" : ""} onClick={() => setInventoryTab("inventory")}>PACK</button>
              <button type="button" className={inventoryTab === "recipes" ? "active" : ""} onClick={() => setInventoryTab("recipes")}>RECIPES</button>
              {hud.mode === "builder" && <button type="button" className={inventoryTab === "creative" ? "active" : ""} onClick={() => setInventoryTab("creative")}>ALL BLOCKS</button>}
            </div>
            {inventoryTab === "creative" && hud.mode === "builder" ? (
              <div className="creative-catalog">
                {CREATIVE_BLOCKS.map((item) => (
                  <button type="button" key={item} className="creative-entry" onClick={() => engineRef.current?.setCreativeItem(item)}><ItemIcon item={item} /><span>{ITEMS[item]?.name}</span></button>
                ))}
              </div>
            ) : (
              <div className="inventory-workbench-layout">
                {inventoryTab === "recipes" ? renderRecipeBook(overlay === "crafting") : (
                  <div className="player-paper-doll">
                    <div className="paper-doll-stage">
                      <div className="equipment-slots">
                        {renderSlot(hud.equipment.head, "armor-head", (shift) => engineRef.current?.equipmentClick("head", "left", shift), () => engineRef.current?.equipmentClick("head", "right"), "equipment-slot", "Head armor")}
                        {renderSlot(hud.equipment.chest, "armor-chest", (shift) => engineRef.current?.equipmentClick("chest", "left", shift), () => engineRef.current?.equipmentClick("chest", "right"), "equipment-slot", "Chest armor")}
                        {renderSlot(hud.equipment.legs, "armor-legs", (shift) => engineRef.current?.equipmentClick("legs", "left", shift), () => engineRef.current?.equipmentClick("legs", "right"), "equipment-slot", "Leg armor")}
                        {renderSlot(hud.equipment.feet, "armor-feet", (shift) => engineRef.current?.equipmentClick("feet", "left", shift), () => engineRef.current?.equipmentClick("feet", "right"), "equipment-slot", "Boots")}
                      </div>
                      <div className="avatar-cube"><span className="avatar-head" /><span className="avatar-body" /><span className="avatar-leg leg-a" /><span className="avatar-leg leg-b" /></div>
                    </div>
                    <span className="armor-readout">ARMOR {hud.armor}</span>
                    <small>LEVEL {hud.level}</small>
                    <b>{hud.depth}</b>
                  </div>
                )}
                <div className="crafting-and-pack">
                  <div className="craft-title">CRAFTING {overlay === "crafting" ? "3×3" : "2×2"}</div>
                  {renderCraftingArea(overlay === "crafting" ? 3 : 2)}
                  {renderPlayerInventory()}
                </div>
              </div>
            )}
            <div className="inventory-instructions">Left click moves stacks · Double-click gathers matching items · Right click splits/places one · Shift-click transfers to armor, chests, furnaces, pack or hotbar</div>
          </div>
          {hud.cursor && <div className="held-stack" style={{ left: cursorPosition.x, top: cursorPosition.y }}><SlotContents slot={hud.cursor} /></div>}
        </section>
      )}

      {overlay === "furnace" && (
        <section className="menu-overlay inventory-overlay" aria-labelledby="furnace-title" onPointerMove={trackCursor}>
          <div className="mc-window machine-window">
            <header className="mc-window-header"><div><span className="panel-eyebrow">SMELTING STATION</span><h2 id="furnace-title">Furnace</h2></div><button type="button" className="panel-close" onClick={resume}>×</button></header>
            <div className="furnace-layout">
              <div className="furnace-input-stack">
                {renderSlot(hud.activeFurnace?.input ?? null, "furnace-input", (shift) => engineRef.current?.machineClick("furnace", 0, "left", shift), () => engineRef.current?.machineClick("furnace", 0, "right"), "machine-slot", "Smelting input")}
                <div className={`furnace-flame ${(hud.activeFurnace?.burn ?? 0) > 0 ? "lit" : ""}`}><span>♨</span><i style={{ height: `${hud.activeFurnace?.burnMax ? hud.activeFurnace.burn / hud.activeFurnace.burnMax * 100 : 0}%` }} /></div>
                {renderSlot(hud.activeFurnace?.fuel ?? null, "furnace-fuel", (shift) => engineRef.current?.machineClick("furnace", 1, "left", shift), () => engineRef.current?.machineClick("furnace", 1, "right"), "machine-slot", "Fuel")}
              </div>
              <div className="smelt-progress"><span style={{ width: `${Math.min(100, (hud.activeFurnace?.progress ?? 0) / 8 * 100)}%` }} /><b>▶</b></div>
              {renderSlot(hud.activeFurnace?.output ?? null, "furnace-output", (shift) => engineRef.current?.machineClick("furnace", 2, "left", shift), () => engineRef.current?.machineClick("furnace", 2, "right"), "machine-slot furnace-output-slot", "Smelted output")}
              <div className="smelt-guide"><strong>SMELTING</strong><span>Ore → ingot</span><span>Sand → glass</span><span>Raw meat → cooked</span><span>Log → charcoal</span><span>Cobble → stone</span><small>Coal burns longest. Sticks burn with admirable optimism.</small></div>
            </div>
            {renderPlayerInventory()}
          </div>
          {hud.cursor && <div className="held-stack" style={{ left: cursorPosition.x, top: cursorPosition.y }}><SlotContents slot={hud.cursor} /></div>}
        </section>
      )}

      {overlay === "chest" && (
        <section className="menu-overlay inventory-overlay" aria-labelledby="chest-title" onPointerMove={trackCursor}>
          <div className="mc-window chest-window">
            <header className="mc-window-header"><div><span className="panel-eyebrow">WILDWOOD STORAGE</span><h2 id="chest-title">{hud.activeChestTitle}</h2></div><button type="button" className="panel-close" onClick={resume}>×</button></header>
            <span className="grid-label">CHEST</span>
            <div className="mc-grid chest-grid">
              {(hud.activeChest ?? blankSlots(27)).map((slot, index) => renderSlot(slot, `chest-${index}`, (shift) => engineRef.current?.machineClick("chest", index, "left", shift), () => engineRef.current?.machineClick("chest", index, "right")))}
            </div>
            {renderPlayerInventory()}
          </div>
          {hud.cursor && <div className="held-stack" style={{ left: cursorPosition.x, top: cursorPosition.y }}><SlotContents slot={hud.cursor} /></div>}
        </section>
      )}

      {overlay === "bestiary" && (
        <section className="menu-overlay bestiary-overlay" aria-labelledby="bestiary-title">
          <div className="mc-window bestiary-window">
            <header className="mc-window-header">
              <div><span className="panel-eyebrow">FIELD NOTES · {MOB_ORDER.filter((kind) => hud.bestiary[kind].seen).length}/{MOB_ORDER.length} DISCOVERED</span><h2 id="bestiary-title">Bestiary</h2></div>
              <button type="button" className="panel-close" onClick={() => setOverlay("pause")}>×</button>
            </header>
            <div className="bestiary-layout">
              <nav className="bestiary-list" aria-label="Creature list">
                {MOB_ORDER.map((kind) => {
                  const definition = MOB_DEFS[kind];
                  const progress = hud.bestiary[kind];
                  return <button type="button" key={kind} className={selectedBestiary === kind ? "active" : ""} onClick={() => setSelectedBestiary(kind)}><span className={`bestiary-mini ${progress.seen ? "seen" : ""}`} style={{ "--mob-color": `#${definition.colors[0].toString(16).padStart(6, "0")}` } as CSSProperties} /><strong>{progress.seen ? definition.name : "Unknown Creature"}</strong><small>{progress.seen ? `${definition.temperament} · ${progress.kills} kills` : "Undiscovered"}</small></button>;
                })}
              </nav>
              <article className={`bestiary-detail ${bestiaryProgress.seen ? "seen" : "unknown"}`}>
                <div className="bestiary-portrait" style={{ "--mob-color": `#${bestiaryDefinition.colors[0].toString(16).padStart(6, "0")}`, "--mob-accent": `#${bestiaryDefinition.colors[1].toString(16).padStart(6, "0")}` } as CSSProperties}><span /><i /><b>?</b></div>
                {bestiaryProgress.seen ? <>
                  <div className="bestiary-heading"><div><span>{bestiaryDefinition.temperament.toUpperCase()}</span><h3>{bestiaryDefinition.name}</h3></div><strong>{bestiaryProgress.kills} DEFEATED</strong></div>
                  <p className="bestiary-lore">{bestiaryDefinition.lore}</p>
                  <div className="bestiary-facts"><div><small>HABITAT</small><strong>{bestiaryDefinition.habitat}</strong></div><div><small>ACTIVE</small><strong>{bestiaryDefinition.active}</strong></div><div><small>HEALTH</small><strong>{bestiaryDefinition.health} hearts</strong></div><div><small>DANGER</small><strong>{bestiaryDefinition.damage ? `${bestiaryDefinition.damage} damage` : "Harmless"}</strong></div></div>
                  <section className="behavior-note"><small>BEHAVIOR</small><p>{bestiaryDefinition.behavior}</p></section>
                  <section className="bestiary-loot"><small>OBSERVED DROPS</small>{bestiaryDefinition.drops.map((drop) => <div key={drop.item}><ItemIcon item={drop.item} small /><span><strong>{bestiaryProgress.kills ? ITEMS[drop.item]?.name : "Unknown drop"}</strong><small>{bestiaryProgress.kills ? `${drop.min}${drop.max !== drop.min ? `–${drop.max}` : ""} · ${Math.round(drop.chance * 100)}% chance` : "Defeat one to record it"}</small></span></div>)}</section>
                </> : <div className="unknown-entry"><span className="panel-eyebrow">NO RELIABLE OBSERVATION</span><h3>Unknown Creature</h3><p>Find this creature in the wild and bring it within view to reveal its field notes.</p></div>}
              </article>
            </div>
          </div>
        </section>
      )}

      {overlay === "help" && (
        <section className="menu-overlay" aria-labelledby="help-title">
          <div className="pixel-panel help-panel mega-help-panel">
            <span className="panel-eyebrow">FIELD MANUAL · REVISED AFTER SEVERAL INCIDENTS</span>
            <h2 id="help-title">How to Survive the Wild</h2>
            <div className="control-grid">
              <div><kbd>W A S D</kbd><span><strong>Move</strong>Walk relative to your view.</span></div>
              <div><kbd>MOUSE</kbd><span><strong>Look</strong>Click the world to capture the cursor.</span></div>
              <div><kbd>SPACE</kbd><span><strong>Jump / swim</strong>Hold it underwater to rise.</span></div>
              <div><kbd>SHIFT</kbd><span><strong>Sprint</strong>Faster, louder, hungrier.</span></div>
              <div><kbd>HOLD LMB</kbd><span><strong>Harvest / attack</strong>The crosshair decides which.</span></div>
              <div><kbd>RMB</kbd><span><strong>Use / build / eat</strong>Tables, furnaces, chests, food, and blocks.</span></div>
              <div><kbd>1–9 / WHEEL</kbd><span><strong>Select</strong>Choose a hotbar stack.</span></div>
              <div><kbd>E</kbd><span><strong>Inventory</strong>2×2 hand crafting and the full stack inventory.</span></div>
              <div><kbd>Q</kbd><span><strong>Drop item</strong>Toss one from the selected stack.</span></div>
              <div><kbd>ESC</kbd><span><strong>Menu</strong>Open or close the current menu. Fullscreen remains a menu button.</span></div>
              <div><kbd>MIDDLE</kbd><span><strong>Pick block</strong>Match the targeted block in Builder mode.</span></div>
              <div><kbd>F3</kbd><span><strong>Debug</strong>Coordinates, depth, chunks, seed, and weather.</span></div>
            </div>
            <div className="progression-guide">
              <div><b>1</b><strong>Punch a tree</strong><span>Turn one log into four planks in your 2×2 grid.</span></div>
              <div><b>2</b><strong>Craft a table</strong><span>Four planks unlock the 3×3 recipes.</span></div>
              <div><b>3</b><strong>Make tools</strong><span>Wood → cobble → sunmetal → star crystal.</span></div>
              <div><b>4</b><strong>Build a furnace</strong><span>Eight cobble. Smelt ore, glass, meat, and charcoal.</span></div>
              <div><b>5</b><strong>Own the night</strong><span>Hostiles drop shards, gel, bone, coal, and XP.</span></div>
              <div><b>6</b><strong>Go below zero</strong><span>Crystal deeps, lava, aquifers, and the worldheart await.</span></div>
            </div>
            <div className="panel-actions"><PixelButton className="gold-button" onClick={() => setOverlay(started ? "pause" : "title")}>{started ? "Back to Menu" : "Back"}</PixelButton></div>
          </div>
        </section>
      )}

      {overlay === "settings" && (
        <section className="menu-overlay" aria-labelledby="settings-title">
          <div className="pixel-panel settings-panel">
            <span className="panel-eyebrow">OPTIONS</span>
            <h2 id="settings-title">Settings</h2>
            <label className="setting-row"><span><strong>Master volume</strong><small>{settings.muted ? "Muted" : `${Math.round(settings.volume * 100)}%`}</small></span><input type="range" min="0" max="1" step="0.05" value={settings.volume} onChange={(event) => updateSettings({ volume: Number(event.target.value), muted: false })} /></label>
            <label className="setting-row"><span><strong>Look sensitivity</strong><small>{Math.round((settings.sensitivity / 0.005) * 100)}%</small></span><input type="range" min="0.0008" max="0.005" step="0.0001" value={settings.sensitivity} onChange={(event) => updateSettings({ sensitivity: Number(event.target.value) })} /></label>
            <label className="setting-row"><span><strong>Field of view</strong><small>{Math.round(settings.fov)}°</small></span><input type="range" min="55" max="100" step="1" value={settings.fov} onChange={(event) => updateSettings({ fov: Number(event.target.value) })} /></label>
            <label className="setting-row"><span><strong>Render distance</strong><small>{settings.renderDistance} chunks · about {settings.renderDistance * 16} blocks</small></span><input type="range" min="2" max="5" step="1" value={settings.renderDistance} onChange={(event) => updateSettings({ renderDistance: Number(event.target.value) })} /></label>
            <div className="toggle-setting"><span><strong>Music, sound effects & ambience</strong><small>Includes the Blockwild day, night, and sea score.</small></span><button type="button" className={settings.muted ? "" : "active"} onClick={() => updateSettings({ muted: !settings.muted })}>{settings.muted ? "OFF" : "ON"}</button></div>
            <div className="toggle-setting"><span><strong>Weather</strong><small>Rain affects atmosphere and visibility.</small></span><button type="button" className={settings.weather === "rain" ? "active" : ""} onClick={() => { const weather = settings.weather === "rain" ? "clear" : "rain"; updateSettings({ weather }); }}>{settings.weather === "rain" ? "RAIN" : "CLEAR"}</button></div>
            <div className="fullscreen-setting"><PixelButton onClick={() => engineRef.current?.toggleFullscreen()}>{hud.fullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}</PixelButton></div>
            <div className="panel-actions"><PixelButton className="gold-button" onClick={() => setOverlay(settingsReturn)}>Done</PixelButton></div>
          </div>
        </section>
      )}

      {overlay === "reset" && (
        <section className="menu-overlay" aria-labelledby="reset-title">
          <div className="pixel-panel confirm-panel">
            <div className="warning-cube" aria-hidden="true">!</div>
            <h2 id="reset-title">Delete this endless world?</h2>
            <p>This erases every placed block, mined tunnel, inventory stack, furnace, chest, level, and position in this seed. Infinity will regenerate with no memory of your little house.</p>
            <div className="panel-actions"><PixelButton onClick={() => setOverlay("pause")}>Keep World</PixelButton><PixelButton className="danger-button" onClick={confirmReset}>Erase Everything</PixelButton></div>
          </div>
        </section>
      )}

      {webglError && (
        <section className="webgl-fallback" role="alert" aria-labelledby="webgl-title"><div className="pixel-panel confirm-panel"><div className="warning-cube" aria-hidden="true">◇</div><h2 id="webgl-title">The world could not render</h2><p>Blockwild needs WebGL hardware acceleration. Try a current desktop browser and make sure graphics acceleration is enabled.</p></div></section>
      )}
    </main>
  );
}
