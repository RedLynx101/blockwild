import { BlockId } from "./data";
import {
  rollStructureLoot,
  type PlannedBlock,
  type StructureLootTableId,
  type StructureMarker,
  type WorldPosition,
} from "./structures";
import { MYTHIC_FRONTIER_SITES, MYTHIC_FRONTIER_SITE_ORDER, MYTHIC_MATERIAL_FAMILIES, rollMythicSiteLoot, type MythicFrontierSiteDefinition, type MythicFrontierSiteId } from "./mythic-frontiers";

export type AdventureBiome =
  | "coast"
  | "meadow"
  | "forest"
  | "snow"
  | "desert"
  | "badlands"
  | "savanna"
  | "swamp"
  | "highlands"
  | "volcanic"
  | "mushroom"
  | "glimmerwood"
  | "sugarplum";

export type AdventurePoiKind =
  | "wind-carved-waystone"
  | "foxfire-cairn"
  | "fallen-star-camp"
  | "reedwatch-platform"
  | "frostbound-bell"
  | "sunwash-tidepool"
  | "mushroom-circle"
  | "abandoned-surveyor-camp"
  | "moonberry-witch-garden"
  | "rattlekin-totem-ring"
  | "skyglass-observatory"
  | "overgrown-aqueduct"
  | "sunken-caravan"
  | "emberwatch-tower"
  | "pilgrim-bathhouse"
  | "glimmerwood-harp-grove"
  | "shattered-colossus"
  | "wildwood-bridgehouse"
  | "starfall-amphitheater"
  | "saltwind-lighthouse"
  | "lantern-piehouse"
  | "switchback-tollcamp"
  | "tideglass-embassy"
  | "sugarwind-teahouse"
  | "moonpost-listening-tree"
  | "skyshaft-depot"
  | "whistlekite-roost"
  | "clockwork-burrow"
  | "road-of-quiet-bells"
  | "cloudwhale-graveyard"
  | "mirrorfen-processional"
  | "emberglass-hatchery"
  | "drowned-moon-gate"
  | "titans-kettle"
  | "root-crown-menagerie"
  | "fossil-orchard"
  | "lanternroot-cistern"
  | "tideclock-wreck";

export type AdventureDungeonKind =
  | "rootbound-labyrinth"
  | "starless-observatory"
  | "brassdeep-foundry"
  | "stormglass-citadel"
  | "bloomrot-cathedral"
  | "palimpsest-vault"
  | "palace-of-nine-winds"
  | "gorgon-quarry"
  | "sunken-court-of-namarra"
  | "ashen-library-of-salamander-kings"
  | "hollow-moon-menagerie";

export type AdventureStructureKind = AdventurePoiKind | AdventureDungeonKind;
export type AdventureStructureScale = "tiny" | "medium" | "large" | "dungeon";

export type AdventureArchetype = Readonly<{
  kind: AdventureStructureKind;
  name: string;
  scale: AdventureStructureScale;
  biomes: readonly AdventureBiome[];
  summary: string;
  materialIdentity: string;
  lightingIdentity: string;
  underground?: boolean;
}>;

export const ADVENTURE_POI_ARCHETYPES: readonly AdventureArchetype[] = Object.freeze([
  { kind: "wind-carved-waystone", name: "Wind-carved Waystone", scale: "tiny", biomes: ["highlands", "savanna", "desert"], summary: "A lichen-cut trail marker with an answering lantern niche.", materialIdentity: "moon slate and weathered cobble", lightingIdentity: "one sheltered amber rune" },
  { kind: "foxfire-cairn", name: "Foxfire Cairn", scale: "tiny", biomes: ["forest", "glimmerwood", "swamp"], summary: "A moss cairn where pale motes gather after dusk.", materialIdentity: "moss and rune stone", lightingIdentity: "low green foxfire" },
  { kind: "fallen-star-camp", name: "Fallen-star Camp", scale: "tiny", biomes: ["meadow", "highlands", "desert"], summary: "An abandoned prospecting shelter built around a star-crystal chip.", materialIdentity: "wildwood planks and crystal", lightingIdentity: "cold prismatic camp glow" },
  { kind: "reedwatch-platform", name: "Reedwatch Platform", scale: "tiny", biomes: ["swamp", "coast"], summary: "A high, dry observation deck for wetland naturalists.", materialIdentity: "birch posts and wildwood boards", lightingIdentity: "paired hooded torches" },
  { kind: "frostbound-bell", name: "Frostbound Bell", scale: "tiny", biomes: ["snow", "highlands"], summary: "A silent brass bell whose arch has frozen into the trail.", materialIdentity: "snowcap stone and riveted brass", lightingIdentity: "warm lantern below blue ice" },
  { kind: "sunwash-tidepool", name: "Sunwash Tidepool", scale: "tiny", biomes: ["coast"], summary: "A ringed, glass-clear pool used by travelling tidekeepers.", materialIdentity: "sandstone, glass and water", lightingIdentity: "submerged glowstone pebble" },
  { kind: "mushroom-circle", name: "Mooncap Circle", scale: "tiny", biomes: ["mushroom", "forest"], summary: "A perfect fungal ring around an old storyteller's stool.", materialIdentity: "moss and mooncap", lightingIdentity: "soft fungal glimmer" },
  { kind: "abandoned-surveyor-camp", name: "Abandoned Surveyor Camp", scale: "tiny", biomes: ["meadow", "highlands", "savanna"], summary: "A compact mapmaker's camp with a weathered supply box.", materialIdentity: "canvas-toned planks and stone", lightingIdentity: "banked hearth ember" },
  { kind: "moonberry-witch-garden", name: "Moonberry Witch Garden", scale: "medium", biomes: ["forest", "swamp", "glimmerwood"], summary: "A fenced medicinal garden whose hedge protects a hidden recipe cache.", materialIdentity: "wildwood, moss and moonberry", lightingIdentity: "violet garden lamps" },
  { kind: "rattlekin-totem-ring", name: "Rattlekin Totem Ring", scale: "medium", biomes: ["savanna", "desert", "highlands"], summary: "A percussion shrine assembled from bone, clay and sun-baked pillars.", materialIdentity: "sunbaked clay and bone-white stone", lightingIdentity: "four low ritual braziers" },
  { kind: "skyglass-observatory", name: "Skyglass Observatory", scale: "medium", biomes: ["highlands", "snow", "meadow"], summary: "A broken hillside observatory still aimed at the same wandering star.", materialIdentity: "stone brick, glass and crystal", lightingIdentity: "cyan lens glow" },
  { kind: "overgrown-aqueduct", name: "Overgrown Aqueduct", scale: "medium", biomes: ["forest", "swamp", "meadow"], summary: "A short surviving span with water still crossing its mossy crown.", materialIdentity: "mossy cobble and rune stone", lightingIdentity: "sun shafts and two sconces" },
  { kind: "sunken-caravan", name: "Sunken Caravan", scale: "medium", biomes: ["desert", "savanna", "swamp"], summary: "Three tilted wagons half claimed by dune or mire.", materialIdentity: "wildwood, canvas planks and clay", lightingIdentity: "one intact way-lantern" },
  { kind: "emberwatch-tower", name: "Emberwatch Tower", scale: "medium", biomes: ["volcanic", "badlands", "desert"], summary: "A compact basalt watchtower that once charted lava flows.", materialIdentity: "basalt and riveted brass", lightingIdentity: "vertical ember windows" },
  { kind: "pilgrim-bathhouse", name: "Pilgrim Bathhouse", scale: "medium", biomes: ["meadow", "forest", "highlands"], summary: "An open-roof roadside bath fed by a clear spring.", materialIdentity: "limestone, birch and glass", lightingIdentity: "recessed water lights" },
  { kind: "glimmerwood-harp-grove", name: "Glimmerwood Harp Grove", scale: "medium", biomes: ["glimmerwood", "forest"], summary: "Moonbough strings sing when wind passes through a planted arch.", materialIdentity: "moonbough and glimmer grass", lightingIdentity: "starfern footlights" },
  { kind: "shattered-colossus", name: "Shattered Colossus", scale: "large", biomes: ["desert", "highlands", "savanna"], summary: "The head and arm of an unknown stone guardian form a walkable ruin.", materialIdentity: "deepstone, sandstone and crystal", lightingIdentity: "an exposed eye-core" },
  { kind: "wildwood-bridgehouse", name: "Wildwood Bridgehouse", scale: "large", biomes: ["forest", "swamp"], summary: "A roofed timber bridge with a keeper's room above its central span.", materialIdentity: "wildwood logs, planks and moss", lightingIdentity: "a lantern rhythm along the rail" },
  { kind: "starfall-amphitheater", name: "Starfall Amphitheater", scale: "large", biomes: ["meadow", "highlands", "glimmerwood"], summary: "A stepped outdoor stage centered on a crystal conductor's plinth.", materialIdentity: "limestone, rune stone and crystal", lightingIdentity: "radial blue-white aisle lights" },
  { kind: "saltwind-lighthouse", name: "Saltwind Lighthouse", scale: "large", biomes: ["coast"], summary: "A stout coastal light with a furnished keeper room and lookout crown.", materialIdentity: "limestone, glass and wildwood", lightingIdentity: "rotating golden beacon silhouette" },
  { kind: "lantern-piehouse", name: "Lantern Piehouse", scale: "medium", biomes: ["meadow", "forest"], summary: "A travelling Hearthkin baker keeps a warm oven, a gossip bench and directions to the nearest burrow-town.", materialIdentity: "wayfarer canvas, thatch and wildwood", lightingIdentity: "low hearthlight under a patched awning" },
  { kind: "switchback-tollcamp", name: "Switchback Tollcamp", scale: "medium", biomes: ["badlands", "savanna", "desert"], summary: "A goblin road broker trades salvage beneath a brass semaphore and knows every nearby warren-road.", materialIdentity: "goblin brasswork, sunbaked clay and canvas", lightingIdentity: "green signal lamps" },
  { kind: "tideglass-embassy", name: "Tideglass Embassy", scale: "medium", biomes: ["coast"], summary: "A half-flooded Atlantian mission hosts surface travellers and points the way to the nearest tidehold.", materialIdentity: "reefglass, limestone and whisperglass", lightingIdentity: "submerged cyan floor runes" },
  { kind: "sugarwind-teahouse", name: "Sugarwind Teahouse", scale: "medium", biomes: ["sugarplum"], summary: "A candy-road host serves restorative sweets from a hard-sugar pavilion and trades village news.", materialIdentity: "boiled sugarbrick, candywood and striped canvas", lightingIdentity: "rose-gold gumdrop lanterns" },
  { kind: "moonpost-listening-tree", name: "Moonpost Listening Tree", scale: "medium", biomes: ["glimmerwood", "forest"], summary: "A Wood Elf moonbroker tends a living message tree whose glass leaves remember distant roads.", materialIdentity: "moonbough, whisperglass and storybook brick", lightingIdentity: "violet leaf-lanterns" },
  { kind: "skyshaft-depot", name: "Skyshaft Depot", scale: "medium", biomes: ["highlands", "snow"], summary: "A Dwarven provisioner operates a compact lifthead stocked for delvers and can chart the nearest hold.", materialIdentity: "deepgear brick, riveted brass and whisperglass", lightingIdentity: "bright amber shaft lanterns" },
  { kind: "whistlekite-roost", name: "Whistlekite Roost", scale: "large", biomes: ["highlands", "meadow", "savanna"], summary: "Wind harps encircle a raised nesting crag where mossback kites ride the updrafts.", materialIdentity: "moon slate, wildwood and wayfarer canvas", lightingIdentity: "pale wind-beacons" },
  { kind: "clockwork-burrow", name: "Clockwork Burrow", scale: "large", biomes: ["highlands", "badlands", "snow"], summary: "A marmot colony has repurposed a collapsed survey machine into a warm, ticking den.", materialIdentity: "deepgear brick, brass and storybook brick", lightingIdentity: "small amber portholes" },
  { kind: "road-of-quiet-bells", name: "Road of Quiet Bells", scale: "large", biomes: ["desert", "badlands", "savanna"], summary: "A buried processional road crosses three caravan refuges beneath an intact bell rhythm.", materialIdentity: "windworn alabaster and muted brass", lightingIdentity: "sparse sheltered bell lights" },
  { kind: "cloudwhale-graveyard", name: "Cloudwhale Graveyard", scale: "large", biomes: ["highlands", "snow", "glimmerwood"], summary: "Floating whale bones and aerolith terraces form a navigable high-air memorial.", materialIdentity: "windworn alabaster and pale aerolith", lightingIdentity: "cold wind-basin glimmer" },
  { kind: "mirrorfen-processional", name: "Mirrorfen Processional", scale: "large", biomes: ["swamp", "forest"], summary: "A reedglass procession winds through reflective channels and deceptive wakes.", materialIdentity: "mirrorpeat and reedglass", lightingIdentity: "low reflected fen lights" },
  { kind: "emberglass-hatchery", name: "Emberglass Hatchery", scale: "large", biomes: ["volcanic", "badlands"], summary: "Four linked incubation courts reveal heat-script beneath a safe chimney.", materialIdentity: "emberglass archive brick", lightingIdentity: "cradle glow and one chimney crown" },
  { kind: "drowned-moon-gate", name: "Drowned Moon Gate", scale: "large", biomes: ["coast"], summary: "A sealed nacre threshold protects moonwell chambers and air-pocket gardens.", materialIdentity: "nacre tidework", lightingIdentity: "pearl insets in deep water" },
  { kind: "titans-kettle", name: "Titan's Kettle", scale: "large", biomes: ["snow", "highlands"], summary: "A remote warm basin shelters caravans without crowding dwarven mountain routes.", materialIdentity: "windworn alabaster and snowcap stone", lightingIdentity: "warm steam vents inside a cold rim" },
  { kind: "root-crown-menagerie", name: "Root-Crown Menagerie", scale: "large", biomes: ["glimmerwood", "forest"], summary: "Four living habitat courts meet above a protected Rootweave crown.", materialIdentity: "moonfelt mycelium and living root", lightingIdentity: "bioluminescence only in ecological centers" },
  { kind: "fossil-orchard", name: "Fossil Orchard", scale: "large", biomes: ["highlands", "mushroom"], summary: "Porous calcite beds carry water through an ancient unmined orchard.", materialIdentity: "fossilroot calcite", lightingIdentity: "quiet mineral resonance" },
  { kind: "lanternroot-cistern", name: "Lanternroot Cistern", scale: "large", biomes: ["forest", "glimmerwood", "swamp"], summary: "A living cistern connects four rescue chambers around clean lanternroot water.", materialIdentity: "fossilroot calcite and luminous root", lightingIdentity: "one bright cistern center, dark approach" },
  { kind: "tideclock-wreck", name: "Tideclock Wreck", scale: "large", biomes: ["coast"], summary: "Clock-rib soundings guide swimmers through three flooded wreck chambers.", materialIdentity: "nacre tidework and riveted wreck metal", lightingIdentity: "paced sounding lights" },
]);

export const ADVENTURE_DUNGEON_ARCHETYPES: readonly AdventureArchetype[] = Object.freeze([
  { kind: "rootbound-labyrinth", name: "Rootbound Labyrinth", scale: "dungeon", biomes: ["forest", "swamp", "glimmerwood"], summary: "A three-stage buried sanctuary: root gate, whisper maze and heart vault.", materialIdentity: "moss, wildwood root and rune stone", lightingIdentity: "green-gold root lanterns", underground: true },
  { kind: "starless-observatory", name: "Starless Observatory", scale: "dungeon", biomes: ["highlands", "snow", "glimmerwood"], summary: "A buried lens hall descending through archive and astrolabe vault.", materialIdentity: "moon slate, glass and star crystal", lightingIdentity: "cold constellations in a black ceiling", underground: true },
  { kind: "brassdeep-foundry", name: "Brassdeep Foundry", scale: "dungeon", biomes: ["highlands", "desert", "volcanic"], summary: "A quenched industrial ruin with intake, assembly floor and master-vault.", materialIdentity: "deepgear brick, riveted brass and basalt", lightingIdentity: "amber furnace lines", underground: true },
  { kind: "stormglass-citadel", name: "Stormglass Citadel", scale: "dungeon", biomes: ["highlands", "snow"], summary: "An aboveground fortress climbing from gate court to storm lens crown.", materialIdentity: "snowcap stone, glass and crystal", lightingIdentity: "electric cyan battlements" },
  { kind: "bloomrot-cathedral", name: "Bloomrot Cathedral", scale: "dungeon", biomes: ["forest", "swamp", "meadow"], summary: "A ruined aboveground nave progressing through transept gardens to a sealed altar.", materialIdentity: "moss, rune stone and dark timber", lightingIdentity: "rose-gold altar lamps" },
  { kind: "palimpsest-vault", name: "Palimpsest Vault", scale: "dungeon", biomes: ["forest", "glimmerwood", "highlands", "mushroom"], summary: "A buried archive rewrites its own corridors around an ink-fed curator and a forbidden final folio.", materialIdentity: "storybook brick, whisperglass and moon slate", lightingIdentity: "living ink glyphs beneath the floor", underground: true },
  { kind: "palace-of-nine-winds", name: "Palace of Nine Winds", scale: "dungeon", biomes: ["highlands", "snow"], summary: "Five wind courts and a grounded ascent climb to an open gryphon crown.", materialIdentity: "windworn alabaster and reedglass", lightingIdentity: "wind vanes and sparse crown beacons" },
  { kind: "gorgon-quarry", name: "Gorgon Quarry", scale: "dungeon", biomes: ["badlands", "desert"], summary: "A six-room quarry loop returns through a nonlethal reversal chamber.", materialIdentity: "fossilroot calcite and mirrorstone", lightingIdentity: "shielded gaze-line lamps", underground: true },
  { kind: "sunken-court-of-namarra", name: "Sunken Court of Namarra", scale: "dungeon", biomes: ["coast"], summary: "Five flooded rooms, two sealed air gardens and a pearl court retain distinct media.", materialIdentity: "nacre tidework and reedglass", lightingIdentity: "pearl audience glow" },
  { kind: "ashen-library-of-salamander-kings", name: "Ashen Library of the Salamander Kings", scale: "dungeon", biomes: ["volcanic", "badlands"], summary: "Seven archive rooms rise toward a vented crown foundry chimney.", materialIdentity: "emberglass archive brick", lightingIdentity: "heat-reveal tablets amid dark stacks", underground: true },
  { kind: "hollow-moon-menagerie", name: "Hollow Moon Menagerie", scale: "dungeon", biomes: ["mushroom", "glimmerwood"], summary: "Six remembered habitat loops return to a quiet moonfelt pond.", materialIdentity: "moonfelt mycelium and reedglass", lightingIdentity: "glowing habitat centers separated by darkness", underground: true },
]);

// Compile-time and runtime release guard for the expanded 1.3.5 catalogue.
if (ADVENTURE_POI_ARCHETYPES.length !== 38 || ADVENTURE_DUNGEON_ARCHETYPES.length !== 11) {
  throw new Error("The Mythic Frontiers catalogue must contain exactly thirty-eight POIs and eleven dungeons.");
}

export type AdventureRoom = Readonly<{
  id: string;
  name: string;
  stage: number;
  bounds: Readonly<{ min: WorldPosition; max: WorldPosition }>;
  objective: string;
}>;

export type AdventureStructurePlan = Readonly<{
  kind: AdventureStructureKind;
  id: string;
  origin: WorldPosition;
  bounds: Readonly<{ min: WorldPosition; max: WorldPosition }>;
  placements: readonly PlannedBlock[];
  markers: readonly StructureMarker[];
  rooms: readonly AdventureRoom[];
}>;

function hashUnit(seed: string | number, salt: string | number) {
  const text = `${seed}:${salt}`;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

class AdventurePlanBuilder {
  readonly markers: StructureMarker[] = [];
  readonly rooms: AdventureRoom[] = [];
  private readonly blocks = new Map<string, PlannedBlock>();

  constructor(readonly origin: WorldPosition, readonly seed: string | number) {}

  set(dx: number, dy: number, dz: number, block: BlockId, variant?: string) {
    const placed = { x: this.origin.x + dx, y: this.origin.y + dy, z: this.origin.z + dz, block, ...(variant ? { variant } : {}) };
    this.blocks.set(`${placed.x},${placed.y},${placed.z}`, placed);
  }

  fill(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, block: BlockId, variant?: string) {
    for (let y = minY; y <= maxY; y += 1) for (let z = minZ; z <= maxZ; z += 1) for (let x = minX; x <= maxX; x += 1) this.set(x, y, z, block, variant);
  }

  hollow(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, shell: BlockId, floor: BlockId, variant: string) {
    this.fill(cx - rx, cy - 1, cz - rz, cx + rx, cy - 1, cz + rz, floor, `${variant}-floor`);
    this.fill(cx - rx, cy + ry, cz - rz, cx + rx, cy + ry, cz + rz, shell, `${variant}-ceiling`);
    for (let y = cy; y < cy + ry; y += 1) {
      for (let x = cx - rx; x <= cx + rx; x += 1) {
        this.set(x, y, cz - rz, shell, `${variant}-wall`);
        this.set(x, y, cz + rz, shell, `${variant}-wall`);
      }
      for (let z = cz - rz + 1; z < cz + rz; z += 1) {
        this.set(cx - rx, y, z, shell, `${variant}-wall`);
        this.set(cx + rx, y, z, shell, `${variant}-wall`);
      }
    }
    this.fill(cx - rx + 1, cy, cz - rz + 1, cx + rx - 1, cy + ry - 1, cz + rz - 1, BlockId.Air, `${variant}-interior`);
  }

  chest(dx: number, dy: number, dz: number, table: StructureLootTableId, id: string, rolls = 5) {
    this.set(dx, dy, dz, BlockId.Chest, `${table}-chest`);
    this.markers.push({
      type: "chest",
      id,
      position: { x: this.origin.x + dx, y: this.origin.y + dy, z: this.origin.z + dz },
      lootTable: table,
      loot: rollStructureLoot(table, `${this.seed}:${this.origin.x},${this.origin.z}:${id}`, rolls),
    });
  }

  plannedChest(dx: number, dy: number, dz: number, id: string, loot: readonly Readonly<{ itemKey: string; count: number }>[] ) {
    this.set(dx, dy, dz, BlockId.Chest, `mythic-frontier-chest`);
    this.markers.push({
      type: "chest",
      id,
      position: { x: this.origin.x + dx, y: this.origin.y + dy, z: this.origin.z + dz },
      lootTable: "adventure-cache",
      loot: Object.freeze(loot.map((entry) => Object.freeze({ itemKey: entry.itemKey, count: entry.count }))),
    });
  }

  spawn(dx: number, dy: number, dz: number, mobKind: string, count: number, radius: number, id: string, tags: readonly string[]) {
    this.markers.push({ type: "spawn", id, position: { x: this.origin.x + dx, y: this.origin.y + dy, z: this.origin.z + dz }, mobKind, count, radius, persistent: true, tags });
  }

  landmark(dx: number, dy: number, dz: number, tag: string) {
    const id = tag.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72) || "map-heart";
    this.markers.push({ type: "landmark", id, position: { x: this.origin.x + dx, y: this.origin.y + dy, z: this.origin.z + dz }, tag });
  }

  room(id: string, name: string, stage: number, center: readonly [number, number, number], radius: readonly [number, number, number], objective: string) {
    const [x, y, z] = center;
    const [rx, ry, rz] = radius;
    this.rooms.push({
      id,
      name,
      stage,
      bounds: {
        min: { x: this.origin.x + x - rx, y: this.origin.y + y - 1, z: this.origin.z + z - rz },
        max: { x: this.origin.x + x + rx, y: this.origin.y + y + ry, z: this.origin.z + z + rz },
      },
      objective,
    });
  }

  plan(kind: AdventureStructureKind): AdventureStructurePlan {
    const placements = [...this.blocks.values()].sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
    const points = [
      ...placements.map(({ x, y, z }) => ({ x, y, z })),
      ...this.markers.map(({ position }) => position),
      this.origin,
    ];
    const min = { x: Math.min(...points.map((p) => p.x)), y: Math.min(...points.map((p) => p.y)), z: Math.min(...points.map((p) => p.z)) };
    const max = { x: Math.max(...points.map((p) => p.x)), y: Math.max(...points.map((p) => p.y)), z: Math.max(...points.map((p) => p.z)) };
    return { kind, id: `adventure:${kind}:${this.origin.x},${this.origin.z}`, origin: this.origin, bounds: { min, max }, placements, markers: this.markers, rooms: this.rooms };
  }
}

function circularFloor(builder: AdventurePlanBuilder, radius: number, block: BlockId, variant: string) {
  for (let x = -radius; x <= radius; x += 1) for (let z = -radius; z <= radius; z += 1) if (x * x + z * z <= radius * radius) builder.set(x, 0, z, block, variant);
}

function ellipseFloor(builder: AdventurePlanBuilder, cy: number, rx: number, rz: number, block: BlockId, variant: string) {
  for (let x = -rx; x <= rx; x += 1) for (let z = -rz; z <= rz; z += 1) {
    if ((x * x) / (rx * rx) + (z * z) / (rz * rz) <= 1.08) builder.set(x, cy, z, block, variant);
  }
}

function brokenArc(builder: AdventurePlanBuilder, radius: number, minY: number, maxY: number, block: BlockId, variant: string, seed: string | number) {
  for (let x = -radius; x <= radius; x += 1) for (let z = -radius; z <= radius; z += 1) {
    const distance = Math.hypot(x, z);
    if (Math.abs(distance - radius) > 0.7) continue;
    const height = minY + Math.floor(hashUnit(seed, `${variant}:${x},${z}`) * (maxY - minY + 1));
    if (hashUnit(seed, `${variant}:gap:${x},${z}`) < 0.16) continue;
    builder.fill(x, minY, z, x, height, z, block, variant);
  }
}

export type DungeonTile = Readonly<{ gridX: number; gridZ: number; stage: 1 | 2 | 3; connections: readonly ("north" | "east" | "south" | "west")[] }>;

/** A compact, seeded dungeon graph whose five-cell spine always connects entrance to vault. */
export function planDungeonTiles(kind: AdventureDungeonKind, seed: string | number): readonly DungeonTile[] {
  const occupied = new Set(["0,2", "0,1", "0,0", "0,-1", "0,-2"]);
  const target = 7 + Math.floor(hashUnit(seed, `${kind}:dungeon-tile-count`) * 5);
  const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
  let cursor = 0;
  while (occupied.size < target && cursor < 80) {
    const frontier: Array<readonly [number, number]> = [];
    for (const key of occupied) {
      const [gridX, gridZ] = key.split(",").map(Number);
      for (const [dx, dz] of directions) {
        if (dz !== 0) continue; // side chambers stay on their stage's floor; the authored spine owns stairs
        const nx = gridX + dx;
        const nz = gridZ + dz;
        const nextKey = `${nx},${nz}`;
        if (Math.abs(nx) <= 2 && Math.abs(nz) <= 2 && !occupied.has(nextKey)) frontier.push([nx, nz]);
      }
    }
    const unique = [...new Map(frontier.map((cell) => [`${cell[0]},${cell[1]}`, cell])).values()];
    if (!unique.length) break;
    occupied.add(unique[Math.floor(hashUnit(seed, `${kind}:dungeon-frontier:${cursor}`) * unique.length)].join(","));
    cursor += 1;
  }
  const labels = ["north", "east", "south", "west"] as const;
  return [...occupied].map((key) => key.split(",").map(Number) as [number, number])
    .sort(([ax, az], [bx, bz]) => bz - az || ax - bx)
    .map(([gridX, gridZ]) => ({
      gridX,
      gridZ,
      stage: (gridZ >= 1 ? 1 : gridZ === 0 ? 2 : 3) as 1 | 2 | 3,
      connections: labels.filter((_, index) => occupied.has(`${gridX + directions[index][0]},${gridZ + directions[index][1]}`)),
    }));
}

function chamferedDungeonCell(builder: AdventurePlanBuilder, cx: number, cy: number, cz: number, shell: BlockId, floor: BlockId, variant: string) {
  for (let x = -3; x <= 3; x += 1) for (let z = -3; z <= 3; z += 1) {
    if (Math.abs(x) === 3 && Math.abs(z) === 3) continue;
    builder.set(cx + x, cy - 1, cz + z, floor, `${variant}-floor`);
    builder.set(cx + x, cy + 4 - (Math.abs(x) + Math.abs(z) >= 5 ? 1 : 0), cz + z, shell, `${variant}-vaulted-ceiling`);
    const edge = Math.abs(x) === 3 || Math.abs(z) === 3;
    if (edge) for (let y = 0; y < 4; y += 1) builder.set(cx + x, cy + y, cz + z, shell, `${variant}-chamfered-wall`);
    else builder.fill(cx + x, cy, cz + z, cx + x, cy + 3, cz + z, BlockId.Air, `${variant}-interior`);
  }
}

function planTinyPoi(kind: AdventurePoiKind, origin: WorldPosition, seed: string | number) {
  const b = new AdventurePlanBuilder(origin, seed);
  circularFloor(b, 4, ["sunwash-tidepool", "frostbound-bell"].includes(kind) ? BlockId.Limestone : BlockId.Moss, `${kind}-clearing`);
  if (kind === "wind-carved-waystone") {
    b.fill(0, 1, 0, 0, 4, 0, BlockId.MoonSlate, "wind-cut-monolith"); b.set(0, 3, -1, BlockId.Glowstone, "way-rune");
  } else if (kind === "foxfire-cairn") {
    b.fill(-1, 1, -1, 1, 1, 1, BlockId.Cobblestone, "cairn-base"); b.fill(0, 2, 0, 0, 3, 0, BlockId.RuneStone, "foxfire-stack"); b.set(0, 4, 0, BlockId.Glowstone, "foxfire");
    b.spawn(1, 1, 1, "rootwrithe", 1, 3, "cairn-rootwrithe", ["poi-resident", "defensive"]);
  } else if (kind === "fallen-star-camp") {
    b.fill(-2, 1, 1, 2, 1, 2, BlockId.Planks, "camp-lean-to"); b.fill(-2, 2, 2, 2, 3, 2, BlockId.WildwoodLog, "camp-back"); b.set(0, 1, -1, BlockId.CrystalBlock, "fallen-star-chip"); b.chest(2, 1, 1, "adventure-cache", "prospector-box", 4);
  } else if (kind === "reedwatch-platform") {
    for (const x of [-2, 2]) for (const z of [-2, 2]) b.fill(x, 1, z, x, 4, z, BlockId.BirchLog, "reedwatch-post"); b.fill(-2, 4, -2, 2, 4, 2, BlockId.Planks, "watch-deck"); b.set(-2, 5, 0, BlockId.Torch, "hooded-torch"); b.set(2, 5, 0, BlockId.Torch, "hooded-torch");
  } else if (kind === "frostbound-bell") {
    b.fill(-2, 1, 0, -2, 4, 0, BlockId.SnowcapStone, "bell-arch"); b.fill(2, 1, 0, 2, 4, 0, BlockId.SnowcapStone, "bell-arch"); b.fill(-2, 4, 0, 2, 4, 0, BlockId.RivetedBrass, "bell-beam"); b.fill(0, 2, 0, 0, 3, 0, BlockId.RivetedBrass, "frost-bell"); b.set(0, 1, 0, BlockId.DeepgearLantern, "bell-lantern");
  } else if (kind === "sunwash-tidepool") {
    for (let x = -3; x <= 3; x += 1) for (let z = -3; z <= 3; z += 1) if (x * x + z * z <= 9) b.set(x, x * x + z * z <= 4 ? -1 : 0, z, x * x + z * z <= 4 ? BlockId.Water : BlockId.TempleSandstone, "tidepool"); b.set(0, -2, 0, BlockId.Glowstone, "submerged-pebble");
  } else if (kind === "mushroom-circle") {
    for (let index = 0; index < 10; index += 1) { const angle = index / 10 * Math.PI * 2; b.set(Math.round(Math.cos(angle) * 3), 1, Math.round(Math.sin(angle) * 3), BlockId.MushroomCap, "mooncap-ring"); } b.set(0, 1, 0, BlockId.WildwoodStool, "story-seat");
  } else {
    b.fill(-2, 1, 1, 2, 1, 2, BlockId.Planks, "surveyor-awning"); b.fill(-2, 2, 2, 2, 3, 2, BlockId.WildwoodLog, "surveyor-frame"); b.set(-1, 1, -1, BlockId.CartographyTable, "survey-table"); b.set(1, 1, -1, BlockId.HearthFireplace, "banked-hearth"); b.chest(2, 1, 1, "adventure-cache", "surveyor-supplies", 4);
  }
  b.landmark(0, 1, 0, `adventure-poi:${kind}`);
  return b.plan(kind);
}

function planMediumPoi(kind: AdventurePoiKind, origin: WorldPosition, seed: string | number) {
  const b = new AdventurePlanBuilder(origin, seed);
  circularFloor(b, 7, ["sunken-caravan", "rattlekin-totem-ring", "emberwatch-tower"].includes(kind) ? BlockId.SunbakedClay : BlockId.Moss, `${kind}-grounds`);
  if (kind === "moonberry-witch-garden") {
    for (let edge = -6; edge <= 6; edge += 1) { b.set(edge, 1, -6, BlockId.WildwoodFence, "garden-fence"); b.set(edge, 1, 6, BlockId.WildwoodFence, "garden-fence"); b.set(-6, 1, edge, BlockId.WildwoodFence, "garden-fence"); b.set(6, 1, edge, BlockId.WildwoodFence, "garden-fence"); }
    for (const [x, z] of [[-3,-3],[0,-3],[3,-3],[-3,0],[3,0],[-3,3],[0,3],[3,3]] as const) b.set(x, 1, z, BlockId.MoonberryBushRipe, "medicine-bed");
    b.set(0, 1, 0, BlockId.AlchemyStand, "witch-stand"); b.chest(0, 1, 4, "adventure-cache", "garden-formulary", 5); b.spawn(0, 1, -2, "rootwrithe", 2, 5, "hedge-keepers", ["poi-guardian", "defensive"]);
  } else if (kind === "rattlekin-totem-ring") {
    for (const [x,z] of [[-5,0],[5,0],[0,-5],[0,5]] as const) { b.fill(x,1,z,x,4,z,BlockId.SunbakedClay,"totem"); b.set(x,5,z,BlockId.Glowstone,"ritual-brazier"); }
    b.fill(-2, 1, -2, 2, 1, 2, BlockId.Limestone, "bone-dais"); b.spawn(0, 2, 0, "rattlekin", 3, 5, "rattlekin-circle", ["poi-resident", "hostile"]); b.chest(0, 1, 3, "adventure-cache", "totem-offerings", 5);
  } else if (kind === "skyglass-observatory") {
    ellipseFloor(b, 0, 7, 6, BlockId.RuneStone, "observatory-terrace");
    brokenArc(b, 6, 1, 5, BlockId.StoneBrick, "observatory-broken-arc", seed);
    for (const [x, z] of [[-4,-3],[4,-3],[-5,2],[5,2]] as const) b.fill(x, 1, z, x, 4, z, BlockId.StoneBrick, "lens-buttress");
    for (const [x, y, z] of [[-3,4,-2],[-2,5,-3],[0,6,-4],[2,5,-3],[3,4,-2]] as const) b.set(x,y,z,BlockId.Glass,"incomplete-skyglass-dome");
    b.fill(-3, 1, 1, 3, 1, 4, BlockId.StoneBrick, "stepped-viewing-terrace"); b.fill(-2, 2, 2, 2, 2, 4, BlockId.StoneBrick, "stepped-viewing-terrace");
    b.fill(0, 1, -1, 0, 4, -1, BlockId.RivetedBrass, "telescope-pivot"); b.fill(0, 4, -4, 0, 4, 1, BlockId.Glass, "skyglass-telescope");
    b.set(0, 3, -1, BlockId.CrystalBlock, "sky-lens"); b.chest(4, 1, 3, "adventure-cache", "observer-locker", 5); b.spawn(0, 5, 0, "vaultwing", 2, 4, "lens-roost", ["poi-resident", "hostile"]);
  } else if (kind === "overgrown-aqueduct") {
    for (const x of [-6,-2,2,6]) { b.fill(x,1,-2,x,5,2,BlockId.Cobblestone,"aqueduct-pier"); b.fill(x-1,4,-2,x+1,5,2,BlockId.Moss,"mossy-arch"); } b.fill(-7,6,-1,7,6,1,BlockId.Cobblestone,"water-channel"); b.fill(-6,7,0,6,7,0,BlockId.Water,"running-channel"); b.chest(0, 1, 3, "adventure-cache", "aqueduct-cache", 4);
  } else if (kind === "sunken-caravan") {
    for (const offset of [-5,0,5]) { b.fill(offset-2,1,-1,offset+2,2,2,BlockId.Planks,"tilted-wagon"); b.set(offset-2,1,3,BlockId.WildwoodLog,"wagon-wheel"); b.set(offset+2,1,3,BlockId.WildwoodLog,"wagon-wheel"); } b.set(0,3,0,BlockId.DeepgearLantern,"way-lantern"); b.chest(5, 2, 0, "adventure-cache", "caravan-strongbox", 6); b.spawn(-3,1,-2,"auric-scarab",4,6,"caravan-scavengers",["poi-resident","defensive"]);
  } else if (kind === "emberwatch-tower") {
    for (let y = 0; y <= 9; y += 1) {
      const radius = y < 3 ? 4 : y < 7 ? 3 : 2;
      for (let x = -radius; x <= radius; x += 1) for (let z = -radius; z <= radius; z += 1) {
        if (Math.abs(x) === radius && Math.abs(z) === radius) continue;
        if (y === 0) b.set(x,y,z,BlockId.RivetedBrass,"emberwatch-floor");
        else if (Math.abs(x) === radius || Math.abs(z) === radius) b.set(x,y,z,(x+z+y)%4===0?BlockId.RivetedBrass:BlockId.Basalt,"tapered-emberwatch");
        else b.set(x,y,z,BlockId.Air,"emberwatch-interior");
      }
    }
    for (const y of [3,7]) b.fill(-5,y,-1,5,y,1,BlockId.RivetedBrass,"projecting-watch-balcony");
    for (const [x,z] of [[-2,-2],[-2,2],[2,-2],[2,2]] as const) b.fill(x,10,z,x,11,z,BlockId.Basalt,"uneven-crown");
    for (const y of [2,5,8]) { b.set(-3,y,0,BlockId.Glowstone,"ember-window"); b.set(3,y,0,BlockId.Glowstone,"ember-window"); }
    b.chest(0, 8, 0, "adventure-cache", "watch-captain-cache", 6); b.spawn(0,1,0,"cinder-maw",2,4,"tower-hounds",["poi-guardian","hostile"]);
  } else if (kind === "pilgrim-bathhouse") {
    ellipseFloor(b, 0, 7, 6, BlockId.Limestone, "bathhouse-stone-garden");
    for (let x=-5;x<=1;x+=1) for (let z=-3;z<=3;z+=1) if ((x+2)*(x+2)/10+z*z/8<1) b.set(x,0,z,BlockId.Water,"warm-spring-west");
    for (let x=0;x<=5;x+=1) for (let z=-2;z<=4;z+=1) if ((x-2)*(x-2)/9+(z-1)*(z-1)/8<1) b.set(x,0,z,BlockId.Water,"warm-spring-east");
    for (const [x,z,h] of [[-6,-4,5],[5,-4,4],[-6,4,4],[6,4,5],[0,-5,3]] as const) b.fill(x,1,z,x,h,z,BlockId.BirchLog,"asymmetric-pavilion-post");
    for (let x=-6;x<=6;x+=1) if (Math.abs(x)>2) b.set(x,5,-4,BlockId.Glass,"partial-oculus-roof");
    for (const [x,z] of [[-4,0],[-1,1],[2,0],[4,2]] as const) b.set(x,1,z,BlockId.Limestone,"spring-stepping-stone");
    for (const [x,z] of [[-6,1],[6,0],[-4,4],[4,-3]] as const) b.set(x,1,z,BlockId.Lumenreed,"bathhouse-reeds");
    b.set(-5,0,0,BlockId.Glowstone,"spring-light"); b.set(4,0,1,BlockId.Glowstone,"spring-light"); b.chest(0,1,5,"adventure-cache","pilgrim-locker",4);
  } else {
    for (const x of [-5,-3,-1,1,3,5]) { b.fill(x,1,0,x,5,0,BlockId.MoonboughLog,"harp-frame"); b.fill(x,2,0,x,4,0,BlockId.Glass,"harp-string"); } b.fill(-6,5,0,6,5,0,BlockId.MoonboughLog,"harp-arch"); for (const x of [-5,-1,3]) b.set(x,1,-2,BlockId.Moonpetal,"harp-light"); b.chest(0,1,4,"adventure-cache","harp-listener-cache",5); b.spawn(0,2,0,"vaultwing",2,5,"harp-vaultwings",["poi-resident","skittish"]);
  }
  b.landmark(0, 1, 0, `adventure-poi:${kind}`);
  return b.plan(kind);
}

const V135_WAYPOST_KINDS = [
  "lantern-piehouse",
  "switchback-tollcamp",
  "tideglass-embassy",
  "sugarwind-teahouse",
  "moonpost-listening-tree",
  "skyshaft-depot",
] as const satisfies readonly AdventurePoiKind[];

type WaypostKind = (typeof V135_WAYPOST_KINDS)[number];

const WAYPOST_RESIDENTS: Readonly<Record<WaypostKind, Readonly<{
  mob: string;
  name: string;
  profession: string;
  faction: string;
}>>> = {
  "lantern-piehouse": { mob: "hobbit-merchant", name: "Merry Bramblebun", profession: "brewer", faction: "hobbits" },
  "switchback-tollcamp": { mob: "goblin-alchemist", name: "Tikket Brassnose", profession: "goblin-alchemist", faction: "goblins" },
  "tideglass-embassy": { mob: "atlantian-pearlbroker", name: "Nerissa Foamquill", profession: "atlantian-pearlbroker", faction: "atlantians" },
  "sugarwind-teahouse": { mob: "sugarcourt-sweetbroker", name: "Praline Wispwhisk", profession: "sugarcourt-sweetbroker", faction: "sugarcourt" },
  "moonpost-listening-tree": { mob: "wood-elf-moonbroker", name: "Lethren Silverleaf", profession: "wood-elf-moonbroker", faction: "wood-elves" },
  "skyshaft-depot": { mob: "dwarf-provisioner", name: "Dagna Brightbolt", profession: "dwarf-provisioner", faction: "dwarves" },
};

function waypostResidentTags(kind: WaypostKind, origin: WorldPosition) {
  const resident = WAYPOST_RESIDENTS[kind];
  const suffix = `${origin.x}-${origin.z}`;
  return [
    "poi-resident",
    "aligned:true",
    "outpost-merchant",
    "outpost-guide",
    `settlement:waypost-${kind}-${suffix}`,
    `resident:waypost-${kind}-${suffix}-keeper`,
    `name:${resident.name}`,
    `profession:${resident.profession}`,
    `faction:${resident.faction}`,
  ] as const;
}

function planWaypostPoi(kind: WaypostKind, origin: WorldPosition, seed: string | number) {
  const b = new AdventurePlanBuilder(origin, seed);
  const resident = WAYPOST_RESIDENTS[kind];
  const floor = kind === "switchback-tollcamp" ? BlockId.SunbakedClay
    : kind === "sugarwind-teahouse" ? BlockId.BoiledSugarbrick
      : kind === "tideglass-embassy" ? BlockId.Limestone
        : kind === "skyshaft-depot" ? BlockId.DeepgearBrick : BlockId.Moss;
  circularFloor(b, 8, floor, `${kind}-grounds`);

  if (kind === "lantern-piehouse") {
    b.hollow(0, 1, 0, 5, 4, 4, BlockId.WayfarerCanvas, BlockId.Planks, "piehouse");
    b.fill(-2, 1, -4, 2, 3, -4, BlockId.Air, "piehouse-open-counter");
    b.fill(-5, 5, -4, 5, 5, 4, BlockId.HobbitThatch, "piehouse-thatch");
    b.set(-3, 1, 1, BlockId.HearthFireplace, "pie-oven");
    b.set(2, 1, 1, BlockId.WildwoodTable, "pie-counter");
    b.set(0, 1, -6, BlockId.WildwoodStool, "gossip-bench");
    b.set(3, 2, -4, BlockId.DeepgearLantern, "lantern-sign");
  } else if (kind === "switchback-tollcamp") {
    b.fill(-6, 1, -1, 6, 1, 1, BlockId.StorybookBrick, "toll-road");
    b.fill(-5, 1, -4, -1, 4, -1, BlockId.GoblinBrasswork, "toll-booth");
    b.fill(-4, 2, -3, -2, 3, 0, BlockId.Air, "booth-interior");
    b.fill(2, 1, 0, 2, 7, 0, BlockId.RivetedBrass, "semaphore-mast");
    b.fill(2, 6, -3, 2, 6, 3, BlockId.WayfarerCanvas, "semaphore-arm");
    b.set(2, 7, -3, BlockId.Whisperglass, "green-road-signal");
    b.set(-3, 1, -2, BlockId.AlchemyStand, "road-tonic-shelf");
  } else if (kind === "tideglass-embassy") {
    b.fill(-6, 0, -5, 6, 0, 5, BlockId.StorybookBrick, "embassy-reef-floor");
    b.fill(-4, 0, -3, 4, 0, 2, BlockId.Water, "embassy-reflecting-pool");
    for (const x of [-6, 6]) for (const z of [-5, 5]) b.fill(x, 1, z, x, 5, z, BlockId.Limestone, "embassy-column");
    b.fill(-6, 5, -5, 6, 5, 5, BlockId.Glass, "embassy-canopy");
    for (const [x, z] of [[-4, -3], [4, -3], [-4, 2], [4, 2]] as const) b.set(x, 0, z, BlockId.Whisperglass, "tide-rune");
    b.set(0, 1, 4, BlockId.WildwoodTable, "surface-audience-table");
  } else if (kind === "sugarwind-teahouse") {
    b.hollow(0, 1, 0, 5, 4, 5, BlockId.BoiledSugarbrick, BlockId.SugarplumGrass, "teahouse");
    b.fill(-2, 1, -5, 2, 3, -5, BlockId.Air, "teahouse-doorway");
    for (const [x, z] of [[-4, -4], [4, -4], [-4, 4], [4, 4]] as const) b.fill(x, 5, z, x, 7, z, BlockId.CandywoodLog, "candy-spire");
    b.fill(-5, 5, -5, 5, 5, 5, BlockId.WayfarerCanvas, "striped-teahouse-roof");
    b.set(-2, 1, 1, BlockId.Sugarworks, "tea-kettle");
    b.set(2, 1, 1, BlockId.WildwoodTable, "sweet-counter");
    b.set(0, 2, -5, BlockId.Whisperglass, "sugarwind-sign");
  } else if (kind === "moonpost-listening-tree") {
    b.fill(0, 1, 0, 0, 9, 0, BlockId.MoonboughLog, "listening-trunk");
    for (const [x, y, z] of [[-5, 7, 0], [5, 7, 0], [0, 8, -5], [0, 8, 5]] as const) {
      b.fill(Math.min(0, x), y, Math.min(0, z), Math.max(0, x), y, Math.max(0, z), BlockId.MoonboughLog, "message-bough");
      b.set(x, y, z, BlockId.Whisperglass, "listening-leaf");
    }
    b.fill(-4, 1, -4, 4, 1, 4, BlockId.StorybookBrick, "moonpost-ring");
    b.set(-2, 2, 0, BlockId.TomeDisplay, "message-tome");
    b.set(2, 2, 0, BlockId.MoonboughChair, "listener-seat");
  } else {
    b.hollow(0, 1, 0, 6, 5, 5, BlockId.DeepgearBrick, BlockId.RivetedBrass, "skyshaft-depot");
    b.fill(-2, 1, -5, 2, 4, -5, BlockId.Air, "depot-gate");
    b.fill(0, 1, 0, 0, 9, 0, BlockId.Air, "lift-shaft");
    b.fill(-1, 1, -1, 1, 1, 1, BlockId.Whisperglass, "lift-platform");
    for (const x of [-6, 6]) { b.fill(x, 1, -5, x, 8, -5, BlockId.RivetedBrass, "depot-pylon"); b.set(x, 8, -5, BlockId.DeepgearLantern, "depot-beacon"); }
    b.set(-3, 1, 2, BlockId.GearTable, "parts-counter");
    b.set(3, 1, 2, BlockId.SealedBarrel, "delver-provisions");
  }

  // Enclosed wayposts use an exact authored interior anchor. A generic surface
  // scan sees the roof as the highest walkable block and used to place Merry on
  // top of the Piehouse instead of behind the open counter.
  const keeperZ = kind === "lantern-piehouse" ? -3 : -1;
  const keeperRadius = kind === "lantern-piehouse" ? 0 : 1.5;
  const keeperTags = kind === "lantern-piehouse"
    ? [...waypostResidentTags(kind, origin), "authored-interior-spawn"]
    : waypostResidentTags(kind, origin);
  b.spawn(0, 1, keeperZ, resident.mob, 1, keeperRadius, `${kind}-keeper`, keeperTags);
  b.chest(4, 1, 3, "adventure-cache", `${kind}-traveller-cache`, 5);
  b.landmark(0, 2, 0, `adventure-poi:${kind}`);
  return b.plan(kind);
}

function planV135CreaturePoi(kind: "whistlekite-roost" | "clockwork-burrow", origin: WorldPosition, seed: string | number) {
  const b = new AdventurePlanBuilder(origin, seed);
  circularFloor(b, 12, kind === "clockwork-burrow" ? BlockId.SnowcapStone : BlockId.Moss, `${kind}-grounds`);
  if (kind === "whistlekite-roost") {
    b.fill(-4, 1, -4, 4, 7, 4, BlockId.MoonSlate, "updraft-crag");
    b.fill(-3, 2, -3, 3, 7, 3, BlockId.Air, "hollow-roost");
    b.fill(-7, 8, -7, 7, 8, 7, BlockId.WayfarerCanvas, "wind-sail");
    b.fill(-5, 8, -5, 5, 8, 5, BlockId.Air, "wind-sail-opening");
    for (const [x, z] of [[-9, 0], [9, 0], [0, -9], [0, 9]] as const) { b.fill(x, 1, z, x, 6, z, BlockId.WildwoodLog, "wind-harp-post"); b.set(x, 7, z, BlockId.Whisperglass, "wind-beacon"); }
    b.spawn(0, 11, 0, "mossback-kite", 4, 8, "roost-kites", ["poi-resident", "skittish", "adventure-airborne"]);
    b.chest(0, 2, 0, "adventure-cache", "roost-offerings", 6);
  } else {
    for (let x=-9;x<=9;x+=1) for (let z=-6;z<=6;z+=1) {
      const ellipse = x*x/81+z*z/36;
      if (ellipse>1.12) continue;
      const shell = ellipse>0.72;
      for (let y=1;y<=4;y+=1) b.set(x,y,z,shell?((x+z)%4===0?BlockId.RivetedBrass:BlockId.DeepgearBrick):BlockId.Air,shell?"elliptical-surveyor-hull":"burrow-chamber");
      if (shell && hashUnit(seed,`hull-collapse:${x},${z}`)<0.22) b.set(x,4,z,BlockId.Air,"collapsed-hull-gap");
    }
    for (const [x,z] of [[-7,-4],[-3,-6],[2,-6],[7,-3],[-8,2],[8,2],[-4,5],[4,5]] as const) b.fill(x,1,z,x,5,z,BlockId.RivetedBrass,"tilted-hull-rib");
    for (const [x,z] of [[-5,5],[0,6],[5,5]] as const) b.set(x,3,z,BlockId.Whisperglass,"warm-porthole");
    b.fill(-2,1,5,2,3,7,BlockId.Air,"main-burrow-mouth"); b.fill(-8,1,-2,-5,2,1,BlockId.Air,"side-burrow-mouth");
    for (const [x,z] of [[-10,-4],[10,-2],[-7,7],[7,7]] as const) { b.set(x,1,z,BlockId.RivetedBrass,"gear-remnant"); b.set(x,2,z,BlockId.StorybookBrick,"buried-survey-plate"); }
    b.set(-5, 1, 0, BlockId.GearTable, "abandoned-gearbench");
    b.set(5, 1, 0, BlockId.HearthFireplace, "marmot-warmer");
    b.spawn(0, 1, 0, "clockwork-marmot", 5, 7, "burrow-colony", ["poi-resident", "gentle"]);
    b.chest(0, 1, -4, "adventure-cache", "surveyor-toolbox", 6);
  }
  b.landmark(0, 2, 0, `adventure-poi:${kind}`);
  return b.plan(kind);
}

function planLargePoi(kind: AdventurePoiKind, origin: WorldPosition, seed: string | number) {
  const b = new AdventurePlanBuilder(origin, seed);
  circularFloor(b, 12, kind === "saltwind-lighthouse" ? BlockId.Limestone : BlockId.Moss, `${kind}-grounds`);
  if (kind === "shattered-colossus") {
    for (let x=-8;x<=-2;x+=1) for (let y=1;y<=7;y+=1) for (let z=-4;z<=4;z+=1) {
      const dx=(x+5)/3.7, dy=(y-4)/3.8, dz=z/4.4;
      const radius=dx*dx+dy*dy+dz*dz;
      if (radius<=1.08 && radius>=0.52) b.set(x,y,z,BlockId.Deepstone,"rounded-colossus-skull");
    }
    b.fill(-8,2,-4,-6,3,-4,BlockId.CrystalBlock,"exposed-eye-core"); b.fill(-5,1,-2,-3,3,2,BlockId.Air,"broken-jaw-cavity");
    for (let x=0;x<=10;x+=1) {
      const width=Math.max(1,3-Math.floor(x/4));
      b.fill(x,1,-width,x,2+(x%4===0?1:0),width,BlockId.TempleSandstone,"curved-fallen-arm");
      if (x%3===1) b.set(x,3,width,BlockId.Deepstone,"arm-joint");
    }
    for (const [x,z,len] of [[9,-4,4],[10,-2,5],[10,0,5],[9,2,4]] as const) b.fill(x,1,z,x+len,1,z,BlockId.TempleSandstone,"colossus-finger");
    for (const [x,z] of [[-10,-5],[-9,5],[-1,-5],[4,4],[12,2]] as const) b.set(x,1,z,BlockId.Moss,"rubble-vine");
    b.chest(-4,2,0,"adventure-cache","colossus-memory",7); b.spawn(5,2,0,"ossuary-keeper",2,8,"colossus-keepers",["poi-guardian","hostile"]);
  } else if (kind === "wildwood-bridgehouse") {
    b.fill(-12,1,-3,12,1,3,BlockId.Planks,"covered-bridge-deck"); for (const x of [-12,-8,-4,0,4,8,12]) { b.fill(x,0,-3,x,5,-3,BlockId.WildwoodLog,"bridge-post"); b.fill(x,0,3,x,5,3,BlockId.WildwoodLog,"bridge-post"); if (x % 8 === 0) { b.set(x,3,-2,BlockId.Torch,"rail-lantern"); b.set(x,3,2,BlockId.Torch,"rail-lantern"); } } b.fill(-12,5,-3,12,5,3,BlockId.WildwoodLeaves,"bridge-roof"); b.hollow(0,2,0,4,3,3,BlockId.Planks,BlockId.Planks,"keeper-room"); b.chest(2,2,1,"adventure-cache","bridge-tollbox",6);
  } else if (kind === "starfall-amphitheater") {
    for (let ring = 11; ring >= 5; ring -= 2) for (let x = -ring; x <= ring; x += 1) for (let z = -ring; z <= ring; z += 1) if (Math.abs(Math.hypot(x,z)-ring) < 0.75 && z >= -2) b.set(x,Math.floor((11-ring)/2)+1,z,BlockId.Limestone,"amphitheater-tier"); b.fill(-5,1,-9,5,1,-4,BlockId.RuneStone,"star-stage"); b.fill(0,2,-7,0,5,-7,BlockId.CrystalBlock,"conductor-plinth"); for (const [x,z] of [[-8,0],[8,0],[-6,6],[6,6]] as const) b.set(x,2,z,BlockId.Glowstone,"aisle-star"); b.chest(0,2,-5,"adventure-cache","performer-cache",7); b.spawn(0,2,2,"bellroot-matron",1,8,"amphitheater-matron",["poi-resident","defensive"]);
  } else {
    b.hollow(0, 1, 0, 6, 13, 6, BlockId.Limestone, BlockId.TempleSandstone, "lighthouse");
    for (const y of [3, 6, 9]) for (const x of [-6, 6]) b.set(x, y, 0, BlockId.Glass, "salt-window");
    b.fill(-7, 13, -7, 7, 13, 7, BlockId.StoneBrick, "beacon-gallery");
    for (const x of [-6, 6]) for (const z of [-6, 6]) b.fill(x, 14, z, x, 17, z, BlockId.Glass, "beacon-pane");
    b.fill(-6, 17, -6, 6, 17, 6, BlockId.StoneBrick, "beacon-roof");
    b.set(0, 15, 0, BlockId.Glowstone, "saltwind-beacon");
    // The lighthouse floor is local Y=0, so keeper furnishings occupy Y=1.
    b.set(-3, 1, 1, BlockId.WildwoodTable, "keeper-table");
    b.set(-4, 1, 1, BlockId.HearthChair, "keeper-chair");
    b.chest(3, 1, 2, "adventure-cache", "keeper-sea-chest", 7);
    b.spawn(0, 14, 0, "vaultwing", 2, 5, "beacon-roost", ["poi-resident", "skittish"]);
  }
  b.landmark(0, 2, 0, `adventure-poi:${kind}`);
  return b.plan(kind);
}

function dungeonProfile(kind: AdventureDungeonKind) {
  if (kind === "rootbound-labyrinth") return { shell: BlockId.Moss, floor: BlockId.RuneStone, light: BlockId.Glowstone, table: "rootbound-vault" as const, mobs: ["rootwrithe", "bellroot-matron", "rootwrithe"] as const };
  if (kind === "starless-observatory") return { shell: BlockId.MoonSlate, floor: BlockId.Deepstone, light: BlockId.CrystalBlock, table: "starless-vault" as const, mobs: ["vaultwing", "auric-scarab", "ossuary-keeper"] as const };
  if (kind === "palimpsest-vault") return { shell: BlockId.StorybookBrick, floor: BlockId.MoonSlate, light: BlockId.Whisperglass, table: "palimpsest-vault" as const, mobs: ["ossuary-keeper", "vaultwing", "inkmaw-curator"] as const };
  return { shell: BlockId.DeepgearBrick, floor: BlockId.RivetedBrass, light: BlockId.DeepgearLantern, table: "brassdeep-vault" as const, mobs: ["cinder-maw", "auric-scarab", "ossuary-keeper"] as const };
}

function planUndergroundDungeon(kind: AdventureDungeonKind, origin: WorldPosition, seed: string | number) {
  const b = new AdventurePlanBuilder(origin, seed);
  const profile = dungeonProfile(kind);
  const base = -16;
  // Surface threshold and a descending, lit access shaft.
  b.fill(-2, 0, 10, 2, 2, 14, profile.shell, `${kind}-entrance`);
  b.fill(-1, 1, 11, 1, 2, 13, BlockId.Air, `${kind}-doorway`);
  for (let depth = -1; depth >= base; depth -= 1) {
    b.fill(-2, depth, 10, 2, depth, 14, profile.shell, `${kind}-shaft-shell`);
    b.fill(-1, depth, 11, 1, depth, 13, BlockId.Air, `${kind}-shaft-air`);
    b.set(depth % 2 ? -2 : 2, depth, 12, profile.light, `${kind}-shaft-light`);
  }
  const dungeonTiles = planDungeonTiles(kind, `${seed}:${origin.x},${origin.z}`);
  const tileCenter = (tile: DungeonTile) => ({ x: tile.gridX * 7, y: tile.stage === 1 ? base : tile.stage === 2 ? base - 2 : base - 4, z: tile.gridZ * 7 });
  for (const tile of dungeonTiles) {
    const center = tileCenter(tile);
    chamferedDungeonCell(b, center.x, center.y, center.z, profile.shell, profile.floor, `${kind}-dungeon-tile-${tile.gridX},${tile.gridZ}`);
    if (kind === "rootbound-labyrinth" && tile.gridX !== 0) b.fill(center.x, center.y, center.z, center.x, center.y + 3, center.z, BlockId.WildwoodLog, `${kind}-root-rib`);
    else if (kind === "starless-observatory" && tile.gridX !== 0) b.set(center.x, center.y + 3, center.z, BlockId.CrystalBlock, `${kind}-constellation-node`);
    else if (kind === "brassdeep-foundry" && tile.gridX !== 0) b.fill(center.x - 1, center.y, center.z, center.x + 1, center.y, center.z, BlockId.RivetedBrass, `${kind}-assembly-bay`);
    else if (kind === "palimpsest-vault" && tile.gridX !== 0) for (const offset of [-2, 0, 2]) b.fill(center.x + offset, center.y, center.z - 2, center.x + offset, center.y + 2, center.z + 2, BlockId.ArchiveShelf, `${kind}-stack-aisle`);
  }
  const tileByKey = new Map(dungeonTiles.map((tile) => [`${tile.gridX},${tile.gridZ}`, tile]));
  for (const tile of dungeonTiles) {
    const center = tileCenter(tile);
    for (const [direction, dx, dz] of [["east",1,0],["south",0,1]] as const) {
      if (!tile.connections.includes(direction)) continue;
      const neighbor = tileByKey.get(`${tile.gridX + dx},${tile.gridZ + dz}`);
      if (!neighbor || neighbor.stage !== tile.stage) continue;
      const next = tileCenter(neighbor);
      if (dx) b.fill(center.x + 3, center.y, center.z - 1, next.x - 3, center.y + 2, center.z + 1, BlockId.Air, `${kind}-tiled-doorway`);
      else b.fill(center.x - 1, center.y, center.z + 3, center.x + 1, center.y + 2, next.z - 3, BlockId.Air, `${kind}-tiled-doorway`);
    }
  }
  const stageRadius = (stage: 1 | 2 | 3) => {
    const stageTiles = dungeonTiles.filter((tile) => tile.stage === stage);
    return Math.max(4, ...stageTiles.map((tile) => Math.abs(tile.gridX * 7) + 3));
  };
  b.room("threshold", kind === "rootbound-labyrinth" ? "Root Gate" : kind === "starless-observatory" ? "Lens Vestibule" : kind === "palimpsest-vault" ? "Errata Vestibule" : "Ore Intake", 1, [0, base, 7], [stageRadius(1), 4, 4], "Survive the entrance encounter and find the descending passage.");
  b.room("crossing", kind === "rootbound-labyrinth" ? "Whisper Maze" : kind === "starless-observatory" ? "Constellation Archive" : kind === "palimpsest-vault" ? "Rewritten Stacks" : "Assembly Floor", 2, [0, base - 2, 0], [stageRadius(2), 4, 4], "Clear the connected side chambers and reach the sealed inner hall.");
  b.room("vault", kind === "rootbound-labyrinth" ? "Heartroot Reliquary" : kind === "starless-observatory" ? "Astrolabe Vault" : kind === "palimpsest-vault" ? "Last Folio" : "Quenched Master-vault", 3, [0, base - 4, -7], [stageRadius(3), 4, 11], "Defeat the guardian and claim the authored vault loot.");
  // Two compact one-block stair drops connect the three fixed spine stages.
  for (const [z, floorY] of [[4, base - 2], [3, base - 3], [-3, base - 4], [-4, base - 5]] as const) {
    for (let x = -1; x <= 1; x += 1) {
      b.set(x, floorY + 1, z, BlockId.Air, `${kind}-stage-transition-recut`);
      b.set(x, floorY, z, profile.floor, `${kind}-stage-transition-tread`);
      b.set(x, floorY + 2, z, BlockId.Air, `${kind}-stage-transition-headroom`);
      b.set(x, floorY + 3, z, BlockId.Air, `${kind}-stage-transition-headroom`);
    }
  }
  // A one-block-rise spiral follows a unique 7x7 perimeter from the surface
  // to the threshold floor. The open 3x3 shaft remains a sightline/lightwell,
  // but is no longer the only way in or out (and therefore no longer a trap).
  const stairRing: Array<readonly [number, number]> = [];
  for (let x = -3; x <= 3; x += 1) stairRing.push([x, 9]);
  for (let z = 10; z <= 15; z += 1) stairRing.push([3, z]);
  for (let x = 2; x >= -3; x -= 1) stairRing.push([x, 15]);
  for (let z = 14; z >= 10; z -= 1) stairRing.push([-3, z]);
  for (let step = 0; step <= 17; step += 1) {
    const [stairX, stairZ] = stairRing[step];
    const stairGroundY = -step;
    b.set(stairX, stairGroundY, stairZ, profile.floor, `${kind}-stair-step-${step}`);
    b.set(stairX, stairGroundY + 1, stairZ, BlockId.Air, `${kind}-stair-headroom`);
    b.set(stairX, stairGroundY + 2, stairZ, BlockId.Air, `${kind}-stair-headroom`);
  }
  // The final tread and the threshold chamber share a floor at base - 1.
  b.fill(-3, base, 14, -1, base + 2, 14, BlockId.Air, `${kind}-stair-threshold-door`);
  for (const [x, y, z] of [[-3,base,7],[3,base,7],[-3,base-2,0],[3,base-2,0],[-3,base-4,-7],[3,base-4,-14]] as const) b.set(x,y,z,profile.light,`${kind}-room-light`);
  // A real barred leaf closes the inner threshold; alpha gaps preserve the view into the next stage.
  b.set(0, base - 1, 4, BlockId.WroughtIronDoorClosedLower, `${kind}-wrought-threshold-door`);
  b.set(0, base, 4, BlockId.WroughtIronDoorClosedUpper, `${kind}-wrought-threshold-door`);
  b.spawn(-2, base, 7, profile.mobs[0], 3, 5, "threshold-encounter", ["dungeon", "stage-1", "hostile"]);
  b.spawn(3, base - 2, 0, profile.mobs[1], 4, 6, "crossing-encounter-a", ["dungeon", "stage-2", "hostile"]);
  b.spawn(-3, base - 2, -2, profile.mobs[0], 2, 5, "crossing-encounter-b", ["dungeon", "stage-2", "hostile"]);
  b.spawn(0, base - 4, -7, profile.mobs[2], kind === "rootbound-labyrinth" || kind === "palimpsest-vault" ? 1 : 2, 6, "vault-guardian", ["dungeon", "stage-3", "boss", "hostile"]);
  b.chest(4, base - 2, 1, "adventure-cache", "midway-supplies", 5);
  b.chest(0, base - 4, -14, profile.table, "master-vault", 8);
  b.landmark(0, 1, 12, `dungeon:${kind}`);
  return b.plan(kind);
}

function planStormglassCitadel(origin: WorldPosition, seed: string | number) {
  const kind: AdventureDungeonKind = "stormglass-citadel";
  const b = new AdventurePlanBuilder(origin, seed);
  b.fill(-13,0,-13,13,0,13,BlockId.SnowcapStone,"citadel-court");
  for (let edge = -13; edge <= 13; edge += 1) { b.fill(edge,1,-13,edge,5,-13,BlockId.SnowcapStone,"citadel-wall"); b.fill(edge,1,13,edge,5,13,BlockId.SnowcapStone,"citadel-wall"); b.fill(-13,1,edge,-13,5,edge,BlockId.SnowcapStone,"citadel-wall"); b.fill(13,1,edge,13,5,edge,BlockId.SnowcapStone,"citadel-wall"); }
  b.fill(-2,1,13,2,4,13,BlockId.Air,"gate"); b.set(-3,4,13,BlockId.CrystalBlock,"gate-light"); b.set(3,4,13,BlockId.CrystalBlock,"gate-light");
  b.hollow(0,1,-4,8,7,7,BlockId.SnowcapStone,BlockId.MoonSlate,"citadel-hall");
  b.hollow(0,8,-7,5,7,5,BlockId.Glass,BlockId.MoonSlate,"storm-lens");
  b.room("gate-court","Storm Gate Court",1,[0,1,7],[10,5,5],"Break the gate ambush and enter the keep.");
  b.room("glass-hall","Glasswind Hall",2,[0,1,-4],[8,7,7],"Climb through two defended galleries.");
  b.room("crown","Crown Observatory",3,[0,8,-7],[5,7,5],"Defeat the keeper beneath the storm lens.");
  for (const [x,y,z] of [[-8,2,7],[8,2,7],[-6,3,-4],[6,3,-4],[-3,10,-7],[3,10,-7]] as const) b.set(x,y,z,BlockId.CrystalBlock,"citadel-light");
  b.spawn(0,1,7,"cinder-maw",3,8,"gate-pack",["dungeon","stage-1","hostile"]); b.spawn(-3,2,-3,"vaultwing",4,7,"glass-hall-flock",["dungeon","stage-2","hostile"]); b.spawn(3,5,-6,"auric-scarab",4,5,"upper-gallery-scarabs",["dungeon","stage-2","hostile"]); b.spawn(0,9,-7,"ossuary-keeper",2,6,"crown-keepers",["dungeon","stage-3","boss","hostile"]);
  b.chest(5,2,-1,"adventure-cache","citadel-armory",6); b.chest(0,9,-10,"stormglass-vault","stormglass-reliquary",8); b.landmark(0,1,12,`dungeon:${kind}`);
  return b.plan(kind);
}

function planBloomrotCathedral(origin: WorldPosition, seed: string | number) {
  const kind: AdventureDungeonKind = "bloomrot-cathedral";
  const b = new AdventurePlanBuilder(origin, seed);
  b.fill(-7,0,-14,7,0,14,BlockId.RuneStone,"cathedral-nave-floor"); b.fill(-14,0,-5,14,0,5,BlockId.RuneStone,"cathedral-transept-floor");
  // Trace the actual cruciform perimeter instead of boxing the nave and
  // accidentally sealing it away from two half-walled transept rooms.
  for (const x of [-7,7]) for (const [minZ,maxZ] of [[-14,-6],[6,14]] as const) b.fill(x,1,minZ,x,9,maxZ,BlockId.Moss,"cathedral-nave-wall");
  for (const z of [-14,14]) b.fill(-7,1,z,7,9,z,BlockId.Moss,"cathedral-end-wall");
  for (const x of [-14,14]) b.fill(x,1,-5,x,7,5,BlockId.Moss,"cathedral-transept-end-wall");
  for (const z of [-5,5]) for (const [minX,maxX] of [[-14,-8],[8,14]] as const) b.fill(minX,1,z,maxX,7,z,BlockId.Moss,"cathedral-transept-wall");
  // Authored passages are explicit air so terrain or ruin overlap cannot
  // reseal the public entrance or the nave-to-wing crossings.
  b.fill(-2,1,14,2,4,14,BlockId.Air,"cathedral-entry");
  b.fill(-7,1,-4,-7,5,4,BlockId.Air,"cathedral-west-crossing");
  b.fill(7,1,-4,7,5,4,BlockId.Air,"cathedral-east-crossing");
  for (const z of [-10,-4,2,8]) for (const x of [-6,6]) { b.fill(x,1,z,x,8,z,BlockId.WildwoodLog,"root-column"); b.set(x,6,z,BlockId.Glowstone,"rose-lamp"); }
  for (const [x,z] of [[-14,-5],[-14,5],[14,-5],[14,5],[-7,-14],[7,-14],[-7,14],[7,14]] as const) b.fill(x,1,z,x,10,z,BlockId.WildwoodLog,"cathedral-buttress");
  b.fill(-2,1,-13,2,4,-10,BlockId.RuneStone,"sealed-altar"); b.set(0,5,-11,BlockId.CrystalBlock,"dawn-rose");
  b.room("nave","Overgrown Nave",1,[0,1,8],[7,8,6],"Advance between root columns while the nave pack presses from both aisles."); b.room("transept","Briar Transept",2,[0,1,0],[14,7,5],"Clear both garden wings to expose the altar approach."); b.room("altar","Dawn Rose Altar",3,[0,1,-10],[7,9,4],"Defeat the matron and open the reliquary under the rose.");
  b.spawn(0,1,9,"rootwrithe",4,7,"nave-roots",["dungeon","stage-1","hostile"]); b.spawn(-8,1,0,"cinder-maw",3,6,"west-transept-pack",["dungeon","stage-2","hostile"]); b.spawn(8,1,0,"vaultwing",4,6,"east-transept-roost",["dungeon","stage-2","hostile"]); b.spawn(0,1,-9,"bellroot-matron",1,7,"altar-matron",["dungeon","stage-3","boss","hostile"]);
  b.chest(-10,1,0,"adventure-cache","transept-cache",6); b.chest(0,2,-12,"bloomrot-vault","dawn-rose-reliquary",8); b.landmark(0,1,13,`dungeon:${kind}`);
  return b.plan(kind);
}

const MYTHIC_POI_KINDS = Object.freeze([
  "road-of-quiet-bells", "cloudwhale-graveyard", "mirrorfen-processional", "emberglass-hatchery", "drowned-moon-gate",
  "titans-kettle", "root-crown-menagerie", "fossil-orchard", "lanternroot-cistern", "tideclock-wreck",
] as const satisfies readonly AdventurePoiKind[]);

const MYTHIC_DUNGEON_KINDS = Object.freeze([
  "palace-of-nine-winds", "gorgon-quarry", "sunken-court-of-namarra", "ashen-library-of-salamander-kings", "hollow-moon-menagerie",
] as const satisfies readonly AdventureDungeonKind[]);

function mythicSiteForStructure(kind: AdventureStructureKind) {
  return MYTHIC_FRONTIER_SITE_ORDER.map((id) => MYTHIC_FRONTIER_SITES[id]).find((entry) => entry.structureKind === kind)!;
}

function mythicMaterial(definition: MythicFrontierSiteDefinition) {
  const family = MYTHIC_MATERIAL_FAMILIES[definition.material];
  return { shell: family.block, support: family.supportBlock, accent: family.accentBlock, exceptional: family.exceptionalBlock, variants: family.variants };
}

function mythicRoomName(definition: MythicFrontierSiteDefinition, index: number) {
  const named: Readonly<Partial<Record<MythicFrontierSiteId, readonly string[]>>> = Object.freeze({
    "road-quiet-bells": ["Buried Milepost", "Sheltered Bell", "Qilin Processional"],
    "cloudwhale-graveyard": ["Lower Wind Shadow", "Baleen Terrace", "Lift Basin"],
    "mirrorfen-processional": ["False Wake", "Reedglass Turn", "True Processional"],
    "emberglass-hatchery": ["Ash Vestibule", "Heat Cradle", "Glasswing Nursery", "Safe Chimney"],
    "drowned-moon-gate": ["Nacre Threshold", "Moonwell Pocket", "Sealed Garden", "Gatewyrm Court"],
    "titans-kettle": ["Caravan Lip", "Warm Basin", "Behemoth Shelter"],
    "root-crown-menagerie": ["Root Threshold", "Herbivore Court", "Predator Court", "Briarcrown Range"],
    "fossil-orchard": ["First Stratum", "Porous Beds", "Spiral Grove", "Ammonarch Resonance"],
    "lanternroot-cistern": ["Dark Approach", "Rescue Channel", "Keepsake Gallery", "Lanternroot Center"],
    "tideclock-wreck": ["Broken Bow", "Sounding Hold", "Cetus Current"],
    "palace-nine-winds": ["First Wind", "Crosswind Hall", "Third Court", "Leeward Gallery", "Ninth Gate", "Gryphon Crown"],
    "gorgon-quarry": ["Quarry Mouth", "Cocoon Gallery", "Mirror Cut", "Brace Loop", "Reversal Chamber", "Sable Court"],
    "sunken-court-namarra": ["Flooded Procession I", "Flooded Procession II", "Flooded Procession III", "Flooded Procession IV", "Flooded Procession V", "West Air Garden", "East Air Garden", "Pearl Court"],
    "ashen-library-salamander-kings": ["Ash Intake", "Cold Catalogue", "First Heat Archive", "Royal Stacks", "Memory Furnace", "Crown Foundry", "Safe Chimney"],
    "hollow-moon-menagerie": ["Forest Memory", "Fen Memory", "Desert Memory", "Tundra Memory", "Reef Memory", "Ember Memory", "Moonfelt Pond"],
  });
  return named[definition.id]?.[index] ?? `${definition.name} Chamber ${index + 1}`;
}

function decorateMythicRoom(builder: AdventurePlanBuilder, definition: MythicFrontierSiteDefinition, center: readonly [number, number, number], roomIndex: number) {
  const [x, y, z] = center;
  const material = mythicMaterial(definition);
  const variant = material.variants[roomIndex % material.variants.length];
  // Keep the rare ecology light against a side wall rather than in a room's
  // central travel lane. Besides reading more like a deliberate habitat
  // feature, this keeps surface shafts and return loops from erasing it.
  builder.set(x + 3, y + 3, z, material.exceptional, `${definition.id}-${variant}-ecology-light`);
  // A repeatable 68/24/7/<2 material grammar: quiet family masonry owns
  // the mass, structural supports explain load, accents frame interaction,
  // and one ecological light remains the exceptional state.
  for (let edge = -4; edge <= 4; edge += 1) {
    builder.set(x + edge, y - 1, z - 4, material.support, `${definition.id}-support-floor-rim`);
    builder.set(x + edge, y - 1, z + 4, material.support, `${definition.id}-support-floor-rim`);
    builder.set(x - 4, y - 1, z + edge, material.support, `${definition.id}-support-floor-rim`);
    builder.set(x + 4, y - 1, z + edge, material.support, `${definition.id}-support-floor-rim`);
    builder.set(x + edge, y + 4, z, material.support, `${definition.id}-support-ceiling-brace`);
    builder.set(x, y + 4, z + edge, material.support, `${definition.id}-support-ceiling-brace`);
  }
  for (const side of [-4, 4]) for (let edge = -4; edge <= 4; edge += 1) {
    builder.set(x + edge, y + 2, z + side, material.support, `${definition.id}-support-wall-course`);
    builder.set(x + side, y + 2, z + edge, material.support, `${definition.id}-support-wall-course`);
  }
  for (const cornerX of [-3, 3]) for (const cornerZ of [-3, 3]) builder.fill(x + cornerX, y, z + cornerZ, x + cornerX, y + 2, z + cornerZ, material.support, `${definition.id}-${material.variants[(roomIndex + Math.abs(cornerX + cornerZ)) % material.variants.length]}`);
  for (const side of [-4, 4]) {
    builder.fill(x - 1, y + 1, z + side, x + 1, y + 2, z + side, material.accent, `${definition.id}-accent-inset`);
    builder.fill(x + side, y + 1, z - 1, x + side, y + 2, z + 1, material.accent, `${definition.id}-accent-inset`);
  }
  if (definition.material === "mirrorpeat-reedglass") for (const side of [-1, 1]) builder.fill(x + side * 2, y + 1, z - 3, x + side * 2, y + 2, z - 3, BlockId.Reedglass, `${definition.id}-reed-post`);
  if (definition.material === "fossilroot-calcite") for (let fossil = -2; fossil <= 2; fossil += 1) builder.set(x + fossil, y, z + 2, BlockId.FossilrootCalcite, `${definition.id}-spiral-fossil`);
  if (definition.material === "emberglass-archive") for (let tablet = -2; tablet <= 2; tablet += 1) builder.set(x + tablet, y + 1, z - 3, BlockId.EmberglassArchive, `${definition.id}-heat-reveal-tablet`);
  if (definition.material === "nacre-tidework") builder.fill(x - 2, y + 1, z - 3, x + 2, y + 2, z - 3, BlockId.NacreTidework, `${definition.id}-pearl-inset`);
  if (definition.material === "moonfelt-mycelium") for (let fan = -2; fan <= 2; fan += 1) builder.set(x + fan, y + 1, z + 3, BlockId.MoonfeltMycelium, `${definition.id}-${fan % 2 ? "dormant-fan" : "active-fan"}`);
}

type MythicRoomCenter = readonly [number, number, number];
type MythicMaterialPlan = ReturnType<typeof mythicMaterial>;

function floodedMythicRoomIndices(definition: MythicFrontierSiteDefinition, roomCount: number) {
  if (definition.id === "sunken-court-namarra") return new Set([0, 1, 2, 3, 4, 7]);
  if (definition.id === "hollow-moon-menagerie") return new Set([roomCount - 1]);
  return new Set(Array.from({ length: definition.explicitFloodedRooms }, (_, index) => index));
}

/**
 * Builds a mount-clear, one-block-rise route between two rooms. Underwater
 * routes receive a complete five-block tube so an air connector can never
 * become a naked tunnel through ocean water. Wet/dry boundaries get an
 * authored pressure bulkhead instead of relying on ambient water simulation.
 */
function connectMythicRooms(builder: AdventurePlanBuilder, definition: MythicFrontierSiteDefinition, material: MythicMaterialPlan, from: MythicRoomCenter, to: MythicRoomCenter, routeIndex: number, fromFlooded: boolean, toFlooded: boolean) {
  const cells: Array<readonly [number, number]> = [[from[0], from[2]]];
  let x = from[0]; let z = from[2];
  while (x !== to[0]) { x += Math.sign(to[0] - x); cells.push([x, z]); }
  while (z !== to[2]) { z += Math.sign(to[2] - z); cells.push([x, z]); }
  const sealed = definition.layer === "underwater";
  const interior = fromFlooded && toFlooded ? BlockId.Water : BlockId.Air;
  cells.forEach(([cellX, cellZ], index) => {
    const t = cells.length <= 1 ? 1 : index / (cells.length - 1);
    const standingY = Math.round(from[1] + (to[1] - from[1]) * t);
    const neighbor = cells[Math.min(cells.length - 1, index + 1)] ?? cells[Math.max(0, index - 1)];
    const travelsX = neighbor[0] !== cellX || (neighbor[0] === cellX && neighbor[1] === cellZ && Math.abs(to[0] - from[0]) >= Math.abs(to[2] - from[2]));
    const offsets = [-2, -1, 0, 1, 2] as const;
    if (sealed) {
      const roomInterior = index < 4 || index > cells.length - 5;
      for (const offset of offsets) {
        const px = cellX + (travelsX ? 0 : offset);
        const pz = cellZ + (travelsX ? offset : 0);
        builder.set(px, standingY - 1, pz, material.shell, `${definition.id}-sealed-route-floor-${routeIndex}`);
        if (!roomInterior) builder.set(px, standingY + 3, pz, material.shell, `${definition.id}-sealed-route-ceiling-${routeIndex}`);
      }
      if (!roomInterior) for (let height = 0; height <= 2; height += 1) for (const side of [-2, 2]) {
        builder.set(cellX + (travelsX ? 0 : side), standingY + height, cellZ + (travelsX ? side : 0), material.support, `${definition.id}-sealed-route-wall-${routeIndex}`);
      }
      for (let height = 0; height <= 2; height += 1) for (const offset of [-1, 0, 1]) {
        builder.set(cellX + (travelsX ? 0 : offset), standingY + height, cellZ + (travelsX ? offset : 0), interior, `${definition.id}-${interior === BlockId.Water ? "water" : "air"}-route-${routeIndex}`);
      }
    } else {
      for (const offset of [-1, 0, 1]) {
        const px = cellX + (travelsX ? 0 : offset);
        const pz = cellZ + (travelsX ? offset : 0);
        builder.set(px, standingY - 1, pz, material.shell, `${definition.id}-return-tread-${routeIndex}`);
        builder.fill(px, standingY, pz, px, standingY + 2, pz, BlockId.Air, `${definition.id}-connected-route-${routeIndex}`);
      }
    }
  });
  if (sealed && fromFlooded !== toFlooded && cells.length >= 9) {
    const lockIndex = Math.max(4, Math.min(cells.length - 5, Math.floor(cells.length / 2)));
    const [lockX, lockZ] = cells[lockIndex];
    const standingY = Math.round(from[1] + (to[1] - from[1]) * (lockIndex / (cells.length - 1)));
    const next = cells[lockIndex + 1];
    const travelsX = next[0] !== lockX;
    for (const side of [-1, 1]) builder.fill(lockX + (travelsX ? 0 : side), standingY, lockZ + (travelsX ? side : 0), lockX + (travelsX ? 0 : side), standingY + 2, lockZ + (travelsX ? side : 0), material.accent, `${definition.id}-pressure-seal-${routeIndex}`);
    builder.set(lockX, standingY, lockZ, BlockId.WroughtIronDoorClosedLower, `${definition.id}-pressure-lock-${routeIndex}`);
    builder.set(lockX, standingY + 1, lockZ, BlockId.WroughtIronDoorClosedUpper, `${definition.id}-pressure-lock-${routeIndex}`);
    builder.set(lockX, standingY + 2, lockZ, material.accent, `${definition.id}-pressure-seal-${routeIndex}`);
  }
}

function addUndergroundPoiAccess(builder: AdventurePlanBuilder, definition: MythicFrontierSiteDefinition, material: MythicMaterialPlan, entrance: MythicRoomCenter) {
  const [x, , z] = entrance;
  const surfaceZ = z + 20;
  for (let depth = 0; depth <= 16; depth += 1) {
    const treadZ = surfaceZ - depth;
    for (let width = -1; width <= 1; width += 1) {
      builder.set(x + width, -depth, treadZ, material.shell, `${definition.id}-surface-return-tread-${depth}`);
      builder.fill(x + width, -depth + 1, treadZ, x + width, -depth + 3, treadZ, BlockId.Air, `${definition.id}-surface-return-headroom`);
    }
    for (const rail of [-2, 2]) builder.set(x + rail, -depth, treadZ, material.support, `${definition.id}-surface-return-brace`);
  }
  builder.fill(x - 3, 1, surfaceZ, x - 3, 5, surfaceZ, material.support, `${definition.id}-approach-arch`);
  builder.fill(x + 3, 1, surfaceZ, x + 3, 5, surfaceZ, material.support, `${definition.id}-approach-arch`);
  builder.fill(x - 3, 5, surfaceZ, x + 3, 5, surfaceZ, material.shell, `${definition.id}-approach-arch`);
  builder.set(x, 4, surfaceZ, material.accent, `${definition.id}-approach-keystone`);
  builder.landmark(x, 2, surfaceZ, `mythic-surface-threshold:${definition.id}`);
}

/** Adds the approach-readable landmark shape which distinguishes each site. */
function addMythicApproachSilhouette(builder: AdventurePlanBuilder, definition: MythicFrontierSiteDefinition, material: MythicMaterialPlan, centers: readonly MythicRoomCenter[], baseY: number) {
  const first = centers[0]; const last = centers[centers.length - 1];
  const column = (x: number, z: number, fromY: number, toY: number, block: BlockId = material.support, variant = "silhouette-column") => builder.fill(x, fromY, z, x, toY, z, block, `${definition.id}-${variant}`);
  const ring = (cx: number, y: number, cz: number, radius: number, block: BlockId = material.shell, variant = "silhouette-ring") => {
    const seen = new Set<string>();
    for (let step = 0; step < radius * 12; step += 1) {
      const angle = step / (radius * 12) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(angle) * radius); const z = Math.round(cz + Math.sin(angle) * radius);
      const key = `${x},${z}`; if (seen.has(key)) continue; seen.add(key); builder.set(x, y, z, block, `${definition.id}-${variant}`);
    }
  };
  switch (definition.id) {
    case "road-quiet-bells": {
      for (let z = first[2] - 18; z <= last[2] + 18; z += 2) builder.set(0, baseY - 1, z, material.shell, `${definition.id}-broken-processional`);
      for (const archZ of [first[2] - 8, 0, last[2] + 8]) {
        column(-3, archZ, baseY, baseY + 5); column(3, archZ, baseY, baseY + 5);
        builder.fill(-3, baseY + 5, archZ, 3, baseY + 5, archZ, material.shell, `${definition.id}-shade-arch`);
        builder.fill(0, baseY + 3, archZ, 0, baseY + 4, archZ, material.accent, `${definition.id}-quiet-bell`);
      }
      builder.landmark(0, baseY + 4, first[2] - 8, `mythic-silhouette:${definition.id}:three-bell-processional`);
      break;
    }
    case "cloudwhale-graveyard": {
      for (const [rib, ribZ] of [-10, 0, 10].entries()) for (let x = -7; x <= 7; x += 1) {
        const height = Math.round(Math.sqrt(Math.max(0, 49 - x * x)) * (1 + rib * .08));
        builder.set(x, baseY + height, ribZ, rib === 1 ? material.accent : material.shell, `${definition.id}-mineral-rib-arc`);
        if (x % 3 === 0) builder.set(x, baseY + height - 1, ribZ, material.support, `${definition.id}-rib-root`);
      }
      builder.landmark(0, baseY + 8, 0, `mythic-silhouette:${definition.id}:three-aerolith-ribs`);
      break;
    }
    case "mirrorfen-processional": {
      for (let z = first[2] - 10; z <= last[2] + 10; z += 1) {
        const x = Math.round(Math.sin(z / 5) * 5);
        builder.set(x, baseY - 1, z, material.shell, `${definition.id}-s-lane-step`);
        if (z % 7 === 0) { column(x - 3, z, baseY, baseY + 4); builder.set(x - 3, baseY + 4, z, material.accent, `${definition.id}-reed-lantern`); }
      }
      builder.landmark(0, baseY + 2, first[2] - 10, `mythic-silhouette:${definition.id}:s-processional`);
      break;
    }
    case "emberglass-hatchery": {
      ring(0, 0, 0, 11, material.shell, "nursery-terrace"); ring(0, -1, 0, 14, material.shell, "collapsed-terrace");
      for (const [x, z] of [[-8, -6], [8, -6], [-8, 6], [8, 6]] as const) { column(x, z, -1, 4); builder.set(x, 5, z, material.accent, `${definition.id}-steam-shutter`); }
      for (let tablet = -3; tablet <= 3; tablet += 1) builder.set(tablet, 1, 11, material.accent, `${definition.id}-heat-cycle-inset`);
      builder.landmark(0, 1, 11, `mythic-silhouette:${definition.id}:ringed-ash-nursery`);
      break;
    }
    case "drowned-moon-gate": {
      for (let height = 0; height <= 24; height += 1) {
        const lean = Math.floor(height / 6);
        builder.set(-9 + lean, baseY - 2 + height, first[2] - 5, height % 4 === 0 ? material.accent : material.shell, `${definition.id}-tilted-nacre-arch`);
        builder.set(9 + lean, baseY - 2 + height, first[2] - 5, height % 4 === 0 ? material.accent : material.shell, `${definition.id}-tilted-nacre-arch`);
      }
      for (let x = -5; x <= 13; x += 1) builder.set(x, baseY + 22 + Math.round(3 * Math.cos((x + 5) / 18 * Math.PI)), first[2] - 5, material.shell, `${definition.id}-moon-arch-crown`);
      builder.landmark(2, baseY + 16, first[2] - 5, `mythic-silhouette:${definition.id}:tilted-moon-arch`);
      break;
    }
    case "titans-kettle": {
      ring(0, baseY - 1, 0, 13, material.shell, "glacial-cirque"); ring(0, baseY - 1, 0, 10, material.shell, "frozen-kettle-lip");
      builder.fill(-4, baseY - 1, -4, 4, baseY - 1, 4, BlockId.Ice, `${definition.id}-kettle-lake`);
      for (const [x, z] of [[-10, -6], [10, -6], [-10, 6], [10, 6]] as const) column(x, z, baseY, baseY + 5);
      builder.landmark(0, baseY + 1, -13, `mythic-silhouette:${definition.id}:cirque-and-kettle`);
      break;
    }
    case "root-crown-menagerie": {
      ring(0, baseY - 1, 0, 11, material.shell, "observation-court");
      for (const [x, z] of [[-8, -5], [8, -5], [-8, 5], [8, 5]] as const) { column(x, z, baseY, baseY + 7); builder.fill(Math.min(0, x), baseY + 7, z, Math.max(0, x), baseY + 7, z, material.support, `${definition.id}-root-crown`); }
      builder.fill(-3, baseY - 2, -3, 3, baseY - 1, 3, BlockId.Air, `${definition.id}-living-sinkhole`);
      builder.landmark(0, baseY + 5, 0, `mythic-silhouette:${definition.id}:root-crown-court`);
      break;
    }
    case "fossil-orchard": {
      for (const [x, z, height] of [[-9, -8, 8], [8, -7, 6], [-10, 3, 7], [9, 5, 9], [0, 9, 7]] as const) {
        column(x, z, baseY, baseY + height, material.support, "calcified-root-column");
        for (let step = 0; step <= height * 2; step += 1) builder.set(x + Math.round(Math.cos(step * .9) * 2), baseY + Math.floor(step / 2), z + Math.round(Math.sin(step * .9) * 2), material.shell, `${definition.id}-upright-fossil-spiral`);
      }
      for (let seam = -4; seam <= 4; seam += 1) builder.set(seam, baseY, 10, material.accent, `${definition.id}-growth-ring-seam`);
      builder.landmark(0, baseY + 5, 9, `mythic-silhouette:${definition.id}:fossil-spiral-orchard`);
      break;
    }
    case "lanternroot-cistern": {
      for (const radius of [12, 9, 6]) ring(0, baseY - 1 + (12 - radius) / 3, 0, radius, radius === 9 ? material.support : material.shell, "stepped-root-basin");
      for (const gateZ of [-9, 0, 9]) { column(-5, gateZ, baseY, baseY + 4); column(5, gateZ, baseY, baseY + 4); builder.fill(-5, baseY + 4, gateZ, 5, baseY + 4, gateZ, material.shell, `${definition.id}-overflow-gate`); }
      for (const gateZ of [-9, 0, 9]) for (const x of [-3, 0, 3]) builder.set(x, baseY + 3, gateZ, material.accent, `${definition.id}-overflow-depth-mark`);
      builder.landmark(0, baseY + 2, -12, `mythic-silhouette:${definition.id}:three-overflow-gates`);
      break;
    }
    case "tideclock-wreck": {
      ring(0, baseY - 1, 0, 13, material.shell, "navigation-ring"); ring(0, baseY - 1, 0, 9, material.shell, "wreck-ring");
      builder.fill(0, baseY, 0, 0, baseY + 8, 0, material.support, `${definition.id}-navigation-pivot`);
      for (let arm = 0; arm <= 10; arm += 1) builder.set(arm, baseY + 8 - Math.floor(arm / 4), 0, arm > 7 ? material.shell : material.accent, `${definition.id}-broken-navigation-arm`);
      builder.landmark(0, baseY + 7, 0, `mythic-silhouette:${definition.id}:ring-and-broken-arm`);
      break;
    }
    case "palace-nine-winds": {
      for (let index = 0; index < centers.length; index += 1) {
        const [x, y, z] = centers[index]; column(x + (index % 2 ? -5 : 5), z, y, y + 6, material.support, "wind-banner-mast");
        builder.fill(x + (index % 2 ? -5 : 5), y + 5, z, x + (index % 2 ? -3 : 7), y + 6, z, material.accent, `${definition.id}-direction-banner-${index + 1}`);
      }
      builder.landmark(last[0], last[1] + 7, last[2], `mythic-silhouette:${definition.id}:nine-wind-crown`);
      break;
    }
    case "gorgon-quarry": {
      for (const [x, z, height] of [[-9, -10, 5], [9, -8, 4], [-11, 1, 6], [10, 4, 5], [-5, 10, 4]] as const) { column(x, z, baseY, baseY + height, material.support, "quarry-statue"); builder.set(x, baseY + height + 1, z, material.accent, `${definition.id}-sableglass-cocoon`); }
      builder.fill(-13, baseY - 1, -13, -8, baseY - 1, 13, material.shell, `${definition.id}-switchback-cut`);
      builder.landmark(-10, baseY + 3, -10, `mythic-silhouette:${definition.id}:statue-switchback`);
      break;
    }
    case "sunken-court-namarra": {
      for (const x of [-11, 11]) column(x, 0, baseY - 1, baseY + 10, material.support, "pearl-court-pylon");
      for (let x = -11; x <= 11; x += 1) builder.set(x, baseY + 10 + Math.round(Math.sin((x + 11) / 22 * Math.PI) * 3), 0, material.shell, `${definition.id}-current-gate`);
      for (const gardenX of [-6, 6]) {
        for (const [dx, dz] of [[-1, -2], [1, -2], [-1, 2], [1, 2]] as const) column(gardenX + dx, dz, baseY + 2, baseY + 6, material.support, "air-garden-frame");
        for (const dz of [-2, 0, 2]) builder.set(gardenX, baseY + 5, dz, material.accent, `${definition.id}-air-garden-lantern`);
      }
      builder.landmark(0, baseY + 9, 0, `mythic-silhouette:${definition.id}:pearl-current-gate`);
      break;
    }
    case "ashen-library-salamander-kings": {
      for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3]] as const) column(x, z, baseY + 5, 10, material.support, "chimney-buttress");
      for (let edge = -3; edge <= 3; edge += 1) { builder.set(edge, 10, -3, material.accent, `${definition.id}-chimney-crown`); builder.set(edge, 10, 3, material.accent, `${definition.id}-chimney-crown`); builder.set(-3, 10, edge, material.accent, `${definition.id}-chimney-crown`); builder.set(3, 10, edge, material.accent, `${definition.id}-chimney-crown`); }
      for (const shelfZ of [-8, -4, 4, 8]) { builder.fill(-8, baseY, shelfZ, -5, baseY + 2, shelfZ, material.shell, `${definition.id}-archive-stack-wing`); builder.fill(5, baseY, shelfZ, 8, baseY + 2, shelfZ, material.shell, `${definition.id}-archive-stack-wing`); }
      builder.landmark(0, 9, 0, `mythic-silhouette:${definition.id}:crowned-archive-chimney`);
      break;
    }
    case "hollow-moon-menagerie": {
      ring(0, baseY - 1, 0, 14, material.support, "sleeping-root-crown");
      for (let habitat = 0; habitat < 6; habitat += 1) {
        const angle = habitat / 6 * Math.PI * 2; const x = Math.round(Math.cos(angle) * 10); const z = Math.round(Math.sin(angle) * 10);
        column(x, z, baseY, baseY + 5, material.shell, `memory-pillar-${habitat + 1}`); builder.set(x, baseY + 5, z, material.accent, `${definition.id}-memory-emblem-${habitat + 1}`);
      }
      builder.landmark(0, baseY + 3, -14, `mythic-silhouette:${definition.id}:six-memory-crown`);
      break;
    }
  }
}

function planMythicFrontierPoi(kind: (typeof MYTHIC_POI_KINDS)[number], origin: WorldPosition, seed: string | number) {
  const definition = mythicSiteForStructure(kind);
  const material = mythicMaterial(definition);
  const builder = new AdventurePlanBuilder(origin, seed);
  const baseY = definition.layer === "sky" ? 14 : definition.layer === "underwater" ? -12 : definition.layer === "underground" ? -15 : 1;
  const centers: Array<readonly [number, number, number]> = [];
  const floodedRooms = floodedMythicRoomIndices(definition, definition.minimumRooms);
  for (let index = 0; index < definition.minimumRooms; index += 1) {
    const center: readonly [number, number, number] = [index % 2 ? 4 : -4, baseY + (definition.layer === "sky" ? index * 2 : 0), (index - (definition.minimumRooms - 1) / 2) * 8];
    centers.push(center);
    builder.hollow(center[0], center[1], center[2], 4, 4, 4, material.shell, material.shell, `${definition.id}-${material.variants[index % material.variants.length]}`);
    builder.room(`room-${index + 1}`, mythicRoomName(definition, index), index + 1, center, [4, 4, 4], index === definition.minimumRooms - 1 ? `Meet ${MOB_DEFS_NAME(definition.creature)} on the site's nonlethal terms.` : "Restore this chamber and read its ecological route.");
    decorateMythicRoom(builder, definition, center, index);
    if (index > 0) {
      const prior = centers[index - 1];
      connectMythicRooms(builder, definition, material, prior, center, index, floodedRooms.has(index - 1), floodedRooms.has(index));
    }
  }
  if (definition.layer === "underground") addUndergroundPoiAccess(builder, definition, material, centers[0]);
  if (definition.id === "cloudwhale-graveyard") {
    const entrance = centers[0];
    connectMythicRooms(builder, definition, material, [entrance[0], 1, entrance[2] + 20], [entrance[0], entrance[1], entrance[2] + 4], 0, false, false);
    builder.landmark(entrance[0], 2, entrance[2] + 20, `mythic-surface-threshold:${definition.id}`);
  }
  addMythicApproachSilhouette(builder, definition, material, centers, baseY);
  // Passages are carved after room dressing. Reassert the intentionally sparse
  // ecological centers so a rising connector cannot turn a luminous habitat
  // into an ordinary dark junction.
  centers.forEach(([x, y, z], index) => builder.set(x + 3, y + 3, z, material.exceptional, `${definition.id}-${material.variants[index % material.variants.length]}-ecology-light`));
  for (let flooded = 0; flooded < definition.explicitFloodedRooms; flooded += 1) {
    const [x, y, z] = centers[flooded];
    builder.fill(x - 3, y, z - 3, x + 3, y + 2, z + 3, BlockId.Water, `${definition.id}-explicit-flooded-room-${flooded + 1}`);
  }
  const entrance = centers[0];
  const resident = centers[centers.length - 1];
  builder.landmark(entrance[0], entrance[1] + 2, entrance[2] + 4, `adventure-poi:${kind}`);
  builder.landmark(entrance[0], entrance[1] + 1, entrance[2] + 4, `mythic-entrance:${definition.id}`);
  builder.landmark(resident[0], resident[1] + 1, resident[2], `mythic-loot:${definition.id}`);
  builder.spawn(resident[0], resident[1] + 1, resident[2], definition.creature, 1, 10, `${definition.id}-resident`, ["mythic-frontier", `legendary:${definition.encounterId}`, `legendary-site:mythic:${definition.id}:${origin.x},${origin.z}`, "nonlethal", "persistent-lair"]);
  builder.chest(entrance[0] - 2, entrance[1], entrance[2] - 2, "adventure-cache", `${definition.id}-expedition-cache`, 6);
  builder.plannedChest(resident[0] - 2, resident[1], resident[2] + 2, `${definition.id}-signature-cache`, rollMythicSiteLoot(definition.id, `${seed}:${origin.x},${origin.z}:signature`, 11).loot);
  return builder.plan(kind);
}

function MOB_DEFS_NAME(kind: string) {
  return kind.split("-").map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" ");
}

function mythicEcologyKinds(definition: MythicFrontierSiteDefinition): readonly [string, string, string] {
  if (definition.material === "nacre-tidework") return ["reefmender-shrimp", "currentweaver-eel", "reefmender-shrimp"];
  if (definition.material === "windworn-alabaster") return ["chimewing", "stormglass-roclet", "chimewing"];
  if (definition.material === "fossilroot-calcite") return ["fossilback-trilobite", "veinling", "fossilback-trilobite"];
  if (definition.material === "emberglass-archive") return ["kilnscale-salamander", "cinder-kite", "kilnscale-salamander"];
  if (definition.material === "mirrorpeat-reedglass") return ["mirecrown-crane", "currentweaver-eel", "mossling"];
  return ["sporeback-gardener", "mossling", "sporeback-gardener"];
}

function planMythicFrontierDungeon(kind: (typeof MYTHIC_DUNGEON_KINDS)[number], origin: WorldPosition, seed: string | number) {
  const definition = mythicSiteForStructure(kind);
  const material = mythicMaterial(definition);
  const builder = new AdventurePlanBuilder(origin, seed);
  const underwater = definition.layer === "underwater";
  const underground = definition.layer === "underground";
  const baseY = underwater ? -16 : underground ? -16 : 2;
  const centers: Array<readonly [number, number, number]> = [];
  const floodedRooms = floodedMythicRoomIndices(definition, definition.minimumRooms);
  for (let index = 0; index < definition.minimumRooms; index += 1) {
    const angle = index / Math.max(1, definition.minimumRooms - (kind === "gorgon-quarry" || kind === "hollow-moon-menagerie" ? 0 : 1)) * Math.PI * (kind === "gorgon-quarry" || kind === "hollow-moon-menagerie" ? 2 : 1.25);
    const radius = kind === "palace-of-nine-winds" ? 7 + index * 1.1 : 12;
    const center: readonly [number, number, number] = kind === "palace-of-nine-winds"
      ? [Math.round(Math.sin(angle) * radius), baseY + index * 3, Math.round(Math.cos(angle) * radius)]
      : [Math.round(Math.sin(angle) * radius), baseY + (kind === "ashen-library-of-salamander-kings" ? Math.floor(index / 2) : 0), Math.round(Math.cos(angle) * radius)];
    centers.push(center);
    builder.hollow(center[0], center[1], center[2], 4, 4, 4, material.shell, material.shell, `${definition.id}-${material.variants[index % material.variants.length]}`);
    builder.room(`stage-${index + 1}`, mythicRoomName(definition, index), index + 1, center, [4, 4, 4], index === definition.minimumRooms - 1 ? `Resolve the final encounter with ${MOB_DEFS_NAME(definition.creature)}.` : "Complete the chamber's restoration, traversal, or knowledge objective.");
    decorateMythicRoom(builder, definition, center, index);
    if (index > 0) {
      const prior = centers[index - 1];
      connectMythicRooms(builder, definition, material, prior, center, index, floodedRooms.has(index - 1), floodedRooms.has(index));
    }
  }
  if (kind === "gorgon-quarry" || kind === "hollow-moon-menagerie") {
    const first = centers[0]; const last = centers[centers.length - 1];
    builder.fill(Math.min(first[0], last[0]), baseY, first[2] - 1, Math.max(first[0], last[0]), baseY + 2, first[2] + 1, BlockId.Air, `${definition.id}-loop-return-x`);
    builder.fill(last[0] - 1, baseY, Math.min(first[2], last[2]), last[0] + 1, baseY + 2, Math.max(first[2], last[2]), BlockId.Air, `${definition.id}-loop-return-z`);
    builder.fill(Math.min(first[0], last[0]), baseY - 1, first[2] - 1, Math.max(first[0], last[0]), baseY - 1, first[2] + 1, material.shell, `${definition.id}-loop-tread-x`);
    builder.fill(last[0] - 1, baseY - 1, Math.min(first[2], last[2]), last[0] + 1, baseY - 1, Math.max(first[2], last[2]), material.shell, `${definition.id}-loop-tread-z`);
    builder.fill(Math.min(first[0], last[0]), baseY - 1, first[2], Math.max(first[0], last[0]), baseY - 1, first[2], material.accent, `${definition.id}-loop-wayfinding-inset`);
    builder.fill(last[0], baseY - 1, Math.min(first[2], last[2]), last[0], baseY - 1, Math.max(first[2], last[2]), material.accent, `${definition.id}-loop-wayfinding-inset`);
  }
  if (underground) {
    // A roofed surface threshold and a bounded spiral stair make every dry
    // underground dungeon a real two-way destination instead of an isolated
    // cavern. The stair terminates inside the first authored room at y=-17.
    builder.fill(-2, 0, 10, 2, 2, 14, material.shell, `${definition.id}-surface-threshold`);
    builder.fill(-1, 1, 11, 1, 2, 13, BlockId.Air, `${definition.id}-surface-doorway`);
    for (let depth = -1; depth >= baseY; depth -= 1) {
      builder.fill(-2, depth, 10, 2, depth, 14, material.shell, `${definition.id}-shaft-shell`);
      builder.fill(-1, depth, 11, 1, depth, 13, BlockId.Air, `${definition.id}-shaft-air`);
      if (depth % 4 === 0) builder.set(depth % 2 ? -2 : 2, depth, 12, material.accent, `${definition.id}-shaft-marker`);
    }
    const stairRing: Array<readonly [number, number]> = [];
    for (let x = -3; x <= 3; x += 1) stairRing.push([x, 9]);
    for (let z = 10; z <= 15; z += 1) stairRing.push([3, z]);
    for (let x = 2; x >= -3; x -= 1) stairRing.push([x, 15]);
    for (let z = 14; z >= 10; z -= 1) stairRing.push([-3, z]);
    for (let step = 0; step <= 17; step += 1) {
      const [stairX, stairZ] = stairRing[step];
      builder.set(stairX, -step, stairZ, material.shell, `${definition.id}-stair-step-${step}`);
      builder.set(stairX, -step + 1, stairZ, BlockId.Air, `${definition.id}-stair-headroom`);
      builder.set(stairX, -step + 2, stairZ, BlockId.Air, `${definition.id}-stair-headroom`);
    }
    builder.fill(2, baseY, 11, 2, baseY + 2, 13, BlockId.Air, `${definition.id}-shaft-room-opening`);
    builder.fill(-3, baseY, 14, -1, baseY + 2, 14, BlockId.Air, `${definition.id}-stair-threshold-door`);
    builder.set(0, baseY, 16, BlockId.WroughtIronDoorClosedLower, `${definition.id}-wrought-threshold-door`);
    builder.set(0, baseY + 1, 16, BlockId.WroughtIronDoorClosedUpper, `${definition.id}-wrought-threshold-door`);
  }
  addMythicApproachSilhouette(builder, definition, material, centers, baseY);
  centers.forEach(([x, y, z], index) => builder.set(x + 3, y + 3, z, material.exceptional, `${definition.id}-${material.variants[index % material.variants.length]}-ecology-light`));
  for (const flooded of floodedRooms) {
    const [x, y, z] = centers[flooded];
    builder.fill(x - 3, y, z - 3, x + 3, y + 2, z + 3, BlockId.Water, `${definition.id}-explicit-flooded-room-${flooded + 1}`);
  }
  if (kind === "sunken-court-of-namarra") {
    for (const gardenIndex of [5, 6]) {
      const [x, y, z] = centers[gardenIndex];
      builder.fill(x - 3, y, z - 3, x + 3, y + 2, z + 3, BlockId.Air, `${definition.id}-sealed-air-garden-${gardenIndex - 4}`);
      builder.fill(x - 2, y, z - 2, x + 2, y, z + 2, BlockId.MoonfeltMycelium, `${definition.id}-air-garden-bed`);
    }
  }
  if (kind === "ashen-library-of-salamander-kings") {
    const [x, y, z] = centers[centers.length - 1];
    builder.fill(x - 1, y + 4, z - 1, x + 1, 0, z + 1, BlockId.EmberglassArchive, `${definition.id}-vented-chimney`);
    builder.fill(x, y + 4, z, x, 1, z, BlockId.Air, `${definition.id}-chimney-air`);
  }
  const entrance = centers[0]; const resident = centers[centers.length - 1];
  builder.landmark(entrance[0], entrance[1] + 2, entrance[2] + 4, `dungeon:${kind}`);
  builder.landmark(entrance[0], entrance[1] + 1, entrance[2] + 4, `mythic-threshold:${definition.id}`);
  builder.landmark(resident[0], resident[1] + 1, resident[2], `mythic-loot:${definition.id}`);
  builder.spawn(resident[0], resident[1] + 1, resident[2], definition.creature, 1, 12, `${definition.id}-resident`, ["mythic-frontier", `legendary:${definition.encounterId}`, `legendary-site:mythic:${definition.id}:${origin.x},${origin.z}`, "boss", "nonlethal", "persistent-lair"]);
  const proxy = centers[Math.floor(centers.length / 2)];
  builder.landmark(proxy[0], proxy[1] + 2, proxy[2], `mythic-proxy:${definition.id}`);
  mythicEcologyKinds(definition).forEach((mobKind, index) => {
    const chamber = centers[Math.min(centers.length - 2, 1 + index * 2)];
    builder.spawn(chamber[0] + (index - 1) * 2, chamber[1] + 1, chamber[2], mobKind, index === 1 ? 2 : 3, 6, `${definition.id}-ecology-${index + 1}`, ["mythic-frontier", "ecology", `stage-${Math.min(centers.length - 1, 2 + index * 2)}`]);
  });
  builder.chest(entrance[0] - 2, entrance[1], entrance[2] - 2, "adventure-cache", `${definition.id}-supplies`, 6);
  builder.plannedChest(resident[0] - 2, resident[1], resident[2] + 2, `${definition.id}-signature-reward`, rollMythicSiteLoot(definition.id, `${seed}:${origin.x},${origin.z}:signature`, 11).loot);
  return builder.plan(kind);
}

export function planAdventureStructure(kind: AdventureStructureKind, origin: WorldPosition, seed: string | number): AdventureStructurePlan {
  const normalized = { x: Math.round(origin.x), y: Math.round(origin.y), z: Math.round(origin.z) };
  if ((MYTHIC_DUNGEON_KINDS as readonly AdventureStructureKind[]).includes(kind)) return planMythicFrontierDungeon(kind as (typeof MYTHIC_DUNGEON_KINDS)[number], normalized, seed);
  if ((MYTHIC_POI_KINDS as readonly AdventureStructureKind[]).includes(kind)) return planMythicFrontierPoi(kind as (typeof MYTHIC_POI_KINDS)[number], normalized, seed);
  if ((ADVENTURE_DUNGEON_ARCHETYPES as readonly AdventureArchetype[]).some((entry) => entry.kind === kind)) {
    if (kind === "stormglass-citadel") return planStormglassCitadel(normalized, seed);
    if (kind === "bloomrot-cathedral") return planBloomrotCathedral(normalized, seed);
    return planUndergroundDungeon(kind as AdventureDungeonKind, normalized, seed);
  }
  if ((V135_WAYPOST_KINDS as readonly AdventurePoiKind[]).includes(kind as AdventurePoiKind)) return planWaypostPoi(kind as WaypostKind, normalized, seed);
  if (kind === "whistlekite-roost" || kind === "clockwork-burrow") return planV135CreaturePoi(kind, normalized, seed);
  const scale = ADVENTURE_POI_ARCHETYPES.find((entry) => entry.kind === kind)?.scale;
  if (scale === "tiny") return planTinyPoi(kind as AdventurePoiKind, normalized, seed);
  if (scale === "medium") return planMediumPoi(kind as AdventurePoiKind, normalized, seed);
  return planLargePoi(kind as AdventurePoiKind, normalized, seed);
}

const floorDiv = (value: number, divisor: number) => Math.floor(value / divisor);

function candidateForChunk<T extends AdventureArchetype>(input: Readonly<{ seed: string | number; chunkX: number; chunkZ: number; biome: AdventureBiome; regionSize: number; salt: string; catalogue: readonly T[] }>) {
  const regionX = floorDiv(input.chunkX, input.regionSize);
  const regionZ = floorDiv(input.chunkZ, input.regionSize);
  const localX = Math.floor(hashUnit(input.seed, `${input.salt}:${regionX},${regionZ}:x`) * input.regionSize);
  const localZ = Math.floor(hashUnit(input.seed, `${input.salt}:${regionX},${regionZ}:z`) * input.regionSize);
  if (input.chunkX !== regionX * input.regionSize + localX || input.chunkZ !== regionZ * input.regionSize + localZ) return undefined;
  const eligible = input.catalogue.filter((entry) => entry.biomes.includes(input.biome));
  if (!eligible.length) return undefined;
  return eligible[Math.floor(hashUnit(input.seed, `${input.salt}:${regionX},${regionZ}:kind`) * eligible.length)]?.kind;
}

/** Roughly one authored POI per 12x12 chunk region, separate from legacy landmarks. */
export function adventurePoiCandidateForChunk(input: Readonly<{ seed: string | number; chunkX: number; chunkZ: number; biome: AdventureBiome }>) {
  return candidateForChunk({ ...input, regionSize: 12, salt: "v13-poi", catalogue: ADVENTURE_POI_ARCHETYPES }) as AdventurePoiKind | undefined;
}

/** Rare, bounded dungeon candidate: roughly one per 36x36 chunk region. */
export function adventureDungeonCandidateForChunk(input: Readonly<{ seed: string | number; chunkX: number; chunkZ: number; biome: AdventureBiome }>) {
  return candidateForChunk({ ...input, regionSize: 36, salt: "v13-dungeon", catalogue: ADVENTURE_DUNGEON_ARCHETYPES }) as AdventureDungeonKind | undefined;
}

export const adventurePlacementsForChunk = (plan: AdventureStructurePlan, chunkX: number, chunkZ: number, chunkSize = 16) => plan.placements.filter((placement) =>
  Math.floor(placement.x / chunkSize) === chunkX && Math.floor(placement.z / chunkSize) === chunkZ);

export const adventureMarkersForChunk = (plan: AdventureStructurePlan, chunkX: number, chunkZ: number, chunkSize = 16) => plan.markers.filter((marker) =>
  Math.floor(marker.position.x / chunkSize) === chunkX && Math.floor(marker.position.z / chunkSize) === chunkZ);

export function adventureClearanceBounds(plan: AdventureStructurePlan, margin = 3) {
  const padding = Math.max(0, Math.min(8, Math.floor(margin)));
  return { minX: plan.bounds.min.x - padding, maxX: plan.bounds.max.x + padding, minZ: plan.bounds.min.z - padding, maxZ: plan.bounds.max.z + padding } as const;
}
