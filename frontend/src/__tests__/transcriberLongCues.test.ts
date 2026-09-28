import { describe, expect, it } from "vitest";
import { smartSplitSubtitleSegments } from "../utils/subtitleSmartSplit";

describe("transcriber paragraph splitting", () => {
  it("splits a historical paragraph all the way in one operation without losing text or time", () => {
    const text = "这些问题都非常难回答所以我们需要每天花时间去思考和实践".repeat(35);
    const input = [{ id: "340", start: 100, end: 260, text, speaker: "host" }];
    const { segments, splitCount } = smartSplitSubtitleSegments(input, {
      textLimit: 24, recursive: true,
    });
    expect(splitCount).toBe(1);
    expect(segments.length).toBeGreaterThan(30);
    expect(segments.map(s => s.text).join("")).toBe(text);
    expect(Math.max(...segments.map(s => s.text.length))).toBeLessThan(24);
    expect(segments[0].start).toBe(100);
    expect(segments.at(-1)?.end).toBe(260);
    for (const [index, segment] of segments.entries()) {
      expect(segment.end).toBeGreaterThan(segment.start);
      expect(segment.id).toBe(String(index + 1));
      expect(segment.speaker).toBe("host");
      if (index) expect(segment.start).toBe(segments[index - 1].end);
    }
  });

  it("stops when minimum duration prevents further splitting", () => {
    const input = [{ id: "1", start: 0, end: 1.6, text: "这是长段落内容".repeat(100) }];
    const { segments } = smartSplitSubtitleSegments(input, { textLimit: 1, recursive: true });
    expect(segments).toHaveLength(2);
    expect(segments.every(s => s.end - s.start >= 0.8)).toBe(true);
    expect(segments.map(s => s.text).join("")).toBe(input[0].text);
  });

  it("preserves the existing one-pass behavior for other callers", () => {
    const input = [{ id: "1", start: 0, end: 160, text: "这是长段落内容".repeat(100) }];
    expect(smartSplitSubtitleSegments(input).segments).toHaveLength(2);
  });
});
