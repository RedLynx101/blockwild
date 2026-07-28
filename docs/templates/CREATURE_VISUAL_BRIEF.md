# Creature Visual Brief

Use this before modeling or substantially redesigning a creature. Replace every bracketed field; a generic answer is a signal that the design is not ready. When generating concept art for Tripo, the TCG, or Cardforge, complete this brief and then use [`BLOCKWILD_CREATURE_IMAGEGEN_PROMPT.md`](BLOCKWILD_CREATURE_IMAGEGEN_PROMPT.md).

## Identity

- **Name / kind:** [stable game identifier and player-facing name]
- **Gameplay identity:** [passive, defensive, hostile, mount, summon, worker, boss, ambient, or combination]
- **Habitat:** [biome, elevation/depth, time, weather, ecological niche]
- **Scale:** [player-relative length, height, shoulder/eye level, juvenile scale]
- **Locomotion:** [walk, hop, climb, burrow, fly, glide, swim, slither, float, or mixed]
- **Ecology verb:** [what it visibly does besides existing or fighting]
- **Capture / care implication:** [housing, food, temperament, or anatomy that matters to ownership]

## Visual thesis

- **Silhouette sentence:** [one sentence that remains true in solid black at thumbnail scale]
- **Material sentence:** [what body, equipment, and unusual structures appear to be made from]
- **Face sentence:** [expression, sensory organs, mouth, and readable temperament]
- **Signature structures:** [two to four species-specific forms]
- **Palette hierarchy:** [body neutral / secondary material / focal accent / glow or transparency if justified]
- **Reference model:** [choose the closest role from `CREATURE_REFERENCE_MODELS` and explain what is borrowed]
- **Exception reason:** [leave blank for high-detail cubic; otherwise explain why cubification destroys the silhouette]

## Anatomy and rig

- **Primary masses:** [torso, chest/shoulders, haunches, skull, shell or mantle]
- **Connection chain:** [torso -> joint -> limb segment -> distal part for every appendage]
- **Face planes:** [brow/eye, cheek, muzzle/beak/rostrum, mouth/jaw, sensory details]
- **Distal anatomy:** [feet, paws, hooves, claws, talons, fin tips, antenna tips]
- **Load path:** [how the body visibly reaches the ground, water, air, branch, or magical anchor]
- **Equipment anchors:** [straps, sockets, braces, harness, saddle, banner, mechanism]
- **Named animation pivots:** [parts registered for animation]

## Motion

- **Idle verbs:** [breath, blink, weight shift, ear/antenna response]
- **Travel verbs:** [walk/run/hop/swim/fly cycle and secondary overlap]
- **Alert verb:** [posture change that reads before combat]
- **Signature action:** [species-specific ecology, capture, mount, spell, or combat motion]
- **Secondary-motion limits:** [tail, ears, banners, fins, glow pulses; include speed/amplitude]

## Review captures

- [ ] Front three-quarter, true front, and true side exact-runtime renders.
- [ ] Solid silhouette at Bestiary-thumbnail size.
- [ ] Feet/load path and every distal part visibly connect.
- [ ] Face reads without relying on the name or lore text.
- [ ] Day, shadow/night, and habitat-colored backgrounds remain legible.
- [ ] Idle, travel, alert, hit, death, and signature-action animations remain attached.
- [ ] Ground contact or aquatic/flying suspension is verified in runtime coordinates.
- [ ] Emission, transparency, floating, and spinning are localized and purposeful.
- [ ] Juvenile, mount, capture, equipment, or summon states are checked where applicable.
- [ ] Before/after and multi-angle review artifacts were inspected manually.

## Definition of done

- [ ] At least two silhouette traits distinguish the species from its body-plan peers.
- [ ] The model meets its `CREATURE_VISUAL_BUDGETS` target or records a deliberate exception.
- [ ] No floating limbs, claws, equipment, or unanchored decorative parts.
- [ ] Every magical effect has a visible source, route, or anchor.
- [ ] The exact-runtime visual audit has zero violations.
- [ ] Stable kind, saves, drops, sounds, spawn rules, behavior, and interactions still work.
