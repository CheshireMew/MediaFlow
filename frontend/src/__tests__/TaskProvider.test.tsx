/* @vitest-environment jsdom */
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useTaskContext } from "../context/taskContext";
import { SUPPORTED_TASK_CONTRACT_VERSION } from "../context/taskSources";
import type { TaskSocketMessage } from "../hooks/tasks/useTaskStore";

let TaskProvider: typeof import("../context/TaskProvider").TaskProvider;

const useTaskSocketMock = vi.fn();
const pauseAllTasksMock = vi.fn();
const resumeTaskMock = vi.fn();
const deleteTaskMock = vi.fn();
const deleteAllTasksMock = vi.fn();
const listTasksMock = vi.fn();
const getTaskStatusMock = vi.fn();
const sendPauseMock = vi.fn();

vi.mock("../hooks/tasks/useTaskSocket", () => ({
  useTaskSocket: (args: unknown) => useTaskSocketMock(args),
}));

vi.mock("../api/client", () => ({
  apiClient: {
    pauseAllTasks: (...args: unknown[]) => pauseAllTasksMock(...args),
    resumeTask: (...args: unknown[]) => resumeTaskMock(...args),
    deleteTask: (...args: unknown[]) => deleteTaskMock(...args),
    deleteAllTasks: (...args: unknown[]) => deleteAllTasksMock(...args),
    listTasks: (...args: unknown[]) => listTasksMock(...args),
    getTaskStatus: (...args: unknown[]) => getTaskStatusMock(...args),
  },
}));

function Probe() {
  const { tasks, connected, remoteTasksReady, pauseTask, pauseAllTasks } = useTaskContext();
  return (
    <div>
      <div data-testid="connected">{String(connected)}</div>
      <div data-testid="remote-tasks-ready">{String(remoteTasksReady)}</div>
      <div data-testid="task-ids">{tasks.map((task) => task.id).join(",")}</div>
      <div data-testid="task-contracts">
        {tasks.map((task) => `${task.id}:${task.task_contract_version}`).join(",")}
      </div>
      <div data-testid="task-statuses">
        {tasks.map((task) => `${task.id}:${task.status}:${task.progress}`).join(",")}
      </div>
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
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useRealTimers();
    ({ TaskProvider } = await import("../context/TaskProvider"));
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
        primary_operation: "download",
        status: "pending",
        ...backendContractFields(),
        progress: 0,
        created_at: 1,
        request_params: {
          steps: [{ step_name: "download", params: { url: "https://example.com" } }],
        },
      },
    ]);
    getTaskStatusMock.mockResolvedValue({
      id: "remote-task",
      type: "pipeline",
      primary_operation: "download",
      status: "pending",
      ...backendContractFields(),
      progress: 0,
      created_at: 1,
      request_params: {
        steps: [{ step_name: "download", params: { url: "https://example.com" } }],
      },
    });
  });

  function sendSocketMessage(message: TaskSocketMessage) {
    const socketArgs = useTaskSocketMock.mock.calls.at(-1)?.[0] as
      | { onMessage: (message: TaskSocketMessage) => void }
      | undefined;
    if (!socketArgs) {
      throw new Error("Task socket was not mounted");
    }
    act(() => {
      socketArgs.onMessage(message);
    });
  }

  function sendRemoteTaskSnapshot() {
    sendSocketMessage({
      type: "snapshot",
      tasks: [
      {
        id: "remote-task",
        type: "pipeline",
        primary_operation: "download",
        status: "pending",
        ...backendContractFields(),
        progress: 0,
        created_at: 1,
        request_params: {
          steps: [{ step_name: "download", params: { url: "https://example.com" } }],
        },
      },
      ],
    });
  }

  it("loads backend task snapshots", async () => {
    render(
      <TaskProvider enabled>
        <Probe />
      </TaskProvider>,
    );
    sendRemoteTaskSnapshot();

    await waitFor(() => {
      expect(screen.getByTestId("connected").textContent).toBe("true");
      expect(screen.getByTestId("remote-tasks-ready").textContent).toBe("true");
      expect(screen.getByTestId("task-ids").textContent).toBe("remote-task");
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
    sendRemoteTaskSnapshot();

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

  it("reconciles active socket tasks with backend task state by id", async () => {
    const completedTask = {
      id: "remote-task",
      type: "pipeline",
      primary_operation: "download",
      status: "completed",
      ...backendContractFields(),
      persistence_scope: "history",
      lifecycle: "history-only",
      queue_state: "completed",
      progress: 100,
      created_at: 1,
      request_params: {
        steps: [{ step_name: "download", params: { url: "https://example.com" } }],
      },
      result: { success: true, files: [], meta: {} },
    };
    getTaskStatusMock.mockResolvedValue(completedTask);
    listTasksMock.mockResolvedValue([completedTask]);

    render(
      <TaskProvider enabled>
        <Probe />
      </TaskProvider>,
    );

    sendSocketMessage({
      type: "snapshot",
      tasks: [
        {
          id: "remote-task",
          type: "pipeline",
          primary_operation: "download",
          status: "running",
          ...backendContractFields(),
          queue_state: "running",
          progress: 49,
          created_at: 1,
          request_params: {
            steps: [{ step_name: "download", params: { url: "https://example.com" } }],
          },
        },
      ],
    });

    await waitFor(() => {
      expect(getTaskStatusMock).toHaveBeenCalledWith("remote-task");
      expect(screen.getByTestId("task-statuses").textContent).toBe(
        "remote-task:completed:100",
      );
    });
  });

  it("waits for the backend socket snapshot instead of HTTP task polling", async () => {
    render(
      <TaskProvider enabled>
        <Probe />
      </TaskProvider>,
    );

    expect(screen.getByTestId("remote-tasks-ready").textContent).toBe("false");
    expect(screen.getByTestId("task-ids").textContent).toBe("");

    sendRemoteTaskSnapshot();

    await waitFor(() => {
      expect(screen.getByTestId("remote-tasks-ready").textContent).toBe("true");
      expect(screen.getByTestId("task-ids").textContent).toBe("remote-task");
    });
  });
});
