import type {
  SaveFileDialogRequest,
  SaveFileDialogResult,
  SelectDirectoryRequest,
} from "../contracts/desktopFileSystemContract";

export interface DesktopRuntimeInfo {
  status: "pong";
  contract_version: number;
  bridge_version: string;
  capabilities: Array<keyof ElectronAPI>;
  backend: {
    status: "external" | "managed" | "failed";
    host: string;
    port: number | null;
    api_base_url: string;
    ws_base_url: string;
    health_url: string;
    health_status?: "starting" | "ready" | "failed";
    error?: string;
  };
}

export interface ElectronAPI {
  openFile: (
    request: import("../contracts/openFileContract").OpenFileDialogRequest,
  ) => Promise<import("../contracts/openFileContract").OpenFileDialogResult>;
  readFile: (filePath: string) => Promise<string | null>;
  showSaveDialog: (
    options: SaveFileDialogRequest,
  ) => Promise<SaveFileDialogResult>;
  selectDirectory: (request?: SelectDirectoryRequest) => Promise<string | null>;
  showInExplorer: (filePath: string) => Promise<void>;
  fetchCookies: (targetUrl: string) => Promise<unknown>;
  getPathForFile: (file: File) => string;
  writeFile: (filePath: string, content: string) => Promise<boolean>;
  getFileSize: (filePath: string) => Promise<number>;
  readWorkspaceState: (sessionId: string) => Promise<string | null>;
  writeWorkspaceState: (
    content: string,
    sessionId: string,
    revision: number,
  ) => Promise<boolean>;
  writeWorkspaceStateSync: (
    content: string,
    sessionId: string,
    revision: number,
  ) => boolean;
  getDesktopRuntimeInfo: () => Promise<DesktopRuntimeInfo>;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  notifyRendererReady: () => void;
}
