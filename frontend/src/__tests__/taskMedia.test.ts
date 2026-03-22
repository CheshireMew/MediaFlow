import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  getTaskMediaCandidates,
  hasTaskVideoMedia,
  resolveTaskMediaReferences,
  resolveTaskNavigationPayload,
} from "../services/ui/taskMedia";
import type { Task } from "../types/task";

describe("taskMedia", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("builds a navigation payload from resolved task media", async () => {
    const task: Task = {
      id: "task-1",
      type: "pipeline",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: {},
      result: {
        success: true,
        files: [
          { type: "video", path: "E:/sample.mp4" },
          { type: "subtitle", path: "E:/sample.srt" },
        ],
        meta: {},
      },
    };

    const payload = await resolveTaskNavigationPayload(task);

    expect(payload).toEqual({
      video_path: null,
      subtitle_path: null,
      video_ref: expect.objectContaining({
        path: "E:/sample.mp4",
        name: "sample.mp4",
      }),
      subtitle_ref: expect.objectContaining({
        path: "E:/sample.srt",
        name: "sample.srt",
      }),
    });
  });

  it("prefers structured task media refs over fallback path candidates", async () => {
    const task: Task = {
      id: "task-2",
      type: "pipeline",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: {
        video_ref: {
          path: "E:/canonical.mp4",
          name: "canonical.mp4",
          type: "video/mp4",
          media_kind: "video",
          role: "source",
          origin: "task",
        },
      },
      result: {
        success: true,
        files: [{ type: "video", path: "E:/stale.mp4" }],
        meta: {
          subtitle_ref: {
            path: "E:/canonical.srt",
            name: "canonical.srt",
            type: "application/x-subrip",
            media_kind: "subtitle",
            role: "output",
            origin: "task",
          },
        },
      },
    };

    const refs = await resolveTaskMediaReferences(task);
    const payload = await resolveTaskNavigationPayload(task);

    expect(refs.videoRef).toEqual({
      path: "E:/canonical.mp4",
      name: "canonical.mp4",
      type: "video/mp4",
      size: undefined,
      media_id: undefined,
      media_kind: "video",
      role: "source",
      origin: "task",
    });
    expect(refs.subtitleRef).toEqual({
      path: "E:/canonical.srt",
      name: "canonical.srt",
      type: "application/x-subrip",
      size: undefined,
      media_id: undefined,
      media_kind: "subtitle",
      role: "output",
      origin: "task",
    });
    expect(refs.contextRef).toBeNull();
    expect(refs.outputRef).toBeNull();
    expect(payload.video_ref).toEqual({
      path: "E:/canonical.mp4",
      name: "canonical.mp4",
      size: undefined,
      type: "video/mp4",
      media_id: undefined,
      media_kind: "video",
      role: "source",
      origin: "task",
    });
    expect(payload.subtitle_ref).toEqual({
      path: "E:/canonical.srt",
      name: "canonical.srt",
      size: undefined,
      type: "application/x-subrip",
      media_id: undefined,
      media_kind: "subtitle",
      role: "output",
      origin: "task",
    });
    expect(payload.video_path).toBeNull();
    expect(payload.subtitle_path).toBeNull();
  });

  it("includes explicit task media refs in candidate resolution before legacy paths", async () => {
    const task: Task = {
      id: "task-3",
      type: "translate",
      status: "running",
      progress: 10,
      created_at: Date.now(),
      request_params: {
        context_path: "E:/workspace/demo.srt",
        subtitle_ref: {
          path: "E:/canonical/demo.srt",
          name: "demo.srt",
        },
      },
    };

    const refs = await resolveTaskMediaReferences(task);

    expect(refs.subtitleRef).toEqual({
      path: "E:/canonical/demo.srt",
      name: "demo.srt",
    });
  });

  it("returns explicit context and output refs when present", async () => {
    const task: Task = {
      id: "task-5",
      type: "translate",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: {
        context_ref: {
          path: "E:/canonical/source.srt",
          name: "source.srt",
          media_kind: "subtitle",
          role: "context",
          origin: "task",
        },
      },
      result: {
        success: true,
        meta: {
          output_ref: {
            path: "E:/canonical/output.srt",
            name: "output.srt",
            media_kind: "subtitle",
            role: "output",
            origin: "task",
          },
          subtitle_ref: {
            path: "E:/canonical/output.srt",
            name: "output.srt",
          },
        },
      },
    };

    const refs = await resolveTaskMediaReferences(task);

    expect(refs.contextRef).toEqual({
      path: "E:/canonical/source.srt",
      name: "source.srt",
      size: undefined,
      type: undefined,
      media_id: undefined,
      media_kind: "subtitle",
      role: "context",
      origin: "task",
    });
    expect(refs.outputRef).toEqual({
      path: "E:/canonical/output.srt",
      name: "output.srt",
      size: undefined,
      type: undefined,
      media_id: undefined,
      media_kind: "subtitle",
      role: "output",
      origin: "task",
    });
  });

  it("does not prioritize stale path mirrors when structured subtitle refs exist", () => {
    const task: Task = {
      id: "task-6",
      type: "translate",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: {
        context_ref: {
          path: "E:/canonical/source.srt",
          name: "source.srt",
        },
        context_path: "E:/stale/source.srt",
        srt_path: "E:/stale/request-output.srt",
      },
      result: {
        success: true,
        meta: {
          subtitle_ref: {
            path: "E:/canonical/output.srt",
            name: "output.srt",
          },
          output_ref: {
            path: "E:/canonical/output.srt",
            name: "output.srt",
          },
          srt_path: "E:/stale/result-output.srt",
        },
      },
    };

    expect(getTaskMediaCandidates(task)).toEqual({
      video: [],
      subtitle: [
        "E:/canonical/output.srt",
        "E:/canonical/source.srt",
        "E:/canonical/output.srt",
      ],
      context: [],
    });
  });

  it("does not treat translation context paths as video media candidates", () => {
    const task: Task = {
      id: "task-4",
      type: "translate",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: {
        context_path: "E:/workspace/demo.srt",
        subtitle_ref: {
          path: "E:/canonical/demo.srt",
          name: "demo.srt",
        },
      },
      result: {
        success: true,
        files: [{ type: "subtitle", path: "E:/workspace/demo_CN.srt" }],
      },
    };

    expect(hasTaskVideoMedia(task)).toBe(false);
  });

  it("does not keep legacy result file_path as a dedicated context candidate", () => {
    const task: Task = {
      id: "task-7",
      type: "download",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: {},
      result: {
        success: true,
        files: [{ type: "video", path: "E:/canonical/video.mp4" }],
        meta: {
          file_path: "E:/legacy/stale-video.mp4",
        },
      },
    };

    expect(getTaskMediaCandidates(task)).toEqual({
      video: ["E:/canonical/video.mp4"],
      subtitle: [],
      context: [],
    });
  });

  it("does not treat request srt_path as a standalone subtitle identity candidate", () => {
    const task: Task = {
      id: "task-8",
      type: "synthesis",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: {
        srt_path: "E:/legacy/request-only.srt",
      },
      result: {
        success: true,
        files: [],
        meta: {},
      },
    };

    expect(getTaskMediaCandidates(task)).toEqual({
      video: [],
      subtitle: [],
      context: [],
    });
  });

  it("does not scan arbitrary request string fields for translated subtitle candidates", () => {
    const task: Task = {
      id: "task-9",
      type: "translate",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: {
        context_path: "E:/canonical/source.srt",
        translated_subtitle_path: "E:/legacy/derived-output.srt",
      },
      result: {
        success: true,
        files: [],
        meta: {},
      },
    };

    expect(getTaskMediaCandidates(task)).toEqual({
      video: [],
      subtitle: [],
      context: [],
    });
  });

  it("does not treat translation context_path as a generic subtitle candidate without refs", () => {
    const task: Task = {
      id: "task-12",
      type: "translate",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: {
        context_path: "E:/legacy/source-only.srt",
      },
      result: {
        success: true,
        files: [],
        meta: {},
      },
    };

    expect(getTaskMediaCandidates(task)).toEqual({
      video: [],
      subtitle: [],
      context: [],
    });
  });

  it("does not use meta srt_path when subtitle files already exist", () => {
    const task: Task = {
      id: "task-10",
      type: "translate",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: {},
      result: {
        success: true,
        files: [{ type: "subtitle", path: "E:/canonical/output-from-files.srt" }],
        meta: {
          srt_path: "E:/legacy/output-from-meta.srt",
        },
      },
    };

    expect(getTaskMediaCandidates(task)).toEqual({
      video: [],
      subtitle: ["E:/canonical/output-from-files.srt"],
      context: [],
    });
  });

  it("does not use meta srt_path for task snapshot subtitle recovery even on legacy-shaped tasks", () => {
    const task: Task = {
      id: "task-13",
      type: "translate",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      task_contract_normalized_from_legacy: true,
      task_contract_version: 2,
      request_params: {},
      result: {
        success: true,
        files: [],
        meta: {
          srt_path: "E:/current-contract/output-from-meta.srt",
        },
      },
    };

    expect(getTaskMediaCandidates(task)).toEqual({
      video: [],
      subtitle: [],
      context: [],
    });
  });

  it("does not keep request output_path as a context candidate when media files already exist", () => {
    const task: Task = {
      id: "task-11",
      type: "synthesis",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: {
        output_path: "E:/legacy/request-output.mp4",
      },
      result: {
        success: true,
        files: [{ type: "video", path: "E:/canonical/final-output.mp4" }],
        meta: {},
      },
    };

    expect(getTaskMediaCandidates(task)).toEqual({
      video: ["E:/canonical/final-output.mp4"],
      subtitle: [],
      context: [],
    });
  });
});
