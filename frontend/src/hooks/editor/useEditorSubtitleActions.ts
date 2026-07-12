import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { SubtitleSegment } from "../../types/task";
import { isDesktopRuntime } from "../../services/domain";
import { useEditorStore } from "../../stores/editorStore";
import { fileService } from "../../services/fileService";
import { mediaReferenceFromPath } from "../../services/ui/mediaReference";
import { serializeEditorSubtitles } from "./editorFileHelpers";
import { toast } from "../../utils/toast";

export function useEditorSubtitleActions() {
  const { t } = useTranslation("editor");
  const video = useEditorStore((state) => state.document.video);
  const subtitle = useEditorStore((state) => state.document.subtitle);
  const markDocumentSaved = useEditorStore((state) => state.markDocumentSaved);

  const saveSubtitleFile = useCallback(
    async (regionsToSave: SubtitleSegment[], saveAs = false) => {
      const path = video?.path;
      if (!path) {
        toast.error(t("document.missingVideoForSave"));
        return false;
      }

      let targetPath = subtitle?.path || path.replace(/\.[^.]+$/, ".srt");

      if (saveAs || !subtitle) {
        if (isDesktopRuntime()) {
          const result = await fileService.showSaveDialog({
            defaultPath: targetPath,
            filters: [{ name: t("document.subtitleFileFilter"), extensions: ["srt"] }],
          });

          if (!result.canceled && result.filePath) {
            targetPath = result.filePath;
          } else {
            return false;
          }
        }
      }

      if (isDesktopRuntime()) {
        try {
          const didWrite = await fileService.writeFile(
            targetPath,
            serializeEditorSubtitles(regionsToSave),
          );
          if (didWrite === false) {
            throw new Error(`Failed to write subtitle file: ${targetPath}`);
          }
          const subtitleRef = mediaReferenceFromPath(targetPath);
          if (!subtitleRef) {
            throw new Error(`Invalid subtitle path: ${targetPath}`);
          }
          markDocumentSaved(subtitleRef);
          return targetPath;
        } catch (error) {
          console.error("[EditorIO] Failed to save subtitle file", error);
          throw error;
        }
      }

      console.warn("Saving not supported in browser mode (yet)");
      return false;
    },
    [markDocumentSaved, subtitle, t, video?.path],
  );

  return { saveSubtitleFile };
}
