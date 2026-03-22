import { beforeEach, describe, expect, it } from "vitest";
import {
  restoreSubtitleStyleSnapshot,
  updateSubtitleStyleSnapshot,
} from "../components/dialogs/synthesis/subtitleStylePersistence";

describe("subtitleStylePersistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("migrates legacy subtitle style keys into a snapshot and clears legacy keys", () => {
    localStorage.setItem("sub_fontName", "Microsoft YaHei");
    localStorage.setItem("sub_bold", "true");
    localStorage.setItem("sub_outline", "3");
    localStorage.setItem("sub_bgOpacity", "0.7");
    localStorage.setItem("sub_multilineAlign", "top");
    localStorage.setItem("sub_pos", JSON.stringify({ x: 0.4, y: 0.8 }));
    localStorage.setItem(
      "sub_customPresets",
      JSON.stringify([
        {
          label: "My Preset",
          fontName: "Arial",
          fontSize: 26,
          fontColor: "#FFFFFF",
          bold: false,
          italic: false,
          outline: 2,
          shadow: 0,
          outlineColor: "#000000",
          bgEnabled: false,
          bgColor: "#000000",
          bgOpacity: 0.5,
          bgPadding: 5,
        },
      ]),
    );

    const snapshot = restoreSubtitleStyleSnapshot();

    expect(snapshot.fontName).toBe("Microsoft YaHei");
    expect(snapshot.isBold).toBe(true);
    expect(snapshot.outlineSize).toBe(3);
    expect(snapshot.bgOpacity).toBe(0.7);
    expect(snapshot.multilineAlign).toBe("top");
    expect(snapshot.subPos).toEqual({ x: 0.4, y: 0.8 });
    expect(snapshot.customPresets).toHaveLength(1);
    expect(localStorage.getItem("synthesis_subtitle_style_snapshot")).toBeTruthy();
    expect(localStorage.getItem("sub_fontName")).toBeNull();
    expect(localStorage.getItem("sub_customPresets")).toBeNull();
  });

  it("merges partial subtitle style updates into the existing snapshot", () => {
    restoreSubtitleStyleSnapshot();

    updateSubtitleStyleSnapshot({
      fontColor: "#FF0000",
      customPresets: [],
      subPos: { x: 0.25, y: 0.75 },
    });

    const snapshot = restoreSubtitleStyleSnapshot();
    expect(snapshot.fontColor).toBe("#FF0000");
    expect(snapshot.subPos).toEqual({ x: 0.25, y: 0.75 });
    expect(snapshot.fontName).toBe("Arial");
  });
});
