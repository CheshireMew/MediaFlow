import { describe, expect, it } from "vitest";
import {
  createNavigationMediaPayload,
  resolveNavigationMediaPayload,
} from "../services/ui/navigation";

describe("createNavigationMediaPayload", () => {
  const expectResolvedNavigationMedia = (
    payload: {
      video_path?: string | null;
      subtitle_path?: string | null;
      video_ref?: { path: string; name: string } | null;
      subtitle_ref?: { path: string; name: string } | null;
    } | null | undefined,
    expected: {
      videoRef: { path: string; name: string; type?: string } | null;
      subtitleRef: { path: string; name: string; type?: string } | null;
      videoPath?: string | null;
      subtitlePath?: string | null;
    },
  ) => {
    expect(resolveNavigationMediaPayload(payload)).toEqual({
      videoPath: expected.videoPath ?? expected.videoRef?.path ?? null,
      subtitlePath: expected.subtitlePath ?? expected.subtitleRef?.path ?? null,
      videoRef:
        expected.videoRef
          ? {
              path: expected.videoRef.path,
              name: expected.videoRef.name,
              size: undefined,
              type: expected.videoRef.type,
              media_id: undefined,
              media_kind: undefined,
              role: undefined,
              origin: undefined,
            }
          : null,
      subtitleRef:
        expected.subtitleRef
          ? {
              path: expected.subtitleRef.path,
              name: expected.subtitleRef.name,
              size: undefined,
              type: expected.subtitleRef.type,
              media_id: undefined,
              media_kind: undefined,
              role: undefined,
              origin: undefined,
            }
          : null,
    });
  };

  it("keeps canonical refs separate from legacy path fields", () => {
    const payload = createNavigationMediaPayload({
      videoPath: "E:/workspace/video.mp4",
      subtitlePath: "E:/workspace/video.srt",
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

    expect(payload.video_ref).toEqual({
      path: "E:/canonical/video.mp4",
      name: "video.mp4",
      type: "video/mp4",
      size: undefined,
      media_id: undefined,
      media_kind: "video",
      role: "source",
      origin: "navigation",
    });
    expect(payload.subtitle_ref).toEqual({
      path: "E:/canonical/video.srt",
      name: "video.srt",
      type: "application/x-subrip",
      size: undefined,
      media_id: undefined,
      media_kind: "subtitle",
      role: "output",
      origin: "task",
    });
    expect(payload.video_path).toBeNull();
    expect(payload.subtitle_path).toBeNull();
  });

  it("builds structured media references without retaining legacy path mirrors", () => {
    const payload = createNavigationMediaPayload({
      videoPath: "E:/video.mp4",
      subtitlePath: "E:/video.srt",
      videoMeta: {
        name: "video.mp4",
        size: 1024,
        type: "video/mp4",
      },
    });

    expect(payload).toEqual({
      video_path: null,
      subtitle_path: null,
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

  it("returns null refs when the source paths are missing", () => {
    expect(createNavigationMediaPayload({})).toEqual({
      video_path: null,
      subtitle_path: null,
      video_ref: null,
      subtitle_ref: null,
    });
  });

  it("supports ref-only navigation payloads without legacy paths", () => {
    const payload = createNavigationMediaPayload({
      videoRef: { path: "E:/canonical-video.mp4", name: "canonical-video.mp4" },
      subtitleRef: { path: "E:/canonical-video.srt", name: "canonical-video.srt" },
    });

    expect(payload).toEqual({
      video_path: null,
      subtitle_path: null,
      video_ref: { path: "E:/canonical-video.mp4", name: "canonical-video.mp4" },
      subtitle_ref: { path: "E:/canonical-video.srt", name: "canonical-video.srt" },
    });
    expectResolvedNavigationMedia(payload, {
      videoRef: {
        path: "E:/canonical-video.mp4",
        name: "canonical-video.mp4",
      },
      subtitleRef: {
        path: "E:/canonical-video.srt",
        name: "canonical-video.srt",
      },
    });
  });

  it("drops legacy path mirrors when structured refs already exist", () => {
    const payload = createNavigationMediaPayload({
      videoPath: "E:/workspace/video.mp4",
      subtitlePath: "E:/workspace/video.srt",
      videoRef: { path: "E:/canonical/video.mp4", name: "video.mp4" },
      subtitleRef: { path: "E:/canonical/video.srt", name: "video.srt" },
    });

    expect(payload).toEqual({
      video_path: null,
      subtitle_path: null,
      video_ref: { path: "E:/canonical/video.mp4", name: "video.mp4" },
      subtitle_ref: { path: "E:/canonical/video.srt", name: "video.srt" },
    });
  });

  it("resolves media refs before falling back to legacy path fields", () => {
    expectResolvedNavigationMedia(
      {
        video_path: "E:/legacy-video.mp4",
        subtitle_path: "E:/legacy-video.srt",
        video_ref: { path: "E:/canonical-video.mp4", name: "canonical-video.mp4" },
        subtitle_ref: { path: "E:/canonical-video.srt", name: "canonical-video.srt" },
      },
      {
        videoRef: {
          path: "E:/canonical-video.mp4",
          name: "canonical-video.mp4",
        },
        subtitleRef: {
          path: "E:/canonical-video.srt",
          name: "canonical-video.srt",
        },
      },
    );
  });

  it("still resolves legacy path-only payloads when structured refs are missing", () => {
    expectResolvedNavigationMedia(
      {
        video_path: "E:/legacy-video.mp4",
        subtitle_path: "E:/legacy-video.srt",
      },
      {
        videoRef: null,
        subtitleRef: null,
        videoPath: "E:/legacy-video.mp4",
        subtitlePath: "E:/legacy-video.srt",
      },
    );
  });
});
