"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  BlockId,
  CREATIVE_BLOCKS,
  ITEMS,
  Item,
  MOB_DEFS,
  MOB_ORDER,
  RECIPES,
  VoxelEngine,
  readSettings,
  type GameMode,
  type GameSettings,
  type HudState,
  type InventorySlot,
  type ItemCode,
  type MobKind,
  type OverlayKind,
} from "./engine";
import { BUTTERFLY_ORDER, CORE_MOB_ORDER } from "./mobs";
import {
  DEFAULT_WORLD_OPTIONS,
  WORLD_OWNERSHIP_NOTICE,
  WorldStorage,
  type WorldMetadata,
  type WorldOptions,
} from "./world-storage";

type Overlay = "title" | "new" | "pause" | "inventory" | "crafting" | "furnace" | "chest" | "bestiary" | "multiplayer" | "sleep" | "help" | "settings" | "reset" | null;
type BestiaryFilter = "all" | "creatures" | "winged";

type MultiplayerPeerView = {
  token?: string;
  id?: string;
  name?: string;
  identity?: { id?: string; name?: string } | null;
  state?: string;
  latencyMs?: number | null;
};

type MultiplayerViewState = {
  supported: boolean;
  reasons: string[];
  status: string;
  role: "host" | "guest" | null;
  peers: MultiplayerPeerView[];
  inviteCode: string;
  answerCode: string;
  error: string | null;
};

type MultiplayerActionResult = string | { inviteCode?: string; answerCode?: string } | void;

type MultiplayerEngineApi = {
  getMultiplayerState?: () => Partial<MultiplayerViewState>;
  hostMultiplayer?: (playerName: string) => MultiplayerActionResult | Promise<MultiplayerActionResult>;
  joinMultiplayer?: (inviteCode: string, playerName: string) => MultiplayerActionResult | Promise<MultiplayerActionResult>;
  acceptMultiplayerAnswer?: (answerCode: string) => void | Promise<void>;
  disconnectMultiplayer?: () => void | Promise<void>;
};

const EMPTY_MULTIPLAYER_STATE: MultiplayerViewState = {
  supported: false,
  reasons: [],
  status: "idle",
  role: null,
  peers: [],
  inviteCode: "",
  answerCode: "",
  error: null,
};

const formatPlayTime = (milliseconds: number) => {
  const minutes = Math.max(0, Math.floor(milliseconds / 60_000));
  if (minutes < 60) return `${minutes}m played`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m played`;
};

const formatWorldDate = (timestamp: number | null) => timestamp
  ? new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
  : "Never played";

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
  bestiary: Object.fromEntries(MOB_ORDER.map((kind) => [kind, { seen: false, kills: 0, captures: 0 }])) as HudState["bestiary"],
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
  cameraMode: "first",
  crouching: false,
  sprinting: false,
  onlinePlayers: 1,
};

function itemIconKind(item: ItemCode) {
  const definition = ITEMS[item];
  if (definition?.toolKind) return `tool-${definition.toolKind}`;
  if (definition?.equipmentSlot) return `armor-${definition.equipmentSlot}`;
  switch (item) {
    case BlockId.Torch: return "torch";
    case BlockId.RedFlower: return "flower-red";
    case BlockId.BlueFlower: return "flower-blue";
    case BlockId.TallGrass: return "grass";
    case BlockId.WheatCrop: return "wheat";
    case BlockId.WildwoodSapling: return "sapling";
    case Item.Stick: return "stick";
    case Item.Coal:
    case Item.Charcoal: return "coal";
    case Item.RawSunmetal:
    case Item.RawGold: return "ore-chunk";
    case Item.SunmetalIngot:
    case Item.GoldIngot: return "ingot";
    case Item.CrystalShard: return "crystal";
    case Item.Berry: return "berries";
    case Item.Apple: return "apple";
    case Item.Bread: return "bread";
    case Item.RawMeat:
    case Item.CookedMeat:
    case Item.RottenFlesh: return "meat";
    case Item.Fiber: return "fiber";
    case Item.Hide: return "hide";
    case Item.BoneShard: return "bone";
    case Item.GlowDust: return "glow-dust";
    case Item.Wool: return "wool";
    case Item.Wheat: return "wheat";
    case Item.Flint:
    case Item.ShadowShard: return "shard";
    case Item.CaveGel: return "gel";
    case Item.WildwoodDoor: return "door";
    case Item.WildwoodBed: return "bed";
    case Item.ButterflyNet: return "net";
    case Item.MeadowwingJar:
    case Item.AzureSkipperJar:
    case Item.EmbertipJar:
    case Item.FrostveilJar:
    case Item.BloomMonarchJar:
    case Item.FenLanternJar: return "jar";
    default: return definition?.placeBlock !== undefined ? "block" : "item";
  }
}

function ItemIcon({ item, small = false }: { item: ItemCode; small?: boolean }) {
  const definition = ITEMS[item];
  const isTool = Boolean(definition?.toolKind);
  const iconKind = itemIconKind(item);
  const custom = iconKind !== "block" && iconKind !== "item" && !isTool;
  return (
    <span
      className={`item-icon item-icon-kind-${iconKind} ${small ? "item-icon-small" : ""} ${isTool ? `tool-icon tool-${definition.toolKind}` : custom ? "custom-item-icon" : "block-item-icon"}`}
      style={{ "--item-color": definition?.color ?? "#777" } as CSSProperties}
      data-item-icon={iconKind}
      data-item-id={item}
      aria-hidden="true"
    />
  );
}

const creaturePortraitPath = (kind: MobKind) => `/creatures/${BUTTERFLY_ORDER.includes(kind as (typeof BUTTERFLY_ORDER)[number]) ? `butterfly-${kind}` : kind}.svg`;

function CreaturePortrait({ kind, seen, mini = false }: { kind: MobKind; seen: boolean; mini?: boolean }) {
  const definition = MOB_DEFS[kind];
  return (
    <span
      className={`creature-render ${mini ? "creature-render-mini" : "creature-render-hero"} ${seen ? "seen" : "unknown"}`}
      style={{
        "--mob-color": `#${definition.colors[0].toString(16).padStart(6, "0")}`,
        "--mob-accent": `#${definition.colors[1].toString(16).padStart(6, "0")}`,
      } as CSSProperties}
    >
      {/* Generated local SVGs preserve the exact production-model framing; image optimization would only proxy them. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={creaturePortraitPath(kind)} alt={mini ? "" : seen ? `${definition.name} three-dimensional model` : "Undiscovered creature silhouette"} aria-hidden={mini || undefined} />
      {!seen && <b aria-hidden="true">?</b>}
    </span>
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
  const worldStorageRef = useRef<WorldStorage | null>(null);
  const activeWorldIdRef = useRef<string | null>(null);
  const importWorldInputRef = useRef<HTMLInputElement>(null);
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
  const [worlds, setWorlds] = useState<WorldMetadata[]>([]);
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(null);
  const [worldName, setWorldName] = useState("Untamed World");
  const [worldOptions, setWorldOptions] = useState<WorldOptions>(() => ({ ...DEFAULT_WORLD_OPTIONS }));
  const [worldNotice, setWorldNotice] = useState("");
  const [seed, setSeed] = useState("WILDERNESS");
  const [currentWorldSeed, setCurrentWorldSeed] = useState("WILDERNESS");
  const [mode, setMode] = useState<GameMode>("survival");
  const [settings, setSettingsState] = useState<GameSettings>(() => readSettings());
  const [settingsReturn, setSettingsReturn] = useState<"title" | "pause">("title");
  const [webglError, setWebglError] = useState(false);
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
  const [inventoryTab, setInventoryTab] = useState<"inventory" | "recipes" | "creative">("inventory");
  const [selectedBestiary, setSelectedBestiary] = useState<MobKind>("mossling");
  const [bestiaryFilter, setBestiaryFilter] = useState<BestiaryFilter>("all");
  const [multiplayerName, setMultiplayerName] = useState("Trailkeeper");
  const [multiplayerInvite, setMultiplayerInvite] = useState("");
  const [multiplayerAnswer, setMultiplayerAnswer] = useState("");
  const [multiplayerState, setMultiplayerState] = useState<MultiplayerViewState>(EMPTY_MULTIPLAYER_STATE);
  const [multiplayerBusy, setMultiplayerBusy] = useState(false);

  const setOverlay = useCallback((next: Overlay) => {
    overlayRef.current = next;
    setOverlayState(next);
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 4300);
  }, []);

  const refreshWorldCatalog = useCallback((storage = worldStorageRef.current) => {
    if (!storage) return;
    const nextWorlds = storage.listWorlds({ sortBy: "lastPlayedAt", direction: "desc" });
    setWorlds(nextWorlds);
    setHasSave(nextWorlds.length > 0);
    setSelectedWorldId((current) => {
      if (current && nextWorlds.some((world) => world.id === current)) return current;
      if (storage.activeWorldId && nextWorlds.some((world) => world.id === storage.activeWorldId)) return storage.activeWorldId;
      return nextWorlds[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let browserStorage: Storage | null = null;
    try { browserStorage = window.localStorage; } catch { /* WorldStorage reports browser storage unavailability. */ }
    const storage = new WorldStorage(browserStorage);
    worldStorageRef.current = storage;
    const initialWorlds = storage.listWorlds({ sortBy: "lastPlayedAt", direction: "desc" });
    const initialWorld = initialWorlds.find((world) => world.id === storage.activeWorldId) ?? initialWorlds[0];
    window.queueMicrotask(() => {
      refreshWorldCatalog(storage);
      if (storage.issues.length) setWorldNotice(storage.issues.map((issue) => issue.message).join(" "));
      if (initialWorld) {
        setSelectedWorldId(initialWorld.id);
        setSeed(initialWorld.seed);
        setCurrentWorldSeed(initialWorld.seed);
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
          if (kind === "inventory" || kind === "crafting") setInventoryTab(kind === "inventory" ? "inventory" : "recipes");
          setOverlay(kind);
        },
        onDeath: () => undefined,
        onSave: () => {
          activeWorldIdRef.current = engineRef.current?.activeWorldId ?? activeWorldIdRef.current;
          refreshWorldCatalog(storage);
          setSavedPulse(true);
          window.setTimeout(() => setSavedPulse(false), 1300);
        },
      }, settings);
    } catch {
      window.queueMicrotask(() => setWebglError(true));
      return;
    }
    // React and the engine share one in-memory catalog so browser-local CRUD,
    // autosaves, and play-time accounting cannot diverge or double-commit.
    engine.worldStorage = storage;
    engineRef.current = engine;
    if (initialWorld) engine.previewWorld(initialWorld.seed);
    return () => {
      window.clearTimeout(toastTimerRef.current);
      engine.dispose();
      engineRef.current = null;
      worldStorageRef.current = null;
    };
    // The engine owns its listeners for the lifetime of the canvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshWorldCatalog, setOverlay, showToast]);

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
          else if (current === "settings" || current === "help" || current === "reset" || current === "bestiary" || current === "multiplayer") setOverlay("pause");
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
    setWorldName(`Untamed World ${worlds.length + 1}`);
    setWorldOptions({ ...DEFAULT_WORLD_OPTIONS });
    setWorldNotice("");
    setOverlay("new");
  };

  const createWorld = () => {
    const engine = engineRef.current;
    if (!engine) return;
    const created = engine.createWorld(seed, mode, worldOptions, worldName);
    const storage = worldStorageRef.current;
    if (created) {
      activeWorldIdRef.current = created.id;
      setSelectedWorldId(created.id);
      refreshWorldCatalog(storage);
    } else {
      activeWorldIdRef.current = null;
      setWorldNotice("Browser world storage is unavailable; this session cannot be added to the local catalog.");
    }
    setCurrentWorldSeed(engine.world.seedText);
    startedRef.current = true;
    setStarted(true);
    setOverlay(null);
    engine.activate();
    showToast("WASD move · Space jump/swim · Shift crouch · Ctrl sprint · V camera · Left harvest/attack · Right use/build · E inventory · Esc menu");
  };

  const playWorld = (worldId: string) => {
    const engine = engineRef.current;
    const storage = worldStorageRef.current;
    if (!engine || !storage) return;
    const loaded = storage.loadWorld(worldId);
    if (!loaded.ok) {
      setWorldNotice(loaded.error.message);
      return;
    }
    engine.loadWorld(loaded.value.save, loaded.value.options, worldId);
    activeWorldIdRef.current = worldId;
    setSelectedWorldId(worldId);
    setMode(loaded.value.metadata.mode);
    setWorldOptions(loaded.value.options);
    setCurrentWorldSeed(loaded.value.save.seed);
    startedRef.current = true;
    setStarted(true);
    setOverlay(null);
    engine.activate();
    refreshWorldCatalog(storage);
    if (loaded.warnings?.length) setWorldNotice(loaded.warnings.map((warning) => warning.message).join(" "));
    showToast(`Welcome back to ${loaded.value.metadata.name}. The horizon kept going without you.`);
  };

  const continueWorld = () => {
    if (selectedWorldId) playWorld(selectedWorldId);
    else beginNewWorld();
  };

  const selectWorld = (world: WorldMetadata) => {
    const storage = worldStorageRef.current;
    const selected = storage?.setActiveWorld(world.id);
    if (selected && !selected.ok) {
      setWorldNotice(selected.error.message);
      return;
    }
    setSelectedWorldId(world.id);
    setSeed(world.seed);
    setCurrentWorldSeed(world.seed);
    engineRef.current?.previewWorld(world.seed);
  };

  const renameSelectedWorld = () => {
    const storage = worldStorageRef.current;
    const world = worlds.find((candidate) => candidate.id === selectedWorldId);
    if (!storage || !world) return;
    const name = window.prompt("Rename this browser-local world", world.name);
    if (name === null) return;
    const renamed = storage.renameWorld(world.id, name);
    if (!renamed.ok) setWorldNotice(renamed.error.message);
    else {
      setWorldNotice(`Renamed to ${renamed.value.name}.`);
      refreshWorldCatalog(storage);
    }
  };

  const duplicateSelectedWorld = () => {
    const storage = worldStorageRef.current;
    if (!storage || !selectedWorldId) return;
    const duplicated = storage.duplicateWorld(selectedWorldId);
    if (!duplicated.ok) setWorldNotice(duplicated.error.message);
    else {
      setSelectedWorldId(duplicated.value.id);
      setWorldNotice(`Created ${duplicated.value.name} in this browser.`);
      refreshWorldCatalog(storage);
    }
  };

  const deleteSelectedWorld = () => {
    const storage = worldStorageRef.current;
    const world = worlds.find((candidate) => candidate.id === selectedWorldId);
    if (!storage || !world || !window.confirm(`Delete “${world.name}” from this browser? This cannot be undone unless you exported it.`)) return;
    const deleted = storage.deleteWorld(world.id);
    if (!deleted.ok) setWorldNotice(deleted.error.message);
    else {
      setWorldNotice(`Deleted ${deleted.value.name} from this browser.`);
      refreshWorldCatalog(storage);
      const remainingWorlds = storage.listWorlds({ sortBy: "lastPlayedAt", direction: "desc" });
      const nextWorld = remainingWorlds.find((candidate) => candidate.id === storage.activeWorldId) ?? remainingWorlds[0];
      engineRef.current?.previewWorld(nextWorld?.seed ?? "WILDERNESS");
    }
  };

  const exportSelectedWorld = () => {
    const storage = worldStorageRef.current;
    const world = worlds.find((candidate) => candidate.id === selectedWorldId);
    if (!storage || !world) return;
    const exported = storage.exportWorld(world.id);
    if (!exported.ok) {
      setWorldNotice(exported.error.message);
      return;
    }
    const blobUrl = URL.createObjectURL(new Blob([exported.value], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = `${world.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "blockwild-world"}.blockwild.json`;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
    setWorldNotice(`Exported ${world.name}. Keep the file somewhere outside this browser.`);
  };

  const importWorld = async (event: ChangeEvent<HTMLInputElement>) => {
    const storage = worldStorageRef.current;
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!storage || !file) return;
    try {
      const imported = storage.importWorld(await file.text());
      if (!imported.ok) setWorldNotice(imported.error.message);
      else {
        storage.setActiveWorld(imported.value.id);
        setSelectedWorldId(imported.value.id);
        setWorldNotice(`Imported ${imported.value.name} into this browser.`);
        refreshWorldCatalog(storage);
        engineRef.current?.previewWorld(imported.value.seed);
      }
    } catch {
      setWorldNotice("That world file could not be read by this browser.");
    }
  };

  const resume = () => {
    engineRef.current?.closeContainer();
    setOverlay(null);
    engineRef.current?.activate();
  };

  const restUntil = (target: "morning" | "night") => {
    const engine = engineRef.current;
    if (!engine?.sleepUntil(target)) return;
    setOverlay(null);
    engine.activate();
  };

  const saveAndQuit = () => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.quitToTitle();
    startedRef.current = false;
    setStarted(false);
    activeWorldIdRef.current = null;
    setMultiplayerState(EMPTY_MULTIPLAYER_STATE);
    refreshWorldCatalog();
    setOverlay("title");
  };

  const confirmReset = () => {
    const activeWorldId = activeWorldIdRef.current;
    activeWorldIdRef.current = null;
    engineRef.current?.quitToTitle();
    if (activeWorldId) {
      const deleted = worldStorageRef.current?.deleteWorld(activeWorldId);
      if (deleted && !deleted.ok) setWorldNotice(deleted.error.message);
    }
    startedRef.current = false;
    setStarted(false);
    refreshWorldCatalog();
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

  const refreshMultiplayerState = useCallback(() => {
    const api = engineRef.current as unknown as MultiplayerEngineApi | null;
    if (!api?.getMultiplayerState) {
      setMultiplayerState({
        ...EMPTY_MULTIPLAYER_STATE,
        reasons: ["The running engine does not expose the multiplayer session API yet."],
      });
      return;
    }
    try {
      const state = api.getMultiplayerState();
      setMultiplayerState((current) => ({
        supported: state.supported ?? true,
        reasons: Array.isArray(state.reasons) ? state.reasons : [],
        status: typeof state.status === "string" ? state.status : "idle",
        role: state.role === "host" || state.role === "guest" ? state.role : null,
        peers: Array.isArray(state.peers) ? state.peers : [],
        inviteCode: typeof state.inviteCode === "string" ? state.inviteCode : current.inviteCode,
        answerCode: typeof state.answerCode === "string" ? state.answerCode : current.answerCode,
        error: typeof state.error === "string" ? state.error : null,
      }));
    } catch (error) {
      setMultiplayerState((current) => ({ ...current, error: error instanceof Error ? error.message : String(error) }));
    }
  }, []);

  useEffect(() => {
    if (overlay !== "multiplayer") return;
    refreshMultiplayerState();
    const timer = window.setInterval(refreshMultiplayerState, 650);
    return () => window.clearInterval(timer);
  }, [overlay, refreshMultiplayerState]);

  const recordMultiplayerResult = (result: MultiplayerActionResult, key: "inviteCode" | "answerCode") => {
    const code = typeof result === "string" ? result : result?.[key];
    if (code) setMultiplayerState((current) => ({ ...current, [key]: code }));
  };

  const hostMultiplayer = async () => {
    const api = engineRef.current as unknown as MultiplayerEngineApi | null;
    if (!api?.hostMultiplayer) {
      setMultiplayerState((current) => ({ ...current, error: "Hosting is unavailable in this engine build." }));
      return;
    }
    setMultiplayerBusy(true);
    try {
      recordMultiplayerResult(await api.hostMultiplayer(multiplayerName.trim() || "Trailkeeper"), "inviteCode");
      refreshMultiplayerState();
    } catch (error) {
      setMultiplayerState((current) => ({ ...current, error: error instanceof Error ? error.message : String(error) }));
    } finally {
      setMultiplayerBusy(false);
    }
  };

  const joinMultiplayer = async () => {
    const api = engineRef.current as unknown as MultiplayerEngineApi | null;
    const inviteCode = multiplayerInvite.trim();
    if (!inviteCode) {
      setMultiplayerState((current) => ({ ...current, error: "Paste the host invite code first." }));
      return;
    }
    if (!api?.joinMultiplayer) {
      setMultiplayerState((current) => ({ ...current, error: "Joining is unavailable in this engine build." }));
      return;
    }
    setMultiplayerBusy(true);
    try {
      recordMultiplayerResult(await api.joinMultiplayer(inviteCode, multiplayerName.trim() || "Trailkeeper"), "answerCode");
      refreshMultiplayerState();
    } catch (error) {
      setMultiplayerState((current) => ({ ...current, error: error instanceof Error ? error.message : String(error) }));
    } finally {
      setMultiplayerBusy(false);
    }
  };

  const acceptMultiplayerAnswer = async () => {
    const api = engineRef.current as unknown as MultiplayerEngineApi | null;
    const answerCode = multiplayerAnswer.trim();
    if (!answerCode) {
      setMultiplayerState((current) => ({ ...current, error: "Paste the guest answer code first." }));
      return;
    }
    if (!api?.acceptMultiplayerAnswer) {
      setMultiplayerState((current) => ({ ...current, error: "Guest answer acceptance is unavailable in this engine build." }));
      return;
    }
    setMultiplayerBusy(true);
    try {
      await api.acceptMultiplayerAnswer(answerCode);
      setMultiplayerAnswer("");
      refreshMultiplayerState();
    } catch (error) {
      setMultiplayerState((current) => ({ ...current, error: error instanceof Error ? error.message : String(error) }));
    } finally {
      setMultiplayerBusy(false);
    }
  };

  const disconnectMultiplayer = async () => {
    const api = engineRef.current as unknown as MultiplayerEngineApi | null;
    if (!api?.disconnectMultiplayer) {
      setMultiplayerState((current) => ({ ...current, error: "Disconnect is unavailable in this engine build." }));
      return;
    }
    setMultiplayerBusy(true);
    try {
      await api.disconnectMultiplayer();
      setMultiplayerState(EMPTY_MULTIPLAYER_STATE);
      setMultiplayerInvite("");
      setMultiplayerAnswer("");
      refreshMultiplayerState();
    } catch (error) {
      setMultiplayerState((current) => ({ ...current, error: error instanceof Error ? error.message : String(error) }));
    } finally {
      setMultiplayerBusy(false);
    }
  };

  const copyMultiplayerCode = async (code: string) => {
    if (!code) return;
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(code);
      setMultiplayerState((current) => ({ ...current, error: null }));
    } catch {
      window.prompt("Copy this connection code", code);
    }
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
  const bestiaryVisibleKinds: readonly MobKind[] = bestiaryFilter === "creatures" ? CORE_MOB_ORDER : bestiaryFilter === "winged" ? BUTTERFLY_ORDER : MOB_ORDER;
  const bestiarySeen = MOB_ORDER.filter((kind) => hud.bestiary[kind].seen).length;
  const bestiaryVisibleIndex = Math.max(0, bestiaryVisibleKinds.indexOf(selectedBestiary));
  const setBestiaryCategory = (filter: BestiaryFilter) => {
    setBestiaryFilter(filter);
    const kinds: readonly MobKind[] = filter === "creatures" ? CORE_MOB_ORDER : filter === "winged" ? BUTTERFLY_ORDER : MOB_ORDER;
    if (!kinds.includes(selectedBestiary)) setSelectedBestiary(kinds[0]);
  };
  const stepBestiary = (direction: -1 | 1) => {
    const next = (bestiaryVisibleIndex + direction + bestiaryVisibleKinds.length) % bestiaryVisibleKinds.length;
    setSelectedBestiary(bestiaryVisibleKinds[next]);
  };
  const selectedWorld = worlds.find((world) => world.id === selectedWorldId) ?? null;
  const cameraLabel = hud.cameraMode === "first" ? "FIRST PERSON" : hud.cameraMode === "third-rear" ? "THIRD PERSON · REAR" : "THIRD PERSON · FRONT";

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
          <div className="stance-hud" aria-label={`Camera ${cameraLabel}; ${hud.crouching ? "crouching" : hud.sprinting ? "sprinting" : "standing"}`}>
            <span><kbd>V</kbd><strong>{cameraLabel}</strong></span>
            <span className={hud.crouching ? "active" : ""}><kbd>SHIFT</kbd><strong>{hud.crouching ? "CROUCHING" : hud.sprinting ? "SPRINTING" : "CROUCH"}</strong></span>
            {hud.onlinePlayers > 1 && <span className="online"><kbd>●</kbd><strong>{hud.onlinePlayers} ONLINE</strong></span>}
          </div>

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
            <div className="title-menu-layout">
              <div className="main-menu-buttons">
                <PixelButton className="primary-menu-button" disabled={!hasSave || !selectedWorld} onClick={continueWorld}>{selectedWorld ? `Play ${selectedWorld.name}` : "No Local World Selected"}</PixelButton>
                <PixelButton onClick={beginNewWorld}>Create New World</PixelButton>
                <div className="menu-button-row">
                  <PixelButton onClick={() => setOverlay("help")}>How to Play</PixelButton>
                  <PixelButton onClick={() => openSettings("title")}>Settings</PixelButton>
                </div>
                <p className="browser-ownership-note">{WORLD_OWNERSHIP_NOTICE}</p>
              </div>
              <aside className="world-catalog-panel" aria-label="Worlds stored in this browser">
                <header>
                  <div><span className="panel-eyebrow">THIS BROWSER · {worlds.length} {worlds.length === 1 ? "WORLD" : "WORLDS"}</span><strong>World Catalog</strong></div>
                  <button type="button" onClick={() => importWorldInputRef.current?.click()}>IMPORT</button>
                  <input ref={importWorldInputRef} type="file" hidden accept=".json,.blockwild.json,application/json" onChange={(event) => void importWorld(event)} />
                </header>
                <div className="world-catalog-list">
                  {worlds.length ? worlds.map((world) => (
                    <button
                      type="button"
                      key={world.id}
                      className={`world-catalog-card ${world.id === selectedWorldId ? "selected" : ""}`}
                      onClick={() => selectWorld(world)}
                      onDoubleClick={() => playWorld(world.id)}
                    >
                      <span className="world-thumbnail" aria-hidden="true"><i /><b>{world.mode === "builder" ? "◆" : "▲"}</b></span>
                      <span className="world-card-copy"><strong>{world.name}</strong><small>Seed {world.seed}</small><small>{formatWorldDate(world.lastPlayedAt)} · {formatPlayTime(world.playTimeMs)}</small></span>
                      <em>{world.mode.toUpperCase()}</em>
                    </button>
                  )) : <div className="empty-world-catalog"><b>◇</b><strong>No worlds in this browser</strong><span>Create one here or import a Blockwild world file.</span></div>}
                </div>
                <div className="world-catalog-actions">
                  <button type="button" disabled={!selectedWorld} onClick={renameSelectedWorld}>Rename</button>
                  <button type="button" disabled={!selectedWorld} onClick={duplicateSelectedWorld}>Duplicate</button>
                  <button type="button" disabled={!selectedWorld} onClick={exportSelectedWorld}>Export</button>
                  <button type="button" className="danger" disabled={!selectedWorld} onClick={deleteSelectedWorld}>Delete</button>
                </div>
                {worldNotice && <p className="world-catalog-notice" role="status">{worldNotice}</p>}
              </aside>
            </div>
            <div className="title-footer">
              <span>Endless streamed terrain · original procedural textures · browser-owned persistent worlds</span>
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
            <label className="field-label" htmlFor="world-name">World name</label>
            <input id="world-name" className="pixel-input world-name-input" value={worldName} maxLength={64} onChange={(event) => setWorldName(event.target.value)} />
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
            <details className="advanced-world-options">
              <summary><span>Advanced world options</span><small>Difficulty, ecology, terrain, weather, and inventory rules</small></summary>
              <div className="advanced-option-grid">
                <label><span>Difficulty <b>{worldOptions.difficulty.toUpperCase()}</b></span><select value={worldOptions.difficulty} onChange={(event) => setWorldOptions((current) => ({ ...current, difficulty: event.target.value as WorldOptions["difficulty"] }))}><option value="peaceful">Peaceful</option><option value="easy">Easy</option><option value="normal">Normal</option><option value="hard">Hard</option></select></label>
                <label><span>Day length <b>{worldOptions.dayLengthMinutes} min</b></span><input type="range" min="5" max="120" step="5" value={worldOptions.dayLengthMinutes} onChange={(event) => setWorldOptions((current) => ({ ...current, dayLengthMinutes: Number(event.target.value) }))} /></label>
                <label><span>Multiplayer rest <b>{worldOptions.sleepRule === "any-player" ? "ANY" : worldOptions.sleepRule === "all-players" ? "ALL" : `${worldOptions.sleepPercentage}%`}</b></span><select value={worldOptions.sleepRule} onChange={(event) => setWorldOptions((current) => ({ ...current, sleepRule: event.target.value as WorldOptions["sleepRule"] }))}><option value="any-player">Any player</option><option value="percentage">Player percentage</option><option value="all-players">All players</option></select></label>
                {worldOptions.sleepRule === "percentage" && <label><span>Rest vote threshold <b>{worldOptions.sleepPercentage}%</b></span><input type="range" min="10" max="100" step="10" value={worldOptions.sleepPercentage} onChange={(event) => setWorldOptions((current) => ({ ...current, sleepPercentage: Number(event.target.value) }))} /></label>}
                <label><span>Mob density <b>{worldOptions.mobDensity.toFixed(1)}×</b></span><input type="range" min="0" max="3" step="0.25" value={worldOptions.mobDensity} onChange={(event) => setWorldOptions((current) => ({ ...current, mobDensity: Number(event.target.value) }))} /></label>
                <label><span>Butterflies <b>{worldOptions.butterflyDensity.toFixed(1)}×</b></span><input type="range" min="0" max="4" step="0.25" value={worldOptions.butterflyDensity} onChange={(event) => setWorldOptions((current) => ({ ...current, butterflyDensity: Number(event.target.value) }))} /></label>
                <label><span>Cave frequency <b>{worldOptions.caveFrequency.toFixed(1)}×</b></span><input type="range" min="0" max="3" step="0.25" value={worldOptions.caveFrequency} onChange={(event) => setWorldOptions((current) => ({ ...current, caveFrequency: Number(event.target.value) }))} /></label>
                <label><span>Biome scale <b>{worldOptions.biomeScale.toFixed(2)}×</b></span><input type="range" min="0.25" max="4" step="0.25" value={worldOptions.biomeScale} onChange={(event) => setWorldOptions((current) => ({ ...current, biomeScale: Number(event.target.value) }))} /></label>
                <label><span>Resources <b>{worldOptions.resourceAbundance.toFixed(2)}×</b></span><input type="range" min="0.25" max="4" step="0.25" value={worldOptions.resourceAbundance} onChange={(event) => setWorldOptions((current) => ({ ...current, resourceAbundance: Number(event.target.value) }))} /></label>
              </div>
              <div className="advanced-toggle-grid">
                {([
                  ["structures", "Structures"],
                  ["weather", "Dynamic weather"],
                  ["keepInventory", "Keep inventory"],
                  ["friendlyFire", "Friendly fire"],
                ] as const).map(([key, label]) => <button type="button" key={key} className={worldOptions[key] ? "active" : ""} onClick={() => setWorldOptions((current) => ({ ...current, [key]: !current[key] }))}><span>{label}</span><b>{worldOptions[key] ? "ON" : "OFF"}</b></button>)}
              </div>
            </details>
            <div className="world-feature-strip">
              <span><b>∞</b> STREAMED WORLD</span><span><b>17</b> BIOMES</span><span><b>14</b> CREATURES</span><span><b>192</b> BLOCKS TALL</span>
            </div>
            <p className="browser-ownership-note setup-ownership-note">This world will belong to this browser on this host device. Export it to make a backup or move it.</p>
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
              <PixelButton onClick={() => setOverlay("multiplayer")}>Multiplayer Session</PixelButton>
              <PixelButton onClick={() => engineRef.current?.toggleFullscreen()}>{hud.fullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}</PixelButton>
              <PixelButton onClick={() => openSettings("pause")}>Settings</PixelButton>
              <PixelButton onClick={() => setOverlay("help")}>Field Manual</PixelButton>
              <PixelButton className="danger-button" onClick={() => setOverlay("reset")}>Delete & Regenerate World</PixelButton>
              <PixelButton className="secondary-button" onClick={saveAndQuit}>Save & Quit to Title</PixelButton>
            </div>
          </div>
        </section>
      )}

      {overlay === "sleep" && (
        <section className="menu-overlay sleep-overlay" aria-labelledby="sleep-title">
          <div className="pixel-panel sleep-panel">
            <button type="button" className="panel-close sleep-close" onClick={resume} aria-label="Leave bed menu">×</button>
            <span className="panel-eyebrow">WILDWOOD BED · DAY {hud.day} · {hud.clock}</span>
            <h2 id="sleep-title">Choose when to wake</h2>
            <p className="panel-flavor">Rest can move time forward from any hour. Pick the next dawn or the next dusk; time never runs backward.</p>
            <div className="sleep-destinations">
              <button type="button" className="sleep-destination sleep-morning" onClick={() => restUntil("morning")}>
                <span className="sleep-celestial sleep-sun" aria-hidden="true" />
                <small>NEXT DAWN</small>
                <strong>Wake in morning</strong>
                <em>About 6:30 AM</em>
              </button>
              <button type="button" className="sleep-destination sleep-night" onClick={() => restUntil("night")}>
                <span className="sleep-celestial sleep-moon" aria-hidden="true" />
                <small>NEXT DUSK</small>
                <strong>Wake at night</strong>
                <em>About 6:30 PM</em>
              </button>
            </div>
            <div className="sleep-policy-note">
              <span>Multiplayer rest rule</span>
              <strong>{engineRef.current?.getSleepStatus().rule ?? "50% of players"}</strong>
              <small>{engineRef.current?.getSleepStatus().required ?? 1} of {engineRef.current?.getSleepStatus().onlinePlayers ?? 1} online player(s) must choose the same destination.</small>
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
              <div><span className="panel-eyebrow">FIELD NOTES · {bestiarySeen}/{MOB_ORDER.length} DISCOVERED</span><h2 id="bestiary-title">Bestiary</h2></div>
              <div className="bestiary-header-progress" aria-label={`${bestiarySeen} of ${MOB_ORDER.length} creatures discovered`}>
                <span><i style={{ width: `${bestiarySeen / MOB_ORDER.length * 100}%` }} /></span>
                <strong>{Math.round(bestiarySeen / MOB_ORDER.length * 100)}%</strong>
              </div>
              <button type="button" className="panel-close" onClick={() => setOverlay("pause")}>×</button>
            </header>
            <div className="bestiary-toolbar">
              <div className="bestiary-filters" role="tablist" aria-label="Bestiary categories">
                {([['all', 'All', MOB_ORDER.length], ['creatures', 'Creatures', CORE_MOB_ORDER.length], ['winged', 'Winged', BUTTERFLY_ORDER.length]] as Array<[BestiaryFilter, string, number]>).map(([filter, label, count]) => (
                  <button type="button" role="tab" aria-selected={bestiaryFilter === filter} className={bestiaryFilter === filter ? "active" : ""} key={filter} onClick={() => setBestiaryCategory(filter)}>{label}<small>{count}</small></button>
                ))}
              </div>
              <span className="bestiary-index">ENTRY {bestiaryVisibleIndex + 1} / {bestiaryVisibleKinds.length}</span>
            </div>
            <div className="bestiary-layout">
              <nav className="bestiary-list" aria-label="Creature list">
                {bestiaryVisibleKinds.map((kind) => {
                  const definition = MOB_DEFS[kind];
                  const progress = hud.bestiary[kind];
                  const observation = definition.family === "butterfly" ? `${progress.captures ?? 0} captured` : `${progress.kills} kills`;
                  return <button type="button" key={kind} className={selectedBestiary === kind ? "active" : ""} aria-current={selectedBestiary === kind ? "true" : undefined} onClick={() => setSelectedBestiary(kind)}><CreaturePortrait kind={kind} seen={progress.seen} mini /><span className="bestiary-list-copy"><strong>{progress.seen ? definition.name : "Unknown Creature"}</strong><small>{progress.seen ? `${definition.temperament} · ${observation}` : "Undiscovered"}</small></span><i className={`temperament-dot temperament-${definition.temperament.toLowerCase()}`} aria-hidden="true" /></button>;
                })}
              </nav>
              <article className={`bestiary-detail ${bestiaryProgress.seen ? "seen" : "unknown"}`}>
                <div className="bestiary-portrait" key={selectedBestiary} style={{ "--mob-color": `#${bestiaryDefinition.colors[0].toString(16).padStart(6, "0")}` } as CSSProperties}>
                  <CreaturePortrait kind={selectedBestiary} seen={bestiaryProgress.seen} />
                  <div className="bestiary-portrait-chrome">
                    <button type="button" onClick={() => stepBestiary(-1)} aria-label="Previous bestiary entry">‹</button>
                    <span>{bestiaryProgress.seen ? bestiaryDefinition.habitat.split(",")[0] : "Habitat unknown"}</span>
                    <button type="button" onClick={() => stepBestiary(1)} aria-label="Next bestiary entry">›</button>
                  </div>
                </div>
                {bestiaryProgress.seen ? <>
                  <div className="bestiary-heading"><div><span className={`temperament-label temperament-${bestiaryDefinition.temperament.toLowerCase()}`}>{bestiaryDefinition.temperament.toUpperCase()}</span><h3>{bestiaryDefinition.name}</h3></div><strong>{bestiaryDefinition.family === "butterfly" ? `${bestiaryProgress.captures ?? 0} CAPTURED` : `${bestiaryProgress.kills} DEFEATED`}</strong></div>
                  <p className="bestiary-lore">{bestiaryDefinition.lore}</p>
                  <div className="bestiary-facts"><div><small>HABITAT</small><strong>{bestiaryDefinition.habitat}</strong></div><div><small>ACTIVE</small><strong>{bestiaryDefinition.active}</strong></div><div><small>HEALTH</small><strong>{bestiaryDefinition.health} hearts</strong></div><div><small>DANGER</small><strong>{bestiaryDefinition.damage ? `${bestiaryDefinition.damage} damage` : "Harmless"}</strong></div></div>
                  <section className="behavior-note"><small>BEHAVIOR</small><p>{bestiaryDefinition.behavior}</p></section>
                  {bestiaryDefinition.family === "butterfly" ? <section className="bestiary-loot butterfly-capture-record"><small>CAPTURE RECORD</small>{bestiaryDefinition.captureItem !== undefined && <div><ItemIcon item={bestiaryDefinition.captureItem} small /><span><strong>{bestiaryProgress.captures ? `${bestiaryProgress.captures} ${bestiaryProgress.captures === 1 ? "specimen" : "specimens"} cataloged` : "No specimen captured yet"}</strong><small>Equip a Butterfly Net and catch one gently to preserve it in a field jar.</small></span></div>}</section> : <section className="bestiary-loot"><small>OBSERVED DROPS</small>{bestiaryDefinition.drops.map((drop) => <div key={drop.item}><ItemIcon item={drop.item} small /><span><strong>{bestiaryProgress.kills ? ITEMS[drop.item]?.name : "Unknown drop"}</strong><small>{bestiaryProgress.kills ? `${drop.min}${drop.max !== drop.min ? `–${drop.max}` : ""} · ${Math.round(drop.chance * 100)}% chance` : "Defeat one to record it"}</small></span></div>)}</section>}
                </> : <div className="unknown-entry"><span className="panel-eyebrow">NO RELIABLE OBSERVATION</span><h3>Unknown Creature</h3><p>Find this creature in the wild and bring it within view to reveal its field notes.</p></div>}
              </article>
            </div>
          </div>
        </section>
      )}

      {overlay === "multiplayer" && (
        <section className="menu-overlay" aria-labelledby="multiplayer-title">
          <div className="pixel-panel multiplayer-panel">
            <span className="panel-eyebrow">HOST-AUTHORITATIVE · MANUAL WEBRTC CONNECTION</span>
            <h2 id="multiplayer-title">Multiplayer Session</h2>
            <div className="multiplayer-status-row">
              <span className={`multiplayer-status-light status-${multiplayerState.status}`} aria-hidden="true" />
              <div><strong>{multiplayerState.status.toUpperCase()}</strong><small>{multiplayerState.role ? `${multiplayerState.role.toUpperCase()} · ` : ""}{multiplayerState.peers.length} {multiplayerState.peers.length === 1 ? "peer" : "peers"}</small></div>
            </div>

            {!multiplayerState.supported && (
              <div className="multiplayer-warning" role="status"><strong>Multiplayer unavailable</strong>{multiplayerState.reasons.map((reason) => <span key={reason}>{reason}</span>)}</div>
            )}
            {multiplayerState.error && <p className="multiplayer-error" role="alert">{multiplayerState.error}</p>}

            <label className="multiplayer-name-field"><span>Your player name</span><input className="pixel-input world-name-input" maxLength={32} value={multiplayerName} onChange={(event) => setMultiplayerName(event.target.value)} /></label>

            <div className="multiplayer-connection-grid">
              <section>
                <span className="panel-eyebrow">HOST THIS WORLD</span>
                <h3>Invite a trailmate</h3>
                <p>Create an offer, send it to one guest, then paste their answer below. Each invite is single-use.</p>
                <PixelButton disabled={multiplayerBusy || !multiplayerState.supported || multiplayerState.role === "guest"} onClick={() => void hostMultiplayer()}>{multiplayerState.inviteCode ? "Create Another Invite" : "Create Host Invite"}</PixelButton>
                {multiplayerState.inviteCode && <div className="connection-code"><label>Host invite code</label><textarea readOnly value={multiplayerState.inviteCode} aria-label="Host invite code" /><button type="button" onClick={() => void copyMultiplayerCode(multiplayerState.inviteCode)}>COPY INVITE</button></div>}
                {(multiplayerState.role === "host" || multiplayerState.inviteCode) && <div className="connection-code"><label htmlFor="guest-answer-code">Guest answer code</label><textarea id="guest-answer-code" value={multiplayerAnswer} onChange={(event) => setMultiplayerAnswer(event.target.value)} placeholder="Paste the answer returned by your guest" /><button type="button" disabled={multiplayerBusy || !multiplayerAnswer.trim()} onClick={() => void acceptMultiplayerAnswer()}>ACCEPT ANSWER</button></div>}
              </section>

              <section>
                <span className="panel-eyebrow">JOIN A HOST</span>
                <h3>Enter another wild</h3>
                <p>Paste the host&apos;s offer. Send the generated answer back so they can finish the direct connection.</p>
                <div className="connection-code"><label htmlFor="host-invite-code">Host invite code</label><textarea id="host-invite-code" value={multiplayerInvite} onChange={(event) => setMultiplayerInvite(event.target.value)} placeholder="Paste the host invite here" /></div>
                <PixelButton disabled={multiplayerBusy || !multiplayerState.supported || !multiplayerInvite.trim() || multiplayerState.role === "host"} onClick={() => void joinMultiplayer()}>Create Guest Answer</PixelButton>
                {multiplayerState.answerCode && <div className="connection-code guest-answer-output"><label>Answer for the host</label><textarea readOnly value={multiplayerState.answerCode} aria-label="Guest answer code" /><button type="button" onClick={() => void copyMultiplayerCode(multiplayerState.answerCode)}>COPY ANSWER</button></div>}
              </section>
            </div>

            {multiplayerState.peers.length > 0 && <section className="multiplayer-peer-list"><span className="panel-eyebrow">SESSION PLAYERS</span>{multiplayerState.peers.map((peer, index) => <div key={peer.id ?? peer.token ?? index}><span className="peer-cube" aria-hidden="true" /><strong>{peer.identity?.name ?? peer.name ?? peer.id ?? `Player ${index + 1}`}</strong><small>{(peer.state ?? "connected").toUpperCase()}{typeof peer.latencyMs === "number" ? ` · ${Math.round(peer.latencyMs)}ms` : ""}</small></div>)}</section>}

            <p className="multiplayer-ownership-note">Your world save stays owned by this browser on the host device. Guests receive session state; they do not become owners of the host&apos;s local catalog entry. Share connection codes only with people you trust.</p>
            <div className="panel-actions multiplayer-actions">
              <PixelButton className="secondary-button" onClick={() => setOverlay("pause")}>Back</PixelButton>
              <PixelButton className="danger-button" disabled={multiplayerBusy || ["idle", "disconnected", "closed"].includes(multiplayerState.status)} onClick={() => void disconnectMultiplayer()}>Disconnect Session</PixelButton>
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
              <div><kbd>SHIFT</kbd><span><strong>Crouch</strong>Lower your profile, move quietly, and stop at ledges.</span></div>
              <div><kbd>CTRL</kbd><span><strong>Sprint</strong>Faster, louder, hungrier.</span></div>
              <div><kbd>V</kbd><span><strong>Cycle camera</strong>First person, rear third person, then front view.</span></div>
              <div><kbd>HOLD LMB</kbd><span><strong>Harvest / attack</strong>The crosshair decides which.</span></div>
              <div><kbd>RMB</kbd><span><strong>Use / build / eat</strong>Tables, furnaces, chests, food, and blocks.</span></div>
              <div><kbd>1–9 / WHEEL</kbd><span><strong>Select</strong>Choose a hotbar stack.</span></div>
              <div><kbd>E</kbd><span><strong>Inventory</strong>2×2 hand crafting and the full stack inventory.</span></div>
              <div><kbd>Q</kbd><span><strong>Drop item</strong>Toss one from the selected stack.</span></div>
              <div><kbd>ESC</kbd><span><strong>Menu</strong>Open or close the current menu. Fullscreen remains a menu button.</span></div>
              <div><kbd>MIDDLE</kbd><span><strong>Pick block</strong>Match the targeted block in Builder mode.</span></div>
              <div><kbd>F3</kbd><span><strong>Debug</strong>Coordinates, depth, chunks, seed, and weather.</span></div>
              <div><kbd>NET + RMB</kbd><span><strong>Capture butterfly</strong>Equip a Butterfly Net, aim gently, and add the specimen to your field notes.</span></div>
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
            <label className="setting-row"><span><strong>Render distance</strong><small>{settings.renderDistance} chunks · about {settings.renderDistance * 16} blocks · streamed queues + adaptive resolution</small></span><input type="range" min="2" max="8" step="1" value={settings.renderDistance} onChange={(event) => updateSettings({ renderDistance: Number(event.target.value) })} /></label>
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
        <section className="webgl-fallback" role="alert" aria-labelledby="webgl-title"><div className="pixel-panel confirm-panel"><div className="warning-cube" aria-hidden="true">◇</div><h2 id="webgl-title">The world could not render</h2><p>Blockwild needs WebGL hardware acceleration. Try a current desktop browser and make sure graphics acceleration is enabled.</p><PixelButton className="secondary-button" onClick={() => setWebglError(false)}>Browse Menus Anyway</PixelButton></div></section>
      )}
    </main>
  );
}
