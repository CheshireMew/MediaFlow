import { describe, expect, it } from "vitest";
import {
  findActiveTranscribeTask,
  findActiveTranslationTask,
  findCompletedTranscribeTask,
  findCompletedTranslationTask,
  getTranslationTaskMediaRefs,
  mapTaskToTranscribeResult,
} from "../hooks/tasks/taskSelectors";
import type { Task } from "../types/task";

describe("taskSelectors transcribe media matching", () => {
  it("matches an active transcribe task using unified task media candidates", () => {
    const task: Task = {
      id: "task-1",
      type: "pipeline",
      status: "running",
      progress: 10,
      created_at: Date.now(),
      request_params: {
        steps: [{ step_name: "transcribe" }],
      },
      result: {
        files: [{ type: "audio", path: "E:/sample.mp4" }],
      },
    };

    expect(findActiveTranscribeTask([task], null, "E:/sample.mp4")?.id).toBe("task-1");
  });

  it("prefers explicit audio refs over legacy audio_path when matching active transcribe tasks", () => {
    const task: Task = {
      id: "task-1-ref",
      type: "pipeline",
      status: "running",
      progress: 10,
      created_at: Date.now(),
      request_params: {
        steps: [
          {
            step_name: "transcribe",
            params: {
              audio_path: "E:/workspace/stale.mp4",
              audio_ref: {
                path: "E:/canonical/sample.mp4",
                name: "sample.mp4",
              },
            },
          },
        ],
      },
    };

    expect(
      findActiveTranscribeTask(
        [task],
        { path: "E:/canonical/sample.mp4", name: "sample.mp4" },
        "E:/workspace/stale.mp4",
      )?.id,
    ).toBe("task-1-ref");
  });

  it("does not fall back to stale audio_path when transcribe refs disagree", () => {
    const task: Task = {
      id: "task-1-ref-mismatch",
      type: "pipeline",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: {
        steps: [
          {
            step_name: "transcribe",
            params: {
              audio_path: "E:/workspace/stale.mp4",
              audio_ref: {
                path: "E:/canonical/sample.mp4",
                name: "sample.mp4",
              },
            },
          },
        ],
      },
      result: {
        meta: {
          transcript: "hello",
        },
      },
    };

    expect(
      mapTaskToTranscribeResult(
        task,
        { path: "E:/another/input.mp4", name: "input.mp4" },
        "E:/workspace/stale.mp4",
      )?.video_ref,
    ).toEqual({
      path: "E:/canonical/sample.mp4",
      name: "sample.mp4",
    });
  });

  it("falls back to task media candidates when mapping a completed result without an explicit file path", () => {
    const task: Task = {
      id: "task-2",
      type: "pipeline",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: {
        steps: [{ step_name: "transcribe" }],
      },
      result: {
        files: [
          { type: "audio", path: "E:/sample.mp4" },
          { type: "subtitle", path: "E:/sample.srt" },
        ],
        meta: {
          transcript: "hello",
          segments: [{ id: "1", start: 0, end: 1, text: "hello" }],
        },
      },
    };

    expect(mapTaskToTranscribeResult(task, null, null)).toEqual({
      segments: [{ id: "1", start: 0, end: 1, text: "hello" }],
      text: "hello",
      language: "auto",
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

  it("does not match a completed transcribe task from stale path mirrors when a ref is present", () => {
    const task: Task = {
      id: "task-completed-ref",
      type: "pipeline",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: {
        steps: [
          {
            step_name: "transcribe",
            params: {
              audio_path: "E:/workspace/stale.mp4",
              audio_ref: {
                path: "E:/canonical/sample.mp4",
                name: "sample.mp4",
              },
            },
          },
        ],
      },
    };

    expect(
      findCompletedTranscribeTask(
        [task],
        { path: "E:/another/input.mp4", name: "input.mp4" },
        "E:/workspace/stale.mp4",
      ),
    ).toBeUndefined();
  });

  it("matches an active translation task using unified subtitle media candidates", () => {
    const task: Task = {
      id: "task-translate",
      type: "translate",
      status: "running",
      progress: 15,
      created_at: Date.now(),
      request_params: {
        context_path: "E:/subs/demo.srt",
        context_ref: {
          path: "E:/subs/demo.srt",
          name: "demo.srt",
        },
        mode: "standard",
      },
    };

    expect(findActiveTranslationTask([task], null, "E:/subs/demo.srt")?.id).toBe(
      "task-translate",
    );
  });

  it("prefers explicit media refs when matching translation tasks and mapping transcribe results", () => {
    const translateTask: Task = {
      id: "task-translate-ref",
      type: "translate",
      status: "running",
      progress: 15,
      created_at: Date.now(),
      request_params: {
        context_path: "E:/workspace/demo.srt",
        subtitle_ref: {
          path: "E:/canonical/demo.srt",
          name: "demo.srt",
        },
        mode: "standard",
      },
    };

    const transcribeTask: Task = {
      id: "task-transcribe-ref",
      type: "pipeline",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: {
        steps: [{ step_name: "transcribe" }],
        video_ref: {
          path: "E:/canonical/sample.mp4",
          name: "sample.mp4",
        },
      },
      result: {
        files: [{ type: "subtitle", path: "E:/sample.srt" }],
        meta: {
          transcript: "hello",
        },
      },
    };

    expect(
      findActiveTranslationTask(
        [translateTask],
        { path: "E:/canonical/demo.srt", name: "demo.srt" },
        "E:/workspace/demo.srt",
      )?.id,
    ).toBe(
      "task-translate-ref",
    );
    expect(mapTaskToTranscribeResult(transcribeTask, null, null)).toEqual(
      expect.objectContaining({
        video_ref: {
          path: "E:/canonical/sample.mp4",
          name: "sample.mp4",
        },
      }),
    );
  });

  it("distinguishes translation context refs from output refs", () => {
    const task: Task = {
      id: "task-translate-refs",
      type: "translate",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: {
        context_ref: {
          path: "E:/canonical/source.srt",
          name: "source.srt",
        },
      },
      result: {
        meta: {
          subtitle_ref: {
            path: "E:/canonical/output.srt",
            name: "output.srt",
          },
          output_ref: {
            path: "E:/canonical/output.srt",
            name: "output.srt",
          },
        },
      },
    };

    expect(getTranslationTaskMediaRefs(task)).toEqual({
      sourceSubtitleRef: {
        path: "E:/canonical/source.srt",
        name: "source.srt",
        size: undefined,
        type: undefined,
        media_id: undefined,
        media_kind: undefined,
        role: undefined,
        origin: undefined,
      },
      targetSubtitleRef: {
        path: "E:/canonical/output.srt",
        name: "output.srt",
        size: undefined,
        type: undefined,
        media_id: undefined,
        media_kind: undefined,
        role: undefined,
        origin: undefined,
      },
    });
  });

  it("does not fall back to stale path candidates when translation refs disagree", () => {
    const task: Task = {
      id: "task-translate-mismatch",
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
      },
      result: {
        meta: {
          subtitle_ref: {
            path: "E:/canonical/output.srt",
            name: "output.srt",
          },
        },
      },
    };

    expect(
      findCompletedTranslationTask(
        [task],
        { path: "E:/another/source.srt", name: "source.srt" },
        "E:/stale/source.srt",
      ),
    ).toBeUndefined();
  });

  it("no longer recovers translation targets from meta srt_path alone", () => {
    const task: Task = {
      id: "task-translate-legacy-paths",
      type: "translate",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: {
        context_path: "E:/legacy/source.srt",
      },
      result: {
        meta: {
          srt_path: "E:/legacy/output.srt",
        },
      },
    };

    expect(getTranslationTaskMediaRefs(task)).toEqual({
      sourceSubtitleRef: null,
      targetSubtitleRef: null,
    });
  });

  it("prefers translation result files over stale meta srt_path fallback", () => {
    const task: Task = {
      id: "task-translate-result-files",
      type: "translate",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: {
        context_path: "E:/legacy/source.srt",
      },
      result: {
        files: [{ type: "subtitle", path: "E:/canonical/output-from-files.srt" }],
        meta: {
          srt_path: "E:/legacy/output-from-meta.srt",
        },
      },
    };

    expect(getTranslationTaskMediaRefs(task)).toEqual({
      sourceSubtitleRef: null,
      targetSubtitleRef: {
        path: "E:/canonical/output-from-files.srt",
        name: "output-from-files.srt",
      },
    });
  });

  it("does not use meta srt_path for translation task snapshots", () => {
    const task: Task = {
      id: "task-translate-current-contract",
      type: "translate",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      task_contract_version: 2,
      request_params: {},
      result: {
        meta: {
          srt_path: "E:/current-contract/output-from-meta.srt",
        },
      },
    };

    expect(getTranslationTaskMediaRefs(task)).toEqual({
      sourceSubtitleRef: null,
      targetSubtitleRef: null,
    });
  });

  it("does not match path-only translation tasks once source refs are required", () => {
    const task: Task = {
      id: "task-translate-legacy-active",
      type: "translate",
      status: "running",
      progress: 10,
      created_at: Date.now(),
      request_params: {
        context_path: "E:/legacy/source.srt",
      },
    };

    expect(findActiveTranslationTask([task], null, "E:/legacy/source.srt")).toBeUndefined();
    expect(getTranslationTaskMediaRefs(task).sourceSubtitleRef).toBeNull();
  });
});
