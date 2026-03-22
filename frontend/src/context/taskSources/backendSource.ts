import { apiClient } from "../../api/client";
import type { TaskSource } from "./types";
import { isDesktopTask } from "./shared";

export function createBackendTaskSource(
  enabled: boolean,
  shouldPoll: boolean,
  sendPause?: (taskId: string) => void,
  useSocketPause: boolean = false,
): TaskSource {
  return {
    id: "backend",
    kind: "remote",
    ready: enabled,
    settled: !enabled,
    clearPredicate: (task) => !isDesktopTask(task),
    loadSnapshot: () => apiClient.listTasks(),
    supportsTask: (task) => !isDesktopTask(task),
    pauseTask: (taskId) => {
      if (useSocketPause && sendPause) {
        sendPause(taskId);
        return;
      }
      return apiClient.pauseTask(taskId);
    },
    pauseAll: async (tasks) => {
      if (tasks.some((task) => !isDesktopTask(task))) {
        await apiClient.pauseAllTasks();
      }
    },
    resumeTask: (taskId) => apiClient.resumeTask(taskId),
    deleteTask: async (task) => {
      await apiClient.deleteTask(task.id);
    },
    clearTasks: async (tasks, _removeTask, clearTasks) => {
      const hasRemoteTasks = tasks.some((task) => !isDesktopTask(task));
      if (hasRemoteTasks) {
        await apiClient.deleteAllTasks();
        clearTasks((task) => !isDesktopTask(task));
        return;
      }
      clearTasks((task) => !isDesktopTask(task));
    },
    pollIntervalMs: 5000,
    shouldPoll: () => shouldPoll,
  };
}
