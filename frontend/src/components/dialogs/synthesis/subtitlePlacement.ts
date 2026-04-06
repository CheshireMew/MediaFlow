export function clampNormalizedPosition(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

export function computeSubtitleMarginV(
  normalizedY: number,
  sourceHeight: number,
): number {
  const safeHeight = Math.max(0, Math.round(sourceHeight));
  if (safeHeight <= 0) {
    return 0;
  }

  return Math.max(
    0,
    Math.round((1 - clampNormalizedPosition(normalizedY)) * safeHeight),
  );
}

export type SubtitleCropRegion = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type SubtitlePlacementMetricsInput = {
  normalizedY: number;
  sourceVideoHeight: number;
  previewVideoHeight: number;
  crop?: SubtitleCropRegion | null;
};

export type SubtitlePlacementMetrics = {
  sourceHeight: number;
  previewHeight: number;
  previewBottomOffset: number;
  sourceMarginV: number;
  previewMarginV: number;
};

function resolveSubtitleRegionHeight(
  height: number,
  crop?: SubtitleCropRegion | null,
): number {
  const safeHeight = Math.max(0, Math.round(height));
  if (safeHeight <= 0) {
    return 0;
  }

  if (!crop) {
    return safeHeight;
  }

  return Math.max(0, Math.round(safeHeight * clampNormalizedPosition(crop.h)));
}

function resolvePreviewBottomOffset(
  previewHeight: number,
  crop?: SubtitleCropRegion | null,
): number {
  const safePreviewHeight = Math.max(0, Math.round(previewHeight));
  if (safePreviewHeight <= 0 || !crop) {
    return 0;
  }

  const cropBottom = clampNormalizedPosition(crop.y + crop.h);
  return Math.max(0, Math.round((1 - cropBottom) * safePreviewHeight));
}

export function resolveSubtitlePlacementMetrics(
  input: SubtitlePlacementMetricsInput,
): SubtitlePlacementMetrics {
  const { normalizedY, sourceVideoHeight, previewVideoHeight, crop } = input;
  const sourceHeight = resolveSubtitleRegionHeight(sourceVideoHeight, crop);
  const previewHeight = resolveSubtitleRegionHeight(previewVideoHeight, crop);
  const previewBottomOffset = resolvePreviewBottomOffset(previewVideoHeight, crop);
  const sourceMarginV = computeSubtitleMarginV(normalizedY, sourceHeight);
  const previewMarginV =
    previewHeight > 0
      ? computeSubtitleMarginV(normalizedY, previewHeight) + previewBottomOffset
      : sourceMarginV;

  return {
    sourceHeight,
    previewHeight,
    previewBottomOffset,
    sourceMarginV,
    previewMarginV,
  };
}
