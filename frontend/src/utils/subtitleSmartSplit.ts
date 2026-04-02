import { splitSubtitleSegment } from "./subtitleSplit";
import type { UserSettings } from "../types/api";

type SubtitleSegmentLike = {
  id: string | number;
  start: number;
  end: number;
  text: string;
};

const REGEX_CJK =
  /[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF\u4E00-\u9FAF\u3400-\u4DBF]/;

const MIN_SEGMENT_DURATION = 3.2;
const MIN_LATIN_LENGTH = 56;
const MIN_CJK_LENGTH = 24;
const MIN_WORD_COUNT = 11;
const MIN_PART_LENGTH = 6;
const MIN_PART_DURATION = 0.8;

export const DEFAULT_SMART_SPLIT_TEXT_LIMIT = MIN_CJK_LENGTH;

function roundThreshold(value: number) {
  return Math.max(1, Math.round(value));
}

export function normalizeSmartSplitTextLimit(
  value: number | null | undefined,
): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_SMART_SPLIT_TEXT_LIMIT;
  }

  return Math.max(1, Math.round(Number(value)));
}

export function resolveSmartSplitTextLimit(
  settings?: Pick<UserSettings, "smart_split_text_limit"> | null,
): number {
  return normalizeSmartSplitTextLimit(settings?.smart_split_text_limit);
}

function getLatinCharThreshold(textLimit: number) {
  return roundThreshold((textLimit * MIN_LATIN_LENGTH) / MIN_CJK_LENGTH);
}

function getLatinWordThreshold(textLimit: number) {
  return roundThreshold((textLimit * MIN_WORD_COUNT) / MIN_CJK_LENGTH);
}

function shouldSplitSegment(
  text: string,
  duration: number,
  textLimit: number,
): boolean {
  const trimmed = text.trim();
  if (!trimmed || duration < MIN_SEGMENT_DURATION) {
    return false;
  }

  if (REGEX_CJK.test(trimmed)) {
    return trimmed.length >= textLimit;
  }

  const words = trimmed.split(/\s+/).filter(Boolean).length;
  return (
    trimmed.length >= getLatinCharThreshold(textLimit) ||
    words >= getLatinWordThreshold(textLimit)
  );
}

function splitLongSubtitleSegment<T extends SubtitleSegmentLike>(
  segment: T,
  textLimit: number,
): [T, T] | null {
  const text = segment.text.trim();
  const duration = segment.end - segment.start;

  if (!shouldSplitSegment(text, duration, textLimit)) {
    return null;
  }

  const split = splitSubtitleSegment(segment, {
    minPartLength: MIN_PART_LENGTH,
    minPartDuration: MIN_PART_DURATION,
  });

  return split ? split.parts : null;
}

export function smartSplitSubtitleSegments<T extends SubtitleSegmentLike>(
  segments: T[],
  options?: {
    textLimit?: number | null;
  },
): {
  segments: T[];
  splitCount: number;
} {
  let splitCount = 0;
  const textLimit = normalizeSmartSplitTextLimit(options?.textLimit);

  const nextSegments = segments.flatMap((segment) => {
    const split = splitLongSubtitleSegment(segment, textLimit);
    if (!split) {
      return [segment];
    }

    splitCount += 1;
    return split;
  });

  return {
    splitCount,
    segments: nextSegments.map((segment, index) => ({
      ...segment,
      id: String(index + 1),
    })),
  };
}
