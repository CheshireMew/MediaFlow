import { describe, expect, it } from "vitest";
import {
  createNavigationMediaPayload,
  resolveNavigationMediaPayload,
} from "../services/ui/navigation";

describe("createNavigationMediaPayload", () => {
  it("keeps canonical refs as the only navigation media identity", () => {
    const payload = createNavigationMediaPayload({
      videoRef: {
        path: "E:/canonical/video.mp4",
        name: "video.mp4",
        type: "video/mp4",
        media_kind: "video",
        role: "source",
        origin: "navigation",
      },
      subtitleRef: {
        path: "E:/canonical/video.srt",
        name: "video.srt",
        type: "application/x-subrip",
        media_kind: "subtitle",
        role: "output",
        origin: "task",
      },
    });

    expect(payload).toEqual({
      video_ref: {
        path: "E:/canonical/video.mp4",
        name: "video.mp4",
        type: "video/mp4",
        size: undefined,
        media_id: undefined,
        media_kind: "video",
        role: "source",
        origin: "navigation",
      },
      subtitle_ref: {
        path: "E:/canonical/video.srt",
        name: "video.srt",
        type: "application/x-subrip",
        size: undefined,
        media_id: undefined,
        media_kind: "subtitle",
        role: "output",
        origin: "task",
      },
    });
  });

  it("normalizes structured media references", () => {
    const payload = createNavigationMediaPayload({
      videoRef: {
        path: "E:/video.mp4",
        name: "video.mp4",
        size: 1024,
        type: "video/mp4",
      },
      subtitleRef: { path: "E:/video.srt", name: "video.srt" },
    });

    expect(payload).toEqual({
      video_ref: {
        path: "E:/video.mp4",
        name: "video.mp4",
        size: 1024,
        type: "video/mp4",
      },
      subtitle_ref: expect.objectContaining({
        path: "E:/video.srt",
      }),
    });
  });

  it("returns null refs when references are missing", () => {
    expect(createNavigationMediaPayload({})).toEqual({
      video_ref: null,
      subtitle_ref: null,
    });
  });

  it("resolves media exclusively from refs", () => {
    const payload = createNavigationMediaPayload({
      videoRef: { path: "E:/canonical-video.mp4", name: "canonical-video.mp4" },
      subtitleRef: { path: "E:/canonical-video.srt", name: "canonical-video.srt" },
    });

    expect(resolveNavigationMediaPayload(payload)).toEqual({
      videoRef: {
        path: "E:/canonical-video.mp4",
        name: "canonical-video.mp4",
        size: undefined,
        type: undefined,
        media_id: undefined,
        media_kind: undefined,
        role: undefined,
        origin: undefined,
      },
      subtitleRef: {
        path: "E:/canonical-video.srt",
        name: "canonical-video.srt",
        size: undefined,
        type: undefined,
        media_id: undefined,
        media_kind: undefined,
        role: undefined,
        origin: undefined,
      },
    });
  });
});
