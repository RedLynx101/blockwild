//! Renderer-neutral deterministic planners for the post-v13 adventure catalogue.
//!
//! The TypeScript catalogue remains the compatibility oracle during R3.  This
//! module intentionally mirrors its stable regional candidate grid and emits
//! only world-space block and semantic-marker records.

use crate::contract::{BiomeId, Block, MarkerRow};
use std::collections::BTreeMap;

#[derive(Clone, Copy)]
struct LootEntry {
    item: &'static str,
    weight: u32,
    min: u32,
    max: u32,
    durability: Option<u32>,
}

#[derive(Clone)]
struct LootStack {
    item: &'static str,
    count: u32,
    durability: Option<u32>,
    chance: Option<f64>,
    min: u32,
    max: u32,
    weight: Option<u32>,
}

const fn loot(item: &'static str, weight: u32, min: u32, max: u32) -> LootEntry {
    LootEntry {
        item,
        weight,
        min,
        max,
        durability: None,
    }
}

const ADVENTURE_LOOT: &[LootEntry] = &[
    loot("bread", 20, 1, 3),
    loot("glow-dust", 16, 1, 4),
    loot("crystal-shard", 11, 1, 2),
    loot("gold-ingot", 8, 1, 2),
    loot("waykeeper-capture-orb", 8, 1, 1),
    loot("fiber", 20, 2, 7),
    loot("moonberry", 17, 2, 5),
];
const ROOTBOUND_LOOT: &[LootEntry] = &[
    loot("wildwood-planks", 16, 6, 14),
    loot("crystal-shard", 14, 2, 5),
    loot("glow-dust", 20, 3, 8),
    loot("gold-ingot", 14, 2, 5),
    loot("tome-healing-light", 8, 1, 1),
    loot("moonberry", 28, 3, 8),
];
const STARLESS_LOOT: &[LootEntry] = &[
    loot("crystal-shard", 24, 3, 7),
    loot("shadow-shard", 18, 2, 6),
    loot("glow-dust", 18, 3, 9),
    loot("gold-ingot", 14, 2, 5),
    loot("tome-arcane-ward", 13, 1, 1),
    loot("tome-starlight-snare", 13, 1, 1),
];
const BRASSDEEP_LOOT: &[LootEntry] = &[
    loot("iron-ingot", 24, 4, 10),
    loot("gold-ingot", 18, 3, 8),
    loot("gear-cluster", 22, 2, 7),
    loot("deepgear-alloy", 16, 2, 5),
    loot("tome-steel-spear", 10, 1, 1),
    loot("flintlock-ball", 10, 8, 20),
];
const STORMGLASS_LOOT: &[LootEntry] = &[
    loot("crystal-shard", 25, 4, 10),
    loot("gold-ingot", 19, 3, 7),
    loot("glow-dust", 19, 4, 10),
    loot("tome-blinkstep", 13, 1, 1),
    loot("tome-frost-lance", 12, 1, 1),
    loot("wayfarer-potion", 12, 1, 2),
];
const BLOOMROT_LOOT: &[LootEntry] = &[
    loot("moonberry", 22, 4, 10),
    loot("royal-jelly", 10, 1, 2),
    loot("crystal-shard", 14, 2, 5),
    loot("gold-ingot", 14, 2, 6),
    loot("tome-verdant-volley", 20, 1, 1),
    loot("tome-healing-light", 20, 1, 1),
];
const PALIMPSEST_LOOT: &[LootEntry] = &[
    loot("living-ink", 24, 3, 8),
    loot("storybook-brick", 18, 4, 12),
    loot("bound-book", 15, 1, 4),
    loot("shadow-shard", 13, 2, 6),
    loot("tome-blinkstep", 10, 1, 1),
    loot("tome-arcane-ward", 10, 1, 1),
    loot("gold-ingot", 10, 2, 6),
];

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum AdventureScale {
    Tiny,
    Medium,
    Large,
    Dungeon,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct AdventureKind {
    pub id: &'static str,
    pub scale: AdventureScale,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct AdventurePlacement {
    pub x: i32,
    pub y: i32,
    pub z: i32,
    pub block: u16,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct AdventurePlan {
    pub id: String,
    pub origin: (i32, i32, i32),
    pub bounds: (i32, i32, i32, i32),
    pub placements: Vec<AdventurePlacement>,
    pub markers: Vec<AdventureMarker>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct AdventureMarker {
    pub x: i32,
    pub z: i32,
    pub row: MarkerRow,
}

const POI_REGION_SIZE: i32 = 12;
const DUNGEON_REGION_SIZE: i32 = 36;

const fn kind(id: &'static str, scale: AdventureScale) -> AdventureKind {
    AdventureKind { id, scale }
}

const TINY: AdventureScale = AdventureScale::Tiny;
const MEDIUM: AdventureScale = AdventureScale::Medium;
const LARGE: AdventureScale = AdventureScale::Large;
const DUNGEON: AdventureScale = AdventureScale::Dungeon;

const COAST_POIS: &[AdventureKind] = &[
    kind("reedwatch-platform", TINY),
    kind("sunwash-tidepool", TINY),
    kind("saltwind-lighthouse", LARGE),
    kind("tideglass-embassy", MEDIUM),
    kind("drowned-moon-gate", LARGE),
    kind("tideclock-wreck", LARGE),
];
const MEADOW_POIS: &[AdventureKind] = &[
    kind("fallen-star-camp", TINY),
    kind("abandoned-surveyor-camp", TINY),
    kind("skyglass-observatory", MEDIUM),
    kind("overgrown-aqueduct", MEDIUM),
    kind("pilgrim-bathhouse", MEDIUM),
    kind("starfall-amphitheater", LARGE),
    kind("lantern-piehouse", MEDIUM),
    kind("whistlekite-roost", LARGE),
];
const FOREST_POIS: &[AdventureKind] = &[
    kind("foxfire-cairn", TINY),
    kind("mushroom-circle", TINY),
    kind("moonberry-witch-garden", MEDIUM),
    kind("overgrown-aqueduct", MEDIUM),
    kind("pilgrim-bathhouse", MEDIUM),
    kind("glimmerwood-harp-grove", MEDIUM),
    kind("wildwood-bridgehouse", LARGE),
    kind("lantern-piehouse", MEDIUM),
    kind("moonpost-listening-tree", MEDIUM),
    kind("mirrorfen-processional", LARGE),
    kind("root-crown-menagerie", LARGE),
    kind("lanternroot-cistern", LARGE),
];
const SNOW_POIS: &[AdventureKind] = &[
    kind("frostbound-bell", TINY),
    kind("skyglass-observatory", MEDIUM),
    kind("skyshaft-depot", MEDIUM),
    kind("clockwork-burrow", LARGE),
    kind("cloudwhale-graveyard", LARGE),
    kind("titans-kettle", LARGE),
];
const DESERT_POIS: &[AdventureKind] = &[
    kind("wind-carved-waystone", TINY),
    kind("fallen-star-camp", TINY),
    kind("rattlekin-totem-ring", MEDIUM),
    kind("sunken-caravan", MEDIUM),
    kind("emberwatch-tower", MEDIUM),
    kind("shattered-colossus", LARGE),
    kind("switchback-tollcamp", MEDIUM),
    kind("road-of-quiet-bells", LARGE),
];
const BADLANDS_POIS: &[AdventureKind] = &[
    kind("emberwatch-tower", MEDIUM),
    kind("switchback-tollcamp", MEDIUM),
    kind("clockwork-burrow", LARGE),
    kind("road-of-quiet-bells", LARGE),
    kind("emberglass-hatchery", LARGE),
];
const SAVANNA_POIS: &[AdventureKind] = &[
    kind("wind-carved-waystone", TINY),
    kind("abandoned-surveyor-camp", TINY),
    kind("rattlekin-totem-ring", MEDIUM),
    kind("sunken-caravan", MEDIUM),
    kind("shattered-colossus", LARGE),
    kind("switchback-tollcamp", MEDIUM),
    kind("whistlekite-roost", LARGE),
    kind("road-of-quiet-bells", LARGE),
];
const SWAMP_POIS: &[AdventureKind] = &[
    kind("foxfire-cairn", TINY),
    kind("reedwatch-platform", TINY),
    kind("moonberry-witch-garden", MEDIUM),
    kind("overgrown-aqueduct", MEDIUM),
    kind("sunken-caravan", MEDIUM),
    kind("wildwood-bridgehouse", LARGE),
    kind("mirrorfen-processional", LARGE),
    kind("lanternroot-cistern", LARGE),
];
const HIGHLANDS_POIS: &[AdventureKind] = &[
    kind("wind-carved-waystone", TINY),
    kind("fallen-star-camp", TINY),
    kind("frostbound-bell", TINY),
    kind("abandoned-surveyor-camp", TINY),
    kind("rattlekin-totem-ring", MEDIUM),
    kind("skyglass-observatory", MEDIUM),
    kind("pilgrim-bathhouse", MEDIUM),
    kind("shattered-colossus", LARGE),
    kind("starfall-amphitheater", LARGE),
    kind("skyshaft-depot", MEDIUM),
    kind("whistlekite-roost", LARGE),
    kind("clockwork-burrow", LARGE),
    kind("cloudwhale-graveyard", LARGE),
    kind("titans-kettle", LARGE),
    kind("fossil-orchard", LARGE),
];
const VOLCANIC_POIS: &[AdventureKind] = &[kind("emberwatch-tower", MEDIUM), kind("emberglass-hatchery", LARGE)];
const MUSHROOM_POIS: &[AdventureKind] = &[kind("mushroom-circle", TINY), kind("fossil-orchard", LARGE)];
const GLIMMERWOOD_POIS: &[AdventureKind] = &[
    kind("foxfire-cairn", TINY),
    kind("moonberry-witch-garden", MEDIUM),
    kind("glimmerwood-harp-grove", MEDIUM),
    kind("starfall-amphitheater", LARGE),
    kind("moonpost-listening-tree", MEDIUM),
    kind("cloudwhale-graveyard", LARGE),
    kind("root-crown-menagerie", LARGE),
    kind("lanternroot-cistern", LARGE),
];
const SUGARPLUM_POIS: &[AdventureKind] = &[kind("sugarwind-teahouse", MEDIUM)];

const COAST_DUNGEONS: &[AdventureKind] = &[kind("sunken-court-of-namarra", DUNGEON)];
const MEADOW_DUNGEONS: &[AdventureKind] = &[kind("bloomrot-cathedral", DUNGEON)];
const FOREST_DUNGEONS: &[AdventureKind] = &[
    kind("rootbound-labyrinth", DUNGEON),
    kind("bloomrot-cathedral", DUNGEON),
    kind("palimpsest-vault", DUNGEON),
];
const SNOW_DUNGEONS: &[AdventureKind] = &[
    kind("starless-observatory", DUNGEON),
    kind("stormglass-citadel", DUNGEON),
    kind("palace-of-nine-winds", DUNGEON),
];
const DESERT_DUNGEONS: &[AdventureKind] = &[kind("brassdeep-foundry", DUNGEON), kind("gorgon-quarry", DUNGEON)];
const BADLANDS_DUNGEONS: &[AdventureKind] = &[
    kind("gorgon-quarry", DUNGEON),
    kind("ashen-library-of-salamander-kings", DUNGEON),
];
const SWAMP_DUNGEONS: &[AdventureKind] = &[
    kind("rootbound-labyrinth", DUNGEON),
    kind("bloomrot-cathedral", DUNGEON),
];
const HIGHLANDS_DUNGEONS: &[AdventureKind] = &[
    kind("starless-observatory", DUNGEON),
    kind("brassdeep-foundry", DUNGEON),
    kind("stormglass-citadel", DUNGEON),
    kind("palimpsest-vault", DUNGEON),
    kind("palace-of-nine-winds", DUNGEON),
];
const VOLCANIC_DUNGEONS: &[AdventureKind] = &[
    kind("brassdeep-foundry", DUNGEON),
    kind("ashen-library-of-salamander-kings", DUNGEON),
];
const MUSHROOM_DUNGEONS: &[AdventureKind] = &[
    kind("palimpsest-vault", DUNGEON),
    kind("hollow-moon-menagerie", DUNGEON),
];
const GLIMMERWOOD_DUNGEONS: &[AdventureKind] = &[
    kind("rootbound-labyrinth", DUNGEON),
    kind("starless-observatory", DUNGEON),
    kind("palimpsest-vault", DUNGEON),
    kind("hollow-moon-menagerie", DUNGEON),
];

fn biome_catalogue(biome: BiomeId, dungeon: bool) -> &'static [AdventureKind] {
    if dungeon {
        match biome {
            BiomeId::Beach | BiomeId::Ocean | BiomeId::DeepOcean | BiomeId::LumenTrench => COAST_DUNGEONS,
            BiomeId::Meadow | BiomeId::CloudreedGlen => MEADOW_DUNGEONS,
            BiomeId::Wildwood
            | BiomeId::Birchlight
            | BiomeId::Bloomwood
            | BiomeId::RainveilJungle
            | BiomeId::SakurabloomGrove => FOREST_DUNGEONS,
            BiomeId::Snowfield | BiomeId::Frostpine | BiomeId::SnowcapRange => SNOW_DUNGEONS,
            BiomeId::Desert => DESERT_DUNGEONS,
            BiomeId::Badlands => BADLANDS_DUNGEONS,
            BiomeId::Siltfen => SWAMP_DUNGEONS,
            BiomeId::Highlands => HIGHLANDS_DUNGEONS,
            BiomeId::Volcanic => VOLCANIC_DUNGEONS,
            BiomeId::MushroomFen => MUSHROOM_DUNGEONS,
            BiomeId::Glimmerwood => GLIMMERWOOD_DUNGEONS,
            _ => &[],
        }
    } else {
        match biome {
            BiomeId::Beach | BiomeId::Ocean | BiomeId::DeepOcean | BiomeId::LumenTrench => COAST_POIS,
            BiomeId::Meadow | BiomeId::CloudreedGlen => MEADOW_POIS,
            BiomeId::Wildwood
            | BiomeId::Birchlight
            | BiomeId::Bloomwood
            | BiomeId::RainveilJungle
            | BiomeId::SakurabloomGrove => FOREST_POIS,
            BiomeId::Snowfield | BiomeId::Frostpine | BiomeId::SnowcapRange => SNOW_POIS,
            BiomeId::Desert => DESERT_POIS,
            BiomeId::Badlands => BADLANDS_POIS,
            BiomeId::Savanna => SAVANNA_POIS,
            BiomeId::Siltfen => SWAMP_POIS,
            BiomeId::Highlands => HIGHLANDS_POIS,
            BiomeId::Volcanic => VOLCANIC_POIS,
            BiomeId::MushroomFen => MUSHROOM_POIS,
            BiomeId::Glimmerwood => GLIMMERWOOD_POIS,
            BiomeId::SugarplumVale => SUGARPLUM_POIS,
            _ => &[],
        }
    }
}

#[must_use]
pub(crate) fn candidate(
    seed: &str,
    chunk_x: i32,
    chunk_z: i32,
    biome: BiomeId,
    dungeon: bool,
) -> Option<AdventureKind> {
    let region_size = if dungeon { DUNGEON_REGION_SIZE } else { POI_REGION_SIZE };
    let salt = if dungeon { "v13-dungeon" } else { "v13-poi" };
    let region_x = chunk_x.div_euclid(region_size);
    let region_z = chunk_z.div_euclid(region_size);
    let local_x = (hash_unit(seed, &format!("{salt}:{region_x},{region_z}:x")) * f64::from(region_size)).floor() as i32;
    let local_z = (hash_unit(seed, &format!("{salt}:{region_x},{region_z}:z")) * f64::from(region_size)).floor() as i32;
    if chunk_x != region_x * region_size + local_x || chunk_z != region_z * region_size + local_z {
        return None;
    }
    let catalogue = biome_catalogue(biome, dungeon);
    if catalogue.is_empty() {
        return None;
    }
    let selected =
        (hash_unit(seed, &format!("{salt}:{region_x},{region_z}:kind")) * catalogue.len() as f64).floor() as usize;
    catalogue.get(selected).copied()
}

struct Builder<'a> {
    kind: AdventureKind,
    seed: &'a str,
    origin: (i32, i32, i32),
    blocks: BTreeMap<(i32, i32, i32), u16>,
    markers: Vec<AdventureMarker>,
}

impl<'a> Builder<'a> {
    fn new(kind: AdventureKind, origin: (i32, i32, i32), seed: &'a str) -> Self {
        Self {
            kind,
            seed,
            origin,
            blocks: BTreeMap::new(),
            markers: Vec::new(),
        }
    }

    fn set(&mut self, dx: i32, dy: i32, dz: i32, block: u16) {
        self.blocks
            .insert((self.origin.0 + dx, self.origin.1 + dy, self.origin.2 + dz), block);
    }

    #[allow(clippy::too_many_arguments)]
    fn fill(&mut self, min_x: i32, min_y: i32, min_z: i32, max_x: i32, max_y: i32, max_z: i32, block: u16) {
        for y in min_y..=max_y {
            for z in min_z..=max_z {
                for x in min_x..=max_x {
                    self.set(x, y, z, block);
                }
            }
        }
    }

    fn hollow(&mut self, center: (i32, i32, i32), radius: (i32, i32, i32), shell: u16, floor: u16) {
        let (cx, cy, cz) = center;
        let (rx, ry, rz) = radius;
        self.fill(cx - rx, cy - 1, cz - rz, cx + rx, cy - 1, cz + rz, floor);
        self.fill(cx - rx, cy + ry, cz - rz, cx + rx, cy + ry, cz + rz, shell);
        for y in cy..cy + ry {
            for x in cx - rx..=cx + rx {
                self.set(x, y, cz - rz, shell);
                self.set(x, y, cz + rz, shell);
            }
            for z in cz - rz + 1..cz + rz {
                self.set(cx - rx, y, z, shell);
                self.set(cx + rx, y, z, shell);
            }
        }
        self.fill(
            cx - rx + 1,
            cy,
            cz - rz + 1,
            cx + rx - 1,
            cy + ry - 1,
            cz + rz - 1,
            Block::AIR,
        );
    }

    fn spawn(&mut self, offset: (i32, i32, i32), mob: &str, count: u32, radius: u32, id: &str, tags: &[&str]) {
        self.spawn_owned(
            offset,
            mob,
            count,
            radius,
            id,
            &tags.iter().map(|tag| (*tag).to_string()).collect::<Vec<_>>(),
        );
    }

    fn spawn_owned(&mut self, offset: (i32, i32, i32), mob: &str, count: u32, radius: u32, id: &str, tags: &[String]) {
        let plan_id = format!("adventure:{}:{},{}", self.kind.id, self.origin.0, self.origin.2);
        let key = format!("{plan_id}:spawn:{id}");
        let x = self.origin.0 + offset.0;
        let y = self.origin.1 + offset.1;
        let z = self.origin.2 + offset.2;
        let tags = tags
            .iter()
            .map(|tag| format!("\"{tag}\""))
            .collect::<Vec<_>>()
            .join(",");
        self.markers.push(AdventureMarker {
            x,
            z,
            row: MarkerRow {
                key: key.clone(),
                canonical_json: format!(
                    "[\"{key}\",{{\"count\":{count},\"id\":\"{id}\",\"mobKind\":\"{mob}\",\"persistent\":true,\"position\":{{\"x\":{x},\"y\":{y},\"z\":{z}}},\"radius\":{radius},\"tags\":[{tags}],\"type\":\"spawn\"}}]"
                ),
            },
        });
    }

    fn chest(&mut self, offset: (i32, i32, i32), table: &str, id: &str, rolls: u32) {
        self.set(offset.0, offset.1, offset.2, Block::CHEST);
        let loot = roll_structure_loot(
            table,
            &format!("{}:{},{}:{id}", self.seed, self.origin.0, self.origin.2),
            rolls,
        );
        self.planned_chest_marker(offset, table, id, &loot);
    }

    fn planned_chest_marker(&mut self, offset: (i32, i32, i32), table: &str, id: &str, loot: &[LootStack]) {
        let plan_id = format!("adventure:{}:{},{}", self.kind.id, self.origin.0, self.origin.2);
        let key = format!("{plan_id}:chest:{id}");
        let x = self.origin.0 + offset.0;
        let y = self.origin.1 + offset.1;
        let z = self.origin.2 + offset.2;
        let loot_json = loot
            .iter()
            .map(|entry| {
                let mut fields = Vec::<String>::new();
                if let Some(chance) = entry.chance {
                    fields.push(format!("\"chance\":{chance}"));
                }
                fields.push(format!("\"count\":{}", entry.count));
                if let Some(durability) = entry.durability {
                    fields.push(format!("\"durability\":{durability}"));
                }
                fields.push(format!("\"itemKey\":\"{}\"", entry.item));
                fields.push(format!("\"max\":{}", entry.max));
                fields.push(format!("\"min\":{}", entry.min));
                if let Some(weight) = entry.weight {
                    fields.push(format!("\"weight\":{weight}"));
                }
                format!("{{{}}}", fields.join(","))
            })
            .collect::<Vec<_>>()
            .join(",");
        self.markers.push(AdventureMarker {
            x,
            z,
            row: MarkerRow {
                key: key.clone(),
                canonical_json: format!(
                    "[\"{key}\",{{\"id\":\"{id}\",\"loot\":[{loot_json}],\"lootTable\":\"{table}\",\"position\":{{\"x\":{x},\"y\":{y},\"z\":{z}}},\"type\":\"chest\"}}]"
                ),
            },
        });
    }

    fn simple_chest(&mut self, offset: (i32, i32, i32), id: &str, loot: &[(String, u32)]) {
        self.set(offset.0, offset.1, offset.2, Block::CHEST);
        let plan_id = format!("adventure:{}:{},{}", self.kind.id, self.origin.0, self.origin.2);
        let key = format!("{plan_id}:chest:{id}");
        let x = self.origin.0 + offset.0;
        let y = self.origin.1 + offset.1;
        let z = self.origin.2 + offset.2;
        let loot_json = loot
            .iter()
            .map(|(item, count)| format!("{{\"count\":{count},\"itemKey\":\"{item}\"}}"))
            .collect::<Vec<_>>()
            .join(",");
        self.markers.push(AdventureMarker {
            x,
            z,
            row: MarkerRow {
                key: key.clone(),
                canonical_json: format!(
                    "[\"{key}\",{{\"id\":\"{id}\",\"loot\":[{loot_json}],\"lootTable\":\"adventure-cache\",\"position\":{{\"x\":{x},\"y\":{y},\"z\":{z}}},\"type\":\"chest\"}}]"
                ),
            },
        });
    }

    fn landmark(&mut self, dx: i32, dy: i32, dz: i32, tag: &str, layer: &str) {
        let marker_id = slug(tag);
        let plan_id = format!("adventure:{}:{},{}", self.kind.id, self.origin.0, self.origin.2);
        let key = format!("{plan_id}:landmark:{marker_id}");
        let x = self.origin.0 + dx;
        let y = self.origin.1 + dy;
        let z = self.origin.2 + dz;
        self.markers.push(AdventureMarker {
            x,
            z,
            row: MarkerRow {
                key: key.clone(),
                canonical_json: format!(
                    "[\"{key}\",{{\"id\":\"{marker_id}\",\"mapLayer\":\"{layer}\",\"position\":{{\"x\":{x},\"y\":{y},\"z\":{z}}},\"tag\":\"{tag}\",\"type\":\"landmark\"}}]"
                ),
            },
        });
    }

    fn finish(self) -> AdventurePlan {
        let placements = self
            .blocks
            .into_iter()
            .map(|((x, y, z), block)| AdventurePlacement { x, y, z, block })
            .collect::<Vec<_>>();
        let mut min_x = self.origin.0;
        let mut max_x = self.origin.0;
        let mut min_z = self.origin.2;
        let mut max_z = self.origin.2;
        for placement in &placements {
            min_x = min_x.min(placement.x);
            max_x = max_x.max(placement.x);
            min_z = min_z.min(placement.z);
            max_z = max_z.max(placement.z);
        }
        AdventurePlan {
            id: format!("adventure:{}:{},{}", self.kind.id, self.origin.0, self.origin.2),
            origin: self.origin,
            bounds: (min_x, max_x, min_z, max_z),
            placements,
            markers: self.markers,
        }
    }
}

#[must_use]
pub(crate) fn plan(kind: AdventureKind, origin: (i32, i32, i32), seed: &str) -> Option<AdventurePlan> {
    match kind.scale {
        AdventureScale::Tiny => Some(plan_tiny(kind, origin, seed)),
        AdventureScale::Medium => Some(if is_waypost(kind.id) {
            plan_waypost(kind, origin, seed)
        } else {
            plan_medium(kind, origin, seed)
        }),
        AdventureScale::Large => Some(if let Some(definition) = mythic_definition(kind.id) {
            plan_mythic_poi(kind, definition, origin, seed)
        } else if matches!(kind.id, "whistlekite-roost" | "clockwork-burrow") {
            plan_creature_poi(kind, origin, seed)
        } else {
            plan_large(kind, origin, seed)
        }),
        AdventureScale::Dungeon => plan_classic_dungeon(kind, origin, seed),
    }
}

#[derive(Clone, Copy)]
struct DungeonTile {
    grid_x: i32,
    grid_z: i32,
    stage: u8,
    east: bool,
    south: bool,
}

fn dungeon_tiles(kind: &str, seed: &str) -> Vec<DungeonTile> {
    let mut occupied = vec![(0_i32, 2_i32), (0, 1), (0, 0), (0, -1), (0, -2)];
    let target = 7 + (hash_unit(seed, &format!("{kind}:dungeon-tile-count")) * 5.0).floor() as usize;
    let mut cursor = 0_u32;
    while occupied.len() < target && cursor < 80 {
        let mut frontier = Vec::<(i32, i32)>::new();
        for &(grid_x, grid_z) in &occupied {
            for dx in [1_i32, -1_i32] {
                let next = (grid_x + dx, grid_z);
                if next.0.abs() <= 2 && next.1.abs() <= 2 && !occupied.contains(&next) && !frontier.contains(&next) {
                    frontier.push(next);
                }
            }
        }
        if frontier.is_empty() {
            break;
        }
        let selected =
            (hash_unit(seed, &format!("{kind}:dungeon-frontier:{cursor}")) * frontier.len() as f64).floor() as usize;
        occupied.push(frontier[selected]);
        cursor += 1;
    }
    occupied.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
    occupied
        .iter()
        .map(|&(grid_x, grid_z)| DungeonTile {
            grid_x,
            grid_z,
            stage: if grid_z >= 1 {
                1
            } else if grid_z == 0 {
                2
            } else {
                3
            },
            east: occupied.contains(&(grid_x + 1, grid_z)),
            south: occupied.contains(&(grid_x, grid_z + 1)),
        })
        .collect()
}

fn chamfered_dungeon_cell(builder: &mut Builder<'_>, center: (i32, i32, i32), shell: u16, floor: u16) {
    let (cx, cy, cz) = center;
    for x in -3_i32..=3 {
        for z in -3_i32..=3 {
            if x.abs() == 3 && z.abs() == 3 {
                continue;
            }
            builder.set(cx + x, cy - 1, cz + z, floor);
            let ceiling_y = cy + 4 - i32::from(x.abs() + z.abs() >= 5);
            builder.set(cx + x, ceiling_y, cz + z, shell);
            if x.abs() == 3 || z.abs() == 3 {
                for y in 0..4 {
                    builder.set(cx + x, cy + y, cz + z, shell);
                }
            } else {
                builder.fill(cx + x, cy, cz + z, cx + x, cy + 3, cz + z, Block::AIR);
            }
        }
    }
}

struct DungeonProfile {
    shell: u16,
    floor: u16,
    light: u16,
    table: &'static str,
    mobs: [&'static str; 3],
}

#[derive(Clone, Copy, Eq, PartialEq)]
enum MythicLayer {
    Surface,
    Sky,
    Underwater,
    Underground,
}

impl MythicLayer {
    const fn name(self) -> &'static str {
        match self {
            Self::Surface => "surface",
            Self::Sky => "sky",
            Self::Underwater => "underwater",
            Self::Underground => "underground",
        }
    }
}

#[derive(Clone, Copy, Eq, PartialEq)]
enum MythicMaterialKind {
    Nacre,
    Windworn,
    Fossilroot,
    Emberglass,
    Mirrorpeat,
    Moonfelt,
}

#[derive(Clone, Copy)]
struct MythicMaterial {
    kind: MythicMaterialKind,
    shell: u16,
    support: u16,
    accent: u16,
    exceptional: u16,
    item: &'static str,
}

impl MythicMaterialKind {
    const fn plan(self) -> MythicMaterial {
        match self {
            Self::Nacre => MythicMaterial {
                kind: self,
                shell: Block::NACRE_TIDEWORK,
                support: Block::DEEPSTONE,
                accent: Block::RIVETED_BRASS,
                exceptional: Block::GLOWSTONE,
                item: "nacre-tidework",
            },
            Self::Windworn => MythicMaterial {
                kind: self,
                shell: Block::WINDWORN_ALABASTER,
                support: Block::WILDWOOD_LOG,
                accent: Block::RIVETED_BRASS,
                exceptional: Block::GLOWSTONE,
                item: "windworn-alabaster",
            },
            Self::Fossilroot => MythicMaterial {
                kind: self,
                shell: Block::FOSSILROOT_CALCITE,
                support: Block::PILLARSTONE,
                accent: Block::MINERAL_CRUST,
                exceptional: Block::RESONANT_CRYSTAL,
                item: "fossilroot-calcite",
            },
            Self::Emberglass => MythicMaterial {
                kind: self,
                shell: Block::EMBERGLASS_ARCHIVE,
                support: Block::BASALT,
                accent: Block::HEAT_CRACKED_ROCK,
                exceptional: Block::WHISPERGLASS,
                item: "emberglass-archive",
            },
            Self::Mirrorpeat => MythicMaterial {
                kind: self,
                shell: Block::MIRRORPEAT,
                support: Block::WILDWOOD_LOG,
                accent: Block::REEDGLASS,
                exceptional: Block::GLOWSTONE,
                item: "mirrorpeat",
            },
            Self::Moonfelt => MythicMaterial {
                kind: self,
                shell: Block::MOONFELT_MYCELIUM,
                support: Block::DEEPSTONE,
                accent: Block::STARBLOOM_CAP,
                exceptional: Block::LUMINOUS_GILLS,
                item: "moonfelt-mycelium",
            },
        }
    }
}

#[derive(Clone, Copy)]
struct MythicDefinition {
    id: &'static str,
    encounter: &'static str,
    creature: &'static str,
    layer: MythicLayer,
    material: MythicMaterialKind,
    rooms: usize,
    flooded: usize,
    signature: &'static str,
}

fn mythic_definition(kind: &str) -> Option<MythicDefinition> {
    Some(match kind {
        "road-of-quiet-bells" => MythicDefinition {
            id: "road-quiet-bells",
            encounter: "quiet-bells",
            creature: "bellstep-qilin",
            layer: MythicLayer::Surface,
            material: MythicMaterialKind::Windworn,
            rooms: 3,
            flooded: 0,
            signature: "mythic-bellkeeper-tack",
        },
        "cloudwhale-graveyard" => MythicDefinition {
            id: "cloudwhale-graveyard",
            encounter: "cloudwhale-graveyard",
            creature: "aerolith-baleen",
            layer: MythicLayer::Sky,
            material: MythicMaterialKind::Windworn,
            rooms: 3,
            flooded: 0,
            signature: "mythic-cloudwhale-map",
        },
        "mirrorfen-processional" => MythicDefinition {
            id: "mirrorfen-processional",
            encounter: "mirrorfen-processional",
            creature: "mireglass-kelpie",
            layer: MythicLayer::Surface,
            material: MythicMaterialKind::Mirrorpeat,
            rooms: 3,
            flooded: 2,
            signature: "mythic-stillwater-chime",
        },
        "emberglass-hatchery" => MythicDefinition {
            id: "emberglass-hatchery",
            encounter: "emberglass-hatchery",
            creature: "cinderwing-pyrausta",
            layer: MythicLayer::Underground,
            material: MythicMaterialKind::Emberglass,
            rooms: 4,
            flooded: 0,
            signature: "mythic-emberglass-net",
        },
        "drowned-moon-gate" => MythicDefinition {
            id: "drowned-moon-gate",
            encounter: "drowned-moon-gate",
            creature: "nacre-gatewyrm",
            layer: MythicLayer::Underwater,
            material: MythicMaterialKind::Nacre,
            rooms: 4,
            flooded: 2,
            signature: "mythic-pressure-flask",
        },
        "titans-kettle" => MythicDefinition {
            id: "titans-kettle",
            encounter: "titans-kettle",
            creature: "frostcauldron-behemoth",
            layer: MythicLayer::Surface,
            material: MythicMaterialKind::Windworn,
            rooms: 3,
            flooded: 0,
            signature: "mythic-behemoth-harness",
        },
        "root-crown-menagerie" => MythicDefinition {
            id: "root-crown-menagerie",
            encounter: "root-crown-menagerie",
            creature: "briarcrown-manticore",
            layer: MythicLayer::Surface,
            material: MythicMaterialKind::Moonfelt,
            rooms: 4,
            flooded: 1,
            signature: "mythic-briarcrown-kit",
        },
        "fossil-orchard" => MythicDefinition {
            id: "fossil-orchard",
            encounter: "fossil-orchard",
            creature: "ammonarch",
            layer: MythicLayer::Underground,
            material: MythicMaterialKind::Fossilroot,
            rooms: 4,
            flooded: 1,
            signature: "mythic-acoustic-coil",
        },
        "lanternroot-cistern" => MythicDefinition {
            id: "lanternroot-cistern",
            encounter: "lanternroot-cistern",
            creature: "handtail-ahuizotl",
            layer: MythicLayer::Underground,
            material: MythicMaterialKind::Fossilroot,
            rooms: 4,
            flooded: 2,
            signature: "mythic-tailgrip-charm",
        },
        "tideclock-wreck" => MythicDefinition {
            id: "tideclock-wreck",
            encounter: "tideclock-wreck",
            creature: "tideclock-cetus",
            layer: MythicLayer::Underwater,
            material: MythicMaterialKind::Nacre,
            rooms: 3,
            flooded: 3,
            signature: "mythic-tideclock-compass",
        },
        "palace-of-nine-winds" => MythicDefinition {
            id: "palace-nine-winds",
            encounter: "palace-nine-winds",
            creature: "anemoi-gryphon",
            layer: MythicLayer::Sky,
            material: MythicMaterialKind::Windworn,
            rooms: 6,
            flooded: 0,
            signature: "mythic-nine-wind-standard",
        },
        "gorgon-quarry" => MythicDefinition {
            id: "gorgon-quarry",
            encounter: "gorgon-quarry",
            creature: "sable-gorgon",
            layer: MythicLayer::Underground,
            material: MythicMaterialKind::Fossilroot,
            rooms: 6,
            flooded: 0,
            signature: "mythic-merciful-mirror",
        },
        "sunken-court-of-namarra" => MythicDefinition {
            id: "sunken-court-namarra",
            encounter: "sunken-court-namarra",
            creature: "namarra-makara",
            layer: MythicLayer::Underwater,
            material: MythicMaterialKind::Nacre,
            rooms: 8,
            flooded: 6,
            signature: "mythic-pearl-regalia",
        },
        "ashen-library-of-salamander-kings" => MythicDefinition {
            id: "ashen-library-salamander-kings",
            encounter: "ashen-library",
            creature: "ashen-salamander-king",
            layer: MythicLayer::Underground,
            material: MythicMaterialKind::Emberglass,
            rooms: 7,
            flooded: 0,
            signature: "mythic-heat-script-lens",
        },
        "hollow-moon-menagerie" => MythicDefinition {
            id: "hollow-moon-menagerie",
            encounter: "hollow-moon-menagerie",
            creature: "mycelial-oneirophant",
            layer: MythicLayer::Underground,
            material: MythicMaterialKind::Moonfelt,
            rooms: 7,
            flooded: 1,
            signature: "mythic-remembered-path",
        },
        _ => return None,
    })
}

pub(crate) fn plan_origin_y(kind: AdventureKind, surface: i32, waterline: i32) -> i32 {
    mythic_definition(kind.id)
        .filter(|definition| definition.layer == MythicLayer::Underwater)
        .map_or(surface, |_| waterline)
}

pub(crate) fn mythic_terrain_is_valid(
    kind: AdventureKind,
    generator: &crate::generator::TerrainGeneratorV18,
    origin: (i32, i32),
) -> bool {
    let Some(definition) = mythic_definition(kind.id) else {
        return true;
    };
    let center = generator.sample_column(origin.0, origin.1);
    if definition.layer == MythicLayer::Underwater {
        return center.waterline - center.height >= 10;
    }
    if definition.layer != MythicLayer::Surface {
        return true;
    }
    let heights = [(0, 0), (-8, -8), (8, -8), (-8, 8), (8, 8)]
        .map(|(dx, dz)| generator.sample_column(origin.0 + dx, origin.1 + dz).height);
    heights.iter().max().expect("five samples") - heights.iter().min().expect("five samples") <= 10
}

fn js_round(value: f64) -> i32 {
    (value + 0.5).floor() as i32
}

fn flooded_mythic_room(definition: MythicDefinition, index: usize) -> bool {
    if definition.id == "sunken-court-namarra" {
        return matches!(index, 0..=4 | 7);
    }
    if definition.id == "hollow-moon-menagerie" {
        return index + 1 == definition.rooms;
    }
    index < definition.flooded
}

fn decorate_mythic_room(
    builder: &mut Builder<'_>,
    _definition: MythicDefinition,
    material: MythicMaterial,
    center: (i32, i32, i32),
    _room_index: usize,
) {
    let (x, y, z) = center;
    builder.set(x + 3, y + 3, z, material.exceptional);
    for edge in -4..=4 {
        builder.set(x + edge, y - 1, z - 4, material.support);
        builder.set(x + edge, y - 1, z + 4, material.support);
        builder.set(x - 4, y - 1, z + edge, material.support);
        builder.set(x + 4, y - 1, z + edge, material.support);
        builder.set(x + edge, y + 4, z, material.support);
        builder.set(x, y + 4, z + edge, material.support);
    }
    for side in [-4, 4] {
        for edge in -4..=4 {
            builder.set(x + edge, y + 2, z + side, material.support);
            builder.set(x + side, y + 2, z + edge, material.support);
        }
    }
    for corner_x in [-3, 3] {
        for corner_z in [-3, 3] {
            builder.fill(
                x + corner_x,
                y,
                z + corner_z,
                x + corner_x,
                y + 2,
                z + corner_z,
                material.support,
            );
        }
    }
    for side in [-4, 4] {
        builder.fill(x - 1, y + 1, z + side, x + 1, y + 2, z + side, material.accent);
        builder.fill(x + side, y + 1, z - 1, x + side, y + 2, z + 1, material.accent);
    }
    match material.kind {
        MythicMaterialKind::Mirrorpeat => {
            for side in [-1, 1] {
                builder.fill(x + side * 2, y + 1, z - 3, x + side * 2, y + 2, z - 3, Block::REEDGLASS);
            }
        }
        MythicMaterialKind::Fossilroot => {
            for fossil in -2..=2 {
                builder.set(x + fossil, y, z + 2, Block::FOSSILROOT_CALCITE);
            }
        }
        MythicMaterialKind::Emberglass => {
            for tablet in -2..=2 {
                builder.set(x + tablet, y + 1, z - 3, Block::EMBERGLASS_ARCHIVE);
            }
        }
        MythicMaterialKind::Nacre => {
            builder.fill(x - 2, y + 1, z - 3, x + 2, y + 2, z - 3, Block::NACRE_TIDEWORK);
        }
        MythicMaterialKind::Moonfelt => {
            for fan in -2..=2 {
                builder.set(x + fan, y + 1, z + 3, Block::MOONFELT_MYCELIUM);
            }
        }
        MythicMaterialKind::Windworn => {}
    }
}

#[allow(clippy::too_many_arguments)]
fn connect_mythic_rooms(
    builder: &mut Builder<'_>,
    definition: MythicDefinition,
    material: MythicMaterial,
    from: (i32, i32, i32),
    to: (i32, i32, i32),
    from_flooded: bool,
    to_flooded: bool,
) {
    let mut cells = vec![(from.0, from.2)];
    let (mut x, mut z) = (from.0, from.2);
    while x != to.0 {
        x += (to.0 - x).signum();
        cells.push((x, z));
    }
    while z != to.2 {
        z += (to.2 - z).signum();
        cells.push((x, z));
    }
    let sealed = definition.layer == MythicLayer::Underwater;
    let interior = if from_flooded && to_flooded {
        Block::WATER
    } else {
        Block::AIR
    };
    for (index, &(cell_x, cell_z)) in cells.iter().enumerate() {
        let t = if cells.len() <= 1 {
            1.0
        } else {
            index as f64 / (cells.len() - 1) as f64
        };
        let standing_y = js_round(f64::from(from.1) + f64::from(to.1 - from.1) * t);
        let neighbor = cells[usize::min(cells.len() - 1, index + 1)];
        let travels_x =
            neighbor.0 != cell_x || (neighbor == (cell_x, cell_z) && (to.0 - from.0).abs() >= (to.2 - from.2).abs());
        if sealed {
            let room_interior = index < 4 || index > cells.len().saturating_sub(5);
            for offset in -2..=2 {
                let px = cell_x + if travels_x { 0 } else { offset };
                let pz = cell_z + if travels_x { offset } else { 0 };
                builder.set(px, standing_y - 1, pz, material.shell);
                if !room_interior {
                    builder.set(px, standing_y + 3, pz, material.shell);
                }
            }
            if !room_interior {
                for height in 0..=2 {
                    for side in [-2, 2] {
                        builder.set(
                            cell_x + if travels_x { 0 } else { side },
                            standing_y + height,
                            cell_z + if travels_x { side } else { 0 },
                            material.support,
                        );
                    }
                }
            }
            for height in 0..=2 {
                for offset in -1..=1 {
                    builder.set(
                        cell_x + if travels_x { 0 } else { offset },
                        standing_y + height,
                        cell_z + if travels_x { offset } else { 0 },
                        interior,
                    );
                }
            }
        } else {
            for offset in -1..=1 {
                let px = cell_x + if travels_x { 0 } else { offset };
                let pz = cell_z + if travels_x { offset } else { 0 };
                builder.set(px, standing_y - 1, pz, material.shell);
                builder.fill(px, standing_y, pz, px, standing_y + 2, pz, Block::AIR);
            }
        }
    }
    if sealed && from_flooded != to_flooded && cells.len() >= 9 {
        let lock_index = usize::max(4, usize::min(cells.len() - 5, cells.len() / 2));
        let (lock_x, lock_z) = cells[lock_index];
        let standing_y =
            js_round(f64::from(from.1) + f64::from(to.1 - from.1) * (lock_index as f64 / (cells.len() - 1) as f64));
        let travels_x = cells[lock_index + 1].0 != lock_x;
        for side in [-1, 1] {
            builder.fill(
                lock_x + if travels_x { 0 } else { side },
                standing_y,
                lock_z + if travels_x { side } else { 0 },
                lock_x + if travels_x { 0 } else { side },
                standing_y + 2,
                lock_z + if travels_x { side } else { 0 },
                material.accent,
            );
        }
        builder.set(lock_x, standing_y, lock_z, Block::WROUGHT_IRON_DOOR_CLOSED_LOWER);
        builder.set(lock_x, standing_y + 1, lock_z, Block::WROUGHT_IRON_DOOR_CLOSED_UPPER);
        builder.set(lock_x, standing_y + 2, lock_z, material.accent);
    }
}

fn mythic_ring(builder: &mut Builder<'_>, center: (i32, i32, i32), radius: i32, block: u16) {
    let mut seen = Vec::<(i32, i32)>::new();
    for step in 0..radius * 12 {
        let angle = f64::from(step) / f64::from(radius * 12) * std::f64::consts::TAU;
        let x = js_round(f64::from(center.0) + angle.cos() * f64::from(radius));
        let z = js_round(f64::from(center.2) + angle.sin() * f64::from(radius));
        if seen.contains(&(x, z)) {
            continue;
        }
        seen.push((x, z));
        builder.set(x, center.1, z, block);
    }
}

fn add_mythic_dungeon_access(
    builder: &mut Builder<'_>,
    definition: MythicDefinition,
    material: MythicMaterial,
    base_y: i32,
) {
    builder.fill(-2, 0, 10, 2, 2, 14, material.shell);
    builder.fill(-1, 1, 11, 1, 2, 13, Block::AIR);
    for depth in (base_y..=-1).rev() {
        builder.fill(-2, depth, 10, 2, depth, 14, material.shell);
        builder.fill(-1, depth, 11, 1, depth, 13, Block::AIR);
        if depth % 4 == 0 {
            builder.set(if depth % 2 != 0 { -2 } else { 2 }, depth, 12, material.accent);
        }
    }
    let mut stair_ring = Vec::<(i32, i32)>::new();
    for x in -3..=3 {
        stair_ring.push((x, 9));
    }
    for z in 10..=15 {
        stair_ring.push((3, z));
    }
    for x in (-3..=2).rev() {
        stair_ring.push((x, 15));
    }
    for z in (10..=14).rev() {
        stair_ring.push((-3, z));
    }
    for (step, &(x, z)) in stair_ring.iter().take(18).enumerate() {
        let y = -(step as i32);
        builder.set(x, y, z, material.shell);
        builder.set(x, y + 1, z, Block::AIR);
        builder.set(x, y + 2, z, Block::AIR);
    }
    builder.fill(2, base_y, 11, 2, base_y + 2, 13, Block::AIR);
    builder.fill(-3, base_y, 14, -1, base_y + 2, 14, Block::AIR);
    builder.set(0, base_y, 16, Block::WROUGHT_IRON_DOOR_CLOSED_LOWER);
    builder.set(0, base_y + 1, 16, Block::WROUGHT_IRON_DOOR_CLOSED_UPPER);
    let _ = definition;
}

fn add_mythic_poi_access(
    builder: &mut Builder<'_>,
    definition: MythicDefinition,
    material: MythicMaterial,
    entrance: (i32, i32, i32),
) {
    let (x, _, z) = entrance;
    let surface_z = z + 20;
    for depth in 0..=16 {
        let tread_z = surface_z - depth;
        for width in -1..=1 {
            builder.set(x + width, -depth, tread_z, material.shell);
            builder.fill(
                x + width,
                -depth + 1,
                tread_z,
                x + width,
                -depth + 3,
                tread_z,
                Block::AIR,
            );
        }
        for rail in [-2, 2] {
            builder.set(x + rail, -depth, tread_z, material.support);
        }
    }
    builder.fill(x - 3, 1, surface_z, x - 3, 5, surface_z, material.support);
    builder.fill(x + 3, 1, surface_z, x + 3, 5, surface_z, material.support);
    builder.fill(x - 3, 5, surface_z, x + 3, 5, surface_z, material.shell);
    builder.set(x, 4, surface_z, material.accent);
    builder.landmark(
        x,
        2,
        surface_z,
        &format!("mythic-surface-threshold:{}", definition.id),
        "surface",
    );
}

fn add_mythic_poi_silhouette(
    builder: &mut Builder<'_>,
    definition: MythicDefinition,
    material: MythicMaterial,
    centers: &[(i32, i32, i32)],
    base_y: i32,
) {
    let first = centers[0];
    let last = centers[centers.len() - 1];
    match definition.id {
        "road-quiet-bells" => {
            for z in (first.2 - 18..=last.2 + 18).step_by(2) {
                builder.set(0, base_y - 1, z, material.shell);
            }
            for z in [first.2 - 8, 0, last.2 + 8] {
                builder.fill(-3, base_y, z, -3, base_y + 5, z, material.support);
                builder.fill(3, base_y, z, 3, base_y + 5, z, material.support);
                builder.fill(-3, base_y + 5, z, 3, base_y + 5, z, material.shell);
                builder.fill(0, base_y + 3, z, 0, base_y + 4, z, material.accent);
            }
            builder.landmark(
                0,
                base_y + 4,
                first.2 - 8,
                "mythic-silhouette:road-quiet-bells:three-bell-processional",
                definition.layer.name(),
            );
        }
        "cloudwhale-graveyard" => {
            for (rib, z) in [-10, 0, 10].into_iter().enumerate() {
                for x in -7_i32..=7 {
                    let height = js_round(f64::from(49 - x * x).max(0.0).sqrt() * (1.0 + rib as f64 * 0.08));
                    builder.set(
                        x,
                        base_y + height,
                        z,
                        if rib == 1 { material.accent } else { material.shell },
                    );
                    if x % 3 == 0 {
                        builder.set(x, base_y + height - 1, z, material.support);
                    }
                }
            }
            builder.landmark(
                0,
                base_y + 8,
                0,
                "mythic-silhouette:cloudwhale-graveyard:three-aerolith-ribs",
                definition.layer.name(),
            );
        }
        "mirrorfen-processional" => {
            for z in first.2 - 10..=last.2 + 10 {
                let x = js_round((f64::from(z) / 5.0).sin() * 5.0);
                builder.set(x, base_y - 1, z, material.shell);
                if z % 7 == 0 {
                    builder.fill(x - 3, base_y, z, x - 3, base_y + 4, z, material.support);
                    builder.set(x - 3, base_y + 4, z, material.accent);
                }
            }
            builder.landmark(
                0,
                base_y + 2,
                first.2 - 10,
                "mythic-silhouette:mirrorfen-processional:s-processional",
                definition.layer.name(),
            );
        }
        "emberglass-hatchery" => {
            mythic_ring(builder, (0, 0, 0), 11, material.shell);
            mythic_ring(builder, (0, -1, 0), 14, material.shell);
            for (x, z) in [(-8, -6), (8, -6), (-8, 6), (8, 6)] {
                builder.fill(x, -1, z, x, 4, z, material.support);
                builder.set(x, 5, z, material.accent);
            }
            for x in -3..=3 {
                builder.set(x, 1, 11, material.accent);
            }
            builder.landmark(
                0,
                1,
                11,
                "mythic-silhouette:emberglass-hatchery:ringed-ash-nursery",
                definition.layer.name(),
            );
        }
        "drowned-moon-gate" => {
            for height in 0..=24 {
                let lean = height / 6;
                let block = if height % 4 == 0 {
                    material.accent
                } else {
                    material.shell
                };
                builder.set(-9 + lean, base_y - 2 + height, first.2 - 5, block);
                builder.set(9 + lean, base_y - 2 + height, first.2 - 5, block);
            }
            for x in -5..=13 {
                let y = base_y + 22 + js_round((f64::from(x + 5) / 18.0 * std::f64::consts::PI).cos() * 3.0);
                builder.set(x, y, first.2 - 5, material.shell);
            }
            builder.landmark(
                2,
                base_y + 16,
                first.2 - 5,
                "mythic-silhouette:drowned-moon-gate:tilted-moon-arch",
                definition.layer.name(),
            );
        }
        "titans-kettle" => {
            mythic_ring(builder, (0, base_y - 1, 0), 13, material.shell);
            mythic_ring(builder, (0, base_y - 1, 0), 10, material.shell);
            builder.fill(-4, base_y - 1, -4, 4, base_y - 1, 4, Block::ICE);
            for (x, z) in [(-10, -6), (10, -6), (-10, 6), (10, 6)] {
                builder.fill(x, base_y, z, x, base_y + 5, z, material.support);
            }
            builder.landmark(
                0,
                base_y + 1,
                -13,
                "mythic-silhouette:titans-kettle:cirque-and-kettle",
                definition.layer.name(),
            );
        }
        "root-crown-menagerie" => {
            mythic_ring(builder, (0, base_y - 1, 0), 11, material.shell);
            for (x, z) in [(-8, -5), (8, -5), (-8, 5), (8, 5)] {
                builder.fill(x, base_y, z, x, base_y + 7, z, material.support);
                builder.fill(0.min(x), base_y + 7, z, 0.max(x), base_y + 7, z, material.support);
            }
            builder.fill(-3, base_y - 2, -3, 3, base_y - 1, 3, Block::AIR);
            builder.landmark(
                0,
                base_y + 5,
                0,
                "mythic-silhouette:root-crown-menagerie:root-crown-court",
                definition.layer.name(),
            );
        }
        "fossil-orchard" => {
            for (x, z, height) in [(-9, -8, 8), (8, -7, 6), (-10, 3, 7), (9, 5, 9), (0, 9, 7)] {
                builder.fill(x, base_y, z, x, base_y + height, z, material.support);
                for step in 0..=height * 2 {
                    builder.set(
                        x + js_round((f64::from(step) * 0.9).cos() * 2.0),
                        base_y + step / 2,
                        z + js_round((f64::from(step) * 0.9).sin() * 2.0),
                        material.shell,
                    );
                }
            }
            for x in -4..=4 {
                builder.set(x, base_y, 10, material.accent);
            }
            builder.landmark(
                0,
                base_y + 5,
                9,
                "mythic-silhouette:fossil-orchard:fossil-spiral-orchard",
                definition.layer.name(),
            );
        }
        "lanternroot-cistern" => {
            for radius in [12, 9, 6] {
                mythic_ring(
                    builder,
                    (0, base_y - 1 + (12 - radius) / 3, 0),
                    radius,
                    if radius == 9 { material.support } else { material.shell },
                );
            }
            for z in [-9, 0, 9] {
                builder.fill(-5, base_y, z, -5, base_y + 4, z, material.support);
                builder.fill(5, base_y, z, 5, base_y + 4, z, material.support);
                builder.fill(-5, base_y + 4, z, 5, base_y + 4, z, material.shell);
                for x in [-3, 0, 3] {
                    builder.set(x, base_y + 3, z, material.accent);
                }
            }
            builder.landmark(
                0,
                base_y + 2,
                -12,
                "mythic-silhouette:lanternroot-cistern:three-overflow-gates",
                definition.layer.name(),
            );
        }
        "tideclock-wreck" => {
            mythic_ring(builder, (0, base_y - 1, 0), 13, material.shell);
            mythic_ring(builder, (0, base_y - 1, 0), 9, material.shell);
            builder.fill(0, base_y, 0, 0, base_y + 8, 0, material.support);
            for arm in 0..=10 {
                builder.set(
                    arm,
                    base_y + 8 - arm / 4,
                    0,
                    if arm > 7 { material.shell } else { material.accent },
                );
            }
            builder.landmark(
                0,
                base_y + 7,
                0,
                "mythic-silhouette:tideclock-wreck:ring-and-broken-arm",
                definition.layer.name(),
            );
        }
        _ => {}
    }
}

fn add_mythic_dungeon_silhouette(
    builder: &mut Builder<'_>,
    definition: MythicDefinition,
    material: MythicMaterial,
    centers: &[(i32, i32, i32)],
    base_y: i32,
) {
    let last = centers[centers.len() - 1];
    match definition.id {
        "palace-nine-winds" => {
            for (index, &(x, y, z)) in centers.iter().enumerate() {
                let mast_x = x + if index % 2 == 1 { -5 } else { 5 };
                builder.fill(mast_x, y, z, mast_x, y + 6, z, material.support);
                builder.fill(
                    mast_x,
                    y + 5,
                    z,
                    x + if index % 2 == 1 { -3 } else { 7 },
                    y + 6,
                    z,
                    material.accent,
                );
            }
            builder.landmark(
                last.0,
                last.1 + 7,
                last.2,
                "mythic-silhouette:palace-nine-winds:nine-wind-crown",
                definition.layer.name(),
            );
        }
        "gorgon-quarry" => {
            for (x, z, height) in [(-9, -10, 5), (9, -8, 4), (-11, 1, 6), (10, 4, 5), (-5, 10, 4)] {
                builder.fill(x, base_y, z, x, base_y + height, z, material.support);
                builder.set(x, base_y + height + 1, z, material.accent);
            }
            builder.fill(-13, base_y - 1, -13, -8, base_y - 1, 13, material.shell);
            builder.landmark(
                -10,
                base_y + 3,
                -10,
                "mythic-silhouette:gorgon-quarry:statue-switchback",
                definition.layer.name(),
            );
        }
        "sunken-court-namarra" => {
            for x in [-11, 11] {
                builder.fill(x, base_y - 1, 0, x, base_y + 10, 0, material.support);
            }
            for x in -11..=11 {
                let y = base_y + 10 + js_round((f64::from(x + 11) / 22.0 * std::f64::consts::PI).sin() * 3.0);
                builder.set(x, y, 0, material.shell);
            }
            for garden_x in [-6, 6] {
                for (dx, dz) in [(-1, -2), (1, -2), (-1, 2), (1, 2)] {
                    builder.fill(
                        garden_x + dx,
                        base_y + 2,
                        dz,
                        garden_x + dx,
                        base_y + 6,
                        dz,
                        material.support,
                    );
                }
                for dz in [-2, 0, 2] {
                    builder.set(garden_x, base_y + 5, dz, material.accent);
                }
            }
            builder.landmark(
                0,
                base_y + 9,
                0,
                "mythic-silhouette:sunken-court-namarra:pearl-current-gate",
                definition.layer.name(),
            );
        }
        "ashen-library-salamander-kings" => {
            for (x, z) in [(-3, -3), (3, -3), (-3, 3), (3, 3)] {
                builder.fill(x, base_y + 5, z, x, 10, z, material.support);
            }
            for edge in -3..=3 {
                builder.set(edge, 10, -3, material.accent);
                builder.set(edge, 10, 3, material.accent);
                builder.set(-3, 10, edge, material.accent);
                builder.set(3, 10, edge, material.accent);
            }
            for z in [-8, -4, 4, 8] {
                builder.fill(-8, base_y, z, -5, base_y + 2, z, material.shell);
                builder.fill(5, base_y, z, 8, base_y + 2, z, material.shell);
            }
            builder.landmark(
                0,
                9,
                0,
                "mythic-silhouette:ashen-library-salamander-kings:crowned-archive-chimney",
                definition.layer.name(),
            );
        }
        "hollow-moon-menagerie" => {
            mythic_ring(builder, (0, base_y - 1, 0), 14, material.support);
            for habitat in 0..6 {
                let angle = f64::from(habitat) / 6.0 * std::f64::consts::TAU;
                let x = js_round(angle.cos() * 10.0);
                let z = js_round(angle.sin() * 10.0);
                builder.fill(x, base_y, z, x, base_y + 5, z, material.shell);
                builder.set(x, base_y + 5, z, material.accent);
            }
            builder.landmark(
                0,
                base_y + 3,
                -14,
                "mythic-silhouette:hollow-moon-menagerie:six-memory-crown",
                definition.layer.name(),
            );
        }
        _ => {}
    }
}

fn mythic_hash(value: &str) -> f64 {
    let mut hash = 2_166_136_261_u32;
    for unit in value.encode_utf16() {
        hash = (hash ^ u32::from(unit)).wrapping_mul(16_777_619);
    }
    f64::from(hash) / 4_294_967_296.0
}

fn mythic_loot(definition: MythicDefinition, material: MythicMaterial, seed: &str) -> Vec<(String, u32)> {
    let supply = match definition.layer {
        MythicLayer::Underwater => "water-breathing-potion",
        MythicLayer::Underground => "cave-gel",
        MythicLayer::Surface | MythicLayer::Sky => "wayfarer-potion",
    };
    vec![
        (
            material.item.to_string(),
            3 + (mythic_hash(&format!("{seed}|material-count")) * 6.0).floor() as u32,
        ),
        (
            supply.to_string(),
            2 + (mythic_hash(&format!("{seed}|supply")) * 3.0).floor() as u32,
        ),
        ("bound-book".to_string(), 1),
        (definition.signature.to_string(), 1),
    ]
}

fn mythic_ecology(material: MythicMaterialKind) -> [&'static str; 3] {
    match material {
        MythicMaterialKind::Nacre => ["reefmender-shrimp", "currentweaver-eel", "reefmender-shrimp"],
        MythicMaterialKind::Windworn => ["chimewing", "stormglass-roclet", "chimewing"],
        MythicMaterialKind::Fossilroot => ["fossilback-trilobite", "veinling", "fossilback-trilobite"],
        MythicMaterialKind::Emberglass => ["kilnscale-salamander", "cinder-kite", "kilnscale-salamander"],
        MythicMaterialKind::Mirrorpeat => ["mirecrown-crane", "currentweaver-eel", "mossling"],
        MythicMaterialKind::Moonfelt => ["sporeback-gardener", "mossling", "sporeback-gardener"],
    }
}

fn dungeon_profile(kind: &str) -> DungeonProfile {
    match kind {
        "rootbound-labyrinth" => DungeonProfile {
            shell: Block::MOSS,
            floor: Block::RUNE_STONE,
            light: Block::GLOWSTONE,
            table: "rootbound-vault",
            mobs: ["rootwrithe", "bellroot-matron", "rootwrithe"],
        },
        "starless-observatory" => DungeonProfile {
            shell: Block::MOON_SLATE,
            floor: Block::DEEPSTONE,
            light: Block::CRYSTAL_BLOCK,
            table: "starless-vault",
            mobs: ["vaultwing", "auric-scarab", "ossuary-keeper"],
        },
        "palimpsest-vault" => DungeonProfile {
            shell: Block::STORYBOOK_BRICK,
            floor: Block::MOON_SLATE,
            light: Block::WHISPERGLASS,
            table: "palimpsest-vault",
            mobs: ["ossuary-keeper", "vaultwing", "inkmaw-curator"],
        },
        _ => DungeonProfile {
            shell: Block::DEEPGEAR_BRICK,
            floor: Block::RIVETED_BRASS,
            light: Block::DEEPGEAR_LANTERN,
            table: "brassdeep-vault",
            mobs: ["cinder-maw", "auric-scarab", "ossuary-keeper"],
        },
    }
}

fn plan_classic_dungeon(kind: AdventureKind, origin: (i32, i32, i32), seed: &str) -> Option<AdventurePlan> {
    match kind.id {
        "rootbound-labyrinth" | "starless-observatory" | "brassdeep-foundry" | "palimpsest-vault" => {
            Some(plan_underground_dungeon(kind, origin, seed))
        }
        "stormglass-citadel" => Some(plan_stormglass_citadel(kind, origin, seed)),
        "bloomrot-cathedral" => Some(plan_bloomrot_cathedral(kind, origin, seed)),
        _ => mythic_definition(kind.id).map(|definition| plan_mythic_dungeon(kind, definition, origin, seed)),
    }
}

fn plan_mythic_poi(
    kind: AdventureKind,
    definition: MythicDefinition,
    origin: (i32, i32, i32),
    seed: &str,
) -> AdventurePlan {
    let material = definition.material.plan();
    let mut b = Builder::new(kind, origin, seed);
    let base_y = match definition.layer {
        MythicLayer::Sky => 14,
        MythicLayer::Underwater => -12,
        MythicLayer::Underground => -15,
        MythicLayer::Surface => 1,
    };
    let mut centers = Vec::<(i32, i32, i32)>::with_capacity(definition.rooms);
    for index in 0..definition.rooms {
        let center = (
            if index % 2 == 1 { 4 } else { -4 },
            base_y
                + if definition.layer == MythicLayer::Sky {
                    index as i32 * 2
                } else {
                    0
                },
            js_round((index as f64 - (definition.rooms - 1) as f64 / 2.0) * 8.0),
        );
        centers.push(center);
        b.hollow(center, (4, 4, 4), material.shell, material.shell);
        decorate_mythic_room(&mut b, definition, material, center, index);
        if index > 0 {
            connect_mythic_rooms(
                &mut b,
                definition,
                material,
                centers[index - 1],
                center,
                flooded_mythic_room(definition, index - 1),
                flooded_mythic_room(definition, index),
            );
        }
    }
    if definition.layer == MythicLayer::Underground {
        add_mythic_poi_access(&mut b, definition, material, centers[0]);
    }
    if definition.id == "cloudwhale-graveyard" {
        let entrance = centers[0];
        connect_mythic_rooms(
            &mut b,
            definition,
            material,
            (entrance.0, 1, entrance.2 + 20),
            (entrance.0, entrance.1, entrance.2 + 4),
            false,
            false,
        );
        b.landmark(
            entrance.0,
            2,
            entrance.2 + 20,
            "mythic-surface-threshold:cloudwhale-graveyard",
            "surface",
        );
    }
    add_mythic_poi_silhouette(&mut b, definition, material, &centers, base_y);
    for &(x, y, z) in &centers {
        b.set(x + 3, y + 3, z, material.exceptional);
    }
    for &(x, y, z) in centers.iter().take(definition.flooded) {
        b.fill(x - 3, y, z - 3, x + 3, y + 2, z + 3, Block::WATER);
    }
    let entrance = centers[0];
    let resident = centers[centers.len() - 1];
    b.landmark(
        entrance.0,
        entrance.1 + 2,
        entrance.2 + 4,
        &format!("adventure-poi:{}", kind.id),
        definition.layer.name(),
    );
    b.landmark(
        entrance.0,
        entrance.1 + 1,
        entrance.2 + 4,
        &format!("mythic-entrance:{}", definition.id),
        definition.layer.name(),
    );
    b.landmark(
        resident.0,
        resident.1 + 1,
        resident.2,
        &format!("mythic-loot:{}", definition.id),
        definition.layer.name(),
    );
    let tags = vec![
        "mythic-frontier".to_string(),
        format!("legendary:{}", definition.encounter),
        format!("legendary-site:mythic:{}:{},{}", definition.id, origin.0, origin.2),
        "nonlethal".to_string(),
        "persistent-lair".to_string(),
    ];
    b.spawn_owned(
        (resident.0, resident.1 + 1, resident.2),
        definition.creature,
        1,
        10,
        &format!("{}-resident", definition.id),
        &tags,
    );
    b.chest(
        (entrance.0 - 2, entrance.1, entrance.2 - 2),
        "adventure-cache",
        &format!("{}-expedition-cache", definition.id),
        6,
    );
    let loot_seed = format!("{seed}:{},{}:signature", origin.0, origin.2);
    b.simple_chest(
        (resident.0 - 2, resident.1, resident.2 + 2),
        &format!("{}-signature-cache", definition.id),
        &mythic_loot(definition, material, &loot_seed),
    );
    b.finish()
}

fn plan_mythic_dungeon(
    kind: AdventureKind,
    definition: MythicDefinition,
    origin: (i32, i32, i32),
    seed: &str,
) -> AdventurePlan {
    let material = definition.material.plan();
    let mut b = Builder::new(kind, origin, seed);
    let underwater = definition.layer == MythicLayer::Underwater;
    let underground = definition.layer == MythicLayer::Underground;
    let base_y = if underwater || underground { -16 } else { 2 };
    let closed_loop = matches!(kind.id, "gorgon-quarry" | "hollow-moon-menagerie");
    let denominator = definition.rooms - usize::from(!closed_loop);
    let mut centers = Vec::<(i32, i32, i32)>::with_capacity(definition.rooms);
    for index in 0..definition.rooms {
        let angle =
            index as f64 / denominator.max(1) as f64 * std::f64::consts::PI * if closed_loop { 2.0 } else { 1.25 };
        let radius = if kind.id == "palace-of-nine-winds" {
            7.0 + index as f64 * 1.1
        } else {
            12.0
        };
        let center = (
            js_round(angle.sin() * radius),
            base_y
                + if kind.id == "palace-of-nine-winds" {
                    index as i32 * 3
                } else if kind.id == "ashen-library-of-salamander-kings" {
                    (index / 2) as i32
                } else {
                    0
                },
            js_round(angle.cos() * radius),
        );
        centers.push(center);
        b.hollow(center, (4, 4, 4), material.shell, material.shell);
        decorate_mythic_room(&mut b, definition, material, center, index);
        if index > 0 {
            connect_mythic_rooms(
                &mut b,
                definition,
                material,
                centers[index - 1],
                center,
                flooded_mythic_room(definition, index - 1),
                flooded_mythic_room(definition, index),
            );
        }
    }
    if closed_loop {
        let first = centers[0];
        let last = centers[centers.len() - 1];
        b.fill(
            first.0.min(last.0),
            base_y,
            first.2 - 1,
            first.0.max(last.0),
            base_y + 2,
            first.2 + 1,
            Block::AIR,
        );
        b.fill(
            last.0 - 1,
            base_y,
            first.2.min(last.2),
            last.0 + 1,
            base_y + 2,
            first.2.max(last.2),
            Block::AIR,
        );
        b.fill(
            first.0.min(last.0),
            base_y - 1,
            first.2 - 1,
            first.0.max(last.0),
            base_y - 1,
            first.2 + 1,
            material.shell,
        );
        b.fill(
            last.0 - 1,
            base_y - 1,
            first.2.min(last.2),
            last.0 + 1,
            base_y - 1,
            first.2.max(last.2),
            material.shell,
        );
        b.fill(
            first.0.min(last.0),
            base_y - 1,
            first.2,
            first.0.max(last.0),
            base_y - 1,
            first.2,
            material.accent,
        );
        b.fill(
            last.0,
            base_y - 1,
            first.2.min(last.2),
            last.0,
            base_y - 1,
            first.2.max(last.2),
            material.accent,
        );
    }
    if underground {
        add_mythic_dungeon_access(&mut b, definition, material, base_y);
    }
    add_mythic_dungeon_silhouette(&mut b, definition, material, &centers, base_y);
    for &(x, y, z) in &centers {
        b.set(x + 3, y + 3, z, material.exceptional);
    }
    for (index, &(x, y, z)) in centers.iter().enumerate() {
        if flooded_mythic_room(definition, index) {
            b.fill(x - 3, y, z - 3, x + 3, y + 2, z + 3, Block::WATER);
        }
    }
    if kind.id == "sunken-court-of-namarra" {
        for index in [5_usize, 6] {
            let (x, y, z) = centers[index];
            b.fill(x - 3, y, z - 3, x + 3, y + 2, z + 3, Block::AIR);
            b.fill(x - 2, y, z - 2, x + 2, y, z + 2, Block::MOONFELT_MYCELIUM);
        }
    }
    if kind.id == "ashen-library-of-salamander-kings" {
        let (x, y, z) = centers[centers.len() - 1];
        b.fill(x - 1, y + 4, z - 1, x + 1, 0, z + 1, Block::EMBERGLASS_ARCHIVE);
        b.fill(x, y + 4, z, x, 1, z, Block::AIR);
    }
    let entrance = centers[0];
    let resident = centers[centers.len() - 1];
    b.landmark(
        entrance.0,
        entrance.1 + 2,
        entrance.2 + 4,
        &format!("dungeon:{}", kind.id),
        definition.layer.name(),
    );
    b.landmark(
        entrance.0,
        entrance.1 + 1,
        entrance.2 + 4,
        &format!("mythic-threshold:{}", definition.id),
        definition.layer.name(),
    );
    b.landmark(
        resident.0,
        resident.1 + 1,
        resident.2,
        &format!("mythic-loot:{}", definition.id),
        definition.layer.name(),
    );
    let resident_tags = vec![
        "mythic-frontier".to_string(),
        format!("legendary:{}", definition.encounter),
        format!("legendary-site:mythic:{}:{},{}", definition.id, origin.0, origin.2),
        "boss".to_string(),
        "nonlethal".to_string(),
        "persistent-lair".to_string(),
    ];
    b.spawn_owned(
        (resident.0, resident.1 + 1, resident.2),
        definition.creature,
        1,
        12,
        &format!("{}-resident", definition.id),
        &resident_tags,
    );
    let proxy = centers[centers.len() / 2];
    b.landmark(
        proxy.0,
        proxy.1 + 2,
        proxy.2,
        &format!("mythic-proxy:{}", definition.id),
        definition.layer.name(),
    );
    for (index, mob) in mythic_ecology(definition.material).iter().enumerate() {
        let chamber_index = usize::min(centers.len() - 2, 1 + index * 2);
        let chamber = centers[chamber_index];
        let tags = vec![
            "mythic-frontier".to_string(),
            "ecology".to_string(),
            format!("stage-{}", usize::min(centers.len() - 1, 2 + index * 2)),
        ];
        b.spawn_owned(
            (chamber.0 + (index as i32 - 1) * 2, chamber.1 + 1, chamber.2),
            mob,
            if index == 1 { 2 } else { 3 },
            6,
            &format!("{}-ecology-{}", definition.id, index + 1),
            &tags,
        );
    }
    b.chest(
        (entrance.0 - 2, entrance.1, entrance.2 - 2),
        "adventure-cache",
        &format!("{}-supplies", definition.id),
        6,
    );
    let loot_seed = format!("{seed}:{},{}:signature", origin.0, origin.2);
    b.simple_chest(
        (resident.0 - 2, resident.1, resident.2 + 2),
        &format!("{}-signature-reward", definition.id),
        &mythic_loot(definition, material, &loot_seed),
    );
    b.finish()
}

fn plan_underground_dungeon(kind: AdventureKind, origin: (i32, i32, i32), seed: &str) -> AdventurePlan {
    let mut b = Builder::new(kind, origin, seed);
    let profile = dungeon_profile(kind.id);
    let base = -16;
    b.fill(-2, 0, 10, 2, 2, 14, profile.shell);
    b.fill(-1, 1, 11, 1, 2, 13, Block::AIR);
    for depth in (base..=-1).rev() {
        b.fill(-2, depth, 10, 2, depth, 14, profile.shell);
        b.fill(-1, depth, 11, 1, depth, 13, Block::AIR);
        b.set(if depth % 2 != 0 { -2 } else { 2 }, depth, 12, profile.light);
    }

    let tiles = dungeon_tiles(kind.id, &format!("{seed}:{},{}", origin.0, origin.2));
    let center = |tile: &DungeonTile| {
        (
            tile.grid_x * 7,
            match tile.stage {
                1 => base,
                2 => base - 2,
                _ => base - 4,
            },
            tile.grid_z * 7,
        )
    };
    for tile in &tiles {
        let (cx, cy, cz) = center(tile);
        chamfered_dungeon_cell(&mut b, (cx, cy, cz), profile.shell, profile.floor);
        match kind.id {
            "rootbound-labyrinth" if tile.grid_x != 0 => b.fill(cx, cy, cz, cx, cy + 3, cz, Block::WILDWOOD_LOG),
            "starless-observatory" if tile.grid_x != 0 => b.set(cx, cy + 3, cz, Block::CRYSTAL_BLOCK),
            "brassdeep-foundry" if tile.grid_x != 0 => {
                b.fill(cx - 1, cy, cz, cx + 1, cy, cz, Block::RIVETED_BRASS);
            }
            "palimpsest-vault" if tile.grid_x != 0 => {
                for offset in [-2, 0, 2] {
                    b.fill(
                        cx + offset,
                        cy,
                        cz - 2,
                        cx + offset,
                        cy + 2,
                        cz + 2,
                        Block::ARCHIVE_SHELF,
                    );
                }
            }
            _ => {}
        }
    }
    for tile in &tiles {
        let (cx, cy, cz) = center(tile);
        let east = tile.east.then(|| {
            tiles.iter().find(|neighbor| {
                neighbor.grid_x == tile.grid_x + 1 && neighbor.grid_z == tile.grid_z && neighbor.stage == tile.stage
            })
        });
        if let Some(Some(neighbor)) = east {
            let (next_x, _, _) = center(neighbor);
            b.fill(cx + 3, cy, cz - 1, next_x - 3, cy + 2, cz + 1, Block::AIR);
        }
        let south = tile.south.then(|| {
            tiles.iter().find(|neighbor| {
                neighbor.grid_x == tile.grid_x && neighbor.grid_z == tile.grid_z + 1 && neighbor.stage == tile.stage
            })
        });
        if let Some(Some(neighbor)) = south {
            let (_, _, next_z) = center(neighbor);
            b.fill(cx - 1, cy, cz + 3, cx + 1, cy + 2, next_z - 3, Block::AIR);
        }
    }

    for (z, floor_y) in [(4, base - 2), (3, base - 3), (-3, base - 4), (-4, base - 5)] {
        for x in -1..=1 {
            b.set(x, floor_y + 1, z, Block::AIR);
            b.set(x, floor_y, z, profile.floor);
            b.set(x, floor_y + 2, z, Block::AIR);
            b.set(x, floor_y + 3, z, Block::AIR);
        }
    }
    let mut stair_ring = Vec::<(i32, i32)>::new();
    for x in -3..=3 {
        stair_ring.push((x, 9));
    }
    for z in 10..=15 {
        stair_ring.push((3, z));
    }
    for x in (-3..=2).rev() {
        stair_ring.push((x, 15));
    }
    for z in (10..=14).rev() {
        stair_ring.push((-3, z));
    }
    for (step, &(stair_x, stair_z)) in stair_ring.iter().take(18).enumerate() {
        let ground_y = -(step as i32);
        b.set(stair_x, ground_y, stair_z, profile.floor);
        for dy in 1..=3 {
            b.set(stair_x, ground_y + dy, stair_z, Block::AIR);
        }
    }
    b.fill(-3, base, 14, -1, base + 2, 14, Block::AIR);
    for (x, y, z) in [
        (-3, base, 7),
        (3, base, 7),
        (-3, base - 2, 0),
        (3, base - 2, 0),
        (-3, base - 4, -7),
        (3, base - 4, -14),
    ] {
        b.set(x, y, z, profile.light);
    }
    b.set(0, base - 1, 4, Block::WROUGHT_IRON_DOOR_CLOSED_LOWER);
    b.set(0, base, 4, Block::WROUGHT_IRON_DOOR_CLOSED_UPPER);
    b.spawn(
        (-2, base, 7),
        profile.mobs[0],
        3,
        5,
        "threshold-encounter",
        &["dungeon", "stage-1", "hostile"],
    );
    b.spawn(
        (3, base - 2, 0),
        profile.mobs[1],
        4,
        6,
        "crossing-encounter-a",
        &["dungeon", "stage-2", "hostile"],
    );
    b.spawn(
        (-3, base - 2, -2),
        profile.mobs[0],
        2,
        5,
        "crossing-encounter-b",
        &["dungeon", "stage-2", "hostile"],
    );
    b.spawn(
        (0, base - 4, -7),
        profile.mobs[2],
        u32::from(!matches!(kind.id, "rootbound-labyrinth" | "palimpsest-vault")) + 1,
        6,
        "vault-guardian",
        &["dungeon", "stage-3", "boss", "hostile"],
    );
    b.chest((4, base - 2, 1), "adventure-cache", "midway-supplies", 5);
    b.chest((0, base - 4, -14), profile.table, "master-vault", 8);
    b.landmark(0, 1, 12, &format!("dungeon:{}", kind.id), "underground");
    b.finish()
}

fn plan_stormglass_citadel(kind: AdventureKind, origin: (i32, i32, i32), seed: &str) -> AdventurePlan {
    let mut b = Builder::new(kind, origin, seed);
    b.fill(-13, 0, -13, 13, 0, 13, Block::SNOWCAP_STONE);
    for edge in -13..=13 {
        b.fill(edge, 1, -13, edge, 5, -13, Block::SNOWCAP_STONE);
        b.fill(edge, 1, 13, edge, 5, 13, Block::SNOWCAP_STONE);
        b.fill(-13, 1, edge, -13, 5, edge, Block::SNOWCAP_STONE);
        b.fill(13, 1, edge, 13, 5, edge, Block::SNOWCAP_STONE);
    }
    b.fill(-2, 1, 13, 2, 4, 13, Block::AIR);
    b.set(-3, 4, 13, Block::CRYSTAL_BLOCK);
    b.set(3, 4, 13, Block::CRYSTAL_BLOCK);
    b.hollow((0, 1, -4), (8, 7, 7), Block::SNOWCAP_STONE, Block::MOON_SLATE);
    b.hollow((0, 8, -7), (5, 7, 5), Block::GLASS, Block::MOON_SLATE);
    for (x, y, z) in [
        (-8, 2, 7),
        (8, 2, 7),
        (-6, 3, -4),
        (6, 3, -4),
        (-3, 10, -7),
        (3, 10, -7),
    ] {
        b.set(x, y, z, Block::CRYSTAL_BLOCK);
    }
    b.spawn(
        (0, 1, 7),
        "cinder-maw",
        3,
        8,
        "gate-pack",
        &["dungeon", "stage-1", "hostile"],
    );
    b.spawn(
        (-3, 2, -3),
        "vaultwing",
        4,
        7,
        "glass-hall-flock",
        &["dungeon", "stage-2", "hostile"],
    );
    b.spawn(
        (3, 5, -6),
        "auric-scarab",
        4,
        5,
        "upper-gallery-scarabs",
        &["dungeon", "stage-2", "hostile"],
    );
    b.spawn(
        (0, 9, -7),
        "ossuary-keeper",
        2,
        6,
        "crown-keepers",
        &["dungeon", "stage-3", "boss", "hostile"],
    );
    b.chest((5, 2, -1), "adventure-cache", "citadel-armory", 6);
    b.chest((0, 9, -10), "stormglass-vault", "stormglass-reliquary", 8);
    b.landmark(0, 1, 12, "dungeon:stormglass-citadel", "surface");
    b.finish()
}

fn plan_bloomrot_cathedral(kind: AdventureKind, origin: (i32, i32, i32), seed: &str) -> AdventurePlan {
    let mut b = Builder::new(kind, origin, seed);
    b.fill(-7, 0, -14, 7, 0, 14, Block::RUNE_STONE);
    b.fill(-14, 0, -5, 14, 0, 5, Block::RUNE_STONE);
    for x in [-7, 7] {
        for (min_z, max_z) in [(-14, -6), (6, 14)] {
            b.fill(x, 1, min_z, x, 9, max_z, Block::MOSS);
        }
    }
    for z in [-14, 14] {
        b.fill(-7, 1, z, 7, 9, z, Block::MOSS);
    }
    for x in [-14, 14] {
        b.fill(x, 1, -5, x, 7, 5, Block::MOSS);
    }
    for z in [-5, 5] {
        for (min_x, max_x) in [(-14, -8), (8, 14)] {
            b.fill(min_x, 1, z, max_x, 7, z, Block::MOSS);
        }
    }
    b.fill(-2, 1, 14, 2, 4, 14, Block::AIR);
    b.fill(-7, 1, -4, -7, 5, 4, Block::AIR);
    b.fill(7, 1, -4, 7, 5, 4, Block::AIR);
    for z in [-10, -4, 2, 8] {
        for x in [-6, 6] {
            b.fill(x, 1, z, x, 8, z, Block::WILDWOOD_LOG);
            b.set(x, 6, z, Block::GLOWSTONE);
        }
    }
    for (x, z) in [
        (-14, -5),
        (-14, 5),
        (14, -5),
        (14, 5),
        (-7, -14),
        (7, -14),
        (-7, 14),
        (7, 14),
    ] {
        b.fill(x, 1, z, x, 10, z, Block::WILDWOOD_LOG);
    }
    b.fill(-2, 1, -13, 2, 4, -10, Block::RUNE_STONE);
    b.set(0, 5, -11, Block::CRYSTAL_BLOCK);
    b.spawn(
        (0, 1, 9),
        "rootwrithe",
        4,
        7,
        "nave-roots",
        &["dungeon", "stage-1", "hostile"],
    );
    b.spawn(
        (-8, 1, 0),
        "cinder-maw",
        3,
        6,
        "west-transept-pack",
        &["dungeon", "stage-2", "hostile"],
    );
    b.spawn(
        (8, 1, 0),
        "vaultwing",
        4,
        6,
        "east-transept-roost",
        &["dungeon", "stage-2", "hostile"],
    );
    b.spawn(
        (0, 1, -9),
        "bellroot-matron",
        1,
        7,
        "altar-matron",
        &["dungeon", "stage-3", "boss", "hostile"],
    );
    b.chest((-10, 1, 0), "adventure-cache", "transept-cache", 6);
    b.chest((0, 2, -12), "bloomrot-vault", "dawn-rose-reliquary", 8);
    b.landmark(0, 1, 13, "dungeon:bloomrot-cathedral", "surface");
    b.finish()
}

fn plan_tiny(kind: AdventureKind, origin: (i32, i32, i32), seed: &str) -> AdventurePlan {
    let mut builder = Builder::new(kind, origin, seed);
    let floor = if matches!(kind.id, "sunwash-tidepool" | "frostbound-bell") {
        Block::LIMESTONE
    } else {
        Block::MOSS
    };
    circular_floor(&mut builder, 4, floor);
    match kind.id {
        "wind-carved-waystone" => {
            builder.fill(0, 1, 0, 0, 4, 0, Block::MOON_SLATE);
            builder.set(0, 3, -1, Block::GLOWSTONE);
        }
        "foxfire-cairn" => {
            builder.fill(-1, 1, -1, 1, 1, 1, Block::COBBLESTONE);
            builder.fill(0, 2, 0, 0, 3, 0, Block::RUNE_STONE);
            builder.set(0, 4, 0, Block::GLOWSTONE);
            builder.spawn(
                (1, 1, 1),
                "rootwrithe",
                1,
                3,
                "cairn-rootwrithe",
                &["poi-resident", "defensive"],
            );
        }
        "fallen-star-camp" => {
            builder.fill(-2, 1, 1, 2, 1, 2, Block::PLANKS);
            builder.fill(-2, 2, 2, 2, 3, 2, Block::WILDWOOD_LOG);
            builder.set(0, 1, -1, Block::CRYSTAL_BLOCK);
            builder.chest((2, 1, 1), "adventure-cache", "prospector-box", 4);
        }
        "reedwatch-platform" => {
            for x in [-2, 2] {
                for z in [-2, 2] {
                    builder.fill(x, 1, z, x, 4, z, Block::BIRCH_LOG);
                }
            }
            builder.fill(-2, 4, -2, 2, 4, 2, Block::PLANKS);
            builder.set(-2, 5, 0, Block::TORCH);
            builder.set(2, 5, 0, Block::TORCH);
        }
        "frostbound-bell" => {
            builder.fill(-2, 1, 0, -2, 4, 0, Block::SNOWCAP_STONE);
            builder.fill(2, 1, 0, 2, 4, 0, Block::SNOWCAP_STONE);
            builder.fill(-2, 4, 0, 2, 4, 0, Block::RIVETED_BRASS);
            builder.fill(0, 2, 0, 0, 3, 0, Block::RIVETED_BRASS);
            builder.set(0, 1, 0, Block::DEEPGEAR_LANTERN);
        }
        "sunwash-tidepool" => {
            for x in -3_i32..=3 {
                for z in -3_i32..=3 {
                    let distance = x * x + z * z;
                    if distance <= 9 {
                        builder.set(
                            x,
                            if distance <= 4 { -1 } else { 0 },
                            z,
                            if distance <= 4 {
                                Block::WATER
                            } else {
                                Block::TEMPLE_SANDSTONE
                            },
                        );
                    }
                }
            }
            builder.set(0, -2, 0, Block::GLOWSTONE);
        }
        "mushroom-circle" => {
            for (x, z) in [
                (3, 0),
                (2, 2),
                (1, 3),
                (-1, 3),
                (-2, 2),
                (-3, 0),
                (-2, -2),
                (-1, -3),
                (1, -3),
                (2, -2),
            ] {
                builder.set(x, 1, z, Block::MUSHROOM_CAP);
            }
            builder.set(0, 1, 0, Block::WILDWOOD_STOOL);
        }
        "abandoned-surveyor-camp" => {
            builder.fill(-2, 1, 1, 2, 1, 2, Block::PLANKS);
            builder.fill(-2, 2, 2, 2, 3, 2, Block::WILDWOOD_LOG);
            builder.set(-1, 1, -1, Block::CARTOGRAPHY_TABLE);
            builder.set(1, 1, -1, Block::HEARTH_FIREPLACE);
            builder.chest((2, 1, 1), "adventure-cache", "surveyor-supplies", 4);
        }
        _ => {}
    }
    builder.landmark(0, 1, 0, &format!("adventure-poi:{}", kind.id), "surface");
    builder.finish()
}

fn circular_floor(builder: &mut Builder<'_>, radius: i32, block: u16) {
    for x in -radius..=radius {
        for z in -radius..=radius {
            if x * x + z * z <= radius * radius {
                builder.set(x, 0, z, block);
            }
        }
    }
}

fn ellipse_floor(builder: &mut Builder<'_>, y: i32, rx: i32, rz: i32, block: u16) {
    for x in -rx..=rx {
        for z in -rz..=rz {
            if f64::from(x * x) / f64::from(rx * rx) + f64::from(z * z) / f64::from(rz * rz) <= 1.08 {
                builder.set(x, y, z, block);
            }
        }
    }
}

fn broken_arc(builder: &mut Builder<'_>, radius: i32, min_y: i32, max_y: i32, block: u16, seed: &str) {
    for x in -radius..=radius {
        for z in -radius..=radius {
            let distance = f64::from(x * x + z * z).sqrt();
            if (distance - f64::from(radius)).abs() > 0.7 {
                continue;
            }
            let height = min_y
                + (hash_unit(seed, &format!("observatory-broken-arc:{x},{z}")) * f64::from(max_y - min_y + 1)).floor()
                    as i32;
            if hash_unit(seed, &format!("observatory-broken-arc:gap:{x},{z}")) < 0.16 {
                continue;
            }
            builder.fill(x, min_y, z, x, height, z, block);
        }
    }
}

fn plan_medium(kind: AdventureKind, origin: (i32, i32, i32), seed: &str) -> AdventurePlan {
    let mut b = Builder::new(kind, origin, seed);
    let floor = if matches!(kind.id, "sunken-caravan" | "rattlekin-totem-ring" | "emberwatch-tower") {
        Block::SUNBAKED_CLAY
    } else {
        Block::MOSS
    };
    circular_floor(&mut b, 7, floor);
    match kind.id {
        "moonberry-witch-garden" => {
            for edge in -6..=6 {
                b.set(edge, 1, -6, Block::WILDWOOD_FENCE);
                b.set(edge, 1, 6, Block::WILDWOOD_FENCE);
                b.set(-6, 1, edge, Block::WILDWOOD_FENCE);
                b.set(6, 1, edge, Block::WILDWOOD_FENCE);
            }
            for (x, z) in [(-3, -3), (0, -3), (3, -3), (-3, 0), (3, 0), (-3, 3), (0, 3), (3, 3)] {
                b.set(x, 1, z, Block::MOONBERRY_BUSH_RIPE);
            }
            b.set(0, 1, 0, Block::ALCHEMY_STAND);
            b.chest((0, 1, 4), "adventure-cache", "garden-formulary", 5);
            b.spawn(
                (0, 1, -2),
                "rootwrithe",
                2,
                5,
                "hedge-keepers",
                &["poi-guardian", "defensive"],
            );
        }
        "rattlekin-totem-ring" => {
            for (x, z) in [(-5, 0), (5, 0), (0, -5), (0, 5)] {
                b.fill(x, 1, z, x, 4, z, Block::SUNBAKED_CLAY);
                b.set(x, 5, z, Block::GLOWSTONE);
            }
            b.fill(-2, 1, -2, 2, 1, 2, Block::LIMESTONE);
            b.spawn(
                (0, 2, 0),
                "rattlekin",
                3,
                5,
                "rattlekin-circle",
                &["poi-resident", "hostile"],
            );
            b.chest((0, 1, 3), "adventure-cache", "totem-offerings", 5);
        }
        "skyglass-observatory" => {
            ellipse_floor(&mut b, 0, 7, 6, Block::RUNE_STONE);
            broken_arc(&mut b, 6, 1, 5, Block::STONE_BRICK, seed);
            for (x, z) in [(-4, -3), (4, -3), (-5, 2), (5, 2)] {
                b.fill(x, 1, z, x, 4, z, Block::STONE_BRICK);
            }
            for (x, y, z) in [(-3, 4, -2), (-2, 5, -3), (0, 6, -4), (2, 5, -3), (3, 4, -2)] {
                b.set(x, y, z, Block::GLASS);
            }
            b.fill(-3, 1, 1, 3, 1, 4, Block::STONE_BRICK);
            b.fill(-2, 2, 2, 2, 2, 4, Block::STONE_BRICK);
            b.fill(0, 1, -1, 0, 4, -1, Block::RIVETED_BRASS);
            b.fill(0, 4, -4, 0, 4, 1, Block::GLASS);
            b.set(0, 3, -1, Block::CRYSTAL_BLOCK);
            b.chest((4, 1, 3), "adventure-cache", "observer-locker", 5);
            b.spawn((0, 5, 0), "vaultwing", 2, 4, "lens-roost", &["poi-resident", "hostile"]);
        }
        "overgrown-aqueduct" => {
            for x in [-6, -2, 2, 6] {
                b.fill(x, 1, -2, x, 5, 2, Block::COBBLESTONE);
                b.fill(x - 1, 4, -2, x + 1, 5, 2, Block::MOSS);
            }
            b.fill(-7, 6, -1, 7, 6, 1, Block::COBBLESTONE);
            b.fill(-6, 7, 0, 6, 7, 0, Block::WATER);
            b.chest((0, 1, 3), "adventure-cache", "aqueduct-cache", 4);
        }
        "sunken-caravan" => {
            for offset in [-5, 0, 5] {
                b.fill(offset - 2, 1, -1, offset + 2, 2, 2, Block::PLANKS);
                b.set(offset - 2, 1, 3, Block::WILDWOOD_LOG);
                b.set(offset + 2, 1, 3, Block::WILDWOOD_LOG);
            }
            b.set(0, 3, 0, Block::DEEPGEAR_LANTERN);
            b.chest((5, 2, 0), "adventure-cache", "caravan-strongbox", 6);
            b.spawn(
                (-3, 1, -2),
                "auric-scarab",
                4,
                6,
                "caravan-scavengers",
                &["poi-resident", "defensive"],
            );
        }
        "emberwatch-tower" => {
            for y in 0..=9_i32 {
                let radius: i32 = if y < 3 {
                    4
                } else if y < 7 {
                    3
                } else {
                    2
                };
                for x in -radius..=radius {
                    for z in -radius..=radius {
                        if x.abs() == radius && z.abs() == radius {
                            continue;
                        }
                        if y == 0 {
                            b.set(x, y, z, Block::RIVETED_BRASS);
                        } else if x.abs() == radius || z.abs() == radius {
                            b.set(
                                x,
                                y,
                                z,
                                if (x + z + y) % 4 == 0 {
                                    Block::RIVETED_BRASS
                                } else {
                                    Block::BASALT
                                },
                            );
                        } else {
                            b.set(x, y, z, Block::AIR);
                        }
                    }
                }
            }
            for y in [3, 7] {
                b.fill(-5, y, -1, 5, y, 1, Block::RIVETED_BRASS);
            }
            for (x, z) in [(-2, -2), (-2, 2), (2, -2), (2, 2)] {
                b.fill(x, 10, z, x, 11, z, Block::BASALT);
            }
            for y in [2, 5, 8] {
                b.set(-3, y, 0, Block::GLOWSTONE);
                b.set(3, y, 0, Block::GLOWSTONE);
            }
            b.chest((0, 8, 0), "adventure-cache", "watch-captain-cache", 6);
            b.spawn(
                (0, 1, 0),
                "cinder-maw",
                2,
                4,
                "tower-hounds",
                &["poi-guardian", "hostile"],
            );
        }
        "pilgrim-bathhouse" => {
            ellipse_floor(&mut b, 0, 7, 6, Block::LIMESTONE);
            for x in -5..=1 {
                for z in -3..=3 {
                    if f64::from((x + 2) * (x + 2)) / 10.0 + f64::from(z * z) / 8.0 < 1.0 {
                        b.set(x, 0, z, Block::WATER);
                    }
                }
            }
            for x in 0..=5 {
                for z in -2..=4 {
                    if f64::from((x - 2) * (x - 2)) / 9.0 + f64::from((z - 1) * (z - 1)) / 8.0 < 1.0 {
                        b.set(x, 0, z, Block::WATER);
                    }
                }
            }
            for (x, z, height) in [(-6, -4, 5), (5, -4, 4), (-6, 4, 4), (6, 4, 5), (0, -5, 3)] {
                b.fill(x, 1, z, x, height, z, Block::BIRCH_LOG);
            }
            for x in -6_i32..=6 {
                if x.abs() > 2 {
                    b.set(x, 5, -4, Block::GLASS);
                }
            }
            for (x, z) in [(-4, 0), (-1, 1), (2, 0), (4, 2)] {
                b.set(x, 1, z, Block::LIMESTONE);
            }
            for (x, z) in [(-6, 1), (6, 0), (-4, 4), (4, -3)] {
                b.set(x, 1, z, Block::LUMENREED);
            }
            b.set(-5, 0, 0, Block::GLOWSTONE);
            b.set(4, 0, 1, Block::GLOWSTONE);
            b.chest((0, 1, 5), "adventure-cache", "pilgrim-locker", 4);
        }
        _ => {
            for x in [-5, -3, -1, 1, 3, 5] {
                b.fill(x, 1, 0, x, 5, 0, Block::MOONBOUGH_LOG);
                b.fill(x, 2, 0, x, 4, 0, Block::GLASS);
            }
            b.fill(-6, 5, 0, 6, 5, 0, Block::MOONBOUGH_LOG);
            for x in [-5, -1, 3] {
                b.set(x, 1, -2, Block::MOONPETAL);
            }
            b.chest((0, 1, 4), "adventure-cache", "harp-listener-cache", 5);
            b.spawn(
                (0, 2, 0),
                "vaultwing",
                2,
                5,
                "harp-vaultwings",
                &["poi-resident", "skittish"],
            );
        }
    }
    b.landmark(0, 1, 0, &format!("adventure-poi:{}", kind.id), "surface");
    b.finish()
}

fn is_waypost(id: &str) -> bool {
    matches!(
        id,
        "lantern-piehouse"
            | "switchback-tollcamp"
            | "tideglass-embassy"
            | "sugarwind-teahouse"
            | "moonpost-listening-tree"
            | "skyshaft-depot"
    )
}

fn waypost_resident(id: &str) -> (&'static str, &'static str, &'static str, &'static str) {
    match id {
        "lantern-piehouse" => ("hobbit-merchant", "Merry Bramblebun", "brewer", "hobbits"),
        "switchback-tollcamp" => ("goblin-alchemist", "Tikket Brassnose", "goblin-alchemist", "goblins"),
        "tideglass-embassy" => (
            "atlantian-pearlbroker",
            "Nerissa Foamquill",
            "atlantian-pearlbroker",
            "atlantians",
        ),
        "sugarwind-teahouse" => (
            "sugarcourt-sweetbroker",
            "Praline Wispwhisk",
            "sugarcourt-sweetbroker",
            "sugarcourt",
        ),
        "moonpost-listening-tree" => (
            "wood-elf-moonbroker",
            "Lethren Silverleaf",
            "wood-elf-moonbroker",
            "wood-elves",
        ),
        _ => ("dwarf-provisioner", "Dagna Brightbolt", "dwarf-provisioner", "dwarves"),
    }
}

fn plan_waypost(kind: AdventureKind, origin: (i32, i32, i32), seed: &str) -> AdventurePlan {
    let mut b = Builder::new(kind, origin, seed);
    let floor = match kind.id {
        "switchback-tollcamp" => Block::SUNBAKED_CLAY,
        "sugarwind-teahouse" => Block::BOILED_SUGARBRICK,
        "tideglass-embassy" => Block::LIMESTONE,
        "skyshaft-depot" => Block::DEEPGEAR_BRICK,
        _ => Block::MOSS,
    };
    circular_floor(&mut b, 8, floor);
    match kind.id {
        "lantern-piehouse" => {
            b.hollow((0, 1, 0), (5, 4, 4), Block::WAYFARER_CANVAS, Block::PLANKS);
            b.fill(-2, 1, -4, 2, 3, -4, Block::AIR);
            b.fill(-5, 5, -4, 5, 5, 4, Block::HOBBIT_THATCH);
            b.set(-3, 1, 1, Block::HEARTH_FIREPLACE);
            b.set(2, 1, 1, Block::WILDWOOD_TABLE);
            b.set(0, 1, -6, Block::WILDWOOD_STOOL);
            b.set(3, 2, -4, Block::DEEPGEAR_LANTERN);
        }
        "switchback-tollcamp" => {
            b.fill(-6, 1, -1, 6, 1, 1, Block::STORYBOOK_BRICK);
            b.fill(-5, 1, -4, -1, 4, -1, Block::GOBLIN_BRASSWORK);
            b.fill(-4, 2, -3, -2, 3, 0, Block::AIR);
            b.fill(2, 1, 0, 2, 7, 0, Block::RIVETED_BRASS);
            b.fill(2, 6, -3, 2, 6, 3, Block::WAYFARER_CANVAS);
            b.set(2, 7, -3, Block::WHISPERGLASS);
            b.set(-3, 1, -2, Block::ALCHEMY_STAND);
        }
        "tideglass-embassy" => {
            b.fill(-6, 0, -5, 6, 0, 5, Block::STORYBOOK_BRICK);
            b.fill(-4, 0, -3, 4, 0, 2, Block::WATER);
            for x in [-6, 6] {
                for z in [-5, 5] {
                    b.fill(x, 1, z, x, 5, z, Block::LIMESTONE);
                }
            }
            b.fill(-6, 5, -5, 6, 5, 5, Block::GLASS);
            for (x, z) in [(-4, -3), (4, -3), (-4, 2), (4, 2)] {
                b.set(x, 0, z, Block::WHISPERGLASS);
            }
            b.set(0, 1, 4, Block::WILDWOOD_TABLE);
        }
        "sugarwind-teahouse" => {
            b.hollow((0, 1, 0), (5, 4, 5), Block::BOILED_SUGARBRICK, Block::SUGARPLUM_GRASS);
            b.fill(-2, 1, -5, 2, 3, -5, Block::AIR);
            for (x, z) in [(-4, -4), (4, -4), (-4, 4), (4, 4)] {
                b.fill(x, 5, z, x, 7, z, Block::CANDYWOOD_LOG);
            }
            b.fill(-5, 5, -5, 5, 5, 5, Block::WAYFARER_CANVAS);
            b.set(-2, 1, 1, Block::SUGARWORKS);
            b.set(2, 1, 1, Block::WILDWOOD_TABLE);
            b.set(0, 2, -5, Block::WHISPERGLASS);
        }
        "moonpost-listening-tree" => {
            b.fill(0, 1, 0, 0, 9, 0, Block::MOONBOUGH_LOG);
            for (x, y, z) in [(-5, 7, 0), (5, 7, 0), (0, 8, -5), (0, 8, 5)] {
                b.fill(0.min(x), y, 0.min(z), 0.max(x), y, 0.max(z), Block::MOONBOUGH_LOG);
                b.set(x, y, z, Block::WHISPERGLASS);
            }
            b.fill(-4, 1, -4, 4, 1, 4, Block::STORYBOOK_BRICK);
            b.set(-2, 2, 0, Block::TOME_DISPLAY);
            b.set(2, 2, 0, Block::MOONBOUGH_CHAIR);
        }
        _ => {
            b.hollow((0, 1, 0), (6, 5, 5), Block::DEEPGEAR_BRICK, Block::RIVETED_BRASS);
            b.fill(-2, 1, -5, 2, 4, -5, Block::AIR);
            b.fill(0, 1, 0, 0, 9, 0, Block::AIR);
            b.fill(-1, 1, -1, 1, 1, 1, Block::WHISPERGLASS);
            for x in [-6, 6] {
                b.fill(x, 1, -5, x, 8, -5, Block::RIVETED_BRASS);
                b.set(x, 8, -5, Block::DEEPGEAR_LANTERN);
            }
            b.set(-3, 1, 2, Block::GEAR_TABLE);
            b.set(3, 1, 2, Block::SEALED_BARREL);
        }
    }
    let (mob, name, profession, faction) = waypost_resident(kind.id);
    let suffix = format!("{}-{}", origin.0, origin.2);
    let mut tags = vec![
        "poi-resident".to_string(),
        "aligned:true".to_string(),
        "outpost-merchant".to_string(),
        "outpost-guide".to_string(),
        format!("settlement:waypost-{}-{suffix}", kind.id),
        format!("resident:waypost-{}-{suffix}-keeper", kind.id),
        format!("name:{name}"),
        format!("profession:{profession}"),
        format!("faction:{faction}"),
    ];
    let (keeper_z, radius) = if kind.id == "lantern-piehouse" {
        (-3, 0)
    } else {
        (-1, 1)
    };
    if kind.id == "lantern-piehouse" {
        tags.push("authored-interior-spawn".to_string());
    }
    b.spawn_owned((0, 1, keeper_z), mob, 1, radius, &format!("{}-keeper", kind.id), &tags);
    b.chest((4, 1, 3), "adventure-cache", &format!("{}-traveller-cache", kind.id), 5);
    b.landmark(0, 2, 0, &format!("adventure-poi:{}", kind.id), "surface");
    b.finish()
}

fn plan_creature_poi(kind: AdventureKind, origin: (i32, i32, i32), seed: &str) -> AdventurePlan {
    let mut b = Builder::new(kind, origin, seed);
    circular_floor(
        &mut b,
        12,
        if kind.id == "clockwork-burrow" {
            Block::SNOWCAP_STONE
        } else {
            Block::MOSS
        },
    );
    if kind.id == "whistlekite-roost" {
        b.fill(-4, 1, -4, 4, 7, 4, Block::MOON_SLATE);
        b.fill(-3, 2, -3, 3, 7, 3, Block::AIR);
        b.fill(-7, 8, -7, 7, 8, 7, Block::WAYFARER_CANVAS);
        b.fill(-5, 8, -5, 5, 8, 5, Block::AIR);
        for (x, z) in [(-9, 0), (9, 0), (0, -9), (0, 9)] {
            b.fill(x, 1, z, x, 6, z, Block::WILDWOOD_LOG);
            b.set(x, 7, z, Block::WHISPERGLASS);
        }
        b.spawn(
            (0, 11, 0),
            "mossback-kite",
            4,
            8,
            "roost-kites",
            &["poi-resident", "skittish", "adventure-airborne"],
        );
        b.chest((0, 2, 0), "adventure-cache", "roost-offerings", 6);
    } else {
        for x in -9_i32..=9 {
            for z in -6_i32..=6 {
                let ellipse = f64::from(x * x) / 81.0 + f64::from(z * z) / 36.0;
                if ellipse > 1.12 {
                    continue;
                }
                let shell = ellipse > 0.72;
                for y in 1..=4 {
                    b.set(
                        x,
                        y,
                        z,
                        if shell {
                            if (x + z) % 4 == 0 {
                                Block::RIVETED_BRASS
                            } else {
                                Block::DEEPGEAR_BRICK
                            }
                        } else {
                            Block::AIR
                        },
                    );
                }
                if shell && hash_unit(seed, &format!("hull-collapse:{x},{z}")) < 0.22 {
                    b.set(x, 4, z, Block::AIR);
                }
            }
        }
        for (x, z) in [(-7, -4), (-3, -6), (2, -6), (7, -3), (-8, 2), (8, 2), (-4, 5), (4, 5)] {
            b.fill(x, 1, z, x, 5, z, Block::RIVETED_BRASS);
        }
        for (x, z) in [(-5, 5), (0, 6), (5, 5)] {
            b.set(x, 3, z, Block::WHISPERGLASS);
        }
        b.fill(-2, 1, 5, 2, 3, 7, Block::AIR);
        b.fill(-8, 1, -2, -5, 2, 1, Block::AIR);
        for (x, z) in [(-10, -4), (10, -2), (-7, 7), (7, 7)] {
            b.set(x, 1, z, Block::RIVETED_BRASS);
            b.set(x, 2, z, Block::STORYBOOK_BRICK);
        }
        b.set(-5, 1, 0, Block::GEAR_TABLE);
        b.set(5, 1, 0, Block::HEARTH_FIREPLACE);
        b.spawn(
            (0, 1, 0),
            "clockwork-marmot",
            5,
            7,
            "burrow-colony",
            &["poi-resident", "gentle"],
        );
        b.chest((0, 1, -4), "adventure-cache", "surveyor-toolbox", 6);
    }
    b.landmark(0, 2, 0, &format!("adventure-poi:{}", kind.id), "surface");
    b.finish()
}

fn plan_large(kind: AdventureKind, origin: (i32, i32, i32), seed: &str) -> AdventurePlan {
    let mut b = Builder::new(kind, origin, seed);
    circular_floor(
        &mut b,
        12,
        if kind.id == "saltwind-lighthouse" {
            Block::LIMESTONE
        } else {
            Block::MOSS
        },
    );
    match kind.id {
        "shattered-colossus" => {
            for x in -8..=-2 {
                for y in 1..=7 {
                    for z in -4..=4 {
                        let dx = f64::from(x + 5) / 3.7;
                        let dy = f64::from(y - 4) / 3.8;
                        let dz = f64::from(z) / 4.4;
                        let radius = dx * dx + dy * dy + dz * dz;
                        if (0.52..=1.08).contains(&radius) {
                            b.set(x, y, z, Block::DEEPSTONE);
                        }
                    }
                }
            }
            b.fill(-8, 2, -4, -6, 3, -4, Block::CRYSTAL_BLOCK);
            b.fill(-5, 1, -2, -3, 3, 2, Block::AIR);
            for x in 0_i32..=10 {
                let width = 1.max(3 - x / 4);
                b.fill(
                    x,
                    1,
                    -width,
                    x,
                    2 + i32::from(x % 4 == 0),
                    width,
                    Block::TEMPLE_SANDSTONE,
                );
                if x % 3 == 1 {
                    b.set(x, 3, width, Block::DEEPSTONE);
                }
            }
            for (x, z, len) in [(9, -4, 4), (10, -2, 5), (10, 0, 5), (9, 2, 4)] {
                b.fill(x, 1, z, x + len, 1, z, Block::TEMPLE_SANDSTONE);
            }
            for (x, z) in [(-10, -5), (-9, 5), (-1, -5), (4, 4), (12, 2)] {
                b.set(x, 1, z, Block::MOSS);
            }
            b.chest((-4, 2, 0), "adventure-cache", "colossus-memory", 7);
            b.spawn(
                (5, 2, 0),
                "ossuary-keeper",
                2,
                8,
                "colossus-keepers",
                &["poi-guardian", "hostile"],
            );
        }
        "wildwood-bridgehouse" => {
            b.fill(-12, 1, -3, 12, 1, 3, Block::PLANKS);
            for x in [-12, -8, -4, 0, 4, 8, 12] {
                b.fill(x, 0, -3, x, 5, -3, Block::WILDWOOD_LOG);
                b.fill(x, 0, 3, x, 5, 3, Block::WILDWOOD_LOG);
                if x % 8 == 0 {
                    b.set(x, 3, -2, Block::TORCH);
                    b.set(x, 3, 2, Block::TORCH);
                }
            }
            b.fill(-12, 5, -3, 12, 5, 3, Block::WILDWOOD_LEAVES);
            b.hollow((0, 2, 0), (4, 3, 3), Block::PLANKS, Block::PLANKS);
            b.chest((2, 2, 1), "adventure-cache", "bridge-tollbox", 6);
        }
        "starfall-amphitheater" => {
            for ring in (5..=11).rev().step_by(2) {
                for x in -ring..=ring {
                    for z in -ring..=ring {
                        if (f64::from(x * x + z * z).sqrt() - f64::from(ring)).abs() < 0.75 && z >= -2 {
                            b.set(x, (11 - ring) / 2 + 1, z, Block::LIMESTONE);
                        }
                    }
                }
            }
            b.fill(-5, 1, -9, 5, 1, -4, Block::RUNE_STONE);
            b.fill(0, 2, -7, 0, 5, -7, Block::CRYSTAL_BLOCK);
            for (x, z) in [(-8, 0), (8, 0), (-6, 6), (6, 6)] {
                b.set(x, 2, z, Block::GLOWSTONE);
            }
            b.chest((0, 2, -5), "adventure-cache", "performer-cache", 7);
            b.spawn(
                (0, 2, 2),
                "bellroot-matron",
                1,
                8,
                "amphitheater-matron",
                &["poi-resident", "defensive"],
            );
        }
        _ => {
            b.hollow((0, 1, 0), (6, 13, 6), Block::LIMESTONE, Block::TEMPLE_SANDSTONE);
            for y in [3, 6, 9] {
                for x in [-6, 6] {
                    b.set(x, y, 0, Block::GLASS);
                }
            }
            b.fill(-7, 13, -7, 7, 13, 7, Block::STONE_BRICK);
            for x in [-6, 6] {
                for z in [-6, 6] {
                    b.fill(x, 14, z, x, 17, z, Block::GLASS);
                }
            }
            b.fill(-6, 17, -6, 6, 17, 6, Block::STONE_BRICK);
            b.set(0, 15, 0, Block::GLOWSTONE);
            b.set(-3, 1, 1, Block::WILDWOOD_TABLE);
            b.set(-4, 1, 1, Block::HEARTH_CHAIR);
            b.chest((3, 1, 2), "adventure-cache", "keeper-sea-chest", 7);
            b.spawn(
                (0, 14, 0),
                "vaultwing",
                2,
                5,
                "beacon-roost",
                &["poi-resident", "skittish"],
            );
        }
    }
    b.landmark(0, 2, 0, &format!("adventure-poi:{}", kind.id), "surface");
    b.finish()
}

fn slug(value: &str) -> String {
    let mut output = String::with_capacity(value.len().min(72));
    let mut dash = false;
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() {
            if dash && !output.is_empty() && output.len() < 72 {
                output.push('-');
            }
            dash = false;
            if output.len() < 72 {
                output.push(byte.to_ascii_lowercase() as char);
            }
        } else {
            dash = true;
        }
    }
    output.truncate(72);
    output
}

fn hash_unit(seed: &str, salt: &str) -> f64 {
    let text = format!("{seed}:{salt}");
    let mut hash = 2_166_136_261_u32;
    for unit in text.encode_utf16() {
        hash = (hash ^ u32::from(unit)).wrapping_mul(16_777_619);
    }
    hash ^= hash >> 16;
    hash = hash.wrapping_mul(0x85eb_ca6b);
    hash ^= hash >> 13;
    hash ^= hash >> 16;
    f64::from(hash) / 4_294_967_296.0
}

fn loot_hash_unit(seed: &str, salt: &str) -> f64 {
    let text = format!("{seed}:{salt}");
    let mut hash = 2_166_136_261_u32;
    for unit in text.encode_utf16() {
        hash = (hash ^ u32::from(unit)).wrapping_mul(16_777_619);
    }
    hash ^= hash >> 16;
    hash = hash.wrapping_mul(0x85eb_ca6b);
    hash ^= hash >> 13;
    hash = hash.wrapping_mul(0xc2b2_ae35);
    hash ^= hash >> 16;
    f64::from(hash) / 4_294_967_296.0
}

fn random_integer(seed: &str, salt: &str, min: u32, max: u32) -> u32 {
    min + (loot_hash_unit(seed, salt) * f64::from(max - min + 1)).floor() as u32
}

type BonusLoot = (&'static str, f64, u32, u32, Option<u32>);

fn roll_structure_loot(table: &str, seed: &str, rolls: u32) -> Vec<LootStack> {
    let (entries, bonus): (&[LootEntry], Option<BonusLoot>) = match table {
        "adventure-cache" => (ADVENTURE_LOOT, Some(("tome-blinkstep", 0.035, 1, 1, None))),
        "rootbound-vault" => (ROOTBOUND_LOOT, Some(("dawnthread-saber", 0.075, 1, 1, None))),
        "starless-vault" => (STARLESS_LOOT, Some(("briarheart-crook", 0.09, 1, 1, Some(6_000)))),
        "brassdeep-vault" => (BRASSDEEP_LOOT, Some(("deepdelvers-promise", 0.06, 1, 1, None))),
        "stormglass-vault" => (STORMGLASS_LOOT, Some(("briarheart-crook", 0.055, 1, 1, Some(6_000)))),
        "bloomrot-vault" => (BLOOMROT_LOOT, Some(("dawnthread-saber", 0.05, 1, 1, None))),
        "palimpsest-vault" => (PALIMPSEST_LOOT, Some(("briarheart-crook", 0.065, 1, 1, Some(6_000)))),
        _ => (ADVENTURE_LOOT, Some(("tome-blinkstep", 0.035, 1, 1, None))),
    };
    let total_weight = entries.iter().map(|entry| entry.weight).sum::<u32>();
    let mut output: Vec<LootStack> = Vec::new();
    let mut add = |entry: LootStack| {
        if let Some(current) = output
            .iter_mut()
            .find(|current| current.item == entry.item && current.durability == entry.durability)
        {
            current.count += entry.count;
        } else {
            output.push(entry);
        }
    };
    for roll in 0..rolls.min(12) {
        let mut cursor = loot_hash_unit(seed, &format!("{table}:roll:{roll}")) * f64::from(total_weight);
        let mut selected = entries.last().expect("loot table is non-empty");
        for entry in entries {
            cursor -= f64::from(entry.weight);
            if cursor <= 0.0 {
                selected = entry;
                break;
            }
        }
        add(LootStack {
            item: selected.item,
            count: random_integer(seed, &format!("{table}:count:{roll}"), selected.min, selected.max),
            durability: selected.durability,
            chance: None,
            min: selected.min,
            max: selected.max,
            weight: Some(selected.weight),
        });
    }
    match bonus {
        Some((item, chance, min, max, durability)) if loot_hash_unit(seed, &format!("{table}:bonus:0")) < chance => {
            add(LootStack {
                item,
                count: random_integer(seed, &format!("{table}:bonus-count:0"), min, max),
                durability,
                chance: Some(chance),
                min,
                max,
                weight: None,
            });
        }
        _ => {}
    }
    output
}

pub(crate) fn rolled_chest_marker(
    key: String,
    id: &str,
    position: (i32, i32, i32),
    table: &str,
    seed: &str,
    rolls: u32,
) -> MarkerRow {
    let loot_json = roll_structure_loot(table, seed, rolls)
        .iter()
        .map(|entry| {
            let mut fields = Vec::<String>::new();
            if let Some(chance) = entry.chance {
                fields.push(format!("\"chance\":{chance}"));
            }
            fields.push(format!("\"count\":{}", entry.count));
            if let Some(durability) = entry.durability {
                fields.push(format!("\"durability\":{durability}"));
            }
            fields.push(format!("\"itemKey\":\"{}\"", entry.item));
            fields.push(format!("\"max\":{}", entry.max));
            fields.push(format!("\"min\":{}", entry.min));
            if let Some(weight) = entry.weight {
                fields.push(format!("\"weight\":{weight}"));
            }
            format!("{{{}}}", fields.join(","))
        })
        .collect::<Vec<_>>()
        .join(",");
    MarkerRow {
        key: key.clone(),
        canonical_json: format!(
            "[\"{key}\",{{\"id\":\"{id}\",\"loot\":[{loot_json}],\"lootTable\":\"{table}\",\"position\":{{\"x\":{},\"y\":{},\"z\":{}}},\"type\":\"chest\"}}]",
            position.0, position.1, position.2
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn coast_candidate_order_matches_catalogue_contract() {
        assert_eq!(COAST_POIS[3].id, "tideglass-embassy");
        assert_eq!(COAST_POIS.len(), 6);
    }

    #[test]
    fn tiny_plan_is_stable_and_renderer_neutral() {
        let plan = plan_tiny(kind("mushroom-circle", TINY), (8, 40, -8), "fixture");
        assert_eq!(plan.id, "adventure:mushroom-circle:8,-8");
        assert_eq!(plan.placements.len(), 60);
        assert_eq!(plan.markers.len(), 1);
    }
}
