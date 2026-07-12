import { BLOCKS, BlockId } from "./data";

export type SeatAnchor = Readonly<{
  x: number;
  y: number;
  z: number;
  /** Chairs have a visible back and therefore a canonical facing. */
  yaw?: number;
}>;

const SEAT_BLOCKS = new Set<BlockId>([
  BlockId.WildwoodStool,
  BlockId.DwarfStool,
  BlockId.HearthChair,
  BlockId.MoonboughChair,
]);

export function isSeatBlock(block: BlockId | undefined) {
  return block !== undefined && SEAT_BLOCKS.has(block);
}
/**
 * Player feet remain on the floor beneath the furniture while the crouched
 * rig's hips align with the authored seat board. This avoids turning chairs
 * into invisible moving platforms and keeps the pose stable in multiplayer.
 */
export function seatAnchorForBlock(block: BlockId, x: number, y: number, z: number): SeatAnchor | null {
  if (!isSeatBlock(block)) return null;
  const chair = BLOCKS[block]?.shape === "chair";
  return {
    x,
    y: y - 0.49,
    z: z + (chair ? -0.06 : 0),
    ...(chair ? { yaw: 0 } : {}),
  };
}
