import { describe, expect, it, vi, beforeEach } from "vitest";
import { BACKEND_TASK_CONTRACT_FIELDS } from "./testFixtures";
import {
  getTaskMediaCandidates,
  hasTaskVideoMedia,
  resolveTaskMediaReferences,
  resolveTaskMediaPaths,
  resolveTaskOutputPath,
  resolveTaskNavigationPayload,
} from "../services/ui/taskMedia";
import type { Task, TaskArtifact } from "../types/task";

const artifact = (
  kind: "video" | "audio" | "subtitle" | "image" | "file",
  role: "input" | "output" | "context",
  path: string,
  name: string,
  extra: Partial<TaskArtifact["ref"]> = {},
): TaskArtifact => ({
  kind,
  role,
  ref: {
    path,
    name,
    ...extra,
  },
});

describe("taskMedia", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("builds a navigation payload from resolved task media", async () => {
    const task: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "task-1",
      type: "pipeline",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: {},
      artifacts: [
        artifact("video", "output", "E:/sample.mp4", "sample.mp4"),
        artifact("subtitle", "output", "E:/sample.srt", "sample.srt"),
      ],
    };

    const payload = await resolveTaskNavigationPayload(task);

    expect(payload).toEqual({
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

  it("uses structured task media refs as the task media identity", async () => {
    const task: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "task-2",
      type: "pipeline",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: {},
      result: { success: true, files: [{ type: "video", path: "E:/stale.mp4" }] },
      artifacts: [
        artifact("video", "input", "E:/canonical.mp4", "canonical.mp4", {
          type: "video/mp4",
          media_kind: "video",
          role: "input",
          origin: "task",
        }),
        artifact("subtitle", "output", "E:/canonical.srt", "canonical.srt", {
          type: "application/x-subrip",
          media_kind: "subtitle",
          role: "output",
          origin: "task",
        }),
      ],
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
      role: "input",
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
    expect(refs.outputRef).toEqual({
      path: "E:/canonical.srt",
      name: "canonical.srt",
      type: "application/x-subrip",
      size: undefined,
      media_id: undefined,
      media_kind: "subtitle",
      role: "output",
      origin: "task",
    });
    expect(payload.video_ref).toEqual({
      path: "E:/canonical.mp4",
      name: "canonical.mp4",
      size: undefined,
      type: "video/mp4",
      media_id: undefined,
      media_kind: "video",
      role: "input",
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
  });

  it("includes explicit task media refs in candidate resolution before path fields", async () => {
    const task: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "task-3",
      type: "translate",
      status: "running",
      progress: 10,
      created_at: Date.now(),
      request_params: { context_path: "E:/workspace/demo.srt" },
      artifacts: [artifact("subtitle", "input", "E:/canonical/demo.srt", "demo.srt")],
    };

    const refs = await resolveTaskMediaReferences(task);

    expect(refs.subtitleRef).toEqual({
      path: "E:/canonical/demo.srt",
      name: "demo.srt",
    });
  });

  it("returns explicit context and output refs when present", async () => {
    const task: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "task-5",
      type: "translate",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: {},
      result: { success: true, meta: {} },
      artifacts: [
        artifact("subtitle", "context", "E:/canonical/source.srt", "source.srt", {
          media_kind: "subtitle",
          role: "context",
          origin: "task",
        }),
        artifact("subtitle", "output", "E:/canonical/output.srt", "output.srt", {
          media_kind: "subtitle",
          role: "output",
          origin: "task",
        }),
      ],
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

  it("resolves synthesis folder actions to the output video instead of the source video", async () => {
    const task: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "task-synthesis-output",
      type: "synthesis",
      primary_operation: "synthesis",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: {},
      artifacts: [
        artifact("video", "input", "E:/source/source.mp4", "source.mp4"),
        artifact("subtitle", "input", "E:/source/source.srt", "source.srt"),
        artifact("video", "output", "E:/renders/source_synthesized.mp4", "source_synthesized.mp4"),
      ],
    };

    await expect(resolveTaskOutputPath(task)).resolves.toBe("E:/renders/source_synthesized.mp4");
    await expect(resolveTaskMediaPaths(task)).resolves.toMatchObject({
      outputPath: "E:/renders/source_synthesized.mp4",
      videoPath: "E:/renders/source_synthesized.mp4",
    });
  });

  it("keeps synthesis output video ahead of an incorrectly output-role subtitle artifact", async () => {
    const task: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "task-synthesis-subtitle-output",
      type: "synthesis",
      primary_operation: "synthesis",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: {},
      artifacts: [
        artifact("video", "input", "E:/source/source.mp4", "source.mp4"),
        artifact("subtitle", "output", "E:/source/source.srt", "source.srt"),
        artifact("video", "output", "E:/renders/source_synthesized.mp4", "source_synthesized.mp4"),
      ],
    };

    await expect(resolveTaskOutputPath(task)).resolves.toBe("E:/renders/source_synthesized.mp4");
    await expect(resolveTaskMediaReferences(task)).resolves.toMatchObject({
      outputRef: {
        path: "E:/renders/source_synthesized.mp4",
      },
      outputPath: "E:/renders/source_synthesized.mp4",
    });
    expect(getTaskMediaCandidates(task).output).toEqual([
      "E:/renders/source_synthesized.mp4",
      "E:/source/source.srt",
    ]);
  });

  it("does not prioritize stale path fields when structured subtitle refs exist", () => {
    const task: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
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
      result: { success: true, meta: { srt_path: "E:/stale/result-output.srt" } },
      artifacts: [
        artifact("subtitle", "output", "E:/canonical/output.srt", "output.srt"),
        artifact("subtitle", "context", "E:/canonical/source.srt", "source.srt"),
        artifact("subtitle", "output", "E:/canonical/output.srt", "output.srt"),
      ],
    };

    expect(getTaskMediaCandidates(task)).toEqual({
      video: [],
      subtitle: [
        "E:/canonical/output.srt",
        "E:/canonical/output.srt",
        "E:/canonical/source.srt",
      ],
      context: ["E:/canonical/source.srt"],
      output: ["E:/canonical/output.srt", "E:/canonical/output.srt"],
    });
  });

  it("does not treat translation context paths as video media candidates", () => {
    const task: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
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
        files: [{ type: "subtitle", path: "E:/workspace/demo_ZH-CN.srt" }],
      },
    };

    expect(hasTaskVideoMedia(task)).toBe(false);
  });

  it("does not keep stale result file_path as a dedicated context candidate", () => {
    const task: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "task-7",
      type: "download",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: {},
      result: {
        success: true,
        meta: {
          file_path: "E:/stale/stale-video.mp4",
        },
      },
      artifacts: [artifact("video", "output", "E:/canonical/video.mp4", "video.mp4")],
    };

    expect(getTaskMediaCandidates(task)).toEqual({
      video: ["E:/canonical/video.mp4"],
      subtitle: [],
      context: [],
      output: ["E:/canonical/video.mp4"],
    });
  });

  it("does not treat request srt_path as a standalone subtitle identity candidate", () => {
    const task: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "task-8",
      type: "synthesis",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: {
        srt_path: "E:/stale/request-only.srt",
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
      output: [],
    });
  });

  it("does not scan arbitrary request string fields for translated subtitle candidates", () => {
    const task: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "task-9",
      type: "translate",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: {
        context_path: "E:/canonical/source.srt",
        translated_subtitle_path: "E:/stale/derived-output.srt",
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
      output: [],
    });
  });

  it("does not treat translation context_path as a generic subtitle candidate without refs", () => {
    const task: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "task-12",
      type: "translate",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: {
        context_path: "E:/stale/source-only.srt",
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
      output: [],
    });
  });

  it("does not use meta srt_path when subtitle files already exist", () => {
    const task: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "task-10",
      type: "translate",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: {},
      result: {
        success: true,
        meta: {
          srt_path: "E:/stale/output-from-meta.srt",
        },
      },
      artifacts: [
        artifact("subtitle", "output", "E:/canonical/output-from-files.srt", "output-from-files.srt"),
      ],
    };

    expect(getTaskMediaCandidates(task)).toEqual({
      video: [],
      subtitle: ["E:/canonical/output-from-files.srt"],
      context: [],
      output: ["E:/canonical/output-from-files.srt"],
    });
  });

  it("does not use meta srt_path for task snapshot subtitle recovery on path-mirror-shaped tasks", () => {
    const task: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "task-13",
      type: "translate",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
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
      output: [],
    });
  });

  it("does not keep request output_path as a context candidate when media files already exist", () => {
    const task: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "task-11",
      type: "synthesis",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: {
        output_path: "E:/stale/request-output.mp4",
      },
      result: {
        success: true,
        meta: {},
      },
      artifacts: [
        artifact("video", "output", "E:/canonical/final-output.mp4", "final-output.mp4"),
      ],
    };

    expect(getTaskMediaCandidates(task)).toEqual({
      video: ["E:/canonical/final-output.mp4"],
      subtitle: [],
      context: [],
      output: ["E:/canonical/final-output.mp4"],
    });
  });
});
