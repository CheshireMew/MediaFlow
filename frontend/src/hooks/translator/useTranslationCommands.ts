import type { SubtitleSegment } from "../../types/task";
import { useTranslation } from "react-i18next";
import type { TranslatorMode } from "../../stores/translatorStore";
import { useTaskContext } from "../../context/taskContext";
import {
  applyExecutionOutcome,
  enqueueExecutionTask,
  isAiTranslationSetupRequiredError,
  type NullableExecutionMode,
  type TranslationTargetLanguage,
} from "../../services/domain";
import { executionService } from "../../services/domain/executionService";
import type { MediaReference } from "../../services/ui/mediaReference";
import { toast } from "../../utils/toast";

type UseTranslationCommandsParams = {
  sourceSegments: SubtitleSegment[];
  sourceFileRef: MediaReference | null;
  targetLang: TranslationTargetLanguage;
  mode: TranslatorMode;
  setTaskStatus: (status: string) => void;
  setProgress: (progress: number) => void;
  setTaskError: (error: string | null) => void;
  setExecutionMode: (mode: NullableExecutionMode) => void;
  setTaskId: (id: string | null) => void;
  setSourceFileRef: (reference: MediaReference | null) => void;
  setMode: (mode: TranslatorMode) => void;
  setActiveMode: (mode: TranslatorMode | null) => void;
  setResultMode: (mode: TranslatorMode | null) => void;
  activeTaskModeRef: React.MutableRefObject<TranslatorMode>;
  previousTranslateModeRef: React.MutableRefObject<"standard" | "intelligent">;
};

export function useTranslationCommands({
  sourceSegments,
  sourceFileRef,
  targetLang,
  mode,
  setTaskStatus,
  setProgress,
  setTaskError,
  setExecutionMode,
  setTaskId,
  setSourceFileRef,
  setMode,
  setActiveMode,
  setResultMode,
  activeTaskModeRef,
  previousTranslateModeRef,
}: UseTranslationCommandsParams) {
  const { t } = useTranslation("translator");
  const { addTask } = useTaskContext();
  const contextRef = sourceFileRef;

  const startTranslation = async () => {
    if (sourceSegments.length === 0) return;
    const effectiveMode = mode === "proofread" ? previousTranslateModeRef.current : mode;

    setTaskStatus("starting");
    setProgress(0);
    setTaskError(null);
    setExecutionMode(null);

    try {
      activeTaskModeRef.current = effectiveMode;
      setResultMode(null);
      setSourceFileRef(contextRef);
      setActiveMode(effectiveMode);
      const executionResult = await executionService.translate({
        segments: sourceSegments,
        target_language: targetLang,
        mode: effectiveMode,
        context_ref: contextRef,
      });
      applyExecutionOutcome({
        outcome: executionResult,
        setExecutionMode,
      });

      if (mode === "proofread") {
        setMode(effectiveMode);
      }
      const submission = enqueueExecutionTask({
        addTask,
        outcome: executionResult,
        descriptor: {
          type: "translate",
          name: t("task.translateName", { name: contextRef?.name ?? t("task.subtitleFallback") }),
          request_params: {
            context_ref: contextRef,
            target_language: targetLang,
            mode: effectiveMode,
          },
        },
      });
      setTaskId(submission.task_id);
      setTaskStatus("pending");
    } catch (e) {
      console.error(e);
      if (isAiTranslationSetupRequiredError(e)) {
        activeTaskModeRef.current = effectiveMode;
        setActiveMode(null);
        setResultMode(null);
        setExecutionMode(null);
        setTaskId(null);
        setTaskStatus("");
        setTaskError(null);
        return;
      }
      if (e instanceof Error && /paused|cancelled/i.test(e.message)) {
        setTaskStatus("paused");
        return;
      }
      setExecutionMode(null);
      setTaskStatus("failed");
      const detail = e instanceof Error ? e.message : t("feedback.unknownError");
      setTaskError(detail);
      toast.error(t("feedback.startTranslationFailed", { detail }));
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
    setExecutionMode(null);

    try {
      activeTaskModeRef.current = "proofread";
      setActiveMode("proofread");
      setResultMode("proofread");
      setSourceFileRef(contextRef);
      const executionResult = await executionService.translate({
        segments: sourceSegments,
        target_language: targetLang,
        mode: "proofread",
        context_ref: contextRef,
      });
      applyExecutionOutcome({
        outcome: executionResult,
        setExecutionMode,
      });

      const submission = enqueueExecutionTask({
        addTask,
        outcome: executionResult,
        descriptor: {
          type: "translate",
          name: t("task.proofreadName", { name: contextRef?.name ?? t("task.subtitleFallback") }),
          request_params: {
            context_ref: contextRef,
            target_language: targetLang,
            mode: "proofread",
          },
        },
      });
      setTaskId(submission.task_id);
      setTaskStatus("pending");
    } catch (e) {
      console.error(e);
      if (isAiTranslationSetupRequiredError(e)) {
        activeTaskModeRef.current = previousTranslateModeRef.current;
        setActiveMode(null);
        setResultMode(null);
        setExecutionMode(null);
        setTaskId(null);
        setTaskStatus("");
        setTaskError(null);
        return;
      }
      if (e instanceof Error && /paused|cancelled/i.test(e.message)) {
        setTaskStatus("paused");
        return;
      }
      setActiveMode(null);
      setExecutionMode(null);
      setTaskStatus("failed");
      const detail = e instanceof Error ? e.message : t("feedback.unknownError");
      setTaskError(detail);
      toast.error(t("feedback.startProofreadFailed", { detail }));
    }
  };

  return {
    startTranslation,
    proofreadSubtitle,
  };
}
