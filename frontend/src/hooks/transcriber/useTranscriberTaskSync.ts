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
  currentTranscriptionTaskId: string | null;
  fileRef: NonNullable<TranscribeResult["video_ref"]> | null;
  filePath: string | null | undefined;
  currentResult: TranscribeResult | null;
  setCurrentTranscriptionTaskId: (taskId: string | null) => void;
  setResult: (result: TranscribeResult | null) => void;
  setExecutionMode: (mode: NullableExecutionMode) => void;
};

export function useTranscriberTaskSync({
  tasks,
  tasksSettled,
  currentTranscriptionTaskId,
  fileRef,
  filePath,
  currentResult,
  setCurrentTranscriptionTaskId,
  setResult,
  setExecutionMode,
}: UseTranscriberTaskSyncParams) {
  useEffect(() => {
    if (currentTranscriptionTaskId) return;
    const runningTask = findActiveTranscribeTask(tasks, fileRef, filePath);
    if (runningTask) {
      setExecutionMode("task_submission");
      setCurrentTranscriptionTaskId(runningTask.id);
    }
  }, [tasks, currentTranscriptionTaskId, filePath, fileRef, setCurrentTranscriptionTaskId, setExecutionMode]);

  useEffect(() => {
    if (currentTranscriptionTaskId || currentResult || !tasksSettled) {
      return;
    }

    const completedTask = findCompletedTranscribeTask(tasks, fileRef, filePath);
    if (!completedTask) {
      return;
    }

    const mappedResult = mapTaskToTranscribeResult(completedTask, fileRef);
    if (mappedResult) {
      setResult(mappedResult);
    }
  }, [tasks, tasksSettled, currentTranscriptionTaskId, currentResult, filePath, fileRef, setResult]);

  useEffect(() => {
    if (!currentTranscriptionTaskId) return;

    const task = selectTaskById(tasks, currentTranscriptionTaskId);
    if (task) {
      if (task.status === "completed") {
        const mappedResult = mapTaskToTranscribeResult(task, fileRef);
        if (mappedResult) {
          setResult(mappedResult);
        }
        setExecutionMode("task_submission");
        setCurrentTranscriptionTaskId(null);
      } else if (task.status === "failed" || task.status === "cancelled") {
        setExecutionMode("task_submission");
        setCurrentTranscriptionTaskId(null);
      }
    } else if (tasksSettled) {
      setExecutionMode(null);
      setCurrentTranscriptionTaskId(null);
    }
  }, [tasks, currentTranscriptionTaskId, tasksSettled, filePath, fileRef, setCurrentTranscriptionTaskId, setExecutionMode, setResult]);
}
