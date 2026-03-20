import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTranslationTask } from "../hooks/useTranslationTask";
import { useTranslatorStore } from "../stores/translatorStore";
import type { Task } from "../types/task";

const translatorServiceMock = vi.hoisted(() => ({
  startTranslation: vi.fn(),
}));

const taskContextMock = vi.hoisted(() => ({
  tasks: [] as Task[],
  connected: true,
  cancelTask: vi.fn(),
  addTask: vi.fn(),
}));

vi.mock("../services/translator/translatorService", () => ({
  translatorService: translatorServiceMock,
}));

vi.mock("../context/taskContext", () => ({
  useTaskContext: () => taskContextMock,
}));

describe("useTranslationTask", () => {
  beforeEach(() => {
    useTranslatorStore.setState({
      sourceSegments: [{ id: "1", start: 0, end: 1, text: "hello" }],
      targetSegments: [],
      glossary: [],
      sourceFilePath: "E:/subs/demo.srt",
      targetLang: "Chinese",
      mode: "standard",
      activeMode: null,
      resultMode: null,
      taskId: null,
      taskStatus: "",
      progress: 0,
    });
    translatorServiceMock.startTranslation.mockReset();
    taskContextMock.tasks = [];
    taskContextMock.connected = true;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("proofread uses activeMode/resultMode without overwriting the selected mode", async () => {
    vi.useFakeTimers();
    useTranslatorStore.setState({ mode: "intelligent" });
    translatorServiceMock.startTranslation.mockResolvedValue({
      task_id: "task-1",
      status: "pending",
    });

    const { result, rerender } = renderHook(() => useTranslationTask());

    await act(async () => {
      await result.current.proofreadSubtitle();
    });

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
          mode: "intelligent",
        },
      } as Task,
    ];

    renderHook(() => useTranslationTask());

    expect(useTranslatorStore.getState().taskId).toBe("task-recover");
    expect(useTranslatorStore.getState().taskStatus).toBe("running");
    expect(useTranslatorStore.getState().activeMode).toBe("intelligent");
    expect(useTranslatorStore.getState().progress).toBe(42);
  });
});
