import type React from "react";
import { useTranslation } from "react-i18next";
import { clampPoint, getArrowDelta } from "../../../../utils/spatialInteraction";

import type { PreviewDragTarget } from "../hooks/usePreviewDrag";

type WatermarkPreviewLayerProps = {
  watermarkPreviewUrl: string;
  wmScale: number;
  wmOpacity: number;
  wmPos: { x: number; y: number };
  dragging: PreviewDragTarget | null;
  onDragStart: (event: React.PointerEvent, target: PreviewDragTarget) => void;
  onPositionChange: (value: { x: number; y: number }) => void;
};

export function WatermarkPreviewLayer({
  watermarkPreviewUrl,
  wmScale,
  wmOpacity,
  wmPos,
  dragging,
  onDragStart,
  onPositionChange,
}: WatermarkPreviewLayerProps) {
  const { t } = useTranslation("synthesis");
  const handlePositionKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const delta = getArrowDelta(event.key, event.shiftKey, 0.01, 0.05);
    if (!delta) return;

    event.preventDefault();
    event.stopPropagation();
    onPositionChange(clampPoint(
      { x: wmPos.x + delta.x, y: wmPos.y + delta.y },
      { minX: 0, maxX: 1, minY: 0, maxY: 1 },
    ));
  };

  return (
    <button
      type="button"
      aria-label={t("watermark.positionControl")}
      className="group absolute cursor-move select-none border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
      style={{
        left: `${wmPos.x * 100}%`,
        top: `${wmPos.y * 100}%`,
        width: `${wmScale * 100}%`,
        opacity: wmOpacity,
        zIndex: 20,
        transform: "translate(-50%, -50%)",
        border: dragging === "wm" ? "1px dashed #6366f1" : "1px dashed transparent",
        boxShadow: dragging === "wm" ? "0 0 0 1000px rgba(0,0,0,0.5)" : "none",
        touchAction: "none",
      }}
      onPointerDown={(event) => onDragStart(event, "wm")}
      onKeyDown={handlePositionKeyDown}
    >
      <img src={watermarkPreviewUrl} className="w-full h-auto pointer-events-none drop-shadow-lg" alt={t("watermark.previewAlt")} />
      <div className="absolute inset-0 border border-indigo-500/50 opacity-0 group-hover:opacity-100 pointer-events-none rounded transition-opacity" />
    </button>
  );
}
