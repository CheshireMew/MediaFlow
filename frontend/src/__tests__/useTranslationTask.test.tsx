import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTranslationTask } from "../hooks/useTranslationTask";
import { useTranslatorStore } from "../stores/translatorStore";
import type { Task, TaskArtifact } from "../types/task";
import { clearElectronMock, installElectronMock } from "./testUtils/electronMock";
import { createMockUserSettings } from "./testUtils/mockUserSettings";
import { BACKEND_TASK_CONTRACT_FIELDS } from "./testFixtures";

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
  const artifact = (
    kind: "subtitle",
    role: "input" | "output" | "context",
    path: string,
    name: string,
  ): TaskArtifact => ({ kind, role, ref: { path, name } });

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
      task_source: "backend",
      task_contract_version: 2,
      persistence_scope: "runtime",
      lifecycle: "resumable",
      queue_state: "queued",
      queue_position: null,
      primary_operation: "translate",
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
          context_ref: expect.objectContaining({
            path: "E:/subs/demo.srt",
            name: "demo.srt",
          }),
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
          ...BACKEND_TASK_CONTRACT_FIELDS,
          id: "task-1",
          type: "translate",
          primary_operation: "translate",
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
          artifacts: [
            artifact("subtitle", "context", "E:/subs/demo.srt", "demo.srt"),
            artifact("subtitle", "output", "E:/subs/demo_zh.srt", "demo_zh.srt"),
          ],
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
        ...BACKEND_TASK_CONTRACT_FIELDS,
        id: "task-recover",
        type: "translate",
        primary_operation: "translate",
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
        artifacts: [artifact("subtitle", "context", "E:/subs/demo.srt", "demo.srt")],
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
        ...BACKEND_TASK_CONTRACT_FIELDS,
        id: "task-history",
        type: "translate",
        primary_operation: "translate",
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
        artifacts: [
          artifact("subtitle", "context", "E:/subs/demo.srt", "demo.srt"),
          artifact("subtitle", "output", "E:/subs/demo_zh.srt", "demo_zh.srt"),
        ],
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
        ...BACKEND_TASK_CONTRACT_FIELDS,
        id: "task-recover-ref",
        type: "translate",
        primary_operation: "translate",
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
        artifacts: [artifact("subtitle", "context", "E:/canonical/demo.srt", "demo.srt")],
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
        ...BACKEND_TASK_CONTRACT_FIELDS,
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

  test("submits translation as a backend task in desktop runtime", async () => {
    translationServiceMock.startTranslation.mockResolvedValue({
      task_id: "backend-translate-task",
      status: "pending",
      task_source: "backend",
      task_contract_version: 2,
      persistence_scope: "runtime",
      lifecycle: "resumable",
      queue_state: "queued",
      queue_position: null,
    });

    installElectronMock();

    const { result } = renderHook(() => useTranslationTask());

    await act(async () => {
      await result.current.startTranslation();
    });

    expect(translationServiceMock.startTranslation).toHaveBeenCalledWith(expect.objectContaining({
      segments: [{ id: "1", start: 0, end: 1, text: "hello" }],
      target_language: "Chinese",
      mode: "standard",
      context_ref: expect.objectContaining({
        path: "E:/subs/demo.srt",
        name: "demo.srt",
      }),
    }));
    expect(translationServiceMock.startTranslation.mock.calls[0]?.[0]).not.toHaveProperty("context_path");
    expect(useTranslatorStore.getState().targetSegments).toEqual([]);
    expectTranslatorMediaState({
      sourceFileRef: {
        path: "E:/subs/demo.srt",
        name: "demo.srt",
      },
      targetSubtitleRef: null,
    });
    expect(useTranslatorStore.getState().resultMode).toBeNull();
    expect(taskContextMock.addTask).toHaveBeenCalledWith(expect.objectContaining({
      id: "backend-translate-task",
      type: "translate",
      status: "pending",
      task_source: "backend",
    }));
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
      task_source: "backend",
      task_contract_version: 2,
      persistence_scope: "runtime",
      lifecycle: "resumable",
      queue_state: "queued",
      queue_position: null,
    });
    clearElectronMock();

    const { result } = renderHook(() => useTranslationTask());

    await act(async () => {
      await result.current.startTranslation();
    });

    expect(translationServiceMock.startTranslation).toHaveBeenCalledWith(expect.objectContaining({
      segments: [{ id: "1", start: 0, end: 1, text: "hello" }],
      target_language: "Chinese",
      mode: "standard",
      context_ref: expect.objectContaining({
        path: "E:/canonical/demo.srt",
        name: "demo.srt",
      }),
    }));
    expect(translationServiceMock.startTranslation.mock.calls[0]?.[0]).not.toHaveProperty("context_path");
    expect(taskContextMock.addTask).toHaveBeenCalledWith(
      expect.objectContaining({
        request_params: expect.objectContaining({
          context_ref: expect.objectContaining({
            path: "E:/canonical/demo.srt",
            name: "demo.srt",
          }),
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
