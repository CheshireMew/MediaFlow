import { describe, expect, it } from "vitest";
import { BACKEND_TASK_CONTRACT_FIELDS } from "./testFixtures";
import {
  getTaskMediaCandidates,
  getTaskStructuredMediaRefs,
  resolveTranscribeTaskMedia,
  resolveTranslationTaskMedia,
} from "../services/tasks/taskMediaResolver";
import type { Task } from "../types/task";

const artifact = (
  kind: "video" | "audio" | "subtitle" | "image" | "file",
  role: "input" | "output" | "context",
  path: string,
  name: string,
) => ({ kind, role, ref: { path, name } });

describe("taskMediaResolver", () => {
  it("resolves structured refs as the only task media identity", () => {
    const task: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "resolver-structured",
      type: "translate",
      status: "completed",
      progress: 100,
      created_at: 1,
      request_params: {},
      result: {
        success: true,
        artifacts: [artifact("subtitle", "output", "E:/canonical/output.srt", "output.srt")],
        meta: {},
      },
      artifacts: [
        artifact("subtitle", "context", "E:/canonical/source.srt", "source.srt"),
        artifact("subtitle", "output", "E:/canonical/output.srt", "output.srt"),
      ],
    };

    expect(getTaskStructuredMediaRefs(task)).toEqual({
      videoRef: null,
      subtitleRef: {
        path: "E:/canonical/output.srt",
        name: "output.srt",
      },
      contextRef: {
        path: "E:/canonical/source.srt",
        name: "source.srt",
      },
      outputRef: {
        path: "E:/canonical/output.srt",
        name: "output.srt",
      },
    });
  });

  it("returns no translation refs when no artifacts are published", () => {
    const task: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "resolver-empty-translate",
      type: "translate",
      status: "completed",
      progress: 100,
      created_at: 1,
      request_params: {},
      result: {
        success: true,
        artifacts: [],
        meta: {},
      },
    };

    expect(resolveTranslationTaskMedia(task)).toEqual({
      sourceSubtitleRef: null,
      targetSubtitleRef: null,
    });
  });

  it("returns no candidates when a task publishes no artifacts", () => {
    const task: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "resolver-candidates",
      type: "synthesis",
      status: "completed",
      progress: 100,
      created_at: 1,
      request_params: {},
      result: {
        success: true,
        artifacts: [],
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

  it("resolves transcribe source media and candidates through the shared resolver", () => {
    const task: Task = {
      ...BACKEND_TASK_CONTRACT_FIELDS,
      id: "resolver-transcribe",
      type: "pipeline",
      status: "completed",
      progress: 100,
      created_at: 1,
      primary_operation: "transcribe",
      request_params: {},
      result: {
        success: true,
        artifacts: [artifact("subtitle", "output", "E:/canonical/sample.srt", "sample.srt")],
        meta: {},
      },
      artifacts: [
        artifact("video", "input", "E:/canonical/sample.mp4", "sample.mp4"),
        artifact("subtitle", "output", "E:/canonical/sample.srt", "sample.srt"),
      ],
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
      subtitleRef: {
        path: "E:/canonical/sample.srt",
        name: "sample.srt",
      },
      sourceCandidates: ["E:/canonical/sample.mp4"],
    });
  });
});
