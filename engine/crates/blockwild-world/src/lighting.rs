use crate::contract::{
    SectionSnapshotV1, TERRAIN_SECTION_CORE_CELL_COUNT_V1, TERRAIN_SECTION_HALO_CELL_COUNT_V1,
    TERRAIN_SECTION_HALO_SIZE_V1, TerrainLightingDeltaV1, TerrainMeshContractError, TerrainSectionAddressV1,
    TerrainSectionRevisionV1, core_cell_index_v1, halo_cell_index_v1,
};
use crate::material::{
    MAX_LIGHT_LEVEL, SectionEligibilityV1, SectionIneligibilityV1, TerrainMaterialRegistryV1, TerrainMaterialV1,
    opaque_section_eligibility_v1,
};

const DIRECTIONS: [[i32; 3]; 6] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum LightChannel {
    Blue = 0,
    Green = 1,
    Red = 2,
    Sky = 3,
}

impl LightChannel {
    #[must_use]
    pub const fn from_index(index: usize) -> Self {
        match index {
            0 => Self::Blue,
            1 => Self::Green,
            2 => Self::Red,
            _ => Self::Sky,
        }
    }
}

#[must_use]
pub const fn light_channel(packed: u16, channel: LightChannel) -> u8 {
    ((packed >> (channel as u8 * 4)) & 0xf) as u8
}

#[must_use]
pub const fn with_light_channel(packed: u16, channel: LightChannel, level: u8) -> u16 {
    let shift = channel as u8 * 4;
    let bounded = if level > MAX_LIGHT_LEVEL {
        MAX_LIGHT_LEVEL
    } else {
        level
    };
    (packed & !(0xf_u16 << shift)) | ((bounded as u16) << shift)
}

#[must_use]
pub const fn pack_voxel_light(sky: u8, red: u8, green: u8, blue: u8) -> u16 {
    (if blue > 15 { 15 } else { blue }) as u16
        | (((if green > 15 { 15 } else { green }) as u16) << 4)
        | (((if red > 15 { 15 } else { red }) as u16) << 8)
        | (((if sky > 15 { 15 } else { sky }) as u16) << 12)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LightingPhaseV1 {
    SeedCore,
    SeedFrontier,
    Propagate,
    Complete,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LightingProgressV1 {
    pub phase: LightingPhaseV1,
    pub operations: u32,
    pub complete: bool,
    pub frontier_pending: u32,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SectionLightingResultV1 {
    pub source_snapshot_hash: String,
    pub content_hash: String,
    pub address: TerrainSectionAddressV1,
    pub revision: TerrainSectionRevisionV1,
    /// Complete 18^3 light field; halo values remain immutable inputs.
    pub light: Vec<u16>,
    pub delta: TerrainLightingDeltaV1,
}

impl SectionLightingResultV1 {
    #[must_use]
    pub fn matches_snapshot(&self, snapshot: &SectionSnapshotV1) -> bool {
        self.source_snapshot_hash == snapshot.snapshot_hash
            && self.content_hash == snapshot.content_hash
            && self.address == snapshot.address
            && self.revision == snapshot.revision
    }

    pub fn validate_matches_snapshot(&self, snapshot: &SectionSnapshotV1) -> Result<(), TerrainMeshContractError> {
        snapshot.validate(true)?;
        self.validate()?;
        if !self.matches_snapshot(snapshot) {
            return Err(TerrainMeshContractError::new(
                "lighting result source hash, content hash, address, or revision is stale",
            ));
        }
        Ok(())
    }

    pub fn validate(&self) -> Result<(), TerrainMeshContractError> {
        let mut issues = Vec::new();
        for (path, value) in [
            ("sourceSnapshotHash", self.source_snapshot_hash.as_str()),
            ("contentHash", self.content_hash.as_str()),
        ] {
            if value.len() != 32
                || !value
                    .bytes()
                    .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
            {
                issues.push(format!("{path} must be 32 lowercase hexadecimal characters"));
            }
        }
        for (path, value) in [
            ("address.universeId", self.address.universe_id.as_str()),
            ("address.locationId", self.address.location_id.as_str()),
        ] {
            if value.encode_utf16().count() == 0 || value.encode_utf16().count() > 128 {
                issues.push(format!("{path} must be a non-empty bounded string"));
            }
        }
        if self.light.len() != TERRAIN_SECTION_HALO_CELL_COUNT_V1 {
            issues.push("lighting result must contain the complete 18x18x18 light field".into());
        }
        if self.delta.changed_cell_indices.len() != self.delta.packed_light.len()
            || !self.delta.changed_cell_indices.windows(2).all(|pair| pair[0] < pair[1])
            || self
                .delta
                .changed_cell_indices
                .iter()
                .any(|&index| index as usize >= TERRAIN_SECTION_CORE_CELL_COUNT_V1)
        {
            issues.push("lighting result delta must be sorted, unique, core-owned, and length-matched".into());
        }
        if issues.is_empty() {
            Ok(())
        } else {
            Err(TerrainMeshContractError::from_issues(issues))
        }
    }
}

#[derive(Clone, Debug)]
pub struct SectionLightingTaskV1 {
    source_snapshot_hash: String,
    content_hash: String,
    address: TerrainSectionAddressV1,
    revision: TerrainSectionRevisionV1,
    original_light: Vec<u16>,
    light: Vec<u16>,
    dampening: Vec<u8>,
    emission: Vec<u16>,
    column_sky: Vec<u8>,
    phase: LightingPhaseV1,
    cursor: usize,
    queue: Vec<usize>,
    queue_head: usize,
    queued: Vec<bool>,
}

#[derive(Clone, Debug)]
pub enum LightingSectionOutcomeV1 {
    Eligible(Box<SectionLightingTaskV1>),
    Ineligible(SectionIneligibilityV1),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum LightingResultOutcomeV1 {
    Eligible(Box<SectionLightingResultV1>),
    Ineligible(SectionIneligibilityV1),
}

impl SectionLightingTaskV1 {
    #[must_use]
    pub const fn phase(&self) -> LightingPhaseV1 {
        self.phase
    }

    #[must_use]
    pub fn matches_snapshot(&self, snapshot: &SectionSnapshotV1) -> bool {
        self.source_snapshot_hash == snapshot.snapshot_hash
            && self.content_hash == snapshot.content_hash
            && self.address == snapshot.address
            && self.revision == snapshot.revision
    }

    pub fn step(&mut self, maximum_operations: u32) -> LightingProgressV1 {
        let mut operations = 0_u32;
        while operations < maximum_operations && self.phase != LightingPhaseV1::Complete {
            match self.phase {
                LightingPhaseV1::SeedCore => self.step_seed_core(),
                LightingPhaseV1::SeedFrontier => self.step_seed_frontier(),
                LightingPhaseV1::Propagate => self.step_propagate(),
                LightingPhaseV1::Complete => break,
            }
            operations += 1;
        }
        LightingProgressV1 {
            phase: self.phase,
            operations,
            complete: self.phase == LightingPhaseV1::Complete,
            frontier_pending: u32::try_from(self.queue.len().saturating_sub(self.queue_head)).unwrap_or(u32::MAX),
        }
    }

    pub fn finish(mut self) -> Result<SectionLightingResultV1, TerrainMeshContractError> {
        if self.phase != LightingPhaseV1::Complete {
            return Err(TerrainMeshContractError::new(
                "lighting task cannot publish before its deterministic frontier is complete",
            ));
        }
        let mut changed_cell_indices = Vec::new();
        let mut packed_light = Vec::new();
        for local_y in 0..16 {
            for local_z in 0..16 {
                for local_x in 0..16 {
                    let core_index =
                        core_cell_index_v1(local_x, local_y, local_z).expect("core traversal produces a core index");
                    let halo_index = halo_cell_index_v1(local_x as i32, local_y as i32, local_z as i32)
                        .expect("core traversal produces a halo index");
                    if self.light[halo_index] != self.original_light[halo_index] {
                        changed_cell_indices.push(core_index as u16);
                        packed_light.push(self.light[halo_index]);
                    }
                }
            }
        }
        debug_assert!(changed_cell_indices.windows(2).all(|pair| pair[0] < pair[1]));
        Ok(SectionLightingResultV1 {
            source_snapshot_hash: self.source_snapshot_hash,
            content_hash: self.content_hash,
            address: self.address,
            revision: self.revision,
            light: core::mem::take(&mut self.light),
            delta: TerrainLightingDeltaV1 {
                changed_cell_indices,
                packed_light,
            },
        })
    }

    fn step_seed_core(&mut self) {
        if self.cursor >= TERRAIN_SECTION_CORE_CELL_COUNT_V1 {
            self.phase = LightingPhaseV1::SeedFrontier;
            self.cursor = 0;
            return;
        }
        // Traverse columns from top to bottom so direct sky preserves level 15
        // through air, matching the TypeScript direct-column kernel.
        let column = self.cursor / 16;
        let depth_from_top = self.cursor % 16;
        let local_x = column % 16;
        let local_z = column / 16;
        let local_y = 15 - depth_from_top;
        let halo_index = halo_cell_index_v1(local_x as i32, local_y as i32, local_z as i32)
            .expect("core seed coordinate has a halo index");
        let dampening = self.dampening[halo_index];
        let mut sky = self.column_sky[column];
        if dampening >= MAX_LIGHT_LEVEL {
            sky = 0;
        } else if dampening > 0 {
            sky = sky.saturating_sub(dampening);
        }
        self.column_sky[column] = sky;
        self.light[halo_index] = with_light_channel(self.emission[halo_index], LightChannel::Sky, sky);
        self.cursor += 1;
    }

    fn step_seed_frontier(&mut self) {
        if self.cursor >= TERRAIN_SECTION_HALO_CELL_COUNT_V1 {
            self.phase = LightingPhaseV1::Propagate;
            self.cursor = 0;
            return;
        }
        if self.light[self.cursor] != 0 {
            self.enqueue(self.cursor);
        }
        self.cursor += 1;
    }

    fn step_propagate(&mut self) {
        if self.queue_head >= self.queue.len() {
            self.phase = LightingPhaseV1::Complete;
            return;
        }
        let source_index = self.queue[self.queue_head];
        self.queue_head += 1;
        self.queued[source_index] = false;
        let source = self.light[source_index];
        if source == 0 {
            return;
        }
        let [source_x, source_y, source_z] = halo_coordinates(source_index);
        for direction in DIRECTIONS {
            let destination = [
                source_x + direction[0],
                source_y + direction[1],
                source_z + direction[2],
            ];
            if !(0..16).contains(&destination[0])
                || !(0..16).contains(&destination[1])
                || !(0..16).contains(&destination[2])
            {
                continue;
            }
            let destination_index = halo_cell_index_v1(destination[0], destination[1], destination[2])
                .expect("core destination has a halo index");
            let attenuation = if self.dampening[destination_index] >= MAX_LIGHT_LEVEL {
                MAX_LIGHT_LEVEL
            } else {
                1 + self.dampening[destination_index]
            };
            let current = self.light[destination_index];
            let mut next = current;
            for channel in 0..4 {
                let channel = LightChannel::from_index(channel);
                let candidate = light_channel(source, channel).saturating_sub(attenuation);
                if candidate > light_channel(next, channel) {
                    next = with_light_channel(next, channel, candidate);
                }
            }
            if next != current {
                self.light[destination_index] = next;
                self.enqueue(destination_index);
            }
        }
    }

    fn enqueue(&mut self, index: usize) {
        if !self.queued[index] {
            self.queued[index] = true;
            self.queue.push(index);
        }
    }
}

pub fn begin_section_lighting_v1(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    direct_sky_above: Vec<u8>,
) -> Result<LightingSectionOutcomeV1, TerrainMeshContractError> {
    match opaque_section_eligibility_v1(snapshot, registry)? {
        SectionEligibilityV1::Ineligible(reason) => return Ok(LightingSectionOutcomeV1::Ineligible(reason)),
        SectionEligibilityV1::Eligible => {}
    }
    if direct_sky_above.len() != 16 * 16 || direct_sky_above.iter().any(|&value| value > MAX_LIGHT_LEVEL) {
        return Err(TerrainMeshContractError::new(
            "directSkyAbove must contain 256 packed-nibble levels inside 0..15",
        ));
    }
    let mut dampening = vec![MAX_LIGHT_LEVEL; TERRAIN_SECTION_HALO_CELL_COUNT_V1];
    let mut emission = vec![0_u16; TERRAIN_SECTION_HALO_CELL_COUNT_V1];
    for index in 0..TERRAIN_SECTION_HALO_CELL_COUNT_V1 {
        match registry
            .material(snapshot.streams.blocks[index])
            .expect("eligibility verified every block ID")
        {
            TerrainMaterialV1::Air => dampening[index] = 0,
            TerrainMaterialV1::OpaqueFullCube(material) => {
                dampening[index] = material.light_dampening;
                emission[index] = material.emitted_light;
            }
            TerrainMaterialV1::Specialty => unreachable!("eligibility rejects specialty blocks"),
        }
    }
    let mut light = snapshot.streams.light.clone();
    for local_y in 0..16 {
        for local_z in 0..16 {
            for local_x in 0..16 {
                let index = halo_cell_index_v1(local_x, local_y, local_z).expect("core coordinate has a halo index");
                light[index] = 0;
            }
        }
    }
    Ok(LightingSectionOutcomeV1::Eligible(Box::new(SectionLightingTaskV1 {
        source_snapshot_hash: snapshot.snapshot_hash.clone(),
        content_hash: snapshot.content_hash.clone(),
        address: snapshot.address.clone(),
        revision: snapshot.revision,
        original_light: snapshot.streams.light.clone(),
        light,
        dampening,
        emission,
        column_sky: direct_sky_above,
        phase: LightingPhaseV1::SeedCore,
        cursor: 0,
        queue: Vec::with_capacity(TERRAIN_SECTION_HALO_CELL_COUNT_V1),
        queue_head: 0,
        queued: vec![false; TERRAIN_SECTION_HALO_CELL_COUNT_V1],
    })))
}

pub fn light_opaque_section_v1(
    snapshot: &SectionSnapshotV1,
    registry: &TerrainMaterialRegistryV1,
    direct_sky_above: Vec<u8>,
) -> Result<LightingResultOutcomeV1, TerrainMeshContractError> {
    let mut task = match begin_section_lighting_v1(snapshot, registry, direct_sky_above)? {
        LightingSectionOutcomeV1::Eligible(task) => task,
        LightingSectionOutcomeV1::Ineligible(reason) => return Ok(LightingResultOutcomeV1::Ineligible(reason)),
    };
    while !task.step(u32::MAX).complete {}
    Ok(LightingResultOutcomeV1::Eligible(Box::new(task.finish()?)))
}

#[must_use]
pub fn direct_sky_from_top_halo_v1(snapshot: &SectionSnapshotV1) -> Vec<u8> {
    let mut levels = Vec::with_capacity(16 * 16);
    for local_z in 0..16 {
        for local_x in 0..16 {
            let index = halo_cell_index_v1(local_x, 16, local_z).expect("top core column has a halo cell");
            levels.push(light_channel(snapshot.streams.light[index], LightChannel::Sky));
        }
    }
    levels
}

fn halo_coordinates(index: usize) -> [i32; 3] {
    let x = index % TERRAIN_SECTION_HALO_SIZE_V1;
    let yz = index / TERRAIN_SECTION_HALO_SIZE_V1;
    let z = yz % TERRAIN_SECTION_HALO_SIZE_V1;
    let y = yz / TERRAIN_SECTION_HALO_SIZE_V1;
    [x as i32 - 1, y as i32 - 1, z as i32 - 1]
}
