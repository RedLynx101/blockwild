import { BlockId, Item, type ItemCode } from "./data";

export type DoorFamily = "wildwood" | "wrought-iron";
export type DoorState = Readonly<{
  family: DoorFamily;
  open: boolean;
  xAxis: boolean;
  upper: boolean;
  item: ItemCode;
}>;

const state = (family: DoorFamily, open: boolean, xAxis: boolean, upper: boolean, item: ItemCode): DoorState => ({ family, open, xAxis, upper, item });

export const DOOR_STATES = new Map<BlockId, DoorState>([
  [BlockId.DoorClosedLower, state("wildwood", false, false, false, Item.WildwoodDoor)],
  [BlockId.DoorClosedUpper, state("wildwood", false, false, true, Item.WildwoodDoor)],
  [BlockId.DoorOpenLower, state("wildwood", true, false, false, Item.WildwoodDoor)],
  [BlockId.DoorOpenUpper, state("wildwood", true, false, true, Item.WildwoodDoor)],
  [BlockId.DoorXClosedLower, state("wildwood", false, true, false, Item.WildwoodDoor)],
  [BlockId.DoorXClosedUpper, state("wildwood", false, true, true, Item.WildwoodDoor)],
  [BlockId.DoorXOpenLower, state("wildwood", true, true, false, Item.WildwoodDoor)],
  [BlockId.DoorXOpenUpper, state("wildwood", true, true, true, Item.WildwoodDoor)],
  [BlockId.WroughtIronDoorClosedLower, state("wrought-iron", false, false, false, Item.WroughtIronDoor)],
  [BlockId.WroughtIronDoorClosedUpper, state("wrought-iron", false, false, true, Item.WroughtIronDoor)],
  [BlockId.WroughtIronDoorOpenLower, state("wrought-iron", true, false, false, Item.WroughtIronDoor)],
  [BlockId.WroughtIronDoorOpenUpper, state("wrought-iron", true, false, true, Item.WroughtIronDoor)],
  [BlockId.WroughtIronDoorXClosedLower, state("wrought-iron", false, true, false, Item.WroughtIronDoor)],
  [BlockId.WroughtIronDoorXClosedUpper, state("wrought-iron", false, true, true, Item.WroughtIronDoor)],
  [BlockId.WroughtIronDoorXOpenLower, state("wrought-iron", true, true, false, Item.WroughtIronDoor)],
  [BlockId.WroughtIronDoorXOpenUpper, state("wrought-iron", true, true, true, Item.WroughtIronDoor)],
]);

export function doorState(type: BlockId | undefined) { return type === undefined ? undefined : DOOR_STATES.get(type); }
export function isDoorBlock(type: BlockId | undefined): type is BlockId { return doorState(type) !== undefined; }
export function doorItem(type: BlockId) { return doorState(type)?.item ?? Item.WildwoodDoor; }
export function doorIsOpen(type: BlockId) { return doorState(type)?.open ?? false; }
export function doorUsesXAxis(type: BlockId) { return doorState(type)?.xAxis ?? false; }
export function doorLowerY(type: BlockId, y: number) { return doorState(type)?.upper ? y - 1 : y; }

export function doorBlocks(family: DoorFamily, open: boolean, xAxis: boolean) {
  const matches = [...DOOR_STATES.entries()].filter(([, value]) => value.family === family && value.open === open && value.xAxis === xAxis);
  return {
    lower: matches.find(([, value]) => !value.upper)?.[0] ?? BlockId.DoorClosedLower,
    upper: matches.find(([, value]) => value.upper)?.[0] ?? BlockId.DoorClosedUpper,
  };
}

export function doorPairFor(type: BlockId, open = doorIsOpen(type)) {
  const current = doorState(type);
  return doorBlocks(current?.family ?? "wildwood", open, current?.xAxis ?? false);
}

export function doorPlacementForYaw(family: DoorFamily, yaw: number) {
  return doorBlocks(family, false, Math.abs(Math.sin(yaw)) > Math.abs(Math.cos(yaw)));
}
