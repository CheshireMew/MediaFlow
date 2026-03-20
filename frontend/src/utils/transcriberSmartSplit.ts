import type { TranscribeResult, TranscribeSegment } from "../types/transcriber";
import { splitSubtitleSegment } from "./subtitleSplit";

const REGEX_CJK =
  /[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF\u4E00-\u9FAF\u3400-\u4DBF]/;

const MIN_SEGMENT_DURATION = 3.2;
const MIN_LATIN_LENGTH = 56;
const MIN_CJK_LENGTH = 24;
const MIN_WORD_COUNT = 11;
const MIN_PART_LENGTH = 6;
const MIN_PART_DURATION = 0.8;

function shouldSplitSegment(text: string, duration: number): boolean {
  const trimmed = text.trim();
  if (!trimmed || duration < MIN_SEGMENT_DURATION) {
    return false;
  }

  if (REGEX_CJK.test(trimmed)) {
    return trimmed.length >= MIN_CJK_LENGTH;
  }

  const words = trimmed.split(/\s+/).filter(Boolean).length;
  return trimmed.length >= MIN_LATIN_LENGTH || words >= MIN_WORD_COUNT;
}

function splitSegment(
  segment: TranscribeSegment,
): [TranscribeSegment, TranscribeSegment] | null {
  const text = segment.text.trim();
  const duration = segment.end - segment.start;
  if (!shouldSplitSegment(text, duration)) {
    return null;
  }

  const split = splitSubtitleSegment(segment, {
    minPartLength: MIN_PART_LENGTH,
    minPartDuration: MIN_PART_DURATION,
  });

  return split ? split.parts : null;
}

export function smartSplitTranscriptionResult(result: TranscribeResult): {
  result: TranscribeResult;
  splitCount: number;
} {
  let splitCount = 0;
  const nextSegments = result.segments.flatMap((segment) => {
    const split = splitSegment(segment);
    if (!split) {
      return [segment];
    }
    splitCount += 1;
    return split;
  });

  const normalizedSegments = nextSegments.map((segment, index) => ({
    ...segment,
    id: String(index + 1),
  }));

  return {
    splitCount,
    result: {
      ...result,
      segments: normalizedSegments,
      text: normalizedSegments.map((segment) => segment.text).join(" ").trim(),
    },
  };
}
