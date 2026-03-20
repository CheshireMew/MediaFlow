import type { SubtitleSegment } from "../types/task";

/**
 * Parse timestamp strings from common subtitle formats.
 */
function parseTimestamp(timestamp: string): number | null {
  const match = timestamp
    .trim()
    .match(/^(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{2,3})$/);
  if (!match) return null;

  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const rawMs = match[4];
  const milliseconds =
    rawMs.length === 2 ? Number(rawMs) * 10 : Number(rawMs.padEnd(3, "0"));

  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

function normalizeSubtitleText(text: string): string {
  return text
    .replace(/\{[^}]*\}/g, "")
    .replace(/\\N/gi, "\n")
    .replace(/\\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

function parseTimestampLine(line: string): { start: number; end: number } | null {
  const match = line.match(
    /((?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{2,3})\s*-->\s*((?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{2,3})/,
  );
  if (!match) return null;

  const start = parseTimestamp(match[1]);
  const end = parseTimestamp(match[2]);
  if (start === null || end === null) return null;
  return { start, end };
}

/**
 * Parse SRT/WebVTT content into SubtitleSegment array.
 * Handles both Unix (\n) and Windows (\r\n) line endings.
 * Supports comma (,) and period (.) as millisecond separators.
 */
export function parseSRT(content: string): SubtitleSegment[] {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = normalized.trim().split(/\n\s*\n/);

  const segments: SubtitleSegment[] = [];

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    const timeLineIdx = lines.findIndex((line) => line.includes("-->"));
    if (timeLineIdx === -1) continue;

    const timing = parseTimestampLine(lines[timeLineIdx]);
    if (!timing) continue;

    const text = normalizeSubtitleText(lines.slice(timeLineIdx + 1).join("\n"));
    if (!text) continue;

    segments.push({
      id: String(segments.length + 1),
      start: timing.start,
      end: timing.end,
      text,
    });
  }

  return segments;
}

export function parseASS(content: string): SubtitleSegment[] {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const segments: SubtitleSegment[] = [];

  let inEventsSection = false;
  let formatColumns: string[] = [];
  let startIndex = -1;
  let endIndex = -1;
  let textIndex = -1;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("[")) {
      inEventsSection = trimmed.toLowerCase() === "[events]";
      continue;
    }

    if (!inEventsSection) continue;

    if (trimmed.startsWith("Format:")) {
      formatColumns = trimmed
        .slice("Format:".length)
        .split(",")
        .map((part) => part.trim().toLowerCase());
      startIndex = formatColumns.indexOf("start");
      endIndex = formatColumns.indexOf("end");
      textIndex = formatColumns.indexOf("text");
      continue;
    }

    if (!trimmed.startsWith("Dialogue:") || textIndex === -1) continue;

    const rawValues = trimmed.slice("Dialogue:".length).split(",");
    if (rawValues.length <= textIndex) continue;

    const textValue = rawValues.slice(textIndex).join(",");
    const startValue = rawValues[startIndex]?.trim();
    const endValue = rawValues[endIndex]?.trim();
    if (!startValue || !endValue) continue;

    const start = parseTimestamp(startValue);
    const end = parseTimestamp(endValue);
    if (start === null || end === null) continue;

    const text = normalizeSubtitleText(textValue);
    if (!text) continue;

    segments.push({
      id: String(segments.length + 1),
      start,
      end,
      text,
    });
  }

  return segments;
}

export function parseSubtitleContent(
  content: string,
  filePath?: string | null,
): SubtitleSegment[] {
  const normalizedPath = filePath?.toLowerCase() ?? "";
  if (normalizedPath.endsWith(".ass") || normalizedPath.endsWith(".ssa")) {
    return parseASS(content);
  }
  return parseSRT(content);
}

/**
 * Format seconds to SRT timestamp format (HH:MM:SS,mmm)
 */
export function formatSRTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

/**
 * Convert SubtitleSegment array to SRT string format
 */
export function toSRT(segments: SubtitleSegment[]): string {
  return segments
    .map((seg, idx) => {
      return `${idx + 1}\n${formatSRTTime(seg.start)} --> ${formatSRTTime(seg.end)}\n${seg.text}`;
    })
    .join("\n\n");
}
