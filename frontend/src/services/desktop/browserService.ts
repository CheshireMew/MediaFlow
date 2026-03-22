import type { ElectronCookie } from "../../types/api";
import { requireDesktopApiMethod } from "./bridge";

export const desktopBrowserService = {
  async fetchCookies(targetUrl: string): Promise<ElectronCookie[]> {
    const cookies = await requireDesktopApiMethod(
      "fetchCookies",
      "Browser cookie capture is unavailable.",
    )(targetUrl);
    return Array.isArray(cookies) ? (cookies as ElectronCookie[]) : [];
  },
};
