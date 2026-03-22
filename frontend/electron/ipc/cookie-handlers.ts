/**
 * Cookie IPC Handlers
 *
 * Handles: cookies:fetch — opens a visible browser window for user verification,
 * then extracts cookies when the window is closed or times out.
 */
import { BrowserWindow, ipcMain, session, type Cookie, type IpcMainInvokeEvent } from "electron";

export function registerCookieHandlers() {
  ipcMain.handle(
    "cookies:fetch",
    async (_event: IpcMainInvokeEvent, targetUrl: string): Promise<Cookie[]> => {
      console.log(`[Cookie Fetch] Starting for: ${targetUrl}`);

      return new Promise((resolve, reject) => {
        // Create a VISIBLE browser window so user can complete any verification
        const cookieWindow = new BrowserWindow({
          width: 1000,
          height: 700,
          title: "请完成验证后关闭此窗口",
          autoHideMenuBar: true,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
          },
        });

        let resolved = false;

        // When user closes the window, extract cookies
        cookieWindow.on("closed", async () => {
          if (resolved) return;
          resolved = true;

          try {
            const urlObj = new URL(targetUrl);
            const domain = urlObj.hostname.replace("www.", "");

            // Get all cookies for this domain
            const cookies = await session.defaultSession.cookies.get({});
            // Filter for the target domain
            const domainCookies = cookies.filter((c) =>
              c.domain.includes(domain),
            );
            console.log(
              `[Cookie Fetch] Got ${domainCookies.length} cookies for ${domain}`,
            );

            resolve(domainCookies);
          } catch (err) {
            console.error("[Cookie Fetch] Error getting cookies:", err);
            reject(err);
          }
        });

        // Set a long timeout (5 minutes) in case user forgets
        setTimeout(() => {
          if (!resolved && !cookieWindow.isDestroyed()) {
            console.log(
              "[Cookie Fetch] Timeout reached, extracting cookies...",
            );
            cookieWindow.close();
          }
        }, 300000);

        // Navigate to the target URL
        cookieWindow.loadURL(targetUrl, {
          // Use Mobile UA to bypass some desktop captcha/login flows.
          userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
        });
      });
    },
  );
}
