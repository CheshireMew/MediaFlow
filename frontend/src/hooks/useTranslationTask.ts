import { useRef, useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  useTranslatorStore,
  type TranslatorExecutionMode,
} from "../stores/translatorStore";
import { useTaskStatus } from "../context/taskContext";
import { useTaskById, useTasks } from "../context/taskStoreContext";
import { useTranslationTaskSync } from "./translator/useTranslationTaskSync";
import { useTranslationCommands } from "./translator/useTranslationCommands";
import { useExecutionModeState } from "./execution/useExecutionModeState";

export const useTranslationTask = () => {
  const tasks = useTasks();
  const { tasksSettled } = useTaskStatus();
  const { executionMode, setExecutionMode } = useExecutionModeState("translator");
  const translatorStore = useTranslatorStore(useShallow((state) => ({
    sourceSegments: state.sourceSegments,
    targetSegments: state.targetSegments,
    sourceFileRef: state.sourceFileRef,
    targetLang: state.targetLang,
    mode: state.mode,
    activeMode: state.activeMode,
    resultMode: state.resultMode,
    taskId: state.taskId,
    submissionPhase: state.submissionPhase,
    localError: state.localError,
    setTaskId: state.setTaskId,
    setSubmissionPhase: state.setSubmissionPhase,
    setLocalError: state.setLocalError,
    setTargetSegments: state.setTargetSegments,
    setSourceFileRef: state.setSourceFileRef,
    setTargetSubtitleRef: state.setTargetSubtitleRef,
    setActiveMode: state.setActiveMode,
    setResultMode: state.setResultMode,
    setTargetLang: state.setTargetLang,
    setMode: state.setMode,
  })));
  const task = useTaskById(translatorStore.taskId);
  const taskStatus = translatorStore.localError
    ? "failed"
    : translatorStore.submissionPhase === "submitting"
      ? "starting"
      : task?.status
        ?? (translatorStore.targetSegments.length > 0 && translatorStore.resultMode
          ? "completed"
          : "");
  const progress = task?.progress ?? (taskStatus === "completed" ? 100 : 0);
  const taskError = translatorStore.localError ?? task?.error ?? null;
  const { activeMode, setActiveMode } = translatorStore;

  const previousTranslateModeRef = useRef<"standard" | "intelligent">("standard");
  const activeTaskModeRef = useRef<TranslatorExecutionMode>("standard");
  const taskBinding = {
    ...translatorStore,
    setExecutionMode,
    activeTaskModeRef,
    previousTranslateModeRef,
  };

  useEffect(() => {
    const shouldClearProofreadExecution =
      activeMode === "proofread" &&
      (taskStatus === "completed" || taskStatus === "failed" || taskStatus === "cancelled");

    if (shouldClearProofreadExecution) {
      setActiveMode(null);
    }
  }, [activeMode, setActiveMode, taskStatus]);

  const isTranslating =
    translatorStore.submissionPhase === "submitting"
    || taskStatus === "running"
    || taskStatus === "pending";

  useTranslationTaskSync({
    tasks,
    tasksSettled,
    ...taskBinding,
    currentTargetSegments: translatorStore.targetSegments,
  });
  const { startTranslation, proofreadSubtitle } = useTranslationCommands({
    ...taskBinding,
  });

  return {
    taskId: translatorStore.taskId,
    taskStatus,
    progress,
    taskError,
    executionMode,
    sourceFileRef: translatorStore.sourceFileRef,
    targetLang: translatorStore.targetLang,
    mode: translatorStore.mode,
    activeMode: translatorStore.activeMode,
    isTranslating,
    startTranslation,
    proofreadSubtitle,
    setTargetLang: translatorStore.setTargetLang,
    setMode: translatorStore.setMode,
    setExecutionMode,
  };
};
