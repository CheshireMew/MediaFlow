import type { SubtitleSegment } from "../../types/task";
import type { TranslatorMode } from "../../stores/translatorStore";
import { useTaskContext } from "../../context/taskContext";
import {
  applyExecutionOutcome,
  enqueueExecutionTask,
  executionService,
  isAiTranslationSetupRequiredError,
  type NullableExecutionMode,
} from "../../services/domain";
import { normalizeMediaReference, type MediaReference } from "../../services/ui/mediaReference";
import { normalizeTranslateResult } from "../../services/ui/translateResult";

type UseTranslationCommandsParams = {
  sourceSegments: SubtitleSegment[];
  sourceFilePath: string | null;
  sourceFileRef: MediaReference | null;
  targetLang: string;
  mode: TranslatorMode;
  setTaskStatus: (status: string) => void;
  setProgress: (progress: number) => void;
  setTaskError: (error: string | null) => void;
  setExecutionMode: (mode: NullableExecutionMode) => void;
  setTaskId: (id: string | null) => void;
  setTargetSegments: (segments: SubtitleSegment[]) => void;
  setSourceFileRef: (reference: MediaReference | null) => void;
  setTargetSubtitleRef: (reference: MediaReference | null) => void;
  setMode: (mode: TranslatorMode) => void;
  setActiveMode: (mode: TranslatorMode | null) => void;
  setResultMode: (mode: TranslatorMode | null) => void;
  activeTaskModeRef: React.MutableRefObject<TranslatorMode>;
  previousTranslateModeRef: React.MutableRefObject<"standard" | "intelligent">;
};

export function useTranslationCommands({
  sourceSegments,
  sourceFilePath,
  sourceFileRef,
  targetLang,
  mode,
  setTaskStatus,
  setProgress,
  setTaskError,
  setExecutionMode,
  setTaskId,
  setTargetSegments,
  setSourceFileRef,
  setTargetSubtitleRef,
  setMode,
  setActiveMode,
  setResultMode,
  activeTaskModeRef,
  previousTranslateModeRef,
}: UseTranslationCommandsParams) {
  const { addTask } = useTaskContext();
  const contextRef = sourceFileRef ?? normalizeMediaReference(sourceFilePath);
  const contextPath = contextRef?.path ?? sourceFilePath ?? null;

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
        context_path: contextPath,
        context_ref: contextRef,
      });
      const outcome = applyExecutionOutcome({
        outcome: executionResult,
        setExecutionMode,
      });

      if (outcome.kind === "result") {
        const normalizedResult = normalizeTranslateResult(
          outcome.result,
          contextRef,
        );
        if (mode === "proofread") {
          setMode(effectiveMode);
        }
        setTargetSegments(normalizedResult?.segments ?? []);
        setTargetSubtitleRef(normalizedResult?.subtitle_ref ?? null);
        setTaskId(null);
        setTaskStatus("processing_result");
        setProgress(100);
        setTaskError(null);
        setResultMode(effectiveMode);
        setTimeout(() => {
          setTaskStatus("completed");
          setActiveMode(null);
        }, 600);
        return;
      }

      if (mode === "proofread") {
        setMode(effectiveMode);
      }
      const submission = enqueueExecutionTask({
        addTask,
        outcome: executionResult,
        descriptor: {
          type: "translate",
          name: contextPath ? `Translate ${contextPath.split(/[\\/]/).pop()}` : "Translate subtitles",
          request_params: {
            context_path: contextPath ?? undefined,
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
        context_path: contextPath,
        context_ref: contextRef,
      });
      const outcome = applyExecutionOutcome({
        outcome: executionResult,
        setExecutionMode,
      });

      if (outcome.kind === "result") {
        const normalizedResult = normalizeTranslateResult(
          outcome.result,
          contextRef,
        );
        setTargetSegments(normalizedResult?.segments ?? []);
        setTargetSubtitleRef(normalizedResult?.subtitle_ref ?? null);
        setTaskId(null);
        setTaskStatus("processing_result");
        setProgress(100);
        setTaskError(null);
        setTimeout(() => {
          setTaskStatus("completed");
          setActiveMode(null);
        }, 600);
        return;
      }

      const submission = enqueueExecutionTask({
        addTask,
        outcome: executionResult,
        descriptor: {
          type: "translate",
          name: contextPath ? `Proofread ${contextPath.split(/[\\/]/).pop()}` : "Proofread subtitles",
          request_params: {
            context_path: contextPath ?? undefined,
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
      setTaskError(e instanceof Error ? e.message : "Failed to start proofreading");
      alert(`Failed to start proofreading.\n${e instanceof Error ? e.message : ""}`.trim());
    }
  };

  return {
    startTranslation,
    proofreadSubtitle,
  };
}
