import { useCallback } from "react";
import { isDesktopRuntime } from "../../services/domain";
import { fileService } from "../../services/fileService";
import { fileMatchesOpenDialogProfile } from "../../contracts/openFileContract";
import { isSupportedEditorSubtitlePath } from "./editorFileHelpers";

type DragFileWithPath = File & { path?: string };

type UseEditorDragDropArgs = {
  loadVideo: (path: string) => Promise<void>;
  loadSubtitleFromPath: (path: string) => Promise<void>;
};

function resolveDragFilePath(file: DragFileWithPath): string | undefined {
  if (file.path) {
    return file.path;
  }
  if (!isDesktopRuntime()) {
    return undefined;
  }
  return fileService.getPathForFile(file);
}

export function useEditorDragDrop({
  loadVideo,
  loadSubtitleFromPath,
}: UseEditorDragDropArgs) {
  const mediaProfile = "editor-media" as const;
  const handleVideoDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const file = event.dataTransfer.files[0] as DragFileWithPath | undefined;
      if (!file || !fileMatchesOpenDialogProfile(file, mediaProfile)) {
        return;
      }

      const path = resolveDragFilePath(file);
      if (path) {
        await loadVideo(path);
      }
    },
    [loadVideo],
  );

  const handleSubtitleDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const file = event.dataTransfer.files[0] as DragFileWithPath | undefined;
      const name = file?.name?.toLowerCase() ?? "";
      if (!file) {
        return;
      }

      if (!isSupportedEditorSubtitlePath(name)) {
        alert("Only SRT subtitle files are supported in the editor.");
        return;
      }

      const path = resolveDragFilePath(file);
      if (path) {
        await loadSubtitleFromPath(path);
      }
    },
    [loadSubtitleFromPath],
  );

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  return {
    handleVideoDrop,
    handleSubtitleDrop,
    handleDragOver,
  };
}
