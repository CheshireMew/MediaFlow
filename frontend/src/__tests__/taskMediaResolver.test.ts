import { describe, expect, it } from "vitest";
import {
  getTaskMediaCandidates,
  getTaskStructuredMediaRefs,
  resolveTranscribeTaskMedia,
  resolveTranslationTaskMedia,
} from "../services/tasks/taskMediaResolver";
import type { Task } from "../types/task";

describe("taskMediaResolver", () => {
  it("resolves structured refs before fallback candidates", () => {
    const task: Task = {
      id: "resolver-structured",
      type: "translate",
      status: "completed",
      progress: 100,
      created_at: 1,
      request_params: {
        context_ref: {
          path: "E:/canonical/source.srt",
          name: "source.srt",
        },
      },
      result: {
        meta: {
          output_ref: {
            path: "E:/canonical/output.srt",
            name: "output.srt",
          },
        },
      },
    };

    expect(getTaskStructuredMediaRefs(task)).toEqual({
      videoRef: null,
      subtitleRef: null,
      contextRef: {
        path: "E:/canonical/source.srt",
        name: "source.srt",
        size: undefined,
        type: undefined,
        media_id: undefined,
        media_kind: undefined,
        role: undefined,
        origin: undefined,
      },
      outputRef: {
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

  it("requires structured refs for translation task source resolution", () => {
    const task: Task = {
      id: "resolver-legacy-translate",
      type: "translate",
      status: "completed",
      progress: 100,
      created_at: 1,
      task_contract_normalized_from_legacy: true,
      task_contract_version: 2,
      request_params: {
        context_path: "E:/legacy/source.srt",
      },
      result: {
        meta: {
          srt_path: "E:/legacy/output.srt",
        },
      },
    };

    expect(resolveTranslationTaskMedia(task)).toEqual({
      sourceSubtitleRef: null,
      targetSubtitleRef: null,
    });
  });

  it("does not surface request output_path as a task-media candidate", () => {
    const task: Task = {
      id: "resolver-candidates",
      type: "synthesis",
      status: "completed",
      progress: 100,
      created_at: 1,
      request_params: {
        output_path: "E:/legacy/output.mp4",
      },
      result: {
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

  it("resolves transcribe source media and candidates through the shared resolver", () => {
    const task: Task = {
      id: "resolver-transcribe",
      type: "pipeline",
      status: "completed",
      progress: 100,
      created_at: 1,
      request_params: {
        steps: [
          {
            step_name: "transcribe",
            params: {
              audio_ref: {
                path: "E:/canonical/sample.mp4",
                name: "sample.mp4",
              },
              audio_path: "E:/legacy/stale.mp4",
            },
          },
        ],
      },
      result: {
        files: [{ type: "subtitle", path: "E:/canonical/sample.srt" }],
        meta: {},
      },
    };

    expect(resolveTranscribeTaskMedia(task)).toEqual({
      sourceMediaRef: {
        path: "E:/canonical/sample.mp4",
        name: "sample.mp4",
        size: undefined,
        type: undefined,
        media_id: undefined,
        media_kind: undefined,
        role: undefined,
        origin: undefined,
      },
      subtitleRef: null,
      sourceCandidates: ["E:/canonical/sample.mp4"],
    });
  });
});
