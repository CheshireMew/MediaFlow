import type {
  SaveFileDialogRequest,
  SaveFileDialogResult,
  SelectDirectoryRequest,
} from "../contracts/desktopFileSystemContract";
import type { DesktopWorkerBridgeApi } from "../contracts/generatedDesktopWorkerApi";

export interface DesktopRuntimeInfo {
  status: "pong";
  contract_version: number;
  bridge_version: string;
  task_owner_mode: import("../contracts/runtimeContracts").TaskOwnerMode;
  capabilities: Array<keyof ElectronAPI>;
  worker: {
    protocol_version: number;
    app_version?: string | null;
  };
}

export interface ElectronAPI extends Partial<DesktopWorkerBridgeApi> {
  openFile: (
    request: import("../contracts/openFileContract").OpenFileDialogRequest,
  ) => Promise<{ path: string; name: string; size: number } | null>;
  openSubtitleFile: () => Promise<{ path: string; name: string } | null>;
  readFile: (filePath: string) => Promise<string | null>;
  showSaveDialog: (
    options: SaveFileDialogRequest,
  ) => Promise<SaveFileDialogResult>;
  selectDirectory: (request?: SelectDirectoryRequest) => Promise<string | null>;
  showInExplorer: (filePath: string) => Promise<void>;
  fetchCookies: (targetUrl: string) => Promise<unknown>;
  getPathForFile: (file: File) => string;
  writeFile: (filePath: string, content: string) => Promise<void>;
  getFileSize: (filePath: string) => Promise<number>;
  getDesktopRuntimeInfo?: () => Promise<DesktopRuntimeInfo>;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  notifyRendererReady?: () => void;
}
