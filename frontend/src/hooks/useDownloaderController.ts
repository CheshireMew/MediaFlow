import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  queueDownloadItems,
  type DownloadExtraInfo,
  type DownloadQueueItem,
} from "../services/domain";
import type { AnalyzeResult } from "../api/client";
import { useTaskActions, useTaskStatus } from "../context/taskContext";
import { useDownloaderStore } from "../stores/downloaderStore";
import { useDownloaderTasks } from "./downloader/useDownloaderTasks";
import { prewarmFasterWhisperCliFromStoredPreferences } from "../services/asrCliPrewarm";
import {
  canResolveCurrentPlaylistItem,
  downloadExtraInfoFromAnalysis,
  looksLikeXiaoyuzhouEpisode,
  resolvePlaylistItems,
} from "./downloader/downloaderAnalysis";
import { useDownloaderAnalysis } from "./downloader/useDownloaderAnalysis";

export function useDownloaderController() {
  const { t } = useTranslation("downloader");
  const { addTask } = useTaskActions();
  const { remoteTasksReady } = useTaskStatus();
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

  const [loading, setLoading] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const downloadVideos = useCallback(
    async (
      items: DownloadQueueItem[],
      playlistTitle?: string,
      extraInfo?: DownloadExtraInfo,
      analysis: AnalyzeResult | null = null,
    ) => {
      setLoading(true);
      setQueueError(null);

      for (const item of items) {
        try {
          const audioOnly = resolution === "audio"
            || analysis?.media_kind === "audio"
            || looksLikeXiaoyuzhouEpisode(item.url);
          await queueDownloadItems({
            items: [item],
            totalItemCount: items.length,
            playlistTitle,
            extraInfo,
            downloadSubs: audioOnly ? false : downloadSubs,
            resolution: audioOnly ? "audio" : resolution,
            codec,
            lastAnalysis: analysis,
            remoteTasksReady,
            addTask,
            addToHistory,
          });
        } catch (error: unknown) {
          console.error("[Downloader] Failed to queue download:", error);
          if (error instanceof Error && /paused|cancelled/i.test(error.message)) {
            continue;
          }
          setQueueError(
            t("feedback.queueFailed", {
              url: item.url,
              detail: error instanceof Error ? error.message : String(error),
            }),
          );
        }
      }
      setLoading(false);
    },
    [addTask, remoteTasksReady, downloadSubs, resolution, codec, addToHistory, t],
  );
  const analysis = useDownloaderAnalysis({
    url,
    onSingleAnalysis: useCallback(async (result: AnalyzeResult) => {
      await downloadVideos(
        [{ url: result.url || url, title: result.title }],
        undefined,
        downloadExtraInfoFromAnalysis(result),
        result,
      );
    }, [downloadVideos, url]),
  });

  const setDownloadUrl = useCallback((nextUrl: string) => {
    setUrl(nextUrl);
    setQueueError(null);
    analysis.resetAnalysis();
  }, [analysis, setUrl]);

  const handleAnalyzeAndDownload = useCallback(async () => {
    setQueueError(null);
    await analysis.analyzeAndDownload();
  }, [analysis]);

  const handlePlaylistDownload = (mode: "current" | "all" | "selected") => {
    if (!analysis.playlistInfo?.items) return;
    prewarmFasterWhisperCliFromStoredPreferences();
    analysis.setShowPlaylistDialog(false);
    setQueueError(null);
    const items = resolvePlaylistItems(analysis.playlistInfo, mode, analysis.selectedItems, url);
    if (!items) {
      analysis.setError(t("feedback.currentItemUnknown"));
      return;
    }
    const title = analysis.playlistInfo.id
      ? `${analysis.playlistInfo.title} [${analysis.playlistInfo.id}]`
      : analysis.playlistInfo.title;
    void downloadVideos(items, title, undefined, analysis.lastAnalysis);
  };

  const canDownloadCurrent = canResolveCurrentPlaylistItem(
    analysis.playlistInfo,
    analysis.selectedItems,
    url,
  );
  const mediaKind: "video" | "audio" = analysis.lastAnalysis?.media_kind === "audio"
    || looksLikeXiaoyuzhouEpisode(url) ? "audio" : "video";

  return {
    // State
    url,
    loading,
    analyzing: analysis.analyzing,
    error: queueError ?? analysis.error,
    playlistInfo: analysis.playlistInfo,
    showPlaylistDialog: analysis.showPlaylistDialog,
    selectedItems: analysis.selectedItems,
    canDownloadCurrent,
    downloadSubs,
    resolution,
    codec,
    downloadEntries,
    activeDownloadCount,
    mediaKind,

    // Actions
    setUrl: setDownloadUrl,
    setDownloadSubs,
    setResolution,
    setCodec,
    setShowPlaylistDialog: analysis.setShowPlaylistDialog,
    setSelectedItems: analysis.setSelectedItems,
    analyzeAndDownload: handleAnalyzeAndDownload,
    downloadPlaylist: handlePlaylistDownload,
    toggleItemSelection: analysis.toggleItemSelection,
  };
}
