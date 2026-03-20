import { useEffect } from "react";

import type { Task } from "../../types/task";
import type { TranslatorMode } from "../../stores/translatorStore";
import {
  findActiveTranslationTask,
  getTranslationTaskMode,
  getTranslationTaskSegments,
  selectTaskById,
} from "../tasks/taskSelectors";

type UseTranslationTaskSyncParams = {
  tasks: Task[];
  connected: boolean;
  sourceFilePath: string | null;
  mode: TranslatorMode;
  taskId: string | null;
  setTaskId: (id: string | null) => void;
  setTaskStatus: (status: string) => void;
  setProgress: (progress: number) => void;
  setTaskError: (error: string | null) => void;
  setTargetSegments: (segments: Task["result"]["meta"]["segments"]) => void;
  setActiveMode: (mode: TranslatorMode | null) => void;
  setResultMode: (mode: TranslatorMode | null) => void;
  activeTaskModeRef: React.MutableRefObject<TranslatorMode>;
  previousTranslateModeRef: React.MutableRefObject<"standard" | "intelligent">;
};

export function useTranslationTaskSync({
  tasks,
  connected,
  sourceFilePath,
  mode,
  taskId,
  setTaskId,
  setTaskStatus,
  setProgress,
  setTaskError,
  setTargetSegments,
  setActiveMode,
  setResultMode,
  activeTaskModeRef,
  previousTranslateModeRef,
}: UseTranslationTaskSyncParams) {
  useEffect(() => {
    if (taskId) return;

    const runningTask = findActiveTranslationTask(tasks, sourceFilePath);
    if (!runningTask) return;

    const taskMode = getTranslationTaskMode(runningTask);
    if (taskMode === "proofread" && mode !== "proofread") {
      previousTranslateModeRef.current =
        mode === "proofread" ? previousTranslateModeRef.current : mode;
    }

    activeTaskModeRef.current = taskMode ?? previousTranslateModeRef.current;
    setActiveMode(taskMode ?? null);
    setTaskId(runningTask.id);
    setTaskStatus(runningTask.status);
    setProgress(runningTask.progress);
    setTaskError(null);
  }, [
    activeTaskModeRef,
    mode,
    previousTranslateModeRef,
    setActiveMode,
    setProgress,
    setTaskError,
    setTaskId,
    setTaskStatus,
    sourceFilePath,
    taskId,
    tasks,
  ]);

  useEffect(() => {
    if (!taskId) return;

    const task = selectTaskById(tasks, taskId);
    if (!task) {
      if (connected) {
        setActiveMode(null);
        setTaskId(null);
      }
      return;
    }

    const taskMode = getTranslationTaskMode(task);
    if (taskMode) {
      activeTaskModeRef.current = taskMode;
    }

    if (task.progress !== undefined) {
      setProgress(task.progress);
    }

    if (task.status === "running" || task.status === "pending") {
      setTaskStatus(task.status);
      setTaskError(null);
      return;
    }

    if (task.status === "processing_result") {
      setTaskStatus("processing_result");
      setTaskError(null);
      return;
    }

    if (task.status === "paused") {
      setTaskStatus("paused");
      return;
    }

    if (task.status === "completed") {
      const segments = getTranslationTaskSegments(task);
      const completedTaskMode =
        getTranslationTaskMode(task) ?? activeTaskModeRef.current;
      if (segments.length > 0) {
        setTargetSegments(segments);
        setResultMode(completedTaskMode);
      }
      setTaskStatus("processing_result");
      setProgress(100);
      setTaskError(null);
      setActiveMode(null);

      setTimeout(() => {
        setTaskStatus("completed");
      }, 600);

      setTaskId(null);
      return;
    }

    if (task.status === "failed" || task.status === "cancelled") {
      setTaskStatus(task.status);
      setTaskError(task.error || task.message || null);
      setActiveMode(null);
      setTaskId(null);
    }
  }, [
    activeTaskModeRef,
    connected,
    setActiveMode,
    setProgress,
    setTaskError,
    setResultMode,
    setTargetSegments,
    setTaskId,
    setTaskStatus,
    taskId,
    tasks,
  ]);
}
