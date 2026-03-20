import { useRef, useEffect } from "react";
import {
  useTranslatorStore,
  type TranslatorMode,
} from "../stores/translatorStore";
import { useTaskContext } from "../context/taskContext";
import { useTranslationTaskSync } from "./translator/useTranslationTaskSync";
import { useTranslationCommands } from "./translator/useTranslationCommands";

export const useTranslationTask = () => {
  const { tasks, connected } = useTaskContext();
  const {
    sourceSegments,
    sourceFilePath,
    targetLang,
    mode,
    activeMode,
    taskId,
    taskStatus,
    progress,
    setTaskId,
    setTaskStatus,
    setProgress,
    setTargetSegments,
    setTargetLang,
    setMode,
    setActiveMode,
    setResultMode,
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

  const isTranslating =
    taskStatus === "translating" ||
    taskStatus === "starting" ||
    taskStatus === "processing_result" ||
    taskStatus === "running" ||
    taskStatus === "pending";

  useTranslationTaskSync({
    tasks,
    connected,
    sourceFilePath,
    mode,
    taskId,
    setTaskId,
    setTaskStatus,
    setProgress,
    setTargetSegments,
    setActiveMode,
    setResultMode,
    activeTaskModeRef,
    previousTranslateModeRef,
  });
  const { startTranslation, proofreadSubtitle } = useTranslationCommands({
    sourceSegments,
    sourceFilePath,
    targetLang,
    mode,
    setTaskStatus,
    setProgress,
    setTaskId,
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
    targetLang,
    mode,
    activeMode,
    isTranslating,
    startTranslation,
    proofreadSubtitle,
    setTargetLang,
    setMode,
  };
};
