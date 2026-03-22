/* @vitest-environment jsdom */
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TaskProvider } from "../context/TaskProvider";
import { useTaskContext } from "../context/taskContext";
import { SUPPORTED_TASK_CONTRACT_VERSION } from "../context/taskSources";

const useTaskSocketMock = vi.fn();
const listDesktopTasksMock = vi.fn();
const onTaskEventMock = vi.fn();
const listTasksMock = vi.fn();
const isDesktopRuntimeMock = vi.fn();
const pauseDesktopTaskMock = vi.fn();
const resumeDesktopTaskMock = vi.fn();
const cancelDesktopTaskMock = vi.fn();
const pauseAllTasksMock = vi.fn();
const pauseTaskApiMock = vi.fn();
const resumeTaskMock = vi.fn();
const deleteTaskMock = vi.fn();
const deleteAllTasksMock = vi.fn();
const sendPauseMock = vi.fn();

vi.mock("../hooks/tasks/useTaskSocket", () => ({
  useTaskSocket: () => useTaskSocketMock(),
}));

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
  isDesktopRuntime: () => isDesktopRuntimeMock(),
}));

vi.mock("../api/client", () => ({
  apiClient: {
    listTasks: (...args: unknown[]) => listTasksMock(...args),
    pauseAllTasks: (...args: unknown[]) => pauseAllTasksMock(...args),
    pauseTask: (...args: unknown[]) => pauseTaskApiMock(...args),
    resumeTask: (...args: unknown[]) => resumeTaskMock(...args),
    deleteTask: (...args: unknown[]) => deleteTaskMock(...args),
    deleteAllTasks: (...args: unknown[]) => deleteAllTasksMock(...args),
  },
}));

function Probe() {
  const { tasks, connected, pauseTask, taskOwnerMode } = useTaskContext();
  return (
    <div>
      <div data-testid="connected">{String(connected)}</div>
      <div data-testid="task-ids">{tasks.map((task) => task.id).join(",")}</div>
      <div data-testid="task-contracts">
        {tasks.map((task) => `${task.id}:${task.task_contract_version ?? "missing"}`).join(",")}
      </div>
      <div data-testid="task-owner-mode">{taskOwnerMode}</div>
      <button data-testid="pause-remote" onClick={() => void pauseTask("remote-task")} />
      <button data-testid="pause-local" onClick={() => void pauseTask("desktop-task")} />
    </div>
  );
}

describe("TaskProvider", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    isDesktopRuntimeMock.mockReturnValue(true);
    useTaskSocketMock.mockReturnValue({
      connected: false,
      sendPause: sendPauseMock,
    });
    pauseDesktopTaskMock.mockResolvedValue(undefined);
    resumeDesktopTaskMock.mockResolvedValue(undefined);
    cancelDesktopTaskMock.mockResolvedValue(undefined);
    pauseAllTasksMock.mockResolvedValue(undefined);
    pauseTaskApiMock.mockResolvedValue(undefined);
    resumeTaskMock.mockResolvedValue(undefined);
    deleteTaskMock.mockResolvedValue(undefined);
    deleteAllTasksMock.mockResolvedValue(undefined);
    listDesktopTasksMock.mockResolvedValue([
      {
        id: "desktop-task",
        type: "transcribe",
        status: "running",
        progress: 20,
        created_at: 2,
        request_params: { __desktop_worker: true, audio_path: "desktop.wav" },
      },
    ]);
    listTasksMock.mockResolvedValue([
      {
        id: "remote-task",
        type: "pipeline",
        status: "pending",
        progress: 0,
        created_at: 1,
        request_params: {
          steps: [{ step_name: "download", params: { url: "https://example.com" } }],
        },
      },
    ]);
    onTaskEventMock.mockReturnValue(() => undefined);
  });

  it("keeps desktop runtime scoped to desktop tasks only", async () => {
    render(
      <TaskProvider enabled>
        <Probe />
      </TaskProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("connected").textContent).toBe("true");
      expect(screen.getByTestId("task-ids").textContent).toBe("desktop-task");
      expect(screen.getByTestId("task-owner-mode").textContent).toBe("desktop");
      expect(screen.getByTestId("task-contracts").textContent).toBe(
        `desktop-task:${SUPPORTED_TASK_CONTRACT_VERSION}`,
      );
    });
    expect(listTasksMock).not.toHaveBeenCalled();
  });

  it("does not poll backend tasks in desktop runtime", async () => {
    vi.useFakeTimers();
    listTasksMock.mockResolvedValue([
      {
        id: "remote-task",
        type: "pipeline",
        status: "completed",
        progress: 100,
        created_at: 1,
        request_params: {
          steps: [{ step_name: "download", params: { url: "https://example.com" } }],
        },
      },
    ]);

    render(
      <TaskProvider enabled>
        <Probe />
      </TaskProvider>,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId("task-ids").textContent).toBe("desktop-task");

    await vi.advanceTimersByTimeAsync(6000);
    expect(listTasksMock).toHaveBeenCalledTimes(0);
  });

  it("routes desktop pause actions only through the desktop task source", async () => {
    render(
      <TaskProvider enabled>
        <Probe />
      </TaskProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("task-ids").textContent).toBe("desktop-task");
    });

    await act(async () => {
      screen.getByTestId("pause-local").click();
      screen.getByTestId("pause-remote").click();
    });

    expect(pauseDesktopTaskMock).toHaveBeenCalledWith("desktop-task");
    expect(pauseTaskApiMock).not.toHaveBeenCalled();
    expect(sendPauseMock).not.toHaveBeenCalled();
  });

  it("retries the initial backend snapshot in desktop runtime until it succeeds", async () => {
    vi.useFakeTimers();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      render(
        <TaskProvider enabled>
          <Probe />
        </TaskProvider>,
      );

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(listTasksMock).toHaveBeenCalledTimes(0);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
        await Promise.resolve();
      });

      expect(listTasksMock).toHaveBeenCalledTimes(0);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("still polls backend tasks outside desktop runtime", async () => {
    vi.useFakeTimers();
    isDesktopRuntimeMock.mockReturnValue(false);
    useTaskSocketMock.mockReturnValue({
      connected: true,
      sendPause: sendPauseMock,
    });

    render(
      <TaskProvider enabled>
        <Probe />
      </TaskProvider>,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(listTasksMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
      await Promise.resolve();
    });

    expect(listTasksMock).toHaveBeenCalledTimes(3);
  });

  it("ignores backend task events in desktop owner mode", async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    onTaskEventMock.mockImplementation((callback: (payload: unknown) => void) => {
      callback({
        type: "update",
        task: {
          id: "remote-task",
          type: "pipeline",
          status: "pending",
          progress: 0,
          created_at: 3,
        },
      });
      return () => undefined;
    });

    render(
      <TaskProvider enabled>
        <Probe />
      </TaskProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("task-ids").textContent).toBe("desktop-task");
    });

    expect(screen.getByTestId("task-ids").textContent).not.toContain("remote-task");
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[TaskOwnerMode] Ignoring task remote-task"),
    );
    consoleWarnSpy.mockRestore();
  });
});
