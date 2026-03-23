import { useEffect } from "react";

import type { Task } from "../../types/task";
import type { TranscribeResult } from "../../types/transcriber";
import type { NullableExecutionMode } from "../../services/domain";
import {
  findCompletedTranscribeTask,
  findActiveTranscribeTask,
  mapTaskToTranscribeResult,
  selectTaskById,
} from "../tasks/taskSelectors";

type UseTranscriberTaskSyncParams = {
  tasks: Task[];
  tasksSettled: boolean;
  activeTaskId: string | null;
  fileRef: NonNullable<TranscribeResult["video_ref"]> | null;
  filePath: string | null | undefined;
  currentResult: TranscribeResult | null;
  setActiveTaskId: (taskId: string | null) => void;
  setResult: (result: TranscribeResult | null) => void;
  setExecutionMode: (mode: NullableExecutionMode) => void;
};

export function useTranscriberTaskSync({
  tasks,
  tasksSettled,
  activeTaskId,
  fileRef,
  filePath,
  currentResult,
  setActiveTaskId,
  setResult,
  setExecutionMode,
}: UseTranscriberTaskSyncParams) {
  useEffect(() => {
    if (activeTaskId) return;
    const runningTask = findActiveTranscribeTask(tasks, fileRef, filePath);
    if (runningTask) {
      setExecutionMode("task_submission");
      setActiveTaskId(runningTask.id);
    }
  }, [tasks, activeTaskId, filePath, fileRef, setActiveTaskId, setExecutionMode]);

  useEffect(() => {
    if (activeTaskId || currentResult || !tasksSettled) {
      return;
    }

    const completedTask = findCompletedTranscribeTask(tasks, fileRef, filePath);
    if (!completedTask) {
      return;
    }

    const mappedResult = mapTaskToTranscribeResult(completedTask, fileRef, filePath);
    if (mappedResult) {
      setResult(mappedResult);
    }
  }, [tasks, tasksSettled, activeTaskId, currentResult, filePath, fileRef, setResult]);

  useEffect(() => {
    if (!activeTaskId) return;

    const task = selectTaskById(tasks, activeTaskId);
    if (task) {
      if (task.status === "completed") {
        const mappedResult = mapTaskToTranscribeResult(task, fileRef, filePath);
        if (mappedResult) {
          setResult(mappedResult);
        }
        setExecutionMode("task_submission");
        setActiveTaskId(null);
      } else if (task.status === "failed" || task.status === "cancelled") {
        setExecutionMode("task_submission");
        setActiveTaskId(null);
      }
    } else if (tasksSettled) {
      setExecutionMode(null);
      setActiveTaskId(null);
    }
  }, [tasks, activeTaskId, tasksSettled, filePath, fileRef, setActiveTaskId, setExecutionMode, setResult]);
}
