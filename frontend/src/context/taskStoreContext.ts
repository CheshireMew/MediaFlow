import { createContext, useCallback, useContext, useSyncExternalStore } from "react";

import type { TaskStoreApi } from "../hooks/tasks/useTaskStore";

export const TaskStoreContext = createContext<TaskStoreApi | null>(null);

export function useTaskById(taskId: string | null | undefined) {
  const store = useContext(TaskStoreContext);
  if (!store) {
    throw new Error("useTaskById must be used within a TaskProvider");
  }
  const getSnapshot = useCallback(() => store.getTask(taskId), [store, taskId]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}
