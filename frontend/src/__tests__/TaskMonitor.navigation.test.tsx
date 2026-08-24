/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TaskMonitor } from "../components/TaskMonitor";
import { BACKEND_TASK_CONTRACT_FIELDS } from "./testFixtures";
import { installElectronMock } from "./testUtils/electronMock";

const useTaskContextMock = vi.fn();
const confirmActionMock = vi.fn().mockResolvedValue(true);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../context/taskContext", () => ({
  useTaskActions: () => useTaskContextMock(),
  useTaskStatus: () => useTaskContextMock(),
}));

vi.mock("../context/taskStoreContext", () => ({
  useTasks: () => useTaskContextMock().tasks,
  useTaskById: (taskId: string | null) =>
    useTaskContextMock().tasks.find((task: { id: string }) => task.id === taskId) ?? null,
}));

vi.mock("../components/ui/confirmationContext", () => ({
  useConfirmation: () => confirmActionMock,
}));

vi.mock("../components/TaskTraceView", () => ({
  TaskTraceView: () => <div data-testid="task-trace-view" />,
}));

describe("TaskMonitor navigation actions", () => {
  const artifact = (
    kind: "video" | "audio" | "subtitle" | "image" | "file",
    role: "input" | "output" | "context",
    path: string,
    name: string,
  ) => ({ kind, role, ref: { path, name } });

  const expectNavigationPayload = (payload: unknown, expected: {
    target: "translator" | "editor" | "transcriber";
    videoRef: { path: string; name: string };
    subtitleRef: { path: string; name: string } | null;
  }) => {
    expect(payload).toMatchObject({
      target: expected.target,
      video_ref: expected.videoRef,
      subtitle_ref: expected.subtitleRef,
    });
  };

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    installElectronMock({
      getFileSize: vi.fn(async (targetPath: string) => {
        if (targetPath === "E:/sample.mp4" || targetPath === "E:/sample.srt") {
          return 1024;
        }
        throw new Error(`Missing file: ${targetPath}`);
      }),
    });
    useTaskContextMock.mockReturnValue({
      tasks: [
        {
          ...BACKEND_TASK_CONTRACT_FIELDS,
          id: "task-1",
          type: "pipeline",
          primary_operation: "download",
          status: "completed",
          progress: 100,
          name: "Transcribe sample.mp4",
          message_code: "pipeline_completed",
          message_params: {},
          created_at: Date.now(),
          request_params: { steps: [] },
          result: {
            success: true,
            artifacts: [
              artifact("video", "output", "E:/sample.mp4", "sample.mp4"),
              artifact("subtitle", "output", "E:/sample.srt", "sample.srt"),
            ],
            outputs: {},
          },
          artifacts: [
            artifact("video", "output", "E:/sample.mp4", "sample.mp4"),
            artifact("subtitle", "output", "E:/sample.srt", "sample.srt"),
          ],
        },
      ],
      connected: true,
      remoteTasksReady: true,
      tasksSettled: true,
      pauseAllTasks: vi.fn(),
      pauseTask: vi.fn(),
      resumeTask: vi.fn(),
      addTask: vi.fn(),
      deleteTask: vi.fn(),
      clearTasks: vi.fn(),
    });
  });

  it("dispatches translator navigation payload from a completed task and persists session storage", async () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    render(<TaskMonitor />);

    fireEvent.click(screen.getAllByTitle("actions.translate.tooltip")[0]);

    await waitFor(() => {
      expectNavigationPayload(
        JSON.parse(sessionStorage.getItem("mediaflow:pending_file") || "null"),
        {
          target: "translator",
          videoRef: {
            path: "E:/sample.mp4",
            name: "sample.mp4",
          },
          subtitleRef: {
            path: "E:/sample.srt",
            name: "sample.srt",
          },
        },
      );
    });
    const translatorEvent = dispatchSpy.mock.calls[0]?.[0] as CustomEvent;
    expect(translatorEvent.type).toBe("mediaflow:navigate");
    expect(translatorEvent.detail).toMatchObject({
      destination: "translator",
      payload: {
        video_ref: {
          path: "E:/sample.mp4",
          name: "sample.mp4",
        },
        subtitle_ref: {
          path: "E:/sample.srt",
          name: "sample.srt",
        },
      },
    });
  });

  it("dispatches editor navigation payload from a completed task and persists session storage", async () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    render(<TaskMonitor />);

    fireEvent.click(screen.getAllByTitle("actions.edit.tooltip")[0]);

    await waitFor(() => {
      expectNavigationPayload(
        JSON.parse(sessionStorage.getItem("mediaflow:pending_file") || "null"),
        {
          target: "editor",
          videoRef: {
            path: "E:/sample.mp4",
            name: "sample.mp4",
          },
          subtitleRef: {
            path: "E:/sample.srt",
            name: "sample.srt",
          },
        },
      );
    });
    const editorEvent = dispatchSpy.mock.calls[0]?.[0] as CustomEvent;
    expect(editorEvent.type).toBe("mediaflow:navigate");
    expect(editorEvent.detail).toMatchObject({
      destination: "editor",
      payload: {
        video_ref: {
          path: "E:/sample.mp4",
          name: "sample.mp4",
        },
        subtitle_ref: {
          path: "E:/sample.srt",
          name: "sample.srt",
        },
      },
    });
  });

  it("dispatches transcriber navigation payload from a completed task and persists session storage", async () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    render(<TaskMonitor />);

    fireEvent.click(screen.getAllByTitle("actions.transcribe.tooltip")[0]);

    await waitFor(() => {
      expectNavigationPayload(
        JSON.parse(sessionStorage.getItem("mediaflow:pending_file") || "null"),
        {
          target: "transcriber",
          videoRef: {
            path: "E:/sample.mp4",
            name: "sample.mp4",
          },
          subtitleRef: {
            path: "E:/sample.srt",
            name: "sample.srt",
          },
        },
      );
    });
    const transcriberEvent = dispatchSpy.mock.calls[0]?.[0] as CustomEvent;
    expect(transcriberEvent.type).toBe("mediaflow:navigate");
    expect(transcriberEvent.detail).toMatchObject({
      destination: "transcriber",
      payload: {
        video_ref: {
          path: "E:/sample.mp4",
          name: "sample.mp4",
        },
        subtitle_ref: {
          path: "E:/sample.srt",
          name: "sample.srt",
        },
      },
    });
  });

  it("opens the synthesized video folder when subtitle artifacts also have output role", async () => {
    const electronMock = installElectronMock({
      getFileSize: vi.fn(async (targetPath: string) => {
        if (targetPath === "E:/renders/source_synthesized.mp4" || targetPath === "E:/source/source.srt") {
          return 1024;
        }
        throw new Error(`Missing file: ${targetPath}`);
      }),
    });
    useTaskContextMock.mockReturnValue({
      tasks: [
        {
          ...BACKEND_TASK_CONTRACT_FIELDS,
          id: "task-synthesis-folder",
          type: "pipeline",
          primary_operation: "synthesis",
          status: "completed",
          progress: 100,
          name: "Synthesize source.mp4",
          message_code: "pipeline_completed",
          message_params: {},
          created_at: Date.now(),
          request_params: { steps: [] },
          result: {
            success: true,
            artifacts: [
              artifact("subtitle", "output", "E:/source/source.srt", "source.srt"),
              artifact("video", "output", "E:/renders/source_synthesized.mp4", "source_synthesized.mp4"),
            ],
            outputs: {},
          },
          artifacts: [
            artifact("video", "input", "E:/source/source.mp4", "source.mp4"),
            artifact("subtitle", "output", "E:/source/source.srt", "source.srt"),
            artifact("video", "output", "E:/renders/source_synthesized.mp4", "source_synthesized.mp4"),
          ],
        },
      ],
      connected: true,
      remoteTasksReady: true,
      tasksSettled: true,
      pauseAllTasks: vi.fn(),
      pauseTask: vi.fn(),
      resumeTask: vi.fn(),
      addTask: vi.fn(),
      deleteTask: vi.fn(),
      clearTasks: vi.fn(),
    });

    render(<TaskMonitor />);

    fireEvent.click(screen.getByTitle("actions.showFolder.tooltip"));

    await waitFor(() => {
      expect(electronMock.showInExplorer).toHaveBeenCalledWith("E:/renders/source_synthesized.mp4");
    });
    expect(electronMock.showInExplorer).not.toHaveBeenCalledWith("E:/source/source.srt");
  });

  it("navigates from the published video output artifact", async () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    useTaskContextMock.mockReturnValue({
      tasks: [
        {
          ...BACKEND_TASK_CONTRACT_FIELDS,
          id: "task-2",
          type: "pipeline",
          primary_operation: "download",
          status: "completed",
          progress: 100,
          name: "Download sample.mp4",
          message_code: "pipeline_completed",
          message_params: {},
          created_at: Date.now(),
          request_params: { url: "https://example.com/video" },
          result: {
            success: true,
            artifacts: [artifact("video", "output", "E:/sample.mp4", "sample.mp4")],
            outputs: {},
          },
          artifacts: [artifact("video", "output", "E:/sample.mp4", "sample.mp4")],
        },
      ],
      connected: true,
      remoteTasksReady: true,
      tasksSettled: true,
      pauseAllTasks: vi.fn(),
      pauseTask: vi.fn(),
      resumeTask: vi.fn(),
      addTask: vi.fn(),
      deleteTask: vi.fn(),
      clearTasks: vi.fn(),
    });

    render(<TaskMonitor />);

    fireEvent.click(screen.getAllByTitle("actions.transcribe.tooltip")[0]);

    await waitFor(() => {
      expectNavigationPayload(
        JSON.parse(sessionStorage.getItem("mediaflow:pending_file") || "null"),
        {
          target: "transcriber",
          videoRef: {
            path: "E:/sample.mp4",
            name: "sample.mp4",
          },
          subtitleRef: null,
        },
      );
    });
    const recoveredEvent = dispatchSpy.mock.calls[0]?.[0] as CustomEvent;
    expect(recoveredEvent.type).toBe("mediaflow:navigate");
    expect(recoveredEvent.detail).toMatchObject({
      destination: "transcriber",
      payload: {
        video_ref: {
          path: "E:/sample.mp4",
          name: "sample.mp4",
        },
        subtitle_ref: null,
      },
    });
  });

  it("navigates with the published video and subtitle artifacts", async () => {
    installElectronMock({
      getFileSize: vi.fn(async (targetPath: string) => {
        if (
          targetPath === "E:/canonical/sample.mp4"
          || targetPath === "E:/canonical/sample_ZH-CN.srt"
        ) {
          return 1024;
        }
        throw new Error(`Missing file: ${targetPath}`);
      }),
    });
    useTaskContextMock.mockReturnValue({
      tasks: [
        {
          ...BACKEND_TASK_CONTRACT_FIELDS,
          id: "task-3",
          type: "pipeline",
          primary_operation: "translate",
          status: "completed",
          progress: 100,
          name: "Translate sample.mp4",
          message_code: "pipeline_completed",
          message_params: {},
          created_at: Date.now(),
          request_params: { steps: [] },
          result: {
            success: true,
            artifacts: [
              artifact("video", "output", "E:/canonical/sample.mp4", "sample.mp4"),
              artifact("subtitle", "output", "E:/canonical/sample_ZH-CN.srt", "sample_ZH-CN.srt"),
            ],
            outputs: {},
          },
          artifacts: [
            artifact("video", "output", "E:/canonical/sample.mp4", "sample.mp4"),
            artifact("subtitle", "output", "E:/canonical/sample_ZH-CN.srt", "sample_ZH-CN.srt"),
          ],
        },
      ],
      connected: true,
      remoteTasksReady: true,
      tasksSettled: true,
      pauseAllTasks: vi.fn(),
      pauseTask: vi.fn(),
      resumeTask: vi.fn(),
      addTask: vi.fn(),
      deleteTask: vi.fn(),
      clearTasks: vi.fn(),
    });

    render(<TaskMonitor />);

    fireEvent.click(screen.getAllByTitle("actions.edit.tooltip")[0]);

    await waitFor(() => {
      expectNavigationPayload(
        JSON.parse(sessionStorage.getItem("mediaflow:pending_file") || "null"),
        {
          target: "editor",
          videoRef: {
            path: "E:/canonical/sample.mp4",
            name: "sample.mp4",
          },
          subtitleRef: {
            path: "E:/canonical/sample_ZH-CN.srt",
            name: "sample_ZH-CN.srt",
          },
        },
      );
    });
  });

  it("falls back to an existing input when the recorded output was deleted", async () => {
    installElectronMock({
      getFileSize: vi.fn(async (targetPath: string) => {
        if (targetPath === "E:/source/source.mp4") return 1024;
        throw new Error(`Missing file: ${targetPath}`);
      }),
    });
    useTaskContextMock.mockReturnValue({
      tasks: [{
        ...BACKEND_TASK_CONTRACT_FIELDS,
        id: "task-missing-output",
        type: "pipeline",
        primary_operation: "synthesis",
        status: "completed",
        progress: 100,
        name: "Synthesize source.mp4",
        message_code: "pipeline_completed",
        message_params: {},
        created_at: Date.now(),
        request_params: { steps: [] },
        result: { success: true, artifacts: [], outputs: {} },
        artifacts: [
          artifact("video", "output", "E:/renders/missing.mp4", "missing.mp4"),
          artifact("video", "input", "E:/source/source.mp4", "source.mp4"),
        ],
      }],
      connected: true,
      remoteTasksReady: true,
      tasksSettled: true,
      pauseAllTasks: vi.fn(),
      pauseTask: vi.fn(),
      resumeTask: vi.fn(),
      addTask: vi.fn(),
      deleteTask: vi.fn(),
      clearTasks: vi.fn(),
    });

    render(<TaskMonitor />);
    fireEvent.click(screen.getByTitle("actions.edit.tooltip"));

    await waitFor(() => {
      expectNavigationPayload(
        JSON.parse(sessionStorage.getItem("mediaflow:pending_file") || "null"),
        {
          target: "editor",
          videoRef: { path: "E:/source/source.mp4", name: "source.mp4" },
          subtitleRef: null,
        },
      );
    });
  });

  it("opens an empty recovery page when every recorded file is missing", async () => {
    installElectronMock({
      getFileSize: vi.fn(async () => {
        throw new Error("Missing file");
      }),
    });
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    useTaskContextMock.mockReturnValue({
      tasks: [{
        ...BACKEND_TASK_CONTRACT_FIELDS,
        id: "task-all-files-missing",
        type: "pipeline",
        primary_operation: "download",
        status: "completed",
        progress: 100,
        name: "Download missing.mp4",
        message_code: "pipeline_completed",
        message_params: {},
        created_at: Date.now(),
        request_params: { steps: [] },
        result: { success: true, artifacts: [], outputs: {} },
        artifacts: [artifact("video", "output", "E:/missing.mp4", "missing.mp4")],
      }],
      connected: true,
      remoteTasksReady: true,
      tasksSettled: true,
      pauseAllTasks: vi.fn(),
      pauseTask: vi.fn(),
      resumeTask: vi.fn(),
      addTask: vi.fn(),
      deleteTask: vi.fn(),
      clearTasks: vi.fn(),
    });

    render(<TaskMonitor />);
    fireEvent.click(screen.getByTitle("actions.edit.tooltip"));

    await waitFor(() => {
      const navigationEvent = dispatchSpy.mock.calls
        .map(([event]) => event as CustomEvent)
        .find((event) => event.type === "mediaflow:navigate");
      expect(navigationEvent?.detail).toMatchObject({
        destination: "editor",
        payload: { video_ref: null, subtitle_ref: null },
      });
    });
  });

  it("shows a history badge for persisted backend history tasks", () => {
    useTaskContextMock.mockReturnValue({
      tasks: [
        {
          ...BACKEND_TASK_CONTRACT_FIELDS,
          id: "task-history",
          type: "pipeline",
          primary_operation: "download",
          status: "completed",
          persistence_scope: "history",
          progress: 100,
          name: "Download sample.mp4",
          message_code: "completed",
          message_params: {},
          created_at: Date.now(),
          request_params: {
            url: "https://example.com/video",
          },
          result: {
            success: true,
            artifacts: [artifact("video", "output", "E:/sample.mp4", "sample.mp4")],
            outputs: {},
          },
          artifacts: [artifact("video", "output", "E:/sample.mp4", "sample.mp4")],
        },
      ],
      connected: true,
      remoteTasksReady: true,
      tasksSettled: true,
      pauseAllTasks: vi.fn(),
      pauseTask: vi.fn(),
      resumeTask: vi.fn(),
      addTask: vi.fn(),
      deleteTask: vi.fn(),
      clearTasks: vi.fn(),
    });

    render(<TaskMonitor />);

    expect(screen.getByText("badges.history")).toBeInTheDocument();
  });
});
