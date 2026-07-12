import { describe, expect, it } from "vitest";

import {
  getVideoExportClipDuration,
  resolveClipRenderMode,
  resolveVideoExportOutputDir,
} from "../services/domain";

describe("video export contract", () => {
  it("calculates the total selected clip duration", () => {
    expect(
      getVideoExportClipDuration({
        kind: "clips",
        segments: [
          { id: "a", start: 1.2, end: 3.7 },
          { id: "b", start: 10, end: 14 },
        ],
      }),
    ).toBeCloseTo(6.5);
  });

  it.each([
    [{ subtitleEnabled: true, watermarkEnabled: false, watermarkRef: null }, "burned"],
    [{ subtitleEnabled: false, watermarkEnabled: true, watermarkRef: { path: "D:/wm.png", name: "wm.png" } }, "burned"],
    [{ subtitleEnabled: false, watermarkEnabled: true, watermarkRef: null }, "source"],
    [{ subtitleEnabled: false, watermarkEnabled: false, watermarkRef: null }, "source"],
  ] as const)("resolves clip render mode from visible export settings", (submission, expected) => {
    expect(resolveClipRenderMode(submission)).toBe(expected);
  });

  it("uses one default output directory rule for panel and quick clip export", () => {
    expect(resolveVideoExportOutputDir("D:\\media\\demo.mp4", null, "clips")).toBe(
      "D:\\media\\demo_clips",
    );
    expect(resolveVideoExportOutputDir("D:\\media\\demo.mp4", "E:\\renders", "clips")).toBe(
      "E:\\renders",
    );
    expect(resolveVideoExportOutputDir("D:\\media\\demo.mp4", null, "full-video")).toBe(
      "D:\\media",
    );
  });
});
