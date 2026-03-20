import { describe, expect, it } from "vitest";
import { getBestSplitIndex, getSplitTimingRatio } from "../utils/textSplitter";
import { splitSubtitleSegment } from "../utils/subtitleSplit";

describe("text splitter heuristics", () => {
  it("prefers a balanced comma pause over the trailing sentence period", () => {
    const text =
      "Well, is the inflation, well, that's not really the central bank's fault.";

    const splitIndex = getBestSplitIndex(text);

    expect(text.slice(0, splitIndex)).toBe("Well, is the inflation, well,");
    expect(text.slice(splitIndex)).toBe(" that's not really the central bank's fault.");
  });

  it("avoids splitting into a dangling function-word fragment", () => {
    const text =
      "And as a final point, my own judgment is the story that I hear from many of my peers.";

    const splitIndex = getBestSplitIndex(text);
    const firstPart = text.slice(0, splitIndex).trim();
    const secondPart = text.slice(splitIndex).trim();

    expect(firstPart.endsWith("of")).toBe(false);
    expect(secondPart.startsWith("of")).toBe(false);
  });

  it("prefers CJK pause punctuation instead of raw midpoint fallback", () => {
    const text = "在市场经济中，价格变化是因为世界上的冲击，而不是每天都在发生根本变化。";

    const splitIndex = getBestSplitIndex(text);

    expect(text.slice(0, splitIndex)).toContain("，");
  });

  it("uses token-weighted timing instead of plain character ratio", () => {
    const text = "tiny words here extraordinary";
    const splitIndex = text.indexOf(" extraordinary");

    const ratio = getSplitTimingRatio(text, splitIndex);
    const charRatio = splitIndex / text.length;

    expect(Math.abs(ratio - charRatio)).toBeGreaterThan(0.02);
  });

  it("applies the weighted ratio when splitting a subtitle segment", () => {
    const text = "tiny words here extraordinary";
    const splitIndex = getBestSplitIndex(text);
    const ratio = getSplitTimingRatio(text, splitIndex);

    const result = splitSubtitleSegment({
      id: "1",
      start: 0,
      end: 10,
      text,
    });

    expect(result).not.toBeNull();
    expect(result?.splitTime).toBeCloseTo(10 * ratio, 3);
  });
});
