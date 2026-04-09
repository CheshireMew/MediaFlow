import { hexToAss } from "./types";
import { clampNormalizedPosition } from "./subtitlePlacement";

const ASS_FONT_COMPENSATION = 1.25;
const MIN_SIDE_MARGIN_PX = 10;
const DEFAULT_SUBTITLE_REFERENCE_HEIGHT = 720;
const DEFAULT_SUBTITLE_REFERENCE_FONT_SIZE = 40;
const DEFAULT_SUBTITLE_FALLBACK_FONT_SIZE = 24;
const DEFAULT_SUBTITLE_MIN_RECOMMENDED_FONT_SIZE = 12;
const DEFAULT_SUBTITLE_MAX_FONT_SIZE = 120;

export type SubtitleMultilineAlign = "bottom" | "center" | "top";

export type SubtitleRenderStyleInput = {
  fontSize: number;
  fontColor: string;
  fontName: string;
  isBold: boolean;
  isItalic: boolean;
  outlineSize: number;
  shadowSize: number;
  outlineColor: string;
  bgEnabled: boolean;
  bgColor: string;
  bgOpacity: number;
  bgPadding: number;
  alignment: number;
  multilineAlign: SubtitleMultilineAlign;
  subPos: { x: number; y: number };
};

export type SubtitleRenderSourceInput = SubtitleRenderStyleInput & {
  outputWidth: number;
  outputHeight: number;
};

export type SubtitleRenderSourceSpec = {
  isReady: boolean;
  outputWidth: number;
  outputHeight: number;
  fontName: string;
  fontColor: string;
  outlineColor: string;
  isBold: boolean;
  isItalic: boolean;
  alignment: number;
  multilineAlign: SubtitleMultilineAlign;
  authoringFontSize: number;
  exportFontSize: number;
  outlineSize: number;
  shadowSize: number;
  backgroundEnabled: boolean;
  backgroundPadding: number;
  lineInsetSize: number;
  exportLineStep: number;
  marginV: number;
  marginL: number;
  marginR: number;
  availableWidth: number;
  assFontColor: string;
  assOutlineColor: string;
  assBackColor: string;
  borderStyle: 1 | 3;
  previewBackgroundColor: string;
};

export type SubtitleRenderPreviewSpec = {
  isReady: boolean;
  width: number;
  height: number;
  fontSize: number;
  outlineSize: number;
  shadowSize: number;
  backgroundPadding: number;
  lineInsetSize: number;
  lineStep: number;
  marginV: number;
  marginL: number;
  marginR: number;
  availableWidth: number;
  textShadow?: string;
  backgroundColor: string;
  padding: string;
};

export type SubtitleSynthesisStyleOptions = {
  font_name: string;
  font_size: number;
  font_color: string;
  bold: boolean;
  italic: boolean;
  outline: number;
  shadow: number;
  outline_color: string;
  back_color: string;
  border_style: 1 | 3;
  alignment: number;
  multiline_align: SubtitleMultilineAlign;
  margin_l: number;
  margin_r: number;
  line_step: number;
};

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function hexWithOpacity(hexColor: string, opacity: number): string {
  const alpha = clampChannel(Math.max(0, Math.min(1, opacity)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hexColor}${alpha}`;
}

function buildAssBackgroundColor(hexColor: string, opacity: number): string {
  const assAlpha = clampChannel((1 - Math.max(0, Math.min(1, opacity))) * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
  return hexToAss(hexColor, assAlpha);
}

function computeSideMargin(width: number): number {
  const safeWidth = Math.max(0, Math.round(width));
  if (safeWidth <= 0) {
    return MIN_SIDE_MARGIN_PX;
  }
  return Math.max(MIN_SIDE_MARGIN_PX, Math.round(safeWidth * 0.02));
}

function computeMarginV(normalizedY: number, height: number): number {
  const safeHeight = Math.max(0, Math.round(height));
  if (safeHeight <= 0) {
    return 0;
  }

  return Math.max(
    0,
    Math.round((1 - clampNormalizedPosition(normalizedY)) * safeHeight),
  );
}

function scaleRenderValue(
  sourceValue: number,
  sourceExtent: number,
  targetExtent: number,
  minimum: number,
): number {
  if (sourceValue <= 0) {
    return 0;
  }
  if (sourceExtent <= 0 || targetExtent <= 0) {
    return Math.max(minimum, Math.round(sourceValue));
  }

  return Math.max(
    minimum,
    Math.round((sourceValue * targetExtent) / sourceExtent),
  );
}

export function computeSubtitleExportFontSize(authoringFontSize: number): number {
  if (authoringFontSize <= 0) {
    return 0;
  }
  return Math.max(1, Math.round(authoringFontSize * ASS_FONT_COMPENSATION));
}

export function computeDefaultSubtitleFontSize(videoHeight: number): number {
  if (videoHeight <= 0) {
    return DEFAULT_SUBTITLE_FALLBACK_FONT_SIZE;
  }

  const suggested =
    (videoHeight * DEFAULT_SUBTITLE_REFERENCE_FONT_SIZE) /
    DEFAULT_SUBTITLE_REFERENCE_HEIGHT;
  const rounded = Math.floor(suggested / 2) * 2;
  return Math.min(
    DEFAULT_SUBTITLE_MAX_FONT_SIZE,
    Math.max(DEFAULT_SUBTITLE_MIN_RECOMMENDED_FONT_SIZE, rounded),
  );
}

export function buildPreviewTextShadow(params: {
  outlineSize: number;
  outlineColor: string;
  shadowSize: number;
  backgroundEnabled: boolean;
}): string | undefined {
  const { outlineSize, outlineColor, shadowSize, backgroundEnabled } = params;
  const shadows: string[] = [];

  if (!backgroundEnabled && outlineSize > 0) {
    const radius = Math.max(1, outlineSize);
    for (let y = -radius; y <= radius; y += 1) {
      for (let x = -radius; x <= radius; x += 1) {
        if (x === 0 && y === 0) continue;
        if (Math.max(Math.abs(x), Math.abs(y)) > radius) continue;
        shadows.push(`${x}px ${y}px 0 ${outlineColor}`);
      }
    }
  }

  if (shadowSize > 0) {
    const offset = Math.max(1, Math.round(shadowSize));
    const blur = Math.max(1, Math.round(shadowSize));
    shadows.push(`${offset}px ${offset}px 0 rgba(0,0,0,0.88)`);
    shadows.push(`${offset}px ${offset}px ${blur}px rgba(0,0,0,0.35)`);
  }

  return shadows.length > 0 ? shadows.join(", ") : undefined;
}

function getPreviewPadding(backgroundEnabled: boolean, backgroundPadding: number): string {
  if (!backgroundEnabled) {
    return "0px";
  }
  return `${Math.max(0, Math.round(backgroundPadding))}px`;
}

export function resolveSubtitleRenderSourceSpec(
  input: SubtitleRenderSourceInput,
): SubtitleRenderSourceSpec {
  const safeOutputWidth = Math.max(0, Math.round(input.outputWidth));
  const safeOutputHeight = Math.max(0, Math.round(input.outputHeight));
  const marginL = computeSideMargin(safeOutputWidth);
  const marginR = computeSideMargin(safeOutputWidth);
  const marginV = computeMarginV(input.subPos.y, safeOutputHeight);
  const lineInsetSize = input.bgEnabled ? input.bgPadding : input.outlineSize;
  const previewBackgroundColor = input.bgEnabled
    ? hexWithOpacity(input.bgColor, input.bgOpacity)
    : "transparent";
  const assBackgroundColor = buildAssBackgroundColor(input.bgColor, input.bgOpacity);
  const borderStyle: 1 | 3 = input.bgEnabled ? 3 : 1;
  const exportFontSize = computeSubtitleExportFontSize(input.fontSize);

  return {
    isReady: safeOutputWidth > 0 && safeOutputHeight > 0,
    outputWidth: safeOutputWidth,
    outputHeight: safeOutputHeight,
    fontName: input.fontName,
    fontColor: input.fontColor,
    outlineColor: input.outlineColor,
    isBold: input.isBold,
    isItalic: input.isItalic,
    alignment: input.alignment,
    multilineAlign: input.multilineAlign,
    authoringFontSize: Math.max(0, Math.round(input.fontSize)),
    exportFontSize,
    outlineSize: Math.max(0, Math.round(input.outlineSize)),
    shadowSize: Math.max(0, Math.round(input.shadowSize)),
    backgroundEnabled: input.bgEnabled,
    backgroundPadding: Math.max(0, Math.round(input.bgPadding)),
    lineInsetSize: Math.max(0, Math.round(lineInsetSize)),
    exportLineStep: exportFontSize + Math.max(0, Math.round(lineInsetSize)) * 2,
    marginV,
    marginL,
    marginR,
    availableWidth: Math.max(0, safeOutputWidth - marginL - marginR),
    assFontColor: hexToAss(input.fontColor),
    assOutlineColor: input.bgEnabled
      ? assBackgroundColor
      : hexToAss(input.outlineColor),
    assBackColor: input.bgEnabled
      ? assBackgroundColor
      : buildAssBackgroundColor(input.bgColor, input.bgOpacity),
    borderStyle,
    previewBackgroundColor,
  };
}

export function resolveSubtitlePreviewRenderSpec(input: {
  source: SubtitleRenderSourceSpec;
  previewWidth: number;
  previewHeight: number;
}): SubtitleRenderPreviewSpec {
  const safePreviewWidth = Math.max(0, Math.round(input.previewWidth));
  const safePreviewHeight = Math.max(0, Math.round(input.previewHeight));
  const { source } = input;

  if (
    !source.isReady ||
    safePreviewWidth <= 0 ||
    safePreviewHeight <= 0 ||
    source.outputWidth <= 0 ||
    source.outputHeight <= 0
  ) {
    return {
      isReady: false,
      width: safePreviewWidth,
      height: safePreviewHeight,
      fontSize: 0,
      outlineSize: 0,
      shadowSize: 0,
      backgroundPadding: 0,
      lineInsetSize: 0,
      lineStep: 0,
      marginV: 0,
      marginL: 0,
      marginR: 0,
      availableWidth: 0,
      backgroundColor: "transparent",
      padding: "0px",
    };
  }

  const fontSize = scaleRenderValue(
    source.authoringFontSize,
    source.outputHeight,
    safePreviewHeight,
    1,
  );
  const outlineSize = scaleRenderValue(
    source.outlineSize,
    source.outputHeight,
    safePreviewHeight,
    1,
  );
  const shadowSize = scaleRenderValue(
    source.shadowSize,
    source.outputHeight,
    safePreviewHeight,
    1,
  );
  const backgroundPadding = scaleRenderValue(
    source.backgroundPadding,
    source.outputHeight,
    safePreviewHeight,
    1,
  );
  const lineInsetSize = source.backgroundEnabled ? backgroundPadding : outlineSize;
  const marginL = scaleRenderValue(
    source.marginL,
    source.outputWidth,
    safePreviewWidth,
    1,
  );
  const marginR = scaleRenderValue(
    source.marginR,
    source.outputWidth,
    safePreviewWidth,
    1,
  );

  return {
    isReady: true,
    width: safePreviewWidth,
    height: safePreviewHeight,
    fontSize,
    outlineSize,
    shadowSize,
    backgroundPadding,
    lineInsetSize,
    lineStep: fontSize + lineInsetSize * 2,
    marginV: scaleRenderValue(
      source.marginV,
      source.outputHeight,
      safePreviewHeight,
      0,
    ),
    marginL,
    marginR,
    availableWidth: Math.max(0, safePreviewWidth - marginL - marginR),
    textShadow: buildPreviewTextShadow({
      outlineSize,
      outlineColor: source.outlineColor,
      shadowSize,
      backgroundEnabled: source.backgroundEnabled,
    }),
    backgroundColor: source.previewBackgroundColor,
    padding: getPreviewPadding(source.backgroundEnabled, backgroundPadding),
  };
}

export function buildSubtitleSynthesisOptions(
  source: SubtitleRenderSourceSpec,
): SubtitleSynthesisStyleOptions {
  return {
    font_name: source.fontName,
    font_size: source.exportFontSize,
    font_color: source.assFontColor,
    bold: source.isBold,
    italic: source.isItalic,
    outline: source.backgroundEnabled
      ? source.backgroundPadding
      : source.outlineSize,
    shadow: source.shadowSize,
    outline_color: source.assOutlineColor,
    back_color: source.assBackColor,
    border_style: source.borderStyle,
    alignment: source.alignment,
    multiline_align: source.multilineAlign,
    margin_l: source.marginL,
    margin_r: source.marginR,
    line_step: source.exportLineStep,
  };
}
