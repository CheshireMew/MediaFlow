/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TaskMonitor } from "../components/TaskMonitor";
import { useRuntimeExecutionStore } from "../stores/runtimeExecutionStore";

const useTaskContextMock = vi.fn();
const pauseLocalTasksMock = vi.fn();
const pauseRemoteTasksMock = vi.fn();
const pauseAllTasksMock = vi.fn();
const clearTasksMock = vi.fn();
const deleteTaskMock = vi.fn();
const pauseTaskMock = vi.fn();
const resumeTaskMock = vi.fn();
const isDesktopRuntimeMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../context/taskContext", () => ({
  useTaskContext: () => useTaskContextMock(),
}));

vi.mock("../services/desktop", () => ({
  isDesktopRuntime: () => isDesktopRuntimeMock(),
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
    useRuntimeExecutionStore.setState({ scopes: {} });
    isDesktopRuntimeMock.mockReturnValue(false);
    useTaskContextMock.mockReturnValue({
      tasks: [
        {
          id: "queued-task",
          type: "transcribe",
          status: "pending",
          progress: 0,
          name: "Queued task",
          message: "Queued",
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
          message: "Processing",
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
          message: "Paused",
          created_at: 1,
          queue_state: "paused",
          queue_position: null,
        },
      ],
      connected: true,
      remoteTasksReady: true,
      tasksSettled: true,
      taskOwnerMode: "backend",
      pauseLocalTasks: pauseLocalTasksMock,
      pauseRemoteTasks: pauseRemoteTasksMock,
      pauseAllTasks: pauseAllTasksMock,
      pauseTask: pauseTaskMock,
      resumeTask: resumeTaskMock,
      addTask: vi.fn(),
      deleteTask: deleteTaskMock,
      clearTasks: clearTasksMock,
    });

    pauseLocalTasksMock.mockResolvedValue(undefined);
    pauseRemoteTasksMock.mockResolvedValue(undefined);
    pauseAllTasksMock.mockResolvedValue({ count: 3 });
    clearTasksMock.mockResolvedValue(undefined);
    deleteTaskMock.mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("renders queue badges and header summary from task context", () => {
    render(<TaskMonitor />);

    expect(screen.getByText("Queue 1")).toBeTruthy();
    expect(screen.getByText("Running 1")).toBeTruthy();
    expect(screen.getByText("Paused 1")).toBeTruthy();

    expect(screen.getByText("Queue #1")).toBeTruthy();
    expect(screen.getAllByText("Running").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Paused").length).toBeGreaterThan(0);
  });

  it("calls pauseTask when pausing a running task card", () => {
    useTaskContextMock.mockReturnValue({
      tasks: [
        {
          id: "queued-task",
          type: "transcribe",
          status: "pending",
          progress: 0,
          name: "Queued task",
          message: "Queued",
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
          message: "Processing",
          created_at: 2,
          queue_state: "running",
          queue_position: null,
        },
      ],
      connected: true,
      remoteTasksReady: true,
      tasksSettled: true,
      taskOwnerMode: "backend",
      pauseLocalTasks: pauseLocalTasksMock,
      pauseRemoteTasks: pauseRemoteTasksMock,
      pauseAllTasks: pauseAllTasksMock,
      pauseTask: pauseTaskMock,
      resumeTask: resumeTaskMock,
      addTask: vi.fn(),
      deleteTask: deleteTaskMock,
      clearTasks: clearTasksMock,
    });

    render(<TaskMonitor />);

    const runningTaskRow = screen.getByText("Running task").closest(".group") as HTMLElement | null;
    if (!runningTaskRow) throw new Error("Running task row not found");

    fireEvent.click(within(runningTaskRow).getByTitle("actions.pause.tooltip"));

    expect(pauseTaskMock).toHaveBeenCalledWith("running-task");
  });

  it("calls pauseLocalTasks after confirming local bulk pause", async () => {
    render(<TaskMonitor />);

    fireEvent.click(screen.getAllByTitle("buttons.pauseLocal.tooltip")[0]);

    await waitFor(() => {
      expect(pauseLocalTasksMock).toHaveBeenCalledTimes(1);
    });
  });

  it("calls pauseRemoteTasks after confirming backend bulk pause", async () => {
    render(<TaskMonitor />);

    fireEvent.click(screen.getAllByTitle("buttons.pauseBackend.tooltip")[0]);

    await waitFor(() => {
      expect(pauseRemoteTasksMock).toHaveBeenCalledTimes(1);
    });
  });

  it("hides backend task controls in desktop single-source mode", () => {
    isDesktopRuntimeMock.mockReturnValue(true);

    render(<TaskMonitor />);

    expect(screen.queryByTitle("buttons.pauseBackend.tooltip")).toBeNull();
    expect(screen.queryByText(/status\.backendTasks/)).toBeNull();
  });

  it("shows active execution mode summary in the monitor header", () => {
    useRuntimeExecutionStore.setState({
      scopes: {
        transcriber: "direct_result",
        translator: "task_submission",
      },
    });

    render(<TaskMonitor />);

    expect(screen.getByText("task_submission 1")).toBeTruthy();
    expect(screen.getByText("direct_result 1")).toBeTruthy();
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

  it("calls deleteTask for a running desktop worker task", async () => {
    useTaskContextMock.mockReturnValue({
      tasks: [
        {
          id: "desktop-task",
          type: "transcribe",
          status: "running",
          progress: 40,
          name: "Desktop task",
          message: "Processing",
          created_at: 2,
          request_params: {
            __desktop_worker: true,
          },
        },
      ],
      connected: false,
      remoteTasksReady: false,
      tasksSettled: false,
      taskOwnerMode: "desktop",
      pauseLocalTasks: pauseLocalTasksMock,
      pauseRemoteTasks: pauseRemoteTasksMock,
      pauseAllTasks: pauseAllTasksMock,
      pauseTask: pauseTaskMock,
      resumeTask: resumeTaskMock,
      addTask: vi.fn(),
      deleteTask: deleteTaskMock,
      clearTasks: clearTasksMock,
    });

    render(<TaskMonitor />);

    const taskRow = screen.getByText("Desktop task").closest(".group") as HTMLElement | null;
    if (!taskRow) throw new Error("Desktop task row not found");

    fireEvent.click(within(taskRow).getByTitle("actions.delete.tooltip"));

    await waitFor(() => {
      expect(deleteTaskMock).toHaveBeenCalledWith("desktop-task");
    });
  });

  it("calls resumeTask for a paused desktop worker task", async () => {
    useTaskContextMock.mockReturnValue({
      tasks: [
        {
          id: "paused-desktop-task",
          type: "transcribe",
          status: "paused",
          progress: 40,
          name: "Paused desktop task",
          message: "Paused",
          created_at: 2,
          request_params: {
            __desktop_worker: true,
          },
        },
      ],
      connected: false,
      remoteTasksReady: false,
      tasksSettled: false,
      taskOwnerMode: "desktop",
      pauseLocalTasks: pauseLocalTasksMock,
      pauseRemoteTasks: pauseRemoteTasksMock,
      pauseAllTasks: pauseAllTasksMock,
      pauseTask: pauseTaskMock,
      resumeTask: resumeTaskMock,
      addTask: vi.fn(),
      deleteTask: deleteTaskMock,
      clearTasks: clearTasksMock,
    });

    render(<TaskMonitor />);

    const taskRow = screen.getByText("Paused desktop task").closest(".group") as HTMLElement | null;
    if (!taskRow) throw new Error("Paused desktop task row not found");

    fireEvent.click(within(taskRow).getByTitle("actions.resume.tooltip"));

    await waitFor(() => {
      expect(resumeTaskMock).toHaveBeenCalledWith("paused-desktop-task");
    });
  });

  it("shows compat path usage summary in dev debug info", () => {
    useTaskContextMock.mockReturnValue({
      tasks: [
        {
          id: "legacy-translate-task",
          type: "translate",
          status: "completed",
          progress: 100,
          task_contract_normalized_from_legacy: true,
          name: "Legacy translate task",
          message: "Completed",
          created_at: 1,
          request_params: {
            context_path: "E:/legacy/source.srt",
            output_path: "E:/legacy/output.mp4",
          },
          result: {
            meta: {
              srt_path: "E:/legacy/output.srt",
            },
          },
        },
      ],
      connected: true,
      remoteTasksReady: true,
      tasksSettled: true,
      taskOwnerMode: "backend",
      pauseLocalTasks: pauseLocalTasksMock,
      pauseRemoteTasks: pauseRemoteTasksMock,
      pauseAllTasks: pauseAllTasksMock,
      pauseTask: pauseTaskMock,
      resumeTask: resumeTaskMock,
      addTask: vi.fn(),
      deleteTask: deleteTaskMock,
      clearTasks: clearTasksMock,
    });

    render(<TaskMonitor />);

    fireEvent.click(screen.getByText("Debug Info"));

    expect(screen.getByText("contract: legacy-normalized")).toBeTruthy();
    expect(screen.queryByText("result.meta_srt_path: legacy_result_output")).toBeNull();
  });
});


