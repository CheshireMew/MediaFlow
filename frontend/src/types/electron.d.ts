type SaveDialogOptions = {
  title?: string;
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
};

type SaveDialogResult = {
  canceled: boolean;
  filePath?: string;
};

type ExtractedDouyinData = {
  title?: string;
  video_url?: string;
  audio_url?: string;
  cover_url?: string;
  [key: string]: unknown;
};

interface ElectronAPI {
  sendMessage: (message: string) => void;
  openFile: (
    defaultPath?: string,
  ) => Promise<{ path: string; name: string; size: number } | null>;
  openSubtitleFile: () => Promise<{ path: string; name: string } | null>;
  readFile: (filePath: string) => Promise<string>;
  showSaveDialog: (options: SaveDialogOptions) => Promise<SaveDialogResult>;
  selectDirectory: () => Promise<string | null>;
  showInExplorer: (filePath: string) => Promise<void>;
  fetchCookies: (targetUrl: string) => Promise<unknown>;
  extractDouyinData: (url: string) => Promise<ExtractedDouyinData>;
  getPathForFile: (file: File) => string;
  writeFile: (filePath: string, content: string) => Promise<void>;
  readBinaryFile: (filePath: string) => Promise<ArrayBuffer | null>;
  writeBinaryFile: (filePath: string, data: ArrayBuffer) => Promise<void>;
  getFileSize: (filePath: string) => Promise<number>;
  saveFile: (filePath: string, content: string) => Promise<void>;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
}

interface Window {
  electronAPI: ElectronAPI;
}
