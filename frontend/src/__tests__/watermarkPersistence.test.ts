import { beforeEach, describe, expect, it } from "vitest";
import {
  restoreWatermarkSnapshot,
  updateWatermarkSnapshot,
} from "../components/dialogs/synthesis/watermarkPersistence";

describe("watermarkPersistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("migrates legacy watermark keys into a snapshot and clears legacy keys", () => {
    localStorage.setItem("wm_scale", "0.35");
    localStorage.setItem("wm_opacity", "0.6");
    localStorage.setItem("wm_pos", JSON.stringify({ x: 0.8, y: 0.2 }));

    const snapshot = restoreWatermarkSnapshot();

    expect(snapshot).toEqual({
      wmScale: 0.35,
      wmOpacity: 0.6,
      wmPos: { x: 0.8, y: 0.2 },
    });
    expect(localStorage.getItem("synthesis_watermark_snapshot")).toBeTruthy();
    expect(localStorage.getItem("wm_scale")).toBeNull();
    expect(localStorage.getItem("wm_pos")).toBeNull();
  });

  it("merges partial watermark updates into the existing snapshot", () => {
    restoreWatermarkSnapshot();

    updateWatermarkSnapshot({
      wmOpacity: 0.4,
    });

    const snapshot = restoreWatermarkSnapshot();
    expect(snapshot.wmOpacity).toBe(0.4);
    expect(snapshot.wmScale).toBe(0.2);
    expect(snapshot.wmPos).toEqual({ x: 0.5, y: 0.5 });
  });
});
