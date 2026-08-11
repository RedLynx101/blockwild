use crate::contract::{BiomeId, Block, CHUNK_SIZE, MarkerRow};
use crate::generator::TerrainGeneratorV18;
use blockwild_types::{fnv1a_utf16, hash2};

const CELL_CHUNKS: i32 = 96;
const REACH: i32 = 20;

#[derive(Clone, Copy)]
struct Definition {
    id: &'static str,
    kind: &'static str,
    habitats: &'static [&'static str],
    clue_count: usize,
}

const DEFINITIONS: [Definition; 21] = [
    Definition {
        id: "walking-spring",
        kind: "ilyr-virebloom",
        habitats: &["meadow", "flower-meadow", "wildwood", "river", "glimmerwood"],
        clue_count: 3,
    },
    Definition {
        id: "reef-that-swims",
        kind: "thalassene",
        habitats: &["ocean", "deep-ocean", "lumen-trench"],
        clue_count: 3,
    },
    Definition {
        id: "oath-under-stone",
        kind: "orichalc",
        habitats: &["highlands", "snowcap-range", "badlands", "glimmerwood"],
        clue_count: 4,
    },
    Definition {
        id: "where-storms-run",
        kind: "varkesh-stormmane",
        habitats: &["highlands", "snowcap-range", "cloudreed-glen"],
        clue_count: 6,
    },
    Definition {
        id: "red-banner",
        kind: "kharza",
        habitats: &["badlands", "savanna", "highlands"],
        clue_count: 5,
    },
    Definition {
        id: "sovereign-feast",
        kind: "sugarwake-sovereign",
        habitats: &["sugarplum-vale"],
        clue_count: 4,
    },
    Definition {
        id: "quiet-bells",
        kind: "bellstep-qilin",
        habitats: &["desert", "badlands", "savanna"],
        clue_count: 3,
    },
    Definition {
        id: "cloudwhale-graveyard",
        kind: "aerolith-baleen",
        habitats: &["cloudreed-glen", "highlands", "snowcap-range"],
        clue_count: 3,
    },
    Definition {
        id: "mirrorfen-processional",
        kind: "mireglass-kelpie",
        habitats: &["swamp", "siltfen", "rainveil-jungle"],
        clue_count: 3,
    },
    Definition {
        id: "emberglass-hatchery",
        kind: "cinderwing-pyrausta",
        habitats: &["ember-wastes", "emberdeep", "volcanic"],
        clue_count: 3,
    },
    Definition {
        id: "drowned-moon-gate",
        kind: "nacre-gatewyrm",
        habitats: &["lumen-trench", "abyssal", "deep-ocean"],
        clue_count: 3,
    },
    Definition {
        id: "titans-kettle",
        kind: "frostcauldron-behemoth",
        habitats: &["snowcap-range", "snowfield", "frostpine", "highlands"],
        clue_count: 3,
    },
    Definition {
        id: "root-crown-menagerie",
        kind: "briarcrown-manticore",
        habitats: &["glimmerwood", "wildwood", "forest", "rootweave"],
        clue_count: 3,
    },
    Definition {
        id: "fossil-orchard",
        kind: "ammonarch",
        habitats: &["pillarstone", "crystaldeep", "ancient-water"],
        clue_count: 3,
    },
    Definition {
        id: "lanternroot-cistern",
        kind: "handtail-ahuizotl",
        habitats: &["rootweave", "glasswater", "underground"],
        clue_count: 3,
    },
    Definition {
        id: "tideclock-wreck",
        kind: "tideclock-cetus",
        habitats: &["brightwater", "abyssal", "deep-ocean"],
        clue_count: 3,
    },
    Definition {
        id: "palace-nine-winds",
        kind: "anemoi-gryphon",
        habitats: &["cloudreed-glen", "highlands", "snowcap-range"],
        clue_count: 3,
    },
    Definition {
        id: "gorgon-quarry",
        kind: "sable-gorgon",
        habitats: &["badlands", "desert", "crystaldeep"],
        clue_count: 3,
    },
    Definition {
        id: "sunken-court-namarra",
        kind: "namarra-makara",
        habitats: &["lumen-trench", "deep-ocean", "brightwater"],
        clue_count: 3,
    },
    Definition {
        id: "ashen-library",
        kind: "ashen-salamander-king",
        habitats: &["ember-wastes", "emberdeep", "volcanic"],
        clue_count: 3,
    },
    Definition {
        id: "hollow-moon-menagerie",
        kind: "mycelial-oneirophant",
        habitats: &["mooncap", "starbloom", "mushroom"],
        clue_count: 3,
    },
];

#[derive(Clone, Copy)]
struct Site {
    definition: Definition,
    cell_x: i32,
    cell_z: i32,
    x: i32,
    y: i32,
    z: i32,
    radius: i32,
    aquatic: bool,
    underground: bool,
}

impl Site {
    fn id(self) -> String {
        format!("legendary-site:{}:{}:{}", self.cell_x, self.cell_z, self.definition.id)
    }
}

#[derive(Clone, Copy)]
pub(crate) struct LegendaryPlacement {
    pub x: i32,
    pub y: i32,
    pub z: i32,
    pub block: u16,
}

#[derive(Clone)]
pub(crate) struct LegendaryMarker {
    pub x: i32,
    pub z: i32,
    pub row: MarkerRow,
}

#[derive(Clone)]
pub(crate) struct LegendaryPlan {
    pub placements: Vec<LegendaryPlacement>,
    pub markers: Vec<LegendaryMarker>,
}

fn hash32(value: &str) -> u32 {
    let mut result = 2_166_136_261_u32;
    for character in value.chars() {
        let mut utf16 = [0_u16; 2];
        let first = character.encode_utf16(&mut utf16)[0];
        result = (result ^ u32::from(first)).wrapping_mul(16_777_619);
    }
    result
}

fn unit(seed: &str, salt: &str) -> f64 {
    f64::from(hash32(&format!("{seed}|{salt}"))) / 4_294_967_296.0
}

fn habitat_key(biome: BiomeId) -> &'static str {
    match biome {
        BiomeId::DeepOcean => "deep-ocean",
        BiomeId::Ocean => "ocean",
        BiomeId::LumenTrench => "lumen-trench",
        BiomeId::Meadow => "flower-meadow",
        BiomeId::Wildwood => "wildwood",
        BiomeId::River => "river",
        BiomeId::Glimmerwood => "glimmerwood",
        BiomeId::Highlands => "highlands",
        BiomeId::SnowcapRange => "snowcap-range",
        BiomeId::Badlands => "badlands",
        BiomeId::CloudreedGlen => "cloudreed-glen",
        BiomeId::Savanna => "savanna",
        BiomeId::SugarplumVale => "sugarplum-vale",
        _ => "other",
    }
}

fn plan_site(seed: &str, cell_x: i32, cell_z: i32, generator: &TerrainGeneratorV18) -> Option<Site> {
    let definition =
        DEFINITIONS[(hash32(&format!("{seed}|legendary-kind|{cell_x}|{cell_z}")) as usize) % DEFINITIONS.len()];
    let cell_blocks = CELL_CHUNKS * CHUNK_SIZE as i32;
    let origin_x = cell_x * cell_blocks;
    let origin_z = cell_z * cell_blocks;
    for probe in 0..32 {
        let x = origin_x
            + 96
            + (unit(seed, &format!("{cell_x}|{cell_z}|{}|x|{probe}", definition.id)) * f64::from(cell_blocks - 192))
                .floor() as i32;
        let z = origin_z
            + 96
            + (unit(seed, &format!("{cell_x}|{cell_z}|{}|z|{probe}", definition.id)) * f64::from(cell_blocks - 192))
                .floor() as i32;
        let sample = generator.sample_column(x, z);
        if !definition.habitats.contains(&habitat_key(sample.biome)) {
            continue;
        }
        let aquatic = definition.id == "reef-that-swims";
        let underground = definition.id == "oath-under-stone";
        if (aquatic && sample.height >= sample.waterline - 8) || (!aquatic && sample.height <= sample.waterline + 3) {
            continue;
        }
        let y = if aquatic {
            sample.height + 3
        } else if underground {
            sample.height - 24
        } else {
            sample.height + 1
        };
        return Some(Site {
            definition,
            cell_x,
            cell_z,
            x,
            y,
            z,
            radius: if aquatic {
                18
            } else if underground {
                15
            } else {
                13
            },
            aquatic,
            underground,
        });
    }
    None
}

fn palette(encounter: &str) -> (u16, u16, u16) {
    match encounter {
        "walking-spring" => (Block::MEADOW_GRASS, Block::LIVING_ROOT, Block::GLOWSTONE),
        "reef-that-swims" => (Block::MOON_SLATE, Block::STAR_CORAL, Block::GLOWSTONE),
        "oath-under-stone" => (Block::DEEPGEAR_BRICK, Block::RIVETED_BRASS, Block::DEEPGEAR_LANTERN),
        "where-storms-run" => (Block::SNOWCAP_STONE, Block::CRYSTAL_BLOCK, Block::GLOWSTONE),
        "red-banner" => (Block::RED_SAND, Block::GOBLIN_BRASSWORK, Block::TORCH),
        _ => (Block::BOILED_SUGARBRICK, Block::CANDYWOOD_LOG, Block::GLOWSTONE),
    }
}

fn marker(key: String, canonical_json: String, x: i32, z: i32) -> LegendaryMarker {
    LegendaryMarker {
        x,
        z,
        row: MarkerRow { key, canonical_json },
    }
}

#[allow(clippy::too_many_lines)]
fn build_plan(site: Site, seed_hash: u32, generator: &TerrainGeneratorV18) -> LegendaryPlan {
    let (floor, accent, light) = palette(site.definition.id);
    let mut placements = Vec::new();
    let mut markers = Vec::new();
    for x in site.x - site.radius..=site.x + site.radius {
        for z in site.z - site.radius..=site.z + site.radius {
            let distance = f64::from(x - site.x).hypot(f64::from(z - site.z));
            if distance > f64::from(site.radius) {
                continue;
            }
            if site.underground {
                let dx = f64::from(x - site.x) / f64::from(site.radius);
                let dz = f64::from(z - site.z) / f64::from(site.radius);
                let ceiling = 4 + ((1.0 - dx * dx - dz * dz).max(0.0) * 4.0).floor() as i32;
                for dy in 0..=ceiling {
                    placements.push(LegendaryPlacement {
                        x,
                        y: site.y + dy,
                        z,
                        block: Block::AIR,
                    });
                }
                placements.push(LegendaryPlacement {
                    x,
                    y: site.y - 1,
                    z,
                    block: if distance < 4.0 || (distance - f64::from(site.radius) * 0.72).abs() < 0.8 {
                        floor
                    } else {
                        Block::DEEPSTONE
                    },
                });
            } else if site.aquatic {
                let floor_y = generator.sample_column(x, z).height + 1;
                let ring = (distance - f64::from(site.radius) * 0.62).abs() < 0.8;
                if distance < 4.0 || ring || (hash2(x, z, seed_hash) > 0.96 && distance < f64::from(site.radius) * 0.85)
                {
                    placements.push(LegendaryPlacement {
                        x,
                        y: floor_y,
                        z,
                        block: floor,
                    });
                }
                if ring && ((x + z) & 3) == 0 {
                    placements.push(LegendaryPlacement {
                        x,
                        y: floor_y + 1,
                        z,
                        block: accent,
                    });
                }
            } else {
                let ground = generator.sample_column(x, z).height;
                let ring = (distance - f64::from(site.radius) * 0.72).abs() < 0.65;
                if distance < 3.0 || ring {
                    placements.push(LegendaryPlacement {
                        x,
                        y: ground,
                        z,
                        block: floor,
                    });
                }
                if ring && ((x + z) & 7) == 0 {
                    placements.push(LegendaryPlacement {
                        x,
                        y: ground + 1,
                        z,
                        block: accent,
                    });
                }
            }
        }
    }

    let site_id = site.id();
    let angle_offset = hash2(site.cell_x, site.cell_z, seed_hash) * std::f64::consts::PI;
    for index in 0..site.definition.clue_count {
        let angle = index as f64 * std::f64::consts::TAU / site.definition.clue_count.max(1) as f64 + angle_offset;
        let x = (f64::from(site.x) + angle.cos() * f64::from(site.radius) * 0.74 + 0.5).floor() as i32;
        let z = (f64::from(site.z) + angle.sin() * f64::from(site.radius) * 0.74 + 0.5).floor() as i32;
        let y = if site.underground {
            site.y
        } else {
            generator.sample_column(x, z).height + 1
        };
        placements.push(LegendaryPlacement { x, y, z, block: accent });
        placements.push(LegendaryPlacement {
            x,
            y: y + 1,
            z,
            block: light,
        });
        let key = format!("{site_id}:clue:{index}");
        let map_layer = if site.underground {
            "underground"
        } else if site.aquatic {
            "underwater"
        } else {
            "surface"
        };
        markers.push(marker(
            key.clone(),
            format!("[\"{key}\",{{\"id\":\"{key}\",\"mapLayer\":\"{map_layer}\",\"position\":{{\"x\":{x},\"y\":{},\"z\":{z}}},\"tag\":\"legendary-clue:{}:{site_id}:observe-sign:{index}\",\"type\":\"landmark\"}}]", y + 1, site.definition.id),
            x,
            z,
        ));
    }

    let map_layer = if site.underground {
        "underground"
    } else if site.aquatic {
        "underwater"
    } else {
        "surface"
    };
    let landmark_key = format!("{site_id}:landmark");
    markers.push(marker(
        landmark_key.clone(),
        format!("[\"{landmark_key}\",{{\"id\":\"{site_id}\",\"mapLayer\":\"{map_layer}\",\"position\":{{\"x\":{},\"y\":{},\"z\":{}}},\"tag\":\"legendary-encounter:{}:dormant\",\"type\":\"landmark\"}}]", site.x, site.y, site.z, site.definition.id),
        site.x,
        site.z,
    ));
    let spawn_key = format!("{site_id}:spawn");
    let guardian_id = format!("{site_id}:guardian");
    let spawn_y = if site.underground { site.y } else { site.y + 1 };
    let aquatic_tag = if site.aquatic { ",\"aquatic:true\"" } else { "" };
    markers.push(marker(
        spawn_key.clone(),
        format!("[\"{spawn_key}\",{{\"count\":1,\"id\":\"{guardian_id}\",\"mobKind\":\"{}\",\"persistent\":true,\"position\":{{\"x\":{},\"y\":{spawn_y},\"z\":{}}},\"radius\":1,\"tags\":[\"legendary-encounter:{}\",\"legendary-site:{site_id}\",\"permanent:true\",\"guardian:true\"{aquatic_tag}],\"type\":\"spawn\"}}]", site.definition.kind, site.x, site.z, site.definition.id),
        site.x,
        site.z,
    ));

    LegendaryPlan { placements, markers }
}

pub(crate) fn plans_for_chunk(seed: &str, cx: i32, cz: i32, generator: &TerrainGeneratorV18) -> Vec<LegendaryPlan> {
    let min_x = cx * CHUNK_SIZE as i32;
    let min_z = cz * CHUNK_SIZE as i32;
    let max_x = min_x + CHUNK_SIZE as i32 - 1;
    let max_z = min_z + CHUNK_SIZE as i32 - 1;
    let cell_blocks = CELL_CHUNKS * CHUNK_SIZE as i32;
    let start_cell_x = (min_x - REACH).div_euclid(cell_blocks);
    let end_cell_x = (max_x + REACH).div_euclid(cell_blocks);
    let start_cell_z = (min_z - REACH).div_euclid(cell_blocks);
    let end_cell_z = (max_z + REACH).div_euclid(cell_blocks);
    let seed_hash = fnv1a_utf16(seed);
    let mut plans = Vec::new();
    for cell_x in start_cell_x..=end_cell_x {
        for cell_z in start_cell_z..=end_cell_z {
            let Some(site) = plan_site(seed, cell_x, cell_z, generator) else {
                continue;
            };
            if site.x + site.radius < min_x
                || site.x - site.radius > max_x
                || site.z + site.radius < min_z
                || site.z - site.radius > max_z
            {
                continue;
            }
            plans.push(build_plan(site, seed_hash, generator));
        }
    }
    plans
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::GenerationOptions;

    #[test]
    fn encounter_order_and_site_planning_are_stable() {
        assert_eq!(DEFINITIONS.len(), 21);
        assert_eq!(DEFINITIONS[0].id, "walking-spring");
        assert_eq!(DEFINITIONS[20].id, "hollow-moon-menagerie");
        let generator = TerrainGeneratorV18::new("legendary-kernel", GenerationOptions::default());
        let first = plans_for_chunk("legendary-kernel", -500, 500, &generator);
        let second = plans_for_chunk("legendary-kernel", -500, 500, &generator);
        assert_eq!(first.len(), second.len());
        assert_eq!(
            first.iter().map(|plan| plan.placements.len()).collect::<Vec<_>>(),
            second.iter().map(|plan| plan.placements.len()).collect::<Vec<_>>()
        );
    }
}
