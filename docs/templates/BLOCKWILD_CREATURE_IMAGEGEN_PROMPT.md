# Blockwild Creature Image-Generation Prompt

This is Blockwild's canonical image-generation adapter for creature concept art intended for:

- Tripo model generation or modeling reference;
- TCG and Cardforge creature art;
- Bestiary concept exploration; and
- review renders made before a runtime model is authored.

The binding visual language remains [`BLOCKWILD_VISUAL_THEME_PROPOSAL.md`](../BLOCKWILD_VISUAL_THEME_PROPOSAL.md). Complete [`CREATURE_VISUAL_BRIEF.md`](CREATURE_VISUAL_BRIEF.md) first when the creature is intended for the game. Replace the bracketed fields below and paste the complete prompt into GPT Image. `Ordinary fauna` is the recommended default. Leave unknown fields blank so the image model infers them conservatively.

When recreating an existing Blockwild creature, provide its approved runtime portrait and append the Reference Lock section. Do not let generated art silently redefine established anatomy.

```text
Use case: stylized-concept
Asset type: production creature-model reference for the 3D voxel-fantasy game Blockwild

CREATURE BRIEF
Name: [CREATURE NAME]
Tier: [TINY AMBIENT / ORDINARY FAUNA / SIGNATURE OR RARE / LEGENDARY OR SUMMON]
Concept: [ONE OR TWO SENTENCES EXPLAINING WHAT THE CREATURE IS]
Body plan and locomotion: [BODY SHAPE, LIMB COUNT, AND HOW IT MOVES]
Personality: [TEMPERAMENT AND THE FEELING ITS POSE SHOULD COMMUNICATE]
Habitat and adaptation: [WHERE IT LIVES AND ONE WAY ITS BODY REFLECTS THAT HABITAT]
Dominant silhouette feature: [THE ONE FEATURE THAT IDENTIFIES IT AT A DISTANCE]
Secondary feature: [ONE SUPPORTING ECOLOGICAL OR MATERIAL IDEA]
Accent motif: [ONE SMALL DETAIL OR COLOR ACCENT]
Materials and palette: [MAIN MATERIALS, COLORS, ACCENTS, AND ANY LOCALIZED GLOW OR TRANSPARENCY]
Scale: [SIZE RELATIVE TO A PERSON OR FAMILIAR OBJECT]
Pose: [OPTIONAL; OTHERWISE USE A NEUTRAL LOCOMOTION-READY POSE]

BLOCKWILD STYLE
Use handcrafted voxel naturalism and medium-detail cubic storybook anatomy. Design a practical game creature that could be rebuilt as a hierarchy of clean Three.js BoxGeometry pieces. Construct it from connected rectangular prisms, cuboids, shallow box plates, layered slabs, squared membranes or fins, and selectively rotated block-like pieces. Use broad readable planes, sharp edges, and almost no beveling.

Grid-native does not mean crude. Create character through proportion, posture, overlap, controlled rotation, material contrast, and silhouette rather than surface clutter.

Use the creature tier to control visual complexity:
- Tiny ambient: approximately 14-30 purposeful visible parts.
- Ordinary fauna: approximately 28-60 purposeful visible parts. Use this by default.
- Signature or rare: approximately 50-90 parts, spent on secondary anatomy and one richer ecological feature.
- Legendary or summon: approximately 75-140 parts, reserved for encounter-defining structures and staged effects.

Treat these as visual density targets rather than a need to count every part exactly. Keep major anatomical masses large, clean, and readable. Add small boxes only where they clarify the face, joints, feet, extremities, material transitions, or named signature features. Preserve broad uninterrupted surfaces.

Do not create a smooth organic sculpt, but also do not approximate the entire skin with hundreds of tiny cubes. Do not tile, emboss, or texture broad surfaces into grids of little bricks. A visible division should represent a real joint, anatomical segment, overlapping layer, material boundary, or requested feature.

ANATOMY AND CONSTRUCTION
Faithfully preserve the specified body plan, limb count, locomotion, scale, and nature. Do not add unrequested limbs, wings, horns, armor, machinery, vegetation, or magical effects.

Establish the primary masses first: head, torso or central body, shoulder and hip structures where relevant, and the correct abdomen, rear body, or tail. Attach every limb, wing, fin, tentacle, neck, jaw, antenna, ear, horn, whisker, tail segment, plant growth, and ornament through a visible root, socket, or overlap. Nothing may float, barely touch, or intersect accidentally.

Build movable appendages from only enough connected segments to explain their motion. Load-bearing limbs need substantial roots, readable joints, and complete feet. Long flexible anatomy should use a limited tapering sequence of overlapping cuboids whose rotations create a controlled curve. Wings should visibly connect to the shoulder or thorax and use a few broad feather or membrane groups rather than dozens of individual pieces. Fins must root into the body. Multi-legged creatures must show the correct number of legs in organized attached pairs. Grounded feet must share one ground plane.

Give the face deliberate species-appropriate planes: crown or brow, small readable eyes, muzzle, snout, beak, mouthparts, or attached jaw as relevant. Communicate personality through posture and proportion rather than a huge head or mascot-like eyes. Apply only the anatomy rules relevant to this creature; never force it into a mammalian body plan.

DESIGN PRIORITY
Spend detail in this order:
1. Unmistakable silhouette and correct body plan.
2. Connected anatomy, locomotion structures, and grounding or balance.
3. Readable face.
4. Dominant signature feature.
5. One secondary ecological or material feature.
6. One restrained accent motif.

Remove any part that does not support those goals. Decoration must remain subordinate to anatomy. Habitat influence should appear as a believable adaptation, symbiosis, wear pattern, or material choice - not scenery glued onto the creature.

Use simple material regions and controlled value separation to clarify overlapping parts. Prefer flat color, subtle wear, and selective edge highlights over noisy texture. Localize glow or transparency to the explicitly named structure, keep it restrained, and support it with visible opaque anatomy. The creature must remain readable at normal gameplay scale and in a small bestiary portrait.

The result should resemble a thoughtfully handmade cubic storybook maquette translated into a production-ready Blockwild model: distinctive, physically coherent, tasteful, unmistakably block-built, and practical to animate. It must not look like a smooth AI sculpt, a toy mascot, an overbuilt micro-voxel statue, or a minimally detailed Minecraft-style mob.

PRESENTATION
Show one creature only, with the full silhouette and every extremity visible, in a front three-quarter production portrait chosen to explain its construction. Use a neutral, characteristic, locomotion-ready pose rather than an action scene.

For terrestrial creatures, show exact ground contact and a soft contact shadow. For swimming or permanently flying creatures, suspend the body naturally in its locomotion pose and use only a faint studio shadow as a depth cue; do not make it stand on an imaginary floor. For amphibious or temporarily flying creatures, choose the pose that best explains the anatomy in the brief.

Use a slightly elevated creature-eye-level camera, a dark desaturated blue-green or forest-green seamless studio background, a soft warm key light from the upper left, a faint cool rim light, and mild ambient occlusion only at real joins. Produce a crisp, polished real-time game render in landscape 4:3. No environment, scenery, water volume, particles, text, labels, UI, frame, border, or watermark.

AVOID
Smooth spheres, capsules, cylinders, oval limbs, continuous organic sculpting, realistic fur, feathers, or skin simulation, one-cube bodies, high-poly detail, micro-voxel shells, brick-grid texture, embossed square noise, excessive seams, rounded toy-plastic surfaces, chibi proportions, oversized eyes, thin unsupported joints, floating parts, detached decorations, accidental intersections, incorrect limb counts, arbitrary spikes, unrequested machinery, excessive bloom, uncontrolled neon color, photorealism, cropped extremities, and multiple creatures.
```

## Reference Lock

Append this when supplying an approved Blockwild model or concept image:

```text
REFERENCE LOCK
Use the supplied image as the authority for Blockwild's geometric density, edge treatment, material restraint, lighting, presentation, and the established creature identity. Preserve its species-specific anatomy, silhouette, body plan, and signature structures unless the creature brief explicitly requests a redesign. Match the reference's cubic construction and gameplay-scale readability. Do not let the generated image silently add, remove, or relocate anatomy.
```

## Review gate

Before approving generated art for Tripo, TCG, or runtime modeling:

- confirm the silhouette and body plan against the creature brief;
- count limbs, wings, fins, and other required appendages;
- reject floating or weakly attached anatomy;
- reject micro-voxel skin, fake brick grids, and unnecessary surface seams;
- inspect the face, joints, feet, wing or fin roots, and signature feature;
- confirm glow and transparency remain localized;
- check readability at a small card or Bestiary scale; and
- preserve the approved image and creature-specific prompt beside other reference art.

The template was iterated across a grounded quadruped, elongated aquatic creature, six-legged arthropod, and feathered flier. Its final reduced-density form was validated on both ordinary and signature body plans.

Reviewed repository examples are preserved in [`docs/reference-art/creatures/imagegen`](../reference-art/creatures/imagegen/README.md).
