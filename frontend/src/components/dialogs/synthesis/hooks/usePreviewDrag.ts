import { useEffect, useState } from "react";
import type React from "react";

export type PreviewDragTarget = "wm" | "sub";

export function usePreviewDrag({
  frameRef,
  setWmPos,
  setSubPos,
}: {
  frameRef: React.RefObject<HTMLDivElement | null>;
  setWmPos: (value: { x: number; y: number }) => void;
  setSubPos: (value: { x: number; y: number }) => void;
}) {
  const [dragging, setDragging] = useState<PreviewDragTarget | null>(null);

  const startDrag = (event: React.MouseEvent, target: PreviewDragTarget) => {
    event.preventDefault();
    setDragging(target);
  };

  const startSubtitleDrag = (event: React.MouseEvent) => {
    event.stopPropagation();
    startDrag(event, "sub");
  };

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (event: MouseEvent) => {
      if (!frameRef.current) return;

      const rect = frameRef.current.getBoundingClientRect();
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

    const handleMouseUp = () => setDragging(null);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, frameRef, setSubPos, setWmPos]);

  return {
    dragging,
    startDrag,
    startSubtitleDrag,
  };
}
