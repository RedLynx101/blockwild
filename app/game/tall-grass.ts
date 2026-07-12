import { BlockId } from "./data";

export type TallGrassBlockLookup = (x: number, y: number, z: number) => BlockId | undefined;
export type TallGrassRemovalEdit = Readonly<{ x: number; y: number; z: number; type: BlockId }>;

export function isDoubleTallGrass(type: BlockId) {
  return type === BlockId.DoubleTallGrassLower || type === BlockId.DoubleTallGrassUpper;
}

/** Breaks a valid two-block grass plant atomically while tolerating damaged legacy halves. */
export function planDoubleTallGrassRemoval(
  type: BlockId,
  position: Readonly<{ x: number; y: number; z: number }>,
  getBlock: TallGrassBlockLookup,
): TallGrassRemovalEdit[] {
  if (!isDoubleTallGrass(type)) return [];
  const lowerY = type === BlockId.DoubleTallGrassUpper ? position.y - 1 : position.y;
  const upperY = lowerY + 1;
  const lowerMatches = getBlock(position.x, lowerY, position.z) === BlockId.DoubleTallGrassLower;
  const upperMatches = getBlock(position.x, upperY, position.z) === BlockId.DoubleTallGrassUpper;
  if (lowerMatches && upperMatches) return [
    { x: position.x, y: lowerY, z: position.z, type: BlockId.Air },
    { x: position.x, y: upperY, z: position.z, type: BlockId.Air },
  ];
  return [{ ...position, type: BlockId.Air }];
}
