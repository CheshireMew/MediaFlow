import { useCallback } from "react";

import { useTranslatorStore } from "../../stores/translatorStore";
import {
  getTranslatorAutoloadSuffixes,
  isSupportedTranslatorSubtitlePath,
  loadTranslatorSubtitle,
  TRANSLATOR_LANGUAGE_SUFFIX_MAP,
} from "./translatorFileHelpers";

export function useTranslatorFileLoader() {
  const {
    sourceFilePath,
    sourceSegments,
    targetLang,
    mode,
    setSourceFilePath,
    setSourceSegments,
    setTargetSegments,
    setTargetLang,
    resetTask,
  } = useTranslatorStore();

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
    if (!window.electronAPI) return;

    const priorities = getTranslatorAutoloadSuffixes(targetLang, mode);
    for (const suffix of priorities) {
      const targetPath = sourcePath.replace(/(\.[^.]+)$/, `${suffix}.srt`);

      try {
        const parsed = await loadTranslatorSubtitle(targetPath);
        if (parsed && parsed.length > 0) {
          const foundLang = Object.keys(TRANSLATOR_LANGUAGE_SUFFIX_MAP).find(
            (key) => TRANSLATOR_LANGUAGE_SUFFIX_MAP[key] === suffix,
          );
          if (foundLang) setTargetLang(foundLang);
          setTargetSegments(parsed);
          break;
        }
      } catch {
        continue
      }
    }
  }, [mode, setTargetLang, setTargetSegments, targetLang]);

  const handleFileUpload = useCallback(async (path: string) => {
    if (!window.electronAPI) return;
    if (!isSupportedTranslatorSubtitlePath(path)) {
      alert("AI 翻译当前只支持导入字幕文件（如 .srt / .vtt / .ass / .ssa）。");
      return;
    }
    try {
      const parsed = await loadTranslatorSubtitle(path);
      if (!parsed || parsed.length === 0) {
        alert(
          `未在该字幕文件中解析出可翻译的时间轴内容：${path}\n请确认文件不是空文件，并且格式为 .srt / .vtt / .ass / .ssa。`,
        );
        return;
      }
      const shouldReuseExistingTarget =
        sourceFilePath !== path || hasSameSubtitleContent(path, parsed);
      resetTask();
      setSourceFilePath(path);
      setSourceSegments(parsed);
      setTargetSegments(parsed.map((s) => ({ ...s, text: "" })));
      if (shouldReuseExistingTarget) {
        await tryLoadExistingTarget(path);
      }
    } catch (error) {
      console.error("File load error:", error);
      alert(`Failed to load file: ${path}`);
    }
  }, [
    hasSameSubtitleContent,
    resetTask,
    setSourceFilePath,
    setSourceSegments,
    setTargetSegments,
    sourceFilePath,
    tryLoadExistingTarget,
  ]);

  return {
    handleFileUpload,
  };
}
