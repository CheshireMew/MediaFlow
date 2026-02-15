export interface ElectronAPI {
  sendMessage: (message: any) => void;
  openFile: () => Promise<{ path: string; name: string; size: number } | null>;
  openSubtitleFile: () => Promise<{ path: string; name: string } | null>;
  readFile: (filePath: string) => Promise<string>;
  showSaveDialog: (options: any) => Promise<any>;
  selectDirectory: () => Promise<string | null>;
  showInExplorer: (filePath: string) => Promise<void>;
  fetchCookies: (targetUrl: string) => Promise<any>;
  extractDouyinData: (url: string) => Promise<any>;
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

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
