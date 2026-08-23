import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  downloaderService,
  isDesktopRuntime,
  queueDownloadItems,
  type DownloadExtraInfo,
  type DownloadQueueItem,
} from "../services/domain";
import { desktopBrowserService } from "../services/desktop";
import type { AnalyzeResult } from "../api/client";
import { useTaskContext } from "../context/taskContext";
import { useDownloaderStore } from "../stores/downloaderStore";
import { useDownloaderTasks } from "./downloader/useDownloaderTasks";
import { prewarmFasterWhisperCliFromStoredPreferences } from "../services/asrCliPrewarm";

function downloadExtraInfoFromAnalysis(analysis: AnalyzeResult): DownloadExtraInfo {
  const extraInfo: DownloadExtraInfo = { ...(analysis.extra_info ?? {}) };
  if (analysis.direct_src) {
    extraInfo.direct_src = analysis.direct_src;
  }
  if (analysis.title) {
    extraInfo.title = analysis.title;
  }
  if (analysis.media_kind) {
    extraInfo.media_kind = analysis.media_kind;
  }
  if (analysis.suggested_filename) {
    extraInfo.suggested_filename = analysis.suggested_filename;
  }
  return extraInfo;
}

function looksLikeXiaoyuzhouEpisode(url: string): boolean {
  return /^https?:\/\/(?:www\.)?xiaoyuzhoufm\.com\/episode\/[0-9a-f]{24}\/?(?:[?#].*)?$/i.test(
    url.trim(),
  );
}

export function useDownloaderController() {
  const { t } = useTranslation("downloader");
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
  const mediaKind: "video" | "audio" =
    lastAnalysis?.media_kind === "audio" || looksLikeXiaoyuzhouEpisode(url)
      ? "audio"
      : "video";

  const setDownloadUrl = useCallback(
    (nextUrl: string) => {
      setUrl(nextUrl);
      setLastAnalysis(null);
    },
    [setUrl],
  );

  // ── Cookie Retry Helper ──────────────────────────────────────
  const handleCookieRetry = async (domain: string): Promise<boolean> => {
    if (!isDesktopRuntime()) {
      setError(t("feedback.desktopRequired"));
      return false;
    }
    setError(t("feedback.openingBrowser"));
    try {
      const cookieList = await desktopBrowserService.fetchCookies(`https://www.${domain}`);
      if (cookieList.length === 0) {
        setError(t("feedback.cookiesMissing", { domain }));
        return false;
      }
      await downloaderService.saveCookies(domain, cookieList);
      setError(null);
      return true;
    } catch (cookieError: unknown) {
      console.error("[Cookie] Fetch failed:", cookieError);
      setError(
        t("feedback.cookiesFailed", {
          detail: cookieError instanceof Error ? cookieError.message : String(cookieError),
        }),
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

      for (const item of items) {
        try {
          await queueDownloadItems({
            items: [item],
            totalItemCount: items.length,
            playlistTitle,
            extraInfo,
            downloadSubs,
            resolution,
            codec,
            lastAnalysis,
            remoteTasksReady,
            addTask,
            addToHistory,
          });
        } catch (error: unknown) {
          console.error("[Downloader] Failed to queue download:", error);
          if (error instanceof Error && /paused|cancelled/i.test(error.message)) {
            continue;
          }
          setError(
            t("feedback.queueFailed", {
              url: item.url,
              detail: error instanceof Error ? error.message : String(error),
            }),
          );
        }
      }
      setLoading(false);
    },
    [addTask, remoteTasksReady, downloadSubs, resolution, codec, lastAnalysis, addToHistory, t],
  );

  const handleAnalyzeAndDownload = async () => {
    if (!url) return;
    prewarmFasterWhisperCliFromStoredPreferences();
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
        const extraWithDirect = downloadExtraInfoFromAnalysis(analysis);
        await downloadVideos(
          [{ url: analysis.url || url, title: analysis.title }],
          undefined,
          extraWithDirect,
        );
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : t("feedback.analysisFailed");

      // Cookie Logic
      if (errorMessage.includes("COOKIES_REQUIRED:")) {
        const match = errorMessage.match(/COOKIES_REQUIRED:([a-zA-Z0-9.-]+)/);
        const domain = match?.[1];
        if (domain) {
          const cookieOk = await handleCookieRetry(domain);
          if (cookieOk) {
            // Retry analysis after successful cookie fetch
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
              } else {
                const extraWithDirect = downloadExtraInfoFromAnalysis(analysis);
                await downloadVideos(
                  [{ url: analysis.url || url, title: analysis.title }],
                  undefined,
                  extraWithDirect,
                );
              }
              setAnalyzing(false);
              return;
            } catch (retryError) {
              setError(t("feedback.analysisFailedDetail", {
                detail: retryError instanceof Error ? retryError.message : String(retryError),
              }));
            }
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
    prewarmFasterWhisperCliFromStoredPreferences();

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
        setError(t("feedback.currentItemUnknown"));
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
    mediaKind,

    // Actions
    setUrl: setDownloadUrl,
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
