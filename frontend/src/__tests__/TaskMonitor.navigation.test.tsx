/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TaskMonitor } from "../components/TaskMonitor";
import { BACKEND_TASK_CONTRACT_FIELDS } from "./testFixtures";
import { installElectronMock } from "./testUtils/electronMock";

const useTaskContextMock = vi.fn();

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
          message: "Pipeline completed",
          created_at: Date.now(),
          request_params: {},
          result: {
            success: true,
            files: [
              { type: "video", path: "E:/sample.mp4" },
              { type: "subtitle", path: "E:/sample.srt" },
            ],
            meta: {
              video_ref: {
                path: "E:/sample.mp4",
                name: "sample.mp4",
              },
              subtitle_ref: {
                path: "E:/sample.srt",
                name: "sample.srt",
              },
              srt_path: "E:/sample.srt",
            },
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

    fireEvent.click(screen.getAllByTitle("Translate")[0]);

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

    fireEvent.click(screen.getAllByTitle("Edit Video")[0]);

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

    fireEvent.click(screen.getAllByTitle("Transcribe")[0]);

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

  it("prefers an existing resolved media path over stale task memory when navigating", async () => {
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
          message: "Pipeline completed",
          created_at: Date.now(),
          request_params: {
            video_path: "E:/workspace/Patient Investor - 鈥淎I Won鈥檛 Replace Software!.mp4",
          },
          result: {
            success: true,
            files: [
              { type: "video", path: "E:/sample.mp4" },
            ],
            meta: {
              video_path: "E:/workspace/Patient Investor - 鈥淎I Won鈥檛 Replace Software!.mp4",
            },
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

    fireEvent.click(screen.getAllByTitle("Transcribe")[0]);

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

  it("uses explicit task media refs instead of workspace path mirrors when navigating", async () => {
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
          message: "Pipeline completed",
          created_at: Date.now(),
          request_params: {
            video_path: "E:/workspace/sample.mp4",
            subtitle_path: "E:/workspace/sample_ZH-CN.srt",
            video_ref: {
              path: "E:/canonical/sample.mp4",
              name: "sample.mp4",
            },
            subtitle_ref: {
              path: "E:/canonical/sample_ZH-CN.srt",
              name: "sample_ZH-CN.srt",
            },
          },
          result: {
            success: true,
            files: [
              { type: "video", path: "E:/workspace/sample.mp4" },
              { type: "subtitle", path: "E:/workspace/sample_ZH-CN.srt" },
            ],
            meta: {
              video_ref: {
                path: "E:/canonical/sample.mp4",
                name: "sample.mp4",
              },
              subtitle_ref: {
                path: "E:/canonical/sample_ZH-CN.srt",
                name: "sample_ZH-CN.srt",
              },
            },
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

    fireEvent.click(screen.getAllByTitle("Edit Video")[0]);

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

  it("shows a history badge for persisted backend history tasks", () => {
    useTaskContextMock.mockReturnValue({
      tasks: [
        {
          ...BACKEND_TASK_CONTRACT_FIELDS,
          id: "task-history",
          type: "download",
          primary_operation: "download",
          status: "completed",
          persistence_scope: "history",
          progress: 100,
          name: "Download sample.mp4",
          message: "Completed",
          created_at: Date.now(),
          request_params: {
            url: "https://example.com/video",
          },
          result: {
            success: true,
            files: [{ type: "video", path: "E:/sample.mp4" }],
            meta: {},
          },
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
