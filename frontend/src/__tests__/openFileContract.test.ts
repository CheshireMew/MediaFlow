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

  it("owns subtitle extensions in the generic file-dialog profile contract", () => {
    const filters = buildOpenFileDialogFilters("subtitle");

    expect(filters).toEqual([
      {
        name: "Subtitle Files",
        extensions: ["srt", "vtt", "ass", "ssa", "txt", "sub", "sbv", "lrc"],
      },
      { name: "All Files", extensions: ["*"] },
    ]);
    expect(buildHtmlFileAccept("subtitle")).toBe(
      ".srt,.vtt,.ass,.ssa,.txt,.sub,.sbv,.lrc",
    );
    expect(
      fileMatchesOpenDialogProfile({ name: "captions.SRT" }, "subtitle"),
    ).toBe(true);
    expect(
      fileMatchesOpenDialogProfile({ name: "movie.mp4" }, "subtitle"),
    ).toBe(false);
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
