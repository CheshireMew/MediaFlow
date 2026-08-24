import type { SubtitleSegment } from "../../types/task";
import { useTranslation } from "react-i18next";
import type {
  TranslatorExecutionMode,
  TranslatorMode,
} from "../../stores/translatorStore";
import { useTaskActions } from "../../context/taskContext";
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
  setSubmissionPhase: (phase: "idle" | "submitting") => void;
  setLocalError: (error: string | null) => void;
  setExecutionMode: (mode: NullableExecutionMode) => void;
  setTaskId: (id: string | null) => void;
  setSourceFileRef: (reference: MediaReference | null) => void;
  setActiveMode: (mode: TranslatorExecutionMode | null) => void;
  setResultMode: (mode: TranslatorExecutionMode | null) => void;
  activeTaskModeRef: React.MutableRefObject<TranslatorExecutionMode>;
  previousTranslateModeRef: React.MutableRefObject<TranslatorMode>;
};

export function useTranslationCommands({
  sourceSegments,
  sourceFileRef,
  targetLang,
  mode,
  setSubmissionPhase,
  setLocalError,
  setExecutionMode,
  setTaskId,
  setSourceFileRef,
  setActiveMode,
  setResultMode,
  activeTaskModeRef,
  previousTranslateModeRef,
}: UseTranslationCommandsParams) {
  const { t } = useTranslation("translator");
  const { addTask } = useTaskActions();
  const contextRef = sourceFileRef;

  const startTranslation = async () => {
    if (sourceSegments.length === 0) return;
    const effectiveMode = mode;

    setSubmissionPhase("submitting");
    setLocalError(null);
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

      const submission = enqueueExecutionTask({
        addTask,
        outcome: executionResult,
        descriptor: {
          type: "pipeline",
          name: t("task.translateName", { name: contextRef?.name ?? t("task.subtitleFallback") }),
          request_params: {
            pipeline_id: "translator_tool",
            steps: [{
              step_name: "translate",
              params: {
                segments: sourceSegments,
                context_ref: contextRef,
                target_language: targetLang,
                mode: effectiveMode,
              },
            }],
          },
        },
      });
      setTaskId(submission.task_id);
      setSubmissionPhase("idle");
      setLocalError(null);
    } catch (e) {
      console.error(e);
      if (isAiTranslationSetupRequiredError(e)) {
        activeTaskModeRef.current = effectiveMode;
        setActiveMode(null);
        setResultMode(null);
        setExecutionMode(null);
        setTaskId(null);
        setSubmissionPhase("idle");
        setLocalError(null);
        return;
      }
      setExecutionMode(null);
      setSubmissionPhase("idle");
      const detail = e instanceof Error ? e.message : t("feedback.unknownError");
      setLocalError(detail);
      toast.error(t("feedback.startTranslationFailed", { detail }));
    }
  };

  const proofreadSubtitle = async () => {
    if (sourceSegments.length === 0) return;
    previousTranslateModeRef.current = mode;

    setSubmissionPhase("submitting");
    setLocalError(null);
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
          type: "pipeline",
          name: t("task.proofreadName", { name: contextRef?.name ?? t("task.subtitleFallback") }),
          request_params: {
            pipeline_id: "translator_tool",
            steps: [{
              step_name: "translate",
              params: {
                segments: sourceSegments,
                context_ref: contextRef,
                target_language: targetLang,
                mode: "proofread",
              },
            }],
          },
        },
      });
      setTaskId(submission.task_id);
      setSubmissionPhase("idle");
      setLocalError(null);
    } catch (e) {
      console.error(e);
      if (isAiTranslationSetupRequiredError(e)) {
        activeTaskModeRef.current = previousTranslateModeRef.current;
        setActiveMode(null);
        setResultMode(null);
        setExecutionMode(null);
        setTaskId(null);
        setSubmissionPhase("idle");
        setLocalError(null);
        return;
      }
      setActiveMode(null);
      setExecutionMode(null);
      setSubmissionPhase("idle");
      const detail = e instanceof Error ? e.message : t("feedback.unknownError");
      setLocalError(detail);
      toast.error(t("feedback.startProofreadFailed", { detail }));
    }
  };

  return {
    startTranslation,
    proofreadSubtitle,
  };
}
