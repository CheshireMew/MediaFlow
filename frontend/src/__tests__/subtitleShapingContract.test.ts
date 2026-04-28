import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { shapeSubtitleText } from "../components/dialogs/synthesis/textShaper";

type SubtitleShapingCase = {
  name: string;
  inputLines: string[];
  maxWidthPx: number;
  fontSize: number;
  fontFamily?: string;
  fontMeasure?: Record<string, number>;
  expectedLines: string[];
};

const cases = JSON.parse(
  readFileSync(
    path.resolve(process.cwd(), "..", "contracts", "subtitle-shaping-cases.json"),
    "utf-8",
  ),
) as SubtitleShapingCase[];

describe("subtitle shaping contract", () => {
  test.each(cases)("$name", (testCase) => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    if (testCase.fontFamily && testCase.fontMeasure) {
      HTMLCanvasElement.prototype.getContext = (() =>
        ({
          font: "",
          measureText: (text: string) => ({
            width: Array.from(text).reduce(
              (sum, ch) =>
                sum + (testCase.fontMeasure?.[ch] ?? testCase.fontMeasure?.default ?? 0),
              0,
            ),
          }),
        }) as unknown as CanvasRenderingContext2D) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    }

    try {
      const shaped = shapeSubtitleText(
        testCase.inputLines.join("\n"),
        testCase.maxWidthPx,
        testCase.fontSize,
        testCase.fontFamily ? { fontFamily: testCase.fontFamily } : undefined,
      );
      expect(shaped.split("\n")).toEqual(testCase.expectedLines);
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
  });
});
