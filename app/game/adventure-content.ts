import { BlockId } from "./data";
import {
  rollStructureLoot,
  type PlannedBlock,
  type StructureLootTableId,
  type StructureMarker,
  type WorldPosition,
} from "./structures";

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
  | "saltwind-lighthouse";

export type AdventureDungeonKind =
  | "rootbound-labyrinth"
  | "starless-observatory"
  | "brassdeep-foundry"
  | "stormglass-citadel"
  | "bloomrot-cathedral";

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
]);

export const ADVENTURE_DUNGEON_ARCHETYPES: readonly AdventureArchetype[] = Object.freeze([
  { kind: "rootbound-labyrinth", name: "Rootbound Labyrinth", scale: "dungeon", biomes: ["forest", "swamp", "glimmerwood"], summary: "A three-stage buried sanctuary: root gate, whisper maze and heart vault.", materialIdentity: "moss, wildwood root and rune stone", lightingIdentity: "green-gold root lanterns", underground: true },
  { kind: "starless-observatory", name: "Starless Observatory", scale: "dungeon", biomes: ["highlands", "snow", "glimmerwood"], summary: "A buried lens hall descending through archive and astrolabe vault.", materialIdentity: "moon slate, glass and star crystal", lightingIdentity: "cold constellations in a black ceiling", underground: true },
  { kind: "brassdeep-foundry", name: "Brassdeep Foundry", scale: "dungeon", biomes: ["highlands", "desert", "volcanic"], summary: "A quenched industrial ruin with intake, assembly floor and master-vault.", materialIdentity: "deepgear brick, riveted brass and basalt", lightingIdentity: "amber furnace lines", underground: true },
  { kind: "stormglass-citadel", name: "Stormglass Citadel", scale: "dungeon", biomes: ["highlands", "snow"], summary: "An aboveground fortress climbing from gate court to storm lens crown.", materialIdentity: "snowcap stone, glass and crystal", lightingIdentity: "electric cyan battlements" },
  { kind: "bloomrot-cathedral", name: "Bloomrot Cathedral", scale: "dungeon", biomes: ["forest", "swamp", "meadow"], summary: "A ruined aboveground nave progressing through transept gardens to a sealed altar.", materialIdentity: "moss, rune stone and dark timber", lightingIdentity: "rose-gold altar lamps" },
]);

// Compile-time and runtime release guard: the contract says exactly 20 + 5.
if (ADVENTURE_POI_ARCHETYPES.length !== 20 || ADVENTURE_DUNGEON_ARCHETYPES.length !== 5) {
  throw new Error("The v1.3 adventure catalogue must contain exactly twenty POIs and five dungeons.");
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

  spawn(dx: number, dy: number, dz: number, mobKind: string, count: number, radius: number, id: string, tags: readonly string[]) {
    this.markers.push({ type: "spawn", id, position: { x: this.origin.x + dx, y: this.origin.y + dy, z: this.origin.z + dz }, mobKind, count, radius, persistent: true, tags });
  }

  landmark(dx: number, dy: number, dz: number, tag: string) {
    this.markers.push({ type: "landmark", id: "map-heart", position: { x: this.origin.x + dx, y: this.origin.y + dy, z: this.origin.z + dz }, tag });
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
    b.hollow(0, 1, 0, 6, 4, 6, BlockId.StoneBrick, BlockId.RuneStone, "observatory"); b.fill(-2, 4, -2, 2, 5, 2, BlockId.Glass, "lens-dome"); b.set(0, 2, 0, BlockId.CrystalBlock, "sky-lens"); b.chest(4, 1, 4, "adventure-cache", "observer-locker", 5); b.spawn(0, 3, 0, "vaultwing", 2, 4, "lens-roost", ["poi-resident", "hostile"]);
  } else if (kind === "overgrown-aqueduct") {
    for (const x of [-6,-2,2,6]) { b.fill(x,1,-2,x,5,2,BlockId.Cobblestone,"aqueduct-pier"); b.fill(x-1,4,-2,x+1,5,2,BlockId.Moss,"mossy-arch"); } b.fill(-7,6,-1,7,6,1,BlockId.Cobblestone,"water-channel"); b.fill(-6,7,0,6,7,0,BlockId.Water,"running-channel"); b.chest(0, 1, 3, "adventure-cache", "aqueduct-cache", 4);
  } else if (kind === "sunken-caravan") {
    for (const offset of [-5,0,5]) { b.fill(offset-2,1,-1,offset+2,2,2,BlockId.Planks,"tilted-wagon"); b.set(offset-2,1,3,BlockId.WildwoodLog,"wagon-wheel"); b.set(offset+2,1,3,BlockId.WildwoodLog,"wagon-wheel"); } b.set(0,3,0,BlockId.DeepgearLantern,"way-lantern"); b.chest(5, 2, 0, "adventure-cache", "caravan-strongbox", 6); b.spawn(-3,1,-2,"auric-scarab",4,6,"caravan-scavengers",["poi-resident","defensive"]);
  } else if (kind === "emberwatch-tower") {
    b.hollow(0,1,0,4,9,4,BlockId.Basalt,BlockId.RivetedBrass,"emberwatch"); for (const y of [2,5,8]) { b.set(-4,y,0,BlockId.Glowstone,"ember-window"); b.set(4,y,0,BlockId.Glowstone,"ember-window"); } b.chest(0, 8, 0, "adventure-cache", "watch-captain-cache", 6); b.spawn(0,1,0,"cinder-maw",2,4,"tower-hounds",["poi-guardian","hostile"]);
  } else if (kind === "pilgrim-bathhouse") {
    b.fill(-6,0,-5,6,0,5,BlockId.Limestone,"bath-floor"); b.fill(-4,0,-3,4,0,3,BlockId.Water,"spring-pool"); for (const x of [-6,6]) for (const z of [-5,5]) b.fill(x,1,z,x,4,z,BlockId.BirchLog,"bath-post"); b.fill(-6,4,-5,6,4,5,BlockId.Glass,"open-roof"); b.fill(-3,4,-2,3,4,2,BlockId.Air,"oculus"); b.set(-5,1,0,BlockId.Glowstone,"spring-light"); b.set(5,1,0,BlockId.Glowstone,"spring-light"); b.chest(0,1,5,"adventure-cache","pilgrim-locker",4);
  } else {
    for (const x of [-5,-3,-1,1,3,5]) { b.fill(x,1,0,x,5,0,BlockId.MoonboughLog,"harp-frame"); b.fill(x,2,0,x,4,0,BlockId.Glass,"harp-string"); } b.fill(-6,5,0,6,5,0,BlockId.MoonboughLog,"harp-arch"); for (const x of [-5,-1,3]) b.set(x,1,-2,BlockId.Moonpetal,"harp-light"); b.chest(0,1,4,"adventure-cache","harp-listener-cache",5); b.spawn(0,2,0,"vaultwing",2,5,"harp-vaultwings",["poi-resident","skittish"]);
  }
  b.landmark(0, 1, 0, `adventure-poi:${kind}`);
  return b.plan(kind);
}

function planLargePoi(kind: AdventurePoiKind, origin: WorldPosition, seed: string | number) {
  const b = new AdventurePlanBuilder(origin, seed);
  circularFloor(b, 12, kind === "saltwind-lighthouse" ? BlockId.Limestone : BlockId.Moss, `${kind}-grounds`);
  if (kind === "shattered-colossus") {
    b.fill(-8,1,-3,-2,6,3,BlockId.Deepstone,"colossus-head"); b.fill(-7,2,-4,-6,3,-4,BlockId.CrystalBlock,"eye-core"); b.fill(0,1,-2,10,3,2,BlockId.TempleSandstone,"fallen-arm"); for (const x of [2,5,8]) b.fill(x,4,-2,x,5,2,BlockId.Deepstone,"arm-joint"); b.chest(-4,2,0,"adventure-cache","colossus-memory",7); b.spawn(5,2,0,"ossuary-keeper",2,8,"colossus-keepers",["poi-guardian","hostile"]);
  } else if (kind === "wildwood-bridgehouse") {
    b.fill(-12,1,-3,12,1,3,BlockId.Planks,"covered-bridge-deck"); for (const x of [-12,-8,-4,0,4,8,12]) { b.fill(x,0,-3,x,5,-3,BlockId.WildwoodLog,"bridge-post"); b.fill(x,0,3,x,5,3,BlockId.WildwoodLog,"bridge-post"); if (x % 8 === 0) { b.set(x,3,-2,BlockId.Torch,"rail-lantern"); b.set(x,3,2,BlockId.Torch,"rail-lantern"); } } b.fill(-12,5,-3,12,5,3,BlockId.WildwoodLeaves,"bridge-roof"); b.hollow(0,2,0,4,3,3,BlockId.Planks,BlockId.Planks,"keeper-room"); b.chest(2,2,1,"adventure-cache","bridge-tollbox",6);
  } else if (kind === "starfall-amphitheater") {
    for (let ring = 11; ring >= 5; ring -= 2) for (let x = -ring; x <= ring; x += 1) for (let z = -ring; z <= ring; z += 1) if (Math.abs(Math.hypot(x,z)-ring) < 0.75 && z >= -2) b.set(x,Math.floor((11-ring)/2)+1,z,BlockId.Limestone,"amphitheater-tier"); b.fill(-5,1,-9,5,1,-4,BlockId.RuneStone,"star-stage"); b.fill(0,2,-7,0,5,-7,BlockId.CrystalBlock,"conductor-plinth"); for (const [x,z] of [[-8,0],[8,0],[-6,6],[6,6]] as const) b.set(x,2,z,BlockId.Glowstone,"aisle-star"); b.chest(0,2,-5,"adventure-cache","performer-cache",7); b.spawn(0,2,2,"bellroot-matron",1,8,"amphitheater-matron",["poi-resident","defensive"]);
  } else {
    b.hollow(0,1,0,6,13,6,BlockId.Limestone,BlockId.TempleSandstone,"lighthouse"); for (const y of [3,6,9]) for (const x of [-6,6]) b.set(x,y,0,BlockId.Glass,"salt-window"); b.fill(-7,13,-7,7,13,7,BlockId.StoneBrick,"beacon-gallery"); for (const x of [-6,6]) for (const z of [-6,6]) b.fill(x,14,z,x,17,z,BlockId.Glass,"beacon-pane"); b.fill(-6,17,-6,6,17,6,BlockId.StoneBrick,"beacon-roof"); b.set(0,15,0,BlockId.Glowstone,"saltwind-beacon"); b.set(-3,2,1,BlockId.WildwoodTable,"keeper-table"); b.set(-4,2,1,BlockId.HearthChair,"keeper-chair"); b.chest(3,2,2,"adventure-cache","keeper-sea-chest",7); b.spawn(0,14,0,"vaultwing",2,5,"beacon-roost",["poi-resident","skittish"]);
  }
  b.landmark(0, 2, 0, `adventure-poi:${kind}`);
  return b.plan(kind);
}

function dungeonProfile(kind: AdventureDungeonKind) {
  if (kind === "rootbound-labyrinth") return { shell: BlockId.Moss, floor: BlockId.RuneStone, light: BlockId.Glowstone, table: "rootbound-vault" as const, mobs: ["rootwrithe", "bellroot-matron", "rootwrithe"] as const };
  if (kind === "starless-observatory") return { shell: BlockId.MoonSlate, floor: BlockId.Deepstone, light: BlockId.CrystalBlock, table: "starless-vault" as const, mobs: ["vaultwing", "auric-scarab", "ossuary-keeper"] as const };
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
  const rooms = [
    { id: "threshold", name: kind === "rootbound-labyrinth" ? "Root Gate" : kind === "starless-observatory" ? "Lens Vestibule" : "Ore Intake", stage: 1, center: [0, base, 9] as const, radius: [6, 4, 5] as const, objective: "Survive the entrance encounter and find the descending passage." },
    { id: "crossing", name: kind === "rootbound-labyrinth" ? "Whisper Maze" : kind === "starless-observatory" ? "Constellation Archive" : "Assembly Floor", stage: 2, center: [0, base - 2, 0] as const, radius: [8, 5, 6] as const, objective: "Clear two linked encounter pockets and reach the sealed inner hall." },
    { id: "vault", name: kind === "rootbound-labyrinth" ? "Heartroot Reliquary" : kind === "starless-observatory" ? "Astrolabe Vault" : "Quenched Master-vault", stage: 3, center: [0, base - 4, -11] as const, radius: [7, 5, 5] as const, objective: "Defeat the guardian and claim the authored vault loot." },
  ];
  for (const room of rooms) {
    const [roomX, roomY, roomZ] = room.center;
    const [roomRadiusX, roomRadiusY, roomRadiusZ] = room.radius;
    b.hollow(roomX, roomY, roomZ, roomRadiusX, roomRadiusY, roomRadiusZ, profile.shell, profile.floor, `${kind}-${room.id}`);
    b.room(room.id, room.name, room.stage, room.center, room.radius, room.objective);
  }
  // Stepped inter-room connections make progression readable and navigable.
  b.fill(-2, base, 4, 2, base + 2, 7, BlockId.Air, `${kind}-first-passage`);
  b.fill(-2, base - 2, -7, 2, base, -4, BlockId.Air, `${kind}-vault-passage`);
  for (const [step, [stairZ, stairGroundY]] of [[7, base - 1], [6, base - 2], [5, base - 3]].entries()) {
    b.set(0, stairGroundY, stairZ, profile.floor, `${kind}-stage-1-2-tread-${step}`);
    b.set(0, stairGroundY + 1, stairZ, BlockId.Air, `${kind}-stage-transition-headroom`);
    b.set(0, stairGroundY + 2, stairZ, BlockId.Air, `${kind}-stage-transition-headroom`);
  }
  for (const [step, [stairZ, stairGroundY]] of [[-4, base - 3], [-5, base - 4], [-6, base - 5]].entries()) {
    b.set(0, stairGroundY, stairZ, profile.floor, `${kind}-stage-2-3-tread-${step}`);
    b.set(0, stairGroundY + 1, stairZ, BlockId.Air, `${kind}-stage-transition-headroom`);
    b.set(0, stairGroundY + 2, stairZ, BlockId.Air, `${kind}-stage-transition-headroom`);
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
  for (const [x, y, z] of [[-5,base,9],[5,base,9],[-6,base-2,0],[6,base-2,0],[-5,base-4,-11],[5,base-4,-11]] as const) b.set(x,y,z,profile.light,`${kind}-room-light`);
  b.spawn(-2, base, 9, profile.mobs[0], 3, 5, "threshold-encounter", ["dungeon", "stage-1", "hostile"]);
  b.spawn(3, base - 2, 0, profile.mobs[1], 4, 6, "crossing-encounter-a", ["dungeon", "stage-2", "hostile"]);
  b.spawn(-3, base - 2, -2, profile.mobs[0], 2, 5, "crossing-encounter-b", ["dungeon", "stage-2", "hostile"]);
  b.spawn(0, base - 4, -11, profile.mobs[2], kind === "rootbound-labyrinth" ? 1 : 2, 6, "vault-guardian", ["dungeon", "stage-3", "boss", "hostile"]);
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
  for (const x of [-7,7]) b.fill(x,1,-14,x,9,14,BlockId.Moss,"cathedral-wall"); for (const z of [-14,14]) b.fill(-7,1,z,7,9,z,BlockId.Moss,"cathedral-wall");
  for (const z of [-10,-4,2,8]) for (const x of [-6,6]) { b.fill(x,1,z,x,8,z,BlockId.WildwoodLog,"root-column"); b.set(x,6,z,BlockId.Glowstone,"rose-lamp"); }
  b.fill(-14,1,-5,-7,7,-5,BlockId.Moss,"transept-wall"); b.fill(7,1,5,14,7,5,BlockId.Moss,"transept-wall");
  b.fill(-2,1,-13,2,4,-10,BlockId.RuneStone,"sealed-altar"); b.set(0,5,-11,BlockId.CrystalBlock,"dawn-rose");
  b.room("nave","Overgrown Nave",1,[0,1,8],[7,8,6],"Advance between root columns while the nave pack presses from both aisles."); b.room("transept","Briar Transept",2,[0,1,0],[14,7,5],"Clear both garden wings to expose the altar approach."); b.room("altar","Dawn Rose Altar",3,[0,1,-10],[7,9,4],"Defeat the matron and open the reliquary under the rose.");
  b.spawn(0,1,9,"rootwrithe",4,7,"nave-roots",["dungeon","stage-1","hostile"]); b.spawn(-8,1,0,"cinder-maw",3,6,"west-transept-pack",["dungeon","stage-2","hostile"]); b.spawn(8,1,0,"vaultwing",4,6,"east-transept-roost",["dungeon","stage-2","hostile"]); b.spawn(0,1,-9,"bellroot-matron",1,7,"altar-matron",["dungeon","stage-3","boss","hostile"]);
  b.chest(-10,1,0,"adventure-cache","transept-cache",6); b.chest(0,2,-12,"bloomrot-vault","dawn-rose-reliquary",8); b.landmark(0,1,13,`dungeon:${kind}`);
  return b.plan(kind);
}

export function planAdventureStructure(kind: AdventureStructureKind, origin: WorldPosition, seed: string | number): AdventureStructurePlan {
  const normalized = { x: Math.round(origin.x), y: Math.round(origin.y), z: Math.round(origin.z) };
  if ((ADVENTURE_DUNGEON_ARCHETYPES as readonly AdventureArchetype[]).some((entry) => entry.kind === kind)) {
    if (kind === "stormglass-citadel") return planStormglassCitadel(normalized, seed);
    if (kind === "bloomrot-cathedral") return planBloomrotCathedral(normalized, seed);
    return planUndergroundDungeon(kind as AdventureDungeonKind, normalized, seed);
  }
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
