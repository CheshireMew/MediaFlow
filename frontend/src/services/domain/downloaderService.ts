import type { AnalyzeResult, CookieStatusResponse, ElectronCookie } from "../../types/api";
import { executeBackendDirectCall } from "./executionExecutor";

export const downloaderService = {
  async analyzeUrl(url: string): Promise<AnalyzeResult> {
    return await executeBackendDirectCall({
      payload: url,
      desktopMethod: "analyzeDesktopUrl",
      desktopUnavailableMessage: "Desktop downloader worker is unavailable.",
      backendCall: (nextUrl) =>
        import("../../api/client").then(({ apiClient }) => apiClient.analyzeUrl(nextUrl)),
    });
  },

  async saveCookies(domain: string, cookies: ElectronCookie[]): Promise<CookieStatusResponse> {
    return await executeBackendDirectCall({
      payload: { domain, cookies },
      desktopMethod: "saveDesktopCookies",
      desktopUnavailableMessage: "Desktop downloader worker is unavailable.",
      mapDesktopArgs: ({ domain: nextDomain, cookies: nextCookies }) => [nextDomain, nextCookies],
      backendCall: ({ domain: nextDomain, cookies: nextCookies }) =>
        import("../../api/client").then(({ apiClient }) =>
          apiClient.saveCookies(nextDomain, nextCookies),
        ),
    });
  },
};
