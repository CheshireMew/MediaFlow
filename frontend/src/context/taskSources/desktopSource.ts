import { desktopEventsService, desktopTaskService } from "../../services/desktop";
import type { TaskSocketMessage } from "../../hooks/tasks/useTaskStore";
import type { TaskSource } from "./types";
import { isDesktopTask } from "./shared";
import { isTaskQueued, isTaskRunning } from "../../services/tasks/taskRuntimeState";

export function createDesktopTaskSource(
  state: boolean | { ready: boolean; settled?: boolean },
): TaskSource {
  const ready = typeof state === "boolean" ? state : state.ready;
  const settled = typeof state === "boolean" ? ready : state.settled ?? state.ready;

  return {
    id: "desktop",
    kind: "local",
    ready,
    settled,
    clearPredicate: isDesktopTask,
    loadSnapshot: () => desktopTaskService.listTasks(),
    supportsTask: isDesktopTask,
    pauseTask: (taskId) => desktopTaskService.pauseTask(taskId),
    pauseAll: async (tasks) => {
      const desktopTasks = tasks.filter(
        (task) => isDesktopTask(task) && (isTaskRunning(task) || isTaskQueued(task)),
      );
      await Promise.all(desktopTasks.map((task) => desktopTaskService.pauseTask(task.id)));
    },
    resumeTask: (taskId) => desktopTaskService.resumeTask(taskId),
    deleteTask: async (task, removeTask) => {
      await desktopTaskService.cancelTask(task.id);
      removeTask(task.id);
    },
    clearTasks: async (tasks, removeTask, clearTasks) => {
      const localTasks = tasks.filter(isDesktopTask);
      await Promise.all(localTasks.map((task) => desktopTaskService.cancelTask(task.id)));
      localTasks.forEach((task) => removeTask(task.id));

      if (localTasks.length === 0) {
        clearTasks(isDesktopTask);
      }
    },
    subscribe: (onMessage, onReady) =>
      desktopEventsService.onTaskEvent((payload) => {
        if (
          payload &&
          typeof payload === "object" &&
          "type" in payload &&
          typeof (payload as { type?: unknown }).type === "string"
        ) {
          onReady();
          onMessage(payload as TaskSocketMessage);
        }
      }),
  };
}
