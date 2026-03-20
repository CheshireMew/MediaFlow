import { useCallback } from "react";

import { useTranslatorStore } from "../../stores/translatorStore";
import { NavigationService } from "../../services/ui/navigation";
import {
  formatTranslatorTimestamp,
  getTranslatorOutputSuffix,
  stripTranslatorSubtitleExtension,
} from "./translatorFileHelpers";

export function useTranslatorOutputActions() {
  const { sourceFilePath, targetLang, mode, targetSegments } = useTranslatorStore();

  const exportSRT = useCallback(async () => {
    if (!sourceFilePath || !window.electronAPI) return;

    const suffix = getTranslatorOutputSuffix(targetLang, mode);

    let defaultPath = sourceFilePath;
    const lastDotIndex = defaultPath.lastIndexOf(".");
    const lastSepIndex = Math.max(
      defaultPath.lastIndexOf("/"),
      defaultPath.lastIndexOf("\\"),
    );

    if (lastDotIndex > lastSepIndex) {
      defaultPath = defaultPath.substring(0, lastDotIndex);
    }
    defaultPath += `${suffix}.srt`;

    try {
      const savePath = await window.electronAPI.showSaveDialog({
        defaultPath,
        filters: [
          { name: "Subtitles", extensions: ["srt"] },
          { name: "Text", extensions: ["txt"] },
        ],
      });

      if (savePath.canceled || !savePath.filePath) return;

      let content = "";
      if (savePath.filePath.toLowerCase().endsWith(".txt")) {
        content = targetSegments.map((seg) => seg.text).join("\n");
      } else {
        targetSegments.forEach((seg, index) => {
          const startStr = formatTranslatorTimestamp(seg.start);
          const endStr = formatTranslatorTimestamp(seg.end);
          content += `${index + 1}\n${startStr} --> ${endStr}\n${seg.text}\n\n`;
        });
      }

      await window.electronAPI.saveFile(savePath.filePath, content);
    } catch (error) {
      console.error(error);
      alert("Failed to save file: " + error);
    }
  }, [mode, sourceFilePath, targetLang, targetSegments]);

  const handleOpenInEditor = useCallback(async () => {
    if (!sourceFilePath || targetSegments.length === 0 || !window.electronAPI) {
      return;
    }

    const basePath = stripTranslatorSubtitleExtension(sourceFilePath);
    let videoPath: string | null = null;
    for (const ext of [".mp4", ".mkv", ".avi", ".mov", ".webm"]) {
      try {
        const size = await window.electronAPI.getFileSize(basePath + ext);
        if (size && size > 0) {
          videoPath = basePath + ext;
          break;
        }
      } catch {
        continue
      }
    }

    if (!videoPath) {
      console.warn("Could not find associated video file.");
      alert(
        `Could not find an associated video next to the subtitle.\nTried: ${basePath}.mp4/.mkv/.avi/.mov/.webm\nThe editor will open with a best-effort video path.`,
      );
    }

    const suffix = getTranslatorOutputSuffix(targetLang, mode);
    let targetSrtPath = sourceFilePath;
    const lastDot = targetSrtPath.lastIndexOf(".");
    if (lastDot > 0) targetSrtPath = targetSrtPath.substring(0, lastDot);
    targetSrtPath += `${suffix}.srt`;

    try {
      let content = "";
      targetSegments.forEach((seg, index) => {
        const startStr = formatTranslatorTimestamp(seg.start);
        const endStr = formatTranslatorTimestamp(seg.end);
        content += `${index + 1}\n${startStr} --> ${endStr}\n${seg.text || ""}\n\n`;
      });

      await window.electronAPI.writeFile(targetSrtPath, content);
    } catch (error) {
      console.error("Failed to auto-save translation before opening editor", error);
      alert(
        "Failed to save translation file. Editor might not load the correct file.",
      );
      return;
    }

    const resolvedVideoPath = videoPath || basePath + ".mp4";
    NavigationService.navigate("editor", {
      video_path: resolvedVideoPath,
      subtitle_path: targetSrtPath,
    });
  }, [mode, sourceFilePath, targetLang, targetSegments]);

  return {
    exportSRT,
    handleOpenInEditor,
  };
}
