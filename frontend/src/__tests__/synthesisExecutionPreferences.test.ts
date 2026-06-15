import { beforeEach, describe, expect, it } from "vitest";
import {
  restoreStoredSynthesisExecutionPreferences,
  updateStoredSynthesisExecutionPreferences,
} from "../services/persistence/synthesisExecutionPreferences";

describe("synthesisExecutionPreferences", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("uses defaults when no current execution preferences snapshot exists", () => {
    const preferences = restoreStoredSynthesisExecutionPreferences();

    expect(preferences).toMatchObject({
      subtitleEnabled: true,
      watermarkEnabled: true,
      quality: "balanced",
      useGpu: true,
      lastOutputDir: null,
      subtitleStyle: {
        fontSize: 24,
        fontColor: "#FFFFFF",
        fontName: "Arial",
      },
      watermark: {
        wmScale: 0.2,
        wmOpacity: 0.8,
        wmPos: { x: 0.5, y: 0.5 },
        hasCustomLayout: false,
      },
      crop: {
        isEnabled: false,
        crop: { x: 0, y: 0, w: 1, h: 1 },
      },
    });
    expect(localStorage.getItem("synthesis_execution_preferences")).toBeNull();
  });

  it("merges partial updates into the unified snapshot", () => {
    restoreStoredSynthesisExecutionPreferences();

    updateStoredSynthesisExecutionPreferences({
      quality: "small",
      subtitleStyle: {
        fontColor: "#00FF00",
      },
      watermark: {
        wmOpacity: 0.4,
      },
      crop: {
        isEnabled: true,
        crop: { x: 0.1, y: 0.2, w: 0.7, h: 0.6 },
      },
    });

    const preferences = restoreStoredSynthesisExecutionPreferences();

    expect(preferences.quality).toBe("small");
    expect(preferences.subtitleStyle.fontColor).toBe("#00FF00");
    expect(preferences.subtitleStyle.fontName).toBe("Arial");
    expect(preferences.watermark.wmOpacity).toBe(0.4);
    expect(preferences.watermark.wmScale).toBe(0.2);
    expect(preferences.crop).toEqual({
      isEnabled: true,
      crop: { x: 0.1, y: 0.2, w: 0.7, h: 0.6 },
    });
  });
});
