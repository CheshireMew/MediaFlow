import type { SubtitleSegment } from "../../types/task";
import type { TranslatorMode } from "../../stores/translatorStore";
import { useTaskContext } from "../../context/taskContext";
import { executionService, isDesktopRuntime } from "../../services/domain";
import { createMediaReference, type MediaReference } from "../../services/ui/mediaReference";
import { normalizeTranslateResult } from "../../services/ui/translateResult";
import {
  createTaskFromSubmissionReceipt,
  isDirectExecutionResult,
  isTaskExecutionSubmission,
} from "../../services/domain/taskSubmission";

type UseTranslationCommandsParams = {
  sourceSegments: SubtitleSegment[];
  sourceFilePath: string | null;
  sourceFileRef: MediaReference | null;
  targetLang: string;
  mode: TranslatorMode;
  setTaskStatus: (status: string) => void;
  setProgress: (progress: number) => void;
  setTaskError: (error: string | null) => void;
  setExecutionMode: (mode: "task_submission" | "direct_result" | null) => void;
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
  const contextRef = sourceFileRef ?? (sourceFilePath ? createMediaReference({ path: sourceFilePath }) : null);
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
      if (isDesktopRuntime()) {
        setActiveMode(effectiveMode);
        const executionResult = await executionService.translate({
          segments: sourceSegments,
          target_language: targetLang,
          mode: effectiveMode,
          context_path: contextPath,
          context_ref: contextRef,
        });
        if (!isDirectExecutionResult(executionResult)) {
          throw new Error("Desktop translation returned a task submission");
        }
        const normalizedResult = normalizeTranslateResult(executionResult.result, contextRef);
        if (mode === "proofread") {
          setMode(effectiveMode);
        }
        setExecutionMode("direct_result");
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

      const executionResult = await executionService.translate({
        segments: sourceSegments,
        target_language: targetLang,
        mode: effectiveMode,
        context_path: contextPath,
        context_ref: contextRef,
      });
      if (mode === "proofread") {
        setMode(effectiveMode);
      }
      setActiveMode(effectiveMode);
      setExecutionMode("task_submission");
      if (!isTaskExecutionSubmission(executionResult) || !executionResult.task_id) {
        throw new Error("Translation task id was not returned");
      }
      addTask(
        createTaskFromSubmissionReceipt({
          receipt: executionResult,
          type: "translate",
          name: contextPath ? `Translate ${contextPath.split(/[\\/]/).pop()}` : "Translate subtitles",
          request_params: {
            context_path: contextPath ?? undefined,
            context_ref: contextRef,
            target_language: targetLang,
            mode: effectiveMode,
          },
        }),
      );
      setTaskId(executionResult.task_id);
      setTaskStatus("pending");
    } catch (e) {
      console.error(e);
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
      if (isDesktopRuntime()) {
        const executionResult = await executionService.translate({
          segments: sourceSegments,
          target_language: targetLang,
          mode: "proofread",
          context_path: contextPath,
          context_ref: contextRef,
        });
        if (!isDirectExecutionResult(executionResult)) {
          throw new Error("Desktop proofread returned a task submission");
        }
        const normalizedResult = normalizeTranslateResult(executionResult.result, contextRef);
        setExecutionMode("direct_result");
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

      const executionResult = await executionService.translate({
        segments: sourceSegments,
        target_language: targetLang,
        mode: "proofread",
        context_path: contextPath,
        context_ref: contextRef,
      });
      setExecutionMode("task_submission");
      if (!isTaskExecutionSubmission(executionResult) || !executionResult.task_id) {
        throw new Error("Proofread task id was not returned");
      }
      addTask(
        createTaskFromSubmissionReceipt({
          receipt: executionResult,
          type: "translate",
          name: contextPath ? `Proofread ${contextPath.split(/[\\/]/).pop()}` : "Proofread subtitles",
          request_params: {
            context_path: contextPath ?? undefined,
            context_ref: contextRef,
            target_language: targetLang,
            mode: "proofread",
          },
        }),
      );
      setTaskId(executionResult.task_id);
      setTaskStatus("pending");
    } catch (e) {
      console.error(e);
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
