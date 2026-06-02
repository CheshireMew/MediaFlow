import { useCallback } from "react";

import { isDesktopRuntime } from "../../services/domain";
import { useTranslatorStore } from "../../stores/translatorStore";
import { fileService } from "../../services/fileService";
import {
  createNavigationMediaPayload,
  NavigationService,
} from "../../services/ui/navigation";
import type { MediaReference } from "../../services/ui/mediaReference";
import {
  buildTranslatorOutputPath,
  formatTranslatorTimestamp,
  getTranslatorOutputSuffix,
  stripTranslatorSubtitleExtension,
} from "./translatorFileHelpers";
import {
  findRelatedVideoForSubtitle,
  formatRelatedVideoCandidateSummary,
} from "../../services/ui/relatedMedia";

export function createTranslatorEditorNavigationPayload(params: {
  videoPath: string;
  subtitlePath: string;
  targetSubtitleRef: MediaReference | null;
}) {
  const { videoPath, subtitlePath, targetSubtitleRef } = params;
  return createNavigationMediaPayload({
    videoPath,
    subtitlePath: targetSubtitleRef?.path ?? subtitlePath,
    subtitleRef: targetSubtitleRef,
  });
}

export function useTranslatorOutputActions() {
  const { sourceFilePath, targetSubtitleRef, targetLang, mode, targetSegments } = useTranslatorStore();

  const exportSRT = useCallback(async () => {
    if (!sourceFilePath || !isDesktopRuntime()) return;

    const suffix = getTranslatorOutputSuffix(targetLang, mode);
    const defaultPath = buildTranslatorOutputPath(sourceFilePath, suffix);

    try {
      const savePath = await fileService.showSaveDialog({
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

      const didWrite = await fileService.writeFile(savePath.filePath, content);
      if (didWrite === false) {
        throw new Error(`Failed to write subtitle file: ${savePath.filePath}`);
      }
    } catch (error) {
      console.error(error);
      alert("Failed to save file: " + error);
    }
  }, [mode, sourceFilePath, targetLang, targetSegments]);

  const handleOpenInEditor = useCallback(async () => {
    if (!sourceFilePath || targetSegments.length === 0 || !isDesktopRuntime()) {
      return;
    }

    const basePath = stripTranslatorSubtitleExtension(sourceFilePath);
    const videoPath = await findRelatedVideoForSubtitle(sourceFilePath);

    if (!videoPath) {
      console.warn("Could not find associated video file.");
      alert(
        `Could not find an associated video next to the subtitle.\nTried: ${formatRelatedVideoCandidateSummary(sourceFilePath)}\nThe editor will open with a best-effort video path.`,
      );
    }

    const suffix = getTranslatorOutputSuffix(targetLang, mode);
    const fallbackTargetSrtPath = buildTranslatorOutputPath(sourceFilePath, suffix);
    const targetSrtPath = targetSubtitleRef?.path ?? fallbackTargetSrtPath;

    try {
      let content = "";
      targetSegments.forEach((seg, index) => {
        const startStr = formatTranslatorTimestamp(seg.start);
        const endStr = formatTranslatorTimestamp(seg.end);
        content += `${index + 1}\n${startStr} --> ${endStr}\n${seg.text || ""}\n\n`;
      });

      const didWrite = await fileService.writeFile(targetSrtPath, content);
      if (didWrite === false) {
        throw new Error(`Failed to write subtitle file: ${targetSrtPath}`);
      }
    } catch (error) {
      console.error("Failed to auto-save translation before opening editor", error);
      alert(
        "Failed to save translation file. Editor might not load the correct file.",
      );
      return;
    }

    const resolvedVideoPath = videoPath || basePath + ".mp4";
    NavigationService.navigate(
      "editor",
      createTranslatorEditorNavigationPayload({
        videoPath: resolvedVideoPath,
        subtitlePath: targetSrtPath,
        targetSubtitleRef,
      }),
    );
  }, [mode, sourceFilePath, targetLang, targetSegments, targetSubtitleRef]);

  return {
    exportSRT,
    handleOpenInEditor,
  };
}
