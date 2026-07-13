import { useRef, useEffect } from "react";
import {
  useTranslatorStore,
  type TranslatorMode,
} from "../stores/translatorStore";
import { useTaskContext } from "../context/taskContext";
import { useTranslationTaskSync } from "./translator/useTranslationTaskSync";
import { useTranslationCommands } from "./translator/useTranslationCommands";
import { useExecutionModeState } from "./execution/useExecutionModeState";

export const useTranslationTask = () => {
  const { tasks, tasksSettled } = useTaskContext();
  const { executionMode, setExecutionMode } = useExecutionModeState("translator");
  const translatorStore = useTranslatorStore();

  const previousTranslateModeRef = useRef<"standard" | "intelligent">("standard");
  const activeTaskModeRef = useRef<TranslatorMode>("standard");
  const taskBinding = {
    ...translatorStore,
    setExecutionMode,
    activeTaskModeRef,
    previousTranslateModeRef,
  };

  useEffect(() => {
    const shouldClearProofreadExecution =
      !translatorStore.taskId &&
      translatorStore.activeMode === "proofread" &&
      (translatorStore.taskStatus === "finalizing" || translatorStore.taskStatus === "completed");

    if (shouldClearProofreadExecution) {
      translatorStore.setActiveMode(null);
    }
  }, [translatorStore]);

  const isTranslating =
    translatorStore.taskStatus === "translating" ||
    translatorStore.taskStatus === "starting" ||
    translatorStore.taskStatus === "finalizing" ||
    translatorStore.taskStatus === "running" ||
    translatorStore.taskStatus === "pending";

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
    taskStatus: translatorStore.taskStatus,
    progress: translatorStore.progress,
    taskError: translatorStore.taskError,
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
