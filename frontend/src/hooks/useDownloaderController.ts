import { useState, useCallback } from "react";
import { downloaderService, executionService, isDesktopRuntime, settingsService } from "../services/domain";
import { desktopBrowserService } from "../services/desktop";
import type { AnalyzeResult } from "../api/client";
import { useTaskContext } from "../context/taskContext";
import {
  createTaskFromExecutionOutcome,
  resolveExecutionOutcomeBranch,
} from "../services/domain";
import { useDownloaderStore } from "../stores/downloaderStore";
import type { PipelineRequest } from "../types/api";
import { useDownloaderTasks } from "./downloader/useDownloaderTasks";

type DownloadQueueItem = {
  url: string;
  title?: string;
  index?: number;
};

type DownloadExtraInfo = Record<string, unknown> & {
  title?: string;
  direct_src?: string;
};

export function useDownloaderController() {
  const { addTask, remoteTasksReady } = useTaskContext();
  const { downloadEntries, activeDownloadCount } = useDownloaderTasks();
  // Global Persistent State
  const {
    url,
    resolution,
    codec,
    downloadSubs,
    setUrl,
    setResolution,
    setCodec,
    setDownloadSubs,
    addToHistory,
  } = useDownloaderStore();

  // Ephemeral UI State
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Playlist / Dialog State
  const [playlistInfo, setPlaylistInfo] = useState<AnalyzeResult | null>(null);
  const [showPlaylistDialog, setShowPlaylistDialog] = useState(false);
  const [selectedItems, setSelectedItems] = useState<number[]>([]);

  // Last successful analysis result (optional, for custom filename logic)
  const [lastAnalysis, setLastAnalysis] = useState<AnalyzeResult | null>(null);

  // ── Cookie Retry Helper ──────────────────────────────────────
  const handleCookieRetry = async (domain: string): Promise<boolean> => {
    if (!isDesktopRuntime()) {
      setError("需要登录验证，但 Electron API 不可用。请使用桌面版应用。");
      return false;
    }
    setError(`正在打开浏览器，请在新窗口中访问网站，完成后关闭窗口...`);
    try {
      const cookieList = await desktopBrowserService.fetchCookies(`https://www.${domain}`);
      if (cookieList.length === 0) {
        setError(`无法获取 ${domain} 的 Cookie。请尝试在浏览器中登录后重试。`);
        return false;
      }
      await downloaderService.saveCookies(domain, cookieList);
      setError(null);
      return true;
    } catch (cookieError: unknown) {
      console.error("[Cookie] Fetch failed:", cookieError);
      setError(
        `Cookie 获取失败: ${
          cookieError instanceof Error ? cookieError.message : String(cookieError)
        }`,
      );
      return false;
    }
  };

  const downloadVideos = useCallback(
    async (
      items: DownloadQueueItem[],
      playlistTitle?: string,
      extraInfo?: DownloadExtraInfo,
    ) => {
      setLoading(true);
      setShowPlaylistDialog(false);
      setError(null);

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const currentUrl = item.url;

        try {
          let directUrl: string | null = null;
          const finalExtraInfo: DownloadExtraInfo = { ...extraInfo };
          let customFilename: string | undefined = item.title;

          // Determine filename fallback
          if (!customFilename) {
            if (items.length === 1) {
              if (finalExtraInfo.title) {
                customFilename = finalExtraInfo.title;
              } else if (lastAnalysis?.title) {
                customFilename = lastAnalysis.title;
              }
            }
          }

          if (!customFilename && currentUrl.includes("douyin.com")) {
            customFilename = `Douyin_Video_${Date.now()}`;
          }

          if (finalExtraInfo && finalExtraInfo.direct_src) {
            directUrl = finalExtraInfo.direct_src;
          }

          // Construct base pipeline
          const basePipeline: PipelineRequest = {
            pipeline_id: "downloader_tool",
            task_name: customFilename,
            steps: [
              {
                step_name: "download",
                params: {
                  url: directUrl || currentUrl,
                  playlist_title: playlistTitle,
                  playlist_items: item.index ? item.index.toString() : undefined,
                  download_subs: downloadSubs,
                  resolution: resolution,
                  codec: codec,
                  ...finalExtraInfo,
                  filename: customFilename,
                },
              },
            ],
          };

          if (isDesktopRuntime()) {
            const settings = await settingsService.getSettings();
            const executionResult = await executionService.download(basePipeline, settings);
            const outcome = resolveExecutionOutcomeBranch(executionResult);
            if (outcome.kind !== "submission") {
              throw new Error("Download should return a task submission");
            }
            addTask(
              createTaskFromExecutionOutcome({
                outcome: executionResult,
                type: "download",
                name: customFilename,
                request_params: {
                  steps: basePipeline.steps,
                  ...(basePipeline.steps[0]?.params ?? {}),
                },
              }),
            );
            addToHistory({
              id: outcome.submission.task_id,
              url: currentUrl,
              title: customFilename || "Unknown Video",
              timestamp: Date.now(),
            });
            continue;
          }

          if (!remoteTasksReady) {
            setError("下载后端尚未就绪，且本地下载 worker 不可用。");
            break;
          }

          const executionResult = await executionService.download(basePipeline);
          const outcome = resolveExecutionOutcomeBranch(executionResult);
          if (outcome.kind !== "submission") {
            throw new Error("Download should return a task submission");
          }
          addTask(
            createTaskFromExecutionOutcome({
              outcome: executionResult,
              type: "download",
              name: customFilename,
              request_params: {
                steps: basePipeline.steps,
                ...(basePipeline.steps[0]?.params ?? {}),
              },
              }),
            );
          addToHistory({
            id: outcome.submission.task_id,
            url: currentUrl,
            title: customFilename || "Unknown Video",
            timestamp: Date.now(),
          });
        } catch (error: unknown) {
          console.error("[Downloader] Failed to queue download:", error);
          if (error instanceof Error && /paused|cancelled/i.test(error.message)) {
            continue;
          }
          setError(
            `Failed to queue ${currentUrl}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
      setLoading(false);
    },
    [addTask, remoteTasksReady, downloadSubs, resolution, codec, lastAnalysis, addToHistory],
  );

  const handleAnalyzeAndDownload = async () => {
    if (!url) return;
    setAnalyzing(true);
    setError(null);
    setPlaylistInfo(null);
    setLastAnalysis(null);

    try {
      const analysis = await downloaderService.analyzeUrl(url);
      setLastAnalysis(analysis);

      if (
        analysis.type === "playlist" &&
        analysis.items &&
        analysis.items.length > 1
      ) {
        setPlaylistInfo(analysis);
        setSelectedItems([]);
        setShowPlaylistDialog(true);
        setAnalyzing(false);
      } else {
        setAnalyzing(false);
        const extraWithDirect: DownloadExtraInfo = { ...(analysis.extra_info ?? {}) };
        if (analysis.direct_src) {
          extraWithDirect.direct_src = analysis.direct_src;
        }
        if (analysis.title) {
          extraWithDirect.title = analysis.title;
        }
        await downloadVideos(
          [{ url: analysis.url || url, title: analysis.title }],
          undefined,
          extraWithDirect,
        );
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Analysis failed";

      // Cookie Logic
      if (errorMessage.includes("COOKIES_REQUIRED:")) {
        const match = errorMessage.match(/COOKIES_REQUIRED:([a-zA-Z0-9.-]+)/);
        const domain = match?.[1];
        if (domain) {
          const cookieOk = await handleCookieRetry(domain);
          if (cookieOk) {
            // Retry analysis after successful cookie fetch
            const analysis = await downloaderService.analyzeUrl(url);
            setLastAnalysis(analysis);
            if (
              analysis.type === "playlist" &&
              analysis.items &&
              analysis.items.length > 1
            ) {
              setPlaylistInfo(analysis);
              setSelectedItems([]);
              setShowPlaylistDialog(true);
            } else {
              const extraWithDirect: DownloadExtraInfo = {
                ...(analysis.extra_info ?? {}),
              };
              if (analysis.direct_src) {
                extraWithDirect.direct_src = analysis.direct_src;
              }
              if (analysis.title) {
                extraWithDirect.title = analysis.title;
              }
              await downloadVideos(
                [{ url: analysis.url || url, title: analysis.title }],
                undefined,
                extraWithDirect,
              );
            }
            setAnalyzing(false);
            return;
          }
        } else {
          setError(errorMessage);
        }
      } else {
        setError(errorMessage);
      }
      setAnalyzing(false);
    }
  };

  const handlePlaylistDownload = (mode: "current" | "all" | "selected") => {
    if (!playlistInfo?.items) return;

    let itemsToDownload: DownloadQueueItem[] = [];
    const playlistTitle = playlistInfo.id
      ? `${playlistInfo.title} [${playlistInfo.id}]`
      : playlistInfo.title;

    if (mode === "current") {
      let currentItem: DownloadQueueItem | null = null;

      if (selectedItems.length === 1) {
        const selectedItem = playlistInfo.items[selectedItems[0]];
        currentItem = {
          url: selectedItem.url,
          title: selectedItem.title,
          index: selectedItem.index,
        };
      } else {
        const matchedItem = playlistInfo.items.find(
          (item) =>
            item.url === url ||
            url.includes(item.url) ||
            item.url.includes(url),
        );
        if (matchedItem) {
          currentItem = {
            url: matchedItem.url,
            title: matchedItem.title,
            index: matchedItem.index,
          };
        }
      }

      if (!currentItem) {
        setError("无法确定当前视频，请先在播放列表中选择一项后再仅下载该视频。");
        return;
      }

      itemsToDownload = [currentItem];
    } else if (mode === "all") {
      itemsToDownload = playlistInfo.items.map((item) => ({
        url: item.url,
        title: item.title,
        index: item.index,
      }));
    } else {
      itemsToDownload = selectedItems.map((i) => ({
        url: playlistInfo.items![i].url,
        title: playlistInfo.items![i].title,
        index: playlistInfo.items![i].index,
      }));
    }

    downloadVideos(itemsToDownload, playlistTitle);
  };

  const canDownloadCurrent =
    selectedItems.length === 1 ||
    Boolean(
      playlistInfo?.items?.some(
        (item) =>
          item.url === url || url.includes(item.url) || item.url.includes(url),
      ),
    );

  const toggleItemSelection = (index: number) => {
    setSelectedItems((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index],
    );
  };

  return {
    // State
    url,
    loading,
    analyzing,
    error,
    playlistInfo,
    showPlaylistDialog,
    selectedItems,
    canDownloadCurrent,
    downloadSubs,
    resolution,
    codec,
    downloadEntries,
    activeDownloadCount,

    // Actions
    setUrl,
    setDownloadSubs,
    setResolution,
    setCodec,
    setShowPlaylistDialog,
    setSelectedItems,
    analyzeAndDownload: handleAnalyzeAndDownload,
    downloadPlaylist: handlePlaylistDownload,
    toggleItemSelection,
  };
}
