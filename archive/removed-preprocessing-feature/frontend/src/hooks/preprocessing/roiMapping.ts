export interface ROIRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ROISize {
  w: number;
  h: number;
}

export type MediaPixelROI = [number, number, number, number];

export interface ContainedMediaRect extends ROIRect {
  scale: number;
}

function hasPositiveSize(size: ROISize) {
  return (
    Number.isFinite(size.w) &&
    Number.isFinite(size.h) &&
    size.w > 0 &&
    size.h > 0
  );
}

function intersectRect(rect: ROIRect, bounds: ROIRect): ROIRect | null {
  const rectLeft = Math.min(rect.x, rect.x + rect.w);
  const rectTop = Math.min(rect.y, rect.y + rect.h);
  const rectRight = Math.max(rect.x, rect.x + rect.w);
  const rectBottom = Math.max(rect.y, rect.y + rect.h);
  const left = Math.max(rectLeft, bounds.x);
  const top = Math.max(rectTop, bounds.y);
  const right = Math.min(rectRight, bounds.x + bounds.w);
  const bottom = Math.min(rectBottom, bounds.y + bounds.h);

  if (right <= left || bottom <= top) {
    return null;
  }
  return { x: left, y: top, w: right - left, h: bottom - top };
}

export function getContainedMediaRect(
  viewport: ROISize,
  media: ROISize,
): ContainedMediaRect | null {
  if (!hasPositiveSize(viewport) || !hasPositiveSize(media)) {
    return null;
  }

  const scale = Math.min(viewport.w / media.w, viewport.h / media.h);
  const w = media.w * scale;
  const h = media.h * scale;
  return {
    x: (viewport.w - w) / 2,
    y: (viewport.h - h) / 2,
    w,
    h,
    scale,
  };
}

export function viewportRoiToMediaPixels(
  roi: ROIRect,
  viewport: ROISize,
  media: ROISize,
): MediaPixelROI | null {
  const contained = getContainedMediaRect(viewport, media);
  if (!contained) {
    return null;
  }
  const clipped = intersectRect(roi, contained);
  if (!clipped) {
    return null;
  }

  const left = Math.max(
    0,
    Math.floor((clipped.x - contained.x) / contained.scale),
  );
  const top = Math.max(
    0,
    Math.floor((clipped.y - contained.y) / contained.scale),
  );
  const right = Math.min(
    media.w,
    Math.ceil((clipped.x + clipped.w - contained.x) / contained.scale),
  );
  const bottom = Math.min(
    media.h,
    Math.ceil((clipped.y + clipped.h - contained.y) / contained.scale),
  );

  if (right <= left || bottom <= top) {
    return null;
  }
  return [left, top, right - left, bottom - top];
}
