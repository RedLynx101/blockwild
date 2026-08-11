use crate::contract::{BiomeId, Block, CHUNK_SIZE, GenerateChunkRequestV2, MarkerRow};
use crate::generator::TerrainGeneratorV18;
use blockwild_types::{MIN_Y, WORLD_HEIGHT, hash3};

const GRAPH_CELL: i32 = 64;
const GRAPH_LAYERS: [i32; 3] = [-42, -18, 4];
const GRAPH_MAX_RADIUS: i32 = 175;
const ENTRANCE_CELL: i32 = 48;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
enum UndergroundBiome {
    Ordinary = 0,
    Rootweave = 1,
    Starbloom = 2,
    Glasswater = 3,
    Pillarstone = 4,
    Crystaldeep = 5,
    Emberdeep = 6,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum NodeScale {
    Room,
    Chamber,
    Great,
    Cathedral,
}

impl NodeScale {
    const fn is_grand(self) -> bool {
        matches!(self, Self::Great | Self::Cathedral)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum NodePoi {
    DelverCamp,
    FossilBed,
    FungalSanctum,
    DrownedRuin,
    RopeBridge,
    CrystalShrine,
    ChallengeVault,
    VentForge,
    Waystone,
}

impl NodePoi {
    const fn name(self) -> &'static str {
        match self {
            Self::DelverCamp => "delver-camp",
            Self::FossilBed => "fossil-bed",
            Self::FungalSanctum => "fungal-sanctum",
            Self::DrownedRuin => "drowned-ruin",
            Self::RopeBridge => "rope-bridge",
            Self::CrystalShrine => "crystal-shrine",
            Self::ChallengeVault => "challenge-vault",
            Self::VentForge => "vent-forge",
            Self::Waystone => "waystone",
        }
    }

    const fn has_chest(self) -> bool {
        matches!(self, Self::DelverCamp | Self::DrownedRuin | Self::ChallengeVault)
    }
}

#[derive(Clone, Debug)]
struct CaveNode {
    cell_x: i32,
    cell_z: i32,
    layer: i32,
    x: i32,
    y: i32,
    z: i32,
    radius_x: f64,
    radius_y: f64,
    radius_z: f64,
    biome: UndergroundBiome,
    scale: NodeScale,
    poi: Option<NodePoi>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Flow {
    Dry,
    Stream,
    Waterfall,
}

#[derive(Clone, Debug)]
struct CaveEdge {
    from: CaveNode,
    to: CaveNode,
    radius: f64,
    stone_road: bool,
    flow: Flow,
}

#[derive(Clone, Copy)]
struct EntranceSite {
    center_x: i32,
    center_z: i32,
    radius: f64,
    rim_y: i32,
    minimum_surface_y: i32,
}

#[inline]
fn index(lx: usize, y: i32, lz: usize) -> usize {
    lx + lz * CHUNK_SIZE + (y - MIN_Y) as usize * CHUNK_SIZE * CHUNK_SIZE
}

#[inline]
fn mix32(mut value: u32) -> u32 {
    value = (value ^ (value >> 16)).wrapping_mul(0x045d_9f3b);
    value = (value ^ (value >> 16)).wrapping_mul(0x045d_9f3b);
    value ^ (value >> 16)
}

#[inline]
fn cave_hash(seed: u32, x: i32, y: i32, z: i32) -> f64 {
    let value = seed
        ^ (x as u32).wrapping_mul(374_761_393)
        ^ (y as u32).wrapping_mul(668_265_263)
        ^ (z as u32).wrapping_mul(1_103_515_245);
    f64::from(mix32(value)) / f64::from(u32::MAX)
}

#[inline]
fn js_round(value: f64) -> i32 {
    (value + 0.5).floor() as i32
}

fn node_biome(seed: u32, cell_x: i32, cell_z: i32, layer: i32) -> UndergroundBiome {
    let roll = cave_hash(seed ^ 0x6a09_e667, cell_x, layer, cell_z);
    if layer == 0 {
        if roll < 0.34 {
            UndergroundBiome::Crystaldeep
        } else if roll < 0.66 {
            UndergroundBiome::Emberdeep
        } else if roll < 0.84 {
            UndergroundBiome::Pillarstone
        } else {
            UndergroundBiome::Glasswater
        }
    } else if layer == 1 {
        if roll < 0.2 {
            UndergroundBiome::Rootweave
        } else if roll < 0.42 {
            UndergroundBiome::Starbloom
        } else if roll < 0.64 {
            UndergroundBiome::Glasswater
        } else if roll < 0.84 {
            UndergroundBiome::Pillarstone
        } else {
            UndergroundBiome::Crystaldeep
        }
    } else if roll < 0.38 {
        UndergroundBiome::Rootweave
    } else if roll < 0.64 {
        UndergroundBiome::Starbloom
    } else if roll < 0.8 {
        UndergroundBiome::Glasswater
    } else {
        UndergroundBiome::Pillarstone
    }
}

fn node_poi(seed: u32, cell_x: i32, cell_z: i32, layer: i32, biome: UndergroundBiome) -> Option<NodePoi> {
    if cave_hash(seed ^ 0xbb67_ae85, cell_x, layer, cell_z) < 0.28 {
        return None;
    }
    let choices: [NodePoi; 4] = match biome {
        UndergroundBiome::Rootweave => [
            NodePoi::DelverCamp,
            NodePoi::FungalSanctum,
            NodePoi::Waystone,
            NodePoi::FossilBed,
        ],
        UndergroundBiome::Starbloom => [
            NodePoi::FungalSanctum,
            NodePoi::DelverCamp,
            NodePoi::ChallengeVault,
            NodePoi::Waystone,
        ],
        UndergroundBiome::Glasswater => [
            NodePoi::DrownedRuin,
            NodePoi::RopeBridge,
            NodePoi::ChallengeVault,
            NodePoi::Waystone,
        ],
        UndergroundBiome::Pillarstone => [
            NodePoi::FossilBed,
            NodePoi::RopeBridge,
            NodePoi::DelverCamp,
            NodePoi::ChallengeVault,
        ],
        UndergroundBiome::Crystaldeep => [
            NodePoi::CrystalShrine,
            NodePoi::ChallengeVault,
            NodePoi::Waystone,
            NodePoi::DelverCamp,
        ],
        UndergroundBiome::Emberdeep | UndergroundBiome::Ordinary => [
            NodePoi::VentForge,
            NodePoi::ChallengeVault,
            NodePoi::FossilBed,
            NodePoi::Waystone,
        ],
    };
    let choice = (cave_hash(seed ^ 0x3c6e_f372, cell_x, layer, cell_z) * choices.len() as f64).floor() as usize;
    Some(choices[choice.min(choices.len() - 1)])
}

fn cave_node(seed: u32, cell_x: i32, cell_z: i32, layer: i32) -> CaveNode {
    let base_y = GRAPH_LAYERS[layer.clamp(0, 2) as usize];
    let x = cell_x * GRAPH_CELL
        + GRAPH_CELL / 2
        + js_round((cave_hash(seed ^ 0xa54f_f53a, cell_x, layer, cell_z) - 0.5) * 22.0);
    let z = cell_z * GRAPH_CELL
        + GRAPH_CELL / 2
        + js_round((cave_hash(seed ^ 0x510e_527f, cell_x, layer, cell_z) - 0.5) * 22.0);
    let y = base_y + js_round((cave_hash(seed ^ 0x9b05_688c, cell_x, layer, cell_z) - 0.5) * 8.0);
    let scale_roll = cave_hash(seed ^ 0x1f83_d9ab, cell_x, layer, cell_z);
    let scale = if scale_roll > 0.997 {
        NodeScale::Cathedral
    } else if scale_roll > 0.955 {
        NodeScale::Great
    } else if scale_roll > 0.72 {
        NodeScale::Chamber
    } else {
        NodeScale::Room
    };
    let nx = cave_hash(seed ^ 0x5be0_cd19, cell_x, layer, cell_z);
    let ny = cave_hash(seed ^ 0xcbbb_9d5d, cell_x, layer, cell_z);
    let nz = cave_hash(seed ^ 0x629a_292a, cell_x, layer, cell_z);
    let (radius_x, radius_y, radius_z) = match scale {
        NodeScale::Cathedral => (120.0 + nx * 55.0, 30.0 + ny * 15.0, 120.0 + nz * 55.0),
        NodeScale::Great => (45.0 + nx * 65.0, 15.0 + ny * 30.0, 45.0 + nz * 65.0),
        NodeScale::Chamber => (18.0 + nx * 27.0, 7.0 + ny * 13.0, 18.0 + nz * 27.0),
        NodeScale::Room => (6.0 + nx * 11.0, 4.0 + ny * 7.0, 6.0 + nz * 11.0),
    };
    let biome = node_biome(seed, cell_x, cell_z, layer);
    CaveNode {
        cell_x,
        cell_z,
        layer,
        x,
        y,
        z,
        radius_x,
        radius_y,
        radius_z,
        biome,
        scale,
        poi: node_poi(seed, cell_x, cell_z, layer, biome),
    }
}

pub(crate) fn nearest_upper_coordinates(seed: u32, x: i32, z: i32) -> (i32, i32, i32) {
    let center_x = x.div_euclid(GRAPH_CELL);
    let center_z = z.div_euclid(GRAPH_CELL);
    let mut nearest = cave_node(seed, center_x, center_z, 2);
    let mut distance = i64::MAX;
    for cell_x in center_x - 1..=center_x + 1 {
        for cell_z in center_z - 1..=center_z + 1 {
            let node = cave_node(seed, cell_x, cell_z, 2);
            let dx = i64::from(node.x - x);
            let dz = i64::from(node.z - z);
            let candidate_distance = dx * dx + dz * dz;
            if candidate_distance < distance {
                nearest = node;
                distance = candidate_distance;
            }
        }
    }
    (nearest.x, nearest.y, nearest.z)
}

fn nodes_in_bounds(seed: u32, min_x: i32, max_x: i32, min_z: i32, max_z: i32) -> Vec<CaveNode> {
    let mut nodes = Vec::new();
    for cell_x in min_x.div_euclid(GRAPH_CELL) - 1..=max_x.div_euclid(GRAPH_CELL) + 1 {
        for cell_z in min_z.div_euclid(GRAPH_CELL) - 1..=max_z.div_euclid(GRAPH_CELL) + 1 {
            for layer in 0..3 {
                nodes.push(cave_node(seed, cell_x, cell_z, layer));
            }
        }
    }
    nodes
}

fn edges_in_bounds(seed: u32, min_x: i32, max_x: i32, min_z: i32, max_z: i32) -> Vec<CaveEdge> {
    let nodes = nodes_in_bounds(seed, min_x, max_x, min_z, max_z);
    let mut edges = Vec::with_capacity(nodes.len() * 3);
    for node in &nodes {
        let candidates = [
            (1_i32, cave_node(seed, node.cell_x + 1, node.cell_z, node.layer)),
            (2_i32, cave_node(seed, node.cell_x, node.cell_z + 1, node.layer)),
        ];
        for (axis, to) in candidates {
            let roll = cave_hash(seed ^ 0x923f_82a4, node.cell_x, node.layer * 5 + axis, node.cell_z);
            let water_roll = cave_hash(seed ^ 0x4a74_84aa, node.cell_x, node.layer * 7 + axis, node.cell_z);
            let wet = node.biome == UndergroundBiome::Glasswater || to.biome == UndergroundBiome::Glasswater;
            edges.push(CaveEdge {
                from: node.clone(),
                to,
                radius: 1.9 + roll * 1.25,
                stone_road: roll > 0.89 && node.layer > 0,
                flow: if wet && water_roll > 0.48 {
                    Flow::Stream
                } else {
                    Flow::Dry
                },
            });
        }
        if node.layer < 2 && cave_hash(seed ^ 0xab1c_5ed5, node.cell_x, node.layer, node.cell_z) > 0.2 {
            let to = cave_node(seed, node.cell_x, node.cell_z, node.layer + 1);
            let wet = node.biome == UndergroundBiome::Glasswater || to.biome == UndergroundBiome::Glasswater;
            edges.push(CaveEdge {
                from: node.clone(),
                to,
                radius: 2.25,
                stone_road: false,
                flow: if wet && cave_hash(seed ^ 0x7137_4491, node.cell_x, node.layer, node.cell_z) > 0.42 {
                    Flow::Waterfall
                } else {
                    Flow::Dry
                },
            });
        }
    }
    edges
}

fn nearest_upper_node(seed: u32, x: i32, z: i32) -> CaveNode {
    let center_x = x.div_euclid(GRAPH_CELL);
    let center_z = z.div_euclid(GRAPH_CELL);
    let mut nearest = cave_node(seed, center_x, center_z, 2);
    let mut best = i64::MAX;
    for cell_x in center_x - 1..=center_x + 1 {
        for cell_z in center_z - 1..=center_z + 1 {
            let node = cave_node(seed, cell_x, cell_z, 2);
            let dx = i64::from(node.x - x);
            let dz = i64::from(node.z - z);
            let distance = dx * dx + dz * dz;
            if distance < best {
                best = distance;
                nearest = node;
            }
        }
    }
    nearest
}

fn aquatic(biome: BiomeId) -> bool {
    matches!(
        biome,
        BiomeId::River | BiomeId::Ocean | BiomeId::DeepOcean | BiomeId::LumenTrench | BiomeId::Beach
    )
}

fn entrance_site(generator: &TerrainGeneratorV18, seed: u32, cell_x: i32, cell_z: i32) -> Option<EntranceSite> {
    if cave_hash(seed ^ 0x64f3_1a2d, cell_x, 0, cell_z) >= 0.25 {
        return None;
    }
    let base_radius = 3.0 + cave_hash(seed ^ 0x1a7c_9e31, cell_x, 3, cell_z) * 1.8;
    for attempt in 0..=4_i32 {
        let (center_x, center_z, radius) = if attempt == 0 {
            (
                cell_x * ENTRANCE_CELL + 8 + (cave_hash(seed ^ 0x02f6_e2b1, cell_x, 1, cell_z) * 32.0).floor() as i32,
                cell_z * ENTRANCE_CELL + 8 + (cave_hash(seed ^ 0x735a_2d97, cell_x, 2, cell_z) * 32.0).floor() as i32,
                base_radius,
            )
        } else {
            (
                cell_x * ENTRANCE_CELL
                    + 8
                    + (cave_hash(seed ^ 0x02f6_e2b1, cell_x, 13 + attempt * 7, cell_z) * 32.0).floor() as i32,
                cell_z * ENTRANCE_CELL
                    + 8
                    + (cave_hash(seed ^ 0x735a_2d97, cell_x, 29 + attempt * 11, cell_z) * 32.0).floor() as i32,
                (base_radius - f64::from(attempt) * 0.12).max(3.0),
            )
        };
        let support = (radius + 2.0).ceil() as i32;
        let mut minimum = i32::MAX;
        let mut maximum = i32::MIN;
        let mut invalid = false;
        'outer: for dx in -support..=support {
            for dz in -support..=support {
                if f64::from(dx * dx + dz * dz) > (radius + 2.0).powi(2) {
                    continue;
                }
                let column = generator.sample_column(center_x + dx, center_z + dz);
                if aquatic(column.biome) || column.height <= column.waterline + 5 {
                    invalid = true;
                    break 'outer;
                }
                minimum = minimum.min(column.height);
                maximum = maximum.max(column.height);
            }
        }
        if invalid || maximum - minimum > 4 {
            continue;
        }
        let rim_y = generator.sample_column(center_x, center_z).height.min(minimum + 2);
        return Some(EntranceSite {
            center_x,
            center_z,
            radius,
            rim_y,
            minimum_surface_y: minimum,
        });
    }
    None
}

pub(crate) fn is_safe_cave_mouth(generator: &TerrainGeneratorV18, x: i32, z: i32) -> bool {
    safe_cave_entrance_floor(generator, x, z).is_some()
}

pub(crate) fn safe_cave_entrance_floor(generator: &TerrainGeneratorV18, x: i32, z: i32) -> Option<i32> {
    let cell_x = x.div_euclid(ENTRANCE_CELL);
    let cell_z = z.div_euclid(ENTRANCE_CELL);
    let site = entrance_site(generator, generator.seed(), cell_x, cell_z)?;
    let dx = f64::from(x - site.center_x);
    let dz = f64::from(z - site.center_z);
    let distance = (dx * dx + dz * dz).sqrt();
    if distance > site.radius || generator.sample_column(x, z).height < site.minimum_surface_y {
        return None;
    }
    let center_weight = 1.0 - distance / site.radius;
    Some(site.rim_y - 2 - (center_weight * (12.0 + site.radius)).floor() as i32)
}

pub(crate) fn cave_feature_at(seed: u32, x: i32, y: i32, z: i32, surface_y: i32, frequency: f64) -> (bool, bool) {
    if frequency <= 0.0 || y >= surface_y - 6 {
        return (false, false);
    }
    let cx = x.div_euclid(34);
    let cy = (y + 64).div_euclid(24);
    let cz = z.div_euclid(34);
    let mut chamber = false;
    if cave_hash(seed ^ 0x5f35_6495, cx, cy, cz) > 0.7 - (frequency * 0.05).min(0.16) {
        let center_x = f64::from(cx * 34 + 7) + cave_hash(seed ^ 0x375a_49c1, cx, cy, cz) * 20.0;
        let center_y = f64::from(cy * 24 - 64 + 6) + cave_hash(seed ^ 0x7a63_d921, cx, cy, cz) * 12.0;
        let center_z = f64::from(cz * 34 + 7) + cave_hash(seed ^ 0x19b7_4e8d, cx, cy, cz) * 20.0;
        let radius_x = 5.0 + cave_hash(seed ^ 0x6c8e_9cf5, cx, cy, cz) * 5.0;
        let radius_y = 3.5 + cave_hash(seed ^ 0x35f1_a93b, cx, cy, cz) * 3.5;
        let radius_z = 5.0 + cave_hash(seed ^ 0x27d4_eb2f, cx, cy, cz) * 5.0;
        chamber = ((f64::from(x) - center_x) / radius_x).powi(2)
            + ((f64::from(y) - center_y) / radius_y).powi(2)
            + ((f64::from(z) - center_z) / radius_z).powi(2)
            < 1.0;
        let shelf = chamber
            && ((y + (cave_hash(seed, x >> 3, 7, z >> 3) * 4.0).floor() as i32) % 9).abs() < 1
            && cave_hash(seed ^ 0x51f2_e8b7, x, y, z) > 0.58;
        chamber &= !shelf;
    }
    let chimney_x = x.div_euclid(48);
    let chimney_z = z.div_euclid(48);
    let mut chimney = false;
    if cave_hash(seed ^ 0x94d0_49bd, chimney_x, 0, chimney_z) > 0.76 - (frequency * 0.025).min(0.08) {
        let center_x = f64::from(chimney_x * 48 + 10) + cave_hash(seed ^ 0x1656_67c5, chimney_x, 1, chimney_z) * 28.0;
        let center_z = f64::from(chimney_z * 48 + 10) + cave_hash(seed ^ 0x9e37_79f9, chimney_x, 2, chimney_z) * 28.0;
        let radius = 1.8 + cave_hash(seed ^ 0x7ed5_5d16, chimney_x, 3, chimney_z) * 1.1;
        chimney =
            (f64::from(x) - center_x).powi(2) + (f64::from(z) - center_z).powi(2) < radius.powi(2) && y < surface_y - 8;
    }
    (chamber, chimney)
}

struct Carver<'a> {
    min_x: i32,
    min_z: i32,
    heights: &'a [i16],
    blocks: &'a mut [u16],
    carve: Vec<u8>,
    biome: Vec<u8>,
    road: Vec<u8>,
    stream: Vec<u8>,
    waterfall: Vec<u8>,
    basin: Vec<u8>,
    seal: Vec<u8>,
}

impl Carver<'_> {
    #[allow(clippy::too_many_arguments)]
    fn mark(
        &mut self,
        x: i32,
        y: i32,
        z: i32,
        biome: UndergroundBiome,
        road: bool,
        liquid_surface: i32,
        allow_surface: bool,
        stream: bool,
        basin: bool,
    ) -> Option<usize> {
        if x < self.min_x
            || x >= self.min_x + CHUNK_SIZE as i32
            || z < self.min_z
            || z >= self.min_z + CHUNK_SIZE as i32
            || y <= MIN_Y + 4
            || y >= MIN_Y + WORLD_HEIGHT
        {
            return None;
        }
        let lx = (x - self.min_x) as usize;
        let lz = (z - self.min_z) as usize;
        let height = i32::from(self.heights[lx + lz * CHUNK_SIZE]);
        if y > height || (!allow_surface && y > height - 4) {
            return None;
        }
        let i = index(lx, y, lz);
        self.carve[i] = 1;
        if biome != UndergroundBiome::Ordinary {
            self.biome[i] = biome as u8;
        }
        if road {
            self.road[i] = 1;
        }
        if stream {
            self.stream[i] = 1;
        }
        if basin && y <= liquid_surface {
            self.basin[i] = if biome == UndergroundBiome::Emberdeep { 2 } else { 1 };
        }
        Some(i)
    }

    #[allow(clippy::too_many_arguments)]
    fn sphere(
        &mut self,
        cx: f64,
        cy: f64,
        cz: f64,
        rx: f64,
        ry: f64,
        rz: f64,
        biome: UndergroundBiome,
        road: bool,
        liquid_surface: i32,
        allow_surface: bool,
        stream: bool,
        basin: bool,
    ) {
        let start_x = self.min_x.max((cx - rx).floor() as i32);
        let end_x = (self.min_x + 15).min((cx + rx).ceil() as i32);
        let start_z = self.min_z.max((cz - rz).floor() as i32);
        let end_z = (self.min_z + 15).min((cz + rz).ceil() as i32);
        let start_y = (MIN_Y + 5).max((cy - ry).floor() as i32);
        let end_y = (MIN_Y + WORLD_HEIGHT - 1).min((cy + ry).ceil() as i32);
        for x in start_x..=end_x {
            for z in start_z..=end_z {
                for y in start_y..=end_y {
                    let distance = ((f64::from(x) - cx) / rx).powi(2)
                        + ((f64::from(y) - cy) / ry).powi(2)
                        + ((f64::from(z) - cz) / rz).powi(2);
                    if distance <= 1.0 {
                        self.mark(x, y, z, biome, road, liquid_surface, allow_surface, stream, basin);
                    }
                }
            }
        }
        if !basin || liquid_surface < MIN_Y {
            return;
        }
        let shell = 1.5;
        let seal_start_y = (MIN_Y + 5).max((cy - ry - shell).floor() as i32);
        let seal_end_y = liquid_surface
            .min((cy + ry + shell).ceil() as i32)
            .min(MIN_Y + WORLD_HEIGHT - 1);
        for x in
            self.min_x.max((cx - rx - shell).floor() as i32)..=(self.min_x + 15).min((cx + rx + shell).ceil() as i32)
        {
            for z in self.min_z.max((cz - rz - shell).floor() as i32)
                ..=(self.min_z + 15).min((cz + rz + shell).ceil() as i32)
            {
                for y in seal_start_y..=seal_end_y {
                    let inner = ((f64::from(x) - cx) / rx).powi(2)
                        + ((f64::from(y) - cy) / ry).powi(2)
                        + ((f64::from(z) - cz) / rz).powi(2);
                    if inner <= 1.0 {
                        continue;
                    }
                    let outer = ((f64::from(x) - cx) / (rx + shell)).powi(2)
                        + ((f64::from(y) - cy) / (ry + shell)).powi(2)
                        + ((f64::from(z) - cz) / (rz + shell)).powi(2);
                    let lx = (x - self.min_x) as usize;
                    let lz = (z - self.min_z) as usize;
                    if outer <= 1.0 && y <= i32::from(self.heights[lx + lz * CHUNK_SIZE]) - 4 {
                        self.seal[index(lx, y, lz)] = if biome == UndergroundBiome::Emberdeep { 2 } else { 1 };
                    }
                }
            }
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn tunnel(
        &mut self,
        from: (f64, f64, f64),
        to: (f64, f64, f64),
        radius: f64,
        road: bool,
        allow_surface: bool,
        biome: UndergroundBiome,
        stream: bool,
        falling: bool,
    ) {
        let distance = ((to.0 - from.0).powi(2) + (to.1 - from.1).powi(2) + (to.2 - from.2).powi(2)).sqrt();
        let steps = (distance / 1.35).ceil().max(1.0) as i32;
        for step in 0..=steps {
            let progress = f64::from(step) / f64::from(steps);
            let wobble = (progress * std::f64::consts::PI * 4.0 + from.0 * 0.031 + from.2 * 0.023).sin() * 0.7;
            self.sphere(
                from.0 + (to.0 - from.0) * progress + wobble,
                from.1 + (to.1 - from.1) * progress + (progress * std::f64::consts::PI * 2.0).sin() * 0.45,
                from.2 + (to.2 - from.2) * progress - wobble * 0.65,
                radius,
                radius * 0.86,
                radius,
                biome,
                road,
                MIN_Y - 1,
                allow_surface,
                stream,
                false,
            );
        }
        if !falling {
            return;
        }
        let cascade_steps = (distance / 0.55).ceil().max(1.0) as i32;
        let mut previous: Option<(i32, i32, i32)> = None;
        for step in 0..=cascade_steps {
            let progress = f64::from(step) / f64::from(cascade_steps);
            let wobble = (progress * std::f64::consts::PI * 4.0 + from.0 * 0.031 + from.2 * 0.023).sin() * 0.7;
            let target = (
                js_round(from.0 + (to.0 - from.0) * progress + wobble),
                js_round(from.1 + (to.1 - from.1) * progress + (progress * std::f64::consts::PI * 2.0).sin() * 0.45),
                js_round(from.2 + (to.2 - from.2) * progress - wobble * 0.65),
            );
            let mut cursor = previous.unwrap_or(target);
            while cursor.1 != target.1 {
                cursor.1 += (target.1 - cursor.1).signum();
                self.fall_cell(cursor, biome);
            }
            while cursor.0 != target.0 {
                cursor.0 += (target.0 - cursor.0).signum();
                self.fall_cell(cursor, biome);
            }
            while cursor.2 != target.2 {
                cursor.2 += (target.2 - cursor.2).signum();
                self.fall_cell(cursor, biome);
            }
            if previous.is_none() {
                self.fall_cell(target, biome);
            }
            previous = Some(target);
        }
    }

    fn fall_cell(&mut self, point: (i32, i32, i32), biome: UndergroundBiome) {
        if let Some(i) = self.mark(point.0, point.1, point.2, biome, false, MIN_Y - 1, false, false, false) {
            self.waterfall[i] = 1;
        }
    }
}

pub(crate) fn carve_graph_caves(
    generator: &TerrainGeneratorV18,
    request: &GenerateChunkRequestV2,
    heights: &[i16],
    blocks: &mut [u16],
) -> Vec<MarkerRow> {
    let frequency = generator.cave_frequency();
    if frequency <= 0.0 {
        return Vec::new();
    }
    let min_x = request.cx * CHUNK_SIZE as i32;
    let min_z = request.cz * CHUNK_SIZE as i32;
    let max_x = min_x + CHUNK_SIZE as i32 - 1;
    let max_z = min_z + CHUNK_SIZE as i32 - 1;
    let seed = generator.seed();
    let volume = CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT as usize;
    let radius_scale = (0.72 + frequency.sqrt() * 0.28).clamp(0.72, 1.35);
    let mut carver = Carver {
        min_x,
        min_z,
        heights,
        blocks,
        carve: vec![0; volume],
        biome: vec![0; volume],
        road: vec![0; volume],
        stream: vec![0; volume],
        waterfall: vec![0; volume],
        basin: vec![0; volume],
        seal: vec![0; volume],
    };
    let expanded = GRAPH_MAX_RADIUS + 8;
    for edge in edges_in_bounds(
        seed,
        min_x - expanded,
        max_x + expanded,
        min_z - expanded,
        max_z + expanded,
    ) {
        let edge_min_x = f64::from(edge.from.x.min(edge.to.x)) - edge.radius - 2.0;
        let edge_max_x = f64::from(edge.from.x.max(edge.to.x)) + edge.radius + 2.0;
        let edge_min_z = f64::from(edge.from.z.min(edge.to.z)) - edge.radius - 2.0;
        let edge_max_z = f64::from(edge.from.z.max(edge.to.z)) + edge.radius + 2.0;
        if edge_max_x < f64::from(min_x)
            || edge_min_x > f64::from(max_x)
            || edge_max_z < f64::from(min_z)
            || edge_min_z > f64::from(max_z)
        {
            continue;
        }
        let biome = if edge.flow == Flow::Dry {
            UndergroundBiome::Ordinary
        } else {
            UndergroundBiome::Glasswater
        };
        carver.tunnel(
            (f64::from(edge.from.x), f64::from(edge.from.y), f64::from(edge.from.z)),
            (f64::from(edge.to.x), f64::from(edge.to.y), f64::from(edge.to.z)),
            edge.radius * radius_scale,
            edge.stone_road,
            false,
            biome,
            edge.flow == Flow::Stream,
            edge.flow == Flow::Waterfall,
        );
    }
    let nodes = nodes_in_bounds(
        seed,
        min_x - expanded,
        max_x + expanded,
        min_z - expanded,
        max_z + expanded,
    );
    for node in &nodes {
        let liquid = if node.biome == UndergroundBiome::Glasswater {
            (f64::from(node.y) - 1.0_f64.max(node.radius_y * 0.22)).floor() as i32
        } else if node.biome == UndergroundBiome::Emberdeep && node.y < -34 {
            (f64::from(node.y) - 3.0_f64.max(node.radius_y * 0.56)).floor() as i32
        } else {
            MIN_Y - 1
        };
        carver.sphere(
            f64::from(node.x),
            f64::from(node.y),
            f64::from(node.z),
            node.radius_x * radius_scale,
            node.radius_y * radius_scale,
            node.radius_z * radius_scale,
            node.biome,
            false,
            liquid,
            false,
            false,
            liquid >= MIN_Y,
        );
    }
    let entrance_min_x = (min_x - expanded).div_euclid(ENTRANCE_CELL);
    let entrance_max_x = (max_x + expanded).div_euclid(ENTRANCE_CELL);
    let entrance_min_z = (min_z - expanded).div_euclid(ENTRANCE_CELL);
    let entrance_max_z = (max_z + expanded).div_euclid(ENTRANCE_CELL);
    for cell_x in entrance_min_x..=entrance_max_x {
        for cell_z in entrance_min_z..=entrance_max_z {
            let Some(site) = entrance_site(generator, seed, cell_x, cell_z) else {
                continue;
            };
            let target = nearest_upper_node(seed, site.center_x, site.center_z);
            let column = generator.sample_column(site.center_x, site.center_z);
            let throat_y = (column.height - 7).min(site.rim_y - 6);
            carver.tunnel(
                (
                    f64::from(site.center_x),
                    f64::from(site.rim_y - 1),
                    f64::from(site.center_z),
                ),
                (f64::from(site.center_x), f64::from(throat_y), f64::from(site.center_z)),
                1.55_f64.max(site.radius * 0.45) * radius_scale,
                false,
                true,
                UndergroundBiome::Ordinary,
                false,
                false,
            );
            carver.tunnel(
                (f64::from(site.center_x), f64::from(throat_y), f64::from(site.center_z)),
                (f64::from(target.x), f64::from(target.y), f64::from(target.z)),
                2.15 * radius_scale,
                false,
                false,
                UndergroundBiome::Ordinary,
                false,
                false,
            );
        }
    }
    finish_carve(&mut carver, seed);
    apply_node_pois(&mut carver, &nodes, request)
}

fn structure_hash(seed: &str, salt: &str) -> f64 {
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

#[derive(Clone)]
struct AdventureLoot {
    item: &'static str,
    weight: i32,
    min: i32,
    max: i32,
    count: i32,
    bonus_chance: Option<f64>,
}

fn adventure_loot(seed: &str, rolls: usize) -> Vec<AdventureLoot> {
    let entries = [
        ("bread", 20, 1, 3),
        ("glow-dust", 16, 1, 4),
        ("crystal-shard", 11, 1, 2),
        ("gold-ingot", 8, 1, 2),
        ("waykeeper-capture-orb", 8, 1, 1),
        ("fiber", 20, 2, 7),
        ("moonberry", 17, 2, 5),
    ];
    let mut loot: Vec<AdventureLoot> = Vec::new();
    for roll in 0..rolls.min(12) {
        let mut cursor = structure_hash(seed, &format!("adventure-cache:roll:{roll}")) * 100.0;
        let mut selected = entries[entries.len() - 1];
        for entry in entries {
            cursor -= f64::from(entry.1);
            if cursor <= 0.0 {
                selected = entry;
                break;
            }
        }
        let count = selected.2
            + (structure_hash(seed, &format!("adventure-cache:count:{roll}")) * f64::from(selected.3 - selected.2 + 1))
                .floor() as i32;
        if let Some(existing) = loot
            .iter_mut()
            .find(|entry| entry.item == selected.0 && entry.bonus_chance.is_none())
        {
            existing.count += count;
        } else {
            loot.push(AdventureLoot {
                item: selected.0,
                weight: selected.1,
                min: selected.2,
                max: selected.3,
                count,
                bonus_chance: None,
            });
        }
    }
    if structure_hash(seed, "adventure-cache:bonus:0") < 0.035 {
        loot.push(AdventureLoot {
            item: "tome-blinkstep",
            weight: 0,
            min: 1,
            max: 1,
            count: 1,
            bonus_chance: Some(0.035),
        });
    }
    loot
}

fn adventure_loot_json(seed: &str, rolls: usize) -> String {
    let mut output = String::new();
    for entry in adventure_loot(seed, rolls) {
        if !output.is_empty() {
            output.push(',');
        }
        if let Some(chance) = entry.bonus_chance {
            output.push_str(&format!(
                "{{\"chance\":{chance},\"count\":{},\"itemKey\":\"{}\",\"max\":{},\"min\":{}}}",
                entry.count, entry.item, entry.max, entry.min
            ));
        } else {
            output.push_str(&format!(
                "{{\"count\":{},\"itemKey\":\"{}\",\"max\":{},\"min\":{},\"weight\":{}}}",
                entry.count, entry.item, entry.max, entry.min, entry.weight
            ));
        }
    }
    output
}

fn apply_node_pois(carver: &mut Carver<'_>, nodes: &[CaveNode], request: &GenerateChunkRequestV2) -> Vec<MarkerRow> {
    let max_x = carver.min_x + CHUNK_SIZE as i32 - 1;
    let max_z = carver.min_z + CHUNK_SIZE as i32 - 1;
    let mut markers = Vec::new();
    for node in nodes {
        let Some(poi) = node.poi else {
            continue;
        };
        if node.x < carver.min_x || node.x > max_x || node.z < carver.min_z || node.z > max_z {
            continue;
        }
        let lx = (node.x - carver.min_x) as usize;
        let lz = (node.z - carver.min_z) as usize;
        let mut floor_y = node.y;
        while floor_y > MIN_Y + 5 {
            let block = carver.blocks[index(lx, floor_y, lz)];
            if is_solid(block) {
                break;
            }
            floor_y -= 1;
        }
        let stand_y = floor_y + 1;
        let mut set_local = |dx: i32, dy: i32, dz: i32, block: u16| {
            let x = node.x + dx;
            let y = stand_y + dy;
            let z = node.z + dz;
            if x < carver.min_x
                || x > max_x
                || z < carver.min_z
                || z > max_z
                || !(MIN_Y..MIN_Y + WORLD_HEIGHT).contains(&y)
            {
                return;
            }
            carver.blocks[index((x - carver.min_x) as usize, y, (z - carver.min_z) as usize)] = block;
        };
        match poi {
            NodePoi::DelverCamp => {
                for dx in -2..=2 {
                    for dz in -2..=2 {
                        set_local(dx, -1, dz, Block::CAVE_BRIDGE);
                    }
                }
                set_local(-1, 0, 0, Block::TORCH);
                set_local(1, 0, 0, Block::CHEST);
            }
            NodePoi::FossilBed => {
                for dx in -3..=3 {
                    set_local(dx, -1, (dx * dx + node.cell_z) % 3 - 1, Block::FOSSIL_STONE);
                }
            }
            NodePoi::FungalSanctum => {
                set_local(0, 0, 0, Block::STARBLOOM_STEM);
                set_local(0, 1, 0, Block::STARBLOOM_CAP);
                for (dx, dz) in [(-2, 0), (2, 0), (0, -2), (0, 2)] {
                    set_local(dx, 0, dz, Block::LANTERN_BLOOM);
                }
            }
            NodePoi::DrownedRuin => {
                for dx in -2_i32..=2 {
                    for dz in -2_i32..=2 {
                        if dx.abs() == 2 || dz.abs() == 2 {
                            set_local(dx, 0, dz, Block::REFLECTIVE_SHALE);
                        }
                    }
                }
                set_local(0, 0, 0, Block::CHEST);
            }
            NodePoi::RopeBridge => {
                for dx in -5..=5 {
                    set_local(dx, 0, 0, Block::CAVE_BRIDGE);
                }
                set_local(-5, 1, 0, Block::ROPE_ANCHOR);
                set_local(5, 1, 0, Block::ROPE_ANCHOR);
            }
            NodePoi::CrystalShrine => {
                for dy in 0..=3 {
                    set_local(
                        0,
                        dy,
                        0,
                        if dy == 3 {
                            Block::RESONANT_CRYSTAL
                        } else {
                            Block::CRYSTALDEEP_STONE
                        },
                    );
                }
                for (dx, dz) in [(-2, 0), (2, 0), (0, -2), (0, 2)] {
                    set_local(dx, 0, dz, Block::CRYSTAL_CLUSTER);
                }
            }
            NodePoi::ChallengeVault => {
                for dx in -2_i32..=2 {
                    for dz in -2_i32..=2 {
                        if dx.abs() == 2 || dz.abs() == 2 {
                            set_local(dx, 0, dz, Block::STONE_BRICK);
                        }
                    }
                }
                set_local(0, 0, 0, Block::CHEST);
                set_local(0, 1, -2, Block::CAVE_MARKER);
            }
            NodePoi::VentForge => {
                set_local(0, 0, 0, Block::FURNACE);
                set_local(-2, 0, 0, Block::FUMAROLE_VENT);
                set_local(2, 0, 0, Block::FUMAROLE_VENT);
            }
            NodePoi::Waystone => {
                for dy in 0..3 {
                    set_local(
                        0,
                        dy,
                        0,
                        if dy == 2 {
                            Block::CAVE_MARKER
                        } else {
                            Block::PILLARSTONE
                        },
                    );
                }
            }
        }

        let id = format!("cave-node:{}:{}:{}", node.cell_x, node.layer, node.cell_z);
        let marker_y = stand_y + 1;
        let landmark_key = format!("{id}:landmark");
        markers.push(MarkerRow {
            key: landmark_key.clone(),
            canonical_json: format!(
                "[\"{landmark_key}\",{{\"id\":\"{id}\",\"mapLayer\":\"underground\",\"position\":{{\"x\":{},\"y\":{marker_y},\"z\":{}}},\"tag\":\"underground:{}:{}\",\"type\":\"landmark\"}}]",
                node.x,
                node.z,
                poi.name(),
                node.biome as u8,
            ),
        });
        if poi.has_chest() {
            let chest_key = format!("{id}:chest");
            let chest_x = node.x + i32::from(poi == NodePoi::DelverCamp);
            let loot_seed = format!("{}:{id}", request.seed_text);
            let loot = adventure_loot_json(&loot_seed, if node.scale.is_grand() { 6 } else { 4 });
            markers.push(MarkerRow {
                key: chest_key.clone(),
                canonical_json: format!(
                    "[\"{chest_key}\",{{\"id\":\"{id}:cache\",\"loot\":[{loot}],\"lootTable\":\"adventure-cache\",\"position\":{{\"x\":{chest_x},\"y\":{stand_y},\"z\":{}}},\"type\":\"chest\"}}]",
                    node.z,
                ),
            });
        }
        let mob = match node.biome {
            UndergroundBiome::Rootweave => "grotto-grazer",
            UndergroundBiome::Starbloom => "chimewing",
            UndergroundBiome::Glasswater => {
                if node.scale.is_grand() {
                    "lanternray"
                } else {
                    "glassback-newt"
                }
            }
            UndergroundBiome::Pillarstone => {
                if node.scale.is_grand() {
                    "grotto-grazer"
                } else {
                    "ashnose-bat"
                }
            }
            UndergroundBiome::Crystaldeep => {
                if node.scale.is_grand() {
                    "prismtail-swift"
                } else {
                    "veinling"
                }
            }
            UndergroundBiome::Emberdeep | UndergroundBiome::Ordinary => {
                if node.scale.is_grand() {
                    "cinder-kite"
                } else {
                    "ashnose-bat"
                }
            }
        };
        let spawn_key = format!("{id}:spawn");
        let count = if node.scale.is_grand() { 3 } else { 2 };
        let radius = ((node.radius_x.min(node.radius_z) * 0.84).floor() as i32).max(5);
        markers.push(MarkerRow {
            key: spawn_key.clone(),
            canonical_json: format!(
                "[\"{spawn_key}\",{{\"count\":{count},\"id\":\"{id}:ecology\",\"mobKind\":\"{mob}\",\"persistent\":true,\"position\":{{\"x\":{},\"y\":{marker_y},\"z\":{}}},\"radius\":{radius},\"tags\":[\"dungeon\",\"underground-biome:{}\",\"cave-node:{id}\",\"ecological-center:true\"],\"type\":\"spawn\"}}]",
                node.x,
                node.z,
                node.biome as u8,
            ),
        });
    }
    markers
}

fn floor_block(biome: u8, detail: f64) -> u16 {
    match biome {
        1 => {
            if detail > 0.46 {
                Block::ROOTWEAVE_SOIL
            } else {
                Block::GROTTO_MOSS
            }
        }
        2 => {
            if detail > 0.58 {
                Block::GROTTO_MOSS
            } else {
                Block::ROOTWEAVE_SOIL
            }
        }
        3 => {
            if detail > 0.72 {
                Block::MINERAL_CRUST
            } else {
                Block::GLASSWATER_STONE
            }
        }
        4 => {
            if detail > 0.82 {
                Block::FOSSIL_STONE
            } else if detail > 0.4 {
                Block::FLOWSTONE
            } else {
                Block::PILLARSTONE
            }
        }
        5 => {
            if detail > 0.82 {
                Block::BUDDING_CRYSTAL
            } else {
                Block::CRYSTALDEEP_STONE
            }
        }
        _ => {
            if detail > 0.74 {
                Block::MINERAL_TERRACE
            } else if detail > 0.42 {
                Block::SULFUR_STONE
            } else {
                Block::HEAT_CRACKED_ROCK
            }
        }
    }
}

#[inline]
fn is_fluid(block: u16) -> bool {
    matches!(block, Block::WATER | Block::LAVA)
}

#[inline]
fn is_solid(block: u16) -> bool {
    block != Block::AIR
        && !is_fluid(block)
        && !matches!(
            block,
            Block::HANGING_ROOT
                | Block::LUMINOUS_GILLS
                | Block::LANTERN_BLOOM
                | Block::SPORE_POD
                | Block::CAVE_REED
                | Block::LUMINOUS_ALGAE
                | Block::EGG_REED
                | Block::CRYSTAL_CLUSTER
                | Block::SULFUR_GROWTH
                | Block::CAVE_MARKER
        )
}

fn finish_carve(carver: &mut Carver<'_>, seed: u32) {
    let volume = carver.carve.len();
    let mut dry_shell = vec![0_u8; volume];
    for i in 0..volume {
        if carver.carve[i] == 0 {
            continue;
        }
        let layer = i / (CHUNK_SIZE * CHUNK_SIZE);
        let y = MIN_Y + layer as i32;
        let horizontal = i % (CHUNK_SIZE * CHUNK_SIZE);
        let lx = horizontal % CHUNK_SIZE;
        let lz = horizontal / CHUNK_SIZE;
        for dx in -1..=1 {
            for dy in -1..=1 {
                for dz in -1..=1 {
                    if dx == 0 && dy == 0 && dz == 0 {
                        continue;
                    }
                    let sx = lx as i32 + dx;
                    let sy = y + dy;
                    let sz = lz as i32 + dz;
                    if !(0..CHUNK_SIZE as i32).contains(&sx)
                        || !(0..CHUNK_SIZE as i32).contains(&sz)
                        || !(MIN_Y..MIN_Y + WORLD_HEIGHT).contains(&sy)
                    {
                        continue;
                    }
                    let shell_index = index(sx as usize, sy, sz as usize);
                    if carver.carve[shell_index] == 0 {
                        dry_shell[shell_index] = 1;
                    }
                }
            }
        }
    }
    for (i, shell) in dry_shell.iter().copied().enumerate() {
        if shell == 0 || !is_fluid(carver.blocks[i]) {
            continue;
        }
        let y = MIN_Y + (i / (CHUNK_SIZE * CHUNK_SIZE)) as i32;
        carver.blocks[i] = if y < MIN_Y + 18 {
            Block::BASALT
        } else if y < -10 {
            Block::DEEPSTONE
        } else {
            Block::STONE
        };
    }
    for i in 0..volume {
        if carver.carve[i] != 0 && carver.blocks[i] != Block::BEDROCK {
            carver.blocks[i] = Block::AIR;
        }
    }
    for i in 0..volume {
        let seal = carver.seal[i];
        if seal == 0 || carver.basin[i] != 0 {
            continue;
        }
        if carver.blocks[i] != Block::AIR && !is_fluid(carver.blocks[i]) {
            continue;
        }
        let y = MIN_Y + (i / (CHUNK_SIZE * CHUNK_SIZE)) as i32;
        let horizontal = i % (CHUNK_SIZE * CHUNK_SIZE);
        let lx = horizontal % CHUNK_SIZE;
        let lz = horizontal / CHUNK_SIZE;
        carver.blocks[i] = floor_block(
            if seal == 2 { 6 } else { 3 },
            hash3(
                carver.min_x + lx as i32,
                y,
                carver.min_z + lz as i32,
                seed ^ 0x2d98_c47a,
            ),
        );
    }
    for i in 0..volume {
        if carver.basin[i] != 0 && carver.blocks[i] != Block::BEDROCK {
            carver.blocks[i] = if carver.basin[i] == 2 {
                Block::LAVA
            } else {
                Block::WATER
            };
        }
    }
    for i in 0..volume {
        if carver.waterfall[i] != 0 && carver.basin[i] != 2 && carver.blocks[i] != Block::BEDROCK {
            carver.blocks[i] = Block::WATER;
        }
    }
    settle_streams(carver);
    decorate(carver, seed);
}

fn settle_streams(carver: &mut Carver<'_>) {
    for lz in 0..CHUNK_SIZE {
        for lx in 0..CHUNK_SIZE {
            let mut y = MIN_Y + 5;
            while y < MIN_Y + WORLD_HEIGHT {
                if carver.stream[index(lx, y, lz)] == 0 {
                    y += 1;
                    continue;
                }
                let run_bottom = y;
                while y < MIN_Y + WORLD_HEIGHT && carver.stream[index(lx, y, lz)] != 0 {
                    y += 1;
                }
                let mut settled_y = run_bottom;
                while settled_y > MIN_Y + 5 {
                    let below = index(lx, settled_y - 1, lz);
                    if carver.carve[below] == 0 && carver.blocks[below] != Block::AIR {
                        break;
                    }
                    settled_y -= 1;
                }
                let settled = index(lx, settled_y, lz);
                carver.blocks[settled] = if carver.biome[settled] == UndergroundBiome::Emberdeep as u8 {
                    Block::LAVA
                } else {
                    Block::WATER
                };
            }
        }
    }
}

fn decorate(carver: &mut Carver<'_>, seed: u32) {
    let volume = carver.carve.len();
    for i in 0..volume {
        if carver.carve[i] == 0 {
            continue;
        }
        let biome = carver.biome[i];
        if biome == 0 && carver.road[i] == 0 {
            continue;
        }
        let layer = i / (CHUNK_SIZE * CHUNK_SIZE);
        let y = MIN_Y + layer as i32;
        if y <= MIN_Y + 5 || y >= MIN_Y + WORLD_HEIGHT - 2 {
            continue;
        }
        let horizontal = i % (CHUNK_SIZE * CHUNK_SIZE);
        let lx = horizontal % CHUNK_SIZE;
        let lz = horizontal / CHUNK_SIZE;
        let x = carver.min_x + lx as i32;
        let z = carver.min_z + lz as i32;
        let below = i - CHUNK_SIZE * CHUNK_SIZE;
        let above = i + CHUNK_SIZE * CHUNK_SIZE;
        let current = carver.blocks[i];
        let detail = hash3(x, y, z, seed ^ 0x4f1b_bcdc);
        let below_solid = is_solid(carver.blocks[below]);
        let above_solid = is_solid(carver.blocks[above]);
        if carver.road[i] != 0 && below_solid {
            carver.blocks[below] = if detail > 0.78 {
                Block::CAVE_BRIDGE
            } else {
                Block::STONE_BRICK
            };
            if current == Block::AIR && detail > 0.992 {
                carver.blocks[i] = Block::CAVE_MARKER;
            }
            continue;
        }
        if biome == 0 {
            continue;
        }
        if below_solid {
            carver.blocks[below] = floor_block(biome, detail);
            if matches!(biome, 4 | 5) && detail > 0.993 {
                carver.blocks[below] = if detail > 0.9985 {
                    Block::VEINMETAL_HEART
                } else {
                    Block::LIVING_VEIN
                };
            }
            if current == Block::AIR {
                if biome == 1 && detail > 0.94 {
                    carver.blocks[i] = Block::LIVING_ROOT;
                } else if biome == 2 && detail > 0.965 && carver.blocks[above] == Block::AIR {
                    carver.blocks[i] = Block::STARBLOOM_STEM;
                    carver.blocks[above] = Block::STARBLOOM_CAP;
                } else if biome == 2 && detail > 0.9 {
                    carver.blocks[i] = if detail > 0.945 {
                        Block::LANTERN_BLOOM
                    } else {
                        Block::SPORE_POD
                    };
                } else if biome == 5 && detail > 0.91 {
                    carver.blocks[i] = Block::CRYSTAL_CLUSTER;
                } else if biome == 6 && detail > 0.94 {
                    carver.blocks[i] = if detail > 0.982 {
                        Block::FUMAROLE_VENT
                    } else {
                        Block::SULFUR_GROWTH
                    };
                }
            } else if current == Block::WATER && biome == 3 && detail > 0.91 {
                carver.blocks[i] = if detail > 0.965 {
                    Block::EGG_REED
                } else if detail > 0.935 {
                    Block::LUMINOUS_ALGAE
                } else {
                    Block::CAVE_REED
                };
            }
        }
        if above_solid {
            carver.blocks[above] = floor_block(biome, 1.0 - detail);
            if current == Block::AIR {
                if biome == 1 && detail < 0.055 {
                    carver.blocks[i] = if detail < 0.018 {
                        Block::LUMINOUS_ROOT
                    } else {
                        Block::HANGING_ROOT
                    };
                } else if biome == 2 && detail < 0.05 {
                    carver.blocks[i] = Block::LUMINOUS_GILLS;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn graph_query_is_deterministic_across_negative_coordinates() {
        let first = nodes_in_bounds(0x1234_5678, -193, -177, -1, 15);
        let second = nodes_in_bounds(0x1234_5678, -193, -177, -1, 15);
        assert_eq!(first.len(), second.len());
        for (left, right) in first.iter().zip(&second) {
            assert_eq!(
                (left.cell_x, left.cell_z, left.layer, left.x, left.y, left.z),
                (right.cell_x, right.cell_z, right.layer, right.x, right.y, right.z)
            );
            assert_eq!(left.radius_x.to_bits(), right.radius_x.to_bits());
        }
    }

    #[test]
    fn cave_hash_stays_in_unit_interval() {
        for x in -64..64 {
            let value = cave_hash(0xdead_beef, x, x / 3, -x);
            assert!((0.0..=1.0).contains(&value));
        }
    }

    #[test]
    fn graph_node_matches_typescript_oracle() {
        let node = cave_node(633_366_333, -6, -6, 0);
        assert_eq!((node.x, node.y, node.z), (-361, -38, -355));
        assert_eq!(node.radius_x.to_bits(), 35.064_406_094_156_3_f64.to_bits());
        assert_eq!(node.radius_y.to_bits(), 18.789_546_224_006_813_f64.to_bits());
        assert_eq!(node.radius_z.to_bits(), 27.023_102_123_994_17_f64.to_bits());
        assert_eq!(node.biome, UndergroundBiome::Emberdeep);
    }
}
