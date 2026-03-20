import { useEffect } from "react";

import type { Task } from "../../types/task";
import type { TranscribeResult } from "../../types/transcriber";
import {
  findActiveTranscribeTask,
  mapTaskToTranscribeResult,
  selectTaskById,
} from "../tasks/taskSelectors";

type UseTranscriberTaskSyncParams = {
  tasks: Task[];
  connected: boolean;
  activeTaskId: string | null;
  filePath: string | null | undefined;
  setActiveTaskId: (taskId: string | null) => void;
  setResult: (result: TranscribeResult | null) => void;
};

export function useTranscriberTaskSync({
  tasks,
  connected,
  activeTaskId,
  filePath,
  setActiveTaskId,
  setResult,
}: UseTranscriberTaskSyncParams) {
  useEffect(() => {
    if (activeTaskId) return;
    const runningTask = findActiveTranscribeTask(tasks, filePath);
    if (runningTask) {
      setActiveTaskId(runningTask.id);
    }
  }, [tasks, activeTaskId, filePath, setActiveTaskId]);

  useEffect(() => {
    if (!activeTaskId) return;

    const task = selectTaskById(tasks, activeTaskId);
    if (task) {
      if (task.status === "completed") {
        const mappedResult = mapTaskToTranscribeResult(task, filePath);
        if (mappedResult) {
          setResult(mappedResult);
        }
        setActiveTaskId(null);
      } else if (task.status === "failed" || task.status === "cancelled") {
        setActiveTaskId(null);
      }
    } else if (connected) {
      setActiveTaskId(null);
    }
  }, [tasks, activeTaskId, connected, filePath, setActiveTaskId, setResult]);
}
