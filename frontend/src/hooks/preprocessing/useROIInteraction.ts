import { useState, useEffect, useCallback } from "react";
import {
  hasEditableKeyboardTarget,
  isKeyboardEventComposing,
} from "../../utils/keyboardShortcuts";

// ─── Types ──────────────────────────────────────────────────────
export type InteractionMode = "idle" | "drawing" | "moving" | "resizing";

export interface ROIRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface UseROIInteractionArgs {
  /** Ref to the interaction canvas div */
  canvasRef: React.RefObject<HTMLDivElement | null>;
  /** Whether the current tool supports ROI drawing */
  enabled: boolean;
}

interface UseROIInteractionReturn {
  roi: ROIRect | null;
  setRoi: (roi: ROIRect | null) => void;
  interactionMode: InteractionMode;
  handleMouseDown: (e: React.MouseEvent) => void;
  handleMouseMove: (e: React.MouseEvent) => void;
  handleMouseUp: () => void;
}

// ─── Constants ──────────────────────────────────────────────────
const HANDLE_SIZE = 10; // px — hit area for corner resize handles
const MIN_ROI_SIZE = 10; // px — minimum ROI dimension

// ─── Hit-test Helpers ───────────────────────────────────────────
function getResizeHandle(x: number, y: number, rect: ROIRect): string | null {
  const { x: rx, y: ry, w, h } = rect;
  const hit = (bx: number, by: number) =>
    Math.abs(x - bx) <= HANDLE_SIZE && Math.abs(y - by) <= HANDLE_SIZE;

  if (hit(rx, ry)) return "nw";
  if (hit(rx + w, ry)) return "ne";
  if (hit(rx, ry + h)) return "sw";
  if (hit(rx + w, ry + h)) return "se";
  return null;
}

function isPointInside(x: number, y: number, rect: ROIRect): boolean {
  return (
    x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h
  );
}

// ─── Hook ───────────────────────────────────────────────────────
export function useROIInteraction({
  canvasRef,
  enabled,
}: UseROIInteractionArgs): UseROIInteractionReturn {
  const [roi, setRoi] = useState<ROIRect | null>(null);
  const [interactionMode, setInteractionMode] =
    useState<InteractionMode>("idle");
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [snapshotRoi, setSnapshotRoi] = useState<ROIRect | null>(null);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(
    null,
  );

  // Delete / Backspace to clear ROI
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isKeyboardEventComposing(e) || hasEditableKeyboardTarget(e)) {
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (roi) setRoi(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [roi]);

  // ── Mouse Handlers ──────────────────────────────────────────
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!enabled || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // 1. Resize handle?
      if (roi) {
        const handle = getResizeHandle(x, y, roi);
        if (handle) {
          setInteractionMode("resizing");
          setResizeHandle(handle);
          setDragStart({ x, y });
          setSnapshotRoi(roi);
          return;
        }
        // 2. Move?
        if (isPointInside(x, y, roi)) {
          setInteractionMode("moving");
          setDragStart({ x, y });
          setSnapshotRoi(roi);
          return;
        }
      }

      // 3. Draw new
      setInteractionMode("drawing");
      setStartPos({ x, y });
      setRoi({ x, y, w: 0, h: 0 });
    },
    [enabled, canvasRef, roi],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;

      // Cursor management (idle)
      if (interactionMode === "idle" && roi) {
        const handle = getResizeHandle(cx, cy, roi);
        if (handle) {
          canvasRef.current.style.cursor = `${handle}-resize`;
          return;
        }
        if (isPointInside(cx, cy, roi)) {
          canvasRef.current.style.cursor = "move";
          return;
        }
        canvasRef.current.style.cursor = "crosshair";
      }

      // Drawing
      if (interactionMode === "drawing" && startPos) {
        setRoi({
          x: Math.min(cx, startPos.x),
          y: Math.min(cy, startPos.y),
          w: Math.abs(cx - startPos.x),
          h: Math.abs(cy - startPos.y),
        });
      }
      // Moving
      else if (interactionMode === "moving" && dragStart && snapshotRoi) {
        const dx = cx - dragStart.x;
        const dy = cy - dragStart.y;
        const newX = Math.max(
          0,
          Math.min(snapshotRoi.x + dx, rect.width - snapshotRoi.w),
        );
        const newY = Math.max(
          0,
          Math.min(snapshotRoi.y + dy, rect.height - snapshotRoi.h),
        );
        setRoi({ ...snapshotRoi, x: newX, y: newY });
      }
      // Resizing
      else if (
        interactionMode === "resizing" &&
        dragStart &&
        snapshotRoi &&
        resizeHandle
      ) {
        const dx = cx - dragStart.x;
        const dy = cy - dragStart.y;
        let { x, y, w, h } = snapshotRoi;

        if (resizeHandle.includes("e"))
          w = Math.max(MIN_ROI_SIZE, snapshotRoi.w + dx);
        if (resizeHandle.includes("s"))
          h = Math.max(MIN_ROI_SIZE, snapshotRoi.h + dy);
        if (resizeHandle.includes("w")) {
          const right = snapshotRoi.x + snapshotRoi.w;
          w = Math.max(MIN_ROI_SIZE, snapshotRoi.w - dx);
          x = right - w;
        }
        if (resizeHandle.includes("n")) {
          const bottom = snapshotRoi.y + snapshotRoi.h;
          h = Math.max(MIN_ROI_SIZE, snapshotRoi.h - dy);
          y = bottom - h;
        }
        setRoi({ x, y, w, h });
      }
    },
    [
      canvasRef,
      interactionMode,
      roi,
      startPos,
      dragStart,
      snapshotRoi,
      resizeHandle,
    ],
  );

  const handleMouseUp = useCallback(() => {
    setInteractionMode("idle");
    setDragStart(null);
    setSnapshotRoi(null);
    setResizeHandle(null);
  }, []);

  return {
    roi,
    setRoi,
    interactionMode,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  };
}
