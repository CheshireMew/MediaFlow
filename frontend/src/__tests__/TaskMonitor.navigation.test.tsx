/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TaskMonitor } from "../components/TaskMonitor";

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
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    useTaskContextMock.mockReturnValue({
      tasks: [
        {
          id: "task-1",
          type: "pipeline",
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
              video_path: "E:/sample.mp4",
              srt_path: "E:/sample.srt",
            },
          },
        },
      ],
      connected: true,
      cancelTask: vi.fn(),
    });
  });

  it("dispatches translator navigation payload from a completed task and persists session storage", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    render(<TaskMonitor />);

    fireEvent.click(screen.getAllByTitle("Translate")[0]);

    expect(JSON.parse(sessionStorage.getItem("mediaflow:pending_file") || "null")).toEqual({
      target: "translator",
      video_path: "E:/sample.mp4",
      subtitle_path: "E:/sample.srt",
    });
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "mediaflow:navigate",
        detail: expect.objectContaining({
          destination: "translator",
          payload: {
            video_path: "E:/sample.mp4",
            subtitle_path: "E:/sample.srt",
          },
        }),
      }),
    );
  });

  it("dispatches editor navigation payload from a completed task and persists session storage", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    render(<TaskMonitor />);

    fireEvent.click(screen.getAllByTitle("Edit Video")[0]);

    expect(JSON.parse(sessionStorage.getItem("mediaflow:pending_file") || "null")).toEqual({
      target: "editor",
      video_path: "E:/sample.mp4",
      subtitle_path: "E:/sample.srt",
    });
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "mediaflow:navigate",
        detail: expect.objectContaining({
          destination: "editor",
          payload: {
            video_path: "E:/sample.mp4",
            subtitle_path: "E:/sample.srt",
          },
        }),
      }),
    );
  });

  it("dispatches transcriber navigation payload from a completed task and persists session storage", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    render(<TaskMonitor />);

    fireEvent.click(screen.getAllByTitle("Transcribe")[0]);

    expect(JSON.parse(sessionStorage.getItem("mediaflow:pending_file") || "null")).toEqual({
      target: "transcriber",
      video_path: "E:/sample.mp4",
      subtitle_path: "E:/sample.srt",
    });
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "mediaflow:navigate",
        detail: expect.objectContaining({
          destination: "transcriber",
          payload: {
            video_path: "E:/sample.mp4",
            subtitle_path: "E:/sample.srt",
          },
        }),
      }),
    );
  });
});
