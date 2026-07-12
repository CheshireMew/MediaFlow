import { fileService } from "../../services/fileService";
import type { ContextMenuItem } from "./ContextMenu";

type OpenSubtitleFolderMenuItemParams = {
  label: string;
  onError?: (error: unknown) => void | Promise<void>;
  subtitlePath?: string | null;
};

export async function openSubtitleFolder(subtitlePath: string) {
  await fileService.showInExplorer(subtitlePath);
}

export function createOpenSubtitleFolderMenuItem({
  label,
  onError,
  subtitlePath,
}: OpenSubtitleFolderMenuItemParams): ContextMenuItem {
  return {
    label,
    disabled: !subtitlePath,
    onClick: async () => {
      if (!subtitlePath) return;

      try {
        await openSubtitleFolder(subtitlePath);
      } catch (error) {
        await onError?.(error);
      }
    },
  };
}
