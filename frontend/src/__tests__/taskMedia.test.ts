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
      request_params: { steps: [] },
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
      request_params: { steps: [] },
      result: {
        success: true,
        artifacts: [artifact("subtitle", "output", "E:/canonical.srt", "canonical.srt")],
        outputs: {},
      },
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

  it("resolves candidate media from task artifacts", async () => {
    const task: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "task-3",
      type: "pipeline",
      status: "running",
      progress: 10,
      created_at: Date.now(),
      request_params: { steps: [] },
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
      type: "pipeline",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: { steps: [] },
      result: {
        success: true,
        artifacts: [artifact("subtitle", "output", "E:/canonical/output.srt", "output.srt")],
        outputs: {},
      },
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
      type: "pipeline",
      primary_operation: "synthesis",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: { steps: [] },
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
      type: "pipeline",
      primary_operation: "synthesis",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: { steps: [] },
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
    });
    expect(getTaskMediaCandidates(task).output).toEqual([
      "E:/renders/source_synthesized.mp4",
      "E:/source/source.srt",
    ]);
  });

  it("builds translation candidates exclusively from published artifacts", () => {
    const task: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "task-6",
      type: "pipeline",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: { steps: [] },
      result: {
        success: true,
        artifacts: [artifact("subtitle", "output", "E:/canonical/output.srt", "output.srt")],
        outputs: {},
      },
      artifacts: [
        artifact("subtitle", "output", "E:/canonical/output.srt", "output.srt"),
        artifact("subtitle", "context", "E:/canonical/source.srt", "source.srt"),
      ],
    };

    expect(getTaskMediaCandidates(task)).toEqual({
      video: [],
      subtitle: [
        "E:/canonical/output.srt",
        "E:/canonical/source.srt",
      ],
      context: ["E:/canonical/source.srt"],
      output: ["E:/canonical/output.srt"],
    });
  });

  it("does not classify subtitle artifacts as video media", () => {
    const task: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "task-4",
      type: "pipeline",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: { steps: [] },
      result: {
        success: true,
        artifacts: [artifact("subtitle", "output", "E:/canonical/demo_ZH-CN.srt", "demo_ZH-CN.srt")],
        outputs: {},
      },
      artifacts: [artifact("subtitle", "output", "E:/canonical/demo_ZH-CN.srt", "demo_ZH-CN.srt")],
    };

    expect(hasTaskVideoMedia(task)).toBe(false);
  });

  it("uses a download output artifact as the only media candidate", () => {
    const task: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "task-7",
      type: "pipeline",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: { steps: [] },
      result: {
        success: true,
        artifacts: [artifact("video", "output", "E:/canonical/video.mp4", "video.mp4")],
        outputs: {},
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

  it("returns no candidates for a task without artifacts", () => {
    const task: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "task-8",
      type: "pipeline",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: { steps: [] },
      result: {
        success: true,
        artifacts: [],
        outputs: {},
      },
    };

    expect(getTaskMediaCandidates(task)).toEqual({
      video: [],
      subtitle: [],
      context: [],
      output: [],
    });
  });

  it("does not treat non-media request metadata as task media", () => {
    const task: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "task-9",
      type: "pipeline",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: {
        steps: [{ step_name: "translate", params: { mode: "standard" } }],
      },
      result: {
        success: true,
        artifacts: [],
        outputs: {},
      },
    };

    expect(getTaskMediaCandidates(task)).toEqual({
      video: [],
      subtitle: [],
      context: [],
      output: [],
    });
  });

  it("keeps an empty translation task free of synthetic media", () => {
    const task: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "task-12",
      type: "pipeline",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: { steps: [] },
      result: {
        success: true,
        artifacts: [],
        outputs: {},
      },
    };

    expect(getTaskMediaCandidates(task)).toEqual({
      video: [],
      subtitle: [],
      context: [],
      output: [],
    });
  });

  it("uses the published subtitle output artifact", () => {
    const task: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "task-10",
      type: "pipeline",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: { steps: [] },
      result: {
        success: true,
        artifacts: [artifact("subtitle", "output", "E:/canonical/output.srt", "output.srt")],
        outputs: {},
      },
      artifacts: [
        artifact("subtitle", "output", "E:/canonical/output.srt", "output.srt"),
      ],
    };

    expect(getTaskMediaCandidates(task)).toEqual({
      video: [],
      subtitle: ["E:/canonical/output.srt"],
      context: [],
      output: ["E:/canonical/output.srt"],
    });
  });

  it("does not turn ordinary task metadata into media candidates", () => {
    const task: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "task-13",
      type: "pipeline",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      task_contract_version: 2,
      request_params: { steps: [] },
      result: {
        success: true,
        artifacts: [],
        outputs: {
          transcription: {
            task_id: "task-13",
            language: "en",
            duration: 1,
            segments: [],
            text: "",
          },
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

  it("uses the published video output artifact", () => {
    const task: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "task-11",
      type: "pipeline",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: { steps: [] },
      result: {
        success: true,
        artifacts: [artifact("video", "output", "E:/canonical/final-output.mp4", "final-output.mp4")],
        outputs: {},
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
