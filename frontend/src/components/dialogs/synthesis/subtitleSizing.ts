export type PreviewSubtitleMetricsInput = {
  fontSize: number;
  outlineSize: number;
  shadowSize: number;
  backgroundEnabled: boolean;
  backgroundPadding: number;
  sourceVideoHeight: number;
  previewVideoHeight: number;
};

export type PreviewSubtitleMetrics = {
  isReady: boolean;
  scaleFactor: number;
  fontSize: number;
  outlineSize: number;
  shadowSize: number;
  backgroundPadding: number;
  lineInsetSize: number;
  lineStep: number;
};

export function computeSynthesisFontSize(
  previewFontSize: number,
): number {
  if (previewFontSize <= 0) return 0;

  // libass renders glyphs slightly smaller than the browser for the same
  // numeric size, so we compensate here instead of scaling by preview height.
  const ASS_FONT_COMPENSATION = 1.25;
  return Math.max(1, Math.round(previewFontSize * ASS_FONT_COMPENSATION));
}

export function computeDefaultSubtitleFontSize(videoHeight: number): number {
  if (videoHeight <= 0) {
    return 24;
  }

  const suggested = Math.round((videoHeight * 0.022) / 2) * 2;
  return Math.min(42, Math.max(18, suggested));
}

export function computePreviewScaledValue(
  sourceValue: number,
  sourceVideoHeight: number,
  previewVideoHeight: number,
): number {
  if (sourceValue <= 0) return 0;
  if (sourceVideoHeight <= 0 || previewVideoHeight <= 0) {
    return Math.round(sourceValue);
  }

  return Math.max(
    1,
    Math.round((sourceValue * previewVideoHeight) / sourceVideoHeight),
  );
}

export function resolvePreviewSubtitleMetrics(
  input: PreviewSubtitleMetricsInput,
): PreviewSubtitleMetrics {
  const {
    fontSize,
    outlineSize,
    shadowSize,
    backgroundEnabled,
    backgroundPadding,
    sourceVideoHeight,
    previewVideoHeight,
  } = input;

  const safeSourceHeight = Math.max(0, Math.round(sourceVideoHeight));
  const safePreviewHeight = Math.max(0, Math.round(previewVideoHeight));
  if (safeSourceHeight <= 0 || safePreviewHeight <= 0) {
    return {
      isReady: false,
      scaleFactor: 0,
      fontSize: 0,
      outlineSize: 0,
      shadowSize: 0,
      backgroundPadding: 0,
      lineInsetSize: 0,
      lineStep: 0,
    };
  }

  const resolvedFontSize = computePreviewScaledValue(
    fontSize,
    safeSourceHeight,
    safePreviewHeight,
  );
  const resolvedOutlineSize = computePreviewScaledValue(
    outlineSize,
    safeSourceHeight,
    safePreviewHeight,
  );
  const resolvedShadowSize = computePreviewScaledValue(
    shadowSize,
    safeSourceHeight,
    safePreviewHeight,
  );
  const resolvedBackgroundPadding = computePreviewScaledValue(
    backgroundPadding,
    safeSourceHeight,
    safePreviewHeight,
  );
  const lineInsetSize = backgroundEnabled
    ? resolvedBackgroundPadding
    : resolvedOutlineSize;

  return {
    isReady: true,
    scaleFactor: safePreviewHeight / safeSourceHeight,
    fontSize: resolvedFontSize,
    outlineSize: resolvedOutlineSize,
    shadowSize: resolvedShadowSize,
    backgroundPadding: resolvedBackgroundPadding,
    lineInsetSize,
    lineStep: resolvedFontSize + lineInsetSize * 2,
  };
}
