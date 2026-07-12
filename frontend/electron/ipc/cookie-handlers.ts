/**
 * Cookie IPC Handlers
 *
 * Handles: cookies:fetch — opens a visible browser window for user verification,
 * then extracts cookies when the window is closed or times out.
 */
import {
  app,
  BrowserWindow,
  ipcMain,
  session,
  type Cookie,
  type IpcMainInvokeEvent,
} from "electron";
import { getElectronMessages } from "../localization";

function normalizeCookieTargetUrl(targetUrl: string) {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function registerCookieHandlers() {
  ipcMain.handle(
    "cookies:fetch",
    async (_event: IpcMainInvokeEvent, targetUrl: string): Promise<Cookie[]> => {
      const normalizedTargetUrl = normalizeCookieTargetUrl(targetUrl);
      if (!normalizedTargetUrl) {
        console.warn("[Cookie Fetch] Rejected an invalid verification target.");
        throw new Error("Cookie verification requires a valid HTTP(S) target.");
      }

      console.info("[Cookie Fetch] Verification window opened.");

      return new Promise((resolve, reject) => {
        // Create a VISIBLE browser window so user can complete any verification
        const cookieWindow = new BrowserWindow({
          width: 1000,
          height: 700,
          title: getElectronMessages(app.getLocale()).cookieVerificationTitle,
          autoHideMenuBar: true,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
          },
        });

        let settled = false;

        // When user closes the window, extract cookies
        cookieWindow.on("closed", async () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);

          try {
            const cookies = await session.defaultSession.cookies.get({
              url: normalizedTargetUrl,
            });
            console.info(
              `[Cookie Fetch] Cookie extraction completed (${cookies.length} cookies).`,
            );
            resolve(cookies);
          } catch {
            console.error("[Cookie Fetch] Cookie extraction failed.");
            reject(new Error("Cookie extraction failed."));
          }
        });

        // Set a long timeout (5 minutes) in case user forgets
        const timeout = setTimeout(() => {
          if (!settled && !cookieWindow.isDestroyed()) {
            console.info("[Cookie Fetch] Verification window timed out.");
            cookieWindow.close();
          }
        }, 300000);

        // Navigate to the target URL
        void cookieWindow.loadURL(normalizedTargetUrl, {
          // Use Mobile UA to bypass some desktop captcha/login flows.
          userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
        }).catch(() => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          console.error("[Cookie Fetch] Verification page failed to load.");
          if (!cookieWindow.isDestroyed()) {
            cookieWindow.destroy();
          }
          reject(new Error("Cookie verification page failed to load."));
        });
      });
    },
  );
}
