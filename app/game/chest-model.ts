/**
 * One production geometry contract shared by chunk-authored closed chests and
 * the articulated runtime model. Values are relative to a chest block center.
 */
export const CHEST_VISUAL = Object.freeze({
  bodyBottom: -0.5,
  bodyTop: 0.13,
  bodyDepth: 0.88,
  lidBottom: 0.16,
  lidTop: 0.37,
  lidDepth: 0.92,
  latchWidth: 0.18,
  latchBottom: 0.03,
  latchTop: 0.24,
  latchDepth: 0.065,
  latchCenterZ: -0.4575,
} as const);

export function chestLatchCenters(large: boolean) {
  return large ? [-0.5, 0.5] as const : [0] as const;
}
