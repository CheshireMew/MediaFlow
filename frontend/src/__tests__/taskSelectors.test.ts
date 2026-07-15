import { describe, expect, it } from "vitest";
import {
  BACKEND_TASK_CONTRACT_FIELDS,
  createTranscribeStepRequestParams,
} from "./testFixtures";
import {
  findActiveTranscribeTask,
  findActiveTranslationTask,
  findCompletedTranscribeTask,
  findCompletedTranslationTask,
  getTranslationTaskSegments,
  getTranslationTaskMediaRefs,
  mapTaskToTranscribeResult,
} from "../hooks/tasks/taskSelectors";
import type { Task, TaskArtifact } from "../types/task";

const artifact = (
  kind: "video" | "audio" | "subtitle" | "image" | "file",
  role: "input" | "output" | "context",
  path: string,
  name: string,
): TaskArtifact => ({ kind, role, ref: { path, name } });

const transcriptionOutput = (
  text: string,
  segments: Array<{ id: string; start: number; end: number; text: string }> = [],
) => ({
  task_id: "transcribe-test",
  language: "auto",
  duration: 1,
  segments,
  text,
});

describe("taskSelectors transcribe media matching", () => {
  it("matches an active transcribe task using structured media refs", () => {
    const task: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "task-1",
      type: "pipeline",
      primary_operation: "transcribe",
      status: "running",
      progress: 10,
      created_at: Date.now(),
      request_params: createTranscribeStepRequestParams(),
      artifacts: [artifact("video", "input", "E:/sample.mp4", "sample.mp4")],
    };

    expect(
      findActiveTranscribeTask(
        [task],
        { path: "E:/sample.mp4", name: "sample.mp4" },
      )?.id,
    ).toBe("task-1");
  });

  it("uses explicit audio refs when matching active transcribe tasks", () => {
    const task: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "task-1-ref",
      type: "pipeline",
      primary_operation: "transcribe",
      status: "running",
      progress: 10,
      created_at: Date.now(),
      request_params: {
        steps: [
          {
            step_name: "transcribe",
            params: {
              audio_ref: {
                path: "E:/canonical/sample.mp4",
                name: "sample.mp4",
              },
            },
          },
        ],
      },
      artifacts: [artifact("video", "input", "E:/canonical/sample.mp4", "sample.mp4")],
    };

    expect(
      findActiveTranscribeTask(
        [task],
        { path: "E:/canonical/sample.mp4", name: "sample.mp4" },
      )?.id,
    ).toBe("task-1-ref");
  });

  it("does not fall back to stale audio_path when transcribe refs disagree", () => {
    const task: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "task-1-ref-mismatch",
      type: "pipeline",
      primary_operation: "transcribe",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: {
        steps: [
          {
            step_name: "transcribe",
            params: {
              audio_ref: {
                path: "E:/canonical/sample.mp4",
                name: "sample.mp4",
              },
            },
          },
        ],
      },
      result: {
        success: true,
        artifacts: [],
        outputs: {
          transcription: transcriptionOutput("hello"),
        },
      },
      artifacts: [artifact("video", "input", "E:/canonical/sample.mp4", "sample.mp4")],
    };

    expect(
      mapTaskToTranscribeResult(
        task,
        { path: "E:/another/input.mp4", name: "input.mp4" },
      )?.video_ref,
    ).toEqual({
      path: "E:/canonical/sample.mp4",
      name: "sample.mp4",
    });
  });

  it("does not synthesize source media refs when the task publishes no artifacts", () => {
    const task: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "task-2",
      type: "pipeline",
      primary_operation: "transcribe",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: {
        steps: [{ step_name: "transcribe", params: {} }],
      },
      result: {
        success: true,
        artifacts: [],
        outputs: {
          transcription: transcriptionOutput(
            "hello",
            [{ id: "1", start: 0, end: 1, text: "hello" }],
          ),
        },
      },
    };

    expect(mapTaskToTranscribeResult(task, null)).toEqual({
      segments: [{ id: "1", start: 0, end: 1, text: "hello" }],
      text: "hello",
      language: "auto",
      video_ref: null,
      subtitle_ref: null,
    });
  });

  it("does not match a completed transcribe task when canonical refs differ", () => {
    const task: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "task-completed-ref",
      type: "pipeline",
      primary_operation: "transcribe",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: {
        steps: [
          {
            step_name: "transcribe",
            params: {
              audio_ref: {
                path: "E:/canonical/sample.mp4",
                name: "sample.mp4",
              },
            },
          },
        ],
      },
      artifacts: [artifact("video", "input", "E:/canonical/sample.mp4", "sample.mp4")],
    };

    expect(
      findCompletedTranscribeTask(
        [task],
        { path: "E:/another/input.mp4", name: "input.mp4" },
      ),
    ).toBeUndefined();
  });

  it("matches an active translation task using structured subtitle refs", () => {
    const task: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "task-translate",
      type: "pipeline",
      primary_operation: "translate",
      status: "running",
      progress: 15,
      created_at: Date.now(),
      request_params: {
        steps: [{
          step_name: "translate",
          params: {
            context_ref: {
              path: "E:/subs/demo.srt",
              name: "demo.srt",
            },
            mode: "standard",
          },
        }],
      },
      artifacts: [artifact("subtitle", "context", "E:/subs/demo.srt", "demo.srt")],
    };

    expect(
      findActiveTranslationTask(
        [task],
        { path: "E:/subs/demo.srt", name: "demo.srt" },
      )?.id,
    ).toBe("task-translate");
  });

  it("matches translation and transcription media from task artifacts", () => {
    const translateTask: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "task-translate-ref",
      type: "pipeline",
      primary_operation: "translate",
      status: "running",
      progress: 15,
      created_at: Date.now(),
      request_params: {
        steps: [{
          step_name: "translate",
          params: {
            context_ref: {
              path: "E:/canonical/demo.srt",
              name: "demo.srt",
            },
            mode: "standard",
          },
        }],
      },
      artifacts: [artifact("subtitle", "input", "E:/canonical/demo.srt", "demo.srt")],
    };

    const transcribeTask: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "task-transcribe-ref",
      type: "pipeline",
      primary_operation: "transcribe",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: {
        steps: [{ step_name: "transcribe", params: {} }],
      },
      result: {
        success: true,
        artifacts: [artifact("subtitle", "output", "E:/sample.srt", "sample.srt")],
        outputs: {
          transcription: transcriptionOutput("hello"),
        },
      },
      artifacts: [
        artifact("video", "input", "E:/canonical/sample.mp4", "sample.mp4"),
        artifact("subtitle", "output", "E:/sample.srt", "sample.srt"),
      ],
    };

    expect(
      findActiveTranslationTask(
        [translateTask],
        { path: "E:/canonical/demo.srt", name: "demo.srt" },
      )?.id,
    ).toBe(
      "task-translate-ref",
    );
    expect(mapTaskToTranscribeResult(transcribeTask, null)).toEqual(
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
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "task-translate-refs",
      type: "pipeline",
      primary_operation: "translate",
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
        artifact("subtitle", "context", "E:/canonical/source.srt", "source.srt"),
        artifact("subtitle", "output", "E:/canonical/output.srt", "output.srt"),
      ],
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

  it("reads translated segments from the pipeline result contract", () => {
    const task: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "task-translate-result",
      type: "pipeline",
      primary_operation: "translate",
      status: "completed",
      progress: 100,
      created_at: Date.now(),
      request_params: {
        steps: [{
          step_name: "translate",
          params: {
            segments: [{ id: "1", start: 0, end: 1, text: "hello" }],
            context_ref: { path: "E:/canonical/source.srt", name: "source.srt" },
            target_language: "SimplifiedChinese",
            mode: "standard",
          },
        }],
      },
      result: {
        success: true,
        artifacts: [artifact("subtitle", "output", "E:/canonical/output.srt", "output.srt")],
        outputs: {
          translation: {
            segments: [{ id: "1", start: 0, end: 1, text: "你好" }],
            language: "SimplifiedChinese",
            mode: "standard",
          },
        },
      },
      artifacts: [
        artifact("subtitle", "context", "E:/canonical/source.srt", "source.srt"),
        artifact("subtitle", "output", "E:/canonical/output.srt", "output.srt"),
      ],
    };

    expect(getTranslationTaskSegments(task)).toEqual([
      { id: "1", start: 0, end: 1, text: "你好" },
    ]);
  });

  it("requires published task artifacts for translation media identity", () => {
    const task: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "task-translate-no-artifacts",
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

    expect(
      findCompletedTranslationTask(
        [task],
        { path: "E:/another/source.srt", name: "source.srt" },
      ),
    ).toBeUndefined();
    expect(getTranslationTaskMediaRefs(task)).toEqual({
      sourceSubtitleRef: null,
      targetSubtitleRef: null,
    });
  });
});
