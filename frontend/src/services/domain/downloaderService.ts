import type { AnalyzeResult, CookieStatusResponse, ElectronCookie } from "../../types/api";
import { executeBackendDirectCall } from "./executionExecutor";
import { apiClient } from "../../api/client";

export const downloaderService = {
  async analyzeUrl(url: string): Promise<AnalyzeResult> {
    return await executeBackendDirectCall({
      payload: url,
      backendCall: (nextUrl) => apiClient.analyzeUrl(nextUrl),
    });
  },

  async saveCookies(domain: string, cookies: ElectronCookie[]): Promise<CookieStatusResponse> {
    return await executeBackendDirectCall({
      payload: { domain, cookies },
      backendCall: ({ domain: nextDomain, cookies: nextCookies }) =>
        apiClient.saveCookies(nextDomain, nextCookies),
    });
  },
};
