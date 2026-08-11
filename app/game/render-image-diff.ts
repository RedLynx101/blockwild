export type RenderImageDiffThresholds = Readonly<{
  maximumChannelDelta: number;
  maximumMeanChannelDelta: number;
  maximumChangedPixelRatio: number;
}>;

export type RenderImageDiffResult = Readonly<{
  width: number;
  height: number;
  comparedPixels: number;
  ignoredPixels: number;
  changedPixels: number;
  changedPixelRatio: number;
  meanChannelDelta: number;
  maximumChannelDelta: number;
  passed: boolean;
  diffRgba: Uint8Array;
}>;

export const STRICT_RENDER_IMAGE_THRESHOLDS: RenderImageDiffThresholds = {
  maximumChannelDelta: 2,
  maximumMeanChannelDelta: .15,
  maximumChangedPixelRatio: .0025,
};

function validByteBuffer(value: Uint8Array, expected: number, label: string) {
  if (value.byteLength !== expected) throw new RangeError(`${label} must contain exactly ${expected} RGBA bytes`);
}

function validateThreshold(value: number, minimum: number, maximum: number, label: string) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be in ${minimum}..${maximum}`);
  }
}

/**
 * Compares deterministic RGBA readbacks. A zero mask byte ignores a pixel;
 * any non-zero byte includes it. The emitted diff keeps matching pixels dim
 * and marks mismatches in red without altering either source buffer.
 */
export function compareRenderRgba(
  actual: Uint8Array,
  expected: Uint8Array,
  width: number,
  height: number,
  thresholds: RenderImageDiffThresholds = STRICT_RENDER_IMAGE_THRESHOLDS,
  mask?: Uint8Array,
): RenderImageDiffResult {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new RangeError("render image dimensions must be positive integers");
  }
  const pixelCount = width * height;
  const byteCount = pixelCount * 4;
  validByteBuffer(actual, byteCount, "actual");
  validByteBuffer(expected, byteCount, "expected");
  if (mask && mask.byteLength !== pixelCount) throw new RangeError(`mask must contain exactly ${pixelCount} bytes`);
  validateThreshold(thresholds.maximumChannelDelta, 0, 255, "maximumChannelDelta");
  validateThreshold(thresholds.maximumMeanChannelDelta, 0, 255, "maximumMeanChannelDelta");
  validateThreshold(thresholds.maximumChangedPixelRatio, 0, 1, "maximumChangedPixelRatio");

  const diff = new Uint8Array(byteCount);
  let comparedPixels = 0;
  let ignoredPixels = 0;
  let changedPixels = 0;
  let channelDeltaTotal = 0;
  let maximumChannelDelta = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const offset = pixel * 4;
    if (mask?.[pixel] === 0) {
      ignoredPixels += 1;
      diff[offset] = expected[offset] ?? 0;
      diff[offset + 1] = expected[offset + 1] ?? 0;
      diff[offset + 2] = expected[offset + 2] ?? 0;
      diff[offset + 3] = 48;
      continue;
    }
    comparedPixels += 1;
    let pixelMaximum = 0;
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs((actual[offset + channel] ?? 0) - (expected[offset + channel] ?? 0));
      channelDeltaTotal += delta;
      pixelMaximum = Math.max(pixelMaximum, delta);
      maximumChannelDelta = Math.max(maximumChannelDelta, delta);
    }
    if (pixelMaximum > thresholds.maximumChannelDelta) {
      changedPixels += 1;
      diff[offset] = 255;
      diff[offset + 1] = Math.max(0, 96 - pixelMaximum);
      diff[offset + 2] = Math.max(0, 96 - pixelMaximum);
      diff[offset + 3] = 255;
    } else {
      const luminance = Math.round(
        ((expected[offset] ?? 0) * .2126 + (expected[offset + 1] ?? 0) * .7152 + (expected[offset + 2] ?? 0) * .0722) * .35,
      );
      diff[offset] = luminance;
      diff[offset + 1] = luminance;
      diff[offset + 2] = luminance;
      diff[offset + 3] = 255;
    }
  }
  const changedPixelRatio = comparedPixels === 0 ? 0 : changedPixels / comparedPixels;
  const meanChannelDelta = comparedPixels === 0 ? 0 : channelDeltaTotal / (comparedPixels * 4);
  return {
    width,
    height,
    comparedPixels,
    ignoredPixels,
    changedPixels,
    changedPixelRatio,
    meanChannelDelta,
    maximumChannelDelta,
    passed: maximumChannelDelta <= thresholds.maximumChannelDelta
      && meanChannelDelta <= thresholds.maximumMeanChannelDelta
      && changedPixelRatio <= thresholds.maximumChangedPixelRatio,
    diffRgba: diff,
  };
}
