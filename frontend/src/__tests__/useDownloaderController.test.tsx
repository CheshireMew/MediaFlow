import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { downloaderService } from "../services/domain/downloaderService";
import { executionService } from "../services/domain/executionService";
import { useDownloaderController } from "../hooks/useDownloaderController";
import { useDownloaderStore } from "../stores/downloaderStore";
import { clearElectronMock } from "./testUtils/electronMock";

const useTaskContextMock = vi.fn();
const addTaskMock = vi.fn();

vi.mock("../context/taskContext", () => ({
  useTaskContext: () => useTaskContextMock(),
}));

vi.mock("../services/domain/downloaderService", () => ({
  downloaderService: {
    analyzeUrl: vi.fn(),
    saveCookies: vi.fn(),
  },
}));

vi.mock("../services/domain/executionService", () => ({
  executionService: {
    download: vi.fn(),
  },
  isDesktopRuntime: vi.fn(() => false),
}));

describe("useDownloaderController", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    useTaskContextMock.mockReturnValue({
      tasks: [],
      connected: true,
      remoteTasksReady: true,
      tasksSettled: true,
      pauseTask: vi.fn(),
      cancelTask: vi.fn(),
      addTask: addTaskMock,
    });

    useDownloaderStore.setState({
      url: "",
      resolution: "best",
      codec: "avc",
      downloadSubs: false,
      history: [],
    });
    clearElectronMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("submits a single download step and leaves workflow expansion to the backend", async () => {
    vi.mocked(downloaderService.analyzeUrl).mockResolvedValue({
      type: "single",
      title: "Sample Video",
      url: "https://example.com/video",
      extra_info: {},
    });
    vi.mocked(executionService.download).mockResolvedValue({
      execution_mode: "task_submission",
      task_id: "task-123",
      status: "pending",
      message: "Task queued",
      task_source: "backend",
      task_contract_version: 2,
      persistence_scope: "runtime",
      queue_state: "queued",
      queue_position: null,
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
      expect(executionService.download).toHaveBeenCalledTimes(1);
    });

    expect(executionService.download).toHaveBeenCalledWith({
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
    expect(addTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "task-123",
        type: "download",
        task_source: "backend",
        task_contract_version: 2,
        queue_state: "queued",
        request_params: expect.objectContaining({
          url: "https://example.com/video",
        }),
      }),
    );
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
      remoteTasksReady: true,
      tasksSettled: true,
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

  it("surfaces the original queue failure without throwing a currentUrl reference error", async () => {
    vi.mocked(downloaderService.analyzeUrl).mockResolvedValue({
      type: "single",
      title: "Broken Video",
      url: "https://example.com/broken",
      extra_info: {},
    });
    vi.mocked(executionService.download).mockRejectedValue(new Error("backend offline"));

    const { result } = renderHook(() => useDownloaderController());

    act(() => {
      result.current.setUrl("https://example.com/broken");
    });

    await act(async () => {
      await result.current.analyzeAndDownload();
    });

    await waitFor(() => {
      expect(result.current.error).toBe(
        "Failed to queue https://example.com/broken: backend offline",
      );
    });
  });
});
