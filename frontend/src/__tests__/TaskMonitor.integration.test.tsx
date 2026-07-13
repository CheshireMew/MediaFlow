/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TaskMonitor } from "../components/TaskMonitor";
import { useRuntimeExecutionStore } from "../stores/runtimeExecutionStore";

const useTaskContextMock = vi.fn();
const pauseAllTasksMock = vi.fn();
const clearTasksMock = vi.fn();
const deleteTaskMock = vi.fn();
const pauseTaskMock = vi.fn();
const resumeTaskMock = vi.fn();
const retryTaskMock = vi.fn();
const addTaskMock = vi.fn();
const canRetryTaskMock = vi.fn();
const confirmActionMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../context/taskContext", () => ({
  useTaskContext: () => useTaskContextMock(),
}));

vi.mock("../components/ui/confirmationContext", () => ({
  useConfirmation: () => confirmActionMock,
}));

vi.mock("../services/tasks/retry", () => ({
  canRetryTask: (...args: unknown[]) => canRetryTaskMock(...args),
}));

vi.mock("../utils/toast", () => ({
  toast: { error: (...args: unknown[]) => toastErrorMock(...args) },
}));

vi.mock("../components/TaskTraceView", () => ({
  TaskTraceView: () => <div data-testid="task-trace-view" />,
}));

describe("TaskMonitor integration", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    confirmActionMock.mockResolvedValue(true);
    useRuntimeExecutionStore.setState({ scopes: {} });
    useTaskContextMock.mockReturnValue({
      tasks: [
        {
          id: "queued-task",
          type: "transcribe",
          status: "pending",
          progress: 0,
          name: "Queued task",
          message_code: "queued",
          message_params: {},
          created_at: 3,
          queue_state: "queued",
          queue_position: 1,
        },
        {
          id: "running-task",
          type: "transcribe",
          status: "running",
          progress: 40,
          name: "Running task",
          message_code: "running",
          message_params: {},
          created_at: 2,
          queue_state: "running",
          queue_position: null,
        },
        {
          id: "paused-task",
          type: "translate",
          status: "paused",
          progress: 25,
          name: "Paused task",
          message_code: "paused",
          message_params: {},
          created_at: 1,
          queue_state: "paused",
          queue_position: null,
        },
      ],
      connected: true,
      remoteTasksReady: true,
      tasksSettled: true,
      pauseAllTasks: pauseAllTasksMock,
      pauseTask: pauseTaskMock,
      resumeTask: resumeTaskMock,
      retryTask: retryTaskMock,
      addTask: addTaskMock,
      deleteTask: deleteTaskMock,
      clearTasks: clearTasksMock,
    });

    pauseAllTasksMock.mockResolvedValue({ count: 3 });
    clearTasksMock.mockResolvedValue(undefined);
    deleteTaskMock.mockResolvedValue(undefined);
    addTaskMock.mockReset();
    canRetryTaskMock.mockReset();
    retryTaskMock.mockReset();
    canRetryTaskMock.mockReturnValue(false);
    retryTaskMock.mockResolvedValue(undefined);
  });

  it("renders queue badges and header summary from task context", () => {
    render(<TaskMonitor />);

    expect(screen.getByText("queue.pending 1")).toBeTruthy();
    expect(screen.getByText("queue.running 1")).toBeTruthy();
    expect(screen.getByText("queue.paused 1")).toBeTruthy();

    expect(screen.getByText("queue.position")).toBeTruthy();
    expect(screen.getAllByText("queue.running").length).toBeGreaterThan(0);
    expect(screen.getAllByText("queue.paused").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "actions.pause.tooltip" })).toHaveLength(2);
    expect(
      screen.getAllByRole("progressbar", { name: "progress.label" })
        .some((progressbar) => progressbar.getAttribute("aria-valuenow") === "40"),
    ).toBe(true);
  });

  it("calls pauseTask when pausing a running task card", async () => {
    useTaskContextMock.mockReturnValue({
      tasks: [
        {
          id: "queued-task",
          type: "transcribe",
          status: "pending",
          progress: 0,
          name: "Queued task",
          message_code: "queued",
          message_params: {},
          created_at: 3,
          queue_state: "queued",
          queue_position: 1,
        },
        {
          id: "running-task",
          type: "transcribe",
          status: "running",
          progress: 40,
          name: "Running task",
          message_code: "running",
          message_params: {},
          created_at: 2,
          queue_state: "running",
          queue_position: null,
        },
      ],
      connected: true,
      remoteTasksReady: true,
      tasksSettled: true,
      pauseAllTasks: pauseAllTasksMock,
      pauseTask: pauseTaskMock,
      resumeTask: resumeTaskMock,
      retryTask: retryTaskMock,
      addTask: addTaskMock,
      deleteTask: deleteTaskMock,
      clearTasks: clearTasksMock,
    });

    render(<TaskMonitor />);

    const runningTaskRow = screen.getByText("Running task").closest(".group") as HTMLElement | null;
    if (!runningTaskRow) throw new Error("Running task row not found");

    fireEvent.click(within(runningTaskRow).getByTitle("actions.pause.tooltip"));

    await waitFor(() => {
      expect(pauseTaskMock).toHaveBeenCalledWith("running-task");
    });
  });

  it("shows visible feedback when pausing a task fails", async () => {
    pauseTaskMock.mockRejectedValueOnce(new Error("backend offline"));

    render(<TaskMonitor />);
    const runningTaskRow = screen.getByText("Running task").closest(".group") as HTMLElement;
    fireEvent.click(within(runningTaskRow).getByTitle("actions.pause.tooltip"));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("messages.pauseFailed");
    });
  });

  it("renders a single backend task source", () => {
    render(<TaskMonitor />);

    expect(screen.queryByText(/status\.tasks/)).toBeTruthy();
  });

  it("shows active execution mode summary in the monitor header", () => {
    useRuntimeExecutionStore.setState({
      scopes: {
        translator: "task_submission",
      },
    });

    render(<TaskMonitor />);

    expect(screen.getByText("executionMode.taskSubmission 1")).toBeTruthy();
  });

  it("calls pauseAllTasks after confirming bulk pause", async () => {
    render(<TaskMonitor />);

    fireEvent.click(screen.getAllByTitle("buttons.pauseAll.tooltip")[0]);

    await waitFor(() => {
      expect(pauseAllTasksMock).toHaveBeenCalledTimes(1);
    });
  });

  it("calls clearTasks after confirming bulk delete", async () => {
    render(<TaskMonitor />);

    fireEvent.click(screen.getAllByTitle("buttons.clearAll.tooltip")[0]);

    await waitFor(() => {
      expect(clearTasksMock).toHaveBeenCalledTimes(1);
    });
  });

  it("calls deleteTask for a running backend task", async () => {
    useTaskContextMock.mockReturnValue({
      tasks: [
        {
          id: "backend-task",
          type: "transcribe",
          status: "running",
          progress: 40,
          name: "Backend task",
          message_code: "running",
          message_params: {},
          created_at: 2,
          request_params: {
          },
        },
      ],
      connected: false,
      remoteTasksReady: false,
      tasksSettled: false,
      pauseAllTasks: pauseAllTasksMock,
      pauseTask: pauseTaskMock,
      resumeTask: resumeTaskMock,
      retryTask: retryTaskMock,
      addTask: addTaskMock,
      deleteTask: deleteTaskMock,
      clearTasks: clearTasksMock,
    });

    render(<TaskMonitor />);

    const taskRow = screen.getByText("Backend task").closest(".group") as HTMLElement | null;
    if (!taskRow) throw new Error("Backend task row not found");

    fireEvent.click(within(taskRow).getByTitle("actions.delete.tooltip"));

    await waitFor(() => {
      expect(deleteTaskMock).toHaveBeenCalledWith("backend-task");
    });
  });

  it("calls resumeTask for a paused backend task", async () => {
    useTaskContextMock.mockReturnValue({
      tasks: [
        {
          id: "paused-backend-task",
          type: "transcribe",
          status: "paused",
          progress: 40,
          name: "Paused backend task",
          message_code: "paused",
          message_params: {},
          created_at: 2,
          request_params: {
          },
        },
      ],
      connected: false,
      remoteTasksReady: false,
      tasksSettled: false,
      pauseAllTasks: pauseAllTasksMock,
      pauseTask: pauseTaskMock,
      resumeTask: resumeTaskMock,
      retryTask: retryTaskMock,
      addTask: addTaskMock,
      deleteTask: deleteTaskMock,
      clearTasks: clearTasksMock,
    });

    render(<TaskMonitor />);

    const taskRow = screen.getByText("Paused backend task").closest(".group") as HTMLElement | null;
    if (!taskRow) throw new Error("Paused backend task row not found");

    fireEvent.click(within(taskRow).getByTitle("actions.resume.tooltip"));

    await waitFor(() => {
      expect(resumeTaskMock).toHaveBeenCalledWith("paused-backend-task");
    });
  });

  it("retries a failed download task from the resume button", async () => {
    canRetryTaskMock.mockReturnValue(true);
    useTaskContextMock.mockReturnValue({
      tasks: [
        {
          id: "failed-download-task",
          type: "download",
          status: "failed",
          progress: 0,
          name: "Failed download task",
          message_code: "failed",
          message_params: {},
          error: "network error",
          created_at: 2,
          request_params: {
            url: "https://example.com/video",
            download_subs: true,
            resolution: "best",
            codec: "best",
          },
        },
      ],
      connected: true,
      remoteTasksReady: true,
      tasksSettled: true,
      pauseAllTasks: pauseAllTasksMock,
      pauseTask: pauseTaskMock,
      resumeTask: resumeTaskMock,
      retryTask: retryTaskMock,
      addTask: addTaskMock,
      deleteTask: deleteTaskMock,
      clearTasks: clearTasksMock,
    });

    render(<TaskMonitor />);

    const taskRow = screen.getByText("Failed download task").closest(".group") as HTMLElement | null;
    if (!taskRow) throw new Error("Failed download task row not found");

    fireEvent.click(within(taskRow).getByTitle("actions.resume.tooltip"));

    await waitFor(() => {
      expect(retryTaskMock).toHaveBeenCalledWith("failed-download-task");
    });

    expect(resumeTaskMock).not.toHaveBeenCalled();
  });

  it("shows retry button for other retryable failed tasks", async () => {
    canRetryTaskMock.mockImplementation((task) => task.id === "failed-translate-task");
    useTaskContextMock.mockReturnValue({
      tasks: [
        {
          id: "failed-translate-task",
          type: "translate",
          status: "failed",
          progress: 0,
          name: "Failed translate task",
          message_code: "failed",
          message_params: {},
          error: "provider error",
          created_at: 2,
        },
      ],
      connected: true,
      remoteTasksReady: true,
      tasksSettled: true,
      pauseAllTasks: pauseAllTasksMock,
      pauseTask: pauseTaskMock,
      resumeTask: resumeTaskMock,
      retryTask: retryTaskMock,
      addTask: addTaskMock,
      deleteTask: deleteTaskMock,
      clearTasks: clearTasksMock,
    });

    render(<TaskMonitor />);

    const taskRow = screen.getByText("Failed translate task").closest(".group") as HTMLElement | null;
    if (!taskRow) throw new Error("Failed translate task row not found");

    fireEvent.click(within(taskRow).getByTitle("actions.resume.tooltip"));

    await waitFor(() => {
      expect(retryTaskMock).toHaveBeenCalledWith("failed-translate-task");
    });
  });

});
