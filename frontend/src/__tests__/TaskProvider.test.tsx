/* @vitest-environment jsdom */
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TaskProvider } from "../context/TaskProvider";
import { useTaskContext } from "../context/taskContext";
import { SUPPORTED_TASK_CONTRACT_VERSION } from "../context/taskSources";

const useTaskSocketMock = vi.fn();
const listTasksMock = vi.fn();
const pauseAllTasksMock = vi.fn();
const resumeTaskMock = vi.fn();
const deleteTaskMock = vi.fn();
const deleteAllTasksMock = vi.fn();
const sendPauseMock = vi.fn();

vi.mock("../hooks/tasks/useTaskSocket", () => ({
  useTaskSocket: () => useTaskSocketMock(),
}));

vi.mock("../api/client", () => ({
  apiClient: {
    listTasks: (...args: unknown[]) => listTasksMock(...args),
    pauseAllTasks: (...args: unknown[]) => pauseAllTasksMock(...args),
    resumeTask: (...args: unknown[]) => resumeTaskMock(...args),
    deleteTask: (...args: unknown[]) => deleteTaskMock(...args),
    deleteAllTasks: (...args: unknown[]) => deleteAllTasksMock(...args),
  },
}));

function Probe() {
  const { tasks, connected, pauseTask, pauseAllTasks, taskOwnerMode } = useTaskContext();
  return (
    <div>
      <div data-testid="connected">{String(connected)}</div>
      <div data-testid="task-ids">{tasks.map((task) => task.id).join(",")}</div>
      <div data-testid="task-contracts">
        {tasks.map((task) => `${task.id}:${task.task_contract_version}`).join(",")}
      </div>
      <div data-testid="task-owner-mode">{taskOwnerMode}</div>
      <button data-testid="pause-one" onClick={() => void pauseTask("remote-task")} />
      <button data-testid="pause-all" onClick={() => void pauseAllTasks()} />
    </div>
  );
}

function backendContractFields() {
  return {
    task_source: "backend",
    task_contract_version: SUPPORTED_TASK_CONTRACT_VERSION,
    persistence_scope: "runtime",
    lifecycle: "resumable",
    queue_state: "queued",
    queue_position: null,
  } as const;
}

describe("TaskProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    useTaskSocketMock.mockReturnValue({
      connected: true,
      sendPause: sendPauseMock,
    });
    pauseAllTasksMock.mockResolvedValue(undefined);
    resumeTaskMock.mockResolvedValue(undefined);
    deleteTaskMock.mockResolvedValue(undefined);
    deleteAllTasksMock.mockResolvedValue(undefined);
    listTasksMock.mockResolvedValue([
      {
        id: "remote-task",
        type: "pipeline",
        status: "pending",
        ...backendContractFields(),
        progress: 0,
        created_at: 1,
        request_params: {
          steps: [{ step_name: "download", params: { url: "https://example.com" } }],
        },
      },
    ]);
  });

  it("loads tasks only from the backend task owner", async () => {
    render(
      <TaskProvider enabled>
        <Probe />
      </TaskProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("connected").textContent).toBe("true");
      expect(screen.getByTestId("task-ids").textContent).toBe("remote-task");
      expect(screen.getByTestId("task-owner-mode").textContent).toBe("backend");
      expect(screen.getByTestId("task-contracts").textContent).toBe(
        `remote-task:${SUPPORTED_TASK_CONTRACT_VERSION}`,
      );
    });
  });

  it("uses the backend socket/API for task control", async () => {
    render(
      <TaskProvider enabled>
        <Probe />
      </TaskProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("task-ids").textContent).toBe("remote-task");
    });

    await act(async () => {
      screen.getByTestId("pause-one").click();
      screen.getByTestId("pause-all").click();
    });

    expect(sendPauseMock).toHaveBeenCalledWith("remote-task");
    expect(pauseAllTasksMock).toHaveBeenCalledTimes(1);
  });

  it("polls the backend while active tasks exist", async () => {
    vi.useFakeTimers();

    render(
      <TaskProvider enabled>
        <Probe />
      </TaskProvider>,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(listTasksMock).toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
      await Promise.resolve();
    });

    expect(listTasksMock.mock.calls.length).toBeGreaterThan(1);
  });
});
