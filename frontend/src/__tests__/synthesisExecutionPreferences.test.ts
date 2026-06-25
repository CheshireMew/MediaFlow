import { beforeEach, describe, expect, it } from "vitest";
import {
  restoreStoredSynthesisExecutionPreferences,
  updateStoredSynthesisExecutionPreferences,
} from "../services/persistence/synthesisExecutionPreferences";
import { writeUiStateValue } from "../services/persistence/uiStateSettings";

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
    });

    const preferences = restoreStoredSynthesisExecutionPreferences();

    expect(preferences.quality).toBe("small");
    expect(preferences.subtitleStyle.fontColor).toBe("#00FF00");
    expect(preferences.subtitleStyle.fontName).toBe("Arial");
    expect(preferences.watermark.wmOpacity).toBe(0.4);
    expect(preferences.watermark.wmScale).toBe(0.2);
    expect("crop" in preferences).toBe(false);
  });

  it("ignores crop values from older unified snapshots", () => {
    writeUiStateValue(
      "synthesis_execution_preferences",
      JSON.stringify({
        schema_version: 1,
        payload: {
          subtitleEnabled: true,
          watermarkEnabled: true,
          quality: "small",
          useGpu: true,
          lastOutputDir: null,
          crop: {
            isEnabled: true,
            crop: { x: 0.1, y: 0.2, w: 0.7, h: 0.6 },
          },
        },
      }),
    );

    const preferences = restoreStoredSynthesisExecutionPreferences();

    expect(preferences.quality).toBe("small");
    expect("crop" in preferences).toBe(false);
  });
});
