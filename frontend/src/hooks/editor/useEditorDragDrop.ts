import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { isDesktopRuntime } from "../../services/domain";
import { fileService } from "../../services/fileService";
import { fileMatchesOpenDialogProfile } from "../../contracts/openFileContract";
import { isSupportedEditorSubtitlePath } from "./editorFileHelpers";
import { toast } from "../../utils/toast";
import {
  mediaReferenceFromPath,
  type MediaReference,
} from "../../services/ui/mediaReference";

type DragFileWithPath = File & { path?: string };

type UseEditorDragDropArgs = {
  loadVideo: (reference: MediaReference) => Promise<unknown>;
  loadSubtitleFromPath: (reference: MediaReference) => Promise<unknown>;
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
  const { t } = useTranslation("editor");
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
      const reference = path
        ? mediaReferenceFromPath(path, {
            name: file.name,
            size: file.size,
            type: file.type,
            origin: "drag-drop",
          })
        : null;
      if (reference) {
        await loadVideo(reference);
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
        toast.warning(t("document.unsupportedSubtitle"));
        return;
      }

      const path = resolveDragFilePath(file);
      const reference = path
        ? mediaReferenceFromPath(path, {
            name: file.name,
            size: file.size,
            type: file.type,
            origin: "drag-drop",
          })
        : null;
      if (reference) {
        await loadSubtitleFromPath(reference);
      }
    },
    [loadSubtitleFromPath, t],
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
