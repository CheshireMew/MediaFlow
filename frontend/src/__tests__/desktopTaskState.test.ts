/* @vitest-environment node */
import { describe, expect, it, vi } from "vitest";
import {
  TASK_CONTRACT_VERSION,
  buildDesktopTaskProgressUpdate,
  buildDesktopTaskResponseUpdate,
  buildDesktopTask,
  getDesktopTaskSnapshot,
  isTrackedDesktopCommand,
  planCancelDesktopTask,
  planPauseDesktopTask,
  planResumeDesktopTask,
} from "../../electron/desktopTaskState";

describe("desktopTaskState", () => {
  it("identifies tracked desktop commands", () => {
    expect(isTrackedDesktopCommand("transcribe")).toBe(true);
    expect(isTrackedDesktopCommand("translate")).toBe(true);
    expect(isTrackedDesktopCommand("get_settings")).toBe(false);
  });

  it("builds a completed translate task with subtitle metadata", () => {
    vi.spyOn(Date, "now").mockReturnValue(123);

    const task = buildDesktopTask(
      "translate-1",
      "translate",
      {
        context_path: "E:/subs/demo.srt",
        context_ref: {
          path: "E:/canonical/demo.srt",
          name: "demo.srt",
        },
        subtitle_ref: {
          path: "E:/canonical/demo.srt",
          name: "demo.srt",
          type: "application/x-subrip",
        },
      },
      "completed",
      100,
      "Completed",
      {
        segments: [{ id: "1", start: 0, end: 1, text: "你好" }],
        language: "zh",
        subtitle_ref: {
          path: "E:/canonical/demo_zh.srt",
          name: "demo_zh.srt",
          type: "application/x-subrip",
        },
        output_ref: {
          path: "E:/canonical/demo_zh.srt",
          name: "demo_zh.srt",
          type: "application/x-subrip",
        },
        mode: "standard",
      },
    );

    expect(task).toMatchObject({
      id: "translate-1",
      type: "translate",
      status: "completed",
      name: "Translate demo.srt",
      task_source: "desktop",
      task_contract_version: TASK_CONTRACT_VERSION,
      created_at: 123,
      request_params: {
        context_path: "E:/subs/demo.srt",
        __desktop_worker: true,
        video_ref: null,
        subtitle_ref: null,
        context_ref: {
          path: "E:/canonical/demo.srt",
          name: "demo.srt",
        },
      },
      result: {
        success: true,
        files: [{ type: "subtitle", path: "E:/canonical/demo_zh.srt" }],
        meta: {
          language: "zh",
          mode: "standard",
          subtitle_ref: {
            path: "E:/canonical/demo_zh.srt",
            name: "demo_zh.srt",
            type: "application/x-subrip",
          },
          context_ref: {
            path: "E:/canonical/demo.srt",
            name: "demo.srt",
            type: "application/x-subrip",
          },
          output_ref: {
            path: "E:/canonical/demo_zh.srt",
            name: "demo_zh.srt",
            type: "application/x-subrip",
          },
        },
      },
    });

    vi.restoreAllMocks();
  });

  it("prefers producer-provided refs for completed transcribe tasks", () => {
    vi.spyOn(Date, "now").mockReturnValue(456);

    const task = buildDesktopTask(
      "transcribe-1",
      "transcribe",
      {
        audio_path: "E:/media/demo.mp4",
        audio_ref: {
          path: "E:/canonical/demo.mp4",
          name: "demo.mp4",
        },
      },
      "completed",
      100,
      "Completed",
      {
        segments: [{ id: "1", start: 0, end: 1, text: "hello" }],
        text: "hello",
        language: "en",
        video_ref: {
          path: "E:/canonical/demo.mp4",
          name: "demo.mp4",
          type: "video/mp4",
        },
        subtitle_ref: {
          path: "E:/canonical/demo.srt",
          name: "demo.srt",
          type: "application/x-subrip",
        },
        output_ref: {
          path: "E:/canonical/demo.srt",
          name: "demo.srt",
          type: "application/x-subrip",
        },
      },
    );

    expect(task).toMatchObject({
      id: "transcribe-1",
      result: {
        files: [{ type: "subtitle", path: "E:/canonical/demo.srt" }],
        meta: {
          video_ref: {
            path: "E:/canonical/demo.mp4",
            name: "demo.mp4",
            type: "video/mp4",
          },
          subtitle_ref: {
            path: "E:/canonical/demo.srt",
            name: "demo.srt",
            type: "application/x-subrip",
          },
          output_ref: {
            path: "E:/canonical/demo.srt",
            name: "demo.srt",
            type: "application/x-subrip",
          },
        },
      },
    });

    vi.restoreAllMocks();
  });

  it("builds a snapshot with running, queued, and paused desktop tasks", () => {
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy
      .mockReturnValueOnce(300)
      .mockReturnValueOnce(200)
      .mockReturnValueOnce(100);

    const snapshot = getDesktopTaskSnapshot({
      activeTaskId: "run-1",
      queuedTaskIds: ["queue-1"],
      pausedTasks: new Map([
        [
          "paused-1",
          {
            command: "translate",
            payload: { context_path: "E:/subs/demo.srt" },
          },
        ],
      ]),
      requests: new Map([
        [
          "run-1",
          {
            command: "transcribe",
            payload: { audio_path: "E:/audio.wav" },
          },
        ],
        [
          "queue-1",
          {
            command: "download",
            payload: { url: "https://example.com/video" },
          },
        ],
      ]),
    });

    expect(snapshot.map((task) => task.id)).toEqual(["run-1", "queue-1", "paused-1"]);
    expect(snapshot[0]).toMatchObject({
      status: "running",
      task_source: "desktop",
      persistence_scope: "runtime",
      queue_state: "running",
      queue_position: null,
    });
    expect(snapshot[1]).toMatchObject({
      status: "pending",
      task_source: "desktop",
      persistence_scope: "runtime",
      queue_state: "queued",
      queue_position: 1,
    });
    expect(snapshot[2]).toMatchObject({
      status: "paused",
      task_source: "desktop",
      persistence_scope: "runtime",
      queue_state: "paused",
      message: "Paused",
    });

    vi.restoreAllMocks();
  });

  it("includes persisted desktop history tasks in snapshot restoration", () => {
    const snapshot = getDesktopTaskSnapshot({
      activeTaskId: null,
      queuedTaskIds: [],
      pausedTasks: new Map(),
      requests: new Map(),
      historyTasks: [
        {
          id: "done-1",
          type: "download",
          status: "completed",
          progress: 100,
          name: "Download sample.mp4",
          message: "Completed",
          request_params: {
            __desktop_worker: true,
            url: "https://example.com/video",
          },
          result: {
            success: true,
            files: [{ type: "video", path: "E:/sample.mp4" }],
            meta: { title: "Sample" },
          },
          created_at: 123,
          queue_state: "completed",
        },
      ],
    });

    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toMatchObject({
      id: "done-1",
      status: "completed",
      task_source: "desktop",
      task_contract_version: TASK_CONTRACT_VERSION,
      persistence_scope: "history",
      result: {
        files: [{ type: "video", path: "E:/sample.mp4" }],
      },
    });
  });

  it("plans pausing a queued desktop task as paused state without restart", () => {
    const plan = planPauseDesktopTask("queue-1", {
      activeTaskId: "run-1",
      queuedTaskIds: ["queue-1"],
      pausedTasks: new Map(),
      requests: new Map([
        [
          "queue-1",
          {
            command: "download",
            payload: { url: "https://example.com/video" },
          },
        ],
      ]),
    });

    expect(plan).toMatchObject({
      status: "paused",
      removeRequest: true,
      removeQueued: true,
      shouldRestartWorker: false,
      rejectMessage: "Desktop worker task paused",
    });
  });

  it("plans cancelling the active desktop task as restart-worthy cancellation", () => {
    const plan = planCancelDesktopTask("run-1", {
      activeTaskId: "run-1",
      queuedTaskIds: ["queue-1"],
      pausedTasks: new Map(),
      requests: new Map([
        [
          "run-1",
          {
            command: "transcribe",
            payload: { audio_path: "E:/audio.wav" },
          },
        ],
      ]),
    });

    expect(plan).toMatchObject({
      status: "cancelled",
      removeRequest: true,
      shouldRestartWorker: true,
      rejectMessage: "Desktop worker task cancelled",
    });
  });

  it("plans resuming a paused desktop task through requeue", () => {
    const pausedTasks = new Map([
      [
        "paused-1",
        {
          command: "translate" as const,
          payload: { context_path: "E:/subs/demo.srt", task_id: "paused-1" },
        },
      ],
    ]);

    const plan = planResumeDesktopTask("paused-1", pausedTasks);

    expect(plan).toMatchObject({
      status: "resumed",
      removePaused: true,
      resumeTask: {
        command: "translate",
        payload: { context_path: "E:/subs/demo.srt", task_id: "paused-1" },
      },
    });
  });

  it("maps worker progress payload into a running task update", () => {
    const task = buildDesktopTaskProgressUpdate({
      taskId: "run-1",
      request: {
        command: "transcribe",
        payload: {
          audio_path: "E:/audio.wav",
          audio_ref: {
            path: "E:/canonical/audio.wav",
            name: "audio.wav",
          },
        },
      },
      payload: {
        progress: 48,
        message: "Transcribing audio",
      },
    });

    expect(task).toMatchObject({
      id: "run-1",
      status: "running",
      task_source: "desktop",
      progress: 48,
      message: "Transcribing audio",
      request_params: {
        video_ref: {
          path: "E:/canonical/audio.wav",
          name: "audio.wav",
        },
      },
    });
  });

  it("maps worker response payload into a completed task update", () => {
    const task = buildDesktopTaskResponseUpdate({
      taskId: "done-1",
      request: {
        command: "download",
        payload: { url: "https://example.com/video" },
      },
      ok: true,
      result: {
        files: [{ type: "video", path: "E:/video.mp4" }],
        meta: { source: "yt-dlp" },
      },
    });

    expect(task).toMatchObject({
      id: "done-1",
      status: "completed",
      task_source: "desktop",
      result: {
        success: true,
        files: [{ type: "video", path: "E:/video.mp4" }],
        meta: {
          source: "yt-dlp",
          video_ref: {
            path: "E:/video.mp4",
            name: "video.mp4",
            type: "video/mp4",
          },
        },
      },
    });
  });
});
