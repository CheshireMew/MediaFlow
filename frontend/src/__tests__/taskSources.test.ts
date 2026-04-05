import { describe, expect, it, vi } from "vitest";

import {
  aggregateTaskSourceState,
  applyTaskSnapshot,
  createTaskSourceBundle,
  createBackendTaskSource,
  createDesktopTaskSource,
  getTaskSourceForTask,
  hasActiveRemoteTasks,
  hasSupportedTaskContract,
  isDesktopTask,
  normalizeTaskForRenderer,
  SUPPORTED_TASK_CONTRACT_VERSION,
} from "../context/taskSources";
import type { Task } from "../types/task";

const onTaskEventMock = vi.fn();
const listDesktopTasksMock = vi.fn();
const pauseDesktopTaskMock = vi.fn();
const resumeDesktopTaskMock = vi.fn();
const cancelDesktopTaskMock = vi.fn();
const listTasksMock = vi.fn();
const pauseAllTasksMock = vi.fn();
const pauseTaskMock = vi.fn();
const resumeTaskMock = vi.fn();
const deleteTaskMock = vi.fn();
const deleteAllTasksMock = vi.fn();

vi.mock("../services/desktop", () => ({
  desktopEventsService: {
    onTaskEvent: (...args: unknown[]) => onTaskEventMock(...args),
  },
  desktopTaskService: {
    listTasks: (...args: unknown[]) => listDesktopTasksMock(...args),
    pauseTask: (...args: unknown[]) => pauseDesktopTaskMock(...args),
    resumeTask: (...args: unknown[]) => resumeDesktopTaskMock(...args),
    cancelTask: (...args: unknown[]) => cancelDesktopTaskMock(...args),
  },
}));

vi.mock("../api/client", () => ({
  apiClient: {
    listTasks: (...args: unknown[]) => listTasksMock(...args),
    pauseAllTasks: (...args: unknown[]) => pauseAllTasksMock(...args),
    pauseTask: (...args: unknown[]) => pauseTaskMock(...args),
    resumeTask: (...args: unknown[]) => resumeTaskMock(...args),
    deleteTask: (...args: unknown[]) => deleteTaskMock(...args),
    deleteAllTasks: (...args: unknown[]) => deleteAllTasksMock(...args),
  },
}));

describe("taskSources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onTaskEventMock.mockReturnValue(() => undefined);
    listDesktopTasksMock.mockResolvedValue([]);
    pauseDesktopTaskMock.mockResolvedValue(undefined);
    resumeDesktopTaskMock.mockResolvedValue(undefined);
    cancelDesktopTaskMock.mockResolvedValue(undefined);
    listTasksMock.mockResolvedValue([]);
    pauseAllTasksMock.mockResolvedValue(undefined);
    pauseTaskMock.mockResolvedValue(undefined);
    resumeTaskMock.mockResolvedValue(undefined);
    deleteTaskMock.mockResolvedValue(undefined);
    deleteAllTasksMock.mockResolvedValue(undefined);
  });

  it("detects desktop worker tasks", () => {
    expect(
      isDesktopTask({
        id: "desktop-1",
        type: "transcribe",
        status: "running",
        progress: 10,
        created_at: 1,
        request_params: { __desktop_worker: true },
      }),
    ).toBe(true);
  });

  it("detects active remote tasks for polling decisions", () => {
    const tasks: Task[] = [
      {
        id: "remote-1",
        type: "pipeline",
        status: "pending",
        progress: 0,
        created_at: 1,
      },
    ];

    expect(hasActiveRemoteTasks(tasks)).toBe(true);
    expect(createBackendTaskSource(true, true).shouldPoll?.()).toBe(true);
  });

  it("applies snapshots through the shared helper", () => {
    const clearTasks = vi.fn();
    const applyMessage = vi.fn();
    const tasks: Task[] = [
      {
        id: "desktop-1",
        type: "transcribe",
        status: "running",
        progress: 25,
        created_at: 1,
        request_params: { __desktop_worker: true },
      },
    ];

    applyTaskSnapshot(clearTasks, applyMessage, isDesktopTask, tasks);

    expect(clearTasks).toHaveBeenCalledWith(isDesktopTask);
    expect(applyMessage).toHaveBeenCalledWith({
      type: "update",
      task: expect.objectContaining({
        ...tasks[0],
        lifecycle: "runtime-only",
        task_source: "desktop",
        task_contract_version: SUPPORTED_TASK_CONTRACT_VERSION,
        task_contract_normalized_from_legacy: false,
      }),
    });
    expect(createDesktopTaskSource({ ready: true, settled: false })).toMatchObject({
      id: "desktop",
      ready: true,
      settled: false,
    });
  });

  it("drops incompatible task snapshots before they reach the store", () => {
    const clearTasks = vi.fn();
    const applyMessage = vi.fn();
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    applyTaskSnapshot(clearTasks, applyMessage, isDesktopTask, [
      {
        id: "desktop-old",
        type: "transcribe",
        status: "running",
        progress: 25,
        created_at: 1,
        task_contract_version: 99,
        request_params: { __desktop_worker: true },
      },
    ]);

    expect(clearTasks).toHaveBeenCalledWith(isDesktopTask);
    expect(applyMessage).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    consoleWarnSpy.mockRestore();
  });

  it("treats the current task contract version as supported", () => {
    expect(
      hasSupportedTaskContract({
        id: "task-1",
        type: "pipeline",
        status: "pending",
        progress: 0,
        created_at: 1,
        task_contract_version: SUPPORTED_TASK_CONTRACT_VERSION,
      }),
    ).toBe(true);
  });

  it("aggregates task source readiness for desktop runtime", () => {
    expect(
      aggregateTaskSourceState({
        desktopRuntime: true,
        enabled: true,
        wsConnected: false,
        localSource: { ready: true, settled: true },
        remoteSource: { ready: false, settled: false },
      }),
    ).toEqual({
      connected: true,
      remoteTasksReady: false,
      tasksSettled: false,
    });
  });

  it("aggregates task source readiness for web runtime", () => {
    expect(
      aggregateTaskSourceState({
        desktopRuntime: false,
        enabled: true,
        wsConnected: true,
        localSource: { ready: false, settled: false },
        remoteSource: { ready: false, settled: false },
      }),
    ).toEqual({
      connected: true,
      remoteTasksReady: true,
      tasksSettled: true,
    });
  });

  it("builds a task source bundle and resolves task ownership", () => {
    const bundle = createTaskSourceBundle({
      taskOwnerMode: "desktop",
      desktopSource: createDesktopTaskSource(true),
      backendSource: createBackendTaskSource(true, false),
    });
    const remoteTask: Task = {
      id: "remote-1",
      type: "pipeline",
      status: "pending",
      progress: 0,
      created_at: 1,
    };

    expect(bundle.taskSources).toHaveLength(1);
    expect(getTaskSourceForTask(bundle.taskSources, remoteTask)).toBeUndefined();
  });

  it("rejects backend tasks in desktop owner mode", () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(
      normalizeTaskForRenderer(
        {
          id: "remote-1",
          type: "pipeline",
          status: "pending",
          progress: 0,
          created_at: 1,
        },
        "event:update",
        "desktop",
      ),
    ).toBeNull();

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[TaskOwnerMode] Ignoring task remote-1"),
    );
    consoleWarnSpy.mockRestore();
  });

  it("handles desktop task operations and subscriptions", async () => {
    const source = createDesktopTaskSource(true);
    const removeTask = vi.fn();
    const clearTasks = vi.fn();
    const onMessage = vi.fn();
    const onReady = vi.fn();
    const unsubscribe = vi.fn();
    const desktopTask: Task = {
      id: "desktop-1",
      type: "transcribe",
      status: "running",
      progress: 30,
      created_at: 1,
      request_params: { __desktop_worker: true },
    };

    onTaskEventMock.mockImplementation((callback: (payload: unknown) => void) => {
      callback({ type: "update", task: desktopTask });
      return unsubscribe;
    });

    await source.pauseAll([desktopTask]);
    await source.resumeTask(desktopTask.id);
    await source.deleteTask(desktopTask, removeTask);
    await source.clearTasks([desktopTask], removeTask, clearTasks);

    const stop = source.subscribe?.(onMessage, onReady);
    stop?.();

    expect(pauseDesktopTaskMock).toHaveBeenCalledWith("desktop-1");
    expect(resumeDesktopTaskMock).toHaveBeenCalledWith("desktop-1");
    expect(cancelDesktopTaskMock).toHaveBeenCalledWith("desktop-1");
    expect(removeTask).toHaveBeenCalledWith("desktop-1");
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith({ type: "update", task: desktopTask });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("handles backend task bulk operations and cleanup", async () => {
    const sendPause = vi.fn();
    const source = createBackendTaskSource(true, true, sendPause, true);
    const clearTasks = vi.fn();
    const remoteTask: Task = {
      id: "remote-1",
      type: "pipeline",
      status: "pending",
      progress: 0,
      created_at: 1,
    };

    source.pauseTask(remoteTask.id);
    await source.pauseAll([remoteTask]);
    await source.resumeTask(remoteTask.id);
    await source.deleteTask(remoteTask, vi.fn());
    await source.clearTasks([remoteTask], vi.fn(), clearTasks);

    expect(sendPause).toHaveBeenCalledWith("remote-1");
    expect(pauseAllTasksMock).toHaveBeenCalledTimes(1);
    expect(resumeTaskMock).toHaveBeenCalledWith("remote-1");
    expect(deleteTaskMock).toHaveBeenCalledWith("remote-1");
    expect(deleteAllTasksMock).toHaveBeenCalledTimes(1);
    expect(clearTasks).toHaveBeenCalledWith(expect.any(Function));
  });

  it("falls back to HTTP pause when websocket control is unavailable", async () => {
    const source = createBackendTaskSource(true, true);

    await source.pauseTask("remote-1");

    expect(pauseTaskMock).toHaveBeenCalledWith("remote-1");
  });
});
