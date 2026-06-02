import { useCallback } from "react";
import type { SubtitleSegment } from "../../types/task";
import { isDesktopRuntime } from "../../services/domain";
import { useEditorStore } from "../../stores/editorStore";
import { fileService } from "../../services/fileService";
import { normalizeMediaReference } from "../../services/ui/mediaReference";
import { serializeEditorSubtitles } from "./editorFileHelpers";

export function useEditorSubtitleActions() {
  const currentFilePath = useEditorStore((state) => state.currentFilePath);
  const currentSubtitlePath = useEditorStore(
    (state) => state.currentSubtitlePath,
  );
  const setCurrentSubtitlePath = useEditorStore(
    (state) => state.setCurrentSubtitlePath,
  );
  const setCurrentSubtitleRef = useEditorStore(
    (state) => state.setCurrentSubtitleRef,
  );

  const saveSubtitleFile = useCallback(
    async (regionsToSave: SubtitleSegment[], saveAs = false) => {
      const path = currentFilePath;
      if (!path) {
        alert("No file path found to save to.");
        return false;
      }

      let targetPath = currentSubtitlePath || path.replace(/\.[^.]+$/, ".srt");

      if (saveAs || !currentSubtitlePath) {
        if (isDesktopRuntime()) {
          const result = await fileService.showSaveDialog({
            defaultPath: targetPath,
            filters: [{ name: "Subtitle Files", extensions: ["srt"] }],
          });

          if (!result.canceled && result.filePath) {
            targetPath = result.filePath;
            setCurrentSubtitlePath(targetPath);
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
          const subtitleRef = normalizeMediaReference(targetPath);
          setCurrentSubtitlePath(targetPath);
          setCurrentSubtitleRef(subtitleRef);
          return targetPath;
        } catch (error) {
          console.error("[EditorIO] Failed to save subtitle file", error);
          throw error;
        }
      }

      console.warn("Saving not supported in browser mode (yet)");
      return false;
    },
    [currentFilePath, currentSubtitlePath, setCurrentSubtitlePath, setCurrentSubtitleRef],
  );

  return { saveSubtitleFile };
}
