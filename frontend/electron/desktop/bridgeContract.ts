import desktopWorkerContract from "../../../contracts/desktop-worker-contract.json";
import { DESKTOP_WORKER_INVOCATION_DESCRIPTORS } from "../../src/contracts/generatedDesktopWorkerApi";

export const DESKTOP_WORKER_PROTOCOL_VERSION = desktopWorkerContract.protocol_version;
export const DESKTOP_WORKER_INVOCATIONS = DESKTOP_WORKER_INVOCATION_DESCRIPTORS;

export const DESKTOP_BRIDGE_CAPABILITIES = [
  "openFile",
  "openSubtitleFile",
  "readFile",
  "showSaveDialog",
  "selectDirectory",
  "showInExplorer",
  "fetchCookies",
  "getPathForFile",
  "writeFile",
  "getFileSize",
  "getDesktopRuntimeInfo",
  ...Object.keys(DESKTOP_WORKER_INVOCATIONS),
  "minimize",
  "maximize",
  "close",
  "notifyRendererReady",
] as const;
