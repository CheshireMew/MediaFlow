import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import type { AnalyzeResult } from "../../api/client";
import { desktopBrowserService } from "../../services/desktop";
import { downloaderService, isDesktopRuntime } from "../../services/domain";
import { prewarmFasterWhisperCliFromStoredPreferences } from "../../services/asrCliPrewarm";

type UseDownloaderAnalysisOptions = {
  url: string;
  onSingleAnalysis: (analysis: AnalyzeResult) => Promise<void>;
};

export function useDownloaderAnalysis({ url, onSingleAnalysis }: UseDownloaderAnalysisOptions) {
  const { t } = useTranslation("downloader");
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playlistInfo, setPlaylistInfo] = useState<AnalyzeResult | null>(null);
  const [showPlaylistDialog, setShowPlaylistDialog] = useState(false);
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [lastAnalysis, setLastAnalysis] = useState<AnalyzeResult | null>(null);

  const processAnalysis = useCallback(async (analysis: AnalyzeResult) => {
    setLastAnalysis(analysis);
    if (analysis.type === "playlist" && analysis.items && analysis.items.length > 1) {
      setPlaylistInfo(analysis);
      setSelectedItems([]);
      setShowPlaylistDialog(true);
      return;
    }
    await onSingleAnalysis(analysis);
  }, [onSingleAnalysis]);

  const fetchCookies = useCallback(async (domain: string) => {
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
      setError(t("feedback.cookiesFailed", {
        detail: cookieError instanceof Error ? cookieError.message : String(cookieError),
      }));
      return false;
    }
  }, [t]);

  const analyzeAndDownload = useCallback(async () => {
    if (!url) return;
    prewarmFasterWhisperCliFromStoredPreferences();
    setAnalyzing(true);
    setError(null);
    setPlaylistInfo(null);
    setLastAnalysis(null);
    try {
      await processAnalysis(await downloaderService.analyzeUrl(url));
    } catch (analysisError: unknown) {
      const message = analysisError instanceof Error
        ? analysisError.message
        : t("feedback.analysisFailed");
      const domain = message.match(/COOKIES_REQUIRED:([a-zA-Z0-9.-]+)/)?.[1];
      if (!domain) {
        setError(message);
        return;
      }
      if (!(await fetchCookies(domain))) return;
      try {
        await processAnalysis(await downloaderService.analyzeUrl(url));
      } catch (retryError: unknown) {
        setError(t("feedback.analysisFailedDetail", {
          detail: retryError instanceof Error ? retryError.message : String(retryError),
        }));
      }
    } finally {
      setAnalyzing(false);
    }
  }, [fetchCookies, processAnalysis, t, url]);

  const resetAnalysis = useCallback(() => setLastAnalysis(null), []);
  const toggleItemSelection = useCallback((index: number) => {
    setSelectedItems((current) => current.includes(index)
      ? current.filter((item) => item !== index)
      : [...current, index]);
  }, []);

  return {
    analyzing,
    error,
    setError,
    playlistInfo,
    showPlaylistDialog,
    setShowPlaylistDialog,
    selectedItems,
    setSelectedItems,
    lastAnalysis,
    analyzeAndDownload,
    resetAnalysis,
    toggleItemSelection,
  };
}
