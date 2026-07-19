# Blockwild Creature Model Style

The adopted art-direction contract is [`BLOCKWILD_VISUAL_THEME_PROPOSAL.md`](BLOCKWILD_VISUAL_THEME_PROPOSAL.md), backed by executable registries and release audits. Start substantial work from the fillable [`Creature Visual Brief`](templates/CREATURE_VISUAL_BRIEF.md). This file remains the concise creature implementation checklist.

## High-detail cubic production roster

The Living Bestiary expansion uses the sharper **high-detail cubic storybook** treatment approved from its Field Guide portraits. Production meshes—not only exported portraits—resolve every visible authored primitive to a cuboid while retaining the complete connected rig, material, transparency, glow, and animation hierarchy.

Detail comes from layered rectangular masses rather than spheres or cylinders. Limbs still need upper and lower segments, joints, ankles, planted feet, and intentional overlap. Faces need brow, eye, cheek, muzzle or jaw planes. Magical anatomy may float only when a visible glow, tether, orbit, or narrative gap explains the separation.

Four deliberate exceptions preserve forms that cuboids would materially weaken: Thalassene's continuous living reef, Orichalc's oath-ring negative space, Vellum Warden's folded paper strata, and Choir-of-One's suspended sound-body. Exceptions require a written silhouette reason; they are not permission to fall back to generic rounded anatomy.

## Connected storybook anatomy

Blockwild creatures should read as detailed voxel sculptures built from purposeful, connected rectangular masses. The style is neither realistic taxidermy nor disconnected toy blocks: silhouettes are exaggerated for recognition, but visible anatomy explains how each creature stands, turns, bites, flies, or swims.

## Structural rules

1. Start with a readable silhouette at field-guide scale. Give the torso, shoulder/hip masses, neck, skull, muzzle, and tail distinct jobs before adding decoration.
2. Build every load-bearing terrestrial limb as an overlapping chain: body socket, shaped upper segment, joint, lower segment, ankle or hock, planted foot, then attached toes, hoof halves, webbing, or claws. No single stretched cuboid may stand in for an entire leg.
3. Overlap adjoining forms by roughly ten to twenty percent. A joint should hide the seam between segments, and the first third of a claw or toe should begin inside its paw.
4. Parent details to the anatomy they belong to. Eyes and jaws follow the head; claws follow the paw; banners follow their brace; water or magical tissue inside a limb follows that limb. World-space decorations are reserved for intentional orbiting, hovering, or environmental effects.
5. Give every face at least four readable planes: brow or forehead, eye line, muzzle/rostrum/beak, and jaw or mouth. Species identity should survive after horns, foliage, saddles, and effects are hidden.
6. Use deliberate exceptions. Spectral or floating anatomy still needs visible anchors, ligaments, orbit paths, or repeated alignment that explains the separation. “Magical” is not a reason for accidental gaps.

## Shape and material language

- Broad cuboids carry torso, skull, shell, mantle, and major muscle masses.
- Offset overlapping cuboids carry shoulders, haunches, cheeks, belly planes, feather groups, fur layers, and armor.
- Narrow rectangular prisms carry bones, legs, necks, tendons, antennae, ribs, branches, and braces.
- Rotated thin boxes carry horns, claws, beaks, teeth, fins, ears, feathers, antlers, and directional magical marks.
- Small cuboids carry eyes, nostrils, toes, rivets, scales, scars, straps, berries, and other authored focus details.
- Exceptional curved rings and transparent membranes are used only when supernatural negative space, living reef growth, folded strata, glass, water, wings, or magical boundaries would lose their concept when cubified.
- Emission identifies an active source—a heart, star, spark, shoreline, or living current—not every surface on a magical creature.

## Animation rules

- Animate the root of an articulated chain and add smaller counter-motion at knees, hocks, ankles, and feet. Child transforms keep the chain connected automatically.
- Ground feet should spend more of a gait near the contact plane than in the swing arc. Heavy creatures use slower cadence and smaller distal motion; birds and arthropods can articulate more quickly.
- Secondary motion must start from stored rest transforms. Preview scrubbing, multiplayer correction, and repeated updates must never accumulate drift.
- Floating, spinning, shimmer, and transparency are concept-driven tags, not a roster-wide effect layer.

## Production checks

- Inspect front three-quarter, side, and animated poses at the same scale used by the Bestiary.
- Verify every visible ground limb has a connected joint chain and every distal feature has a non-world-space parent.
- Verify the face remains readable against the body color and from the gameplay camera.
- Verify the lowest visible geometry agrees with the creature's authored foot offset.
- Keep shared primitive detail modest enough for herds. Spend additional geometry on silhouette-changing anatomy, faces, and rare encounter creatures rather than invisible subdivisions.
