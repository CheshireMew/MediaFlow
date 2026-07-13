/// <reference types="node" />
import { app, BrowserWindow, Menu, shell } from "electron";

import { registerDialogHandlers } from "./ipc/dialog-handlers";
import { bindRendererReadyCallback, registerWindowHandlers } from "./ipc/window-handlers";
import { registerCookieHandlers } from "./ipc/cookie-handlers";
import { registerDesktopHandlers } from "./ipc/desktop-handlers";
import { registerWorkspaceStateHandlers } from "./ipc/workspace-state-handlers";
import { startBundledBackend, stopBundledBackend } from "./backend/backendProcess";
import {
  isDesktopDevMode,
  migrateDesktopRuntimeData,
  resolveDesktopPreloadScript,
  resolveDesktopRendererTarget,
  resolveDesktopWorkspaceDir,
} from "./desktopRuntime";
import {
  buildRendererLoadFailureDataUrl,
  getElectronMessages,
} from "./localization";

function registerIpcHandlers() {
  registerDialogHandlers();
  registerWindowHandlers();
  registerCookieHandlers();
  registerDesktopHandlers();
  registerWorkspaceStateHandlers();
}

function createWindow() {
  const isDev = isDesktopDevMode();
  const rendererTarget = resolveDesktopRendererTarget();
  const systemLocale = app.getLocale();
  const messages = getElectronMessages(systemLocale);

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#0a0a0a",
    frame: false,
    show: false,
    webPreferences: {
      preload: resolveDesktopPreloadScript(),
      nodeIntegration: false,
      contextIsolation: true,
      // This preload imports local modules, which Electron's sandboxed preload cannot resolve.
      sandbox: false,
      webSecurity: !isDev,
    },
  });

  let loadFailureHandled = false;
  const revealWindow = () => {
    if (!mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  };
  const revealFallbackTimer = setTimeout(revealWindow, 4000);
  mainWindow.once("show", () => {
    clearTimeout(revealFallbackTimer);
  });
  mainWindow.once("ready-to-show", () => {
    revealWindow();
  });
  bindRendererReadyCallback(mainWindow, () => {
    revealWindow();
  });
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || loadFailureHandled) {
      return;
    }

    loadFailureHandled = true;
    console.error(
      `[Desktop] Failed to load renderer (${errorCode}): ${errorDescription || "Unknown error"}.`,
    );
    revealWindow();

    void mainWindow.loadURL(
      buildRendererLoadFailureDataUrl(systemLocale, {
        errorCode,
        errorDescription,
        target: validatedURL || rendererTarget.target,
      }),
    );
  });

  if (rendererTarget.kind === "url") {
    mainWindow.loadURL(rendererTarget.target);
    if (process.env.MEDIAFLOW_OPEN_DEVTOOLS === "true") {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    mainWindow.loadFile(rendererTarget.target);
  }

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: messages.menuFile,
      submenu: [{ role: "quit" }],
    },
    {
      label: messages.menuView,
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
      ],
    },
    {
      label: messages.menuHelp,
      submenu: [
        {
          label: messages.menuOpenWorkspace,
          click: async () => {
            await shell.openPath(resolveDesktopWorkspaceDir());
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerAppLifecycle() {
  app.on("ready", () => {
    void migrateDesktopRuntimeData()
      .then(() => {
        registerIpcHandlers();
        startBundledBackend();
        createWindow();
      })
      .catch((error) => {
        console.error("[Desktop] Failed to migrate runtime data.", error);
        app.quit();
      });
  });

  app.on("before-quit", () => {
    stopBundledBackend();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    }
  });
  registerAppLifecycle();
}
