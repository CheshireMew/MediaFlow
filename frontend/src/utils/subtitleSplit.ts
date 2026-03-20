import { getBestSplitIndex, getSplitTimingRatio } from "./textSplitter";

type SegmentLike = {
  start: number;
  end: number;
  text: string;
};

type SplitSubtitleOptions = {
  currentTime?: number;
  minPartLength?: number;
  minPartDuration?: number;
  fallbackToMidpoint?: boolean;
};

type SplitSubtitleResult<T extends SegmentLike> = {
  splitIndex: number;
  splitTime: number;
  parts: [T, T];
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function splitSubtitleSegment<T extends SegmentLike>(
  segment: T,
  options: SplitSubtitleOptions = {},
): SplitSubtitleResult<T> | null {
  const {
    currentTime,
    minPartLength = 1,
    minPartDuration = 0,
    fallbackToMidpoint = false,
  } = options;

  const text = (segment.text || "").trim();
  const duration = segment.end - segment.start;
  if (!text || duration <= 0) {
    return null;
  }

  const midpointIndex = Math.floor(text.length / 2);
  const smartIndex = getBestSplitIndex(text);
  const hasSmartSplit =
    smartIndex > 0 && smartIndex < text.length && smartIndex !== midpointIndex;

  let splitIndex = -1;
  let splitTime = 0;

  if (hasSmartSplit) {
    splitIndex = smartIndex;
    splitTime = segment.start + duration * getSplitTimingRatio(text, splitIndex);
  } else if (fallbackToMidpoint) {
    const isPlayheadInside =
      typeof currentTime === "number" &&
      currentTime > segment.start + 0.1 &&
      currentTime < segment.end - 0.1;

    if (isPlayheadInside && typeof currentTime === "number") {
      splitTime = currentTime;
      splitIndex = Math.floor(
        text.length * ((currentTime - segment.start) / duration),
      );
    } else {
      splitTime = segment.start + duration / 2;
      splitIndex = midpointIndex;
    }
  } else {
    return null;
  }

  if (splitIndex <= 0 || splitIndex >= text.length) {
    return null;
  }

  if (minPartDuration > 0) {
    splitTime = clamp(
      splitTime,
      segment.start + minPartDuration,
      segment.end - minPartDuration,
    );
  }

  const firstText = text.slice(0, splitIndex).trimEnd();
  const secondText = text.slice(splitIndex).trimStart();

  if (
    firstText.length < minPartLength ||
    secondText.length < minPartLength ||
    splitTime <= segment.start ||
    splitTime >= segment.end ||
    splitTime - segment.start < minPartDuration ||
    segment.end - splitTime < minPartDuration
  ) {
    return null;
  }

  return {
    splitIndex,
    splitTime,
    parts: [
      {
        ...segment,
        end: splitTime,
        text: firstText,
      },
      {
        ...segment,
        start: splitTime,
        text: secondText,
      },
    ],
  };
}
