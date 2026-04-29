import type React from "react";

import type { SubtitleStyleState } from "../hooks/useSubtitleStyle";
import type { PreviewDragTarget } from "../hooks/usePreviewDrag";
import {
  resolveSubtitlePreviewRenderSpec,
  resolveSubtitleRenderSourceSpec,
} from "../../../../services/domain";

type SubtitlePreviewLayerProps = {
  style: SubtitleStyleState;
  frameSize: { width: number; height: number };
  sourceSize: { width: number; height: number };
  fallbackText: string;
  dragging: PreviewDragTarget | null;
  onSubtitleDragStart: (event: React.MouseEvent) => void;
};

export function SubtitlePreviewLayer({
  style,
  frameSize,
  sourceSize,
  fallbackText,
  dragging,
  onSubtitleDragStart,
}: SubtitlePreviewLayerProps) {
  const sourceRenderSpec = resolveSubtitleRenderSourceSpec({
    ...style,
    outputWidth: sourceSize.width,
    outputHeight: sourceSize.height,
  });
  const previewMetrics = resolveSubtitlePreviewRenderSpec({
    source: sourceRenderSpec,
    previewWidth: frameSize.width,
    previewHeight: frameSize.height,
  });
  if (!previewMetrics.isReady) {
    return null;
  }

  const subtitleText = style.currentSubtitle || fallbackText;
  const alignment =
    style.alignment === 1 ? "left" : style.alignment === 3 ? "right" : "center";
  const blockAnchorTransform =
    style.multilineAlign === "center"
      ? "translateY(50%)"
      : style.multilineAlign === "top"
        ? "translateY(100%)"
        : undefined;

  return (
    <div
      className="absolute inset-0 select-none group transition-colors pointer-events-none"
      style={{
        zIndex: 30,
        textAlign: alignment,
      }}
    >
      {(style.currentSubtitle || dragging === "sub") && (
        <div
          className="absolute"
          style={{
            left: `${previewMetrics.marginL}px`,
            right: `${previewMetrics.marginR}px`,
            bottom: `${previewMetrics.marginV}px`,
            textAlign: alignment,
            transform: blockAnchorTransform,
          }}
        >
          <span
            className={`
              inline-block text-lg md:text-xl leading-relaxed max-w-full cursor-move pointer-events-auto
              transition-all duration-75
              ${dragging === "sub" ? "ring-2 ring-indigo-500 ring-offset-2 ring-offset-black/50" : "group-hover:ring-1 group-hover:ring-white/30"}
            `}
            onMouseDown={onSubtitleDragStart}
            style={{
              fontSize: `${previewMetrics.fontSize}px`,
              color: style.fontColor,
              fontFamily: `"${style.fontName}", sans-serif`,
              fontWeight: style.isBold ? "bold" : "normal",
              fontStyle: style.isItalic ? "italic" : "normal",
              fontSynthesis: "style",
              lineHeight: `${previewMetrics.lineStep}px`,
              textShadow: previewMetrics.textShadow,
              backgroundColor: previewMetrics.backgroundColor,
              padding: previewMetrics.padding,
              borderRadius: style.bgEnabled ? 0 : undefined,
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
            }}
          >
            {subtitleText}
          </span>
        </div>
      )}
    </div>
  );
}
