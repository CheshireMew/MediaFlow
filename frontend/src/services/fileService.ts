import { requireDesktopApiMethod } from "./desktop";
import type { OpenFileDialogRequest } from "../contracts/openFileContract";
import type {
  SaveFileDialogRequest,
  SelectDirectoryRequest,
} from "../contracts/desktopFileSystemContract";

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

  async showSaveDialog(options: SaveFileDialogRequest) {
    return await requireDesktopApiMethod(
      "showSaveDialog",
      "Save dialog is unavailable.",
    )(options);
  },

  async selectDirectory(request: SelectDirectoryRequest = { access: "read" }) {
    return await requireDesktopApiMethod(
      "selectDirectory",
      "Directory selection is unavailable.",
    )(request);
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

  async getFileSize(path: string) {
    return await requireDesktopApiMethod(
      "getFileSize",
      "File size inspection is unavailable.",
    )(path);
  },

  async showInExplorer(path: string) {
    return await requireDesktopApiMethod(
      "showInExplorer",
      "Show in explorer is unavailable.",
    )(path);
  },
};
