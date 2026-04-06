import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTranslationTask } from "../hooks/useTranslationTask";
import { useTranslatorStore } from "../stores/translatorStore";
import type { Task } from "../types/task";
import { clearElectronMock, installElectronMock } from "./testUtils/electronMock";
import { createMockUserSettings } from "./testUtils/mockUserSettings";

const translationServiceMock = vi.hoisted(() => ({
  startTranslation: vi.fn(),
}));

const apiClientMock = vi.hoisted(() => ({
  getSettings: vi.fn(),
}));

const taskContextMock = vi.hoisted(() => ({
  tasks: [] as Task[],
  connected: true,
      remoteTasksReady: true,
      tasksSettled: true,
  cancelTask: vi.fn(),
  addTask: vi.fn(),
}));

vi.mock("../services/domain/translationService", () => ({
  translationService: translationServiceMock,
}));

vi.mock("../api/client", () => ({
  apiClient: apiClientMock,
}));

vi.mock("../context/taskContext", () => ({
  useTaskContext: () => taskContextMock,
}));

describe("useTranslationTask", () => {
  const expectTranslatorMediaState = (expected: {
    sourceFileRef: { path: string; name: string } | null;
    targetSubtitleRef?: { path: string; name: string; type?: string } | null;
  }) => {
    expect(useTranslatorStore.getState().sourceFileRef).toEqual(
      expected.sourceFileRef,
    );
    expect(useTranslatorStore.getState().targetSubtitleRef ?? null).toEqual(
      expected.targetSubtitleRef ?? null,
    );
  };

  beforeEach(() => {
    useTranslatorStore.setState({
      sourceSegments: [{ id: "1", start: 0, end: 1, text: "hello" }],
      targetSegments: [],
      glossary: [],
      sourceFilePath: "E:/subs/demo.srt",
      sourceFileRef: {
        path: "E:/subs/demo.srt",
        name: "demo.srt",
      },
      targetSubtitleRef: null,
      targetLang: "Chinese",
      mode: "standard",
      activeMode: null,
      resultMode: null,
      taskId: null,
      taskStatus: "",
      progress: 0,
      taskError: null,
    });
    translationServiceMock.startTranslation.mockReset();
    apiClientMock.getSettings.mockReset();
    apiClientMock.getSettings.mockResolvedValue(createMockUserSettings());
    taskContextMock.addTask.mockReset();
    taskContextMock.tasks = [];
    taskContextMock.connected = true;
    installElectronMock();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("proofread uses activeMode/resultMode without overwriting the selected mode", async () => {
    vi.useFakeTimers();
    useTranslatorStore.setState({ mode: "intelligent" });
    translationServiceMock.startTranslation.mockResolvedValue({
      task_id: "task-1",
      status: "pending",
    });
    clearElectronMock();

    const { result, rerender } = renderHook(() => useTranslationTask());

    await act(async () => {
      await result.current.proofreadSubtitle();
    });

    expect(taskContextMock.addTask).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "task-1",
        type: "translate",
        task_source: "backend",
        task_contract_version: 2,
        queue_state: "queued",
        request_params: expect.objectContaining({
          context_path: "E:/subs/demo.srt",
          target_language: "Chinese",
          mode: "proofread",
        }),
      }),
    );
    expect(useTranslatorStore.getState().mode).toBe("intelligent");
    expect(useTranslatorStore.getState().resultMode).toBe("proofread");
    expect(useTranslatorStore.getState().taskStatus).toBe("pending");

    await act(async () => {
      taskContextMock.tasks = [
        {
          id: "task-1",
          type: "translate",
          status: "completed",
          progress: 100,
          created_at: 1,
          request_params: {
            context_path: "E:/subs/demo.srt",
            mode: "proofread",
          },
          result: {
            meta: {
              segments: [{ id: "1", start: 0, end: 1, text: "fixed text" }],
            },
          },
        } as Task,
      ];
      rerender();
    });

    await act(async () => {
      vi.runAllTimers();
      await Promise.resolve();
    });

    expect(useTranslatorStore.getState().mode).toBe("intelligent");
    expect(useTranslatorStore.getState().activeMode).toBeNull();
    expect(useTranslatorStore.getState().resultMode).toBe("proofread");
  });

  test("recovers an active translate task from task context after reload", () => {
    taskContextMock.tasks = [
      {
        id: "task-recover",
        type: "translate",
        status: "running",
        progress: 42,
        created_at: 1,
        request_params: {
          context_path: "E:/subs/demo.srt",
          context_ref: {
            path: "E:/subs/demo.srt",
            name: "demo.srt",
          },
          mode: "intelligent",
        },
      } as Task,
    ];

    renderHook(() => useTranslationTask());

    expect(useTranslatorStore.getState().taskId).toBe("task-recover");
    expect(useTranslatorStore.getState().taskStatus).toBe("running");
    expect(useTranslatorStore.getState().activeMode).toBe("intelligent");
    expect(useTranslatorStore.getState().progress).toBe(42);
    expectTranslatorMediaState({
      sourceFileRef: {
        path: "E:/subs/demo.srt",
        name: "demo.srt",
      },
      targetSubtitleRef: null,
    });
  });

  test("recovers completed translation output from task context after reload without restoring taskId", () => {
    taskContextMock.tasks = [
      {
        id: "task-history",
        type: "translate",
        status: "completed",
        progress: 100,
        created_at: 1,
        request_params: {
          context_path: "E:/subs/demo.srt",
          context_ref: {
            path: "E:/subs/demo.srt",
            name: "demo.srt",
          },
          mode: "intelligent",
        },
        result: {
          meta: {
            segments: [{ id: "1", start: 0, end: 1, text: "你好" }],
            subtitle_ref: {
              path: "E:/subs/demo_zh.srt",
              name: "demo_zh.srt",
            },
          },
        },
      } as Task,
    ];

    renderHook(() => useTranslationTask());

    expect(useTranslatorStore.getState().taskId).toBeNull();
    expect(useTranslatorStore.getState().taskStatus).toBe("completed");
    expect(useTranslatorStore.getState().resultMode).toBe("intelligent");
    expect(useTranslatorStore.getState().targetSegments).toEqual([
      { id: "1", start: 0, end: 1, text: "你好" },
    ]);
    expectTranslatorMediaState({
      sourceFileRef: {
        path: "E:/subs/demo.srt",
        name: "demo.srt",
      },
      targetSubtitleRef: {
        path: "E:/subs/demo_zh.srt",
        name: "demo_zh.srt",
      },
    });
  });

  test("recovers an active translate task using sourceFileRef when sourceFilePath is missing", () => {
    useTranslatorStore.setState({
      sourceFilePath: null,
      sourceFileRef: {
        path: "E:/canonical/demo.srt",
        name: "demo.srt",
      },
    });
    taskContextMock.tasks = [
      {
        id: "task-recover-ref",
        type: "translate",
        status: "running",
        progress: 42,
        created_at: 1,
        request_params: {
          context_path: "E:/workspace/demo.srt",
          context_ref: {
            path: "E:/canonical/demo.srt",
            name: "demo.srt",
          },
          mode: "intelligent",
        },
      } as Task,
    ];

    renderHook(() => useTranslationTask());

    expect(useTranslatorStore.getState().taskId).toBe("task-recover-ref");
    expect(useTranslatorStore.getState().taskStatus).toBe("running");
    expect(useTranslatorStore.getState().activeMode).toBe("intelligent");
    expectTranslatorMediaState({
      sourceFileRef: {
        path: "E:/canonical/demo.srt",
        name: "demo.srt",
      },
      targetSubtitleRef: null,
    });
  });

  test("stores backend task error when translation fails", () => {
    useTranslatorStore.setState({ taskId: "task-fail" });
    taskContextMock.tasks = [
      {
        id: "task-fail",
        type: "translate",
        status: "failed",
        progress: 12,
        error: "Network unreachable while contacting LLM provider",
        created_at: 1,
        request_params: {
          context_path: "E:/subs/demo.srt",
          mode: "standard",
        },
      } as Task,
    ];

    renderHook(() => useTranslationTask());

    expect(useTranslatorStore.getState().taskStatus).toBe("failed");
    expect(useTranslatorStore.getState().taskError).toBe(
      "Network unreachable while contacting LLM provider",
    );
    expect(useTranslatorStore.getState().taskId).toBeNull();
  });

  test("uses desktop worker translation when available", async () => {
    vi.useFakeTimers();
    const desktopTranslate = vi.fn().mockResolvedValue({
      segments: [{ id: "1", start: 0, end: 1, text: "你好" }],
      language: "Chinese",
      subtitle_ref: {
        path: "E:/subs/demo_CN.srt",
        name: "demo_CN.srt",
        type: "application/x-subrip",
      },
      mode: "standard",
    });

    installElectronMock({
      desktopTranslate,
    });

    const { result } = renderHook(() => useTranslationTask());

    await act(async () => {
      await result.current.startTranslation();
    });

    expect(desktopTranslate).toHaveBeenCalledWith({
      segments: [{ id: "1", start: 0, end: 1, text: "hello" }],
      target_language: "Chinese",
      mode: "standard",
      context_path: "E:/subs/demo.srt",
      context_ref: {
        path: "E:/subs/demo.srt",
        name: "demo.srt",
        size: undefined,
        type: undefined,
      },
    });
    expect(translationServiceMock.startTranslation).not.toHaveBeenCalled();
    expect(useTranslatorStore.getState().targetSegments).toEqual([
      { id: "1", start: 0, end: 1, text: "你好" },
    ]);
    expectTranslatorMediaState({
      sourceFileRef: {
        path: "E:/subs/demo.srt",
        name: "demo.srt",
      },
      targetSubtitleRef: {
        path: "E:/subs/demo_CN.srt",
        name: "demo_CN.srt",
        type: "application/x-subrip",
      },
    });
    expect(useTranslatorStore.getState().resultMode).toBe("standard");
    expect(useTranslatorStore.getState().taskStatus).toBe("processing_result");

    await act(async () => {
      vi.runAllTimers();
      await Promise.resolve();
    });

    expect(useTranslatorStore.getState().taskStatus).toBe("completed");
    expect(useTranslatorStore.getState().activeMode).toBeNull();
  });

  test("uses sourceFileRef as the primary input when sourceFilePath is missing", async () => {
    vi.useFakeTimers();
    useTranslatorStore.setState({
      sourceFilePath: null,
      sourceFileRef: {
        path: "E:/canonical/demo.srt",
        name: "demo.srt",
      },
    });
    translationServiceMock.startTranslation.mockResolvedValue({
      task_id: "task-ref-only",
      status: "pending",
    });
    clearElectronMock();

    const { result } = renderHook(() => useTranslationTask());

    await act(async () => {
      await result.current.startTranslation();
    });

    expect(translationServiceMock.startTranslation).toHaveBeenCalledWith({
      segments: [{ id: "1", start: 0, end: 1, text: "hello" }],
      target_language: "Chinese",
      mode: "standard",
      context_path: "E:/canonical/demo.srt",
      context_ref: {
        path: "E:/canonical/demo.srt",
        name: "demo.srt",
      },
    });
    expect(taskContextMock.addTask).toHaveBeenCalledWith(
      expect.objectContaining({
        request_params: expect.objectContaining({
          context_path: "E:/canonical/demo.srt",
          context_ref: {
            path: "E:/canonical/demo.srt",
            name: "demo.srt",
          },
        }),
      }),
    );
  });

  test("keeps recovered translation task id until task snapshots settle", () => {
    useTranslatorStore.setState({
      taskId: "task-pending-sync",
      taskStatus: "running",
      activeMode: "standard",
    });
    taskContextMock.tasks = [];
    taskContextMock.remoteTasksReady = false;
    taskContextMock.tasksSettled = false;

    renderHook(() => useTranslationTask());

    expect(useTranslatorStore.getState().taskId).toBe("task-pending-sync");
    expect(useTranslatorStore.getState().activeMode).toBe("standard");
  });
});
