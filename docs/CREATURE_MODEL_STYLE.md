# Blockwild Creature Model Style

## Faceted storybook anatomy

Blockwild creatures should read as hand-carved storybook animals built from a small number of softly faceted masses. The style is neither realistic taxidermy nor disconnected toy blocks: silhouettes are exaggerated for recognition, but visible anatomy explains how each creature stands, turns, bites, flies, or swims.

## Structural rules

1. Start with a readable silhouette at field-guide scale. Give the torso, shoulder/hip masses, neck, skull, muzzle, and tail distinct jobs before adding decoration.
2. Build every load-bearing terrestrial limb as an overlapping chain: body socket, tapered upper segment, joint, tapered lower segment, ankle or hock, planted foot, then attached toes, hoof halves, webbing, or claws. No single stretched sphere may stand in for an entire leg.
3. Overlap adjoining forms by roughly ten to twenty percent. A joint should hide the seam between segments, and the first third of a claw or toe should begin inside its paw.
4. Parent details to the anatomy they belong to. Eyes and jaws follow the head; claws follow the paw; banners follow their brace; water or magical tissue inside a limb follows that limb. World-space decorations are reserved for intentional orbiting, hovering, or environmental effects.
5. Give every face at least four readable planes: brow or forehead, eye line, muzzle/rostrum/beak, and jaw or mouth. Species identity should survive after horns, foliage, saddles, and effects are hidden.
6. Use deliberate exceptions. Spectral or floating anatomy still needs visible anchors, ligaments, orbit paths, or repeated alignment that explains the separation. “Magical” is not a reason for accidental gaps.

## Shape and material language

- Rounded, low-poly ellipsoids carry flesh, feathers, pads, and soft foliage.
- Eight-sided tapered segments carry bones, legs, necks, and structural tendons.
- Compact faceted spheres cover joints and make bending readable.
- Boxes carry crafted objects, armor, wafers, paper, harnesses, and other intentionally manufactured planes.
- Cones carry horns, claws, beaks, teeth, thorns, and directional accents.
- Rings and transparent membranes are used sparingly for supernatural negative space, glass, water, wings, and magical boundaries.
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

