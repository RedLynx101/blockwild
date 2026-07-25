export function tcgHash32(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  return hash >>> 0;
}

export function tcgUnit(seed: string) {
  return tcgHash32(seed) / 0x1_0000_0000;
}

export function tcgIndex(seed: string, length: number) {
  if (!Number.isFinite(length) || length <= 0) return 0;
  return Math.min(Math.floor(length) - 1, Math.floor(tcgUnit(seed) * Math.floor(length)));
}

export function tcgPick<T>(values: readonly T[], seed: string): T | undefined {
  return values[tcgIndex(seed, values.length)];
}

export function tcgShuffle<T>(values: readonly T[], seed: string) {
  const next = [...values];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = tcgIndex(`${seed}|${index}`, index + 1);
    [next[index], next[swap]] = [next[swap], next[index]];
  }
  return next;
}

export function tcgStableId(prefix: string, ...parts: readonly (string | number)[]) {
  const source = parts.join("|");
  return `${prefix}_${tcgHash32(source).toString(36)}_${tcgHash32(`${source}|cardforge`).toString(36)}`;
}
