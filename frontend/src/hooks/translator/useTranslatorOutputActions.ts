import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { isDesktopRuntime } from "../../services/domain";
import { useTranslatorStore } from "../../stores/translatorStore";
import { fileService } from "../../services/fileService";
import {
  createNavigationMediaPayload,
  NavigationService,
} from "../../services/ui/navigation";
import {
  mediaReferenceFromPath,
  type MediaReference,
} from "../../services/ui/mediaReference";
import {
  buildTranslatorOutputPath,
  formatTranslatorTimestamp,
  getTranslatorOutputSuffix,
} from "./translatorFileHelpers";
import {
  findRelatedVideoForSubtitle,
  formatRelatedVideoCandidateSummary,
} from "../../services/ui/relatedMedia";
import { toast } from "../../utils/toast";

export function createTranslatorEditorNavigationPayload(params: {
  video: MediaReference;
  subtitle: MediaReference;
}) {
  return createNavigationMediaPayload({
    videoRef: params.video,
    subtitleRef: params.subtitle,
  });
}

export function useTranslatorOutputActions() {
  const { t } = useTranslation("translator");
  const {
    sourceFileRef,
    targetSubtitleRef,
    targetLang,
    mode,
    targetSegments,
    setTargetSubtitleRef,
  } = useTranslatorStore();
  const sourceFilePath = sourceFileRef?.path ?? null;

  const exportSRT = useCallback(async () => {
    if (!sourceFilePath || !isDesktopRuntime()) return;

    const suffix = getTranslatorOutputSuffix(targetLang, mode);
    const defaultPath = buildTranslatorOutputPath(sourceFilePath, suffix);

    try {
      const savePath = await fileService.showSaveDialog({
        defaultPath,
        filters: [
          { name: t("feedback.subtitleFileFilter"), extensions: ["srt"] },
          { name: t("feedback.textFileFilter"), extensions: ["txt"] },
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

      setTargetSubtitleRef(
        mediaReferenceFromPath(savePath.filePath, {
          type: savePath.filePath.toLowerCase().endsWith(".txt")
            ? "text/plain"
            : "application/x-subrip",
          origin: "translator-export",
        }),
      );
      toast.success(t("feedback.exportSuccess", { path: savePath.filePath }));
    } catch (error) {
      console.error(error);
      toast.error(t("feedback.exportFailed"));
    }
  }, [mode, setTargetSubtitleRef, sourceFilePath, t, targetLang, targetSegments]);

  const handleOpenInEditor = useCallback(async () => {
    if (!sourceFilePath || targetSegments.length === 0 || !isDesktopRuntime()) {
      return;
    }

    const videoPath = await findRelatedVideoForSubtitle(sourceFilePath);

    if (!videoPath) {
      console.warn("Could not find associated video file.");
      toast.warning(t("feedback.relatedVideoMissing", {
        candidates: formatRelatedVideoCandidateSummary(sourceFilePath),
      }));
      return;
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
      toast.error(t("feedback.editorAutoSaveFailed"));
      return;
    }

    const resolvedTargetSubtitleRef =
      targetSubtitleRef ??
      mediaReferenceFromPath(targetSrtPath, {
        type: "application/x-subrip",
        origin: "translator-editor-autosave",
      });
    setTargetSubtitleRef(resolvedTargetSubtitleRef);

    const resolvedVideoRef = mediaReferenceFromPath(videoPath, {
      type: "video/mp4",
      media_kind: "video",
      role: "source",
    });
    if (!resolvedVideoRef || !resolvedTargetSubtitleRef) {
      return;
    }
    NavigationService.navigate(
      "editor",
      createTranslatorEditorNavigationPayload({
        video: resolvedVideoRef,
        subtitle: resolvedTargetSubtitleRef,
      }),
    );
  }, [mode, setTargetSubtitleRef, sourceFilePath, t, targetLang, targetSegments, targetSubtitleRef]);

  return {
    exportSRT,
    handleOpenInEditor,
  };
}
