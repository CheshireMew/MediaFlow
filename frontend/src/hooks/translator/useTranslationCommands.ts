import type { SubtitleSegment } from "../../types/task";
import type { TranslatorMode } from "../../stores/translatorStore";
import { translatorService } from "../../services/translator/translatorService";

type UseTranslationCommandsParams = {
  sourceSegments: SubtitleSegment[];
  sourceFilePath: string | null;
  targetLang: string;
  mode: TranslatorMode;
  setTaskStatus: (status: string) => void;
  setProgress: (progress: number) => void;
  setTaskError: (error: string | null) => void;
  setTaskId: (id: string | null) => void;
  setMode: (mode: TranslatorMode) => void;
  setActiveMode: (mode: TranslatorMode | null) => void;
  setResultMode: (mode: TranslatorMode | null) => void;
  activeTaskModeRef: React.MutableRefObject<TranslatorMode>;
  previousTranslateModeRef: React.MutableRefObject<"standard" | "intelligent">;
};

export function useTranslationCommands({
  sourceSegments,
  sourceFilePath,
  targetLang,
  mode,
  setTaskStatus,
  setProgress,
  setTaskError,
  setTaskId,
  setMode,
  setActiveMode,
  setResultMode,
  activeTaskModeRef,
  previousTranslateModeRef,
}: UseTranslationCommandsParams) {
  const startTranslation = async () => {
    if (sourceSegments.length === 0) return;
    const effectiveMode = mode === "proofread" ? previousTranslateModeRef.current : mode;

    setTaskStatus("starting");
    setProgress(0);
    setTaskError(null);

    try {
      activeTaskModeRef.current = effectiveMode;
      setResultMode(null);
      const res = await translatorService.startTranslation({
        segments: sourceSegments,
        target_language: targetLang,
        mode: effectiveMode,
        context_path: sourceFilePath,
      });
      if (mode === "proofread") {
        setMode(effectiveMode);
      }
      setActiveMode(effectiveMode);
      setTaskId(res.task_id);
      setTaskStatus("pending");
    } catch (e) {
      console.error(e);
      setTaskStatus("failed");
      setTaskError(e instanceof Error ? e.message : "Failed to start translation");
      alert(`Failed to start translation.\n${e instanceof Error ? e.message : ""}`.trim());
    }
  };

  const proofreadSubtitle = async () => {
    if (sourceSegments.length === 0) return;
    if (mode !== "proofread") {
      previousTranslateModeRef.current = mode;
    }

    setTaskStatus("starting");
    setProgress(0);
    setTaskError(null);

    try {
      activeTaskModeRef.current = "proofread";
      setActiveMode("proofread");
      setResultMode("proofread");
      const res = await translatorService.startTranslation({
        segments: sourceSegments,
        target_language: targetLang,
        mode: "proofread",
        context_path: sourceFilePath,
      });
      setTaskId(res.task_id);
      setTaskStatus("pending");
    } catch (e) {
      console.error(e);
      setActiveMode(null);
      setTaskStatus("failed");
      setTaskError(e instanceof Error ? e.message : "Failed to start proofreading");
      alert(`Failed to start proofreading.\n${e instanceof Error ? e.message : ""}`.trim());
    }
  };

  return {
    startTranslation,
    proofreadSubtitle,
  };
}
