export type WatermarkPositionPreset =
  | "TL"
  | "TC"
  | "TR"
  | "BL"
  | "BC"
  | "BR"
  | "C"
  | "LC"
  | "RC";

export type WatermarkLayout = {
  wmScale: number;
  wmPos: { x: number; y: number };
};

const DEFAULT_LANDSCAPE_WATERMARK_WIDTH_RATIO = 0.2;
const DEFAULT_PORTRAIT_WATERMARK_WIDTH_RATIO = 0.16;
const DEFAULT_LANDSCAPE_WATERMARK_HEIGHT_RATIO = 0.12;
const DEFAULT_PORTRAIT_WATERMARK_HEIGHT_RATIO = 0.08;
const MIN_WATERMARK_WIDTH_RATIO = 0.05;

function clampNormalized(value: number) {
  return Math.max(0, Math.min(1, value));
}

function resolveSafeOutputSize(input: {
  outputWidth: number;
  outputHeight: number;
}) {
  return {
    width: Math.max(0, Math.round(input.outputWidth)),
    height: Math.max(0, Math.round(input.outputHeight)),
  };
}

function resolveSafeWatermarkSize(input: {
  watermarkWidth: number;
  watermarkHeight: number;
}) {
  return {
    width: Math.max(0, Math.round(input.watermarkWidth)),
    height: Math.max(0, Math.round(input.watermarkHeight)),
  };
}

function isPortrait(outputWidth: number, outputHeight: number) {
  return outputHeight > outputWidth;
}

function resolveWatermarkMargins(outputWidth: number, outputHeight: number) {
  return isPortrait(outputWidth, outputHeight)
    ? { x: 0.045, y: 0.035 }
    : { x: 0.03, y: 0.05 };
}

export function resolveDefaultWatermarkScale(input: {
  outputWidth: number;
  outputHeight: number;
  watermarkWidth: number;
  watermarkHeight: number;
}): number {
  const output = resolveSafeOutputSize(input);
  const watermark = resolveSafeWatermarkSize(input);

  if (output.width <= 0 || output.height <= 0) {
    return DEFAULT_PORTRAIT_WATERMARK_WIDTH_RATIO;
  }

  const targetWidthRatio = isPortrait(output.width, output.height)
    ? DEFAULT_PORTRAIT_WATERMARK_WIDTH_RATIO
    : DEFAULT_LANDSCAPE_WATERMARK_WIDTH_RATIO;

  if (watermark.width <= 0 || watermark.height <= 0) {
    return targetWidthRatio;
  }

  const maxHeightRatio = isPortrait(output.width, output.height)
    ? DEFAULT_PORTRAIT_WATERMARK_HEIGHT_RATIO
    : DEFAULT_LANDSCAPE_WATERMARK_HEIGHT_RATIO;
  const heightBoundWidthRatio =
    (maxHeightRatio * output.height * watermark.width) /
    (output.width * watermark.height);

  return Math.max(
    MIN_WATERMARK_WIDTH_RATIO,
    Math.min(targetWidthRatio, heightBoundWidthRatio),
  );
}

export function resolveWatermarkPosition(input: {
  preset: WatermarkPositionPreset;
  outputWidth: number;
  outputHeight: number;
  watermarkWidth: number;
  watermarkHeight: number;
  wmScale: number;
}): { x: number; y: number } {
  const output = resolveSafeOutputSize(input);
  const watermark = resolveSafeWatermarkSize(input);
  const scale =
    Number.isFinite(input.wmScale) && input.wmScale > 0
      ? input.wmScale
      : resolveDefaultWatermarkScale(input);
  const margins = resolveWatermarkMargins(output.width, output.height);
  const normW = clampNormalized(scale);
  const normH =
    output.width > 0 &&
    output.height > 0 &&
    watermark.width > 0 &&
    watermark.height > 0
      ? clampNormalized(
          (output.width * scale * watermark.height) /
            (watermark.width * output.height),
        )
      : normW;

  let x = 0.5;
  let y = 0.5;

  if (input.preset.includes("L")) {
    x = margins.x + normW / 2;
  } else if (input.preset.includes("R")) {
    x = 1 - margins.x - normW / 2;
  }

  if (input.preset.includes("T")) {
    y = margins.y + normH / 2;
  } else if (input.preset.includes("B")) {
    y = 1 - margins.y - normH / 2;
  }

  return {
    x: clampNormalized(x),
    y: clampNormalized(y),
  };
}

export function resolveDefaultWatermarkLayout(input: {
  outputWidth: number;
  outputHeight: number;
  watermarkWidth: number;
  watermarkHeight: number;
}): WatermarkLayout {
  const wmScale = resolveDefaultWatermarkScale(input);
  return {
    wmScale,
    wmPos: resolveWatermarkPosition({
      ...input,
      wmScale,
      preset: "TR",
    }),
  };
}
