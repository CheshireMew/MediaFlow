import React, { useMemo } from "react";

import type { Task } from "../types/task";
import { useTaskContext } from "./taskContext";
import { isTaskQueued, isTaskRunning } from "../services/tasks/taskRuntimeState";
import { TaskSummaryContext, type TaskSummaryContextType } from "./taskSummaryShared";

function isActiveTask(task: Task) {
  return isTaskQueued(task) || isTaskRunning(task);
}

function countActiveTasks(tasks: Task[]) {
  return tasks.reduce((count, task) => count + (isActiveTask(task) ? 1 : 0), 0);
}

export function TaskSummaryProvider({
  children,
  enabled = true,
}: {
  children: React.ReactNode;
  enabled?: boolean;
}) {
  const { tasks, tasksSettled } = useTaskContext();

  const value = useMemo(
    (): TaskSummaryContextType => ({
      activeTaskCount: enabled ? countActiveTasks(tasks) : 0,
      ready: enabled ? tasksSettled : false,
    }),
    [enabled, tasks, tasksSettled],
  );

  return React.createElement(TaskSummaryContext.Provider, { value }, children);
}
