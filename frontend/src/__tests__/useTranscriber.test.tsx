import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTranscriber } from "../hooks/useTranscriber";
import type { Task } from "../types/task";
import { apiClient } from "../api/client";

const useTaskContextMock = vi.fn();

vi.mock("../context/taskContext", () => ({
  useTaskContext: () => useTaskContextMock(),
}));

vi.mock("../api/client", () => ({
  apiClient: {
    runPipeline: vi.fn(),
  },
}));

describe("useTranscriber", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();

    useTaskContextMock.mockReturnValue({
      tasks: [],
      connected: true,
      cancelTask: vi.fn(),
      addTask: vi.fn(),
    });
    window.electronAPI = {
      getPathForFile: vi.fn((file: File & { path?: string }) => file.path ?? ""),
      openFile: vi.fn(),
      openSubtitleFile: vi.fn(),
      readFile: vi.fn(),
      showSaveDialog: vi.fn(),
      selectDirectory: vi.fn(),
      showInExplorer: vi.fn(),
      fetchCookies: vi.fn(),
      extractDouyinData: vi.fn(),
      writeFile: vi.fn(),
      readBinaryFile: vi.fn(),
      writeBinaryFile: vi.fn(),
      getFileSize: vi.fn(),
      saveFile: vi.fn(),
      minimize: vi.fn(),
      maximize: vi.fn(),
      close: vi.fn(),
      sendMessage: vi.fn(),
    };
  });

  it("recovers an active pipeline task containing a transcribe step", async () => {
    const pipelineTask: Task = {
      id: "pipeline-123",
      type: "pipeline",
      status: "running",
      progress: 35,
      name: "Transcribe sample.mp4",
      message: "Executing step: transcribe",
      request_params: {
        pipeline_id: "transcriber_tool",
        steps: [
          {
            step_name: "transcribe",
            params: {
              audio_path: "E:/sample.mp4",
              model: "base",
              device: "cpu",
            },
          },
        ],
      },
      created_at: Date.now(),
    };

    useTaskContextMock.mockReturnValue({
      tasks: [pipelineTask],
      connected: true,
      cancelTask: vi.fn(),
      addTask: vi.fn(),
    });

    const { result } = renderHook(() => useTranscriber());

    await waitFor(() => {
      expect(result.current.state.activeTaskId).toBe("pipeline-123");
    });
    expect(result.current.state.activeTask?.id).toBe("pipeline-123");
  });

  it("submits a transcribe pipeline with cpu as the default device", async () => {
    vi.mocked(apiClient.runPipeline).mockResolvedValue({
      task_id: "task-123",
      status: "pending",
    });

    const { result } = renderHook(() => useTranscriber());

    act(() => {
      result.current.actions.setFile({
        name: "sample.mp4",
        path: "E:/sample.mp4",
        size: 1024,
        type: "video/mp4",
      } as File);
    });

    await act(async () => {
      await result.current.actions.startTranscription();
    });

    expect(apiClient.runPipeline).toHaveBeenCalledTimes(1);
    expect(apiClient.runPipeline).toHaveBeenCalledWith({
      pipeline_id: "transcriber_tool",
      task_name: "Transcribe sample.mp4",
      steps: [
        {
          step_name: "transcribe",
          params: {
            audio_path: "E:/sample.mp4",
            model: "base",
            device: "cpu",
            vad_filter: true,
          },
        },
      ],
    });
  });

  it("maps a completed task result back into transcriber state", async () => {
    const completedTask: Task = {
      id: "task-789",
      type: "pipeline",
      status: "completed",
      progress: 100,
      name: "Transcribe sample.mp4",
      message: "Pipeline completed",
      request_params: {
        pipeline_id: "transcriber_tool",
        steps: [{ step_name: "transcribe", params: { audio_path: "E:/sample.mp4" } }],
      },
      result: {
        success: true,
        files: [
          {
            type: "subtitle",
            path: "E:/sample.srt",
          },
        ],
        meta: {
          text: "hello\nworld",
          language: "en",
          segments: [
            { id: "1", start: 0, end: 1, text: "hello" },
            { id: "2", start: 1, end: 2, text: "world" },
          ],
        },
      },
      created_at: Date.now(),
    };

    localStorage.setItem("transcriber_activeTaskId", "task-789");
    localStorage.setItem(
      "transcriber_file",
      JSON.stringify({
        name: "sample.mp4",
        path: "E:/sample.mp4",
        size: 1024,
      }),
    );

    useTaskContextMock.mockReturnValue({
      tasks: [completedTask],
      connected: true,
      cancelTask: vi.fn(),
      addTask: vi.fn(),
    });

    const { result } = renderHook(() => useTranscriber());

    await waitFor(() => {
      expect(result.current.state.activeTaskId).toBeNull();
    });

    expect(result.current.state.result).toEqual({
      segments: [
        { id: "1", start: 0, end: 1, text: "hello" },
        { id: "2", start: 1, end: 2, text: "world" },
      ],
      text: "hello\nworld",
      language: "en",
      srt_path: "E:/sample.srt",
      video_path: "E:/sample.mp4",
      audio_path: "E:/sample.mp4",
    });
  });

  it("falls back to transcript when pipeline metadata has no text field", async () => {
    const completedTask: Task = {
      id: "task-790",
      type: "pipeline",
      status: "completed",
      progress: 100,
      name: "Transcribe sample.mp4",
      message: "Pipeline completed",
      request_params: {
        pipeline_id: "transcriber_tool",
        steps: [{ step_name: "transcribe", params: { audio_path: "E:/sample.mp4" } }],
      },
      result: {
        success: true,
        files: [
          {
            type: "subtitle",
            path: "E:/sample.srt",
          },
        ],
        meta: {
          transcript: "legacy transcript",
          segments: [{ id: "1", start: 0, end: 1, text: "hello" }],
        },
      },
      created_at: Date.now(),
    };

    localStorage.setItem("transcriber_activeTaskId", "task-790");
    localStorage.setItem(
      "transcriber_file",
      JSON.stringify({
        name: "sample.mp4",
        path: "E:/sample.mp4",
        size: 1024,
      }),
    );

    useTaskContextMock.mockReturnValue({
      tasks: [completedTask],
      connected: true,
      cancelTask: vi.fn(),
      addTask: vi.fn(),
    });

    const { result } = renderHook(() => useTranscriber());

    await waitFor(() => {
      expect(result.current.state.activeTaskId).toBeNull();
    });

    expect(result.current.state.result?.text).toBe("legacy transcript");
    expect(result.current.state.result?.language).toBe("auto");
  });
});
