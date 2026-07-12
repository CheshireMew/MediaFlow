import { describe, expect, it } from "vitest";
import {
  mediaReferenceFromPath,
  normalizeMediaReference,
} from "../services/ui/mediaReference";

describe("MediaReference boundary", () => {
  it("does not treat a bare path string as a structured reference", () => {
    expect(normalizeMediaReference("E:/media/demo.mp4")).toBeNull();
  });

  it("creates references explicitly at filesystem adapter boundaries", () => {
    expect(
      mediaReferenceFromPath(" E:/media/demo.mp4 ", {
        type: "video/mp4",
        origin: "file-selection",
      }),
    ).toMatchObject({
      path: "E:/media/demo.mp4",
      name: "demo.mp4",
      type: "video/mp4",
      origin: "file-selection",
    });
  });

  it("normalizes structured references without changing their identity", () => {
    expect(
      normalizeMediaReference({
        path: "E:/media/demo.srt",
        name: "demo.srt",
        media_kind: "subtitle",
      }),
    ).toMatchObject({
      path: "E:/media/demo.srt",
      name: "demo.srt",
      media_kind: "subtitle",
    });
  });
});
