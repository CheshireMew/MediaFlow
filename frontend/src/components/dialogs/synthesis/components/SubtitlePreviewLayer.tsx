import type React from "react";

import type { SubtitleStyleState } from "../hooks/useSubtitleStyle";
import type { PreviewDragTarget } from "../hooks/usePreviewDrag";
import {
  computeSubtitleLineBottomMargins,
  shapeSubtitleText,
} from "../textShaper";
import {
  resolveSubtitlePreviewRenderSpec,
  resolveSubtitleRenderSourceSpec,
} from "../subtitleRender";

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
  const {
    fontSize,
    fontColor,
    fontName,
    isBold,
    isItalic,
    outlineSize,
    shadowSize,
    outlineColor,
    bgEnabled,
    bgColor,
    bgOpacity,
    bgPadding,
    alignment,
    multilineAlign,
    subPos,
    currentSubtitle,
  } = style;

  const sourceRenderSpec = resolveSubtitleRenderSourceSpec({
    fontSize,
    fontColor,
    fontName,
    isBold,
    isItalic,
    outlineSize,
    shadowSize,
    outlineColor,
    bgEnabled,
    bgColor,
    bgOpacity,
    bgPadding,
    alignment,
    multilineAlign,
    subPos,
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

  const shapedSubtitle = shapeSubtitleText(
    currentSubtitle || fallbackText,
    previewMetrics.availableWidth,
    previewMetrics.fontSize,
    { fontFamily: fontName, isBold, isItalic },
  );
  const subtitleLines = shapedSubtitle.split("\n");
  const lineBottomMargins = computeSubtitleLineBottomMargins(
    subtitleLines.length,
    previewMetrics.marginV,
    previewMetrics.lineStep,
    multilineAlign,
  );

  return (
    <div
      className="absolute inset-0 select-none group transition-colors pointer-events-none"
      style={{
        zIndex: 30,
        textAlign: alignment === 1 ? "left" : alignment === 3 ? "right" : "center",
      }}
    >
      {(currentSubtitle || dragging === "sub") &&
        subtitleLines.map((lineText, index) => (
          <div
            key={`${index}-${lineText}`}
            className="absolute"
            style={{
              left: `${previewMetrics.marginL}px`,
              right: `${previewMetrics.marginR}px`,
              bottom: `${lineBottomMargins[index] ?? previewMetrics.marginV}px`,
              textAlign: alignment === 1 ? "left" : alignment === 3 ? "right" : "center",
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
                color: fontColor,
                fontFamily: `"${fontName}", sans-serif`,
                fontWeight: isBold ? "bold" : "normal",
                fontStyle: isItalic ? "italic" : "normal",
                fontSynthesis: "style",
                lineHeight: `${previewMetrics.lineStep}px`,
                textShadow: previewMetrics.textShadow,
                backgroundColor: previewMetrics.backgroundColor,
                padding: previewMetrics.padding,
                borderRadius: bgEnabled ? 0 : undefined,
                whiteSpace: "pre",
              }}
            >
              {lineText}
            </span>
          </div>
        ))}
    </div>
  );
}
