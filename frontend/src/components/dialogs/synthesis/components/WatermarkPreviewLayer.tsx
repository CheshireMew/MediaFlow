import type React from "react";

import type { PreviewDragTarget } from "../hooks/usePreviewDrag";

type WatermarkPreviewLayerProps = {
  watermarkPreviewUrl: string;
  wmScale: number;
  wmOpacity: number;
  wmPos: { x: number; y: number };
  dragging: PreviewDragTarget | null;
  onDragStart: (event: React.MouseEvent, target: PreviewDragTarget) => void;
};

export function WatermarkPreviewLayer({
  watermarkPreviewUrl,
  wmScale,
  wmOpacity,
  wmPos,
  dragging,
  onDragStart,
}: WatermarkPreviewLayerProps) {
  return (
    <div
      className="absolute cursor-move select-none group"
      style={{
        left: `${wmPos.x * 100}%`,
        top: `${wmPos.y * 100}%`,
        width: `${wmScale * 100}%`,
        opacity: wmOpacity,
        zIndex: 20,
        transform: "translate(-50%, -50%)",
        border: dragging === "wm" ? "1px dashed #6366f1" : "1px dashed transparent",
        boxShadow: dragging === "wm" ? "0 0 0 1000px rgba(0,0,0,0.5)" : "none",
      }}
      onMouseDown={(event) => onDragStart(event, "wm")}
    >
      <img src={watermarkPreviewUrl} className="w-full h-auto pointer-events-none drop-shadow-lg" alt="Watermark" />
      <div className="absolute inset-0 border border-indigo-500/50 opacity-0 group-hover:opacity-100 pointer-events-none rounded transition-opacity" />
    </div>
  );
}
