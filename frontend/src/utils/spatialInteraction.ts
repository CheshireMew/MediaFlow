export type Point = { x: number; y: number };

const ARROW_DIRECTIONS: Record<string, Point> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getArrowDelta(
  key: string,
  shiftKey: boolean,
  step: number,
  shiftedStep: number,
): Point | null {
  const direction = ARROW_DIRECTIONS[key];
  if (!direction) return null;
  const distance = shiftKey ? shiftedStep : step;
  return { x: direction.x * distance, y: direction.y * distance };
}

export function pointFromClient(
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
  clientX: number,
  clientY: number,
): Point | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    x: (clientX - rect.left) / rect.width,
    y: (clientY - rect.top) / rect.height,
  };
}

export function clampPoint(
  point: Point,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
): Point {
  return {
    x: clamp(point.x, bounds.minX, bounds.maxX),
    y: clamp(point.y, bounds.minY, bounds.maxY),
  };
}
