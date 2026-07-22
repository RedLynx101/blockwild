export type CameraEnvironmentState = Readonly<{
  propagatedSkyLight: number;
  directSkyExposure: number;
  enclosure: number;
  depthBelowSurface: number;
  caveBackdropBlend: number;
  sunVisibility: number;
  moonVisibility: number;
}>;

export type CameraEnvironmentInput = Readonly<{
  propagatedSkyLight: number;
  directSkyExposure: number;
  depthBelowSurface: number;
  sunUnobstructed: boolean;
  moonUnobstructed: boolean;
}>;

const clamp01 = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const amount = clamp01((value - edge0) / Math.max(0.0001, edge1 - edge0));
  return amount * amount * (3 - 2 * amount);
};

export const OPEN_CAMERA_ENVIRONMENT: CameraEnvironmentState = Object.freeze({
  propagatedSkyLight: 1,
  directSkyExposure: 1,
  enclosure: 0,
  depthBelowSurface: 0,
  caveBackdropBlend: 0,
  sunVisibility: 1,
  moonVisibility: 1,
});

/**
 * Lighting and presentation deliberately diverge here: propagated skylight is
 * retained verbatim, while depth plus direct exposure control only the camera
 * backdrop and celestial presentation.
 */
export function cameraEnvironmentTarget(input: CameraEnvironmentInput): CameraEnvironmentState {
  const propagatedSkyLight = clamp01(input.propagatedSkyLight);
  const directSkyExposure = clamp01(input.directSkyExposure);
  const depthBelowSurface = Math.max(0, Number.isFinite(input.depthBelowSurface) ? input.depthBelowSurface : 0);
  const depthWeight = smoothstep(1.5, 9, depthBelowSurface);
  const enclosure = clamp01((1 - directSkyExposure) * (0.28 + depthWeight * 0.72));
  const indirectOcclusion = 1 - smoothstep(0.08, 0.66, propagatedSkyLight);
  const caveBackdropBlend = clamp01(enclosure * depthWeight + indirectOcclusion * (0.08 + depthWeight * 0.18));
  const celestialExposure = smoothstep(0.04, 0.32, directSkyExposure) * (1 - caveBackdropBlend);
  return Object.freeze({
    propagatedSkyLight,
    directSkyExposure,
    enclosure,
    depthBelowSurface,
    caveBackdropBlend,
    sunVisibility: input.sunUnobstructed ? celestialExposure : 0,
    moonVisibility: input.moonUnobstructed ? celestialExposure : 0,
  });
}

export function stepCameraEnvironment(
  current: CameraEnvironmentState,
  target: CameraEnvironmentState,
  dt: number,
): CameraEnvironmentState {
  const amount = 1 - Math.exp(-Math.max(0, Math.min(0.25, dt)) * 4.2);
  const lerp = (from: number, to: number) => from + (to - from) * amount;
  return Object.freeze({
    propagatedSkyLight: lerp(current.propagatedSkyLight, target.propagatedSkyLight),
    directSkyExposure: lerp(current.directSkyExposure, target.directSkyExposure),
    enclosure: lerp(current.enclosure, target.enclosure),
    depthBelowSurface: lerp(current.depthBelowSurface, target.depthBelowSurface),
    caveBackdropBlend: lerp(current.caveBackdropBlend, target.caveBackdropBlend),
    sunVisibility: lerp(current.sunVisibility, target.sunVisibility),
    moonVisibility: lerp(current.moonVisibility, target.moonVisibility),
  });
}
