import { beforeEach, describe, expect, it } from "vitest";

import {
  readPendingMediaNavigation,
  writePendingMediaNavigation,
} from "../services/ui/pendingMediaNavigation";

describe("pendingMediaNavigation", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("normalizes path-only payloads into ref-first session storage", () => {
    writePendingMediaNavigation({
      target: "editor",
      video_path: "E:/workspace/video.mp4",
      subtitle_path: "E:/workspace/video.srt",
    });

    expect(JSON.parse(sessionStorage.getItem("mediaflow:pending_file") || "null")).toEqual({
      target: "editor",
      video_path: null,
      subtitle_path: null,
      video_ref: {
        path: "E:/workspace/video.mp4",
        name: "video.mp4",
      },
      subtitle_ref: {
        path: "E:/workspace/video.srt",
        name: "video.srt",
      },
    });
  });

  it("ignores legacy path-only session payloads when reading", () => {
    sessionStorage.setItem(
      "mediaflow:pending_file",
      JSON.stringify({
        target: "translator",
        video_path: "E:/workspace/video.mp4",
        subtitle_path: "E:/workspace/video.srt",
      }),
    );

    expect(readPendingMediaNavigation()).toBeNull();
  });
});
