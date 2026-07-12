import { useEffect, useRef, useState } from "react";
import type React from "react";

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
  const [dragging, setDragging] = useState<PreviewDragTarget | null>(null);
  const activePointerId = useRef<number | null>(null);

  const startDrag = (event: React.PointerEvent, target: PreviewDragTarget) => {
    event.preventDefault();
    event.stopPropagation();
    activePointerId.current = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(target);
  };

  const startSubtitleDrag = (event: React.PointerEvent) => {
    startDrag(event, "sub");
  };

  useEffect(() => {
    if (!dragging) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (activePointerId.current !== null && event.pointerId !== activePointerId.current) {
        return;
      }
      if (!viewportRef.current) return;

      const rect = viewportRef.current.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      const cx = Math.max(0, Math.min(1, x));
      const cy = Math.max(0, Math.min(1, y));

      if (dragging === "wm") {
        setWmPos({ x: cx, y: cy });
      } else {
        setSubPos({ x: 0.5, y: cy });
      }
    };

    const handlePointerEnd = (event: PointerEvent) => {
      if (activePointerId.current !== null && event.pointerId !== activePointerId.current) {
        return;
      }
      activePointerId.current = null;
      setDragging(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, [dragging, viewportRef, setSubPos, setWmPos]);

  return {
    dragging,
    startDrag,
    startSubtitleDrag,
  };
}
