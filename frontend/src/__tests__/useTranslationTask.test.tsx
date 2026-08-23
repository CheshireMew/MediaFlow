import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTranslationTask } from "../hooks/useTranslationTask";
import { useTranslatorStore } from "../stores/translatorStore";
import type { Task, TaskArtifact } from "../types/task";
import { clearElectronMock, installElectronMock } from "./testUtils/electronMock";
import { createMockUserSettings } from "./testUtils/mockUserSettings";
import { BACKEND_TASK_CONTRACT_FIELDS } from "./testFixtures";
import { apiClient } from "../api/client";
import { TASK_CONTRACT_VERSION } from "../contracts/runtimeContracts";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const apiClientMock = {
  getSettings: vi.spyOn(apiClient, "getSettings"),
  runPipeline: vi.spyOn(apiClient, "runPipeline"),
};

const taskContextMock = vi.hoisted(() => ({
  tasks: [] as Task[],
  connected: true,
      remoteTasksReady: true,
      tasksSettled: true,
  addTask: vi.fn(),
}));

function translationRequestParams(path: string, mode: "standard" | "intelligent" | "proofread") {
  return {
    pipeline_id: "translator_tool",
    steps: [{
      step_name: "translate" as const,
      params: {
        segments: [{ id: "1", start: 0, end: 1, text: "hello" }],
        context_ref: { path, name: "demo.srt" },
        target_language: "SimplifiedChinese" as const,
        mode,
      },
    }],
  };
}

vi.mock("../context/taskContext", () => ({
  useTaskContext: () => taskContextMock,
  useTaskActions: () => taskContextMock,
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
      sourceFileRef: {
        path: "E:/subs/demo.srt",
        name: "demo.srt",
      },
      targetSubtitleRef: null,
      targetLang: "SimplifiedChinese",
      mode: "standard",
      activeMode: null,
      resultMode: null,
      taskId: null,
      taskStatus: "",
      progress: 0,
      taskError: null,
    });
    apiClientMock.runPipeline.mockReset();
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
    apiClientMock.runPipeline.mockResolvedValue({
      task_id: "task-1",
      status: "pending",
      task_source: "backend",
      task_contract_version: TASK_CONTRACT_VERSION,
      revision: 0,
      persistence_scope: "runtime",
      lifecycle: "resumable",
      queue_state: "queued",
      queue_position: null,
      primary_operation: "translate",
      message_code: "queued",
      message_params: {},
    });
    clearElectronMock();

    const { result, rerender } = renderHook(() => useTranslationTask());

    await act(async () => {
      await result.current.proofreadSubtitle();
    });

    expect(taskContextMock.addTask).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "task-1",
        type: "pipeline",
        task_source: "backend",
        task_contract_version: TASK_CONTRACT_VERSION,
        revision: 0,
        queue_state: "queued",
        request_params: expect.objectContaining({
          pipeline_id: "translator_tool",
          steps: [{
            step_name: "translate",
            params: expect.objectContaining({
              context_ref: expect.objectContaining({
                path: "E:/subs/demo.srt",
                name: "demo.srt",
              }),
              target_language: "SimplifiedChinese",
              mode: "proofread",
            }),
          }],
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
          type: "pipeline",
          primary_operation: "translate",
          status: "completed",
          progress: 100,
          created_at: 1,
          request_params: translationRequestParams("E:/subs/demo.srt", "proofread"),
          result: {
            success: true,
            artifacts: [artifact("subtitle", "output", "E:/subs/demo_zh.srt", "demo_zh.srt")],
            outputs: {
              translation: {
                segments: [{ id: "1", start: 0, end: 1, text: "fixed text" }],
                language: "SimplifiedChinese",
                mode: "proofread",
              },
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
        type: "pipeline",
        primary_operation: "translate",
        status: "running",
        progress: 42,
        created_at: 1,
        request_params: translationRequestParams("E:/subs/demo.srt", "intelligent"),
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
        type: "pipeline",
        primary_operation: "translate",
        status: "completed",
        progress: 100,
        created_at: 1,
        request_params: translationRequestParams("E:/subs/demo.srt", "intelligent"),
        result: {
          success: true,
          artifacts: [artifact("subtitle", "output", "E:/subs/demo_zh.srt", "demo_zh.srt")],
          outputs: {
            translation: {
              segments: [{ id: "1", start: 0, end: 1, text: "你好" }],
              language: "SimplifiedChinese",
              mode: "intelligent",
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

  test("recovers an active translate task using the canonical source reference", () => {
    useTranslatorStore.setState({
      sourceFileRef: {
        path: "E:/canonical/demo.srt",
        name: "demo.srt",
      },
    });
    taskContextMock.tasks = [
      {
        ...BACKEND_TASK_CONTRACT_FIELDS,
        id: "task-recover-ref",
        type: "pipeline",
        primary_operation: "translate",
        status: "running",
        progress: 42,
        created_at: 1,
        request_params: translationRequestParams("E:/canonical/demo.srt", "intelligent"),
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
        type: "pipeline",
        status: "failed",
        progress: 12,
        error: "Network unreachable while contacting LLM provider",
        created_at: 1,
        request_params: translationRequestParams("E:/subs/demo.srt", "standard"),
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
    apiClientMock.runPipeline.mockResolvedValue({
      task_id: "backend-translate-task",
      status: "pending",
      task_source: "backend",
      task_contract_version: TASK_CONTRACT_VERSION,
      revision: 0,
      persistence_scope: "runtime",
      lifecycle: "resumable",
      queue_state: "queued",
      queue_position: null,
      primary_operation: "translate",
      message_code: "queued",
      message_params: {},
    });

    installElectronMock();

    const { result } = renderHook(() => useTranslationTask());

    await act(async () => {
      await result.current.startTranslation();
    });

    expect(apiClientMock.runPipeline).toHaveBeenCalledWith(expect.objectContaining({
      pipeline_id: "translator_tool",
      steps: [{
        step_name: "translate",
        params: expect.objectContaining({
          segments: [{ id: "1", start: 0, end: 1, text: "hello" }],
          target_language: "SimplifiedChinese",
          mode: "standard",
          context_ref: expect.objectContaining({
            path: "E:/subs/demo.srt",
            name: "demo.srt",
          }),
        }),
      }],
    }));
    expect(apiClientMock.runPipeline.mock.calls[0]?.[0].steps[0].params).not.toHaveProperty("context_path");
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
      type: "pipeline",
      status: "pending",
      task_source: "backend",
    }));
  });

  test("uses the canonical source reference as translation input", async () => {
    vi.useFakeTimers();
    useTranslatorStore.setState({
      sourceFileRef: {
        path: "E:/canonical/demo.srt",
        name: "demo.srt",
      },
    });
    apiClientMock.runPipeline.mockResolvedValue({
      task_id: "task-ref-only",
      status: "pending",
      task_source: "backend",
      task_contract_version: TASK_CONTRACT_VERSION,
      revision: 0,
      persistence_scope: "runtime",
      lifecycle: "resumable",
      queue_state: "queued",
      queue_position: null,
      primary_operation: "translate",
      message_code: "queued",
      message_params: {},
    });
    clearElectronMock();

    const { result } = renderHook(() => useTranslationTask());

    await act(async () => {
      await result.current.startTranslation();
    });

    expect(apiClientMock.runPipeline).toHaveBeenCalledWith(expect.objectContaining({
      steps: [{
        step_name: "translate",
        params: expect.objectContaining({
          segments: [{ id: "1", start: 0, end: 1, text: "hello" }],
          target_language: "SimplifiedChinese",
          mode: "standard",
          context_ref: expect.objectContaining({
            path: "E:/canonical/demo.srt",
            name: "demo.srt",
          }),
        }),
      }],
    }));
    expect(apiClientMock.runPipeline.mock.calls[0]?.[0].steps[0].params).not.toHaveProperty("context_path");
    expect(taskContextMock.addTask).toHaveBeenCalledWith(
      expect.objectContaining({
        request_params: expect.objectContaining({
          steps: [{
            step_name: "translate",
            params: expect.objectContaining({
              context_ref: expect.objectContaining({
                path: "E:/canonical/demo.srt",
                name: "demo.srt",
              }),
            }),
          }],
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
