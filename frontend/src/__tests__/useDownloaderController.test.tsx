import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../api/client";
import { useDownloaderController } from "../hooks/useDownloaderController";
import { useDownloaderStore } from "../stores/downloaderStore";

const useTaskContextMock = vi.fn();

vi.mock("../context/taskContext", () => ({
  useTaskContext: () => useTaskContextMock(),
}));

vi.mock("../api/client", () => ({
  apiClient: {
    analyzeUrl: vi.fn(),
    runPipeline: vi.fn(),
    saveCookies: vi.fn(),
  },
}));

describe("useDownloaderController", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    useTaskContextMock.mockReturnValue({
      tasks: [],
      connected: true,
      pauseTask: vi.fn(),
      cancelTask: vi.fn(),
      addTask: vi.fn(),
    });

    useDownloaderStore.setState({
      url: "",
      resolution: "best",
      codec: "avc",
      downloadSubs: false,
      history: [],
    });
  });

  it("submits a single download step and leaves workflow expansion to the backend", async () => {
    vi.mocked(apiClient.analyzeUrl).mockResolvedValue({
      type: "single",
      title: "Sample Video",
      url: "https://example.com/video",
      extra_info: {},
    });
    vi.mocked(apiClient.runPipeline).mockResolvedValue({
      task_id: "task-123",
      status: "pending",
      message: "Task queued",
    });

    const { result } = renderHook(() => useDownloaderController());

    act(() => {
      result.current.setUrl("https://example.com/video");
      result.current.setResolution("1080p");
      result.current.setCodec("best");
      result.current.setDownloadSubs(true);
    });

    await act(async () => {
      await result.current.analyzeAndDownload();
    });

    await waitFor(() => {
      expect(apiClient.runPipeline).toHaveBeenCalledTimes(1);
    });

    expect(apiClient.runPipeline).toHaveBeenCalledWith({
      pipeline_id: "downloader_tool",
      task_name: "Sample Video",
      steps: [
        {
          step_name: "download",
          params: {
            url: "https://example.com/video",
            playlist_title: undefined,
            playlist_items: undefined,
            download_subs: true,
            resolution: "1080p",
            codec: "best",
            title: "Sample Video",
            filename: "Sample Video",
          },
        },
      ],
    });

    expect(useDownloaderStore.getState().history).toEqual([
      {
        id: "task-123",
        url: "https://example.com/video",
        title: "Sample Video",
        timestamp: expect.any(Number),
      },
    ]);
  });

  it("derives recent downloader entries from task context selectors", () => {
    useDownloaderStore.setState({
      url: "",
      resolution: "best",
      codec: "avc",
      downloadSubs: false,
      history: [
        {
          id: "task-200",
          url: "https://example.com/video",
          title: "Queued video",
          timestamp: Date.now(),
        },
      ],
    });
    useTaskContextMock.mockReturnValue({
      tasks: [
        {
          id: "task-200",
          type: "download",
          status: "pending",
          progress: 0,
          created_at: Date.now(),
          queue_state: "queued",
          request_params: { url: "https://example.com/video" },
        },
      ],
      connected: true,
      pauseTask: vi.fn(),
      cancelTask: vi.fn(),
      addTask: vi.fn(),
    });

    const { result } = renderHook(() => useDownloaderController());

    expect(result.current.activeDownloadCount).toBe(1);
    expect(result.current.downloadEntries[0]).toMatchObject({
      id: "task-200",
      title: "Queued video",
    });
    expect(result.current.downloadEntries[0]?.task?.queue_state).toBe("queued");
  });
});
