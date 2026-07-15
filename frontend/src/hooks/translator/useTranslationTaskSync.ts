import { useEffect, useRef } from "react";

import type { Task } from "../../types/task";
import type { SubtitleSegment } from "../../types/task";
import type { TranslatorMode } from "../../stores/translatorStore";
import type { NullableExecutionMode } from "../../services/domain";
import {
  findCompletedTranslationTask,
  findActiveTranslationTask,
  getTranslationTaskMediaRefs,
  getTranslationTaskMode,
  getTranslationTaskOutput,
  selectTaskById,
} from "../tasks/taskSelectors";
import type { MediaReference } from "../../services/ui/mediaReference";

const MISSING_TRANSLATION_RESULT_ERROR =
  "Translation task completed without a valid translation result";

type UseTranslationTaskSyncParams = {
  tasks: Task[];
  tasksSettled: boolean;
  sourceFileRef: MediaReference | null;
  mode: TranslatorMode;
  taskId: string | null;
  currentTargetSegments: SubtitleSegment[];
  setTaskId: (id: string | null) => void;
  setTaskStatus: (status: string) => void;
  setProgress: (progress: number) => void;
  setTaskError: (error: string | null) => void;
  setExecutionMode: (mode: NullableExecutionMode) => void;
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
  const recoveredCompletedTaskIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (taskId) return;

    const runningTask = findActiveTranslationTask(tasks, sourceFileRef);
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
    sourceFileRef,
    taskId,
    tasks,
  ]);

  useEffect(() => {
    if (taskId || currentTargetSegments.length > 0 || !tasksSettled) {
      return;
    }

    const completedTask = findCompletedTranslationTask(tasks, sourceFileRef);
    if (!completedTask) {
      return;
    }
    if (recoveredCompletedTaskIdRef.current === completedTask.id) {
      return;
    }
    recoveredCompletedTaskIdRef.current = completedTask.id;

    const translationOutput = getTranslationTaskOutput(completedTask);
    if (!translationOutput || translationOutput.segments.length === 0) {
      setTaskStatus("failed");
      setTaskError(MISSING_TRANSLATION_RESULT_ERROR);
      setProgress(100);
      setExecutionMode("task_submission");
      return;
    }
    const segments = translationOutput.segments;

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

    if (task.status === "paused") {
      setTaskStatus("paused");
      setExecutionMode("task_submission");
      return;
    }

    if (task.status === "completed") {
      const translationOutput = getTranslationTaskOutput(task);
      if (!translationOutput || translationOutput.segments.length === 0) {
        setTaskStatus("failed");
        setTaskError(MISSING_TRANSLATION_RESULT_ERROR);
        setProgress(100);
        setExecutionMode("task_submission");
        setActiveMode(null);
        setTaskId(null);
        return;
      }
      const segments = translationOutput.segments;
      const completedTaskMode =
        getTranslationTaskMode(task) ?? activeTaskModeRef.current;
      setTargetSegments(segments);
      if (taskMediaRefs.sourceSubtitleRef) {
        setSourceFileRef(taskMediaRefs.sourceSubtitleRef);
      }
      setTargetSubtitleRef(taskMediaRefs.targetSubtitleRef);
      setResultMode(completedTaskMode);
      setTaskStatus("finalizing");
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
      setTaskError(task.error || null);
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
