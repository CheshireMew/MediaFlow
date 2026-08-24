/* @vitest-environment jsdom */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { downloaderService, executionService } from "../services/domain";
import { useDownloaderController } from "../hooks/useDownloaderController";
import { useDownloaderStore } from "../stores/downloaderStore";
import { clearElectronMock, installElectronMock } from "./testUtils/electronMock";
import { TASK_CONTRACT_VERSION } from "../contracts/runtimeContracts";

const useTaskContextMock = vi.fn();
const addTaskMock = vi.fn();
const { prewarmFasterWhisperCliFromStoredPreferencesMock } = vi.hoisted(() => ({
  prewarmFasterWhisperCliFromStoredPreferencesMock: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      key === "feedback.queueFailed"
        ? `Failed to queue ${String(values?.url)}: ${String(values?.detail)}`
        : key,
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

vi.mock("../services/asrCliPrewarm", () => ({
  prewarmFasterWhisperCliFromStoredPreferences:
    prewarmFasterWhisperCliFromStoredPreferencesMock,
}));

describe("useDownloaderController", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(downloaderService, "analyzeUrl");
    vi.spyOn(downloaderService, "saveCookies");
    vi.spyOn(executionService, "download");
    useTaskContextMock.mockReturnValue({
      tasks: [],
      connected: true,
      remoteTasksReady: true,
      tasksSettled: true,
      pauseTask: vi.fn(),
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
      result: null,
      submission: {
        execution_mode: "task_submission",
        task_id: "task-123",
        status: "pending",
        message_code: "queued",
        message_params: {},
        task_source: "backend",
        task_contract_version: TASK_CONTRACT_VERSION,
        revision: 0,
        persistence_scope: "runtime",
        lifecycle: "resumable",
        queue_state: "queued",
        queue_position: null,
        primary_operation: "download",
      },
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

    expect(prewarmFasterWhisperCliFromStoredPreferencesMock).toHaveBeenCalled();

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
            media_kind: "video",
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
        type: "pipeline",
        task_source: "backend",
        task_contract_version: TASK_CONTRACT_VERSION,
        revision: 0,
        queue_state: "queued",
        request_params: expect.objectContaining({
          pipeline_id: "downloader_tool",
          steps: [expect.objectContaining({
            step_name: "download",
            params: expect.objectContaining({ url: "https://example.com/video" }),
          })],
        }),
      }),
    );
  });

  it("queues Xiaoyuzhou episodes as audio while preserving the episode page URL", async () => {
    const episodeUrl = "https://www.xiaoyuzhoufm.com/episode/6966f416109824f9e15f3cb5";
    vi.mocked(downloaderService.analyzeUrl).mockResolvedValue({
      type: "single",
      platform: "xiaoyuzhou",
      id: "6966f416109824f9e15f3cb5",
      title: "嘿，你好，生活 - 开场白",
      url: episodeUrl,
      direct_src: "https://media.xyzcdn.net/example.m4a",
      media_kind: "audio",
      suggested_filename: "嘿，你好，生活 - 开场白 [6966f416109824f9e15f3cb5]",
      extra_info: { episode_id: "6966f416109824f9e15f3cb5" },
    });
    vi.mocked(executionService.download).mockResolvedValue({
      execution_mode: "task_submission",
      result: null,
      submission: {
        execution_mode: "task_submission",
        task_id: "task-audio",
        status: "pending",
        message_code: "queued",
        message_params: {},
        task_source: "backend",
        task_contract_version: TASK_CONTRACT_VERSION,
        revision: 0,
        persistence_scope: "runtime",
        lifecycle: "resumable",
        queue_state: "queued",
        queue_position: null,
        primary_operation: "download",
      },
    });
    useDownloaderStore.setState({ resolution: "1080p", downloadSubs: true });

    const { result } = renderHook(() => useDownloaderController());
    act(() => result.current.setUrl(episodeUrl));
    expect(result.current.mediaKind).toBe("audio");

    await act(async () => {
      await result.current.analyzeAndDownload();
    });

    await waitFor(() => expect(executionService.download).toHaveBeenCalledTimes(1));
    const request = vi.mocked(executionService.download).mock.calls[0][0];
    expect(request.task_name).toBe("嘿，你好，生活 - 开场白 [6966f416109824f9e15f3cb5]");
    expect(request.steps[0].params).toMatchObject({
      url: episodeUrl,
      direct_src: "https://media.xyzcdn.net/example.m4a",
      media_kind: "audio",
      resolution: "audio",
      download_subs: false,
      filename: "嘿，你好，生活 - 开场白 [6966f416109824f9e15f3cb5]",
    });
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
          type: "pipeline",
          primary_operation: "download",
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

  it("uses the same playlist analysis path after a cookie retry", async () => {
    const fetchCookies = vi.fn().mockResolvedValue([
      { name: "session", value: "ready", domain: ".example.com" },
    ]);
    installElectronMock({ fetchCookies });
    vi.mocked(downloaderService.saveCookies).mockResolvedValue({
      domain: "example.com",
      has_valid_cookies: true,
      cookie_path: "D:/Tools/cookies.txt",
    });
    vi.mocked(downloaderService.analyzeUrl)
      .mockRejectedValueOnce(new Error("COOKIES_REQUIRED:example.com"))
      .mockResolvedValueOnce({
        type: "playlist",
        title: "Recovered playlist",
        url: "https://example.com/playlist",
        items: [
          { title: "First", url: "https://example.com/1", index: 1 },
          { title: "Second", url: "https://example.com/2", index: 2 },
        ],
      });

    const { result } = renderHook(() => useDownloaderController());
    act(() => result.current.setUrl("https://example.com/playlist"));
    await act(async () => result.current.analyzeAndDownload());

    expect(downloaderService.analyzeUrl).toHaveBeenCalledTimes(2);
    expect(fetchCookies).toHaveBeenCalledWith("https://www.example.com");
    expect(downloaderService.saveCookies).toHaveBeenCalledTimes(1);
    expect(result.current.playlistInfo?.title).toBe("Recovered playlist");
    expect(result.current.showPlaylistDialog).toBe(true);
  });
});
