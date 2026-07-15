import { useCallback } from "react";
import type React from "react";
import { usePointerDragSession } from "../../../../hooks/ui/usePointerDragSession";
import { clampPoint, pointFromClient } from "../../../../utils/spatialInteraction";

export type PreviewDragTarget = "wm" | "sub";

export function usePreviewDrag({
  viewportRef,
  setWmPos,
  setSubPos,
}: {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  setWmPos: (value: { x: number; y: number }) => void;
  setSubPos: (value: { x: number; y: number }) => void;
}) {
  const handleMove = useCallback((event: PointerEvent, session: { target: PreviewDragTarget }) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const point = pointFromClient(
      viewport.getBoundingClientRect(),
      event.clientX,
      event.clientY,
    );
    if (!point) return;
    const normalized = clampPoint(point, { minX: 0, maxX: 1, minY: 0, maxY: 1 });
    if (session.target === "wm") {
      setWmPos(normalized);
    } else {
      setSubPos({ x: 0.5, y: normalized.y });
    }
  }, [setSubPos, setWmPos, viewportRef]);

  const pointerDrag = usePointerDragSession<{ target: PreviewDragTarget }>({
    onMove: handleMove,
  });

  const startDrag = (event: React.PointerEvent, target: PreviewDragTarget) => {
    pointerDrag.start(event, { target });
  };

  const startSubtitleDrag = (event: React.PointerEvent) => {
    startDrag(event, "sub");
  };

  return {
    dragging: pointerDrag.session?.target ?? null,
    startDrag,
    startSubtitleDrag,
  };
}
