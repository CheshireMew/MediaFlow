export function clampNormalizedPosition(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

export type SubtitleCropRegion = {
  x: number;
  y: number;
  w: number;
  h: number;
};
