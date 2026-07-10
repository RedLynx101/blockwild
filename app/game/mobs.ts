import { Item, type ItemCode } from "./data";

export type MobKind = "mossling" | "ridgeback" | "woolhorn" | "glowmoth" | "shadecrawler" | "caveblob" | "rattlekin";
export type MobTemperament = "Gentle" | "Skittish" | "Defensive" | "Hostile";

export type MobDrop = {
  item: ItemCode;
  min: number;
  max: number;
  chance: number;
};

export type MobDefinition = {
  kind: MobKind;
  name: string;
  temperament: MobTemperament;
  hostile: boolean;
  health: number;
  damage: number;
  xp: number;
  speed: number;
  chaseSpeed: number;
  turnRate: number;
  attackRange: number;
  footOffset: number;
  radius: number;
  height: number;
  habitat: string;
  active: string;
  behavior: string;
  lore: string;
  colors: [number, number, number];
  drops: MobDrop[];
};

export const MOB_DEFS: Record<MobKind, MobDefinition> = {
  mossling: {
    kind: "mossling", name: "Mossling", temperament: "Skittish", hostile: false,
    health: 5, damage: 0, xp: 2, speed: 0.72, chaseSpeed: 1.9, turnRate: 6, attackRange: 0,
    footOffset: 0.42, radius: 0.36, height: 0.82, habitat: "Wet forests, Bloomwood and Siltfen", active: "Day and rain",
    behavior: "Forages in short hops, gathers near flowers, and bounds away when struck.",
    lore: "A walking knot of moss and root. Old trailkeepers say every grove begins with one curious Mossling.",
    colors: [0x4f8a43, 0x9bc878, 0x172517],
    drops: [{ item: Item.Fiber, min: 1, max: 2, chance: 0.9 }, { item: Item.Berry, min: 1, max: 1, chance: 0.3 }],
  },
  ridgeback: {
    kind: "ridgeback", name: "Ridgeback", temperament: "Defensive", hostile: false,
    health: 10, damage: 2, xp: 3, speed: 0.52, chaseSpeed: 2.8, turnRate: 4.2, attackRange: 1.35,
    footOffset: 0.64, radius: 0.62, height: 1.05, habitat: "Meadows, savannas and open woodland", active: "Day",
    behavior: "Travels in loose herds. Usually calm, but an injured Ridgeback lowers its plated head and charges.",
    lore: "Its warm stone plates store the afternoon sun. A charging herd sounds like distant summer thunder.",
    colors: [0x875437, 0xc07d54, 0x291912],
    drops: [{ item: Item.RawMeat, min: 1, max: 3, chance: 1 }, { item: Item.Hide, min: 1, max: 2, chance: 0.62 }],
  },
  woolhorn: {
    kind: "woolhorn", name: "Woolhorn", temperament: "Gentle", hostile: false,
    health: 9, damage: 1, xp: 3, speed: 0.42, chaseSpeed: 1.55, turnRate: 3.8, attackRange: 1.1,
    footOffset: 0.63, radius: 0.52, height: 1.18, habitat: "Frostpine taiga and snowy fields", active: "Day",
    behavior: "Grazes through snow, follows nearby Woolhorns, and braces behind its curled horns when cornered.",
    lore: "Cloud-soft wool hides a stubborn mountain heart. Their tracks are often the safest path through a blizzard.",
    colors: [0xe8e5d8, 0x756c61, 0x20211f],
    drops: [{ item: Item.Wool, min: 1, max: 2, chance: 1 }, { item: Item.RawMeat, min: 1, max: 1, chance: 0.58 }],
  },
  glowmoth: {
    kind: "glowmoth", name: "Glowmoth", temperament: "Gentle", hostile: false,
    health: 3, damage: 0, xp: 2, speed: 1.35, chaseSpeed: 1.8, turnRate: 7.5, attackRange: 0,
    footOffset: 1.8, radius: 0.38, height: 0.45, habitat: "Mooncap fen, flowers and torchlit caves", active: "Dusk and night",
    behavior: "Orbits flowers and warm light in looping flights. Its glow strengthens in darkness.",
    lore: "A lantern with wings. Some ruins are only found by following their silent midnight spirals.",
    colors: [0x6b5030, 0xf4cc55, 0xfff2a8],
    drops: [{ item: Item.GlowDust, min: 1, max: 2, chance: 0.84 }],
  },
  shadecrawler: {
    kind: "shadecrawler", name: "Shadecrawler", temperament: "Hostile", hostile: true,
    health: 11, damage: 2, xp: 6, speed: 1.05, chaseSpeed: 2.55, turnRate: 8, attackRange: 1.45,
    footOffset: 0.32, radius: 0.7, height: 0.62, habitat: "Deep caves and moonless forests", active: "Darkness",
    behavior: "Circles just outside torchlight, then lunges. Bright daylight forces it back underground.",
    lore: "A many-legged absence between stones. Its eyes appear a moment before the rest of it decides to exist.",
    colors: [0x332b43, 0x725d8c, 0xff6e78],
    drops: [{ item: Item.ShadowShard, min: 1, max: 1, chance: 0.84 }, { item: Item.Coal, min: 1, max: 1, chance: 0.34 }],
  },
  caveblob: {
    kind: "caveblob", name: "Cave Blob", temperament: "Hostile", hostile: true,
    health: 7, damage: 1, xp: 4, speed: 0.55, chaseSpeed: 1.65, turnRate: 5, attackRange: 1.25,
    footOffset: 0.42, radius: 0.48, height: 0.82, habitat: "Aquifers and deepstone caverns", active: "Underground",
    behavior: "Squashes flat, springs forward, and splashes cave gel on impact.",
    lore: "Mineral-rich water learned to hop. Cave Blobs remember every boot that has ever stepped in their pools.",
    colors: [0x4ca47e, 0x8ee0b8, 0x15362b],
    drops: [{ item: Item.CaveGel, min: 1, max: 2, chance: 1 }],
  },
  rattlekin: {
    kind: "rattlekin", name: "Rattlekin", temperament: "Hostile", hostile: true,
    health: 13, damage: 3, xp: 7, speed: 0.8, chaseSpeed: 1.85, turnRate: 5.5, attackRange: 1.55,
    footOffset: 0.92, radius: 0.38, height: 1.78, habitat: "Ruins, badlands and the night surface", active: "Night",
    behavior: "Patrols upright, raises a stone club, then commits to a heavy timed swing.",
    lore: "Not bones, but stone remembering the shape of a traveler. The rhythm of its steps is older than the ruins.",
    colors: [0xd8cfb9, 0x807664, 0x2a2520],
    drops: [{ item: Item.BoneShard, min: 1, max: 2, chance: 1 }, { item: Item.Coal, min: 1, max: 1, chance: 0.2 }],
  },
};

export const MOB_ORDER: MobKind[] = ["mossling", "ridgeback", "woolhorn", "glowmoth", "shadecrawler", "caveblob", "rattlekin"];
