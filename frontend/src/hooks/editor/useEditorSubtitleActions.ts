import { useCallback } from "react";
import type { SubtitleSegment } from "../../types/task";
import { useEditorStore } from "../../stores/editorStore";
import { serializeEditorSubtitles } from "./editorFileHelpers";

export function useEditorSubtitleActions() {
  const currentFilePath = useEditorStore((state) => state.currentFilePath);
  const currentSubtitlePath = useEditorStore(
    (state) => state.currentSubtitlePath,
  );
  const setCurrentSubtitlePath = useEditorStore(
    (state) => state.setCurrentSubtitlePath,
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
        if (window.electronAPI?.showSaveDialog) {
          const result = await window.electronAPI.showSaveDialog({
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

      if (window.electronAPI?.writeFile) {
        try {
          await window.electronAPI.writeFile(
            targetPath,
            serializeEditorSubtitles(regionsToSave),
          );
          if (!currentSubtitlePath) {
            setCurrentSubtitlePath(targetPath);
          }
          return targetPath;
        } catch (error) {
          console.error("[EditorIO] Failed to save subtitle file", error);
          throw error;
        }
      }

      console.warn("Saving not supported in browser mode (yet)");
      return false;
    },
    [currentFilePath, currentSubtitlePath, setCurrentSubtitlePath],
  );

  return { saveSubtitleFile };
}
