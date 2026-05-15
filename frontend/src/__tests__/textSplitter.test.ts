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

    const splitIndex = getBestSplitIndex(text, { requirePunctuation: true });

    expect(text.slice(0, splitIndex)).toContain("，");
  });

  it("treats enumeration commas as lower-priority pause boundaries", () => {
    const text =
      "这个方案需要速度、稳定性和兼容性，后半句也需要足够长才能形成更自然的分割结果";

    const splitIndex = getBestSplitIndex(text, { requirePunctuation: true });

    expect(text.slice(0, splitIndex)).toBe("这个方案需要速度、稳定性和兼容性，");
  });

  it("prefers a substantial comma boundary over a better-centered space", () => {
    const text = '"Pydantic is still all you need", 大概是在去年这个时候,';

    const splitIndex = getBestSplitIndex(text);

    expect(text.slice(0, splitIndex)).toBe('"Pydantic is still all you need",');
    expect(text.slice(splitIndex)).toBe(" 大概是在去年这个时候,");
  });

  it("does not split latin initialisms from following names", () => {
    const text = "这段内容正在讨论 J.P. 摩根如何影响市场并持续扩展业务";

    const splitIndex = getBestSplitIndex(text);

    expect(`${text.slice(0, splitIndex)}|${text.slice(splitIndex).trimStart()}`).not.toContain(
      "J.P.|摩根",
    );
    expect(text.slice(0, splitIndex)).not.toMatch(/[A-Za-z]\.$/);
  });

  it("does not split names at middle-dot joiners", () => {
    const text = "这段内容正在讨论西格蒙德·弗洛伊德理论如何影响现代心理学";

    const splitIndex = getBestSplitIndex(text);

    expect(`${text.slice(0, splitIndex)}|${text.slice(splitIndex)}`).not.toContain(
      "西格蒙德·|弗洛伊德",
    );
    expect(`${text.slice(0, splitIndex)}|${text.slice(splitIndex)}`).not.toContain(
      "西格蒙德|·弗洛伊德",
    );
  });

  it("does not split latin first and last names at the internal space", () => {
    const text = "我不知道 David Pereira 是否会认为我们正在做的是正确的决定";

    const splitIndex = getBestSplitIndex(text);

    expect(`${text.slice(0, splitIndex)}|${text.slice(splitIndex).trimStart()}`).not.toContain(
      "David|Pereira",
    );
  });

  it("does not split Hangul names into syllable fragments", () => {
    const text = "중구청장 후보 이동현의 공약은 골목 상권과 주민 생활을 함께 바꾸는 계획입니다";

    const splitIndex = getBestSplitIndex(text);

    expect(`${text.slice(0, splitIndex)}|${text.slice(splitIndex)}`).not.toContain(
      "이동|현",
    );
  });

  it("does not split a long sentence without punctuation in smart mode", () => {
    const text =
      "this is a very long subtitle sentence with plenty of words but absolutely no punctuation so smart split should leave it untouched";

    expect(getBestSplitIndex(text, { requirePunctuation: true })).toBe(-1);
  });

  it("keeps mixed-language latin words intact when falling back near the midpoint", () => {
    const text = "这一句很长而且没有标点AppleOne电脑做任何改动真的非常离谱";

    const splitIndex = getBestSplitIndex(text);

    expect(splitIndex).toBeGreaterThan(0);
    expect(text.slice(0, splitIndex).endsWith("Ap")).toBe(false);
    expect(text.slice(0, splitIndex).endsWith("AppleO")).toBe(false);
    expect(text.slice(splitIndex).startsWith("pple")).toBe(false);
    expect(text.slice(splitIndex).startsWith("ne")).toBe(false);
  });

  it("does not split immediately after a number followed by whitespace", () => {
    const text = "abcdef 1 ghijklmno";
    const numberEndIndex = text.indexOf("1 ") + 1;
    const whitespaceEndIndex = text.indexOf("1 ") + 2;

    expect(getBestSplitIndex(text)).not.toBe(numberEndIndex);
    expect(getBestSplitIndex(text)).not.toBe(whitespaceEndIndex);
  });

  it("only splits at a pause mark when both sides are substantial in smart mode", () => {
    const validText = "这是前半句足够长的说明内容部分，这也是后半句足够长的说明内容部分";
    const shortTailText = "这是前半句足够长的说明内容部分，很短";

    const validSplitIndex = getBestSplitIndex(validText, {
      requirePunctuation: true,
    });

    expect(validText.slice(0, validSplitIndex)).toContain("，");
    expect(getBestSplitIndex(shortTailText, { requirePunctuation: true })).toBe(-1);
  });

  it("lowers the priority of boundaries that land right after 的", () => {
    const text =
      "这是一个需要反复说明的，而且前半句还没有真正结束，后半句也需要足够长才能形成完整表达";

    const splitIndex = getBestSplitIndex(text, { requirePunctuation: true });

    expect(text.slice(0, splitIndex)).toBe("这是一个需要反复说明的，而且前半句还没有真正结束，");
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
