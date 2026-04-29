import { clampNormalizedPosition, type SubtitleCropRegion } from "./subtitlePlacement";

export type PreviewViewportMetrics = {
  cropRegion: SubtitleCropRegion;
  outputSourceWidth: number;
  outputSourceHeight: number;
  aspectRatio: number;
  contentWidthPercent: number;
  contentHeightPercent: number;
  contentOffsetXPercent: number;
  contentOffsetYPercent: number;
};

function normalizeCropRegion(
  crop?: SubtitleCropRegion | null,
): SubtitleCropRegion {
  if (!crop) {
    return { x: 0, y: 0, w: 1, h: 1 };
  }

  const x = clampNormalizedPosition(crop.x);
  const y = clampNormalizedPosition(crop.y);
  const maxWidth = Math.max(0.01, 1 - x);
  const maxHeight = Math.max(0.01, 1 - y);
  const w = Math.max(0.01, Math.min(maxWidth, clampNormalizedPosition(crop.w)));
  const h = Math.max(0.01, Math.min(maxHeight, clampNormalizedPosition(crop.h)));

  return { x, y, w, h };
}

export function resolvePreviewViewportMetrics(input: {
  sourceWidth: number;
  sourceHeight: number;
  crop?: SubtitleCropRegion | null;
}): PreviewViewportMetrics {
  const { sourceWidth, sourceHeight, crop } = input;
  const cropRegion = normalizeCropRegion(crop);
  const safeSourceWidth = Math.max(0, Math.round(sourceWidth));
  const safeSourceHeight = Math.max(0, Math.round(sourceHeight));
  const outputSourceWidth = Math.max(
    0,
    Math.round(safeSourceWidth * cropRegion.w),
  );
  const outputSourceHeight = Math.max(
    0,
    Math.round(safeSourceHeight * cropRegion.h),
  );
  const aspectRatio =
    outputSourceWidth > 0 && outputSourceHeight > 0
      ? outputSourceWidth / outputSourceHeight
      : safeSourceWidth > 0 && safeSourceHeight > 0
        ? safeSourceWidth / safeSourceHeight
        : 16 / 9;

  return {
    cropRegion,
    outputSourceWidth,
    outputSourceHeight,
    aspectRatio,
    contentWidthPercent: 100 / cropRegion.w,
    contentHeightPercent: 100 / cropRegion.h,
    contentOffsetXPercent: -(cropRegion.x * 100) / cropRegion.w,
    contentOffsetYPercent: -(cropRegion.y * 100) / cropRegion.h,
  };
}
