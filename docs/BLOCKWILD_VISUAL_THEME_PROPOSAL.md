# Blockwild Unified Visual Theme

**Status:** Adopted and enforced in production as of v1.7.1.

**Canonical visual thesis:** **handcrafted voxel naturalism**.

The executable source of truth is [`app/game/visual-theme.ts`](../app/game/visual-theme.ts). Use the fillable [`Creature Visual Brief`](templates/CREATURE_VISUAL_BRIEF.md) and [`Block / Material-Family Visual Brief`](templates/BLOCK_VISUAL_BRIEF.md) before substantial new art work. Run `npm run audit:visual-theme` before release and `npm run showcase:visual-theme` for exact production-atlas review sheets.

Blockwild should look like a world assembled from purposeful, touchable pieces. Its creatures use **high-detail cubic storybook anatomy**. Its terrain, blocks, structures, props, and machines use **grounded storybook materialism**. Both halves share the same promise: a player should understand what something is made from, how it holds itself together, and why it belongs where it appears.

This standard is intended for new work and for deliberate redesign passes. It should prevent two recurring failures: simple blockouts being mistaken for finished models, and smooth or gimmicky assets breaking the visual relationship between creatures and the voxel world.

## 1. World-level principles

1. **Grid-native does not mean crude.** Cuboids are the primary shape language, but detail comes from proportion, overlap, layering, rotation, material contrast, and silhouette—not from replacing a finished design with one large cube.
2. **Ecology before ornament.** A creature, plant, block, or structure should first explain its habitat and function. Decorative motifs should reinforce that explanation.
3. **Construction must be legible.** Limbs enter joints, claws enter paws, roofs sit on walls, metal fittings reinforce wood, and magical fragments have visible anchors or paths.
4. **Detail is hierarchical.** Read the subject at three distances: identity at long range, anatomy/material family at middle range, and authored story detail up close.
5. **Materials behave honestly.** Wood has grain direction and joinery; stone has bedding and fractures; metal has seams and fittings; glass transmits; cloth hangs; water gathers; confection bends, drips, or crusts.
6. **Magic is concentrated contrast.** Glow, transparency, orbiting parts, impossible suspension, and saturated color identify a source or event. If everything glows, nothing feels magical.
7. **Fantasy grows out of the world.** Novelty alone is not a concept. A fantastic asset needs a believable ecological, cultural, geological, magical, or mechanical reason to exist.

---

# Part I — Creature Theme

## 2. Canonical creature language

The default Blockwild creature is built from layered cuboids and rectangular prisms arranged as a connected articulated hierarchy. The result should feel halfway between a carved storybook animal, a sophisticated voxel sculpture, and a functional game rig.

The standard is **high-detail cubic**, not merely “blocky.” A finished quadruped normally contains a distinct torso, shoulder mass, haunch mass, belly or chest plane, neck transition, skull, face planes, articulated limbs, feet, distal details, and species-specific silhouette structures.

### 2.1 Shape vocabulary

- **Primary masses:** broad cuboids for torso, skull, shell, mantle, major muscle groups, or mechanical housings.
- **Secondary masses:** offset and overlapping cuboids for shoulders, haunches, cheeks, brows, belly planes, feather groups, armor, fins, and layered fur.
- **Structural segments:** narrow rectangular prisms for bones, legs, tendons, necks, antennae, ribs, branches, and braces.
- **Directional wedges:** rotated thin boxes for beaks, claws, fangs, fins, ears, feathers, antlers, sails, and sharp magical marks.
- **Micro-details:** small cuboids for eyes, highlights, nostrils, toes, rivets, teeth, berries, scales, scars, straps, and material transitions.
- **Exceptional continuous geometry:** reserved for an approved silhouette that loses its meaning when cubified. The reason must be written down.

Cuboids may be rotated and nonuniformly scaled. They should not all align to the world grid; subtle angles communicate posture, musculature, flow, and weight.

## 3. Required design brief

Before modeling, write a compact brief containing:

| Field | Requirement |
|---|---|
| Gameplay identity | Passive, defensive, hostile, mount, summon, worker, boss, ambient, or combination |
| Habitat | Exact biome, elevation/depth, time, weather, and ecological niche |
| Scale | Player-relative length, height, and shoulder/eye level |
| Locomotion | Walk, hop, climb, burrow, fly, glide, swim, slither, float, or mixed |
| Silhouette sentence | One sentence describing what must remain recognizable in shadow |
| Material sentence | What the body and special structures appear to be made from |
| Face sentence | Expression, sensory organs, mouth type, and player-readable temperament |
| Signature structures | Two to four features unique to the species |
| Animation verbs | At least idle, travel, alert, and one signature action |
| Ecology verb | What it visibly does in the world besides existing or fighting |
| Capture/care implication | What anatomy or behavior matters when befriending or housing it |

If these fields are generic, the model will usually be generic too.

## 4. Silhouette construction

### 4.1 Long-range read

A creature should remain identifiable at Bestiary-thumbnail size and from the normal gameplay camera. Before adding eyes, markings, glow, or equipment:

- Render it as a solid dark silhouette.
- Compare it with creatures sharing its body plan.
- Require at least two species-specific silhouette features.
- Check front three-quarter and true side views.
- Check that equipment does not become the only recognizable feature.

Good silhouette differences come from proportions and anatomy: a low digging chest, elevated spring legs, deep aquatic head, sail-backed spine, broad reef mantle, or open constellation ribcage. Color swaps are not silhouette variants.

### 4.2 Mass hierarchy

Build from largest to smallest:

1. Torso or central body.
2. Shoulder/chest and hip/haunch masses.
3. Neck and head transition.
4. Skull and face planes.
5. Locomotion structures.
6. Tail, wings, fins, shell, mantle, or major signature feature.
7. Material layers and equipment.
8. Eyes, claws, teeth, markings, particles, and other micro-details.

Do not begin with decoration. A model whose identity disappears when antlers or glow are hidden is unfinished.

## 5. Connected anatomy standard

### 5.1 Terrestrial limbs

Every load-bearing leg should normally contain:

1. Body socket or hip/shoulder mass.
2. Upper segment overlapping the socket.
3. Knee, elbow, or hock joint.
4. Lower segment overlapping the joint.
5. Ankle or wrist transition.
6. Planted foot, paw, or hoof.
7. Attached toes, claws, pads, webbing, or split hoof.

Adjacent pieces should overlap by roughly 10–20% of the smaller segment. A joint conceals the seam. A claw begins inside the paw. A hoof sits beneath the ankle rather than hovering near it.

Small animals may compress this chain, but they still need a visible load path. Legendary animals may add muscle plates, tendons, braces, internal light, water, crystal, or armor around the same functional hierarchy.

### 5.2 Wings and fins

- Wings require a shoulder root, leading structural edge, span mass, trailing surface, and terminal feathers or membrane shape.
- Bird feathers should be grouped into readable layers rather than represented by one flat rectangle or dozens of random slivers.
- Fins should connect through a root plane and reflect the creature’s locomotion: steering, lift, braking, display, or propulsion.
- Transparent membranes need an opaque or emissive structural edge so their attachment remains readable.

### 5.3 Tails, antennae, antlers, and branches

- Long structures should have a root, one or more directional segments, and a terminal feature.
- Heavy tails use fewer, broader segments and slower animation.
- Whip tails and antennae use smaller phase offsets but must never vibrate at an insect-like frequency unless that is the concept.
- Antlers and branches should fork intentionally and follow a growth rhythm. Random spike clouds are visual noise.

### 5.4 Aquatic anatomy

- Establish the propulsion system first: caudal tail, mantle jet, fin undulation, paddles, tentacles, or serpentine body.
- Give the head a readable front. Aquatic does not mean faceless.
- Eyes, rostrum, jaw, gills, blowhole, mouth line, or sensory barbels should communicate how the animal perceives and feeds.
- Keep floating height and water presentation separate from terrain foot-contact rules.

## 6. Face standard

Every ordinary animal face should expose at least four readable planes:

1. Brow or forehead.
2. Eye line with eyes attached to the head rig.
3. Cheek, mask, or side plane.
4. Muzzle, rostrum, beak, or mouth/jaw plane.

Add a nose, nostrils, mouth line, teeth, whiskers, gills, or blowhole when the species calls for it. Eyes should not be the only evidence that a face exists.

Expression comes primarily from brow angle, eye placement, muzzle proportion, ear posture, and head carriage. Avoid oversized generic “cute” eyes unless the entire species concept supports them.

## 7. Detail and material layering

### 7.1 Organic creatures

Represent fur, scales, bark, feathers, moss, and hide through grouped planes and material regions:

- One dominant body material.
- One supporting material or underside.
- One structural dark or pale accent.
- One small high-contrast focus around face, feet, or signature structure.

Fur detail should read as larger tufts, mantles, cheek blocks, or directional ridges—not uniform spikes covering the body.

### 7.2 Crafted or armored creatures

Separate the creature from its equipment:

- Body mass remains readable beneath equipment.
- Saddles have a seat, pad, girth, brace, and fastening logic.
- Banners require a spine or crossbar.
- Armor follows the anatomy and leaves functional joints free.
- Mechanical pieces use housings, pivots, seams, fittings, and wear-bearing surfaces.

### 7.3 Confection, mineral, glass, water, and magical bodies

- **Confection:** distinguish cake, wafer, icing, jam, hard candy, gumdrop, caramel, and sugar glass through color, layering, thickness, drip direction, and gloss—not random candy icons.
- **Mineral:** use bedding, crystal growth direction, ore seams, fractured planes, and weight.
- **Glass:** retain a readable frame, edge tint, internal feature, and controlled transparency.
- **Water:** show containment, flow direction, pools, drips, internal currents, or shore lines.
- **Magic:** identify a source, route, field boundary, or contract mark. Magical pieces need causal organization.

## 8. Floating and impossible anatomy

Floating geometry is allowed only when the separation communicates the concept. Use at least one:

- Emissive ligament or tether.
- Repeated orbital path.
- Transparent field or containment plane.
- Aligned joint-stars or runes.
- Dripping or flowing material connecting the gap.
- Clear summoning-contract or mechanical suspension structure.

Accidental gaps, detached claws, abandoned eyes, and limbs floating near the torso are bugs, not magic.

## 9. Animation language

### 9.1 Rig rules

- Animate pivots, not mesh vertices or world-space decorations.
- Cache named animation nodes once; do not traverse the hierarchy every frame.
- Store rest transforms and always animate relative to them.
- Parent details to the body part they follow.
- Keep nonuniform authored scale intact.
- Never accumulate transforms across frames.

### 9.2 Motion hierarchy

- Root/body motion establishes weight and cadence.
- Upper limbs carry most stride amplitude.
- Knees, hocks, ankles, and feet add smaller counter-motion.
- Head, tail, ears, fins, equipment, and magical elements follow with concept-appropriate lag.
- Heavy creatures move more slowly and settle longer.
- Small animals may move faster, but animation should still be readable rather than twitchy.

### 9.3 Minimum pose set

Every creature needs intentional behavior for:

- Idle/breathing.
- Travel at its primary locomotion mode.
- Alert or targeting.
- Damage/recoil compatibility.
- One species-specific action: dig, forage, sing, flare, pounce, filter-feed, preen, bloom, charge, or similar.

Mounts additionally need rider-safe travel, turn, jump/ascent, water transition where applicable, and tack that follows the rig.

## 10. Scale and contact

- Define adult and baby scale independently; babies should not merely be adult rigs reduced until details vanish.
- Check eye height and collision silhouette against the player.
- Grounded species must touch the terrain plane exactly in production spawn coordinates.
- Aquatic and flying species need an authored presentation height rather than an artificial ground correction.
- Feet should remain close to the contact plane through more of the stride than the swing.

## 11. Detail and performance budgets

These are target bands, not excuses to delete concept-critical anatomy:

| Creature tier | Typical visible parts | Approximate cuboid triangles | Expected authored detail |
|---|---:|---:|---|
| Tiny ambient | 14–30 | 168–360 | Complete silhouette, face cue, locomotion cue |
| Ordinary fauna | 28–60 | 336–720 | Connected anatomy, face, material regions, signature feature |
| Signature/rare | 50–90 | 600–1,080 | Secondary anatomy, ecological detail, richer animation |
| Legendary/summon | 75–140 | 900–1,680 | Narrative structures, staged materials/effects, encounter readability |

Spend parts on silhouette, face, feet, joints, and signature structures before repeating decorative micro-details. Reuse immutable geometry and materials where practical, but never merge moving body parts that need independent pivots.

## 12. Approved reference ladder

Use these tracked portraits as visual anchors and inspect their production rig in [`living-bestiary-models.ts`](../app/game/living-bestiary-models.ts).

| Reference | What it demonstrates |
|---|---|
| [Asterjaw](../public/creatures/asterjaw.svg) | Benchmark for a detailed magical creature: strong head, connected star-jointed legs, transparent body field, internal constellation, and readable material hierarchy |
| [Hearthback Badger](../public/creatures/hearthback-badger.svg) | Dense natural quadruped, broad digging silhouette, embedded claws, layered back, and readable face |
| [Wreckwhistle Porpoise](../public/creatures/wreckwhistle-porpoise.svg) | Aquatic silhouette with melon, eyes, rostrum, jaw, blowhole, fins, and propulsion anatomy |
| [Ilyr Virebloom](../public/creatures/ilyr-virebloom.svg) | Ecology integrated into anatomy: spring legs, hoof pools, growth structures, and luminous water route |
| [Kharza](../public/creatures/kharza.svg) | Equipment-bearing animal whose banner, scars, jaw, and limbs remain structurally coherent |
| [Sugarwake Sovereign](../public/creatures/sugarwake-sovereign.svg) | Rich material storytelling without becoming a pile of icons: icing, wafer, jam, gumdrop, crown, and quadruped anatomy |
| [Glasswake Stag](../public/creatures/glasswake-stag.svg) | Transparent and emissive creature with a solid readable frame, internal tides, face, antlers, and planted feet |

### Deliberate exception references

| Reference | Why it remains faceted rather than fully cubic |
|---|---|
| [Thalassene](../public/creatures/thalassene.svg) | The Reef That Swims depends on continuous living reef growth and layered organic mantle flow |
| [Orichalc](../public/creatures/orichalc.svg) | The Oath Under Stone depends on true central negative space and an encircling oath structure |
| [Vellum Warden](../public/creatures/vellum-warden.svg) | Folded paper strata and living-ink joints need thin layered planes |
| [Choir-of-One](../public/creatures/choir-of-one.svg) | Its suspended bell/sound-body depends on hanging curved volume and deliberate open space |

Exceptions are references for exceptional needs, not shortcuts for ordinary animals.

## 13. Creature anti-patterns

- One torso cube, one head cube, and four stick legs presented as finished.
- Four identical oval or cylindrical legs with no joints or feet.
- Color-only variants with unchanged silhouette and detail.
- Eyes attached to the world root instead of the moving head.
- Claws, hooves, teeth, or equipment hovering near their intended parent.
- A faceless aquatic or abstract body whose lore must compensate for missing visual information.
- Uniform spikes, foliage, candy, crystals, or particles scattered over every surface.
- Saturated emissive material applied to the whole creature.
- Magic used to excuse weak construction.
- High polygon counts spent on smoothness while the silhouette remains generic.
- Animation that shakes tails, ears, or limbs faster than their apparent mass permits.

## 14. Creature production workflow

1. Write the required brief.
2. Collect two or three biological/material references and two Blockwild model references.
3. Block the silhouette with primary masses.
4. Render silhouette-only front three-quarter and side views.
5. Build connected anatomy and face planes.
6. Add signature structures and material layers.
7. Rig and parent every distal detail.
8. Add restrained material effects and secondary animation.
9. Calibrate scale and ground/water/flight presentation.
10. Render exact production geometry from front three-quarter, front, and side.
11. Test idle, travel, alert, and signature action without drift.
12. Regenerate the canonical Bestiary portrait.
13. Compare against at least one reference model at identical card scale.

## 15. Creature definition of done

- [ ] Silhouette remains identifiable without color or effects.
- [ ] Species differs from same-body-plan creatures in more than palette.
- [ ] Face has brow, eyes, side/cheek plane, and muzzle/jaw/beak structure.
- [ ] Every load-bearing limb has a connected load path and planted distal anatomy.
- [ ] Every detail follows the correct pivot.
- [ ] Floating features have visible narrative anchors.
- [ ] Materials are distinguishable by structure and value, not name alone.
- [ ] Idle/travel/alert/signature motion is readable and drift-free.
- [ ] Scale, collision expectations, and contact plane are correct.
- [ ] Three exact-runtime views have been manually reviewed.
- [ ] Bestiary portrait matches the in-world model.
- [ ] Tests cover species-critical anatomy and animation contracts.

---

# Part II — Blocks, Terrain, Props, and Structures

## 16. Canonical world-object language

The proposed general theme is **grounded storybook materialism**: readable voxel materials with hand-authored motifs, restrained fantasy accents, and believable construction. Blocks should blend into large landscapes and buildings before they call attention to themselves as inventory icons.

Blockwild currently uses a deterministic 16×16-pixel-per-tile atlas with nearest filtering and no mipmaps. New block art should respect that contract rather than simulate a separate high-resolution art style. See [`createBlockAtlas`](../app/game/world.ts), [`BLOCKS`](../app/game/data.ts), and the authored [`BIOME_SURFACE_TEXTURES`](../app/game/biome-atmosphere.ts).

## 17. Block design priorities

1. **Tile at world scale.** A single block should look good, but a wall, hillside, floor, or roof of hundreds of blocks is the primary test.
2. **Material first.** Identify stone, soil, wood, metal, glass, cloth, plant, confection, coral, or magical composite before adding motifs.
3. **Controlled contrast.** Ordinary terrain carries low-to-medium contrast; crafted edges and interactable faces carry medium contrast; rare active magic receives the strongest contrast.
4. **Face logic.** Tops, sides, and bottoms communicate how the material grows, settles, is cut, or is assembled.
5. **Family resemblance.** Blocks introduced together should form a usable construction family rather than a collection of isolated novelty pieces.
6. **Biome belonging.** A new natural block needs a geological or ecological distribution and transition relationship with nearby materials.
7. **Functional readability without signage.** Furnaces, tables, forges, storage, conduits, doors, and machines should read through construction and silhouette rather than a bright icon painted on every face.

## 18. The 16×16 texture grammar

### 18.1 Palette

- Use roughly three to six functional colors per ordinary tile: base, dark structure, light structure, one optional material accent, and occasional rare highlight.
- Keep value separation stronger than hue separation for ordinary terrain.
- Reserve pure white, near-black, and the highest saturation for small accents.
- Relate neighboring family blocks through shared darks or shared midtones.

### 18.2 Pixel organization

- Prefer clusters and directional marks over independent one-pixel noise.
- Let 70–85% of an ordinary natural tile remain in its base material family.
- Use repeated motifs at irregular but deterministic intervals.
- Avoid checkerboards, evenly spaced dots, and high-frequency noise unless the actual material demands them.
- Preserve one or two calmer regions so the tile can breathe when repeated.

### 18.3 Face relationships

- **Soil/grass:** top carries vegetation identity; side shows a coherent fringe and soil body; bottom returns to substrate.
- **Logs:** top shows rings/cut structure; sides show vertical grain; bark contrast remains compatible with planks.
- **Stone:** bedding, fracture, or aggregate continues plausibly across the face and does not resemble random static.
- **Ore:** host rock remains dominant; ore follows seams, nodules, veins, or crystal pockets instead of confetti.
- **Brick/tile:** mortar and course rhythm align; weathering breaks repetition without erasing construction.
- **Metal:** seams, hammered patches, rivets, bands, or oxidation follow fabrication logic.
- **Transparent blocks:** readable border and sparse internal marks preserve visibility.

## 19. Block material families

Every substantial biome, culture, dungeon, or update should prefer a small coherent family:

| Family role | Minimum useful set |
|---|---|
| Natural substrate | Base stone/soil, surface form, one transition/weathered form |
| Structural | Brick/cut block, slab or trim strategy, wall/fence/pillar relationship |
| Organic | Log/stem, cut top, plank or processed form, leaves/foliage |
| Accent | One restrained decorative block derived from a local material |
| Functional | Crafting, storage, light, or mechanism using the same family |
| Rare/magical | One controlled luminous, transparent, reactive, or precious material |

Not every family needs a new block ID for every role. Existing blocks should be reused where the material relationship makes sense.

## 20. Natural blocks

- Natural surfaces should use authored motifs like the current biome recipes rather than generic randomized noise.
- Biome transitions should blend through shared substrates, vegetation, weathering, or intermediate materials.
- Ores belong to specific host rocks and depth/geology bands.
- Rare materials need field clues: nearby color change, crystal splinters, altered plants, sound, heat, or structural deformation.
- Underground bioluminescence should remain concentrated in ecological centers; ordinary tunnels stay dark enough to preserve contrast.
- Natural fantasy materials should look discovered, not placed as a theme-park prop.

## 21. Crafted blocks and furniture

- Show joinery: beams, braces, pegs, hinges, rivets, rims, bindings, or mortar.
- Keep cultural variation in proportions and fabrication methods, not only palette.
- Furniture should remain compatible with the one-block world scale and player body.
- Functional shapes may extend beyond a full cube, but collision and interaction volumes must match visible construction.
- Decorative faces should not repeat a large emblem on every block of a wall.

Examples of cultural variation:

- Dwarven work uses broad load-bearing frames, dark iron, pale fittings, brass, deep stone, and visible service access.
- Wood Elf work uses living wood direction, fitted branches, woven panels, moon-slate or glass accents, and restrained light.
- Hearthkin work uses warm wood, stone foundations, cloth, tile, compact storage, and domestic repair marks.
- Atlantian work uses water-readable openings, coral/stone structure, glass, shell or pearl accents, and current-aware geometry.
- Sugarcourt work distinguishes baked structure, hard sugar, syrup, wafer, and confection finish instead of treating everything as pink candy.

## 22. Magical and technological blocks

Use a three-layer rule:

1. **Ordinary structural body** that explains weight and placement.
2. **Mechanism or magical route** such as conduit, rune seam, lens, vent, coil, socket, or living vein.
3. **Active accent** that glows, animates, changes, transmits, or responds.

The active accent should usually occupy less than one quarter of the visible surface. A whole emissive cube is appropriate only when the entire material is truly a light source.

For unresolved materials such as Veinmetal, show repeatable behavior and visual rules without prematurely deciding whether the cause is biological, magical, mechanical, or mixed.

## 23. Block shapes and props

Full cubes remain the landscape and construction baseline. Special geometry is justified when silhouette or interaction materially improves:

- Fences and gates communicate enclosure and state.
- Tables, stools, shelves, and beds support player-scale interiors.
- Chests, barrels, forges, and machines expose functional parts.
- Plants use cutout or authored small geometry appropriate to growth.
- Hoards use irregular stacked pieces rather than one retextured cube.

Avoid special shapes that exist only as jokes or one-off decoration. A special shape should have gameplay, building, ecological, or strong cultural reuse.

## 24. Biome and structure composition

Use a restrained material ratio as a starting point:

- **60–75% dominant local material:** terrain, primary wall, or structural mass.
- **20–30% supporting material:** secondary stone/wood, roof, frame, soil, or weathered form.
- **5–10% accent:** trim, cloth, metal, flower, crystal, light, signage, or precious detail.
- **Under 5% exceptional signal:** strongest emission, quest object, rare ore, active mechanism, or magical focal point.

Break the ratio only for a specific narrative reason. A crystal cavern can contain abundant crystal, but its dark host stone still needs to frame and contrast the ecological center.

Structures should expose:

- Foundation or terrain adaptation.
- Load path from roof/upper mass to ground.
- Entry hierarchy and circulation.
- Material transition at edges and openings.
- Signs of use, repair, storage, drainage, heating, or local weather.
- One or two memorable focal details rather than uniform decoration everywhere.

## 25. Block anti-patterns

- A new material differentiated only by hue.
- Dense one-pixel noise with no material direction.
- Large iconography repeated on every wall block.
- Fully emissive terrain or structures without dark framing.
- “Fantasy” represented by adding random runes or crystals.
- A standalone novelty block with no family, recipe, world use, or building role.
- Decorative detail that destroys tiling at normal wall or hillside scale.
- Ore flecks that resemble unrelated confetti rather than geological formation.
- Cultural palettes that ignore construction method and only swap colors.
- Transparent blocks with no readable edge.

## 26. Block production workflow

1. Define material, source, biome/culture, building role, and gameplay role.
2. Identify an existing family it extends or justify a new family.
3. Choose a compact palette and face-direction rules.
4. Paint the 16×16 top, side, and bottom behavior.
5. Review one block, a 5×5 wall/floor, a mixed-material corner, and a distant structure/terrain patch.
6. Test repetition and biome adjacency.
7. Add special geometry only after the texture/material read works.
8. Verify layer, transparency, emission, collision, tool, hardness, drops, recipe, and world-generation use.
9. Capture daytime, night, shadow, underwater where applicable, inventory, and held/placed views.
10. Check that the block belongs in the world before evaluating it as an isolated icon.

## 27. Block definition of done

- [ ] Material is readable without its name.
- [ ] Tile works singly and across a repeated surface.
- [ ] Top/side/bottom logic matches growth or construction.
- [ ] Palette fits neighboring biome/cultural materials.
- [ ] Texture uses clustered authored motifs rather than uniform noise.
- [ ] Transparency and emission have readable frames and restrained coverage.
- [ ] Special geometry has a functional or reusable reason.
- [ ] Collision and interaction match the visible shape.
- [ ] Block has a coherent acquisition, recipe, drop, or world-generation route.
- [ ] Day, night, inventory, placed, mixed-material, and distance views have been reviewed.

---

# Part III — Adoption and Enforcement

## 28. Implemented enforcement tools

1. `scripts/render-living-bestiary-cubic-review.ts` renders exact-runtime creature sheets from front three-quarter, front, and side views, including `--all-cubic` coverage.
2. `app/three-compat/visual-theme-audit.ts` remains a tested build-tool oracle that reports mesh and triangle counts, body plan, face and joint detail, distal anatomy, animation parts, contact delta, material effects, style, and reference tier for every registered creature without entering the normal renderer path.
3. `CREATURE_VISUAL_EXCEPTIONS` stores a specific silhouette reason for every approved non-cubic Living Bestiary exception. The strict audit fails an undocumented exception or a non-box mesh in the 33-creature cubic roster.
4. The block audit reports visual family, top/side/bottom cells, render layer, shape, solidity, hardness, tool, drop/acquisition route, and natural/structure/recipe evidence for every registered block.
5. `scripts/render-block-style-review.ts` invokes the real `createBlockAtlas()` painter through a deterministic pixel canvas and emits the exact production atlas plus 17 material-family cards with face and 3 x 3 repeat checks.
6. `tests/visual-theme.test.ts` binds the adopted theme, reference portraits, exception registry, complete 216-creature and 294-block audit totals, movement/contact fixes, dedicated material tiles, and renderer canvas behavior into the standard release pretest.
7. Review artifacts remain ignored under `output/`; canonical portraits, implementation code, templates, tests, and this standard remain tracked.

## 29. Adoption and continuing rollout

### Phase A — Standardize new work (complete)

- The terminology, reference ladder, exception process, budgets, material families, and definition-of-done gates are canonical.
- New creature, block family, POI, and biome art passes use this document and the tracked brief templates.
- The Living Bestiary contract identifies 33 high-detail cubic creatures and four authored faceted exceptions.

### Phase B — Audit current outliers (complete and repeatable)

- The exact-runtime audit compares all registered creatures with tiered part budgets and the Asterjaw/Badger/Porpoise reference ladder.
- Release-blocking defects are separated from nonblocking legacy polish observations. Floating contact, missing movement classification, broken cubic contracts, invalid atlas cells, and orphaned blocks cannot pass silently.
- All registered blocks resolve into a named material family and are checked for face logic, acquisition, placement, material layer, and atlas validity.

### Phase C — Improve by ecosystem or culture (ongoing content practice)

- Redesign related creatures and blocks together so habitat, materials, structures, and ecology reinforce one another.
- Preserve saves and identifiers; change presentation and authored behavior without unnecessary data churn.
- Review ordinary world context before isolated showcase art.

### Phase D — Automate quality gates (complete)

- The checklists have targeted tests, a strict CLI audit, machine-readable JSON, a human Markdown queue, exact-runtime creature sheets, and exact production-atlas review sheets.
- Release violations cover empty or invalid models, ground-contact drift, cubic-contract regression, undocumented exceptions, invalid atlas cells, mismatched registry IDs, invalid solid hardness, and block-family acquisition regressions.
- Nonblocking warnings preserve a prioritized legacy polish queue without forcing performance-heavy redesigns into unrelated feature releases.

## 30. Adopted decisions

1. **Creature default:** high-detail cubic storybook anatomy, with written silhouette-based exceptions.
2. **World-object default:** grounded storybook materialism using Blockwild's 16×16 atlas and existing voxel scale.
3. **Reference bar:** Asterjaw for magical detail, Hearthback Badger for ordinary grounded anatomy, Wreckwhistle Porpoise for aquatic faces, and the other linked models for ecology, equipment, confection, and transparency.

This document is the primary art-direction contract. [`CREATURE_MODEL_STYLE.md`](CREATURE_MODEL_STYLE.md) is its concise creature implementation checklist; `app/game/visual-theme.ts` and the strict audit are its executable counterparts.
