import type { BlockDefinition } from "./data";

export type InteractionBounds = Readonly<{
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}>;

const PLANT_BOUNDS: Readonly<Partial<Record<NonNullable<BlockDefinition["shape"]>, readonly [number, number, number]>>> = Object.freeze({
  cross: [0.29, 0.47, 0.29],
  "tall-flower": [0.34, 0.5, 0.34],
  aquatic: [0.34, 0.5, 0.34],
  bush: [0.43, 0.44, 0.43],
  fruit: [0.24, 0.24, 0.24],
});

/**
 * Returns the narrow interaction silhouette used for foliage and produce.
 * Coordinates follow Blockwild's block-centred world convention: an integer
 * block at (x, y, z) occupies x/z +/- 0.5 and y +/- 0.5.
 */
export function plantInteractionBounds(
  definition: Pick<BlockDefinition, "shape"> | null | undefined,
  x: number,
  y: number,
  z: number,
): InteractionBounds | null {
  const half = definition?.shape ? PLANT_BOUNDS[definition.shape] : undefined;
  if (!half) return null;
  const [halfX, halfY, halfZ] = half;
  return Object.freeze({
    minX: x - halfX,
    minY: y - halfY,
    minZ: z - halfZ,
    maxX: x + halfX,
    maxY: y + halfY,
    maxZ: z + halfZ,
  });
}

export function rayDistanceToInteractionBounds(
  origin: Readonly<{ x: number; y: number; z: number }>,
  direction: Readonly<{ x: number; y: number; z: number }>,
  bounds: InteractionBounds,
  reach: number,
): number | null {
  let near = 0;
  let far = reach;
  for (const axis of ["x", "y", "z"] as const) {
    const component = direction[axis];
    const minimum = bounds[`min${axis.toUpperCase()}` as "minX" | "minY" | "minZ"];
    const maximum = bounds[`max${axis.toUpperCase()}` as "maxX" | "maxY" | "maxZ"];
    if (Math.abs(component) < 1e-8) {
      if (origin[axis] < minimum || origin[axis] > maximum) return null;
      continue;
    }
    let first = (minimum - origin[axis]) / component;
    let second = (maximum - origin[axis]) / component;
    if (first > second) [first, second] = [second, first];
    near = Math.max(near, first);
    far = Math.min(far, second);
    if (near > far) return null;
  }
  return near >= 0 && near <= reach ? near : null;
}
