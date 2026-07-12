import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import {
  getTranslationTargetLanguageBySuffix,
  isDesktopRuntime,
} from "../../services/domain";
import { useTranslatorStore } from "../../stores/translatorStore";
import {
  mediaReferenceFromPath,
  normalizeMediaReference,
  type MediaReference,
} from "../../services/ui/mediaReference";
import {
  getTranslatorAutoloadSuffixes,
  isSupportedTranslatorSubtitlePath,
  loadTranslatorSubtitle,
} from "./translatorFileHelpers";
import { toast } from "../../utils/toast";

export function useTranslatorFileLoader() {
  const { t } = useTranslation("translator");
  const {
    sourceFileRef,
    sourceSegments,
    targetLang,
    mode,
    setSourceFileRef,
    setSourceSegments,
    setTargetSegments,
    setTargetLang,
    setTargetSubtitleRef,
    resetTask,
  } = useTranslatorStore();
  const sourceFilePath = sourceFileRef?.path ?? null;

  const hasSameSubtitleContent = useCallback(
    (nextPath: string, nextSegments: Awaited<ReturnType<typeof loadTranslatorSubtitle>>) => {
      if (!nextSegments || sourceFilePath !== nextPath) {
        return false;
      }

      if (sourceSegments.length !== nextSegments.length) {
        return false;
      }

      return sourceSegments.every((segment, index) => {
        const nextSegment = nextSegments[index];
        if (!nextSegment) {
          return false;
        }

        return (
          segment.start === nextSegment.start &&
          segment.end === nextSegment.end &&
          segment.text === nextSegment.text
        );
      });
    },
    [sourceFilePath, sourceSegments],
  );

  const tryLoadExistingTarget = useCallback(async (sourcePath: string) => {
    if (!isDesktopRuntime()) return;

    const priorities = getTranslatorAutoloadSuffixes(targetLang, mode);
    for (const suffix of priorities) {
      const targetPath = sourcePath.replace(/(\.[^.]+)$/, `${suffix}.srt`);

      try {
        const parsed = await loadTranslatorSubtitle(targetPath);
        if (parsed && parsed.length > 0) {
          const foundLang = getTranslationTargetLanguageBySuffix(suffix);
          if (foundLang) setTargetLang(foundLang);
          setTargetSegments(parsed);
          setTargetSubtitleRef(mediaReferenceFromPath(targetPath));
          break;
        }
      } catch {
        continue
      }
    }
  }, [mode, setTargetLang, setTargetSegments, setTargetSubtitleRef, targetLang]);

  const handleFileUpload = useCallback(async (input: MediaReference) => {
    if (!isDesktopRuntime()) return;
    const resolvedRef = normalizeMediaReference(input);
    if (!resolvedRef) return;
    const path = resolvedRef.path;
    if (!isSupportedTranslatorSubtitlePath(path)) {
      toast.warning(t("feedback.unsupportedSubtitle"));
      return;
    }
    try {
      const parsed = await loadTranslatorSubtitle(path);
      if (!parsed || parsed.length === 0) {
        toast.warning(t("feedback.emptySubtitle", { path }));
        return;
      }
      const shouldReuseExistingTarget =
        sourceFilePath !== path || hasSameSubtitleContent(path, parsed);
      resetTask();
      setSourceFileRef(resolvedRef);
      setSourceSegments(parsed);
      setTargetSegments(parsed.map((s) => ({ ...s, text: "" })));
      setTargetSubtitleRef(null);
      if (shouldReuseExistingTarget) {
        await tryLoadExistingTarget(path);
      }
    } catch (error) {
      console.error("File load error:", error);
      toast.error(t("feedback.loadFailed", { path }));
    }
  }, [
    hasSameSubtitleContent,
    resetTask,
    setSourceFileRef,
    setSourceSegments,
    setTargetSegments,
    setTargetSubtitleRef,
    sourceFilePath,
    t,
    tryLoadExistingTarget,
  ]);

  return {
    handleFileUpload,
  };
}
