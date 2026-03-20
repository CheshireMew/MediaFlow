const LINE_START_FORBIDDEN = new Set("，。！？；：、）」』】》〉）…—～·");
const LINE_END_FORBIDDEN = new Set("（「『【《〈（");

export interface SubtitleMeasureOptions {
  fontFamily?: string;
  isBold?: boolean;
  isItalic?: boolean;
}

function isCjk(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0;
  return (
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0x20000 && cp <= 0x2a6df)
  );
}

function isFullwidth(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0;
  return (
    (cp >= 0x3000 && cp <= 0x303f) ||
    (cp >= 0xff01 && cp <= 0xff60) ||
    (cp >= 0xfe30 && cp <= 0xfe4f)
  );
}

function estimateCharWidth(ch: string, fontSize: number): number {
  if (ch === " ") return fontSize * 0.25;
  if (
    isCjk(ch) ||
    isFullwidth(ch) ||
    LINE_START_FORBIDDEN.has(ch) ||
    LINE_END_FORBIDDEN.has(ch)
  ) {
    return fontSize * 0.9;
  }
  return fontSize * 0.5;
}

let measurementCanvas: HTMLCanvasElement | null = null;

function measureCharWidth(
  ch: string,
  fontSize: number,
  options?: SubtitleMeasureOptions,
): number {
  if (
    typeof document === "undefined" ||
    typeof window === "undefined" ||
    !options?.fontFamily
  ) {
    return estimateCharWidth(ch, fontSize);
  }

  measurementCanvas ??= document.createElement("canvas");
  const ctx = measurementCanvas.getContext("2d");
  if (!ctx) return estimateCharWidth(ch, fontSize);

  const fontWeight = options.isBold ? "700" : "400";
  const fontStyle = options.isItalic ? "italic" : "normal";
  ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px "${options.fontFamily}", sans-serif`;

  const measured = ctx.measureText(ch).width;
  return measured > 0 ? measured : estimateCharWidth(ch, fontSize);
}

function canBreakBefore(ch: string): boolean {
  return !LINE_START_FORBIDDEN.has(ch);
}

function canBreakAfter(ch: string): boolean {
  return !LINE_END_FORBIDDEN.has(ch);
}

function isCjkOrFullwidth(ch: string): boolean {
  return (
    isCjk(ch) ||
    isFullwidth(ch) ||
    LINE_START_FORBIDDEN.has(ch) ||
    LINE_END_FORBIDDEN.has(ch)
  );
}

export function shapeSubtitleLine(
  text: string,
  maxWidthPx: number,
  fontSize: number,
  measureOptions?: SubtitleMeasureOptions,
): string {
  if (fontSize <= 0 || maxWidthPx <= 0) return text;

  const totalWidth = Array.from(text).reduce(
    (sum, ch) => sum + measureCharWidth(ch, fontSize, measureOptions),
    0,
  );
  if (totalWidth <= maxWidthPx) return text;

  const lines: string[] = [];
  let currentLine: string[] = [];
  let currentWidth = 0;
  let lastBreakIdx = -1;

  for (const ch of Array.from(text)) {
    const chWidth = measureCharWidth(ch, fontSize, measureOptions);

    if (currentLine.length > 0) {
      const prevCh = currentLine[currentLine.length - 1];
      if (prevCh === " ") {
        lastBreakIdx = currentLine.length - 1;
      } else if (
        isCjkOrFullwidth(prevCh) &&
        canBreakAfter(prevCh) &&
        canBreakBefore(ch)
      ) {
        lastBreakIdx = currentLine.length;
      }
    }

    if (currentWidth + chWidth > maxWidthPx && currentLine.length > 0) {
      if (isCjkOrFullwidth(ch) && canBreakBefore(ch)) {
        if (currentLine.length > 0 && !canBreakAfter(currentLine[currentLine.length - 1])) {
          const carry = currentLine.pop()!;
          lines.push(currentLine.join(""));
          currentLine = [carry, ch];
          currentWidth = currentLine.reduce(
            (sum, item) => sum + measureCharWidth(item, fontSize, measureOptions),
            0,
          );
        } else {
          lines.push(currentLine.join(""));
          currentLine = [ch];
          currentWidth = chWidth;
        }
        lastBreakIdx = -1;
        continue;
      }

      if (lastBreakIdx >= 0 && lastBreakIdx < currentLine.length) {
        let before: string[];
        let after: string[];
        if (currentLine[lastBreakIdx] === " ") {
          before = currentLine.slice(0, lastBreakIdx);
          after = currentLine.slice(lastBreakIdx + 1);
        } else {
          before = currentLine.slice(0, lastBreakIdx);
          after = currentLine.slice(lastBreakIdx);
        }

        lines.push(before.join(""));
        currentLine = [...after, ch];
        currentWidth = currentLine.reduce(
          (sum, item) => sum + measureCharWidth(item, fontSize, measureOptions),
          0,
        );
        lastBreakIdx = -1;
        continue;
      }

      lines.push(currentLine.join(""));
      currentLine = [ch];
      currentWidth = chWidth;
      lastBreakIdx = -1;
      continue;
    }

    currentLine.push(ch);
    currentWidth += chWidth;
  }

  if (currentLine.length > 0) {
    lines.push(currentLine.join(""));
  }

  return lines.join("\n");
}

export function shapeSubtitleText(
  text: string,
  maxWidthPx: number,
  fontSize: number,
  measureOptions?: SubtitleMeasureOptions,
): string {
  if (!text || fontSize <= 0 || maxWidthPx <= 0) return text;

  return text
    .split(/\r?\n/)
    .map((line) => shapeSubtitleLine(line, maxWidthPx, fontSize, measureOptions))
    .join("\n");
}

export function computeSubtitleLineBottomMargins(
  lineCount: number,
  marginV: number,
  lineStep: number,
  multilineAlign: "bottom" | "center" | "top",
): number[] {
  if (lineCount <= 0) return [];

  const margins: number[] = [];
  const blockHeight = (lineCount - 1) * lineStep;

  for (let lineIdx = 0; lineIdx < lineCount; lineIdx += 1) {
    const offsetFromBottom = lineCount - 1 - lineIdx;
    let lineMarginV = marginV;

    if (multilineAlign === "center") {
      lineMarginV =
        marginV + offsetFromBottom * lineStep - Math.floor(blockHeight / 2);
    } else if (multilineAlign === "top") {
      const topAnchor = marginV + (lineCount - 1) * lineStep;
      lineMarginV = topAnchor - lineIdx * lineStep;
    } else {
      lineMarginV = marginV + offsetFromBottom * lineStep;
    }

    margins.push(Math.max(0, lineMarginV));
  }

  return margins;
}

export function computeSynthesisFontSize(
  previewFontSize: number,
): number {
  if (previewFontSize <= 0) return 0;

  // libass renders glyphs slightly smaller than the browser for the same
  // numeric size, so we compensate here instead of scaling by preview height.
  const ASS_FONT_COMPENSATION = 1.25;
  return Math.max(1, Math.round(previewFontSize * ASS_FONT_COMPENSATION));
}

export function computePreviewScaledValue(
  sourceValue: number,
  sourceVideoHeight: number,
  previewVideoHeight: number,
): number {
  if (sourceValue <= 0) return 0;
  if (sourceVideoHeight <= 0 || previewVideoHeight <= 0) {
    return Math.round(sourceValue);
  }

  return Math.max(
    1,
    Math.round((sourceValue * previewVideoHeight) / sourceVideoHeight),
  );
}
