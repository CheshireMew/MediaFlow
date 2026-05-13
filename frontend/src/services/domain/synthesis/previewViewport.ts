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

export type ContainedViewportFrame = {
  width: number;
  height: number;
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

export function resolveContainedViewportFrame(input: {
  containerWidth: number;
  containerHeight: number;
  aspectRatio: number;
}): ContainedViewportFrame {
  const containerWidth = Math.max(0, Math.floor(input.containerWidth));
  const containerHeight = Math.max(0, Math.floor(input.containerHeight));
  const aspectRatio =
    Number.isFinite(input.aspectRatio) && input.aspectRatio > 0
      ? input.aspectRatio
      : 16 / 9;

  if (containerWidth <= 0 || containerHeight <= 0) {
    return { width: 0, height: 0 };
  }

  const heightBoundWidth = containerHeight * aspectRatio;
  if (heightBoundWidth <= containerWidth) {
    return {
      width: Math.round(heightBoundWidth),
      height: containerHeight,
    };
  }

  return {
    width: containerWidth,
    height: Math.round(containerWidth / aspectRatio),
  };
}
