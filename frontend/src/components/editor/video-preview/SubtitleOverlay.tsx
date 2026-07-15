import { useCallback, useState } from "react";
import type React from "react";
import { Subtitles } from "lucide-react";
import { useTranslation } from "react-i18next";

import { usePointerDragSession } from "../../../hooks/ui/usePointerDragSession";
import { clampPoint, getArrowDelta, pointFromClient } from "../../../utils/spatialInteraction";

const SUBTITLE_BOUNDS = { minX: 12, maxX: 88, minY: 20, maxY: 88 };

export function SubtitleOverlay({
  text,
  currentIndex,
  total,
  isFullscreen,
  frameRef,
}: {
  text: string;
  currentIndex: number;
  total: number;
  isFullscreen: boolean;
  frameRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { t } = useTranslation("editor");
  const [position, setPosition] = useState({ x: 50, y: 76 });
  const [backgroundAlpha, setBackgroundAlpha] = useState(0.6);

  const handleMove = useCallback((event: PointerEvent) => {
    const frame = frameRef.current;
    if (!frame) return;
    const point = pointFromClient(frame.getBoundingClientRect(), event.clientX, event.clientY);
    if (!point) return;
    setPosition(clampPoint(
      { x: point.x * 100, y: point.y * 100 },
      SUBTITLE_BOUNDS,
    ));
  }, [frameRef]);
  const pointerDrag = usePointerDragSession<Record<never, never>>({ onMove: handleMove });

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const delta = getArrowDelta(event.key, event.shiftKey, 1, 5);
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    setPosition((current) => clampPoint(
      { x: current.x + delta.x, y: current.y + delta.y },
      SUBTITLE_BOUNDS,
    ));
  };

  return (
    <>
      <div className="absolute left-3 top-3 flex items-center gap-2 rounded-lg border border-white/10 bg-black/55 px-2 py-1 text-xs font-medium text-slate-300">
        <Subtitles size={12} className="text-indigo-300" />
        {currentIndex >= 0 ? `${currentIndex + 1} / ${total}` : `0 / ${total}`}
      </div>
      <div className="absolute right-3 top-3 flex items-center gap-1 rounded-lg border border-white/10 bg-black/75 p-1 text-xs font-medium text-slate-300 shadow-lg">
        {[0.35, 0.6, 0.85].map((alpha) => (
          <button
            key={alpha}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setBackgroundAlpha(alpha);
            }}
            aria-label={t("videoPreview.subtitleBackgroundOpacity", { value: Math.round(alpha * 100) })}
            className={`h-6 rounded-md px-2 transition-colors ${
              Math.abs(backgroundAlpha - alpha) < 0.01
                ? "bg-indigo-500/30 text-indigo-100"
                : "hover:bg-white/10 text-slate-400"
            }`}
          >
            {Math.round(alpha * 100)}
          </button>
        ))}
      </div>
      {text && (
        <div
          data-testid="editor-preview-subtitle-layer"
          className="pointer-events-none absolute z-20 w-[86%] -translate-x-1/2 -translate-y-1/2 text-center"
          style={{ left: `${position.x}%`, top: `${position.y}%` }}
        >
          <button
            type="button"
            data-testid="editor-preview-subtitle"
            aria-label={t("videoPreview.subtitlePosition")}
            onPointerDown={(event) => pointerDrag.start(event, {})}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={handleKeyDown}
            className={`pointer-events-auto inline-block w-auto max-w-full cursor-move select-none rounded-lg border-0 text-white/95 font-medium shadow-lg leading-snug whitespace-normal break-words ring-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${
              pointerDrag.session ? "ring-indigo-300/70" : "ring-transparent"
            } ${isFullscreen ? "px-6 py-2.5 text-3xl" : "px-4 py-1.5 text-lg"}`}
            style={{ backgroundColor: `rgba(0, 0, 0, ${backgroundAlpha})`, touchAction: "none" }}
          >
            {text}
          </button>
        </div>
      )}
    </>
  );
}
