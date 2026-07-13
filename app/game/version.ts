/** Human-facing release identity. Save-schema and generator versions are separate. */
export const GAME_VERSION = "1.5.0" as const;
export const GAME_VERSION_LABEL = `v${GAME_VERSION}` as const;
export const GAME_RELEASE_NAME = "The World Below" as const;
export const LEGACY_GAME_VERSION = "0.1.0" as const;

export function normalizeGameVersion(value: unknown, fallback: string = LEGACY_GAME_VERSION): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(trimmed) ? trimmed : fallback;
}
