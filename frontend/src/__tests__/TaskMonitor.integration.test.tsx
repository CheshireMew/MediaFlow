/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TaskMonitor } from "../components/TaskMonitor";

const useTaskContextMock = vi.fn();
const pauseAllTasksMock = vi.fn();
const deleteAllTasksMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../context/taskContext", () => ({
  useTaskContext: () => useTaskContextMock(),
}));

vi.mock("../components/TaskTraceView", () => ({
  TaskTraceView: () => <div data-testid="task-trace-view" />,
}));

vi.mock("../api/client", () => ({
  apiClient: {
    pauseAllTasks: (...args: unknown[]) => pauseAllTasksMock(...args),
    deleteAllTasks: (...args: unknown[]) => deleteAllTasksMock(...args),
    resumeTask: vi.fn(),
    deleteTask: vi.fn(),
  },
}));

describe("TaskMonitor integration", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
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
      pauseTask: vi.fn(),
      addTask: vi.fn(),
    });

    pauseAllTasksMock.mockResolvedValue({ count: 3 });
    deleteAllTasksMock.mockResolvedValue({ count: 3 });
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
    const pauseTaskMock = vi.fn();
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
      pauseTask: pauseTaskMock,
      addTask: vi.fn(),
    });

    render(<TaskMonitor />);

    const runningTaskRow = screen.getByText("Running task").closest(".group");
    if (!runningTaskRow) throw new Error("Running task row not found");

    fireEvent.click(within(runningTaskRow).getByTitle("actions.pause.tooltip"));

    expect(pauseTaskMock).toHaveBeenCalledWith("running-task");
  });

  it("calls pauseAllTasks after confirming bulk pause", async () => {
    render(<TaskMonitor />);

    fireEvent.click(screen.getAllByTitle("buttons.pauseAll.tooltip")[0]);

    await waitFor(() => {
      expect(pauseAllTasksMock).toHaveBeenCalledTimes(1);
    });
  });
});
