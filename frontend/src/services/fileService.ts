import { getDesktopApi, requireDesktopApiMethod } from "./desktop/bridge";
import type { OpenFileDialogRequest } from "../contracts/openFileContract";

function replaceBasename(filePath: string, fallbackName?: string) {
  if (!fallbackName || !filePath) {
    return filePath;
  }

  const lastSeparatorIndex = Math.max(
    filePath.lastIndexOf("/"),
    filePath.lastIndexOf("\\"),
  );
  if (lastSeparatorIndex === -1) {
    return fallbackName;
  }

  return `${filePath.slice(0, lastSeparatorIndex + 1)}${fallbackName}`;
}

export const fileService = {
  getPathForFile(file: File): string {
    return requireDesktopApiMethod("getPathForFile", "File path resolution is unavailable.")(file);
  },

  async openFile(request: OpenFileDialogRequest) {
    return await requireDesktopApiMethod("openFile", "Open file dialog is unavailable.")(request);
  },

  async openSubtitleFile() {
    return await requireDesktopApiMethod(
      "openSubtitleFile",
      "Subtitle file dialog is unavailable.",
    )();
  },

  async showSaveDialog(options: {
    title?: string;
    defaultPath?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  }) {
    return await requireDesktopApiMethod(
      "showSaveDialog",
      "Save dialog is unavailable.",
    )(options);
  },

  async selectDirectory() {
    return await requireDesktopApiMethod(
      "selectDirectory",
      "Directory selection is unavailable.",
    )();
  },

  async readFile(path: string) {
    return await requireDesktopApiMethod("readFile", "File reading is unavailable.")(path);
  },

  async writeFile(path: string, content: string) {
    return await requireDesktopApiMethod("writeFile", "File writing is unavailable.")(
      path,
      content,
    );
  },

  async saveFile(path: string, content: string) {
    try {
      return await requireDesktopApiMethod("saveFile", "File saving is unavailable.")(path, content);
    } catch {
      return await this.writeFile(path, content);
    }
  },

  async getFileSize(path: string) {
    return await requireDesktopApiMethod(
      "getFileSize",
      "File size inspection is unavailable.",
    )(path);
  },

  async resolveExistingPath(path: string, fallbackName?: string, expectedSize?: number) {
    const api = getDesktopApi();

    try {
      if (api?.resolveExistingPath) {
        const resolved = await api.resolveExistingPath(path, fallbackName, expectedSize);
        return resolved || replaceBasename(path, fallbackName);
      }
    } catch (error) {
      console.warn("[fileService] resolveExistingPath failed, using fallback", error);
    }

    return replaceBasename(path, fallbackName);
  },

  async showInExplorer(path: string) {
    return await requireDesktopApiMethod(
      "showInExplorer",
      "Show in explorer is unavailable.",
    )(path);
  },
};
