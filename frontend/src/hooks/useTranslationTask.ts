import { useRef, useEffect } from "react";
import {
  useTranslatorStore,
  type TranslatorMode,
} from "../stores/translatorStore";
import { useTaskContext } from "../context/taskContext";
import { useTranslationTaskSync } from "./translator/useTranslationTaskSync";
import { useTranslationCommands } from "./translator/useTranslationCommands";
import { desktopEventsService } from "../services/desktop";
import { useRuntimeExecutionStore } from "../stores/runtimeExecutionStore";

export const useTranslationTask = () => {
  const { tasks, tasksSettled } = useTaskContext();
  const setRuntimeExecutionMode = useRuntimeExecutionStore((state) => state.setScopeMode);
  const {
    sourceSegments,
    sourceFilePath,
    sourceFileRef,
    targetLang,
    mode,
    activeMode,
    taskId,
    targetSegments,
    taskStatus,
    progress,
    taskError,
    executionMode,
    setTaskId,
    setTaskStatus,
    setProgress,
    setTaskError,
    setExecutionMode,
    setTargetSegments,
    setSourceFileRef,
    setTargetLang,
    setMode,
    setActiveMode,
    setResultMode,
    setTargetSubtitleRef,
  } = useTranslatorStore();

  const previousTranslateModeRef = useRef<"standard" | "intelligent">("standard");
  const modeRef = useRef(mode);
  const activeTaskModeRef = useRef<TranslatorMode>("standard");

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    const shouldClearProofreadExecution =
      !taskId &&
      activeMode === "proofread" &&
      (taskStatus === "processing_result" || taskStatus === "completed");

    if (shouldClearProofreadExecution) {
      setActiveMode(null);
    }
  }, [activeMode, setActiveMode, taskId, taskStatus]);

  useEffect(() => {
    setRuntimeExecutionMode("translator", executionMode);
  }, [executionMode, setRuntimeExecutionMode]);

  useEffect(() => {
    const unsubscribe = desktopEventsService.onTranslateProgress(({ progress }) => {
      setTaskStatus("running");
      setProgress(progress);
      setTaskError(null);
      setExecutionMode("direct_result");
    });

    return () => {
      unsubscribe();
    };
  }, [setProgress, setTaskError, setTaskStatus]);

  const isTranslating =
    taskStatus === "translating" ||
    taskStatus === "starting" ||
    taskStatus === "processing_result" ||
    taskStatus === "running" ||
    taskStatus === "pending";

  useTranslationTaskSync({
    tasks,
    tasksSettled,
    sourceFilePath,
    sourceFileRef,
    mode,
    taskId,
    currentTargetSegments: targetSegments,
    setTaskId,
    setTaskStatus,
    setProgress,
    setTaskError,
    setExecutionMode,
    setTargetSegments,
    setSourceFileRef,
    setTargetSubtitleRef,
    setActiveMode,
    setResultMode,
    activeTaskModeRef,
    previousTranslateModeRef,
  });
  const { startTranslation, proofreadSubtitle } = useTranslationCommands({
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
  });

  return {
    taskId,
    taskStatus,
    progress,
    taskError,
    executionMode,
    sourceFileRef,
    targetLang,
    mode,
    activeMode,
    isTranslating,
    startTranslation,
    proofreadSubtitle,
    setTargetLang,
    setMode,
    setExecutionMode,
  };
};
