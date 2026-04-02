import { beforeEach, describe, expect, it } from "vitest";
import {
  restoreStoredSynthesisExecutionPreferences,
  updateStoredSynthesisExecutionPreferences,
} from "../services/persistence/synthesisExecutionPreferences";

describe("synthesisExecutionPreferences", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("migrates the legacy synthesis snapshots into the unified execution preferences", () => {
    localStorage.setItem(
      "synthesis_settings_snapshot",
      JSON.stringify({
        schema_version: 1,
        payload: {
          subtitleEnabled: false,
          watermarkEnabled: true,
          quality: "high",
          useGpu: false,
          lastOutputDir: "C:/renders",
        },
      }),
    );
    localStorage.setItem(
      "synthesis_subtitle_style_snapshot",
      JSON.stringify({
        schema_version: 1,
        payload: {
          fontSize: 26,
          fontColor: "#FF0000",
          fontName: "Microsoft YaHei",
          isBold: true,
          isItalic: false,
          outlineSize: 3,
          shadowSize: 1,
          outlineColor: "#000000",
          bgEnabled: true,
          bgColor: "#111111",
          bgOpacity: 0.6,
          bgPadding: 8,
          alignment: 2,
          multilineAlign: "top",
          subPos: { x: 0.4, y: 0.8 },
          customPresets: [{ label: "Preset", fontName: "Arial", fontSize: 24 }],
        },
      }),
    );
    localStorage.setItem(
      "synthesis_watermark_snapshot",
      JSON.stringify({
        schema_version: 1,
        payload: {
          wmScale: 0.35,
          wmOpacity: 0.6,
          wmPos: { x: 0.8, y: 0.2 },
        },
      }),
    );

    const preferences = restoreStoredSynthesisExecutionPreferences();

    expect(preferences).toMatchObject({
      subtitleEnabled: false,
      watermarkEnabled: true,
      quality: "high",
      useGpu: false,
      lastOutputDir: "C:/renders",
      subtitleStyle: {
        fontSize: 26,
        fontColor: "#FF0000",
        fontName: "Microsoft YaHei",
        subPos: { x: 0.4, y: 0.8 },
      },
      watermark: {
        wmScale: 0.35,
        wmOpacity: 0.6,
        wmPos: { x: 0.8, y: 0.2 },
      },
    });
    expect(localStorage.getItem("synthesis_execution_preferences")).toBeTruthy();
    expect(localStorage.getItem("synthesis_settings_snapshot")).toBeNull();
    expect(localStorage.getItem("synthesis_subtitle_style_snapshot")).toBeNull();
    expect(localStorage.getItem("synthesis_watermark_snapshot")).toBeNull();
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
  });
});
