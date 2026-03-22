import { apiClient } from "../../api/client";
import type { AnalyzeResult, CookieStatusResponse, ElectronCookie } from "../../types/api";
import { isDesktopRuntime, requireDesktopApiMethod } from "../desktop/bridge";

export const downloaderService = {
  async analyzeUrl(url: string): Promise<AnalyzeResult> {
    if (isDesktopRuntime()) {
      return await requireDesktopApiMethod(
        "analyzeDesktopUrl",
        "Desktop downloader worker is unavailable.",
      )(url);
    }
    return await apiClient.analyzeUrl(url);
  },

  async saveCookies(domain: string, cookies: ElectronCookie[]): Promise<CookieStatusResponse> {
    if (isDesktopRuntime()) {
      return await requireDesktopApiMethod(
        "saveDesktopCookies",
        "Desktop downloader worker is unavailable.",
      )(domain, cookies);
    }
    return apiClient.saveCookies(domain, cookies);
  },
};
