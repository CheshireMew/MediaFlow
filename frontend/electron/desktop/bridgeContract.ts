import type { ElectronAPI } from "../../src/contracts/desktopBridgeContract";

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
  "getDesktopRuntimeInfo",
  "minimize",
  "maximize",
  "close",
  "notifyRendererReady",
  "onPrepareToClose",
] as const satisfies readonly (keyof ElectronAPI)[];
