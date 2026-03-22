import { describe, expect, it, beforeEach } from "vitest";
import {
  restoreSynthesisSettingsSnapshot,
  updateSynthesisSettingsSnapshot,
} from "../components/dialogs/synthesis/synthesisPersistence";

describe("synthesisPersistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("migrates legacy synthesis settings into a versioned snapshot and clears legacy keys", () => {
    localStorage.setItem("synthesis_subtitleEnabled", JSON.stringify(false));
    localStorage.setItem("synthesis_watermarkEnabled", JSON.stringify(true));
    localStorage.setItem("synthesis_quality", "high");
    localStorage.setItem("synthesis_use_gpu", "false");
    localStorage.setItem("synthesis_target_resolution", "1080p");
    localStorage.setItem("last_synthesis_dir", "C:\\output");

    const snapshot = restoreSynthesisSettingsSnapshot();

    expect(snapshot).toEqual({
      subtitleEnabled: false,
      watermarkEnabled: true,
      quality: "high",
      useGpu: false,
      targetResolution: "1080p",
      lastOutputDir: "C:\\output",
    });
    expect(localStorage.getItem("synthesis_settings_snapshot")).toBeTruthy();
    expect(localStorage.getItem("synthesis_subtitleEnabled")).toBeNull();
    expect(localStorage.getItem("synthesis_quality")).toBeNull();
    expect(localStorage.getItem("last_synthesis_dir")).toBeNull();
  });

  it("merges partial updates into the existing snapshot", () => {
    restoreSynthesisSettingsSnapshot();

    updateSynthesisSettingsSnapshot({
      subtitleEnabled: false,
      lastOutputDir: "D:\\renders",
    });

    const snapshot = restoreSynthesisSettingsSnapshot();
    expect(snapshot.subtitleEnabled).toBe(false);
    expect(snapshot.lastOutputDir).toBe("D:\\renders");
    expect(snapshot.quality).toBe("balanced");
    expect(snapshot.useGpu).toBe(true);
  });
});
