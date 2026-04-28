export const DESKTOP_FILE_SYSTEM_CHANNELS = {
  openFile: "dialog:openFile",
  openSubtitleFile: "dialog:openSubtitleFile",
  saveFileDialog: "dialog:saveFile",
  selectDirectory: "dialog:selectDirectory",
  readTextFile: "fs:readTextFile",
  writeTextFile: "fs:writeTextFile",
  getFileSize: "fs:getFileSize",
  resolveExistingPath: "fs:resolveExistingPath",
  rememberRendererFile: "fs:rememberRendererFile",
} as const;

export type SaveFileDialogRequest = {
  title?: string;
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
};

export type SelectDirectoryRequest = {
  access: "read" | "write";
};

export type SaveFileDialogResult =
  | { canceled: true; filePath: null }
  | { canceled: false; filePath: string };
