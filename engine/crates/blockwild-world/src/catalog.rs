//! Frozen current-content metadata for BWR1 specialty entries.
//!
//! BWR1 intentionally carried only a `Specialty` tag. Until the generated
//! BWR2 registry lands, exact current-content ownership needs a deterministic
//! block-ID lookup. Unknown IDs remain ineligible instead of guessing.

use crate::contract::TerrainMeshLayerV1;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum CanonicalShapeV1 {
    Alchemy,
    Apiary,
    Aquarium,
    Aquatic,
    ArchiveShelf,
    Barrel,
    Bed,
    Bush,
    Cartography,
    Chair,
    Chest,
    Cross,
    Cube,
    Distillery,
    Door,
    DragonEgg,
    Exhibit,
    Fence,
    Fireplace,
    Fruit,
    Gate,
    GoldPile,
    Incubator,
    LightningBugJar,
    Mooncap,
    MorphLoom,
    OrbHealer,
    OrbRack,
    Shelf,
    Stool,
    Sugarworks,
    Table,
    TallFlower,
    TomeDisplay,
    Torch,
    Wayshrine,
    WildHive,
}

impl CanonicalShapeV1 {
    pub fn from_code(code: u8) -> Option<Self> {
        Some(match code {
            0 => Self::Alchemy,
            1 => Self::Apiary,
            2 => Self::Aquarium,
            3 => Self::Aquatic,
            4 => Self::ArchiveShelf,
            5 => Self::Barrel,
            6 => Self::Bed,
            7 => Self::Bush,
            8 => Self::Cartography,
            9 => Self::Chair,
            10 => Self::Chest,
            11 => Self::Cross,
            12 => Self::Cube,
            13 => Self::Distillery,
            14 => Self::Door,
            15 => Self::DragonEgg,
            16 => Self::Exhibit,
            17 => Self::Fence,
            18 => Self::Fireplace,
            19 => Self::Fruit,
            20 => Self::Gate,
            21 => Self::GoldPile,
            22 => Self::Incubator,
            23 => Self::LightningBugJar,
            24 => Self::Mooncap,
            25 => Self::MorphLoom,
            26 => Self::OrbHealer,
            27 => Self::OrbRack,
            28 => Self::Shelf,
            29 => Self::Stool,
            30 => Self::Sugarworks,
            31 => Self::Table,
            32 => Self::TallFlower,
            33 => Self::TomeDisplay,
            34 => Self::Torch,
            35 => Self::Wayshrine,
            36 => Self::WildHive,
            _ => return None,
        })
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CanonicalSpecialtyMaterialV1 {
    pub side_tile: u16,
    pub top_tile: u16,
    pub bottom_tile: u16,
    pub layer: TerrainMeshLayerV1,
    pub shape: CanonicalShapeV1,
    pub solid: bool,
    pub liquid: CanonicalLiquidV1,
    pub waterlogged: bool,
    pub connects_fence: bool,
    pub light_dampening: u8,
    pub emitted_light: u16,
    pub emissive_strength_bits: u64,
    pub aquatic_profile: u8,
    pub vertical_group: u16,
    pub shape_variant: u16,
    pub geometry_revision: u16,
    pub tint_policy: u8,
    pub ambient_occlusion: bool,
    pub selective_interior_faces: bool,
    pub directionally_placed: bool,
    pub joins_same_horizontal: bool,
    pub joins_same_vertical: bool,
}

impl CanonicalSpecialtyMaterialV1 {
    #[must_use]
    pub const fn emissive_strength(self) -> f64 {
        f64::from_bits(self.emissive_strength_bits)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum CanonicalLiquidV1 {
    None,
    Water,
    Lava,
    Honey,
    Syrup,
}

impl CanonicalLiquidV1 {
    pub const fn from_code(code: u8) -> Option<Self> {
        match code {
            0 => Some(Self::None),
            1 => Some(Self::Water),
            2 => Some(Self::Lava),
            3 => Some(Self::Honey),
            4 => Some(Self::Syrup),
            _ => None,
        }
    }
}

#[derive(Clone, Copy)]
struct Raw(u16, u16, u16, u8, u8, u8, u8, u16, u8, u8, u8);

// The frozen table is deliberately dense and positional so its generated rows
// remain reviewable against the BWR2 wire-field order documented in the README.
#[allow(clippy::too_many_arguments)]
const fn r(
    id: u16,
    side: u16,
    top: u16,
    bottom: u16,
    layer: u8,
    shape: u8,
    flags: u8,
    dampening: u8,
    emitted: u16,
    emission: u8,
    profile: u8,
    group: u8,
) -> (u16, Raw) {
    (
        id,
        Raw(
            side, top, bottom, layer, shape, flags, dampening, emitted, emission, profile, group,
        ),
    )
}

const SPECIALTIES: &[(u16, Raw)] = &[
    r(6, 7, 7, 7, 1, 12, 1, 1, 0, 0, 0, 0),
    r(7, 8, 8, 8, 4, 12, 2, 1, 0, 0, 0, 0),
    r(12, 13, 13, 13, 4, 12, 1, 0, 0, 0, 0, 0),
    r(13, 14, 14, 14, 2, 12, 1, 15, 4037, 230, 0, 0),
    r(18, 20, 20, 20, 1, 12, 1, 1, 0, 0, 0, 0),
    r(20, 23, 23, 23, 1, 12, 1, 1, 0, 0, 0, 0),
    r(28, 34, 34, 34, 1, 12, 1, 1, 0, 0, 0, 0),
    r(31, 38, 3, 3, 0, 12, 1, 15, 0, 0, 0, 0),
    r(32, 39, 39, 39, 2, 34, 0, 0, 3715, 255, 0, 0),
    r(37, 44, 44, 44, 4, 12, 4, 0, 3905, 230, 0, 0),
    r(38, 215, 214, 216, 0, 24, 1, 15, 0, 0, 0, 0),
    r(41, 48, 48, 48, 3, 12, 1, 2, 0, 0, 0, 0),
    r(44, 233, 232, 234, 2, 12, 1, 15, 1229, 209, 0, 0),
    r(45, 89, 90, 11, 0, 10, 1, 0, 0, 0, 0, 0),
    r(46, 53, 53, 53, 1, 11, 0, 1, 0, 0, 0, 0),
    r(47, 54, 54, 54, 1, 11, 0, 1, 0, 0, 0, 0),
    r(48, 55, 55, 55, 1, 11, 0, 1, 0, 0, 0, 0),
    r(49, 56, 56, 56, 1, 11, 0, 1, 0, 0, 0, 0),
    r(51, 59, 59, 59, 1, 11, 0, 1, 0, 0, 0, 0),
    r(52, 60, 60, 60, 1, 14, 1, 1, 0, 0, 0, 0),
    r(53, 61, 61, 61, 1, 14, 1, 1, 0, 0, 0, 0),
    r(54, 60, 60, 60, 1, 14, 0, 1, 0, 0, 0, 0),
    r(55, 61, 61, 61, 1, 14, 0, 1, 0, 0, 0, 0),
    r(56, 60, 60, 60, 1, 14, 1, 1, 0, 0, 0, 0),
    r(57, 61, 61, 61, 1, 14, 1, 1, 0, 0, 0, 0),
    r(58, 60, 60, 60, 1, 14, 0, 1, 0, 0, 0, 0),
    r(59, 61, 61, 61, 1, 14, 0, 1, 0, 0, 0, 0),
    r(60, 39, 39, 39, 2, 34, 0, 0, 3715, 255, 0, 0),
    r(61, 39, 39, 39, 2, 34, 0, 0, 3715, 255, 0, 0),
    r(62, 39, 39, 39, 2, 34, 0, 0, 3715, 255, 0, 0),
    r(63, 39, 39, 39, 2, 34, 0, 0, 3715, 255, 0, 0),
    r(64, 63, 63, 11, 1, 6, 1, 1, 0, 0, 0, 0),
    r(65, 63, 63, 11, 1, 6, 1, 1, 0, 0, 0, 0),
    r(66, 63, 63, 11, 1, 6, 1, 1, 0, 0, 0, 0),
    r(67, 63, 63, 11, 1, 6, 1, 1, 0, 0, 0, 0),
    r(68, 63, 63, 11, 1, 6, 1, 1, 0, 0, 0, 0),
    r(69, 63, 63, 11, 1, 6, 1, 1, 0, 0, 0, 0),
    r(70, 63, 63, 11, 1, 6, 1, 1, 0, 0, 0, 0),
    r(71, 63, 63, 11, 1, 6, 1, 1, 0, 0, 0, 0),
    r(72, 70, 13, 11, 4, 16, 1, 0, 0, 0, 0, 0),
    r(74, 66, 66, 66, 1, 11, 0, 1, 0, 0, 0, 0),
    r(75, 67, 67, 67, 1, 11, 0, 1, 0, 0, 0, 0),
    r(76, 68, 68, 68, 1, 11, 0, 1, 0, 0, 0, 0),
    r(77, 69, 69, 69, 1, 11, 0, 1, 0, 0, 0, 0),
    r(80, 73, 73, 73, 1, 7, 0, 1, 0, 0, 0, 0),
    r(81, 74, 74, 74, 1, 7, 0, 1, 0, 0, 0, 0),
    r(82, 75, 75, 75, 1, 7, 0, 1, 0, 0, 0, 0),
    r(83, 76, 76, 76, 1, 7, 0, 1, 0, 0, 0, 0),
    r(84, 77, 77, 77, 1, 7, 0, 1, 0, 0, 0, 0),
    r(85, 78, 78, 78, 1, 7, 0, 1, 0, 0, 0, 0),
    r(86, 79, 79, 79, 1, 11, 0, 1, 0, 0, 0, 0),
    r(87, 80, 80, 80, 1, 12, 1, 1, 0, 0, 0, 0),
    r(88, 81, 81, 81, 1, 19, 0, 1, 0, 0, 0, 0),
    r(89, 82, 82, 82, 1, 11, 0, 1, 0, 0, 0, 0),
    r(90, 83, 83, 83, 1, 11, 0, 1, 0, 0, 0, 0),
    r(92, 85, 85, 85, 0, 17, 65, 0, 0, 0, 0, 0),
    r(93, 85, 85, 85, 0, 20, 65, 0, 0, 0, 0, 0),
    r(94, 85, 85, 85, 0, 20, 65, 0, 0, 0, 0, 0),
    r(95, 85, 85, 85, 0, 20, 64, 0, 0, 0, 0, 0),
    r(96, 85, 85, 85, 0, 20, 64, 0, 0, 0, 0, 0),
    r(100, 100, 100, 100, 1, 11, 0, 1, 0, 0, 0, 0),
    r(101, 101, 101, 101, 1, 11, 0, 1, 0, 0, 0, 0),
    r(104, 106, 106, 106, 1, 12, 1, 1, 0, 0, 0, 0),
    r(107, 111, 111, 111, 1, 12, 1, 1, 0, 0, 0, 0),
    r(108, 112, 112, 112, 1, 11, 0, 1, 0, 0, 0, 0),
    r(109, 113, 113, 113, 2, 11, 0, 0, 804, 199, 0, 0),
    r(110, 114, 114, 114, 2, 3, 32, 1, 596, 199, 1, 1),
    r(111, 115, 115, 115, 2, 3, 32, 1, 1571, 204, 2, 2),
    r(112, 116, 116, 116, 2, 3, 32, 1, 1335, 224, 3, 3),
    r(113, 117, 117, 117, 1, 3, 32, 1, 0, 0, 4, 4),
    r(114, 118, 118, 118, 1, 11, 0, 1, 0, 0, 0, 0),
    r(115, 119, 119, 119, 1, 11, 0, 1, 0, 0, 0, 0),
    r(116, 120, 120, 120, 1, 11, 0, 1, 0, 0, 0, 0),
    r(117, 121, 121, 121, 1, 11, 0, 1, 0, 0, 0, 0),
    r(118, 122, 122, 122, 1, 11, 0, 1, 0, 0, 0, 0),
    r(119, 123, 123, 123, 1, 11, 0, 1, 0, 0, 0, 0),
    r(120, 54, 54, 54, 1, 32, 0, 1, 0, 0, 0, 5),
    r(121, 55, 55, 55, 1, 32, 0, 1, 0, 0, 0, 5),
    r(122, 66, 66, 66, 1, 32, 0, 1, 0, 0, 0, 5),
    r(123, 67, 67, 67, 1, 32, 0, 1, 0, 0, 0, 5),
    r(124, 67, 67, 67, 1, 32, 0, 1, 0, 0, 0, 5),
    r(125, 101, 101, 101, 1, 32, 0, 1, 0, 0, 0, 5),
    r(126, 112, 112, 112, 1, 32, 0, 1, 0, 0, 0, 5),
    r(127, 113, 113, 113, 2, 32, 0, 0, 1335, 199, 0, 5),
    r(128, 126, 126, 11, 1, 31, 1, 1, 0, 0, 0, 0),
    r(129, 126, 126, 11, 1, 29, 0, 1, 0, 0, 0, 0),
    r(130, 127, 127, 11, 1, 28, 1, 1, 0, 0, 0, 0),
    r(131, 128, 128, 128, 0, 5, 1, 0, 0, 0, 0, 0),
    r(132, 124, 124, 124, 1, 11, 0, 1, 0, 0, 0, 0),
    r(133, 125, 125, 125, 2, 11, 0, 0, 1858, 204, 0, 0),
    r(134, 125, 125, 125, 2, 32, 0, 0, 2386, 230, 0, 5),
    r(135, 124, 124, 124, 1, 11, 0, 1, 0, 0, 0, 0),
    r(136, 112, 112, 112, 1, 11, 0, 1, 0, 0, 0, 0),
    r(140, 134, 134, 134, 1, 12, 1, 1, 0, 0, 0, 0),
    r(142, 136, 136, 136, 4, 12, 16, 0, 0, 0, 0, 0),
    r(143, 137, 137, 137, 4, 12, 8, 0, 0, 0, 0, 0),
    r(144, 138, 138, 138, 1, 7, 0, 1, 0, 0, 0, 0),
    r(145, 139, 139, 139, 1, 11, 0, 1, 0, 0, 0, 6),
    r(146, 141, 141, 141, 1, 11, 0, 1, 0, 0, 0, 0),
    r(147, 142, 142, 142, 1, 7, 0, 1, 0, 0, 0, 0),
    r(148, 139, 139, 139, 1, 11, 0, 1, 0, 0, 0, 0),
    r(149, 139, 139, 139, 1, 11, 0, 1, 0, 0, 0, 0),
    r(150, 139, 139, 139, 1, 11, 0, 1, 0, 0, 0, 0),
    r(151, 140, 140, 140, 1, 11, 0, 1, 0, 0, 0, 0),
    r(152, 140, 140, 140, 1, 11, 0, 1, 0, 0, 0, 0),
    r(153, 140, 140, 140, 1, 11, 0, 1, 0, 0, 0, 0),
    r(154, 143, 143, 135, 1, 30, 1, 1, 0, 0, 0, 0),
    r(155, 138, 138, 138, 1, 11, 0, 1, 0, 0, 0, 0),
    r(156, 141, 141, 141, 1, 32, 0, 1, 0, 0, 0, 5),
    r(159, 228, 228, 228, 1, 12, 1, 1, 273, 87, 0, 0),
    r(160, 113, 113, 113, 2, 11, 0, 0, 804, 199, 0, 0),
    r(161, 229, 229, 229, 2, 11, 0, 0, 596, 199, 0, 0),
    r(162, 230, 230, 230, 2, 11, 0, 0, 804, 199, 0, 0),
    r(163, 114, 114, 114, 2, 3, 32, 1, 596, 199, 5, 7),
    r(167, 213, 213, 210, 2, 12, 1, 15, 4037, 255, 0, 0),
    r(170, 211, 36, 11, 0, 31, 1, 0, 0, 0, 0, 0),
    r(171, 211, 51, 210, 2, 12, 1, 15, 1229, 230, 0, 0),
    r(172, 211, 211, 11, 0, 29, 1, 0, 0, 0, 0, 0),
    r(173, 109, 110, 110, 0, 9, 1, 0, 0, 0, 0, 0),
    r(174, 114, 115, 98, 1, 12, 1, 1, 1162, 191, 0, 0),
    r(175, 148, 148, 148, 2, 15, 1, 0, 904, 219, 0, 0),
    r(176, 40, 51, 35, 2, 12, 1, 15, 631, 204, 0, 0),
    r(177, 94, 95, 35, 2, 12, 1, 15, 631, 204, 0, 0),
    r(178, 40, 51, 40, 2, 12, 1, 15, 631, 204, 0, 0),
    r(179, 41, 51, 40, 2, 12, 1, 15, 631, 204, 0, 0),
    r(180, 41, 51, 99, 2, 12, 1, 15, 1882, 204, 0, 0),
    r(181, 53, 53, 53, 1, 11, 0, 1, 0, 0, 0, 0),
    r(182, 53, 53, 53, 1, 11, 0, 1, 0, 0, 0, 0),
    r(183, 142, 142, 142, 1, 11, 0, 1, 0, 0, 0, 0),
    r(184, 53, 53, 53, 1, 11, 0, 1, 0, 0, 0, 0),
    r(185, 66, 66, 66, 1, 11, 0, 1, 0, 0, 0, 0),
    r(186, 69, 69, 69, 1, 11, 0, 1, 0, 0, 0, 0),
    r(187, 53, 53, 53, 1, 11, 0, 1, 0, 0, 0, 0),
    r(188, 67, 67, 67, 1, 11, 0, 1, 0, 0, 0, 0),
    r(189, 67, 67, 67, 1, 11, 0, 1, 0, 0, 0, 0),
    r(190, 13, 13, 47, 4, 2, 1, 0, 0, 0, 0, 0),
    r(191, 12, 12, 49, 2, 18, 1, 0, 3715, 255, 0, 0),
    r(193, 152, 152, 152, 2, 12, 1, 15, 614, 168, 0, 0),
    r(195, 154, 154, 154, 2, 12, 1, 15, 1346, 143, 0, 0),
    r(196, 155, 155, 155, 2, 12, 1, 15, 837, 143, 0, 0),
    r(197, 156, 156, 156, 2, 15, 0, 0, 2963, 255, 0, 0),
    r(198, 157, 157, 157, 2, 15, 0, 0, 1947, 255, 0, 0),
    r(199, 158, 158, 158, 1, 11, 0, 1, 0, 0, 0, 8),
    r(200, 159, 159, 159, 1, 11, 0, 1, 0, 0, 0, 8),
    r(201, 12, 12, 12, 1, 23, 0, 1, 2211, 230, 0, 0),
    r(202, 160, 160, 160, 1, 14, 1, 1, 0, 0, 0, 0),
    r(203, 161, 161, 161, 1, 14, 1, 1, 0, 0, 0, 0),
    r(204, 160, 160, 160, 1, 14, 0, 1, 0, 0, 0, 0),
    r(205, 161, 161, 161, 1, 14, 0, 1, 0, 0, 0, 0),
    r(206, 160, 160, 160, 1, 14, 1, 1, 0, 0, 0, 0),
    r(207, 161, 161, 161, 1, 14, 1, 1, 0, 0, 0, 0),
    r(208, 160, 160, 160, 1, 14, 0, 1, 0, 0, 0, 0),
    r(209, 161, 161, 161, 1, 14, 0, 1, 0, 0, 0, 0),
    r(210, 126, 126, 11, 1, 29, 0, 1, 0, 0, 0, 0),
    r(221, 164, 164, 163, 1, 21, 0, 1, 0, 0, 0, 0),
    r(222, 145, 145, 145, 1, 15, 0, 1, 0, 0, 0, 0),
    r(223, 146, 146, 146, 1, 15, 0, 1, 0, 0, 0, 0),
    r(224, 147, 147, 147, 1, 15, 0, 1, 0, 0, 0, 0),
    r(225, 50, 51, 43, 2, 22, 1, 0, 1352, 184, 0, 0),
    r(226, 127, 127, 11, 1, 4, 1, 1, 0, 0, 0, 0),
    r(227, 11, 12, 11, 1, 33, 0, 1, 0, 0, 0, 0),
    r(228, 127, 127, 11, 1, 4, 1, 1, 0, 0, 0, 0),
    r(229, 127, 127, 11, 1, 4, 1, 1, 0, 0, 0, 0),
    r(230, 127, 127, 11, 1, 4, 1, 1, 0, 0, 0, 0),
    r(231, 127, 127, 11, 1, 4, 1, 1, 0, 0, 0, 0),
    r(232, 127, 127, 11, 1, 4, 1, 1, 0, 0, 0, 0),
    r(233, 127, 127, 11, 1, 4, 1, 1, 0, 0, 0, 0),
    r(234, 113, 113, 113, 2, 32, 0, 0, 1335, 199, 0, 5),
    r(240, 91, 92, 11, 0, 1, 1, 0, 0, 0, 0, 0),
    r(241, 94, 94, 11, 0, 27, 1, 0, 0, 0, 0, 0),
    r(242, 94, 95, 11, 0, 26, 1, 0, 938, 173, 0, 0),
    r(243, 253, 253, 253, 1, 3, 32, 1, 0, 0, 6, 9),
    r(244, 67, 67, 67, 2, 3, 32, 1, 0, 184, 1, 10),
    r(245, 254, 255, 254, 1, 3, 32, 1, 0, 0, 7, 11),
    r(247, 67, 67, 67, 1, 11, 0, 1, 0, 0, 0, 0),
    r(248, 93, 93, 11, 0, 36, 1, 0, 0, 0, 0, 0),
    r(249, 97, 96, 11, 0, 8, 1, 0, 0, 0, 0, 0),
    r(250, 98, 98, 3, 1, 0, 0, 1, 0, 0, 0, 0),
    r(251, 99, 99, 99, 2, 35, 1, 0, 887, 184, 0, 0),
    r(252, 91, 92, 11, 0, 13, 1, 0, 0, 0, 0, 0),
    r(253, 11, 11, 11, 1, 9, 0, 1, 0, 0, 0, 0),
    r(257, 170, 170, 170, 1, 12, 1, 1, 0, 0, 0, 12),
    r(258, 171, 171, 171, 2, 12, 1, 15, 578, 158, 0, 12),
    r(260, 173, 173, 173, 1, 11, 0, 1, 0, 0, 0, 12),
    r(262, 175, 175, 175, 2, 12, 1, 15, 804, 199, 0, 0),
    r(263, 176, 176, 176, 1, 12, 1, 1, 0, 0, 0, 0),
    r(264, 177, 177, 177, 2, 11, 0, 0, 596, 199, 0, 0),
    r(265, 178, 178, 178, 2, 11, 0, 0, 1874, 214, 0, 0),
    r(266, 179, 179, 179, 1, 11, 0, 1, 0, 0, 0, 0),
    r(267, 180, 180, 180, 2, 11, 0, 0, 306, 163, 0, 0),
    r(269, 182, 182, 182, 4, 12, 1, 0, 0, 0, 0, 0),
    r(270, 183, 183, 183, 1, 3, 32, 1, 0, 0, 5, 13),
    r(271, 184, 184, 184, 2, 3, 32, 1, 596, 199, 8, 14),
    r(272, 185, 185, 185, 1, 3, 32, 1, 0, 0, 0, 0),
    r(273, 186, 186, 186, 1, 3, 32, 1, 0, 0, 3, 15),
    r(279, 192, 192, 192, 2, 12, 1, 15, 1130, 224, 0, 0),
    r(281, 194, 194, 194, 2, 11, 0, 0, 1112, 235, 0, 0),
    r(282, 195, 195, 195, 4, 12, 1, 0, 0, 0, 0, 0),
    r(284, 197, 197, 197, 1, 11, 0, 1, 0, 0, 0, 0),
    r(285, 198, 198, 198, 2, 12, 1, 15, 2609, 199, 0, 0),
    r(288, 201, 201, 201, 2, 12, 1, 15, 563, 122, 0, 0),
    r(289, 202, 202, 202, 2, 12, 1, 15, 1448, 230, 0, 0),
    r(290, 203, 203, 203, 1, 11, 0, 1, 0, 0, 0, 0),
    r(291, 204, 204, 204, 1, 11, 0, 1, 0, 0, 0, 16),
    r(292, 205, 205, 205, 1, 11, 0, 1, 0, 0, 0, 0),
    r(293, 206, 206, 206, 2, 11, 0, 0, 2146, 219, 0, 0),
    r(539, 225, 225, 225, 1, 11, 0, 1, 0, 0, 0, 0),
    r(540, 226, 226, 226, 1, 12, 1, 1, 0, 0, 0, 0),
    r(541, 227, 227, 227, 1, 19, 0, 1, 0, 0, 0, 0),
    r(544, 211, 210, 11, 1, 25, 0, 1, 0, 0, 0, 0),
    r(551, 182, 182, 182, 4, 12, 1, 0, 0, 0, 0, 0),
    r(565, 235, 235, 235, 1, 3, 32, 1, 0, 0, 3, 0),
    r(566, 236, 236, 236, 1, 3, 32, 1, 0, 0, 3, 0),
    r(567, 237, 237, 237, 1, 3, 32, 1, 0, 0, 3, 0),
    r(569, 240, 240, 240, 1, 3, 32, 1, 0, 0, 9, 17),
    r(570, 241, 241, 241, 1, 3, 32, 1, 0, 0, 10, 18),
    r(571, 242, 242, 242, 1, 3, 32, 1, 0, 0, 11, 19),
    r(572, 243, 243, 243, 1, 3, 32, 1, 0, 0, 12, 20),
];

pub(crate) fn canonical_specialty_material_v1(block_id: u16) -> Option<CanonicalSpecialtyMaterialV1> {
    let index = SPECIALTIES.binary_search_by_key(&block_id, |(id, _)| *id).ok()?;
    let Raw(
        side_tile,
        top_tile,
        bottom_tile,
        layer,
        shape,
        flags,
        light_dampening,
        emitted_light,
        packed_emission,
        aquatic_profile,
        vertical_group,
    ) = SPECIALTIES[index].1;
    let layer = match layer {
        0 => TerrainMeshLayerV1::Opaque,
        1 => TerrainMeshLayerV1::Cutout,
        2 => TerrainMeshLayerV1::Emissive,
        3 => TerrainMeshLayerV1::TranslucentSolid,
        4 if block_id == 7 => TerrainMeshLayerV1::Water,
        4 if block_id == 12 => TerrainMeshLayerV1::Glass,
        4 => TerrainMeshLayerV1::Transparent,
        _ => unreachable!("catalog layer codes are generated and validated"),
    };
    let liquid = if flags & 2 != 0 {
        CanonicalLiquidV1::Water
    } else if flags & 4 != 0 {
        CanonicalLiquidV1::Lava
    } else if flags & 8 != 0 {
        CanonicalLiquidV1::Honey
    } else if flags & 16 != 0 {
        CanonicalLiquidV1::Syrup
    } else {
        CanonicalLiquidV1::None
    };
    let shape = CanonicalShapeV1::from_code(shape).expect("frozen catalog shape code is valid");
    let shape_variant = match block_id {
        31 => 1,
        60..=63 => block_id - 58,
        93..=96 => block_id - 83,
        52..=59 => block_id - 32,
        202..=209 => block_id - 174,
        64..=71 => block_id - 24,
        226 => 50,
        228..=233 => block_id - 177,
        _ => 0,
    };
    let ambient_occlusion = flags & 1 != 0
        && matches!(shape, CanonicalShapeV1::Cube)
        && !matches!(layer, TerrainMeshLayerV1::Transparent | TerrainMeshLayerV1::Cutout);
    Some(CanonicalSpecialtyMaterialV1 {
        side_tile,
        top_tile,
        bottom_tile,
        layer,
        shape,
        solid: flags & 1 != 0,
        liquid,
        waterlogged: flags & 32 != 0,
        connects_fence: flags & 64 != 0,
        light_dampening,
        emitted_light,
        emissive_strength_bits: (f64::from(packed_emission) / 255.0).to_bits(),
        aquatic_profile,
        vertical_group: u16::from(vertical_group),
        shape_variant,
        geometry_revision: 1,
        tint_policy: 1,
        ambient_occlusion,
        selective_interior_faces: matches!(block_id, 6 | 18 | 20 | 28 | 87 | 104 | 107 | 140 | 159 | 540),
        directionally_placed: matches!(
            shape,
            CanonicalShapeV1::Alchemy
                | CanonicalShapeV1::Apiary
                | CanonicalShapeV1::ArchiveShelf
                | CanonicalShapeV1::Barrel
                | CanonicalShapeV1::Bed
                | CanonicalShapeV1::Cartography
                | CanonicalShapeV1::Chair
                | CanonicalShapeV1::Chest
                | CanonicalShapeV1::Distillery
                | CanonicalShapeV1::Door
                | CanonicalShapeV1::Fireplace
                | CanonicalShapeV1::Incubator
                | CanonicalShapeV1::OrbHealer
                | CanonicalShapeV1::OrbRack
                | CanonicalShapeV1::Shelf
                | CanonicalShapeV1::Sugarworks
                | CanonicalShapeV1::Table
                | CanonicalShapeV1::TomeDisplay
                | CanonicalShapeV1::Wayshrine
                | CanonicalShapeV1::WildHive
        ) || block_id == 31,
        joins_same_horizontal: matches!(shape, CanonicalShapeV1::Chest | CanonicalShapeV1::Exhibit),
        joins_same_vertical: matches!(shape, CanonicalShapeV1::Aquarium | CanonicalShapeV1::OrbRack),
    })
}

#[cfg(test)]
pub(crate) fn specialty_catalog_ids_v1() -> impl Iterator<Item = u16> {
    SPECIALTIES.iter().map(|(block_id, _)| *block_id)
}
