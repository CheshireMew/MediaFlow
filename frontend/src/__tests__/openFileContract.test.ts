import { describe, expect, it } from "vitest";
import {
  buildHtmlFileAccept,
  buildOpenFileDialogFilters,
  fileMatchesOpenDialogProfile,
  getMediaExtensionsWithDot,
} from "../contracts/openFileContract";

describe("openFileContract", () => {
  it("keeps image extensions out of the transcriber picker", () => {
    const filters = buildOpenFileDialogFilters("transcriber-media");
    expect(filters[0].extensions).toContain("mp4");
    expect(filters[0].extensions).toContain("ts");
    expect(filters[0].extensions).toContain("mp3");
    expect(filters[0].extensions).not.toContain("jpg");
    expect(filters[0].extensions).not.toContain("png");
    expect(buildHtmlFileAccept("transcriber-media")).not.toContain(".jpg");
  });

  it("lets preprocessing accept images but not audio-only files", () => {
    const filters = buildOpenFileDialogFilters("preprocessing-media");
    expect(filters[0].extensions).toContain("png");
    expect(filters[0].extensions).toContain("mp4");
    expect(filters[0].extensions).not.toContain("mp3");
  });

  it("matches dragged files against the same profile contract", () => {
    expect(
      fileMatchesOpenDialogProfile(
        { name: "podcast.mp3", type: "audio/mpeg" },
        "transcriber-media",
      ),
    ).toBe(true);
    expect(
      fileMatchesOpenDialogProfile(
        { name: "cover.jpg", type: "image/jpeg" },
        "transcriber-media",
      ),
    ).toBe(false);
    expect(
      fileMatchesOpenDialogProfile(
        { name: "frame.png", type: "image/png" },
        "preprocessing-media",
      ),
    ).toBe(true);
    expect(
      fileMatchesOpenDialogProfile(
        { name: "podcast.mp3", type: "audio/mpeg" },
        "preprocessing-media",
      ),
    ).toBe(false);
    expect(
      fileMatchesOpenDialogProfile(
        { name: "sample.mkv", type: "" },
        "transcriber-media",
      ),
    ).toBe(true);
    expect(
      fileMatchesOpenDialogProfile(
        { name: "capture.ts", type: "" },
        "editor-media",
      ),
    ).toBe(true);
  });

  it("exposes dotted video extensions for sibling media lookups", () => {
    expect(getMediaExtensionsWithDot("video")).toEqual(
      expect.arrayContaining([".mp4", ".ts", ".mts"]),
    );
  });
});
