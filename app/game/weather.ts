/** Deterministic biome-aware weather and bounded procedural cloud layouts. */

export type WeatherKind =
  | "clear"
  | "overcast"
  | "drizzle"
  | "rain"
  | "thunder"
  | "snow"
  | "sandstorm"
  | "mist"
  | "ashfall";

export type WeatherBiome =
  | "ocean"
  | "coast"
  | "meadow"
  | "forest"
  | "cold-forest"
  | "desert"
  | "savanna"
  | "swamp"
  | "snowfield"
  | "highlands"
  | "volcanic"
  | "river"
  | "cloudreed"
  | "sugarplum"
  | "glimmerwood"
  | "snowcap";

export type WeightedWeather = Readonly<{ kind: WeatherKind; weight: number }>;

export type WeatherState = Readonly<{
  kind: WeatherKind;
  cycle: number;
  elapsedSeconds: number;
  durationSeconds: number;
  intensity: number;
  windAngle: number;
  windSpeed: number;
}>;

export type WeatherContext = Readonly<{
  seed: string | number;
  biome: WeatherBiome;
}>;

const WEATHER_PROFILES: Readonly<Record<WeatherBiome, readonly WeightedWeather[]>> = Object.freeze({
  ocean: [
    { kind: "clear", weight: 0.28 }, { kind: "overcast", weight: 0.23 }, { kind: "drizzle", weight: 0.16 },
    { kind: "rain", weight: 0.23 }, { kind: "thunder", weight: 0.1 },
  ],
  coast: [
    { kind: "clear", weight: 0.4 }, { kind: "overcast", weight: 0.2 }, { kind: "drizzle", weight: 0.18 },
    { kind: "rain", weight: 0.16 }, { kind: "thunder", weight: 0.06 },
  ],
  meadow: [
    { kind: "clear", weight: 0.46 }, { kind: "overcast", weight: 0.13 }, { kind: "drizzle", weight: 0.14 },
    { kind: "rain", weight: 0.14 }, { kind: "thunder", weight: 0.05 }, { kind: "mist", weight: 0.08 },
  ],
  forest: [
    { kind: "clear", weight: 0.32 }, { kind: "overcast", weight: 0.17 }, { kind: "drizzle", weight: 0.18 },
    { kind: "rain", weight: 0.17 }, { kind: "thunder", weight: 0.05 }, { kind: "mist", weight: 0.11 },
  ],
  "cold-forest": [
    { kind: "clear", weight: 0.32 }, { kind: "overcast", weight: 0.23 }, { kind: "snow", weight: 0.26 },
    { kind: "mist", weight: 0.12 }, { kind: "rain", weight: 0.07 },
  ],
  desert: [
    { kind: "clear", weight: 0.7 }, { kind: "overcast", weight: 0.08 }, { kind: "rain", weight: 0.04 },
    { kind: "thunder", weight: 0.02 }, { kind: "sandstorm", weight: 0.16 },
  ],
  savanna: [
    { kind: "clear", weight: 0.57 }, { kind: "overcast", weight: 0.11 }, { kind: "rain", weight: 0.13 },
    { kind: "thunder", weight: 0.06 }, { kind: "sandstorm", weight: 0.08 }, { kind: "drizzle", weight: 0.05 },
  ],
  swamp: [
    { kind: "clear", weight: 0.2 }, { kind: "overcast", weight: 0.18 }, { kind: "drizzle", weight: 0.17 },
    { kind: "rain", weight: 0.18 }, { kind: "thunder", weight: 0.07 }, { kind: "mist", weight: 0.2 },
  ],
  snowfield: [
    { kind: "clear", weight: 0.29 }, { kind: "overcast", weight: 0.27 }, { kind: "snow", weight: 0.37 },
    { kind: "mist", weight: 0.07 },
  ],
  highlands: [
    { kind: "clear", weight: 0.29 }, { kind: "overcast", weight: 0.22 }, { kind: "rain", weight: 0.18 },
    { kind: "thunder", weight: 0.13 }, { kind: "snow", weight: 0.12 }, { kind: "mist", weight: 0.06 },
  ],
  volcanic: [
    { kind: "clear", weight: 0.43 }, { kind: "overcast", weight: 0.14 }, { kind: "ashfall", weight: 0.34 },
    { kind: "thunder", weight: 0.09 },
  ],
  river: [
    { kind: "clear", weight: 0.38 }, { kind: "overcast", weight: 0.16 }, { kind: "drizzle", weight: 0.17 },
    { kind: "rain", weight: 0.16 }, { kind: "thunder", weight: 0.05 }, { kind: "mist", weight: 0.08 },
  ],
  cloudreed: [
    { kind: "clear", weight: 0.24 }, { kind: "overcast", weight: 0.22 }, { kind: "drizzle", weight: 0.18 },
    { kind: "rain", weight: 0.12 }, { kind: "thunder", weight: 0.04 }, { kind: "mist", weight: 0.2 },
  ],
  sugarplum: [
    { kind: "clear", weight: 0.5 }, { kind: "overcast", weight: 0.14 }, { kind: "drizzle", weight: 0.14 },
    { kind: "rain", weight: 0.12 }, { kind: "thunder", weight: 0.03 }, { kind: "mist", weight: 0.07 },
  ],
  glimmerwood: [
    { kind: "clear", weight: 0.29 }, { kind: "overcast", weight: 0.18 }, { kind: "drizzle", weight: 0.18 },
    { kind: "rain", weight: 0.14 }, { kind: "thunder", weight: 0.04 }, { kind: "mist", weight: 0.17 },
  ],
  snowcap: [
    { kind: "clear", weight: 0.24 }, { kind: "overcast", weight: 0.27 }, { kind: "snow", weight: 0.31 },
    { kind: "rain", weight: 0.04 }, { kind: "thunder", weight: 0.07 }, { kind: "mist", weight: 0.07 },
  ],
});

const DURATION_RANGES: Readonly<Record<WeatherKind, readonly [number, number]>> = Object.freeze({
  clear: [300, 780],
  overcast: [210, 520],
  drizzle: [150, 390],
  rain: [150, 420],
  thunder: [105, 300],
  snow: [180, 480],
  sandstorm: [105, 270],
  mist: [120, 330],
  ashfall: [150, 390],
});

const stringSeed = (seed: string | number) => String(seed);

function hashUnit(seed: string | number, salt: string | number) {
  const text = `${stringSeed(seed)}:${salt}`;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
}

export function weatherBiomeFromId(biomeId: number): WeatherBiome {
  if (biomeId === 0 || biomeId === 1) return "ocean";
  if (biomeId === 2) return "coast";
  if (biomeId === 3) return "meadow";
  if (biomeId === 4 || biomeId === 11 || biomeId === 12) return "forest";
  if (biomeId === 5) return "cold-forest";
  if (biomeId === 6 || biomeId === 10) return "desert";
  if (biomeId === 7) return "savanna";
  if (biomeId === 8 || biomeId === 15) return "swamp";
  if (biomeId === 9) return "snowfield";
  if (biomeId === 13) return "highlands";
  if (biomeId === 14) return "volcanic";
  if (biomeId === 16) return "river";
  if (biomeId === 17) return "cloudreed";
  if (biomeId === 18 || biomeId === 19) return "forest";
  if (biomeId === 20) return "ocean";
  if (biomeId === 21) return "sugarplum";
  if (biomeId === 22) return "glimmerwood";
  if (biomeId === 23) return "snowcap";
  return "meadow";
}

export const weatherOptionsForBiome = (biome: WeatherBiome) => WEATHER_PROFILES[biome];

function stateForCycle(context: WeatherContext, cycle: number): WeatherState {
  const options = WEATHER_PROFILES[context.biome];
  const roll = hashUnit(context.seed, `${context.biome}:weather:${cycle}`);
  const totalWeight = options.reduce((total, option) => total + option.weight, 0);
  let cursor = roll * totalWeight;
  let kind = options[options.length - 1].kind;
  for (const option of options) {
    cursor -= option.weight;
    if (cursor <= 0) {
      kind = option.kind;
      break;
    }
  }

  const range = DURATION_RANGES[kind];
  const durationSeconds = range[0] + (range[1] - range[0]) * hashUnit(context.seed, `${context.biome}:duration:${cycle}`);
  const intensityFloor = kind === "clear" ? 0 : kind === "overcast" || kind === "mist" ? 0.25 : 0.48;
  const intensityCeiling = kind === "clear" ? 0.08 : kind === "drizzle" || kind === "snow" ? 0.72 : 1;
  return {
    kind,
    cycle,
    elapsedSeconds: 0,
    durationSeconds,
    intensity: intensityFloor + (intensityCeiling - intensityFloor) * hashUnit(context.seed, `${context.biome}:intensity:${cycle}`),
    windAngle: hashUnit(context.seed, `${context.biome}:wind-angle:${cycle}`) * Math.PI * 2,
    windSpeed: 0.35 + hashUnit(context.seed, `${context.biome}:wind-speed:${cycle}`) * (kind === "sandstorm" || kind === "thunder" ? 7.5 : 3.6),
  };
}

export function createWeatherState(context: WeatherContext, cycle = 0) {
  return stateForCycle(context, Math.max(0, Math.floor(cycle)));
}

/**
 * Advances weather without frame-rate dependence. Delta is capped to one hour
 * per call so a stale tab cannot spend an unbounded amount of time catching up.
 */
export function stepWeather(state: WeatherState, context: WeatherContext, deltaSeconds: number): WeatherState {
  let remainingDelta = Math.max(0, Math.min(3600, deltaSeconds));
  let next = state;
  while (remainingDelta > 0) {
    const untilTransition = Math.max(0, next.durationSeconds - next.elapsedSeconds);
    if (remainingDelta < untilTransition) {
      next = { ...next, elapsedSeconds: next.elapsedSeconds + remainingDelta };
      break;
    }
    remainingDelta -= untilTransition;
    next = stateForCycle(context, next.cycle + 1);
  }
  return next;
}

export function weatherTransitionBlend(state: WeatherState, fadeSeconds = 12) {
  const fade = Math.max(0.01, fadeSeconds);
  return Math.min(1, state.elapsedSeconds / fade, (state.durationSeconds - state.elapsedSeconds) / fade);
}

/**
 * Thunder is the game's explicit full-storm state.  Keeping this decision in
 * the pure weather module prevents the sky, clouds and celestial renderer from
 * disagreeing about whether a storm is actually overcast.
 */
export function isFullOvercastStorm(state: Pick<WeatherState, "kind">) {
  return state.kind === "thunder";
}

export function weatherVisuals(state: WeatherState) {
  const blend = weatherTransitionBlend(state);
  const effectiveIntensity = state.intensity * blend;
  const fullOvercast = isFullOvercastStorm(state);
  const precipitation = ["drizzle", "rain", "thunder", "snow", "sandstorm", "ashfall"].includes(state.kind)
    ? effectiveIntensity
    : 0;
  const darkness = state.kind === "thunder" ? 0.42 : state.kind === "rain" || state.kind === "sandstorm" ? 0.28
    : state.kind === "overcast" || state.kind === "ashfall" ? 0.2 : state.kind === "mist" ? 0.1 : 0;
  return {
    precipitation,
    skyDarkening: darkness * blend,
    fogDensity: (state.kind === "mist" ? 0.72 : state.kind === "sandstorm" ? 0.58 : state.kind === "ashfall" ? 0.34 : 0.08 * precipitation) * blend,
    lightningChancePerSecond: state.kind === "thunder" ? 0.018 * effectiveIntensity : 0,
    /** Storm cover is intentionally complete rather than a sparse cloud roll. */
    cloudCoverage: fullOvercast
      ? 1
      : Math.min(1, (state.kind === "clear" ? 0.22 : state.kind === "overcast" ? 0.74 : 0.58 + effectiveIntensity * 0.35) * blend + 0.08),
    fullOvercast,
    /** Celestial sprites and stars use this directly; a thunder sky hides them. */
    celestialVisibility: fullOvercast ? 0 : Math.max(0, 1 - darkness * blend * 1.65),
    sunVisibility: fullOvercast ? 0 : Math.max(0, 1 - darkness * blend * 1.4),
  };
}

export type CloudLobe = Readonly<{
  x: number;
  y: number;
  z: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  /** Near-white per-lobe variation keeps fair-weather layers soft, not gray. */
  brightness: number;
  /** A small integer layer lets renderers use stepped, blocky silhouettes. */
  layer: number;
  shape: "blocky-puff";
}>;

export type CloudClusterPlan = Readonly<{
  id: string;
  x: number;
  y: number;
  z: number;
  driftX: number;
  driftZ: number;
  lobes: readonly CloudLobe[];
}>;

export type CloudDayProfile = Readonly<{
  day: number;
  baseHeight: number;
  heightVariation: number;
  densityMultiplier: number;
  horizontalScale: number;
  layerCount: 2 | 3;
}>;

export type CloudFadeState = Readonly<{
  opacity: number;
  target: number;
}>;

export type Vector3Like = Readonly<{ x: number; y: number; z: number }>;

export type RainColumnProbe = Readonly<{
  x: number;
  z: number;
  spawnY: number;
  floorY: number;
  /** Highest solid surface below the emitter, if this column has a roof. */
  obstructionY?: number | null;
  viewerY?: number;
}>;

export type RainColumnSegment = Readonly<{
  x: number;
  z: number;
  topY: number;
  bottomY: number;
  obstructionY: number | null;
  openAboveViewer: boolean;
  visible: boolean;
}>;

const clamp01 = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const finiteNumber = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** Daily cloud character is stable for the seed but changes across days. */
export function cloudDayProfile(seed: string | number, day: number): CloudDayProfile {
  const normalizedDay = Math.max(0, Math.floor(finiteNumber(day)));
  const layerCount = hashUnit(seed, `cloud-day:${normalizedDay}:layers`) > 0.54 ? 3 : 2;
  return {
    day: normalizedDay,
    baseHeight: 82 + hashUnit(seed, `cloud-day:${normalizedDay}:height`) * 24,
    heightVariation: 5 + hashUnit(seed, `cloud-day:${normalizedDay}:height-variance`) * 10,
    densityMultiplier: 0.72 + hashUnit(seed, `cloud-day:${normalizedDay}:density`) * 0.58,
    horizontalScale: 0.9 + hashUnit(seed, `cloud-day:${normalizedDay}:scale`) * 0.38,
    layerCount,
  };
}

export function cloudOpacityTarget(weather: WeatherState) {
  const visuals = weatherVisuals(weather);
  if (visuals.fullOvercast) return 0;
  const base = weather.kind === "clear" ? 0.74
    : weather.kind === "overcast" || weather.kind === "rain" || weather.kind === "drizzle" ? 0.88
      : weather.kind === "sandstorm" || weather.kind === "ashfall" ? 0.78 : 0.82;
  return clamp01(base * weatherTransitionBlend(weather, 8));
}

/** Frame-rate-independent cloud fades prevent weather swaps from popping. */
export function stepCloudFade(currentOpacity: number, weather: WeatherState, deltaSeconds: number, fadeSeconds = 3.5): CloudFadeState {
  const opacity = clamp01(currentOpacity);
  const target = cloudOpacityTarget(weather);
  const blend = 1 - Math.exp(-Math.max(0, finiteNumber(deltaSeconds)) / Math.max(0.05, finiteNumber(fadeSeconds, 3.5)));
  const nextOpacity = Math.abs(target - opacity) < 0.001 ? target : opacity + (target - opacity) * blend;
  return { opacity: clamp01(nextOpacity), target };
}

/**
 * Estimates whether a cloud lobe lies on the viewer-to-celestial ray. This is
 * intentionally pure so sun/moon sprites and the cloud renderer can agree.
 */
export function cloudCelestialOcclusion(
  viewer: Vector3Like,
  celestialDirection: Vector3Like,
  plans: readonly CloudClusterPlan[],
  cloudOpacity = 1,
) {
  const dx = finiteNumber(celestialDirection.x);
  const dy = finiteNumber(celestialDirection.y);
  const dz = finiteNumber(celestialDirection.z);
  const directionLength = Math.hypot(dx, dy, dz);
  if (directionLength < 0.0001 || cloudOpacity <= 0) return 0;
  const nx = dx / directionLength;
  const ny = dy / directionLength;
  const nz = dz / directionLength;
  let occlusion = 0;
  for (const plan of plans) for (const lobe of plan.lobes) {
    const cx = plan.x + lobe.x - finiteNumber(viewer.x);
    const cy = plan.y + lobe.y - finiteNumber(viewer.y);
    const cz = plan.z + lobe.z - finiteNumber(viewer.z);
    const distanceAlongRay = cx * nx + cy * ny + cz * nz;
    if (distanceAlongRay <= 0) continue;
    const perpendicular = Math.sqrt(Math.max(0, cx * cx + cy * cy + cz * cz - distanceAlongRay * distanceAlongRay));
    const radius = Math.max(1, (lobe.scaleX + lobe.scaleY + lobe.scaleZ) / 3);
    if (perpendicular > radius) continue;
    const centerStrength = 1 - perpendicular / radius;
    occlusion = Math.max(occlusion, centerStrength * clamp01(cloudOpacity) * (0.72 + lobe.brightness * 0.28));
    if (occlusion >= 0.995) return 1;
  }
  return clamp01(occlusion);
}

export function celestialVisibilityThroughClouds(baseVisibility: number, cloudOcclusion: number) {
  return clamp01(baseVisibility) * (1 - clamp01(cloudOcclusion));
}

/**
 * A precipitation column always falls from the emitter until its first solid
 * surface. A roof stops only its own column; neighboring open columns remain.
 */
export function planRainColumn(probe: RainColumnProbe): RainColumnSegment {
  const topY = finiteNumber(probe.spawnY);
  const floorY = finiteNumber(probe.floorY);
  const obstruction = typeof probe.obstructionY === "number" && Number.isFinite(probe.obstructionY)
    ? probe.obstructionY
    : null;
  const collisionY = Math.max(floorY, obstruction ?? floorY);
  const bottomY = Math.min(topY, collisionY + 0.04);
  const viewerY = finiteNumber(probe.viewerY, floorY + 1.6);
  return {
    x: finiteNumber(probe.x),
    z: finiteNumber(probe.z),
    topY,
    bottomY,
    obstructionY: obstruction,
    openAboveViewer: obstruction === null || obstruction < viewerY,
    visible: topY - bottomY > 0.08,
  };
}

export function rainOpenColumnFraction(segments: readonly RainColumnSegment[]) {
  if (!segments.length) return 0;
  return segments.filter((segment) => segment.visible && segment.openAboveViewer).length / segments.length;
}

/** Audible weather remains global and muffles rather than vanishing indoors. */
export function rainAmbienceLevel(precipitation: number, openColumnFraction: number) {
  const intensity = clamp01(precipitation);
  return intensity * (0.18 + clamp01(openColumnFraction) * 0.82);
}

export function planCloudCluster(
  seed: string | number,
  cellX: number,
  cellZ: number,
  weather: WeatherState,
  day = weather.cycle,
): CloudClusterPlan {
  const id = `${Math.trunc(cellX)},${Math.trunc(cellZ)}`;
  const dayProfile = cloudDayProfile(seed, day);
  const weatherScale = (weather.kind === "clear" ? 0.98 : 1.14) * dayProfile.horizontalScale;
  const x = cellX * 54 + (hashUnit(seed, `cloud:${id}:x`) - 0.5) * 24;
  const z = cellZ * 54 + (hashUnit(seed, `cloud:${id}:z`) - 0.5) * 24;
  const y = dayProfile.baseHeight + (hashUnit(seed, `cloud:${id}:y`) - 0.5) * dayProfile.heightVariation;
  const lobeCount = 11 + Math.floor(hashUnit(seed, `cloud:${id}:count`) * 5);
  const lobes: CloudLobe[] = [];
  for (let index = 0; index < lobeCount; index += 1) {
    const angle = hashUnit(seed, `cloud:${id}:${index}:angle`) * Math.PI * 2;
    const radial = Math.sqrt(hashUnit(seed, `cloud:${id}:${index}:radius`)) * 12.5 * weatherScale;
    const central = index < 4 ? 0.42 : 1;
    const layer = index < 3 ? dayProfile.layerCount - 1 : Math.floor(hashUnit(seed, `cloud:${id}:${index}:layer`) * dayProfile.layerCount);
    const snap = (value: number) => Math.round(value / 1.5) * 1.5;
    lobes.push({
      x: snap(Math.cos(angle) * radial * central),
      y: snap((hashUnit(seed, `cloud:${id}:${index}:height`) - 0.55) * 2.4 + layer * 2.1),
      z: snap(Math.sin(angle) * radial * central * 0.74),
      scaleX: (5.2 + hashUnit(seed, `cloud:${id}:${index}:sx`) * 6.1) * weatherScale,
      scaleY: 2.2 + hashUnit(seed, `cloud:${id}:${index}:sy`) * 2.8,
      scaleZ: (4.4 + hashUnit(seed, `cloud:${id}:${index}:sz`) * 5.2) * weatherScale,
      brightness: 0.92 + hashUnit(seed, `cloud:${id}:${index}:white`) * 0.08,
      layer,
      shape: "blocky-puff",
    });
  }
  return {
    id,
    x,
    y,
    z,
    driftX: Math.cos(weather.windAngle) * weather.windSpeed,
    driftZ: Math.sin(weather.windAngle) * weather.windSpeed,
    lobes,
  };
}

/** At most (2r+1)^2 clusters; callers can instance all lobes in one draw. */
export function planCloudField(
  seed: string | number,
  centerCellX: number,
  centerCellZ: number,
  radius: number,
  weather: WeatherState,
  day = weather.cycle,
) {
  const plans: CloudClusterPlan[] = [];
  const boundedRadius = Math.max(0, Math.min(8, Math.floor(radius)));
  const visuals = weatherVisuals(weather);
  // Thunder uses the unified dark overcast sky dome. Discrete storm-cloud
  // meshes would band and overlap that dome, so none are planned.
  if (visuals.fullOvercast) return plans;
  const dayProfile = cloudDayProfile(seed, day);
  const coverage = Math.max(0, Math.min(1, visuals.cloudCoverage * dayProfile.densityMultiplier));
  for (let dz = -boundedRadius; dz <= boundedRadius; dz += 1) {
    for (let dx = -boundedRadius; dx <= boundedRadius; dx += 1) {
      const cellX = Math.floor(centerCellX) + dx;
      const cellZ = Math.floor(centerCellZ) + dz;
      if (hashUnit(seed, `cloud:${cellX},${cellZ}:visible`) > coverage) continue;
      plans.push(planCloudCluster(seed, cellX, cellZ, weather, day));
    }
  }
  return plans;
}
