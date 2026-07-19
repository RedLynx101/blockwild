# Block and Material-Family Visual Brief

Use this for a new block, a texture redesign, or a biome/cultural material-family pass. Extend an existing `BLOCK_VISUAL_FAMILIES` entry unless the material truly needs a new construction language.

## Identity

- **Block / family name:** [stable IDs and player-facing names]
- **Material source:** [geology, plant, creature, culture, process, or unresolved phenomenon]
- **Biome / culture:** [where it belongs and who makes or uses it]
- **World role:** [substrate, structure, organic, accent, functional, rare/magical]
- **Gameplay role:** [terrain, recipe, storage, light, mechanism, farming, hazard, decoration]
- **Acquisition route:** [natural generation, structure, drop, crafting, trade, growth]

## Material language

- **Material rule:** [grain, bedding, fracture, weave, plate, frosting, current, or other directional behavior]
- **Construction rule:** [joinery, mortar, brace, rivet, seam, socket, frame, drainage, growth]
- **Accent rule:** [the limited focal color, metal, cloth, crystal, bloom, or active light]
- **Palette:** [base dark / midtone / highlight / wear / exceptional accent]
- **Neighbor materials:** [blocks it must blend with in terrain and structures]
- **Reference family:** [closest `BLOCK_VISUAL_FAMILIES` entry and intentional difference]

## Atlas and geometry

- **Top face:** [growth, load, cap, grain, or weather behavior]
- **Side face:** [strata, vertical grain, joinery, hanging roots, seams]
- **Bottom face:** [underside material and structural logic]
- **Repeat motif:** [how the tile avoids obvious 3 x 3 wallpapering]
- **Render layer:** [opaque, cutout, transparent, emissive]
- **Shape / collision:** [cube or justified reusable geometry; visible and interaction volumes]
- **Emission / transparency coverage:** [bounded source and frame; ordinarily under 25 percent]

## Family coverage

- [ ] Natural substrate or compatible host material.
- [ ] Structural / processed form where needed.
- [ ] Organic form where the source is living.
- [ ] Restrained accent material.
- [ ] Functional block using the same construction language.
- [ ] Rare or active material only when the family needs it.

## Review captures

- [ ] Exact 16 x 16 top, side, and bottom atlas cells.
- [ ] One isolated block and a 3 x 3 or 5 x 5 repeated surface.
- [ ] Mixed-material corner with expected neighbors.
- [ ] Representative biome, structure, or interior at gameplay distance.
- [ ] Day, night/shadow, underwater, inventory, held, and placed states where applicable.
- [ ] Transparency has a readable edge; emission retains a dark structural frame.
- [ ] Collision, interaction point, tool, hardness, drop, recipe, and placement agree with the art.
- [ ] The block-family review sheet was inspected manually for seams and palette drift.

## Definition of done

- [ ] The material is recognizable without its name.
- [ ] Face direction follows growth, geology, or construction.
- [ ] Authored clusters replace uniform one-pixel noise.
- [ ] Cultural difference is expressed through fabrication, not only hue.
- [ ] The block has a coherent acquisition and world-use route.
- [ ] The exact-runtime visual audit has zero violations.
