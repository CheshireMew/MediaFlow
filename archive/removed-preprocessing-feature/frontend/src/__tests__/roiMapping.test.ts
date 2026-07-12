import { describe, expect, it } from "vitest";
import {
  getContainedMediaRect,
  viewportRoiToMediaPixels,
} from "../hooks/preprocessing/roiMapping";

describe("preprocessing ROI mapping", () => {
  it("maps a matching 16:9 viewport directly into media pixels", () => {
    expect(
      viewportRoiToMediaPixels(
        { x: 160, y: 90, w: 320, h: 180 },
        { w: 1600, h: 900 },
        { w: 1920, h: 1080 },
      ),
    ).toEqual([192, 108, 384, 216]);
  });

  it("accounts for object-contain side bars and clips the selection", () => {
    expect(
      getContainedMediaRect(
        { w: 1600, h: 900 },
        { w: 900, h: 900 },
      ),
    ).toEqual({ x: 350, y: 0, w: 900, h: 900, scale: 1 });

    expect(
      viewportRoiToMediaPixels(
        { x: 300, y: 100, w: 200, h: 200 },
        { w: 1600, h: 900 },
        { w: 900, h: 900 },
      ),
    ).toEqual([0, 100, 150, 200]);
  });

  it("returns null when a selection is entirely inside the letterbox", () => {
    expect(
      viewportRoiToMediaPixels(
        { x: 20, y: 20, w: 100, h: 100 },
        { w: 1600, h: 900 },
        { w: 900, h: 900 },
      ),
    ).toBeNull();
  });
});
