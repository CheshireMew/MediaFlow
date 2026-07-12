import type { ElectronAPI } from "../../src/types/electron-api";

export const DESKTOP_BRIDGE_CAPABILITIES = [
  "openFile",
  "readFile",
  "showSaveDialog",
  "selectDirectory",
  "showInExplorer",
  "fetchCookies",
  "getPathForFile",
  "writeFile",
  "getFileSize",
  "readWorkspaceState",
  "writeWorkspaceState",
  "writeWorkspaceStateSync",
  "getDesktopRuntimeInfo",
  "minimize",
  "maximize",
  "close",
  "notifyRendererReady",
] as const satisfies readonly (keyof ElectronAPI)[];
