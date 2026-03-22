import { useEffect } from "react";

import type { Task } from "../../types/task";
import type { SubtitleSegment } from "../../types/task";
import type { TranslatorMode } from "../../stores/translatorStore";
import {
  findCompletedTranslationTask,
  findActiveTranslationTask,
  getTranslationTaskMediaRefs,
  getTranslationTaskMode,
  getTranslationTaskSegments,
  selectTaskById,
} from "../tasks/taskSelectors";
import type { MediaReference } from "../../services/ui/mediaReference";

type UseTranslationTaskSyncParams = {
  tasks: Task[];
  tasksSettled: boolean;
  sourceFilePath: string | null;
  sourceFileRef: MediaReference | null;
  mode: TranslatorMode;
  taskId: string | null;
  currentTargetSegments: SubtitleSegment[];
  setTaskId: (id: string | null) => void;
  setTaskStatus: (status: string) => void;
  setProgress: (progress: number) => void;
  setTaskError: (error: string | null) => void;
  setExecutionMode: (mode: "task_submission" | "direct_result" | null) => void;
  setTargetSegments: (segments: SubtitleSegment[]) => void;
  setSourceFileRef: (reference: MediaReference | null) => void;
  setTargetSubtitleRef: (reference: MediaReference | null) => void;
  setActiveMode: (mode: TranslatorMode | null) => void;
  setResultMode: (mode: TranslatorMode | null) => void;
  activeTaskModeRef: React.MutableRefObject<TranslatorMode>;
  previousTranslateModeRef: React.MutableRefObject<"standard" | "intelligent">;
};

export function useTranslationTaskSync({
  tasks,
  tasksSettled,
  sourceFilePath,
  sourceFileRef,
  mode,
  taskId,
  currentTargetSegments,
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
}: UseTranslationTaskSyncParams) {
  useEffect(() => {
    if (taskId) return;

    const runningTask = findActiveTranslationTask(tasks, sourceFileRef, sourceFilePath);
    if (!runningTask) return;

    const taskMode = getTranslationTaskMode(runningTask);
    const taskMediaRefs = getTranslationTaskMediaRefs(runningTask);
    if (taskMode === "proofread" && mode !== "proofread") {
      previousTranslateModeRef.current = mode;
    }

    activeTaskModeRef.current = taskMode ?? previousTranslateModeRef.current;
    if (taskMediaRefs.sourceSubtitleRef) {
      setSourceFileRef(taskMediaRefs.sourceSubtitleRef);
    }
    setTargetSubtitleRef(taskMediaRefs.targetSubtitleRef);
    setActiveMode(taskMode ?? null);
    setTaskId(runningTask.id);
    setTaskStatus(runningTask.status);
    setProgress(runningTask.progress);
    setTaskError(null);
    setExecutionMode("task_submission");
  }, [
    activeTaskModeRef,
    mode,
    previousTranslateModeRef,
    setActiveMode,
    setProgress,
    setTaskError,
    setExecutionMode,
    setSourceFileRef,
    setTaskId,
    setTaskStatus,
    setTargetSubtitleRef,
    sourceFilePath,
    sourceFileRef,
    taskId,
    tasks,
  ]);

  useEffect(() => {
    if (taskId || currentTargetSegments.length > 0 || !tasksSettled) {
      return;
    }

    const completedTask = findCompletedTranslationTask(tasks, sourceFileRef, sourceFilePath);
    if (!completedTask) {
      return;
    }

    const segments = getTranslationTaskSegments(completedTask);
    if (segments.length === 0) {
      return;
    }

    const taskMediaRefs = getTranslationTaskMediaRefs(completedTask);
    const completedTaskMode =
      getTranslationTaskMode(completedTask) ?? activeTaskModeRef.current;
    setTargetSegments(segments);
    if (taskMediaRefs.sourceSubtitleRef) {
      setSourceFileRef(taskMediaRefs.sourceSubtitleRef);
    }
    setTargetSubtitleRef(taskMediaRefs.targetSubtitleRef);
    setResultMode(completedTaskMode);
    setTaskStatus("completed");
    setProgress(100);
    setTaskError(null);
    setExecutionMode("task_submission");
    setActiveMode(null);
  }, [
    activeTaskModeRef,
    currentTargetSegments.length,
    setActiveMode,
    setExecutionMode,
    setProgress,
    setResultMode,
    setSourceFileRef,
    setTargetSegments,
    setTargetSubtitleRef,
    setTaskError,
    setTaskStatus,
    sourceFilePath,
    sourceFileRef,
    taskId,
    tasks,
    tasksSettled,
  ]);

  useEffect(() => {
    if (!taskId) return;

    const task = selectTaskById(tasks, taskId);
    if (!task) {
      if (tasksSettled) {
        setActiveMode(null);
        setExecutionMode(null);
        setTaskId(null);
      }
      return;
    }

    const taskMode = getTranslationTaskMode(task);
    const taskMediaRefs = getTranslationTaskMediaRefs(task);
    if (taskMode) {
      activeTaskModeRef.current = taskMode;
    }

    if (task.progress !== undefined) {
      setProgress(task.progress);
    }

    if (task.status === "running" || task.status === "pending") {
      setTaskStatus(task.status);
      setTaskError(null);
      setExecutionMode("task_submission");
      return;
    }

    if (task.status === "processing_result") {
      setTaskStatus("processing_result");
      setTaskError(null);
      setExecutionMode("task_submission");
      return;
    }

    if (task.status === "paused") {
      setTaskStatus("paused");
      setExecutionMode("task_submission");
      return;
    }

    if (task.status === "completed") {
      const segments = getTranslationTaskSegments(task);
      const completedTaskMode =
        getTranslationTaskMode(task) ?? activeTaskModeRef.current;
      if (segments.length > 0) {
        setTargetSegments(segments);
        if (taskMediaRefs.sourceSubtitleRef) {
          setSourceFileRef(taskMediaRefs.sourceSubtitleRef);
        }
        setTargetSubtitleRef(taskMediaRefs.targetSubtitleRef);
        setResultMode(completedTaskMode);
      }
      setTaskStatus("processing_result");
      setProgress(100);
      setTaskError(null);
      setExecutionMode("task_submission");
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
      setExecutionMode("task_submission");
      setTaskId(null);
    }
  }, [
    activeTaskModeRef,
    tasksSettled,
    setActiveMode,
    setProgress,
    setTaskError,
    setExecutionMode,
    setResultMode,
    setSourceFileRef,
    setTargetSegments,
    setTargetSubtitleRef,
    setTaskId,
    setTaskStatus,
    taskId,
    tasks,
  ]);
}
