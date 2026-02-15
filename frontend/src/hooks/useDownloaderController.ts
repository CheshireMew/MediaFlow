import { useState, useCallback, useEffect } from "react";
import { apiClient } from "../api/client";
import type { AnalyzeResult } from "../api/client";
import { useDownloaderStore } from "../stores/downloaderStore";
import { useTaskContext } from "../context/TaskContext";

export function useDownloaderController() {
  const { tasks } = useTaskContext();

  // Global Persistent State
  const {
    url,
    resolution,
    codec,
    downloadSubs,
    history,
    setUrl,
    setResolution,
    setCodec,
    setDownloadSubs,
    addToHistory,
    updateHistoryStatus,
  } = useDownloaderStore();

  // Sync Task Status to History
  useEffect(() => {
    tasks.forEach((task) => {
      if (task.status === "completed" || task.status === "failed") {
        const historyItem = history.find((h) => h.id === task.id);

        if (historyItem) {
          const newStatus = task.status as "completed" | "failed";
          let newPath = historyItem.path;

          if (task.status === "completed" && task.result?.files) {
            const videoFile = task.result.files.find(
              (f: any) => f.type === "video",
            );
            if (videoFile?.path) {
              newPath = videoFile.path;
            }
          }

          // Only update if changed to avoid infinite loops
          if (
            historyItem.status !== newStatus ||
            (newStatus === "completed" && historyItem.path !== newPath)
          ) {
            updateHistoryStatus(task.id, newStatus, newPath);
          }
        }
      }
    });
  }, [tasks, history, updateHistoryStatus]);

  // Ephemeral UI State
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  // Playlist / Dialog State
  const [playlistInfo, setPlaylistInfo] = useState<AnalyzeResult | null>(null);
  const [showPlaylistDialog, setShowPlaylistDialog] = useState(false);
  const [selectedItems, setSelectedItems] = useState<number[]>([]);

  // Last successful analysis result (optional, for custom filename logic)
  const [lastAnalysis, setLastAnalysis] = useState<AnalyzeResult | null>(null);

  // Debug Electron
  useEffect(() => {
    if (window.electronAPI) {
    }
  }, []);

  const downloadVideos = useCallback(
    async (
      urls: string[],
      playlistTitle?: string,
      extraInfo?: Record<string, any>,
    ) => {
      setLoading(true);
      setShowPlaylistDialog(false);
      setError(null);

      let successCount = 0;
      for (let i = 0; i < urls.length; i++) {
        try {
          let currentUrl = urls[i];
          let directUrl: string | null = null;
          let finalExtraInfo: any = { ...extraInfo };
          let customFilename: string | undefined = undefined;

          // Determine filename
          if (urls.length === 1) {
            if (finalExtraInfo.title) {
              customFilename = finalExtraInfo.title;
            } else if (lastAnalysis?.title) {
              customFilename = lastAnalysis.title;
            }
          } else if (playlistInfo && playlistInfo.items) {
            const found = playlistInfo.items.find(
              (item) => item.url === currentUrl,
            );
            if (found) customFilename = found.title;
          }

          if (!customFilename && currentUrl.includes("douyin.com")) {
            customFilename = `Douyin_Video_${Date.now()}`;
          }

          if (finalExtraInfo && finalExtraInfo.direct_src) {
            directUrl = finalExtraInfo.direct_src;
          }

          // Construct base pipeline
          const basePipeline = {
            pipeline_id: "downloader_tool",
            task_name: customFilename,
            steps: [
              {
                step_name: "download",
                params: {
                  url: directUrl || currentUrl,
                  playlist_title: playlistTitle,
                  download_subs: downloadSubs,
                  resolution: resolution,
                  codec: codec,
                  ...finalExtraInfo,
                  filename: customFilename,
                },
              },
            ],
          };

          // Auto-Execute Flow Logic
          try {
            const settings = await apiClient.getSettings();
            if (settings.auto_execute_flow) {
              // Read preferred model from localStorage or default
              const preferredModel =
                localStorage.getItem("transcriber_model") || "base";

              basePipeline.steps.push(
                {
                  step_name: "transcribe",
                  params: {
                    model: preferredModel,
                    language: "auto", // Auto-detect source
                  },
                },
                {
                  step_name: "translate",
                  params: {
                    target_language: settings.language || "zh",
                    mode: "standard",
                  },
                },
                {
                  step_name: "synthesize",
                  params: {
                    options: {}, // Use defaults
                  },
                },
              );
            }
          } catch (e) {
            console.warn(
              "[Auto-Execute] Failed to load settings, skipping auto-flow",
              e,
            );
          }

          // Execute Pipeline
          const apiResult = await apiClient.runPipeline(basePipeline);

          successCount++;

          // For single file, we can show the result card (though it might be pending)
          // Ideally we wait for completion or simply show "Task Started"
          // The old logic likely returned the result immediately or waited?
          // runPipeline returns { task_id, status, message }
          // The old useDownloader seemed to set result to something that has video_path?
          // If runPipeline is async but returns immediately, we don't have video_path yet.
          // BUT, maybe the simple download (non-pipeline) returned it?
          // The new refactor uses runPipeline exclusively.
          // So 'result' is just the Task Info now.
          // However, DownloadResultCard probably expects video_path.
          // We might need to fetch the task result after completion or just rely on TaskMonitor.
          // Let's set the result to the Task Ref for now.
          setResult(apiResult);

          // Add to history
          if (apiResult && apiResult.task_id) {
            addToHistory({
              id: apiResult.task_id,
              url: currentUrl,
              title: customFilename || "Unknown Video",
              timestamp: Date.now(),
              status: "pending",
            });
          }
        } catch (e: any) {
          console.error(e);
          setError(`Failed to queue ${urls[i]}: ${e.message}`);
        }
      }
      setLoading(false);
    },
    [downloadSubs, resolution, codec, playlistInfo, lastAnalysis, addToHistory],
  );

  const handleAnalyzeAndDownload = async () => {
    if (!url) return;
    setAnalyzing(true);
    setError(null);
    setPlaylistInfo(null);
    setLastAnalysis(null);

    try {
      const analysis = await apiClient.analyzeUrl(url);
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
        const extraWithDirect = analysis.extra_info || {};
        if (analysis.direct_src) {
          extraWithDirect.direct_src = analysis.direct_src;
        }
        if (analysis.title) {
          extraWithDirect.title = analysis.title;
        }
        await downloadVideos([analysis.url || url], undefined, extraWithDirect);
      }
    } catch (e: any) {
      const errorMessage = e.message || "Analysis failed";

      // Cookie Logic
      if (errorMessage.includes("COOKIES_REQUIRED:")) {
        const match = errorMessage.match(/COOKIES_REQUIRED:([a-zA-Z0-9.-]+)/);
        const domain = match?.[1];
        if (domain && window.electronAPI?.fetchCookies) {
          setError(`正在打开浏览器，请在新窗口中访问网站，完成后关闭窗口...`);
          try {
            const targetUrl = `https://www.${domain}`;
            const cookies = await window.electronAPI.fetchCookies(targetUrl);

            if (cookies && cookies.length > 0) {
              await apiClient.saveCookies(domain, cookies);
              setError(null);
              // Retry Logic
              const analysis = await apiClient.analyzeUrl(url);
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
                await downloadVideos(
                  [analysis.url || url],
                  undefined,
                  analysis.extra_info,
                );
              }
              setAnalyzing(false);
              return;
            } else {
              setError(
                `无法获取 ${domain} 的 Cookie。请尝试在浏览器中登录后重试。`,
              );
            }
          } catch (cookieError: any) {
            console.error("[Cookie] Fetch failed:", cookieError);
            setError(`Cookie 获取失败: ${cookieError.message}`);
          }
        } else {
          setError("需要登录验证，但 Electron API 不可用。请使用桌面版应用。");
        }
      } else {
        setError(errorMessage);
      }
      setAnalyzing(false);
    }
  };

  const handlePlaylistDownload = (mode: "current" | "all" | "selected") => {
    if (!playlistInfo?.items) return;

    let urlsToDownload: string[] = [];
    const playlistTitle = playlistInfo.id
      ? `${playlistInfo.title} [${playlistInfo.id}]`
      : playlistInfo.title;

    if (mode === "current") {
      urlsToDownload = [url];
    } else if (mode === "all") {
      urlsToDownload = playlistInfo.items.map((item) => item.url);
    } else {
      urlsToDownload = selectedItems.map((i) => playlistInfo.items![i].url);
    }

    downloadVideos(urlsToDownload, playlistTitle);
  };

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
    result,
    playlistInfo,
    showPlaylistDialog,
    selectedItems,
    downloadSubs,
    resolution,
    codec,

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
