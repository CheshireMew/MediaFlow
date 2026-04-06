import { describe, expect, it } from "vitest";
import { buildSynthesisOptionsFromPreferences } from "../services/domain/synthesisExecution";
import type { SynthesisExecutionPreferences } from "../services/persistence/synthesisExecutionPreferences";

const preferences: SynthesisExecutionPreferences = {
  subtitleEnabled: true,
  watermarkEnabled: false,
  quality: "balanced",
  useGpu: false,
  lastOutputDir: null,
  subtitleStyle: {
    fontName: "Arial",
    fontSize: 24,
    fontColor: "#FFFFFF",
    isBold: false,
    isItalic: false,
    outlineSize: 2,
    shadowSize: 0,
    outlineColor: "#000000",
    bgEnabled: false,
    bgColor: "#000000",
    bgOpacity: 0.5,
    bgPadding: 5,
    alignment: 2,
    multilineAlign: "center",
    subPos: { x: 0.5, y: 0.9 },
    customPresets: [],
  },
  watermark: {
    wmScale: 0.2,
    wmOpacity: 0.8,
    wmPos: { x: 0.5, y: 0.5 },
  },
};

describe("buildSynthesisOptionsFromPreferences", () => {
  it("emits explicit subtitle bottom margin when source height is known", () => {
    const options = buildSynthesisOptionsFromPreferences(preferences, {
      videoSize: { w: 1920, h: 1080 },
    });

    expect(options.margin_v).toBe(108);
    expect("subtitle_position_y" in options).toBe(false);
  });

  it("anchors subtitles against the cropped output height when crop is enabled", () => {
    const options = buildSynthesisOptionsFromPreferences(preferences, {
      videoSize: { w: 1920, h: 1080 },
      crop: { x: 0, y: 0.1, w: 1, h: 0.8 },
    });

    expect(options.margin_v).toBe(86);
  });

  it("falls back to normalized subtitle position when source height is unavailable", () => {
    const options = buildSynthesisOptionsFromPreferences(preferences);

    expect(options.subtitle_position_y).toBe(0.9);
    expect("margin_v" in options).toBe(false);
  });
});
